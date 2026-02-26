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
