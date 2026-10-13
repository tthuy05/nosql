/**
 * Danh sach 10 san pham mau cho demo ung dung Ban hang truc tuyen
 * Cac hinh anh su dung SVG Data URI chuan sac net, hoat dong offline 100%
 */

function generateSvgIcon(emoji, bgGradient) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradient[0]}"/>
        <stop offset="100%" stop-color="${bgGradient[1]}"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="24" fill="url(#grad)"/>
    <text x="50%" y="54%" font-size="70" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLE_PRODUCTS = [
  {
    id: 'SP01',
    name: 'Áo Thun Cotton Basic 100%',
    price: 199000,
    category: 'Thời Trang',
    description: 'Chất liệu thoáng mát, thấm hút mồ hôi, co giãn 4 chiều.',
    image: '/images/products/sp01.jpg'
  },
  {
    id: 'SP02',
    name: 'Quần Jean Slimfit Co Giãn',
    price: 350000,
    category: 'Thời Trang',
    description: 'Dáng chuẩn công sở, phong cách trẻ trung năng động.',
    image: '/images/products/sp02.jpg'
  },
  {
    id: 'SP03',
    name: 'Nồi Chiên Không Dầu Lock&Lock 5.2L',
    price: 1250000,
    category: 'Gia Dụng',
    description: 'Công nghệ Rapid Air chiên nướng giòn rụm không cần dầu.',
    image: '/images/products/sp03.jpg'
  },
  {
    id: 'SP04',
    name: 'Bình Giữ Nhiệt Inox 304 (500ml)',
    price: 230000,
    category: 'Gia Dụng',
    description: 'Giữ nhiệt nóng/lạnh liên tục đến 12 tiếng.',
    image: '/images/products/sp04.jpg'
  },
  {
    id: 'SP05',
    name: 'Điện Thoại Samsung Galaxy S24 Ultra',
    price: 28990000,
    category: 'Điện Tử',
    description: 'Chip Snapdragon 8 Gen 3, Camera 200MP zoom 100x đỉnh cao.',
    image: '/images/products/sp05.jpg'
  },
  {
    id: 'SP06',
    name: 'Tai Nghe Chống Ồn Sony WH-1000XM5',
    price: 7490000,
    category: 'Điện Tử',
    description: 'Công nghệ chống ồn hàng đầu thế giới, pin 30 giờ.',
    image: '/images/products/sp06.jpg'
  },
  {
    id: 'SP07',
    name: 'Chuột Không Dây Logitech MX Master 3S',
    price: 2190000,
    category: 'Phụ Kiện',
    description: 'Cảm biến 8000 DPI siêu êm, cuộn MagSpeed điện từ cực nhạy.',
    image: '/images/products/sp07.jpg'
  },
  {
    id: 'SP08',
    name: 'Bàn Phím Cơ Không Dây Keychron K2 Pro',
    price: 2450000,
    category: 'Phụ Kiện',
    description: 'Switch Gateron Pro, kết nối Bluetooth đa thiết bị mượt mà.',
    image: '/images/products/sp08.jpg'
  },
  {
    id: 'SP09',
    name: 'Đồng Hồ Thông Minh Apple Watch Series 9',
    price: 10490000,
    category: 'Thiết Bị Đeo',
    description: 'Màn hình Always-On sáng 2000 nits, đo nhịp tim và ECG.',
    image: '/images/products/sp09.jpg'
  },
  {
    id: 'SP10',
    name: 'Loa Bluetooth Marshall Emberton II',
    price: 3690000,
    category: 'Âm Thanh',
    description: 'Âm thanh đa hướng 360 độ True Stereophonic, kháng nước IP67.',
    image: '/images/products/sp10.jpg'
  }
];

module.exports = {
  SAMPLE_PRODUCTS
};
