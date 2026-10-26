// Own ephemeral Redis process/port only. Never FLUSHDB or connect to app Redis.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('queue and ingestion regressions on isolated Redis', { timeout: 30000 }, async (t) => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nosql-queue-test-'));
  const executable = process.env.TEST_REDIS_SERVER || (process.platform === 'win32' ? path.resolve('redis-bin/redis-server.exe') : 'redis-server');
  const server = spawn(executable, ['--bind', '127.0.0.1', '--port', String(port),
    '--save', '', '--appendonly', 'no', '--dir', directory], { windowsHide: true, stdio: 'ignore' });
  let spawnError;
  server.on('error', (err) => { spawnError = err; });
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = String(port);
  process.env.REDIS_PASSWORD = '';
  process.env.WORKER_MAX_RETRIES = '1';
  process.env.WORKER_STALE_TIMEOUT_MS = '600';
  process.env.WORKER_HEARTBEAT_INTERVAL_MS = '100';
  process.env.WORKER_DELAY_MS = '1200';
  const { redisClient: redis } = require('../src/config/redis');
  t.after(() => { redis.disconnect(); server.kill(); });
  for (let i = 0; redis.status !== 'ready' && i < 50; i++) {
    if (spawnError) throw spawnError;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(redis.status, 'ready');
  const info = await redis.info('server');
  assert.match(info, new RegExp(`process_id:${server.pid}\\r?\\n`));
  const { createOrder, getTodayDateStr } = require('../src/services/orderService');
  const { retryDeadLetterOrder } = require('../src/services/queueService');
  const { processSingleOrder, runStaleOrderWatchdog } = require('../src/worker/worker');
  const { KEYS: K } = require('../src/config/constants');
  const payload = { customer_name: 'Test', phone: '0901234567', items: 'Test item', total: 100, priority: 1 };
  const claim = (token) => redis.claimOrder(K.QUEUE_PRIORITY, K.QUEUE_PENDING, K.QUEUE_PROCESSING,
    K.PROCESSING_META, K.WORKER_STATUS, K.WORKER_STEP_TRIGGER, K.QUEUE_DEAD_LETTER,
    Date.now(), new Date().toISOString(), token);
  const transition = (id, token, action, max = 1, ms = Date.now()) => redis.transitionOrder(
    K.QUEUE_PROCESSING, K.QUEUE_PENDING, K.QUEUE_PRIORITY, K.QUEUE_DEAD_LETTER, K.PROCESSING_META,
    id, token, ms, new Date(ms).toISOString(), max, action, 'test', 'TRACK');

  await t.test('concurrent idempotent submissions create one complete order', async () => {
    const orders = await Promise.all(Array.from({ length: 12 }, () => createOrder(payload, 'same-request')));
    assert.equal(new Set(orders.map((order) => order.order_id)).size, 1);
    assert.equal(await redis.llen(K.QUEUE_PENDING), 1);
    assert.equal(await redis.scard(K.ALL_ORDERS_INDEX), 1);
    await assert.rejects(createOrder({ ...payload, total: 200 }, 'same-request'), { statusCode: 409 });
    const id = orders[0].order_id;
    await redis.del(K.CHECKOUT_LOCK(id));
    await assert.rejects(createOrder({ ...payload, order_id: id }, 'new-key'), { statusCode: 409 });
    assert.equal(await redis.hget(K.ORDER_HASH(id), 'total'), '100');
  });
  await t.test('validation and wrong Redis type leave no partial writes', async () => {
    await assert.rejects(createOrder({ ...payload, priority: '5oops' }), { statusCode: 400 });
    await assert.rejects(createOrder({ ...payload, items: [] }), { statusCode: 400 });
    await redis.set(K.ORDER_HISTORY('bad-type'), 'wrong');
    await assert.rejects(createOrder({ ...payload, order_id: 'bad-type' }), { statusCode: 503 });
    assert.equal(await redis.exists(K.ORDER_HASH('bad-type')), 0);
    assert.equal(await redis.scard(K.ALL_ORDERS_INDEX), 1);
    const counter = K.STATS_COUNT(getTodayDateStr());
    const before = await redis.get(counter);
    await redis.set(counter, '01'); // valid string type, invalid Redis integer
    await assert.rejects(createOrder({ ...payload, order_id: 'bad-counter' }), { statusCode: 503 });
    assert.equal(await redis.exists(K.ORDER_HASH('bad-counter')), 0);
    await redis.set(counter, before);
  });
  await t.test('priority first, FIFO order, duplicate entries and competing claims', async () => {
    const fifo = await createOrder({ ...payload, order_id: 'fifo' });
    await createOrder({ ...payload, order_id: 'vip', priority: 5 });
    await redis.lpush(K.QUEUE_PENDING, 'fifo'); // simulate legacy duplicate entry
    assert.equal(await claim('vip-owner'), 'vip');
    assert.match(await redis.hget(K.PROCESSING_META, 'vip'), /^\d+$/);
    const ids = await Promise.all([claim('a'), claim('b'), claim('c')]);
    assert.equal(ids.filter(Boolean).length, 2);
    assert.equal(new Set(ids.filter(Boolean)).size, 2);
    assert.notEqual(ids[0], fifo.order_id); // the earlier order is dequeued first
    for (const id of ids.filter(Boolean)) {
      const token = await redis.hget(K.ORDER_HASH(id), 'processing_token');
      assert.equal(await transition(id, token, 'complete'), 1);
    }
  });
  await t.test('watchdog routes priority correctly and fences an obsolete worker', async () => {
    await redis.hset(K.PROCESSING_META, 'vip', Date.now() - 1000);
    await Promise.all([runStaleOrderWatchdog(), transition('vip', '600', 'recover')]);
    assert.equal(await redis.zscore(K.QUEUE_PRIORITY, 'vip'), '5');
    assert.equal(await redis.hget(K.ORDER_HASH('vip'), 'retry_count'), '1');
    assert.equal(await transition('vip', 'vip-owner', 'complete'), 0);
    assert.equal(await claim('vip-new'), 'vip');
    assert.equal(await transition('vip', 'vip-new', 'fail'), 1);
    assert.equal(await redis.hget(K.ORDER_HASH('vip'), 'status'), 'DLQ');
    assert.equal(await redis.llen(K.QUEUE_DEAD_LETTER), 1);
    const results = await Promise.allSettled([retryDeadLetterOrder('vip'), retryDeadLetterOrder('vip')]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await redis.zscore(K.QUEUE_PRIORITY, 'vip'), '5');
    assert.equal(await redis.hget(K.ORDER_HASH('vip'), 'retry_count'), '0');
  });
  await t.test('active heartbeat survives watchdog; completion clears ownership', async () => {
    assert.equal(await claim('live'), 'vip');
    const job = processSingleOrder('vip', 'live');
    await new Promise((resolve) => setTimeout(resolve, 800));
    await runStaleOrderWatchdog();
    assert.equal(await redis.hget(K.ORDER_HASH('vip'), 'status'), 'PROCESSING');
    await job;
    assert.equal(await redis.hget(K.ORDER_HASH('vip'), 'status'), 'COMPLETED');
    assert.equal(await redis.hget(K.PROCESSING_META, 'vip'), null);
    assert.equal(await redis.hget(K.ORDER_HASH('vip'), 'processing_token'), null);
  });
  await t.test('legacy ISO/missing metadata recovers after a grace period', async () => {
    await createOrder({ ...payload, order_id: 'legacy' });
    assert.equal(await claim('legacy-owner'), 'legacy');
    await redis.hset(K.PROCESSING_META, 'legacy', '2020-01-01T00:00:00.000Z');
    await runStaleOrderWatchdog();
    assert.match(await redis.hget(K.PROCESSING_META, 'legacy'), /^\d+$/);
    await redis.hset(K.PROCESSING_META, 'legacy', Date.now() - 1000);
    await runStaleOrderWatchdog();
    assert.equal(await redis.hget(K.ORDER_HASH('legacy'), 'status'), 'PENDING');
    assert.equal(await redis.lrange(K.QUEUE_PENDING, 0, -1).then((ids) => ids.includes('legacy')), true);
  });
  await t.test('paused single-step is consumed once by competing workers', async () => {
    await redis.set(K.WORKER_STATUS, 'PAUSED');
    await createOrder({ ...payload, order_id: 'second' });
    await redis.set(K.WORKER_STEP_TRIGGER, '1');
    const ids = await Promise.all([claim('step1'), claim('step2')]);
    assert.equal(ids.filter(Boolean).length, 1);
    assert.equal(await redis.get(K.WORKER_STEP_TRIGGER), null);
  });
  await t.test('missing metadata and missing Hash remain recoverable', async () => {
    await redis.set(K.WORKER_STATUS, 'RUNNING');
    const id = await claim('missing-meta');
    assert.ok(id);
    await redis.hdel(K.PROCESSING_META, id);
    await runStaleOrderWatchdog();
    assert.match(await redis.hget(K.PROCESSING_META, id), /^\d+$/);
    await redis.hset(K.PROCESSING_META, id, Date.now() - 1000);
    await runStaleOrderWatchdog();
    assert.equal(await redis.hget(K.ORDER_HASH(id), 'status'), 'PENDING');
    await redis.zadd(K.QUEUE_PRIORITY, 5, 'missing-hash');
    await claim('orphan-check');
    assert.equal(await redis.hget(K.ORDER_HASH('missing-hash'), 'status'), 'DLQ');
    await assert.rejects(retryDeadLetterOrder('missing-hash'));
    assert.ok((await redis.lrange(K.QUEUE_DEAD_LETTER, 0, -1)).includes('missing-hash'));
  });
  await t.test('admin requires credentials and rejects cross-origin writes', () => {
    const auth = require('../src/config/adminAuth');
    process.env.ADMIN_PASSWORD = 'isolated-test-password';
    const response = () => ({ code: 200, status(code) { this.code = code; return this; }, set() {}, json() {} });
    const denied = response();
    auth({ method: 'GET', get: () => undefined }, denied, () => assert.fail('unauthenticated admin'));
    assert.equal(denied.code, 401);
    const header = 'Basic ' + Buffer.from('admin:isolated-test-password').toString('base64');
    let allowed = false;
    auth({ method: 'GET', get: () => header }, response(), () => { allowed = true; });
    assert.equal(allowed, true);
    const rejected = response();
    auth({ method: 'POST', protocol: 'http', get: (key) => ({ Authorization: header, Origin: 'https://evil.example', host: 'localhost:3000' })[key] }, rejected, () => assert.fail('cross-origin write'));
    assert.equal(rejected.code, 403);
  });
  await t.test('Redis offline returns 503 without buffering a delayed order', async () => {
    redis.disconnect();
    await assert.rejects(createOrder(payload, 'offline'), { statusCode: 503 });
  });
});
