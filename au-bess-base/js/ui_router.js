/**
 * ui_router.js - UI渲染、汉堡菜单与 i18n 动态文案
 * Phase 1 Enhanced: 澳洲储能电站管理平台
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
function getMenus() {
  return {
    owner: [
      { id: 'portfolio', labelKey: 'menu_portfolio', icon: 'briefcase' },
      { id: 'assets', labelKey: 'menu_assets', icon: 'battery-charging' },
      { id: 'lease', labelKey: 'menu_lease', icon: 'file-text' },
      { id: 'health', labelKey: 'menu_health', icon: 'activity' }
    ],
    operator: [
      { id: 'dispatch', labelKey: 'menu_dispatch', icon: 'zap' },
      { id: 'assets', labelKey: 'menu_assets', icon: 'battery-charging' },
      { id: 'logs', labelKey: 'menu_logs', icon: 'scroll-text' }
    ]
  };
}

// ============ 初始化 ============

function initDashboard() {
  const role = getCurrentUser();
  if (!role || !localStorage.getItem('isLoggedIn')) {
    window.location.href = 'index.html';
    return;
  }

  const isOwner = role === 'owner';
  const themeKey = isOwner ? 'owner' : 'operator';
  const theme = THEMES[themeKey];

  renderSidebar(role, theme);
  renderHeader(role, theme);
  renderStationList(theme, isOwner);

  // 关闭移动端菜单（如果开着）
  closeMobileMenu();
}

// ============ 侧边栏 ============

function renderSidebar(role, theme) {
  const sidebar = document.getElementById('sidebar');
  const isOwner = role === 'owner';
  const menus = getMenus();
  const menuItems = isOwner ? menus.owner : menus.operator;
  const userName = isOwner ? getUserName('owner_1') : getUserName(role);

  sidebar.className = `sidebar-panel w-64 min-h-screen ${theme.sidebar} border-r border-white/10 flex flex-col fixed md:relative z-40 transition-transform duration-300`;

  // 移动端默认隐藏
  if (window.innerWidth < 768) {
    sidebar.classList.add('-translate-x-full');
  }

  sidebar.innerHTML = `
    <!-- Close button (mobile) -->
    <button onclick="closeMobileMenu()" class="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white">
      <i data-lucide="x" class="w-5 h-5"></i>
    </button>

    <!-- Logo -->
    <div class="p-6 border-b border-white/10">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg ${theme.accentBg} flex items-center justify-center">
          <i data-lucide="zap" class="w-5 h-5 text-white"></i>
        </div>
        <div>
          <h1 class="text-white font-bold text-sm">${getTrans('app_title')}</h1>
          <p class="text-xs ${theme.accent}">${isOwner ? getTrans('owner_portal') : getTrans('operator_portal')}</p>
        </div>
      </div>
    </div>

    <!-- User -->
    <div class="px-6 py-4 border-b border-white/10">
      <p class="text-xs text-slate-500 uppercase tracking-wider">${getTrans('logged_in_as')}</p>
      <p class="text-sm text-white font-medium mt-1">${userName}</p>
      <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs ${theme.badge}">
        ${isOwner ? getTrans('role_owner') : getTrans('role_operator')}
      </span>
    </div>

    <!-- Menu -->
    <nav class="flex-1 p-4 space-y-1">
      ${menuItems.map((item, i) => `
        <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
          ${i === 1 ? theme.sidebarActive : theme.sidebarText + ' ' + theme.sidebarHover}"
          onclick="closeMobileMenu(); return false;">
          <i data-lucide="${item.icon}" class="w-4 h-4"></i>
          ${getTrans(item.labelKey)}
        </a>
      `).join('')}
    </nav>

    <!-- Logout -->
    <div class="p-4 border-t border-white/10">
      <a href="#" onclick="logout()" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
        <i data-lucide="log-out" class="w-4 h-4"></i>
        ${getTrans('sign_out')}
      </a>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

// ============ 移动端汉堡菜单 ============

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.toggle('-translate-x-full');
  if (overlay) overlay.classList.toggle('hidden');
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (window.innerWidth < 768) {
    sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
  }
}

// ============ 顶部栏 ============

function renderHeader(role, theme) {
  const header = document.getElementById('header');
  const isOwner = role === 'owner';
  const currentLang = getLang();

  header.className = 'px-4 md:px-8 py-4 border-b border-white/10 flex items-center justify-between';
  header.innerHTML = `
    <div class="flex items-center gap-3">
      <!-- Hamburger (mobile) -->
      <button onclick="toggleMobileMenu()" class="md:hidden text-slate-400 hover:text-white p-1">
        <i data-lucide="menu" class="w-5 h-5"></i>
      </button>
      <div>
        <h2 class="text-lg md:text-xl font-bold text-white">${getTrans('assets_overview')}</h2>
        <p class="text-xs md:text-sm text-slate-400 mt-0.5">${isOwner ? getTrans('owner_subtitle') : getTrans('operator_subtitle')}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs text-slate-500 hidden sm:inline">${new Date().toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      <!-- Language Switch -->
      <button onclick="toggleLangAndRefresh()" class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
        ${getTrans('lang_switch')}
      </button>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

/**
 * 切换语言并刷新 Dashboard
 */
function toggleLangAndRefresh() {
  toggleLang();
  initDashboard();
  // 同步更新登录页语言切换按钮（如果存在）
}

// ============ 电站卡片列表 ============

function renderStationList(theme, isOwner) {
  const container = document.getElementById('station-container');
  const stationList = getStationsByRole();

  if (stationList.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-slate-500">
        <i data-lucide="battery-warning" class="w-16 h-16 mb-4 opacity-50"></i>
        <p class="text-lg">${getTrans('no_stations')}</p>
        <p class="text-sm mt-1">${getTrans('no_stations_hint')}</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 max-w-[1600px] mx-auto">
      ${stationList.map(s => renderStationCard(s, theme, isOwner)).join('')}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function renderStationCard(station, theme, isOwner) {
  const isUnassigned = station.operator_id === 'unassigned';
  const leaseRemaining = getLeaseRemaining(station.lease_end);
  const operators = getOperators();
  const currentOpName = isUnassigned ? getTrans('unassigned') : getUserName(station.operator_id);

  const statusDot = isUnassigned
    ? '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>'
    : '<span class="w-2 h-2 rounded-full bg-emerald-500"></span>';

  const statusText = isUnassigned
    ? `<span class="text-yellow-400 text-xs font-medium">${getTrans('pending_assignment')}</span>`
    : `<span class="text-emerald-400 text-xs font-medium">${getTrans('active')}</span>`;

  // 租约剩余天数渲染
  let remainingHtml = '';
  if (typeof leaseRemaining === 'number') {
    if (leaseRemaining > 90) {
      remainingHtml = `<p class="text-sm text-white mt-0.5 font-mono">${leaseRemaining} ${getTrans('days')}</p>`;
    } else if (leaseRemaining > 0) {
      remainingHtml = `<p class="text-sm text-amber-400 mt-0.5 font-mono font-bold">${leaseRemaining} ${getTrans('days')}</p>`;
    } else if (leaseRemaining === 0) {
      remainingHtml = `<p class="text-sm text-red-400 mt-0.5 font-mono font-bold flex items-center gap-1">
        <i data-lucide="alert-triangle" class="w-3 h-3"></i>${getTrans('expires_today')}</p>`;
    } else {
      remainingHtml = `<p class="text-sm text-red-400 mt-0.5 font-mono font-bold flex items-center gap-1">
        <i data-lucide="alert-triangle" class="w-3 h-3"></i>${Math.abs(leaseRemaining)} ${getTrans('days_overdue')}</p>`;
    }
  } else {
    remainingHtml = '<p class="text-sm text-white mt-0.5 font-mono">-</p>';
  }

  const assignControl = isOwner ? `
    <div class="mt-4 pt-4 border-t border-white/10">
      <label class="text-xs text-slate-400 block mb-2">${getTrans('assign_to')}</label>
      <div class="flex gap-2">
        <select id="select-${station.id}" class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50">
          <option value="">${getTrans('select_operator')}</option>
          ${operators.map(op => `
            <option value="${op.id}" ${station.operator_id === op.id ? 'selected' : ''}>${op.name}</option>
          `).join('')}
          ${!isUnassigned ? `<option value="unassigned">${getTrans('revoke_access')}</option>` : ''}
        </select>
        <button onclick="handleAssign('${station.id}')"
          class="px-4 py-2 ${theme.accentBg} text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
          ${getTrans('assign_btn')}
        </button>
      </div>
    </div>
  ` : '';

  const leaseInfo = isOwner ? `
    <div class="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
      <div>
        <p class="text-xs text-slate-500">${getTrans('lease_period')}</p>
        <p class="text-sm text-white mt-0.5">${station.lease_start === '-' ? '-' : station.lease_start + ' ~ ' + station.lease_end}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500">${getTrans('annual_fee')}</p>
        <p class="text-sm ${theme.accent} font-semibold mt-0.5">${formatAUD(station.annual_fee)}</p>
      </div>
      <div>
        <p class="text-xs text-slate-500">${getTrans('remaining')}</p>
        ${remainingHtml}
      </div>
    </div>
  ` : '';

  return `
    <div class="rounded-xl border ${theme.card} p-4 md:p-6 card-fade-in">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${statusDot}
            ${statusText}
          </div>
          <h3 class="text-base md:text-lg font-bold text-white">${station.name}</h3>
          <p class="text-sm text-slate-400 flex items-center gap-1 mt-1">
            <i data-lucide="map-pin" class="w-3 h-3"></i>
            ${station.location}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">${getTrans('capacity')}</p>
          <p class="text-sm ${theme.accent} font-mono font-bold">${station.capacity}</p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-3 gap-2 md:gap-4">
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('soh')}</p>
          <p class="text-base md:text-lg font-bold text-white font-mono">${station.soh.toFixed(2)}%</p>
        </div>
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('operator')}</p>
          <p class="text-xs md:text-sm font-medium text-white mt-1">${currentOpName}</p>
        </div>
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('station_id')}</p>
          <p class="text-xs md:text-sm font-mono text-slate-300 mt-1">${station.id}</p>
        </div>
      </div>

      ${leaseInfo}
      ${assignControl}
    </div>
  `;
}

// ============ 划转交互 ============

function handleAssign(stationId) {
  const select = document.getElementById(`select-${stationId}`);
  const targetOpId = select.value;

  if (!targetOpId) {
    showToast(getTrans('select_operator_warning'), 'warning');
    return;
  }

  const station = stations.find(s => s.id === stationId);
  const targetName = targetOpId === 'unassigned' ? getTrans('unassigned') : getUserName(targetOpId);

  const confirmed = window.confirm(
    `${getTrans('confirm_assign')}\n\n${getTrans('confirm_station')}: ${station.name}\n${getTrans('confirm_location')}: ${station.location}\n→ ${targetName}\n\n${getTrans('confirm_msg')}`
  );

  if (!confirmed) return;

  const success = assignStation(stationId, targetOpId);
  if (success) {
    showToast(`${station.name} → ${targetName}`, 'success');
    const role = getCurrentUser();
    const isOwner = role === 'owner';
    const theme = THEMES[isOwner ? 'owner' : 'operator'];
    renderStationList(theme, isOwner);
  } else {
    showToast(getTrans('assign_fail'), 'error');
  }
}

// ============ Toast 通知 ============

function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const colors = { success: 'bg-emerald-500', warning: 'bg-amber-500', error: 'bg-red-500' };
  const icons = { success: 'check-circle', warning: 'alert-triangle', error: 'x-circle' };

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
  localStorage.removeItem('isLoggedIn');
  window.location.href = 'index.html';
}

// ============ 窗口大小变化监听 ============
window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth >= 768) {
    sidebar.classList.remove('-translate-x-full');
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
});
