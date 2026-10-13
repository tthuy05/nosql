/**
 * Logic ung dung Khach hang: Mua sam, Gio hang, Dat don va Tra cuu trang thai don
 */

let productsList = [];
let cart = {}; // { productId: { ...product, quantity: 1 } }
let selectedPriority = 1;
let currentLookupId = null;

// Khoi tao ung dung khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  setupEventListeners();
});

// 1. Tai danh sach san pham tu API
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const json = await res.json();
    if (json.success) {
      productsList = json.data;
      renderProducts(productsList);
      document.getElementById('productCountText').innerText = `Hiển thị ${productsList.length} sản phẩm mẫu`;
    }
  } catch (err) {
    console.error('Loi tai san pham:', err);
    document.getElementById('productCountText').innerText = 'Không thể kết nối API sản phẩm';
  }
}

// 2. Render danh sach san pham
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '';

  products.forEach((prod) => {
    const col = document.createElement('div');
    col.className = 'col';
    col.innerHTML = `
      <div class="product-card">
        <div class="product-image-wrap">
          <img src="${prod.image}" alt="${prod.name}">
        </div>
        <div class="product-category">${prod.category}</div>
        <h3 class="product-title" title="${prod.name}">${prod.name}</h3>
        <p class="product-desc">${prod.description}</p>
        <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top">
          <span class="product-price">${formatCurrency(prod.price)}</span>
          <button class="btn btn-sm btn-outline-primary fw-semibold" onclick="addToCart('${prod.id}')">
            <i class="bi bi-cart-plus me-1"></i> Thêm
          </button>
        </div>
      </div>
    `;
    grid.appendChild(col);
  });
}

// 3. Quan ly Gio hang
function addToCart(productId) {
  const prod = productsList.find((p) => p.id === productId);
  if (!prod) return;

  if (cart[productId]) {
    cart[productId].quantity += 1;
  } else {
    cart[productId] = { ...prod, quantity: 1 };
  }

  updateCartUI();
  showToast(`Đã thêm "${prod.name}" vào giỏ hàng!`);
}

function updateQuantity(productId, delta) {
  if (!cart[productId]) return;
  cart[productId].quantity += delta;
  if (cart[productId].quantity <= 0) {
    delete cart[productId];
  }
  updateCartUI();
}

function clearCart() {
  cart = {};
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById('cartItemsList');
  const emptyMsg = document.getElementById('cartEmptyMsg');
  const totalSection = document.getElementById('totalPriceSection');
  const totalPriceEl = document.getElementById('cartTotalPrice');
  const submitBtn = document.getElementById('submitOrderBtn');
  const clearBtn = document.getElementById('clearCartBtn');

  const items = Object.values(cart);

  if (items.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyMsg);
    emptyMsg.style.display = 'block';
    totalSection.style.setProperty('display', 'none', 'important');
    submitBtn.disabled = true;
    clearBtn.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  totalSection.style.setProperty('display', 'flex', 'important');
  submitBtn.disabled = false;
  clearBtn.style.display = 'inline-block';

  let total = 0;
  let html = '';

  items.forEach((item) => {
    const itemSubtotal = item.price * item.quantity;
    total += itemSubtotal;
    html += `
      <div class="cart-item">
        <div style="max-width: 65%;">
          <div class="cart-item-title text-truncate">${item.name}</div>
          <div class="cart-item-price">${formatCurrency(item.price)} × ${item.quantity} = <strong>${formatCurrency(itemSubtotal)}</strong></div>
        </div>
        <div class="d-flex align-items-center gap-1">
          <button class="btn btn-sm btn-outline-secondary qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
          <span class="small fw-bold px-1">${item.quantity}</span>
          <button class="btn btn-sm btn-outline-secondary qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  totalPriceEl.innerText = formatCurrency(total);
}

// 4. Chon Loai don hang (Standard vs Priority)
function selectOrderType(priority) {
  selectedPriority = priority;
  document.getElementById('orderPriorityInput').value = priority;

  const stdBox = document.getElementById('typeStandardBox');
  const priBox = document.getElementById('typePriorityBox');

  if (priority > 1) {
    stdBox.classList.remove('active');
    priBox.classList.add('active-vip');
  } else {
    priBox.classList.remove('active-vip');
    stdBox.classList.add('active');
  }
}

// 5. Xu ly Submit Form Dat Hang
function setupEventListeners() {
  const form = document.getElementById('checkoutForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const items = Object.values(cart).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    }));

    if (items.length === 0) {
      alert('Vui lòng chọn ít nhất 1 sản phẩm vào giỏ hàng.');
      return;
    }

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const submitBtn = document.getElementById('submitOrderBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Đang tạo khóa & đẩy vào Redis...';

    const orderPayload = {
      customer_name: document.getElementById('custName').value.trim(),
      phone: document.getElementById('custPhone').value.trim(),
      address: document.getElementById('custAddress').value.trim(),
      payment_method: document.getElementById('paymentMethod').value,
      priority: selectedPriority,
      items: items,
      total: total
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Hien thi Modal thanh cong
        document.getElementById('successModalOrderId').innerText = data.data.order_id;
        document.getElementById('successModalQueue').innerText = data.data.queue;
        
        const successModal = new bootstrap.Modal(document.getElementById('orderSuccessModal'));
        successModal.show();

        // Xoa gio hang
        clearCart();
      } else {
        alert(data.message || 'Không thể tạo đơn hàng');
      }
    } catch (err) {
      alert('Lỗi kết nối tới Server: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> XÁC NHẬN ĐẶT HÀNG';
    }
  });

  // Nut xoa gio hang
  document.getElementById('clearCartBtn').addEventListener('click', clearCart);

  // Tra cuu don hang
  document.getElementById('lookupSubmitBtn').addEventListener('click', () => {
    const val = document.getElementById('lookupOrderIdInput').value.trim();
    if (val) executeLookup(val);
  });

  document.getElementById('lookupOrderIdInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) executeLookup(val);
    }
  });

  document.getElementById('refreshLookupBtn').addEventListener('click', () => {
    if (currentLookupId) executeLookup(currentLookupId);
  });
}

// 6. Tra cuu don hang
async function executeLookup(orderId) {
  currentLookupId = orderId;
  const resultArea = document.getElementById('lookupResultArea');
  const errorMsg = document.getElementById('lookupErrorMsg');
  const refreshBtn = document.getElementById('refreshLookupBtn');

  resultArea.style.display = 'none';
  errorMsg.style.display = 'none';

  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const json = await res.json();

    if (res.ok && json.success) {
      const ord = json.data;
      resultArea.style.display = 'block';
      refreshBtn.style.display = 'inline-block';

      document.getElementById('resOrderId').innerText = ord.order_id;
      document.getElementById('resCustName').innerText = ord.customer_name;
      document.getElementById('resCustPhone').innerText = ord.phone;
      document.getElementById('resTotal').innerText = formatCurrency(ord.total);
      document.getElementById('resPayment').innerText = ord.payment_method;
      
      const priorityNum = parseInt(ord.priority, 10);
      document.getElementById('resPriority').innerHTML = priorityNum > 1
        ? `<span class="badge bg-purple text-white" style="background:#7c3aed;">Ưu tiên (VIP ${priorityNum}★)</span>`
        : `<span class="badge bg-primary">Tiêu chuẩn (FIFO)</span>`;

      document.getElementById('resTrackingCode').innerText = ord.tracking_code || 'Chưa hoàn thành';
      document.getElementById('resTrackingCode').className = ord.tracking_code ? 'badge bg-success' : 'badge bg-secondary';

      document.getElementById('resLockTtl').innerText = `${ord.lock_ttl_seconds}s`;

      // Badge status
      const statusBadge = document.getElementById('resStatusBadge');
      statusBadge.innerHTML = renderStatusBadge(ord.status);

      // Render timeline
      const timelineList = document.getElementById('resTimelineList');
      timelineList.innerHTML = '';
      if (ord.history && ord.history.length > 0) {
        ord.history.forEach((h) => {
          const li = document.createElement('li');
          li.className = 'timeline-item';
          li.innerHTML = `<div class="timeline-content">${h}</div>`;
          timelineList.appendChild(li);
        });
      } else {
        timelineList.innerHTML = '<li class="timeline-item"><div class="timeline-content">Đã tạo đơn hàng.</div></li>';
      }

    } else {
      errorMsg.style.display = 'block';
      errorMsg.innerText = json.message || 'Không tìm thấy đơn hàng.';
    }
  } catch (err) {
    errorMsg.style.display = 'block';
    errorMsg.innerText = 'Lỗi kết nối khi tra cứu: ' + err.message;
  }
}

// 7. Cac ham tien ich ho tro Modal
function copySuccessOrderId() {
  const id = document.getElementById('successModalOrderId').innerText;
  navigator.clipboard.writeText(id).then(() => {
    showToast(`Đã sao chép mã đơn [${id}] vào bộ nhớ tạm!`);
  });
}

function viewCreatedOrder() {
  const id = document.getElementById('successModalOrderId').innerText;
  const successModal = bootstrap.Modal.getInstance(document.getElementById('orderSuccessModal'));
  if (successModal) successModal.hide();

  const lookupModal = new bootstrap.Modal(document.getElementById('lookupModal'));
  lookupModal.show();
  document.getElementById('lookupOrderIdInput').value = id;
  executeLookup(id);
}

function renderStatusBadge(status) {
  switch (status) {
    case 'PENDING':
      return `<span class="badge-status badge-pending"><i class="bi bi-hourglass-split"></i> Chờ xử lý</span>`;
    case 'PROCESSING':
      return `<span class="badge-status badge-processing"><i class="bi bi-gear-wide-connected"></i> Đang xử lý</span>`;
    case 'COMPLETED':
      return `<span class="badge-status badge-completed"><i class="bi bi-check-circle-fill"></i> Hoàn thành</span>`;
    case 'FAILED':
      return `<span class="badge-status badge-failed"><i class="bi bi-exclamation-triangle-fill"></i> Thất bại</span>`;
    case 'DLQ':
      return `<span class="badge-status badge-dlq"><i class="bi bi-x-octagon-fill"></i> Hàng đợi lỗi (DLQ)</span>`;
    default:
      return `<span class="badge bg-secondary">${status}</span>`;
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}

function showToast(msg) {
  const toastEl = document.getElementById('liveToast');
  document.getElementById('toastMessage').innerText = msg;
  const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  toast.show();
}
