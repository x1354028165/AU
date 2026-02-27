/**
 * simulator.js - 5 分钟电价仿真与自动套利引擎
 * Phase 2: 澳洲储能电站管理平台
 *
 * 模拟 AEMO NEM 现货电价，每 5 秒代表 5 分钟
 */

// ============ 物理常数 ============
const MAX_MW = 2.5;    // 额定功率 MW
const MAX_MWH = 10;    // 额定容量 MWh

// ============ AEMO 真实数据 ============
let aemoPriceData = null;     // 从 data/aemo_prices.json 加载
let aemoPriceIndex = 0;       // 当前回放位置
const AEMO_REGION = 'SA1';   // 南澳（储能电站所在区域，价格波动最大）

async function loadAemoPrices() {
  try {
    const resp = await fetch('data/aemo_prices.json?v=' + Date.now());
    const data = await resp.json();
    aemoPriceData = data.regions[AEMO_REGION] || data.regions['NSW1'] || [];
    aemoPriceIndex = 0;
    console.log(`[AEMO] Loaded ${aemoPriceData.length} real price points for ${AEMO_REGION}`);
  } catch (e) {
    console.warn('[AEMO] Failed to load real prices, falling back to simulation', e);
    aemoPriceData = null;
  }
}

/**
 * 获取下一个 AEMO 真实价格（循环回放），没有则降级到模拟
 */
function getNextAemoPrice() {
  // 优先用 AEMO 真实数据
  if (aemoEnabled && aemoData && aemoData.price) {
    return aemoData.price;
  }
  // fallback 旧逻辑
  if (typeof aemoPriceData !== 'undefined' && aemoPriceData && aemoPriceData.length > 0) {
    const pt = aemoPriceData[aemoPriceIndex % aemoPriceData.length];
    aemoPriceIndex++;
    return pt.price;
  }
  return null;
}

// ============ 今日交易累计 ============
let todayBuyMWh = 0;
let todaySellMWh = 0;
let todayBuyCost = 0;    // A$
let todaySellRevenue = 0; // A$
let todayLastDate = new Date().toDateString();

function recordTrade(type, mwh, price) {
  // 每天零点重置
  const today = new Date().toDateString();
  if (today !== todayLastDate) {
    todayBuyMWh = 0; todaySellMWh = 0;
    todayBuyCost = 0; todaySellRevenue = 0;
    todayLastDate = today;
  }
  const cost = mwh * price / 1000; // $/MWh * MWh / 1000 = k$? 不，price 是 $/MWh
  if (type === 'buy') {
    todayBuyMWh += mwh;
    todayBuyCost += mwh * price;
  } else {
    todaySellMWh += mwh;
    todaySellRevenue += mwh * price;
  }
}

function getTodayTradesSummary() {
  const profit = todaySellRevenue - todayBuyCost;
  const margin = todaySellRevenue > 0 ? (profit / todaySellRevenue * 100) : 0;
  return {
    totalBuyQty: todayBuyMWh.toFixed(1),
    totalSellQty: todaySellMWh.toFixed(1),
    totalBuyCost: todayBuyCost.toFixed(0),
    totalSellRevenue: todaySellRevenue.toFixed(0),
    profit: profit.toFixed(0),
    margin: margin.toFixed(1)
  };
}

// ============ AEMO 真实数据 ============
let aemoData = null;       // { price, demand, forecast_price, forecast_demand, timestamp }
let aemoEnabled = false;   // 是否成功拉到 AEMO 数据
const AEMO_API = window.location.protocol + '//' + window.location.hostname + ':8081/api/aemo/nsw1';
const AEMO_POLL_INTERVAL = 60 * 1000; // 每60秒轮询一次

async function fetchAEMOData() {
  try {
    const res = await fetch(AEMO_API, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.price && data.price > 0 && data.price < 20000) {
      aemoData = data;
      aemoEnabled = true;
      console.log('[AEMO] Live data:', data.price, '$/MWh, demand:', data.demand, 'MW');
    }
  } catch (e) {
    console.warn('[AEMO] Falling back to simulation:', e.message);
    aemoEnabled = false;
  }
}

// 启动 AEMO 轮询
fetchAEMOData();
setInterval(fetchAEMOData, AEMO_POLL_INTERVAL);

// ============ 仿真状态 ============
let simTime = new Date();
let simInterval = null;
let currentPrice = 100;   // $/MWh
let previousPrice = 100;  // 上一轮电价（用于平滑）
let forecastPrice = 100;  // 预测电价（平滑虚线）
let prevForecast = 100;   // 上一轮预测价（移动平均用）
let priceHistory = [];     // [{time, price, forecast, powers: {st_01: MW, ...}}]
const MAX_HISTORY = 12;    // 保留 1 小时（12 × 5 分钟）
const SMOOTHING_FACTOR = 0.3;
const FORECAST_SMOOTH = 0.4;  // 预测线平滑系数
let dispatchLogs = [];         // [{time, stationName, stationId, operatorId, action, price, revenue}]
const MAX_LOGS = 100;
let previousStationStatus = {}; // 记录上一轮状态用于检测变化

// ============ 24 小时预测曲线 & 最优计划 ============
let forecast24h = [];          // 288 个 5 分钟预测点 [{tick, hour, min, price}]
let optimalPlan = { charge: [], discharge: [] };  // {charge: [tickIndex], discharge: [tickIndex]}
let planTickCounter = 0;       // 计划刷新计数器（每 6 tick = 30 分钟刷新一次）
let currentTickIndex = 0;      // 当前在 288 tick 中的位置

/**
 * 生成 24 小时预测曲线（288 个 5 分钟点）
 */
function generate24hForecast() {
  forecast24h = [];
  const now = new Date();
  const baseHour = now.getHours();
  const baseMin = now.getMinutes();

  for (let i = 0; i < 288; i++) {
    const totalMin = baseHour * 60 + baseMin + i * 5;
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const rawPrice = generatePrice(h);
    // 平滑：越远的点噪声越大
    const distanceFactor = 1 + (i / 288) * 0.3;
    const noise = (Math.random() - 0.5) * 40 * distanceFactor;
    forecast24h.push({
      tick: i,
      hour: h,
      min: m,
      price: Math.max(-50, rawPrice + noise)
    });
  }
  // 3 点移动平均平滑
  for (let i = 1; i < forecast24h.length - 1; i++) {
    forecast24h[i].price = (forecast24h[i - 1].price + forecast24h[i].price + forecast24h[i + 1].price) / 3;
  }
}

/**
 * 从 288 点中选出最优充放电计划
 * 充电：最便宜的 48 个点（4 小时）
 * 放电：最贵的 48 个点（4 小时）
 */
function computeOptimalPlan() {
  if (forecast24h.length === 0) generate24hForecast();

  const sorted = forecast24h.map((p, i) => ({ ...p, idx: i })).sort((a, b) => a.price - b.price);
  const chargeSlots = sorted.slice(0, 48).map(p => p.idx);
  const dischargeSlots = sorted.slice(-48).map(p => p.idx);

  optimalPlan = {
    charge: new Set(chargeSlots),
    discharge: new Set(dischargeSlots),
    avgCharge: sorted.slice(0, 48).reduce((s, p) => s + p.price, 0) / 48,
    avgDischarge: sorted.slice(-48).reduce((s, p) => s + p.price, 0) / 48
  };

  // 计算预期周期利润
  const spread = optimalPlan.avgDischarge - optimalPlan.avgCharge;
  optimalPlan.projectedCycleProfit = Math.round(spread * MAX_MWH * 0.88 * 100) / 100; // 88% 效率

  // 找下一个动作
  for (let i = currentTickIndex; i < 288; i++) {
    if (optimalPlan.discharge.has(i)) {
      const pt = forecast24h[i];
      optimalPlan.nextDischargeTime = `${String(pt.hour).padStart(2, '0')}:${String(pt.min).padStart(2, '0')}`;
      break;
    }
  }
  for (let i = currentTickIndex; i < 288; i++) {
    if (optimalPlan.charge.has(i)) {
      const pt = forecast24h[i];
      optimalPlan.nextChargeTime = `${String(pt.hour).padStart(2, '0')}:${String(pt.min).padStart(2, '0')}`;
      break;
    }
  }
}

// ============ 电价模型 ============

/**
 * 根据小时生成模拟电价（AEMO NEM 风格）
 * @param {number} hour - 0-23
 * @returns {number} $/MWh
 */
function generatePrice(hour) {
  let base, range;

  if (hour >= 0 && hour < 6) {
    // 凌晨低谷：$20-$80，偶尔负电价
    base = 20; range = 60;
    if (Math.random() < 0.05) return -(Math.random() * 30).toFixed(2) * 1; // 5% 负电价
  } else if (hour >= 6 && hour < 15) {
    // 白天光伏：$50-$200
    base = 50; range = 150;
  } else if (hour >= 15 && hour < 20) {
    // 傍晚高峰：$200-$800
    base = 200; range = 600;
    // 1% 概率触发尖峰
    if (Math.random() < 0.01) {
      return 5000 + Math.random() * 10000;
    }
  } else {
    // 晚间：$80-$150
    base = 80; range = 70;
  }

  // 加随机波动
  const noise = (Math.random() - 0.5) * range * 0.3;
  return Math.max(-50, base + Math.random() * range + noise);
}

// ============ 解析容量 ============

/**
 * 从容量字符串解析 MW 和 MWh
 * @param {string} capStr - 如 '5MW/10MWh'
 * @returns {{mw: number, mwh: number}}
 */
function parseCapacity(capStr) {
  const match = capStr.match(/([\d.]+)MW\/([\d.]+)MWh/);
  if (!match) return { mw: 5, mwh: 10 };
  return { mw: parseFloat(match[1]), mwh: parseFloat(match[2]) };
}

/**
 * 获取电站的物理容量（优先设备真实参数，降级到名义容量）
 * @param {object} station - 电站对象
 * @returns {{mw: number, mwh: number}}
 */
function getPhysicalCapacity(station) {
  if (station.devices && station.devices.length > 0) {
    const primary = station.devices.find(d => d.type === 'PCS') || station.devices.find(d => d.type === 'BMS');
    if (primary && primary.rated_power > 0 && primary.rated_capacity > 0) {
      return { mw: primary.rated_power, mwh: primary.rated_capacity };
    }
  }
  return parseCapacity(station.capacity);
}

// ============ 套利引擎 ============

/**
 * 对单个电站执行一轮套利决策
 * @param {object} station - 电站对象
 * @param {number} price - 当前电价 $/MWh
 * @returns {{power: number, revenue: number}} power>0 放电, <0 充电, 0 待机
 */
function runAutoBidder(station, price) {
  if (station.operator_id === 'unassigned') {
    station.status = 'IDLE';
    return { power: 0, revenue: 0 };
  }

  const cap = getPhysicalCapacity(station);
  const intervalHours = 5 / 60; // 5 分钟 = 1/12 小时
  const strat = station.strategy || { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' };
  const minSoc = Math.max(5, strat.reserve_soc || 5);
  let power = 0;
  let revenue = 0;
  let energyMWh = 0;

  // 手动模式优先
  if (strat.mode === 'manual_charge') {
    if (station.soc < 95) {
      power = -cap.mw;
      energyMWh = cap.mw * intervalHours;
      station.soc = Math.min(95, station.soc + (energyMWh / cap.mwh) * 100);
      station.status = 'CHARGING';
      revenue = -(energyMWh * price);
    } else {
      station.status = 'IDLE';
    }
  } else if (strat.mode === 'manual_discharge') {
    if (station.soc > minSoc) {
      power = cap.mw;
      energyMWh = cap.mw * intervalHours;
      station.soc = Math.max(minSoc, station.soc - (energyMWh / cap.mwh) * 100);
      station.status = 'DISCHARGING';
      revenue = energyMWh * price * station.efficiency;
    } else {
      station.status = 'IDLE';
    }
  } else if (strat.mode === 'manual_idle') {
    station.status = 'IDLE';
  } else {
    // Auto 模式：最优路径规划驱动
    const inChargeSlot = optimalPlan.charge && optimalPlan.charge.has(currentTickIndex);
    const inDischargeSlot = optimalPlan.discharge && optimalPlan.discharge.has(currentTickIndex);

    // 负电价强制充电（优先级最高）
    if (price < 0 && station.soc < 95) {
      power = -cap.mw;
      energyMWh = cap.mw * intervalHours;
      station.soc = Math.min(95, station.soc + (energyMWh / cap.mwh) * 100);
      station.status = 'CHARGING';
      revenue = -(energyMWh * price);
    } else if (inChargeSlot && station.soc < 95) {
      // 最优计划：充电时段
      power = -cap.mw;
      energyMWh = cap.mw * intervalHours;
      station.soc = Math.min(95, station.soc + (energyMWh / cap.mwh) * 100);
      station.status = 'CHARGING';
      revenue = -(energyMWh * price);
    } else if (inDischargeSlot && station.soc > minSoc) {
      // 最优计划：放电时段 — 5 档分段功率控制
      const avgPeak = optimalPlan.avgDischarge || 300;
      const priceRatio = price / avgPeak;
      let powerRatio;
      if (priceRatio < 0.3) { powerRatio = 0.2; }        // 0.5MW 试探
      else if (priceRatio < 0.5) { powerRatio = 0.4; }    // 1.0MW
      else if (priceRatio < 0.8) { powerRatio = 0.6; }    // 1.5MW
      else if (priceRatio < 1.0) { powerRatio = 0.8; }    // 2.0MW
      else { powerRatio = 1.0; }                           // 2.5MW 满功率
      const actualMW = cap.mw * powerRatio;
      power = actualMW;
      energyMWh = actualMW * intervalHours;
      station.soc = Math.max(minSoc, station.soc - (energyMWh / cap.mwh) * 100);
      station.status = 'DISCHARGING';
      revenue = energyMWh * price * station.efficiency;
    } else {
      station.status = 'IDLE';
      // FCAS 待机收益
      if (station.soc >= 20 && station.soc <= 80) {
        station.fcas_revenue = (station.fcas_revenue || 0) + 0.5;
        station.revenue_today = (station.revenue_today || 0) + 0.5;
      }
    }

    // 下一动作预告
    station.nextAction = optimalPlan.nextDischargeTime
      ? { action: 'discharge', time: optimalPlan.nextDischargeTime }
      : (optimalPlan.nextChargeTime ? { action: 'charge', time: optimalPlan.nextChargeTime } : null);

    // 周期收益预估
    station.projected_profit = optimalPlan.projectedCycleProfit || 0;
  }

  // SoH 损耗
  if (energyMWh > 0) {
    station.cumulative_mwh = (station.cumulative_mwh || 0) + energyMWh;
    station.soh = Math.max(0, station.soh - energyMWh * 0.001);
  }

  station.revenue_today = (station.revenue_today || 0) + revenue;
  // 记录今日交易
  if (energyMWh > 0) {
    if (revenue < 0) {
      recordTrade('buy', energyMWh, currentPrice);
    } else if (revenue > 0) {
      recordTrade('sell', energyMWh, currentPrice);
    }
  }
  return { power, revenue };
}

// ============ 仿真主循环 ============

/**
 * 执行一轮仿真 tick
 */
function simTick() {
  // 最优计划刷新：每 6 tick（30 分钟）或首次
  planTickCounter++;
  currentTickIndex = (currentTickIndex + 1) % 288;
  if (planTickCounter >= 6 || forecast24h.length === 0) {
    generate24hForecast();
    computeOptimalPlan();
    planTickCounter = 0;
  }

  const hour = new Date().getHours();

  // 优先使用 AEMO 真实价格
  const aemoPrice = getNextAemoPrice();
  let rawPrice;
  if (aemoPrice !== null) {
    rawPrice = aemoPrice;
  } else {
    rawPrice = generatePrice(hour);
  }

  // 平滑处理：新价格 = 旧价格 × (1-α) + 原始新价格 × α
  // 尖峰价格（>$3000）不平滑，保持冲击力
  if (rawPrice > 3000) {
    currentPrice = rawPrice;
  } else {
    currentPrice = previousPrice * (1 - SMOOTHING_FACTOR) + rawPrice * SMOOTHING_FACTOR;
  }
  previousPrice = currentPrice;

  // 预测价格：优先从 24h 预测曲线取下一个点，保持一致性
  if (forecast24h.length > 0 && currentTickIndex + 1 < forecast24h.length) {
    forecastPrice = forecast24h[currentTickIndex + 1].price;
  } else {
    const trendBias = (currentPrice - previousPrice) * 0.5;
    const noise = (Math.random() - 0.5) * 30;
    const rawForecast = currentPrice + trendBias + noise;
    forecastPrice = prevForecast * (1 - FORECAST_SMOOTH) + rawForecast * FORECAST_SMOOTH;
  }
  prevForecast = forecastPrice;

  const powers = {};

  // 对所有已分配的电站执行套利
  // 尖峰时强制触发放电判断（绕过普通阈值）
  const isSpike = currentPrice > 3000;

  const timeStr = new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  stations.forEach(station => {
    const prevStatus = previousStationStatus[station.id] || 'IDLE';

    if (station.operator_id !== 'unassigned') {
      if (isSpike && station.soc > 5) {
        // 尖峰强制放电
        const cap = getPhysicalCapacity(station);
        const intervalHours = 5 / 60;
        const energyMWh = cap.mw * intervalHours;
        const socDecrease = (energyMWh / cap.mwh) * 100;
        station.soc = Math.max(5, station.soc - socDecrease);
        station.status = 'DISCHARGING';
        const revenue = energyMWh * currentPrice * station.efficiency;
        station.revenue_today = (station.revenue_today || 0) + revenue;
        station.cumulative_mwh = (station.cumulative_mwh || 0) + energyMWh;
        station.soh = Math.max(0, station.soh - energyMWh * 0.001);
        powers[station.id] = cap.mw;

        // 尖峰日志（始终记录）
        logDispatch(timeStr, station, 'SPIKE_DISCHARGE', currentPrice, revenue);
      } else {
        const result = runAutoBidder(station, currentPrice);
        powers[station.id] = result.power;

        // 状态变化时记录日志
        if (station.status !== prevStatus) {
          logDispatch(timeStr, station, station.status, currentPrice, result.revenue);
        }
      }
    } else {
      powers[station.id] = 0;
    }

    previousStationStatus[station.id] = station.status;
  });

  // 动态告警检查（归口 I/O，仅在有新告警时写一次 localStorage）
  let needSave = false;
  stations.forEach(station => {
    if (checkAndTriggerAlarms(station, currentPrice)) needSave = true;
  });
  if (needSave && typeof saveStations === 'function') saveStations();

  // 记录历史
  priceHistory.push({
    time: new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    price: Math.round(currentPrice * 100) / 100,
    forecast: Math.round(forecastPrice * 100) / 100,
    powers: { ...powers }
  });

  // 保留最近 1 小时
  if (priceHistory.length > MAX_HISTORY) {
    priceHistory.shift();
  }

  // 触发 UI 更新
  if (typeof onSimUpdate === 'function') {
    onSimUpdate(currentPrice, priceHistory);
  }
}

// ============ 仿真控制 ============

/**
 * 启动仿真（每 5 秒一个 tick）
 */
async function startSimulator() {
  if (simInterval) return;
  // 加载 AEMO 真实数据
  await loadAemoPrices();
  // 立即执行一次
  simTick();
  simInterval = setInterval(simTick, 5000);
}

/**
 * 停止仿真
 */
function stopSimulator() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

/**
 * 获取当前电价
 */
function getCurrentPrice() {
  return currentPrice;
}

/**
 * 获取预测电价
 */
function getForecastPrice() {
  return forecastPrice;
}

/**
 * 获取价格历史
 */
function getPriceHistory() {
  return priceHistory;
}

/**
 * 判断是否处于尖峰状态
 */
function isPriceSpike() {
  return currentPrice > 5000;
}

// ============ 调度日志 ============

/**
 * 记录一条调度日志
 */
function logDispatch(time, station, action, price, revenue) {
  // 纯运维口径：只记录时间、电站、动作、买/卖价、瞬时利润
  const buyPrice = action === 'CHARGING' ? price : null;
  const sellPrice = action === 'DISCHARGING' || action === 'SPIKE_DISCHARGE' ? price : null;
  const spreadProfit = sellPrice ? Math.round((revenue || 0) * 100) / 100 : (buyPrice ? Math.round((revenue || 0) * 100) / 100 : 0);

  dispatchLogs.push({
    time,
    stationName: station.name,
    stationId: station.id,
    operatorId: station.operator_id,
    action,
    buyPrice: buyPrice ? Math.round(buyPrice * 100) / 100 : null,
    sellPrice: sellPrice ? Math.round(sellPrice * 100) / 100 : null,
    spreadProfit
  });
  if (dispatchLogs.length > MAX_LOGS) dispatchLogs.shift();
}

/**
 * 获取调度日志（可选按 operatorId 过滤）
 * @param {string} [operatorId] - 过滤条件
 * @returns {Array}
 */
function getDispatchLogs(operatorId) {
  if (operatorId) {
    return dispatchLogs.filter(l => l.operatorId === operatorId);
  }
  return [...dispatchLogs];
}

// ============ AI 决策引擎状态 ============

let aiDecisionState = {
  status: 'analyzing',        // analyzing | price_drop | price_rise | spike_watch | optimizing | executing | fcas
  priceTrend: 'stable',       // rising | falling | stable | spike
  forecastDirection: 'stable', // up | down | stable
  socState: 'mid',            // low | mid | high
  plannedAction: 'hold',      // charge | discharge | hold | fcas
  executeTime: '--:--',
  targetSoc: 50,
  powerLevel: 0,              // MW
  confidence: 'medium',       // high | medium | low
  cycleProfit: 0,
  todayProfit: 0,
  avgSpread: 0,
  lastUpdated: null,
  updateCountdown: 30,
  thinkingPhase: 0,           // 0-5 animation phase for "thinking" effect
  analysisSteps: [],          // list of analysis steps for thinking display
};

let aiUpdateInterval = null;
let aiDecisionCounter = 0;

/**
 * 启动 AI 决策引擎定时更新（每30秒完整决策一次，每秒更新倒计时）
 */
function startAIDecisionEngine() {
  if (aiUpdateInterval) return;
  // 立即执行一次决策
  runAIDecision();
  // 每秒更新倒计时和 thinking 动画
  aiUpdateInterval = setInterval(() => {
    aiDecisionState.updateCountdown--;
    aiDecisionState.thinkingPhase = (aiDecisionState.thinkingPhase + 1) % 6;
    if (aiDecisionState.updateCountdown <= 0) {
      runAIDecision();
      aiDecisionState.updateCountdown = 30;
    }
    // 触发 UI 刷新
    if (typeof updateAIDecisionPanel === 'function') {
      updateAIDecisionPanel();
    }
  }, 1000);
}

/**
 * 停止 AI 决策引擎
 */
function stopAIDecisionEngine() {
  if (aiUpdateInterval) {
    clearInterval(aiUpdateInterval);
    aiUpdateInterval = null;
  }
}

/**
 * 执行一次完整的 AI 决策分析
 */
function runAIDecision() {
  aiDecisionCounter++;
  const selectedId = typeof dispatchSelectedStationId !== 'undefined' ? dispatchSelectedStationId : null;
  const station = selectedId ? stations.find(s => s.id === selectedId) : (stations.length > 0 ? stations[0] : null);
  if (!station) return;

  const price = currentPrice || 0;
  const fc = forecastPrice || price;
  const socPct = station.soc;
  const cap = typeof getPhysicalCapacity === 'function' ? getPhysicalCapacity(station) : { mw: MAX_MW, mwh: MAX_MWH };
  const strat = station.strategy || {};
  const spread = optimalPlan.avgDischarge && optimalPlan.avgCharge
    ? optimalPlan.avgDischarge - optimalPlan.avgCharge : 0;

  // ---- 1. 分析价格趋势 ----
  let priceTrend = 'stable';
  if (priceHistory.length >= 3) {
    const recent = priceHistory.slice(-3).map(h => h.price);
    const diff = recent[2] - recent[0];
    if (diff > 30) priceTrend = 'rising';
    else if (diff < -30) priceTrend = 'falling';
    else priceTrend = 'stable';
  }
  if (price > 3000) priceTrend = 'spike';
  aiDecisionState.priceTrend = priceTrend;

  // ---- 2. 分析预测方向 ----
  let forecastDir = 'stable';
  if (fc > price * 1.15) forecastDir = 'up';
  else if (fc < price * 0.85) forecastDir = 'down';
  aiDecisionState.forecastDirection = forecastDir;

  // ---- 3. 分析 SoC 状态 ----
  let socState = 'mid';
  if (socPct < 25) socState = 'low';
  else if (socPct > 75) socState = 'high';
  aiDecisionState.socState = socState;

  // ---- 4. 决策逻辑 ----
  let action = 'hold';
  let status = 'analyzing';
  let executeTime = '--:--';
  let targetSoc = socPct;
  let powerLevel = 0;
  let confidence = 'medium';

  // 尖峰 → 立即放电
  if (priceTrend === 'spike' && socPct > 10) {
    action = 'discharge';
    status = 'executing';
    targetSoc = 10;
    powerLevel = cap.mw;
    confidence = 'high';
    executeTime = new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' });
  }
  // 价格极低或预测下跌 → 充电
  else if ((price < 30 || forecastDir === 'down') && socPct < 90) {
    action = 'charge';
    status = 'price_drop';
    targetSoc = 90;
    powerLevel = cap.mw;
    confidence = forecastDir === 'down' ? 'high' : 'medium';
    executeTime = optimalPlan.nextChargeTime || new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' });
  }
  // 价格高或预测上涨 → 放电
  else if ((price > 200 || forecastDir === 'up') && socPct > 20) {
    action = 'discharge';
    status = 'price_rise';
    const avgPeak = optimalPlan.avgDischarge || 300;
    const priceRatio = price / avgPeak;
    powerLevel = cap.mw * Math.min(1, Math.max(0.2, priceRatio));
    targetSoc = 10;
    confidence = priceTrend === 'rising' ? 'high' : 'medium';
    executeTime = optimalPlan.nextDischargeTime || new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' });
  }
  // SoC 特别低 → 强制建议充电
  else if (socPct < 15) {
    action = 'charge';
    status = 'optimizing';
    targetSoc = 50;
    powerLevel = cap.mw * 0.5;
    confidence = 'high';
    executeTime = optimalPlan.nextChargeTime || '--:--';
  }
  // FCAS 待机
  else if (socPct >= 20 && socPct <= 80 && price >= 30 && price <= 200) {
    action = 'fcas';
    status = 'fcas';
    powerLevel = 0;
    confidence = 'medium';
    executeTime = optimalPlan.nextDischargeTime || optimalPlan.nextChargeTime || '--:--';
  }
  // 默认分析中
  else {
    action = 'hold';
    status = 'optimizing';
    confidence = 'low';
    executeTime = optimalPlan.nextDischargeTime || optimalPlan.nextChargeTime || '--:--';
  }

  // ---- 5. 计算收益 ----
  const cycleProfit = optimalPlan.projectedCycleProfit || 0;
  const todayProfit = station.revenue_today || 0;
  const avgSpread = spread;

  // ---- 6. 生成分析步骤（思考过程显示） ----
  const steps = [];
  steps.push({ icon: '📊', text: `price_analysis|${price.toFixed(2)}|${priceTrend}` });
  steps.push({ icon: '🔮', text: `forecast_analysis|${fc.toFixed(2)}|${forecastDir}` });
  steps.push({ icon: '🔋', text: `soc_analysis|${socPct.toFixed(1)}|${socState}` });
  steps.push({ icon: '📈', text: `spread_analysis|${spread.toFixed(2)}` });
  steps.push({ icon: '🎯', text: `decision|${action}|${confidence}` });

  // ---- 7. 更新状态 ----
  aiDecisionState.status = status;
  aiDecisionState.plannedAction = action;
  aiDecisionState.executeTime = executeTime;
  aiDecisionState.targetSoc = targetSoc;
  aiDecisionState.powerLevel = Math.round(powerLevel * 10) / 10;
  aiDecisionState.confidence = confidence;
  aiDecisionState.cycleProfit = cycleProfit;
  aiDecisionState.todayProfit = todayProfit;
  aiDecisionState.avgSpread = avgSpread;
  aiDecisionState.lastUpdated = new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  aiDecisionState.analysisSteps = steps;
  aiDecisionState.updateCountdown = 30;
}

/**
 * 获取 AI 决策状态
 */
function getAIDecisionState() {
  return aiDecisionState;
}

// ============ 动态告警触发 ============

let alarmIdCounter = Date.now();

/**
 * 检查并触发动态告警（纯逻辑，无 I/O）
 * @param {object} station - 电站对象
 * @param {number} price - 当前电价
 * @returns {boolean} 是否生成了新告警
 */
function checkAndTriggerAlarms(station, price) {
  if (station.operator_id === 'unassigned') return false;
  if (!station.alarms) station.alarms = [];

  let triggered = false;

  // 去重检查：同类型非 RESOLVED 告警存在则跳过
  function hasActiveAlarm(type) {
    return station.alarms.some(a => a.type === type && a.status !== 'RESOLVED');
  }

  // 生成电站本地时区时间戳（使用全局工具函数）
  const timeStr = formatLocalTime(new Date(), station.timezone);

  // 随机选取 device_id
  const pcsDevices = (station.devices || []).filter(d => d.type === 'PCS');
  const emsDevices = (station.devices || []).filter(d => d.type === 'EMS');
  const nowMs = Date.now();

  // 规则 A：尖峰放电时高温告警（Critical, 5%概率）
  if (price > 3000 && station.status === 'DISCHARGING' && !hasActiveAlarm('HIGH_TEMP')) {
    if (Math.random() < 0.05) {
      const dev = pcsDevices.length > 0 ? pcsDevices[Math.floor(Math.random() * pcsDevices.length)] : null;
      station.alarms.push({
        id: 'alm_' + (++alarmIdCounter),
        type: 'HIGH_TEMP',
        severity: 'Critical',
        fault_code: 'BESS_T' + String(Math.floor(Math.random() * 10)).padStart(2, '0'),
        device_id: dev ? dev.id : 'unknown',
        message: 'alarm_msg_temp|55',
        timestamp: timeStr,
        created_ms: nowMs,
        status: 'ACTIVE',
        ack_by: null, ack_at: null,
        resolved_by: null, resolved_at: null, resolved_ms: null,
        root_cause: null
      });
      triggered = true;
      if (typeof showToast === 'function') {
        showToast('⚠️ CRITICAL: ' + station.name + ' — BMS High Temperature', 'error');
      }
    }
  }

  // 规则 B：低电量告警（Warning, 5%概率）
  if (station.soc < 10 && !hasActiveAlarm('LOW_SOC')) {
    if (Math.random() < 0.05) {
      const dev = emsDevices.length > 0 ? emsDevices[Math.floor(Math.random() * emsDevices.length)] : null;
      station.alarms.push({
        id: 'alm_' + (++alarmIdCounter),
        type: 'LOW_SOC',
        severity: 'Warning',
        fault_code: 'BESS_S' + String(Math.floor(Math.random() * 10)).padStart(2, '0'),
        device_id: dev ? dev.id : 'unknown',
        message: 'alarm_msg_soc|' + station.soc.toFixed(1),
        timestamp: timeStr,
        created_ms: nowMs,
        status: 'ACTIVE',
        ack_by: null, ack_at: null,
        resolved_by: null, resolved_at: null, resolved_ms: null,
        root_cause: null
      });
      triggered = true;
    }
  }

  return triggered;
}
