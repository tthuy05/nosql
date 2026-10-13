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
  lazyConnect: false
};

const redisClient = new Redis(redisConfig);

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
  const client = new Redis(redisConfig);
  client.on('error', (err) => console.error(`[Redis ${name} ERROR]:`, err.message));
  return client;
}

// Lua Script 1: Lay don hang tu Priority Queue (ZSet) va chuyen nguyen tu sang Processing Queue (List)
// Dong thoi cap nhat trang thai Hash thanh PROCESSING de tranh mat don neu crash
const LUA_POP_PRIORITY = `
local priority_key = KEYS[1]
local processing_key = KEYS[2]
local meta_key = KEYS[3]
local current_time = ARGV[1]

-- Lay phan tu co score cao nhat (ZPOPMAX)
local items = redis.call('ZPOPMAX', priority_key, 1)
if #items > 0 then
    local order_id = items[1]
    local score = items[2]
    
    -- Dua vao dau danh sach processing
    redis.call('LPUSH', processing_key, order_id)
    
    -- Ghi timestamp bat dau xu ly vao metadata
    redis.call('HSET', meta_key, order_id, current_time)
    
    -- Cap nhat Hash don hang
    local order_key = 'order:' .. order_id
    redis.call('HSET', order_key, 'status', 'PROCESSING', 'processing_started_at', current_time)
    
    -- Ghi nhat ky lich su
    redis.call('RPUSH', order_key .. ':history', 'Bat dau xu ly don hang uu tien (Score: ' .. score .. ') luc ' .. current_time)
    
    return order_id
end

return nil
`;

// Lua Script 2: Watchdog phuc hoi cac don bi treo trong processing qua thoi gian timeout
const LUA_RECOVER_STALE = `
local processing_key = KEYS[1]
local pending_key = KEYS[2]
local dlq_key = KEYS[3]
local meta_key = KEYS[4]
local current_time = tonumber(ARGV[1])
local timeout_ms = tonumber(ARGV[2])

local processing_orders = redis.call('LRANGE', processing_key, 0, -1)
local recovered = 0
local moved_to_dlq = 0

for _, order_id in ipairs(processing_orders) do
    local started_at_str = redis.call('HGET', meta_key, order_id)
    local started_at = tonumber(started_at_str)
    
    if started_at and (current_time - started_at) > timeout_ms then
        -- Phat hien don bi treo qua thoi gian quy dinh
        redis.call('LREM', processing_key, 1, order_id)
        redis.call('HDEL', meta_key, order_id)
        
        local order_key = 'order:' .. order_id
        local retries = tonumber(redis.call('HGET', order_key, 'retry_count') or '0') + 1
        redis.call('HSET', order_key, 'retry_count', retries)
        
        if retries <= 3 then
            -- Dua ve lai pending queue de thu lai
            redis.call('LPUSH', pending_key, order_id)
            redis.call('HSET', order_key, 'status', 'PENDING', 'error_reason', 'Worker bi gian doan (Crash Recovery retry ' .. retries .. ')')
            redis.call('RPUSH', order_key .. ':history', 'Tu dong phuc hoi ve Pending do Worker bi dung dot ngot luc ' .. current_time)
            recovered = recovered + 1
        else
            -- Qua 3 lan thu lai, dua vao Dead Letter Queue
            redis.call('LPUSH', dlq_key, order_id)
            redis.call('HSET', order_key, 'status', 'DLQ', 'error_reason', 'Worker crash qua 3 lan')
            redis.call('RPUSH', order_key .. ':history', 'Chuyen vao Dead Letter Queue do thu lai qua 3 lan')
            moved_to_dlq = moved_to_dlq + 1
        end
    end
end

return {recovered, moved_to_dlq}
`;

// Dang ky cac custom command vao client
redisClient.defineCommand('popPriorityOrder', {
  numberOfKeys: 3,
  lua: LUA_POP_PRIORITY
});

redisClient.defineCommand('recoverStaleOrders', {
  numberOfKeys: 4,
  lua: LUA_RECOVER_STALE
});

/**
 * Ham chuyen don FIFO an toan:
 * Ho tro LMOVE tren Redis >= 6.2, va tu dong fallback ve RPOPLPUSH tren Redis < 6.2
 */
async function atomicMoveFifo(fromQueue, toQueue) {
  try {
    // Thu goi LMOVE RIGHT LEFT (Redis 6.2+)
    return await redisClient.lmove(fromQueue, toQueue, 'RIGHT', 'LEFT');
  } catch (err) {
    if (err.message && (err.message.includes('unknown command') || err.message.includes('ERR'))) {
      // Fallback ve RPOPLPUSH (Redis 5.0 - 6.0)
      return await redisClient.rpoplpush(fromQueue, toQueue);
    }
    throw err;
  }
}

module.exports = {
  redisClient,
  createNewRedisClient,
  atomicMoveFifo,
  LUA_POP_PRIORITY,
  LUA_RECOVER_STALE
};
