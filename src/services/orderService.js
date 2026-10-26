const { redisClient } = require('../config/redis');
const { KEYS, ORDER_STATUS, PRIORITY_LEVELS } = require('../config/constants');

/**
 * Format ngay hien tai thanh dinh dang YYYYMMDD cho bo dem thong ke
 */
function getTodayDateStr() {
  // Same business date on Windows and UTC Docker hosts (Vietnam, UTC+7).
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Tao don hang moi, luu Hash, cap nhat bo dem, Set khach hang va dua vao Queue phu hop
 */
function invalid(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function createOrder(data, idempotencyKey) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Du lieu don hang khong hop le');
  const {
    order_id: customOrderId, customer_id = 'CUST_01', customer_name, phone,
    address = 'Tp. Ho Chi Minh', items, total, payment_method = 'COD',
    priority = PRIORITY_LEVELS.STANDARD, simulate_fail = false
  } = data;
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const identifier = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  if (!identifier(customer_id) || (customOrderId !== undefined && !identifier(customOrderId))) {
    throw invalid('Ma don / khach hang khong hop le');
  }
  if (!text(customer_name, 200) || !text(phone, 30) || !/^[+0-9() .-]{6,30}$/.test(phone) ||
      !text(address, 1000) || !text(payment_method, 50)) throw invalid('Thong tin khach hang khong hop le');
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0 || total > 1e12) throw invalid('Tong tien khong hop le');
  if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 1 || priority > 5) throw invalid('Do uu tien phai la so nguyen 1..5');
  if (typeof simulate_fail !== 'boolean') throw invalid('simulate_fail phai la boolean');
  if (!(text(items, 20000) || (Array.isArray(items) && items.length > 0 && items.length <= 100 &&
      items.every((item) => item && identifier(item.id) && text(item.name, 200) &&
        typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0 &&
        item.price <= 1e12 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10000)))) {
    throw invalid('Danh sach san pham khong hop le');
  }
  if (Array.isArray(items)) {
    const calculated = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (Math.abs(calculated - total) > 0.01) throw invalid('Tong tien khong khop san pham');
  }
  const key = idempotencyKey ?? data.idempotency_key ?? customOrderId;
  if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(key))) {
    throw invalid('Idempotency-Key khong hop le');
  }
  const { randomUUID, createHash } = require('crypto');
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const orderId = customOrderId || `ORD-${randomUUID()}`;
  const nowIso = new Date().toISOString();
  const isPriority = priority > 1;
  const hashPayload = {
    order_id: orderId, customer_id, customer_name: customer_name.trim(), phone: phone.trim(),
    address: address.trim(), items: typeof items === 'string' ? items : JSON.stringify(items),
    total: String(total), payment_method, status: ORDER_STATUS.PENDING,
    priority: String(priority), is_priority: isPriority ? '1' : '0',
    created_at: nowIso, updated_at: nowIso, finished_at: '', tracking_code: '',
    retry_count: '0', error_reason: '', simulate_fail: simulate_fail ? '1' : '0'
  };
  const response = {
    order_id: orderId, customer_id, customer_name: hashPayload.customer_name, total,
    status: ORDER_STATUS.PENDING, priority, is_priority: isPriority,
    queue: isPriority ? KEYS.QUEUE_PRIORITY : KEYS.QUEUE_PENDING, created_at: nowIso
  };
  // Fingerprint excludes generated identity/time, includes the requested custom ID.
  const fingerprint = digest(JSON.stringify({
    customOrderId, customer_id, customer_name: hashPayload.customer_name, phone: hashPayload.phone,
    address: hashPayload.address, items: hashPayload.items, total, payment_method, priority, simulate_fail
  }));
  if (redisClient.status !== 'ready') throw invalid('Redis chua san sang; thu lai voi cung Idempotency-Key', 503);
  let result;
  try {
    result = await redisClient.createOrderAtomic(KEYS.ORDER_HASH(orderId),
      KEYS.CUSTOMER_ORDERS(customer_id), KEYS.STATS_COUNT(getTodayDateStr()),
      KEYS.ALL_ORDERS_INDEX, KEYS.ORDER_HISTORY(orderId), KEYS.QUEUE_PENDING,
      KEYS.QUEUE_PRIORITY, KEYS.IDEMPOTENCY(digest(key || orderId)), KEYS.CHECKOUT_LOCK(orderId),
      JSON.stringify(hashPayload), JSON.stringify(response), fingerprint);
  } catch (err) {
    throw invalid('Redis khong the xac nhan don hang; thu lai voi cung Idempotency-Key', 503);
  }
  if (result[0] === 'CONFLICT' || result[0] === 'EXISTS') throw invalid('Ma don hoac Idempotency-Key da duoc su dung cho yeu cau khac', 409);
  return JSON.parse(result[1]);
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
