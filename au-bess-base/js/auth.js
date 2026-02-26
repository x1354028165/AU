/**
 * auth.js - 数据中心、确权逻辑与 i18n
 * Phase 1 Enhanced: 澳洲储能电站管理平台
 */

// ============ i18n 多语言 ============
const TRANSLATIONS = {
  en: {
    // Login page
    app_title: 'AU BESS Platform',
    app_subtitle: 'Australia Battery Energy Storage System',
    select_role: 'Select your role to continue',
    asset_owner: 'Asset Owner',
    operator_a: 'Operator A',
    operator_b: 'Operator B',
    enter_portal: 'Enter Portal',
    owner_desc: 'Manage portfolio, assign operators, monitor SoH',
    operator_desc: 'Dispatch, monitor assets, view logs',
    loading: 'Initializing secure session...',
    phase_label: 'Phase 1 Demo · AU BESS Management Platform',

    // Sidebar menus
    menu_portfolio: 'Portfolio',
    menu_assets: 'Assets',
    menu_lease: 'Lease',
    menu_health: 'Health',
    menu_dispatch: 'Dispatch',
    menu_logs: 'Logs',
    sign_out: 'Sign Out',
    logged_in_as: 'Logged in as',
    role_owner: 'Owner',
    role_operator: 'Operator',
    owner_portal: 'Owner Portal',
    operator_portal: 'Operator Portal',

    // Header
    assets_overview: 'Assets Overview',
    owner_subtitle: 'Manage your energy storage portfolio',
    operator_subtitle: 'Your assigned stations',

    // Station card
    capacity: 'Capacity',
    soh: 'SoH',
    operator: 'Operator',
    station_id: 'ID',
    lease_period: 'Lease Period',
    annual_fee: 'Annual Fee',
    remaining: 'Remaining',
    days: 'days',
    expires_today: 'Expires today',
    days_overdue: 'days overdue',
    pending_assignment: 'Pending Assignment',
    active: 'Active',
    unassigned: 'Unassigned',

    // Assignment
    assign_to: 'Assign to Operator',
    select_operator: 'Select operator...',
    revoke_access: '— Revoke Access —',
    assign_btn: 'Assign',
    confirm_assign: 'Confirm',
    confirm_msg: 'Proceed?',
    confirm_station: 'Station',
    confirm_location: 'Location',
    assign_success: 'Assignment successful',
    assign_fail: 'Assignment failed',
    select_operator_warning: 'Please select an operator',

    // Empty state
    no_stations: 'No stations assigned',
    no_stations_hint: 'Contact the asset owner for access',

    // Mobile
    menu: 'Menu',

    // Language
    lang_switch: 'CN',
  },
  zh: {
    // 登录页
    app_title: '澳洲储能管理平台',
    app_subtitle: 'Australia Battery Energy Storage System',
    select_role: '请选择角色登录',
    asset_owner: '资产业主',
    operator_a: '运维商 A',
    operator_b: '运维商 B',
    enter_portal: '进入系统',
    owner_desc: '管理资产组合、分配运维商、监控电池健康',
    operator_desc: '调度管理、资产监控、查看日志',
    loading: '正在初始化安全会话...',
    phase_label: 'Phase 1 演示 · 澳洲储能管理平台',

    // 侧边栏菜单
    menu_portfolio: '资产总览',
    menu_assets: '电站管理',
    menu_lease: '租约管理',
    menu_health: '健康监控',
    menu_dispatch: '调度中心',
    menu_logs: '操作日志',
    sign_out: '退出登录',
    logged_in_as: '当前登录',
    role_owner: '业主',
    role_operator: '运维方',
    owner_portal: '业主门户',
    operator_portal: '运维门户',

    // 顶部栏
    assets_overview: '资产概览',
    owner_subtitle: '管理您的储能资产组合',
    operator_subtitle: '您负责运维的电站',

    // 电站卡片
    capacity: '额定容量',
    soh: '健康度',
    operator: '运维方',
    station_id: '编号',
    lease_period: '租约期限',
    annual_fee: '年费',
    remaining: '剩余',
    days: '天',
    expires_today: '今日到期',
    days_overdue: '天已过期',
    pending_assignment: '待分配',
    active: '运营中',
    unassigned: '未分配',

    // 划转
    assign_to: '分配给运维方',
    select_operator: '选择运维方...',
    revoke_access: '— 撤回权限 —',
    assign_btn: '分配',
    confirm_assign: '确认操作',
    confirm_msg: '是否继续？',
    confirm_station: '电站',
    confirm_location: '位置',
    assign_success: '划转成功',
    assign_fail: '划转失败',
    select_operator_warning: '请选择运维方',

    // 空状态
    no_stations: '暂无分配电站',
    no_stations_hint: '请联系资产业主获取权限',

    // 移动端
    menu: '菜单',

    // 语言
    lang_switch: 'EN',
  }
};

/**
 * 初始化语言设置（自动检测浏览器语言）
 */
function initLang() {
  if (!localStorage.getItem('lang')) {
    const browserLang = navigator.language || navigator.userLanguage || 'en';
    localStorage.setItem('lang', browserLang.startsWith('zh') ? 'zh' : 'en');
  }
}

/**
 * 获取当前语言
 */
function getLang() {
  return localStorage.getItem('lang') || 'en';
}

/**
 * 获取翻译文本
 * @param {string} key - 翻译键
 * @returns {string}
 */
function getTrans(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS['en'][key] || key;
}

/**
 * 切换语言并重绘（无刷新）
 * @param {string} lang - 'en' | 'zh'
 */
function switchLang(lang) {
  localStorage.setItem('lang', lang);
  // 如果在 dashboard 页面，重新渲染
  if (typeof initDashboard === 'function') {
    initDashboard();
  }
}

/**
 * 切换到另一种语言
 */
function toggleLang() {
  const current = getLang();
  switchLang(current === 'en' ? 'zh' : 'en');
}

// 初始化语言
initLang();

// ============ 用户数据 ============
const users = [
  { id: 'owner_1', role: 'owner', name: 'Pacific Energy Group' },
  { id: 'op_a', role: 'operator', name: 'GreenGrid Operations' },
  { id: 'op_b', role: 'operator', name: 'VoltEdge Energy' }
];

// ============ 电站默认数据 ============
const DEFAULT_STATIONS = [
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

// ============ 从 localStorage 加载或使用默认数据 ============
let stations = loadStations();

function loadStations() {
  const saved = localStorage.getItem('stations');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_STATIONS));
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATIONS));
}

function saveStations() {
  localStorage.setItem('stations', JSON.stringify(stations));
}

function resetStations() {
  localStorage.removeItem('stations');
  stations = JSON.parse(JSON.stringify(DEFAULT_STATIONS));
}

// ============ 角色获取 ============

function getCurrentUser() {
  return localStorage.getItem('role') || 'owner';
}

function getUserName(userId) {
  const user = users.find(u => u.id === userId);
  return user ? user.name : userId;
}

function getOperators() {
  return users.filter(u => u.role === 'operator');
}

// ============ 权限过滤 ============

function getStationsByRole() {
  const role = getCurrentUser();
  if (role === 'owner') {
    return stations;
  }
  return stations.filter(s => s.operator_id === role);
}

// ============ 划转逻辑 ============

function assignStation(stationId, targetOpId) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return false;

  const oldOp = station.operator_id;
  station.operator_id = targetOpId;

  if (oldOp === 'unassigned' && targetOpId !== 'unassigned') {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setFullYear(endDate.getFullYear() + 3);
    station.lease_start = today.toISOString().split('T')[0];
    station.lease_end = endDate.toISOString().split('T')[0];
    station.annual_fee = 500000;
  }

  saveStations();
  return true;
}

// ============ 工具函数 ============

function getLeaseRemaining(endDate) {
  if (endDate === '-') return '-';
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatAUD(amount) {
  if (!amount) return '-';
  return 'A$' + amount.toLocaleString('en-AU');
}
