/**
 * ui_router.js - UI渲染与划转交互
 * Phase 1: 澳洲储能电站管理平台
 */

// ============ 配色方案 ============
const THEMES = {
  owner: {
    sidebar: 'bg-slate-900',
    sidebarText: 'text-slate-200',
    sidebarActive: 'bg-amber-500/20 text-amber-400',
    sidebarHover: 'hover:bg-slate-800',
    content: 'bg-slate-950',
    card: 'bg-slate-800 border-slate-700',
    accent: 'text-amber-400',
    accentBg: 'bg-amber-500',
    badge: 'bg-amber-500/20 text-amber-400',
    header: 'text-amber-400'
  },
  operator: {
    sidebar: 'bg-zinc-950',
    sidebarText: 'text-zinc-200',
    sidebarActive: 'bg-emerald-500/20 text-emerald-400',
    sidebarHover: 'hover:bg-zinc-900',
    content: 'bg-zinc-950',
    card: 'bg-zinc-900 border-zinc-800',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500',
    badge: 'bg-emerald-500/20 text-emerald-400',
    header: 'text-emerald-400'
  }
};

// ============ 菜单配置 ============
const MENUS = {
  owner: [
    { id: 'portfolio', label: 'Portfolio', icon: 'briefcase' },
    { id: 'assets', label: 'Assets', icon: 'battery-charging' },
    { id: 'lease', label: 'Lease', icon: 'file-text' },
    { id: 'health', label: 'Health', icon: 'activity' }
  ],
  operator: [
    { id: 'dispatch', label: 'Dispatch', icon: 'zap' },
    { id: 'assets', label: 'Assets', icon: 'battery-charging' },
    { id: 'logs', label: 'Logs', icon: 'scroll-text' }
  ]
};

// ============ 初始化 ============

/**
 * Dashboard 入口函数，页面加载时调用
 */
function initDashboard() {
  const role = getCurrentUser();

  // 未登录则跳回登录页
  if (!role) {
    window.location.href = 'index.html';
    return;
  }

  const isOwner = role === 'owner';
  const themeKey = isOwner ? 'owner' : 'operator';
  const theme = THEMES[themeKey];

  renderSidebar(role, theme);
  renderHeader(role, theme);
  renderStationList(theme, isOwner);
}

// ============ 侧边栏 ============

/**
 * 渲染侧边栏菜单
 */
function renderSidebar(role, theme) {
  const sidebar = document.getElementById('sidebar');
  const isOwner = role === 'owner';
  const menuItems = isOwner ? MENUS.owner : MENUS.operator;
  const userName = isOwner ? getUserName('owner_1') : getUserName(role);

  sidebar.className = `w-64 min-h-screen ${theme.sidebar} border-r border-white/10 flex flex-col`;

  sidebar.innerHTML = `
    <!-- Logo -->
    <div class="p-6 border-b border-white/10">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg ${theme.accentBg} flex items-center justify-center">
          <i data-lucide="zap" class="w-5 h-5 text-white"></i>
        </div>
        <div>
          <h1 class="text-white font-bold text-sm">AU BESS Platform</h1>
          <p class="text-xs ${theme.accent}">${isOwner ? 'Owner Portal' : 'Operator Portal'}</p>
        </div>
      </div>
    </div>

    <!-- User -->
    <div class="px-6 py-4 border-b border-white/10">
      <p class="text-xs text-slate-500 uppercase tracking-wider">Logged in as</p>
      <p class="text-sm text-white font-medium mt-1">${userName}</p>
      <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs ${theme.badge}">
        ${isOwner ? 'Owner' : 'Operator'}
      </span>
    </div>

    <!-- Menu -->
    <nav class="flex-1 p-4 space-y-1">
      ${menuItems.map((item, i) => `
        <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
          ${i === 1 ? theme.sidebarActive : theme.sidebarText + ' ' + theme.sidebarHover}"
          onclick="return false;">
          <i data-lucide="${item.icon}" class="w-4 h-4"></i>
          ${item.label}
        </a>
      `).join('')}
    </nav>

    <!-- Logout -->
    <div class="p-4 border-t border-white/10">
      <a href="#" onclick="logout()" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
        <i data-lucide="log-out" class="w-4 h-4"></i>
        Sign Out
      </a>
    </div>
  `;

  // 重新渲染 Lucide 图标
  if (window.lucide) lucide.createIcons();
}

// ============ 顶部栏 ============

function renderHeader(role, theme) {
  const header = document.getElementById('header');
  const isOwner = role === 'owner';

  header.className = `px-8 py-4 border-b border-white/10 flex items-center justify-between`;
  header.innerHTML = `
    <div>
      <h2 class="text-xl font-bold text-white">Assets Overview</h2>
      <p class="text-sm text-slate-400 mt-0.5">${isOwner ? 'Manage your energy storage portfolio' : 'Your assigned stations'}</p>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs text-slate-500">${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
    </div>
  `;
}

// ============ 电站卡片列表 ============

/**
 * 渲染电站卡片列表
 */
function renderStationList(theme, isOwner) {
  const container = document.getElementById('station-container');
  const stationList = getStationsByRole();

  if (stationList.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-slate-500">
        <i data-lucide="battery-warning" class="w-16 h-16 mb-4 opacity-50"></i>
        <p class="text-lg">No stations assigned</p>
        <p class="text-sm mt-1">Contact the asset owner for access</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${stationList.map(s => renderStationCard(s, theme, isOwner)).join('')}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

/**
 * 渲染单个电站卡片
 */
function renderStationCard(station, theme, isOwner) {
  const isUnassigned = station.operator_id === 'unassigned';
  const leaseRemaining = getLeaseRemaining(station.lease_end);
  const operators = getOperators();
  const currentOpName = isUnassigned ? 'Unassigned' : getUserName(station.operator_id);

  // 状态标识
  const statusDot = isUnassigned
    ? '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>'
    : '<span class="w-2 h-2 rounded-full bg-emerald-500"></span>';

  const statusText = isUnassigned
    ? '<span class="text-yellow-400 text-xs font-medium">Pending Assignment</span>'
    : `<span class="text-emerald-400 text-xs font-medium">Active</span>`;

  // 划转控件（仅业主可见）
  const assignControl = isOwner ? `
    <div class="mt-4 pt-4 border-t border-white/10">
      <label class="text-xs text-slate-400 block mb-2">Assign to Operator</label>
      <div class="flex gap-2">
        <select id="select-${station.id}" class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50">
          <option value="">Select operator...</option>
          ${operators.map(op => `
            <option value="${op.id}" ${station.operator_id === op.id ? 'selected' : ''}>${op.name}</option>
          `).join('')}
          ${!isUnassigned ? '<option value="unassigned">— Revoke Access —</option>' : ''}
        </select>
        <button onclick="handleAssign('${station.id}')"
          class="px-4 py-2 ${theme.accentBg} text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
          Assign
        </button>
      </div>
    </div>
  ` : '';

  // 租约信息（仅业主可见）
  const leaseInfo = isOwner ? `
    <div class="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4">
      <div>
        <p class="text-xs text-slate-500">Lease Period</p>
        <p class="text-sm text-white mt-0.5">${station.lease_start === '-' ? '-' : station.lease_start + ' ~ ' + station.lease_end}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500">Annual Fee</p>
        <p class="text-sm ${theme.accent} font-semibold mt-0.5">${formatAUD(station.annual_fee)}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500">Remaining</p>
        <p class="text-sm text-white mt-0.5 font-mono">${typeof leaseRemaining === 'number' ? leaseRemaining + ' days' : '-'}</p>
      </div>
    </div>
  ` : '';

  return `
    <div class="rounded-xl border ${theme.card} p-6 card-fade-in">
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${statusDot}
            ${statusText}
          </div>
          <h3 class="text-lg font-bold text-white">${station.name}</h3>
          <p class="text-sm text-slate-400 flex items-center gap-1 mt-1">
            <i data-lucide="map-pin" class="w-3 h-3"></i>
            ${station.location}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">Capacity</p>
          <p class="text-sm ${theme.accent} font-mono font-bold">${station.capacity}</p>
        </div>
      </div>

      <!-- Metrics -->
      <div class="mt-4 grid grid-cols-3 gap-4">
        <div class="bg-white/5 rounded-lg p-3">
          <p class="text-xs text-slate-500">SoH</p>
          <p class="text-lg font-bold text-white font-mono">${station.soh.toFixed(2)}%</p>
        </div>
        <div class="bg-white/5 rounded-lg p-3">
          <p class="text-xs text-slate-500">Operator</p>
          <p class="text-sm font-medium text-white mt-1">${currentOpName}</p>
        </div>
        <div class="bg-white/5 rounded-lg p-3">
          <p class="text-xs text-slate-500">ID</p>
          <p class="text-sm font-mono text-slate-300 mt-1">${station.id}</p>
        </div>
      </div>

      <!-- Lease Info (Owner Only) -->
      ${leaseInfo}

      <!-- Assign Control (Owner Only) -->
      ${assignControl}
    </div>
  `;
}

// ============ 划转交互 ============

/**
 * 处理划转操作
 */
function handleAssign(stationId) {
  const select = document.getElementById(`select-${stationId}`);
  const targetOpId = select.value;

  if (!targetOpId) {
    showToast('Please select an operator', 'warning');
    return;
  }

  const station = stations.find(s => s.id === stationId);
  const targetName = targetOpId === 'unassigned' ? 'Unassigned' : getUserName(targetOpId);
  const action = targetOpId === 'unassigned' ? 'revoke access for' : `assign to ${targetName}`;

  const confirmed = window.confirm(
    `Confirm: ${action}\n\nStation: ${station.name}\nLocation: ${station.location}\n\nProceed?`
  );

  if (!confirmed) return;

  const success = assignStation(stationId, targetOpId);
  if (success) {
    showToast(`${station.name} → ${targetName}`, 'success');
    // 重新渲染
    const role = getCurrentUser();
    const isOwner = role === 'owner';
    const theme = THEMES[isOwner ? 'owner' : 'operator'];
    renderStationList(theme, isOwner);
  } else {
    showToast('Assignment failed', 'error');
  }
}

// ============ Toast 通知 ============

/**
 * 显示 Toast 提示
 * @param {string} msg - 提示文本
 * @param {string} type - 'success' | 'warning' | 'error'
 */
function showToast(msg, type = 'success') {
  // 移除已有 toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const colors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500'
  };

  const icons = {
    success: 'check-circle',
    warning: 'alert-triangle',
    error: 'x-circle'
  };

  const toast = document.createElement('div');
  toast.className = `toast fixed top-5 left-1/2 -translate-x-1/2 ${colors[type]} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 z-50 toast-enter`;
  toast.innerHTML = `
    <i data-lucide="${icons[type]}" class="w-4 h-4"></i>
    <span class="text-sm font-medium">${msg}</span>
  `;

  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ============ 登出 ============

function logout() {
  localStorage.removeItem('role');
  window.location.href = 'index.html';
}
