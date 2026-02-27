/**
 * auth.js - 数据中心、确权逻辑、i18n 与登录验证
 * Phase 1 Enhanced v2: 澳洲储能电站管理平台
 */

// ============ 全局时区工具 ============

/**
 * 统一时区格式化函数（全系统唯一入口）
 * @param {Date|number|string} date - 日期对象、时间戳或日期字符串
 * @param {string} timezone - IANA 时区，如 'Australia/Sydney'
 * @returns {string} 格式化后的时间字符串，如 "27/02/2026, 14:30:00 (Sydney)"
 */
const CITY_NAMES_ZH = {
  'Sydney': '悉尼', 'Melbourne': '墨尔本', 'Brisbane': '布里斯班',
  'Perth': '珀斯', 'Adelaide': '阿德莱德', 'Hobart': '霍巴特', 'Darwin': '达尔文'
};
function formatLocalTime(date, timezone) {
  try {
    const city = timezone.split('/')[1] || 'Local';
    const timeStr = new Date(date).toLocaleString('en-AU', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const lang = typeof getLang === 'function' ? getLang() : 'en';
    const cityDisplay = lang === 'zh' ? (CITY_NAMES_ZH[city] || city) : city;
    return timeStr + ' (' + cityDisplay + ')';
  } catch (e) {
    return new Date(date).toLocaleString('en-AU');
  }
}

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

    // KPI
    kpi_total_cap: 'Total Capacity',
    kpi_month_rev: 'Monthly Rental',
    kpi_avg_soh: 'Average SoH',
    kpi_unassigned: 'Unassigned',
    kpi_managed_cap: 'Managed Cap.',
    kpi_today_rev: "Today's Revenue",
    kpi_avg_soc: 'Avg SoC',
    kpi_current_price: 'Spot Price',

    // Strategy
    strategy_panel: 'Dispatch Strategy',
    charge_at: 'Charge when <',
    discharge_at: 'Discharge when >',
    reserve_soc: 'Reserve SoC',
    strategy_mode: 'Mode',
    mode_auto: 'Auto',
    mode_manual_charge: 'Force Charge',
    mode_manual_discharge: 'Force Discharge',
    mode_manual_idle: 'Force Idle',
    manual_override: 'Manual Override',
    save_strategy: 'Save',
    strategy_saved: 'Strategy updated',
    emergency_charge: '⚡ Force Charge',
    emergency_discharge: '🔋 Force Discharge',
    emergency_idle: '⏸ Emergency Stop',

    // SoH Trend
    soh_trend: 'SoH Degradation Trend (30 Days)',
    soh_trend_hint: 'Battery health trajectory across all stations',
    simulated_data_hint: '* Simulated historical data for demonstration purposes',
    invalid_thresholds: 'Charge threshold must be lower than discharge threshold',
    mfa_demo_hint: 'Demo: enter any 6 digits (e.g., 123456)',
    strategy_warning_high_reserve: 'Warning: Reserve SoC is higher than current SoC',
    switch_role: 'Switch Role',
    login_success_owner: 'Login successful. Entering as Owner...',
    login_success_operator: 'Login successful. Entering as Operator...',
    select_role: 'Select Your Identity',
    select_role_hint: 'Choose how you want to access the AU BESS Platform',
    role_owner_title: 'Pacific Energy Group',
    role_owner_subtitle: 'Asset Owner',
    role_owner_label: 'Asset Owner',
    role_owner_desc: 'Control global asset returns, audit operator performance, manage station allocation. Track battery health and long-term ROI.',
    role_owner_enter: 'Enter Owner Portal',
    role_operator_title: 'Operator',
    role_operator_subtitle: 'Operator',
    role_operator_label: 'Dispatch Expert',
    role_operator_desc: 'Monitor station output in real-time, execute automated arbitrage strategies, optimize battery lifespan. Manage dispatch thresholds and emergency response.',
    role_operator_enter: 'Enter Operator Portal',
    role_select_title: 'Select Your Identity',
    role_select_as: 'Enter Portal',

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
    forecast_price: 'Pre-dispatch Forecast (Simulated)',
    discharge_duration: 'Discharge Duration',
    charge_duration: 'Charge Duration',
    available_energy: 'Available Energy',
    ai_narrator_charging: 'Detected price drop trend in forecast. Entering energy storage mode…',
    ai_narrator_discharging: 'Price spike detected ahead. Executing discharge for maximum profit…',
    ai_narrator_idle: 'Market stable. Standing by for optimal entry point…',
    ai_narrator_manual: 'Manual Override Active — AI recommendation suspended.',
    btn_resume_ai: 'Smart Hosting',
    force_charge: 'Force Charge',
    force_discharge: 'Force Discharge',
    force_idle: 'Force Standby',
    settings: 'Settings',
    charge_stop_soc: 'Charge Stop SoC',
    discharge_stop_soc: 'Discharge Stop SoC',
    auto_charge_rules: 'Auto Charge Rules',
    auto_discharge_rules: 'Auto Discharge Rules',
    discharge_cycles: 'Cycles',
    available_kwh: 'Available',
    spot_price: 'Spot Price',
    current_demand: 'Current Demand',
    forecast_price: 'Forecast Price',
    forecast_demand: 'Forecast Demand',
    trading_plan_today: 'Today Trading Plan',
    price_type: 'Price Type',
    operation: 'Operation',
    trade_qty: 'Qty (MWh)',
    result: 'Result',
    off_peak: 'Off-Peak',
    shoulder: 'Shoulder',
    peak_period: 'Peak',
    action_buy: 'Buy',
    action_sell: 'Sell All',
    action_partial_sell: 'Partial Sell',
    action_hold: 'Hold',
    status_done: 'Done',
    status_active: 'Active',
    status_planned: 'Planned',
    total_buy: 'Total Buy',
    total_sell: 'Total Sell',
    spread_profit: 'Spread Profit',
    cost: 'Cost',
    revenue: 'Revenue',
    margin: 'Margin',
    charge_duration: 'Charge Duration',
    price: 'Price',
    status: 'Status',
    dispatch_mode_smart: 'Smart Hosting',
    dispatch_mode_manual: 'Manual Override',
    next_action: 'Next Action',
    expect_discharge_at: 'Expect discharge at {0}',
    expect_charge_at: 'Expect charge at {0}',
    projected_profit: 'Est. Profit',
    fcas_standby: 'FCAS standby — earning A${0}',
    ai_target: 'Target: Seize {0} Peak | Plan: Multi-stage discharge | Est. Profit: A${1}',
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

    // View toggle
    view_map: 'Asset Map',
    view_cards: 'Asset Cards',
    view_list: 'Asset List',
    add_station: 'Add Station',
    add_device: 'Add Device',
    station_name: 'Station Name',
    power_capacity: 'Power / Capacity',
    power_mw: 'Power (MW)',
    capacity_mwh: 'Capacity (MWh)',
    select_timezone: 'Timezone',
    select_region: 'Region',
    latitude: 'Latitude',
    longitude: 'Longitude',
    cancel: 'Cancel',
    confirm_charge: 'Confirm Charge',
    confirm_discharge: 'Confirm Discharge',
    confirm_charge_desc: 'Are you sure you want to start charging? This will consume grid power.',
    confirm_discharge_desc: 'Are you sure you want to start discharging? This will sell power to the grid.',
    charge_warning: 'Charging will consume grid power. Ensure the current price is favorable.',
    discharge_warning: 'Discharging will sell power to the grid. Ensure the current price is profitable.',
    station_capacity: 'Capacity',
    est_charge_cost: 'Est. Charge Cost',
    est_discharge_revenue: 'Est. Revenue',
    est_charge_time: 'Est. Full Time',
    est_discharge_time: 'Est. Empty Time',
    current_soc: 'Current SoC',
    confirm_add: 'Create Station',
    device_name: 'Device Name',
    device_type: 'Device Type',
    device_version: 'Version',
    add_device_btn: 'Add',
    sync_from_device: 'Sync from Device',
    sync_success: 'Synced from device',
    sync_no_device: 'No PCS/BMS device to sync from',
    contract_capacity: 'Contract Capacity',
    live_capacity: 'Live Capacity',
    capacity_mismatch: '⚠ Capacity mismatch >5%',
    rated_power: 'Rated Power',
    rated_capacity: 'Rated Capacity',
    manage: 'Manage',
    monitor: 'Monitor',
    alarm: 'Alarms',
    today_revenue: "Today's Revenue",
    lease_expiry: 'Lease Expiry',
    no_alarms: 'No Alarms',

    // Station detail
    tab_overview: 'Overview',
    tab_devices: 'Devices',
    tab_history: 'History',
    tab_reports: 'Reports',
    energy_flow: 'Energy Flow',
    grid_label: 'Grid',
    bess_label: 'BESS',
    load_label: 'Load',
    back_to_list: 'Back',

    // Mobile
    menu: 'Menu',

    // Alarms
    menu_alarms: 'Alarms',
    btn_ack: 'Acknowledge',
    btn_resolve: 'Resolve Issue',
    btn_detail: 'Detail',
    btn_handle: 'Handle',
    btn_batch_handle: 'Batch Handle',
    status_active: 'Active',
    status_pending: 'Pending',
    status_ack: 'Acknowledged',
    status_resolved: 'Resolved',
    alarm_critical: 'Critical',
    alarm_warning: 'Warning',
    alarm_title: 'Alarm Management',
    alarm_hint_owner: 'Review and resolve active alarms across all stations',
    alarm_hint_operator: 'Active alarms for your stations — acknowledge to notify owner',
    alarm_col_station: 'Station',
    alarm_col_level: 'Severity',
    alarm_col_desc: 'Description',
    alarm_col_time: 'Triggered At',
    alarm_col_status: 'Status',
    alarm_col_action: 'Action',
    alarm_col_ack_by: 'Acknowledged By',
    alarm_col_resolved_by: 'Resolved By',
    alarm_ack_success: 'Alarm acknowledged',
    alarm_resolved_success: 'Alarm resolved',
    no_alarms_active: 'No active alarms',
    no_alarms_hint: 'All systems operating normally',
    awaiting_resolve: 'Awaiting Owner',
    alarm_col_code: 'Fault Code',
    alarm_col_device: 'Device',
    alarm_col_code: 'Code',
    alarm_col_duration: 'Duration',
    alarm_col_duration: 'Duration',
    alarm_col_root_cause: 'Root Cause',
    alarm_col_resolve_time: 'Resolved At',
    alarm_filter_all: 'All',
    alarm_filter_search: 'Search',
    alarm_filter_reset: 'Reset',
    alarm_resolve_title: 'Resolve Alarm',
    alarm_resolve_cause: 'Root Cause',
    alarm_resolve_note: 'Notes (optional)',
    alarm_resolve_confirm: 'Confirm Resolve',
    alarm_resolve_cancel: 'Cancel',
    cause_hardware: 'Hardware',
    cause_software: 'Software',
    cause_environment: 'Environment',
    alarm_msg_temp: 'BMS High Temperature Warning — Cell temp exceeded {0}°C during peak discharge',
    alarm_msg_soc: 'Battery Low SoC — State of charge dropped below 10% ({0}%)',
    no_devices: 'No devices',
    coming_soon: 'Coming soon',
    core_device: 'Core Device',
    device_ems: 'EMS Controller',
    device_meter: 'Meter',
    device_transformer: 'Transformer',
    device_other: 'Other',
    add_device_fail: 'Failed to add device',
    portfolio_health: 'Portfolio Health',
    asset_rental_rate: 'Asset Rental Rate',
    monthly_rental: 'Monthly Rental Income',
    status_label: 'Status',
    avg_soh_desc: 'Average SoH across {0} stations',
    rental_rate_desc: '{0} / {1} stations leased',
    annual_label: 'Annual: {0}',
    date_placeholder: 'YYYY-MM-DD',

    // Language
    lang_switch: 'English',
    demo_accounts_hint: 'Demo accounts: admin / op_a / op_b',
  },
  zh: {
    // 登录
    app_title: '澳洲储能管理平台',
    app_subtitle: '澳洲电池储能系统',
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

    // KPI
    kpi_total_cap: '总资产容量',
    kpi_month_rev: '月租金收入',
    kpi_avg_soh: '平均健康度',
    kpi_unassigned: '待分配',
    kpi_managed_cap: '管理容量',
    kpi_today_rev: '今日收益',
    kpi_avg_soc: '平均 SoC',
    kpi_current_price: '现货电价',

    // 策略
    strategy_panel: '调度策略面板',
    charge_at: '充电阈值 <',
    discharge_at: '放电阈值 >',
    reserve_soc: '储备 SoC',
    strategy_mode: '模式',
    mode_auto: '自动',
    mode_manual_charge: '强制充电',
    mode_manual_discharge: '强制放电',
    mode_manual_idle: '强制停机',
    manual_override: '手动接管',
    save_strategy: '保存',
    strategy_saved: '策略已更新',
    emergency_charge: '⚡ 强制充电',
    emergency_discharge: '🔋 强制放电',
    emergency_idle: '⏸ 紧急停机',

    // SoH 趋势
    soh_trend: '电池健康度 30 天衰减趋势',
    soh_trend_hint: '全部电站的健康度变化轨迹',
    simulated_data_hint: '* 演示环境下的模拟历史数据',
    invalid_thresholds: '充电阈值必须低于放电阈值',
    mfa_demo_hint: '演示：请随意输入 6 位数字（如 123456）',
    strategy_warning_high_reserve: '提醒：储备 SoC 设置高于当前实际值',
    switch_role: '切换角色',
    login_success_owner: '登录成功，正在以管理员身份进入系统...',
    login_success_operator: '登录成功，正在以操作员身份进入系统...',
    select_role: '选择访问身份',
    select_role_hint: '选择您要以何种身份进入 AU BESS 平台',
    role_owner_title: '太平洋能源集团',
    role_owner_subtitle: '资产业主',
    role_owner_label: '资产业主',
    role_owner_desc: '掌控全局资产收益，审计运维表现，管理电站分配。追踪电池健康度与长期投资回报。',
    role_owner_enter: '进入业主门户',
    role_operator_title: '运维方',
    role_operator_subtitle: '运维方',
    role_operator_label: '运维专家',
    role_operator_desc: '实时监控电站出力，执行自动化套利策略，优化电池寿命。管理调度阈值与紧急响应。',
    role_operator_enter: '进入运维门户',
    role_select_title: '选择访问身份',
    role_select_as: '进入门户',

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
    forecast_price: '预调度预测 (模拟)',
    discharge_duration: '可持续放电时长',
    charge_duration: '充电完成所需时间',
    available_energy: '可用电量',
    ai_narrator_charging: '预测曲线显示价格下行趋势，系统已进入蓄能模式…',
    ai_narrator_discharging: '监测到前方电价尖峰，正在执行放电以最大化收益…',
    ai_narrator_idle: '市场平稳，待机等待最优入场时机…',
    ai_narrator_manual: '手动接管中 — AI 建议已暂停',
    btn_resume_ai: '智能托管',
    force_charge: '强制充电',
    force_discharge: '强制放电',
    force_idle: '强制待机',
    settings: '设置',
    charge_stop_soc: '充电停止 SoC',
    discharge_stop_soc: '放电停止 SoC',
    auto_charge_rules: '自动充电条件',
    auto_discharge_rules: '自动放电条件',
    discharge_cycles: '可放电次数',
    available_kwh: '可放电量',
    spot_price: '现货电价',
    current_demand: '当前需求',
    forecast_price: '预测价格',
    forecast_demand: '预测需求',
    trading_plan_today: '今日交易计划',
    price_type: '电价类型',
    operation: '操作',
    trade_qty: '交易量 (MWh)',
    result: '结果',
    off_peak: '非尖峰时段',
    shoulder: '中间时段',
    peak_period: '尖峰时段',
    action_buy: '买入',
    action_sell: '全部卖出',
    action_partial_sell: '部分卖出',
    action_hold: '持有',
    status_done: '已执行',
    status_active: '执行中',
    status_planned: '已计划',
    total_buy: '总买入量',
    total_sell: '总卖出量',
    spread_profit: '套利利润',
    cost: '成本',
    revenue: '收入',
    margin: '利润率',
    charge_duration: '充电时长',
    price: '价格',
    status: '状态',
    dispatch_mode_smart: '智能托管',
    dispatch_mode_manual: '手动接管',
    next_action: '下一动作',
    expect_discharge_at: '预计 {0} 放电',
    expect_charge_at: '预计 {0} 充电',
    projected_profit: '预计收益',
    fcas_standby: 'FCAS 待机中 — 已获 A${0}',
    ai_target: '目标：锁定 {0} 尖峰 | 计划：分段放电 | 预计本轮净赚：A${1}',
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

    // 视图切换
    view_map: '资产分布图',
    view_cards: '资产卡片',
    view_list: '资产列表',
    add_station: '添加电站',
    add_device: '添加设备',
    station_name: '电站名称',
    power_capacity: '功率 / 容量',
    power_mw: '功率 (MW)',
    capacity_mwh: '容量 (MWh)',
    select_timezone: '时区',
    select_region: '区域',
    latitude: '纬度',
    longitude: '经度',
    cancel: '取消',
    confirm_charge: '确认充电',
    confirm_discharge: '确认放电',
    confirm_charge_desc: '确定要执行充电操作吗？此过程将消耗电网电力。',
    confirm_discharge_desc: '确定要执行放电操作吗？此过程将向电网售电。',
    charge_warning: '将开始对所有连接设备进行充电操作，此过程将消耗电网电力。',
    discharge_warning: '将开始对所有连接设备进行放电操作，此过程将向电网售电。',
    station_capacity: '额定容量',
    est_charge_cost: '预计充电成本',
    est_discharge_revenue: '预计放电收入',
    est_charge_time: '预计充满时间',
    est_discharge_time: '预计放完时间',
    current_soc: '当前电量',
    confirm_add: '创建电站',
    device_name: '设备名称',
    device_type: '设备类型',
    device_version: '版本号',
    add_device_btn: '添加',
    sync_from_device: '从设备同步',
    sync_success: '已从设备同步',
    sync_no_device: '无可同步的 PCS/BMS 设备',
    contract_capacity: '合同容量',
    live_capacity: '实际容量',
    capacity_mismatch: '⚠ 容量偏差超过5%',
    rated_power: '额定功率',
    rated_capacity: '额定容量',
    manage: '管理',
    monitor: '监控',
    alarm: '告警',
    today_revenue: '今日收益',
    lease_expiry: '租约到期',
    no_alarms: '无告警',

    // 电站详情
    tab_overview: '总览',
    tab_devices: '设备',
    tab_history: '历史',
    tab_reports: '报表',
    energy_flow: '能量流',
    grid_label: '电网',
    bess_label: '储能',
    load_label: '负载',
    back_to_list: '返回',

    // 移动端
    menu: '菜单',

    // 告警管理
    menu_alarms: '告警管理',
    btn_ack: '确认告警',
    btn_resolve: '修复缺陷',
    btn_detail: '详情',
    btn_handle: '处理',
    btn_batch_handle: '一键处理',
    status_active: '待确认',
    status_pending: '未处理',
    status_ack: '待修复',
    status_resolved: '已解决',
    alarm_critical: '严重',
    alarm_warning: '警告',
    alarm_title: '告警管理',
    alarm_hint_owner: '审查并处理所有电站的活跃告警',
    alarm_hint_operator: '您电站的活跃告警 — 确认后通知业主处理',
    alarm_col_station: '电站',
    alarm_col_level: '级别',
    alarm_col_desc: '描述',
    alarm_col_time: '触发时间',
    alarm_col_status: '状态',
    alarm_col_action: '操作',
    alarm_col_ack_by: '确认人',
    alarm_col_resolved_by: '处理人',
    alarm_ack_success: '告警已确认',
    alarm_resolved_success: '告警已修复',
    no_alarms_active: '暂无活跃告警',
    no_alarms_hint: '所有系统运行正常',
    awaiting_resolve: '待业主处理',
    alarm_col_code: '故障码',
    alarm_col_device: '告警设备',
    alarm_col_code: '故障码',
    alarm_col_duration: '持续时长',
    alarm_col_duration: '处理时长',
    alarm_col_root_cause: '建议处理方式',
    alarm_col_resolve_time: '恢复时间',
    alarm_filter_all: '全部',
    alarm_filter_search: '搜 索',
    alarm_filter_reset: '重置',
    alarm_resolve_title: '修复告警',
    alarm_resolve_cause: '根因归属',
    alarm_resolve_note: '备注（选填）',
    alarm_resolve_confirm: '确认修复',
    alarm_resolve_cancel: '取消',
    cause_hardware: '硬件故障',
    cause_software: '软件缺陷',
    cause_environment: '环境因素',
    alarm_msg_temp: 'BMS 高温告警 — 电芯温度超过 {0}°C（峰值放电期间）',
    alarm_msg_soc: '电池低电量告警 — 荷电状态低于 10%（{0}%）',
    no_devices: '暂无设备',
    coming_soon: '即将上线',
    core_device: '核心设备',
    device_ems: 'EMS 控制器',
    device_meter: '电表',
    device_transformer: '变压器',
    device_other: '其他',
    add_device_fail: '添加设备失败',
    portfolio_health: '资产健康度',
    asset_rental_rate: '资产租赁费率',
    monthly_rental: '月租金收入',
    status_label: '状态',
    avg_soh_desc: '{0} 个电站平均 SoH',
    rental_rate_desc: '{0} / {1} 电站已出租',
    annual_label: '年度: {0}',
    date_placeholder: '年-月-日',

    // 语言
    lang_switch: '中文',
    demo_accounts_hint: '演示账号：admin / op_a / op_b',
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
    lat: -32.9283,
    lng: 151.7817,
    timezone: 'Australia/Sydney',
    region: 'NSW',
    lease_start: '2025-01-01',
    lease_end: '2028-12-31',
    annual_fee: 850000,
    lease_status: 'Leased',
    devices: [
      { id: 'ems-01', name: 'EMS Controller', type: 'EMS', version: 'v1.0.2' },
      { id: 'pcs-01', name: 'PCS Unit 1', type: 'PCS', version: 'v2.3.1', rated_power: 5, rated_capacity: 10 }
    ],
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0, strategy: { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' },
    alarms: [
      {
        id: 'alm_init_1', type: 'HIGH_TEMP', severity: 'Critical',
        fault_code: 'BESS_T01', device_id: 'pcs-01',
        message: 'alarm_msg_temp|55',
        timestamp: formatLocalTime(Date.now() - 15*60*1000, 'Australia/Sydney'),
        created_ms: Date.now() - 15*60*1000,
        status: 'ACTIVE',
        ack_by: null, ack_at: null,
        resolved_by: null, resolved_at: null, resolved_ms: null,
        root_cause: null
      }
    ]
  },
  {
    id: 'st_02',
    name: 'Melbourne West Power',
    owner: 'owner_1',
    operator_id: 'op_b',
    soh: 99.95,
    capacity: '2.5MW/5MWh',
    location: 'Geelong, VIC',
    lat: -38.1499,
    lng: 144.3617,
    timezone: 'Australia/Melbourne',
    region: 'VIC',
    lease_start: '2024-06-01',
    lease_end: '2027-05-31',
    annual_fee: 420000,
    lease_status: 'Leased',
    devices: [
      { id: 'ems-02', name: 'EMS Controller', type: 'EMS', version: 'v1.0.2' },
      { id: 'pcs-02', name: 'PCS Unit 1', type: 'PCS', version: 'v2.3.1', rated_power: 2.5, rated_capacity: 5 }
    ],
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0, strategy: { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' },
    alarms: [
      {
        id: 'alm_init_2', type: 'LOW_SOC', severity: 'Warning',
        fault_code: 'BESS_S01', device_id: 'ems-02',
        message: 'alarm_msg_soc|8.2',
        timestamp: formatLocalTime(Date.now() - 45*60*1000, 'Australia/Melbourne'),
        created_ms: Date.now() - 45*60*1000,
        status: 'ACKNOWLEDGED',
        ack_by: 'op_a', ack_at: formatLocalTime(Date.now() - 30*60*1000, 'Australia/Melbourne'),
        resolved_by: null, resolved_at: null, resolved_ms: null,
        root_cause: null
      }
    ]
  },
  {
    id: 'st_03',
    name: 'Brisbane Energy Hub',
    owner: 'owner_1',
    operator_id: 'op_a',
    soh: 99.99,
    capacity: '10MW/20MWh',
    location: 'Sunshine Coast, QLD',
    lat: -26.6500,
    lng: 153.0667,
    timezone: 'Australia/Brisbane',
    region: 'QLD',
    lease_start: '2025-02-15',
    lease_end: '2030-02-14',
    annual_fee: 1200000,
    lease_status: 'Leased',
    devices: [
      { id: 'ems-03', name: 'EMS Controller', type: 'EMS', version: 'v1.0.2' },
      { id: 'pcs-03', name: 'PCS Unit 1', type: 'PCS', version: 'v2.3.1', rated_power: 10, rated_capacity: 20 }
    ],
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0, strategy: { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' },
    alarms: [
      {
        id: 'alm_init_3', type: 'HIGH_TEMP', severity: 'Critical',
        fault_code: 'BESS_T02', device_id: 'pcs-03',
        message: 'alarm_msg_temp|58',
        timestamp: formatLocalTime(Date.now() - 2*3600*1000, 'Australia/Brisbane'),
        created_ms: Date.now() - 2*3600*1000,
        status: 'RESOLVED',
        ack_by: 'op_b', ack_at: formatLocalTime(Date.now() - 90*60*1000, 'Australia/Brisbane'),
        resolved_by: 'owner_1', resolved_at: formatLocalTime(Date.now() - 3600*1000, 'Australia/Brisbane'),
        resolved_ms: Date.now() - 3600*1000,
        root_cause: 'Environment'
      }
    ]
  },
  {
    id: 'st_04',
    name: 'Adelaide Storage A',
    owner: 'owner_1',
    operator_id: 'unassigned',
    soh: 100.0,
    capacity: '5MW/10MWh',
    location: 'Adelaide, SA',
    lat: -34.9285,
    lng: 138.6007,
    timezone: 'Australia/Adelaide',
    region: 'SA',
    lease_start: '-',
    lease_end: '-',
    annual_fee: 0,
    lease_status: 'Idle',
    devices: [
      { id: 'ems-04', name: 'EMS Controller', type: 'EMS', version: 'v1.0.2' },
      { id: 'pcs-04', name: 'PCS Unit 1', type: 'PCS', version: 'v2.3.1', rated_power: 5, rated_capacity: 10 }
    ],
    soc: 50, efficiency: 0.88, revenue_today: 0, status: 'IDLE', cumulative_mwh: 0, strategy: { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' },
    alarms: []
  }
];

// ============ 数据持久化 ============
const STATIONS_DATA_VERSION = 'v7_alarm_fields';

let stations = loadStations();

function loadStations() {
  const savedVersion = localStorage.getItem('stations_version');
  // 数据版本不匹配时清除旧缓存，使用最新默认数据
  if (savedVersion !== STATIONS_DATA_VERSION) {
    localStorage.removeItem('stations');
    localStorage.setItem('stations_version', STATIONS_DATA_VERSION);
    return JSON.parse(JSON.stringify(DEFAULT_STATIONS));
  }
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

// ============ Station CRUD ============

/**
 * 获取单个电站
 * @param {string} stationId
 * @returns {object|null}
 */
function getStation(stationId) {
  return stations.find(s => s.id === stationId) || null;
}

/**
 * 更新电站字段（合并式更新）
 * @param {string} stationId
 * @param {object} fields - 要更新的字段键值对
 * @returns {boolean}
 */
function updateStation(stationId, fields) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return false;
  Object.assign(station, fields);
  saveStations();
  return true;
}

/**
 * 添加设备到电站
 * @param {string} stationId
 * @param {object} device - { id, name, type, version }
 * @returns {boolean}
 */
function addDeviceToStation(stationId, device) {
  const station = stations.find(s => s.id === stationId);
  if (!station) return false;
  if (!station.devices) station.devices = [];
  // 防止重复 ID
  if (station.devices.some(d => d.id === device.id)) return false;
  station.devices.push(device);
  saveStations();
  return true;
}

/**
 * 从电站移除设备
 * @param {string} stationId
 * @param {string} deviceId
 * @returns {boolean}
 */
function removeDeviceFromStation(stationId, deviceId) {
  const station = stations.find(s => s.id === stationId);
  if (!station || !station.devices) return false;
  const idx = station.devices.findIndex(d => d.id === deviceId);
  if (idx === -1) return false;
  station.devices.splice(idx, 1);
  saveStations();
  return true;
}

/**
 * 添加新电站
 * @param {object} stationData - 完整电站对象
 * @returns {object} 新建的电站
 */
function addStation(stationData) {
  const newStation = Object.assign({
    id: 'st_' + String(stations.length + 1).padStart(2, '0'),
    owner: 'owner_1',
    operator_id: 'unassigned',
    soh: 100.0,
    lease_start: '-',
    lease_end: '-',
    annual_fee: 0,
    lease_status: 'Idle',
    devices: [],
    soc: 50,
    efficiency: 0.88,
    revenue_today: 0,
    status: 'IDLE',
    cumulative_mwh: 0,
    strategy: { charge_threshold: 50, discharge_threshold: 200, reserve_soc: 10, mode: 'auto' }
  }, stationData);
  stations.push(newStation);
  saveStations();
  return newStation;
}

/**
 * 从电站设备中获取主设备的额定参数
 * @param {Array} devices
 * @returns {{rated_power: number, rated_capacity: number}|null}
 */
function getDeviceRatedParams(devices) {
  if (!devices || !devices.length) return null;
  // 优先 PCS，其次 BMS
  const primary = devices.find(d => d.type === 'PCS') || devices.find(d => d.type === 'BMS');
  if (!primary || !primary.rated_power || !primary.rated_capacity) return null;
  return { rated_power: primary.rated_power, rated_capacity: primary.rated_capacity };
}

/**
 * 获取电站的 Live Capacity（设备实际读数）
 * @param {object} station
 * @returns {{live_mw: number, live_mwh: number}|null}
 */
function getStationLiveCapacity(station) {
  const params = getDeviceRatedParams(station.devices);
  if (!params) return null;
  return { live_mw: params.rated_power, live_mwh: params.rated_capacity };
}

/**
 * 检查合同容量与设备容量是否偏差超过阈值
 * @param {object} station
 * @param {number} threshold - 百分比，默认 5
 * @returns {{mismatch: boolean, contract_mw: number, contract_mwh: number, live_mw: number, live_mwh: number, deviation_pct: number}|null}
 */
function checkCapacityMismatch(station, threshold) {
  threshold = threshold || 5;
  const contract = parseCapacity(station.capacity);
  const live = getStationLiveCapacity(station);
  if (!live) return null;

  const devMW = Math.abs(contract.mw - live.live_mw) / contract.mw * 100;
  const devMWh = Math.abs(contract.mwh - live.live_mwh) / contract.mwh * 100;
  const maxDev = Math.max(devMW, devMWh);

  return {
    mismatch: maxDev > threshold,
    contract_mw: contract.mw,
    contract_mwh: contract.mwh,
    live_mw: live.live_mw,
    live_mwh: live.live_mwh,
    deviation_pct: Math.round(maxDev * 10) / 10
  };
}

// ============ 澳洲时区列表 ============
const AU_TIMEZONES = [
  { value: 'Australia/Sydney', label: 'AEST/AEDT - Sydney, NSW', region: 'NSW' },
  { value: 'Australia/Melbourne', label: 'AEST/AEDT - Melbourne, VIC', region: 'VIC' },
  { value: 'Australia/Brisbane', label: 'AEST - Brisbane, QLD', region: 'QLD' },
  { value: 'Australia/Adelaide', label: 'ACST/ACDT - Adelaide, SA', region: 'SA' },
  { value: 'Australia/Perth', label: 'AWST - Perth, WA', region: 'WA' },
  { value: 'Australia/Hobart', label: 'AEST/AEDT - Hobart, TAS', region: 'TAS' },
  { value: 'Australia/Darwin', label: 'ACST - Darwin, NT', region: 'NT' }
];

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
    station.lease_status = 'Leased';
  } else if (targetOpId === 'unassigned') {
    station.lease_status = 'Idle';
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
