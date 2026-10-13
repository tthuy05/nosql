/**
 * Danh muc cac hang so, ten khoa Redis va trang thai he thong
 * Tuan thu chuan namespace: entity:identifier:sub_attribute
 */

const KEYS = {
  // Hash luu thong tin don hang: order:{id}
  ORDER_HASH: (id) => `order:${id}`,

  // Hang doi cho xu ly FIFO (List)
  QUEUE_PENDING: 'queue:orders:pending',

  // Hang doi uu tien (Sorted Set)
  QUEUE_PRIORITY: 'queue:orders:priority',

  // Hang doi dang xu ly (List)
  QUEUE_PROCESSING: 'queue:orders:processing',

  // Hang doi thu chet / don loi (List)
  QUEUE_DEAD_LETTER: 'queue:orders:dead_letter',

  // Tap hop don hang cua khach hang (Set): customer:{id}:orders
  CUSTOMER_ORDERS: (customerId) => `customer:${customerId}:orders`,

  // Khoa tam thoi chong trung / giu cho (String co TTL): checkout:lock:{id}
  CHECKOUT_LOCK: (id) => `checkout:lock:${id}`,

  // Bo dem so don theo ngay (String Counter): stats:orders:count:{YYYYMMDD}
  STATS_COUNT: (dateStr) => `stats:orders:count:${dateStr}`,

  // Nhat ky lich su xu ly cua don hang (List): order:{id}:history
  ORDER_HISTORY: (id) => `order:${id}:history`,

  // Dieu khien Worker: worker:control:status ('RUNNING' hoac 'PAUSED')
  WORKER_STATUS: 'worker:control:status',

  // Che do xu ly tung buoc cho demo: worker:control:step_trigger
  WORKER_STEP_TRIGGER: 'worker:control:step_trigger',

  // Metadata thoi diem xu ly cua cac don trong processing (Hash)
  PROCESSING_META: 'queue:orders:processing:meta',

  // Toc do xu ly cua Worker (ms): worker:control:delay_ms
  WORKER_DELAY_MS: 'worker:control:delay_ms',

  // Tap hop tat ca order_id da tao trong he thong (Set de phuc vu thong ke admin)
  ALL_ORDERS_INDEX: 'orders:all:index',

  // Co che gia lap loi chu dong cho don tiep theo (String)
  SIMULATE_FAILURE_FLAG: 'demo:simulate_failure_once'
};

const ORDER_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  DLQ: 'DLQ'
};

const WORKER_STATUS = {
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED'
};

const PRIORITY_LEVELS = {
  STANDARD: 1, // Don hang tieu chuan (FIFO)
  FAST: 3,     // Giao hang nhanh (Uu tien bac trung)
  VIP: 5       // Don hang Hoa toc / Khach VIP (Uu tien cao nhat)
};

module.exports = {
  KEYS,
  ORDER_STATUS,
  WORKER_STATUS,
  PRIORITY_LEVELS
};
