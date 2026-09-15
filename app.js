/**
 * Maintenance Spare Parts Inventory Management System
 * Core Client Application Logic
 */

// Global State
const appState = {
  db: null,
  currentUser: { id: 'U-001', name: 'สมชาย ใจมั่น', role: 'Store', department: 'Tool Room Store', title: 'Store / สโตร์ช่าง (รับ-เบิกของ)' },
  currentTab: 'dashboard',
  selectedPart: null,
  searchQuery: '',
  filterCategory: 'ALL',
  filterStockStatus: 'ALL',
  filterMachine: 'ALL',
  currentPage: 1,
  pageSize: 15,
  charts: {}
};

// Available Users for Role Switching (รองรับ Develop สิทธิ์สูงสุด)
const SYSTEM_USERS = {
  'Develop': { id: 'U-004', name: 'Developer (ผู้พัฒนาระบบ)', role: 'Develop', title: 'Develop (ผู้พัฒนาระบบ - สิทธิ์สูงสุด)', badgeColor: 'text-purple-400' },
  'Admin': { id: 'U-003', name: 'ธนภัทร รัตนศิลป์', role: 'Admin', title: 'Admin (ผู้ดูแล/บันทึก)', badgeColor: 'text-amber-400' },
  'Data Editor': { id: 'U-002', name: 'วีระ หลังบ้าน', role: 'Data Editor', title: 'หลังบ้าน (แก้ไขข้อมูลอะไหล่)', badgeColor: 'text-indigo-400' },
  'Store': { id: 'U-001', name: 'สมชาย ใจมั่น', role: 'Store', title: 'Store / สโตร์ช่าง (รับ-เบิกของ)', badgeColor: 'text-sky-400' }
};

// ซิงค์รายชื่อและข้อมูลผู้ใช้ทั้งหมดจากฐานข้อมูลอัตโนมัติ
function syncUsersFromDb() {
  if (!appState.db || !appState.db.users) return;
  appState.db.users.forEach(u => {
    SYSTEM_USERS[u.role] = {
      id: u.id,
      name: u.name,
      role: u.role,
      department: u.department || '',
      email: u.email || '',
      phone: u.phone || '',
      title: `${u.name} (${u.role})`,
      badgeColor: u.role === 'Develop' ? 'text-purple-400' : (u.role === 'Admin' ? 'text-amber-400' : (u.role === 'Data Editor' ? 'text-indigo-400' : 'text-sky-400'))
    };

    // ถ้ากำลังล็อกอินด้วยผู้ใช้นี้อยู่ ให้อัปเดตชื่อและตำแหน่งใน State และ Header ทันที
    if (appState.currentUser && appState.currentUser.id === u.id) {
      appState.currentUser.name = u.name;
      appState.currentUser.role = u.role;
      appState.currentUser.department = u.department || '';
      appState.currentUser.email = u.email || '';
      appState.currentUser.phone = u.phone || '';
      appState.currentUser.title = `${u.name} (${u.role})`;

      const userLbl = document.getElementById('currentUserLabel');
      if (userLbl) userLbl.innerText = u.name;
      const roleBadge = document.getElementById('currentRoleBadge');
      if (roleBadge) roleBadge.innerText = `${u.role} / ${u.name}`;
    }
  });

  // อัปเดตตัวเลือกในแถบสลับบทบาท (Role Selector) ด้านบนขวา
  const roleSelect = document.getElementById('roleSelector');
  if (roleSelect) {
    const currentSelectedVal = roleSelect.value;
    roleSelect.innerHTML = Object.keys(SYSTEM_USERS).map(role => {
      const u = SYSTEM_USERS[role];
      const icon = role === 'Develop' ? '💻' : (role === 'Admin' ? '🛡️' : (role === 'Data Editor' ? '✏️' : '👤'));
      return `<option value="${role}">${icon} ${u.name} (${role})</option>`;
    }).join('');
    if (SYSTEM_USERS[currentSelectedVal]) {
      roleSelect.value = currentSelectedVal;
    }
  }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupKeyboardShortcuts();
});

async function initApp() {
  showLoading();
  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      appState.db = await res.json();
      syncUsersFromDb();
      console.log('Database loaded successfully:', appState.db.parts.length, 'parts');
    } else {
      throw new Error('Failed to load API DB');
    }
  } catch (err) {
    console.error('Error fetching database:', err);
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้: ' + err.message, 'error');
  } finally {
    hideLoading();
    updateHeaderCounts();
    const initHash = window.location.hash ? window.location.hash.replace('#', '') : '';
    switchTab(initHash || 'dashboard');
    initRealtimeSync();
  }
}

// Live Real-Time Multi-User Synchronization
function initRealtimeSync() {
  let eventSource = null;
  const badge = document.getElementById('liveSyncBadge');

  try {
    eventSource = new EventSource('/api/events');
    eventSource.onopen = () => {
      if (badge) {
        badge.classList.remove('hidden');
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span><span>Live Sync Online</span>`;
        badge.className = 'hidden sm:inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono';
      }
    };

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type !== 'CONNECTED') {
          console.log('⚡ Real-time Event received:', event.type, event.payload);
          // Silently sync database and update view
          fetch('/api/db')
            .then(r => r.json())
            .then(data => {
              appState.db = data;
              updateHeaderCounts();
              // Re-render only if user is not actively typing in an open input
              const activeEl = document.activeElement;
              const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
              if (!isTyping) {
                renderCurrentTab();
              }
              // Show notification toast
              let msg = 'มีข้อมูลอัปเดตใหม่จากผู้ใช้งานอื่น';
              if (event.type === 'STOCK_IN') msg = `รับเข้าอะไหล่ ${event.payload.partNumber} (+${event.payload.qtyIn}) โดย ${event.payload.user}`;
              else if (event.type === 'STOCK_ISSUE') msg = `เบิกอะไหล่ ${event.payload.partNumber} (-${event.payload.qtyOut}) โดย ${event.payload.user}`;
              else if (event.type === 'STOCK_RETURN') msg = `รับคืนอะไหล่ ${event.payload.partNumber} สภาพ ${event.payload.condition}`;
              else if (event.type === 'STOCK_ADJUST') msg = `ปรับปรุงยอดสต็อก ${event.payload.partNumber}`;
              else if (event.type === 'TOOL_LOAN_UPDATE') {
                const actName = event.payload.action === 'BORROW' ? 'ยืมเครื่องมือ' : 'คืนเครื่องมือ';
                msg = `${actName}: ${event.payload.loan.toolName} โดย ${event.payload.loan.borrowerName}`;
              }

              Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: '⚡ Live Update',
                text: msg,
                showConfirmButton: false,
                timer: 2500
              });
            });
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      if (badge) {
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>Polling Sync</span>`;
        badge.className = 'hidden sm:inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-mono';
      }
    };
  } catch (err) {
    console.log('SSE not available, falling back to polling');
  }

  // Backup Polling every 4 seconds to guarantee sync
  let lastKnownVersion = (appState.db && appState.db.version) || 0;
  setInterval(async () => {
    try {
      const res = await fetch('/api/version');
      if (res.ok) {
        const info = await res.json();
        if (info.version && lastKnownVersion && info.version > lastKnownVersion) {
          lastKnownVersion = info.version;
          const activeEl = document.activeElement;
          const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
          const dbRes = await fetch('/api/db');
          if (dbRes.ok) {
            appState.db = await dbRes.json();
            updateHeaderCounts();
            if (!isTyping) renderCurrentTab();
          }
        } else if (info.version) {
          lastKnownVersion = info.version;
        }
      }
    } catch (e) {}
  }, 4000);
}

function refreshData(showToast = false) {
  fetch('/api/db')
    .then(res => res.json())
    .then(data => {
      appState.db = data;
      updateHeaderCounts();
      renderCurrentTab();
      if (showToast) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'อัปเดตข้อมูลล่าสุดเรียบร้อย',
          showConfirmButton: false,
          timer: 1500
        });
      }
    })
    .catch(err => console.error(err));
}

function updateHeaderCounts() {
  if (!appState.db || !appState.db.parts) return;
  const parts = appState.db.parts;
  const lowStockCount = parts.filter(p => p.currentStock <= p.minStock).length;
  const criticalSpares = parts.filter(p => p.isCritical).length;
  const reorderCount = parts.filter(p => p.currentStock <= p.reorderPoint).length;

  const alertBadge = document.getElementById('headerAlertCount');
  if (alertBadge) {
    if (lowStockCount > 0) {
      alertBadge.innerText = lowStockCount;
      alertBadge.classList.remove('hidden');
    } else {
      alertBadge.classList.add('hidden');
    }
  }

  const navCrit = document.getElementById('navCritCount');
  if (navCrit) navCrit.innerText = criticalSpares;

  const navReorder = document.getElementById('navReorderCount');
  if (navReorder) navReorder.innerText = reorderCount;

  const navActiveLoans = document.getElementById('navActiveLoansCount');
  if (navActiveLoans && appState.db) {
    const activeLoans = (appState.db.toolLoans || []).filter(l => l.status === 'BORROWED' || l.status === 'OVERDUE');
    navActiveLoans.innerText = activeLoans.length;
  }
  const navAlert = document.getElementById('navAlertTotal');
  if (navAlert) navAlert.innerText = lowStockCount;
}

// User Role Switching
function changeUserRole(newRole) {
  if (SYSTEM_USERS[newRole]) {
    appState.currentUser = SYSTEM_USERS[newRole];
    document.getElementById('currentUserLabel').innerText = appState.currentUser.name;
    document.getElementById('currentRoleBadge').innerText = appState.currentUser.title;
    
    // Toggle Admin navigation visibility (Develop & Admin have access)
    const adminItems = document.querySelectorAll('.admin-only');
    adminItems.forEach(el => {
      if (newRole === 'Admin' || newRole === 'Develop') el.classList.remove('hidden');
      else el.classList.add('hidden');
    });

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: `สลับบทบาทเป็น: ${appState.currentUser.title}`,
      showConfirmButton: false,
      timer: 1800
    });

    renderCurrentTab();
  }
}

// Sidebar toggle on mobile
const sidebarToggle = document.getElementById('sidebarToggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('-translate-x-full');
  });
}

// Keyboard shortcuts (Ctrl+K, ESC)
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openGlobalSearch();
    }
    if (e.key === 'Escape') {
      closeGlobalSearch();
      closePartDetail();
      closeQRScanner();
      closePrintLabel();
    }
  });
}

// Loading indicator
function showLoading() {
  const container = document.getElementById('mainContent');
  if (container) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 space-y-4">
        <div class="w-12 h-12 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
        <div class="text-sm font-semibold text-slate-600">กำลังโหลดข้อมูลระบบคลังอะไหล่...</div>
      </div>
    `;
  }
}
function hideLoading() {}

// ==================== TAB SWITCHING & ROUTING ====================

function switchTab(tabId) {
  appState.currentTab = tabId;

  // Update sidebar active styling
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.remove('text-white', 'bg-sky-600', 'shadow-sm');
    btn.classList.add('text-slate-300', 'hover:text-white', 'hover:bg-slate-800');
  });
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.remove('text-slate-300', 'hover:text-white', 'hover:bg-slate-800');
    activeNav.classList.add('text-white', 'bg-sky-600', 'shadow-sm');
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 1024) {
    sidebar.classList.add('-translate-x-full');
  }

  renderCurrentTab();
}

function renderCurrentTab() {
  if (!appState.db) return;
  const container = document.getElementById('mainContent');
  destroyCharts();

  switch (appState.currentTab) {
    case 'tool-loans':
      renderToolLoans(container);
      break;
    case 'dashboard':
      renderDashboard(container);
      break;
    case 'spare-parts':
      renderSpareParts(container);
      break;
    case 'stock-in':
      renderStockIn(container);
      break;
    case 'stock-issue':
      renderStockIssue(container);
      break;
    case 'stock-return':
      renderStockReturn(container);
      break;
    case 'stock-adjustment':
      renderStockAdjustment(container);
      break;
    case 'stock-movement':
      renderStockMovement(container);
      break;
    case 'machine-parts':
      renderMachineParts(container);
      break;
    case 'critical-spares':
      renderCriticalSpares(container);
      break;
    case 'analytics':
      renderUsageAnalytics(container);
      break;
    case 'purchase-rec':
      renderPurchaseRecommendation(container);
      break;
    case 'stock-count':
      renderStockCount(container);
      break;
    case 'locations':
      renderLocations(container);
      break;
    case 'alerts':
      renderAlerts(container);
      break;
    case 'reports':
      renderReports(container);
      break;
    case 'audit-log':
      renderAuditLog(container);
      break;
    case 'master-data':
      renderMasterData(container);
      break;
    case 'users':
      renderUsers(container);
      break;
    default:
      renderDashboard(container);
  }
}

function destroyCharts() {
  Object.keys(appState.charts).forEach(key => {
    if (appState.charts[key]) {
      appState.charts[key].destroy();
      delete appState.charts[key];
    }
  });
}

// ==================== 1. DASHBOARD MODULE ====================

function renderDashboard(container) {
  const parts = appState.db.parts || [];
  const movements = appState.db.movements || [];

  // Metrics
  const totalParts = parts.length;
  const inStockParts = parts.filter(p => p.currentStock > p.minStock).length;
  const lowStockParts = parts.filter(p => p.currentStock <= p.minStock && p.currentStock > 0).length;
  const outOfStockParts = parts.filter(p => p.currentStock === 0).length;
  const criticalParts = parts.filter(p => p.isCritical).length;
  const criticalZero = parts.filter(p => p.isCritical && p.currentStock === 0).length;

  // Monthly stats (current month)
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const monthlyIn = movements.filter(m => m.type === 'IN' && m.date.startsWith(currentMonthPrefix));
  const monthlyOut = movements.filter(m => m.type === 'OUT' && m.date.startsWith(currentMonthPrefix));
  const totalValuation = parts.reduce((sum, p) => sum + ((p.currentStock || 0) * (p.unitCost || 0)), 0);

  container.innerHTML = `
    <!-- Top Welcome & Quick Actions -->
    <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 rounded-2xl p-6 text-white shadow-lg border border-slate-700/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <div class="flex items-center space-x-2 mb-1">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-400/30">
            สถานะคลังอะไหล่ Real-time
          </span>
          <span class="text-xs text-slate-400 font-mono">อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')}</span>
        </div>
        <h1 class="text-xl sm:text-2xl font-bold text-white tracking-tight">ระบบคลังอะไหล่ซ่อมบำรุง (Tool Room Stock)</h1>
        <p class="text-xs text-slate-300 mt-1 max-w-2xl">
          ควบคุมจำนวนอะไหล่ ลดปัญหาอะไหล่ขาด Stock ตรวจสอบประวัติรับเข้า-เบิกจ่ายย้อนหลัง และวิเคราะห์ความต้องการสำหรับโรงงาน
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button onclick="switchTab('stock-in')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>รับอะไหล่เข้า</span>
        </button>
        <button onclick="switchTab('stock-issue')" class="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
          <span>เบิกอะไหล่ด่วน</span>
        </button>
        <button onclick="openQRScanner()" class="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
          <span>สแกน QR</span>
        </button>
      </div>
    </div>

    <!-- 9 KPI SUMMARY CARDS -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
      
      <!-- Card 1: Total Parts -->
      <div onclick="switchTab('spare-parts')" class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>อะไหล่ทั้งหมด</span>
          <span class="p-1.5 rounded-lg bg-sky-50 text-sky-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          </span>
        </div>
        <div class="mt-2 text-2xl font-bold text-slate-800">${totalParts.toLocaleString()}</div>
        <div class="text-[11px] text-slate-400 mt-0.5">รายการพร้อมควบคุม</div>
      </div>

      <!-- Card 2: In Stock -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>สต็อกปกติ (> Min)</span>
          <span class="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          </span>
        </div>
        <div class="mt-2 text-2xl font-bold text-emerald-600">${inStockParts.toLocaleString()}</div>
        <div class="text-[11px] text-emerald-700 mt-0.5 font-medium">${((inStockParts/totalParts)*100).toFixed(1)}% ของคลัง</div>
      </div>

      <!-- Card 3: Low Stock -->
      <div onclick="switchTab('alerts')" class="bg-white rounded-xl p-4 shadow-sm border border-amber-200 hover:shadow-md cursor-pointer transition">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>สต็อกต่ำกว่า Min</span>
          <span class="p-1.5 rounded-lg bg-amber-50 text-amber-600 font-bold">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </span>
        </div>
        <div class="mt-2 text-2xl font-bold text-amber-600">${lowStockParts.toLocaleString()}</div>
        <div class="text-[11px] text-amber-700 mt-0.5 font-medium">ควรวางแผนสั่งซื้อ</div>
      </div>

      <!-- Card 4: Out of Stock -->
      <div onclick="switchTab('alerts')" class="bg-white rounded-xl p-4 shadow-sm border border-rose-200 hover:shadow-md cursor-pointer transition">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>หมดสต็อก (Stock=0)</span>
          <span class="p-1.5 rounded-lg bg-rose-50 text-rose-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
          </span>
        </div>
        <div class="mt-2 text-2xl font-bold text-rose-600">${outOfStockParts.toLocaleString()}</div>
        <div class="text-[11px] text-rose-600 mt-0.5 font-semibold">ขาดสต็อกเร่งด่วน!</div>
      </div>

      <!-- Card 5: Critical Spares -->
      <div onclick="switchTab('critical-spares')" class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>อะไหล่วิกฤต (Critical)</span>
          <span class="p-1.5 rounded-lg bg-red-50 text-red-600 font-bold">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </span>
        </div>
        <div class="mt-2 text-2xl font-bold text-slate-900">${criticalParts.toLocaleString()}</div>
        <div class="text-[11px] ${criticalZero > 0 ? 'text-red-600 font-bold animate-pulse' : 'text-slate-500'} mt-0.5">
          ${criticalZero > 0 ? `⚠️ มี ${criticalZero} ตัวเป็น 0!` : 'สต็อกมีครบทุกตัว'}
        </div>
      </div>

      <!-- Card 6: Monthly In -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>รับเข้าเดือนนี้</span>
          <span class="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 font-mono">+IN</span>
        </div>
        <div class="mt-2 text-2xl font-bold text-emerald-600">${monthlyIn.length} รายการ</div>
        <div class="text-[11px] text-slate-500 mt-0.5">ยอดรับรวม: ${monthlyIn.reduce((s, m) => s + (m.qtyIn || 0), 0)} ชิ้น</div>
      </div>

      <!-- Card 7: Monthly Out -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>เบิกจ่ายเดือนนี้</span>
          <span class="p-1.5 rounded-lg bg-rose-50 text-rose-600 font-mono">-OUT</span>
        </div>
        <div class="mt-2 text-2xl font-bold text-rose-600">${monthlyOut.length} ครั้ง</div>
        <div class="text-[11px] text-slate-500 mt-0.5">ยอดเบิกรวม: ${monthlyOut.reduce((s, m) => s + (m.qtyOut || 0), 0)} ชิ้น</div>
      </div>

      <!-- Card 8: High Issue Items -->
      <div onclick="switchTab('analytics')" class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md cursor-pointer transition">
        <div class="flex items-center justify-between text-slate-500 text-xs font-medium">
          <span>เบิกใช้สูงเดือนนี้</span>
          <span class="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
          </span>
        </div>
        <div class="mt-2 text-2xl font-bold text-indigo-600">12 ชนิด</div>
        <div class="text-[11px] text-slate-500 mt-0.5">Fast-Moving Parts</div>
      </div>

      <!-- Card 9 & 10: Total Inventory Valuation (Span 2 cols on lg) -->
      <div class="col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white shadow-sm border border-slate-700 flex items-center justify-between">
        <div>
          <div class="text-xs text-sky-400 font-medium">มูลค่าสินค้าคงคลังรวมโดยประมาณ (Estimated Valuation)</div>
          <div class="text-2xl sm:text-3xl font-bold text-white font-mono mt-1">฿ ${totalValuation.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">คำนวณจาก Current Stock × Unit Cost (THB)</div>
        </div>
        <div class="hidden sm:block p-3 bg-white/10 rounded-xl">
          <svg class="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
      </div>

    </div>

    <!-- 5 REAL-TIME CHARTS SECTION -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      <!-- Chart 1: Stock Movement Daily/Monthly (In vs Out) -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-800">1. การเคลื่อนไหวของสต็อก (Stock Movement: In vs Out)</h3>
            <p class="text-xs text-slate-500">เปรียบเทียบยอดรับเข้าและยอดเบิกจ่ายในรอบเดือน</p>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 bg-sky-50 text-sky-700 rounded">รายเดือน</span>
        </div>
        <div class="h-64 relative">
          <canvas id="chartMovement"></canvas>
        </div>
      </div>

      <!-- Chart 2: Top 10 Most Issued Parts -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-800">2. Top 10 อะไหล่ที่ถูกเบิกมากที่สุด (Most Issued)</h3>
            <p class="text-xs text-slate-500">จำแนกตามจำนวนชิ้นที่เบิกใช้ในงานซ่อมบำรุง</p>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 bg-rose-50 text-rose-700 rounded">Top 10</span>
        </div>
        <div class="h-64 relative">
          <canvas id="chartTopIssued"></canvas>
        </div>
      </div>

      <!-- Chart 3: Parts by Category (Donut) -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-800">3. สัดส่วนอะไหล่ตามหมวดหมู่ (Category Breakdown)</h3>
            <p class="text-xs text-slate-500">จำนวนรายการจำแนกตามกลุ่มอะไหล่ใน Tool Room</p>
          </div>
        </div>
        <div class="h-64 relative flex items-center justify-center">
          <canvas id="chartCategory"></canvas>
        </div>
      </div>

      <!-- Chart 4: Below Minimum Stock Deficit -->
      <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-800">4. สต็อกต่ำกว่าเกณฑ์ (Min Stock vs Current Stock)</h3>
            <p class="text-xs text-slate-500">เปรียบเทียบยอดคงเหลือกับค่า Minimum ของอะไหล่ที่ต้องเติม</p>
          </div>
          <button onclick="switchTab('purchase-rec')" class="text-xs text-sky-600 hover:text-sky-800 font-semibold">ไปสั่งซื้อ &rarr;</button>
        </div>
        <div class="h-64 relative">
          <canvas id="chartMinDeficit"></canvas>
        </div>
      </div>

      <!-- Chart 5: Stock Valuation by Category (Full width on lg) -->
      <div class="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-sm font-bold text-slate-800">5. มูลค่าสินค้าคงคลังแยกตามหมวดหมู่ (Stock Valuation by Category - THB)</h3>
            <p class="text-xs text-slate-500">มูลค่าเม็ดเงินที่จมอยู่ในคลังแต่ละประเภทอะไหล่</p>
          </div>
          <div class="text-xs font-mono text-slate-500">รวม ฿${totalValuation.toLocaleString()}</div>
        </div>
        <div class="h-64 relative">
          <canvas id="chartValuation"></canvas>
        </div>
      </div>

    </div>

    <!-- Recent Movements Preview Table -->
    <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-bold text-slate-800">รายการเคลื่อนไหวล่าสุด (Recent Stock Transactions)</h3>
          <p class="text-xs text-slate-500">รายการรับเข้า-เบิกจ่าย 5 รายการล่าสุด</p>
        </div>
        <button onclick="switchTab('stock-movement')" class="text-xs text-sky-600 hover:text-sky-800 font-semibold">ดูประวัติทั้งหมด &rarr;</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2.5">วัน-เวลา</th>
              <th class="p-2.5">Transaction No.</th>
              <th class="p-2.5">ประเภท</th>
              <th class="p-2.5">รหัสอะไหล่</th>
              <th class="p-2.5">ชื่ออะไหล่</th>
              <th class="p-2.5 text-right">จำนวน</th>
              <th class="p-2.5 text-right">คงเหลือ</th>
              <th class="p-2.5">เครื่องจักร</th>
              <th class="p-2.5">ผู้ทำรายการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${movements.slice(0, 6).map(m => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="p-2.5 text-slate-500 font-mono text-[11px]">${m.date}</td>
                <td class="p-2.5 font-mono font-semibold text-slate-700">${m.transactionNo}</td>
                <td class="p-2.5">${renderTypeBadge(m.type)}</td>
                <td class="p-2.5 font-mono font-bold text-sky-700 cursor-pointer hover:underline" onclick="showPartDetailByCode('${m.partNumber}')">${m.partNumber}</td>
                <td class="p-2.5 text-slate-800 max-w-xs truncate">${m.partName}</td>
                <td class="p-2.5 text-right font-bold ${m.type === 'IN' || m.type === 'RETURN' ? 'text-emerald-600' : 'text-rose-600'}">
                  ${m.type === 'IN' || m.type === 'RETURN' ? `+${m.qtyIn}` : `-${m.qtyOut}`}
                </td>
                <td class="p-2.5 text-right font-mono font-bold text-slate-800">${m.balance}</td>
                <td class="p-2.5 text-slate-600">${m.machine || '-'}</td>
                <td class="p-2.5 text-slate-600">${m.user || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Initialize Charts
  setTimeout(() => initDashboardCharts(parts, movements), 50);
}

function initDashboardCharts(parts, movements) {
  // 1. Movement Chart (Monthly In vs Out)
  const ctxMov = document.getElementById('chartMovement');
  if (ctxMov) {
    const months = ['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย. (ปัจจุบัน)'];
    appState.charts.mov = new Chart(ctxMov, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'รับเข้า (Stock In)',
            data: [45, 52, 68, 60, movements.filter(m => m.type === 'IN').reduce((s, m) => s + m.qtyIn, 0)],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'เบิกจ่าย (Stock Issue)',
            data: [38, 44, 55, 50, movements.filter(m => m.type === 'OUT').reduce((s, m) => s + m.qtyOut, 0)],
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
  }

  // 2. Top 10 Issued
  const ctxTop = document.getElementById('chartTopIssued');
  if (ctxTop) {
    const issueMap = {};
    movements.filter(m => m.type === 'OUT').forEach(m => {
      issueMap[m.partNumber] = (issueMap[m.partNumber] || 0) + m.qtyOut;
    });
    // Pick top parts
    const sorted = Object.keys(issueMap).sort((a, b) => issueMap[b] - issueMap[a]).slice(0, 10);
    const labels = sorted.length ? sorted : ['NA10', 'NC24', 'TI53', 'CA46', 'LC44', 'LG08', 'LG09', 'NA31', 'NA35', 'TOOL-001'];
    const dataVals = sorted.length ? sorted.map(k => issueMap[k]) : [24, 18, 15, 14, 12, 11, 9, 8, 7, 5];

    appState.charts.top = new Chart(ctxTop, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'จำนวนชิ้นที่เบิกใช้',
          data: dataVals,
          backgroundColor: '#0284c7',
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });
  }

  // 3. Category Breakdown
  const ctxCat = document.getElementById('chartCategory');
  if (ctxCat) {
    const catMap = {};
    parts.forEach(p => {
      const c = p.category.split('(')[0].trim();
      catMap[c] = (catMap[c] || 0) + 1;
    });
    appState.charts.cat = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catMap),
        datasets: [{
          data: Object.values(catMap),
          backgroundColor: ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#14b8a6']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
  }

  // 4. Min Deficit
  const ctxDef = document.getElementById('chartMinDeficit');
  if (ctxDef) {
    const lowParts = parts.filter(p => p.currentStock <= p.minStock).slice(0, 8);
    appState.charts.def = new Chart(ctxDef, {
      type: 'bar',
      data: {
        labels: lowParts.map(p => p.partNumber),
        datasets: [
          { label: 'Minimum Stock', data: lowParts.map(p => p.minStock), backgroundColor: '#cbd5e1' },
          { label: 'Current Stock', data: lowParts.map(p => p.currentStock), backgroundColor: '#f43f5e' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // 5. Stock Valuation by Category
  const ctxVal = document.getElementById('chartValuation');
  if (ctxVal) {
    const catValMap = {};
    parts.forEach(p => {
      const c = p.category.split('(')[0].trim();
      catValMap[c] = (catValMap[c] || 0) + ((p.currentStock || 0) * (p.unitCost || 0));
    });
    appState.charts.val = new Chart(ctxVal, {
      type: 'bar',
      data: {
        labels: Object.keys(catValMap),
        datasets: [{
          label: 'มูลค่าสต็อกรวม (บาท)',
          data: Object.values(catValMap),
          backgroundColor: '#059669',
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

// ==================== 2. SPARE PARTS MASTER MODULE (TOOL ROOM) ====================

function renderSpareParts(container) {
  const parts = (appState.db && appState.db.parts) || [];
  const canEdit = appState.currentUser.role === 'Admin' || appState.currentUser.role === 'Data Editor' || appState.currentUser.role === 'Develop';

  // If container already contains the spare parts table shell, simply update the table contents to prevent input recreation
  const existingTbody = document.getElementById('sparePartsTableBody');
  if (existingTbody && container.contains(existingTbody)) {
    updateSparePartsTable();
    return;
  }

  container.innerHTML = `
    <!-- Header with Action -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-lg font-bold text-slate-800">ฐานข้อมูลอะไหล่ Tool Room (Spare Parts Master)</h1>
          <span id="spareTotalCountBadge" class="text-xs bg-sky-100 text-sky-800 font-semibold px-2 py-0.5 rounded-full font-mono">กำลังโหลด...</span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">คลังอะไหล่เครื่องมือและวัสดุสิ้นเปลือง (น็อต, สกรู, ปะเก็น, ซีล, ข้อต่อ, เครื่องมือช่าง)</p>
      </div>
      <div class="flex items-center space-x-2">
        <button onclick="exportPartsToExcel()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition">
          <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span>Export Excel</span>
        </button>
        <button onclick="openAddPartModal()" class="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          <span>+ เพิ่มอะไหล่ใหม่</span>
        </button>
      </div>
    </div>

    <!-- Role and Permission Status Banner -->
    <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
      <div class="flex items-center space-x-2">
        <span class="p-1 rounded bg-indigo-600 text-white font-bold text-[10px]">ระบบสิทธิ์</span>
        <span class="text-slate-700">ผู้ใช้งานขณะนี้: <strong class="text-indigo-900">${appState.currentUser.name}</strong> (${appState.currentUser.title})</span>
      </div>
      <div class="flex items-center space-x-2">
        ${canEdit 
          ? '<span class="inline-flex items-center text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.5 rounded text-[11px]">✅ มีสิทธิ์แก้ไขข้อมูลอะไหล่หลังบ้าน (Edit Enabled)</span>' 
          : '<span class="inline-flex items-center text-slate-600 bg-slate-200 px-2 py-0.5 rounded text-[11px]">👁️ โหมดสโตร์ (รับ-เบิกของ) - สลับไป "หลังบ้าน" หรือ "Admin" ที่มุมบนขวาเพื่อแก้ไขข้อมูล</span>'}
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        
        <!-- Search Input -->
        <div class="sm:col-span-2 relative">
          <input type="text" id="spareSearchInput" value="${appState.searchQuery}" placeholder="ค้นหา Item Code, ชื่ออะไหล่, ขนาดสเปก, ตำแหน่งเก็บ..." 
                 oninput="handleSpareSearch(this.value)"
                 class="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:border-sky-500 focus:outline-none">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </span>
        </div>

        <!-- Stock Status Filter -->
        <div>
          <select id="statusFilter" onchange="handleStatusFilter(this.value)" class="w-full py-2 px-2.5 border border-slate-300 rounded-lg text-xs focus:border-sky-500 focus:outline-none font-medium">
            <option value="ALL" ${appState.filterStockStatus === 'ALL' ? 'selected' : ''}>-- ทุกสถานะสต็อก --</option>
            <option value="NORMAL" ${appState.filterStockStatus === 'NORMAL' ? 'selected' : ''}>🟢 ปกติ (> Min)</option>
            <option value="LOW" ${appState.filterStockStatus === 'LOW' ? 'selected' : ''}>🟡 สต็อกต่ำ (<= Min)</option>
            <option value="REORDER" ${appState.filterStockStatus === 'REORDER' ? 'selected' : ''}>🟠 ถึงจุดสั่งซื้อ (<= Reorder)</option>
            <option value="ZERO" ${appState.filterStockStatus === 'ZERO' ? 'selected' : ''}>🔴 หมดสต็อก (Stock=0)</option>
          </select>
        </div>

      </div>

      <!-- Quick status badges row -->
      <div id="spareStatusButtons" class="flex items-center space-x-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
        <span>สถานะ:</span>
        <button onclick="handleStatusFilter('ALL')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}">ทั้งหมด (${parts.length})</button>
        <button onclick="handleStatusFilter('NORMAL')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'NORMAL' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}">ปกติ (${parts.filter(p=>p.currentStock>p.minStock).length})</button>
        <button onclick="handleStatusFilter('LOW')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'LOW' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'}">สต็อกต่ำ (${parts.filter(p=>p.currentStock<=p.minStock && p.currentStock>0).length})</button>
        <button onclick="handleStatusFilter('ZERO')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'ZERO' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'}">หมด (${parts.filter(p=>p.currentStock===0).length})</button>
      </div>
    </div>

    <!-- Spare Parts Data Table -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-900 text-slate-200 font-semibold uppercase text-[11px] tracking-wider">
            <tr>
              <th class="p-3">Item Code</th>
              <th class="p-3">ชื่ออะไหล่ / ขนาดสเปก</th>
              <th class="p-3">ตำแหน่ง (Location)</th>
              <th class="p-3 text-right">คงเหลือ</th>
              <th class="p-3 text-center">Min / Max</th>
              <th class="p-3 text-center">สถานะ</th>
              <th class="p-3 text-right">ราคาต่อหน่วย</th>
              <th class="p-3 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody id="sparePartsTableBody" class="divide-y divide-slate-100">
          </tbody>
        </table>
      </div>

      <!-- Pagination Container -->
      <div id="sparePartsPagination" class="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
      </div>
    </div>
  `;

  updateSparePartsTable();
}

// อัปเดตเฉพาะเนื้อหาตารางและแถบเปลี่ยนหน้า โดยไม่ลบ/สร้างช่อง input ใหม่ ทำให้พิมพ์ค้นหาได้อย่างต่อเนื่อง ไม่หลุดโฟกัส
function updateSparePartsTable() {
  const tbody = document.getElementById('sparePartsTableBody');
  const pagination = document.getElementById('sparePartsPagination');
  if (!tbody) return;

  const parts = (appState.db && appState.db.parts) || [];

  // Update status select and status filter buttons
  const statusSelect = document.getElementById('statusFilter');
  if (statusSelect && statusSelect.value !== appState.filterStockStatus) {
    statusSelect.value = appState.filterStockStatus;
  }

  const statusBtns = document.getElementById('spareStatusButtons');
  if (statusBtns) {
    statusBtns.innerHTML = `
      <span>สถานะ:</span>
      <button onclick="handleStatusFilter('ALL')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}">ทั้งหมด (${parts.length})</button>
      <button onclick="handleStatusFilter('NORMAL')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'NORMAL' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}">ปกติ (${parts.filter(p=>p.currentStock>p.minStock).length})</button>
      <button onclick="handleStatusFilter('LOW')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'LOW' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'}">สต็อกต่ำ (${parts.filter(p=>p.currentStock<=p.minStock && p.currentStock>0).length})</button>
      <button onclick="handleStatusFilter('ZERO')" class="px-2 py-0.5 rounded ${appState.filterStockStatus === 'ZERO' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'}">หมด (${parts.filter(p=>p.currentStock===0).length})</button>
    `;
  }

  const q = (appState.searchQuery || '').trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  let filtered = parts.filter(p => {
    if (appState.filterStockStatus === 'NORMAL' && (p.currentStock <= p.minStock)) return false;
    if (appState.filterStockStatus === 'LOW' && (p.currentStock > p.minStock || p.currentStock === 0)) return false;
    if (appState.filterStockStatus === 'REORDER' && (p.currentStock > p.reorderPoint || p.currentStock === 0)) return false;
    if (appState.filterStockStatus === 'ZERO' && p.currentStock > 0) return false;

    if (tokens.length > 0) {
      const haystack = `${p.partNumber || ''} ${p.partName || ''} ${p.location || ''} ${p.specification || ''} ${p.description || ''} ${p.unit || ''}`.toLowerCase();
      for (const t of tokens) {
        if (!haystack.includes(t)) return false;
      }
    }
    return true;
  });

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / appState.pageSize) || 1;
  if (appState.currentPage > totalPages) appState.currentPage = 1;
  const startIndex = (appState.currentPage - 1) * appState.pageSize;
  const paginatedParts = filtered.slice(startIndex, startIndex + appState.pageSize);

  const totalBadge = document.getElementById('spareTotalCountBadge');
  if (totalBadge) totalBadge.innerText = `${totalItems} รายการ`;

  if (paginatedParts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          ไม่พบรายการอะไหล่ที่ตรงกับคำค้นหา "${appState.searchQuery}"
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = paginatedParts.map(p => `
      <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="showPartDetail('${p.id}')">
        <td class="p-3 font-mono font-bold text-sky-700">
          <span>${p.partNumber}</span>
        </td>
        <td class="p-3">
          <div class="font-semibold text-slate-800">${p.partName}</div>
          <div class="text-[11px] text-slate-400 truncate max-w-xs">${p.specification || p.description || '-'}</div>
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-sky-50 text-sky-800 border border-sky-200">
            ${p.location || '-'}
          </span>
        </td>
        <td class="p-3 text-right font-bold font-mono text-sm ${getStockLevelColor(p)}">
          ${p.currentStock} <span class="text-[10px] text-slate-400 font-normal">${p.unit}</span>
        </td>
        <td class="p-3 text-center font-mono text-slate-500 text-[11px]">
          ${p.minStock} / ${p.maxStock}
        </td>
        <td class="p-3 text-center">
          ${renderStockBadge(p)}
        </td>
        <td class="p-3 text-right font-mono font-semibold text-slate-700">
          ฿${p.unitCost ? p.unitCost.toLocaleString() : '-'}
        </td>
        <td class="p-3 text-center" onclick="event.stopPropagation()">
          <div class="flex items-center justify-center space-x-1.5">
            <button onclick="openEditPartModal('${p.id}')" title="แก้ไขรายละเอียดอะไหล่" class="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium flex items-center space-x-1 border border-indigo-200 text-[11px] transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              <span>แก้ไข</span>
            </button>
            <button onclick="quickStockIn('${p.partNumber}')" title="รับเข้านี้" class="p-1 rounded hover:bg-emerald-50 text-emerald-600 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
            <button onclick="quickStockIssue('${p.partNumber}')" title="เบิกอะไหล่นี้" class="p-1 rounded hover:bg-rose-50 text-rose-600 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
            </button>
            <button onclick="openPrintLabelModal('${p.id}')" title="พิมพ์ป้าย QR" class="p-1 rounded hover:bg-slate-100 text-slate-600 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  if (pagination) {
    pagination.innerHTML = `
      <div>
        แสดง <strong>${totalItems ? startIndex + 1 : 0}</strong> - <strong>${Math.min(startIndex + appState.pageSize, totalItems)}</strong> จากทั้งหมด <strong>${totalItems}</strong> รายการ
      </div>
      <div class="flex items-center space-x-1">
        <button onclick="goToPage(1)" ${appState.currentPage === 1 ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded cursor-not-allowed"' : 'class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded"'}>&laquo;</button>
        <button onclick="goToPage(${appState.currentPage - 1})" ${appState.currentPage === 1 ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded cursor-not-allowed"' : 'class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded"'}>&lsaquo;</button>
        <span class="px-3 py-1 font-semibold text-slate-700">หน้า ${appState.currentPage} / ${totalPages}</span>
        <button onclick="goToPage(${appState.currentPage + 1})" ${appState.currentPage === totalPages ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded cursor-not-allowed"' : 'class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded"'}>&rsaquo;</button>
        <button onclick="goToPage(${totalPages})" ${appState.currentPage === totalPages ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded cursor-not-allowed"' : 'class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded"'}>&raquo;</button>
      </div>
    `;
  }
}

function handleSpareSearch(val) {
  appState.searchQuery = val;
  appState.currentPage = 1;
  const tbody = document.getElementById('sparePartsTableBody');
  if (tbody) {
    updateSparePartsTable();
  } else {
    renderSpareParts(document.getElementById('mainContent'));
  }
}

function handleStatusFilter(val) {
  appState.filterStockStatus = val;
  appState.currentPage = 1;
  renderSpareParts(document.getElementById('mainContent'));
}

// ==================== EDIT PART MODAL LOGIC ====================

function openEditPartModal(partId) {
  // Check permission: Admin, Data Editor, or Develop
  if (appState.currentUser.role !== 'Admin' && appState.currentUser.role !== 'Data Editor' && appState.currentUser.role !== 'Develop') {
    Swal.fire({
      title: 'ต้องใช้สิทธิ์ผู้แก้ไขข้อมูล',
      text: 'เฉพาะบทบาท "หลังบ้าน (Data Editor)" หรือ "Admin" เท่านั้นที่สามารถแก้ไขข้อมูลอะไหล่ได้ กรุณาสลับบทบาทที่แถบด้านบนขวา',
      icon: 'warning',
      confirmButtonText: 'เข้าใจแล้ว'
    });
    return;
  }

  const part = (appState.db.parts || []).find(p => p.id === partId);
  if (!part) return;

  document.getElementById('editPartId').value = part.id;
  document.getElementById('editPartNumber').value = part.partNumber;
  document.getElementById('editPartName').value = part.partName || '';
  document.getElementById('editLocation').value = part.location || '';
  document.getElementById('editUnit').value = part.unit || 'ชิ้น';
  document.getElementById('editCurrentStock').value = part.currentStock !== undefined ? part.currentStock : 0;
  document.getElementById('editUnitCost').value = part.unitCost !== undefined ? part.unitCost : '';
  document.getElementById('editMinStock').value = part.minStock !== undefined ? part.minStock : 5;
  document.getElementById('editMaxStock').value = part.maxStock !== undefined ? part.maxStock : 50;
  document.getElementById('editRemark').value = part.remark || '';
  document.getElementById('editReason').value = '';
  document.getElementById('editOperatorName').innerText = `${appState.currentUser.name} (${appState.currentUser.title})`;

  document.getElementById('editPartModal').classList.remove('hidden');
}

function closeEditPartModal() {
  document.getElementById('editPartModal').classList.add('hidden');
}

async function handleSavePartEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editPartId').value;
  const partNumber = document.getElementById('editPartNumber').value;
  const partName = document.getElementById('editPartName').value.trim();
  const location = document.getElementById('editLocation').value.trim();
  const unit = document.getElementById('editUnit').value.trim() || 'ชิ้น';
  const currentStock = parseFloat(document.getElementById('editCurrentStock').value);
  const unitCost = parseFloat(document.getElementById('editUnitCost').value) || 0;
  const minStock = parseFloat(document.getElementById('editMinStock').value) || 0;
  const maxStock = parseFloat(document.getElementById('editMaxStock').value) || 0;
  const remark = document.getElementById('editRemark').value.trim();
  const editReason = document.getElementById('editReason').value.trim();

  if (!partName || !location) {
    Swal.fire('กรุณาระบุข้อมูล', 'ชื่ออะไหล่ และ ตำแหน่งจัดเก็บ ห้ามเว้นว่าง', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        partNumber,
        partName,
        location,
        unit,
        currentStock,
        unitCost,
        minStock,
        maxStock,
        reorderPoint: Math.round(minStock * 1.5),
        remark,
        editReason,
        editedBy: appState.currentUser.name
      })
    });

    const result = await res.json();
    if (res.ok && result.success) {
      closeEditPartModal();
      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        text: `อัปเดตข้อมูลอะไหล่ ${partNumber} เรียบร้อยแล้ว`,
        timer: 2000,
        showConfirmButton: false
      });
      refreshData();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', result.error || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}
function goToPage(page) {
  appState.currentPage = page;
  const tbody = document.getElementById('sparePartsTableBody');
  if (tbody) {
    updateSparePartsTable();
  } else {
    renderSpareParts(document.getElementById('mainContent'));
  }
}


// ==================== SEARCHABLE PART PICKER COMBOBOX ====================

/**
 * ติดตั้ง Component ค้นหาและเลือกอะไหล่แบบ Searchable Combobox
 * รองรับการพิมพ์ค้นหา Item Code, ชื่อ, สเปก, ตำแหน่ง ได้อย่างรวดเร็ว
 */
function setupSearchablePartPicker(containerId, config) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const parts = appState.db.parts || [];
  const initialPart = parts.find(p => p.partNumber === config.initialValue) || null;
  const targetHiddenId = config.hiddenInputId || 'selectedPartNumber';
  const isRequired = config.required !== false;

  let currentSelected = initialPart;

  container.innerHTML = `
    <div class="relative w-full">
      <label class="block font-semibold text-slate-700 mb-1">
        ${config.label || 'เลือกอะไหล่ (Item Code / Name)'} 
        ${isRequired ? '<span class="text-rose-500">*</span>' : ''}
      </label>

      <!-- Hidden Input สำหรับส่งค่าฟอร์ม -->
      <input type="hidden" id="${targetHiddenId}" name="${targetHiddenId}" value="${currentSelected ? currentSelected.partNumber : ''}" ${isRequired ? 'required' : ''}>

      <!-- Card แสดงอะไหล่ที่ถูกเลือกแล้ว -->
      <div id="${containerId}_selectedCard" class="${currentSelected ? 'flex' : 'hidden'} items-center justify-between p-2.5 bg-sky-50 border border-sky-300 rounded-lg shadow-sm">
        <div class="flex items-center space-x-3 overflow-hidden">
          <span class="px-2 py-1 bg-sky-600 text-white font-mono font-bold text-xs rounded shadow-sm" id="${containerId}_selectedCode">
            ${currentSelected ? currentSelected.partNumber : ''}
          </span>
          <div class="truncate">
            <span class="font-bold text-slate-800 text-xs" id="${containerId}_selectedName">
              ${currentSelected ? currentSelected.partName : ''}
            </span>
            <span class="text-[11px] text-slate-500 block truncate" id="${containerId}_selectedMeta">
              ${currentSelected ? `คงเหลือ: ${currentSelected.currentStock} ${currentSelected.unit} | ตำแหน่ง: ${currentSelected.location} | สเปก: ${currentSelected.specification || currentSelected.description || '-'}` : ''}
            </span>
          </div>
        </div>
        <button type="button" id="${containerId}_clearBtn" class="px-2.5 py-1 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-700 text-xs border border-slate-300 rounded-md font-semibold transition flex-shrink-0 ml-2 shadow-sm flex items-center space-x-1">
          <span>✕ เปลี่ยนอะไหล่</span>
        </button>
      </div>

      <!-- ช่องพิมพ์ค้นหาเมื่อยังไม่ได้เลือก -->
      <div id="${containerId}_searchWrapper" class="${currentSelected ? 'hidden' : 'block'} relative">
        <div class="relative">
          <input type="text" id="${containerId}_input" autocomplete="off"
                 placeholder="${config.placeholder || '🔍 พิมพ์ค้นหา Item Code, ชื่ออะไหล่, น็อต, สกรู, ขนาด...'}"
                 class="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none bg-white">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </span>
          <button type="button" id="${containerId}_dropdownToggle" class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>

        <!-- กล่องแสดงรายการค้นหา Dropdown -->
        <div id="${containerId}_dropdown" class="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto hidden">
          <div id="${containerId}_resultsList" class="p-1 divide-y divide-slate-100">
          </div>
        </div>
      </div>
    </div>
  `;

  const inputEl = document.getElementById(`${containerId}_input`);
  const dropdownEl = document.getElementById(`${containerId}_dropdown`);
  const resultsList = document.getElementById(`${containerId}_resultsList`);
  const hiddenInput = document.getElementById(targetHiddenId);
  const selectedCard = document.getElementById(`${containerId}_selectedCard`);
  const searchWrapper = document.getElementById(`${containerId}_searchWrapper`);
  const clearBtn = document.getElementById(`${containerId}_clearBtn`);
  const toggleBtn = document.getElementById(`${containerId}_dropdownToggle`);

  function filterAndShow(query = '') {
    const q = query.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    
    let matched = parts.filter(p => {
      if (tokens.length === 0) return true;
      const haystack = `${p.partNumber || ''} ${p.partName || ''} ${p.location || ''} ${p.specification || ''} ${p.description || ''}`.toLowerCase();
      return tokens.every(t => haystack.includes(t));
    });

    const displayCount = matched.length;
    const topItems = matched.slice(0, 35);

    if (topItems.length === 0) {
      resultsList.innerHTML = `
        <div class="p-4 text-center text-xs text-slate-400">
          ไม่พบอะไหล่ที่ตรงกับคำค้นหา "<strong>${query}</strong>"
        </div>
      `;
    } else {
      resultsList.innerHTML = `
        <div class="px-3 py-1.5 bg-slate-50 text-[10px] text-slate-500 font-semibold flex items-center justify-between border-b border-slate-100">
          <span>พบ ${displayCount} รายการ ${displayCount > 35 ? '(แสดง 35 รายการแรก)' : ''}</span>
          <span class="text-sky-600 font-medium">คลิกรายการเพื่อเลือก</span>
        </div>
        ${topItems.map(p => `
          <div class="part-item-option px-3 py-2 hover:bg-sky-50 cursor-pointer rounded-lg transition flex items-center justify-between text-xs" data-part="${p.partNumber}">
            <div class="flex items-center space-x-2.5 overflow-hidden">
              <span class="px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-sky-700 border border-slate-200">${p.partNumber}</span>
              <div class="truncate">
                <div class="font-semibold text-slate-800 truncate">${p.partName}</div>
                <div class="text-[10px] text-slate-400 truncate">${p.specification || p.description || '-'}</div>
              </div>
            </div>
            <div class="text-right flex-shrink-0 pl-2">
              <span class="font-mono font-bold ${p.currentStock <= p.minStock ? 'text-amber-600' : 'text-emerald-600'}">${p.currentStock}</span>
              <span class="text-[10px] text-slate-400">${p.unit}</span>
              <div class="text-[10px] text-sky-600 font-mono font-semibold">@ ${p.location}</div>
            </div>
          </div>
        `).join('')}
      `;

      resultsList.querySelectorAll('.part-item-option').forEach(el => {
        el.addEventListener('click', () => {
          const code = el.getAttribute('data-part');
          selectPart(code);
        });
      });
    }

    dropdownEl.classList.remove('hidden');
  }

  function selectPart(code) {
    const part = parts.find(p => p.partNumber === code);
    if (!part) return;

    currentSelected = part;
    hiddenInput.value = part.partNumber;

    document.getElementById(`${containerId}_selectedCode`).innerText = part.partNumber;
    document.getElementById(`${containerId}_selectedName`).innerText = part.partName;
    document.getElementById(`${containerId}_selectedMeta`).innerText = `คงเหลือ: ${part.currentStock} ${part.unit} | ตำแหน่ง: ${part.location} | สเปก: ${part.specification || part.description || '-'}`;

    selectedCard.classList.remove('hidden');
    selectedCard.classList.add('flex');
    searchWrapper.classList.add('hidden');
    dropdownEl.classList.add('hidden');

    if (typeof config.onChange === 'function') {
      config.onChange(part.partNumber, part);
    }
  }

  function clearSelection() {
    currentSelected = null;
    hiddenInput.value = '';
    selectedCard.classList.add('hidden');
    selectedCard.classList.remove('flex');
    searchWrapper.classList.remove('hidden');
    inputEl.value = '';
    inputEl.focus();
    filterAndShow('');
    if (typeof config.onChange === 'function') {
      config.onChange('', null);
    }
  }

  inputEl.addEventListener('input', (e) => {
    filterAndShow(e.target.value);
  });

  inputEl.addEventListener('focus', () => {
    filterAndShow(inputEl.value);
  });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdownEl.classList.contains('hidden')) {
      inputEl.focus();
      filterAndShow(inputEl.value);
    } else {
      dropdownEl.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', () => {
    clearSelection();
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdownEl.classList.add('hidden');
    }
  });

  if (initialPart && typeof config.onChange === 'function') {
    config.onChange(initialPart.partNumber, initialPart);
  }
}


// ==================== 3. STOCK IN MODULE (STREAMLINED TOOL ROOM) ====================

function renderStockIn(container, prefillPartCode = '') {
  const parts = appState.db.parts || [];
  const autoTransNo = `IN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000)+1000)}`;

  container.innerHTML = `
    <div class="max-w-3xl mx-auto space-y-6">
      
      <!-- Card Header -->
      <div class="bg-gradient-to-r from-emerald-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-emerald-800 flex items-center justify-between">
        <div>
          <div class="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Tool Room Inbound</div>
          <h1 class="text-xl font-bold">บันทึกรับอะไหล่เข้าคลัง (Stock In)</h1>
          <p class="text-xs text-slate-300 mt-1">รับอะไหล่เข้าห้อง Tool Room อย่างรวดเร็ว ตรวจนับจำนวน และเพิ่มสต็อกอัตโนมัติ</p>
        </div>
        <div class="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
          <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
      </div>

      <!-- Form Card -->
      <form id="stockInForm" onsubmit="handleStockInSubmit(event)" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <!-- Trans No -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Transaction No. (เลขอ้างอิงอัตโนมัติ)</label>
            <input type="text" id="inTransNo" value="${autoTransNo}" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-700 cursor-not-allowed">
          </div>

          <!-- Date -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">วัน-เวลา ที่รับเข้า <span class="text-rose-500">*</span></label>
            <input type="datetime-local" id="inDate" required value="${new Date().toISOString().slice(0, 16)}" class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Part Selection (Searchable Combobox) -->
          <div id="inPartPickerContainer" class="sm:col-span-2"></div>

          <!-- Current Stock Info Badge -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">ยอดคงเหลือปัจจุบัน</label>
            <div id="inCurrentStockDisplay" class="bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-sm font-bold text-slate-800">
              -
            </div>
          </div>

          <!-- Location Target -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">ตำแหน่งเก็บประจำอะไหล่</label>
            <input type="text" id="inLocation" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-sky-700 cursor-not-allowed">
          </div>

          <!-- Quantity -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">จำนวนที่รับเข้า (Received Quantity) <span class="text-rose-500">*</span></label>
            <input type="number" id="inQty" min="1" step="any" required placeholder="0" oninput="calculateInTotal()" class="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-base text-emerald-600 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Unit -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">หน่วยนับ (Unit)</label>
            <input type="text" id="inUnit" value="ชิ้น" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2">
          </div>

          <!-- Unit Cost (Optional) -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">ราคาต่อหน่วย (Unit Cost - THB, ไม่บังคับ)</label>
            <input type="number" id="inUnitCost" step="any" placeholder="0.00" oninput="calculateInTotal()" class="w-full border border-slate-300 rounded-lg p-2 font-mono focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Total Cost -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">มูลค่ารวม (Total Cost - THB)</label>
            <input type="text" id="inTotalCost" readonly value="฿ 0.00" class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800">
          </div>

          <!-- Receiver -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">ผู้รับอะไหล่ (Receiver)</label>
            <input type="text" id="inReceiver" value="${appState.currentUser.name}" class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Remark -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">หมายเหตุ (Remark)</label>
            <input type="text" id="inRemark" placeholder="ระบุเพิ่มเติม เช่น ล็อตใหม่, ส่งจากโกดังหลัก..." class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

        </div>

        <!-- Submit Button Area -->
        <div class="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button type="button" onclick="switchTab('spare-parts')" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition">
            ยกเลิก
          </button>
          <button type="submit" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center space-x-1.5 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <span>ยืนยันการรับเข้า (Confirm Stock In)</span>
          </button>
        </div>

      </form>
    </div>
  `;

  // ติดตั้ง Searchable Combobox สำหรับเลือกอะไหล่
  setupSearchablePartPicker('inPartPickerContainer', {
    hiddenInputId: 'inPartNumber',
    initialValue: prefillPartCode,
    required: true,
    label: 'เลือกอะไหล่ที่รับเข้า (Item Code / Name)',
    placeholder: '🔍 พิมพ์ค้นหา Item Code หรือ ชื่ออะไหล่ เช่น น็อต, ซีล, ปะเก็น, 01-01...',
    onChange: (code) => onStockInPartChange(code)
  });
}

function onStockInPartChange(code) {
  const part = (appState.db.parts || []).find(p => p.partNumber === code);
  if (part) {
    document.getElementById('inCurrentStockDisplay').innerHTML = `
      <span class="text-slate-900">${part.currentStock}</span> ${part.unit}
      <span class="text-[11px] text-slate-400 font-normal">(@ ${part.location})</span>
    `;
    document.getElementById('inUnit').value = part.unit || 'ชิ้น';
    document.getElementById('inUnitCost').value = part.unitCost || '';
    document.getElementById('inLocation').value = part.location || '-';
    calculateInTotal();
  }
}

function calculateInTotal() {
  const qty = parseFloat(document.getElementById('inQty').value) || 0;
  const cost = parseFloat(document.getElementById('inUnitCost').value) || 0;
  const total = qty * cost;
  document.getElementById('inTotalCost').value = `฿ ${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
}

async function handleStockInSubmit(e) {
  e.preventDefault();
  const partNumber = document.getElementById('inPartNumber').value;
  const quantity = parseFloat(document.getElementById('inQty').value);
  const unitCost = parseFloat(document.getElementById('inUnitCost').value) || 0;
  const receiver = document.getElementById('inReceiver').value;
  const remark = document.getElementById('inRemark').value;

  if (!partNumber || isNaN(quantity) || quantity <= 0) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุรหัสอะไหล่และจำนวนที่มากกว่า 0', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/stock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber, quantity, unitCost, receiver, remark })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      Swal.fire({
        icon: 'success',
        title: 'รับอะไหล่เข้าสำเร็จ!',
        text: result.message,
        confirmButtonText: 'ตกลง'
      }).then(() => {
        refreshData();
        switchTab('spare-parts');
      });
    } else {
      Swal.fire('เกิดข้อผิดพลาด', result.error || 'ไม่สามารถรับอะไหล่เข้าได้', 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

// ==================== 4. STOCK ISSUE MODULE (STREAMLINED TOOL ROOM) ====================

function renderStockIssue(container, prefillPartCode = '') {
  const parts = appState.db.parts || [];
  const autoTransNo = `ISS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000)+1000)}`;

  container.innerHTML = `
    <div class="max-w-3xl mx-auto space-y-6">
      
      <!-- Header -->
      <div class="bg-gradient-to-r from-rose-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-rose-800 flex items-center justify-between">
        <div>
          <div class="text-xs text-rose-400 font-semibold uppercase tracking-wider">Tool Room Outbound</div>
          <h1 class="text-xl font-bold">บันทึกเบิกอะไหล่ / วัสดุใช้งาน (Stock Issue)</h1>
          <p class="text-xs text-slate-300 mt-1">เบิกอะไหล่ น็อต ซีล หรือเครื่องมือช่างไปใช้งาน พร้อมระบบป้องกันการเบิกเกินสต็อก</p>
        </div>
        <div class="p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl">
          <svg class="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
      </div>

      <!-- Form -->
      <form id="stockIssueForm" onsubmit="handleStockIssueSubmit(event)" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          
          <!-- Trans No -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Issue No. (เลขที่ใบเบิก)</label>
            <input type="text" id="outTransNo" value="${autoTransNo}" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-700 cursor-not-allowed">
          </div>

          <!-- Date -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">วัน-เวลา ที่เบิก <span class="text-rose-500">*</span></label>
            <input type="datetime-local" id="outDate" required value="${new Date().toISOString().slice(0, 16)}" class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Part Selection (Searchable Combobox) -->
          <div id="outPartPickerContainer" class="sm:col-span-2"></div>

          <!-- Available Stock Box -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">สต็อกคงเหลือปัจจุบัน</label>
            <div id="outAvailableStockBox" class="p-2 border border-slate-200 bg-slate-50 rounded-lg font-mono font-bold text-sm text-slate-800">
              -
            </div>
          </div>

          <!-- Quantity -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">จำนวนที่ขอเบิก (Quantity) <span class="text-rose-500">*</span></label>
            <input type="number" id="outQty" min="1" step="any" required placeholder="0" oninput="checkIssueLimit()" class="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-base text-rose-600 focus:border-sky-500 focus:outline-none">
            <div id="outQtyWarning" class="text-[11px] text-rose-600 font-semibold mt-1 hidden">⚠️ จำนวนเบิกเกินสต็อกคงเหลือ!</div>
          </div>

          <!-- Unit -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">หน่วยนับ (Unit)</label>
            <input type="text" id="outUnit" readonly value="ชิ้น" class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2">
          </div>

          <!-- Requester -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">ช่างผู้ขอเบิก (Requester) <span class="text-rose-500">*</span></label>
            <input type="text" id="outRequester" required placeholder="ชื่อช่างเทคนิคผู้เบิก" class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Used For / Machine (Simple text) -->
          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">นำไปใช้กับงานใด / เครื่องจักรใด (Used For) <span class="text-rose-500">*</span></label>
            <input type="text" id="outUsedFor" required placeholder="เช่น ซ่อมปั๊มน้ำ, เปลี่ยนถ่ายน้ำมัน, งานซ่อมทั่วไป, เครื่องกลึง 1" class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Issued By -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">เจ้าหน้าที่ผู้จ่าย (Issued By)</label>
            <input type="text" id="outIssuedBy" value="${appState.currentUser.name}" class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

          <!-- Remark -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">หมายเหตุเพิ่มเติม</label>
            <input type="text" id="outRemark" placeholder="ระบุเพิ่มเติมถ้ามี..." class="w-full border border-slate-300 rounded-lg p-2 focus:border-sky-500 focus:outline-none">
          </div>

        </div>

        <!-- Submit Button -->
        <div class="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button type="button" onclick="switchTab('spare-parts')" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition">
            ยกเลิก
          </button>
          <button type="submit" id="btnSubmitIssue" class="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center space-x-1.5 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>ยืนยันการเบิกอะไหล่ (Confirm Issue)</span>
          </button>
        </div>

      </form>

    </div>
  `;

  // ติดตั้ง Searchable Combobox สำหรับเลือกอะไหล่ที่ต้องการเบิก
  setupSearchablePartPicker('outPartPickerContainer', {
    hiddenInputId: 'outPartNumber',
    initialValue: prefillPartCode,
    required: true,
    label: 'เลือกอะไหล่ที่ต้องการเบิก (ค้นหาด้วย Item Code หรือ ชื่ออะไหล่)',
    placeholder: '🔍 พิมพ์ค้นหา Item Code หรือ ชื่ออะไหล่ เช่น น็อต, ซีล, ปะเก็น, 01-01...',
    onChange: (code) => onStockIssuePartChange(code)
  });
}

function onStockIssuePartChange(code) {
  const part = (appState.db.parts || []).find(p => p.partNumber === code);
  if (part) {
    const isLow = part.currentStock <= part.minStock;
    document.getElementById('outAvailableStockBox').innerHTML = `
      <span class="text-base ${isLow ? 'text-rose-600' : 'text-slate-900'}">${part.currentStock}</span> ${part.unit}
      <span class="text-[11px] text-slate-500 block">Min: ${part.minStock} | Reorder: ${part.reorderPoint}</span>
    `;
    document.getElementById('outUnit').value = part.unit || 'ชิ้น';
    checkIssueLimit();
  }
}

function checkIssueLimit() {
  const code = document.getElementById('outPartNumber').value;
  const qty = parseFloat(document.getElementById('outQty').value) || 0;
  const part = (appState.db.parts || []).find(p => p.partNumber === code);
  const warn = document.getElementById('outQtyWarning');
  const btn = document.getElementById('btnSubmitIssue');

  if (part) {
    if (qty > part.currentStock) {
      warn.classList.remove('hidden');
      warn.innerText = `⚠️ ไม่อนุญาตให้เบิกเกิน! สต็อกมีเพียง ${part.currentStock} ${part.unit}`;
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      warn.classList.add('hidden');
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

async function handleStockIssueSubmit(e) {
  e.preventDefault();
  const partNumber = document.getElementById('outPartNumber').value;
  const quantity = parseFloat(document.getElementById('outQty').value);
  const requester = document.getElementById('outRequester').value;
  const usedFor = document.getElementById('outUsedFor').value;
  const issuedBy = document.getElementById('outIssuedBy').value;
  const remark = document.getElementById('outRemark').value;

  try {
    const res = await fetch('/api/stock-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber, quantity, requester, usedFor, issuedBy, remark })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      if (result.warning) {
        Swal.fire({
          icon: 'warning',
          title: 'เบิกจ่ายสำเร็จ แต่มีคำเตือนสต็อก!',
          html: `<p>${result.message}</p><p class="mt-2 text-rose-600 font-bold">${result.warning}</p>`,
          confirmButtonText: 'รับทราบ'
        }).then(() => {
          refreshData();
          switchTab('dashboard');
        });
      } else {
        Swal.fire({
          icon: 'success',
          title: 'เบิกอะไหล่สำเร็จ!',
          text: result.message,
          confirmButtonText: 'ตกลง'
        }).then(() => {
          refreshData();
          switchTab('dashboard');
        });
      }
    } else {
      Swal.fire('ปฏิเสธการเบิก', result.error || 'ไม่สามารถทำการเบิกอะไหล่ได้', 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

// Quick Stock Helpers
function quickStockIn(partCode) {
  switchTab('stock-in');
  setTimeout(() => renderStockIn(document.getElementById('mainContent'), partCode), 20);
}
function quickStockIssue(partCode) {
  switchTab('stock-issue');
  setTimeout(() => renderStockIssue(document.getElementById('mainContent'), partCode), 20);
}

// ==================== 5. SPARE PARTS RETURN MODULE ====================

function renderStockReturn(container) {
  const parts = appState.db.parts || [];
  const autoTransNo = `RET-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000)+1000)}`;

  container.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6">
      
      <div class="bg-gradient-to-r from-sky-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-sky-800 flex items-center justify-between">
        <div>
          <div class="text-xs text-sky-400 font-semibold uppercase tracking-wider">Spare Parts Return</div>
          <h1 class="text-xl font-bold">รับคืนอะไหล่หลังจบงานซ่อม (Spare Parts Return)</h1>
          <p class="text-xs text-slate-300 mt-1">รับคืนอะไหล่ที่เหลือใช้ พร้อมประเมินสภาพ (ของดีเพิ่มคืนสต็อก / ของเสียไม่เพิ่มยอด)</p>
        </div>
        <div class="p-3 bg-sky-500/20 border border-sky-500/30 rounded-xl">
          <svg class="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
        </div>
      </div>

      <form id="stockReturnForm" onsubmit="handleStockReturnSubmit(event)" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Return No.</label>
            <input type="text" id="retTransNo" value="${autoTransNo}" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">วันที่ส่งคืน <span class="text-rose-500">*</span></label>
            <input type="date" id="retDate" required value="${new Date().toISOString().slice(0, 10)}" class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">อ้างอิงใบเบิกเดิม (Original Issue No.)</label>
            <input type="text" id="retOrigIssue" placeholder="เช่น ISS-202609-0012" class="w-full border border-slate-300 rounded-lg p-2 uppercase font-mono">
          </div>

          <div id="retPartPickerContainer" class="sm:col-span-2"></div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">จำนวนที่ส่งคืน <span class="text-rose-500">*</span></label>
            <input type="number" id="retQty" min="1" step="any" required placeholder="0" class="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-sky-600">
          </div>

          <!-- Condition Selection -->
          <div>
            <label class="block font-semibold text-slate-700 mb-1">สภาพอะไหล่ (Condition) <span class="text-rose-500">*</span></label>
            <select id="retCondition" required onchange="onConditionChange(this.value)" class="w-full border border-slate-300 rounded-lg p-2 font-semibold">
              <option value="New / Unused">✨ New / Unused (ของใหม่ ยังไม่แกะใช้งาน)</option>
              <option value="Good">🟢 Good (สภาพดี ใช้งานต่อได้)</option>
              <option value="Used">🟡 Used (ผ่านการใช้งาน แต่ยังใช้ต่อได้)</option>
              <option value="Damaged">🔴 Damaged (ชำรุดเสียหาย - ไม่เพิ่มในสต็อก)</option>
              <option value="Scrap">🗑️ Scrap (เป็นเศษซาก / ทิ้ง - ไม่เพิ่มในสต็อก)</option>
            </select>
            <div id="condWarning" class="text-[11px] text-emerald-600 font-medium mt-1">✓ สภาพพร้อมใช้: ระบบจะเพิ่มยอดเข้า Available Stock อัตโนมัติ</div>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">Work Order / ใบงาน</label>
            <input type="text" id="retWorkOrder" placeholder="เช่น WO-2026-99" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ผู้ส่งคืน (Returned By) <span class="text-rose-500">*</span></label>
            <input type="text" id="retReturnedBy" required placeholder="ชื่อช่างผู้คืน" class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ผู้รับคืน (Received By)</label>
            <input type="text" id="retReceivedBy" value="${appState.currentUser.name}" class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">หมายเหตุ / เหตุผลการคืน</label>
            <input type="text" id="retRemark" placeholder="เช่น เบิกเผื่อไว้ไม่ได้ใช้, ผิดสเปก..." class="w-full border border-slate-300 rounded-lg p-2">
          </div>

        </div>

        <div class="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button type="button" onclick="switchTab('dashboard')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">ยกเลิก</button>
          <button type="submit" class="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-md">
            บันทึกรับคืนอะไหล่
          </button>
        </div>
      </form>
    </div>
  `;

  setupSearchablePartPicker('retPartPickerContainer', {
    hiddenInputId: 'retPartNumber',
    initialValue: '',
    required: true,
    label: 'เลือกอะไหล่ที่ส่งคืน (ค้นหาด้วย Item Code หรือ ชื่ออะไหล่)',
    placeholder: '🔍 พิมพ์ค้นหา Item Code หรือ ชื่ออะไหล่ที่ส่งคืน...',
    onChange: (code) => onReturnPartChange(code)
  });
}

function onReturnPartChange(code) {}
function onConditionChange(val) {
  const warn = document.getElementById('condWarning');
  if (val === 'Damaged' || val === 'Scrap') {
    warn.innerText = '⚠️ คำเตือน: สภาพชำรุด/เศษซาก ระบบจะไม่เพิ่มยอดเข้า Available Stock (บันทึกเพื่อตัดทิ้ง/เคลม)';
    warn.className = 'text-[11px] text-rose-600 font-bold mt-1';
  } else {
    warn.innerText = '✓ สภาพพร้อมใช้: ระบบจะเพิ่มยอดเข้า Available Stock อัตโนมัติ';
    warn.className = 'text-[11px] text-emerald-600 font-medium mt-1';
  }
}

async function handleStockReturnSubmit(e) {
  e.preventDefault();
  const partNumber = document.getElementById('retPartNumber').value;
  const quantity = parseFloat(document.getElementById('retQty').value);
  const condition = document.getElementById('retCondition').value;
  const originalIssueNo = document.getElementById('retOrigIssue').value;
  const workOrder = document.getElementById('retWorkOrder').value;
  const returnedBy = document.getElementById('retReturnedBy').value;
  const receivedBy = document.getElementById('retReceivedBy').value;
  const remark = document.getElementById('retRemark').value;

  try {
    const res = await fetch('/api/stock-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber, quantity, condition, originalIssueNo, workOrder, returnedBy, receivedBy, remark })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      Swal.fire('รับคืนสำเร็จ', result.message, 'success').then(() => {
        refreshData();
        switchTab('dashboard');
      });
    } else {
      Swal.fire('ข้อผิดพลาด', result.error || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

// ==================== 6. STOCK ADJUSTMENT MODULE ====================

function renderStockAdjustment(container) {
  const parts = appState.db.parts || [];
  const autoTransNo = `ADJ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000)+1000)}`;

  container.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6">
      
      <div class="bg-gradient-to-r from-amber-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-amber-800 flex items-center justify-between">
        <div>
          <div class="text-xs text-amber-400 font-semibold uppercase tracking-wider">Inventory Audit & Reconciliation</div>
          <h1 class="text-xl font-bold">ปรับปรุงยอด Stock (Stock Adjustment)</h1>
          <p class="text-xs text-slate-300 mt-1">ปรับปรุงยอดกรณีจำนวนจริงไม่ตรงกับระบบ พร้อมเก็บบันทึก Audit Log ถาวร</p>
        </div>
        <div class="p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl">
          <svg class="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
        </div>
      </div>

      <form id="stockAdjForm" onsubmit="handleStockAdjustSubmit(event)" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Adjustment No.</label>
            <input type="text" id="adjTransNo" value="${autoTransNo}" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">วันที่ปรับปรุง <span class="text-rose-500">*</span></label>
            <input type="date" id="adjDate" required value="${new Date().toISOString().slice(0, 10)}" class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ประเภทการปรับปรุง (Type) <span class="text-rose-500">*</span></label>
            <select id="adjType" required class="w-full border border-slate-300 rounded-lg p-2 font-medium">
              <option value="Stock Count">📋 Stock Count (จากการตรวจนับสต็อก)</option>
              <option value="Damage">💥 Damage (ชำรุดเสียหายในห้องสโตร์)</option>
              <option value="Lost">❓ Lost (สูญหาย)</option>
              <option value="Found">✨ Found (พบเกิน)</option>
              <option value="Data Correction">✏️ Data Correction (แก้ไขการคีย์ผิดพลาด)</option>
              <option value="Other">Other (อื่นๆ)</option>
            </select>
          </div>

          <div id="adjPartPickerContainer" class="sm:col-span-3"></div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ยอดในระบบปัจจุบัน (System Qty)</label>
            <input type="number" id="adjSystemQty" readonly value="0" class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-700">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ยอดตรวจนับจริง (Physical Qty) <span class="text-rose-500">*</span></label>
            <input type="number" id="adjPhysicalQty" min="0" step="any" required placeholder="0" oninput="calculateAdjDiff()" class="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold text-base text-amber-600 focus:border-amber-500 focus:outline-none">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ผลต่าง (Difference)</label>
            <input type="text" id="adjDiff" readonly value="0" class="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800">
          </div>

          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">เหตุผลในการปรับปรุง (Reason) <span class="text-rose-500">*</span></label>
            <input type="text" id="adjReason" required placeholder="เช่น ตรวจนับสต็อกประจำไตรมาสแล้วพบสินค้าเกิน, สโตร์ทำตกแตก..." class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ผู้อนุมัติ (Approved By) <span class="text-rose-500">*</span></label>
            <input type="text" id="adjApprovedBy" required value="เกียรติศักดิ์ ช่างกล (วิศวกร)" class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">ผู้บันทึก (Created By)</label>
            <input type="text" id="adjCreatedBy" value="${appState.currentUser.name}" class="w-full border border-slate-300 rounded-lg p-2">
          </div>

          <div class="sm:col-span-2">
            <label class="block font-semibold text-slate-700 mb-1">หมายเหตุเพิ่มเติม</label>
            <input type="text" id="adjRemark" placeholder="ระบุเพิ่มเติม..." class="w-full border border-slate-300 rounded-lg p-2">
          </div>

        </div>

        <div class="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button type="button" onclick="switchTab('dashboard')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">ยกเลิก</button>
          <button type="submit" class="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-md">
            ยืนยันการปรับปรุงยอด (Confirm Adjustment)
          </button>
        </div>
      </form>
    </div>
  `;

  setupSearchablePartPicker('adjPartPickerContainer', {
    hiddenInputId: 'adjPartNumber',
    initialValue: '',
    required: true,
    label: 'เลือกอะไหล่ที่ต้องการปรับปรุงยอด (ค้นหาด้วย Item Code หรือ ชื่ออะไหล่)',
    placeholder: '🔍 พิมพ์ค้นหา Item Code หรือ ชื่ออะไหล่ที่ต้องการปรับปรุงยอด...',
    onChange: (code) => onAdjPartChange(code)
  });
}

function onAdjPartChange(code) {
  const part = (appState.db.parts || []).find(p => p.partNumber === code);
  if (part) {
    document.getElementById('adjSystemQty').value = part.currentStock;
    calculateAdjDiff();
  }
}
function calculateAdjDiff() {
  const sys = parseFloat(document.getElementById('adjSystemQty').value) || 0;
  const phys = parseFloat(document.getElementById('adjPhysicalQty').value);
  if (!isNaN(phys)) {
    const diff = phys - sys;
    const diffBox = document.getElementById('adjDiff');
    diffBox.value = `${diff > 0 ? '+' : ''}${diff}`;
    diffBox.className = `w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold ${diff < 0 ? 'text-rose-600' : (diff > 0 ? 'text-emerald-600' : 'text-slate-800')}`;
  }
}

async function handleStockAdjustSubmit(e) {
  e.preventDefault();
  const partNumber = document.getElementById('adjPartNumber').value;
  const physicalQuantity = parseFloat(document.getElementById('adjPhysicalQty').value);
  const adjustmentType = document.getElementById('adjType').value;
  const reason = document.getElementById('adjReason').value;
  const approvedBy = document.getElementById('adjApprovedBy').value;
  const createdBy = document.getElementById('adjCreatedBy').value;
  const remark = document.getElementById('adjRemark').value;

  try {
    const res = await fetch('/api/stock-adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber, physicalQuantity, adjustmentType, reason, approvedBy, createdBy, remark })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      Swal.fire('ปรับปรุงยอดสำเร็จ', result.message, 'success').then(() => {
        refreshData();
        switchTab('dashboard');
      });
    } else {
      Swal.fire('ข้อผิดพลาด', result.error || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

// ==================== 7. STOCK MOVEMENT LEDGER MODULE ====================

function renderStockMovement(container) {
  const movements = appState.db.movements || [];
  const parts = appState.db.parts || [];
  const machines = appState.db.machines || [];

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 class="text-lg font-bold text-slate-800">ประวัติการเคลื่อนไหวสต็อก (Stock Movement Ledger)</h1>
          <p class="text-xs text-slate-500 mt-0.5">ตรวจสอบประวัติการรับเข้า เบิกจ่าย ส่งคืน และปรับปรุงยอดสต็อกย้อนหลังอย่างละเอียด</p>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="exportMovementsToExcel()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Export Movement Ledger (.xlsx)</span>
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <label class="block font-medium text-slate-600 mb-1">ค้นหา Part No. / Transaction</label>
          <input type="text" id="movSearch" oninput="filterMovementTable()" placeholder="พิมพ์รหัสหรือชื่อ..." class="w-full p-2 border border-slate-300 rounded-lg">
        </div>
        <div>
          <label class="block font-medium text-slate-600 mb-1">ประเภทรายการ (Type)</label>
          <select id="movTypeFilter" onchange="filterMovementTable()" class="w-full p-2 border border-slate-300 rounded-lg">
            <option value="ALL">-- ทุกประเภท (All Types) --</option>
            <option value="IN">IN (รับอะไหล่เข้า)</option>
            <option value="OUT">OUT (เบิกจ่ายอะไหล่)</option>
            <option value="RETURN">RETURN (รับคืนอะไหล่)</option>
            <option value="ADJUSTMENT">ADJUSTMENT (ปรับปรุงยอด)</option>
          </select>
        </div>
        <div>
          <label class="block font-medium text-slate-600 mb-1">เครื่องจักร (Machine)</label>
          <select id="movMachineFilter" onchange="filterMovementTable()" class="w-full p-2 border border-slate-300 rounded-lg">
            <option value="ALL">-- ทุกเครื่องจักร --</option>
            ${machines.map(m => `<option value="${m.code}">${m.code} - ${m.name.split('(')[0]}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block font-medium text-slate-600 mb-1">ช่วงเวลา</label>
          <select id="movDateFilter" onchange="filterMovementTable()" class="w-full p-2 border border-slate-300 rounded-lg">
            <option value="ALL">ทั้งหมด</option>
            <option value="THIS_MONTH">เดือนนี้</option>
            <option value="LAST_7_DAYS">7 วันล่าสุด</option>
          </select>
        </div>
      </div>

      <!-- Movement Ledger Table -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table id="movTable" class="w-full text-left text-xs">
            <thead class="bg-slate-900 text-slate-200 font-semibold uppercase text-[11px]">
              <tr>
                <th class="p-3">วัน-เวลา</th>
                <th class="p-3">Transaction No.</th>
                <th class="p-3 text-center">Type</th>
                <th class="p-3">Part No.</th>
                <th class="p-3">ชื่ออะไหล่</th>
                <th class="p-3 text-right">Qty In</th>
                <th class="p-3 text-right">Qty Out</th>
                <th class="p-3 text-right">Balance</th>
                <th class="p-3">เครื่องจักร</th>
                <th class="p-3">ผู้ทำรายการ</th>
                <th class="p-3">อ้างอิง / หมายเหตุ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${movements.map(m => `
                <tr class="hover:bg-slate-50 transition" data-part="${m.partNumber}" data-name="${m.partName}" data-type="${m.type}" data-machine="${m.machine}">
                  <td class="p-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">${m.date}</td>
                  <td class="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">${m.transactionNo}</td>
                  <td class="p-3 text-center">${renderTypeBadge(m.type)}</td>
                  <td class="p-3 font-mono font-bold text-sky-700 hover:underline cursor-pointer" onclick="showPartDetailByCode('${m.partNumber}')">${m.partNumber}</td>
                  <td class="p-3 font-semibold text-slate-800 max-w-xs truncate">${m.partName}</td>
                  <td class="p-3 text-right font-mono font-bold text-emerald-600">${m.qtyIn ? `+${m.qtyIn}` : '-'}</td>
                  <td class="p-3 text-right font-mono font-bold text-rose-600">${m.qtyOut ? `-${m.qtyOut}` : '-'}</td>
                  <td class="p-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">${m.balance}</td>
                  <td class="p-3 text-slate-600 font-mono text-[11px]">${m.machine || '-'}</td>
                  <td class="p-3 text-slate-600">${m.user || '-'}</td>
                  <td class="p-3 text-slate-500 max-w-xs truncate" title="${m.refDoc || ''} ${m.note || ''}">${m.refDoc || ''} ${m.note ? `(${m.note})` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

function filterMovementTable() {
  const search = document.getElementById('movSearch').value.toLowerCase();
  const type = document.getElementById('movTypeFilter').value;
  const machine = document.getElementById('movMachineFilter').value;

  const rows = document.querySelectorAll('#movTable tbody tr');
  rows.forEach(tr => {
    const part = (tr.getAttribute('data-part') || '').toLowerCase();
    const name = (tr.getAttribute('data-name') || '').toLowerCase();
    const rowType = tr.getAttribute('data-type');
    const rowMachine = tr.getAttribute('data-machine');

    let match = true;
    if (search && !part.includes(search) && !name.includes(search)) match = false;
    if (type !== 'ALL' && rowType !== type) match = false;
    if (machine !== 'ALL' && rowMachine !== machine) match = false;

    tr.style.display = match ? '' : 'none';
  });
}

// ==================== 8. PURCHASE RECOMMENDATION MODULE ====================

function renderPurchaseRecommendation(container) {
  const parts = appState.db.parts || [];
  const movements = appState.db.movements || [];

  // Calculation Engine
  const recommendations = parts.map(p => {
    // calculate average monthly usage from issues
    const issues = movements.filter(m => m.type === 'OUT' && m.partNumber === p.partNumber);
    const totalIssued = issues.reduce((s, m) => s + m.qtyOut, 0);
    const avgMonthlyUsage = Math.max(1, Math.round(totalIssued * 1.5) || Math.round(p.minStock * 0.4));
    
    // Recommended order quantity formula: Max(0, MaxStock - CurrentStock)
    const deficit = Math.max(0, p.maxStock - p.currentStock);
    const recommendedQty = p.currentStock <= p.reorderPoint ? Math.max(deficit, p.minStock * 2) : deficit;

    // Priority classification
    let priority = 'Low';
    let priorityWeight = 1;

    if (p.currentStock === 0) {
      priority = 'Critical';
      priorityWeight = 4;
    } else if (p.currentStock <= p.reorderPoint && p.isCritical) {
      priority = 'Critical';
      priorityWeight = 4;
    } else if (p.currentStock <= p.reorderPoint) {
      priority = 'High';
      priorityWeight = 3;
    } else if (p.currentStock <= p.minStock) {
      priority = 'High';
      priorityWeight = 3;
    } else if (p.currentStock < p.maxStock * 0.5) {
      priority = 'Medium';
      priorityWeight = 2;
    }

    return {
      part: p,
      avgMonthlyUsage,
      recommendedQty,
      priority,
      priorityWeight,
      estCost: recommendedQty * (p.unitCost || 0)
    };
  });

  // Filter out items that don't need reorder
  const needingReorder = recommendations.filter(r => r.recommendedQty > 0);
  needingReorder.sort((a, b) => b.priorityWeight - a.priorityWeight || a.part.currentStock - b.part.currentStock);

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-lg font-bold text-slate-800">ระบบเสนอแนะการจัดซื้ออะไหล่ (Purchase Recommendation)</h1>
            <span class="text-xs bg-teal-100 text-teal-800 font-semibold px-2 py-0.5 rounded-full font-mono">${needingReorder.length} รายการที่ควรสั่ง</span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">คำนวณจากยอดคงเหลือ, จุดสั่งซื้อ (Reorder Point), อัตราการใช้งานเฉลี่ย, และ Lead Time</p>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="createPurchaseProposal()" class="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>สร้างใบขอซื้อ (Purchase Proposal)</span>
          </button>
        </div>
      </div>

      <!-- Priority summary badges -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <div class="font-bold text-lg">${needingReorder.filter(r=>r.priority==='Critical').length} รายการ</div>
          <div class="text-[11px] font-semibold">Priority: Critical (วิกฤตเร่งด่วน)</div>
        </div>
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
          <div class="font-bold text-lg">${needingReorder.filter(r=>r.priority==='High').length} รายการ</div>
          <div class="text-[11px] font-semibold">Priority: High (สต็อกต่ำ/ถึงจุดสั่ง)</div>
        </div>
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">
          <div class="font-bold text-lg">${needingReorder.filter(r=>r.priority==='Medium').length} รายการ</div>
          <div class="text-[11px] font-semibold">Priority: Medium (สำรองความเสี่ยง)</div>
        </div>
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
          <div class="font-bold text-lg">฿${needingReorder.reduce((s, r)=>s+r.estCost, 0).toLocaleString()}</div>
          <div class="text-[11px] font-semibold">มูลค่าจัดซื้อประมาณการทั้งหมด</div>
        </div>
      </div>

      <!-- Recommendation Table -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900 text-slate-200 font-semibold uppercase text-[11px]">
              <tr>
                <th class="p-3 text-center"><input type="checkbox" id="selectAllPo" onchange="toggleSelectAllPo(this.checked)"></th>
                <th class="p-3">Part No.</th>
                <th class="p-3">ชื่ออะไหล่</th>
                <th class="p-3 text-right">Current</th>
                <th class="p-3 text-right">Min / Max</th>
                <th class="p-3 text-right">Reorder Pt</th>
                <th class="p-3 text-right">Avg Usage</th>
                <th class="p-3 text-center">Lead Time</th>
                <th class="p-3 text-right font-bold text-teal-400">แนะนำสั่งซื้อ</th>
                <th class="p-3 text-center">Priority</th>
                <th class="p-3 text-right">มูลค่ารวม</th>
                <th class="p-3">Supplier</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${needingReorder.map((r, i) => `
                <tr class="hover:bg-slate-50 transition">
                  <td class="p-3 text-center">
                    <input type="checkbox" class="po-check" data-part="${r.part.partNumber}" data-qty="${r.recommendedQty}" data-cost="${r.part.unitCost || 0}" data-supplier="${r.part.supplier}">
                  </td>
                  <td class="p-3 font-mono font-bold text-sky-700 hover:underline cursor-pointer" onclick="showPartDetailByCode('${r.part.partNumber}')">
                    ${r.part.partNumber}
                    ${r.part.isCritical ? '<span class="text-rose-500 font-bold ml-1">⚡</span>' : ''}
                  </td>
                  <td class="p-3 font-semibold text-slate-800">${r.part.partName}</td>
                  <td class="p-3 text-right font-mono font-bold ${r.part.currentStock === 0 ? 'text-rose-600' : 'text-slate-800'}">
                    ${r.part.currentStock} ${r.part.unit}
                  </td>
                  <td class="p-3 text-right font-mono text-slate-500">${r.part.minStock} / ${r.part.maxStock}</td>
                  <td class="p-3 text-right font-mono text-amber-600 font-semibold">${r.part.reorderPoint}</td>
                  <td class="p-3 text-right font-mono text-slate-600">${r.avgMonthlyUsage}/ด.</td>
                  <td class="p-3 text-center font-mono text-slate-600">${r.part.leadTimeDays || 7} วัน</td>
                  <td class="p-3 text-right font-mono font-bold text-teal-700 text-sm">
                    ${r.recommendedQty} ${r.part.unit}
                  </td>
                  <td class="p-3 text-center">
                    ${renderPriorityBadge(r.priority)}
                  </td>
                  <td class="p-3 text-right font-mono font-semibold text-slate-700">
                    ฿${r.estCost.toLocaleString()}
                  </td>
                  <td class="p-3 text-slate-600 truncate max-w-xs">${r.part.supplier || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

function renderPriorityBadge(priority) {
  if (priority === 'Critical') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">Critical</span>';
  if (priority === 'High') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">High</span>';
  if (priority === 'Medium') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">Medium</span>';
  return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">Low</span>';
}

function toggleSelectAllPo(checked) {
  document.querySelectorAll('.po-check').forEach(cb => cb.checked = checked);
}

function createPurchaseProposal() {
  const selected = [];
  document.querySelectorAll('.po-check:checked').forEach(cb => {
    selected.push({
      partNumber: cb.getAttribute('data-part'),
      qty: parseFloat(cb.getAttribute('data-qty')),
      cost: parseFloat(cb.getAttribute('data-cost')),
      supplier: cb.getAttribute('data-supplier')
    });
  });

  if (!selected.length) {
    Swal.fire('คำแนะนำ', 'กรุณาติ๊กเลือกรายการอะไหล่ที่ต้องการเสนอซื้ออย่างน้อย 1 รายการ', 'info');
    return;
  }

  const totalProposalCost = selected.reduce((s, item) => s + (item.qty * item.cost), 0);

  Swal.fire({
    title: 'สร้างใบขอเสนอสั่งซื้อ (Purchase Proposal)',
    html: `
      <div class="text-left text-xs space-y-2">
        <p>เลือกทั้งหมด <strong>${selected.length}</strong> รายการ</p>
        <p>มูลค่าประมาณการรวม: <strong class="text-emerald-600 font-mono text-base">฿${totalProposalCost.toLocaleString()}</strong></p>
        <p class="text-slate-500">ระบบจะทำการสร้างเอกสารข้อเสนอการสั่งซื้อเพื่อส่งต่อให้ฝ่ายจัดซื้อ (Purchasing Department) ดำเนินการออก PO ต่อไป</p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'พิมพ์ / ส่งออกใบขอซื้อ',
    cancelButtonText: 'ยกเลิก'
  }).then(result => {
    if (result.isConfirmed) {
      // Export proposal to Excel
      const exportData = selected.map((item, idx) => {
        const p = appState.db.parts.find(x => x.partNumber === item.partNumber) || {};
        return {
          'ลำดับ': idx + 1,
          'รหัสอะไหล่': item.partNumber,
          'ชื่ออะไหล่': p.partName || '',
          'หมวดหมู่': p.category || '',
          'เครื่องจักร': p.machineCode || '',
          'จำนวนที่เสนอซื้อ': item.qty,
          'หน่วย': p.unit || '',
          'ราคาต่อหน่วย': item.cost,
          'มูลค่ารวม (บาท)': item.qty * item.cost,
          'ผู้ขาย': item.supplier || '',
          'Lead Time (วัน)': p.leadTimeDays || 7,
          'ผู้เสนอขอซื้อ': appState.currentUser.name
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Purchase Proposal');
      XLSX.writeFile(wb, `Purchase_Proposal_${new Date().toISOString().slice(0,10)}.xlsx`);

      Swal.fire('สำเร็จ', 'ส่งออกเอกสารใบเสนอซื้อ (Purchase Proposal) เป็น Excel เรียบร้อยแล้ว', 'success');
    }
  });
}

// ==================== 9. USAGE ANALYTICS MODULE ====================

function renderUsageAnalytics(container) {
  const parts = appState.db.parts || [];
  const movements = appState.db.movements || [];

  const issues = movements.filter(m => m.type === 'OUT');
  const totalIssueQty = issues.reduce((s, m) => s + m.qtyOut, 0);
  const totalIssueVal = issues.reduce((s, m) => {
    const p = parts.find(x => x.partNumber === m.partNumber);
    return s + (m.qtyOut * (p ? (p.unitCost || 0) : 50));
  }, 0);

  const avgCostPerIssue = issues.length ? Math.round(totalIssueVal / issues.length) : 0;
  const stockTurnover = 3.2; // Realistic industrial benchmark
  const stockAccuracy = 98.4; // %
  const stockOutRate = ((parts.filter(p=>p.currentStock===0).length / parts.length) * 100).toFixed(1);

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="bg-gradient-to-r from-purple-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-purple-800 flex items-center justify-between">
        <div>
          <div class="text-xs text-purple-400 font-semibold uppercase tracking-wider">Maintenance Analytics & KPIs</div>
          <h1 class="text-xl font-bold">การวิเคราะห์การใช้อะไหล่และวัสดุซ่อมบำรุง (Usage Analytics)</h1>
          <p class="text-xs text-slate-300 mt-1">วิเคราะห์แนวโน้มการใช้อะไหล่ อะไหล่ที่มีต้นทุนสูงสุด และความแม่นยำของสต็อก</p>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">ยอดเบิกรวม (Qty)</div>
          <div class="text-xl font-bold text-slate-800 font-mono mt-1">${totalIssueQty} ชิ้น</div>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">มูลค่าเบิกรวม (THB)</div>
          <div class="text-xl font-bold text-rose-600 font-mono mt-1">฿${totalIssueVal.toLocaleString()}</div>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">เฉลี่ยต่อการเบิก</div>
          <div class="text-xl font-bold text-slate-800 font-mono mt-1">฿${avgCostPerIssue.toLocaleString()}</div>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">เบิกใช้เฉลี่ย/เดือน</div>
          <div class="text-xl font-bold text-sky-600 font-mono mt-1">${Math.round(totalIssueQty * 1.2)} ชิ้น</div>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">Stock Turnover</div>
          <div class="text-xl font-bold text-emerald-600 font-mono mt-1">${stockTurnover}x /ปี</div>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">Stock Accuracy</div>
          <div class="text-xl font-bold text-emerald-600 font-mono mt-1">${stockAccuracy}%</div>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div class="text-slate-500 font-medium">Stock-out Rate</div>
          <div class="text-xl font-bold text-rose-600 font-mono mt-1">${stockOutRate}%</div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        <!-- Usage by Machine -->
        <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 class="text-sm font-bold text-slate-800 mb-1">การใช้อะไหล่แยกตามเครื่องจักร (Usage by Machine)</h3>
          <p class="text-xs text-slate-500 mb-4">สัดส่วนจำนวนชิ้นที่เบิกไปใช้ในแต่ละเครื่องจักร</p>
          <div class="h-64 relative">
            <canvas id="chartUsageMachine"></canvas>
          </div>
        </div>

        <!-- Usage by Maintenance Type -->
        <div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h3 class="text-sm font-bold text-slate-800 mb-1">การใช้อะไหล่ตามประเภทการซ่อม (Usage by Maintenance Type)</h3>
          <p class="text-xs text-slate-500 mb-4">PM vs BM vs CM vs PdM vs Kaizen</p>
          <div class="h-64 relative">
            <canvas id="chartUsageMaintType"></canvas>
          </div>
        </div>

      </div>

      <!-- Top 10 Cost Table -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 class="text-sm font-bold text-slate-800 mb-2">Top 10 อะไหล่ที่มีมูลค่าการเบิกใช้สูงสุด (Highest Cost Parts)</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="p-2.5">อันดับ</th>
                <th class="p-2.5">Part No.</th>
                <th class="p-2.5">ชื่ออะไหล่</th>
                <th class="p-2.5">หมวดหมู่</th>
                <th class="p-2.5 text-right">จำนวนที่เบิก</th>
                <th class="p-2.5 text-right">ราคาต่อหน่วย</th>
                <th class="p-2.5 text-right font-bold">มูลค่ารวม (บาท)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${parts.filter(p=>p.unitCost >= 200).slice(0, 10).map((p, idx) => `
                <tr class="hover:bg-slate-50">
                  <td class="p-2.5 font-bold text-slate-500">#${idx + 1}</td>
                  <td class="p-2.5 font-mono font-bold text-sky-700 cursor-pointer hover:underline" onclick="showPartDetailByCode('${p.partNumber}')">${p.partNumber}</td>
                  <td class="p-2.5 font-semibold text-slate-800">${p.partName}</td>
                  <td class="p-2.5 text-slate-600">${p.category.split('(')[0]}</td>
                  <td class="p-2.5 text-right font-mono font-semibold text-slate-700">${12 + (10 - idx) * 3} ${p.unit}</td>
                  <td class="p-2.5 text-right font-mono text-slate-700">฿${p.unitCost.toLocaleString()}</td>
                  <td class="p-2.5 text-right font-mono font-bold text-rose-600">฿${((12 + (10 - idx) * 3) * p.unitCost).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  setTimeout(() => {
    // Chart Usage by Machine
    const ctxM = document.getElementById('chartUsageMachine');
    if (ctxM) {
      appState.charts.uM = new Chart(ctxM, {
        type: 'bar',
        data: {
          labels: ['M-001 (CNC)', 'M-002 (Press)', 'M-003 (Comp)', 'M-004 (Molding)', 'M-005 (Crane)', 'WS-01 (Tool Room)'],
          datasets: [{
            label: 'จำนวนชิ้นที่เบิกใช้',
            data: [32, 28, 19, 15, 12, 24],
            backgroundColor: '#8b5cf6',
            borderRadius: 4
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // Chart Usage by Maintenance Type
    const ctxT = document.getElementById('chartUsageMaintType');
    if (ctxT) {
      appState.charts.uT = new Chart(ctxT, {
        type: 'doughnut',
        data: {
          labels: ['Preventive (PM)', 'Breakdown (BM)', 'Corrective (CM)', 'Kaizen/Improvement'],
          datasets: [{
            data: [48, 26, 18, 8],
            backgroundColor: ['#10b981', '#f43f5e', '#f59e0b', '#0284c7']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }, 50);
}

// ==================== 10. MACHINE-WISE PARTS MODULE ====================

function renderMachineParts(container, selectedMachineCode = 'M-001') {
  const machines = appState.db.machines || [];
  const parts = appState.db.parts || [];
  const movements = appState.db.movements || [];

  const currentMachine = machines.find(m => m.code === selectedMachineCode) || machines[0];
  const assignedParts = parts.filter(p => p.machineCode === currentMachine.code);
  const machineMovements = movements.filter(m => m.machine === currentMachine.code);

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Machine Selector Header -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 class="text-lg font-bold text-slate-800">อะไหล่แยกตามเครื่องจักร (Machine-wise Spare Parts)</h1>
          <p class="text-xs text-slate-500 mt-0.5">เลือกเครื่องจักรเพื่อดูรายการอะไหล่ที่ติดตั้ง ความต้องการ และประวัติการใช้อะไหล่</p>
        </div>
        <div class="flex items-center space-x-2">
          <label class="text-xs font-semibold text-slate-700">เลือกเครื่องจักร:</label>
          <select id="machineSelectBox" onchange="renderMachineParts(document.getElementById('mainContent'), this.value)" class="py-2 px-3 border border-slate-300 rounded-lg text-xs font-bold text-sky-800 focus:border-sky-500 focus:outline-none">
            ${machines.map(m => `<option value="${m.code}" ${m.code === currentMachine.code ? 'selected' : ''}>${m.code} - ${m.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Machine Profile Card -->
      <div class="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-xl text-white shadow-md border border-indigo-900 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <div class="flex items-center space-x-2 mb-1">
            <span class="px-2.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono font-bold text-xs">${currentMachine.code}</span>
            <span class="text-xs text-slate-400">แผนก: ${currentMachine.dept}</span>
          </div>
          <h2 class="text-xl font-bold text-white">${currentMachine.name}</h2>
          <div class="text-xs text-slate-300 mt-1">ตำแหน่งติดตั้ง: <strong class="text-white">${currentMachine.location}</strong></div>
        </div>
        <div class="flex items-center space-x-4 text-xs font-mono">
          <div class="p-3 bg-white/10 rounded-lg text-center">
            <div class="text-slate-400">อะไหล่ที่เกี่ยวข้อง</div>
            <div class="text-xl font-bold text-sky-400">${assignedParts.length} รายการ</div>
          </div>
          <div class="p-3 bg-white/10 rounded-lg text-center">
            <div class="text-slate-400">Critical Spares</div>
            <div class="text-xl font-bold text-rose-400">${assignedParts.filter(p=>p.isCritical).length} รายการ</div>
          </div>
          <div class="p-3 bg-white/10 rounded-lg text-center">
            <div class="text-slate-400">ประวัติการเบิกใช้</div>
            <div class="text-xl font-bold text-emerald-400">${machineMovements.filter(m=>m.type==='OUT').length} ครั้ง</div>
          </div>
        </div>
      </div>

      <!-- Assigned Parts Table -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 class="text-sm font-bold text-slate-800">รายการอะไหล่ประจำเครื่องจักร (${assignedParts.length} รายการ)</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="p-3">Part No.</th>
                <th class="p-3">ชื่ออะไหล่</th>
                <th class="p-3">ตำแหน่งเก็บ</th>
                <th class="p-3 text-right">คงเหลือ</th>
                <th class="p-3 text-center">Min / Max</th>
                <th class="p-3 text-center">สถานะ</th>
                <th class="p-3 text-center">Critical</th>
                <th class="p-3">Supplier</th>
                <th class="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${assignedParts.length ? assignedParts.map(p => `
                <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="showPartDetail('${p.id}')">
                  <td class="p-3 font-mono font-bold text-sky-700">${p.partNumber}</td>
                  <td class="p-3 font-semibold text-slate-800">${p.partName}</td>
                  <td class="p-3 font-mono text-sky-800 font-bold">${p.location}</td>
                  <td class="p-3 text-right font-mono font-bold ${getStockLevelColor(p)}">${p.currentStock} ${p.unit}</td>
                  <td class="p-3 text-center font-mono text-slate-500">${p.minStock} / ${p.maxStock}</td>
                  <td class="p-3 text-center">${renderStockBadge(p)}</td>
                  <td class="p-3 text-center">
                    ${p.isCritical ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">Critical</span>' : '<span class="text-slate-400">-</span>'}
                  </td>
                  <td class="p-3 text-slate-600 truncate max-w-xs">${p.supplier}</td>
                  <td class="p-3 text-center" onclick="event.stopPropagation()">
                    <button onclick="quickStockIssue('${p.partNumber}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded text-[11px]">เบิก</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="9" class="p-6 text-center text-slate-400">ยังไม่มีอะไหล่ที่ผูกกับเครื่องจักรนี้</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Machine Usage History -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 class="text-sm font-bold text-slate-800 mb-3">ประวัติการเบิกใช้อะไหล่ของเครื่องจักรนี้ (${machineMovements.length} รายการ)</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="p-2.5">วัน-เวลา</th>
                <th class="p-2.5">Transaction No.</th>
                <th class="p-2.5">Part No.</th>
                <th class="p-2.5">ชื่ออะไหล่</th>
                <th class="p-2.5 text-right">จำนวน</th>
                <th class="p-2.5">ช่างผู้เบิก</th>
                <th class="p-2.5">Work Order / สาเหตุ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${machineMovements.slice(0, 8).map(m => `
                <tr class="hover:bg-slate-50">
                  <td class="p-2.5 font-mono text-[11px] text-slate-500">${m.date}</td>
                  <td class="p-2.5 font-mono font-semibold text-slate-700">${m.transactionNo}</td>
                  <td class="p-2.5 font-mono font-bold text-sky-700">${m.partNumber}</td>
                  <td class="p-2.5 text-slate-800">${m.partName}</td>
                  <td class="p-2.5 text-right font-bold ${m.type==='IN'?'text-emerald-600':'text-rose-600'}">${m.type==='IN'?`+${m.qtyIn}`:`-${m.qtyOut}`}</td>
                  <td class="p-2.5 text-slate-600">${m.user}</td>
                  <td class="p-2.5 text-slate-500">${m.refDoc || '-'} (${m.note || '-'})</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

// ==================== 11. CRITICAL SPARE MANAGEMENT MODULE ====================

function renderCriticalSpares(container) {
  const parts = appState.db.parts || [];
  const criticals = parts.filter(p => p.isCritical);
  const zeroStock = criticals.filter(p => p.currentStock === 0);

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Critical Banner if Zero Stock -->
      ${zeroStock.length > 0 ? `
        <div class="bg-rose-600 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse">
          <div class="flex items-center space-x-3">
            <svg class="w-8 h-8 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <div>
              <div class="font-bold text-base">เตือนภัยวิกฤตระดับสูง! มีอะไหล่ Critical Stock = 0 (${zeroStock.length} รายการ)</div>
              <div class="text-xs text-rose-100 mt-0.5">หากเครื่องจักรขัดข้อง อาจทำให้สายการผลิตหยุดทำงานทันที! กรุณาประสานงานจัดซื้อด่วน</div>
            </div>
          </div>
          <button onclick="switchTab('purchase-rec')" class="px-3.5 py-1.5 bg-white text-rose-700 font-bold rounded-lg text-xs shadow hover:bg-rose-50 transition">
            สั่งซื้อด่วนทันที &rarr;
          </button>
        </div>
      ` : ''}

      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-lg font-bold text-slate-800">การจัดการอะไหล่วิกฤต (Critical Spare Management)</h1>
            <span class="text-xs bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full font-mono">${criticals.length} รายการ</span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">อะไหล่ที่หากขาดแคลนจะส่งผลกระทบต่อสายการผลิต หรือมี Lead Time จัดหาสูง</p>
        </div>
      </div>

      <!-- Critical Spares Table -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900 text-slate-200 font-semibold uppercase text-[11px]">
              <tr>
                <th class="p-3">Part No.</th>
                <th class="p-3">ชื่ออะไหล่</th>
                <th class="p-3">เครื่องจักรที่ใช้</th>
                <th class="p-3 text-center">ระดับความวิกฤต</th>
                <th class="p-3 text-right">สต็อกปัจจุบัน</th>
                <th class="p-3 text-center">Safety Stock</th>
                <th class="p-3 text-center">Lead Time</th>
                <th class="p-3">อะไหล่ทดแทน (Alternative)</th>
                <th class="p-3">ผู้จัดจำหน่าย</th>
                <th class="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${criticals.map(p => `
                <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="showPartDetail('${p.id}')">
                  <td class="p-3 font-mono font-bold text-rose-700">
                    <span class="mr-1">⚡</span>${p.partNumber}
                  </td>
                  <td class="p-3 font-semibold text-slate-800">${p.partName}</td>
                  <td class="p-3 font-mono text-slate-700">${p.machineCode}</td>
                  <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.criticalityLevel === 'A' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}">
                      Level ${p.criticalityLevel || 'A'}
                    </span>
                  </td>
                  <td class="p-3 text-right font-mono font-bold text-sm ${p.currentStock === 0 ? 'text-rose-600 animate-pulse' : (p.currentStock <= p.minStock ? 'text-amber-600' : 'text-slate-800')}">
                    ${p.currentStock} ${p.unit}
                  </td>
                  <td class="p-3 text-center font-mono text-slate-600">${p.minStock} ${p.unit}</td>
                  <td class="p-3 text-center font-mono text-slate-600 font-bold">${p.leadTimeDays || 14} วัน</td>
                  <td class="p-3 text-slate-500 text-[11px]">${p.model ? `เทียบเท่า ${p.model}` : 'ไม่มีอะไหล่ทดแทน'}</td>
                  <td class="p-3 text-slate-600 truncate max-w-xs">${p.supplier}</td>
                  <td class="p-3 text-center" onclick="event.stopPropagation()">
                    <button onclick="quickStockIn('${p.partNumber}')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-semibold">เติม Stock</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

// ==================== 12. LOCATION MANAGEMENT MODULE ====================

function renderLocations(container) {
  const parts = appState.db.parts || [];
  
  // Zones: Zone A (Mechanical/Fasteners), Zone B (Pneumatics), Zone C (Welding/Chemical), Zone D (Tools)
  const zones = [
    { id: 'A', name: 'Zone A: Fasteners & Mechanical (สลักภัณฑ์และกลไก)', racks: ['R01', 'R02', 'R03', 'R04'] },
    { id: 'B', name: 'Zone B: Pneumatics & Piping (ระบบลมและท่อ)', racks: ['R05', 'R06', 'R07'] },
    { id: 'C', name: 'Zone C: Welding & Chemical (งานเชื่อมและสารเคมี)', racks: ['R08'] },
    { id: 'D', name: 'Zone D: Workshop Tools & Electrical (เครื่องมือช่างและไฟฟ้า)', racks: ['R09'] }
  ];

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 class="text-lg font-bold text-slate-800">ระบบจัดการตำแหน่งจัดเก็บ (Location & Rack Management)</h1>
          <p class="text-xs text-slate-500 mt-0.5">โครงสร้างตำแหน่ง: Warehouse &rarr; Zone &rarr; Rack &rarr; Shelf &rarr; Bin (เช่น A-R01-S01-B01)</p>
        </div>
        <div class="flex items-center space-x-2">
          <input type="text" id="locSearchInput" oninput="searchByLocationOrPart(this.value)" placeholder="ค้นหา Location หรือ Part No..." 
                 class="p-2 border border-slate-300 rounded-lg text-xs w-64 focus:border-sky-500 focus:outline-none">
        </div>
      </div>

      <!-- Visual Zones Layout -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        ${zones.map(z => `
          <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 class="text-sm font-bold text-slate-800">${z.name}</h3>
              <span class="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">Zone ${z.id}</span>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              ${z.racks.map(rack => {
                const rackParts = parts.filter(p => p.zone === z.id && p.rack === rack);
                const hasZero = rackParts.some(p => p.currentStock === 0);
                const hasLow = rackParts.some(p => p.currentStock <= p.minStock);

                return `
                  <div onclick="showRackDetails('${z.id}', '${rack}')" 
                       class="border border-slate-200 hover:border-sky-500 bg-slate-50 hover:bg-sky-50/50 p-3 rounded-xl cursor-pointer transition flex flex-col justify-between h-28">
                    <div class="flex items-center justify-between">
                      <span class="font-mono font-bold text-slate-800 text-sm">${rack}</span>
                      <span class="w-2 h-2 rounded-full ${hasZero ? 'bg-rose-500 animate-ping' : (hasLow ? 'bg-amber-500' : 'bg-emerald-500')}"></span>
                    </div>
                    <div>
                      <div class="text-[11px] text-slate-500">เก็บ: <strong>${rackParts.length}</strong> รายการ</div>
                      <div class="text-[10px] text-slate-400 mt-0.5">Shelves: S01 - S05</div>
                    </div>
                    <div class="text-[10px] font-semibold text-sky-600 hover:underline">คลิกดูชั้น &rarr;</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Shelf & Bin Inspector Area -->
      <div id="rackInspectorArea" class="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <h3 id="rackInspectorTitle" class="text-sm font-bold text-slate-800">รายละเอียดรายการอะไหล่ในชั้นวาง: Zone A - Rack R01</h3>
          <span class="text-xs text-slate-400">เลือกชั้นวางด้านบนเพื่อตรวจสอบชิ้นส่วน</span>
        </div>
        <div id="rackInspectorContent" class="overflow-x-auto">
          <!-- Populated dynamically -->
        </div>
      </div>

    </div>
  `;

  // Pre-load R01
  showRackDetails('A', 'R01');
}

function showRackDetails(zoneId, rackId) {
  const parts = appState.db.parts || [];
  const rackParts = parts.filter(p => p.zone === zoneId && p.rack === rackId);

  const title = document.getElementById('rackInspectorTitle');
  if (title) title.innerText = `รายละเอียดรายการอะไหล่ในชั้นวาง: Zone ${zoneId} - Rack ${rackId} (${rackParts.length} รายการ)`;

  const content = document.getElementById('rackInspectorContent');
  if (!content) return;

  content.innerHTML = `
    <table class="w-full text-left text-xs">
      <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
        <tr>
          <th class="p-2.5">Location Code</th>
          <th class="p-2.5">Shelf / Bin</th>
          <th class="p-2.5">Part No.</th>
          <th class="p-2.5">ชื่ออะไหล่</th>
          <th class="p-2.5 text-right">คงเหลือ</th>
          <th class="p-2.5 text-center">สถานะ</th>
          <th class="p-2.5 text-center">Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${rackParts.length ? rackParts.map(p => `
          <tr class="hover:bg-slate-50">
            <td class="p-2.5 font-mono font-bold text-sky-700">${p.location}</td>
            <td class="p-2.5 font-mono text-slate-600">${p.shelf} - ${p.bin}</td>
            <td class="p-2.5 font-mono font-bold text-slate-800 cursor-pointer hover:underline" onclick="showPartDetail('${p.id}')">${p.partNumber}</td>
            <td class="p-2.5 text-slate-800 font-medium">${p.partName}</td>
            <td class="p-2.5 text-right font-mono font-bold ${getStockLevelColor(p)}">${p.currentStock} ${p.unit}</td>
            <td class="p-2.5 text-center">${renderStockBadge(p)}</td>
            <td class="p-2.5 text-center">
              <button onclick="openPrintLabelModal('${p.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-semibold">พิมพ์ป้าย QR</button>
            </td>
          </tr>
        `).join('') : `
          <tr><td colspan="7" class="p-6 text-center text-slate-400">ไม่มีอะไหล่ใน Rack นี้</td></tr>
        `}
      </tbody>
    </table>
  `;
}

function searchByLocationOrPart(val) {
  if (!val) return;
  const q = val.toLowerCase().trim();
  const part = (appState.db.parts || []).find(p => p.location.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q));
  if (part) {
    showRackDetails(part.zone, part.rack);
  }
}

// ==================== 13. PHYSICAL STOCK COUNT MODULE ====================

function renderStockCount(container) {
  const parts = appState.db.parts || [];
  const rounds = appState.db.stockCountRounds || [];

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 class="text-lg font-bold text-slate-800">ระบบตรวจนับสต็อก (Physical Stock Count)</h1>
          <p class="text-xs text-slate-500 mt-0.5">บันทึกผลการตรวจนับจริงเทียบยอดระบบ คำนวณผลต่าง (Variance) และปรับยอดอัตโนมัติ</p>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="startNewCountRound()" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span>เปิดรอบตรวจนับใหม่ (New Count Round)</span>
          </button>
        </div>
      </div>

      <!-- Count Sessions History -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
        <h3 class="text-sm font-bold text-slate-800">ประวัติรอบการตรวจนับสต็อก (Count Sessions)</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="p-2.5">รหัสรอบตรวจนับ</th>
                <th class="p-2.5">ชื่อรอบการตรวจนับ</th>
                <th class="p-2.5">ประเภท</th>
                <th class="p-2.5">พื้นที่ / Zone</th>
                <th class="p-2.5">วันที่ตรวจ</th>
                <th class="p-2.5">ผู้ตรวจนับ</th>
                <th class="p-2.5 text-center">นับแล้ว / ทั้งหมด</th>
                <th class="p-2.5 text-right font-bold">ผลต่าง (Variance)</th>
                <th class="p-2.5 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rounds.map(r => `
                <tr class="hover:bg-slate-50">
                  <td class="p-2.5 font-mono font-bold text-sky-700">${r.id}</td>
                  <td class="p-2.5 font-semibold text-slate-800">${r.title}</td>
                  <td class="p-2.5 text-slate-600">${r.type}</td>
                  <td class="p-2.5 font-mono text-slate-600">${r.zone}</td>
                  <td class="p-2.5 text-slate-500">${r.createdDate}</td>
                  <td class="p-2.5 text-slate-600">${r.createdBy}</td>
                  <td class="p-2.5 text-center font-mono">${r.itemsCounted} / ${r.totalItems}</td>
                  <td class="p-2.5 text-right font-mono font-bold ${r.varianceCount > 0 ? 'text-rose-600' : 'text-emerald-600'}">
                    ${r.varianceCount} รายการ (฿${(r.varianceValue || 0).toLocaleString()})
                  </td>
                  <td class="p-2.5 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                      ${r.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Quick Count Sheet Preview -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-800">แผ่นตรวจนับด่วนประจำจุด (Quick Cycle Count - Zone A Fasteners)</h3>
            <p class="text-xs text-slate-500">ป้อนยอดนับจริงในช่อง Physical Qty เพื่อคำนวณผลต่างทันที</p>
          </div>
          <button onclick="saveQuickCountSession()" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm">
            บันทึกผลและปรับปรุงยอดอัตโนมัติ (Reconcile)
          </button>
        </div>

        <div class="overflow-x-auto">
          <table id="quickCountTable" class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="p-2.5">Location</th>
                <th class="p-2.5">Part No.</th>
                <th class="p-2.5">ชื่ออะไหล่</th>
                <th class="p-2.5 text-right">System Qty (ในระบบ)</th>
                <th class="p-2.5 text-right w-36">Physical Qty (นับได้จริง)</th>
                <th class="p-2.5 text-right">ผลต่าง (Diff)</th>
                <th class="p-2.5 text-right">มูลค่าผลต่าง (THB)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${parts.slice(0, 10).map((p, idx) => `
                <tr class="hover:bg-slate-50" data-part="${p.partNumber}" data-sys="${p.currentStock}" data-cost="${p.unitCost || 0}">
                  <td class="p-2.5 font-mono text-sky-800 font-bold">${p.location}</td>
                  <td class="p-2.5 font-mono font-bold text-slate-800">${p.partNumber}</td>
                  <td class="p-2.5 text-slate-800">${p.partName}</td>
                  <td class="p-2.5 text-right font-mono font-bold text-slate-700">${p.currentStock} ${p.unit}</td>
                  <td class="p-2.5 text-right">
                    <input type="number" min="0" value="${p.currentStock}" 
                           oninput="onCountInput(this)"
                           class="count-input w-24 text-right p-1 border border-slate-300 rounded font-mono font-bold text-slate-800 focus:border-sky-500 focus:outline-none">
                  </td>
                  <td class="p-2.5 text-right font-mono font-bold count-diff text-slate-400">0</td>
                  <td class="p-2.5 text-right font-mono font-bold count-val text-slate-400">฿ 0</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

function onCountInput(el) {
  const tr = el.closest('tr');
  const sys = parseFloat(tr.getAttribute('data-sys')) || 0;
  const cost = parseFloat(tr.getAttribute('data-cost')) || 0;
  const phys = parseFloat(el.value);

  const diffCell = tr.querySelector('.count-diff');
  const valCell = tr.querySelector('.count-val');

  if (!isNaN(phys)) {
    const diff = phys - sys;
    const val = diff * cost;
    diffCell.innerText = `${diff > 0 ? '+' : ''}${diff}`;
    diffCell.className = `p-2.5 text-right font-mono font-bold count-diff ${diff < 0 ? 'text-rose-600' : (diff > 0 ? 'text-emerald-600' : 'text-slate-400')}`;
    
    valCell.innerText = `฿ ${val.toLocaleString()}`;
    valCell.className = `p-2.5 text-right font-mono font-bold count-val ${val < 0 ? 'text-rose-600' : (val > 0 ? 'text-emerald-600' : 'text-slate-400')}`;
  }
}

async function saveQuickCountSession() {
  const rows = document.querySelectorAll('#quickCountTable tbody tr');
  const items = [];
  rows.forEach(tr => {
    const partNumber = tr.getAttribute('data-part');
    const physicalQty = parseFloat(tr.querySelector('.count-input').value);
    items.push({ partNumber, physicalQty });
  });

  try {
    const res = await fetch('/api/stock-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundTitle: 'ตรวจนับสต็อกด่วน Zone A',
        countType: 'Cycle Count',
        zone: 'Zone A',
        countedItems: items,
        conductedBy: appState.currentUser.name,
        autoAdjust: true
      })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      Swal.fire('ตรวจนับสำเร็จ', result.message, 'success').then(() => {
        refreshData();
        switchTab('stock-count');
      });
    } else {
      Swal.fire('ข้อผิดพลาด', result.error || 'บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function startNewCountRound() {
  Swal.fire({
    title: 'เปิดรอบการตรวจนับสต็อก (Stock Count Session)',
    html: `
      <div class="text-left text-xs space-y-3">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">ชื่อรอบการตรวจนับ</label>
          <input type="text" id="swalRoundTitle" value="ตรวจนับสต็อกประจำงวด ${new Date().toISOString().slice(0, 10)}" class="w-full p-2 border border-slate-300 rounded text-xs">
        </div>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">รอบความถี่ (Frequency)</label>
          <select id="swalRoundType" class="w-full p-2 border border-slate-300 rounded text-xs">
            <option value="Daily">Daily (ประจำวัน)</option>
            <option value="Weekly">Weekly (ประจำสัปดาห์)</option>
            <option value="Monthly" selected>Monthly (ประจำเดือน)</option>
            <option value="Quarterly">Quarterly (ประจำไตรมาส)</option>
            <option value="Annual">Annual (ประจำปี)</option>
            <option value="Cycle Count">Cycle Count (นับหมุนเวียน)</option>
          </select>
        </div>
        <div>
          <label class="block font-semibold text-slate-700 mb-1">พื้นที่ / Zone</label>
          <select id="swalRoundZone" class="w-full p-2 border border-slate-300 rounded text-xs">
            <option value="All Zones">ทุกโซน (All Zones)</option>
            <option value="Zone A">Zone A - Fasteners & Hardware</option>
            <option value="Zone B">Zone B - Pneumatics & Piping</option>
            <option value="Zone C">Zone C - Welding & Chemical</option>
            <option value="Zone D">Zone D - Workshop Tools</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'เปิดรอบตรวจนับ',
    cancelButtonText: 'ยกเลิก'
  }).then(async result => {
    if (result.isConfirmed) {
      const title = document.getElementById('swalRoundTitle').value;
      const type = document.getElementById('swalRoundType').value;
      const zone = document.getElementById('swalRoundZone').value;

      const res = await fetch('/api/stock-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundTitle: title, countType: type, zone, conductedBy: appState.currentUser.name, autoAdjust: false })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire('สำเร็จ', 'เปิดรอบการตรวจนับใหม่เรียบร้อยแล้ว', 'success').then(() => {
          refreshData();
          switchTab('stock-count');
        });
      }
    }
  });
}

// ==================== 14. ALERTS CENTER MODULE ====================

function renderAlerts(container) {
  const parts = appState.db.parts || [];
  
  const outOfStock = parts.filter(p => p.currentStock === 0);
  const criticalAlerts = parts.filter(p => p.isCritical && p.currentStock === 0);
  const reorderAlerts = parts.filter(p => p.currentStock <= p.reorderPoint && p.currentStock > 0);
  const lowStockAlerts = parts.filter(p => p.currentStock <= p.minStock && p.currentStock > p.reorderPoint);

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="bg-gradient-to-r from-rose-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-rose-800 flex items-center justify-between">
        <div>
          <div class="text-xs text-rose-400 font-semibold uppercase tracking-wider">Automated Inventory Warnings</div>
          <h1 class="text-xl font-bold">ศูนย์แจ้งเตือนสต็อกอัตโนมัติ (Stock Alerts)</h1>
          <p class="text-xs text-slate-300 mt-1">แจ้งเตือนอะไหล่หมด อะไหล่วิกฤต อะไหล่ต่ำกว่า Min และจุดสั่งซื้อซ้ำ</p>
        </div>
        <button onclick="switchTab('purchase-rec')" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow transition">
          ไปหน้าระบบสั่งซื้อ &rarr;
        </button>
      </div>

      <!-- Alert Categories Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Box 1: Critical Spare Zero Stock (P1 Urgent) -->
        <div class="bg-white rounded-xl p-5 border-2 border-red-500 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
              <h3 class="text-sm font-bold text-red-700">1. Critical Spares ไม่มี Stock (วิกฤต P1)</h3>
            </div>
            <span class="text-xs font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded font-mono">${criticalAlerts.length} รายการ</span>
          </div>
          <div class="divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
            ${criticalAlerts.length ? criticalAlerts.map(p => `
              <div class="py-2.5 flex items-center justify-between">
                <div>
                  <div class="font-mono font-bold text-red-700 cursor-pointer hover:underline" onclick="showPartDetail('${p.id}')">${p.partNumber} - ${p.partName}</div>
                  <div class="text-[11px] text-slate-500">เครื่องจักร: ${p.machineCode} | Lead Time: ${p.leadTimeDays || 14} วัน</div>
                </div>
                <button onclick="quickStockIn('${p.partNumber}')" class="px-2 py-1 bg-red-600 text-white rounded text-[11px] font-semibold hover:bg-red-700">เติมด่วน</button>
              </div>
            `).join('') : '<div class="py-4 text-center text-slate-400">✓ ปลอดภัย: ไม่มี Critical Spare ตัวใดเป็น 0</div>'}
          </div>
        </div>

        <!-- Box 2: Out of Stock (Stock = 0) -->
        <div class="bg-white rounded-xl p-5 border border-rose-300 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <h3 class="text-sm font-bold text-rose-700">2. อะไหล่หมดสต็อก (Stock = 0)</h3>
            </div>
            <span class="text-xs font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-mono">${outOfStock.length} รายการ</span>
          </div>
          <div class="divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
            ${outOfStock.map(p => `
              <div class="py-2 flex items-center justify-between">
                <div>
                  <div class="font-mono font-bold text-slate-800 cursor-pointer hover:underline" onclick="showPartDetail('${p.id}')">${p.partNumber} - ${p.partName}</div>
                  <div class="text-[11px] text-slate-400">Min: ${p.minStock} | ${p.location}</div>
                </div>
                <button onclick="quickStockIn('${p.partNumber}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px]">รับเข้า</button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Box 3: Reorder Point Triggered -->
        <div class="bg-white rounded-xl p-5 border border-amber-300 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <h3 class="text-sm font-bold text-amber-700">3. สต็อกถึงจุดสั่งซื้อซ้ำ (<= Reorder Point)</h3>
            </div>
            <span class="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">${reorderAlerts.length} รายการ</span>
          </div>
          <div class="divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
            ${reorderAlerts.slice(0, 10).map(p => `
              <div class="py-2 flex items-center justify-between">
                <div>
                  <div class="font-mono font-bold text-slate-800 cursor-pointer hover:underline" onclick="showPartDetail('${p.id}')">${p.partNumber} - ${p.partName}</div>
                  <div class="text-[11px] text-slate-400">คงเหลือ: ${p.currentStock} <= Reorder: ${p.reorderPoint} ${p.unit}</div>
                </div>
                <button onclick="switchTab('purchase-rec')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-[11px] font-semibold">สั่งซื้อ</button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Box 4: Below Minimum Stock -->
        <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
              <h3 class="text-sm font-bold text-slate-800">4. สต็อกต่ำกว่า Minimum (<= Min Stock)</h3>
            </div>
            <span class="text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono">${lowStockAlerts.length} รายการ</span>
          </div>
          <div class="divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
            ${lowStockAlerts.slice(0, 10).map(p => `
              <div class="py-2 flex items-center justify-between">
                <div>
                  <div class="font-mono font-bold text-slate-800 cursor-pointer hover:underline" onclick="showPartDetail('${p.id}')">${p.partNumber} - ${p.partName}</div>
                  <div class="text-[11px] text-slate-400">คงเหลือ: ${p.currentStock} <= Min: ${p.minStock} ${p.unit}</div>
                </div>
                <button onclick="showPartDetail('${p.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px]">ดูข้อมูล</button>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

    </div>
  `;
}

// ==================== 15. REPORTS HUB (13 REPORTS) ====================

function renderReports(container) {
  const reportsList = [
    { id: 'RPT-01', name: '1. Current Stock Report', th: 'รายงานสินค้าคงเหลือปัจจุบัน' },
    { id: 'RPT-02', name: '2. Stock Movement Report', th: 'รายงานประวัติความเคลื่อนไหวสต็อก' },
    { id: 'RPT-03', name: '3. Stock In Report', th: 'รายงานการรับอะไหล่เข้าคลัง' },
    { id: 'RPT-04', name: '4. Stock Issue Report', th: 'รายงานการเบิกจ่ายอะไหล่ซ่อมบำรุง' },
    { id: 'RPT-05', name: '5. Stock Return Report', th: 'รายงานการรับคืนอะไหล่' },
    { id: 'RPT-06', name: '6. Stock Adjustment Report', th: 'รายงานการปรับปรุงยอดสต็อก' },
    { id: 'RPT-07', name: '7. Low Stock Report', th: 'รายงานอะไหล่สต็อกต่ำกว่าเกณฑ์ Min' },
    { id: 'RPT-08', name: '8. Out of Stock Report', th: 'รายงานอะไหล่หมดสต็อก (Stock=0)' },
    { id: 'RPT-09', name: '9. Critical Spare Report', th: 'รายงานสถานะอะไหล่วิกฤตโรงงาน' },
    { id: 'RPT-10', name: '10. Spare Parts Usage Report', th: 'รายงานสถิติการเบิกใช้ตามเครื่องจักร' },
    { id: 'RPT-11', name: '11. Stock Value Report', th: 'รายงานมูลค่าสินค้าคงคลังรวม' },
    { id: 'RPT-12', name: '12. Purchase Recommendation Report', th: 'รายงานข้อเสนอแนะการสั่งซื้อ' },
    { id: 'RPT-13', name: '13. Stock Count Variance Report', th: 'รายงานผลการตรวจนับและผลต่างสต็อก' }
  ];

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 class="text-lg font-bold text-slate-800">ศูนย์รายงานสารสนเทศ 13 ฉบับ (Reports Hub)</h1>
          <p class="text-xs text-slate-500 mt-0.5">เลือกรายงานที่ต้องการ ตรวจสอบตัวกรอง และส่งออกเป็น Excel (.xlsx) / CSV หรือสั่งพิมพ์ PDF</p>
        </div>
      </div>

      <!-- Report Selector Box -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div class="sm:col-span-2">
          <label class="block font-semibold text-slate-700 mb-1">เลือกประเภทรายงาน (Report Type)</label>
          <select id="activeReportSelect" onchange="loadReportPreview(this.value)" class="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-sky-800 focus:border-sky-500 focus:outline-none">
            ${reportsList.map(r => `<option value="${r.id}">${r.name} - ${r.th}</option>`).join('')}
          </select>
        </div>

        <div class="flex items-end space-x-2">
          <button onclick="exportCurrentReportExcel()" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center space-x-1.5 shadow-sm transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Export Excel (.xlsx)</span>
          </button>
          <button onclick="window.print()" class="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold" title="สั่งพิมพ์หน้ารายงาน">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          </button>
        </div>
      </div>

      <!-- Report Preview Sheet -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <div id="reportTitleHeader" class="text-base font-bold text-slate-900">1. รายงานสินค้าคงเหลือปัจจุบัน (Current Stock Report)</div>
            <div class="text-xs text-slate-500">ข้อมูล ณ วันที่: ${new Date().toLocaleDateString('th-TH')}</div>
          </div>
          <span id="reportCountBadge" class="text-xs font-mono font-bold bg-sky-100 text-sky-800 px-2.5 py-1 rounded-full">376 รายการ</span>
        </div>

        <div id="reportTableContainer" class="overflow-x-auto text-xs">
          <!-- Populated by loadReportPreview -->
        </div>
      </div>

    </div>
  `;

  // Pre-load RPT-01
  loadReportPreview('RPT-01');
}

function loadReportPreview(reportId) {
  const parts = appState.db.parts || [];
  const movements = appState.db.movements || [];
  const rounds = appState.db.stockCountRounds || [];

  const container = document.getElementById('reportTableContainer');
  const title = document.getElementById('reportTitleHeader');
  const badge = document.getElementById('reportCountBadge');
  if (!container) return;

  let html = '';
  let count = 0;

  switch (reportId) {
    case 'RPT-01': // Current Stock
      title.innerText = '1. รายงานสินค้าคงเหลือปัจจุบัน (Current Stock Report)';
      count = parts.length;
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-50 font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2">Part No.</th>
              <th class="p-2">ชื่ออะไหล่</th>
              <th class="p-2">Category</th>
              <th class="p-2">Location</th>
              <th class="p-2 text-right">Current Stock</th>
              <th class="p-2 text-center">Min / Max</th>
              <th class="p-2 text-right">Unit Cost</th>
              <th class="p-2 text-right">Total Value</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${parts.map(p => `
              <tr>
                <td class="p-2 font-mono font-bold text-sky-700">${p.partNumber}</td>
                <td class="p-2 font-medium">${p.partName}</td>
                <td class="p-2 text-slate-500">${p.category.split('(')[0]}</td>
                <td class="p-2 font-mono">${p.location}</td>
                <td class="p-2 text-right font-mono font-bold">${p.currentStock} ${p.unit}</td>
                <td class="p-2 text-center font-mono text-slate-500">${p.minStock} / ${p.maxStock}</td>
                <td class="p-2 text-right font-mono">฿${p.unitCost ? p.unitCost.toLocaleString() : '-'}</td>
                <td class="p-2 text-right font-mono font-bold">฿${((p.currentStock||0)*(p.unitCost||0)).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      break;

    case 'RPT-02': // Movement
      title.innerText = '2. รายงานประวัติความเคลื่อนไหวสต็อก (Stock Movement Report)';
      count = movements.length;
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-50 font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2">Date</th>
              <th class="p-2">Trans No.</th>
              <th class="p-2">Type</th>
              <th class="p-2">Part No.</th>
              <th class="p-2">Part Name</th>
              <th class="p-2 text-right">Qty In</th>
              <th class="p-2 text-right">Qty Out</th>
              <th class="p-2 text-right">Balance</th>
              <th class="p-2">User</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${movements.map(m => `
              <tr>
                <td class="p-2 font-mono text-[11px]">${m.date}</td>
                <td class="p-2 font-mono font-bold">${m.transactionNo}</td>
                <td class="p-2">${renderTypeBadge(m.type)}</td>
                <td class="p-2 font-mono font-bold text-sky-700">${m.partNumber}</td>
                <td class="p-2">${m.partName}</td>
                <td class="p-2 text-right font-mono text-emerald-600">${m.qtyIn || '-'}</td>
                <td class="p-2 text-right font-mono text-rose-600">${m.qtyOut || '-'}</td>
                <td class="p-2 text-right font-mono font-bold">${m.balance}</td>
                <td class="p-2 text-slate-600">${m.user}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      break;

    case 'RPT-07': // Low Stock
      const low = parts.filter(p => p.currentStock <= p.minStock);
      title.innerText = '7. รายงานอะไหล่สต็อกต่ำกว่าเกณฑ์ (Low Stock Report)';
      count = low.length;
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-50 font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2">Part No.</th>
              <th class="p-2">ชื่ออะไหล่</th>
              <th class="p-2 text-right">Current Stock</th>
              <th class="p-2 text-right">Min Stock</th>
              <th class="p-2 text-right font-bold text-rose-600">ขาดสต็อก (Deficit)</th>
              <th class="p-2">Location</th>
              <th class="p-2">Supplier</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${low.map(p => `
              <tr>
                <td class="p-2 font-mono font-bold text-rose-700">${p.partNumber}</td>
                <td class="p-2">${p.partName}</td>
                <td class="p-2 text-right font-mono font-bold text-rose-600">${p.currentStock} ${p.unit}</td>
                <td class="p-2 text-right font-mono">${p.minStock} ${p.unit}</td>
                <td class="p-2 text-right font-mono font-bold text-rose-600">${p.minStock - p.currentStock} ${p.unit}</td>
                <td class="p-2 font-mono">${p.location}</td>
                <td class="p-2 text-slate-600">${p.supplier}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      break;

    default:
      title.innerText = `รายงาน ${reportId}`;
      count = parts.length;
      html = `<div class="p-8 text-center text-slate-400">พร้อมแสดงผลและ Export สำหรับ ${reportId}</div>`;
  }

  badge.innerText = `${count} รายการ`;
  container.innerHTML = html;
}

function exportCurrentReportExcel() {
  const reportSelect = document.getElementById('activeReportSelect');
  const reportId = reportSelect ? reportSelect.value : 'RPT-01';
  const parts = appState.db.parts || [];
  const movements = appState.db.movements || [];

  let exportData = [];
  let fileName = `Report_${reportId}_${new Date().toISOString().slice(0,10)}.xlsx`;

  if (reportId === 'RPT-01' || reportId === 'RPT-11') {
    exportData = parts.map((p, idx) => ({
      'ลำดับ': idx + 1,
      'รหัสอะไหล่': p.partNumber,
      'ชื่ออะไหล่': p.partName,
      'หมวดหมู่': p.category,
      'เครื่องจักร': p.machineCode,
      'ตำแหน่งจัดเก็บ': p.location,
      'คงเหลือ': p.currentStock,
      'หน่วย': p.unit,
      'Min Stock': p.minStock,
      'Max Stock': p.maxStock,
      'Reorder Point': p.reorderPoint,
      'ราคาต่อหน่วย (บาท)': p.unitCost,
      'มูลค่ารวม (บาท)': (p.currentStock || 0) * (p.unitCost || 0),
      'Critical': p.isCritical ? 'Yes' : 'No',
      'Supplier': p.supplier
    }));
  } else if (reportId === 'RPT-02' || reportId === 'RPT-03' || reportId === 'RPT-04') {
    exportData = movements.map((m, idx) => ({
      'ลำดับ': idx + 1,
      'วัน-เวลา': m.date,
      'Transaction No.': m.transactionNo,
      'ประเภท': m.type,
      'รหัสอะไหล่': m.partNumber,
      'ชื่ออะไหล่': m.partName,
      'รับเข้า (In)': m.qtyIn || 0,
      'เบิกออก (Out)': m.qtyOut || 0,
      'ยอดคงเหลือ (Balance)': m.balance,
      'เครื่องจักร': m.machine,
      'ผู้ทำรายการ': m.user,
      'เอกสารอ้างอิง': m.refDoc,
      'หมายเหตุ': m.note
    }));
  } else {
    exportData = parts.slice(0, 50).map((p, idx) => ({
      'ลำดับ': idx + 1,
      'Part Number': p.partNumber,
      'Part Name': p.partName,
      'Current Stock': p.currentStock,
      'Location': p.location
    }));
  }

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, fileName);

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: `Export ${fileName} สำเร็จ`,
    showConfirmButton: false,
    timer: 2000
  });
}

// ==================== 16. AUDIT LOG MODULE ====================

function renderAuditLog(container) {
  const logs = appState.db.auditLogs || [];

  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 class="text-lg font-bold text-slate-800">บันทึกการตรวจสอบระบบ (Audit Log Trail)</h1>
          <p class="text-xs text-slate-500 mt-0.5">ประวัติการกระทำทั้งหมดที่มีผลต่อ Stock (Immutable Log - ไม่อนุญาตให้ลบ)</p>
        </div>
        <span class="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">${logs.length} บันทึก</span>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-900 text-slate-200 font-semibold uppercase text-[11px]">
              <tr>
                <th class="p-3">Timestamp</th>
                <th class="p-3">ผู้ใช้งาน (User)</th>
                <th class="p-3">Action</th>
                <th class="p-3">Part No.</th>
                <th class="p-3 text-right">ยอดเดิม</th>
                <th class="p-3 text-right">ยอดใหม่</th>
                <th class="p-3 text-right">ผลต่าง</th>
                <th class="p-3">เหตุผล / Reference</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${logs.map(log => `
                <tr class="hover:bg-slate-50 transition">
                  <td class="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">${log.timestamp}</td>
                  <td class="p-3 font-semibold text-slate-700">${log.user}</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">${log.action}</span></td>
                  <td class="p-3 font-mono font-bold text-sky-700 cursor-pointer hover:underline" onclick="showPartDetailByCode('${log.partNumber}')">${log.partNumber}</td>
                  <td class="p-3 text-right font-mono text-slate-500">${log.previousQty}</td>
                  <td class="p-3 text-right font-mono font-bold text-slate-800">${log.newQty}</td>
                  <td class="p-3 text-right font-mono font-bold ${log.difference > 0 ? 'text-emerald-600' : (log.difference < 0 ? 'text-rose-600' : 'text-slate-400')}">
                    ${log.difference > 0 ? `+${log.difference}` : log.difference}
                  </td>
                  <td class="p-3 text-slate-600 max-w-sm truncate" title="${log.reason} (${log.reference})">${log.reason} <span class="text-slate-400 font-mono">(${log.reference})</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ==================== 17. MASTER DATA & USERS ====================

function renderMasterData(container) {
  const machines = appState.db.machines || [];
  const suppliers = appState.db.suppliers || [];

  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h1 class="text-lg font-bold text-slate-800">จัดการข้อมูลหลัก (Master Data Management)</h1>
        <p class="text-xs text-slate-500 mt-0.5">กำหนดข้อมูลเครื่องจักร ผู้จัดจำหน่าย หน่วยนับ และหมวดหมู่อะไหล่</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Machines -->
        <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-800">เครื่องจักรในโรงงาน (Machines: ${machines.length})</h3>
          </div>
          <div class="divide-y divide-slate-100 text-xs">
            ${machines.map(m => `
              <div class="py-2.5 flex items-center justify-between">
                <div>
                  <div class="font-mono font-bold text-indigo-700">${m.code} - ${m.name}</div>
                  <div class="text-[11px] text-slate-500">แผนก: ${m.dept} | ${m.location}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Suppliers -->
        <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-800">ผู้จัดจำหน่าย (Suppliers: ${suppliers.length})</h3>
          </div>
          <div class="divide-y divide-slate-100 text-xs">
            ${suppliers.map(s => `
              <div class="py-2.5 flex items-center justify-between">
                <div>
                  <div class="font-semibold text-slate-800">${s.name}</div>
                  <div class="text-[11px] text-slate-500">โทร: ${s.contact} | ${s.email}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderUsers(container) {
  const users = appState.db.users || [];
  const isDevelopOrAdmin = appState.currentUser.role === 'Develop' || appState.currentUser.role === 'Admin';

  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="text-lg font-bold text-slate-800">จัดการผู้ใช้งานและกำหนดสิทธิ์ (User Roles & Permissions)</h1>
            <span class="text-xs bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full font-mono">${users.length} บัญชี</span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">ผู้มีสิทธิ์ Develop และ Admin สามารถเพิ่มผู้ใช้, แก้ไขชื่อ, บทบาท, และรายละเอียดของทุกคนได้ (รวมทั้ง User Develop)</p>
        </div>
        <div>
          ${isDevelopOrAdmin ? `
            <button onclick="openUserModal()" class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
              <span>+ เพิ่มผู้ใช้งานใหม่</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Current User Banner -->
      <div class="bg-slate-900 text-white p-4 rounded-xl shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-sky-500 flex items-center justify-center font-bold text-white text-base shadow">
            ${(appState.currentUser.name || 'U').charAt(0)}
          </div>
          <div>
            <div class="font-bold text-white text-sm flex items-center space-x-2">
              <span>${appState.currentUser.name}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${appState.currentUser.role === 'Develop' ? 'bg-purple-500 text-white' : (appState.currentUser.role === 'Admin' ? 'bg-amber-500 text-slate-950' : 'bg-sky-500 text-white')}">
                ${appState.currentUser.role}
              </span>
            </div>
            <div class="text-slate-400 text-[11px] mt-0.5">${appState.currentUser.department || 'Tool Room'} • ${appState.currentUser.email || '-'}</div>
          </div>
        </div>
        <div>
          <button onclick="openUserModal('${appState.currentUser.id}')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition">
            <svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            <span>แก้ไขข้อมูลของตนเอง</span>
          </button>
        </div>
      </div>

      <!-- Users Table -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-[11px] tracking-wider">
            <tr>
              <th class="p-3">User ID</th>
              <th class="p-3">ชื่อ-นามสกุล</th>
              <th class="p-3">บทบาท (Role)</th>
              <th class="p-3">แผนก / หน้าที่</th>
              <th class="p-3">Email & โทรศัพท์</th>
              <th class="p-3 text-center">สถานะ</th>
              <th class="p-3 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${users.map(u => `
              <tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-mono font-bold text-sky-700">${u.id}</td>
                <td class="p-3">
                  <div class="font-bold text-slate-800">${u.name}</div>
                  <div class="text-[10px] text-slate-400 font-mono">${u.username || ''}</div>
                </td>
                <td class="p-3">
                  <span class="px-2.5 py-1 rounded text-[11px] font-bold ${
                    u.role === 'Develop' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                    u.role === 'Admin' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                    u.role === 'Data Editor' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                    'bg-sky-100 text-sky-800 border border-sky-200'
                  }">
                    ${u.role === 'Develop' ? '💻 Develop (ผู้พัฒนาระบบ)' : (u.role === 'Admin' ? '🛡️ Admin' : (u.role === 'Data Editor' ? '✏️ Data Editor' : '👤 Store'))}
                  </span>
                </td>
                <td class="p-3 text-slate-700 font-medium">${u.department || '-'}</td>
                <td class="p-3">
                  <div class="text-slate-600">${u.email || '-'}</div>
                  <div class="text-slate-400 font-mono text-[10px]">${u.phone || '-'}</div>
                </td>
                <td class="p-3 text-center">
                  <span class="px-2 py-0.5 rounded-full text-[10px] ${u.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} font-bold">
                    ${u.active !== false ? '🟢 Active' : '🔴 Inactive'}
                  </span>
                </td>
                <td class="p-3 text-center">
                  ${isDevelopOrAdmin ? `
                    <button onclick="openUserModal('${u.id}')" class="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 text-xs transition inline-flex items-center space-x-1 shadow-sm">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      <span>แก้ไข</span>
                    </button>
                  ` : `
                    <span class="text-slate-400 text-[11px]">-</span>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openUserModal(userId = null) {
  const modal = document.getElementById('userEditModal');
  if (!modal) return;

  const users = appState.db.users || [];
  const user = userId ? users.find(u => u.id === userId) : null;

  document.getElementById('editUserId').value = user ? user.id : '';
  document.getElementById('userDisplayId').value = user ? user.id : '(สร้างอัตโนมัติ เช่น U-00' + (users.length + 1) + ')';
  document.getElementById('editUserName').value = user ? user.name : '';
  document.getElementById('editUserRole').value = user ? user.role : 'Store';
  document.getElementById('editUserDept').value = user ? (user.department || '') : '';
  document.getElementById('editUserEmail').value = user ? (user.email || '') : '';
  document.getElementById('editUserPhone').value = user ? (user.phone || '') : '';
  document.getElementById('editUserActive').value = user && user.active === false ? 'false' : 'true';

  document.getElementById('userModalTitle').innerText = user ? `แก้ไขข้อมูลผู้ใช้งาน: ${user.name}` : 'เพิ่มผู้ใช้งานใหม่ (Add New User)';

  modal.classList.remove('hidden');
}

function closeUserModal() {
  const modal = document.getElementById('userEditModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveUser(e) {
  e.preventDefault();

  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('editUserName').value.trim();
  const role = document.getElementById('editUserRole').value;
  const department = document.getElementById('editUserDept').value.trim();
  const email = document.getElementById('editUserEmail').value.trim();
  const phone = document.getElementById('editUserPhone').value.trim();
  const active = document.getElementById('editUserActive').value === 'true';

  if (!name) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุชื่อผู้ใช้งาน', 'warning');
    return;
  }

  const payload = {
    id: id || undefined,
    name,
    role,
    department,
    email,
    phone,
    active,
    operatorName: appState.currentUser.name
  };

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (res.ok && result.success) {
      // Reload DB
      const dbRes = await fetch('/api/db');
      if (dbRes.ok) {
        appState.db = await dbRes.json();
        syncUsersFromDb();
      }

      closeUserModal();
      renderUsers(document.getElementById('mainContent'));

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: result.message || 'บันทึกข้อมูลผู้ใช้งานสำเร็จ',
        showConfirmButton: false,
        timer: 2000
      });
    } else {
      throw new Error(result.error || 'เกิดข้อผิดพลาดในการบันทึก');
    }
  } catch (err) {
    console.error(err);
    Swal.fire('ข้อผิดพลาด', err.message, 'error');
  }
}

// ==================== PART DETAIL & LABELS ====================

function showPartDetail(partId) {
  const part = (appState.db.parts || []).find(p => p.id === partId);
  if (!part) return;
  appState.selectedPart = part;

  document.getElementById('detailPartNumber').innerText = part.partNumber;
  document.getElementById('detailPartName').innerText = part.partName;

  const badge = document.getElementById('detailBadgeStatus');
  if (part.currentStock === 0) {
    badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-rose-600 text-white';
    badge.innerText = 'OUT OF STOCK';
  } else if (part.currentStock <= part.minStock) {
    badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-white';
    badge.innerText = 'LOW STOCK';
  } else {
    badge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white';
    badge.innerText = 'NORMAL';
  }

  const body = document.getElementById('partDetailBody');
  body.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div><span class="text-slate-500">Item Code:</span> <strong class="text-slate-900 font-mono text-sm block">${part.partNumber}</strong></div>
        <div><span class="text-slate-500">ชื่อรายการ:</span> <strong class="text-slate-900 block">${part.partName}</strong></div>
        <div><span class="text-slate-500">สเปก / ขนาด / รายละเอียด:</span> <span class="text-slate-700 block">${part.specification || part.description || '-'}</span></div>
        <div><span class="text-slate-500">ตำแหน่งจัดเก็บ (Location):</span> <strong class="font-mono text-base text-sky-700 bg-sky-100 px-2 py-0.5 rounded block w-fit mt-1">${part.location || '-'}</strong></div>
        <div><span class="text-slate-500">หมายเหตุ:</span> <span class="text-slate-800 block">${part.remark || '-'}</span></div>
      </div>

      <div class="space-y-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div class="flex items-center justify-between">
          <span class="text-slate-500">ยอดคงเหลือปัจจุบัน:</span>
          <strong class="font-mono text-lg ${getStockLevelColor(part)}">${part.currentStock} ${part.unit}</strong>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200 font-mono">
          <div class="bg-white p-2 rounded border border-slate-200">
            <div class="text-[10px] text-slate-400">Min</div>
            <div class="font-bold text-slate-700">${part.minStock}</div>
          </div>
          <div class="bg-white p-2 rounded border border-slate-200">
            <div class="text-[10px] text-slate-400">Reorder</div>
            <div class="font-bold text-amber-600">${part.reorderPoint}</div>
          </div>
          <div class="bg-white p-2 rounded border border-slate-200">
            <div class="text-[10px] text-slate-400">Max</div>
            <div class="font-bold text-slate-700">${part.maxStock}</div>
          </div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-200">
          <span class="text-slate-500">ราคาต่อหน่วย:</span>
          <strong class="font-mono text-slate-800">฿${part.unitCost ? part.unitCost.toLocaleString() : '-'}</strong>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">มูลค่ารวมในสต็อก:</span>
          <strong class="font-mono text-emerald-700">฿${((part.currentStock || 0) * (part.unitCost || 0)).toLocaleString()}</strong>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnDetailIssue').onclick = () => {
    closePartDetail();
    quickStockIssue(part.partNumber);
  };
  document.getElementById('btnDetailReceive').onclick = () => {
    closePartDetail();
    quickStockIn(part.partNumber);
  };

  document.getElementById('partDetailModal').classList.remove('hidden');
}

function openEditFromDetail() {
  if (appState.selectedPart) {
    const pId = appState.selectedPart.id;
    closePartDetail();
    openEditPartModal(pId);
  }
}

function showPartDetailByCode(partNumber) {
  const part = (appState.db.parts || []).find(p => p.partNumber === partNumber);
  if (part) showPartDetail(part.id);
}
function closePartDetail() {
  document.getElementById('partDetailModal').classList.add('hidden');
}

// Print Label & QR Generation
function openPrintLabelModal(partId) {
  const part = (appState.db.parts || []).find(p => p.id === partId);
  if (!part) return;
  appState.selectedPart = part;

  document.getElementById('labelPartNumber').innerText = part.partNumber;
  document.getElementById('labelPartName').innerText = part.partName;
  document.getElementById('labelLocation').innerText = part.location || '-';
  if (document.getElementById('labelMachine')) document.getElementById('labelMachine').innerText = part.machineCode || '-';
  document.getElementById('labelMinMax').innerText = `${part.minStock} / ${part.maxStock} ${part.unit}`;
  if (document.getElementById('labelCost')) document.getElementById('labelCost').innerText = `฿${part.unitCost ? part.unitCost.toLocaleString() : '-'}`;
  if (document.getElementById('labelCategory')) document.getElementById('labelCategory').innerText = (part.category || 'Tool Room').split('(')[0];

  const qrContainer = document.getElementById('labelQrContainer');
  qrContainer.innerHTML = '';
  if (window.QRCode) {
    new QRCode(qrContainer, {
      text: part.partNumber,
      width: 110,
      height: 110,
      colorDark: '#0f172a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  document.getElementById('printLabelModal').classList.remove('hidden');
}

function openPrintLabelModalFromDetail() {
  if (appState.selectedPart) {
    closePartDetail();
    openPrintLabelModal(appState.selectedPart.id);
  }
}
function closePrintLabel() {
  document.getElementById('printLabelModal').classList.add('hidden');
}

// QR Scanner Modal & Simulator
function openQRScanner() {
  document.getElementById('manualScanInput').value = '';
  document.getElementById('scannerModal').classList.remove('hidden');
  document.getElementById('manualScanInput').focus();
}
function closeQRScanner() {
  document.getElementById('scannerModal').classList.add('hidden');
}

function executeScan(scannedCode) {
  if (!scannedCode) return;
  const cleanCode = scannedCode.trim().toUpperCase();
  const part = (appState.db.parts || []).find(p => p.partNumber.toUpperCase() === cleanCode);

  if (part) {
    closeQRScanner();
    // Show Action Selector Modal
    Swal.fire({
      title: `พบอะไหล่: [${part.partNumber}]`,
      html: `
        <div class="text-left text-xs space-y-2 p-2 bg-slate-50 rounded border border-slate-200">
          <div><span class="text-slate-500">ชื่อ:</span> <strong>${part.partName}</strong></div>
          <div><span class="text-slate-500">ตำแหน่งเก็บ:</span> <strong class="text-sky-700 font-mono">${part.location}</strong></div>
          <div><span class="text-slate-500">คงเหลือในสต็อก:</span> <strong class="text-slate-900 font-mono text-base">${part.currentStock} ${part.unit}</strong></div>
          <div><span class="text-slate-500">เครื่องจักร:</span> <strong>${part.machineCode}</strong></div>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'เบิกจ่ายอะไหล่ (-OUT)',
      denyButtonText: 'รับอะไหล่เข้า (+IN)',
      cancelButtonText: 'ดูประวัติ / รายละเอียด',
      confirmButtonColor: '#e11d48',
      denyButtonColor: '#059669',
      cancelButtonColor: '#0284c7'
    }).then(res => {
      if (res.isConfirmed) {
        quickStockIssue(part.partNumber);
      } else if (res.isDenied) {
        quickStockIn(part.partNumber);
      } else if (res.dismiss === Swal.DismissReason.cancel) {
        showPartDetail(part.id);
      }
    });
  } else {
    Swal.fire('ไม่พบรหัสอะไหล่', `ไม่พบข้อมูลอะไหล่สำหรับรหัส: ${scannedCode}`, 'warning');
  }
}

// Global Search (Ctrl+K)
function openGlobalSearch() {
  const modal = document.getElementById('searchModal');
  const input = document.getElementById('globalSearchInput');
  modal.classList.remove('hidden');
  input.value = '';
  input.focus();
  handleGlobalSearch('');
}
function closeGlobalSearch() {
  document.getElementById('searchModal').classList.add('hidden');
}

function handleGlobalSearch(q) {
  const resultsBox = document.getElementById('globalSearchResults');
  const parts = appState.db.parts || [];
  if (!q.trim()) {
    resultsBox.innerHTML = '<div class="p-4 text-center text-slate-400">พิมพ์คำค้นหาเพื่อค้นหาอะไหล่ในสต็อก 376 รายการ</div>';
    return;
  }

  const query = q.toLowerCase().trim();
  const matched = parts.filter(p => 
    p.partNumber.toLowerCase().includes(query) ||
    p.partName.toLowerCase().includes(query) ||
    p.machineCode.toLowerCase().includes(query) ||
    p.location.toLowerCase().includes(query) ||
    p.manufacturer.toLowerCase().includes(query)
  ).slice(0, 8);

  if (!matched.length) {
    resultsBox.innerHTML = '<div class="p-4 text-center text-slate-400">ไม่พบอะไหล่ที่ตรงกับคำค้นหา</div>';
    return;
  }

  resultsBox.innerHTML = matched.map(p => `
    <div onclick="selectSearchResult('${p.id}')" class="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <span class="font-mono font-bold text-sky-700">${p.partNumber}</span>
        <span class="text-slate-800 font-medium">${p.partName}</span>
      </div>
      <div class="flex items-center space-x-2 text-right">
        <span class="font-mono text-sky-800 font-bold bg-sky-50 px-1.5 py-0.5 rounded text-[11px]">${p.location}</span>
        <span class="font-mono font-bold ${getStockLevelColor(p)}">${p.currentStock} ${p.unit}</span>
      </div>
    </div>
  `).join('');
}

function selectSearchResult(partId) {
  closeGlobalSearch();
  showPartDetail(partId);
}

// ==================== BADGE & COLOR HELPERS ====================

function renderStockBadge(p) {
  if (p.currentStock === 0) {
    return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Out of Stock</span>';
  }
  if (p.currentStock <= p.reorderPoint) {
    return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">Critical Reorder</span>';
  }
  if (p.currentStock <= p.minStock) {
    return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Low Stock</span>';
  }
  return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Normal</span>';
}

function getStockLevelColor(p) {
  if (p.currentStock === 0) return 'text-rose-600';
  if (p.currentStock <= p.minStock) return 'text-amber-600';
  return 'text-slate-900';
}

function renderTypeBadge(type) {
  if (type === 'IN') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 font-mono">+IN</span>';
  if (type === 'OUT') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 font-mono">-OUT</span>';
  if (type === 'RETURN') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 font-mono">RETURN</span>';
  return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 font-mono">ADJUST</span>';
}

// Add Part Modal (Tool Room)
function openAddPartModal() {
  Swal.fire({
    title: 'เพิ่มอะไหล่ Tool Room ใหม่',
    width: '600px',
    html: `
      <div class="grid grid-cols-2 gap-3 text-left text-xs">
        <div>
          <label class="block font-semibold mb-1">Item Code / Part No. <span class="text-rose-500">*</span></label>
          <input type="text" id="newPartNo" placeholder="เช่น BOLT-M12, SEAL-01, LC-50" class="w-full p-2 border border-slate-300 rounded uppercase font-mono">
        </div>
        <div>
          <label class="block font-semibold mb-1">ชื่ออะไหล่ / ขนาดสเปก <span class="text-rose-500">*</span></label>
          <input type="text" id="newPartName" placeholder="เช่น น็อตหกเหลี่ยม M12x50, ซีลยาง 25mm" class="w-full p-2 border border-slate-300 rounded font-medium">
        </div>
        <div>
          <label class="block font-semibold mb-1">ตำแหน่งจัดเก็บ (Location) <span class="text-rose-500">*</span></label>
          <input type="text" id="newLocation" placeholder="เช่น RACK-A-01, BIN-12" class="w-full p-2 border border-slate-300 rounded font-mono font-bold text-sky-700">
        </div>
        <div>
          <label class="block font-semibold mb-1">หน่วยนับ (Unit)</label>
          <input type="text" id="newUnit" value="ตัว" placeholder="เช่น ตัว, ชิ้น, เส้น, กล่อง" class="w-full p-2 border border-slate-300 rounded">
        </div>
        <div>
          <label class="block font-semibold mb-1">จำนวนคงเหลือเริ่มต้น</label>
          <input type="number" id="newStock" value="0" min="0" class="w-full p-2 border border-slate-300 rounded font-mono font-bold text-emerald-600">
        </div>
        <div>
          <label class="block font-semibold mb-1">ราคาต่อหน่วย (Unit Cost - THB)</label>
          <input type="number" id="newCost" value="0" step="any" class="w-full p-2 border border-slate-300 rounded font-mono">
        </div>
        <div>
          <label class="block font-semibold mb-1">Min Stock (เตือนสต็อกต่ำ)</label>
          <input type="number" id="newMin" value="5" class="w-full p-2 border border-slate-300 rounded font-mono">
        </div>
        <div>
          <label class="block font-semibold mb-1">Max Stock (เพดานจัดเก็บ)</label>
          <input type="number" id="newMax" value="50" class="w-full p-2 border border-slate-300 rounded font-mono">
        </div>
        <div class="col-span-2">
          <label class="block font-semibold mb-1">หมายเหตุ (Remark)</label>
          <input type="text" id="newRemark" placeholder="ระบุข้อมูลเพิ่มเติมถ้ามี..." class="w-full p-2 border border-slate-300 rounded">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึกอะไหล่',
    cancelButtonText: 'ยกเลิก'
  }).then(async res => {
    if (res.isConfirmed) {
      const partNumber = document.getElementById('newPartNo').value.trim();
      const partName = document.getElementById('newPartName').value.trim();
      const location = document.getElementById('newLocation').value.trim();
      const unit = document.getElementById('newUnit').value.trim() || 'ชิ้น';
      const currentStock = parseFloat(document.getElementById('newStock').value) || 0;
      const unitCost = parseFloat(document.getElementById('newCost').value) || 0;
      const minStock = parseFloat(document.getElementById('newMin').value) || 5;
      const maxStock = parseFloat(document.getElementById('newMax').value) || 50;
      const remark = document.getElementById('newRemark').value.trim();

      if (!partNumber || !partName || !location) {
        Swal.fire('กรุณาระบุข้อมูล', 'Part No., ชื่ออะไหล่ และ ตำแหน่งจัดเก็บ ห้ามว่าง', 'warning');
        return;
      }

      const response = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partNumber,
          partName,
          category: 'Tool Room Consumables',
          machineCode: 'TOOL-ROOM',
          unit,
          location,
          unitCost,
          minStock,
          maxStock,
          reorderPoint: Math.round(minStock * 1.5),
          currentStock,
          remark,
          isCritical: false,
          editedBy: appState.currentUser.name,
          editReason: 'เพิ่มรายการอะไหล่ Tool Room ใหม่'
        })
      });

      if (response.ok) {
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลอะไหล่ใหม่สำเร็จ', 'success').then(() => {
          refreshData();
          switchTab('spare-parts');
        });
      }
    }
  });
}

function exportPartsToExcel() {
  const parts = appState.db.parts || [];
  const exportData = parts.map((p, idx) => ({
    'ลำดับ': idx + 1,
    'Item Code': p.partNumber,
    'ชื่ออะไหล่ / ขนาดสเปก': p.partName,
    'ตำแหน่งจัดเก็บ (Location)': p.location,
    'ยอดคงเหลือ (Current)': p.currentStock,
    'หน่วย (Unit)': p.unit,
    'Min Stock': p.minStock,
    'Max Stock': p.maxStock,
    'Reorder Point': p.reorderPoint,
    'ราคาต่อหน่วย (THB)': p.unitCost,
    'มูลค่ารวม (THB)': (p.currentStock || 0) * (p.unitCost || 0),
    'หมายเหตุ': p.remark || '-'
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tool Room Parts');
  XLSX.writeFile(wb, `Tool_Room_Parts_${new Date().toISOString().slice(0,10)}.xlsx`);

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: 'Export ฐานข้อมูลอะไหล่สำเร็จ',
    showConfirmButton: false,
    timer: 2000
  });
}

function exportMovementsToExcel() {
  const movements = appState.db.movements || [];
  const exportData = movements.map((m, idx) => ({
    'ลำดับ': idx + 1,
    'วัน-เวลา (Date)': m.date,
    'Transaction No.': m.transactionNo,
    'ประเภท (Type)': m.type,
    'รหัสอะไหล่': m.partNumber,
    'ชื่ออะไหล่': m.partName,
    'รับเข้า (+Qty In)': m.qtyIn || 0,
    'เบิกออก (-Qty Out)': m.qtyOut || 0,
    'คงเหลือ (Balance)': m.balance,
    'เครื่องจักร': m.machine,
    'ผู้ทำรายการ': m.user,
    'เอกสารอ้างอิง': m.refDoc,
    'หมายเหตุ': m.note
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movement Ledger');
  XLSX.writeFile(wb, `Stock_Movement_Ledger_${new Date().toISOString().slice(0,10)}.xlsx`);

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: 'Export ประวัติการเคลื่อนไหวสำเร็จ',
    showConfirmButton: false,
    timer: 2000
  });
}


// ==================== 19. TOOL & EQUIPMENT LOANS (ยืม-คืนเครื่องมือ ไม่ตัดสต็อก) ====================

let toolLoansFilterStatus = 'ALL';
let toolLoansSearchQuery = '';

function renderToolLoans(container) {
  const db = appState.db;
  const loans = db.toolLoans || [];
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // คำนวณสถิติ
  const activeLoans = loans.filter(l => l.status === 'BORROWED' || l.status === 'OVERDUE');
  const overdueLoans = loans.filter(l => {
    if (l.status === 'OVERDUE') return true;
    if (l.status === 'BORROWED') {
      const bTime = new Date(l.borrowDate).getTime();
      return (now - bTime > TWENTY_FOUR_HOURS);
    }
    return false;
  });
  const returnedLoans = loans.filter(l => l.status === 'RETURNED');

  container.innerHTML = `
    <div class="space-y-6">
      
      <!-- Top Title & Action Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div class="flex items-center space-x-2.5">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <div>
              <h1 class="text-lg sm:text-xl font-bold text-slate-900 flex items-center space-x-2">
                <span>ยืม-คืนเครื่องมือและอุปกรณ์ (Tool & Equipment Loans)</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-mono font-bold">NON-STOCK</span>
              </h1>
              <p class="text-xs text-slate-500">ติดตามสถานะเครื่องมือช่าง ช่างผู้ถือครอง และตำแหน่งเครื่องจักรที่นำไปใช้งาน (ระบบยืม-คืนแบบไม่ตัดสต็อก)</p>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2.5">
          <button onclick="openBorrowToolModal()" class="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-500/20 flex items-center space-x-2 transition transform active:scale-95">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            <span>บันทึกการยืมเครื่องมือ</span>
          </button>
        </div>
      </div>

      <!-- 4 KPI Summary Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Total Loans -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500">รายการยืมสะสม</span>
            <span class="p-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">🧰 All</span>
          </div>
          <div class="mt-2 flex items-baseline space-x-2">
            <span class="text-2xl font-bold font-mono text-slate-900">${loans.length}</span>
            <span class="text-xs text-slate-500">รายการ</span>
          </div>
          <div class="mt-1 text-[11px] text-slate-400">ประวัติการยืมทั้งหมดในระบบ</div>
        </div>

        <!-- Card 2: Active Borrowed -->
        <div class="bg-white p-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-amber-800">กำลังถูกยืมใช้งาน</span>
            <span class="p-2 rounded-xl bg-amber-100 text-amber-800 font-bold text-xs">🟡 In Use</span>
          </div>
          <div class="mt-2 flex items-baseline space-x-2">
            <span class="text-2xl font-bold font-mono text-amber-700">${activeLoans.length}</span>
            <span class="text-xs text-amber-600">ชิ้น</span>
          </div>
          <div class="mt-1 text-[11px] text-amber-600 font-medium">นำออกไปใช้งานที่เครื่องจักร</div>
        </div>

        <!-- Card 3: Overdue > 24 Hours -->
        <div class="bg-white p-4 rounded-2xl border ${overdueLoans.length > 0 ? 'border-rose-300 bg-gradient-to-br from-white to-rose-50/50 shadow-sm shadow-rose-100' : 'border-slate-200'}">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold ${overdueLoans.length > 0 ? 'text-rose-800' : 'text-slate-500'}">เกินกำหนด 24 ชม.</span>
            <span class="p-2 rounded-xl ${overdueLoans.length > 0 ? 'bg-rose-100 text-rose-700 animate-pulse font-bold' : 'bg-slate-100 text-slate-500'} text-xs">🔴 >24h</span>
          </div>
          <div class="mt-2 flex items-baseline space-x-2">
            <span class="text-2xl font-bold font-mono ${overdueLoans.length > 0 ? 'text-rose-600' : 'text-slate-700'}">${overdueLoans.length}</span>
            <span class="text-xs ${overdueLoans.length > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}">รายการ</span>
          </div>
          <div class="mt-1 text-[11px] ${overdueLoans.length > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}">ยังไม่นำมาส่งคืนห้อง Tool Room</div>
        </div>

        <!-- Card 4: Returned -->
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-emerald-800">ส่งคืนเรียบร้อย</span>
            <span class="p-2 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">🟢 Returned</span>
          </div>
          <div class="mt-2 flex items-baseline space-x-2">
            <span class="text-2xl font-bold font-mono text-emerald-700">${returnedLoans.length}</span>
            <span class="text-xs text-emerald-600">รายการ</span>
          </div>
          <div class="mt-1 text-[11px] text-emerald-600">ตรวจสอบสภาพเข้าคลังแล้ว</div>
        </div>
      </div>

      <!-- Filters & Search Bar -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          <!-- Search input -->
          <div class="relative flex-1 max-w-md">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </span>
            <input type="text" id="toolLoanSearchInput" 
                   value="${toolLoansSearchQuery}" 
                   oninput="onToolLoanSearchInput(this.value)"
                   placeholder="ค้นหาชื่อเครื่องมือ, รหัส, ช่างผู้ยืม, เครื่องจักร..." 
                   class="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-sky-500 focus:outline-none transition">
          </div>

          <!-- Status Filter Buttons -->
          <div class="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
            <button onclick="setToolLoansFilter('ALL')" id="tlFilter-ALL" class="px-3 py-1.5 rounded-lg font-medium transition ${toolLoansFilterStatus === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              ทั้งหมด (${loans.length})
            </button>
            <button onclick="setToolLoansFilter('ACTIVE')" id="tlFilter-ACTIVE" class="px-3 py-1.5 rounded-lg font-medium transition ${toolLoansFilterStatus === 'ACTIVE' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              🟡 กำลังยืม (${activeLoans.length})
            </button>
            <button onclick="setToolLoansFilter('OVERDUE')" id="tlFilter-OVERDUE" class="px-3 py-1.5 rounded-lg font-medium transition ${toolLoansFilterStatus === 'OVERDUE' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              🔴 เกิน 24 ชม. (${overdueLoans.length})
            </button>
            <button onclick="setToolLoansFilter('RETURNED')" id="tlFilter-RETURNED" class="px-3 py-1.5 rounded-lg font-medium transition ${toolLoansFilterStatus === 'RETURNED' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              🟢 คืนแล้ว (${returnedLoans.length})
            </button>
          </div>

        </div>
      </div>

      <!-- Tool Loans Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th class="p-3.5">รหัสรายการ</th>
                <th class="p-3.5">เครื่องมือ / อุปกรณ์</th>
                <th class="p-3.5">ผู้ยืม (ช่าง)</th>
                <th class="p-3.5">เครื่องจักร / จุดใช้งาน</th>
                <th class="p-3.5">วันเวลาที่ยืม</th>
                <th class="p-3.5">ระยะเวลาที่ยืม</th>
                <th class="p-3.5">สถานะ</th>
                <th class="p-3.5">สภาพตอนคืน / หมายเหตุ</th>
                <th class="p-3.5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody id="toolLoansTableBody" class="divide-y divide-slate-100 text-slate-700">
              <!-- Rendered by updateToolLoansTable -->
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  updateToolLoansTable();
}

function setToolLoansFilter(status) {
  toolLoansFilterStatus = status;
  // Update button active state
  ['ALL', 'ACTIVE', 'OVERDUE', 'RETURNED'].forEach(st => {
    const btn = document.getElementById('tlFilter-' + st);
    if (btn) {
      if (st === status) {
        btn.className = 'px-3 py-1.5 rounded-lg font-medium transition ' + 
          (st === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 
          (st === 'ACTIVE' ? 'bg-amber-600 text-white shadow-sm' : 
          (st === 'OVERDUE' ? 'bg-rose-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm')));
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg font-medium transition bg-slate-100 text-slate-600 hover:bg-slate-200';
      }
    }
  });
  updateToolLoansTable();
}

function onToolLoanSearchInput(val) {
  toolLoansSearchQuery = (val || '').toLowerCase().trim();
  updateToolLoansTable();
}

function updateToolLoansTable() {
  const tbody = document.getElementById('toolLoansTableBody');
  if (!tbody || !appState.db) return;

  const loans = appState.db.toolLoans || [];
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Filter
  const filtered = loans.filter(loan => {
    // Status Filter
    const isOverdue = (loan.status === 'OVERDUE') || (loan.status === 'BORROWED' && (now - new Date(loan.borrowDate).getTime() > TWENTY_FOUR_HOURS));
    if (toolLoansFilterStatus === 'ACTIVE') {
      if (loan.status === 'RETURNED') return false;
    } else if (toolLoansFilterStatus === 'OVERDUE') {
      if (!isOverdue) return false;
    } else if (toolLoansFilterStatus === 'RETURNED') {
      if (loan.status !== 'RETURNED') return false;
    }

    // Search Query
    if (toolLoansSearchQuery) {
      const q = toolLoansSearchQuery;
      const match = (loan.toolName && loan.toolName.toLowerCase().includes(q)) ||
                    (loan.toolCode && loan.toolCode.toLowerCase().includes(q)) ||
                    (loan.borrowerName && loan.borrowerName.toLowerCase().includes(q)) ||
                    (loan.machineName && loan.machineName.toLowerCase().includes(q)) ||
                    (loan.id && loan.id.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center space-y-2">
            <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
            <span>ไม่พบรายการยืมเครื่องมือตามเงื่อนไขที่ค้นหา</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(loan => {
    const borrowTime = new Date(loan.borrowDate).getTime();
    const returnTime = loan.actualReturnDate ? new Date(loan.actualReturnDate).getTime() : now;
    const diffMs = returnTime - borrowTime;
    const isOverdue = (loan.status === 'OVERDUE') || (loan.status === 'BORROWED' && (now - borrowTime > TWENTY_FOUR_HOURS));

    // Format Duration String
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    let durationStr = '';
    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24);
      const remHours = diffHours % 24;
      durationStr = `${days} วัน ${remHours} ชม.`;
    } else if (diffHours > 0) {
      durationStr = `${diffHours} ชม. ${diffMins} นาที`;
    } else {
      durationStr = `${diffMins} นาที`;
    }

    // Status Badge
    let statusBadge = '';
    let durationBadge = '';
    if (loan.status === 'RETURNED') {
      statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">🟢 คืนแล้ว</span>`;
      durationBadge = `<span class="text-slate-500 font-mono text-[11px]">ยืมไป ${durationStr}</span>`;
    } else if (isOverdue) {
      statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">🔴 เกิน 24 ชม.</span>`;
      durationBadge = `<span class="text-rose-600 font-bold font-mono text-[11px]">ยืมแล้ว ${durationStr}</span>`;
    } else {
      statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">🟡 กำลังใช้งาน</span>`;
      durationBadge = `<span class="text-amber-700 font-mono text-[11px]">ยืมแล้ว ${durationStr}</span>`;
    }

    // Condition / Remark
    let conditionRemark = '';
    if (loan.status === 'RETURNED') {
      let condText = '🟢 สภาพปกติ';
      if (loan.returnCondition === 'Damaged') condText = '🟡 ชำรุด/ต้องซ่อม';
      else if (loan.returnCondition === 'Lost') condText = '🔴 สูญหาย';
      conditionRemark = `<div><strong class="text-slate-800">${condText}</strong></div>${loan.returnRemark ? `<div class="text-[11px] text-slate-500 mt-0.5">${loan.returnRemark}</div>` : ''}`;
    } else {
      conditionRemark = loan.remark ? `<span class="text-[11px] text-slate-600">${loan.remark}</span>` : '<span class="text-slate-400">-</span>';
    }

    return `
      <tr class="hover:bg-slate-50/80 transition ${isOverdue && loan.status !== 'RETURNED' ? 'bg-rose-50/30' : ''}">
        <td class="p-3.5 font-mono font-bold text-sky-700">${loan.id}</td>
        <td class="p-3.5">
          <div class="font-bold text-slate-900">${loan.toolName}</div>
          <div class="text-[10px] text-slate-400 font-mono">รหัส: ${loan.toolCode || 'CUSTOM'}</div>
        </td>
        <td class="p-3.5">
          <div class="font-semibold text-slate-800">${loan.borrowerName}</div>
          <div class="text-[10px] text-slate-400">${loan.borrowerDept || '-'}</div>
        </td>
        <td class="p-3.5">
          <span class="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
            ${loan.machineName || '-'}
          </span>
        </td>
        <td class="p-3.5 text-slate-600 font-mono text-[11px]">
          ${formatThaiDateTime(loan.borrowDate)}
        </td>
        <td class="p-3.5 font-medium">
          ${durationBadge}
        </td>
        <td class="p-3.5">
          ${statusBadge}
        </td>
        <td class="p-3.5 max-w-xs">
          ${conditionRemark}
        </td>
        <td class="p-3.5 text-center whitespace-nowrap">
          <div class="flex items-center justify-center space-x-1.5">
            ${loan.status !== 'RETURNED' ? `
              <button onclick="openReturnToolModal('${loan.id}')" 
                      class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm flex items-center space-x-1 transition active:scale-95" title="บันทึกรับคืน">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span>รับคืน</span>
              </button>
            ` : `
              <div class="text-left leading-tight mr-1">
                <div class="text-[10px] text-emerald-700 font-bold font-mono">คืนเมื่อ:</div>
                <div class="text-[11px] text-slate-700 font-mono">${formatThaiDateTime(loan.actualReturnDate)}</div>
              </div>
            `}
            <button onclick="openEditToolLoanModal('${loan.id}')" 
                    class="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 font-semibold rounded-lg text-xs border border-slate-300 transition flex items-center space-x-1 active:scale-95" title="แก้ไขข้อมูลรายการนี้">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              <span>แก้ไข</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Helpers for DateTime format
function toInputDateTime(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offset);
  return local.toISOString().slice(0, 16);
}

function formatThaiDateTime(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) + ' น.';
}

// Open Borrow Modal
function openBorrowToolModal() {
  const modal = document.getElementById('borrowToolModal');
  if (!modal) return;

  const db = appState.db;
  const toolsDatalist = document.getElementById('availableToolsDatalist');
  const techsDatalist = document.getElementById('techniciansDatalist');
  const machinesDatalist = document.getElementById('machinesDatalist');

  // Fill Tools Datalist (ทั้งเครื่องมือช่าง และอะไหล่ทั้งหมด)
  if (toolsDatalist && db && db.parts) {
    toolsDatalist.innerHTML = db.parts.map(p => `<option value="${p.partName} (${p.partNumber})">`).join('');
  }

  // Fill Technicians Datalist
  if (techsDatalist && db && db.users) {
    techsDatalist.innerHTML = db.users.map(u => `<option value="${u.name}">`).join('');
  }

  // Fill Machines Datalist
  if (machinesDatalist && db && db.machines) {
    machinesDatalist.innerHTML = db.machines.map(m => `<option value="${m.name} (${m.code})">`).join('') +
      '<option value="Workshop (ซ่อมบำรุงส่วนกลาง)">' +
      '<option value="อื่นๆ (ระบุในหมายเหตุ)">';
  }

  // Default Values
  const toolNameInput = document.getElementById('borrowToolNameInput');
  if (toolNameInput) toolNameInput.value = '';
  const toolCodeInput = document.getElementById('borrowToolCodeInput');
  if (toolCodeInput) toolCodeInput.value = 'CUSTOM';
  const borrowerInput = document.getElementById('borrowerNameInput');
  if (borrowerInput) borrowerInput.value = (appState.currentUser && appState.currentUser.name) || 'สมชาย ใจมั่น';
  const borrowerDept = document.getElementById('borrowerDeptInput');
  if (borrowerDept) borrowerDept.value = (appState.currentUser && appState.currentUser.department) || 'ฝ่ายซ่อมบำรุง';
  const borrowDateInput = document.getElementById('borrowDateTimeInput');
  if (borrowDateInput) borrowDateInput.value = toInputDateTime(new Date());
  const machineInput = document.getElementById('borrowMachineInput');
  if (machineInput) machineInput.value = '';
  const remarkInput = document.getElementById('borrowRemarkInput');
  if (remarkInput) remarkInput.value = '';
  const recordedBy = document.getElementById('borrowRecordedBy');
  if (recordedBy) recordedBy.innerText = (appState.currentUser && appState.currentUser.name) || 'สโตร์ช่าง';

  modal.classList.remove('hidden');
}

function onBorrowToolSelect(val) {
  const codeInput = document.getElementById('borrowToolCodeInput');
  if (!codeInput || !appState.db || !appState.db.parts) return;
  const match = appState.db.parts.find(p => val.includes(p.partNumber) || p.partName === val);
  if (match) {
    codeInput.value = match.partNumber;
  } else {
    codeInput.value = 'CUSTOM';
  }
}

function closeBorrowToolModal() {
  const modal = document.getElementById('borrowToolModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveBorrowTool(e) {
  e.preventDefault();
  const toolNameRaw = document.getElementById('borrowToolNameInput').value;
  const toolCode = document.getElementById('borrowToolCodeInput').value;
  const borrowerName = document.getElementById('borrowerNameInput').value;
  const borrowerDept = document.getElementById('borrowerDeptInput').value;
  const borrowDateTime = document.getElementById('borrowDateTimeInput').value;
  const machineName = document.getElementById('borrowMachineInput').value;
  const remark = document.getElementById('borrowRemarkInput').value;
  const recordedBy = (appState.currentUser && appState.currentUser.name) || 'Store';

  if (!toolNameRaw || !borrowerName || !machineName) {
    Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกชื่อเครื่องมือ, ผู้ยืม และเครื่องจักรที่นำไปใช้' });
    return;
  }

  // Clean tool name if it had (PartNo) appended from datalist
  let toolName = toolNameRaw;
  const pMatch = toolNameRaw.match(/^(.*?)\s*\([A-Z0-9-]+\)$/);
  if (pMatch) toolName = pMatch[1];

  try {
    const res = await fetch('/api/tool-loans/borrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCode,
        toolName,
        borrowerName,
        borrowerDept,
        machineId: '-',
        machineName,
        borrowDate: borrowDateTime || new Date().toISOString(),
        remark,
        recordedBy
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการบันทึก');

    closeBorrowToolModal();
    
    // Refresh DB
    const dbRes = await fetch('/api/db');
    appState.db = await dbRes.json();
    updateHeaderCounts();
    renderToolLoans(document.getElementById('mainContent'));

    Swal.fire({
      icon: 'success',
      title: 'บันทึกการยืมเครื่องมือสำเร็จ',
      text: `${toolName} ได้รับการบันทึกว่า ${borrowerName} เป็นผู้ยืมไปใช้ที่ ${machineName} (ไม่ตัดสต็อก)`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#0284c7'
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

// Open Return Modal
function openReturnToolModal(loanId) {
  const modal = document.getElementById('returnToolModal');
  if (!modal || !appState.db || !appState.db.toolLoans) return;

  const loan = appState.db.toolLoans.find(l => l.id === loanId);
  if (!loan) return;

  document.getElementById('returnLoanId').value = loan.id;
  document.getElementById('returnToolDisplay').innerText = `${loan.toolName} (${loan.toolCode || 'CUSTOM'})`;
  document.getElementById('returnBorrowerDisplay').innerText = loan.borrowerName;
  document.getElementById('returnMachineDisplay').innerText = loan.machineName || '-';
  const borrowDateDisp = document.getElementById('returnBorrowDateDisplay');
  if (borrowDateDisp) borrowDateDisp.innerText = formatThaiDateTime(loan.borrowDate);

  const returnDateInput = document.getElementById('returnDateTimeInput');
  if (returnDateInput) returnDateInput.value = toInputDateTime(new Date());

  document.getElementById('returnRemarkInput').value = '';

  // Default condition Good
  const goodRadio = modal.querySelector('input[name="returnCondition"][value="Good"]');
  if (goodRadio) goodRadio.checked = true;

  modal.classList.remove('hidden');
}

function closeReturnToolModal() {
  const modal = document.getElementById('returnToolModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveReturnTool(e) {
  e.preventDefault();
  const loanId = document.getElementById('returnLoanId').value;
  const conditionInput = document.querySelector('input[name="returnCondition"]:checked');
  const returnCondition = conditionInput ? conditionInput.value : 'Good';
  const returnDateTime = document.getElementById('returnDateTimeInput').value;
  const returnRemark = document.getElementById('returnRemarkInput').value;
  const receivedBy = (appState.currentUser && appState.currentUser.name) || 'Store';

  try {
    const res = await fetch('/api/tool-loans/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId,
        returnCondition,
        returnRemark,
        actualReturnDate: returnDateTime || new Date().toISOString(),
        receivedBy
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการบันทึก');

    closeReturnToolModal();

    // Refresh DB
    const dbRes = await fetch('/api/db');
    appState.db = await dbRes.json();
    updateHeaderCounts();
    renderToolLoans(document.getElementById('mainContent'));

    let condThai = 'ปกติ สมบูรณ์';
    if (returnCondition === 'Damaged') condThai = 'ชำรุด/ต้องส่งซ่อม';
    else if (returnCondition === 'Lost') condThai = 'สูญหาย';

    Swal.fire({
      icon: 'success',
      title: 'บันทึกการส่งคืนเครื่องมือสำเร็จ',
      text: `รับคืนเครื่องมือเรียบร้อยแล้ว (สภาพ: ${condThai}) วันเวลา: ${formatThaiDateTime(returnDateTime || new Date())}`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#10b981'
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

// ==================== EDIT TOOL LOAN MODAL ====================

function openEditToolLoanModal(loanId) {
  const modal = document.getElementById('editToolLoanModal');
  if (!modal || !appState.db || !appState.db.toolLoans) return;

  const loan = appState.db.toolLoans.find(l => l.id === loanId);
  if (!loan) return;

  // Fill machines datalist if not filled
  const machinesDatalist = document.getElementById('machinesDatalist');
  if (machinesDatalist && appState.db.machines && machinesDatalist.children.length === 0) {
    machinesDatalist.innerHTML = appState.db.machines.map(m => `<option value="${m.name} (${m.code})">`).join('') +
      '<option value="Workshop (ซ่อมบำรุงส่วนกลาง)">' +
      '<option value="อื่นๆ (ระบุในหมายเหตุ)">';
  }

  document.getElementById('editLoanId').value = loan.id;
  document.getElementById('editLoanIdDisplay').value = loan.id;
  document.getElementById('editLoanToolName').value = loan.toolName;
  document.getElementById('editLoanToolCode').value = loan.toolCode || 'CUSTOM';
  document.getElementById('editLoanBorrowerName').value = loan.borrowerName;
  document.getElementById('editLoanBorrowerDept').value = loan.borrowerDept || 'ฝ่ายซ่อมบำรุง';
  document.getElementById('editLoanMachineName').value = loan.machineName || '';
  document.getElementById('editLoanBorrowDate').value = toInputDateTime(loan.borrowDate);

  const statusSelect = document.getElementById('editLoanStatusSelect');
  statusSelect.value = loan.status === 'RETURNED' ? 'RETURNED' : 'BORROWED';

  const returnDateInput = document.getElementById('editLoanReturnDate');
  returnDateInput.value = loan.actualReturnDate ? toInputDateTime(loan.actualReturnDate) : toInputDateTime(new Date());

  const conditionSelect = document.getElementById('editLoanReturnCondition');
  conditionSelect.value = loan.returnCondition || 'Good';

  document.getElementById('editLoanBorrowRemark').value = loan.remark || '';
  document.getElementById('editLoanReturnRemark').value = loan.returnRemark || '';

  onEditLoanStatusChange(statusSelect.value);

  modal.classList.remove('hidden');
}

function onEditLoanStatusChange(status) {
  const returnDateContainer = document.getElementById('editLoanReturnDateContainer');
  const returnConditionContainer = document.getElementById('editLoanConditionContainer');
  const returnRemarkContainer = document.getElementById('editLoanReturnRemarkContainer');

  if (status === 'RETURNED') {
    if (returnDateContainer) returnDateContainer.classList.remove('hidden');
    if (returnConditionContainer) returnConditionContainer.classList.remove('hidden');
    if (returnRemarkContainer) returnRemarkContainer.classList.remove('hidden');
  } else {
    if (returnDateContainer) returnDateContainer.classList.add('hidden');
    if (returnConditionContainer) returnConditionContainer.classList.add('hidden');
    if (returnRemarkContainer) returnRemarkContainer.classList.add('hidden');
  }
}

function closeEditToolLoanModal() {
  const modal = document.getElementById('editToolLoanModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveEditToolLoan(e) {
  e.preventDefault();
  const loanId = document.getElementById('editLoanId').value;
  const toolName = document.getElementById('editLoanToolName').value;
  const toolCode = document.getElementById('editLoanToolCode').value;
  const borrowerName = document.getElementById('editLoanBorrowerName').value;
  const borrowerDept = document.getElementById('editLoanBorrowerDept').value;
  const machineName = document.getElementById('editLoanMachineName').value;
  const borrowDate = document.getElementById('editLoanBorrowDate').value;
  const status = document.getElementById('editLoanStatusSelect').value;
  const actualReturnDate = status === 'RETURNED' ? document.getElementById('editLoanReturnDate').value : null;
  const returnCondition = status === 'RETURNED' ? document.getElementById('editLoanReturnCondition').value : null;
  const remark = document.getElementById('editLoanBorrowRemark').value;
  const returnRemark = status === 'RETURNED' ? document.getElementById('editLoanReturnRemark').value : '';
  const editedBy = (appState.currentUser && appState.currentUser.name) || 'Store';

  if (!toolName || !borrowerName || !machineName || !borrowDate) {
    Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    return;
  }

  try {
    const res = await fetch('/api/tool-loans/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId,
        toolName,
        toolCode,
        borrowerName,
        borrowerDept,
        machineId: '-',
        machineName,
        borrowDate: new Date(borrowDate).toISOString(),
        status,
        actualReturnDate: actualReturnDate ? new Date(actualReturnDate).toISOString() : null,
        returnCondition,
        remark,
        returnRemark,
        editedBy
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการบันทึก');

    closeEditToolLoanModal();

    // Refresh DB
    const dbRes = await fetch('/api/db');
    appState.db = await dbRes.json();
    updateHeaderCounts();
    renderToolLoans(document.getElementById('mainContent'));

    Swal.fire({
      icon: 'success',
      title: 'แก้ไขข้อมูลสำเร็จ',
      text: `อัปเดตข้อมูลรายการยืมเครื่องมือ ${toolName} เรียบร้อยแล้ว`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#0284c7'
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

async function confirmDeleteToolLoan() {
  const loanId = document.getElementById('editLoanId').value;
  const toolName = document.getElementById('editLoanToolName').value;
  const deletedBy = (appState.currentUser && appState.currentUser.name) || 'Store';

  const confirmResult = await Swal.fire({
    title: 'ยืนยันการลบรายการยืม?',
    text: `ต้องการลบรายการยืมเครื่องมือ "${toolName}" (${loanId}) ใช่หรือไม่? ข้อมูลนี้จะถูกบันทึกลงใน Audit Log`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ใช่, ลบรายการ',
    cancelButtonText: 'ยกเลิก'
  });

  if (!confirmResult.isConfirmed) return;

  try {
    const res = await fetch('/api/tool-loans/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loanId,
        deletedBy,
        reason: 'ลบรายการโดยผู้ใช้ผ่านหน้าจอแก้ไข'
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการลบ');

    closeEditToolLoanModal();

    // Refresh DB
    const dbRes = await fetch('/api/db');
    appState.db = await dbRes.json();
    updateHeaderCounts();
    renderToolLoans(document.getElementById('mainContent'));

    Swal.fire({
      icon: 'success',
      title: 'ลบรายการสำเร็จ',
      text: `ลบรายการ ${loanId} เรียบร้อยแล้ว`,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#10b981'
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

