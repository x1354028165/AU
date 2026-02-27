/**
 * charts.js - ECharts 实时电价与功率图表
 * Phase 2: 澳洲储能电站管理平台
 */

let marketChart = null;

/**
 * 初始化图表
 */
function initChart() {
  const container = document.getElementById('market-chart');
  if (!container) return;

  marketChart = echarts.init(container, 'dark');

  const option = {
    backgroundColor: 'transparent',
    grid: {
      top: 60,
      right: 60,
      bottom: 30,
      left: 60,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: [getTrans('market_price'), getTrans('power_output')],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 5,
      right: 10
    },
    xAxis: {
      type: 'category',
      data: [],
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { show: false }
    },
    yAxis: [
      {
        type: 'value',
        name: '$/MWh',
        nameTextStyle: { color: '#fbbf24', fontSize: 10 },
        axisLabel: { color: '#fbbf24', fontSize: 10, formatter: '${value}' },
        axisLine: { lineStyle: { color: '#fbbf24' } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
      },
      {
        type: 'value',
        name: 'MW',
        nameTextStyle: { color: '#34d399', fontSize: 10 },
        axisLabel: { color: '#34d399', fontSize: 10 },
        axisLine: { lineStyle: { color: '#34d399' } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: getTrans('market_price'),
        type: 'line',
        yAxisIndex: 0,
        data: [],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#fbbf24', width: 2 },
        itemStyle: { color: '#fbbf24' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(251, 191, 36, 0.15)' },
              { offset: 1, color: 'rgba(251, 191, 36, 0)' }
            ]
          }
        }
      },
      {
        name: getTrans('power_output'),
        type: 'bar',
        yAxisIndex: 1,
        data: [],
        barWidth: '40%',
        itemStyle: {
          color: function(params) {
            return params.value >= 0 ? '#34d399' : '#60a5fa';
          },
          borderRadius: [2, 2, 0, 0]
        }
      }
    ]
  };

  marketChart.setOption(option);

  // 响应式
  window.addEventListener('resize', () => {
    if (marketChart) marketChart.resize();
  });
}

/**
 * 更新图表数据
 * @param {Array} history - priceHistory 数组
 */
function updateChart(history) {
  if (!marketChart) return;

  const times = history.map(h => h.time);
  const prices = history.map(h => h.price);

  // 合计所有电站的功率（用于柱状图）
  const totalPowers = history.map(h => {
    return Object.values(h.powers).reduce((sum, p) => sum + p, 0);
  });

  marketChart.setOption({
    legend: {
      data: [getTrans('market_price'), getTrans('power_output')]
    },
    xAxis: { data: times },
    series: [
      {
        name: getTrans('market_price'),
        data: prices
      },
      {
        name: getTrans('power_output'),
        data: totalPowers.map(p => Math.round(p * 100) / 100)
      }
    ]
  });
}

/**
 * 销毁图表
 */
function disposeChart() {
  if (marketChart) {
    marketChart.dispose();
    marketChart = null;
  }
}

// ============ SoH 趋势图 ============

let sohChart = null;

/**
 * 初始化 SoH 30天趋势图
 */
function initSohChart() {
  const container = document.getElementById('soh-chart');
  if (!container) return;

  if (sohChart) sohChart.dispose();
  sohChart = echarts.init(container, 'dark');

  const colors = ['#fbbf24', '#34d399', '#60a5fa', '#f87171'];

  // 生成 30 天模拟数据：从当前 SoH 倒推
  const days = 30;
  const dates = [];
  const now = new Date();
  const langTag = getLang() === 'zh' ? 'zh-CN' : 'en-AU';
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString(langTag, { month: 'short', day: 'numeric' }));
  }

  const series = stations.map((station, idx) => {
    const currentSoh = station.soh;
    const data = [];
    // 倒推：每天衰减约 0.001-0.003%（随机波动）
    let soh = currentSoh;
    const dailyLoss = (100 - currentSoh) / days; // 平均日损耗
    const values = [currentSoh];

    for (let i = 1; i <= days; i++) {
      const noise = (Math.random() - 0.3) * 0.002;
      soh = currentSoh + (dailyLoss + noise) * i;
      values.unshift(Math.min(100, soh));
    }

    return {
      name: station.name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: colors[idx % colors.length], width: 2 },
      itemStyle: { color: colors[idx % colors.length] },
      data: values.map(v => Math.round(v * 10000) / 10000)
    };
  });

  const option = {
    backgroundColor: 'transparent',
    grid: { top: 50, right: 30, bottom: 30, left: 60, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: function(params) {
        let html = `<div class="font-mono">${params[0].axisValue}</div>`;
        params.forEach(p => {
          html += `<div style="color:${p.color}">${p.seriesName}: ${p.value.toFixed(4)}%</div>`;
        });
        return html;
      }
    },
    legend: {
      data: stations.map(s => s.name),
      textStyle: { color: '#94a3b8', fontSize: 11 },
      top: 5
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } }
    },
    yAxis: {
      type: 'value',
      name: 'SoH %',
      min: 99.5,
      max: 100.0,
      nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      axisLabel: {
        color: '#94a3b8', fontSize: 10,
        formatter: v => v.toFixed(2) + '%'
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
    },
    series: series
  };

  sohChart.setOption(option);
  window.addEventListener('resize', () => { if (sohChart) sohChart.resize(); });
}

function disposeSohChart() {
  if (sohChart) { sohChart.dispose(); sohChart = null; }
}
