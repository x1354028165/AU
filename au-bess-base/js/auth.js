/**
 * auth.js - 数据中心、确权逻辑、i18n 与登录验证
 * Phase 1 Enhanced v2: 澳洲储能电站管理平台
 */

// ============ i18n 多语言 ============
const TRANSLATIONS = {
  en: {
    // Login
    app_title: 'AU BESS Platform',
    app_subtitle: 'Australia Battery Energy Storage System',
    login_title: 'Account Login',
    login_subtitle: 'Enter your credentials to access the platform',
    username: 'Username',
    username_placeholder: 'Enter username',
    password: 'Password',
    password_placeholder: 'Enter password',
    remember_me: 'Remember me',
    login_btn: 'Sign In',
    logging_in: 'Verifying...',
    invalid_creds: 'Invalid username or password',
    phase_label: 'Phase 1 Demo · AU BESS Management Platform',
    loading: 'Initializing secure session...',

    // 2FA
    mfa_title: 'Two-Factor Authentication',
    mfa_subtitle: 'Enter the 6-digit code from your authenticator app',
    mfa_verify: 'Verify',
    mfa_verifying: 'Verifying...',
    mfa_back: 'Back to login',
    incorrect_code: 'Invalid verification code',
    attempts_left: 'attempts remaining',

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

    // Reports
    export_csv: 'Export CSV',
    leaderboard: 'Operator Leaderboard',
    logs_title: 'Dispatch Logs',
    table_time: 'Time',
    table_event: 'Event',
    table_station: 'Station',
    table_action: 'Action',
    table_price: 'Trigger Price',
    table_revenue: 'Revenue',
    table_rev_per_mw: 'Revenue/MW',
    table_soh_loss: 'SoH Loss',
    table_total_rev: 'Total Revenue',
    table_total_cap: 'Total Capacity',
    table_operator: 'Operator',
    rank: 'Rank',
    no_logs: 'No dispatch logs yet',
    no_logs_hint: 'Logs will appear as the simulator runs',
    report_owner_hint: 'Performance comparison across operators',
    report_op_hint: 'Real-time dispatch activity for your stations',

    // Simulation
    soc: 'SoC',
    status_idle: 'Idle',
    status_charging: 'Charging',
    status_discharging: 'Discharging',
    revenue_today: "Today's Revenue",
    market_price: 'Market Price',
    power_output: 'Power Output',
    market_chart_title: 'NEM Spot Price & Station Output (5-min)',
    price_spike_alert: 'PRICE SPIKE',
    efficiency_label: 'Round-trip Eff.',
    charging: 'Charging',
    discharging: 'Discharging',
    idle: 'Standby',

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
    // 登录
    app_title: '澳洲储能管理平台',
    app_subtitle: 'Australia Battery Energy Storage System',
    login_title: '账号登录',
    login_subtitle: '输入您的凭证以访问系统',
    username: '用户名',
    username_placeholder: '请输入用户名',
    password: '密码',
    password_placeholder: '请输入密码',
    remember_me: '记住我',
    login_btn: '登 录',
    logging_in: '验证中...',
    invalid_creds: '用户名或密码错误',
    phase_label: 'Phase 1 演示 · 澳洲储能管理平台',
    loading: '正在初始化安全会话...',

    // 2FA
    mfa_title: '双重身份验证',
    mfa_subtitle: '请输入验证器应用中的 6 位验证码',
    mfa_verify: '验 证',
    mfa_verifying: '验证中...',
    mfa_back: '返回登录',
    incorrect_code: '验证码错误',
    attempts_left: '次重试机会',

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

    // 报表
    export_csv: '导出 CSV',
    leaderboard: '运维方绩效榜',
    logs_title: '调度日志',
    table_time: '时间',
    table_event: '事件',
    table_station: '电站',
    table_action: '动作',
    table_price: '触发电价',
    table_revenue: '收益',
    table_rev_per_mw: '单兆瓦收益',
    table_soh_loss: '健康度损耗',
    table_total_rev: '总收益',
    table_total_cap: '总容量',
    table_operator: '运维方',
    rank: '排名',
    no_logs: '暂无调度日志',
    no_logs_hint: '仿真运行后日志将自动出现',
    report_owner_hint: '各运维方绩效对比',
    report_op_hint: '您电站的实时调度记录',

    // 仿真
    soc: '荷电状态',
    status_idle: '待机',
    status_charging: '充电中',
    status_discharging: '放电中',
    revenue_today: '今日收益',
    market_price: '市场电价',
    power_output: '输出功率',
    market_chart_title: 'NEM 现货电价与电站出力 (5分钟)',
    price_spike_alert: '电价尖峰',
    efficiency_label: '往返效率',
    charging: '充电中',
    discharging: '放电中',
    idle: '待机',

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

// ============ 语言管理 ============

function initLang() {
  // Phase 2: 强制默认英文，确保演示第一眼为英文
  // 用户手动切换后通过 switchLang 存储，下次加载仍尊重手动选择
  const VERSION_KEY = 'lang_version';
  const CURRENT_VERSION = '2'; // 递增此值可强制重置所有用户语言
  if (localStorage.getItem(VERSION_KEY) !== CURRENT_VERSION) {
    localStorage.setItem('lang', 'en');
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
  }
}

function getLang() {
  return localStorage.getItem('lang') || 'en';
}

function getTrans(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS['en'][key] || key;
}

function switchLang(lang) {
  localStorage.setItem('lang', lang);
  if (typeof initDashboard === 'function') {
    initDashboard();
  }
}

function toggleLang() {
  const current = getLang();
  switchLang(current === 'en' ? 'zh' : 'en');
}

initLang();

// ============ 用户数据（含账号密码）============
const users = [
  { id: 'owner_1', role: 'owner', name: 'Pacific Energy Group', username: 'admin', password: 'admin123' },
  { id: 'op_a', role: 'operator', name: 'GreenGrid Operations', username: 'op_a', password: 'pass123' },
  { id: 'op_b', role: 'operator', name: 'VoltEdge Energy', username: 'op_b', password: 'pass123' }
];

// ============ 登录验证 ============

/**
 * 验证用户名密码
 * @param {string} username
 * @param {string} password
 * @returns {object|null} 匹配的用户对象或 null
 */
function verifyCredentials(username, password) {
  return users.find(u => u.username === username && u.password === password) || null;
}

/**
 * 验证 MFA 验证码（Demo 模式：接受任意 6 位数字）
 * @param {string} code - 6 位验证码
 * @returns {boolean}
 */
function verifyMFA(code) {
  return /^\d{6}$/.test(code);
}

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
    annual_fee: 850000,
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0
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
    annual_fee: 420000,
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0
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
    annual_fee: 1200000,
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0
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
    annual_fee: 0,
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0
  }
];

// ============ 数据持久化 ============
let stations = loadStations();

function loadStations() {
  const saved = localStorage.getItem('stations');
  if (saved) {
    try { return JSON.parse(saved); }
    catch (e) { return JSON.parse(JSON.stringify(DEFAULT_STATIONS)); }
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
  if (role === 'owner') return stations;
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
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function formatAUD(amount) {
  if (!amount) return '-';
  return 'A$' + amount.toLocaleString('en-AU');
}
