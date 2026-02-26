/**
 * auth.js - 数据中心与确权逻辑
 * Phase 1: 澳洲储能电站管理平台
 */

// ============ 用户数据 ============
const users = [
  { id: 'owner_1', role: 'owner', name: 'Pacific Energy Group' },
  { id: 'op_a', role: 'operator', name: 'GreenGrid Operations' },
  { id: 'op_b', role: 'operator', name: 'VoltEdge Energy' }
];

// ============ 电站数据 ============
let stations = [
  {
    id: 'st_01',
    name: 'Sydney North BESS',
    owner: 'owner_1',
    operator_id: 'op_a',
    soh: 99.98,
    capacity: '5MW/10MWh',
    location: 'Newcastle, NSW',
    lease_start: '2025-01-01',
    lease_end: '2028-12-31',
    annual_fee: 850000
  },
  {
    id: 'st_02',
    name: 'Melbourne West Power',
    owner: 'owner_1',
    operator_id: 'op_b',
    soh: 99.95,
    capacity: '2.5MW/5MWh',
    location: 'Geelong, VIC',
    lease_start: '2024-06-01',
    lease_end: '2027-05-31',
    annual_fee: 420000
  },
  {
    id: 'st_03',
    name: 'Brisbane Energy Hub',
    owner: 'owner_1',
    operator_id: 'op_a',
    soh: 99.99,
    capacity: '10MW/20MWh',
    location: 'Sunshine Coast, QLD',
    lease_start: '2025-02-15',
    lease_end: '2030-02-14',
    annual_fee: 1200000
  },
  {
    id: 'st_04',
    name: 'Adelaide Storage A',
    owner: 'owner_1',
    operator_id: 'unassigned',
    soh: 100.0,
    capacity: '5MW/10MWh',
    location: 'Adelaide, SA',
    lease_start: '-',
    lease_end: '-',
    annual_fee: 0
  }
];

// ============ 角色获取 ============

/**
 * 从 localStorage 获取当前用户角色
 * @returns {string} 'owner' | 'op_a' | 'op_b'
 */
function getCurrentUser() {
  return localStorage.getItem('role') || 'owner';
}

/**
 * 获取用户显示名称
 * @param {string} userId 
 * @returns {string}
 */
function getUserName(userId) {
  const user = users.find(u => u.id === userId);
  return user ? user.name : userId;
}

/**
 * 获取运维方列表（用于下拉选择）
 * @returns {Array}
 */
function getOperators() {
  return users.filter(u => u.role === 'operator');
}

// ============ 权限过滤 ============

/**
 * 根据当前角色获取可见电站列表
 * @returns {Array}
 */
function getStationsByRole() {
  const role = getCurrentUser();
  if (role === 'owner') {
    return stations; // 业主看全部
  }
  // 运维方只看自己的
  return stations.filter(s => s.operator_id === role);
}

// ============ 划转逻辑 ============

/**
 * 将电站分配给指定运维方
 * @param {string} stationId - 电站 ID
 * @param {string} targetOpId - 目标运维方 ID
 * @returns {boolean} 是否成功
 */
function assignStation(stationId, targetOpId) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return false;

  const oldOp = station.operator_id;
  station.operator_id = targetOpId;

  // 如果从 unassigned 变为分配，设置默认租约
  if (oldOp === 'unassigned' && targetOpId !== 'unassigned') {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 3); // 默认3年租约
    station.lease_start = today.toISOString().split('T')[0];
    station.lease_end = endDate.toISOString().split('T')[0];
    station.annual_fee = 500000; // 默认年费 50万 AUD
  }

  return true;
}

// ============ 工具函数 ============

/**
 * 计算租约剩余天数
 * @param {string} endDate - 租约结束日期 (YYYY-MM-DD)
 * @returns {number|string} 剩余天数或 '-'
 */
function getLeaseRemaining(endDate) {
  if (endDate === '-') return '-';
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/**
 * 格式化澳元金额
 * @param {number} amount
 * @returns {string}
 */
function formatAUD(amount) {
  if (!amount) return '-';
  return 'A$' + amount.toLocaleString('en-AU');
}
