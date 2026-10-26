// Full local acceptance uses owned processes, random ports and temporary data only.
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { once } = require('events');
const Redis = require('ioredis');
const root = path.resolve(__dirname, '..');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidence = process.env.EVIDENCE_DIR || path.join(root, 'docs/evidence', runId);
fs.mkdirSync(evidence, { recursive: true });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nosql acceptance '));
const results = [];
const children = [];
process.once('SIGINT', () => { for (const child of children) child.kill(); process.exit(130); });
const redisExe = process.env.TEST_REDIS_SERVER || (process.platform === 'win32' ? path.join(root, 'redis-bin/redis-server.exe') : 'redis-server');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let workerNumber = 0;
async function port() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening'); const number = server.address().port;
  await new Promise((resolve) => server.close(resolve)); return number;
}
function launch(name, exe, args, env = {}, cwd = root) {
  const log = fs.openSync(path.join(evidence, name + '.log'), 'a');
  const child = spawn(exe, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', log, log] });
  fs.closeSync(log); children.push(child);
  child.on('error', (err) => { child.startError = err; });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
}
async function wait(check, label, timeout = 15000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { const value = await check(); if (value) return value; } catch (err) { last = err; }
    await sleep(50);
  }
  throw new Error('Timeout: ' + label + (last ? ' (' + last.message + ')' : ''));
}
async function fixture(name, aof = false, existingDirectory, existingPort) {
  const data = existingDirectory || path.join(directory, name);
  fs.mkdirSync(data, { recursive: true });
  const number = existingPort || await port();
  const child = launch(name, redisExe, ['--bind', '127.0.0.1', '--protected-mode', 'yes',
    '--port', String(number), '--dir', data, '--save', '', '--appendonly', aof ? 'yes' : 'no', '--appendfsync', 'always']);
  const client = new Redis({ host: '127.0.0.1', port: number, maxRetriesPerRequest: 1, retryStrategy: () => 100 });
  client.on('error', () => {});
  await wait(() => { if (child.startError) throw child.startError; return client.status === 'ready'; }, name + ' Redis ready');
  assert.match(await client.info('server'), new RegExp('process_id:' + child.pid + '\\r?\\n'));
  return { child, client, port: number, data };
}
function save() {
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ runId, directory, node: process.version, results }, null, 2));
}
async function check(id, input, expected, fn) {
  const start = Date.now();
  try {
    const actual = await fn();
    results.push({ id, input, expected, actual, status: 'PASS', duration_ms: Date.now() - start });
  } catch (err) {
    results.push({ id, input, expected, actual: err.stack, status: 'FAIL', duration_ms: Date.now() - start });
  }
  save(); console.log(id + ': ' + results.at(-1).status + ' ' + JSON.stringify(results.at(-1).actual));
}
async function main() {
  const db = await fixture('application-redis', true);
  const redis = db.client;
  const apiPort = await port();
  const commonEnv = { REDIS_HOST: '127.0.0.1', REDIS_PORT: String(db.port), REDIS_PASSWORD: '',
    HOST: '127.0.0.1', PORT: String(apiPort), ADMIN_PASSWORD: 'acceptance-local-only',
    WORKER_DELAY_MS: '100', WORKER_MAX_RETRIES: '1', WORKER_STALE_TIMEOUT_MS: '700', WORKER_HEARTBEAT_INTERVAL_MS: '100' };
  const api = launch('api', process.execPath, ['src/server.js'], commonEnv);
  const base = 'http://127.0.0.1:' + apiPort;
  const auth = 'Basic ' + Buffer.from('admin:acceptance-local-only').toString('base64');
  async function request(url, method = 'GET', body, headers = {}) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const text = await response.text(); let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  }
  const admin = (url, body) => request('/api/admin/' + url, body === undefined ? 'GET' : 'POST', body, { Authorization: auth });
  const payload = { customer_name: 'Acceptance Test', phone: '0901234567', items: 'Test product', total: 100, priority: 1 };
  async function create(id, extra = {}, key) {
    const response = await request('/api/orders', 'POST', { ...payload, ...(id ? { order_id: id } : {}), ...extra },
      key ? { 'Idempotency-Key': key } : {});
    assert.equal(response.status, 201, JSON.stringify(response));
    return response.data.data;
  }
  let workers = [];
  function worker(delay = 100, retries = 1) {
    const child = launch('worker-' + (++workerNumber), process.execPath, ['src/worker/worker.js'],
      { ...commonEnv, WORKER_DELAY_MS: String(delay), WORKER_MAX_RETRIES: String(retries) });
    workers.push(child); return child;
  }
  async function stopWorkers() { await Promise.all(workers.map(stop)); workers = []; }
  const status = (id) => redis.hget('order:' + id, 'status');
  async function finished(ids) { await wait(async () => (await Promise.all(ids.map(status))).every((value) => value === 'COMPLETED'), 'completed ' + ids.length, 30000); }
  async function empty() {
    await wait(async () => await redis.llen('queue:orders:pending') === 0 &&
      await redis.zcard('queue:orders:priority') === 0 && await redis.llen('queue:orders:processing') === 0, 'drain', 30000);
  }
  await wait(async () => (await request('/api/products')).status === 200, 'API ready');
  await redis.set('worker:control:status', 'PAUSED');

  await check('API-01', 'GET products, homepage, static assets and unknown order', '10 products; HTML/JS/CSS 200; missing order 404', async () => {
    const products = await request('/api/products'); assert.equal(products.data.data.length, 10);
    for (const url of ['/', '/js/app.js', '/css/style.css']) assert.equal((await request(url)).status, 200);
    assert.equal((await request('/api/orders/no-such-order')).status, 404);
    return { products: 10, assets: 3, missing: 404 };
  });
  await check('API-02', '6 invalid order payloads', '400 and zero order writes', async () => {
    const invalid = [{ total: -1 }, { items: [] }, { priority: '5oops' }, { phone: {} }, { simulate_fail: 'yes' },
      { items: [{ id: 'SP01', name: 'Item', price: 1, quantity: 1 }], total: 100 }];
    for (const item of invalid) assert.equal((await request('/api/orders', 'POST', { ...payload, ...item })).status, 400);
    assert.equal(await redis.scard('orders:all:index'), 0);
    return { rejected: invalid.length, orders: 0 };
  });
  await check('SEC-01', 'admin absent/wrong/correct credential; cross-origin; reset', '401,401,200,403,403', async () => {
    const codes = [(await request('/api/admin/stats')).status,
      (await request('/api/admin/stats', 'GET', undefined, { Authorization: 'Basic wrong' })).status,
      (await admin('stats')).status,
      (await request('/api/admin/worker/step', 'POST', {}, { Authorization: auth, Origin: 'https://evil.example' })).status,
      (await admin('reset', {})).status];
    assert.deepEqual(codes, [401, 401, 200, 403, 403]); return codes;
  });
  await check('SEC-02', 'separate API with ADMIN_PASSWORD empty', 'admin 503, public products 200', async () => {
    const missingPort = await port();
    const child = launch('api-no-admin-password', process.execPath, ['src/server.js'], { ...commonEnv, PORT: String(missingPort), ADMIN_PASSWORD: '' });
    try {
      await wait(async () => (await fetch('http://127.0.0.1:' + missingPort + '/api/products')).status === 200, 'passwordless API ready');
      const response = await fetch('http://127.0.0.1:' + missingPort + '/api/admin/stats');
      assert.equal(response.status, 503); return { admin: 503, products: 200 };
    } finally { await stop(child); }
  });
  await check('IDEM-01', '40 simultaneous HTTP POSTs, same Idempotency-Key; changed payload', 'one order, one queue entry, changed content 409', async () => {
    const responses = await Promise.all(Array.from({ length: 40 }, () => create(null, {}, 'http-idempotency')));
    assert.equal(new Set(responses.map((order) => order.order_id)).size, 1);
    assert.equal(await redis.llen('queue:orders:pending'), 1);
    assert.equal(await redis.scard('orders:all:index'), 1);
    assert.equal((await request('/api/orders', 'POST', { ...payload, total: 200 }, { 'Idempotency-Key': 'http-idempotency' })).status, 409);
    return { requests: 40, orders: 1, queueEntries: 1, conflict: 409 };
  });
  await check('IDEM-02', 'same custom ID after checkout lock deleted, different key', '409; original Hash unchanged', async () => {
    await create('PERMANENT_ID');
    await redis.del('checkout:lock:PERMANENT_ID');
    const response = await request('/api/orders', 'POST', { ...payload, order_id: 'PERMANENT_ID', total: 200 }, { 'Idempotency-Key': 'other-key' });
    assert.equal(response.status, 409); assert.equal(await redis.hget('order:PERMANENT_ID', 'total'), '100');
    return { duplicate: 409, total: 100 };
  });
  worker();
  await admin('worker/status', { status: 'RUNNING' }); await empty();
  await check('QUEUE-01', 'three standard orders queued while paused; one real worker', 'FIFO completion A,B,C; processing/meta cleared', async () => {
    await admin('worker/status', { status: 'PAUSED' });
    const ids = ['FIFO_A', 'FIFO_B', 'FIFO_C'];
    for (const id of ids) await create(id);
    await admin('worker/status', { status: 'RUNNING' }); await finished(ids);
    const times = await Promise.all(ids.map((id) => redis.hget('order:' + id, 'finished_at')));
    assert.ok(times[0] < times[1] && times[1] < times[2]);
    for (const id of ids) assert.equal(await redis.hget('queue:orders:processing:meta', id), null);
    return { sequence: ids, finished_at: times };
  });
  await check('QUEUE-02', 'pending FIFO + priority3 + priority5 queued before resume', 'VIP5 then priority3 then FIFO', async () => {
    await admin('worker/status', { status: 'PAUSED' });
    await create('PRIO_STANDARD'); await create('PRIO_3', { priority: 3 }); await create('PRIO_5', { priority: 5 });
    await admin('worker/status', { status: 'RUNNING' });
    const ids = ['PRIO_5', 'PRIO_3', 'PRIO_STANDARD']; await finished(ids);
    const times = await Promise.all(ids.map((id) => redis.hget('order:' + id, 'finished_at')));
    assert.ok(times[0] < times[1] && times[1] < times[2]); return { sequence: ids, finished_at: times };
  });
  await check('QUEUE-03', 'simulate_fail=true, maxRetries=1; admin retry after removing failure flag', 'two failed attempts -> DLQ; retry -> COMPLETED once', async () => {
    await create('DLQ_CASE', { priority: 5, simulate_fail: true });
    await wait(async () => await status('DLQ_CASE') === 'DLQ', 'DLQ');
    assert.equal(await redis.hget('order:DLQ_CASE', 'retry_count'), '2');
    assert.equal(await redis.llen('queue:orders:dead_letter'), 1);
    await redis.hset('order:DLQ_CASE', 'simulate_fail', '0');
    assert.equal((await admin('retry-dlq/DLQ_CASE', {})).status, 200); await finished(['DLQ_CASE']);
    assert.equal(await redis.llen('queue:orders:dead_letter'), 0);
    return { failedAttempts: 2, afterRetry: 'COMPLETED' };
  });
  await stopWorkers();
  for (const priority of [1, 5]) {
    await check('CRASH-' + priority, 'SIGKILL actual Worker while processing priority=' + priority + '; restart two Workers', 'order retained; watchdog recovers correct queue; one completion and retry_count=1', async () => {
      await redis.set('worker:control:status', 'RUNNING');
      const id = 'CRASH_PRIORITY_' + priority;
      const doomed = worker(2500); await create(id, { priority });
      await wait(async () => await status(id) === 'PROCESSING', 'claimed before kill');
      await stop(doomed);
      assert.ok((await redis.lrange('queue:orders:processing', 0, -1)).includes(id));
      worker(); worker(); await finished([id]);
      assert.equal(await redis.hget('order:' + id, 'retry_count'), '1');
      const history = await redis.lrange('order:' + id + ':history', 0, -1);
      assert.equal(history.filter((line) => line.includes('] complete:')).length, 1);
      await stopWorkers(); return { id, killedPid: doomed.pid, recovered: true, completions: 1 };
    });
  }
  await check('HEARTBEAT-01', 'worker delay1800ms, stale timeout700ms', 'after1000ms still PROCESSING/retry0; eventually completed', async () => {
    worker(1800); await create('HEARTBEAT_CASE');
    await wait(async () => await status('HEARTBEAT_CASE') === 'PROCESSING', 'heartbeat claim');
    await sleep(1000); assert.equal(await status('HEARTBEAT_CASE'), 'PROCESSING');
    assert.equal(await redis.hget('order:HEARTBEAT_CASE', 'retry_count'), '0');
    await finished(['HEARTBEAT_CASE']); await stopWorkers();
    return { delay_ms: 1800, timeout_ms: 700, retry_count: 0 };
  });
  await check('LOAD-01', '200 HTTP requests, concurrency20, 100 unique keys + 10 keys repeated10 times; 4 Workers', '110 unique orders, all completed once; latency/throughput measured', async () => {
    for (let i = 0; i < 4; i++) worker();
    const tasks = Array.from({ length: 200 }, (_, i) => i < 100 ? 'LOAD_UNIQUE_' + i : 'LOAD_REPEAT_' + (i % 10));
    const latencies = [], ids = [];
    let cursor = 0;
    const start = performance.now();
    await Promise.all(Array.from({ length: 20 }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++, t = performance.now();
        ids.push((await create(null, { priority: index % 2 ? 1 : 5 }, tasks[index] + (index < 100 ? '' : '_p' + (index % 2)))).order_id);
        latencies.push(performance.now() - t);
      }
    }));
    const ingestionMs = performance.now() - start;
    const unique = [...new Set(ids)]; assert.equal(unique.length, 110);
    await finished(unique);
    const totalMs = performance.now() - start;
    for (const id of unique) {
      const history = await redis.lrange('order:' + id + ':history', 0, -1);
      assert.equal(history.filter((line) => line.includes('] complete:')).length, 1);
      assert.equal(await redis.hget('order:' + id, 'retry_count'), '0');
    }
    await empty();
    latencies.sort((a, b) => a - b);
    return { requests: 200, concurrency: 20, workers: 4, uniqueOrders: 110, errors: 0,
      ingestion_ms: +ingestionMs.toFixed(2), requests_per_second: +(200000 / ingestionMs).toFixed(2),
      p50_ms: +latencies[99].toFixed(2), p95_ms: +latencies[189].toFixed(2),
      completion_ms: +totalMs.toFixed(2), orders_per_second: +(110000 / totalMs).toFixed(2) };
  });
  await check('CONTROL-01', '4 workers paused, 3 orders, one step trigger', 'exactly one completion while paused; resume drains remaining', async () => {
    await admin('worker/status', { status: 'PAUSED' });
    const ids = ['STEP_A', 'STEP_B', 'STEP_C']; for (const id of ids) await create(id);
    await admin('worker/step', {});
    await wait(async () => (await Promise.all(ids.map(status))).filter((value) => value === 'COMPLETED').length === 1, 'single step');
    await sleep(900);
    assert.equal((await Promise.all(ids.map(status))).filter((value) => value === 'COMPLETED').length, 1);
    await admin('worker/status', { status: 'RUNNING' }); await finished(ids);
    return { completedWhilePaused: 1, afterResume: 3 };
  });
  await check('CONSISTENCY-01', 'all HTTP tests finished; compare every Hash/index/queues/counters/customer membership', 'no missing order, no processing metadata, no duplicate completion', async () => {
    await empty(); const ids = await redis.smembers('orders:all:index');
    for (const id of ids) {
      const hash = await redis.hgetall('order:' + id);
      assert.equal(hash.status, 'COMPLETED'); assert.equal(hash.order_id, id);
      assert.equal(await redis.sismember('customer:' + hash.customer_id + ':orders', id), 1);
      const history = await redis.lrange('order:' + id + ':history', 0, -1);
      assert.equal(history.filter((line) => line.includes('] complete:')).length, 1);
    }
    assert.equal(await redis.hlen('queue:orders:processing:meta'), 0);
    const keys = await redis.keys('stats:orders:count:*'); // owned, empty-at-start test DB only
    const count = (await Promise.all(keys.map((key) => redis.get(key)))).reduce((sum, value) => sum + Number(value), 0);
    assert.equal(count, ids.length); return { orders: ids.length, counter: count, metadata: 0 };
  });
  await check('PERSIST-01', 'dedicated Redis SAVE RDB, later AOF mutation, kill and restart', 'RDB has snapshot; AOF restart has newer value', async () => {
    const store = await fixture('persistence', true);
    let aofClient;
    try {
      await store.client.set('persist:value', 'snapshot'); await store.client.save();
      const rdbDir = path.join(directory, 'rdb-copy'); fs.mkdirSync(rdbDir);
      fs.copyFileSync(path.join(store.data, 'dump.rdb'), path.join(rdbDir, 'dump.rdb'));
      const rdb = await fixture('rdb-reader', false, rdbDir);
      assert.equal(await rdb.client.get('persist:value'), 'snapshot'); rdb.client.disconnect(); await stop(rdb.child);
      await store.client.set('persist:value', 'newer-aof'); store.client.disconnect(); await stop(store.child);
      const restarted = await fixture('aof-restart', true, store.data, store.port); aofClient = restarted.client;
      assert.equal(await aofClient.get('persist:value'), 'newer-aof');
      aofClient.disconnect(); await stop(restarted.child);
      return { rdbValue: 'snapshot', aofValue: 'newer-aof', abruptRestart: true };
    } finally { store.client.disconnect(); aofClient?.disconnect(); await stop(store.child); }
  });

  await stopWorkers();
  for (const max of [0, 3]) {
    await check('RETRY-LIMIT-' + max, 'Real worker configured maxRetries=' + max + ', persistent failure', 'DLQ after ' + (max + 1) + ' failures; admin retry completes', async () => {
      worker(100, max); const id = 'RETRY_LIMIT_' + max;
      await create(id, { priority: 5, simulate_fail: true });
      await wait(async () => await status(id) === 'DLQ', 'retry limit');
      assert.equal(await redis.hget('order:' + id, 'retry_count'), String(max + 1));
      await redis.hset('order:' + id, 'simulate_fail', '0');
      assert.equal((await admin('retry-dlq/' + id, {})).status, 200);
      await finished([id]); await stopWorkers(); return { maxRetries: max, failures: max + 1, finalStatus: 'COMPLETED' };
    });
  }
  await check('OUTAGE-01', 'Kill owned application Redis during processing; POST while offline; restart same AOF directory', '503 offline; no buffered create; recovered in-flight job completes once', async () => {
    const id = 'OUTAGE_INFLIGHT'; const w = worker(2500); await create(id);
    await wait(async () => await status(id) === 'PROCESSING', 'outage claim');
    await stop(db.child);
    const offline = await request('/api/orders', 'POST', payload, { 'Idempotency-Key': 'outage-request' });
    assert.equal(offline.status, 503); await stop(w); await stopWorkers();
    const restarted = await fixture('application-redis-restarted', true, db.data, db.port);
    db.child = restarted.child; restarted.client.disconnect();
    await wait(() => redis.status === 'ready', 'old Redis client reconnect');
    await wait(async () => (await admin('stats')).status === 200, 'API Redis client reconnect');
    const before = await redis.scard('orders:all:index');
    const created = await create(null, {}, 'outage-request'); worker(); worker();
    await finished([id, created.order_id]);
    assert.equal(await redis.scard('orders:all:index'), before + 1);
    const history = await redis.lrange('order:' + id + ':history', 0, -1);
    assert.equal(history.filter((line) => line.includes('] complete:')).length, 1);
    await empty();
    const allIds = await redis.smembers('orders:all:index');
    assert.equal(allIds.length, 129);
    for (const orderId of allIds) assert.equal(await status(orderId), 'COMPLETED');
    assert.equal(await redis.hlen('queue:orders:processing:meta'), 0);
    await stopWorkers(); return { offlineStatus: 503, retainedInFlight: true, newOrders: 1, completions: 1, finalCompletedOrders: allIds.length };
  });
  // Keep an isolated demo for browser testing only when explicitly requested.
  if (process.argv.includes('--serve')) {
    const browserWorker = worker(500);
    const session = { api: base, redisPort: db.port, redisPid: db.child.pid, apiPid: api.pid, workerPid: browserWorker.pid, evidence, directory,
      credentials: 'admin / acceptance-local-only (disposable test only)' };
    fs.writeFileSync(path.join(root, '.system_generated', 'acceptance-session.json'), JSON.stringify(session, null, 2));
    console.log('BROWSER_SESSION ' + JSON.stringify(session)); save();
    await new Promise(() => {});
  }
  redis.disconnect(); await Promise.all(children.map(stop));
}
fs.mkdirSync(path.join(root, '.system_generated'), { recursive: true });
main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (!process.argv.includes('--serve')) await Promise.all(children.map(stop));
  save();
  console.log('EVIDENCE ' + evidence);
  if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
});

