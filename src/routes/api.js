const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const queueService = require('../services/queueService');
const { SAMPLE_PRODUCTS } = require('../data/sample_products');
const { WORKER_STATUS, PRIORITY_LEVELS } = require('../config/constants');
router.use('/admin', require('../config/adminAuth'));

// =====================================================================
// 1. APIS CHO PHAN HE KHANH HANG (CUSTOMER ENDPOINTS)
// =====================================================================

/**
 * Lay danh sach 10 san pham mau
 */
router.get('/products', (req, res) => {
  res.json({
    success: true,
    data: SAMPLE_PRODUCTS
  });
});

/**
 * Dat hang moi (Tao don Standard FIFO hoac Priority Queue)
 */
router.post('/orders', async (req, res) => {
  try {
    const orderResult = await orderService.createOrder(req.body, req.get('Idempotency-Key'));
    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công! Đơn hàng đã được đưa vào hàng đợi xử lý.',
      data: orderResult
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Tra cuu thong tin chi tiet mot don hang
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy đơn hàng với mã [${req.params.id}].`
      });
    }
    res.json({
      success: true,
      data: order
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Tra cuu tat ca don hang cua mot khach hang (Set)
 */
router.get('/customers/:id/orders', async (req, res) => {
  try {
    const orders = await orderService.getOrdersByCustomer(req.params.id);
    res.json({
      success: true,
      data: orders
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// =====================================================================
// 2. APIS CHO PHAN HE QUAN TRI (ADMIN & DEMO DASHBOARD ENDPOINTS)
// =====================================================================

/**
 * Thong ke tong quan cac hang doi va bo dem don hang
 */
router.get('/admin/stats', async (req, res) => {
  try {
    const stats = await queueService.getQueueStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Lay chi tiet cac ID nam trong cac hang doi (Pending, Priority, Processing, DLQ)
 */
router.get('/admin/queues', async (req, res) => {
  try {
    const details = await queueService.getQueueDetails();
    res.json({
      success: true,
      data: details
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Lay danh sach tat ca don hang (co ho tro filter theo status)
 */
router.get('/admin/orders', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const orders = await orderService.getAllOrders({
      status: status || undefined,
      limit: limit ? parseInt(limit, 10) : 100
    });
    res.json({
      success: true,
      data: orders
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Dieu khien Worker: Tam dung (PAUSED) hoac Tiep tuc (RUNNING)
 */
router.post('/admin/worker/status', async (req, res) => {
  try {
    const { status } = req.body;
    const result = await queueService.setWorkerStatus(status);
    res.json({
      success: true,
      message: `Đã cập nhật trạng thái Worker sang: ${status}`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Xu ly 1 don duy nhat (Step-by-step single order processing)
 */
router.post('/admin/worker/step', async (req, res) => {
  try {
    const result = await queueService.triggerSingleStep();
    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Dieu chinh toc do xu ly cua Worker (ms)
 */
router.post('/admin/worker/speed', async (req, res) => {
  try {
    const { delay_ms } = req.body;
    const result = await queueService.setWorkerDelay(delay_ms);
    res.json({
      success: true,
      message: `Đã thay đổi tốc độ xử lý Worker thành ${result.delay_ms}ms`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Chay kich ban demo tu dong (fifo, priority, dlq, concurrency)
 */
router.post('/admin/scenario/:id', async (req, res) => {
  try {
    const result = await queueService.runDemoScenario(req.params.id);
    res.json({
      success: true,
      message: `Đã khởi động kịch bản: ${result.title}`,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Thu lai don bi loi tu Dead Letter Queue
 */
router.post('/admin/retry-dlq/:id', async (req, res) => {
  try {
    const result = await queueService.retryDeadLetterOrder(req.params.id);
    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Bat/tat co gia lap loi cho don hang tiep theo de test DLQ
 */
router.post('/admin/simulate-failure', async (req, res) => {
  try {
    const { enable = true } = req.body;
    const result = await queueService.setSimulateFailure(enable);
    res.json({
      success: true,
      message: enable 
        ? 'Đã kích hoạt cờ giả lập lỗi: Đơn hàng tiếp theo sẽ bị lỗi xử lý để test Retry/DLQ!'
        : 'Đã hủy cờ giả lập lỗi.',
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Tao hang loat don hang mau (10, 50, 100 don) de kiem thu tai va quan sat hang doi
 */
router.post('/admin/batch-generate', async (req, res) => {
  try {
    const { count = 10, priority_ratio = 0.3 } = req.body;
    const totalCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 200);

    const customers = [
      { id: 'CUST_01', name: 'Nguyễn Văn A', phone: '0901234567' },
      { id: 'CUST_02', name: 'Trần Thị Mai', phone: '0912345678' },
      { id: 'CUST_03', name: 'Lê Hoàng Nam', phone: '0988776655' },
      { id: 'CUST_04', name: 'Phạm Minh Đức', phone: '0977112233' },
      { id: 'CUST_05', name: 'Hoàng Kim Ngân', phone: '0933445566' }
    ];

    const methods = ['COD', 'MOMO', 'VNPAY', 'BANK_TRANSFER'];
    const createdOrders = [];

    for (let i = 1; i <= totalCount; i++) {
      const cust = customers[Math.floor(Math.random() * customers.length)];
      const prod = SAMPLE_PRODUCTS[Math.floor(Math.random() * SAMPLE_PRODUCTS.length)];
      const isVip = Math.random() < priority_ratio;
      const priority = isVip ? (Math.random() > 0.5 ? 5 : 3) : 1;
      const payMethod = methods[Math.floor(Math.random() * methods.length)];

      const orderData = {
        customer_id: cust.id,
        customer_name: cust.name,
        phone: cust.phone,
        address: 'Quận Tân Phú, TP. Hồ Chí Minh',
        items: [{ id: prod.id, name: prod.name, price: prod.price, quantity: 1 }],
        total: prod.price,
        payment_method: payMethod,
        priority: priority
      };

      const order = await orderService.createOrder(orderData);
      createdOrders.push(order.order_id);
    }

    res.json({
      success: true,
      message: `Đã tạo thành công ${totalCount} đơn hàng mẫu vào hệ thống!`,
      data: {
        total_created: totalCount,
        sample_ids: createdOrders.slice(0, 5)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Khoi tao dung 5 don mau 1001..1005 theo bao cao DOAN_NoSQL.docx
 */
router.post('/admin/seed-report-data', async (req, res) => {
  try {
    const reportOrders = [
      {
        order_id: '1001',
        customer_id: 'CUST_01',
        customer_name: 'Nguyen Van A',
        phone: '0901234567',
        address: 'Tp. Ho Chi Minh',
        items: 'Ao thun cotton, Quan jean',
        total: 450000,
        payment_method: 'COD',
        priority: 1
      },
      {
        order_id: '1002',
        customer_id: 'CUST_02',
        customer_name: 'Tran Thi Mai',
        phone: '0912345678',
        address: 'Tp. Ho Chi Minh',
        items: 'Noi chien khong dau Lock and Lock',
        total: 1200000,
        payment_method: 'VNPAY',
        priority: 3
      },
      {
        order_id: '1003',
        customer_id: 'CUST_01',
        customer_name: 'Nguyen Van A',
        phone: '0901234567',
        address: 'Tp. Ho Chi Minh',
        items: 'Binh giu nhiet Lock and Lock 500ml',
        total: 230000,
        payment_method: 'MOMO',
        priority: 1
      },
      {
        order_id: '1004',
        customer_id: 'CUST_03',
        customer_name: 'Le Hoang Nam',
        phone: '0988776655',
        address: 'Tp. Ho Chi Minh',
        items: 'Dien thoai Samsung Galaxy S24 Ultra',
        total: 3500000,
        payment_method: 'BANK TRANSFER',
        priority: 5
      },
      {
        order_id: '1005',
        customer_id: 'CUST_04',
        customer_name: 'Pham Minh Duc',
        phone: '0977112233',
        address: 'Tp. Ho Chi Minh',
        items: 'Tai nghe Sony WH 1000XM5',
        total: 2890000,
        payment_method: 'ZALOPAY',
        priority: 4
      }
    ];

    const results = [];
    for (const ord of reportOrders) {
      const resOrd = await orderService.createOrder(ord);
      results.push(resOrd);
    }

    res.json({
      success: true,
      message: 'Đã nạp chính xác 5 đơn hàng 1001, 1002, 1003, 1004, 1005 theo tài liệu DOAN_NoSQL.docx vào Redis!',
      data: results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * Xoa sach toan bo du lieu demo de bat dau lai
 */
router.post('/admin/reset', (req, res) => {
  return res.status(403).json({ success: false, message: 'Reset bi khoa de bao ve du lieu; su dung Redis test rieng.' });
});

module.exports = router;
