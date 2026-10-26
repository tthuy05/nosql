const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFileSync, spawn } = require('child_process');
const { once } = require('events');
const Redis = require('ioredis');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
const mode = process.argv[2];
const latest = path.join(root, 'backup/dump_latest.rdb');
const cliEnv = { ...process.env };
if (process.env.REDIS_PASSWORD) cliEnv.REDISCLI_AUTH = process.env.REDIS_PASSWORD;
else delete cliEnv.REDISCLI_AUTH;
const run = (exe, args) => execFileSync(exe, args, { cwd: root, encoding: 'utf8', windowsHide: true,
  env: cliEnv });
const docker = (...args) => run('docker', args);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000); socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false)); socket.once('timeout', () => finish(true));
  });
}
async function main() {
  if (!['backup', 'restore'].includes(mode)) throw new Error('Usage: redis_snapshot.js backup|restore [--local] [--confirm-restore]');
  let useDocker = false;
  if (!process.argv.includes('--local')) {
    try { docker('inspect', 'nosql_redis'); useDocker = true; } catch {}
  }
  if (mode === 'backup') {
    fs.mkdirSync(path.dirname(latest), { recursive: true });
    const target = path.join(root, `backup/dump_${stamp}.rdb`);
    // --rdb waits for a consistent export; no fixed BGSAVE delay or host/volume confusion.
    if (useDocker) {
      const remote = `/tmp/nosql-backup-${stamp}.rdb`;
      docker('exec', 'nosql_redis', 'redis-cli', '--rdb', remote);
      docker('cp', `nosql_redis:${remote}`, target);
    } else {
      run(path.join(root, 'redis-bin/redis-cli.exe'), ['-h', process.env.REDIS_HOST || '127.0.0.1',
        '-p', process.env.REDIS_PORT || '6379', '--rdb', target]);
    }
    if (fs.readFileSync(target).subarray(0, 5).toString() !== 'REDIS') throw new Error('Invalid RDB');
    fs.copyFileSync(target, latest); console.log(`Snapshot saved: ${target}`); return;
  }
  if (!process.argv.includes('--confirm-restore')) throw new Error('Stop API/workers, back up first, then pass --confirm-restore to replace data.');
  if (!fs.existsSync(latest) || fs.readFileSync(latest).subarray(0, 5).toString() !== 'REDIS') throw new Error('Missing/invalid dump_latest.rdb');
  if (useDocker) {
    docker('compose', 'stop', 'backend', 'worker', 'redis');
    // Archive OLD AOF; boot RDB once with AOF disabled, then rebuild AOF before restart.
    const shell = `set -eu
mkdir /data/pre-restore-${stamp}
for f in dump.rdb appendonly.aof appendonlydir; do
  if [ -e /data/$f ]; then mv /data/$f /data/pre-restore-${stamp}/; fi
done
cp /restore.rdb /data/dump.rdb
redis-server /usr/local/etc/redis/redis.conf --bind 127.0.0.1 --dir /data --appendonly no --port 0 --unixsocket /tmp/restore.sock --daemonize yes
redis-cli -s /tmp/restore.sock CONFIG SET appendonly yes | grep -q OK
for i in $(seq 1 120); do
  info=$(redis-cli -s /tmp/restore.sock INFO persistence | tr -d '\\r')
  if echo "$info" | grep -q '^aof_rewrite_in_progress:0$' && echo "$info" | grep -q '^aof_rewrite_scheduled:0$'; then
    echo "$info" | grep -q '^aof_last_bgrewrite_status:ok$'
    redis-cli -s /tmp/restore.sock SHUTDOWN SAVE
    exit 0
  fi
  sleep 1
done
exit 1`;
    docker('compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'sh',
      '-v', `${latest}:/restore.rdb:ro`, 'redis', '-c', shell);
    docker('compose', 'start', 'redis', 'backend', 'worker');
  } else {
    if (!['127.0.0.1', 'localhost'].includes(process.env.REDIS_HOST || '127.0.0.1') ||
        Number(process.env.REDIS_PORT || 6379) !== 6379) throw new Error('Local restore supports repository Redis on 127.0.0.1:6379 only.');
    if (await listening(6379) || await listening(Number(process.env.PORT || 3000))) throw new Error('Stop Redis, API and workers first.');
    const archive = path.join(root, `backup/pre-restore-${stamp}`);
    fs.mkdirSync(archive, { recursive: true });
    for (const name of ['dump.rdb', 'appendonly.aof', 'appendonlydir']) {
      const source = path.resolve(root, name), target = path.resolve(archive, name);
      if (!source.startsWith(root + path.sep) || !target.startsWith(root + path.sep)) throw new Error('Unsafe restore path');
      if (fs.existsSync(source)) fs.renameSync(source, target);
    }
    fs.copyFileSync(latest, path.join(root, 'dump.rdb'));
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(path.join(root, 'redis-bin/redis-server.exe'), [path.join(root, 'redis/redis.conf'),
      '--dir', root, '--port', String(port), '--appendonly', 'no'], { cwd: root, windowsHide: true, stdio: 'ignore' });
    let spawnError; child.on('error', (err) => { spawnError = err; });
    const client = new Redis({ host: '127.0.0.1', port, lazyConnect: true, retryStrategy: null,
      maxRetriesPerRequest: 1, autoResendUnfulfilledCommands: false,
      password: process.env.REDIS_PASSWORD || undefined });
    client.on('error', () => {});
    try {
      for (let i = 0; i < 50 && !(await listening(port)); i++) { if (spawnError) throw spawnError; await pause(100); }
      await client.connect(); await client.config('SET', 'appendonly', 'yes');
      let complete = false;
      for (let i = 0; i < 120; i++) {
        const info = await client.info('persistence');
        if (/aof_rewrite_in_progress:0/.test(info) && /aof_rewrite_scheduled:0/.test(info)) {
          if (!/aof_last_bgrewrite_status:ok/.test(info)) throw new Error('AOF rebuild failed');
          complete = true; break;
        }
        await pause(1000);
      }
      if (!complete) throw new Error('AOF rebuild timed out');
      await client.shutdown('SAVE').catch((err) => { if (!/closed/i.test(err.message)) throw err; });
    } finally { client.disconnect(); child.kill(); }
    console.log('Local restore complete. Restart with scripts/start-local.bat.');
  }
  console.log('Previous persistence files retained in pre-restore archive.');
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
