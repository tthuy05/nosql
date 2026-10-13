/**
 * Script nạp dữ liệu chuẩn 5 đơn hàng 1001-1005 theo đúng báo cáo DOAN_NoSQL.docx
 * Chạy lệnh: npm run seed
 */

const { redisClient } = require('../src/config/redis');
const orderService = require('../src/services/orderService');

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

async function seed() {
  console.log('🌱 Đang nạp 5 đơn hàng mẫu theo tài liệu DOAN_NoSQL.docx vào Redis...');
  for (const ord of reportOrders) {
    try {
      await orderService.createOrder(ord);
      console.log(`   + Đã nạp thành công đơn [${ord.order_id}] (${ord.customer_name} - Priority: ${ord.priority})`);
    } catch (err) {
      console.log(`   * Đơn [${ord.order_id}]: ${err.message}`);
    }
  }
  console.log('✅ Hoàn tất nạp dữ liệu mẫu! Giờ bạn có thể mở P3X Redis UI để quan sát.');
  process.exit(0);
}

seed();
