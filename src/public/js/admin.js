function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/**
 * Logic trang quan tri Dashboard: Giam sat cac hang doi Redis va Dieu khien Demo
 */

let currentFilterStatus = '';
let autoRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  fetchAdminData();
  setupAutoRefresh();
});

function setupAutoRefresh() {
  const toggle = document.getElementById('autoRefreshToggle');
  autoRefreshTimer = setInterval(() => {
    if (toggle && toggle.checked) {
      fetchAdminData();
    }
  }, 2000);
}

// 1. Goi cac APIs dong thoi de cap nhat toan bo Dashboard
async function fetchAdminData() {
  try {
    await Promise.all([
      fetchStats(),
      fetchQueues(),
      fetchOrders()
    ]);
  } catch (err) {
    console.error('Loi cap nhat du lieu admin:', err);
  }
}

// 2. Thong ke tong quan (Metric Cards & Worker status)
async function fetchStats() {
  const res = await fetch('/api/admin/stats');
  const json = await res.json();
  if (!json.success) return;

  const data = json.data;

  // Metric values
  document.getElementById('mTotalOrders').innerText = data.counts.total_orders;
  document.getElementById('mPendingQueue').innerText = data.queues.pending;
  document.getElementById('mPriorityQueue').innerText = data.queues.priority;
  document.getElementById('mProcessingQueue').innerText = data.queues.processing;
  document.getElementById('mCompletedOrders').innerText = data.counts.completed;
  document.getElementById('mDlqQueue').innerText = data.queues.dead_letter;

  // Worker status indicator
  const dot = document.getElementById('workerIndicatorDot');
  const text = document.getElementById('workerStatusText');
  const isRunning = data.worker_status === 'RUNNING';

  dot.className = isRunning ? 'worker-indicator-dot worker-running' : 'worker-indicator-dot worker-paused';
  text.innerText = isRunning ? 'WORKER: RUNNING' : 'WORKER: PAUSED';
  text.className = isRunning ? 'small fw-bold text-success' : 'small fw-bold text-warning';

  // Worker speed indicator
  if (data.worker_delay_ms) {
    updateSpeedButtonsUI(data.worker_delay_ms);
  }
}

// 3. Render 4 cot Hang doi (Visualizer)
async function fetchQueues() {
  const res = await fetch('/api/admin/queues');
  const json = await res.json();
  if (!json.success) return;

  const q = json.data;

  // Cột 1: FIFO Pending
  renderQueueList('qListPending', 'qBadgePending', q.pending, (id) => `
    <div class="queue-item-pill">
      <span class="font-monospace fw-bold text-slate-700">${escapeHtml(id)}</span>
      <span class="badge bg-secondary">FIFO</span>
    </div>
  `);

  // Cột 2: Priority Queue (ZSet)
  renderQueueList('qListPriority', 'qBadgePriority', q.priority, (item) => `
    <div class="queue-item-pill">
      <span class="font-monospace fw-bold text-slate-700">${escapeHtml(item.order_id)}</span>
      <span class="badge bg-purple text-white" style="background:#7c3aed;">★ ${escapeHtml(item.score)}</span>
    </div>
  `);

  // Cột 3: Processing Queue
  renderQueueList('qListProcessing', 'qBadgeProcessing', q.processing, (id) => `
    <div class="queue-item-pill border-info">
      <span class="font-monospace fw-bold text-info text-truncate">${escapeHtml(id)}</span>
      <span class="spinner-grow spinner-grow-sm text-info" style="width:12px;height:12px;"></span>
    </div>
  `);

  // Cột 4: Dead Letter Queue (DLQ)
  renderQueueList('qListDlq', 'qBadgeDlq', q.dead_letter, (id) => `
    <div class="queue-item-pill border-danger bg-danger bg-opacity-10">
      <span class="font-monospace fw-bold text-danger text-truncate">${escapeHtml(id)}</span>
      <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="retryDlqOrder(${escapeHtml(JSON.stringify(id))})" title="Thử lại đơn lỗi">
        <i class="bi bi-arrow-repeat"></i> Retry
      </button>
    </div>
  `);
}

function renderQueueList(containerId, badgeId, items, templateFn) {
  const container = document.getElementById(containerId);
  const badge = document.getElementById(badgeId);

  badge.innerText = items ? items.length : 0;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="queue-empty-text"><i class="bi bi-inbox d-block mb-1"></i>Hàng đợi trống</div>';
    return;
  }

  container.innerHTML = items.map(templateFn).join('');
}

// 4. Render Bang danh sach don hang
async function fetchOrders() {
  const url = currentFilterStatus ? `/api/admin/orders?status=${currentFilterStatus}` : '/api/admin/orders';
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) return;

  const orders = json.data;
  const tbody = document.getElementById('ordersTableBody');

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Chưa có đơn hàng nào phù hợp với bộ lọc.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map((o) => {
    const isVip = parseInt(o.priority, 10) > 1;
    const priorityBadge = isVip
      ? `<span class="badge bg-purple text-white" style="background:#7c3aed;">Ưu tiên (★${escapeHtml(o.priority)})</span>`
      : `<span class="badge bg-primary">FIFO</span>`;

    const statusBadge = renderAdminStatusBadge(o.status);

    return `
      <tr>
        <td class="font-monospace fw-bold text-primary">${escapeHtml(o.order_id)}</td>
        <td>
          <div class="fw-semibold">${escapeHtml(o.customer_name)}</div>
          <div class="text-muted" style="font-size:0.75rem;">${escapeHtml(o.phone)}</div>
        </td>
        <td class="fw-bold text-danger">${formatCurrency(o.total)}</td>
        <td>${priorityBadge}</td>
        <td>${statusBadge}</td>
        <td><span class="badge ${parseInt(o.retry_count, 10) > 0 ? 'bg-danger' : 'bg-light text-dark'}">${escapeHtml(o.retry_count || 0)}</span></td>
        <td class="text-muted small">${formatDate(o.created_at)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" onclick="viewOrderDetail(${escapeHtml(JSON.stringify(o.order_id))})" title="Xem chi tiết Hash">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterByStatus(status) {
  currentFilterStatus = status;

  // Active button state
  const group = document.getElementById('filterStatusGroup');
  Array.from(group.children).forEach((btn) => btn.classList.remove('active'));
  event.target.classList.add('active');

  fetchOrders();
}

// 5. Dieu khien Worker
async function toggleWorker(status) {
  try {
    const res = await fetch('/api/admin/worker/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
      fetchAdminData();
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function triggerSingleStepOrder() {
  try {
    const res = await fetch('/api/admin/worker/step', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
      fetchAdminData();
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

// 6. Tao du lieu mau
async function seedReportData() {
  try {
    const res = await fetch('/api/admin/seed-report-data', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
      fetchAdminData();
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function generateBatch(count) {
  try {
    const res = await fetch('/api/admin/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
      fetchAdminData();
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

// 7. Mo phong loi va Retry DLQ
async function simulateOrderFailure() {
  try {
    const res = await fetch('/api/admin/simulate-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable: true })
    });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function retryDlqOrder(orderId) {
  try {
    const res = await fetch(`/api/admin/retry-dlq/${orderId}`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
      fetchAdminData();
    } else {
      alert(json.message);
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function resetAllDemoData() {
  if (!confirm('Bạn có chắc chắn muốn xóa sạch toàn bộ dữ liệu đơn hàng và hàng đợi trên Redis để làm mới buổi demo?')) {
    return;
  }
  try {
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showAdminToast(json.message);
      fetchAdminData();
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

// 8. Xem chi tiet don hang
async function viewOrderDetail(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const json = await res.json();
    if (!json.success) return;

    const ord = json.data;

    document.getElementById('modalDetailKey').innerText = `order:${ord.order_id}`;
    document.getElementById('mDetCustName').innerText = ord.customer_name;
    document.getElementById('mDetCustId').innerText = ord.customer_id;
    document.getElementById('mDetPhone').innerText = ord.phone;
    document.getElementById('mDetAddress').innerText = ord.address;
    document.getElementById('mDetPayment').innerText = ord.payment_method;

    // Items
    try {
      const parsedItems = JSON.parse(ord.items);
      document.getElementById('mDetItems').innerText = Array.isArray(parsedItems)
        ? parsedItems.map((i) => `${i.name} (x${i.quantity})`).join(', ')
        : ord.items;
    } catch (e) {
      document.getElementById('mDetItems').innerText = ord.items;
    }

    document.getElementById('mDetTotal').innerText = formatCurrency(ord.total);
    document.getElementById('mDetStatus').innerHTML = renderAdminStatusBadge(ord.status);
    document.getElementById('mDetPriority').innerText = parseInt(ord.priority, 10) > 1 ? `VIP / Điểm: ${ord.priority}` : 'Thường (FIFO / Điểm: 1)';
    document.getElementById('mDetTracking').innerText = ord.tracking_code || 'Chưa hoàn thành';
    document.getElementById('mDetRetries').innerText = ord.retry_count || 0;
    document.getElementById('mDetError').innerText = ord.error_reason || 'Không có';

    // Timeline
    const timeline = document.getElementById('mDetTimeline');
    timeline.innerHTML = '';
    if (ord.history && ord.history.length > 0) {
      ord.history.forEach((h) => {
        const li = document.createElement('li');
        li.className = 'timeline-item';
        const content = document.createElement('div');
        content.className = 'timeline-content';
        content.textContent = h;
        li.appendChild(content);
        timeline.appendChild(li);
      });
    } else {
      timeline.innerHTML = '<li class="timeline-item"><div class="timeline-content">Đã tạo đơn.</div></li>';
    }

    const modal = new bootstrap.Modal(document.getElementById('orderDetailModal'));
    modal.show();

  } catch (err) {
    alert('Lỗi lấy chi tiết đơn: ' + err.message);
  }
}

// 9. Tien ich
function renderAdminStatusBadge(status) {
  switch (status) {
    case 'PENDING':
      return `<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>PENDING</span>`;
    case 'PROCESSING':
      return `<span class="badge bg-info text-dark"><i class="bi bi-gear-wide-connected me-1"></i>PROCESSING</span>`;
    case 'COMPLETED':
      return `<span class="badge bg-success"><i class="bi bi-check-circle-fill me-1"></i>COMPLETED</span>`;
    case 'FAILED':
      return `<span class="badge bg-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>FAILED</span>`;
    case 'DLQ':
      return `<span class="badge bg-danger bg-opacity-75"><i class="bi bi-shield-x me-1"></i>DLQ</span>`;
    default:
      return `<span class="badge bg-secondary">${escapeHtml(status)}</span>`;
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}

function formatDate(isoStr) {
  if (!isoStr) return '---';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('vi-VN') + ' ' + d.toLocaleDateString('vi-VN');
}

function showAdminToast(msg) {
  const toastEl = document.getElementById('adminToast');
  document.getElementById('adminToastMessage').innerText = msg;
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
}

// 10. MO PHONG HANG DOI & DIEU KHIEN TOC DO WORKER
async function triggerScenario(scenarioId) {
  try {
    const res = await fetch(`/api/admin/scenario/${scenarioId}`, { method: 'POST' });
    const json = await res.json();

    if (json.success) {
      await fetchAdminData();
      showAdminToast(json.data.status || json.message);
    } else {
      alert(json.message || 'Lỗi mô phỏng');
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function setWorkerSpeed(speedMs) {
  try {
    const res = await fetch('/api/admin/worker/speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delay_ms: speedMs })
    });
    const json = await res.json();
    if (json.success) {
      updateSpeedButtonsUI(speedMs);
      showAdminToast(`Đã đổi tốc độ Worker thành: ${speedMs}ms / đơn!`);
    } else {
      alert(json.message || 'Lỗi khi đổi tốc độ');
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

function updateSpeedButtonsUI(speedMs) {
  const btnSlow = document.getElementById('btnSpeedSlow');
  const btnNormal = document.getElementById('btnSpeedNormal');
  const btnFast = document.getElementById('btnSpeedFast');

  [btnSlow, btnNormal, btnFast].forEach((b) => {
    if (b) {
      b.className = 'btn btn-outline-light';
    }
  });

  if (speedMs >= 3000) {
    if (btnSlow) btnSlow.className = 'btn btn-warning active text-dark fw-bold';
  } else if (speedMs <= 500) {
    if (btnFast) btnFast.className = 'btn btn-info active text-dark fw-bold';
  } else {
    if (btnNormal) btnNormal.className = 'btn btn-light active text-dark fw-bold';
  }
}
