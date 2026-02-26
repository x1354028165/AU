/**
 * ui_router.js - UI渲染、汉堡菜单、i18n 与仿真联动
 * Phase 2: 澳洲储能电站管理平台
 */

// ============ 配色方案 ============
const THEMES = {
  owner: {
    sidebar: 'bg-slate-900', sidebarText: 'text-slate-200',
    sidebarActive: 'bg-amber-500/20 text-amber-400', sidebarHover: 'hover:bg-slate-800',
    content: 'bg-slate-950', card: 'bg-slate-800 border-slate-700',
    accent: 'text-amber-400', accentBg: 'bg-amber-500',
    badge: 'bg-amber-500/20 text-amber-400', header: 'text-amber-400'
  },
  operator: {
    sidebar: 'bg-zinc-950', sidebarText: 'text-zinc-200',
    sidebarActive: 'bg-emerald-500/20 text-emerald-400', sidebarHover: 'hover:bg-zinc-900',
    content: 'bg-zinc-950', card: 'bg-zinc-900 border-zinc-800',
    accent: 'text-emerald-400', accentBg: 'bg-emerald-500',
    badge: 'bg-emerald-500/20 text-emerald-400', header: 'text-emerald-400'
  }
};

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
  const theme = THEMES[isOwner ? 'owner' : 'operator'];

  renderSidebar(role, theme);
  renderHeader(role, theme);
  renderMarketBanner();
  renderStationList(theme, isOwner);
  closeMobileMenu();

  // 初始化图表和仿真
  if (typeof initChart === 'function') initChart();
  if (typeof startSimulator === 'function') startSimulator();
}

// ============ 仿真回调 ============

/**
 * 仿真引擎每 tick 调用此函数
 */
function onSimUpdate(price, history) {
  const role = getCurrentUser();
  const isOwner = role === 'owner';
  const theme = THEMES[isOwner ? 'owner' : 'operator'];

  // 更新市场横幅
  updateMarketBanner(price);

  // 更新电站卡片（不重建DOM，只更新数值）
  updateStationCards(theme, isOwner);

  // 更新图表
  if (typeof updateChart === 'function') updateChart(history);

  // 尖峰警报
  if (price > 5000) {
    triggerSpikeAlert();
  }
}

// ============ 市场横幅 ============

function renderMarketBanner() {
  const banner = document.getElementById('market-banner');
  if (!banner) return;
  banner.innerHTML = `
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
      <div class="flex items-center gap-4">
        <div id="price-display" class="flex items-center gap-2">
          <span class="text-xs text-slate-500 uppercase tracking-wider">${getTrans('market_price')}</span>
          <span id="price-value" class="text-2xl font-bold font-mono text-amber-400">$--</span>
          <span class="text-xs text-slate-500">/MWh</span>
        </div>
        <div id="spike-badge" class="hidden px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-bold animate-pulse">
          ⚠ ${getTrans('price_spike_alert')}
        </div>
      </div>
    </div>
    <div id="market-chart" style="width:100%;height:280px;"></div>
  `;
}

function updateMarketBanner(price) {
  const priceEl = document.getElementById('price-value');
  const spikeBadge = document.getElementById('spike-badge');
  if (!priceEl) return;

  const formatted = price < 0
    ? '-$' + Math.abs(price).toFixed(2)
    : '$' + price.toFixed(2);

  priceEl.textContent = formatted;
  priceEl.className = 'text-2xl font-bold font-mono revenue-tick';

  // 颜色
  if (price > 5000) {
    priceEl.classList.add('text-red-400');
    if (spikeBadge) spikeBadge.classList.remove('hidden');
  } else if (price > 200) {
    priceEl.classList.add('text-amber-400');
    if (spikeBadge) spikeBadge.classList.add('hidden');
  } else if (price < 0) {
    priceEl.classList.add('text-blue-400');
    if (spikeBadge) spikeBadge.classList.add('hidden');
  } else {
    priceEl.classList.add('text-emerald-400');
    if (spikeBadge) spikeBadge.classList.add('hidden');
  }
}

// ============ 尖峰警报 ============

function triggerSpikeAlert() {
  const cards = document.querySelectorAll('.station-card');
  cards.forEach(card => {
    card.classList.add('spike-border');
    setTimeout(() => card.classList.remove('spike-border'), 3000);
  });
}

// ============ 侧边栏 ============

function renderSidebar(role, theme) {
  const sidebar = document.getElementById('sidebar');
  const isOwner = role === 'owner';
  const menus = getMenus();
  const menuItems = isOwner ? menus.owner : menus.operator;
  const userName = isOwner ? getUserName('owner_1') : getUserName(role);

  sidebar.className = `sidebar-panel w-64 min-h-screen ${theme.sidebar} border-r border-white/10 flex flex-col fixed md:relative z-40 transition-transform duration-300`;
  if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');

  sidebar.innerHTML = `
    <button onclick="closeMobileMenu()" class="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white">
      <i data-lucide="x" class="w-5 h-5"></i>
    </button>
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
    <div class="px-6 py-4 border-b border-white/10">
      <p class="text-xs text-slate-500 uppercase tracking-wider">${getTrans('logged_in_as')}</p>
      <p class="text-sm text-white font-medium mt-1">${userName}</p>
      <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs ${theme.badge}">
        ${isOwner ? getTrans('role_owner') : getTrans('role_operator')}
      </span>
    </div>
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
    <div class="p-4 border-t border-white/10">
      <a href="#" onclick="logout()" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
        <i data-lucide="log-out" class="w-4 h-4"></i>
        ${getTrans('sign_out')}
      </a>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

// ============ 汉堡菜单 ============

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.toggle('-translate-x-full');
  if (overlay) overlay.classList.toggle('hidden');
}

function closeMobileMenu() {
  if (window.innerWidth < 768) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
  }
}

// ============ 顶部栏 ============

function renderHeader(role, theme) {
  const header = document.getElementById('header');
  const isOwner = role === 'owner';

  header.className = 'px-4 md:px-8 py-4 border-b border-white/10 flex items-center justify-between';
  header.innerHTML = `
    <div class="flex items-center gap-3">
      <button onclick="toggleMobileMenu()" class="md:hidden text-slate-400 hover:text-white p-1">
        <i data-lucide="menu" class="w-5 h-5"></i>
      </button>
      <div>
        <h2 class="text-lg md:text-xl font-bold text-white">${getTrans('assets_overview')}</h2>
        <p class="text-xs md:text-sm text-slate-400 mt-0.5">${isOwner ? getTrans('owner_subtitle') : getTrans('operator_subtitle')}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs text-slate-500 hidden sm:inline">${new Date().toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      <button onclick="toggleLangAndRefresh()" class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
        ${getTrans('lang_switch')}
      </button>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function toggleLangAndRefresh() {
  toggleLang();
  // 需要重新初始化图表（legend 文案更新）
  if (typeof disposeChart === 'function') disposeChart();
  initDashboard();
}

// ============ 电站卡片 ============

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

  // Status
  const statusIcon = station.status === 'CHARGING' ? '⚡' : station.status === 'DISCHARGING' ? '🔋' : '⏸';
  const statusText = station.status === 'CHARGING' ? getTrans('charging')
    : station.status === 'DISCHARGING' ? getTrans('discharging')
    : getTrans('idle');
  const statusColor = station.status === 'CHARGING' ? 'text-blue-400'
    : station.status === 'DISCHARGING' ? 'text-emerald-400'
    : 'text-slate-400';

  const statusDot = isUnassigned
    ? '<span class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>'
    : `<span class="w-2 h-2 rounded-full ${station.status === 'DISCHARGING' ? 'bg-emerald-500' : station.status === 'CHARGING' ? 'bg-blue-500' : 'bg-slate-500'}"></span>`;

  const assignmentLabel = isUnassigned
    ? `<span class="text-yellow-400 text-xs font-medium">${getTrans('pending_assignment')}</span>`
    : `<span class="${statusColor} text-xs font-medium">${statusIcon} ${statusText}</span>`;

  // SoC bar
  const socColor = station.soc > 60 ? 'bg-emerald-500' : station.soc > 25 ? 'bg-amber-500' : 'bg-red-500';
  const socBar = !isUnassigned ? `
    <div class="mt-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-slate-500">${getTrans('soc')}</span>
        <span class="text-xs font-mono font-bold text-white">${station.soc.toFixed(1)}%</span>
      </div>
      <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div class="${socColor} h-full rounded-full transition-all duration-500" style="width:${station.soc}%"></div>
      </div>
    </div>
  ` : '';

  // Revenue
  const revenueDisplay = !isUnassigned ? `
    <div class="bg-white/5 rounded-lg p-2 md:p-3">
      <p class="text-xs text-slate-500">${getTrans('revenue_today')}</p>
      <p class="text-sm font-bold font-mono ${station.revenue_today >= 0 ? 'text-emerald-400' : 'text-red-400'} revenue-tick" data-revenue="${station.id}">
        ${station.revenue_today >= 0 ? '' : '-'}A$${Math.abs(station.revenue_today).toFixed(2)}
      </p>
    </div>
  ` : '';

  // Lease remaining
  let remainingHtml = '';
  if (typeof leaseRemaining === 'number') {
    if (leaseRemaining > 90) {
      remainingHtml = `<p class="text-sm text-white mt-0.5 font-mono">${leaseRemaining} ${getTrans('days')}</p>`;
    } else if (leaseRemaining > 0) {
      remainingHtml = `<p class="text-sm text-amber-400 mt-0.5 font-mono font-bold">${leaseRemaining} ${getTrans('days')}</p>`;
    } else if (leaseRemaining === 0) {
      remainingHtml = `<p class="text-sm text-red-400 mt-0.5 font-mono font-bold flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i>${getTrans('expires_today')}</p>`;
    } else {
      remainingHtml = `<p class="text-sm text-red-400 mt-0.5 font-mono font-bold flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i>${Math.abs(leaseRemaining)} ${getTrans('days_overdue')}</p>`;
    }
  } else {
    remainingHtml = '<p class="text-sm text-white mt-0.5 font-mono">-</p>';
  }

  // Assignment control (owner only)
  const assignControl = isOwner ? `
    <div class="mt-4 pt-4 border-t border-white/10">
      <label class="text-xs text-slate-400 block mb-2">${getTrans('assign_to')}</label>
      <div class="flex gap-2">
        <select id="select-${station.id}" class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50">
          <option value="">${getTrans('select_operator')}</option>
          ${operators.map(op => `<option value="${op.id}" ${station.operator_id === op.id ? 'selected' : ''}>${op.name}</option>`).join('')}
          ${!isUnassigned ? `<option value="unassigned">${getTrans('revoke_access')}</option>` : ''}
        </select>
        <button onclick="handleAssign('${station.id}')"
          class="px-4 py-2 ${theme.accentBg} text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
          ${getTrans('assign_btn')}
        </button>
      </div>
    </div>
  ` : '';

  // Lease info (owner only)
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
    <div class="station-card rounded-xl border ${theme.card} p-4 md:p-6 card-fade-in" data-station-id="${station.id}">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${statusDot}
            ${assignmentLabel}
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

      ${socBar}

      <div class="mt-4 grid grid-cols-3 gap-2 md:gap-4">
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('soh')}</p>
          <p class="text-base md:text-lg font-bold text-white font-mono" data-soh="${station.id}">${station.soh.toFixed(4)}%</p>
        </div>
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('operator')}</p>
          <p class="text-xs md:text-sm font-medium text-white mt-1">${currentOpName}</p>
        </div>
        ${revenueDisplay || `
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('station_id')}</p>
          <p class="text-xs md:text-sm font-mono text-slate-300 mt-1">${station.id}</p>
        </div>`}
      </div>

      ${leaseInfo}
      ${assignControl}
    </div>
  `;
}

// ============ 实时更新卡片（不重建DOM）============

function updateStationCards(theme, isOwner) {
  const stationList = getStationsByRole();

  stationList.forEach(station => {
    const card = document.querySelector(`[data-station-id="${station.id}"]`);
    if (!card) return;

    // Update SoH
    const sohEl = card.querySelector(`[data-soh="${station.id}"]`);
    if (sohEl) sohEl.textContent = station.soh.toFixed(4) + '%';

    // Update Revenue
    const revEl = card.querySelector(`[data-revenue="${station.id}"]`);
    if (revEl) {
      const sign = station.revenue_today >= 0 ? '' : '-';
      revEl.textContent = `${sign}A$${Math.abs(station.revenue_today).toFixed(2)}`;
      revEl.className = `text-sm font-bold font-mono ${station.revenue_today >= 0 ? 'text-emerald-400' : 'text-red-400'} revenue-tick`;
    }

    // Update SoC bar
    const socBar = card.querySelector('[style*="width"]');
    if (socBar && !station.operator_id.startsWith('unassigned')) {
      socBar.style.width = station.soc + '%';
      socBar.className = `${station.soc > 60 ? 'bg-emerald-500' : station.soc > 25 ? 'bg-amber-500' : 'bg-red-500'} h-full rounded-full transition-all duration-500`;
    }

    // Update SoC text
    const socText = card.querySelector('.font-mono.font-bold.text-white');
    if (socText && socText.textContent.includes('%') && !socText.getAttribute('data-soh')) {
      // This is the SoC percentage (in the bar area)
    }
  });
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

// ============ Toast ============

function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const colors = { success: 'bg-emerald-500', warning: 'bg-amber-500', error: 'bg-red-500' };
  const icons = { success: 'check-circle', warning: 'alert-triangle', error: 'x-circle' };

  const toast = document.createElement('div');
  toast.className = `toast fixed top-5 left-1/2 -translate-x-1/2 ${colors[type]} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 z-50 toast-enter`;
  toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-4 h-4"></i><span class="text-sm font-medium">${msg}</span>`;
  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 2000);
}

// ============ 登出 ============

function logout() {
  if (typeof stopSimulator === 'function') stopSimulator();
  if (typeof disposeChart === 'function') disposeChart();
  localStorage.removeItem('role');
  localStorage.removeItem('isLoggedIn');
  window.location.href = 'index.html';
}

// ============ 窗口大小 ============
window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth >= 768) {
    sidebar.classList.remove('-translate-x-full');
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
});
