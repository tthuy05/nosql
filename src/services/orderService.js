const { redisClient } = require('../config/redis');
const { KEYS, ORDER_STATUS, PRIORITY_LEVELS } = require('../config/constants');

/**
 * Format ngay hien tai thanh dinh dang YYYYMMDD cho bo dem thong ke
 */
function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Tao don hang moi, luu Hash, cap nhat bo dem, Set khach hang va dua vao Queue phu hop
 */
async function createOrder(data) {
  const {
    order_id: customOrderId,
    customer_id = 'CUST_01',
    customer_name,
    phone,
    address = 'Tp. Ho Chi Minh',
    items,
    total,
    payment_method = 'COD',
    priority = PRIORITY_LEVELS.STANDARD,
    simulate_fail = false
  } = data;

  if (!customer_name || !phone || !items || !total) {
    throw new Error('Thieu thong tin don hang bat buoc: customer_name, phone, items, total');
  }

  // Tao ma don hang duy nhat hoac su dung ma do he thong truyen (phuc vu test doi chieu bao cao)
  const orderId = customOrderId || `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const lockKey = KEYS.CHECKOUT_LOCK(orderId);

  // 1. Kiem tra khoa Idempotency Lock de chong click dup (TTL 60s)
  const acquiredLock = await redisClient.set(lockKey, 'LOCKED', 'NX', 'EX', 60);
  if (!acquiredLock) {
    throw new Error(`Yeu cau dat hang ${orderId} dang duoc he thong xu ly, vui long khong gui trung lap!`);
  }

  const nowIso = new Date().toISOString();
  const numericPriority = parseInt(priority, 10) || 1;
  const isPriority = numericPriority > 1;

  // Chuan hoa chuoi items thanh chuoi de luu vao Hash
  let itemsStr = typeof items === 'string' ? items : JSON.stringify(items);

  // 2. Luu toan bo thong tin don hang vao Hash Redis
  const orderHashKey = KEYS.ORDER_HASH(orderId);
  const hashPayload = {
    order_id: String(orderId),
    customer_id: String(customer_id),
    customer_name: String(customer_name),
    phone: String(phone),
    address: String(address),
    items: itemsStr,
    total: String(total),
    payment_method: String(payment_method),
    status: ORDER_STATUS.PENDING,
    priority: String(numericPriority),
    is_priority: isPriority ? '1' : '0',
    created_at: nowIso,
    updated_at: nowIso,
    finished_at: '',
    tracking_code: '',
    retry_count: '0',
    error_reason: '',
    simulate_fail: simulate_fail ? '1' : '0'
  };

  const pipeline = redisClient.pipeline();

  // Luu Hash
  pipeline.hset(orderHashKey, hashPayload);

  // Ghi vao danh sach don cua khach hang (Set)
  pipeline.sadd(KEYS.CUSTOMER_ORDERS(customer_id), orderId);

  // Tang bo dem so don trong ngay nguyen tu (INCR)
  const dateStr = getTodayDateStr();
  pipeline.incr(KEYS.STATS_COUNT(dateStr));

  // Ghi vao danh muc tat ca cac don (Set index)
  pipeline.sadd(KEYS.ALL_ORDERS_INDEX, orderId);

  // Ghi nhat ky lich su khoi tao
  const logMsg = isPriority 
    ? `[${nowIso}] Đã tiếp nhận ĐƠN ƯU TIÊN (Độ ưu tiên: ${numericPriority}). Đưa vào queue:orders:priority.`
    : `[${nowIso}] Đã tiếp nhận ĐƠN TIÊU CHUẨN (FIFO). Đưa vào queue:orders:pending.`;
  pipeline.rpush(KEYS.ORDER_HISTORY(orderId), logMsg);

  // 3. Dieu phoi vao Hang doi phu hop (List FIFO hoac Sorted Set Priority)
  if (isPriority) {
    // Hang doi uu tien: Score la numericPriority
    pipeline.zadd(KEYS.QUEUE_PRIORITY, numericPriority, orderId);
  } else {
    // Hang doi FIFO: LPUSH vao queue pending
    pipeline.lpush(KEYS.QUEUE_PENDING, orderId);
  }

  // Thuc thi pipeline dong thoi
  await pipeline.exec();

  return {
    order_id: orderId,
    customer_id,
    customer_name,
    total,
    status: ORDER_STATUS.PENDING,
    priority: numericPriority,
    is_priority: isPriority,
    queue: isPriority ? KEYS.QUEUE_PRIORITY : KEYS.QUEUE_PENDING,
    created_at: nowIso
  };
}

/**
 * Tra cuu thong tin chi tiet don hang, nhat ky lich su va thoi gian khoa
 */
async function getOrderById(orderId) {
  const orderHashKey = KEYS.ORDER_HASH(orderId);
  const exists = await redisClient.exists(orderHashKey);
  if (!exists) {
    return null;
  }

  const [orderData, history, lockTtl] = await Promise.all([
    redisClient.hgetall(orderHashKey),
    redisClient.lrange(KEYS.ORDER_HISTORY(orderId), 0, -1),
    redisClient.ttl(KEYS.CHECKOUT_LOCK(orderId))
  ]);

  return {
    ...orderData,
    history: history || [],
    lock_ttl_seconds: lockTtl > 0 ? lockTtl : 0
  };
}

/**
 * Lay danh sach tat ca ma don cua mot khach hang cu the (Set)
 */
async function getOrdersByCustomer(customerId) {
  const orderIds = await redisClient.smembers(KEYS.CUSTOMER_ORDERS(customerId));
  if (!orderIds || orderIds.length === 0) return [];

  const orders = [];
  for (const id of orderIds) {
    const o = await redisClient.hgetall(KEYS.ORDER_HASH(id));
    if (o && o.order_id) {
      orders.push(o);
    }
  }

  // Sap xep don moi nhat len dau
  return orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

/**
 * Lay danh sach tat ca don hang trong he thong phuc vu Dashboard quan tri
 */
async function getAllOrders(filter = {}) {
  const { status, limit = 100 } = filter;
  const orderIds = await redisClient.smembers(KEYS.ALL_ORDERS_INDEX);
  if (!orderIds || orderIds.length === 0) return [];

  const orders = [];
  for (const id of orderIds) {
    const o = await redisClient.hgetall(KEYS.ORDER_HASH(id));
    if (o && o.order_id) {
      if (!status || o.status === status) {
        orders.push(o);
      }
    }
  }

  // Sap xep moi nhat truoc
  orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return orders.slice(0, limit);
}

module.exports = {
  createOrder,
  getOrderById,
  getOrdersByCustomer,
  getAllOrders,
  getTodayDateStr
};
