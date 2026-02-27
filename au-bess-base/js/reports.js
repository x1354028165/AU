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
  // 使用新的告警系统
  if (typeof AlarmSystem !== 'undefined') {
    const allAlarms = AlarmSystem.generateMockAlarms(50);
    const stats = AlarmSystem.getAlarmStatistics(allAlarms);
    
    container.innerHTML = `
      <div class="container">
        <div class="page-header">
          <h1 class="page-title">故障告警</h1>
          <button onclick="exportAlarmsCSV()" class="btn btn-secondary">导出告警</button>
        </div>
        
        <!-- 告警统计面板 -->
        ${AlarmSystem.renderAlarmStatsPanel(stats)}
        
        <!-- 过滤器 -->
        <div class="filter-section">
          <select id="stationFilter" class="filter-select">
            <option value="">全部电站</option>
            <option value="Hornsdale Power Reserve">Hornsdale Power Reserve</option>
            <option value="Victorian Big Battery">Victorian Big Battery</option>
            <option value="Wallgrove BESS">Wallgrove BESS</option>
          </select>
          
          <select id="levelFilter" class="filter-select">
            <option value="">全部等级</option>
            <option value="danger">危险</option>
            <option value="warning">警告</option>
            <option value="info">信息</option>
          </select>
          
          <select id="statusFilter" class="filter-select">
            <option value="">全部状态</option>
            <option value="unprocessed">未处理</option>
            <option value="processed">已处理</option>
            <option value="recovered">已恢复</option>
          </select>
          
          <div class="filter-actions">
            <button class="btn btn-primary" onclick="applyAlarmFilters()">查询</button>
            <button class="btn btn-secondary" onclick="resetAlarmFilters()">重置</button>
          </div>
        </div>
        
        <!-- 告警列表 -->
        <div class="alarm-list">
          ${allAlarms.map(alarm => AlarmSystem.renderAlarmCard(alarm)).join('')}
        </div>
        
        <!-- 分页 -->
        <div class="pagination-section">
          <div class="pagination-info">显示 1-${Math.min(20, allAlarms.length)} 共 ${allAlarms.length} 条告警</div>
          <div class="pagination-controls">
            <button class="btn btn-sm btn-secondary">上一页</button>
            <span class="badge badge-primary">1</span>
            <button class="btn btn-sm btn-secondary">下一页</button>
          </div>
        </div>
      </div>
    `;
    
    if (window.lucide) lucide.createIcons();
    return;
  }

  // 原有的告警渲染逻辑作为备用
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

// ============ 告警过滤器功能 ============

function applyAlarmFilters() {
  // 获取过滤条件
  const stationFilter = document.getElementById('stationFilter')?.value || '';
  const levelFilter = document.getElementById('levelFilter')?.value || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';
  
  if (typeof AlarmSystem !== 'undefined') {
    // 生成新的告警数据并应用过滤器
    let alarms = AlarmSystem.generateMockAlarms(50);
    
    if (stationFilter) {
      alarms = alarms.filter(alarm => alarm.station === stationFilter);
    }
    if (levelFilter) {
      alarms = alarms.filter(alarm => alarm.level === levelFilter);
    }
    if (statusFilter) {
      alarms = alarms.filter(alarm => alarm.status === statusFilter);
    }
    
    // 更新告警列表
    const alarmList = document.querySelector('.alarm-list');
    if (alarmList) {
      alarmList.innerHTML = alarms.map(alarm => AlarmSystem.renderAlarmCard(alarm)).join('');
    }
    
    // 更新统计
    const stats = AlarmSystem.getAlarmStatistics(alarms);
    // 这里可以更新统计面板，暂时跳过复杂更新逻辑
    
    if (typeof showToast === 'function') {
      showToast('过滤器已应用', 'success');
    }
  }
}

function resetAlarmFilters() {
  // 重置所有过滤器
  const stationFilter = document.getElementById('stationFilter');
  const levelFilter = document.getElementById('levelFilter');
  const statusFilter = document.getElementById('statusFilter');
  
  if (stationFilter) stationFilter.selectedIndex = 0;
  if (levelFilter) levelFilter.selectedIndex = 0;
  if (statusFilter) statusFilter.selectedIndex = 0;
  
  // 重新加载告警列表
  applyAlarmFilters();
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
    <style>
      /* 借鉴002.html的精美样式 */
      .time-selector-module {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
        padding: 4px;
        background: var(--color-bg-card);
        border-radius: 24px;
        border: 1px solid var(--color-border);
      }
      .time-pill {
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 18px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        white-space: nowrap;
      }
      .time-pill:hover:not(.active) {
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.8);
      }
      .time-pill.active {
        background: #00ff88;
        color: #000;
        border-color: #00ff88;
        box-shadow: 0 4px 12px rgba(0,255,136,0.3);
        font-weight: 600;
      }
      .time-input {
        background: transparent;
        border: 1px solid var(--color-border);
        color: var(--color-text);
        padding: 8px 12px;
        border-radius: 16px;
        font-size: 14px;
        min-width: 150px;
        margin-left: 8px;
        transition: all 0.3s ease;
      }
      .refresh-btn {
        background: transparent;
        border: 1px solid var(--color-border);
        color: var(--color-text);
        padding: 8px 12px;
        border-radius: 16px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.3s;
        white-space: nowrap;
        margin-left: 8px;
      }
      .refresh-btn:hover {
        background: rgba(255,255,255,0.05);
      }

      /* 页面视图切换标签 */
      .page-view-tabs {
        display: inline-flex;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 4px;
        gap: 4px;
      }
      .page-tab {
        position: relative;
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .page-tab:hover:not(.active) {
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.8);
      }
      .page-tab.active {
        background: #00ff88;
        color: #000;
        border-color: #00ff88;
        box-shadow: 0 4px 12px rgba(0,255,136,0.3);
        font-weight: 600;
      }

      /* 统计卡片 */
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 20px;
        margin-bottom: 48px;
      }
      .stat-card {
        padding: 24px;
        text-align: center;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        position: relative;
        overflow: hidden;
        background: var(--color-bg-card);
        border: 1px solid var(--color-border);
        border-radius: 12px;
      }
      .stat-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      }
      .stat-label {
        color: var(--color-text-secondary);
        font-size: 14px;
        font-weight: 400;
        margin-bottom: 12px;
      }
      .stat-value {
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 8px;
        color: var(--color-text);
        letter-spacing: -0.5px;
      }
      .stat-unit {
        font-size: 16px;
        font-weight: 400;
        color: var(--color-text-secondary);
        margin-left: 4px;
      }
      .stat-change {
        font-size: 13px;
        color: var(--color-success);
        font-weight: 400;
      }
      .stat-change.negative {
        color: var(--color-danger);
      }
      .profit-positive {
        color: #00ff88;
      }
      .profit-negative {
        color: #ff6b6b;
      }

      /* 图表容器 */
      .chart-container {
        padding: 24px;
        min-height: 400px;
        position: relative;
        background: var(--color-bg-card);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        margin-bottom: 32px;
      }
      .chart-title {
        font-size: 18px;
        font-weight: 500;
        color: var(--color-text);
        margin-bottom: 24px;
      }

      /* 表格样式 */
      .table-container {
        padding: 24px;
        background: var(--color-bg-card);
        border: 1px solid var(--color-border);
        border-radius: 12px;
      }
      .table-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--color-border);
      }
      .table-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--color-text);
      }
      .export-btn {
        padding: 8px 16px;
        background: transparent;
        border: 1px solid #00ff88;
        border-radius: 6px;
        color: #00ff88;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      .export-btn:hover {
        background: #00ff88;
        color: #000;
        transform: translateY(-1px);
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        color: var(--color-text);
        min-width: 900px;
      }
      .data-table th {
        background: var(--color-bg);
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--color-border);
        white-space: nowrap;
        font-size: 13px;
      }
      .data-table td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--color-border);
        transition: background-color 0.2s ease;
        white-space: nowrap;
      }
      .data-table tr:hover {
        background: var(--color-bg);
      }

      @media (max-width: 1200px) {
        .stats-grid {
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
      }
      @media (max-width: 768px) {
        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
      }
      @media (max-width: 480px) {
        .stats-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="container">
      <!-- 页面标题和视图切换 -->
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 36px;">
        <h1 class="page-title" style="font-size: 48px; font-weight: 500; color: var(--color-text); margin: 0; letter-spacing: -2px;">${getTrans('reports_title')}</h1>
        <div class="page-view-tabs">
          <button class="page-tab active" onclick="switchReportViewMode('chart', this)">📊 <span>${getTrans('reports_chart_view') || '图表视图'}</span></button>
          <button class="page-tab" onclick="switchReportViewMode('table', this)">📋 <span>${getTrans('reports_table_view') || '表格视图'}</span></button>
        </div>
      </div>

      <!-- 查询条件：电站选择 + 时间选择 -->
      <div class="time-selector-module">
        <select id="arbitrage-station-select" class="time-input" onchange="updateArbitrageReport()" style="min-width:200px;margin-right:8px;margin-left:0;">
          ${stations.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
        <button class="time-pill active" onclick="switchTimePeriod('daily', this)">${getTrans('reports_daily')}</button>
        <button class="time-pill" onclick="switchTimePeriod('monthly', this)">${getTrans('reports_monthly')}</button>
        <button class="time-pill" onclick="switchTimePeriod('yearly', this)">${getTrans('reports_yearly')}</button>
        <button class="time-pill" onclick="switchTimePeriod('cumulative', this)">${getTrans('reports_cumulative')}</button>
        <div style="position: relative; display: inline-block; min-width: 150px;">
          <span id="timeSelectorDisplay" style="display: block; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 16px; font-size: 14px; color: var(--color-text); background: transparent; pointer-events: none; white-space: nowrap;">${new Date().toISOString().split('T')[0]}</span>
          <input type="date" id="timeSelector" class="time-input" value="${new Date().toISOString().split('T')[0]}" onchange="handleTimeInputChange()" style="position: absolute !important; top: 0; left: 0; width: 100% !important; height: 100% !important; opacity: 0 !important; cursor: pointer; min-width: unset !important; margin: 0 !important; padding: 0 !important; border: none !important;">
        </div>
        <button class="refresh-btn" onclick="refreshReportData()">🔄 <span>${getTrans('reports_refresh') || '刷新'}</span></button>
      </div>

      <!-- 5个核心指标 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">${getTrans('reports_charge_energy') || '充电量'}</div>
          <div class="stat-value" id="statCharge">2.45<span class="stat-unit">MWh</span></div>
          <div class="stat-change" id="changeCharge"><span class="compare-text">${getTrans('reports_vs_previous') || '比昨日'}</span> ↑ 0.18 MWh</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${getTrans('reports_discharge_energy') || '放电量'}</div>
          <div class="stat-value" id="statDischarge">2.18<span class="stat-unit">MWh</span></div>
          <div class="stat-change" id="changeDischarge"><span class="compare-text">${getTrans('reports_vs_previous') || '比昨日'}</span> ↑ 0.15 MWh</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${getTrans('reports_avg_buy_price') || '充电均价'}</div>
          <div class="stat-value" id="statAvgBuyPrice">$44<span class="stat-unit">/MWh</span></div>
          <div class="stat-change" id="changeAvgBuyPrice"><span class="compare-text">${getTrans('reports_vs_previous') || '比昨日'}</span> ↓ $3</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${getTrans('reports_avg_sell_price') || '放电均价'}</div>
          <div class="stat-value" id="statAvgSellPrice">$240<span class="stat-unit">/MWh</span></div>
          <div class="stat-change" id="changeAvgSellPrice"><span class="compare-text">${getTrans('reports_vs_previous') || '比昨日'}</span> ↑ $12</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${getTrans('reports_net_profit') || '净利润'}</div>
          <div class="stat-value profit-positive" id="statNetProfit">$415</div>
          <div class="stat-change" id="changeNetProfit"><span class="compare-text">${getTrans('reports_vs_previous') || '比昨日'}</span> ↑ $57</div>
        </div>
      </div>

      <!-- 图表视图 -->
      <div id="chartViewContent">
        <div class="chart-container">
          <div class="chart-title" id="chartTitle">${getTrans('reports_trend_chart') || '充放电量 & 累计净利润'}</div>
          <div id="arbitrage-trend-chart" style="width:100%;height:calc(100vh - 380px);min-height:400px;"></div>
        </div>
      </div>

      <!-- 表格视图 -->
      <div id="tableViewContent" style="display:none;">
        <div class="table-container">
          <div class="table-header">
            <div class="table-title" id="tableTitle">${getTrans('reports_detail_title') || '套利明细'}</div>
            <div class="table-controls">
              <button class="export-btn" onclick="exportArbitrageExcel()">📥 <span>${getTrans('reports_export_excel') || '导出数据'}</span></button>
            </div>
          </div>
          <div style="overflow-x: auto; width: 100%;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${getTrans('reports_period') || '时段'}</th>
                  <th>${getTrans('reports_charge_energy')} (MWh)</th>
                  <th>${getTrans('reports_discharge_energy')} (MWh)</th>
                  <th>${getTrans('reports_avg_buy_price')} ($/MWh)</th>
                  <th>${getTrans('reports_avg_sell_price')} ($/MWh)</th>
                  <th>${getTrans('reports_charge_cost')} ($)</th>
                  <th>${getTrans('reports_discharge_revenue')} ($)</th>
                  <th>${getTrans('reports_net_profit')} ($)</th>
                </tr>
              </thead>
              <tbody id="arbitrage-detail-table">
                <!-- Dynamic content will be inserted here -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // 初始化报告系统
  initializeArbitrageReports();
}

// ========== 全局变量 ==========
let currentReportViewMode = 'chart'; // 'chart' | 'table'
let currentTimePeriod = 'daily'; // 'daily' | 'monthly' | 'yearly' | 'cumulative' 
let currentSelectedTime = new Date().toISOString().split('T')[0];
let currentStationId = null;
let sharedReportData = { rows: [], totals: {} }; // 统一数据源
let arbitrageTrendChart = null;

// 真实峰谷套利权重分布（基于澳洲NEM市场规律）
const hourlyChargeWeight = [0.08,0.08,0.09,0.09,0.08,0.06,0.04,0.02,0.01,0.01,0.01,0.01,0.01,0.02,0.02,0.03,0.03,0.03,0.04,0.04,0.05,0.05,0.06,0.07];
const hourlyDischargeWeight = [0.01,0.01,0.01,0.01,0.01,0.01,0.02,0.03,0.04,0.04,0.03,0.03,0.03,0.04,0.05,0.06,0.08,0.09,0.09,0.08,0.06,0.05,0.04,0.02];
const monthlyWeight = [0.07,0.07,0.08,0.08,0.08,0.09,0.10,0.10,0.09,0.08,0.08,0.08];

// 基础数据配置（模拟不同时间周期的套利规模，确保放电量符合电池效率）
const periodBaseData = {
  daily: { charge: 12, discharge: 11.4, buyPrice: 45, sellPrice: 240 }, // 95%效率
  monthly: { charge: 320, discharge: 304, buyPrice: 48, sellPrice: 235 }, // 95%效率  
  yearly: { charge: 3800, discharge: 3610, buyPrice: 50, sellPrice: 245 }, // 95%效率
  cumulative: { charge: 12000, discharge: 11400, buyPrice: 52, sellPrice: 250 } // 95%效率
};

// 电站系数（不同电站规模不同）
const stationMultipliers = {
  'st_01': 1.0,   // Adelaide 5MW 基准
  'st_02': 0.8,   // Perth 4MW
  'st_03': 1.2    // Brisbane 6MW
};

// ========== 初始化函数 ==========
function initializeArbitrageReports() {
  const stations = getStationsByRole();
  currentStationId = stations.length > 0 ? stations[0].id : 'st_01';
  
  // 设置时间显示
  updateTimeSelectorDisplay();
  
  // 生成初始数据
  generateSharedReportData();
  
  // 更新界面
  updateReportStats();
  refreshReportCharts();
  
  // 设置CSS变量
  document.documentElement.style.setProperty('--color-bg-card', 'rgba(255,255,255,0.05)');
  document.documentElement.style.setProperty('--color-border', 'rgba(255,255,255,0.1)');
  document.documentElement.style.setProperty('--color-text', '#ffffff');
  document.documentElement.style.setProperty('--color-text-secondary', 'rgba(255,255,255,0.6)');
  document.documentElement.style.setProperty('--color-success', '#00ff88');
  document.documentElement.style.setProperty('--color-danger', '#ff6b6b');
  document.documentElement.style.setProperty('--color-bg', 'rgba(0,0,0,0.3)');
}

// ========== 视图模式切换 ==========
function switchReportViewMode(mode, buttonEl) {
  currentReportViewMode = mode;
  
  // 更新按钮状态
  document.querySelectorAll('.page-tab').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');
  
  // 切换视图
  const chartView = document.getElementById('chartViewContent');
  const tableView = document.getElementById('tableViewContent');
  
  if (mode === 'chart') {
    chartView.style.display = 'block';
    tableView.style.display = 'none';
    setTimeout(() => refreshReportCharts(), 100);
  } else {
    chartView.style.display = 'none';
    tableView.style.display = 'block';
    refreshReportTable();
  }
}

// ========== 时间周期切换 ==========
function switchTimePeriod(period, buttonEl) {
  currentTimePeriod = period;
  
  // 更新按钮状态
  document.querySelectorAll('.time-pill').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');
  
  // 更新时间选择器
  updateTimeSelectorDisplay();
  
  // 刷新数据
  refreshReportData();
}

// ========== 时间选择器更新 ==========
function updateTimeSelectorDisplay() {
  const display = document.getElementById('timeSelectorDisplay');
  const input = document.getElementById('timeSelector');
  
  if (!display || !input) return;
  
  let displayText = '';
  let inputType = 'date';
  let inputValue = currentSelectedTime;
  
  switch (currentTimePeriod) {
    case 'daily':
      displayText = currentSelectedTime;
      inputType = 'date';
      break;
    case 'monthly':
      inputValue = currentSelectedTime.slice(0, 7);
      displayText = inputValue;
      inputType = 'month';
      break;
    case 'yearly':
      inputValue = currentSelectedTime.slice(0, 4);
      displayText = inputValue;
      inputType = 'number';
      break;
    case 'cumulative':
      displayText = getTrans('reports_all_history') || '全部历史数据';
      input.style.display = 'none';
      display.style.pointerEvents = 'none';
      display.style.opacity = '0.6';
      return;
  }
  
  display.textContent = displayText;
  input.type = inputType;
  input.value = inputValue;
  input.style.display = 'block';
  display.style.pointerEvents = 'auto';
  display.style.opacity = '1';
}

function handleTimeInputChange() {
  const input = document.getElementById('timeSelector');
  const display = document.getElementById('timeSelectorDisplay');
  
  if (!input || !display) return;
  
  currentSelectedTime = input.value || new Date().toISOString().split('T')[0];
  
  switch (currentTimePeriod) {
    case 'daily':
      display.textContent = currentSelectedTime;
      break;
    case 'monthly':
      display.textContent = currentSelectedTime.slice(0, 7);
      break;
    case 'yearly':
      display.textContent = currentSelectedTime.slice(0, 4);
      break;
  }
  
  refreshReportData();
}

// ========== 数据刷新 ==========
function refreshReportData() {
  generateSharedReportData();
  updateReportStats();
  
  if (currentReportViewMode === 'chart') {
    refreshReportCharts();
  } else {
    refreshReportTable();
  }
}

function updateArbitrageReport() {
  const stationSelect = document.getElementById('arbitrage-station-select');
  if (stationSelect) {
    currentStationId = stationSelect.value;
  }
  refreshReportData();
}

// ========== 统一数据源生成 ==========
function generateSharedReportData() {
  const base = periodBaseData[currentTimePeriod];
  const multiplier = stationMultipliers[currentStationId] || 1.0;
  const totalCharge = base.charge * multiplier;
  const totalDischarge = base.discharge * multiplier;
  
  let labels, chargeWeights, dischargeWeights;
  
  // 根据时间周期生成标签和权重
  if (currentTimePeriod === 'daily') {
    labels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    chargeWeights = hourlyChargeWeight;
    dischargeWeights = hourlyDischargeWeight;
  } else if (currentTimePeriod === 'monthly') {
    const daysInMonth = 30;
    labels = Array.from({length: daysInMonth}, (_, i) => `${(i + 1).toString().padStart(2, '0')}日`);
    const weight = 1 / daysInMonth;
    chargeWeights = Array(daysInMonth).fill(weight);
    dischargeWeights = Array(daysInMonth).fill(weight);
  } else if (currentTimePeriod === 'yearly') {
    labels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    chargeWeights = monthlyWeight;
    dischargeWeights = monthlyWeight;
  } else { // cumulative
    labels = ['2021', '2022', '2023', '2024', '2025'];
    chargeWeights = [0.12, 0.16, 0.20, 0.24, 0.28];
    dischargeWeights = [0.12, 0.16, 0.20, 0.24, 0.28];
  }
  
  // 生成详细数据行（确保充放电严格平衡）
  const rows = [];
  let totalChargeActual = 0;
  let totalDischargeActual = 0;
  
  // 第一轮：生成基础数据
  const tempRows = [];
  labels.forEach((label, idx) => {
    const charge = +(totalCharge * chargeWeights[idx] * (0.85 + Math.random() * 0.3)).toFixed(2);
    const discharge = +(totalDischarge * dischargeWeights[idx] * (0.85 + Math.random() * 0.3)).toFixed(2);
    totalChargeActual += charge;
    totalDischargeActual += discharge;
    tempRows.push({ label, idx, charge, discharge });
  });
  
  // 第二轮：最简单的精确平衡 - 每行放电量 = 充电量 × 95%
  tempRows.forEach(row => {
    const charge = row.charge;
    const discharge = +(charge * 0.95).toFixed(2); // 严格95%效率
    const idx = row.idx;
    const label = row.label;
    
    // 价格计算（考虑时间段差异）
    let avgBuyPrice, avgSellPrice;
    if (currentTimePeriod === 'daily') {
      const hour = idx;
      const buyVariation = hour < 6 ? 0.6 + Math.random() * 0.3 : hour > 16 ? 1.0 + Math.random() * 0.3 : 0.8 + Math.random() * 0.3;
      const sellVariation = hour < 6 ? 0.5 + Math.random() * 0.3 : hour > 16 ? 1.1 + Math.random() * 0.4 : 0.8 + Math.random() * 0.3;
      avgBuyPrice = +(base.buyPrice * buyVariation).toFixed(1);
      avgSellPrice = +(base.sellPrice * sellVariation).toFixed(1);
    } else {
      avgBuyPrice = +(base.buyPrice * (0.85 + Math.random() * 0.3)).toFixed(1);
      avgSellPrice = +(base.sellPrice * (0.85 + Math.random() * 0.3)).toFixed(1);
    }
    
    const chargeCost = Math.round(charge * avgBuyPrice);
    const dischargeRevenue = Math.round(discharge * avgSellPrice);
    const netProfit = dischargeRevenue - chargeCost;
    
    rows.push({
      timeLabel: label,
      charge,
      discharge,
      avgBuyPrice,
      avgSellPrice,
      chargeCost,
      dischargeRevenue,
      netProfit
    });
  });
  
  // 计算汇总数据
  const totals = rows.reduce((sum, row) => ({
    charge: sum.charge + row.charge,
    discharge: sum.discharge + row.discharge,
    cost: sum.cost + row.chargeCost,
    revenue: sum.revenue + row.dischargeRevenue,
    profit: sum.profit + row.netProfit
  }), { charge: 0, discharge: 0, cost: 0, revenue: 0, profit: 0 });
  
  totals.avgBuyPrice = totals.charge > 0 ? +(totals.cost / totals.charge).toFixed(1) : base.buyPrice;
  totals.avgSellPrice = totals.discharge > 0 ? +(totals.revenue / totals.discharge).toFixed(1) : base.sellPrice;
  
  sharedReportData = { rows, totals };
}

// ========== 统计指标更新 ==========
function updateReportStats() {
  const totals = sharedReportData.totals;
  
  // 更新指标卡片
  document.getElementById('statCharge').innerHTML = `${totals.charge.toFixed(1)}<span class="stat-unit">MWh</span>`;
  document.getElementById('statDischarge').innerHTML = `${totals.discharge.toFixed(1)}<span class="stat-unit">MWh</span>`;
  document.getElementById('statAvgBuyPrice').innerHTML = `$${Math.round(totals.avgBuyPrice)}<span class="stat-unit">/MWh</span>`;
  document.getElementById('statAvgSellPrice').innerHTML = `$${Math.round(totals.avgSellPrice)}<span class="stat-unit">/MWh</span>`;
  
  const profitEl = document.getElementById('statNetProfit');
  profitEl.textContent = '$' + totals.profit.toLocaleString();
  profitEl.className = 'stat-value ' + (totals.profit >= 0 ? 'profit-positive' : 'profit-negative');
  
  // 更新比较文字
  const compareTexts = {
    daily: getTrans('reports_vs_yesterday') || '比昨日',
    monthly: getTrans('reports_vs_last_month') || '比上月',
    yearly: getTrans('reports_vs_last_year') || '比去年',
    cumulative: ''
  };
  
  document.querySelectorAll('.compare-text').forEach(el => {
    el.textContent = compareTexts[currentTimePeriod] || '';
  });
  
  // 隐藏累计报告的变化指示
  document.querySelectorAll('.stat-change').forEach(el => {
    el.style.display = currentTimePeriod === 'cumulative' ? 'none' : 'block';
  });
}

// ========== 图表渲染 ==========
function refreshReportCharts() {
  if (currentReportViewMode === 'chart') {
    setTimeout(() => initArbitrageTrendChart(), 100);
  }
}

function initArbitrageTrendChart() {
  const dom = document.getElementById('arbitrage-trend-chart');
  if (!dom) return;
  
  if (arbitrageTrendChart) {
    arbitrageTrendChart.dispose();
  }
  arbitrageTrendChart = echarts.init(dom);
  
  const rows = sharedReportData.rows;
  if (!rows.length) return;
  
  const labels = rows.map(r => r.timeLabel);
  const chargeData = rows.map(r => r.charge);
  const dischargeData = rows.map(r => r.discharge);
  
  // 累计净利润计算
  let cumulative = 0;
  const cumulativeProfitData = rows.map(r => {
    cumulative += r.netProfit;
    return Math.round(cumulative);
  });
  
  const titleEl = document.getElementById('chartTitle');
  if (titleEl) {
    const stationName = getStation(currentStationId)?.name || 'Station';
    titleEl.textContent = `${stationName} — ${getTrans('reports_charge_discharge') || '充放电量'} & ${getTrans('reports_cumulative_profit') || '累计净利润'}`;
  }
  
  const rotateLabel = labels.length > 15;
  
  const option = {
    tooltip: {
      backgroundColor: 'rgba(0,0,0,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff' },
      trigger: 'axis',
      formatter: params => {
        let html = `<div style="font-weight:600;margin-bottom:6px;">${params[0].axisValue}</div>`;
        params.forEach(item => {
          if (item.seriesName.includes('累计')) {
            html += `${item.marker} ${item.seriesName}: <b>$${item.value.toLocaleString()}</b><br/>`;
          } else {
            html += `${item.marker} ${item.seriesName}: <b>${item.value} MWh</b><br/>`;
          }
        });
        return html;
      }
    },
    legend: {
      data: [getTrans('reports_charge_energy') || '充电量', getTrans('reports_discharge_energy') || '放电量', getTrans('reports_cumulative_profit') || '累计净利润'],
      textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
      top: 0,
      itemGap: 24
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: rotateLabel ? '12%' : '5%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: rotateLabel ? 10 : 12,
        rotate: rotateLabel ? 45 : 0
      }
    },
    yAxis: [
      {
        type: 'value',
        name: 'MWh',
        nameTextStyle: { color: 'rgba(255,255,255,0.6)' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisLabel: { color: 'rgba(255,255,255,0.6)' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } }
      },
      {
        type: 'value',
        name: '$',
        nameTextStyle: { color: 'rgba(255,255,255,0.6)' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        axisLabel: {
          color: 'rgba(255,255,255,0.6)',
          formatter: value => '$' + value.toLocaleString()
        },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: getTrans('reports_charge_energy') || '充电量',
        type: 'bar',
        yAxisIndex: 0,
        data: chargeData,
        barGap: '15%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#1e7fff' },
            { offset: 1, color: 'rgba(30,127,255,0.2)' }
          ]),
          borderRadius: [3, 3, 0, 0]
        }
      },
      {
        name: getTrans('reports_discharge_energy') || '放电量',
        type: 'bar',
        yAxisIndex: 0,
        data: dischargeData,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#00ff88' },
            { offset: 1, color: 'rgba(0,255,136,0.2)' }
          ]),
          borderRadius: [3, 3, 0, 0]
        }
      },
      {
        name: getTrans('reports_cumulative_profit') || '累计净利润',
        type: 'line',
        yAxisIndex: 1,
        data: cumulativeProfitData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#ffd700', width: 2.5 },
        itemStyle: { color: '#ffd700', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255,215,0,0.25)' },
            { offset: 1, color: 'rgba(255,215,0,0.02)' }
          ])
        }
      }
    ]
  };
  
  arbitrageTrendChart.setOption(option);
}

// ========== 表格渲染 ==========
function refreshReportTable() {
  const tbody = document.getElementById('arbitrage-detail-table');
  if (!tbody) return;
  
  const rows = sharedReportData.rows;
  
  tbody.innerHTML = rows.map(row => {
    const profitClass = row.netProfit >= 0 ? 'profit-positive' : 'profit-negative';
    return `
      <tr>
        <td>${row.timeLabel}</td>
        <td>${row.charge}</td>
        <td>${row.discharge}</td>
        <td>$${row.avgBuyPrice}</td>
        <td>$${row.avgSellPrice}</td>
        <td>$${row.chargeCost.toLocaleString()}</td>
        <td>$${row.dischargeRevenue.toLocaleString()}</td>
        <td class="${profitClass}">$${row.netProfit.toLocaleString()}</td>
      </tr>
    `;
  }).join('');
  
  // 更新表格标题
  const titleEl = document.getElementById('tableTitle');
  if (titleEl) {
    const stationName = getStation(currentStationId)?.name || 'Station';
    titleEl.textContent = `${stationName} — ${getTrans('reports_detail_title') || '套利明细'}`;
  }
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

// 改进的导出Excel功能（基于002.html的专业实现）
function exportArbitrageExcel() {
  const station = getStation(currentStationId);
  const stationName = station ? station.name : 'Station';
  
  // 准备表头（支持多语言）
  const headers = [
    getTrans('reports_period') || '时段',
    getTrans('reports_charge_energy') + ' (MWh)' || '充电量 (MWh)',
    getTrans('reports_discharge_energy') + ' (MWh)' || '放电量 (MWh)',
    getTrans('reports_avg_buy_price') + ' ($/MWh)' || '充电均价 ($/MWh)',
    getTrans('reports_avg_sell_price') + ' ($/MWh)' || '放电均价 ($/MWh)',
    getTrans('reports_charge_cost') + ' ($)' || '充电成本 ($)',
    getTrans('reports_discharge_revenue') + ' ($)' || '放电收益 ($)',
    getTrans('reports_net_profit') + ' ($)' || '净利润 ($)'
  ];
  
  // 创建CSV内容（添加BOM支持中文）
  let csvContent = '\uFEFF' + headers.join(',') + '\n';
  
  // 添加数据行
  sharedReportData.rows.forEach(row => {
    const csvRow = [
      row.timeLabel,
      row.charge,
      row.discharge,
      row.avgBuyPrice,
      row.avgSellPrice,
      row.chargeCost,
      row.dischargeRevenue,
      row.netProfit
    ].map(cell => {
      const str = String(cell);
      // 如果包含逗号或引号，需要用引号包围并转义
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',');
    
    csvContent += csvRow + '\n';
  });
  
  // 添加汇总行
  const totals = sharedReportData.totals;
  const summaryRow = [
    getTrans('reports_total') || '合计',
    totals.charge.toFixed(2),
    totals.discharge.toFixed(2),
    totals.avgBuyPrice.toFixed(1),
    totals.avgSellPrice.toFixed(1),
    totals.cost,
    totals.revenue,
    totals.profit
  ].join(',');
  csvContent += summaryRow + '\n';
  
  // 创建下载链接
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  // 生成文件名
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const periodText = {
    daily: getTrans('reports_daily') || '日报',
    monthly: getTrans('reports_monthly') || '月报', 
    yearly: getTrans('reports_yearly') || '年报',
    cumulative: getTrans('reports_cumulative') || '累计'
  }[currentTimePeriod];
  
  const filename = `${stationName}-${periodText}-${currentSelectedTime}-${timestamp}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 显示成功消息
  const message = getTrans('export_success') || `导出成功：${filename}`;
  if (typeof showToast === 'function') {
    showToast(message, 'success');
  } else {
    alert(message);
  }
}
