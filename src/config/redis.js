const Redis = require('ioredis');
require('dotenv').config();

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableOfflineQueue: false,
  autoResendUnfulfilledCommands: false,
  connectTimeout: 3000,
  commandTimeout: 5000
};

const { registerCommands } = require('./queueScripts');
const redisClient = registerCommands(new Redis(redisConfig));

redisClient.on('connect', () => {
  console.log(`[Redis] Da ket noi thanh cong toi Redis Server tai ${redisConfig.host}:${redisConfig.port}`);
});

redisClient.on('ready', () => {
  console.log('[Redis] San sang tiep nhan truy van.');
});

redisClient.on('error', (err) => {
  console.error('[Redis ERROR] Loi ket noi Redis:', err.message);
});

// Helper tao client moi neu can ket noi rieng biet (vi du cho Worker hoac Subscriber)
function createNewRedisClient(name = 'default') {
  const client = registerCommands(new Redis(redisConfig));
  client.on('error', (err) => console.error(`[Redis ${name} ERROR]:`, err.message));
  return client;
}

module.exports = { redisClient, createNewRedisClient };
