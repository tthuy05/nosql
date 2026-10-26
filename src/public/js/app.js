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
        <div class="d-flex align-items-center gap-2" style="max-width: 65%;">
          <img src="${item.image}" alt="" style="width:36px; height:36px; object-fit:cover; border-radius:6px; flex-shrink:0; border:1px solid #e2e8f0;">
          <div class="text-truncate">
            <div class="cart-item-title text-truncate">${item.name}</div>
            <div class="cart-item-price">${formatCurrency(item.price)} × ${item.quantity} = <strong>${formatCurrency(itemSubtotal)}</strong></div>
          </div>
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
    if (document.getElementById('submitOrderBtn').disabled) return;

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
      const signature = JSON.stringify(orderPayload);
      let pending = JSON.parse(sessionStorage.getItem('pendingCheckout') || 'null');
      if (!pending || pending.signature !== signature) {
        pending = { signature, key: crypto.randomUUID() };
        sessionStorage.setItem('pendingCheckout', JSON.stringify(pending));
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
        body: JSON.stringify(orderPayload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.removeItem('pendingCheckout');
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
          const content = document.createElement('div');
          content.className = 'timeline-content';
          content.textContent = h;
          li.appendChild(content);
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
      return '<span class="badge bg-secondary">Không xác định</span>';
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

// 8. Chuc nang Dat hang nhanh 1-Click phuc vu Demo thuyet trinh
async function oneClickOrder(type) {
  const btnId = type === 'fifo' ? 'btnQuickFifo' : (type === 'vip' ? 'btnQuickVip' : 'btnQuickFail');
  const btn = document.getElementById(btnId);
  const oldHtml = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang tạo đơn...';
  }

  try {
    const timestamp = Date.now().toString().slice(-4);
    let payload = {};

    if (type === 'fifo') {
      payload = {
        order_id: `DH_FIFO_${timestamp}`,
        customer_id: 'CUST_01',
        customer_name: 'Nguyễn Văn A (Khách Thường)',
        phone: '0901234567',
        address: 'Quận 1, TP. Hồ Chí Minh',
        items: [{ id: 'PROD_01', name: 'Áo thun cotton cao cấp', price: 199000, quantity: 1 }],
        total: 199000,
        payment_method: 'COD',
        priority: 1
      };
    } else if (type === 'vip') {
      payload = {
        order_id: `DH_VIP_${timestamp}`,
        customer_id: 'CUST_03',
        customer_name: 'Lê Hoàng Nam (VIP Diamond ★)',
        phone: '0988776655',
        address: 'Quận 7, TP. Hồ Chí Minh',
        items: [{ id: 'PROD_02', name: 'Samsung Galaxy S24 Ultra', price: 31990000, quantity: 1 }],
        total: 31990000,
        payment_method: 'BANK_TRANSFER',
        priority: 5
      };
    } else {
      payload = {
        order_id: `DH_ERR_${timestamp}`,
        customer_id: 'CUST_05',
        customer_name: 'Phạm Minh Đức (Mô Phỏng Lỗi)',
        phone: '0977112233',
        address: 'Quận Tân Bình, TP. Hồ Chí Minh',
        items: [{ id: 'PROD_03', name: 'Tai nghe Bluetooth (Mô phỏng lỗi)', price: 450000, quantity: 1 }],
        total: 450000,
        payment_method: 'MOMO',
        priority: 1,
        simulate_fail: true
      };
    }

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (res.ok && json.success) {
      document.getElementById('successModalOrderId').innerText = json.data.order_id;
      document.getElementById('successModalQueue').innerText = json.data.queue;
      const successModal = new bootstrap.Modal(document.getElementById('orderSuccessModal'));
      successModal.show();
      showToast(`Đã tạo thành công đơn ${json.data.order_id} vào Redis!`);
    } else {
      alert(json.message || 'Lỗi khi tạo đơn hàng');
    }
  } catch (err) {
    alert('Lỗi kết nối tới Server: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}
