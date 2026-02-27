/**
 * ui_router.js - UI渲染、汉堡菜单、i18n 与仿真联动
 * Phase 2: 澳洲储能电站管理平台
 */

// ============ XSS 防御：HTML 转义工具 ============
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

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

let currentView = 'dashboard';
let activeMenuId = 'assets';
let stationViewMode = 'cards'; // 'map' | 'cards' | 'list'
let mapInstance = null; // Leaflet 单体模式
let mapMarkers = [];

function getMenus() {
  return {
    owner: [
      { id: 'portfolio', labelKey: 'menu_portfolio', icon: 'briefcase', view: 'dashboard' },
      { id: 'assets', labelKey: 'menu_assets', icon: 'battery-charging', view: 'dashboard' },
      { id: 'lease', labelKey: 'menu_lease', icon: 'file-text', view: 'reports' },
      { id: 'health', labelKey: 'menu_health', icon: 'activity', view: 'reports' },
      { id: 'alarms', labelKey: 'menu_alarms', icon: 'alert-triangle', view: 'reports' }
    ],
    operator: [
      { id: 'dispatch', labelKey: 'menu_dispatch', icon: 'zap', view: 'dashboard' },
      { id: 'assets', labelKey: 'menu_assets', icon: 'battery-charging', view: 'dashboard' },
      { id: 'logs', labelKey: 'menu_logs', icon: 'scroll-text', view: 'reports' },
      { id: 'alarms', labelKey: 'menu_alarms', icon: 'alert-triangle', view: 'reports' }
    ]
  };
}

/**
 * 切换视图
 */
function switchView(viewId) {
  currentView = viewId;
  const dashView = document.getElementById('view-dashboard');
  const reportView = document.getElementById('view-reports');
  const detailView = document.getElementById('view-detail');

  if (!dashView || !reportView) return;

  // 隐藏全部
  dashView.classList.add('hidden');
  reportView.classList.add('hidden');
  if (detailView) detailView.classList.add('hidden');

  if (viewId === 'reports') {
    reportView.classList.remove('hidden');
    if (typeof renderReports === 'function') renderReports(reportSubView);
  } else if (viewId === 'detail') {
    if (detailView) detailView.classList.remove('hidden');
  } else {
    dashView.classList.remove('hidden');
  }
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
  renderKPI(role, theme);

  if (isOwner) {
    // 业主：不显示市场电价，显示资产健康概览
    renderOwnerPortfolioBanner();
  } else {
    // 运维：保留市场电价横幅 + 图表
    renderMarketBanner();
    if (typeof initChart === 'function') initChart();
  }

  // 根据角色设置默认菜单并渲染
  if (isOwner) {
    activeMenuId = 'portfolio';  // 业主默认：资产组合首页
  } else {
    activeMenuId = 'dispatch';   // 运维默认：调度中心
    // 调度中心：隐藏所有不需要的顶部元素
    const viewToggle = document.getElementById('view-toggle-container');
    const mapCont = document.getElementById('map-container');
    const listCont = document.getElementById('list-container');
    const stationCont = document.getElementById('station-container');
    const kpiRow = document.getElementById('kpi-container');
    const marketBanner = document.getElementById('market-banner');
    if (viewToggle) viewToggle.classList.add('hidden');
    if (mapCont) mapCont.classList.add('hidden');
    if (listCont) listCont.classList.add('hidden');
    if (kpiRow) kpiRow.classList.add('hidden');
    if (marketBanner) marketBanner.classList.add('hidden');
    if (stationCont) {
      stationCont.classList.remove('hidden');
      renderDispatchControlPanel(stationCont);
    }
    renderSidebar(role, theme); // 刷新高亮
  }

  if (isOwner) {
    renderViewToggle(theme, isOwner);
    applyStationView(theme, isOwner);
    renderSidebar(role, theme);
  }
  closeMobileMenu();

  // 仿真引擎：始终启动（运维需要实时电价，业主也需要间接收益计算）
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

  // 更新 KPI
  updateKPI(role, theme, price);

  // 运维：更新市场横幅；业主：更新资产概览
  if (isOwner) {
    updateOwnerPortfolioBanner();
  } else {
    updateMarketBanner(price);
  }

  // 更新电站卡片或调度面板（不重建DOM，只更新数值）
  if (activeMenuId === 'dispatch') {
    updateDispatchPanel();
    // 更新调度图表
    if (typeof updateDispatchChart === 'function') updateDispatchChart(history);
  } else {
    updateStationCards(theme, isOwner);
  }

  // 更新图表
  if (typeof updateChart === 'function') updateChart(history);

  // 尖峰警报
  if (price > 5000) {
    triggerSpikeAlert();
  }

  // 如果当前在报表视图，实时更新
  if (currentView === 'reports' && typeof renderReports === 'function') {
    renderReports();
  }

  // 地图视图下更新标记颜色
  if (stationViewMode === 'map' && mapInstance) {
    // 重绘标记以反映状态变化
    renderMapView(THEMES[role === 'owner' ? 'owner' : 'operator'], role === 'owner');
  }

  // 列表视图下更新数据
  if (stationViewMode === 'list') {
    renderListView(THEMES[role === 'owner' ? 'owner' : 'operator'], role === 'owner');
  }
}

// ============ 三视图切换 ============

function renderViewToggle(theme, isOwner) {
  const container = document.getElementById('view-toggle-container');
  if (!container) return;

  const modes = [
    { id: 'map', icon: 'map-pin', labelKey: 'view_map' },
    { id: 'cards', icon: 'layout-grid', labelKey: 'view_cards' },
    { id: 'list', icon: 'list', labelKey: 'view_list' }
  ];

  const addStationBtn = isOwner ? `
    <button onclick="openAddStationModal()"
      class="px-4 py-2 rounded-lg ${theme.accentBg} text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
      <i data-lucide="plus" class="w-4 h-4"></i>
      ${getTrans('add_station')}
    </button>
  ` : '';

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div class="flex items-center gap-1 bg-white/5 border border-white/20 rounded-lg p-1">
        ${modes.map(m => `
          <button onclick="setStationView('${m.id}')"
            class="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors
            ${stationViewMode === m.id ? theme.accentBg + ' text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}">
            <i data-lucide="${m.icon}" class="w-3.5 h-3.5"></i>
            ${getTrans(m.labelKey)}
          </button>
        `).join('')}
      </div>
      ${addStationBtn}
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function setStationView(mode) {
  stationViewMode = mode;
  const role = getCurrentUser();
  const isOwner = role === 'owner';
  const theme = THEMES[isOwner ? 'owner' : 'operator'];
  renderViewToggle(theme, isOwner);
  applyStationView(theme, isOwner);
}

function applyStationView(theme, isOwner) {
  const cardsCont = document.getElementById('station-container');
  const mapCont = document.getElementById('map-container');
  const listCont = document.getElementById('list-container');
  if (!cardsCont || !mapCont || !listCont) return;

  cardsCont.classList.add('hidden');
  mapCont.classList.add('hidden');
  listCont.classList.add('hidden');

  if (stationViewMode === 'map') {
    mapCont.classList.remove('hidden');
    setTimeout(() => {
      renderMapView(theme, isOwner);
    }, 100);
  } else if (stationViewMode === 'list') {
    listCont.classList.remove('hidden');
    renderListView(theme, isOwner);
  } else {
    cardsCont.classList.remove('hidden');
    renderStationList(theme, isOwner);
  }
}

// ============ 地图视图 (Leaflet + 卫星瓦片) ============

function renderMapView(theme, isOwner) {
  const stationList = getStationsByRole();

  if (!mapInstance) {
    mapInstance = L.map('station-map', {
      center: [-28, 145],
      zoom: 5,
      zoomControl: true
    });

    // 卫星瓦片 (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 18
    }).addTo(mapInstance);
  } else {
    mapInstance.invalidateSize();
  }

  // 清理旧标记
  mapMarkers.forEach(m => mapInstance.removeLayer(m));
  mapMarkers = [];

  stationList.forEach(station => {
    if (!station.lat || !station.lng) return;

    const isUnassigned = station.operator_id === 'unassigned';
    const opName = isUnassigned ? getTrans('unassigned') : escapeHTML(getUserName(station.operator_id));
    const statusText = station.status === 'CHARGING' ? '⚡ ' + getTrans('charging')
      : station.status === 'DISCHARGING' ? '🔋 ' + getTrans('discharging')
      : '⏸ ' + getTrans('idle');
    const revText = !isUnassigned ? `<b>${getTrans('revenue_today')}:</b> A$${station.revenue_today.toFixed(2)}` : '';
    const feeText = isOwner ? `<b>${getTrans('annual_fee')}:</b> ${formatAUD(station.annual_fee)}` : '';

    const popupHtml = `
      <div style="min-width:220px;font-family:Inter,sans-serif;">
        <h3 style="margin:0 0 6px;font-size:14px;font-weight:700;">${escapeHTML(station.name)}</h3>
        <p style="margin:2px 0;font-size:12px;color:#666;">${escapeHTML(station.location)}</p>
        <p style="margin:2px 0;font-size:12px;"><b>${getTrans('capacity')}:</b> ${station.capacity}</p>
        <p style="margin:2px 0;font-size:12px;"><b>${getTrans('select_timezone')}:</b> ${station.timezone}</p>
        <p style="margin:2px 0;font-size:12px;"><b>${getTrans('soh')}:</b> ${station.soh.toFixed(4)}%</p>
        ${feeText ? `<p style="margin:2px 0;font-size:12px;">${feeText}</p>` : ''}
        ${revText ? `<p style="margin:2px 0;font-size:12px;">${revText}</p>` : ''}
        <p style="margin:4px 0 6px;font-size:12px;">${statusText}</p>
        <button onclick="openStationDetail('${station.id}')"
          style="display:block;width:100%;padding:6px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
          ${getTrans('tab_overview')} →
        </button>
      </div>
    `;

    const markerColor = isUnassigned ? '#f59e0b' : station.status === 'DISCHARGING' ? '#10b981' : station.status === 'CHARGING' ? '#3b82f6' : '#64748b';
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${markerColor};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <span style="font-size:12px;">⚡</span>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16]
    });

    const marker = L.marker([station.lat, station.lng], { icon }).addTo(mapInstance);
    marker.bindPopup(popupHtml);
    mapMarkers.push(marker);
  });

  // 自适应边界
  if (mapMarkers.length > 0) {
    const group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.3));
  }
}

// ============ 列表视图 ============

function renderListView(theme, isOwner) {
  const container = document.getElementById('list-container');
  const stationList = getStationsByRole();

  if (stationList.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-slate-500">
        <i data-lucide="battery-warning" class="w-16 h-16 mb-4 opacity-50"></i>
        <p class="text-lg">${getTrans('no_stations')}</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // 业主看 Annual Fee + Lease Expiry；运维看 Today Revenue + Alarms
  const extraHeaders = isOwner
    ? `<th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('annual_fee')}</th>
       <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('lease_expiry')}</th>`
    : `<th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('today_revenue')}</th>
       <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('alarm')}</th>`;

  const rows = stationList.map((s, i) => {
    const isUnassigned = s.operator_id === 'unassigned';
    const statusIcon = s.status === 'CHARGING' ? '⚡' : s.status === 'DISCHARGING' ? '🔋' : '⏸';
    const statusColor = s.status === 'CHARGING' ? 'text-blue-400' : s.status === 'DISCHARGING' ? 'text-emerald-400' : 'text-slate-400';
    const leaseRemaining = getLeaseRemaining(s.lease_end);
    const leaseColor = typeof leaseRemaining === 'number' && leaseRemaining <= 90 ? 'text-amber-400' : 'text-slate-300';
    const leaseText = typeof leaseRemaining === 'number' ? `${leaseRemaining} ${getTrans('days')}` : '-';

    const extraCols = isOwner
      ? `<td class="px-4 py-3 text-right font-mono ${theme.accent}">${formatAUD(s.annual_fee)}</td>
         <td class="px-4 py-3 text-right font-mono ${leaseColor}">${leaseText}</td>`
      : `<td class="px-4 py-3 text-right font-mono ${s.revenue_today >= 0 ? 'text-emerald-400' : 'text-red-400'}">
           ${s.revenue_today >= 0 ? '' : '-'}A$${Math.abs(s.revenue_today).toFixed(2)}
         </td>
         <td class="px-4 py-3 text-right text-slate-500 text-xs">${getTrans('no_alarms')}</td>`;

    const actionBtn = isOwner
      ? `<button onclick="openStationDetail('${s.id}')" class="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/20">${getTrans('manage')}</button>`
      : `<button onclick="openStationDetail('${s.id}')" class="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/20">${getTrans('monitor')}</button>`;

    return `
      <tr class="${i % 2 === 0 ? 'bg-white/[0.02]' : ''} border-b border-white/5 hover:bg-white/[0.04] transition-colors">
        <td class="px-4 py-3 text-white font-medium">${escapeHTML(s.name)}</td>
        <td class="px-4 py-3 text-slate-400 text-sm">${escapeHTML(s.location)}</td>
        <td class="px-4 py-3 font-mono ${theme.accent} text-sm">${s.capacity}</td>
        <td class="px-4 py-3 ${statusColor} text-sm">${statusIcon} ${s.status}</td>
        <td class="px-4 py-3 font-mono text-white text-sm">${s.soh.toFixed(2)}%</td>
        ${extraCols}
        <td class="px-4 py-3 text-right">${actionBtn}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="bg-white/5 rounded-xl border border-white/20 overflow-x-auto">
      <table class="w-full text-sm min-w-[800px]">
        <thead>
          <tr class="border-b border-white/20">
            <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('station_name')}</th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('confirm_location')}</th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('capacity')}</th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('status_label')}</th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('soh')}</th>
            ${extraHeaders}
            <th class="text-right px-4 py-3 text-slate-400 font-medium"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

// ============ 电站详情页 ============

function openStationDetail(stationId) {
  const station = getStation(stationId);
  if (!station) return;

  const role = getCurrentUser();
  const isOwner = role === 'owner';
  const theme = THEMES[isOwner ? 'owner' : 'operator'];

  // 隐藏 Dashboard，显示 Detail
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-reports').classList.add('hidden');
  const detailView = document.getElementById('view-detail');
  detailView.classList.remove('hidden');

  currentView = 'detail';
  renderStationDetail(station, theme, isOwner);
}

function closeStationDetail() {
  document.getElementById('view-detail').classList.add('hidden');
  document.getElementById('view-dashboard').classList.remove('hidden');
  currentView = 'dashboard';
}

let detailTab = 'overview';

function setDetailTab(tab, stationId) {
  detailTab = tab;
  const station = getStation(stationId);
  if (!station) return;
  const role = getCurrentUser();
  const isOwner = role === 'owner';
  const theme = THEMES[isOwner ? 'owner' : 'operator'];
  renderStationDetail(station, theme, isOwner);
}

function renderStationDetail(station, theme, isOwner) {
  const container = document.getElementById('view-detail');

  const tabs = [
    { id: 'overview', label: getTrans('tab_overview'), icon: 'activity' },
    { id: 'devices', label: getTrans('tab_devices'), icon: 'cpu' },
    { id: 'history', label: getTrans('tab_history'), icon: 'clock' },
    { id: 'reports', label: getTrans('tab_reports'), icon: 'bar-chart-2' }
  ];

  const tabBar = tabs.map(t => `
    <button onclick="setDetailTab('${t.id}', '${station.id}')"
      class="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors
      ${detailTab === t.id ? theme.accentBg + ' text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}">
      <i data-lucide="${t.icon}" class="w-4 h-4"></i>
      ${t.label}
    </button>
  `).join('');

  let tabContent = '';

  if (detailTab === 'overview') {
    tabContent = renderDetailOverview(station, theme, isOwner);
  } else if (detailTab === 'devices') {
    tabContent = renderDetailDevices(station, theme, isOwner);
  } else if (detailTab === 'history') {
    tabContent = `<div class="flex flex-col items-center justify-center py-16 text-slate-500">
      <i data-lucide="clock" class="w-12 h-12 mb-3 opacity-40"></i>
      <p class="text-base">${getTrans('coming_soon')}</p>
    </div>`;
  } else if (detailTab === 'reports') {
    tabContent = `<div class="flex flex-col items-center justify-center py-16 text-slate-500">
      <i data-lucide="bar-chart-2" class="w-12 h-12 mb-3 opacity-40"></i>
      <p class="text-base">${getTrans('coming_soon')}</p>
    </div>`;
  }

  container.innerHTML = `
    <div class="">
      <!-- Back + Title -->
      <div class="flex items-center gap-4 mb-6">
        <button onclick="closeStationDetail()" class="p-2 rounded-lg bg-white/5 border border-white/20 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <i data-lucide="arrow-left" class="w-5 h-5"></i>
        </button>
        <div>
          <h2 class="text-xl font-bold text-white truncate" style="max-width:75%">${escapeHTML(station.name)}</h2>
          <p class="text-sm text-slate-400">${escapeHTML(station.location)} · ${station.timezone} · ${station.capacity}</p>
        </div>
      </div>
      <!-- Tabs -->
      <div class="flex items-center gap-1 mb-6 bg-white/5 border border-white/20 rounded-lg p-1 overflow-x-auto">
        ${tabBar}
      </div>
      <!-- Content -->
      <div>${tabContent}</div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function renderDetailOverview(station, theme, isOwner) {
  const statusIcon = station.status === 'CHARGING' ? '⚡' : station.status === 'DISCHARGING' ? '🔋' : '⏸';
  const statusText = station.status === 'CHARGING' ? getTrans('charging')
    : station.status === 'DISCHARGING' ? getTrans('discharging')
    : getTrans('idle');

  // 容量对比告警
  const capCheck = checkCapacityMismatch(station);
  let capacityCompare = '';
  if (capCheck) {
    const mismatchClass = capCheck.mismatch ? 'border-red-500/50' : 'border-white/20';
    capacityCompare = `
      <div class="bg-white/5 border ${mismatchClass} rounded-xl p-4 mt-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-slate-400 uppercase tracking-wider">${getTrans('capacity')} Check</span>
          ${capCheck.mismatch ? `<span class="text-xs text-red-400 font-medium animate-pulse">${getTrans('capacity_mismatch')}</span>` : '<span class="text-xs text-emerald-400 font-medium">✓ Match</span>'}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white/5 rounded-lg p-3">
            <p class="text-xs text-slate-500">${getTrans('contract_capacity')}</p>
            <p class="text-sm font-bold font-mono text-white">${capCheck.contract_mw}MW / ${capCheck.contract_mwh}MWh</p>
          </div>
          <div class="bg-white/5 rounded-lg p-3">
            <p class="text-xs text-slate-500">${getTrans('live_capacity')}</p>
            <p class="text-sm font-bold font-mono ${capCheck.mismatch ? 'text-red-400' : 'text-emerald-400'}">${capCheck.live_mw}MW / ${capCheck.live_mwh}MWh</p>
          </div>
        </div>
        ${capCheck.mismatch ? `<p class="text-xs text-red-400 mt-2">Deviation: ${capCheck.deviation_pct}% — please verify device configuration</p>` : ''}
      </div>
    `;
  }

  // 业主视角：隐藏控制按钮；运维视角：显示策略面板
  const strategySection = isOwner ? '' : `
    <div class="mt-6">
      <button onclick="openStrategyModal('${station.id}')"
        class="px-6 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-2">
        <i data-lucide="settings" class="w-4 h-4"></i>
        ${getTrans('strategy_panel')}
      </button>
    </div>`;

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 左：状态信息 -->
      <div class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${kpiCard(getTrans('soh'), station.soh.toFixed(4) + '%', 'heart-pulse', 'text-emerald-400')}
          ${kpiCard(getTrans('soc'), station.soc.toFixed(1) + '%', 'gauge', station.soc > 40 ? 'text-emerald-400' : 'text-amber-400')}
          ${kpiCard(getTrans('revenue_today'), 'A$' + station.revenue_today.toFixed(2), 'dollar-sign', station.revenue_today >= 0 ? 'text-emerald-400' : 'text-red-400')}
          ${kpiCard(getTrans('status_label'), statusIcon + ' ' + statusText, 'activity', theme.accent)}
        </div>
        <div class="bg-white/5 border border-white/20 rounded-xl p-4">
          <p class="text-xs text-slate-500 mb-2">${getTrans('select_timezone')}: ${station.timezone}</p>
          <p class="text-xs text-slate-500">${getTrans('select_region')}: ${station.region} · ${getTrans('efficiency_label')}: ${(station.efficiency * 100).toFixed(0)}%</p>
          ${isOwner ? `
            <div class="mt-3 pt-3 border-t border-white/20">
              <p class="text-xs text-slate-500">${getTrans('lease_period')}: ${station.lease_start} ~ ${station.lease_end}</p>
              <p class="text-xs text-slate-500 mt-1">${getTrans('annual_fee')}: ${formatAUD(station.annual_fee)}</p>
            </div>
          ` : ''}
        </div>
        ${capacityCompare}
        ${strategySection}
      </div>
      <!-- 右：能量流动画 -->
      <div class="bg-white/5 border border-white/20 rounded-xl p-6">
        <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <i data-lucide="zap" class="w-4 h-4 ${theme.accent}"></i>
          ${getTrans('energy_flow')}
        </h3>
        <div id="energy-flow-svg" class="flex items-center justify-center" style="min-height:200px;">
          ${renderEnergyFlowSVG(station)}
        </div>
      </div>
    </div>
  `;
}

function renderDetailDevices(station, theme, isOwner) {
  const devices = station.devices || [];

  const addDeviceBtn = isOwner ? `
    <button onclick="openAddDeviceModal('${station.id}')"
      class="px-4 py-2 rounded-lg ${theme.accentBg} text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
      <i data-lucide="plus" class="w-4 h-4"></i>
      ${getTrans('add_device')}
    </button>
  ` : '';

  const deviceRows = devices.length === 0
    ? `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">${getTrans('no_devices')}</td></tr>`
    : devices.map((d, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white/[0.02]' : ''} border-b border-white/5">
          <td class="px-4 py-3 text-white font-medium">${escapeHTML(d.name)}</td>
          <td class="px-4 py-3 text-slate-400">${escapeHTML(d.type)}</td>
          <td class="px-4 py-3 font-mono text-slate-300 text-sm">${escapeHTML(d.version)}</td>
          <td class="px-4 py-3 text-right font-mono text-xs text-slate-500">${escapeHTML(d.id)}</td>
        </tr>
      `).join('');

  return `
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-bold text-white">${getTrans('tab_devices')} (${devices.length})</h3>
        ${addDeviceBtn}
      </div>
      <div class="bg-white/5 rounded-xl border border-white/20 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/20">
              <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('device_name')}</th>
              <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('device_type')}</th>
              <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('device_version')}</th>
              <th class="text-right px-4 py-3 text-slate-400 font-medium">ID</th>
            </tr>
          </thead>
          <tbody>${deviceRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ============ 能量流 SVG ============

function renderEnergyFlowSVG(station) {
  const isCharging = station.status === 'CHARGING';
  const isDischarging = station.status === 'DISCHARGING';
  const flowColor = isCharging ? '#3b82f6' : isDischarging ? '#10b981' : '#475569';
  const gridToBess = isCharging ? 'visible' : 'hidden';
  const bessToLoad = isDischarging ? 'visible' : 'hidden';

  return `
    <svg viewBox="0 0 400 160" style="width:100%;max-width:400px;height:auto;">
      <!-- Grid -->
      <rect x="10" y="50" width="90" height="60" rx="12" fill="#1e293b" stroke="${isCharging ? '#3b82f6' : '#334155'}" stroke-width="2"/>
      <text x="55" y="78" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600">${getTrans('grid_label')}</text>
      <text x="55" y="96" text-anchor="middle" fill="#64748b" font-size="9">NEM</text>

      <!-- BESS -->
      <rect x="155" y="40" width="90" height="80" rx="12" fill="#1e293b" stroke="${flowColor}" stroke-width="2.5"/>
      <text x="200" y="70" text-anchor="middle" fill="${flowColor}" font-size="11" font-weight="700">${getTrans('bess_label')}</text>
      <text x="200" y="88" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="600">${station.soc.toFixed(0)}%</text>
      <rect x="170" y="98" width="60" height="8" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1"/>
      <rect x="170" y="98" width="${station.soc * 0.6}" height="8" rx="4" fill="${flowColor}"/>

      <!-- Load -->
      <rect x="300" y="50" width="90" height="60" rx="12" fill="#1e293b" stroke="${isDischarging ? '#10b981' : '#334155'}" stroke-width="2"/>
      <text x="345" y="78" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600">${getTrans('load_label')}</text>
      <text x="345" y="96" text-anchor="middle" fill="#64748b" font-size="9">${station.capacity.split('/')[0]}</text>

      <!-- Arrows Grid → BESS -->
      <g visibility="${gridToBess}">
        <line x1="100" y1="80" x2="155" y2="80" stroke="#3b82f6" stroke-width="2.5" stroke-dasharray="6 3">
          <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite"/>
        </line>
        <polygon points="150,74 160,80 150,86" fill="#3b82f6"/>
      </g>

      <!-- Arrows BESS → Load -->
      <g visibility="${bessToLoad}">
        <line x1="245" y1="80" x2="300" y2="80" stroke="#10b981" stroke-width="2.5" stroke-dasharray="6 3">
          <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite"/>
        </line>
        <polygon points="295,74 305,80 295,86" fill="#10b981"/>
      </g>

      <!-- Idle state: no animated arrows, just dashed lines -->
      ${!isCharging && !isDischarging ? `
        <line x1="100" y1="80" x2="155" y2="80" stroke="#334155" stroke-width="1" stroke-dasharray="4 4"/>
        <line x1="245" y1="80" x2="300" y2="80" stroke="#334155" stroke-width="1" stroke-dasharray="4 4"/>
      ` : ''}
    </svg>
  `;
}

// ============ 添加电站模态框 ============

function openAddStationModal() {
  const existing = document.getElementById('add-station-modal');
  if (existing) existing.remove();

  const tzOptions = AU_TIMEZONES.map(tz => `<option value="${tz.value}" data-region="${tz.region}">${tz.label}</option>`).join('');

  const modal = document.createElement('div');
  modal.id = 'add-station-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60" onclick="closeAddStationModal()"></div>
    <div class="relative bg-slate-900 border border-white/20 rounded-2xl w-full max-w-lg p-6 auth-step-enter max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-bold text-white">${getTrans('add_station')}</h3>
        <button onclick="closeAddStationModal()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <p class="text-xs text-slate-500 mb-4"><span class="text-red-400">*</span> = Required field</p>
      <div class="space-y-4">
        <div>
          <label class="text-sm text-slate-300 block mb-1"><span class="text-red-400">*</span> ${getTrans('station_name')}</label>
          <input id="new-st-name" type="text" required placeholder="e.g. Perth BESS Alpha" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
        </div>

        <!-- 核心设备 (先填设备，再同步参数) -->
        <div class="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <label class="text-sm text-slate-300 font-medium">${getTrans('core_device')}</label>
          </div>
          <div class="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label class="text-xs text-slate-500 block mb-1">${getTrans('device_type')}</label>
              <select id="new-st-dev-type" class="w-full bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50">
                <option value="PCS">PCS</option>
                <option value="BMS">BMS</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-slate-500 block mb-1">${getTrans('rated_power')} (MW)</label>
              <input id="new-st-dev-mw" type="number" step="0.5" min="0.1" value="5" class="w-full bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"/>
            </div>
            <div>
              <label class="text-xs text-slate-500 block mb-1">${getTrans('rated_capacity')} (MWh)</label>
              <input id="new-st-dev-mwh" type="number" step="1" min="1" value="10" class="w-full bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"/>
            </div>
          </div>
          <button onclick="syncFromDevice()" class="w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-1.5">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            ${getTrans('sync_from_device')}
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-slate-300 block mb-1"><span class="text-red-400">*</span> ${getTrans('power_mw')}</label>
            <input id="new-st-mw" type="number" step="0.5" min="0.1" value="5" required class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
          </div>
          <div>
            <label class="text-sm text-slate-300 block mb-1"><span class="text-red-400">*</span> ${getTrans('capacity_mwh')}</label>
            <input id="new-st-mwh" type="number" step="1" min="1" value="10" required class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
          </div>
        </div>
        <div>
          <label class="text-sm text-slate-300 block mb-1"><span class="text-red-400">*</span> ${getTrans('select_timezone')}</label>
          <select id="new-st-tz" required onchange="onTzChange()" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50">
            ${tzOptions}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-slate-300 block mb-1"><span class="text-red-400">*</span> ${getTrans('latitude')}</label>
            <input id="new-st-lat" type="number" step="0.0001" required placeholder="-33.8688" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
          </div>
          <div>
            <label class="text-sm text-slate-300 block mb-1"><span class="text-red-400">*</span> ${getTrans('longitude')}</label>
            <input id="new-st-lng" type="number" step="0.0001" required placeholder="151.2093" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
          </div>
        </div>
        <div>
          <label class="text-sm text-slate-300 block mb-1">${getTrans('confirm_location')}</label>
          <input id="new-st-location" type="text" placeholder="e.g. Perth, WA (optional)" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button onclick="closeAddStationModal()" class="flex-1 py-3 rounded-lg bg-white/5 border border-white/20 text-sm text-slate-300 hover:bg-white/10 transition-colors">${getTrans('cancel')}</button>
        <button onclick="handleAddStation()" class="flex-1 py-3 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">${getTrans('confirm_add')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();
}

function closeAddStationModal() {
  const modal = document.getElementById('add-station-modal');
  if (modal) modal.remove();
}

function syncFromDevice() {
  const devMW = parseFloat(document.getElementById('new-st-dev-mw').value);
  const devMWh = parseFloat(document.getElementById('new-st-dev-mwh').value);
  if (!devMW || !devMWh) {
    showToast(getTrans('sync_no_device'), 'warning');
    return;
  }
  document.getElementById('new-st-mw').value = devMW;
  document.getElementById('new-st-mwh').value = devMWh;
  showToast(getTrans('sync_success') + `: ${devMW}MW / ${devMWh}MWh`, 'success');
}

function onTzChange() {
  const sel = document.getElementById('new-st-tz');
  const opt = sel.options[sel.selectedIndex];
  const region = opt.getAttribute('data-region');
  // Auto-fill region hint in location field if empty
  const locInput = document.getElementById('new-st-location');
  if (!locInput.value) {
    locInput.placeholder = region || '';
  }
}

function handleAddStation() {
  const name = document.getElementById('new-st-name').value.trim();
  const mw = parseFloat(document.getElementById('new-st-mw').value) || 5;
  const mwh = parseFloat(document.getElementById('new-st-mwh').value) || 10;
  const tz = document.getElementById('new-st-tz').value;
  const lat = parseFloat(document.getElementById('new-st-lat').value) || 0;
  const lng = parseFloat(document.getElementById('new-st-lng').value) || 0;
  const location = document.getElementById('new-st-location').value.trim();

  if (!name) {
    showToast(getTrans('station_name') + ' required', 'warning');
    return;
  }
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast(getTrans('latitude') + ' / ' + getTrans('longitude') + ' invalid', 'warning');
    return;
  }
  if (!tz) {
    showToast(getTrans('select_timezone') + ' required', 'warning');
    return;
  }
  if (!mw || mw <= 0) {
    showToast(getTrans('power_mw') + ' required', 'warning');
    return;
  }
  if (!mwh || mwh <= 0) {
    showToast(getTrans('capacity_mwh') + ' required', 'warning');
    return;
  }

  const tzObj = AU_TIMEZONES.find(t => t.value === tz);
  const region = tzObj ? tzObj.region : '';

  // 从表单获取核心设备参数
  const devType = document.getElementById('new-st-dev-type').value;
  const devMW = parseFloat(document.getElementById('new-st-dev-mw').value) || mw;
  const devMWh = parseFloat(document.getElementById('new-st-dev-mwh').value) || mwh;

  addStation({
    name,
    capacity: `${mw}MW/${mwh}MWh`,
    location: location || region,
    lat, lng,
    timezone: tz,
    region,
    devices: [
      { id: 'ems-' + Date.now(), name: 'EMS Controller', type: 'EMS', version: 'v1.0.2' },
      { id: devType.toLowerCase() + '-' + Date.now(), name: devType + ' Unit 1', type: devType, version: 'v1.0.0', rated_power: devMW, rated_capacity: devMWh }
    ]
  });

  closeAddStationModal();
  showToast(`${name} created`, 'success');

  // Refresh view
  const role = getCurrentUser();
  const isOwner = role === 'owner';
  const theme = THEMES[isOwner ? 'owner' : 'operator'];
  renderKPI(role, theme);
  applyStationView(theme, isOwner);
}

// ============ 添加设备模态框 ============

function openAddDeviceModal(stationId) {
  const existing = document.getElementById('add-device-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'add-device-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60" onclick="closeAddDeviceModal()"></div>
    <div class="relative bg-slate-900 border border-white/20 rounded-2xl w-full max-w-md p-6 auth-step-enter">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-bold text-white">${getTrans('add_device')}</h3>
        <button onclick="closeAddDeviceModal()" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="text-sm text-slate-300 block mb-1">${getTrans('device_name')}</label>
          <input id="new-dev-name" type="text" placeholder="e.g. PCS Unit 1" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
        </div>
        <div>
          <label class="text-sm text-slate-300 block mb-1">${getTrans('device_type')}</label>
          <select id="new-dev-type" onchange="toggleDeviceRatedFields()" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50">
            <option value="EMS">EMS</option>
            <option value="PCS">PCS</option>
            <option value="BMS">BMS</option>
            <option value="Meter">${getTrans('device_meter')}</option>
            <option value="Transformer">${getTrans('device_transformer')}</option>
            <option value="Other">${getTrans('device_other')}</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-slate-300 block mb-1">${getTrans('device_version')}</label>
          <input id="new-dev-ver" type="text" value="v1.0.0" class="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"/>
        </div>
        <div id="dev-rated-fields" class="hidden grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-slate-500 block mb-1">${getTrans('rated_power')} (MW)</label>
            <input id="new-dev-rated-mw" type="number" step="0.5" value="5" class="w-full bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"/>
          </div>
          <div>
            <label class="text-xs text-slate-500 block mb-1">${getTrans('rated_capacity')} (MWh)</label>
            <input id="new-dev-rated-mwh" type="number" step="1" value="10" class="w-full bg-white/5 border border-white/20 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"/>
          </div>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button onclick="closeAddDeviceModal()" class="flex-1 py-3 rounded-lg bg-white/5 border border-white/20 text-sm text-slate-300 hover:bg-white/10 transition-colors">${getTrans('cancel')}</button>
        <button onclick="handleAddDevice('${stationId}')" class="flex-1 py-3 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">${getTrans('add_device_btn')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();
}

function closeAddDeviceModal() {
  const modal = document.getElementById('add-device-modal');
  if (modal) modal.remove();
}

function toggleDeviceRatedFields() {
  const type = document.getElementById('new-dev-type').value;
  const fields = document.getElementById('dev-rated-fields');
  if (type === 'PCS' || type === 'BMS') {
    fields.classList.remove('hidden');
  } else {
    fields.classList.add('hidden');
  }
}

function handleAddDevice(stationId) {
  const name = document.getElementById('new-dev-name').value.trim();
  const type = document.getElementById('new-dev-type').value;
  const version = document.getElementById('new-dev-ver').value.trim();

  if (!name) {
    showToast(getTrans('device_name') + ' required', 'warning');
    return;
  }

  const device = { id: type.toLowerCase() + '-' + Date.now(), name, type, version };

  // PCS/BMS 附加额定参数
  if (type === 'PCS' || type === 'BMS') {
    const ratedMW = parseFloat(document.getElementById('new-dev-rated-mw').value);
    const ratedMWh = parseFloat(document.getElementById('new-dev-rated-mwh').value);
    if (ratedMW) device.rated_power = ratedMW;
    if (ratedMWh) device.rated_capacity = ratedMWh;
  }

  const deviceId = device.id;
  const ok = addDeviceToStation(stationId, device);

  if (ok) {
    closeAddDeviceModal();
    showToast(`${name} added`, 'success');
    // Refresh detail page
    const station = getStation(stationId);
    const role = getCurrentUser();
    const isOwner = role === 'owner';
    const theme = THEMES[isOwner ? 'owner' : 'operator'];
    renderStationDetail(station, theme, isOwner);
  } else {
    showToast(getTrans('add_device_fail'), 'error');
  }
}

// ============ KPI 总览卡片 ============

function renderKPI(role, theme) {
  const container = document.getElementById('kpi-container');
  if (!container) return;

  const isOwner = role === 'owner';
  const myStations = getStationsByRole();

  if (isOwner) {
    const totalCapMW = stations.reduce((s, st) => s + parseCapacity(st.capacity).mw, 0);
    const totalCapMWh = stations.reduce((s, st) => s + parseCapacity(st.capacity).mwh, 0);
    const avgSoh = stations.length > 0 ? stations.reduce((s, st) => s + st.soh, 0) / stations.length : 0;
    const totalAnnualFee = stations.reduce((s, st) => s + (st.annual_fee || 0), 0);
    const monthRev = totalAnnualFee / 12;
    const unassignedCount = stations.filter(s => s.operator_id === 'unassigned').length;
    const leasedCount = stations.filter(s => s.operator_id !== 'unassigned').length;
    const rentalRate = stations.length > 0 ? ((leasedCount / stations.length) * 100).toFixed(0) : 0;

    container.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        ${kpiCard(getTrans('kpi_total_cap'), `${totalCapMW}MW / ${totalCapMWh}MWh`, 'battery-charging', theme.accent)}
        ${kpiCard(getTrans('kpi_month_rev'), `A$${Math.round(monthRev).toLocaleString('en-AU')}`, 'wallet', 'text-blue-400', 'kpi-month-rev')}
        ${kpiCard(getTrans('kpi_avg_soh'), `${avgSoh.toFixed(2)}%`, 'heart-pulse', avgSoh > 99 ? 'text-emerald-400' : 'text-amber-400', 'kpi-avg-soh')}
        ${kpiCard(getTrans('kpi_unassigned'), `${unassignedCount} / ${rentalRate}%`, 'alert-circle', unassignedCount > 0 ? 'text-amber-400' : 'text-emerald-400')}
      </div>
    `;
  } else {
    const totalCapMW = myStations.reduce((s, st) => s + parseCapacity(st.capacity).mw, 0);
    const totalCapMWh = myStations.reduce((s, st) => s + parseCapacity(st.capacity).mwh, 0);
    const todayRev = myStations.reduce((s, st) => s + (st.revenue_today || 0), 0);
    const avgSoc = myStations.length > 0 ? myStations.reduce((s, st) => s + st.soc, 0) / myStations.length : 0;
    const price = typeof getCurrentPrice === 'function' ? getCurrentPrice() : 0;

    container.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        ${kpiCard(getTrans('kpi_managed_cap'), `${totalCapMW}MW / ${totalCapMWh}MWh`, 'battery-charging', theme.accent)}
        ${kpiCard(getTrans('kpi_today_rev'), `${todayRev >= 0 ? '' : '-'}A$${Math.abs(todayRev).toFixed(2)}`, 'dollar-sign', todayRev >= 0 ? 'text-emerald-400' : 'text-red-400', 'kpi-today-rev')}
        ${kpiCard(getTrans('kpi_avg_soc'), `${avgSoc.toFixed(1)}%`, 'gauge', avgSoc > 40 ? 'text-emerald-400' : 'text-amber-400', 'kpi-avg-soc')}
        ${kpiCard(getTrans('kpi_current_price'), `$${price.toFixed(2)}`, 'zap', price > 200 ? 'text-amber-400' : 'text-emerald-400', 'kpi-price')}
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

function kpiCard(label, value, icon, colorClass, dataId) {
  return `
    <div class="bg-white/5 border border-white/20 rounded-xl p-4">
      <div class="flex items-center gap-2 mb-2">
        <i data-lucide="${icon}" class="w-4 h-4 ${colorClass}"></i>
        <span class="text-xs text-slate-400">${label}</span>
      </div>
      <p class="text-lg md:text-xl font-bold font-mono ${colorClass}" ${dataId ? `id="${dataId}"` : ''}>${value}</p>
    </div>
  `;
}

function updateKPI(role, theme, price) {
  const isOwner = role === 'owner';
  const myStations = getStationsByRole();

  if (isOwner) {
    const avgSoh = stations.length > 0 ? stations.reduce((s, st) => s + st.soh, 0) / stations.length : 0;
    const el2 = document.getElementById('kpi-avg-soh');
    if (el2) el2.textContent = `${avgSoh.toFixed(2)}%`;
    // 月租金是固定值，不需要每 tick 更新
  } else {
    const todayRev = myStations.reduce((s, st) => s + (st.revenue_today || 0), 0);
    const avgSoc = myStations.length > 0 ? myStations.reduce((s, st) => s + st.soc, 0) / myStations.length : 0;
    const el1 = document.getElementById('kpi-today-rev');
    const el2 = document.getElementById('kpi-avg-soc');
    const el3 = document.getElementById('kpi-price');
    if (el1) { el1.textContent = `${todayRev >= 0 ? '' : '-'}A$${Math.abs(todayRev).toFixed(2)}`; el1.className = `text-lg md:text-xl font-bold font-mono ${todayRev >= 0 ? 'text-emerald-400' : 'text-red-400'} revenue-tick`; }
    if (el2) el2.textContent = `${avgSoc.toFixed(1)}%`;
    if (el3) { el3.textContent = `$${price.toFixed(2)}`; el3.className = `text-lg md:text-xl font-bold font-mono ${price > 200 ? 'text-amber-400' : 'text-emerald-400'} revenue-tick`; }
  }
}

// ============ 业主资产概览横幅 ============

function renderOwnerPortfolioBanner() {
  const banner = document.getElementById('market-banner');
  if (!banner) return;

  const totalStations = stations.length;
  const leasedCount = stations.filter(s => s.operator_id !== 'unassigned').length;
  const rentalRate = totalStations > 0 ? ((leasedCount / totalStations) * 100).toFixed(0) : 0;
  const avgSoh = totalStations > 0 ? stations.reduce((s, st) => s + st.soh, 0) / totalStations : 0;
  const totalAnnualFee = stations.reduce((s, st) => s + (st.annual_fee || 0), 0);
  const monthlyRev = totalAnnualFee / 12;

  banner.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-white/5 border border-white/20 rounded-xl p-5">
        <div class="flex items-center gap-2 mb-3">
          <i data-lucide="heart-pulse" class="w-5 h-5 text-emerald-400"></i>
          <span class="text-xs text-slate-400 uppercase tracking-wider">${getTrans('portfolio_health')}</span>
        </div>
        <p id="owner-avg-soh" class="text-2xl font-bold font-mono text-emerald-400">${avgSoh.toFixed(2)}%</p>
        <p class="text-xs text-slate-500 mt-1">${getTrans('avg_soh_desc').replace('{0}', totalStations)}</p>
      </div>
      <div class="bg-white/5 border border-white/20 rounded-xl p-5">
        <div class="flex items-center gap-2 mb-3">
          <i data-lucide="building-2" class="w-5 h-5 text-amber-400"></i>
          <span class="text-xs text-slate-400 uppercase tracking-wider">${getTrans('asset_rental_rate')}</span>
        </div>
        <p id="owner-rental-rate" class="text-2xl font-bold font-mono text-amber-400">${rentalRate}%</p>
        <p class="text-xs text-slate-500 mt-1">${getTrans('rental_rate_desc').replace('{0}', leasedCount).replace('{1}', totalStations)}</p>
      </div>
      <div class="bg-white/5 border border-white/20 rounded-xl p-5">
        <div class="flex items-center gap-2 mb-3">
          <i data-lucide="wallet" class="w-5 h-5 text-blue-400"></i>
          <span class="text-xs text-slate-400 uppercase tracking-wider">${getTrans('monthly_rental')}</span>
        </div>
        <p id="owner-monthly-rev" class="text-2xl font-bold font-mono text-blue-400">A$${Math.round(monthlyRev).toLocaleString('en-AU')}</p>
        <p class="text-xs text-slate-500 mt-1">${getTrans('annual_label').replace('{0}', formatAUD(totalAnnualFee))}</p>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function updateOwnerPortfolioBanner() {
  const totalStations = stations.length;
  const leasedCount = stations.filter(s => s.operator_id !== 'unassigned').length;
  const rentalRate = totalStations > 0 ? ((leasedCount / totalStations) * 100).toFixed(0) : 0;
  const avgSoh = totalStations > 0 ? stations.reduce((s, st) => s + st.soh, 0) / totalStations : 0;

  const el1 = document.getElementById('owner-avg-soh');
  const el2 = document.getElementById('owner-rental-rate');
  if (el1) el1.textContent = avgSoh.toFixed(2) + '%';
  if (el2) el2.textContent = rentalRate + '%';
}

// ============ 市场横幅 ============

function renderMarketBanner() {
  const banner = document.getElementById('market-banner');
  if (!banner) return;

  // 判断是否有手动接管的电站
  const hasManual = stations.some(s => s.strategy && (s.strategy.mode === 'manual_charge' || s.strategy.mode === 'manual_discharge' || s.strategy.mode === 'manual_idle'));

  banner.innerHTML = `
    <div id="ai-narrator" class="mb-4 px-4 py-3 rounded-xl border ${hasManual ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-lg">🤖</span>
          <span id="ai-narrator-text" class="text-sm font-medium ${hasManual ? 'text-amber-400' : 'text-emerald-400'}">${hasManual ? getTrans('ai_narrator_manual') : getTrans('ai_narrator_idle')}</span>
        </div>
        <div class="flex items-center gap-2">
          <span id="dispatch-mode-badge" class="px-2 py-1 rounded text-xs font-bold ${hasManual ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}">${hasManual ? getTrans('dispatch_mode_manual') : getTrans('dispatch_mode_smart')}</span>
          ${hasManual ? `<button onclick="resumeSmartHosting()" class="px-3 py-1 rounded bg-emerald-500 text-xs font-bold text-white hover:bg-emerald-600 transition-colors animate-pulse">${getTrans('btn_resume_ai')}</button>` : ''}
        </div>
      </div>
    </div>
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

  // AI Narrator 更新
  const narratorEl = document.getElementById('ai-narrator-text');
  const narratorBox = document.getElementById('ai-narrator');
  const modeBadge = document.getElementById('dispatch-mode-badge');
  const hasManual = stations.some(s => s.strategy && (s.strategy.mode === 'manual_charge' || s.strategy.mode === 'manual_discharge' || s.strategy.mode === 'manual_idle'));
  if (narratorEl) {
    if (hasManual) {
      narratorEl.textContent = getTrans('ai_narrator_manual');
      narratorEl.className = 'text-sm font-medium text-amber-400';
      if (narratorBox) { narratorBox.className = 'mb-4 px-4 py-3 rounded-xl border bg-amber-500/10 border-amber-500/30'; }
      if (modeBadge) { modeBadge.textContent = getTrans('dispatch_mode_manual'); modeBadge.className = 'px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-400'; }
    } else {
      // 从最优计划获取数据
      const plan = typeof optimalPlan !== 'undefined' ? optimalPlan : {};
      const totalProfit = plan.projectedCycleProfit || stations.reduce((s, st) => s + (st.projected_profit || 0), 0);
      const nextDischTime = plan.nextDischargeTime || '--:--';
      const nextChgTime = plan.nextChargeTime || '--:--';

      // 判断当前整体状态
      const anyDischarging = stations.some(s => s.status === 'DISCHARGING');
      const anyCharging = stations.some(s => s.status === 'CHARGING');

      if (anyDischarging || price > 500) {
        narratorEl.textContent = getTrans('ai_target').replace('{0}', nextDischTime).replace('{1}', totalProfit.toFixed(0));
        narratorEl.className = 'text-sm font-medium text-red-400';
      } else if (anyCharging || price < 50) {
        narratorEl.textContent = getTrans('ai_narrator_charging') + ' | ' + getTrans('projected_profit') + ': A$' + totalProfit.toFixed(0);
        narratorEl.className = 'text-sm font-medium text-blue-400';
      } else {
        const totalFcas = stations.reduce((s, st) => s + (st.fcas_revenue || 0), 0);
        if (totalFcas > 0) {
          narratorEl.textContent = getTrans('fcas_standby').replace('{0}', totalFcas.toFixed(1)) + ' | ' + getTrans('projected_profit') + ': A$' + totalProfit.toFixed(0);
        } else {
          narratorEl.textContent = getTrans('ai_narrator_idle') + ' | ' + getTrans('projected_profit') + ': A$' + totalProfit.toFixed(0);
        }
        narratorEl.className = 'text-sm font-medium text-emerald-400';
      }
      if (narratorBox) { narratorBox.className = 'mb-4 px-4 py-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30'; }
      if (modeBadge) { modeBadge.textContent = getTrans('dispatch_mode_smart'); modeBadge.className = 'px-2 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400'; }
    }
  }

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
  // 顶部导航模式：渲染 nav-brand + nav-tabs + nav-actions
  const isOwner = role === 'owner';
  const menus = getMenus();
  const menuItems = isOwner ? menus.owner : menus.operator;
  const userName = escapeHTML(isOwner ? getUserName('owner_1') : getUserName(role));

  // Brand
  const brand = document.getElementById('nav-brand');
  if (brand) {
    brand.innerHTML = `
      <div class="w-8 h-8 rounded-lg ${theme.accentBg} flex items-center justify-center">
        <i data-lucide="zap" class="w-4 h-4 text-white"></i>
      </div>
      <div>
        <h1 class="text-white font-bold text-sm leading-tight">${getTrans('app_title')}</h1>
        <p class="text-xs ${theme.accent}">${isOwner ? getTrans('owner_portal') : getTrans('operator_portal')}</p>
      </div>
    `;
  }

  // Tabs
  const tabs = document.getElementById('nav-tabs');
  if (tabs) {
    tabs.innerHTML = menuItems.map(item => {
      const isActive = item.id === activeMenuId;
      return `
        <a href="#" data-menu="${item.id}"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
          ${isActive ? theme.accentBg + ' text-white ' : 'text-slate-400 hover:text-white hover:bg-white/5'}"
          onclick="handleMenuClick('${item.id}', '${item.view}'); return false;">
          <i data-lucide="${item.icon}" class="w-4 h-4"></i>
          ${getTrans(item.labelKey)}
        </a>`;
    }).join('');
  }

  // Actions
  const actions = document.getElementById('nav-actions');
  if (actions) {
    actions.innerHTML = `
      <div class="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-400 flex items-center gap-1" title="服务器状态: nginx 生产模式">
        <i data-lucide="server" class="w-3 h-3"></i>
        <span class="hidden sm:inline">nginx</span>
      </div>
      <button onclick="switchRole()" class="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5" title="${getTrans('switch_role')}">
        <i data-lucide="repeat" class="w-3.5 h-3.5"></i>
        ${getTrans('switch_role')}
      </button>
      <button onclick="logout()" class="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5" title="${getTrans('sign_out')}">
        <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
        ${getTrans('sign_out')}
      </button>
      <button onclick="toggleLangAndRefresh()" class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/20 text-xs font-medium text-slate-300 hover:bg-white/10 transition-colors">
        ${getTrans('lang_switch')}
      </button>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

// ============ 汉堡菜单 ============

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  const isOpening = sidebar.classList.contains('-translate-x-full');
  sidebar.classList.toggle('-translate-x-full');
  if (overlay) overlay.classList.toggle('hidden');

  // 移动端打开菜单时暂停 ECharts 渲染以节省内存
  if (typeof marketChart !== 'undefined' && marketChart) {
    if (isOpening) {
      // 菜单打开 → 暂停图表动画
      marketChart.setOption({ animation: false });
    } else {
      // 菜单关闭 → 恢复动画
      marketChart.setOption({ animation: true });
    }
  }
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
  // Header 已整合到顶部导航栏，无需单独渲染
}

function toggleLangAndRefresh() {
  const savedView = currentView;
  const savedMenu = activeMenuId;
  const savedSubView = typeof reportSubView !== 'undefined' ? reportSubView : 'alarms';

  toggleLang();
  if (typeof disposeChart === 'function') disposeChart();
  initDashboard();

  // 恢复到切换前的视图
  if (savedView === 'reports') {
    handleMenuClick(savedMenu, 'reports');
  } else {
    switchView(savedView);
  }
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
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 ">
      ${stationList.map(s => renderStationCard(s, theme, isOwner)).join('')}
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function renderStationCard(station, theme, isOwner) {
  const isUnassigned = station.operator_id === 'unassigned';
  const leaseRemaining = getLeaseRemaining(station.lease_end);
  const operators = getOperators();
  const currentOpName = isUnassigned ? getTrans('unassigned') : escapeHTML(getUserName(station.operator_id));

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
      <p class="text-xs text-slate-600 mt-0.5">${getTrans('efficiency_label')}: ${(station.efficiency * 100).toFixed(0)}%</p>
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

  // Strategy button (operator only)
  const strategyBtn = (!isOwner && !isUnassigned) ? `
    <div class="mt-4 pt-4 border-t border-white/20">
      <button onclick="openStrategyModal('${station.id}')"
        class="w-full py-2.5 rounded-lg bg-white/5 border border-white/20 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center gap-2">
        <i data-lucide="settings" class="w-4 h-4"></i>
        ${getTrans('strategy_panel')}
      </button>
    </div>
  ` : '';

  // Assignment control (owner only)
  const assignControl = isOwner ? `
    <div class="mt-4 pt-4 border-t border-white/20">
      <label class="text-xs text-slate-400 block mb-2">${getTrans('assign_to')}</label>
      <div class="flex gap-2">
        <select id="select-${station.id}" class="flex-1 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50">
          <option value="">${getTrans('select_operator')}</option>
          ${operators.map(op => `<option value="${op.id}" ${station.operator_id === op.id ? 'selected' : ''}>${escapeHTML(op.name)}</option>`).join('')}
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
    <div class="mt-4 pt-4 border-t border-white/20 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
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
            ${(station.alarms && station.alarms.some(a => a.status !== 'RESOLVED')) ? '<i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 animate-pulse alarm-indicator"></i><span class="text-red-400 text-xs font-bold">(' + getTrans('alarm') + ')</span>' : ''}
          </div>
          <h3 class="text-base md:text-lg font-bold text-white truncate" style="max-width:75%">${escapeHTML(station.name)}</h3>
          <p class="text-sm text-slate-400 flex items-center gap-1 mt-1">
            <i data-lucide="map-pin" class="w-3 h-3"></i>
            ${escapeHTML(station.location)}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">${getTrans('capacity')}</p>
          <p class="text-sm ${theme.accent} font-mono font-bold">${station.capacity}</p>
        </div>
      </div>

      ${socBar}

      <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4">
        <div class="bg-white/5 rounded-lg p-2 md:p-3 min-w-0 min-h-[70px]">
          <p class="text-xs text-slate-500">${getTrans('available_energy')}</p>
          <p class="text-sm sm:text-base md:text-lg font-bold text-cyan-400 font-mono" data-energy="${station.id}">${(station.soc * MAX_MWH / 100).toFixed(1)} MWh</p>
        </div>
        <div class="bg-white/5 rounded-lg p-2 md:p-3 min-w-0 min-h-[70px]">
          <p class="text-xs text-slate-500">${getTrans('discharge_duration')}</p>
          <p class="text-sm sm:text-base md:text-lg font-bold text-amber-400 font-mono" data-discharge="${station.id}">${(station.soc * MAX_MWH / 100 / MAX_MW).toFixed(1)}h</p>
        </div>
        ${revenueDisplay || `
        <div class="bg-white/5 rounded-lg p-2 md:p-3">
          <p class="text-xs text-slate-500">${getTrans('projected_profit')}</p>
          <p class="text-sm font-bold text-emerald-400 font-mono" data-profit="${station.id}">A$${(station.projected_profit || 0).toFixed(0)}</p>
        </div>`}
      </div>
      <div class="mt-2 flex items-center gap-2 line-clamp-1">
        <span class="text-xs text-slate-500 flex-shrink-0">${getTrans('next_action')}:</span>
        <span class="text-xs font-medium text-cyan-400 truncate" data-next-action="${station.id}">${station.nextAction ? (station.nextAction.action === 'discharge' ? getTrans('expect_discharge_at').replace('{0}', station.nextAction.time || station.nextAction.hour) : getTrans('expect_charge_at').replace('{0}', station.nextAction.time || station.nextAction.hour)) : '-'}</span>
      </div>

      ${leaseInfo}
      ${assignControl}
      ${strategyBtn}
    </div>
  `;
}

// ============ 实时更新卡片（不重建DOM）============

function updateStationCards(theme, isOwner) {
  const stationList = getStationsByRole();

  stationList.forEach(station => {
    const card = document.querySelector(`[data-station-id="${station.id}"]`);
    if (!card) return;

    // Update Available Energy & Discharge Duration
    const energyEl = card.querySelector(`[data-energy="${station.id}"]`);
    if (energyEl) energyEl.textContent = (station.soc * MAX_MWH / 100).toFixed(1) + ' MWh';
    const dischargeEl = card.querySelector(`[data-discharge="${station.id}"]`);
    if (dischargeEl) dischargeEl.textContent = (station.soc * MAX_MWH / 100 / MAX_MW).toFixed(1) + 'h';

    // Update Projected Profit
    const profitEl = card.querySelector(`[data-profit="${station.id}"]`);
    if (profitEl) profitEl.textContent = 'A$' + (station.projected_profit || 0).toFixed(0);

    // Update Next Action
    const nextEl = card.querySelector(`[data-next-action="${station.id}"]`);
    if (nextEl && station.nextAction) {
      nextEl.textContent = station.nextAction.action === 'discharge'
        ? getTrans('expect_discharge_at').replace('{0}', station.nextAction.time || station.nextAction.hour)
        : getTrans('expect_charge_at').replace('{0}', station.nextAction.time || station.nextAction.hour);
    }

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

    // Update alarm indicator
    const hasAlarm = station.alarms && station.alarms.some(a => a.status !== 'RESOLVED');
    const existingIndicator = card.querySelector('.alarm-indicator');
    const statusRow = card.querySelector('.flex.items-center.gap-2.mb-1');
    if (hasAlarm && !existingIndicator && statusRow) {
      const alarmIcon = document.createElement('span');
      alarmIcon.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 animate-pulse alarm-indicator"></i><span class="text-red-400 text-xs font-bold alarm-label">(' + getTrans('alarm') + ')</span>';
      statusRow.appendChild(alarmIcon);
      if (window.lucide) lucide.createIcons();
    } else if (!hasAlarm && existingIndicator) {
      // 移除告警指示器
      const alarmText = existingIndicator.nextElementSibling;
      if (alarmText && alarmText.classList.contains('alarm-label')) alarmText.remove();
      existingIndicator.remove();
    }
  });
}

// ============ 菜单路由 ============

function handleMenuClick(menuId, viewId) {
  closeMobileMenu();

  // 设置 report sub-view
  if (menuId === 'health') {
    reportSubView = 'health';
  } else if (menuId === 'alarms') {
    reportSubView = 'alarms';
  } else if (menuId === 'lease' || menuId === 'logs') {
    reportSubView = 'default';
  }

  switchView(viewId);

  // 调度中心 vs 电站管理：控制各区域显隐
  const marketBanner = document.getElementById('market-banner');
  const viewToggle = document.getElementById('view-toggle-container');
  const mapCont = document.getElementById('map-container');
  const listCont = document.getElementById('list-container');
  const stationCont = document.getElementById('station-container');

  if (menuId === 'dispatch') {
    // 调度中心：隐藏顶部 KPI/banner/图表，只显示操盘面板
    if (marketBanner) marketBanner.classList.add('hidden');
    if (viewToggle) viewToggle.classList.add('hidden');
    if (mapCont) mapCont.classList.add('hidden');
    if (listCont) listCont.classList.add('hidden');
    const kpiRow = document.getElementById('kpi-container');
    if (kpiRow) kpiRow.classList.add('hidden');
    if (stationCont) {
      stationCont.classList.remove('hidden');
      renderDispatchControlPanel(stationCont);
    }
  } else if (menuId === 'assets' || menuId === 'portfolio') {
    // 电站管理：隐藏 AI 面板/图表，显示资产视图切换
    if (marketBanner) marketBanner.classList.add('hidden');
    if (viewToggle) viewToggle.classList.remove('hidden');
    const role = getCurrentUser();
    const isOwner = role === 'owner';
    const theme = THEMES[isOwner ? 'owner' : 'operator'];
    applyStationView(theme, isOwner);
  }

  // 更新侧边栏高亮
  activeMenuId = menuId;
  const role = getCurrentUser();
  const isOwner = role === 'owner';
  const theme = THEMES[isOwner ? 'owner' : 'operator'];
  renderSidebar(role, theme);
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
  toast.innerHTML = `<i data-lucide="${icons[type]}" class="w-4 h-4"></i><span class="text-sm font-medium">${escapeHTML(msg)}</span>`;
  document.body.appendChild(toast);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 2000);
}

// ============ 策略模态框 ============

function openStrategyModal(stationId) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;

  const strat = station.strategy || { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' };

  // Remove existing modal
  const existing = document.getElementById('strategy-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'strategy-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/60" onclick="closeStrategyModal()"></div>
    <div class="relative bg-slate-900 border border-white/20 rounded-2xl w-full max-w-md p-6 auth-step-enter">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-lg font-bold text-white">${getTrans('strategy_panel')}</h3>
          <p class="text-sm text-slate-400">${escapeHTML(station.name)}</p>
        </div>
        <button onclick="closeStrategyModal()" class="text-slate-400 hover:text-white">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Charge Threshold -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm text-slate-300">${getTrans('charge_at')}</label>
          <span id="strat-charge-val" class="text-sm font-mono text-blue-400 font-bold">$${strat.charge_threshold}</span>
        </div>
        <input type="range" id="strat-charge" min="0" max="200" value="${strat.charge_threshold}" step="5"
          class="w-full accent-blue-500" oninput="document.getElementById('strat-charge-val').textContent='$'+this.value" />
        <div class="flex justify-between text-xs text-slate-600 mt-1"><span>$0</span><span>$200</span></div>
      </div>

      <!-- Discharge Threshold -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm text-slate-300">${getTrans('discharge_at')}</label>
          <span id="strat-discharge-val" class="text-sm font-mono text-emerald-400 font-bold">$${strat.discharge_threshold}</span>
        </div>
        <input type="range" id="strat-discharge" min="50" max="1000" value="${strat.discharge_threshold}" step="10"
          class="w-full accent-emerald-500" oninput="document.getElementById('strat-discharge-val').textContent='$'+this.value" />
        <div class="flex justify-between text-xs text-slate-600 mt-1"><span>$50</span><span>$1,000</span></div>
      </div>

      <!-- Reserve SoC -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm text-slate-300">${getTrans('reserve_soc')}</label>
          <span id="strat-reserve-val" class="text-sm font-mono text-amber-400 font-bold">${strat.reserve_soc}%</span>
        </div>
        <input type="range" id="strat-reserve" min="5" max="50" value="${strat.reserve_soc}" step="5"
          class="w-full accent-amber-500" oninput="document.getElementById('strat-reserve-val').textContent=this.value+'%'" />
        <div class="flex justify-between text-xs text-slate-600 mt-1"><span>5%</span><span>50%</span></div>
      </div>

      <!-- Save -->
      <button onclick="saveStrategy('${stationId}')"
        class="w-full py-3 rounded-lg bg-emerald-500 text-white font-medium text-sm hover:bg-emerald-600 transition-colors mb-4">
        ${getTrans('save_strategy')}
      </button>

      <!-- Manual Override -->
      <div class="border-t border-white/20 pt-4">
        <p class="text-xs text-slate-500 uppercase tracking-wider mb-3">${getTrans('manual_override')}</p>
        <div class="grid grid-cols-3 gap-2">
          <button onclick="setManualMode('${stationId}', 'manual_charge')"
            class="py-2 rounded-lg text-xs font-medium ${strat.mode === 'manual_charge' ? 'bg-blue-500 text-white' : 'bg-white/5 text-blue-400 border border-blue-500/30'} hover:opacity-90 transition-colors">
            ${getTrans('emergency_charge')}
          </button>
          <button onclick="setManualMode('${stationId}', 'manual_discharge')"
            class="py-2 rounded-lg text-xs font-medium ${strat.mode === 'manual_discharge' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-emerald-400 border border-emerald-500/30'} hover:opacity-90 transition-colors">
            ${getTrans('emergency_discharge')}
          </button>
          <button onclick="setManualMode('${stationId}', 'manual_idle')"
            class="py-2 rounded-lg text-xs font-medium ${strat.mode === 'manual_idle' ? 'bg-red-500 text-white' : 'bg-white/5 text-red-400 border border-red-500/30'} hover:opacity-90 transition-colors">
            ${getTrans('emergency_idle')}
          </button>
        </div>
        ${strat.mode !== 'auto' ? `
          <button onclick="setManualMode('${stationId}', 'auto')"
            class="w-full mt-2 py-2 rounded-lg bg-white/5 border border-white/20 text-xs text-slate-400 hover:text-white transition-colors">
            ↩ ${getTrans('mode_auto')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) lucide.createIcons();
}

function closeStrategyModal() {
  const modal = document.getElementById('strategy-modal');
  if (modal) modal.remove();
}

function saveStrategy(stationId) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;

  const chargeVal = parseInt(document.getElementById('strat-charge').value);
  const dischargeVal = parseInt(document.getElementById('strat-discharge').value);
  const reserveVal = parseInt(document.getElementById('strat-reserve').value);

  // 互斥校验：充电阈值必须 < 放电阈值
  if (chargeVal >= dischargeVal) {
    showToast(getTrans('invalid_thresholds'), 'error');
    return; // 不关闭 modal，不保存
  }

  station.strategy = station.strategy || {};
  station.strategy.charge_threshold = chargeVal;
  station.strategy.discharge_threshold = dischargeVal;
  station.strategy.reserve_soc = reserveVal;

  closeStrategyModal();
  showToast(getTrans('strategy_saved'), 'success');

  // SoC 预警：储备值高于当前实际 SoC
  if (reserveVal > station.soc) {
    setTimeout(() => showToast(getTrans('strategy_warning_high_reserve'), 'warning'), 500);
  }
}

// ============ 调度中心：单电站操盘面板 ============

let dispatchSelectedStationId = null;

// 生成今日交易计划（8个时段）
function generateTradingPlan(station) {
  const cap = typeof getPhysicalCapacity === 'function' ? getPhysicalCapacity(station) : { mw: MAX_MW, mwh: MAX_MWH };
  const strat = station.strategy || {};
  const chargeAt = strat.charge_threshold || 50;
  const dischargeAt = strat.discharge_threshold || 200;
  const hour = new Date().getHours();

  const slots = [
    { time: '00:00 - 03:00', type: 'off_peak', typeName: getTrans('off_peak'), avgPrice: 25, action: 'buy', qty: cap.mw * 3 },
    { time: '03:00 - 06:00', type: 'off_peak', typeName: getTrans('off_peak'), avgPrice: 18, action: 'buy', qty: cap.mw * 3 },
    { time: '06:00 - 09:00', type: 'shoulder', typeName: getTrans('shoulder'), avgPrice: 65, action: 'hold', qty: 0 },
    { time: '09:00 - 12:00', type: 'shoulder', typeName: getTrans('shoulder'), avgPrice: 85, action: 'partial_sell', qty: cap.mw * 1.5 },
    { time: '12:00 - 15:00', type: 'shoulder', typeName: getTrans('shoulder'), avgPrice: 72, action: 'hold', qty: 0 },
    { time: '15:00 - 17:00', type: 'shoulder', typeName: getTrans('shoulder'), avgPrice: 110, action: 'partial_sell', qty: cap.mw * 1 },
    { time: '17:00 - 20:00', type: 'peak', typeName: getTrans('peak_period'), avgPrice: 320, action: 'sell', qty: cap.mw * 3 },
    { time: '20:00 - 00:00', type: 'shoulder', typeName: getTrans('shoulder'), avgPrice: 55, action: 'buy', qty: cap.mw * 2 },
  ];

  // 用真实 AEMO 数据覆盖价格
  if (typeof aemoPriceData !== 'undefined' && aemoPriceData && aemoPriceData.length > 0) {
    const prices = aemoPriceData.map(p => p.price);
    const chunkSize = Math.ceil(prices.length / 8);
    slots.forEach((s, i) => {
      const chunk = prices.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) {
        s.avgPrice = Math.round(chunk.reduce((a, b) => a + b, 0) / chunk.length * 100) / 100;
      }
    });
  }

  // 计算收益
  let totalBuyQty = 0, totalSellQty = 0, totalBuyCost = 0, totalSellRevenue = 0;
  const currentSlotIndex = Math.min(Math.floor(hour / 3), 7);

  slots.forEach((s, i) => {
    if (s.action === 'buy') {
      s.result = -(s.avgPrice * s.qty / 1000);
      totalBuyQty += s.qty;
      totalBuyCost += Math.abs(s.result);
    } else if (s.action === 'sell' || s.action === 'partial_sell') {
      s.result = s.avgPrice * s.qty * (station.efficiency || 0.88) / 1000;
      totalSellQty += s.qty;
      totalSellRevenue += s.result;
    } else {
      s.result = 0;
    }
    s.status = i < currentSlotIndex ? 'done' : (i === currentSlotIndex ? 'active' : 'planned');
  });

  return {
    slots,
    summary: {
      totalBuyQty: totalBuyQty.toFixed(1),
      totalSellQty: totalSellQty.toFixed(1),
      totalBuyCost: totalBuyCost.toFixed(0),
      totalSellRevenue: totalSellRevenue.toFixed(0),
      profit: (totalSellRevenue - totalBuyCost).toFixed(0),
      margin: totalSellRevenue > 0 ? ((totalSellRevenue - totalBuyCost) / totalSellRevenue * 100).toFixed(1) : '0'
    }
  };
}

function renderDispatchControlPanel(container, forceStationId) {
  const stationList = getStationsByRole();
  const targetId = forceStationId || dispatchSelectedStationId;
  const station = targetId ? stationList.find(s => s.id === targetId) || stationList[0] : stationList[0];
  if (station) dispatchSelectedStationId = station.id;
  if (!station) {
    container.innerHTML = `<div class="text-center text-slate-500 py-20">${getTrans('no_stations')}</div>`;
    return;
  }

  const strat = station.strategy || { mode: 'auto', charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10 };
  const mode = strat.mode || 'auto';
  const isAuto = mode === 'auto';
  const cap = typeof getPhysicalCapacity === 'function' ? getPhysicalCapacity(station) : { mw: MAX_MW, mwh: MAX_MWH };
  const price = typeof currentPrice !== 'undefined' ? currentPrice : 0;
  const fc = typeof forecastPrice !== 'undefined' ? forecastPrice : price;
  const plan = generateTradingPlan(station);

  // 充电/放电条件
  const chargeSoc = strat.charge_soc_limit || 90;
  const dischargeSoc = strat.reserve_soc || 20;

  // 操作按钮样式
  const actionBtnClass = (m) => mode === m
    ? 'bg-emerald-500 text-white '
    : 'bg-white/5 text-slate-300 border border-white/20 hover:bg-white/10';

  // SoC 圆环 SVG
  const socPct = station.soc;
  const circumference = 2 * Math.PI * 70;
  const socOffset = circumference - (socPct / 100) * circumference;
  const socColor = socPct > 60 ? '#10b981' : socPct > 25 ? '#f59e0b' : '#ef4444';
  const priceColor = price < 0 ? '#10b981' : price > 300 ? '#ef4444' : '#fbbf24';
  const priceStr = price < 0 ? '-$' + Math.abs(price).toFixed(2) : '$' + price.toFixed(2);

  // 今日汇总：优先用实时交易数据，若为0则用计划数据
  const liveSummary = typeof getTodayTradesSummary === 'function' ? getTodayTradesSummary() : null;
  const hasLiveData = liveSummary && (parseFloat(liveSummary.totalBuyQty) > 0 || parseFloat(liveSummary.totalSellQty) > 0);
  const todaySummary = hasLiveData ? liveSummary : plan.summary;
  const todayProfitVal = parseFloat(todaySummary.profit);
  const todayProfitColor = todayProfitVal >= 0 ? 'text-emerald-400' : 'text-red-400';

  // 大圆环参数
  const ringSize = 260;
  const ringR = 100;
  const ringCirc = 2 * Math.PI * ringR;
  const ringSocOffset = ringCirc - (socPct / 100) * ringCirc;

  container.innerHTML = `
    <div id="dispatch-panel" data-station-id="${station.id}">

      <!-- ====== 顶部：今日套利汇总 ====== -->
      <div class="grid grid-cols-3 gap-6 mb-8">
        <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03]">
          <p class="text-sm text-slate-400 mb-3">${getTrans('total_buy')}</p>
          <p class="text-4xl font-bold text-white font-mono tracking-tight mb-1" id="dp-summary-buy">${todaySummary.totalBuyQty} <span class="text-base text-slate-500 font-normal">MWh</span></p>
          <p class="text-sm text-slate-500">${getTrans('cost')}: <span class="text-blue-400 font-semibold">A$${todaySummary.totalBuyCost}</span></p>
        </div>
        <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03]">
          <p class="text-sm text-slate-400 mb-3">${getTrans('total_sell')}</p>
          <p class="text-4xl font-bold text-white font-mono tracking-tight mb-1" id="dp-summary-sell">${todaySummary.totalSellQty} <span class="text-base text-slate-500 font-normal">MWh</span></p>
          <p class="text-sm text-slate-500">${getTrans('revenue')}: <span class="text-amber-400 font-semibold">A$${todaySummary.totalSellRevenue}</span></p>
        </div>
        <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03]">
          <p class="text-sm text-slate-400 mb-3">${getTrans('spread_profit')}</p>
          <p class="text-4xl font-bold ${todayProfitColor} font-mono tracking-tight mb-1" id="dp-summary-profit">A$${todaySummary.profit}</p>
          <p class="text-sm text-slate-500">${getTrans('margin')}: <span class="${todayProfitColor} font-semibold">${todaySummary.margin}%</span></p>
        </div>
      </div>

      <!-- ====== 左右分栏 ====== -->
      <div class="flex gap-10" style="flex-direction: row; flex-wrap: wrap;">

        <!-- 左栏：电站控制 -->
        <div class="space-y-8" style="width: 480px; flex-shrink: 0;">

          <!-- 电站管理标题 + 智能托管 -->
          <div class="rounded-2xl p-8 border border-white/20 bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden">
            <div class="flex items-center justify-between mb-8">
              <h3 class="text-xl font-bold text-white tracking-tight">${getTrans('menu_dispatch')}</h3>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="dp-auto-toggle" ${isAuto ? 'checked' : ''} onchange="dispatchToggleAuto('${station.id}', this.checked)" class="sr-only peer">
                <div class="w-14 h-7 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
                <span class="ml-3 text-sm font-semibold ${isAuto ? 'text-emerald-400' : 'text-slate-400'}" id="dp-auto-label">${isAuto ? getTrans('dispatch_mode_smart') : getTrans('dispatch_mode_manual')}</span>
              </label>
            </div>

            <!-- 充电按钮 | 价格球 | 放电按钮 / 运行态球 -->
            ${(() => {
              const isRunning = mode === 'manual_charge' || mode === 'manual_discharge';
              const isCharging = mode === 'manual_charge';
              // 计算运行态信息
              let estRemainH = 0, runCost = 0;
              if (isRunning) {
                const needMWh = isCharging
                  ? Math.max(0, (90 - socPct) / 100 * cap.mwh)
                  : Math.max(0, (socPct - 10) / 100 * cap.mwh);
                estRemainH = needMWh / cap.mw;
                runCost = needMWh * price;
              }
              if (isRunning) {
                return `
            <div class="flex items-center justify-center gap-4 py-4" id="dp-control-area">
              <div class="flex-shrink-0 relative group cursor-pointer" onclick="showStopConfirm('${station.id}')" id="dp-running-ball">
                <div class="rounded-full flex flex-col items-center justify-center transition-all duration-300"
                  style="width: 220px; height: 220px; background: radial-gradient(circle at 38% 32%, ${isCharging ? '#6ee7b7, #34d399 50%, #10b981' : '#fde68a, #fbbf24 50%, #f59e0b'} 80%);">
                  <span class="text-xs text-white/70 font-semibold">${isCharging ? getTrans('charging') : getTrans('discharging')}</span>
                  <span class="text-2xl font-bold font-mono tracking-tight text-white mt-1" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);" id="dp-ring-price">${priceStr}</span>
                  <span class="text-xs text-white/70 mt-1">${isCharging ? getTrans('cost') : getTrans('revenue')}: A$${Math.abs(runCost).toFixed(0)}</span>
                  <span class="text-xs text-white/70">${getTrans('est_remain')}: ${estRemainH.toFixed(1)}h</span>
                  <span class="text-xs text-white/60 mt-1" id="dp-ring-soc">SoC ${socPct.toFixed(1)}%</span>
                </div>
                <div class="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                  style="background: radial-gradient(circle at 38% 32%, #fca5a5, #ef4444 50%, #dc2626 80%);">
                  <span class="text-3xl font-bold text-white tracking-wider" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);">${getTrans('stop')}</span>
                </div>
              </div>
            </div>`;
              } else {
                return `
            <div class="flex items-center justify-center gap-4 py-4" id="dp-control-area">
              <button onclick="showDispatchConfirm('${station.id}', 'charge')"
                class="px-5 py-3 rounded-full text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                style="background: linear-gradient(135deg, #34d399, #10b981);" id="dp-btn-charge">
                ${getTrans('force_charge')}
              </button>
              <div class="flex-shrink-0">
                <div class="rounded-full flex flex-col items-center justify-center" style="width: 180px; height: 180px; background: radial-gradient(circle at 38% 32%, #93c5fd, #60a5fa 50%, #3b82f6 80%);">
                  <span class="text-3xl font-bold font-mono tracking-tight text-white" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);" id="dp-ring-price">${priceStr}</span>
                  <span class="text-xs text-white/70 mt-1 font-medium" id="dp-ring-soc">SoC ${socPct.toFixed(1)}%</span>
                </div>
              </div>
              <button onclick="showDispatchConfirm('${station.id}', 'discharge')"
                class="px-5 py-3 rounded-full text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                style="background: linear-gradient(135deg, #fbbf24, #f59e0b);" id="dp-btn-discharge">
                ${getTrans('force_discharge')}
              </button>
            </div>`;
              }
            })()}
          </div>


        </div>

        <!-- 右栏：行情 -->
        <div class="flex-1 space-y-8">

          <!-- 4 KPI -->
          <div class="grid grid-cols-4 gap-4">
            <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03] text-center">
              <p class="text-sm text-slate-400 mb-2">${getTrans('spot_price')}</p>
              <p class="text-3xl font-bold font-mono tracking-tight" style="color:${priceColor}" id="dp-spot">${priceStr}</p>
              <p class="text-xs text-slate-600 mt-1">$/MWh</p>
            </div>
            <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03] text-center">
              <p class="text-sm text-slate-400 mb-2">${getTrans('current_demand')}</p>
              <p class="text-3xl font-bold text-emerald-400 font-mono tracking-tight" id="dp-demand">4,454</p>
              <p class="text-xs text-slate-600 mt-1">MW</p>
            </div>
            <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03] text-center">
              <p class="text-sm text-slate-400 mb-2">${getTrans('forecast_price')}</p>
              <p class="text-3xl font-bold text-amber-400 font-mono tracking-tight" id="dp-fc-price">$${fc.toFixed(2)}</p>
              <p class="text-xs text-slate-600 mt-1">$/MWh · 30min</p>
            </div>
            <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03] text-center">
              <p class="text-sm text-slate-400 mb-2">${getTrans('forecast_demand')}</p>
              <p class="text-3xl font-bold text-emerald-400 font-mono tracking-tight" id="dp-fc-demand">4,759</p>
              <p class="text-xs text-slate-600 mt-1">MW · 30min</p>
            </div>
          </div>

          <!-- 图表 -->
          <div class="rounded-2xl p-6 border border-white/20 bg-white/[0.03]">
            <div id="dispatch-chart-container" style="height: 400px; position: relative;">
              <canvas id="dispatch-price-chart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- 今日交易计划表 -->
      <div class="mt-10 rounded-2xl border border-white/20 bg-white/[0.03] overflow-hidden">
        <div class="px-8 py-6 border-b border-white/20">
          <h3 class="text-lg font-bold text-white tracking-tight">${getTrans('trading_plan_today')}</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-white/[0.03]">
                <th class="px-6 py-4 text-left text-sm font-semibold text-slate-400">${getTrans('time')}</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-slate-400">${getTrans('price_type')}</th>
                <th class="px-6 py-4 text-left text-sm font-semibold text-slate-400">${getTrans('operation')}</th>
                <th class="px-6 py-4 text-right text-sm font-semibold text-slate-400">${getTrans('price')}</th>
                <th class="px-6 py-4 text-right text-sm font-semibold text-slate-400">${getTrans('trade_qty')}</th>
                <th class="px-6 py-4 text-right text-sm font-semibold text-slate-400">${getTrans('result')}</th>
                <th class="px-6 py-4 text-right text-sm font-semibold text-slate-400">${getTrans('status')}</th>
              </tr>
            </thead>
            <tbody>
              ${plan.slots.map(s => {
                const typeColor = s.type === 'peak' ? 'text-red-400' : s.type === 'off_peak' ? 'text-emerald-400' : 'text-amber-400';
                const actionColor = s.action === 'buy' ? 'bg-blue-500/20 text-blue-300' : s.action === 'sell' ? 'bg-red-500/20 text-red-300' : s.action === 'partial_sell' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-400';
                const actionText = s.action === 'buy' ? getTrans('action_buy') : s.action === 'sell' ? getTrans('action_sell') : s.action === 'partial_sell' ? getTrans('action_partial_sell') : getTrans('action_hold');
                const resultColor = s.result > 0 ? 'text-emerald-400' : s.result < 0 ? 'text-red-400' : 'text-slate-600';
                const statusBadge = s.status === 'done' ? `<span class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-500/20 text-slate-300">${getTrans('status_done')}</span>`
                  : s.status === 'active' ? `<span class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 animate-pulse">${getTrans('status_active')}</span>`
                  : `<span class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-slate-500">${getTrans('status_planned')}</span>`;
                return `<tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td class="px-6 py-5 text-white font-mono text-sm">${s.time}</td>
                  <td class="px-6 py-5 ${typeColor} text-sm font-semibold">${s.typeName}</td>
                  <td class="px-6 py-5"><span class="px-3 py-1.5 rounded-lg text-sm font-bold ${actionColor}">${actionText}</span></td>
                  <td class="px-6 py-5 text-right text-white font-mono text-sm">$${s.avgPrice.toFixed(2)}</td>
                  <td class="px-6 py-5 text-right text-white font-mono text-sm">${s.qty > 0 ? s.qty.toFixed(1) + ' MWh' : '—'}</td>
                  <td class="px-6 py-5 text-right font-mono text-sm font-semibold ${resultColor}">${s.result > 0 ? '+' : ''}${s.result !== 0 ? 'A$' + s.result.toFixed(0) : '—'}</td>
                  <td class="px-6 py-5 text-right">${statusBadge}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

      </div>

      <!-- ====== AI 决策面板（智能托管时显示）====== -->
      <div id="ai-decision-panel" class="${isAuto ? '' : 'hidden'} mt-10">
        <div class="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 overflow-hidden">
          <!-- 面板标题 -->
          <div class="px-8 py-5 border-b border-cyan-500/20 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="ai-brain-icon w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
                <span class="text-lg">🧠</span>
              </div>
              <div>
                <h3 class="text-lg font-bold text-white tracking-tight">${getTrans('ai_panel_title')}</h3>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="ai-pulse-dot w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span class="text-xs text-cyan-400 font-medium" id="ai-thinking-status">${getTrans('ai_status_analyzing')}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-slate-500" id="ai-last-update">${getTrans('ai_last_updated')}: --:--</span>
              <div class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <i data-lucide="timer" class="w-3.5 h-3.5 text-slate-400"></i>
                <span class="text-xs text-slate-400 font-mono" id="ai-countdown">30${getTrans('ai_seconds')}</span>
              </div>
            </div>
          </div>

          <!-- 面板内容：3 列 -->
          <div class="p-8">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

              <!-- 列 1：AI 思考过程 -->
              <div class="space-y-4">
                <h4 class="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <i data-lucide="brain" class="w-4 h-4 text-cyan-400"></i>
                  ${getTrans('ai_thinking')}
                </h4>
                <div id="ai-thinking-steps" class="space-y-2">
                  ${renderAIThinkingSteps()}
                </div>
              </div>

              <!-- 列 2：决策逻辑 -->
              <div class="space-y-4">
                <h4 class="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <i data-lucide="git-branch" class="w-4 h-4 text-purple-400"></i>
                  ${getTrans('ai_decision_logic')}
                </h4>
                <div id="ai-logic-factors" class="space-y-3">
                  ${renderAILogicFactors()}
                </div>
              </div>

              <!-- 列 3：决策结果 + 预期收益 -->
              <div class="space-y-4">
                <h4 class="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <i data-lucide="target" class="w-4 h-4 text-amber-400"></i>
                  ${getTrans('ai_decision_result')}
                </h4>
                <div id="ai-decision-result" class="space-y-3">
                  ${renderAIDecisionResult()}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  `;
  if (window.lucide) lucide.createIcons();

  // 初始化调度图表
  setTimeout(() => { initDispatchChart(); }, 100);

  // 启动/停止 AI 决策引擎
  if (isAuto && typeof startAIDecisionEngine === 'function') {
    startAIDecisionEngine();
  } else if (typeof stopAIDecisionEngine === 'function') {
    stopAIDecisionEngine();
  }
}

function updateDispatchPanel() {
  const panel = document.getElementById('dispatch-panel');
  if (!panel) return;
  const stationId = panel.getAttribute('data-station-id');
  const station = stations.find(s => s.id === stationId);
  if (!station) return;

  const cap = typeof getPhysicalCapacity === 'function' ? getPhysicalCapacity(station) : { mw: MAX_MW, mwh: MAX_MWH };
  const price = typeof currentPrice !== 'undefined' ? currentPrice : 0;
  const fc = typeof forecastPrice !== 'undefined' ? forecastPrice : price;
  const priceColor = price < 0 ? '#10b981' : price > 300 ? '#ef4444' : '#fbbf24';
  const priceStr = price < 0 ? '-$' + Math.abs(price).toFixed(2) : '$' + price.toFixed(2);

  const el = (id) => document.getElementById(id);
  const ringPrice = el('dp-ring-price'); if (ringPrice) { ringPrice.textContent = priceStr; }
  const ringSoc = el('dp-ring-soc'); if (ringSoc) ringSoc.textContent = 'SoC ' + station.soc.toFixed(1) + '%';
  const spot = el('dp-spot'); if (spot) { spot.textContent = priceStr; spot.style.color = priceColor; }
  const fcPrice = el('dp-fc-price'); if (fcPrice) fcPrice.textContent = '$' + fc.toFixed(2);

  // AEMO 真实数据更新
  if (typeof aemoEnabled !== 'undefined' && aemoEnabled && typeof aemoData !== 'undefined' && aemoData) {
    const demandEl = el('dp-demand');
    if (demandEl && aemoData.demand) demandEl.textContent = Math.round(aemoData.demand).toLocaleString();
    const fcDemandEl = el('dp-fc-demand');
    if (fcDemandEl && aemoData.forecast_demand) fcDemandEl.textContent = Math.round(aemoData.forecast_demand).toLocaleString();
  }
  const profit = el('dp-profit'); if (profit) profit.textContent = '$' + (station.projected_profit || 0).toFixed(0);
  const kwh = el('dp-kwh'); if (kwh) kwh.textContent = (station.soc * cap.mwh / 100 * 1000).toFixed(0) + 'kWh';

  // 实时更新今日汇总：有实时数据用实时，否则用计划数据
  if (typeof getTodayTradesSummary === 'function') {
    const live = getTodayTradesSummary();
    const hasLive = parseFloat(live.totalBuyQty) > 0 || parseFloat(live.totalSellQty) > 0;
    if (hasLive) {
      const buyEl = el('dp-summary-buy'); if (buyEl) buyEl.innerHTML = live.totalBuyQty + ' <span class="text-base text-slate-500 font-normal">MWh</span>';
      const sellEl = el('dp-summary-sell'); if (sellEl) sellEl.innerHTML = live.totalSellQty + ' <span class="text-base text-slate-500 font-normal">MWh</span>';
      const profitEl = el('dp-summary-profit'); if (profitEl) {
        profitEl.textContent = 'A$' + live.profit;
        profitEl.className = profitEl.className.replace(/text-(emerald|red)-400/g, '') + (parseFloat(live.profit) >= 0 ? ' text-emerald-400' : ' text-red-400');
      }
    }
  }
}

// ============ AI 决策面板渲染 ============

/**
 * 渲染 AI 思考步骤
 */
function renderAIThinkingSteps() {
  const state = typeof getAIDecisionState === 'function' ? getAIDecisionState() : aiDecisionState || {};
  const steps = state.analysisSteps || [];
  const phase = state.thinkingPhase || 0;

  if (steps.length === 0) {
    // 默认初始化步骤
    return `
      <div class="ai-step-item flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5">
        <span class="ai-spinner w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent"></span>
        <span class="text-sm text-slate-300">${getTrans('ai_status_analyzing')}</span>
      </div>
    `;
  }

  return steps.map((step, i) => {
    const isActive = i === Math.min(phase, steps.length - 1);
    const isDone = i < phase;
    const isPending = i > phase;
    const borderClass = isActive ? 'border-cyan-500/40 bg-cyan-500/5' : isDone ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]';
    const iconEl = isDone ? '<span class="text-emerald-400 text-sm">✓</span>' : isActive ? '<span class="ai-spinner w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent inline-block"></span>' : '<span class="text-slate-600 text-sm">○</span>';
    const textColor = isActive ? 'text-cyan-300' : isDone ? 'text-slate-400' : 'text-slate-600';

    // Parse step text for display
    const parsed = parseAIStepText(step.text);

    return `
      <div class="ai-step-item flex items-start gap-3 px-4 py-2.5 rounded-xl border ${borderClass} transition-all duration-300">
        <span class="flex-shrink-0 mt-0.5">${step.icon}</span>
        <div class="flex-1 min-w-0">
          <span class="text-sm ${textColor}">${parsed}</span>
        </div>
        <span class="flex-shrink-0 mt-0.5">${iconEl}</span>
      </div>
    `;
  }).join('');
}

/**
 * 解析 AI 步骤文本
 */
function parseAIStepText(text) {
  const parts = text.split('|');
  const type = parts[0];
  switch (type) {
    case 'price_analysis':
      return `${getTrans('ai_logic_price_trend')}: $${parts[1]} — <span class="font-semibold ${parts[2] === 'rising' ? 'text-amber-400' : parts[2] === 'falling' ? 'text-emerald-400' : parts[2] === 'spike' ? 'text-red-400' : 'text-slate-400'}">${getTrans('ai_logic_trend_' + parts[2])}</span>`;
    case 'forecast_analysis':
      return `${getTrans('ai_logic_forecast')}: $${parts[1]} — <span class="font-semibold ${parts[2] === 'up' ? 'text-amber-400' : parts[2] === 'down' ? 'text-emerald-400' : 'text-slate-400'}">${getTrans('ai_logic_forecast_' + parts[2])}</span>`;
    case 'soc_analysis':
      return `${getTrans('ai_logic_soc_state')}: ${parts[1]}% — <span class="font-semibold ${parts[2] === 'low' ? 'text-red-400' : parts[2] === 'high' ? 'text-emerald-400' : 'text-slate-400'}">${getTrans('ai_logic_soc_' + parts[2])}</span>`;
    case 'spread_analysis':
      return `${getTrans('ai_logic_spread')}: <span class="font-semibold text-cyan-400">$${parts[1]}/MWh</span>`;
    case 'decision':
      return `${getTrans('ai_planned_action')}: <span class="font-bold ${parts[1] === 'charge' ? 'text-blue-400' : parts[1] === 'discharge' ? 'text-amber-400' : parts[1] === 'fcas' ? 'text-purple-400' : 'text-slate-400'}">${getTrans('ai_action_' + parts[1])}</span> (${getTrans('ai_confidence')}: ${getTrans('ai_confidence_' + parts[2])})`;
    default:
      return text;
  }
}

/**
 * 渲染决策逻辑因子
 */
function renderAILogicFactors() {
  const state = typeof getAIDecisionState === 'function' ? getAIDecisionState() : {};
  const trend = state.priceTrend || 'stable';
  const forecast = state.forecastDirection || 'stable';
  const soc = state.socState || 'mid';

  const trendColor = trend === 'rising' ? 'text-amber-400' : trend === 'falling' ? 'text-emerald-400' : trend === 'spike' ? 'text-red-400' : 'text-slate-400';
  const trendIcon = trend === 'rising' ? 'trending-up' : trend === 'falling' ? 'trending-down' : trend === 'spike' ? 'alert-triangle' : 'minus';
  const trendBg = trend === 'spike' ? 'bg-red-500/10 border-red-500/30' : 'bg-white/[0.03] border-white/10';

  const fcColor = forecast === 'up' ? 'text-amber-400' : forecast === 'down' ? 'text-emerald-400' : 'text-slate-400';
  const fcIcon = forecast === 'up' ? 'arrow-up-right' : forecast === 'down' ? 'arrow-down-right' : 'arrow-right';

  const socColor = soc === 'low' ? 'text-red-400' : soc === 'high' ? 'text-emerald-400' : 'text-slate-400';
  const socIcon = soc === 'low' ? 'battery-low' : soc === 'high' ? 'battery-full' : 'battery-medium';

  return `
    <!-- 价格趋势 -->
    <div class="px-4 py-3 rounded-xl border ${trendBg}">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="${trendIcon}" class="w-4 h-4 ${trendColor}"></i>
          <span class="text-xs text-slate-400">${getTrans('ai_logic_price_trend')}</span>
        </div>
        <span class="text-sm font-bold ${trendColor}">${getTrans('ai_logic_trend_' + trend)}</span>
      </div>
    </div>

    <!-- 价格预测 -->
    <div class="px-4 py-3 rounded-xl border bg-white/[0.03] border-white/10">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="${fcIcon}" class="w-4 h-4 ${fcColor}"></i>
          <span class="text-xs text-slate-400">${getTrans('ai_logic_forecast')}</span>
        </div>
        <span class="text-sm font-bold ${fcColor}">${getTrans('ai_logic_forecast_' + forecast)}</span>
      </div>
    </div>

    <!-- SoC 状态 -->
    <div class="px-4 py-3 rounded-xl border bg-white/[0.03] border-white/10">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="${socIcon}" class="w-4 h-4 ${socColor}"></i>
          <span class="text-xs text-slate-400">${getTrans('ai_logic_soc_state')}</span>
        </div>
        <span class="text-sm font-bold ${socColor}">${getTrans('ai_logic_soc_' + soc)}</span>
      </div>
    </div>

    <!-- 套利价差 -->
    <div class="px-4 py-3 rounded-xl border bg-white/[0.03] border-white/10">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i data-lucide="bar-chart-3" class="w-4 h-4 text-cyan-400"></i>
          <span class="text-xs text-slate-400">${getTrans('ai_logic_spread')}</span>
        </div>
        <span class="text-sm font-bold text-cyan-400">$${(state.avgSpread || 0).toFixed(1)}/MWh</span>
      </div>
    </div>
  `;
}

/**
 * 渲染决策结果
 */
function renderAIDecisionResult() {
  const state = typeof getAIDecisionState === 'function' ? getAIDecisionState() : {};
  const action = state.plannedAction || 'hold';
  const confidence = state.confidence || 'medium';

  // 动作颜色和图标
  const actionConfig = {
    charge: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: '⚡', gradient: 'from-blue-500 to-cyan-500' },
    discharge: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: '🔋', gradient: 'from-amber-500 to-orange-500' },
    hold: { color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30', icon: '⏸', gradient: 'from-slate-500 to-slate-600' },
    fcas: { color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', icon: '📡', gradient: 'from-purple-500 to-pink-500' },
  };
  const ac = actionConfig[action] || actionConfig.hold;

  const confColor = confidence === 'high' ? 'text-emerald-400' : confidence === 'medium' ? 'text-amber-400' : 'text-red-400';
  const confBar = confidence === 'high' ? 'w-full' : confidence === 'medium' ? 'w-2/3' : 'w-1/3';
  const confBg = confidence === 'high' ? 'bg-emerald-500' : confidence === 'medium' ? 'bg-amber-500' : 'bg-red-500';

  return `
    <!-- 当前决策 -->
    <div class="px-5 py-4 rounded-xl border ${ac.bg} text-center">
      <span class="text-3xl">${ac.icon}</span>
      <p class="text-2xl font-black ${ac.color} mt-2 tracking-wide">${getTrans('ai_action_' + action)}</p>
      <div class="flex items-center justify-center gap-2 mt-2">
        <span class="text-xs text-slate-500">${getTrans('ai_confidence')}:</span>
        <span class="text-xs font-bold ${confColor}">${getTrans('ai_confidence_' + confidence)}</span>
      </div>
      <div class="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
        <div class="${confBg} h-full rounded-full transition-all duration-500 ${confBar}"></div>
      </div>
    </div>

    <!-- 执行详情 -->
    <div class="grid grid-cols-2 gap-2">
      <div class="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
        <p class="text-[10px] text-slate-500 uppercase">${getTrans('ai_execute_time')}</p>
        <p class="text-sm font-bold text-white font-mono mt-0.5" id="ai-execute-time">${state.executeTime || '--:--'}</p>
      </div>
      <div class="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
        <p class="text-[10px] text-slate-500 uppercase">${getTrans('ai_power_level')}</p>
        <p class="text-sm font-bold text-white font-mono mt-0.5" id="ai-power-level">${(state.powerLevel || 0).toFixed(1)} MW</p>
      </div>
    </div>

    <!-- 预期收益 -->
    <div class="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
      <div class="flex items-center gap-2 mb-2">
        <i data-lucide="trending-up" class="w-4 h-4 text-emerald-400"></i>
        <span class="text-xs text-slate-400">${getTrans('ai_expected_profit')}</span>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="text-[10px] text-slate-500 uppercase">${getTrans('ai_profit_this_cycle')}</p>
          <p class="text-lg font-black text-emerald-400 font-mono" id="ai-cycle-profit">A$${(state.cycleProfit || 0).toFixed(0)}</p>
        </div>
        <div>
          <p class="text-[10px] text-slate-500 uppercase">${getTrans('ai_profit_today')}</p>
          <p class="text-lg font-black font-mono ${(state.todayProfit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}" id="ai-today-profit">A$${(state.todayProfit || 0).toFixed(0)}</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * 实时更新 AI 决策面板（每秒调用）
 */
function updateAIDecisionPanel() {
  const panel = document.getElementById('ai-decision-panel');
  if (!panel || panel.classList.contains('hidden')) return;

  const state = typeof getAIDecisionState === 'function' ? getAIDecisionState() : {};

  // 更新倒计时
  const countdown = document.getElementById('ai-countdown');
  if (countdown) countdown.textContent = (state.updateCountdown || 0) + getTrans('ai_seconds');

  // 更新最后刷新时间
  const lastUpdate = document.getElementById('ai-last-update');
  if (lastUpdate && state.lastUpdated) lastUpdate.textContent = getTrans('ai_last_updated') + ': ' + state.lastUpdated;

  // 更新思考状态文本
  const statusEl = document.getElementById('ai-thinking-status');
  if (statusEl) {
    const statusKey = 'ai_status_' + (state.status || 'analyzing');
    statusEl.textContent = getTrans(statusKey);
  }

  // 如果刚完成决策（倒计时刚重置），重新渲染所有面板内容
  if (state.updateCountdown >= 29) {
    const stepsEl = document.getElementById('ai-thinking-steps');
    if (stepsEl) stepsEl.innerHTML = renderAIThinkingSteps();

    const logicEl = document.getElementById('ai-logic-factors');
    if (logicEl) {
      logicEl.innerHTML = renderAILogicFactors();
      if (window.lucide) lucide.createIcons();
    }

    const resultEl = document.getElementById('ai-decision-result');
    if (resultEl) {
      resultEl.innerHTML = renderAIDecisionResult();
      if (window.lucide) lucide.createIcons();
    }
  } else {
    // 只更新思考步骤动画
    const stepsEl = document.getElementById('ai-thinking-steps');
    if (stepsEl) stepsEl.innerHTML = renderAIThinkingSteps();

    // 更新动态数值
    const cycleEl = document.getElementById('ai-cycle-profit');
    if (cycleEl) cycleEl.textContent = 'A$' + (state.cycleProfit || 0).toFixed(0);
    const todayEl = document.getElementById('ai-today-profit');
    if (todayEl) {
      todayEl.textContent = 'A$' + (state.todayProfit || 0).toFixed(0);
      todayEl.className = `text-lg font-black font-mono ${(state.todayProfit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
  }
}

function dispatchToggleAuto(stationId, isAuto) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;
  station.strategy = station.strategy || {};
  station.strategy.mode = isAuto ? 'auto' : 'manual_idle';
  if (typeof saveStations === 'function') saveStations();
  const container = document.getElementById('station-container');
  if (container && activeMenuId === 'dispatch') renderDispatchControlPanel(container);
  showToast(isAuto ? getTrans('dispatch_mode_smart') : getTrans('dispatch_mode_manual'), 'success');
}

// 充电/放电确认弹窗
function showDispatchConfirm(stationId, action) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;
  const isCharge = action === 'charge';
  const title = isCharge ? getTrans('confirm_charge') : getTrans('confirm_discharge');
  const color = isCharge ? '#10b981' : '#f59e0b';
  const cap = typeof getPhysicalCapacity === "function" ? getPhysicalCapacity(station) : { mw: MAX_MW, mwh: MAX_MWH };
  const price = typeof currentPrice !== 'undefined' ? currentPrice : 100;
  const priceStr = '$' + price.toFixed(2);

  // 计算预计时间
  const socNow = station.soc;
  let estHours = 0;
  let costEstimate = 0;
  if (isCharge) {
    // 充到 90%，需要的 MWh = (90 - socNow) / 100 * cap.mwh
    const needMWh = Math.max(0, (90 - socNow) / 100 * cap.mwh);
    estHours = needMWh / cap.mw;
    costEstimate = needMWh * price; // 充电成本
  } else {
    // 放到 10%，可放的 MWh = (socNow - 10) / 100 * cap.mwh
    const canMWh = Math.max(0, (socNow - 10) / 100 * cap.mwh);
    estHours = canMWh / cap.mw;
    costEstimate = canMWh * price * (station.efficiency || 0.88); // 放电收入
  }

  const overlay = document.createElement('div');
  overlay.id = 'dispatch-confirm-overlay';
  overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-md p-0 overflow-hidden" style="animation: fadeInUp 0.2s ease-out;">
      <!-- Header -->
      <div class="px-8 pt-8 pb-4 flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background: ${color}33;">
          <span class="text-2xl">${isCharge ? '⚡' : '🔋'}</span>
        </div>
        <h2 class="text-xl font-bold text-white">${title}</h2>
      </div>

      <!-- Body -->
      <div class="px-8 py-6">
        <div class="grid grid-cols-2 gap-4 mb-6">
          <div class="rounded-2xl border border-white/20 p-5">
            <p class="text-xs text-slate-500 mb-1">${getTrans('spot_price')}</p>
            <p class="text-2xl font-bold font-mono" style="color: ${price < 0 ? '#10b981' : price > 300 ? '#ef4444' : '#fbbf24'};">${priceStr}</p>
            <p class="text-xs text-slate-600 mt-1">$/MWh</p>
          </div>
          <div class="rounded-2xl border border-white/20 p-5">
            <p class="text-xs text-slate-500 mb-1">${isCharge ? getTrans('est_charge_cost') : getTrans('est_discharge_revenue')}</p>
            <p class="text-2xl font-bold font-mono ${isCharge ? 'text-red-400' : 'text-emerald-400'}">A$${Math.abs(costEstimate).toFixed(0)}</p>
            <p class="text-xs text-slate-600 mt-1">${isCharge ? getTrans('cost') : getTrans('revenue')}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6">
          <div class="rounded-2xl border border-white/20 p-5">
            <p class="text-xs text-slate-500 mb-1">${getTrans('current_soc')}</p>
            <p class="text-2xl font-bold text-white font-mono">${socNow.toFixed(1)}%</p>
            <p class="text-xs text-slate-600 mt-1">${isCharge ? '→ 90%' : '→ 10%'}</p>
          </div>
          <div class="rounded-2xl border border-white/20 p-5">
            <p class="text-xs text-slate-500 mb-1">${isCharge ? getTrans('est_charge_time') : getTrans('est_discharge_time')}</p>
            <p class="text-2xl font-bold font-mono" style="color: ${color};">${estHours.toFixed(1)}h</p>
            <p class="text-xs text-slate-600 mt-1">${cap.mw}MW ${isCharge ? getTrans('force_charge') : getTrans('force_discharge')}</p>
          </div>
        </div>

        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <span class="text-lg">⚠️</span>
          <p class="text-sm text-amber-300/80">${isCharge ? getTrans('charge_warning') : getTrans('discharge_warning')}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-8 pb-8 flex gap-4">
        <button onclick="closeDispatchConfirm()" class="flex-1 py-3.5 rounded-2xl border border-white/20 text-sm font-bold text-slate-300 hover:bg-white/5 transition-colors">
          ${getTrans('cancel')}
        </button>
        <button onclick="confirmDispatchAction('${stationId}', '${action}')" class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.02]" style="background: linear-gradient(135deg, ${color}, ${color}cc);">
          ${title}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// 停止确认弹窗
function showStopConfirm(stationId) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;
  const overlay = document.createElement('div');
  overlay.id = 'dispatch-confirm-overlay';
  overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-sm p-0 overflow-hidden">
      <div class="px-8 pt-8 pb-4 flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center">
          <span class="text-2xl">🛑</span>
        </div>
        <h2 class="text-xl font-bold text-white">${getTrans('confirm_stop')}</h2>
      </div>
      <div class="px-8 py-6">
        <p class="text-sm text-slate-400">${getTrans('confirm_stop_desc')}</p>
      </div>
      <div class="px-8 pb-8 flex gap-4">
        <button onclick="closeDispatchConfirm()" class="flex-1 py-3.5 rounded-2xl border border-white/20 text-sm font-bold text-slate-300 hover:bg-white/5 transition-colors">
          ${getTrans('cancel')}
        </button>
        <button onclick="confirmStop('${stationId}')" class="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.02] bg-red-500">
          ${getTrans('confirm_stop')}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function confirmStop(stationId) {
  closeDispatchConfirm();
  dispatchSetMode(stationId, 'manual_idle');
}

function closeDispatchConfirm() {
  const overlay = document.getElementById('dispatch-confirm-overlay');
  if (overlay) overlay.remove();
}

function confirmDispatchAction(stationId, action) {
  closeDispatchConfirm();
  const mode = action === 'charge' ? 'manual_charge' : 'manual_discharge';
  dispatchSetMode(stationId, mode);
}

function dispatchSetMode(stationId, mode) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;
  station.strategy = station.strategy || {};
  station.strategy.mode = mode;
  if (typeof saveStations === 'function') saveStations();
  const container = document.getElementById('station-container');
  if (container && activeMenuId === 'dispatch') renderDispatchControlPanel(container);
  showToast(`${station.name}: ${mode}`, 'success');
}

function switchDispatchStation(stationId) {
  const container = document.getElementById('station-container');
  if (container) renderDispatchControlPanel(container, stationId);
}

// 调度中心专属图表（ECharts）
let dispatchChartInstance = null;
function initDispatchChart() {
  const container = document.getElementById('dispatch-chart-container');
  if (!container) return;
  // 移除 canvas，用 div 给 echarts
  container.innerHTML = '<div id="dispatch-echart" style="width:100%;height:100%;"></div>';
  const chartDom = document.getElementById('dispatch-echart');
  if (!chartDom || typeof echarts === 'undefined') return;

  dispatchChartInstance = echarts.init(chartDom, 'dark');
  const history = typeof getPriceHistory === 'function' ? getPriceHistory() : [];

  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: [getTrans('spot_price'), getTrans('forecast_price')], textStyle: { color: '#94a3b8', fontSize: 11 }, top: 0 },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: history.map(h => h.time), axisLabel: { color: '#64748b', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } } },
    yAxis: { type: 'value', axisLabel: { color: '#fbbf24', formatter: '${value}' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
    series: [
      {
        name: getTrans('spot_price'),
        type: 'line',
        data: history.map(h => h.price),
        lineStyle: { color: '#fbbf24', width: 2 },
        itemStyle: { color: '#fbbf24' },
        areaStyle: { color: 'rgba(251,191,36,0.1)' },
        symbol: 'none',
        smooth: true,
      },
      {
        name: getTrans('forecast_price'),
        type: 'line',
        data: history.map(h => h.forecast),
        lineStyle: { color: '#10b981', width: 2, type: 'dashed' },
        itemStyle: { color: '#10b981' },
        symbol: 'none',
        smooth: true,
      }
    ]
  };
  dispatchChartInstance.setOption(option);
}

function updateDispatchChart(history) {
  if (!history || history.length === 0) return;
  if (!dispatchChartInstance) {
    initDispatchChart();
    return;
  }
  dispatchChartInstance.setOption({
    xAxis: { data: history.map(h => h.time) },
    series: [
      { data: history.map(h => h.price) },
      { data: history.map(h => h.forecast) }
    ]
  });
}

function resumeSmartHosting() {
  stations.forEach(s => {
    if (s.strategy) s.strategy.mode = 'auto';
  });
  if (typeof saveStations === 'function') saveStations();
  showToast(getTrans('btn_resume_ai') + ' ✅', 'success');
  // 刷新 banner 显示
  renderMarketBanner();
  if (typeof initChart === 'function') initChart();
  if (typeof updateChart === 'function' && typeof getPriceHistory === 'function') updateChart(getPriceHistory());
}

function setManualMode(stationId, mode) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return;

  station.strategy = station.strategy || {};
  station.strategy.mode = mode;

  closeStrategyModal();
  showToast(`${station.name}: ${getTrans('mode_' + mode)}`, 'success');
}

// ============ 切换角色 ============

function switchRole() {
  if (typeof stopSimulator === 'function') stopSimulator();
  if (typeof disposeChart === 'function') disposeChart();
  // 只清角色，保留登录状态和电站数据 → 直接进角色选择页
  // 注意：不调用 resetStations()，确保告警/收益等数据跨角色保留
  localStorage.removeItem('role');
  window.location.href = 'index.html?jump=role-select';
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
