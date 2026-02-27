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
    <div class="max-w-[1600px] mx-auto">
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
    <div class="max-w-[1600px] mx-auto">
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
    <div class="max-w-[1600px] mx-auto">
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

// ============ 告警管理（3 阶段状态机 + 过滤器 + Resolve Modal）============

// 过滤器状态
let alarmFilterSearch = '';
let alarmFilterSeverity = 'all';
let alarmFilterStatus = 'all';

/**
 * 解析时间戳（剥离城市后缀后转 Date）
 */
function parseAlarmTime(timeStr) {
  if (!timeStr) return null;
  // 剥离 " (Sydney)" 等城市后缀
  const cleaned = String(timeStr).replace(/\s*\(.*\)\s*$/, '');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 计算持续时长（优先用 _ms 毫秒字段，兜底用字符串解析）
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
    if (!endMs) {
      const parsed = parseAlarmTime(alarm.resolved_at);
      endMs = parsed ? parsed.getTime() : Date.now();
    }
  } else {
    endMs = Date.now();
  }

  const diffMin = Math.round((endMs - startMs) / 60000);
  if (diffMin < 1) return '<1m';
  if (diffMin < 60) return diffMin + 'm';
  const hours = (diffMin / 60).toFixed(1);
  return hours + 'h';
}

/**
 * 渲染告警列表（带过滤器）
 */
function renderAlarmsList(container, isOwner) {
  const myStations = getStationsByRole();

  // 收集所有告警并关联电站信息
  let allAlarms = [];
  myStations.forEach(station => {
    if (!station.alarms) station.alarms = [];
    station.alarms.forEach(alarm => {
      allAlarms.push({ ...alarm, stationId: station.id, stationName: station.name });
    });
  });

  // 应用过滤器
  if (alarmFilterSearch) {
    const q = alarmFilterSearch.toLowerCase();
    allAlarms = allAlarms.filter(a =>
      a.message.toLowerCase().includes(q) ||
      a.stationName.toLowerCase().includes(q) ||
      (a.fault_code && a.fault_code.toLowerCase().includes(q)) ||
      (a.device_id && a.device_id.toLowerCase().includes(q)) ||
      (a.root_cause && a.root_cause.toLowerCase().includes(q))
    );
  }
  if (alarmFilterSeverity !== 'all') {
    allAlarms = allAlarms.filter(a => a.severity === alarmFilterSeverity);
  }
  if (alarmFilterStatus !== 'all') {
    allAlarms = allAlarms.filter(a => a.status === alarmFilterStatus);
  }

  // 排序
  const statusOrder = { 'ACTIVE': 0, 'ACKNOWLEDGED': 1, 'RESOLVED': 2 };
  allAlarms.sort((a, b) => {
    const sa = statusOrder[a.status] ?? 9;
    const sb = statusOrder[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.severity !== b.severity) return a.severity === 'Critical' ? -1 : 1;
    return (b.created_ms || 0) - (a.created_ms || 0);
  });

  const totalAlarms = [];
  myStations.forEach(s => { if (s.alarms) s.alarms.forEach(a => totalAlarms.push(a)); });
  const unresolvedCount = totalAlarms.filter(a => a.status !== 'RESOLVED').length;

  // 过滤器 Bar
  const filterBar = `
    <div class="flex flex-wrap items-center gap-3 mb-4 p-3 bg-white/[0.03] rounded-xl border border-white/10">
      <input type="text" id="alarm-search" placeholder="${getTrans('alarm_filter_search')}" value="${escapeHTML(alarmFilterSearch)}"
        oninput="alarmFilterSearch=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
        class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 w-48" />
      <select id="alarm-severity-filter" onchange="alarmFilterSeverity=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
        class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
        <option value="all" ${alarmFilterSeverity==='all'?'selected':''}>${getTrans('alarm_filter_all')} ${getTrans('alarm_col_level')}</option>
        <option value="Critical" ${alarmFilterSeverity==='Critical'?'selected':''}>${getTrans('alarm_critical')}</option>
        <option value="Warning" ${alarmFilterSeverity==='Warning'?'selected':''}>${getTrans('alarm_warning')}</option>
      </select>
      <select id="alarm-status-filter" onchange="alarmFilterStatus=this.value;renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
        class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
        <option value="all" ${alarmFilterStatus==='all'?'selected':''}>${getTrans('alarm_filter_all')} ${getTrans('alarm_col_status')}</option>
        <option value="ACTIVE" ${alarmFilterStatus==='ACTIVE'?'selected':''}>${getTrans('status_active')}</option>
        <option value="ACKNOWLEDGED" ${alarmFilterStatus==='ACKNOWLEDGED'?'selected':''}>${getTrans('status_ack')}</option>
        <option value="RESOLVED" ${alarmFilterStatus==='RESOLVED'?'selected':''}>${getTrans('status_resolved')}</option>
      </select>
      <button onclick="alarmFilterSearch='';alarmFilterSeverity='all';alarmFilterStatus='all';renderAlarmsList(document.getElementById('view-reports'),${isOwner})"
        class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400 hover:text-white transition-colors">
        ↻ ${getTrans('alarm_filter_reset')}
      </button>
      <button onclick="exportAlarmsCSV()"
        class="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400 hover:text-white transition-colors ml-auto">
        📥 ${getTrans('export_csv')}
      </button>
    </div>
  `;

  // 空状态
  if (allAlarms.length === 0) {
    container.innerHTML = `
      <div class="max-w-[1600px] mx-auto">
        <div class="flex items-center gap-3 mb-6">
          <h2 class="text-xl font-bold text-white">⚠️ ${getTrans('alarm_title')}
            ${unresolvedCount > 0 ? `<span class="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">${unresolvedCount} Open</span>` : ''}
          </h2>
        </div>
        ${filterBar}
        <div class="flex flex-col items-center justify-center py-16 text-slate-500">
          <p class="text-base">🛡️ ${getTrans('no_alarms_active')}</p>
          <p class="text-sm mt-1">${getTrans('no_alarms_hint')}</p>
        </div>
      </div>
    `;
    return;
  }

  // 卡片渲染
  const cards = allAlarms.map(alarm => {
    const isCritical = alarm.severity === 'Critical';
    const levelBadge = isCritical
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">● ${getTrans('alarm_critical')}</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400">▲ ${getTrans('alarm_warning')}</span>`;

    let statusBadge = '';
    if (alarm.status === 'ACTIVE') {
      statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 animate-pulse">● ${getTrans('status_active')}</span>`;
    } else if (alarm.status === 'ACKNOWLEDGED') {
      statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400">◉ ${getTrans('status_ack')}</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">✓ ${getTrans('status_resolved')}</span>`;
    }

    // 操作按钮
    let actionBtn = '';
    if (alarm.status === 'ACTIVE') {
      actionBtn = isOwner
        ? `<button onclick="showResolveModal('${alarm.stationId}','${alarm.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors">✓ ${getTrans('btn_resolve')}</button>`
        : `<button onclick="ackAlarm('${alarm.stationId}','${alarm.id}')" class="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors">◉ ${getTrans('btn_ack')}</button>`;
    } else if (alarm.status === 'ACKNOWLEDGED') {
      actionBtn = isOwner
        ? `<button onclick="showResolveModal('${alarm.stationId}','${alarm.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors">✓ ${getTrans('btn_resolve')}</button>`
        : `<span class="px-2 py-1 rounded text-xs text-amber-400 bg-amber-500/10">${getTrans('awaiting_resolve')}</span>`;
    }

    const borderColor = alarm.status === 'ACTIVE' && isCritical ? 'border-l-red-500'
      : alarm.status === 'ACTIVE' ? 'border-l-amber-500'
      : alarm.status === 'ACKNOWLEDGED' ? 'border-l-amber-500/50'
      : 'border-l-emerald-500/30';

    const duration = calcDuration(alarm);

    // 审计
    const auditItems = [];
    if (alarm.ack_by && alarm.status !== 'ACTIVE') {
      const ackName = typeof getUserName === 'function' ? getUserName(alarm.ack_by) : alarm.ack_by;
      auditItems.push(`<span class="text-amber-500/70">◉ Ack'd by ${escapeHTML(ackName)}</span>`);
    }
    if (alarm.resolved_by && alarm.status === 'RESOLVED') {
      const resName = typeof getUserName === 'function' ? getUserName(alarm.resolved_by) : alarm.resolved_by;
      auditItems.push(`<span class="text-emerald-500/70">✓ Fixed by ${escapeHTML(resName)}</span>`);
    }
    if (alarm.root_cause) {
      auditItems.push(`<span class="text-cyan-500/70">⚙ ${escapeHTML(alarm.root_cause)}</span>`);
    }

    return `
      <div class="rounded-xl bg-white/[0.03] border border-white/10 border-l-4 ${borderColor} p-4 hover:bg-white/[0.05] transition-colors">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="text-white font-semibold text-sm">${escapeHTML(alarm.stationName)}</h4>
            ${levelBadge} ${statusBadge}
            ${alarm.fault_code ? `<span class="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono text-slate-400">${escapeHTML(alarm.fault_code)}</span>` : ''}
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-500 font-mono">⏱ ${duration}</span>
            ${actionBtn}
          </div>
        </div>
        <p class="text-slate-300 text-sm">${escapeHTML(alarm.message)}</p>
        <div class="flex flex-wrap items-center gap-3 mt-2 text-[11px]">
          <span class="text-slate-500 font-mono">${escapeHTML(alarm.timestamp)}</span>
          ${alarm.device_id ? `<span class="text-slate-600">📟 ${escapeHTML(alarm.device_id)}</span>` : ''}
          ${auditItems.map(a => a).join(' · ')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="max-w-[1600px] mx-auto">
      <div class="flex items-center gap-3 mb-4">
        <h2 class="text-xl font-bold text-white">⚠️ ${getTrans('alarm_title')}
          ${unresolvedCount > 0 ? `<span class="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">${unresolvedCount} Open</span>` : `<span class="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400">All Clear</span>`}
        </h2>
        <p class="text-sm text-slate-400">${isOwner ? getTrans('alarm_hint_owner') : getTrans('alarm_hint_operator')}</p>
      </div>
      ${filterBar}
      <div class="space-y-3">${cards}</div>
    </div>
  `;
}

// ============ Resolve Modal ============

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
      a.message,
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
