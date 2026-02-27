/**
 * market-data.js - AEMO市场数据和价格分析
 * 基于参考文件的数据结构实现
 */

// ========== AEMO区域价格数据 ==========
const regionPrices = {
    'NSW': { current: 163, low: 120.50, high: 185.75, families: 120, power: '65kWh', profit: 3500 },
    'QLD': { current: 34, low: 110.00, high: 170.00, families: 90, power: '48kWh', profit: 2800 },
    'VIC': { current: 21, low: 115.50, high: 175.50, families: 100, power: '52kWh', profit: 3100 },
    'SA': { current: 403, low: 125.00, high: 190.00, families: 70, power: '38kWh', profit: 2200 },
    'TAS': { current: 390, low: 100.00, high: 160.00, families: 355, power: '32kWh', profit: 1835 }
};

// ========== 电池参数常量 ==========
const BATTERY_CONFIG = {
    POWER_MW: 2.5,           // 充放电功率 (MW)
    CAPACITY_MWH: 10,        // 电池容量 (MWh)
    INTERVAL_MIN: 5,         // 数据间隔 (分钟)
    SOC_MIN: 10,             // 最小SOC (%)
    SOC_MAX: 90,             // 最大SOC (%)
    EFFICIENCY: 0.85         // 充放电效率
};

// 计算每个时间间隔的充放电量
BATTERY_CONFIG.ENERGY_PER_INTERVAL = BATTERY_CONFIG.POWER_MW * (BATTERY_CONFIG.INTERVAL_MIN / 60);

// ========== 模拟AEMO时序数据 ==========
function generateMockAEMOData() {
    const now = new Date();
    const labels = [];
    const priceData = [];
    const demandData = [];
    
    // 生成24小时288个5分钟间隔的数据点
    for (let i = 0; i < 288; i++) {
        const time = new Date(now.getTime() - (287 - i) * 5 * 60 * 1000);
        labels.push(time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
        
        // 模拟价格波动（基于时间的正弦波 + 随机因子）
        const hour = time.getHours();
        let basePrice = 80;
        
        // 早峰 (6-9点)
        if (hour >= 6 && hour <= 9) {
            basePrice = 120 + Math.sin((hour - 6) * Math.PI / 3) * 60;
        }
        // 晚峰 (17-21点)  
        else if (hour >= 17 && hour <= 21) {
            basePrice = 140 + Math.sin((hour - 17) * Math.PI / 4) * 80;
        }
        // 夜间低谷 (23-5点)
        else if (hour >= 23 || hour <= 5) {
            basePrice = 40 + Math.random() * 20;
        }
        // 其他时间
        else {
            basePrice = 60 + Math.random() * 40;
        }
        
        // 添加随机波动
        const price = Math.max(5, basePrice + (Math.random() - 0.5) * 30);
        priceData.push(Math.round(price * 100) / 100);
        
        // 需求数据 (8000-12000 MW)
        const baseDemand = 9000;
        const demandVariation = Math.sin((hour * Math.PI) / 12) * 1500;
        const demand = baseDemand + demandVariation + (Math.random() - 0.5) * 500;
        demandData.push(Math.round(demand));
    }
    
    return { labels, priceData, demandData };
}

// ========== 获取当前最高价格区域 ==========
function getHighestPriceRegion() {
    let highestRegion = 'NSW';
    let highestPrice = regionPrices['NSW'].current;
    
    for (const [region, data] of Object.entries(regionPrices)) {
        if (data.current > highestPrice) {
            highestPrice = data.current;
            highestRegion = region;
        }
    }
    
    return { region: highestRegion, price: highestPrice };
}

// ========== AI分析算法 ==========
function generateAIAnalysis(aemoData, currentSOC = 50) {
    const { priceData } = aemoData;
    const currentIndex = Math.floor(priceData.length * 0.8); // 模拟当前时间
    const lookAhead = 48; // 未来4小时 (48 * 5分钟)
    
    // 分析未来价格趋势
    const futureWindow = priceData.slice(currentIndex, currentIndex + lookAhead);
    const currentPrice = priceData[currentIndex] || 80;
    
    // 找最低价时段 (充电)
    let minPrice = Math.min(...futureWindow);
    let minIndex = futureWindow.indexOf(minPrice) + currentIndex;
    
    // 找最高价时段 (放电)  
    let maxPrice = Math.max(...futureWindow);
    let maxIndex = futureWindow.indexOf(maxPrice) + currentIndex;
    
    // 计算套利潜力
    const arbitrageSpread = maxPrice - minPrice;
    const potentialProfit = arbitrageSpread * BATTERY_CONFIG.ENERGY_PER_INTERVAL * BATTERY_CONFIG.EFFICIENCY;
    
    // 生成决策
    let decision = 'HOLD';
    let confidence = 'Medium';
    let targetSOC = currentSOC;
    let executeTime = null;
    
    if (arbitrageSpread > 50 && currentSOC > 30) {
        decision = 'DISCHARGE';
        confidence = arbitrageSpread > 100 ? 'High' : 'Medium';
        targetSOC = Math.max(BATTERY_CONFIG.SOC_MIN, currentSOC - 20);
        executeTime = aemoData.labels[maxIndex];
    } else if (currentPrice < 60 && currentSOC < 70) {
        decision = 'CHARGE';
        confidence = currentPrice < 40 ? 'High' : 'Medium';  
        targetSOC = Math.min(BATTERY_CONFIG.SOC_MAX, currentSOC + 30);
        executeTime = aemoData.labels[minIndex];
    }
    
    return {
        decision,
        confidence,
        currentPrice,
        minPrice,
        maxPrice,
        arbitrageSpread,
        potentialProfit,
        targetSOC,
        executeTime,
        trend: currentPrice > minPrice ? 'Rising' : 'Falling',
        analysis: {
            priceLevel: currentPrice > 100 ? 'High' : currentPrice < 50 ? 'Low' : 'Medium',
            volatility: arbitrageSpread > 80 ? 'High' : arbitrageSpread < 30 ? 'Low' : 'Medium',
            forecast: maxPrice > currentPrice ? 'Up' : 'Down'
        }
    };
}

// ========== 更新市场横幅 ==========
function updateMarketBanner(regionKey = 'NSW') {
    const region = regionPrices[regionKey] || regionPrices['NSW'];
    const highest = getHighestPriceRegion();
    
    // 更新主要价格信息
    const updateElement = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    updateElement('currentPrice', `$${region.current.toFixed(2)}`);
    updateElement('todayLow', `$${region.low.toFixed(2)}`);
    updateElement('todayHigh', `$${region.high.toFixed(2)}`);
    updateElement('regionIndicator', regionKey);
    updateElement('highestPriceRegion', `${highest.region}: $${highest.price}`);
    
    // 更新价格趋势指示器
    const trendEl = document.getElementById('priceTrend');
    if (trendEl) {
        const isHigh = region.current > 100;
        trendEl.className = `badge ${isHigh ? 'badge-error' : region.current < 50 ? 'badge-success' : 'badge-warning'}`;
        trendEl.textContent = isHigh ? '高价' : region.current < 50 ? '低价' : '中价';
    }
}

// ========== 渲染AI分析面板 ==========
function renderAIAnalysisPanel() {
    const mockData = generateMockAEMOData();
    const analysis = generateAIAnalysis(mockData);
    
    return `
        <div class="card ai-analysis-panel" style="background: linear-gradient(135deg, rgba(0,255,136,0.05), rgba(0,170,255,0.05));">
            <div class="card-header">
                <div class="flex flex-between">
                    <h3 class="text-lg font-semibold">AI 决策引擎</h3>
                    <span class="badge badge-success pulse">实时分析</span>
                </div>
            </div>
            <div class="card-body">
                <div class="grid grid-2 gap-md">
                    <div class="analysis-item">
                        <div class="flex flex-center gap-sm">
                            <span class="text-2xl">⚡</span>
                            <div>
                                <div class="text-sm text-secondary">计划操作</div>
                                <div class="text-lg font-semibold badge badge-${analysis.decision === 'CHARGE' ? 'success' : analysis.decision === 'DISCHARGE' ? 'warning' : 'secondary'}">${analysis.decision}</div>
                            </div>
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="flex flex-center gap-sm">
                            <span class="text-2xl">📈</span>
                            <div>
                                <div class="text-sm text-secondary">套利价差</div>
                                <div class="text-lg font-semibold">$${analysis.arbitrageSpread.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="flex flex-center gap-sm">
                            <span class="text-2xl">💰</span>
                            <div>
                                <div class="text-sm text-secondary">预期收益</div>
                                <div class="text-lg font-semibold">$${analysis.potentialProfit.toFixed(0)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="analysis-item">
                        <div class="flex flex-center gap-sm">
                            <span class="text-2xl">🎯</span>
                            <div>
                                <div class="text-sm text-secondary">置信度</div>
                                <div class="text-lg font-semibold badge badge-${analysis.confidence.toLowerCase() === 'high' ? 'success' : 'warning'}">${analysis.confidence}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${analysis.executeTime ? `
                <div class="analysis-schedule" style="margin-top: 16px; padding: 12px; background: rgba(0,255,136,0.1); border-radius: 8px;">
                    <div class="text-sm font-semibold">执行时间</div>
                    <div class="text-lg">${analysis.executeTime}</div>
                </div>
                ` : ''}
                
                <div class="analysis-details" style="margin-top: 16px; font-size: 12px; color: var(--color-text-secondary);">
                    <div>价格趋势: <span class="font-semibold">${analysis.trend}</span></div>
                    <div>当前价格: <span class="font-semibold">$${analysis.currentPrice.toFixed(2)}</span></div>
                    <div>价格区间: $${analysis.minPrice.toFixed(2)} - $${analysis.maxPrice.toFixed(2)}</div>
                </div>
            </div>
        </div>
    `;
}

// ========== 导出接口 ==========
window.MarketData = {
    regionPrices,
    BATTERY_CONFIG,
    generateMockAEMOData,
    getHighestPriceRegion,
    generateAIAnalysis,
    updateMarketBanner,
    renderAIAnalysisPanel
};