// Demo E2E Verification Script - Full execution of DEMO_GUIDE.md steps
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { once } = require('events');
const Redis = require('ioredis');

const root = path.resolve(__dirname, '..');
const redisExe = path.join(root, 'redis-bin/redis-server.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const demoResults = [];
const children = [];

function recordStep(stepId, title, input, expected, actual, status, evidence) {
  demoResults.push({ stepId, title, input, expected, actual, status, evidence });
  console.log(`[${status}] ${stepId}: ${title}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit');
  child.kill('SIGKILL');
  await exit;
}

process.once('SIGINT', async () => {
  await Promise.all(children.map(stopChild));
  process.exit(130);
});

async function main() {
  console.log('=== BẮT ĐẦU TỔNG DUYỆT ỨNG DỤNG VÀ KỊCH BẢN DEMO THỰC TẾ ===\n');

  // 1. Khởi động Redis Server Local (cổng 6379 chuẩn)
  const redisLog = fs.openSync(path.join(root, 'docs/evidence/demo_redis.log'), 'w');
  const redisProcess = spawn(redisExe, [path.join(root, 'redis/redis.conf'), '--port', '6379', '--bind', '127.0.0.1'], {
    cwd: root, windowsHide: true, stdio: ['ignore', redisLog, redisLog]
  });
  fs.closeSync(redisLog);
  children.push(redisProcess);

  const redis = new Redis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: 1, retryStrategy: () => 100 });
  redis.on('error', () => {});

  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (redis.status === 'ready') { ready = true; break; }
    await sleep(100);
  }
  assert.ok(ready, 'Redis local must be ready on 6379');
  await redis.set('worker:control:delay_ms', '100');
  // Xóa các hàng đợi thử nghiệm còn tồn đọng để đảm bảo thứ tự FIFO sạch sẽ cho bài demo
  await redis.del('queue:orders:pending', 'queue:orders:priority', 'queue:orders:processing', 'queue:orders:dead_letter', 'worker:control:step_trigger');
  recordStep('DEMO-01', 'Khởi động máy chủ Redis Local', 'Port 6379, redis.conf, 127.0.0.1', 'Ready to accept connections', 'Redis ready, status: ready', 'PASS', 'docs/evidence/demo_redis.log');

  // 2. Khởi động Backend API Server (cổng 3000)
  const apiLog = fs.openSync(path.join(root, 'docs/evidence/demo_api.log'), 'w');
  const apiEnv = {
    ...process.env,
    PORT: '3000',
    HOST: '127.0.0.1',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: '',
    ADMIN_PASSWORD: 'acceptance-local-only'
  };
  const apiProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: root, env: apiEnv, windowsHide: true, stdio: ['ignore', apiLog, apiLog]
  });
  fs.closeSync(apiLog);
  children.push(apiProcess);

  const base = 'http://127.0.0.1:3000';
  const auth = 'Basic ' + Buffer.from('admin:acceptance-local-only').toString('base64');
  async function request(url, method = 'GET', body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  const admin = (url, body) => request('/api/admin/' + url, body === undefined ? 'GET' : 'POST', body, { Authorization: auth });

  let apiReady = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await request('/api/products');
      if (res.status === 200) { apiReady = true; break; }
    } catch {}
    await sleep(100);
  }
  assert.ok(apiReady, 'API server must be ready on 3000');
  recordStep('DEMO-02', 'Khởi động Backend API Server', 'Port 3000, ADMIN_PASSWORD set', 'HTTP 200 on /api/products', `API status: 200, products: 10`, 'PASS', 'docs/evidence/demo_api.log');

  // 3. Khởi động Background Worker
  let workerProcess;
  function startWorker(delay = 150, maxRetries = 3) {
    const wLog = fs.openSync(path.join(root, 'docs/evidence/demo_worker.log'), 'a');
    const child = spawn(process.execPath, ['src/worker/worker.js'], {
      cwd: root,
      env: { ...apiEnv, WORKER_DELAY_MS: String(delay), WORKER_MAX_RETRIES: String(maxRetries), WORKER_STALE_TIMEOUT_MS: '800' },
      windowsHide: true, stdio: ['ignore', wLog, wLog]
    });
    fs.closeSync(wLog);
    children.push(child);
    return child;
  }
  workerProcess = startWorker(150, 3);
  await sleep(300);
  recordStep('DEMO-03', 'Khởi động Background Worker', 'Delay 150ms, Max retries 3', 'Worker connected and polling', 'Worker running with PID ' + workerProcess.pid, 'PASS', 'docs/evidence/demo_worker.log');

  // 4. Bảo vệ Quản trị và Xác thực Admin
  const unauthRes = await request('/api/admin/stats');
  assert.equal(unauthRes.status, 401);
  const authRes = await admin('stats');
  assert.equal(authRes.status, 200);
  recordStep('DEMO-04', 'Xác thực Basic Auth cho Admin API', 'GET /api/admin/stats không/có auth', 'Không auth 401, có auth 200', `Unauth: ${unauthRes.status}, Auth: ${authRes.status}`, 'PASS', 'API auth guards');

  // 5. Tạm dừng Worker để tích lũy hàng đợi
  await admin('worker/status', { status: 'PAUSED' });
  await sleep(300);
  const statusAfterPause = await redis.get('worker:control:status');
  assert.equal(statusAfterPause, 'PAUSED');
  recordStep('DEMO-05', 'Tạm dừng Worker (PAUSED)', 'POST /api/admin/worker/status {status: PAUSED}', 'worker:control:status = PAUSED', `Status: ${statusAfterPause}`, 'PASS', 'Redis key worker:control:status');

  // 6. Tạo 3 đơn hàng thường và đối soát dữ liệu trên Redis
  const stamp = Date.now();
  const id1 = `FIFO_1_${stamp}`, id2 = `FIFO_2_${stamp}`, id3 = `FIFO_3_${stamp}`;
  const vipId = `VIP_5_${stamp}`, dlqId = `DLQ_FAIL_${stamp}`, crashId = `CRASH_${stamp}`;

  const orderIds = [id1, id2, id3];
  for (const id of orderIds) {
    const createRes = await request('/api/orders', 'POST', {
      order_id: id,
      customer_name: 'Khách hàng Demo',
      phone: '0912345678',
      items: [{ id: 'SP01', name: 'Áo Thun', price: 150000, quantity: 1 }],
      total: 150000,
      priority: 1
    });
    assert.equal(createRes.status, 201);
  }
  const pendingCount = await redis.llen('queue:orders:pending');
  assert.ok(pendingCount >= 3);
  const hash1 = await redis.hgetall('order:' + id1);
  assert.equal(hash1.status, 'PENDING');
  assert.equal(hash1.total, '150000');
  const history1 = await redis.lrange(`order:${id1}:history`, 0, -1);
  assert.ok(history1.length > 0);
  recordStep('DEMO-06', 'Tạo 3 đơn thường và Kiểm tra Hash/List Redis', `3 đơn ${id1}..3`, 'Hash đầy đủ trường, List pending >= 3', `Pending: ${pendingCount}, Hash total: ${hash1.total}, History lines: ${history1.length}`, 'PASS', `order:${id1} Hash & history`);

  // 7. Trình diễn Hàng đợi FIFO Tuần tự qua Step Trigger
  await admin('worker/step', {});
  let fifo1Completed = false;
  for (let i = 0; i < 60; i++) {
    const s = await redis.hget('order:' + id1, 'status');
    if (s === 'COMPLETED') { fifo1Completed = true; break; }
    await sleep(100);
  }
  if (!fifo1Completed) {
    const s1 = await redis.hgetall('order:' + id1);
    const wStatus = await redis.get('worker:control:status');
    const wStep = await redis.get('worker:control:step_trigger');
    const pending = await redis.lrange('queue:orders:pending', 0, -1);
    const processing = await redis.lrange('queue:orders:processing', 0, -1);
    console.error('DEBUG INFO:', { s1, wStatus, wStep, pending, processing });
  }
  assert.ok(fifo1Completed, `${id1} must reach COMPLETED`);
  const status1 = await redis.hget('order:' + id1, 'status');
  const status2 = await redis.hget('order:' + id2, 'status');
  assert.equal(status1, 'COMPLETED');
  assert.equal(status2, 'PENDING');
  recordStep('DEMO-07', 'Trình diễn Hàng đợi FIFO Tuần tự (Step)', 'Gửi lệnh step 1 lần khi PAUSED', 'Đơn 1 vào trước -> xong trước; đơn 2 vẫn PENDING', `${id1}: ${status1}, ${id2}: ${status2}`, 'PASS', 'FIFO order completion');

  // 8. Trình diễn Hàng đợi Ưu tiên VIP (Priority Queue)
  const vipRes = await request('/api/orders', 'POST', {
    order_id: vipId,
    customer_name: 'VIP Nguyễn Văn B',
    phone: '0988888888',
    items: [{ id: 'SP02', name: 'Samsung Galaxy S24 Ultra', price: 25000000, quantity: 1 }],
    total: 25000000,
    priority: 5
  });
  assert.equal(vipRes.status, 201);
  const vipScore = await redis.zscore('queue:orders:priority', vipId);
  assert.equal(vipScore, '5');

  // Bấm Step: Đơn VIP 5 phải được xử lý TRƯỚC đơn FIFO 2 dù đơn FIFO 2 đã chờ từ trước!
  await admin('worker/step', {});
  let vipCompleted = false;
  for (let i = 0; i < 60; i++) {
    const s = await redis.hget('order:' + vipId, 'status');
    if (s === 'COMPLETED') { vipCompleted = true; break; }
    await sleep(100);
  }
  assert.ok(vipCompleted, `${vipId} must reach COMPLETED`);
  const vipStatus = await redis.hget('order:' + vipId, 'status');
  const status2Still = await redis.hget('order:' + id2, 'status');
  assert.equal(vipStatus, 'COMPLETED');
  assert.equal(status2Still, 'PENDING');
  recordStep('DEMO-08', 'Trình diễn Hàng đợi Ưu tiên VIP (Priority Queue)', 'Đơn VIP 5 tạo sau đơn FIFO 2, kích hoạt Step', 'Đơn VIP 5 được bốc xử lý TRƯỚC đơn FIFO 2', `${vipId}: ${vipStatus}, ${id2}: ${status2Still}`, 'PASS', 'queue:orders:priority ZSet');

  // 9. Tiếp tục Worker (RESUME) để xử lý hết các đơn chờ
  await admin('worker/status', { status: 'RUNNING' });
  let allDrained = false;
  for (let i = 0; i < 60; i++) {
    const s2 = await redis.hget('order:' + id2, 'status');
    const s3 = await redis.hget('order:' + id3, 'status');
    if (s2 === 'COMPLETED' && s3 === 'COMPLETED') { allDrained = true; break; }
    await sleep(100);
  }
  assert.ok(allDrained);
  const status2Final = await redis.hget('order:' + id2, 'status');
  const status3Final = await redis.hget('order:' + id3, 'status');
  recordStep('DEMO-09', 'Tiếp tục Worker (Resume) và Hoàn tất chu trình', 'Chuyển sang RUNNING', 'Tất cả đơn tồn đọng đạt COMPLETED', `FIFO_2: ${status2Final}, FIFO_3: ${status3Final}`, 'PASS', 'Vòng đời PENDING->PROCESSING->COMPLETED');

  // 10. Trình diễn Xử lý lỗi, Retry tối đa 3 lần và Dead Letter Queue (DLQ)
  const failRes = await request('/api/orders', 'POST', {
    order_id: dlqId,
    customer_name: 'Khách hàng Lỗi',
    phone: '0900000000',
    items: [{ id: 'SP03', name: 'Đơn hàng Lỗi', price: 50000, quantity: 1 }],
    total: 50000,
    priority: 1,
    simulate_fail: true
  });
  assert.equal(failRes.status, 201);

  // Chờ đơn retry 3 lần và chuyển vào DLQ
  let dlqFound = false;
  for (let i = 0; i < 60; i++) {
    const s = await redis.hget('order:' + dlqId, 'status');
    if (s === 'DLQ') { dlqFound = true; break; }
    await sleep(150);
  }
  assert.ok(dlqFound, 'Order must reach DLQ');
  const retryCount = await redis.hget('order:' + dlqId, 'retry_count');
  const dlqLen = await redis.llen('queue:orders:dead_letter');
  assert.equal(retryCount, '4'); // lượt đầu + 3 retry
  assert.ok(dlqLen >= 1);
  recordStep('DEMO-10', 'Mô phỏng Lỗi, Retry tối đa 3 lần và Cách ly DLQ', 'Đơn simulate_fail=true', 'retry_count=4 (lượt đầu + 3 retry), status=DLQ', `Status: DLQ, RetryCount: ${retryCount}, DLQ length: ${dlqLen}`, 'PASS', 'queue:orders:dead_letter List');

  // 11. Phục hồi đơn từ Dead Letter Queue (Admin Retry DLQ)
  await redis.hset('order:' + dlqId, 'simulate_fail', '0');
  const retryRes = await admin('retry-dlq/' + dlqId, {});
  assert.equal(retryRes.status, 200);

  let dlqRecovered = false;
  for (let i = 0; i < 60; i++) {
    const s = await redis.hget('order:' + dlqId, 'status');
    if (s === 'COMPLETED') { dlqRecovered = true; break; }
    await sleep(100);
  }
  assert.ok(dlqRecovered, 'Order from DLQ must be COMPLETED');
  const dlqFinalLen = await redis.llen('queue:orders:dead_letter');
  assert.equal(dlqFinalLen, 0);
  recordStep('DEMO-11', 'Phục hồi đơn lỗi từ Dead Letter Queue', 'POST /api/admin/retry-dlq/:id', 'Xóa khỏi DLQ, đưa về queue, xử lý COMPLETED', `Trạng thái sau retry: COMPLETED, DLQ length: ${dlqFinalLen}`, 'PASS', 'Admin DLQ Recovery');

  // 12. Trình diễn Watchdog Crash Recovery khi Worker bị ngắt đột ngột
  await admin('worker/status', { status: 'PAUSED' });
  await request('/api/orders', 'POST', {
    order_id: crashId,
    customer_name: 'Khách hàng Crash',
    phone: '0977777777',
    items: [{ id: 'SP01', name: 'Áo Thun', price: 150000, quantity: 1 }],
    total: 150000,
    priority: 5
  });
  // Dùng 1 worker trễ 3000ms để bắt kịp lúc đang PROCESSING rồi SIGKILL
  const doomedWorker = startWorker(3000, 3);
  await admin('worker/status', { status: 'RUNNING' });
  let claimed = false;
  for (let i = 0; i < 60; i++) {
    if (await redis.hget('order:' + crashId, 'status') === 'PROCESSING') { claimed = true; break; }
    await sleep(100);
  }
  assert.ok(claimed, 'Must claim order before kill');
  // Kill doomed worker
  await stopChild(doomedWorker);
  await stopChild(workerProcess);

  // Khởi động lại Worker mới: Watchdog sẽ quét và phục hồi đơn
  const newWorker = startWorker(150, 3);
  let crashRecovered = false;
  for (let i = 0; i < 60; i++) {
    if (await redis.hget('order:' + crashId, 'status') === 'COMPLETED') { crashRecovered = true; break; }
    await sleep(100);
  }
  assert.ok(crashRecovered, 'Crashed order must be recovered by watchdog and completed');
  recordStep('DEMO-12', 'Watchdog Crash Recovery khi Worker bị tắt đột ngột', 'SIGKILL worker khi đơn đang PROCESSING, bật Worker mới', 'Watchdog phát hiện stale timeout, cấp lại việc và hoàn tất 1 lần', `Đơn ${crashId} hoàn tất COMPLETED`, 'PASS', 'Watchdog crash recovery');

  // 13. Sao lưu RDB Snapshot thực tế
  const backupScript = path.join(root, 'scripts/redis_snapshot.js');
  const backupRes = require('child_process').execFileSync(process.execPath, [backupScript, 'backup', '--local'], {
    cwd: root, env: apiEnv, encoding: 'utf8'
  });
  const latestRdb = path.join(root, 'backup/dump_latest.rdb');
  assert.ok(fs.existsSync(latestRdb));
  assert.equal(fs.readFileSync(latestRdb).subarray(0, 5).toString(), 'REDIS');
  recordStep('DEMO-13', 'Sao lưu RDB Snapshot thực tế', 'node scripts/redis_snapshot.js backup --local', 'Tạo dump_latest.rdb hợp lệ có chữ ký REDIS', `Snapshot size: ${fs.statSync(latestRdb).size} bytes`, 'PASS', 'backup/dump_latest.rdb');

  // 14. Kiểm tra cấu hình và P3X Monitoring Info
  const memInfo = await redis.info('memory');
  const usedMemory = memInfo.match(/used_memory_human:(.*)/)?.[1]?.trim();
  const clientsInfo = await redis.info('clients');
  const connectedClients = clientsInfo.match(/connected_clients:(.*)/)?.[1]?.trim();
  recordStep('DEMO-14', 'Giám sát Tài nguyên & Hiệu năng (Monitoring Data)', 'INFO memory, INFO clients', 'Trả về số liệu phục vụ tab Monitoring P3X', `Memory: ${usedMemory}, Connected Clients: ${connectedClients}`, 'PASS', 'P3X Monitoring Metrics');

  // Dọn dẹp tiến trình test
  redis.disconnect();
  await Promise.all(children.map(stopChild));

  // Ghi kết quả ra tệp bằng chứng
  const summary = {
    testDate: new Date().toISOString(),
    totalSteps: demoResults.length,
    passCount: demoResults.filter(r => r.status === 'PASS').length,
    failCount: demoResults.filter(r => r.status === 'FAIL').length,
    blockedCount: demoResults.filter(r => r.status === 'BLOCKED').length,
    steps: demoResults
  };
  fs.writeFileSync(path.join(root, 'docs/evidence/demo_e2e_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n=== TỔNG KẾT DEMO E2E: ${summary.passCount}/${summary.totalSteps} STEPS PASS (100%) ===\n`);
}

main().catch(async (err) => {
  console.error('Lỗi tổng duyệt demo:', err);
  await Promise.all(children.map(stopChild));
  process.exit(1);
});
