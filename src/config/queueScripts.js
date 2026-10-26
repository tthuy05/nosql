// Lua is atomic, but runtime errors do not roll back earlier writes. Check key
// types before mutating queues (P3X can change keys directly).
const GUARDS = `
local function expect(key, kind)
  local actual = redis.call('TYPE', key).ok
  if actual ~= 'none' and actual ~= kind then error('WRONGTYPE ' .. key) end
end
local function orderkeys(id)
  local key = 'order:' .. id
  expect(key, 'hash'); expect(key .. ':history', 'list')
  return key
end
`;

const CLAIM = GUARDS + `
expect(KEYS[1], 'zset'); expect(KEYS[2], 'list')
expect(KEYS[3], 'list'); expect(KEYS[4], 'hash')
expect(KEYS[5], 'string'); expect(KEYS[6], 'string'); expect(KEYS[7], 'list')
local paused = redis.call('GET', KEYS[5]) == 'PAUSED'
if paused and redis.call('GET', KEYS[6]) ~= '1' then return nil end
-- Bound work per call when old data contains duplicate/stale queue entries.
for i = 1, 100 do
  local top = redis.call('ZREVRANGE', KEYS[1], 0, 0)
  local priority = #top > 0
  local id = priority and top[1] or redis.call('LINDEX', KEYS[2], -1)
  if not id then return nil end
  local key = orderkeys(id)
  local status = redis.call('HGET', key, 'status')
  local missing = not redis.call('HGET', key, 'order_id')
  if priority then redis.call('ZREM', KEYS[1], id)
  else redis.call('RPOP', KEYS[2]) end
  if status == 'PENDING' and not missing then
    redis.call('LREM', KEYS[3], 0, id)
    redis.call('LPUSH', KEYS[3], id)
    redis.call('HSET', KEYS[4], id, ARGV[1])
    redis.call('HSET', key, 'status', 'PROCESSING', 'processing_started_at', ARGV[1],
      'processing_token', ARGV[3], 'updated_at', ARGV[2])
    redis.call('RPUSH', key .. ':history', '[' .. ARGV[2] .. '] Bat dau xu ly.')
    redis.call('DEL', KEYS[6])
    return id
  elseif missing then
    redis.call('HSET', key, 'order_id', id, 'status', 'DLQ', 'data_missing', '1', 'error_reason', 'Missing order Hash')
    redis.call('LPUSH', KEYS[7], id)
  end
end
return nil
`;

// Keys: processing, pending, priority, dlq, meta. Args: id, token, ms,
// ISO, maxRetries, action (complete/fail/recover/retry), reason, tracking.
const TRANSITION = GUARDS + `
expect(KEYS[1], 'list'); expect(KEYS[2], 'list'); expect(KEYS[3], 'zset')
expect(KEYS[4], 'list'); expect(KEYS[5], 'hash')
local id, action = ARGV[1], ARGV[6]
local key = orderkeys(id)
local status = redis.call('HGET', key, 'status')
if action == 'retry' then
  if status ~= 'DLQ' then return 0 end
  if redis.call('HGET', key, 'data_missing') == '1' then return 0 end
  if redis.call('LREM', KEYS[4], 0, id) == 0 then return 0 end
  redis.call('HSET', key, 'retry_count', 0)
else
  if action == 'recover' then
    -- Ignore a snapshot entry already removed by another watchdog/worker.
    local found = false
    for _, value in ipairs(redis.call('LRANGE', KEYS[1], 0, -1)) do
      if value == id then found = true; break end
    end
    if not found then return 0 end
    local started = tonumber(redis.call('HGET', KEYS[5], id))
    if not started then
      -- Legacy ISO/missing metadata gets one timeout of grace, then recovery.
      redis.call('HSET', KEYS[5], id, ARGV[3])
      return 0
    end
    if tonumber(ARGV[3]) - started <= tonumber(ARGV[2]) then return 0 end
    if status == 'COMPLETED' or status == 'DLQ' then
      redis.call('LREM', KEYS[1], 0, id); redis.call('HDEL', KEYS[5], id)
      redis.call('HDEL', key, 'processing_token', 'processing_started_at')
      return 0
    end
  elseif status ~= 'PROCESSING' or redis.call('HGET', key, 'processing_token') ~= ARGV[2] then
    return 0
  end
  redis.call('LREM', KEYS[1], 0, id)
end
redis.call('HDEL', KEYS[5], id)
redis.call('HDEL', key, 'processing_token', 'processing_started_at')
if action == 'complete' then
  redis.call('HSET', key, 'status', 'COMPLETED', 'finished_at', ARGV[4],
    'updated_at', ARGV[4], 'tracking_code', ARGV[8], 'error_reason', '')
else
  local retries = tonumber(redis.call('HGET', key, 'retry_count')) or 0
  if retries ~= retries or retries < 0 or retries > 9007199254740990 or retries ~= math.floor(retries) then retries = 0 end
  if action ~= 'retry' then retries = retries + 1 end
  local priority = tonumber(redis.call('HGET', key, 'priority')) or 1
  if priority ~= priority or priority < 1 or priority > 5 or priority ~= math.floor(priority) then priority = 1 end
  local nextStatus = 'PENDING'
  if retries > tonumber(ARGV[5]) or not redis.call('HGET', key, 'order_id') then
    nextStatus = 'DLQ'; redis.call('LPUSH', KEYS[4], id)
    if not redis.call('HGET', key, 'order_id') then redis.call('HSET', key, 'data_missing', '1') end
    redis.call('HSET', key, 'order_id', id)
  elseif priority > 1 then redis.call('ZADD', KEYS[3], priority, id)
  else redis.call('LPUSH', KEYS[2], id) end
  redis.call('HSET', key, 'status', nextStatus, 'retry_count', retries,
    'updated_at', ARGV[4], 'error_reason', ARGV[7])
end
redis.call('RPUSH', key .. ':history', '[' .. ARGV[4] .. '] ' .. action .. ': ' .. ARGV[7])
return 1
`;

const RENEW = `
if redis.call('HGET', KEYS[1], 'status') == 'PROCESSING' and
   redis.call('HGET', KEYS[1], 'processing_token') == ARGV[2] then
  redis.call('HSET', KEYS[2], ARGV[1], ARGV[3]); return 1
end
return 0
`;

const CREATE = GUARDS + `
expect(KEYS[1], 'hash'); expect(KEYS[2], 'set'); expect(KEYS[3], 'string')
expect(KEYS[4], 'set'); expect(KEYS[5], 'list'); expect(KEYS[6], 'list')
expect(KEYS[7], 'zset'); expect(KEYS[8], 'string'); expect(KEYS[9], 'string')
local old = redis.call('GET', KEYS[8])
if old then
  local saved = cjson.decode(old)
  if saved.fingerprint ~= ARGV[3] then return {'CONFLICT'} end
  return {'REPLAY', saved.response}
end
if redis.call('EXISTS', KEYS[1]) == 1 then return {'EXISTS'} end
local count = redis.call('GET', KEYS[3])
if count and ((count ~= '0' and not string.match(count, '^[1-9]%d*$')) or tonumber(count) >= 9007199254740991) then
  return redis.error_reply('Invalid daily counter')
end
local payload = cjson.decode(ARGV[1])
for field, value in pairs(payload) do redis.call('HSET', KEYS[1], field, value) end
redis.call('SADD', KEYS[2], payload.order_id)
redis.call('INCR', KEYS[3]); redis.call('SADD', KEYS[4], payload.order_id)
redis.call('RPUSH', KEYS[5], '[' .. payload.created_at .. '] Tiep nhan don hang.')
if tonumber(payload.priority) > 1 then
  redis.call('ZADD', KEYS[7], payload.priority, payload.order_id)
else redis.call('LPUSH', KEYS[6], payload.order_id) end
redis.call('SET', KEYS[8], cjson.encode({fingerprint=ARGV[3], response=ARGV[2]}), 'EX', 86400)
redis.call('SET', KEYS[9], 'LOCKED', 'EX', 60)
return {'CREATED', ARGV[2]}
`;

function registerCommands(client) {
  for (const [name, numberOfKeys, lua] of [
    ['claimOrder', 7, CLAIM], ['transitionOrder', 5, TRANSITION],
    ['renewOrder', 2, RENEW], ['createOrderAtomic', 9, CREATE]
  ]) client.defineCommand(name, { numberOfKeys, lua });
  return client;
}

module.exports = { registerCommands };
