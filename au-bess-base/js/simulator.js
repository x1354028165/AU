/**
 * simulator.js - 5 分钟电价仿真与自动套利引擎
 * Phase 2: 澳洲储能电站管理平台
 *
 * 模拟 AEMO NEM 现货电价，每 5 秒代表 5 分钟
 */

// ============ 仿真状态 ============
let simTime = new Date();
let simInterval = null;
let currentPrice = 100;   // $/MWh
let previousPrice = 100;  // 上一轮电价（用于平滑）
let priceHistory = [];     // [{time, price, powers: {st_01: MW, ...}}]
const MAX_HISTORY = 12;    // 保留 1 小时（12 × 5 分钟）
const SMOOTHING_FACTOR = 0.3;
let dispatchLogs = [];         // [{time, stationName, stationId, operatorId, action, price, revenue}]
const MAX_LOGS = 100;
let previousStationStatus = {}; // 记录上一轮状态用于检测变化

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
    // Auto 模式：使用动态阈值
    const chargeAt = strat.charge_threshold || 50;
    const dischargeAt = strat.discharge_threshold || 200;

    if (price < chargeAt && station.soc < 95) {
      power = -cap.mw;
      energyMWh = cap.mw * intervalHours;
      station.soc = Math.min(95, station.soc + (energyMWh / cap.mwh) * 100);
      station.status = 'CHARGING';
      revenue = -(energyMWh * price);
    } else if (price > dischargeAt && station.soc > minSoc) {
      power = cap.mw;
      energyMWh = cap.mw * intervalHours;
      station.soc = Math.max(minSoc, station.soc - (energyMWh / cap.mwh) * 100);
      station.status = 'DISCHARGING';
      revenue = energyMWh * price * station.efficiency;
    } else {
      station.status = 'IDLE';
    }
  }

  // SoH 损耗
  if (energyMWh > 0) {
    station.cumulative_mwh = (station.cumulative_mwh || 0) + energyMWh;
    station.soh = Math.max(0, station.soh - energyMWh * 0.001);
  }

  station.revenue_today = (station.revenue_today || 0) + revenue;
  return { power, revenue };
}

// ============ 仿真主循环 ============

/**
 * 执行一轮仿真 tick
 */
function simTick() {
  const hour = new Date().getHours();
  const rawPrice = generatePrice(hour);

  // 平滑处理：新价格 = 旧价格 × (1-α) + 原始新价格 × α
  // 尖峰价格（>$3000）不平滑，保持冲击力
  if (rawPrice > 3000) {
    currentPrice = rawPrice;
  } else {
    currentPrice = previousPrice * (1 - SMOOTHING_FACTOR) + rawPrice * SMOOTHING_FACTOR;
  }
  previousPrice = currentPrice;

  const powers = {};

  // 对所有已分配的电站执行套利
  // 尖峰时强制触发放电判断（绕过普通阈值）
  const isSpike = currentPrice > 3000;

  const timeStr = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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

    // 动态告警检查
    checkAndTriggerAlarms(station, currentPrice);
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

// ============ 调度日志 ============

/**
 * 记录一条调度日志
 */
function logDispatch(time, station, action, price, revenue) {
  dispatchLogs.push({
    time,
    stationName: station.name,
    stationId: station.id,
    operatorId: station.operator_id,
    action,
    price: Math.round(price * 100) / 100,
    revenue: Math.round((revenue || 0) * 100) / 100
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

// ============ 动态告警触发 ============

let alarmIdCounter = Date.now();

/**
 * 检查并触发动态告警（去重 + 持久化）
 * @param {object} station - 电站对象
 * @param {number} price - 当前电价
 */
function checkAndTriggerAlarms(station, price) {
  if (station.operator_id === 'unassigned') return;
  if (!station.alarms) station.alarms = [];

  // 去重检查：同类型非 RESOLVED 告警存在则跳过
  function hasActiveAlarm(type) {
    return station.alarms.some(a => a.type === type && a.status !== 'RESOLVED');
  }

  // 规则 A：尖峰放电时高温告警（Critical, 5%概率）
  if (price > 3000 && station.status === 'DISCHARGING' && !hasActiveAlarm('HIGH_TEMP')) {
    if (Math.random() < 0.05) {
      const alarm = {
        id: 'alm_' + (++alarmIdCounter),
        type: 'HIGH_TEMP',
        severity: 'Critical',
        message: 'BMS High Temperature Warning — Cell temp exceeded 55°C during peak discharge',
        timestamp: new Date().toLocaleString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: 'ACTIVE',
        ack_by: null,
        ack_at: null,
        resolved_by: null,
        resolved_at: null
      };
      station.alarms.push(alarm);
      if (typeof saveStations === 'function') saveStations();
      // Critical 告警弹 toast
      if (typeof showToast === 'function') {
        showToast('⚠️ CRITICAL: ' + station.name + ' — BMS High Temperature', 'error');
      }
    }
  }

  // 规则 B：低电量告警（Warning, 5%概率）
  if (station.soc < 10 && !hasActiveAlarm('LOW_SOC')) {
    if (Math.random() < 0.05) {
      const alarm = {
        id: 'alm_' + (++alarmIdCounter),
        type: 'LOW_SOC',
        severity: 'Warning',
        message: 'Battery Low SoC — State of charge dropped below 10% (' + station.soc.toFixed(1) + '%)',
        timestamp: new Date().toLocaleString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: 'ACTIVE',
        ack_by: null,
        ack_at: null,
        resolved_by: null,
        resolved_at: null
      };
      station.alarms.push(alarm);
      if (typeof saveStations === 'function') saveStations();
      // Warning 级别不弹 toast，只写入列表
    }
  }
}
