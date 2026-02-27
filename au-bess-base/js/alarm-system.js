/**
 * alarm-system.js - 告警系统
 * 基于fault-alarm.html的设计实现
 */

// ========== 告警等级和状态定义 ==========
const ALARM_LEVELS = {
    WARNING: 'warning',
    DANGER: 'danger',
    INFO: 'info'
};

const ALARM_STATUS = {
    UNPROCESSED: 'unprocessed',
    PROCESSED: 'processed', 
    RECOVERED: 'recovered'
};

// ========== 告警类型定义 ==========
const ALARM_TYPES = {
    BATTERY: {
        SOC_LOW: { code: 'BAT001', name: 'SOC过低', level: ALARM_LEVELS.WARNING },
        SOC_HIGH: { code: 'BAT002', name: 'SOC过高', level: ALARM_LEVELS.WARNING },
        TEMP_HIGH: { code: 'BAT003', name: '电池温度过高', level: ALARM_LEVELS.DANGER },
        VOLTAGE_FAULT: { code: 'BAT004', name: '电池电压异常', level: ALARM_LEVELS.DANGER },
        CURRENT_FAULT: { code: 'BAT005', name: '电池电流异常', level: ALARM_LEVELS.DANGER }
    },
    INVERTER: {
        COMM_FAULT: { code: 'INV001', name: '逆变器通信故障', level: ALARM_LEVELS.DANGER },
        TEMP_HIGH: { code: 'INV002', name: '逆变器温度过高', level: ALARM_LEVELS.WARNING },
        OUTPUT_FAULT: { code: 'INV003', name: '逆变器输出异常', level: ALARM_LEVELS.DANGER }
    },
    SYSTEM: {
        GRID_FREQ: { code: 'SYS001', name: '电网频率异常', level: ALARM_LEVELS.DANGER },
        GRID_VOLTAGE: { code: 'SYS002', name: '电网电压异常', level: ALARM_LEVELS.DANGER },
        PROTECTION: { code: 'SYS003', name: '保护动作', level: ALARM_LEVELS.DANGER },
        COMM_TIMEOUT: { code: 'SYS004', name: '通信超时', level: ALARM_LEVELS.WARNING }
    },
    FCAS: {
        SERVICE_FAIL: { code: 'FCAS001', name: 'FCAS服务失效', level: ALARM_LEVELS.WARNING },
        RESPONSE_SLOW: { code: 'FCAS002', name: 'FCAS响应延迟', level: ALARM_LEVELS.INFO }
    }
};

// ========== 生成模拟告警数据 ==========
function generateMockAlarms(count = 50) {
    const alarms = [];
    const stations = ['Hornsdale Power Reserve', 'Victorian Big Battery', 'Wallgrove BESS', 'Wandoan South BESS', 'Bouldercombe BESS'];
    const allAlarmTypes = Object.values(ALARM_TYPES).reduce((acc, category) => [...acc, ...Object.values(category)], []);
    
    for (let i = 1; i <= count; i++) {
        const alarmType = allAlarmTypes[Math.floor(Math.random() * allAlarmTypes.length)];
        const station = stations[Math.floor(Math.random() * stations.length)];
        
        // 生成告警时间 (最近7天内)
        const alarmTime = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
        
        // 生成处理时间 (部分告警已处理)
        let processTime = null;
        let status = ALARM_STATUS.UNPROCESSED;
        
        const rand = Math.random();
        if (rand < 0.4) { // 40%已处理
            processTime = new Date(alarmTime.getTime() + Math.random() * 2 * 60 * 60 * 1000); // 2小时内处理
            status = ALARM_STATUS.PROCESSED;
        } else if (rand < 0.6) { // 20%已恢复
            processTime = new Date(alarmTime.getTime() + Math.random() * 4 * 60 * 60 * 1000); // 4小时内恢复
            status = ALARM_STATUS.RECOVERED;
        }
        
        // 生成告警详细信息
        const details = generateAlarmDetails(alarmType, station);
        
        alarms.push({
            id: `ALARM_${Date.now()}_${i}`,
            code: alarmType.code,
            name: alarmType.name,
            level: alarmType.level,
            status: status,
            station: station,
            description: details.description,
            value: details.value,
            threshold: details.threshold,
            unit: details.unit,
            alarmTime: alarmTime,
            processTime: processTime,
            operator: processTime ? ['李怡悦', '王乐康', '张三', '李四'][Math.floor(Math.random() * 4)] : null,
            remarks: processTime ? details.remarks : null
        });
    }
    
    // 按时间排序 (最新的在前)
    return alarms.sort((a, b) => b.alarmTime - a.alarmTime);
}

// ========== 生成告警详细信息 ==========
function generateAlarmDetails(alarmType, station) {
    const details = {
        description: '',
        value: null,
        threshold: null,
        unit: '',
        remarks: null
    };
    
    switch (alarmType.code) {
        case 'BAT001': // SOC过低
            details.value = (5 + Math.random() * 10).toFixed(1);
            details.threshold = '15.0';
            details.unit = '%';
            details.description = `电池SOC降至${details.value}%，低于设定阈值`;
            details.remarks = '已调整充电策略，SOC已恢复至安全范围';
            break;
            
        case 'BAT002': // SOC过高
            details.value = (92 + Math.random() * 7).toFixed(1);
            details.threshold = '90.0';
            details.unit = '%';
            details.description = `电池SOC升至${details.value}%，超过设定阈值`;
            details.remarks = '已停止充电，启动放电程序';
            break;
            
        case 'BAT003': // 电池温度过高
            details.value = (65 + Math.random() * 15).toFixed(1);
            details.threshold = '60.0';
            details.unit = '℃';
            details.description = `电池温度达到${details.value}℃，超过安全阈值`;
            details.remarks = '已启动强制散热，降低充放电功率';
            break;
            
        case 'BAT004': // 电池电压异常
            details.value = (520 + Math.random() * 80).toFixed(0);
            details.threshold = '500-600';
            details.unit = 'V';
            details.description = `电池电压${details.value}V，超出正常范围`;
            details.remarks = '已隔离异常电池模组，系统继续运行';
            break;
            
        case 'INV001': // 逆变器通信故障
            details.description = '逆变器#2通信中断，无法接收控制指令';
            details.remarks = '已重启通信模块，恢复正常通信';
            break;
            
        case 'INV002': // 逆变器温度过高
            details.value = (85 + Math.random() * 15).toFixed(1);
            details.threshold = '80.0';
            details.unit = '℃';
            details.description = `逆变器温度${details.value}℃，超过警戒线`;
            details.remarks = '已增强冷却，温度已降至正常范围';
            break;
            
        case 'SYS001': // 电网频率异常
            details.value = (49.5 + Math.random()).toFixed(2);
            details.threshold = '49.8-50.2';
            details.unit = 'Hz';
            details.description = `电网频率${details.value}Hz，偏离正常范围`;
            details.remarks = '频率已恢复正常，系统自动重新并网';
            break;
            
        case 'SYS002': // 电网电压异常
            details.value = (415 + Math.random() * 50).toFixed(0);
            details.threshold = '380-420';
            details.unit = 'V';
            details.description = `电网电压${details.value}V，超出运行范围`;
            details.remarks = '电压已恢复至正常范围';
            break;
            
        case 'FCAS001': // FCAS服务失效
            details.description = 'FCAS快速频率响应服务无法正常提供';
            details.remarks = '已重启FCAS控制器，服务已恢复';
            break;
            
        default:
            details.description = `${station}发生${alarmType.name}`;
            details.remarks = '告警已处理，系统运行正常';
    }
    
    return details;
}

// ========== 告警统计 ==========
function getAlarmStatistics(alarms) {
    const stats = {
        total: alarms.length,
        unprocessed: 0,
        processed: 0,
        recovered: 0,
        warning: 0,
        danger: 0,
        info: 0,
        today: 0,
        thisWeek: 0
    };
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    alarms.forEach(alarm => {
        // 状态统计
        stats[alarm.status]++;
        
        // 等级统计
        stats[alarm.level]++;
        
        // 时间统计
        if (alarm.alarmTime >= todayStart) {
            stats.today++;
        }
        if (alarm.alarmTime >= weekStart) {
            stats.thisWeek++;
        }
    });
    
    return stats;
}

// ========== 渲染告警徽章 ==========
function renderAlarmBadge(level) {
    const badgeClasses = {
        [ALARM_LEVELS.WARNING]: 'badge-warning',
        [ALARM_LEVELS.DANGER]: 'badge-error', 
        [ALARM_LEVELS.INFO]: 'badge-accent'
    };
    
    const badgeTexts = {
        [ALARM_LEVELS.WARNING]: '警告',
        [ALARM_LEVELS.DANGER]: '危险',
        [ALARM_LEVELS.INFO]: '信息'
    };
    
    return `<span class="badge ${badgeClasses[level]}">${badgeTexts[level]}</span>`;
}

// ========== 渲染状态徽章 ==========
function renderStatusBadge(status) {
    const badgeClasses = {
        [ALARM_STATUS.UNPROCESSED]: 'badge-warning',
        [ALARM_STATUS.PROCESSED]: 'badge-success',
        [ALARM_STATUS.RECOVERED]: 'badge-accent'
    };
    
    const badgeTexts = {
        [ALARM_STATUS.UNPROCESSED]: '未处理',
        [ALARM_STATUS.PROCESSED]: '已处理', 
        [ALARM_STATUS.RECOVERED]: '已恢复'
    };
    
    return `<span class="badge ${badgeClasses[status]}">${badgeTexts[status]}</span>`;
}

// ========== 渲染告警卡片 ==========
function renderAlarmCard(alarm) {
    const levelClass = alarm.level === ALARM_LEVELS.DANGER ? 'border-red-500/50' : 
                      alarm.level === ALARM_LEVELS.WARNING ? 'border-yellow-500/50' : 'border-blue-500/50';
    
    return `
        <div class="card alarm-card ${levelClass}" style="border-left: 4px solid;">
            <div class="card-body">
                <div class="flex flex-between">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="font-mono text-sm text-secondary">${alarm.code}</span>
                            ${renderAlarmBadge(alarm.level)}
                            ${renderStatusBadge(alarm.status)}
                        </div>
                        <h4 class="font-semibold mb-1">${alarm.name}</h4>
                        <p class="text-sm text-secondary mb-2">${alarm.station}</p>
                        <p class="text-sm">${alarm.description}</p>
                        
                        ${alarm.value ? `
                        <div class="mt-2 text-sm">
                            <span class="text-secondary">当前值: </span>
                            <span class="font-semibold">${alarm.value}${alarm.unit}</span>
                            ${alarm.threshold ? `<span class="text-secondary"> (阈值: ${alarm.threshold}${alarm.unit})</span>` : ''}
                        </div>
                        ` : ''}
                    </div>
                    <div class="text-right text-sm text-secondary">
                        <div>${alarm.alarmTime.toLocaleDateString()}</div>
                        <div>${alarm.alarmTime.toLocaleTimeString()}</div>
                        ${alarm.processTime ? `
                        <div class="mt-2 text-xs">
                            处理: ${alarm.processTime.toLocaleTimeString()}
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                ${alarm.remarks ? `
                <div class="mt-3 p-2 bg-success/10 rounded text-sm">
                    <strong>处理备注:</strong> ${alarm.remarks}
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ========== 渲染告警统计面板 ==========
function renderAlarmStatsPanel(stats) {
    return `
        <div class="card">
            <div class="card-header">
                <h3 class="section-title">告警统计</h3>
            </div>
            <div class="card-body">
                <div class="grid grid-4 gap-md">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-warning">${stats.unprocessed}</div>
                        <div class="text-sm text-secondary">未处理</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-success">${stats.processed}</div>
                        <div class="text-sm text-secondary">已处理</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-accent">${stats.recovered}</div>
                        <div class="text-sm text-secondary">已恢复</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold">${stats.today}</div>
                        <div class="text-sm text-secondary">今日新增</div>
                    </div>
                </div>
                
                <div class="grid grid-3 gap-md mt-4">
                    <div class="text-center">
                        <div class="text-lg font-semibold badge-error">${stats.danger}</div>
                        <div class="text-sm text-secondary">危险</div>
                    </div>
                    <div class="text-center">
                        <div class="text-lg font-semibold badge-warning">${stats.warning}</div>
                        <div class="text-sm text-secondary">警告</div>
                    </div>
                    <div class="text-center">
                        <div class="text-lg font-semibold badge-accent">${stats.info}</div>
                        <div class="text-sm text-secondary">信息</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ========== 导出接口 ==========
window.AlarmSystem = {
    ALARM_LEVELS,
    ALARM_STATUS,
    ALARM_TYPES,
    generateMockAlarms,
    getAlarmStatistics,
    renderAlarmBadge,
    renderStatusBadge,
    renderAlarmCard,
    renderAlarmStatsPanel
};