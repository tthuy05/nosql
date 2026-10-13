const { redisClient, atomicMoveFifo } = require('../config/redis');
const { KEYS, ORDER_STATUS, WORKER_STATUS } = require('../config/constants');
require('dotenv').config();

const WORKER_ID = `worker-${process.pid}-${Math.floor(Math.random() * 1000)}`;
const DELAY_MS = parseInt(process.env.WORKER_DELAY_MS, 10) || 2500;
const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES, 10) || 3;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS, 10) || 5000;
const STALE_TIMEOUT_MS = parseInt(process.env.WORKER_STALE_TIMEOUT_MS, 10) || 30000;

let isRunning = true;
let isProcessingJob = false;

console.log(`================================================================`);
console.log(`🚀 [Worker] KHOI DONG TIEN TRINH XU LY HANG DOI: ${WORKER_ID}`);
console.log(`⏱️  [Worker] Do tre gia lap xu ly don hang: ${DELAY_MS} ms`);
console.log(`🔄 [Worker] So lan thu lai toi da (Max Retries): ${MAX_RETRIES}`);
console.log(`🛡️  [Worker] Gioi han timeout phuc hoi Crash: ${STALE_TIMEOUT_MS} ms`);
console.log(`================================================================`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Xu ly logic nghiep vu mot don hang cu the
 */
async function processSingleOrder(orderId, isPriorityOrder = false) {
  isProcessingJob = true;
  const startTime = Date.now();
  const orderHashKey = KEYS.ORDER_HASH(orderId);

  console.log(`\n📦 [${WORKER_ID}] Bat dau xu ly don hang [${orderId}] (${isPriorityOrder ? '⭐ ƯU TIÊN' : '📄 THƯỜNG'})...`);

  try {
    const order = await redisClient.hgetall(orderHashKey);
    if (!order || !order.order_id) {
      console.warn(`⚠️ [${WORKER_ID}] Khong tim thay thong tin Hash cua don ${orderId}, loai bo khoi processing.`);
      await redisClient.lrem(KEYS.QUEUE_PROCESSING, 1, orderId);
      await redisClient.hdel(KEYS.PROCESSING_META, orderId);
      isProcessingJob = false;
      return;
    }

    // 1. Kiem tra co gia lap loi hay khong
    const shouldSimulateFailure = 
      order.simulate_fail === '1' || 
      (await redisClient.get(KEYS.SIMULATE_FAILURE_FLAG)) === '1';

    if (shouldSimulateFailure) {
      // Xoa co gia lap 1 lan neu co
      await redisClient.del(KEYS.SIMULATE_FAILURE_FLAG);
    }

    // 2. Mo phong cac cong doan xu ly voi do tre DELAY_MS
    console.log(`   ⏳ [${orderId}] Bước 1: Tiếp nhận và xác thực thông tin đơn hàng...`);
    await sleep(Math.floor(DELAY_MS * 0.3));

    console.log(`   ⏳ [${orderId}] Bước 2: Kiểm tra tồn kho hàng hóa giả lập...`);
    await sleep(Math.floor(DELAY_MS * 0.4));

    console.log(`   ⏳ [${orderId}] Bước 3: Xác nhận cổng thanh toán và tạo lệnh đóng gói...`);
    await sleep(Math.floor(DELAY_MS * 0.3));

    if (shouldSimulateFailure) {
      throw new Error('Mô phỏng lỗi: Cổng thanh toán phản hồi TIMEOUT / Hàng hóa hết tồn kho');
    }

    // 3. XU LY THANH CONG
    const nowIso = new Date().toISOString();
    const trackingCode = `VNPOST_${Math.floor(1000000 + Math.random() * 9000000)}`;

    const pipeline = redisClient.pipeline();
    // Cap nhat Hash don hang sang COMPLETED
    pipeline.hset(orderHashKey, {
      status: ORDER_STATUS.COMPLETED,
      tracking_code: trackingCode,
      finished_at: nowIso,
      updated_at: nowIso
    });

    // Loai don hang khoi processing queue bang LREM
    pipeline.lrem(KEYS.QUEUE_PROCESSING, 1, orderId);

    // Xoa metadata processing
    pipeline.hdel(KEYS.PROCESSING_META, orderId);

    // Ghi nhat ky lich su
    pipeline.rpush(
      KEYS.ORDER_HISTORY(orderId),
      `[${nowIso}] Đơn hàng HOÀN THÀNH thành công. Mã vận đơn: ${trackingCode}. Thời gian xử lý: ${Date.now() - startTime}ms.`
    );

    await pipeline.exec();
    console.log(`✅ [${WORKER_ID}] Don hang [${orderId}] da HOAN THANH xu ly! Ma van don: ${trackingCode}`);

  } catch (err) {
    // 4. XU LY THAT BAI (Retry hoac chuyen vao Dead Letter Queue)
    console.error(`❌ [${WORKER_ID}] Don hang [${orderId}] gap su co: ${err.message}`);
    await handleFailedOrder(orderId, err.message, isPriorityOrder);
  } finally {
    isProcessingJob = false;
  }
}

/**
 * Xu ly don hang that bai voi gioi han Retry toi da 3 lan
 */
async function handleFailedOrder(orderId, errorMessage, isPriorityOrder) {
  const orderHashKey = KEYS.ORDER_HASH(orderId);
  const currentRetriesStr = await redisClient.hget(orderHashKey, 'retry_count');
  const currentRetries = parseInt(currentRetriesStr || '0', 10) + 1;
  const nowIso = new Date().toISOString();

  const pipeline = redisClient.pipeline();
  pipeline.lrem(KEYS.QUEUE_PROCESSING, 1, orderId);
  pipeline.hdel(KEYS.PROCESSING_META, orderId);

  if (currentRetries <= MAX_RETRIES) {
    // Thu lai: dua lai vao hang doi ban dau
    console.log(`⚠️ [${WORKER_ID}] Don [${orderId}] thu lai lan ${currentRetries}/${MAX_RETRIES}...`);
    pipeline.hset(orderHashKey, {
      status: ORDER_STATUS.PENDING,
      retry_count: String(currentRetries),
      error_reason: `Thất bại lần ${currentRetries}: ${errorMessage}`,
      updated_at: nowIso
    });

    if (isPriorityOrder) {
      const priorityStr = await redisClient.hget(orderHashKey, 'priority');
      pipeline.zadd(KEYS.QUEUE_PRIORITY, parseInt(priorityStr || '3', 10), orderId);
    } else {
      pipeline.lpush(KEYS.QUEUE_PENDING, orderId);
    }

    pipeline.rpush(
      KEYS.ORDER_HISTORY(orderId),
      `[${nowIso}] Xử lý thất bại: ${errorMessage}. Thử lại lần ${currentRetries}/${MAX_RETRIES}.`
    );
  } else {
    // Qua so lan thu lai: chuyen vao Dead Letter Queue (DLQ)
    console.log(`💀 [${WORKER_ID}] Don [${orderId}] vuot qua ${MAX_RETRIES} lan thu lai -> CHUYEN VAO DEAD LETTER QUEUE (DLQ)!`);
    pipeline.hset(orderHashKey, {
      status: ORDER_STATUS.DLQ,
      retry_count: String(currentRetries),
      error_reason: `Vượt quá giới hạn thử lại (${MAX_RETRIES} lần): ${errorMessage}`,
      updated_at: nowIso
    });

    pipeline.lpush(KEYS.QUEUE_DEAD_LETTER, orderId);
    pipeline.rpush(
      KEYS.ORDER_HISTORY(orderId),
      `[${nowIso}] Đã chuyển vào Dead Letter Queue (DLQ) sau ${MAX_RETRIES} lần thử lại thất bại.`
    );
  }

  await pipeline.exec();
}

/**
 * Tien trinh Watchdog phuc hoi cac don bi crash/treo trong processing
 */
async function runStaleOrderWatchdog() {
  try {
    const now = Date.now();
    // Goi Lua script recoverStaleOrders kiem tra tat ca don trong processing
    const result = await redisClient.recoverStaleOrders(
      KEYS.QUEUE_PROCESSING,
      KEYS.QUEUE_PENDING,
      KEYS.QUEUE_DEAD_LETTER,
      KEYS.PROCESSING_META,
      now,
      STALE_TIMEOUT_MS
    );

    const recovered = result[0];
    const movedToDlq = result[1];

    if (recovered > 0 || movedToDlq > 0) {
      console.log(`🛡️  [Watchdog] Phat hien va phuc hoi: ${recovered} don ve Pending, ${movedToDlq} don chuyen sang DLQ!`);
    }
  } catch (err) {
    console.error('[Watchdog ERROR]:', err.message);
  }
}

/**
 * Vong lap chinh cua Worker (Main Loop)
 */
async function startWorkerLoop() {
  // Khoi tao trang thai Worker la RUNNING neu chua co
  const initialStatus = await redisClient.get(KEYS.WORKER_STATUS);
  if (!initialStatus) {
    await redisClient.set(KEYS.WORKER_STATUS, WORKER_STATUS.RUNNING);
  }

  // Chay Watchdog phuc hoi ngay khi vua boot Worker
  await runStaleOrderWatchdog();

  // Thiet lap interval dinh ky cho Watchdog
  setInterval(runStaleOrderWatchdog, HEARTBEAT_INTERVAL_MS);

  while (isRunning) {
    try {
      // 1. Kiem tra trang thai Worker (RUNNING hay PAUSED)
      const status = await redisClient.get(KEYS.WORKER_STATUS);
      const stepTrigger = await redisClient.get(KEYS.WORKER_STEP_TRIGGER);

      if (status === WORKER_STATUS.PAUSED && stepTrigger !== '1') {
        // Worker dang bi tam dung boi Dashboard quan tri de giang vien quan sat
        await sleep(1000);
        continue;
      }

      if (stepTrigger === '1') {
        // Che do xu ly 1 don: xoa co trigger sau khi nhan viec
        await redisClient.del(KEYS.WORKER_STEP_TRIGGER);
        console.log(`\n🎯 [Worker] Kich hoat che do XU LY 1 DON DUY NHAT (Single Step Mode)...`);
      }

      // 2. BƯỚC 1: KIỂM TRA HÀNG ĐỢI ƯU TIÊN (PRIORITY QUEUE)
      const nowIso = new Date().toISOString();
      const priorityOrderId = await redisClient.popPriorityOrder(
        KEYS.QUEUE_PRIORITY,
        KEYS.QUEUE_PROCESSING,
        KEYS.PROCESSING_META,
        nowIso
      );

      if (priorityOrderId) {
        // Co don uu tien, xu ly ngay lap tuc!
        await processSingleOrder(priorityOrderId, true);
        continue; // Tiep tuc vong lap de uu tien kiem tra tiep hang doi priority
      }

      // 3. BƯỚC 2: KIỂM TRA HÀNG ĐỢI FIFO THƯỜNG (PENDING QUEUE)
      // Chuyen nguyen tu tu pending sang processing (LMOVE / RPOPLPUSH)
      const fifoOrderId = await atomicMoveFifo(KEYS.QUEUE_PENDING, KEYS.QUEUE_PROCESSING);

      if (fifoOrderId) {
        // Cap nhat timestamp bat dau va Hash don hang
        const nowMs = Date.now();
        const pipeline = redisClient.pipeline();
        pipeline.hset(KEYS.PROCESSING_META, fifoOrderId, nowMs);
        pipeline.hset(KEYS.ORDER_HASH(fifoOrderId), {
          status: ORDER_STATUS.PROCESSING,
          updated_at: new Date(nowMs).toISOString()
        });
        pipeline.rpush(
          KEYS.ORDER_HISTORY(fifoOrderId),
          `[${new Date(nowMs).toISOString()}] Chuyển từ queue:orders:pending sang queue:orders:processing (LMOVE FIFO).`
        );
        await pipeline.exec();

        await processSingleOrder(fifoOrderId, false);
        continue;
      }

      // 4. Neu khong co don hang nao trong ca 2 queue, nghi 600ms roi kiem tra lai
      await sleep(600);

    } catch (loopErr) {
      console.error(`[Worker Loop ERROR]:`, loopErr.message);
      await sleep(1500);
    }
  }
}

// Bat dau vong lap Worker
startWorkerLoop();

// Xu ly Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\n⚠️ [Worker] Nhan tin hieu ${signal}. Dang dong tien trinh an toan...`);
  isRunning = false;
  setTimeout(() => {
    console.log(`👋 [Worker] Tien trinh da dung.`);
    process.exit(0);
  }, isProcessingJob ? DELAY_MS + 500 : 500);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

module.exports = {
  startWorkerLoop,
  processSingleOrder
};
