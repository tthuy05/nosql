const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { once } = require('events');
const assert = require('assert/strict');
const Redis = require('ioredis');
const root = path.resolve(__dirname, '..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nosql restore with spaces '));
const evidence = process.env.EVIDENCE_DIR || path.join(root, 'docs/evidence', 'snapshot-' + Date.now());
fs.mkdirSync(evidence, { recursive: true });
const children = [];
const results = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() { const s = net.createServer().listen(0, '127.0.0.1'); await once(s, 'listening'); const n = s.address().port; await new Promise((r) => s.close(r)); return n; }
async function stop(child) { if (child.exitCode !== null || child.signalCode !== null) return; const exit = once(child, 'exit'); child.kill(); await exit; }
async function main() {
  assert.equal(process.platform, 'win32', 'Snapshot sandbox currently targets repository Windows binaries');
  for (const dir of ['scripts', 'redis-bin', 'redis']) fs.mkdirSync(path.join(sandbox, dir));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'junction');
  for (const name of ['redis-server.exe', 'redis-cli.exe']) fs.copyFileSync(path.join(root, 'redis-bin', name), path.join(sandbox, 'redis-bin', name));
  fs.copyFileSync(path.join(root, 'scripts/redis_snapshot.js'), path.join(sandbox, 'scripts/redis_snapshot.js'));
  fs.copyFileSync(path.join(root, 'redis/redis.conf'), path.join(sandbox, 'redis/redis.conf'));
  const port = await freePort(), apiPort = await freePort();
  fs.writeFileSync(path.join(sandbox, '.env'), 'REDIS_HOST=127.0.0.1\nREDIS_PORT=' + port + '\nPORT=' + apiPort + '\nREDIS_PASSWORD=\n');
  const env = { ...process.env, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(port), REDIS_PASSWORD: '', PORT: String(apiPort) };
  async function start() {
    const fd = fs.openSync(path.join(evidence, 'snapshot-redis.log'), 'a');
    const child = spawn(path.join(sandbox, 'redis-bin/redis-server.exe'), [path.join(sandbox, 'redis/redis.conf'), '--port', String(port)], { cwd: sandbox, windowsHide: true, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd); children.push(child);
    const client = new Redis({ host: '127.0.0.1', port, maxRetriesPerRequest: 1, retryStrategy: () => 100 });
    client.on('error', () => {});
    for (let i = 0; client.status !== 'ready' && i < 100; i++) await pause(50);
    assert.equal(client.status, 'ready');
    assert.match(await client.info('server'), new RegExp('process_id:' + child.pid + '\\r?\\n'));
    return { child, client };
  }
  function command(mode, ...args) {
    return execFileSync(process.execPath, [path.join(sandbox, 'scripts/redis_snapshot.js'), mode, '--local', ...args],
      { cwd: sandbox, env, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  }
  let db = await start();
  try {
    await db.client.set('snapshot:value', 'wanted-snapshot');
    await db.client.hset('snapshot:hash', 'status', 'PENDING');
    await db.client.lpush('snapshot:list', 'order-1');
    await db.client.zadd('snapshot:priority', 5, 'order-vip');
    await db.client.sadd('snapshot:set', 'customer-1');
    const backupOutput = command('backup');
    fs.writeFileSync(path.join(evidence, 'backup-command.log'), backupOutput);
    const rdb = path.join(sandbox, 'backup/dump_latest.rdb');
    assert.equal(fs.readFileSync(rdb).subarray(0, 5).toString(), 'REDIS');
    results.push({ id: 'BACKUP-01', input: 'Isolated Redis on configured random port; 5 Redis types; Windows path with spaces',
      expected: 'Snapshot exported by actual backup command with RDB signature', actual: { bytes: fs.statSync(rdb).size, output: backupOutput.trim() }, status: 'PASS' });
    assert.throws(() => command('restore'), /confirm-restore/);
    assert.throws(() => command('restore', '--confirm-restore'), /Stop Redis/);
    assert.equal(await db.client.get('snapshot:value'), 'wanted-snapshot');
    results.push({ id: 'RESTORE-GUARD', input: 'Restore without confirmation, and confirmed while test Redis is running',
      expected: 'Both rejected before any data replacement', actual: 'Both rejected; live data unchanged', status: 'PASS' });
    await db.client.set('snapshot:value', 'OLD-AOF-MUST-NOT-WIN');
    await db.client.set('snapshot:after-backup', 'must-disappear-on-restore');
    db.client.disconnect(); await stop(db.child);
    const restoreOutput = command('restore', '--confirm-restore');
    fs.writeFileSync(path.join(evidence, 'restore-command.log'), restoreOutput);
    db = await start();
    assert.equal(await db.client.get('snapshot:value'), 'wanted-snapshot');
    assert.equal(await db.client.exists('snapshot:after-backup'), 0);
    assert.equal(await db.client.hget('snapshot:hash', 'status'), 'PENDING');
    assert.deepEqual(await db.client.lrange('snapshot:list', 0, -1), ['order-1']);
    assert.equal(await db.client.zscore('snapshot:priority', 'order-vip'), '5');
    assert.deepEqual(await db.client.smembers('snapshot:set'), ['customer-1']);
    const archive = fs.readdirSync(path.join(sandbox, 'backup')).find((name) => name.startsWith('pre-restore-'));
    assert.ok(archive); assert.ok(fs.existsSync(path.join(sandbox, 'backup', archive, 'appendonly.aof')));
    db.client.disconnect(); await stop(db.child);
    db = await start(); assert.equal(await db.client.get('snapshot:value'), 'wanted-snapshot');
    results.push({ id: 'RESTORE-01', input: 'Offline restore after changing AOF beyond the snapshot; restart twice with appendonly=yes',
      expected: 'All 5 Redis types restored from snapshot; old AOF archived; later key absent after both restarts',
      actual: { value: 'wanted-snapshot', types: ['string', 'hash', 'list', 'zset', 'set'], secondRestart: true, archive, output: restoreOutput.trim() }, status: 'PASS' });
  } finally { db.client.disconnect(); await Promise.all(children.map(stop)); }
}
main().catch((err) => { results.push({ id: 'SNAPSHOT-ERROR', status: 'FAIL', actual: err.stack, input: 'Snapshot sandbox', expected: 'All commands succeed' }); process.exitCode = 1; })
  .finally(async () => { await Promise.all(children.map(stop)); fs.writeFileSync(path.join(evidence, 'snapshot-results.json'), JSON.stringify({ sandbox, results }, null, 2)); console.log(JSON.stringify({ evidence, sandbox, results }, null, 2)); });

