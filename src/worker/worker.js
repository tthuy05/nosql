const { randomUUID } = require('crypto');
const { redisClient } = require('../config/redis');
const { KEYS, WORKER_STATUS } = require('../config/constants');

function setting(name, fallback, minimum = 1) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback;
}
const DELAY_MS = setting('WORKER_DELAY_MS', 2500);
const MAX_RETRIES = setting('WORKER_MAX_RETRIES', 3, 0);
const STALE_TIMEOUT_MS = setting('WORKER_STALE_TIMEOUT_MS', 30000, 300);
const HEARTBEAT_MS = Math.min(setting('WORKER_HEARTBEAT_INTERVAL_MS', 5000), Math.floor(STALE_TIMEOUT_MS / 3));
const transitionKeys = [KEYS.QUEUE_PROCESSING, KEYS.QUEUE_PENDING,
  KEYS.QUEUE_PRIORITY, KEYS.QUEUE_DEAD_LETTER, KEYS.PROCESSING_META];
let isRunning = true;
let watchdogTimer;
let watchdogRunning = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function transition(orderId, token, action, reason = '', tracking = '') {
  const now = Date.now();
  return redisClient.transitionOrder(...transitionKeys, orderId, token,
    now, new Date(now).toISOString(), MAX_RETRIES, action, reason, tracking);
}

async function processSingleOrder(orderId, token) {
  let renewing = false;
  const heartbeat = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try {
      await redisClient.renewOrder(KEYS.ORDER_HASH(orderId), KEYS.PROCESSING_META,
        orderId, token, Date.now());
    } catch (err) { console.error('[Heartbeat]', err.message); }
    finally { renewing = false; }
  }, HEARTBEAT_MS);
  try {
    const order = await redisClient.hgetall(KEYS.ORDER_HASH(orderId));
    if (order.processing_token !== token || order.status !== 'PROCESSING') return;
    // Consume the one-shot failure flag atomically across workers.
    const flag = await redisClient.eval("local v=redis.call('GET',KEYS[1]); redis.call('DEL',KEYS[1]); return v", 1, KEYS.SIMULATE_FAILURE_FLAG);
    const configured = Number(await redisClient.get(KEYS.WORKER_DELAY_MS));
    const delay = Number.isInteger(configured) && configured >= 100 && configured <= 10000 ? configured : DELAY_MS;
    await sleep(delay);
    if (order.simulate_fail === '1' || flag === '1') {
      await transition(orderId, token, 'fail', 'Mo phong loi xu ly');
    } else {
      await transition(orderId, token, 'complete', '', `VNPOST_${randomUUID()}`);
    }
  } catch (err) {
    // An uncertain Redis response is not a business failure. The watchdog
    // recovers this claim after heartbeats stop.
    console.error(`[Worker ${orderId}]`, err.message);
  } finally { clearInterval(heartbeat); }
}

async function runStaleOrderWatchdog() {
  if (watchdogRunning) return;
  watchdogRunning = true;
  try {
    const ids = await redisClient.lrange(KEYS.QUEUE_PROCESSING, 0, -1);
    for (const id of new Set(ids)) {
      await transition(id, STALE_TIMEOUT_MS, 'recover', 'Worker timeout / crash recovery');
    }
  } catch (err) { console.error('[Watchdog]', err.message); }
  finally { watchdogRunning = false; }
}

async function startWorkerLoop() {
  watchdogTimer = setInterval(runStaleOrderWatchdog, HEARTBEAT_MS);
  while (isRunning) {
    try {
      if (redisClient.status !== 'ready') { await sleep(300); continue; }
      await redisClient.set(KEYS.WORKER_STATUS, WORKER_STATUS.RUNNING, 'NX');
      await runStaleOrderWatchdog();
      const token = randomUUID();
      const now = Date.now();
      const id = await redisClient.claimOrder(KEYS.QUEUE_PRIORITY, KEYS.QUEUE_PENDING,
        KEYS.QUEUE_PROCESSING, KEYS.PROCESSING_META, KEYS.WORKER_STATUS,
        KEYS.WORKER_STEP_TRIGGER, KEYS.QUEUE_DEAD_LETTER, now, new Date(now).toISOString(), token);
      if (id) await processSingleOrder(id, token);
      else await sleep(600);
    } catch (err) { console.error('[Worker loop]', err.message); await sleep(1500); }
  }
  clearInterval(watchdogTimer);
  await redisClient.quit();
}

if (require.main === module) {
  process.on('SIGINT', () => { isRunning = false; });
  process.on('SIGTERM', () => { isRunning = false; });
  startWorkerLoop().catch((err) => { console.error(err); redisClient.disconnect(); process.exitCode = 1; });
}
module.exports = { startWorkerLoop, processSingleOrder, runStaleOrderWatchdog };
