const { redisClient } = require('../config/redis');
const { KEYS, ORDER_STATUS, WORKER_STATUS } = require('../config/constants');
const { getTodayDateStr } = require('./orderService');

/**
 * Lay do dai va so luong phan tu cua tat ca hang doi
 */
async function getQueueStats() {
  const dateStr = getTodayDateStr();

  const [
    pendingCount,
    priorityCount,
    processingCount,
    dlqCount,
    todayCountStr,
    totalAllOrders,
    workerStatus
  ] = await Promise.all([
    redisClient.llen(KEYS.QUEUE_PENDING),
    redisClient.zcard(KEYS.QUEUE_PRIORITY),
    redisClient.llen(KEYS.QUEUE_PROCESSING),
    redisClient.llen(KEYS.QUEUE_DEAD_LETTER),
    redisClient.get(KEYS.STATS_COUNT(dateStr)),
    redisClient.scard(KEYS.ALL_ORDERS_INDEX),
    redisClient.get(KEYS.WORKER_STATUS)
  ]);

  // Thong ke theo trang thai dua tren tat ca don da tao
  const allOrderIds = await redisClient.smembers(KEYS.ALL_ORDERS_INDEX);
  let completedCount = 0;
  let failedCount = 0;

  if (allOrderIds && allOrderIds.length > 0) {
    const pipeline = redisClient.pipeline();
    allOrderIds.forEach((id) => pipeline.hget(KEYS.ORDER_HASH(id), 'status'));
    const results = await pipeline.exec();

    results.forEach(([err, status]) => {
      if (status === ORDER_STATUS.COMPLETED) completedCount++;
      if (status === ORDER_STATUS.FAILED || status === ORDER_STATUS.DLQ) failedCount++;
    });
  }

  return {
    queues: {
      pending: pendingCount || 0,
      priority: priorityCount || 0,
      processing: processingCount || 0,
      dead_letter: dlqCount || 0
    },
    counts: {
      total_orders: totalAllOrders || 0,
      today_orders: parseInt(todayCountStr || '0', 10),
      completed: completedCount,
      failed_or_dlq: failedCount
    },
    worker_status: workerStatus || WORKER_STATUS.RUNNING
  };
}

/**
 * Lay chi tiet cac phan tu dang nam trong cac hang doi de hien thi tren Dashboard
 */
async function getQueueDetails() {
  const [
    pendingIds,
    priorityRaw,
    processingIds,
    dlqIds
  ] = await Promise.all([
    redisClient.lrange(KEYS.QUEUE_PENDING, 0, 19),
    redisClient.zrevrange(KEYS.QUEUE_PRIORITY, 0, 19, 'WITHSCORES'),
    redisClient.lrange(KEYS.QUEUE_PROCESSING, 0, 19),
    redisClient.lrange(KEYS.QUEUE_DEAD_LETTER, 0, 19)
  ]);

  // Format priority list tu [id1, score1, id2, score2, ...] thanh array of objects
  const priorityItems = [];
  for (let i = 0; i < priorityRaw.length; i += 2) {
    priorityItems.push({
      order_id: priorityRaw[i],
      score: priorityRaw[i + 1]
    });
  }

  return {
    pending: pendingIds,
    priority: priorityItems,
    processing: processingIds,
    dead_letter: dlqIds
  };
}

/**
 * Dieu khien trang thai Worker: Tam dung hoac Tiep tuc
 */
async function setWorkerStatus(status) {
  if (status !== WORKER_STATUS.RUNNING && status !== WORKER_STATUS.PAUSED) {
    throw new Error('Trang thai Worker khong hop le. Chi chap nhan RUNNING hoac PAUSED.');
  }
  await redisClient.set(KEYS.WORKER_STATUS, status);
  return { status };
}

/**
 * Kich hoat che do xu ly mot don duy nhat de giang vien quan sat tung buoc
 */
async function triggerSingleStep() {
  await redisClient.set(KEYS.WORKER_STEP_TRIGGER, '1');
  return { message: 'Đã kích hoạt xử lý 1 đơn hàng tiếp theo (Single Step Trigger).' };
}

/**
 * Chuyen mot don bi loi tu Dead Letter Queue quay ve hang doi de thu lai
 */
async function retryDeadLetterOrder(orderId) {
  const dlqKey = KEYS.QUEUE_DEAD_LETTER;
  const removedCount = await redisClient.lrem(dlqKey, 1, orderId);

  if (removedCount === 0) {
    throw new Error(`Đơn hàng ${orderId} không tồn tại trong Dead Letter Queue.`);
  }

  const orderHashKey = KEYS.ORDER_HASH(orderId);
  const priorityStr = await redisClient.hget(orderHashKey, 'priority');
  const numericPriority = parseInt(priorityStr || '1', 10);
  const nowIso = new Date().toISOString();

  const pipeline = redisClient.pipeline();
  pipeline.hset(orderHashKey, {
    status: ORDER_STATUS.PENDING,
    retry_count: '0',
    error_reason: '',
    updated_at: nowIso
  });
  pipeline.rpush(
    KEYS.ORDER_HISTORY(orderId),
    `[${nowIso}] Quản trị viên đã bấm THỬ LẠI từ Dead Letter Queue. Chuyển về hàng đợi chờ xử lý.`
  );

  if (numericPriority > 1) {
    pipeline.zadd(KEYS.QUEUE_PRIORITY, numericPriority, orderId);
  } else {
    pipeline.lpush(KEYS.QUEUE_PENDING, orderId);
  }

  await pipeline.exec();

  return {
    message: `Đơn ${orderId} đã được chuyển từ Dead Letter Queue về hàng đợi chờ xử lý thành công.`,
    order_id: orderId
  };
}

/**
 * Bat co gia lap loi cho don hang tiep theo (phuc vu demo loi DLQ)
 */
async function setSimulateFailure(enable = true) {
  if (enable) {
    await redisClient.set(KEYS.SIMULATE_FAILURE_FLAG, '1', 'EX', 300);
  } else {
    await redisClient.del(KEYS.SIMULATE_FAILURE_FLAG);
  }
  return { simulate_failure: enable };
}

/**
 * Xoa sach toan bo du lieu demo trong Redis de lam moi bai thuyet trinh
 */
async function resetDemoData() {
  const allOrderIds = await redisClient.smembers(KEYS.ALL_ORDERS_INDEX);
  const pipeline = redisClient.pipeline();

  if (allOrderIds && allOrderIds.length > 0) {
    allOrderIds.forEach((id) => {
      pipeline.del(KEYS.ORDER_HASH(id));
      pipeline.del(KEYS.ORDER_HISTORY(id));
      pipeline.del(KEYS.CHECKOUT_LOCK(id));
    });
  }

  pipeline.del(KEYS.QUEUE_PENDING);
  pipeline.del(KEYS.QUEUE_PRIORITY);
  pipeline.del(KEYS.QUEUE_PROCESSING);
  pipeline.del(KEYS.QUEUE_DEAD_LETTER);
  pipeline.del(KEYS.PROCESSING_META);
  pipeline.del(KEYS.ALL_ORDERS_INDEX);
  pipeline.del(KEYS.WORKER_STEP_TRIGGER);
  pipeline.del(KEYS.SIMULATE_FAILURE_FLAG);

  // Xoa cac Set cua khach hang mau
  const sampleCusts = ['CUST_01', 'CUST_02', 'CUST_03', 'CUST_04', 'CUST_05'];
  sampleCusts.forEach((c) => pipeline.del(KEYS.CUSTOMER_ORDERS(c)));

  await pipeline.exec();
  return { message: 'Đã xóa toàn bộ dữ liệu demo trong Redis thành công.' };
}

module.exports = {
  getQueueStats,
  getQueueDetails,
  setWorkerStatus,
  triggerSingleStep,
  retryDeadLetterOrder,
  setSimulateFailure,
  resetDemoData
};
