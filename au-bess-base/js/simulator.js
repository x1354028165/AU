/**
 * simulator.js - 5 分钟电价仿真与自动套利引擎
 * Phase 2: 澳洲储能电站管理平台
 *
 * 模拟 AEMO NEM 现货电价，每 5 秒代表 5 分钟
 */

// ============ 仿真状态 ============
let simTime = new Date(); // 仿真时钟（用真实时间驱动电价时段）
let simInterval = null;
let currentPrice = 100;   // $/MWh
let priceHistory = [];     // [{time, price, powers: {st_01: MW, ...}}]
const MAX_HISTORY = 12;    // 保留 1 小时（12 × 5 分钟）

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

  const cap = parseCapacity(station.capacity);
  const intervalHours = 5 / 60; // 5 分钟 = 1/12 小时
  let power = 0;
  let revenue = 0;
  let energyMWh = 0;

  if (price < 50 && station.soc < 95) {
    // 充电
    power = -cap.mw; // 负表示充电
    energyMWh = cap.mw * intervalHours;
    const socIncrease = (energyMWh / cap.mwh) * 100;
    station.soc = Math.min(95, station.soc + socIncrease);
    station.status = 'CHARGING';
    // 充电成本（负收益）
    revenue = -(energyMWh * price);
  } else if (price > 200 && station.soc > 5) {
    // 放电
    power = cap.mw; // 正表示放电
    energyMWh = cap.mw * intervalHours;
    const socDecrease = (energyMWh / cap.mwh) * 100;
    station.soc = Math.max(5, station.soc - socDecrease);
    station.status = 'DISCHARGING';
    // 放电收益（乘往返效率）
    revenue = energyMWh * price * station.efficiency;
  } else {
    station.status = 'IDLE';
  }

  // SoH 损耗：每 1MWh 累计充放电 → SoH 降 0.001%
  if (energyMWh > 0) {
    station.cumulative_mwh = (station.cumulative_mwh || 0) + energyMWh;
    const sohLoss = energyMWh * 0.001;
    station.soh = Math.max(0, station.soh - sohLoss);
  }

  // 累计今日收益
  station.revenue_today = (station.revenue_today || 0) + revenue;

  return { power, revenue };
}

// ============ 仿真主循环 ============

/**
 * 执行一轮仿真 tick
 */
function simTick() {
  const hour = new Date().getHours();
  // 使用澳洲东部时间偏移（UTC+10/+11），这里简单用本地 +2 模拟
  // Demo: 直接用服务器时间，也可手动偏移
  currentPrice = generatePrice(hour);

  const powers = {};

  // 对所有已分配的电站执行套利
  stations.forEach(station => {
    if (station.operator_id !== 'unassigned') {
      const result = runAutoBidder(station, currentPrice);
      powers[station.id] = result.power;
    } else {
      powers[station.id] = 0;
    }
  });

  // 记录历史
  priceHistory.push({
    time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    price: Math.round(currentPrice * 100) / 100,
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
function startSimulator() {
  if (simInterval) return;
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
