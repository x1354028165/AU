/**
 * reports.js - 报表渲染引擎（排行榜 + 日志 + CSV 导出）
 * Phase 3: 澳洲储能电站管理平台
 */

/**
 * 渲染报表视图（根据角色自动切换内容）
 */
// Track which report sub-view to show
let reportSubView = 'default'; // 'default' | 'health' | 'alarms'

function renderReports(subView) {
  const container = document.getElementById('view-reports');
  if (!container) return;

  if (subView) reportSubView = subView;

  const role = getCurrentUser();
  const isOwner = role === 'owner';

  // Dispose SoH chart first
  if (typeof disposeSohChart === 'function') disposeSohChart();

  if (reportSubView === 'alarms') {
    renderAlarmsList(container, isOwner);
  } else if (reportSubView === 'arbitrage') {
    renderArbitrageReports(container, isOwner);
  } else if (isOwner && reportSubView === 'health') {
    renderHealthView(container);
  } else if (isOwner) {
    renderLeaderboard(container);
  } else {
    renderDispatchLogs(container, role);
  }
}

// ============ 业主：Health 视图 (SoH趋势 + 排行榜) ============

function renderHealthView(container) {
  container.innerHTML = `
    <div class="">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <i data-lucide="heart-pulse" class="w-5 h-5 text-red-400"></i>
            ${getTrans('soh_trend')}
          </h2>
          <p class="text-sm text-slate-400 mt-1">${getTrans('soh_trend_hint')}</p>
        </div>
      </div>
      <div class="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
        <div id="soh-chart" style="width:100%;height:350px;"></div>
        <p class="text-xs text-slate-600 mt-2 text-center italic">${getTrans('simulated_data_hint')}</p>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  // Init chart after DOM is ready
  setTimeout(() => {
    if (typeof initSohChart === 'function') initSohChart();
  }, 100);
}

// ============ 业主：运维方绩效排行榜 ============

function renderLeaderboard(container) {
  const operators = getOperators();

  // 计算每个运维方的指标
  const rankings = operators.map(op => {
    const opStations = stations.filter(s => s.operator_id === op.id);
    const totalRevenue = opStations.reduce((sum, s) => sum + (s.revenue_today || 0), 0);
    const totalCapMW = opStations.reduce((sum, s) => {
      const cap = parseCapacity(s.capacity);
      return sum + cap.mw;
    }, 0);
    const revPerMW = totalCapMW > 0 ? totalRevenue / totalCapMW : 0;
    const totalSohLoss = opStations.reduce((sum, s) => {
      const defaultSoh = DEFAULT_STATIONS.find(ds => ds.id === s.id)?.soh || 100;
      return sum + (defaultSoh - s.soh);
    }, 0);
    const stationCount = opStations.length;

    return {
      id: op.id,
      name: op.name,
      totalRevenue,
      totalCapMW,
      revPerMW,
      totalSohLoss,
      stationCount
    };
  });

  // 按 Revenue/MW 排序（降序）
  rankings.sort((a, b) => b.revPerMW - a.revPerMW);

  container.innerHTML = `
    <div class="">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <i data-lucide="trophy" class="w-5 h-5 text-amber-400"></i>
            ${getTrans('leaderboard')}
          </h2>
          <p class="text-sm text-slate-400 mt-1">${getTrans('report_owner_hint')}</p>
        </div>
        <button onclick="exportLeaderboardCSV()" class="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2">
          <i data-lucide="download" class="w-4 h-4"></i>
          ${getTrans('export_csv')}
        </button>
      </div>

      <!-- Ranking Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        ${rankings.map((r, i) => renderRankCard(r, i)).join('')}
      </div>

      <!-- Detail Table -->
      <div class="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-white/10">
              <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('rank')}</th>
              <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('table_operator')}</th>
              <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('table_total_rev')}</th>
              <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('table_total_cap')}</th>
              <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('table_rev_per_mw')}</th>
              <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('table_soh_loss')}</th>
            </tr>
          </thead>
          <tbody>
            ${rankings.map((r, i) => `
              <tr class="${i % 2 === 0 ? 'bg-white/[0.02]' : ''} border-b border-white/5">
                <td class="px-4 py-3 text-white font-medium">${i === 0 ? '👑 1' : i + 1}</td>
                <td class="px-4 py-3 text-white">${escapeHTML(r.name)}</td>
                <td class="px-4 py-3 text-right font-mono ${r.totalRevenue >= 0 ? 'text-emerald-400' : 'text-red-400'}">
                  ${r.totalRevenue >= 0 ? '' : '-'}A$${Math.abs(r.totalRevenue).toFixed(2)}
                </td>
                <td class="px-4 py-3 text-right font-mono text-slate-300">${r.totalCapMW.toFixed(1)} MW</td>
                <td class="px-4 py-3 text-right font-mono font-bold ${r.revPerMW >= 0 ? 'text-amber-400' : 'text-red-400'}">
                  ${r.revPerMW >= 0 ? '' : '-'}A$${Math.abs(r.revPerMW).toFixed(2)}/MW
                </td>
                <td class="px-4 py-3 text-right font-mono text-red-400">-${r.totalSohLoss.toFixed(4)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function renderRankCard(ranking, index) {
  const isFirst = index === 0;
  const borderClass = isFirst ? 'border-amber-500/50 shadow-lg shadow-amber-500/10' : 'border-white/10';

  return `
    <div class="rounded-xl border ${borderClass} bg-white/5 p-5 card-fade-in">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          ${isFirst ? '<span class="text-2xl">👑</span>' : `<span class="text-lg text-slate-500 font-bold">#${index + 1}</span>`}
          <div>
            <h3 class="text-white font-bold">${escapeHTML(ranking.name)}</h3>
            <p class="text-xs text-slate-400">${ranking.stationCount} station${ranking.stationCount > 1 ? 's' : ''} · ${ranking.totalCapMW.toFixed(1)} MW</p>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white/5 rounded-lg p-3 text-center">
          <p class="text-xs text-slate-500">${getTrans('table_total_rev')}</p>
          <p class="text-sm font-bold font-mono ${ranking.totalRevenue >= 0 ? 'text-emerald-400' : 'text-red-400'} mt-1">
            ${ranking.totalRevenue >= 0 ? '' : '-'}A$${Math.abs(ranking.totalRevenue).toFixed(2)}
          </p>
        </div>
        <div class="bg-white/5 rounded-lg p-3 text-center">
          <p class="text-xs text-slate-500">${getTrans('table_rev_per_mw')}</p>
          <p class="text-sm font-bold font-mono text-amber-400 mt-1">
            A$${ranking.revPerMW.toFixed(2)}
          </p>
        </div>
        <div class="bg-white/5 rounded-lg p-3 text-center">
          <p class="text-xs text-slate-500">${getTrans('table_soh_loss')}</p>
          <p class="text-sm font-bold font-mono text-red-400 mt-1">-${ranking.totalSohLoss.toFixed(4)}%</p>
        </div>
      </div>
    </div>
  `;
}

// ============ 运维方：调度日志 ============

function renderDispatchLogs(container, operatorId) {
  const logs = typeof getDispatchLogs === 'function' ? getDispatchLogs(operatorId) : [];

  const actionLabels = {
    'CHARGING': { icon: '⚡', color: 'text-blue-400' },
    'DISCHARGING': { icon: '🔋', color: 'text-emerald-400' },
    'SPIKE_DISCHARGE': { icon: '🔥', color: 'text-red-400' },
    'IDLE': { icon: '⏸', color: 'text-slate-400' }
  };

  container.innerHTML = `
    <div class="">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <i data-lucide="scroll-text" class="w-5 h-5 text-emerald-400"></i>
            ${getTrans('logs_title')}
          </h2>
          <p class="text-sm text-slate-400 mt-1">${getTrans('report_op_hint')}</p>
        </div>
        <button onclick="exportLogsCSV('${operatorId}')" class="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
          ${logs.length === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
          <i data-lucide="download" class="w-4 h-4"></i>
          ${getTrans('export_csv')}
        </button>
      </div>

      ${logs.length === 0 ? `
        <div class="flex flex-col items-center justify-center py-16 text-slate-500">
          <i data-lucide="clock" class="w-12 h-12 mb-3 opacity-40"></i>
          <p class="text-base">${getTrans('no_logs')}</p>
          <p class="text-sm mt-1">${getTrans('no_logs_hint')}</p>
        </div>
      ` : `
        <div class="bg-white/5 rounded-xl border border-white/10 overflow-x-auto">
          <table class="w-full text-sm min-w-[600px]">
            <thead>
              <tr class="border-b border-white/10">
                <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('table_time')}</th>
                <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('table_station')}</th>
                <th class="text-left px-4 py-3 text-slate-400 font-medium">${getTrans('table_action')}</th>
                <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('table_price')}</th>
                <th class="text-right px-4 py-3 text-slate-400 font-medium">${getTrans('table_revenue')}</th>
              </tr>
            </thead>
            <tbody>
              ${logs.slice().reverse().map((log, i) => {
                const style = actionLabels[log.action] || actionLabels['IDLE'];
                return `
                  <tr class="${i % 2 === 0 ? 'bg-white/[0.02]' : ''} border-b border-white/5">
                    <td class="px-4 py-3 font-mono text-slate-300 text-xs">${log.time}</td>
                    <td class="px-4 py-3 text-white">${escapeHTML(log.stationName)}</td>
                    <td class="px-4 py-3 ${style.color} font-medium">${style.icon} ${log.action}</td>
                    <td class="px-4 py-3 text-right font-mono text-amber-400">$${log.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-right font-mono ${log.revenue >= 0 ? 'text-emerald-400' : 'text-red-400'}">
                      ${log.revenue >= 0 ? '' : '-'}A$${Math.abs(log.revenue).toFixed(2)}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

// ============ CSV 导出 ============

/**
 * 导出排行榜 CSV（业主用）
 */
function exportLeaderboardCSV() {
  const operators = getOperators();
  const rows = [['Rank', 'Operator', 'Total Revenue (AUD)', 'Total Capacity (MW)', 'Revenue/MW (AUD)', 'SoH Loss (%)']];

  const rankings = operators.map(op => {
    const opStations = stations.filter(s => s.operator_id === op.id);
    const totalRevenue = opStations.reduce((sum, s) => sum + (s.revenue_today || 0), 0);
    const totalCapMW = opStations.reduce((sum, s) => sum + parseCapacity(s.capacity).mw, 0);
    const revPerMW = totalCapMW > 0 ? totalRevenue / totalCapMW : 0;
    const totalSohLoss = opStations.reduce((sum, s) => {
      const defaultSoh = DEFAULT_STATIONS.find(ds => ds.id === s.id)?.soh || 100;
      return sum + (defaultSoh - s.soh);
    }, 0);
    return { name: op.name, totalRevenue, totalCapMW, revPerMW, totalSohLoss };
  }).sort((a, b) => b.revPerMW - a.revPerMW);

  rankings.forEach((r, i) => {
    rows.push([i + 1, r.name, r.totalRevenue.toFixed(2), r.totalCapMW.toFixed(1), r.revPerMW.toFixed(2), (-r.totalSohLoss).toFixed(4)]);
  });

  downloadCSV(rows, 'au-bess-leaderboard.csv');
}

/**
 * 导出调度日志 CSV（运维方用）
 */
function exportLogsCSV(operatorId) {
  const logs = typeof getDispatchLogs === 'function' ? getDispatchLogs(operatorId) : [];
  if (logs.length === 0) return;

  const rows = [['Time', 'Station', 'Action', 'Price ($/MWh)', 'Revenue (AUD)']];
  logs.forEach(l => {
    rows.push([l.time, l.stationName, l.action, l.price.toFixed(2), l.revenue.toFixed(2)]);
  });

  downloadCSV(rows, 'au-bess-dispatch-logs.csv');
}

/**
 * 通用 CSV 下载
 */
function downloadCSV(rows, filename) {
  const csvContent = rows.map(row =>
    row.map(cell => {
      const str = String(cell);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  ).join('\n');

  // 添加 BOM 以支持 Excel 中文
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ 告警管理（SCADA 工业级监控中心）============

// 过滤器状态
let alarmFilterStation = 'all';
let alarmFilterDevice = 'all';
let alarmFilterSeverity = 'all';
let alarmFilterTab = 'all';
let alarmFilterDateFrom = '';
let alarmFilterDateTo = '';

/**
 * 缩短时间显示：'27/02/2026, 13:30:32 (Sydney)' → '02-27 13:30 (+11)'
 */
const tzGmtMap = {
  'Sydney': 'GMT+11', 'Melbourne': 'GMT+11', 'Hobart': 'GMT+11',
  'Brisbane': 'GMT+10', 'Perth': 'GMT+8',
  'Adelaide': 'GMT+10:30', 'Darwin': 'GMT+9:30',
  '悉尼': 'GMT+11', '墨尔本': 'GMT+11', '霍巴特': 'GMT+11',
  '布里斯班': 'GMT+10', '珀斯': 'GMT+8',
  '阿德莱德': 'GMT+10:30', '达尔文': 'GMT+9:30'
};
function shortTime(timeStr) {
  if (!timeStr) return '-';
  const m = String(timeStr).match(/(\d{2})\/(\d{2})\/\d{4},?\s*(\d{2}):(\d{2})/);
  const city = String(timeStr).match(/\(([^)]+)\)/);
  const gmt = city && tzGmtMap[city[1]] ? ' ' + tzGmtMap[city[1]] : '';
  const mFull = String(timeStr).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (mFull) return mFull[3] + '-' + mFull[2] + '-' + mFull[1] + ' ' + mFull[4] + ':' + mFull[5] + (gmt ? '<br><span class="text-slate-400 text-xs">（' + gmt + '）</span>' : '');
  return timeStr.replace(/\s*\(.*\)\s*$/, '').replace(/:\d{2}$/, '') + (gmt ? '<br><span class="text-slate-400 text-xs">（' + gmt + '）</span>' : '');
}

/**
 * 解析告警消息（支持翻译 key: 'alarm_msg_temp|55' → 翻译后文本）
 */
function calcAlarmDuration(alarm) {
  if (alarm.status === 'RESOLVED' && alarm.resolved_ms && alarm.created_ms) {
    const diff = alarm.resolved_ms - alarm.created_ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }
  if (alarm.created_ms) {
    const diff = Date.now() - alarm.created_ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '<1m';
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }
  return '-';
}

function resolveAlarmMsg(msg) {
  if (!msg) return '';
  // 新格式：'alarm_msg_temp|55'
  if (msg.includes('|') && msg.startsWith('alarm_msg_')) {
    const parts = msg.split('|');
    const tpl = getTrans(parts[0]);
    if (tpl && tpl !== parts[0]) return tpl.replace('{0}', parts[1] || '');
  }
  // 兼容旧英文原文 → 自动匹配翻译
  if (msg.includes('Cell temp exceeded')) {
    const m = msg.match(/(\d+)°C/);
    const tpl = getTrans('alarm_msg_temp');
    if (tpl) return tpl.replace('{0}', m ? m[1] : '55');
  }
  if (msg.includes('State of charge dropped')) {
    const m = msg.match(/([\d.]+)%\)/);
    const tpl = getTrans('alarm_msg_soc');
    if (tpl) return tpl.replace('{0}', m ? m[1] : '');
  }
  return msg;
}

/**
 * 解析时间戳（剥离城市后缀后转 Date）
 */
function parseAlarmTime(timeStr) {
  if (!timeStr) return null;
  const cleaned = String(timeStr).replace(/\s*\(.*\)\s*$/, '');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 计算持续时长
 */
function calcDuration(alarm) {
  let startMs = alarm.created_ms || 0;
  if (!startMs) {
    const parsed = parseAlarmTime(alarm.timestamp);
    startMs = parsed ? parsed.getTime() : 0;
  }
  if (!startMs) return '-';
  let endMs;
  if (alarm.status === 'RESOLVED') {
    endMs = alarm.resolved_ms || 0;
    if (!endMs) { const p = parseAlarmTime(alarm.resolved_at); endMs = p ? p.getTime() : Date.now(); }
  } else {
    endMs = Date.now();
  }
  const diffMin = Math.round((endMs - startMs) / 60000);
  if (diffMin < 1) return '<1m';
  if (diffMin < 60) return diffMin + 'm';
  return (diffMin / 60).toFixed(1) + 'h';
}

/**
 * 渲染告警列表（SCADA 风格：查询条件 + Tab + 表格）
 */
function renderAlarmsList(container, isOwner) {
  const myStations = getStationsByRole();

  // 收集全量告警
  let allAlarms = [];
  myStations.forEach(station => {
    if (!station.alarms) station.alarms = [];
    station.alarms.forEach(alarm => {
      allAlarms.push({ ...alarm, stationId: station.id, stationName: station.name, stationTimezone: station.timezone });
    });
  });

  // 统计各状态数量（过滤前）
  const countPending = allAlarms.filter(a => a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED').length;
  const countResolved = allAlarms.filter(a => a.status === 'RESOLVED').length;
  const countAll = allAlarms.length;

  // 应用查询条件
  if (alarmFilterStation !== 'all') {
    allAlarms = allAlarms.filter(a => a.stationId === alarmFilterStation);
  }
  if (alarmFilterDevice !== 'all') {
    allAlarms = allAlarms.filter(a => a.device_id === alarmFilterDevice);
  }
  if (alarmFilterSeverity !== 'all') {
    allAlarms = allAlarms.filter(a => a.severity === alarmFilterSeverity);
  }
  if (alarmFilterTab === 'PENDING') {
    allAlarms = allAlarms.filter(a => a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED');
  } else if (alarmFilterTab !== 'all') {
    allAlarms = allAlarms.filter(a => a.status === alarmFilterTab);
  }
  if (alarmFilterDateFrom) {
    const fromMs = new Date(alarmFilterDateFrom).getTime();
    allAlarms = allAlarms.filter(a => (a.created_ms || 0) >= fromMs);
  }
  if (alarmFilterDateTo) {
    const toMs = new Date(alarmFilterDateTo + 'T23:59:59').getTime();
    allAlarms = allAlarms.filter(a => (a.created_ms || 0) <= toMs);
  }

  // 排序
  const statusOrder = { 'ACTIVE': 0, 'ACKNOWLEDGED': 1, 'RESOLVED': 2 };
  allAlarms.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 9, sb = statusOrder[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.severity !== b.severity) return a.severity === 'Critical' ? -1 : 1;
    return (b.created_ms || 0) - (a.created_ms || 0);
  });

  // 构建站点/设备选项
  const stationOpts = myStations.map(s =>
    `<option value="${s.id}" ${alarmFilterStation===s.id?'selected':''}>${escapeHTML(s.name)}</option>`
  ).join('');
  const deviceSet = new Set();
  const allDevices = [];
  myStations.forEach(s => { if (s.devices) s.devices.forEach(d => { if (!deviceSet.has(d.id)) { deviceSet.add(d.id); allDevices.push(d); } }); });
  const deviceOpts = allDevices.map(d =>
    `<option value="${d.id}" ${alarmFilterDevice===d.id?'selected':''}>${escapeHTML(d.name || d.id)}</option>`
  ).join('');

  const selClass = 'px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white min-w-[140px]';

  // ===== 查询条件区（参考 SCADA：label 等宽对齐，两行平铺） =====
  const lblClass = 'text-xs text-slate-500 whitespace-nowrap w-[70px] text-right shrink-0';
  const querySection = `
    <table class="w-full mb-6" style="border-spacing:10px 20px;border-collapse:separate;">
      <tr>
        <td class="${lblClass}">${getTrans('alarm_col_station')}:</td>
        <td>
          <select onchange="alarmFilterStation=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})" class="${selClass} w-full">
            <option value="all" ${alarmFilterStation==='all'?'selected':''}>${getTrans('alarm_filter_all')}</option>
            ${stationOpts}
          </select>
        </td>
        <td class="${lblClass}">${getTrans('alarm_col_device')}:</td>
        <td>
          <select onchange="alarmFilterDevice=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})" class="${selClass} w-full">
            <option value="all" ${alarmFilterDevice==='all'?'selected':''}>${getTrans('alarm_filter_all')}</option>
            ${deviceOpts}
          </select>
        </td>
        <td class="${lblClass}">${getTrans('alarm_col_level')}:</td>
        <td>
          <select onchange="alarmFilterSeverity=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})" class="${selClass} w-full">
            <option value="all" ${alarmFilterSeverity==='all'?'selected':''}>${getTrans('alarm_filter_all')}</option>
            <option value="Critical" ${alarmFilterSeverity==='Critical'?'selected':''}>${getTrans('alarm_critical')}</option>
            <option value="Warning" ${alarmFilterSeverity==='Warning'?'selected':''}>${getTrans('alarm_warning')}</option>
          </select>
        </td>
      </tr>
      <tr>
        <td class="${lblClass}">${getTrans('alarm_col_time')}:</td>
        <td>
          <div class="flex items-center gap-2">
            <input type="date" value="${alarmFilterDateFrom}" onchange="alarmFilterDateFrom=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
              class="${selClass} flex-1 dark-date-input" />
            <span class="text-slate-500 text-sm">→</span>
            <input type="date" value="${alarmFilterDateTo}" onchange="alarmFilterDateTo=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
              class="${selClass} flex-1 dark-date-input" />
          </div>
        </td>
        <td colspan="4" class="text-right">
          <div class="flex items-center justify-end gap-2">
            <button onclick="alarmFilterStation='all';alarmFilterDevice='all';alarmFilterSeverity='all';alarmFilterTab='all';alarmFilterDateFrom='';alarmFilterDateTo='';renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
              class="px-5 py-1.5 rounded bg-white/5 border border-white/10 text-sm text-slate-400 hover:text-white transition-colors">${getTrans('alarm_filter_reset')}</button>
            <button onclick="renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
              class="px-5 py-1.5 rounded bg-emerald-500 text-sm font-medium text-white hover:bg-emerald-600 transition-colors">${getTrans('alarm_filter_search')}</button>
          </div>
        </td>
      </tr>
    </table>
  `;

  // ===== 状态 Tab =====
  function tabClass(key) {
    return alarmFilterTab === key
      ? 'px-4 py-2 text-sm font-medium border-b-2 border-emerald-400 text-emerald-400'
      : 'px-4 py-2 text-sm font-medium text-slate-500 hover:text-white transition-colors cursor-pointer';
  }
  const tabBar = `
    <div class="flex items-center justify-between border-b border-white/10 mb-4">
      <div class="flex items-center">
        <span onclick="alarmFilterTab='PENDING';renderAlarmsList(document.getElementById('view-reports'),${isOwner})" class="${tabClass('PENDING')}">${getTrans('status_pending')} (${countPending})</span>
        <span onclick="alarmFilterTab='RESOLVED';renderAlarmsList(document.getElementById('view-reports'),${isOwner})" class="${tabClass('RESOLVED')}">${getTrans('status_resolved')} (${countResolved})</span>
        <span onclick="alarmFilterTab='all';renderAlarmsList(document.getElementById('view-reports'),${isOwner})" class="${tabClass('all')}">${getTrans('alarm_filter_all')} (${countAll})</span>
      </div>
      ${alarmFilterTab === 'PENDING' ? `<button onclick="batchResolveAlarms(${isOwner})" class="px-4 py-1.5 rounded bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 transition-colors mb-1">${getTrans('btn_batch_handle')}</button>` : ''}
      <button onclick="exportAlarmsCSV()" class="px-4 py-1.5 rounded bg-emerald-500 text-xs font-medium text-white hover:bg-emerald-600 transition-colors mb-1">${getTrans('export_csv')}</button>
    </div>
  `;

  // ===== 表格 =====
  const thClass = 'text-left px-4 py-3 text-slate-500 font-medium text-xs tracking-wide whitespace-nowrap';
  const tdClass = 'px-4 py-6 text-sm';

  const rows = allAlarms.map((alarm, i) => {
    const isCritical = alarm.severity === 'Critical';
    const rowBorder = alarm.status === 'ACTIVE' && isCritical ? 'border-l-2 border-l-red-500'
      : alarm.status === 'ACTIVE' ? 'border-l-2 border-l-amber-500'
      : alarm.status === 'ACKNOWLEDGED' ? 'border-l-2 border-l-amber-500/50' : '';

    const severityBadge = isCritical
      ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">${getTrans('alarm_critical')}</span>`
      : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400">${getTrans('alarm_warning')}</span>`;

    let statusBadge = '';
    if (alarm.status === 'ACTIVE') {
      statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 animate-pulse">● ${getTrans('status_active')}</span>`;
    } else if (alarm.status === 'ACKNOWLEDGED') {
      statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400">◉ ${getTrans('status_ack')}</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">✓ ${getTrans('status_resolved')}</span>`;
    }

    // 恢复时间
    const resolvedTime = alarm.status === 'RESOLVED' && alarm.resolved_at ? escapeHTML(alarm.resolved_at) : '-';

    // 建议处理 / Root Cause
    let suggestion = '-';
    if (alarm.root_cause) {
      let causeText = alarm.root_cause;
      causeText = causeText.replace(/^Hardware/, getTrans('cause_hardware')).replace(/^Software/, getTrans('cause_software')).replace(/^Environment/, getTrans('cause_environment'));
      suggestion = `<span class="text-cyan-400 text-xs">${escapeHTML(causeText)}</span>`;
    }

    // 操作：详情 + 处理
    const detailBtn = `<button onclick="showAlarmDetail('${alarm.stationId}','${alarm.id}')" class="px-2 py-1 rounded bg-blue-500/20 text-xs text-blue-400 hover:bg-blue-500/30">${getTrans('btn_detail')}</button>`;
    let handleBtn = '';
    if (alarm.status !== 'RESOLVED') {
      handleBtn = `<button onclick="showResolveModal('${alarm.stationId}','${alarm.id}')" class="px-2 py-1 rounded bg-emerald-500/20 text-xs text-emerald-400 hover:bg-emerald-500/30">${getTrans('btn_handle')}</button>`;
    }
    const actionCol = `<div class="flex items-center justify-end gap-1 flex-nowrap">${detailBtn}${handleBtn}</div>`;

    return `
      <tr class="${i%2===0?'bg-white/[0.01]':''} border-b border-white/5 hover:bg-white/[0.04] transition-colors ${rowBorder}">
        ${alarmFilterTab === 'PENDING' ? `<td class="${tdClass} w-10"><input type="checkbox" class="alarm-checkbox accent-emerald-500" data-station="${alarm.stationId}" data-alarm="${alarm.id}" /></td>` : ''}
        <td class="${tdClass} font-mono text-slate-400 text-xs">${shortTime(alarm.timestamp)}</td>
        <td class="${tdClass} text-slate-300" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;" title="${escapeHTML(resolveAlarmMsg(alarm.message))}">${escapeHTML(resolveAlarmMsg(alarm.message))}</td>
        <td class="${tdClass} text-amber-400 font-mono text-xs whitespace-nowrap">${alarm.fault_code || '-'}</td>
        <td class="${tdClass} whitespace-nowrap">${severityBadge}</td>
        <td class="${tdClass} text-slate-400 font-mono text-xs whitespace-nowrap">${alarm.device_id ? escapeHTML(alarm.device_id) : '-'}</td>
        <td class="${tdClass} text-white text-xs whitespace-nowrap">${escapeHTML(alarm.stationName)}</td>
        <td class="${tdClass} text-cyan-400 text-xs whitespace-nowrap">${calcAlarmDuration(alarm)}</td>
        <td class="${tdClass} whitespace-nowrap">${statusBadge}</td>
        <td class="${tdClass} text-right whitespace-nowrap">${actionCol}</td>
      </tr>
    `;
  }).join('');

  // 空状态
  const emptyState = allAlarms.length === 0 ? `
    <tr><td colspan="9" class="text-center py-16">
      <div class="text-slate-600">
        <p class="text-base mb-1">🛡️ ${getTrans('no_alarms_active')}</p>
        <p class="text-sm">${getTrans('no_alarms_hint')}</p>
      </div>
    </td></tr>
  ` : '';

  container.innerHTML = `
    <div class="">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span class="w-1 h-5 bg-emerald-400 rounded-full"></span>
          ${getTrans('alarm_title')}
        </h2>
      </div>
      ${querySection}
      ${tabBar}
      <div class="bg-white/[0.02] rounded-xl border border-white/10 overflow-x-auto">
        <table class="w-full text-sm table-auto">
          <thead>
            <tr class="border-b border-white/10">
              ${alarmFilterTab === 'PENDING' ? `<th class="${thClass} w-10"><input type="checkbox" onchange="toggleAllAlarmCheckbox(this.checked)" class="accent-emerald-500" /></th>` : ''}
              <th class="${thClass}">${getTrans('alarm_col_time')}</th>
              <th class="${thClass}">${getTrans('alarm_col_desc')}</th>
              <th class="${thClass}">${getTrans('alarm_col_code')}</th>
              <th class="${thClass}">${getTrans('alarm_col_level')}</th>
              <th class="${thClass}">${getTrans('alarm_col_device')}</th>
              <th class="${thClass}">${getTrans('alarm_col_station')}</th>
              <th class="${thClass}">${getTrans('alarm_col_duration')}</th>
              <th class="${thClass}">${getTrans('alarm_col_status')}</th>
              <th class="${thClass} text-right">${getTrans('alarm_col_action')}</th>
            </tr>
          </thead>
          <tbody>${rows || emptyState}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ============ Resolve Modal ============

function toggleAllAlarmCheckbox(checked) {
  document.querySelectorAll('.alarm-checkbox').forEach(cb => cb.checked = checked);
}

function batchResolveAlarms(isOwner) {
  const checked = document.querySelectorAll('.alarm-checkbox:checked');
  if (checked.length === 0) return;
  const items = Array.from(checked).map(cb => ({ stationId: cb.dataset.station, alarmId: cb.dataset.alarm }));
  items.forEach(({ stationId, alarmId }) => {
    const stations = typeof getStationsByRole === 'function' ? getStationsByRole() : [];
    const station = stations.find(s => s.id === stationId);
    if (!station || !station.alarms) return;
    const alarm = station.alarms.find(a => a.id === alarmId);
    if (alarm && alarm.status !== 'RESOLVED') {
      alarm.status = 'RESOLVED';
      alarm.resolved_at = typeof formatLocalTime === 'function' ? formatLocalTime(new Date(), station.timezone || 'Australia/Sydney') : new Date().toLocaleString();
    }
  });
  renderAlarmsList(document.getElementById('view-reports'), isOwner);
}

function showAlarmDetail(stationId, alarmId) {
  const stations = typeof getStationsByRole === 'function' ? getStationsByRole() : [];
  const station = stations.find(s => s.id === stationId);
  if (!station || !station.alarms) return;
  const alarm = station.alarms.find(a => a.id === alarmId);
  if (!alarm) return;

  const existing = document.getElementById('alarm-detail-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'alarm-detail-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const rows = [
    [getTrans('alarm_col_time'), shortTime(alarm.timestamp)],
    [getTrans('alarm_col_station'), alarm.stationName || stationId],
    [getTrans('alarm_col_device'), alarm.device_id || '-'],
    [getTrans('alarm_col_level'), alarm.severity || '-'],
    [getTrans('alarm_col_status'), alarm.status || '-'],
    [getTrans('alarm_col_desc'), resolveAlarmMsg(alarm.message)],
    [getTrans('alarm_col_root_cause'), alarm.root_cause || '-'],
    [getTrans('alarm_col_resolve_time'), alarm.resolved_at ? shortTime(alarm.resolved_at) : '-'],
  ].map(([k, v]) => `<tr><td class="text-slate-500 text-sm py-2 pr-4 whitespace-nowrap align-top">${k}</td><td class="text-white text-sm py-2">${v}</td></tr>`).join('');

  modal.innerHTML = `
    <div class="bg-slate-800 border border-white/10 rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">${getTrans('btn_detail')}</h3>
        <button onclick="document.getElementById('alarm-detail-modal').remove()" class="text-slate-400 hover:text-white text-xl">✕</button>
      </div>
      <table class="w-full">${rows}</table>
    </div>
  `;
  document.body.appendChild(modal);
}

function showResolveModal(stationId, alarmId) {
  // 移除已有 modal
  const existing = document.getElementById('resolve-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'resolve-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-white mb-4">🔧 ${getTrans('alarm_resolve_title')}</h3>
      <div class="space-y-4">
        <div>
          <label class="text-xs text-slate-400 mb-1 block">${getTrans('alarm_resolve_cause')}</label>
          <select id="resolve-cause" class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
            <option value="Hardware">${getTrans('cause_hardware')}</option>
            <option value="Software">${getTrans('cause_software')}</option>
            <option value="Environment" selected>${getTrans('cause_environment')}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-400 mb-1 block">${getTrans('alarm_resolve_note')}</label>
          <input type="text" id="resolve-note" placeholder="" class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600" />
        </div>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button onclick="closeResolveModal()" class="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-400 hover:text-white transition-colors">
          ${getTrans('alarm_resolve_cancel')}
        </button>
        <button onclick="confirmResolve('${stationId}','${alarmId}')" class="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors">
          ✓ ${getTrans('alarm_resolve_confirm')}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeResolveModal() {
  const modal = document.getElementById('resolve-modal');
  if (modal) modal.remove();
}

function confirmResolve(stationId, alarmId) {
  const cause = document.getElementById('resolve-cause')?.value || 'Environment';
  const note = document.getElementById('resolve-note')?.value || '';

  const station = stations.find(s => s.id === stationId);
  if (!station || !station.alarms) return;

  const alarm = station.alarms.find(a => a.id === alarmId);
  if (!alarm || alarm.status === 'RESOLVED') return;

  const role = getCurrentUser();
  alarm.status = 'RESOLVED';
  alarm.resolved_by = role;
  alarm.resolved_at = formatLocalTime(new Date(), station.timezone || 'Australia/Sydney');
  alarm.resolved_ms = Date.now();
  alarm.root_cause = cause + (note ? ' — ' + note : '');

  if (typeof saveStations === 'function') saveStations();
  closeResolveModal();

  const container = document.getElementById('view-reports');
  if (container) {
    const currentRole = getCurrentUser();
    renderAlarmsList(container, currentRole === 'owner');
  }

  if (typeof showToast === 'function') showToast(getTrans('alarm_resolved_success'), 'success');
}

/**
 * 运维确认告警（ACK）
 */
function ackAlarm(stationId, alarmId) {
  const station = stations.find(s => s.id === stationId);
  if (!station || !station.alarms) return;

  const alarm = station.alarms.find(a => a.id === alarmId);
  if (!alarm || alarm.status !== 'ACTIVE') return;

  const role = getCurrentUser();
  alarm.status = 'ACKNOWLEDGED';
  alarm.ack_by = role;
  alarm.ack_at = formatLocalTime(new Date(), station.timezone || 'Australia/Sydney');

  if (typeof saveStations === 'function') saveStations();

  const container = document.getElementById('view-reports');
  if (container) {
    const currentRole = getCurrentUser();
    renderAlarmsList(container, currentRole === 'owner');
  }

  if (typeof showToast === 'function') showToast(getTrans('alarm_ack_success'), 'success');
}

/**
 * 导出告警 CSV
 */
function exportAlarmsCSV() {
  const myStations = getStationsByRole();
  const allAlarms = [];
  myStations.forEach(station => {
    if (!station.alarms) return;
    station.alarms.forEach(alarm => {
      allAlarms.push({ ...alarm, stationName: station.name });
    });
  });

  const rows = [['Station', 'Fault Code', 'Severity', 'Status', 'Device', 'Description', 'Triggered At', 'Duration', 'ACK By', 'ACK At', 'Resolved By', 'Resolved At', 'Root Cause']];
  allAlarms.forEach(a => {
    rows.push([
      a.stationName,
      a.fault_code || '',
      a.severity,
      a.status,
      a.device_id || '',
      resolveAlarmMsg(a.message),
      a.timestamp,
      calcDuration(a),
      a.ack_by ? (typeof getUserName === 'function' ? getUserName(a.ack_by) : a.ack_by) : '',
      a.ack_at || '',
      a.resolved_by ? (typeof getUserName === 'function' ? getUserName(a.resolved_by) : a.resolved_by) : '',
      a.resolved_at || '',
      a.root_cause || ''
    ]);
  });

  downloadCSV(rows, 'au-bess-alarms.csv');
}

// ============ 套利报告 ============

function renderArbitrageReports(container, isOwner) {
  const stations = getStationsByRole();
  
  container.innerHTML = `
    <div class="space-y-6">
      <!-- 标题和控制器 -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <i data-lucide="bar-chart-3" class="w-5 h-5 text-cyan-400"></i>
            ${getTrans('reports_title')}
          </h2>
          <p class="text-sm text-slate-400 mt-1">Peak-valley arbitrage performance analysis</p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="exportArbitrageExcel()" class="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-colors flex items-center gap-2">
            <i data-lucide="download" class="w-4 h-4"></i>
            ${getTrans('reports_export_excel')}
          </button>
        </div>
      </div>

      <!-- 电站选择、时间维度和具体时间 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white/5 border border-white/20 rounded-xl p-4">
          <label class="text-sm text-slate-300 font-medium block mb-2">${getTrans('reports_station_select')}</label>
          <select id="arbitrage-station-select" onchange="updateArbitrageReport()" class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50">
            ${stations.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="bg-white/5 border border-white/20 rounded-xl p-4">
          <label class="text-sm text-slate-300 font-medium block mb-2">${getTrans('reports_period')}</label>
          <select id="arbitrage-period-select" onchange="updatePeriodSelector()" class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50">
            <option value="daily">${getTrans('reports_daily')}</option>
            <option value="monthly">${getTrans('reports_monthly')}</option>
            <option value="yearly">${getTrans('reports_yearly')}</option>
            <option value="cumulative">${getTrans('reports_cumulative')}</option>
          </select>
        </div>
        <div class="bg-white/5 border border-white/20 rounded-xl p-4">
          <label class="text-sm text-slate-300 font-medium block mb-2" id="time-select-label">${getTrans('reports_select_date')}</label>
          <div id="time-selector-container">
            <input type="date" id="daily-picker" value="${new Date().toISOString().split('T')[0]}" onchange="updateArbitrageReport()" class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50">
            <input type="month" id="monthly-picker" value="${new Date().toISOString().slice(0,7)}" onchange="updateArbitrageReport()" class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50 hidden">
            <select id="yearly-picker" onchange="updateArbitrageReport()" class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50 hidden">
              ${Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(year => 
                `<option value="${year}" ${year === new Date().getFullYear() ? 'selected' : ''}>${year}</option>`
              ).join('')}
            </select>
            <div id="cumulative-picker" class="text-sm text-slate-400 py-2 hidden">${getTrans('reports_all_history')}</div>
          </div>
        </div>
      </div>

      <!-- 套利概览卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="arbitrage-summary-cards">
        <!-- Dynamic content will be inserted here -->
      </div>

      <!-- 收益趋势图表 -->
      <div class="bg-white/5 border border-white/20 rounded-xl p-6">
        <h3 class="text-lg font-bold text-white mb-4">${getTrans('reports_trend_chart')}</h3>
        <div id="arbitrage-trend-chart" style="height: 400px;"></div>
      </div>

      <!-- 详细数据表格 -->
      <div class="bg-white/5 border border-white/20 rounded-xl p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white">Arbitrage Cycles Detail</h3>
          <div class="flex items-center gap-2 text-sm text-slate-400">
            <span>${getTrans('reports_vs_previous')}:</span>
            <span id="trend-indicator" class="font-medium">Loading...</span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-white/20">
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_date')}</th>
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_charge_energy')} (MWh)</th>
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_discharge_energy')} (MWh)</th>
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_charge_cost')}</th>
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_discharge_revenue')}</th>
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_net_profit')}</th>
                <th class="text-left text-xs text-slate-400 font-medium py-3 px-2">${getTrans('reports_efficiency')}</th>
              </tr>
            </thead>
            <tbody id="arbitrage-detail-table">
              <!-- Dynamic content will be inserted here -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  
  // 初始化时间选择器和报告数据
  updatePeriodSelector();
}

// 生成套利数据（Demo版本）
function generateArbitrageData(stationId, period, selectedTime) {
  const station = getStation(stationId);
  if (!station) return { summary: {}, cycles: [], chartData: [] };

  let baseDate = new Date();
  let days, dataPoints;
  
  // 根据选择的时间设置基准日期
  if (selectedTime && selectedTime !== 'all') {
    switch (period) {
      case 'daily':
        baseDate = new Date(selectedTime + 'T00:00:00');
        break;
      case 'monthly':
        baseDate = new Date(selectedTime + '-01T00:00:00');
        break;
      case 'yearly':
        baseDate = new Date(selectedTime + '-01-01T00:00:00');
        break;
    }
  }
  
  switch (period) {
    case 'daily':
      days = 1;
      dataPoints = 24; // hourly data for the selected day
      break;
    case 'monthly':
      days = 30;
      dataPoints = 30; // daily data for the selected month
      break;
    case 'yearly':
      days = 365;
      dataPoints = 12; // monthly data for the selected year
      break;
    case 'cumulative':
      days = 730; // 2 years
      dataPoints = 24; // monthly data
      baseDate = new Date(); // Always use current date for cumulative
      break;
    default:
      days = 30;
      dataPoints = 30;
  }

  const cycles = [];
  const chartData = [];
  let totalProfit = 0;
  let totalCycles = 0;
  let totalChargeEnergy = 0;
  let totalDischargeEnergy = 0;
  let totalChargeCost = 0;
  let totalDischargeRevenue = 0;

  // Generate arbitrage cycles based on selected time
  for (let i = 0; i < dataPoints; i++) {
    const date = new Date(baseDate);
    
    if (period === 'daily') {
      // For daily report, show hourly cycles within the selected day
      date.setHours(i);
    } else if (period === 'monthly') {
      // For monthly report, show daily cycles within the selected month
      date.setDate(date.getDate() + i);
    } else if (period === 'yearly') {
      // For yearly report, show monthly cycles within the selected year
      date.setMonth(date.getMonth() + i);
    } else {
      // For cumulative, show monthly cycles going back
      date.setMonth(date.getMonth() - i);
    }

    // Simulate arbitrage cycle
    const chargePrice = 25 + Math.random() * 50; // $25-75/MWh
    const dischargePrice = 180 + Math.random() * 120; // $180-300/MWh
    const chargeEnergy = 8 + Math.random() * 4; // 8-12 MWh
    const dischargeEnergy = chargeEnergy * (0.92 + Math.random() * 0.06); // 92-98% efficiency
    
    const chargeCost = chargeEnergy * chargePrice;
    const dischargeRevenue = dischargeEnergy * dischargePrice;
    const netProfit = dischargeRevenue - chargeCost;
    const efficiency = (dischargeEnergy / chargeEnergy) * 100;
    const spread = dischargePrice - chargePrice;

    const cycle = {
      date: date.toISOString().split('T')[0],
      chargeEnergy: chargeEnergy.toFixed(1),
      dischargeEnergy: dischargeEnergy.toFixed(1),
      chargePrice: chargePrice.toFixed(2),
      dischargePrice: dischargePrice.toFixed(2),
      chargeCost: chargeCost.toFixed(0),
      dischargeRevenue: dischargeRevenue.toFixed(0),
      netProfit: netProfit.toFixed(0),
      efficiency: efficiency.toFixed(1),
      spread: spread.toFixed(2)
    };

    cycles.push(cycle);
    chartData.push({
      date: cycle.date,
      profit: parseFloat(cycle.netProfit),
      cost: parseFloat(cycle.chargeCost),
      revenue: parseFloat(cycle.dischargeRevenue)
    });

    totalProfit += netProfit;
    totalCycles++;
    totalChargeEnergy += chargeEnergy;
    totalDischargeEnergy += dischargeEnergy;
    totalChargeCost += chargeCost;
    totalDischargeRevenue += dischargeRevenue;
  }

  const avgSpread = totalDischargeRevenue > 0 ? ((totalDischargeRevenue - totalChargeCost) / totalDischargeEnergy) : 0;
  const efficiency = totalChargeEnergy > 0 ? (totalDischargeEnergy / totalChargeEnergy) * 100 : 0;

  return {
    summary: {
      totalProfit: totalProfit.toFixed(0),
      totalCycles,
      avgSpread: avgSpread.toFixed(2),
      efficiency: efficiency.toFixed(1),
      totalChargeEnergy: totalChargeEnergy.toFixed(1),
      totalDischargeEnergy: totalDischargeEnergy.toFixed(1),
      totalChargeCost: totalChargeCost.toFixed(0),
      totalDischargeRevenue: totalDischargeRevenue.toFixed(0)
    },
    cycles: cycles.reverse(), // Most recent first
    chartData: chartData.reverse()
  };
}

// 更新时间选择器显示
function updatePeriodSelector() {
  const periodSelect = document.getElementById('arbitrage-period-select');
  const label = document.getElementById('time-select-label');
  const dailyPicker = document.getElementById('daily-picker');
  const monthlyPicker = document.getElementById('monthly-picker');
  const yearlyPicker = document.getElementById('yearly-picker');
  const cumulativePicker = document.getElementById('cumulative-picker');
  
  if (!periodSelect || !label) return;

  const period = periodSelect.value;
  
  // 隐藏所有选择器
  [dailyPicker, monthlyPicker, yearlyPicker, cumulativePicker].forEach(el => {
    if (el) el.classList.add('hidden');
  });

  // 根据周期类型显示对应选择器并更新标签
  switch (period) {
    case 'daily':
      if (dailyPicker) dailyPicker.classList.remove('hidden');
      label.textContent = getTrans('reports_select_date');
      break;
    case 'monthly':
      if (monthlyPicker) monthlyPicker.classList.remove('hidden');
      label.textContent = getTrans('reports_select_month');
      break;
    case 'yearly':
      if (yearlyPicker) yearlyPicker.classList.remove('hidden');
      label.textContent = getTrans('reports_select_year');
      break;
    case 'cumulative':
      if (cumulativePicker) {
        cumulativePicker.classList.remove('hidden');
        cumulativePicker.textContent = getTrans('reports_all_history');
      }
      label.textContent = getTrans('reports_period');
      break;
  }
  
  // 更新报告
  updateArbitrageReport();
}

// 更新套利报告
function updateArbitrageReport() {
  const stationSelect = document.getElementById('arbitrage-station-select');
  const periodSelect = document.getElementById('arbitrage-period-select');
  
  if (!stationSelect || !periodSelect) return;

  const stationId = stationSelect.value;
  const period = periodSelect.value;
  
  // 获取选择的具体时间
  let selectedTime = null;
  switch (period) {
    case 'daily':
      const dailyPicker = document.getElementById('daily-picker');
      selectedTime = dailyPicker ? dailyPicker.value : null;
      break;
    case 'monthly':
      const monthlyPicker = document.getElementById('monthly-picker');
      selectedTime = monthlyPicker ? monthlyPicker.value : null;
      break;
    case 'yearly':
      const yearlyPicker = document.getElementById('yearly-picker');
      selectedTime = yearlyPicker ? yearlyPicker.value : null;
      break;
    case 'cumulative':
      selectedTime = 'all';
      break;
  }
  
  const data = generateArbitrageData(stationId, period, selectedTime);
  
  // Update summary cards
  updateSummaryCards(data.summary);
  
  // Update chart
  renderArbitrageTrendChart(data.chartData, period);
  
  // Update table
  updateDetailTable(data.cycles);
  
  // Update page title to show selected time
  updateReportTitle(period, selectedTime);
}

// 更新报告标题显示选择的时间
function updateReportTitle(period, selectedTime) {
  const titleElement = document.querySelector('h2');
  if (!titleElement || !selectedTime) return;
  
  let timeText = '';
  switch (period) {
    case 'daily':
      timeText = ` - ${selectedTime}`;
      break;
    case 'monthly':
      timeText = ` - ${selectedTime}`;
      break;
    case 'yearly':
      timeText = ` - ${selectedTime}`;
      break;
    case 'cumulative':
      timeText = ` - ${getTrans('reports_all_history')}`;
      break;
  }
  
  const baseTitle = getTrans('reports_title');
  titleElement.innerHTML = `
    <i data-lucide="bar-chart-3" class="w-5 h-5 text-cyan-400"></i>
    ${baseTitle}${timeText}
  `;
  
  if (window.lucide) lucide.createIcons();
}

// 更新汇总卡片
function updateSummaryCards(summary) {
  const container = document.getElementById('arbitrage-summary-cards');
  if (!container) return;

  const cards = [
    {
      label: getTrans('reports_total_profit'),
      value: `A$${summary.totalProfit}`,
      icon: 'dollar-sign',
      color: 'text-emerald-400'
    },
    {
      label: getTrans('reports_total_cycles'),
      value: summary.totalCycles,
      icon: 'repeat',
      color: 'text-cyan-400'
    },
    {
      label: getTrans('reports_avg_spread'),
      value: `$${summary.avgSpread}`,
      icon: 'trending-up',
      color: 'text-amber-400'
    },
    {
      label: getTrans('reports_efficiency'),
      value: `${summary.efficiency}%`,
      icon: 'gauge',
      color: 'text-blue-400'
    }
  ];

  container.innerHTML = cards.map(card => `
    <div class="bg-white/5 border border-white/20 rounded-xl p-4">
      <div class="flex items-center gap-2 mb-2">
        <i data-lucide="${card.icon}" class="w-4 h-4 ${card.color}"></i>
        <span class="text-xs text-slate-400 uppercase tracking-wider">${card.label}</span>
      </div>
      <p class="text-2xl font-bold font-mono ${card.color}">${card.value}</p>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// 渲染趋势图表
function renderArbitrageTrendChart(data, period) {
  const chartContainer = document.getElementById('arbitrage-trend-chart');
  if (!chartContainer || !window.echarts) return;

  // Dispose existing chart
  const existingChart = echarts.getInstanceByDom(chartContainer);
  if (existingChart) {
    existingChart.dispose();
  }

  const chart = echarts.init(chartContainer);
  
  const dates = data.map(d => d.date);
  const profits = data.map(d => d.profit);
  const costs = data.map(d => d.cost);
  const revenues = data.map(d => d.revenue);

  const option = {
    backgroundColor: 'transparent',
    grid: {
      left: 60,
      right: 30,
      top: 60,
      bottom: 60
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11
      },
      axisLine: {
        lineStyle: { color: '#334155' }
      }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Profit (A$)',
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: 'A${value}'
        },
        axisLine: {
          lineStyle: { color: '#334155' }
        },
        splitLine: {
          lineStyle: { color: '#334155', opacity: 0.3 }
        }
      },
      {
        type: 'value',
        name: 'Cost/Revenue (A$)',
        position: 'right',
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: 'A${value}'
        },
        axisLine: {
          lineStyle: { color: '#334155' }
        }
      }
    ],
    legend: {
      data: ['Net Profit', 'Charge Cost', 'Discharge Revenue'],
      textStyle: {
        color: '#94a3b8'
      },
      top: 10
    },
    series: [
      {
        name: 'Net Profit',
        type: 'line',
        data: profits,
        lineStyle: {
          color: '#10b981',
          width: 3
        },
        itemStyle: {
          color: '#10b981'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
            ]
          }
        }
      },
      {
        name: 'Charge Cost',
        type: 'bar',
        yAxisIndex: 1,
        data: costs,
        itemStyle: {
          color: '#ef4444',
          opacity: 0.7
        }
      },
      {
        name: 'Discharge Revenue',
        type: 'bar',
        yAxisIndex: 1,
        data: revenues,
        itemStyle: {
          color: '#3b82f6',
          opacity: 0.7
        }
      }
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: {
        color: '#e2e8f0'
      },
      formatter: function(params) {
        let html = `<div class="text-sm">
          <div class="font-bold mb-2">${params[0].axisValue}</div>`;
        params.forEach(param => {
          html += `<div class="flex items-center gap-2">
            <div style="width:8px;height:8px;background:${param.color};border-radius:50%;"></div>
            <span>${param.seriesName}: A$${param.value}</span>
          </div>`;
        });
        html += '</div>';
        return html;
      }
    }
  };

  chart.setOption(option);

  // Save chart instance for disposal
  window.arbitrageTrendChart = chart;
}

// 更新详细表格
function updateDetailTable(cycles) {
  const tbody = document.getElementById('arbitrage-detail-table');
  if (!tbody) return;

  tbody.innerHTML = cycles.slice(0, 20).map(cycle => {
    const profitColor = parseFloat(cycle.netProfit) >= 0 ? 'text-emerald-400' : 'text-red-400';
    return `
      <tr class="border-b border-white/5 hover:bg-white/[0.02]">
        <td class="py-3 px-2 text-sm text-white font-mono">${cycle.date}</td>
        <td class="py-3 px-2 text-sm text-white font-mono">${cycle.chargeEnergy}</td>
        <td class="py-3 px-2 text-sm text-white font-mono">${cycle.dischargeEnergy}</td>
        <td class="py-3 px-2 text-sm text-red-400 font-mono">A$${cycle.chargeCost}</td>
        <td class="py-3 px-2 text-sm text-emerald-400 font-mono">A$${cycle.dischargeRevenue}</td>
        <td class="py-3 px-2 text-sm ${profitColor} font-mono font-bold">A$${cycle.netProfit}</td>
        <td class="py-3 px-2 text-sm text-slate-300 font-mono">${cycle.efficiency}%</td>
      </tr>
    `;
  }).join('');
}

// 导出Excel功能
function exportArbitrageExcel() {
  const stationSelect = document.getElementById('arbitrage-station-select');
  const periodSelect = document.getElementById('arbitrage-period-select');
  
  if (!stationSelect || !periodSelect) return;

  const stationId = stationSelect.value;
  const period = periodSelect.value;
  const station = getStation(stationId);
  const data = generateArbitrageData(stationId, period);

  const headers = [
    'Date',
    'Charge Energy (MWh)',
    'Discharge Energy (MWh)', 
    'Charge Price ($/MWh)',
    'Discharge Price ($/MWh)',
    'Charge Cost (A$)',
    'Discharge Revenue (A$)',
    'Net Profit (A$)',
    'Efficiency (%)',
    'Spread ($/MWh)'
  ];

  const rows = [headers];
  
  data.cycles.forEach(cycle => {
    rows.push([
      cycle.date,
      cycle.chargeEnergy,
      cycle.dischargeEnergy,
      cycle.chargePrice,
      cycle.dischargePrice,
      cycle.chargeCost,
      cycle.dischargeRevenue,
      cycle.netProfit,
      cycle.efficiency,
      cycle.spread
    ]);
  });

  const filename = `${station ? station.name : 'station'}-arbitrage-${period}-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(rows, filename);
  
  // Show success message
  showToast(`Export completed: ${filename}`, 'success');
}
