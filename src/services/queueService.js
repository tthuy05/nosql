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
    workerStatus,
    workerDelayStr
  ] = await Promise.all([
    redisClient.llen(KEYS.QUEUE_PENDING),
    redisClient.zcard(KEYS.QUEUE_PRIORITY),
    redisClient.llen(KEYS.QUEUE_PROCESSING),
    redisClient.llen(KEYS.QUEUE_DEAD_LETTER),
    redisClient.get(KEYS.STATS_COUNT(dateStr)),
    redisClient.scard(KEYS.ALL_ORDERS_INDEX),
    redisClient.get(KEYS.WORKER_STATUS),
    redisClient.get(KEYS.WORKER_DELAY_MS)
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
    worker_status: workerStatus || WORKER_STATUS.RUNNING,
    worker_delay_ms: parseInt(workerDelayStr || '2000', 10)
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

/**
 * Thiet lap toc do xu ly Worker (ms)
 */
async function setWorkerDelay(delayMs) {
  const parsed = parseInt(delayMs, 10);
  if (isNaN(parsed) || parsed < 100 || parsed > 10000) {
    throw new Error('Độ trễ Worker phải là số từ 100ms đến 10000ms.');
  }
  await redisClient.set(KEYS.WORKER_DELAY_MS, String(parsed));
  return { delay_ms: parsed };
}

/**
 * Chay cac kich ban demo tu dong giup buoi thuyet trinh hoan hao va thuan tien
 */
async function runDemoScenario(scenarioId) {
  const orderService = require('./orderService');
  const nowSuffix = Math.floor(100 + Math.random() * 900);

  if (scenarioId === 'fifo') {
    // 1. Pause worker
    await setWorkerStatus(WORKER_STATUS.PAUSED);
    const id1 = `DH_FIFO_${nowSuffix}_1`;
    const id2 = `DH_FIFO_${nowSuffix}_2`;
    const id3 = `DH_FIFO_${nowSuffix}_3`;

    await orderService.createOrder({
      order_id: id1,
      customer_id: 'CUST_01',
      customer_name: 'Nguyễn Văn A',
      phone: '0901234567',
      items: 'Áo thun cotton thoáng khí (Size L)',
      total: 199000,
      priority: 1
    });

    await orderService.createOrder({
      order_id: id2,
      customer_id: 'CUST_02',
      customer_name: 'Trần Thị Mai',
      phone: '0912345678',
      items: 'Nồi chiên không dầu Lock&Lock 5.2L',
      total: 1250000,
      priority: 1
    });

    await orderService.createOrder({
      order_id: id3,
      customer_id: 'CUST_03',
      customer_name: 'Lê Hoàng Nam',
      phone: '0988776655',
      items: 'Bình giữ nhiệt Inox 500ml',
      total: 245000,
      priority: 1
    });

    return {
      scenario_id: 'fifo',
      title: 'Kịch bản 1: Hàng đợi FIFO Tuần Tự (Redis List)',
      status: 'Đã tạo thành công 3 đơn thường và TẠM DỪNG Worker.',
      orders: [id1, id2, id3],
      next_action: 'STEP',
      next_action_label: '▶ Xử Lý 1 Đơn (Step)',
      instructions: [
        `3 đơn hàng (${id1}, ${id2}, ${id3}) đã được đẩy vào hàng đợi FIFO [queue:orders:pending].`,
        `Thứ tự vào hàng đợi: ${id1} -> ${id2} -> ${id3}.`,
        `Hãy bấm nút [▶ Xử lý 1 đơn] bên dưới. Bạn sẽ thấy đơn [${id1}] được LMOVE bốc ra xử lý TRƯỚC HẾT.`
      ],
      speech_hint: 'Thưa thầy cô, đối với đơn thường, hệ thống sử dụng cấu trúc Redis List với lệnh LPUSH để xếp hàng. Khi Worker tiếp nhận, lệnh LMOVE (hoặc RPOPLPUSH) sẽ bốc đơn đầu tiên ra một cách nguyên tử chuyển sang queue:orders:processing mà không lo mất mát đơn.',
      redis_key: 'queue:orders:pending'
    };
  }

  if (scenarioId === 'priority') {
    // 2. Pause worker
    await setWorkerStatus(WORKER_STATUS.PAUSED);
    const idStd = `DH_THUONG_${nowSuffix}`;
    const idVip = `DH_VIP_5SAO_${nowSuffix}`;

    await orderService.createOrder({
      order_id: idStd,
      customer_id: 'CUST_01',
      customer_name: 'Khách Thường - Văn A',
      phone: '0901234567',
      items: 'Cáp sạc Type-C nhanh 65W',
      total: 89000,
      priority: 1
    });

    await orderService.createOrder({
      order_id: idVip,
      customer_id: 'CUST_04',
      customer_name: 'Khách VIP - Hoàng Nam ★',
      phone: '0988776655',
      items: 'Samsung Galaxy S24 Ultra Titanium',
      total: 31990000,
      priority: 5
    });

    return {
      scenario_id: 'priority',
      title: 'Kịch bản 2: Hàng đợi Ưu tiên Khách VIP (Redis Sorted Set)',
      status: 'Đã tạo 1 đơn Thường và 1 đơn VIP (5 sao). Worker đang TẠM DỪNG.',
      orders: [idStd, idVip],
      next_action: 'STEP',
      next_action_label: '▶ Xử Lý 1 Đơn (Step)',
      instructions: [
        `Đơn thường [${idStd}] xếp vào hàng đợi FIFO (queue:orders:pending) TRƯỚC.`,
        `Đơn VIP [${idVip}] (ưu tiên ★5) xếp vào hàng đợi Sorted Set (queue:orders:priority) SAU.`,
        `Hãy bấm [▶ Xử lý 1 đơn]. Worker sẽ ưu tiên bốc đơn VIP [${idVip}] ra xử lý TRƯỚC đơn thường!`
      ],
      speech_hint: 'Thưa thầy cô, thương mại điện tử cần ưu tiên đơn hàng giá trị cao hoặc hội viên VIP. Chúng em triển khai Redis Sorted Set với điểm số Score tương ứng cấp ưu tiên. Lua script nguyên tử bảo đảm Worker luôn kiểm tra và vét hết đơn ưu tiên cao nhất trước khi xử lý đơn thường.',
      redis_key: 'queue:orders:priority'
    };
  }

  if (scenarioId === 'dlq') {
    // 3. Set speed to 1200ms, worker RUNNING
    await setWorkerDelay(1200);
    await setWorkerStatus(WORKER_STATUS.RUNNING);

    const idFail = `DH_FAIL_TEST_${nowSuffix}`;
    await redisClient.set(KEYS.SIMULATE_FAILURE_FLAG, '1', 'EX', 300);

    await orderService.createOrder({
      order_id: idFail,
      customer_id: 'CUST_05',
      customer_name: 'Khách Thử Lỗi - Test DLQ',
      phone: '0977112233',
      items: 'Tai nghe Bluetooth (Giả lập lỗi thanh toán)',
      total: 550000,
      priority: 1,
      simulate_fail: true
    });

    return {
      scenario_id: 'dlq',
      title: 'Kịch bản 3: Xử lý Lỗi, Thử Lại (Retry) và Dead Letter Queue (DLQ)',
      status: `Đã tạo đơn ${idFail} với cờ mô phỏng lỗi. Worker đang tự động xử lý.`,
      orders: [idFail],
      next_action: 'RETRY_DLQ',
      next_action_target: idFail,
      next_action_label: `🔄 Thử lại đơn ${idFail} (Retry)`,
      instructions: [
        `Đơn [${idFail}] gặp sự cố lỗi thanh toán giả lập.`,
        `Worker sẽ tự động Retry tối đa 3 lần (với số lần thử hiển thị tăng dần trên bảng).`,
        `Sau 3 lần thất bại, đơn được tự động cô lập vào cột [4. Dead Letter Queue] để bảo vệ hệ thống.`,
        `Khi thấy đơn xuất hiện ở cột DLQ, bạn chỉ cần bấm nút [🔄 Thử lại] để đưa đơn trở lại hàng đợi!`
      ],
      speech_hint: 'Thưa thầy cô, kiến trúc Message Queue chuẩn không được phép nuốt mất đơn hàng khi có lỗi mạng hay cổng thanh toán. Worker của chúng em theo dõi số lần thử lại (retry_count) trong Redis Hash. Khi vượt ngưỡng 3 lần, đơn được cách ly an toàn vào Dead Letter Queue (DLQ) để nhân viên kỹ thuật kiểm tra mà không làm tắc nghẽn các đơn khác.',
      redis_key: 'queue:orders:dead_letter'
    };
  }

  if (scenarioId === 'concurrency') {
    // 4. Concurrency: Set speed to 300ms, worker RUNNING
    await setWorkerDelay(300);
    await setWorkerStatus(WORKER_STATUS.RUNNING);

    const createdIds = [];
    for (let i = 1; i <= 25; i++) {
      const isVip = i % 5 === 0;
      const idBatch = `DH_BATCH_${nowSuffix}_${i}`;
      await orderService.createOrder({
        order_id: idBatch,
        customer_id: `CUST_0${(i % 5) + 1}`,
        customer_name: `Khách Hàng #${i}`,
        phone: `09000000${String(i).padStart(2, '0')}`,
        items: `Sản phẩm mẫu số ${i}`,
        total: 100000 * (i % 5 + 1),
        priority: isVip ? 5 : 1
      });
      createdIds.push(idBatch);
    }

    return {
      scenario_id: 'concurrency',
      title: 'Kịch bản 4: Xử lý Tải Đồng Thời & Chống Race Condition',
      status: `Đã bắn đồng thời 25 đơn hàng vào hệ thống! Tốc độ Worker: 300ms/đơn.`,
      orders: createdIds,
      next_action: 'SPEED_SLOW',
      next_action_label: '🐢 Chỉnh Worker Chậm Lại (3.5s)',
      instructions: [
        `25 đơn hàng đã được đẩy vào Redis đồng thời chỉ trong vài mili-giây.`,
        `Các số liệu trên Dashboard đang nhảy liên tục: Chờ xử lý -> Đang xử lý -> Hoàn thành.`,
        `Bộ đếm tổng số đơn [stats:orders:count] được cộng dồn chuẩn xác nhờ lệnh INCR nguyên tử.`
      ],
      speech_hint: 'Thưa thầy cô, Redis là kiến trúc Single-Threaded Event Loop hoạt động trong bộ nhớ RAM, cho phép xử lý hàng chục nghìn thao tác mỗi giây. Mọi thao tác ghi nhận đơn (INCR, LPUSH, ZADD) đều diễn ra an toàn tuyệt đối, loại trừ hoàn toàn nguy cơ tranh chấp dữ liệu (Race Condition).',
      redis_key: 'stats:orders:count:' + getTodayDateStr()
    };
  }

  throw new Error(`Kịch bản demo không hợp lệ: [${scenarioId}]. Chỉ chấp nhận fifo, priority, dlq, concurrency.`);
}

module.exports = {
  getQueueStats,
  getQueueDetails,
  setWorkerStatus,
  triggerSingleStep,
  retryDeadLetterOrder,
  setSimulateFailure,
  resetDemoData,
  setWorkerDelay,
  runDemoScenario
};
