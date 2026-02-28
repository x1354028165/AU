
                    (function() {
                        const d = new Date();
                        d.setDate(d.getDate() - 1);
                        const pad = n => String(n).padStart(2, '0');
                        const ts = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' 23:59:59';
                        const isEn = window.i18n?.currentLanguage?.startsWith('en');
                        document.getElementById('dataCutoffLabel').textContent = (isEn ? '* Data as of ' : '* 统计截止 ') + ts;
                    })();
                


        // ===== 全局变量初始化 =====
        // 初始化时间段数组，确保在任何地方都能访问
        window.chargeTimeSegments = window.chargeTimeSegments || [{ start: '22:00', end: '06:00' }];
        window.dischargeTimeSegments = window.dischargeTimeSegments || [{ start: '16:00', end: '21:00' }];
        
        // 声明时间段变量
        let chargeTimeSegments = [...window.chargeTimeSegments];
        let dischargeTimeSegments = [...window.dischargeTimeSegments];
        
        // Safe DOM text setter (prevents crash when element is removed)
        function safeSetText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

        // Global variables
        let marketChart, powerChart, performanceChart, mapChart, powerRevenueChart;
        let powerChartTimeSelector, currentOperation = null;
        let activatedDevices = 0, totalDevices = 500, chartUpdateInterval;
        let pendingOperation = null, previousPanel = null;

        // AEMO数据 - 从AEMO.xlsx文件中读取的真实数据（每5分钟一个数据点，共288个）
        let aemoTimeLabels, aemoRealPriceData, aemoRealDemandData;
        
        // Auto operation variables
        let currentOperationMode = 'auto'; // 'manual' or 'auto' - default to auto
        let latestAIForecast = { bestCharge: null, bestDischarge: null }; // AI预测结果缓存
        let autoSettings = {
            charge: {
                // 新设计:多组独立的充电计划(分时多阶充电策略)
                plans: [
                    {
                        id: 'charge_plan_' + Date.now() + '_1',
                        enabled: true,
                        timeRange: { start: '22:00', end: '06:00' },
                        priceThreshold: 50,
                        priceEnabled: true
                    }
                ],
                stopSOC: 90 // 全局充电停止SOC
            },
            discharge: {
                // 新设计:多组独立的放电计划(分时多阶放电策略)
                plans: [
                    {
                        id: 'plan_' + Date.now() + '_1',
                        enabled: true,
                        timeRange: { start: '16:00', end: '21:00' },
                        priceThreshold: 100,
                        priceEnabled: true
                    }
                ],
                stopSOC: 20 // 全局放电停止SOC
            }
        };
        let autoCheckInterval = null;

        // 今日充放电数据追踪
        let todayChargeData = { energy: 0, cost: 0 };    // 单位: MWh, $
        let todayDischargeData = { energy: 0, revenue: 0 }; // 单位: MWh, $
        // 注意: BATTERY_CAPACITY_MWH 已在 line ~5919 全局定义，此处直接复用

        function updateTodayCard() {
            const ce = document.getElementById('todayChargeEnergy');
            const cc = document.getElementById('todayChargeCost');
            const de = document.getElementById('todayDischargeEnergy');
            const dr = document.getElementById('todayDischargeRevenue');
            if (ce) ce.textContent = todayChargeData.energy.toFixed(2) + ' MWh';
            if (cc) cc.textContent = '$' + todayChargeData.cost.toFixed(2);
            if (de) de.textContent = todayDischargeData.energy.toFixed(2) + ' MWh';
            if (dr) dr.textContent = '$' + todayDischargeData.revenue.toFixed(2);
        }

        // 同步 SOC 进度条和数值
        function updateSOCProgressBar() {
            const soc = getCurrentBatteryLevel();
            const socCard = document.getElementById('currentSOCCard');
            const socBar = document.getElementById('socProgressBar');
            if (socCard) socCard.textContent = Math.round(soc) + '%';
            if (socBar) socBar.style.width = soc + '%';
        }
        // 每 5 秒同步一次 SOC 进度条 + AI预测文本
        setInterval(() => {
            updateSOCProgressBar();
            updateAIPredictionText();
        }, 5000);

        // 操作启动时计算并累积今日数据（基于当前 SOC 和目标 SOC）
        function accumulateTodayData(operationType) {
            const currentSOC = getCurrentBatteryLevel();
            const price = getCurrentPrice();

            if (operationType === 'charge') {
                const targetSOC = autoSettings.charge.stopSOC || 90;
                const socRange = Math.max(0, targetSOC - currentSOC) / 100;
                const energyMWh = socRange * BATTERY_CAPACITY_MWH;
                todayChargeData.energy += energyMWh;
                todayChargeData.cost += energyMWh * price;
            } else if (operationType === 'discharge') {
                const stopSOC = autoSettings.discharge.stopSOC || 20;
                const socRange = Math.max(0, currentSOC - stopSOC) / 100;
                const energyMWh = socRange * BATTERY_CAPACITY_MWH;
                todayDischargeData.energy += energyMWh;
                todayDischargeData.revenue += energyMWh * price;
            }
            updateTodayCard();
        }
        
        // Auto operation functions
        function toggleAutoMode() {
            // 检查当前是否有正在进行的操作
            const operationStatus = getRegionOperationStatus(selectedMainRegion);
            const isOperationActive = operationStatus === 'charging' || operationStatus === 'discharging';
            
            if (isOperationActive) {
                // 显示提示信息，禁止切换
                showAutoSwitchDisabledTooltip();
                return;
            }
            
            const isCurrentlyAuto = currentOperationMode === 'auto';
            
            if (!isCurrentlyAuto) {
                // 切换到自动模式时，显示确认弹窗
                showAutoModeConfirmDialog();
            } else {
                // 从自动模式切换到手动模式，也显示确认弹窗
                showDisableAutoModeConfirmDialog();
            }
        }
        
        function showAutoModeConfirmDialog() {
            const i18n = window.i18n;

            // 创建确认弹窗
            const modal = document.createElement('div');
            modal.id = 'autoModeConfirmModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                z-index: 10005;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(15px) saturate(1.5);
                animation: fadeIn 0.3s ease;
            `;

            const modalContent = document.createElement('div');
            modalContent.style.cssText = `
                background: linear-gradient(145deg, #1e1e2e 0%, #252535 100%);
                border-radius: 16px;
                padding: 0;
                width: 520px;
                max-width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.1);
                animation: slideUp 0.3s ease;
            `;

            modalContent.innerHTML = `
                <div style="padding: 24px 28px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.02);">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">${i18n ? i18n.getText('confirmAutoMode') : '确认启用智能托管'}</h3>
                </div>

                <div style="padding: 24px 28px;">
                    <p style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin: 0 0 20px 0;">
                        ${i18n ? i18n.getText('autoModeDescription') : '启用后，AI将实时分析市场数据，自动寻找最优充放电时机，最大化您的收益。'}
                    </p>

                    <!-- AI 能力说明 - 2x2 网格 -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                        <div style="background: rgba(0, 255, 136, 0.05); border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 10px; padding: 14px;">
                            <div style="font-size: 20px; margin-bottom: 6px;">📊</div>
                            <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">${i18n ? i18n.getText('aiPriceAnalysis') : '实时价格分析'}</div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.5;">${i18n ? i18n.getText('aiPriceAnalysisDesc') : '持续监测AEMO现货价格与需求走势'}</div>
                        </div>
                        <div style="background: rgba(0, 255, 136, 0.05); border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 10px; padding: 14px;">
                            <div style="font-size: 20px; margin-bottom: 6px;">⚡</div>
                            <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">${i18n ? i18n.getText('aiSmartCharge') : '智能充电决策'}</div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.5;">${i18n ? i18n.getText('aiSmartChargeDesc') : '自动识别低价窗口，以最低成本完成充电'}</div>
                        </div>
                        <div style="background: rgba(255, 193, 7, 0.05); border: 1px solid rgba(255, 193, 7, 0.15); border-radius: 10px; padding: 14px;">
                            <div style="font-size: 20px; margin-bottom: 6px;">💰</div>
                            <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">${i18n ? i18n.getText('aiSmartDischarge') : '最优放电时机'}</div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.5;">${i18n ? i18n.getText('aiSmartDischargeDesc') : '精准捕捉高价时段放电，最大化馈网收益'}</div>
                        </div>
                        <div style="background: rgba(100, 180, 255, 0.05); border: 1px solid rgba(100, 180, 255, 0.15); border-radius: 10px; padding: 14px;">
                            <div style="font-size: 20px; margin-bottom: 6px;">🔋</div>
                            <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">${i18n ? i18n.getText('aiBatteryManage') : '电池健康管理'}</div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.5;">${i18n ? i18n.getText('aiBatteryManageDesc') : '智能管理SOC区间，兼顾收益与电池寿命'}</div>
                        </div>
                    </div>

                    <!-- 提示 -->
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px;">🤖</span>
                        <span style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">
                            ${i18n ? i18n.getText('aiCustodyHint') : 'AI将7×24小时持续运行，您可随时手动干预或关闭托管'}
                        </span>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 12px; padding: 20px 28px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                    <button onclick="closeAutoModeConfirmDialog()" style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                        ${i18n ? i18n.getText('cancel') : '取消'}
                    </button>
                    <button onclick="confirmEnableAutoMode()" style="background: linear-gradient(135deg, #00ff88, #00dd77); color: #000; padding: 10px 24px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.3s; border: none;">
                        ${i18n ? i18n.getText('confirmEnable') : '确认启用'}
                    </button>
                </div>
            `;
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            
            // 添加动画样式
            const style = document.createElement('style');
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        function closeAutoModeConfirmDialog() {
            const modal = document.getElementById('autoModeConfirmModal');
            if (modal) {
                modal.remove();
            }
        }
        
        function confirmEnableAutoMode() {
            closeAutoModeConfirmDialog();
            switchOperationMode('auto');
        }
        
        // 显示关闭自动模式确认弹窗
        function showDisableAutoModeConfirmDialog() {
            // 创建模态框
            const modal = document.createElement('div');
            modal.id = 'disableAutoModeConfirmModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.3s ease;
            `;
            
            const modalContent = document.createElement('div');
            modalContent.style.cssText = `
                background: linear-gradient(135deg, rgba(26, 26, 26, 0.98) 0%, rgba(40, 40, 40, 0.98) 100%);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                width: 480px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                animation: slideUp 0.3s ease;
                overflow: hidden;
            `;
            
            modalContent.innerHTML = `
                <div style="padding: 24px 28px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.02);">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">
                        ${window.i18n ? window.i18n.getText('confirmDisableAutoMode') : '确认关闭智能托管'}
                    </h3>
                </div>
                
                <div style="padding: 24px 28px;">
                    <div style="margin-bottom: 20px;">
                        <p style="color: rgba(255, 255, 255, 0.9); font-size: 14px; margin: 0 0 16px 0;">
                            ${window.i18n ? window.i18n.getText('disableAutoModeDescription') : '关闭智能托管后，AI将停止智能分析，您需要手动控制充放电。'}
                        </p>
                    </div>
                    
                    <!-- 警告提示 -->
                    <div style="background: rgba(255, 184, 0, 0.1); border: 1px solid rgba(255, 184, 0, 0.3); border-radius: 10px; padding: 12px; display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px;">
                        <span style="font-size: 16px; margin-top: 2px;">⚠️</span>
                        <div>
                            <p style="font-size: 13px; color: rgba(255, 184, 0, 0.9); margin: 0 0 4px 0; font-weight: 600;">
                                ${window.i18n ? window.i18n.getText('autoModeWarning') : '注意'}
                            </p>
                            <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin: 0;">
                                ${window.i18n ? window.i18n.getText('disableAutoModeWarning') : '关闭智能托管后，您可能会错过AI推荐的最佳充放电时机，影响收益。'}
                            </p>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 12px; padding: 20px 28px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                    <button onclick="closeDisableAutoModeConfirmDialog()" style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
                        ${window.i18n ? window.i18n.getText('cancel') : '取消'}
                    </button>
                    <button onclick="confirmDisableAutoMode()" style="background: linear-gradient(135deg, #ff6b6b, #ff5252); color: #fff; padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.3s; border: none;">
                        ${window.i18n ? window.i18n.getText('confirmDisable') : '确认关闭'}
                    </button>
                </div>
            `;
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
        }
        
        function closeDisableAutoModeConfirmDialog() {
            const modal = document.getElementById('disableAutoModeConfirmModal');
            if (modal) {
                modal.remove();
            }
        }
        
        function confirmDisableAutoMode() {
            closeDisableAutoModeConfirmDialog();
            switchOperationMode('manual');
        }
        
        // 显示自动开关禁用提示
        function showAutoSwitchDisabledTooltip() {
            const toggleSwitch = document.querySelector('.auto-toggle-switch');
            if (!toggleSwitch) return;
            
            // 移除现有的提示
            const existingTooltip = document.getElementById('autoSwitchTooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }
            
            // 创建提示元素
            const tooltip = document.createElement('div');
            tooltip.id = 'autoSwitchTooltip';
            tooltip.style.cssText = `
                position: absolute;
                top: -45px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                z-index: 10000;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            `;
            
            // 设置提示文本
            tooltip.textContent = window.i18n ? window.i18n.getText('pleaseStopCurrentMode') : '请先停止当前模式';
            
            // 添加到body而不是开关容器，使用固定定位
            const rect = toggleSwitch.getBoundingClientRect();
            tooltip.style.position = 'fixed';
            tooltip.style.top = (rect.top - 45) + 'px';
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.transform = 'translateX(-50%)';
            
            document.body.appendChild(tooltip);
            
            // 显示提示
            setTimeout(() => {
                tooltip.style.opacity = '1';
            }, 10);
            
            // 3秒后自动隐藏
            setTimeout(() => {
                tooltip.style.opacity = '0';
                setTimeout(() => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                }, 300);
            }, 3000);
        }
        
        function switchOperationMode(mode) {
            currentOperationMode = mode;

            const autoToggleKnob = document.getElementById('autoToggleKnob');
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            const toggleSwitch = document.querySelector('.auto-toggle-switch');
            const mainCircle = document.getElementById('mainPriceCircle');

            if (mode === 'manual') {
                // Update toggle switch to off position
                if (autoToggleKnob) {
                    autoToggleKnob.style.left = '2px';
                    autoToggleKnob.style.background = '#fff';
                }
                if (toggleSwitch) toggleSwitch.style.background = 'rgba(255,255,255,0.1)';

                // Show and enable action buttons in manual mode
                if (chargeBtn) {
                    chargeBtn.style.display = 'flex';
                    chargeBtn.disabled = false;
                    chargeBtn.style.opacity = '1';
                    chargeBtn.style.cursor = 'pointer';
                }
                if (dischargeBtn) {
                    dischargeBtn.style.display = 'flex';
                    dischargeBtn.disabled = false;
                    dischargeBtn.style.opacity = '1';
                    dischargeBtn.style.cursor = 'pointer';
                }

                // Stop auto check interval
                if (autoCheckInterval) {
                    clearInterval(autoCheckInterval);
                    autoCheckInterval = null;
                }

                // 如果当前正在运行自动操作，停止它
                if (currentOperation && (regionData[selectedMainRegion]?.status === 'autoCharge' || regionData[selectedMainRegion]?.status === 'autoDischarge')) {
                    stopOperation();
                }

                // 重置当前地区状态为无状态
                if (regionData[selectedMainRegion]) {
                    regionData[selectedMainRegion].status = 'none';
                    // 更新电站管理显示
                    updatePowerStationStatus(selectedMainRegion, 'none');
                    // 更新地区状态标记
                    updateRegionStatusDisplay();
                }

                // 重置地区操作状态以确保按钮显示
                updateRegionOperationStatus(selectedMainRegion, 'none');

                // 在手动模式下，大圆可以点击（如果有操作正在进行）
                if (mainCircle) {
                    mainCircle.style.cursor = 'pointer';
                }

                hideAICustodyPanel();

                // 隐藏预测文本
                updateAIPredictionText();

                // 隐藏机器人环绕动效
                const orbitBot = document.getElementById('aiOrbitRobot');
                const orbitTrack = document.getElementById('aiOrbitTrack');
                if (orbitBot) orbitBot.classList.remove('active');
                if (orbitTrack) orbitTrack.classList.remove('active');

            } else {
                // Update toggle switch to on position
                if (autoToggleKnob) {
                    autoToggleKnob.style.left = '22px';
                    autoToggleKnob.style.background = '#fff';
                }
                if (toggleSwitch) toggleSwitch.style.background = '#4CD964';

                // 如果当前正在进行手动操作，先停止它
                if (currentOperation && (regionData[selectedMainRegion]?.status === 'manualCharge' || regionData[selectedMainRegion]?.status === 'manualDischarge')) {
                    stopOperation();
                }

                // Hide action buttons in auto mode
                if (chargeBtn) chargeBtn.style.display = 'none';
                if (dischargeBtn) dischargeBtn.style.display = 'none';

                // Update conditions display
                updateAutoConditionsDisplay();

                // Start auto check interval
                startAutoOperationCheck();

                // 设置自动模式下的等待执行状态
                if (regionData[selectedMainRegion]) {
                    regionData[selectedMainRegion].status = 'waitingExecution';
                    updatePowerStationStatus(selectedMainRegion, 'waitingExecution');
                    // 更新地区状态标记
                    updateRegionStatusDisplay();
                }

                // 在自动模式下，大圆不可点击
                if (mainCircle) {
                    mainCircle.style.cursor = 'default';
                }

                // 在大圆内显示"等待执行中"状态
                updateCircleStatusDisplay();

                showAICustodyPanel();

                // 显示机器人环绕动效
                const orbitBot2 = document.getElementById('aiOrbitRobot');
                const orbitTrack2 = document.getElementById('aiOrbitTrack');
                if (orbitBot2) orbitBot2.classList.add('active');
                if (orbitTrack2) orbitTrack2.classList.add('active');

                // 显示预测文本
                updateAIPredictionText();
            }

            // Update stop button visibility after mode change
            updateStopButtonVisibility();
            
            // Update action buttons visibility after mode change
            updateActionButtonsVisibility();
        }
        
        // ========== AI 智能托管面板逻辑（基于 AEMO 预测价格） ==========
        let aiCustodyInterval = null;

        let aiMiniChartInstance = null;

        // Tab 切换：行情 / 分析
        function switchAemoTab(tab) {
            const marketPanel = document.getElementById('marketPanel');
            const analysisPanel = document.getElementById('analysisPanel');
            const tabMarket = document.getElementById('aemoTabMarket');
            const tabAnalysis = document.getElementById('aemoTabAnalysis');

            // 下划线 Tab 样式
            const activeStyle = { color: '#00ff88', borderBottom: '2px solid #00ff88' };
            const inactiveStyle = { color: 'rgba(255,255,255,0.45)', borderBottom: '2px solid transparent' };

            if (tab === 'market') {
                if (marketPanel) { marketPanel.classList.add('active'); marketPanel.style.display = ''; }
                if (analysisPanel) { analysisPanel.style.display = 'none'; }
                if (tabMarket) Object.assign(tabMarket.style, activeStyle);
                if (tabAnalysis) Object.assign(tabAnalysis.style, inactiveStyle);
                setTimeout(() => { if (marketChart && typeof marketChart.resize === 'function') marketChart.resize(); }, 50);
            } else if (tab === 'analysis') {
                if (marketPanel) { marketPanel.classList.remove('active'); marketPanel.style.display = 'none'; }
                if (analysisPanel) { analysisPanel.style.display = 'flex'; }
                if (tabMarket) Object.assign(tabMarket.style, inactiveStyle);
                if (tabAnalysis) Object.assign(tabAnalysis.style, activeStyle);
                setTimeout(() => { if (aiMiniChartInstance && typeof aiMiniChartInstance.resize === 'function') aiMiniChartInstance.resize(); }, 50);
                if (!aiCustodyInterval) runAIForecastAnalysis();
            }
        }

        function showAICustodyPanel() {
            const tabAnalysis = document.getElementById('aemoTabAnalysis');
            if (tabAnalysis) {
                tabAnalysis.disabled = false;
                tabAnalysis.style.opacity = '';
                tabAnalysis.style.cursor = 'pointer';
            }
            startAICustodyAnalysis();
            switchAemoTab('analysis');
        }

        function hideAICustodyPanel() {
            stopAICustodyAnalysis();
            switchAemoTab('market');
            const tabAnalysis = document.getElementById('aemoTabAnalysis');
            if (tabAnalysis) {
                tabAnalysis.disabled = true;
                tabAnalysis.style.color = 'rgba(255,255,255,0.2)';
                tabAnalysis.style.cursor = 'not-allowed';
            }
        }

        function startAICustodyAnalysis() {
            stopAICustodyAnalysis();
            runAIForecastAnalysis();
            aiCustodyInterval = setInterval(runAIForecastAnalysis, 1800000);
            startAICountdown();
        }

        function stopAICustodyAnalysis() {
            if (aiCustodyInterval) { clearInterval(aiCustodyInterval); aiCustodyInterval = null; }
            if (aiMiniChartInstance) { aiMiniChartInstance.dispose(); aiMiniChartInstance = null; }
        }

        function startAICountdown() {
            // 显示当前分析基于的时间点
            const isEn = window.i18n?.currentLanguage?.startsWith('en');
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const el = document.getElementById('aiAnalysisTime');
            if (el) el.textContent = isEn ? `Based on ${hh}:${mm} data` : `基于 ${hh}:${mm} 的数据分析`;
        }

        // 数字滚动动画
        function animateNumber(el, target, duration) {
            if (!el) return;
            duration = duration || 1500;
            const absTarget = Math.abs(target);
            const prefix = target >= 0 ? '$' : '-$';
            const startTime = performance.now();
            function tick(now) {
                const progress = Math.min((now - startTime) / duration, 1);
                const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                el.textContent = prefix + Math.round(absTarget * eased);
                if (progress < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        }

        /**
         * 核心算法：分析 AEMO 预测价格，生成充放电计划
         * 电池参数：功率 2.5MW，容量 10MWh
         * 每个 5 分钟时段可充/放电量：2.5 × (5/60) = 0.2083 MWh
         */
        const BATTERY_POWER_MW = 2.5;       // 充放电功率
        const BATTERY_CAPACITY_MWH = 10;    // 电池容量
        const INTERVAL_MIN = 5;             // 数据间隔（分钟）
        const ENERGY_PER_INTERVAL = BATTERY_POWER_MW * (INTERVAL_MIN / 60); // 0.2083 MWh

        function runAIForecastAnalysis() {
            if (!aemoRealPriceData || !aemoTimeLabels || aemoRealPriceData.length === 0) {
                return;
            }

            const isEn = window.i18n && window.i18n.currentLanguage && window.i18n.currentLanguage.startsWith('en');
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const roundedMinute = Math.floor(currentMinute / 5) * 5;
            const currentIdx = currentHour * 12 + (roundedMinute / 5);
            const currentPrice = aemoRealPriceData[Math.min(currentIdx, aemoRealPriceData.length - 1)];

            // --- 收集未来预测价格 ---
            const futureData = [];
            for (let i = currentIdx + 1; i < aemoRealPriceData.length; i++) {
                futureData.push({ idx: i, time: aemoTimeLabels[i], price: aemoRealPriceData[i] });
            }

            if (futureData.length === 0) {
                const cardsEl = document.getElementById('aiStrategyCards');
                if (cardsEl) cardsEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.65);font-size:13px;padding:16px;">${isEn ? 'Today\'s forecast data exhausted. Waiting for next day.' : '今日预测数据已结束，等待次日数据更新。'}</div>`;
                return;
            }

            // --- 计算分位数阈值 ---
            const sortedPrices = futureData.map(d => d.price).sort((a, b) => a - b);
            const p25 = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
            const p75 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];

            // --- 标记每个时段的动作 ---
            const tagged = futureData.map(d => ({
                ...d,
                action: d.price <= p25 ? 'charge' : d.price >= p75 ? 'discharge' : 'hold'
            }));

            // --- 合并连续相同动作的时段为窗口 ---
            const MERGE_GAP = 3;      // 同类窗口间隔 ≤ 3 个时段（15分钟）则合并
            const MIN_INTERVALS = 4;  // 窗口最少 4 个时段（20分钟），否则丢弃
            const rawWindows = [];
            let cur = null;
            for (const slot of tagged) {
                if (slot.action === 'hold') {
                    if (cur) { rawWindows.push(cur); cur = null; }
                    continue;
                }
                if (cur && cur.action === slot.action && slot.idx === cur.endIdx + 1) {
                    cur.endIdx = slot.idx;
                    cur.endTime = slot.time;
                    cur.prices.push(slot.price);
                } else {
                    if (cur) rawWindows.push(cur);
                    cur = {
                        action: slot.action,
                        startIdx: slot.idx,
                        endIdx: slot.idx,
                        startTime: slot.time,
                        endTime: slot.time,
                        prices: [slot.price]
                    };
                }
            }
            if (cur) rawWindows.push(cur);

            // 合并相近的同类窗口（间隔 ≤ 15分钟）
            const merged = [];
            for (const w of rawWindows) {
                const prev = merged[merged.length - 1];
                if (prev && prev.action === w.action && (w.startIdx - prev.endIdx) <= MERGE_GAP) {
                    // 补充间隔时段的价格
                    for (let i = prev.endIdx + 1; i < w.startIdx; i++) {
                        prev.prices.push(aemoRealPriceData[i]);
                    }
                    prev.prices.push(...w.prices);
                    prev.endIdx = w.endIdx;
                    prev.endTime = w.endTime;
                } else {
                    merged.push({ ...w, prices: [...w.prices] });
                }
            }

            // 过滤掉过短的窗口（< 20分钟）
            const windows = merged.filter(w => w.prices.length >= MIN_INTERVALS);

            // --- 计算每个窗口的均价、时长、电量、金额 ---
            windows.forEach(w => {
                w.avgPrice = w.prices.reduce((a, b) => a + b, 0) / w.prices.length;
                w.intervals = w.prices.length;
                w.durationMin = w.intervals * INTERVAL_MIN;
                // 电量受电池容量限制（单窗口最多充/放满整块电池）
                w.energyMWh = Math.min(w.intervals * ENERGY_PER_INTERVAL, BATTERY_CAPACITY_MWH);
                // 金额 = 电量 × 均价（充电是成本，放电是收入）
                w.amount = w.energyMWh * w.avgPrice;
                const endIdx = Math.min(w.endIdx + 1, aemoTimeLabels.length - 1);
                w.endTimeDisplay = aemoTimeLabels[endIdx];
            });

            // --- 找最佳充电窗口（最低均价）和最佳放电窗口（最高均价）---
            const chargeWindows = windows.filter(w => w.action === 'charge').sort((a, b) => a.avgPrice - b.avgPrice);
            const dischargeWindows = windows.filter(w => w.action === 'discharge').sort((a, b) => b.avgPrice - a.avgPrice);
            const bestCharge = chargeWindows[0];
            const bestDischarge = dischargeWindows[0];

            // 缓存AI预测结果供预测文本使用
            latestAIForecast.bestCharge = bestCharge || null;
            latestAIForecast.bestDischarge = bestDischarge || null;
            updateAIPredictionText();

            // ===== 渲染阶段：思考动画 → 写入数据 → 淡入 =====
            const cardsEl = document.getElementById('aiStrategyCards');
            const spreadEl = document.getElementById('aiEstSpread');
            const pulseEl = document.getElementById('aiPulse');
            const labelEl = document.getElementById('aiStatusLabel');
            const fadeTargets = [cardsEl];

            // 阶段一：进入"思考"状态
            fadeTargets.forEach(el => {
                if (el) { el.style.transition = 'filter 0.3s, opacity 0.3s'; el.style.filter = 'blur(3px)'; el.style.opacity = '0.5'; }
            });
            if (pulseEl) { pulseEl.style.background = '#5AC8FA'; pulseEl.style.boxShadow = '0 0 8px rgba(90,200,250,0.8), 0 0 16px rgba(90,200,250,0.3)'; }
            if (labelEl) labelEl.textContent = isEn ? 'AI Analyzing...' : 'AI 重新分析中...';

            // 阶段二（800ms 后）：写入新数据
            setTimeout(() => {
                // --- 模拟 SOC 变化（基于实际电池参数） ---
                // 2.5MW 功率，10MWh 容量，每5分钟充放 0.2083MWh = 2.083% SOC
                const SOC_PER_INTERVAL = (ENERGY_PER_INTERVAL / BATTERY_CAPACITY_MWH) * 100; // ≈2.083%
                const chargeStopSOC = autoSettings.charge.stopSOC || 90;
                const dischargeStopSOC = autoSettings.discharge.stopSOC || 20;
                const allWindowsSorted = [...windows].sort((a, b) => a.startIdx - b.startIdx);
                let simSOC = getCurrentBatteryLevel(); // 用实际当前电池 SOC
                allWindowsSorted.forEach(w => {
                    const socBefore = simSOC;
                    // 逐个时段模拟，受 SOC 上下限约束
                    for (let i = 0; i < w.intervals; i++) {
                        if (w.action === 'charge') {
                            if (simSOC >= chargeStopSOC) break;
                            simSOC = Math.min(simSOC + SOC_PER_INTERVAL, chargeStopSOC);
                        } else {
                            if (simSOC <= dischargeStopSOC) break;
                            simSOC = Math.max(simSOC - SOC_PER_INTERVAL, dischargeStopSOC);
                        }
                    }
                    w.socAfter = Math.round(simSOC);
                    // 真实金额 = SOC变化% × 电池容量 × 均价
                    const socChange = Math.abs(simSOC - socBefore) / 100;
                    const realEnergyMWh = socChange * BATTERY_CAPACITY_MWH;
                    w.amount = realEnergyMWh * w.avgPrice;
                });

                // --- 充放电策略双卡片（列出所有窗口 + SOC） ---
                if (cardsEl) {
                    const renderWindowList = (list, type) => {
                        const isC = type === 'charge';
                        const color = isC ? '#00ff88' : '#ffc107';
                        const bg = isC ? 'rgba(0,255,136,0.05)' : 'rgba(255,193,7,0.05)';
                        const border = isC ? 'rgba(0,255,136,0.18)' : 'rgba(255,193,7,0.18)';
                        const icon = isC
                            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`
                            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
                        const title = isEn ? (isC ? 'Charge' : 'Discharge') : (isC ? '充电' : '放电');
                        if (list.length === 0) {
                            return `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius: 10px;padding:14px;text-align:center;color:rgba(255,255,255,0.55);font-size:12px;">
                                <div style="margin-bottom:2px;">${icon}</div>${isEn ? 'No ' + title.toLowerCase() + ' window' : '无' + title + '窗口'}</div>`;
                        }
                        const sorted = list.sort((a, b) => a.startIdx - b.startIdx);
                        const rows = sorted.map(w =>
                            `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                                <span style="font-size:12px;color:rgba(255,255,255,0.85);font-family:'SF Mono',monospace;">${w.startTime}-${w.endTimeDisplay}</span>
                                <span style="font-size:12px;color:${color};font-weight:700;">$${w.avgPrice.toFixed(0)}</span>
                                <span style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:500;">${w.socAfter != null ? w.socAfter + '%' : '--'}</span>
                            </div>`
                        ).join('');
                        const totalAmount = sorted.reduce((sum, w) => sum + w.amount, 0);
                        const amountLabel = isC
                            ? (isEn ? 'Est. Cost' : '预计成本')
                            : (isEn ? 'Est. Revenue' : '预计收入');
                        const amountColor = isC ? '#00ff88' : '#ffc107';
                        return `<div style="background:${bg};border:1px solid ${border};border-radius: 10px;padding:12px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                                <div style="display:flex;align-items:center;gap:5px;">
                                    <span style="font-size:14px;">${icon}</span>
                                    <span style="font-size:14px;color:${color};font-weight:700;">${title}</span>
                                </div>
                                <span style="font-size:14px;font-weight:700;color:${amountColor};">$${totalAmount.toFixed(0)}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:0 0 4px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                                <span style="font-size:10px;color:rgba(255,255,255,0.55);font-weight:500;">${isEn ? 'Time' : '时间'}</span>
                                <span style="font-size:10px;color:rgba(255,255,255,0.55);font-weight:500;">${isEn ? 'Price' : '均价'}</span>
                                <span style="font-size:10px;color:rgba(255,255,255,0.55);font-weight:500;">SOC</span>
                            </div>
                            ${rows}
                        </div>`;
                    };
                    cardsEl.innerHTML = renderWindowList(chargeWindows, 'charge') + renderWindowList(dischargeWindows, 'discharge');
                }

                // --- ECharts 迷你价格走势图 ---
                const chartContainer = document.getElementById('aiMiniChart');
                if (chartContainer && typeof echarts !== 'undefined') {
                    if (!aiMiniChartInstance) {
                        aiMiniChartInstance = echarts.init(chartContainer, 'dark');
                    }
                    // 构造 markArea 数据（充放电窗口色块）
                    const markAreaData = windows.map(w => {
                        const isC = w.action === 'charge';
                        return [{
                            xAxis: w.startTime,
                            itemStyle: { color: isC ? 'rgba(0,255,136,0.08)' : 'rgba(255,193,7,0.08)' }
                        }, {
                            xAxis: w.endTimeDisplay
                        }];
                    });
                    // 构造 markPoint 数据（在线上标注 充/停/放/停）
                    const markPointData = [];
                    const sortedWindows = [...windows].sort((a, b) => a.startIdx - b.startIdx);
                    sortedWindows.forEach(w => {
                        const isC = w.action === 'charge';
                        const label = isEn ? (isC ? 'CHG' : 'DCH') : (isC ? '充' : '放');
                        const color = isC ? '#00ff88' : '#ffc107';
                        // 窗口起始点：标注「充」或「放」
                        markPointData.push({
                            coord: [w.startTime, aemoRealPriceData[w.startIdx]],
                            symbol: 'circle', symbolSize: 1,
                            label: {
                                show: true, formatter: label, fontSize: 12, fontWeight: 700,
                                color: color, offset: [0, -12],
                                textShadowColor: 'rgba(0,0,0,0.9)', textShadowBlur: 4
                            }
                        });
                        // 窗口结束点：标注「停」
                        const stopIdx = Math.min(w.endIdx + 1, aemoTimeLabels.length - 1);
                        markPointData.push({
                            coord: [aemoTimeLabels[stopIdx], aemoRealPriceData[stopIdx]],
                            symbol: 'circle', symbolSize: 1,
                            label: {
                                show: true, formatter: isEn ? 'STOP' : '停', fontSize: 12, fontWeight: 700,
                                color: 'rgba(255,255,255,0.7)', offset: [0, -12],
                                textShadowColor: 'rgba(0,0,0,0.9)', textShadowBlur: 4
                            }
                        });
                    });
                    // 电池成本线（全天 0-24h，充电累计均价动态变化）
                    const allPricesSorted = [...aemoRealPriceData].sort((a, b) => a - b);
                    const allP25 = allPricesSorted[Math.floor(allPricesSorted.length * 0.25)];
                    const batteryCostData = new Array(aemoRealPriceData.length).fill(0);
                    let totalChargeCost = 0, totalChargeEnergy = 0;
                    let lastCost = 0;
                    for (let i = 0; i < aemoRealPriceData.length; i++) {
                        const price = aemoRealPriceData[i];
                        if (price <= allP25) {
                            // 充电时段：累计成本和电量，负价拉低成本，正价推高成本
                            totalChargeCost += price * ENERGY_PER_INTERVAL;
                            totalChargeEnergy += ENERGY_PER_INTERVAL;
                            lastCost = totalChargeCost / totalChargeEnergy;
                        }
                        batteryCostData[i] = lastCost;
                    }
                    // 当前时间线
                    const nowTimeStr = aemoTimeLabels[Math.min(currentIdx, aemoTimeLabels.length - 1)];
                    aiMiniChartInstance.setOption({
                        backgroundColor: 'transparent',
                        grid: { left: 50, right: 16, top: 32, bottom: 32, containLabel: false },
                        tooltip: {
                            trigger: 'axis',
                            backgroundColor: 'rgba(0,0,0,0.85)',
                            borderColor: 'rgba(0,255,136,0.4)',
                            borderWidth: 1,
                            textStyle: { color: '#fff', fontSize: 12 },
                            formatter: function(params) {
                                let result = '<div style="font-weight:600;margin-bottom:4px;">' + params[0].axisValue + '</div>';
                                params.forEach(p => {
                                    if (p.value !== null && p.value !== undefined) {
                                        result += '<div>' + p.marker + ' $' + (typeof p.value === 'number' ? p.value.toFixed(2) : p.value) + '</div>';
                                    }
                                });
                                return result;
                            }
                        },
                        xAxis: {
                            type: 'category', data: aemoTimeLabels, boundaryGap: false,
                            axisLine: { show: false },
                            axisTick: { show: false },
                            axisLabel: {
                                show: true, fontSize: 11, color: 'rgba(255,255,255,0.65)',
                                interval: 23,
                                formatter: function(v) { return v; }
                            },
                            splitLine: { show: false }
                        },
                        yAxis: {
                            type: 'value',
                            scale: true,
                            axisLine: { show: false },
                            axisTick: { show: false },
                            axisLabel: { show: true, fontSize: 11, color: 'rgba(255,255,255,0.65)', formatter: '${value}' },
                            splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed', width: 1 } },
                            splitNumber: 4
                        },
                        series: [
                        {
                            // 实线：历史实际数据（当前时间及之前）
                            name: isEn ? 'Price' : '价格',
                            type: 'line', smooth: true, showSymbol: false,
                            data: aemoRealPriceData.map((v, i) => i <= currentIdx ? v : null),
                            lineStyle: { color: '#00ff88', width: 2 },
                            areaStyle: {
                                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(0,255,136,0.2)' },
                                    { offset: 1, color: 'rgba(0,255,136,0.01)' }
                                ])
                            },
                            markLine: {
                                silent: true, symbol: 'none',
                                lineStyle: { color: 'rgba(255,255,255,0.6)', type: 'dashed', width: 1 },
                                data: [{ xAxis: nowTimeStr }],
                                label: { show: true, position: 'end', formatter: nowTimeStr, fontSize: 11, color: 'rgba(255,255,255,0.7)' }
                            }
                        },
                        {
                            // 虚线：预测数据（当前时间之后）
                            name: isEn ? 'Forecast' : '预测',
                            type: 'line', smooth: true, showSymbol: false,
                            data: aemoRealPriceData.map((v, i) => i >= currentIdx ? v : null),
                            lineStyle: { color: 'rgba(0,255,136,0.7)', width: 2, type: 'dashed' },
                            areaStyle: {
                                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(0,255,136,0.12)' },
                                    { offset: 1, color: 'rgba(0,255,136,0.01)' }
                                ])
                            },
                            markArea: { silent: true, data: markAreaData },
                            markPoint: { silent: true, data: markPointData, animation: true }
                        },
                        {
                            // 电池成本线（充电累计均价，阶梯变化）
                            name: isEn ? 'Battery Cost' : '电池成本',
                            type: 'line', step: 'end', smooth: false, showSymbol: false,
                            z: 10,
                            data: batteryCostData,
                            lineStyle: { color: '#ff6b6b', width: 2, type: 'dotted' },
                            areaStyle: null,
                            markPoint: {
                                silent: true,
                                data: lastCost !== null ? [{
                                    coord: [aemoTimeLabels[aemoTimeLabels.length - 1], lastCost],
                                    symbol: 'circle', symbolSize: 1,
                                    label: {
                                        show: true, fontSize: 11, fontWeight: 600,
                                        formatter: (isEn ? 'Cost $' : '成本 $') + lastCost.toFixed(0),
                                        color: '#ff6b6b', offset: [0, -10],
                                        textShadowColor: 'rgba(0,0,0,0.9)', textShadowBlur: 4
                                    }
                                }] : []
                            }
                        }
                        ]
                    }, true);
                }

                // --- 预估利润（数字滚动动画） ---
                if (spreadEl) {
                    if (bestCharge && bestDischarge) {
                        // 利润 = 放电收入 - 充电成本（充电负价时成本为负，利润更高）
                        const totalChargeAmt = chargeWindows.reduce((s, w) => s + w.amount, 0);
                        const totalDischargeAmt = dischargeWindows.reduce((s, w) => s + w.amount, 0);
                        const profit = totalDischargeAmt - totalChargeAmt;
                        spreadEl.style.color = profit > 0 ? '#00ff88' : '#ff6b6b';
                        animateNumber(spreadEl, profit, 1500);
                    } else {
                        spreadEl.textContent = isEn ? 'Analyzing...' : '分析中...';
                        spreadEl.style.color = 'rgba(255,255,255,0.4)';
                    }
                }

                // --- 重置倒计时 ---
                startAICountdown();

                // 阶段三（400ms 后）：淡入新结果
                setTimeout(() => {
                    fadeTargets.forEach(el => {
                        if (el) { el.style.filter = 'none'; el.style.opacity = '1'; }
                    });
                    if (pulseEl) { pulseEl.style.background = '#00ff88'; pulseEl.style.boxShadow = '0 0 6px rgba(0,255,136,0.6), 0 0 14px rgba(0,255,136,0.25)'; }
                    if (labelEl) labelEl.textContent = isEn ? 'AI Active' : 'AI 分析中';
                }, 400);
            }, 800);
        }

        // Auto settings panel functions (no longer needed - using inline editing)
        function openAutoSettings() {
            // Settings are now edited inline, no need for modal
        }
        
        function closeAutoSettings() {
            // Settings are now edited inline, no need for modal
        }
        
        function saveAutoSettings() {
            // 适配新 plans[] 格式：将表单值写回第一个计划
            const timeStartEl = document.getElementById('autoStartTime');
            const timeEndEl = document.getElementById('autoEndTime');
            const priceValueEl = document.getElementById('autoPriceValue');
            const batteryValueEl = document.getElementById('autoBatteryValue');

            const chargePlan = autoSettings.charge.plans?.[0];
            if (chargePlan) {
                if (!chargePlan.timeRange) chargePlan.timeRange = {};
                chargePlan.timeRange.start = timeStartEl ? timeStartEl.value : '22:00';
                chargePlan.timeRange.end = timeEndEl ? timeEndEl.value : '06:00';
                chargePlan.priceThreshold = parseFloat(priceValueEl ? priceValueEl.value : '50');
                autoSettings.charge.stopSOC = parseFloat(batteryValueEl ? batteryValueEl.value : 90);
            }

            // Close panel
            closeAutoSettings();

            // Show confirmation message
            showAutoSettingsSaved();

            // Update conditions display
            updateAutoConditionsDisplay();

            // Restart auto check if in auto mode
            if (currentOperationMode === 'auto') {
                startAutoOperationCheck();
            }
        }
        
        function selectAutoType(type) {
            autoSettings.type = type;

            // Update UI
            const chargeBtn = document.querySelector('[onclick="selectAutoType(\'charge\')"]');
            const dischargeBtn = document.querySelector('[onclick="selectAutoType(\'discharge\')"]');
            const chargeConfigSection = document.getElementById('chargeConfigSection');
            const dischargeConfigSection = document.getElementById('dischargeConfigSection');

            if (type === 'charge') {
                // 显示充电配置,隐藏放电配置
                chargeBtn.style.background = '#4CD964';  // 绿色
                chargeBtn.style.color = '#000';
                dischargeBtn.style.background = 'transparent';
                dischargeBtn.style.color = 'rgba(255,255,255,0.7)';

                if (chargeConfigSection) chargeConfigSection.style.display = 'block';
                if (dischargeConfigSection) dischargeConfigSection.style.display = 'none';

                // 渲染充电计划卡片
                renderChargePlans();
            } else {
                // 显示放电配置,隐藏充电配置
                chargeBtn.style.background = 'transparent';
                chargeBtn.style.color = 'rgba(255,255,255,0.7)';
                dischargeBtn.style.background = '#FFC107';  // 黄色
                dischargeBtn.style.color = '#000';

                if (chargeConfigSection) chargeConfigSection.style.display = 'none';
                if (dischargeConfigSection) dischargeConfigSection.style.display = 'block';

                // 渲染放电计划卡片
                renderDischargePlans();
            }
        }

        // ===== 分时多阶充电策略管理函数 =====

        /**
         * 添加新的充电时间段
         */
        function addChargePlan() {
            const newPlan = {
                id: 'charge_plan_' + Date.now(),
                enabled: true,
                timeRange: { start: '00:00', end: '23:59' },
                priceThreshold: 50,
                priceEnabled: true
            };
            autoSettings.charge.plans.push(newPlan);
            renderChargePlans();
        }

        /**
         * 删除指定的充电时间段
         */
        function removeChargePlan(planId) {
            // 至少保留一个时间段
            if (autoSettings.charge.plans.length <= 1) {
                alert(window.i18n ? window.i18n.getText('mustKeepOneTimeSlot') : '至少需要保留一个时间段');
                return;
            }
            autoSettings.charge.plans = autoSettings.charge.plans.filter(p => p.id !== planId);
            renderChargePlans();
        }

        /**
         * 更新充电时间段数据
         */
        function updateChargePlan(planId, field, value) {
            const plan = autoSettings.charge.plans.find(p => p.id === planId);
            if (!plan) return;

            if (field === 'timeStart') {
                plan.timeRange.start = value;
            } else if (field === 'timeEnd') {
                plan.timeRange.end = value;
            } else if (field === 'priceThreshold') {
                plan.priceThreshold = parseFloat(value);
            } else if (field === 'priceEnabled') {
                plan.priceEnabled = value;
            } else if (field === 'enabled') {
                plan.enabled = value;
            }
        }

        /**
         * 渲染所有充电时间段卡片
         */
        function renderChargePlans() {
            const container = document.getElementById('chargePlansContainer');
            if (!container) return;

            // 清空容器
            container.innerHTML = '';

            // 渲染每个计划
            autoSettings.charge.plans.forEach((plan, index) => {
                const card = createChargePlanCard(plan, index);
                container.appendChild(card);
            });
        }

        /**
         * 创建单个充电时间段卡片
         */
        function createChargePlanCard(plan, index) {
            const card = document.createElement('div');
            card.style.cssText = `
                background: linear-gradient(145deg, rgba(76,217,100,0.1) 0%, rgba(76,217,100,0.05) 100%);
                border: 1px solid rgba(76,217,100,0.3);
                border-radius: 10px;
                padding: 14px;
                margin-bottom: 10px;
                transition: all 0.3s;
            `;

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; color: #4CD964;">⏰</span>
                        <span style="color: rgba(255,255,255,0.9); font-weight: 500; font-size: 13px;">
                            ${window.i18n ? window.i18n.getText('timeSlot') : '时间段'} ${index + 1}
                        </span>
                    </div>
                    <button onclick="removeChargePlan('${plan.id}')" style="
                        background: rgba(255,59,48,0.15);
                        border: 1px solid rgba(255,59,48,0.3);
                        color: #FF3B30;
                        padding: 3px 10px;
                        border-radius: 10px;
                        font-size: 11px;
                        cursor: pointer;
                        transition: all 0.3s;
                    " onmouseover="this.style.background='rgba(255,59,48,0.25)'" onmouseout="this.style.background='rgba(255,59,48,0.15)'">
                        ${window.i18n ? window.i18n.getText('delete') : '删除'}
                    </button>
                </div>

                <!-- 时间范围 -->
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="time" value="${plan.timeRange.start}"
                            onchange="updateChargePlan('${plan.id}', 'timeStart', this.value)"
                            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(76,217,100,0.3); border-radius: 10px; color: #fff; font-size: 13px;">
                        <span style="color: rgba(255,255,255,0.5); font-size: 12px;">至</span>
                        <input type="time" value="${plan.timeRange.end}"
                            onchange="updateChargePlan('${plan.id}', 'timeEnd', this.value)"
                            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(76,217,100,0.3); border-radius: 10px; color: #fff; font-size: 13px;">
                    </div>
                </div>

                <!-- 价格门槛 -->
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <input type="checkbox" ${plan.priceEnabled ? 'checked' : ''}
                            onchange="updateChargePlan('${plan.id}', 'priceEnabled', this.checked)"
                            style="width: 15px; height: 15px; accent-color: #4CD964; cursor: pointer;">
                        <label style="color: rgba(255,255,255,0.8); font-size: 12px;">
                            ${window.i18n ? window.i18n.getText('enablePriceCondition') : '启用价格条件'}
                        </label>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; ${plan.priceEnabled ? '' : 'opacity: 0.4;'}">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px; min-width: 32px;">${window.i18n ? window.i18n.getText('lessThan') : '低于'}</span>
                        <input type="number" value="${plan.priceThreshold}" step="1"
                            ${plan.priceEnabled ? '' : 'disabled'}
                            onchange="updateChargePlan('${plan.id}', 'priceThreshold', this.value)"
                            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(76,217,100,0.3); border-radius: 10px; color: #fff; font-size: 13px;">
                        <span style="color: rgba(255,255,255,0.6); font-size: 12px; min-width: 50px;">$/MWh</span>
                    </div>
                </div>
            `;

            return card;
        }

        // ===== 分时多阶放电策略管理函数 =====

        /**
         * 添加新的放电计划
         */
        function addDischargePlan() {
            const newPlan = {
                id: 'plan_' + Date.now(),
                enabled: true,
                timeRange: { start: '00:00', end: '23:59' },
                priceThreshold: 100,
                priceEnabled: true
            };
            autoSettings.discharge.plans.push(newPlan);
            renderDischargePlans();
        }

        /**
         * 删除指定的时间段
         */
        function removeDischargePlan(planId) {
            // 至少保留一个时间段
            if (autoSettings.discharge.plans.length <= 1) {
                alert(window.i18n ? window.i18n.getText('mustKeepOneTimeSlot') : '至少需要保留一个时间段');
                return;
            }
            autoSettings.discharge.plans = autoSettings.discharge.plans.filter(p => p.id !== planId);
            renderDischargePlans();
        }

        /**
         * 更新放电计划数据
         */
        function updateDischargePlan(planId, field, value) {
            const plan = autoSettings.discharge.plans.find(p => p.id === planId);
            if (!plan) return;

            if (field === 'timeStart') {
                plan.timeRange.start = value;
            } else if (field === 'timeEnd') {
                plan.timeRange.end = value;
            } else if (field === 'priceThreshold') {
                plan.priceThreshold = parseFloat(value);
            } else if (field === 'priceEnabled') {
                plan.priceEnabled = value;
            } else if (field === 'enabled') {
                plan.enabled = value;
            }
        }

        /**
         * 渲染所有放电计划卡片
         */
        function renderDischargePlans() {
            const container = document.getElementById('dischargePlansContainer');
            if (!container) return;

            // 清空容器
            container.innerHTML = '';

            // 渲染每个计划
            autoSettings.discharge.plans.forEach((plan, index) => {
                const card = createDischargePlanCard(plan, index);
                container.appendChild(card);
            });
        }

        /**
         * 创建单个时间段卡片
         */
        function createDischargePlanCard(plan, index) {
            const card = document.createElement('div');
            card.style.cssText = `
                background: linear-gradient(145deg, rgba(255,193,7,0.1) 0%, rgba(255,193,7,0.05) 100%);
                border: 1px solid rgba(255,193,7,0.3);
                border-radius: 10px;
                padding: 14px;
                margin-bottom: 10px;
                transition: all 0.3s;
            `;

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; color: #FFC107;">⏰</span>
                        <span style="color: rgba(255,255,255,0.9); font-weight: 500; font-size: 13px;">
                            ${window.i18n ? window.i18n.getText('timeSlot') : '时间段'} ${index + 1}
                        </span>
                    </div>
                    <button onclick="removeDischargePlan('${plan.id}')" style="
                        background: rgba(255,59,48,0.15);
                        border: 1px solid rgba(255,59,48,0.3);
                        color: #FF3B30;
                        padding: 3px 10px;
                        border-radius: 10px;
                        font-size: 11px;
                        cursor: pointer;
                        transition: all 0.3s;
                    " onmouseover="this.style.background='rgba(255,59,48,0.25)'" onmouseout="this.style.background='rgba(255,59,48,0.15)'">
                        ${window.i18n ? window.i18n.getText('delete') : '删除'}
                    </button>
                </div>

                <!-- 时间范围 -->
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="time" value="${plan.timeRange.start}"
                            onchange="updateDischargePlan('${plan.id}', 'timeStart', this.value)"
                            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,193,7,0.3); border-radius: 10px; color: #fff; font-size: 13px;">
                        <span style="color: rgba(255,255,255,0.5); font-size: 12px;">至</span>
                        <input type="time" value="${plan.timeRange.end}"
                            onchange="updateDischargePlan('${plan.id}', 'timeEnd', this.value)"
                            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,193,7,0.3); border-radius: 10px; color: #fff; font-size: 13px;">
                    </div>
                </div>

                <!-- 价格门槛 -->
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <input type="checkbox" ${plan.priceEnabled ? 'checked' : ''}
                            onchange="updateDischargePlan('${plan.id}', 'priceEnabled', this.checked)"
                            style="width: 15px; height: 15px; accent-color: #FFC107; cursor: pointer;">
                        <label style="color: rgba(255,255,255,0.8); font-size: 12px;">
                            ${window.i18n ? window.i18n.getText('enablePriceCondition') : '启用价格条件'}
                        </label>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; ${plan.priceEnabled ? '' : 'opacity: 0.4;'}">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px; min-width: 32px;">${window.i18n ? window.i18n.getText('greaterThan') : '高于'}</span>
                        <input type="number" value="${plan.priceThreshold}" step="1"
                            ${plan.priceEnabled ? '' : 'disabled'}
                            onchange="updateDischargePlan('${plan.id}', 'priceThreshold', this.value)"
                            style="flex: 1; padding: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,193,7,0.3); border-radius: 10px; color: #fff; font-size: 13px;">
                        <span style="color: rgba(255,255,255,0.6); font-size: 12px; min-width: 50px;">$/MWh</span>
                    </div>
                </div>
            `;

            return card;
        }

        function updateBatteryRangeVisibility() {
            const operator = document.getElementById('autoBatteryOperator').value;
            const value2Input = document.getElementById('autoBatteryValue2');
            
            if (operator === 'between') {
                value2Input.style.display = 'block';
            } else {
                value2Input.style.display = 'none';
            }
        }
        
        // ====== 翻牌倒计时器 ======
        let flipCountdownTarget = null; // 目标时间戳(ms)
        let flipCountdownInterval = null;
        let flipLastDigits = { H0: '', H1: '', M0: '', M1: '', S0: '', S1: '' };

        // 更新单个翻牌卡片
        function updateFlipCard(id, newDigit) {
            const key = id.replace('flip', '');
            if (flipLastDigits[key] === newDigit) return; // 数字没变，不翻
            const card = document.getElementById(id);
            if (!card) return;

            const oldDigit = flipLastDigits[key] || '0';
            flipLastDigits[key] = newDigit;

            // 更新底层静态数字（新值）
            card.querySelector('.flip-top .flip-digit').textContent = newDigit;
            card.querySelector('.flip-bottom .flip-digit').textContent = newDigit;

            // 移除旧的翻转片
            card.querySelectorAll('.flip-front, .flip-back').forEach(el => el.remove());
            card.classList.remove('flipping');

            // 创建翻转片：上半（旧值翻下去）+ 下半（新值翻上来）
            const front = document.createElement('div');
            front.className = 'flip-front';
            front.innerHTML = `<div class="flip-digit">${oldDigit}</div>`;

            const back = document.createElement('div');
            back.className = 'flip-back';
            back.innerHTML = `<div class="flip-digit">${newDigit}</div>`;

            card.appendChild(front);
            card.appendChild(back);

            // 触发动画
            requestAnimationFrame(() => card.classList.add('flipping'));

            // 动画结束后清理
            setTimeout(() => {
                card.classList.remove('flipping');
                front.remove();
                back.remove();
            }, 600);
        }

        // 驱动翻牌倒计时每秒更新
        function tickFlipCountdown() {
            if (!flipCountdownTarget) return;
            const flipEl = document.getElementById('aiCountdownFlip');
            if (!flipEl) return;

            const diff = Math.max(0, flipCountdownTarget - Date.now());
            const totalSec = Math.floor(diff / 1000);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;

            const hStr = h.toString().padStart(2, '0');
            const mStr = m.toString().padStart(2, '0');
            const sStr = s.toString().padStart(2, '0');

            updateFlipCard('flipH0', hStr[0]);
            updateFlipCard('flipH1', hStr[1]);
            updateFlipCard('flipM0', mStr[0]);
            updateFlipCard('flipM1', mStr[1]);
            updateFlipCard('flipS0', sStr[0]);
            updateFlipCard('flipS1', sStr[1]);

            if (totalSec <= 0) {
                stopFlipCountdown();
                // 倒计时归零 → 立即触发条件检查，驱动状态切换
                if (typeof checkAutoConditions === 'function') {
                    checkAutoConditions();
                }
                // 刷新预测文本显示
                updateAIPredictionText();
            }
        }

        function startFlipCountdown(targetMs) {
            flipCountdownTarget = targetMs;
            // 重置记忆，强制首次全部刷新
            flipLastDigits = { H0: '', H1: '', M0: '', M1: '', S0: '', S1: '' };
            tickFlipCountdown();
            if (flipCountdownInterval) clearInterval(flipCountdownInterval);
            flipCountdownInterval = setInterval(tickFlipCountdown, 1000);
            const flipEl = document.getElementById('aiCountdownFlip');
            if (flipEl) flipEl.style.display = 'flex';
        }

        function stopFlipCountdown() {
            if (flipCountdownInterval) {
                clearInterval(flipCountdownInterval);
                flipCountdownInterval = null;
            }
            flipCountdownTarget = null;
            const flipEl = document.getElementById('aiCountdownFlip');
            if (flipEl) flipEl.style.display = 'none';
        }

        // AI预测状态文本更新
        function updateAIPredictionText() {
            const container = document.getElementById('aiPredictionText');
            const content = document.getElementById('aiPredictionContent');
            if (!container || !content) return;

            // 非自动模式 → 隐藏
            if (currentOperationMode !== 'auto') {
                container.style.display = 'none';
                stopFlipCountdown();
                return;
            }

            const status = regionData[selectedMainRegion]?.status;
            const isEn = window.i18n && window.i18n.getCurrentLanguage() === 'en';

            if (status === 'autoCharge' || status === 'autoDischarge') {
                // 正在充电/放电 → 计算预计结束时间
                const isCharge = status === 'autoCharge';
                const currentSOC = getCurrentBatteryLevel();
                const targetSOC = isCharge
                    ? (autoSettings.charge.stopSOC || 90)
                    : (autoSettings.discharge.stopSOC || 20);
                const socDiff = Math.abs(targetSOC - currentSOC);
                const intervalsNeeded = Math.ceil(socDiff / 2.083);
                const minutesLeft = intervalsNeeded * 5;
                const endTime = new Date(Date.now() + minutesLeft * 60000);
                const endTimeStr = endTime.getHours().toString().padStart(2, '0') + ':' + endTime.getMinutes().toString().padStart(2, '0');
                const actionText = isCharge
                    ? (isEn ? 'charging' : '充电')
                    : (isEn ? 'discharging' : '放电');

                const nowStr = new Date().getHours().toString().padStart(2, '0') + ':' + new Date().getMinutes().toString().padStart(2, '0');
                content.textContent = isEn
                    ? `⚡ ${actionText} ${nowStr}-${endTimeStr}`
                    : `⚡ ${actionText}中 ${nowStr}-${endTimeStr}`;
                content.style.color = isCharge ? 'rgba(0,255,136,0.75)' : 'rgba(255,193,7,0.75)';

                // 翻牌倒计时：距结束
                startFlipCountdown(endTime.getTime());
                container.style.display = 'block';

            } else if (status === 'waitingExecution') {
                const bc = latestAIForecast.bestCharge;
                const bd = latestAIForecast.bestDischarge;

                if (!bc && !bd) {
                    content.textContent = isEn ? '🤖 AI analyzing...' : '🤖 AI 分析中...';
                    content.style.color = 'rgba(255,255,255,0.45)';
                    stopFlipCountdown();
                    container.style.display = 'block';
                    return;
                }

                const now = new Date();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const toMinutes = (timeStr) => {
                    if (!timeStr) return Infinity;
                    const [h, m] = timeStr.split(':').map(Number);
                    return h * 60 + m;
                };

                let nextAction = null;
                let nextWindow = null;

                // 检查是否有"正在进行中"的窗口（已过 startTime 但未过 endTime）
                const isInWindow = (w) => {
                    if (!w) return false;
                    const startMin = toMinutes(w.startTime);
                    const endMin = toMinutes(w.endTimeDisplay);
                    return nowMinutes >= startMin && nowMinutes < endMin;
                };

                if (isInWindow(bc)) {
                    nextAction = isEn ? 'charge' : '充电';
                    nextWindow = bc;
                } else if (isInWindow(bd)) {
                    nextAction = isEn ? 'discharge' : '放电';
                    nextWindow = bd;
                } else {
                    // 没有进行中的窗口 → 找最近的未来窗口
                    const bcMin = bc ? toMinutes(bc.startTime) : Infinity;
                    const bdMin = bd ? toMinutes(bd.startTime) : Infinity;
                    const bcFuture = bcMin > nowMinutes ? bcMin : Infinity;
                    const bdFuture = bdMin > nowMinutes ? bdMin : Infinity;

                    if (bcFuture <= bdFuture && bcFuture !== Infinity && bc) {
                        nextAction = isEn ? 'charge' : '充电';
                        nextWindow = bc;
                    } else if (bdFuture !== Infinity && bd) {
                        nextAction = isEn ? 'discharge' : '放电';
                        nextWindow = bd;
                    }
                }

                if (nextAction && nextWindow) {
                    const today = new Date();
                    const [th, tm] = nextWindow.startTime.split(':').map(Number);
                    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), th, tm, 0);
                    const timeRange = nextWindow.startTime + '-' + nextWindow.endTimeDisplay;

                    if (targetDate.getTime() > Date.now()) {
                        // 还没到窗口开始时间 → 显示"预计执行"+ 倒计时
                        content.textContent = isEn
                            ? `🤖 Est. ${nextAction} ${timeRange}`
                            : `🤖 预计 ${timeRange} 执行${nextAction}`;
                        content.style.color = 'rgba(0,255,136,0.65)';
                        startFlipCountdown(targetDate.getTime());
                    } else {
                        // 已过窗口开始时间 → 显示"执行中"，倒计时到窗口结束
                        const isC = nextWindow.action === 'charge';
                        content.textContent = isEn
                            ? `⚡ ${nextAction}ing ${timeRange}`
                            : `⚡ ${nextAction}中 ${timeRange}`;
                        content.style.color = isC ? 'rgba(0,255,136,0.85)' : 'rgba(255,193,7,0.85)';
                        // 计算窗口结束时间的倒计时
                        const [eh, em] = nextWindow.endTimeDisplay.split(':').map(Number);
                        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em, 0);
                        if (endDate.getTime() > Date.now()) {
                            startFlipCountdown(endDate.getTime());
                        } else {
                            stopFlipCountdown();
                        }
                    }
                } else {
                    // 所有窗口都已过 → 监控中
                    content.textContent = isEn ? '🤖 Monitoring market...' : '🤖 监控行情中...';
                    content.style.color = 'rgba(255,255,255,0.45)';
                    stopFlipCountdown();
                }
                container.style.display = 'block';

            } else {
                container.style.display = 'none';
                stopFlipCountdown();
            }
        }

        function startAutoOperationCheck() {
            // Clear existing interval
            if (autoCheckInterval) {
                clearInterval(autoCheckInterval);
            }
            
            // Check conditions every 30 seconds
            autoCheckInterval = setInterval(checkAutoConditions, 30000);
        }
        
        function checkAutoConditions() {
            if (currentOperationMode !== 'auto') return;
            
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            const currentPrice = getCurrentPrice();
            const currentBatteryLevel = getCurrentBatteryLevel();
            
            // Check charge conditions
            if (shouldTriggerCharge(currentTime, currentPrice, currentBatteryLevel)) {
                triggerChargeOperation();
                return;
            }
            
            // Check discharge conditions
            if (shouldTriggerDischarge(currentTime, currentPrice, currentBatteryLevel)) {
                triggerDischargeOperation();
                return;
            }
        }
        
        function shouldTriggerCharge(currentTime, currentPrice, currentBatteryLevel) {
            const charge = autoSettings.charge;

            // 检查全局SOC条件(始终检查)
            if (currentBatteryLevel >= charge.stopSOC) {
                return false; // 电量已达到充电停止值,不触发
            }

            // ===== 分时多阶充电策略: 并联逻辑 =====
            // 只要任意一个计划满足条件,就触发充电

            if (!charge.plans || charge.plans.length === 0) {
                return false; // 没有计划,不触发
            }

            // 遍历所有启用的计划
            for (const plan of charge.plans) {
                if (!plan.enabled) continue; // 跳过未启用的计划

                // 检查时间窗口
                const timeMatch = isTimeInRange(currentTime, plan.timeRange.start, plan.timeRange.end);
                if (!timeMatch) continue; // 时间不匹配,检查下一个计划

                // 检查价格条件(如果启用)
                if (plan.priceEnabled) {
                    const priceMatch = currentPrice < plan.priceThreshold;
                    if (!priceMatch) continue; // 价格不满足,检查下一个计划
                }

                // 到达这里说明当前计划的所有条件都满足
                return true; // 找到一个满足条件的计划,立即触发
            }

            // 所有计划都不满足
            return false;
        }
        
        function shouldTriggerDischarge(currentTime, currentPrice, currentBatteryLevel) {
            const discharge = autoSettings.discharge;

            // 检查全局SOC条件(始终检查)
            if (currentBatteryLevel <= discharge.stopSOC) {
                return false; // 电量已达到放电停止值,不触发
            }

            // ===== 分时多阶放电策略: 并联逻辑 =====
            // 只要任意一个计划满足条件,就触发放电
            // 类似电路中的"或"逻辑: Plan1 OR Plan2 OR Plan3...

            if (!discharge.plans || discharge.plans.length === 0) {
                return false; // 没有计划,不触发
            }

            // 遍历所有启用的计划
            for (const plan of discharge.plans) {
                if (!plan.enabled) continue; // 跳过未启用的计划

                // 检查时间窗口
                const timeMatch = isTimeInRange(currentTime, plan.timeRange.start, plan.timeRange.end);
                if (!timeMatch) continue; // 时间不匹配,检查下一个计划

                // 检查价格条件(如果启用)
                if (plan.priceEnabled) {
                    const priceMatch = currentPrice > plan.priceThreshold;
                    if (!priceMatch) continue; // 价格不满足,检查下一个计划
                }

                // 到达这里说明当前计划的所有条件都满足
                return true; // 找到一个满足条件的计划,立即触发
            }

            // 所有计划都不满足
            return false;
        }
        
        function checkCondition(value, operator, threshold) {
            switch (operator) {
                case 'less':
                    return value < threshold;
                case 'greater':
                    return value > threshold;
                default:
                    return true;
            }
        }
        
        function isTimeInRange(currentTime, startTime, endTime) {
            const current = timeToMinutes(currentTime);
            const start = timeToMinutes(startTime);
            const end = timeToMinutes(endTime);
            
            if (start <= end) {
                return current >= start && current <= end;
            } else {
                // Crosses midnight
                return current >= start || current <= end;
            }
        }
        
        function timeToMinutes(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        }
        
        function checkPriceCondition(price) {
            const { operator, value } = autoSettings.priceCondition;
            
            switch (operator) {
                case 'less':
                    return price < value;
                case 'greater':
                    return price > value;
                default:
                    return true;
            }
        }
        
        function checkBatteryCondition(batteryLevel) {
            const { operator, value, value2 } = autoSettings.batteryCondition;
            
            switch (operator) {
                case 'less':
                    return batteryLevel < value;
                case 'greater':
                    return batteryLevel > value;
                case 'between':
                    return batteryLevel >= Math.min(value, value2) && batteryLevel <= Math.max(value, value2);
                default:
                    return true;
            }
        }
        
        function getCurrentPrice() {
            // Get current price from the price circle
            const priceElement = document.querySelector('.current-price');
            if (priceElement) {
                const priceText = priceElement.textContent.replace('$', '').replace(/[^0-9.-]/g, '');
                return parseFloat(priceText) || 0;
            }
            return 0;
        }
        
        function getCurrentBatteryLevel() {
            // Get current battery level from the power station data
            const batteryElement = document.querySelector('.power-bar');
            if (batteryElement) {
                const widthStyle = batteryElement.style.width;
                if (widthStyle) {
                    return parseFloat(widthStyle.replace('%', '')) || 0;
                }
            }
            return 50; // Default battery level
        }
        
        function triggerAutoOperation() {
            const operationType = autoSettings.type;
            
            // Prevent duplicate operations
            if (currentOperation) {
                return;
            }
            
            
            // Simulate button click for the appropriate operation
            if (operationType === 'charge') {
                triggerChargeOperation();
            } else {
                triggerDischargeOperation();
            }
        }
        
        function triggerChargeOperation() {
            // Simulate charge button click
            const chargeBtn = document.querySelector('#chargeBtn, [onclick*="charge"]');
            if (chargeBtn && !chargeBtn.disabled) {
                chargeBtn.click();
                showAutoOperationNotification('充电', '智能充电已启动');
            }
        }
        
        function triggerDischargeOperation() {
            // Simulate discharge button click
            const dischargeBtn = document.querySelector('#dischargeBtn, [onclick*="discharge"]');
            if (dischargeBtn && !dischargeBtn.disabled) {
                dischargeBtn.click();
                showAutoOperationNotification('放电', '智能放电已启动');
            }
        }
        
        function showAutoOperationNotification(operation, message) {
            // Create notification element
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: var(--color-bg-card);
                border: 1px solid var(--color-border);
                border-radius: 10px;
                padding: 16px;
                color: #fff;
                z-index: 10000;
                max-width: 300px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                animation: slideInRight 0.3s ease-out;
            `;
            
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 8px; height: 8px; background: #00ff88; border-radius: 50%; box-shadow: 0 0 8px rgba(0,255,136,0.5);"></div>
                    <div>
                        <div style="font-weight: 600; margin-bottom: 4px;">自动操作</div>
                        <div style="font-size: 14px; opacity: 0.8;">${message}</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // Auto remove after 3 seconds
            setTimeout(() => {
                notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 300);
            }, 3000);
        }
        
        function showAutoSettingsSaved() {
            showAutoOperationNotification('设置', '智能托管设置已保存');
        }
        
        function updateAutoConditionsDisplay() {
            // 适配新的 plans[] 数据结构，从第一个计划读取显示值
            const chargePlan = autoSettings.charge.plans?.[0] || {};
            const dischargePlan = autoSettings.discharge.plans?.[0] || {};

            const setElementValue = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = value;
            };
            const setElementChecked = (id, checked) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!checked;
            };
            const setElementText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text ?? '';
            };

            // --- 充电条件 ---
            const chargeTimeEnabled = chargePlan.enabled ?? true;
            setElementChecked('chargeTimeEnabled', chargeTimeEnabled);
            setElementChecked('chargeTimeEnabledDisplay', chargeTimeEnabled);
            setElementText('chargeStartTime', chargePlan.timeRange?.start ?? '22:00');
            setElementText('chargeEndTime', chargePlan.timeRange?.end ?? '06:00');

            const chargeTimeDisplay = document.getElementById('chargeTimeDisplay');
            const chargeTimeDisabled = document.getElementById('chargeTimeDisabled');
            if (chargeTimeDisplay && chargeTimeDisabled) {
                chargeTimeDisplay.style.opacity = chargeTimeEnabled ? '1' : '0.4';
                chargeTimeDisabled.style.display = chargeTimeEnabled ? 'none' : 'inline';
            }

            const chargePriceEnabled = chargePlan.priceEnabled ?? true;
            setElementChecked('chargePriceEnabled', chargePriceEnabled);
            setElementChecked('chargePriceEnabledDisplay', chargePriceEnabled);
            setElementValue('chargePriceOperator', 'below');
            setElementText('chargePriceValue', chargePlan.priceThreshold ?? 50);

            const chargePriceDisplay = document.getElementById('chargePriceDisplay');
            const chargePriceDisabled = document.getElementById('chargePriceDisabled');
            if (chargePriceDisplay && chargePriceDisabled) {
                chargePriceDisplay.style.opacity = chargePriceEnabled ? '1' : '0.4';
                chargePriceDisabled.style.display = chargePriceEnabled ? 'none' : 'inline';
            }

            setElementValue('chargeSocOperator', 'equals');
            setElementValue('chargeSocValue', autoSettings.charge.stopSOC ?? 90);

            // --- 放电条件 ---
            const dischargeTimeEnabled = dischargePlan.enabled ?? true;
            setElementChecked('dischargeTimeEnabled', dischargeTimeEnabled);
            setElementChecked('dischargeTimeEnabledDisplay', dischargeTimeEnabled);
            setElementText('dischargeStartTime', dischargePlan.timeRange?.start ?? '16:00');
            setElementText('dischargeEndTime', dischargePlan.timeRange?.end ?? '21:00');

            const dischargeTimeDisplay = document.getElementById('dischargeTimeDisplay');
            const dischargeTimeDisabled = document.getElementById('dischargeTimeDisabled');
            if (dischargeTimeDisplay && dischargeTimeDisabled) {
                dischargeTimeDisplay.style.opacity = dischargeTimeEnabled ? '1' : '0.4';
                dischargeTimeDisabled.style.display = dischargeTimeEnabled ? 'none' : 'inline';
            }

            const dischargePriceEnabled = dischargePlan.priceEnabled ?? true;
            setElementChecked('dischargePriceEnabled', dischargePriceEnabled);
            setElementChecked('dischargePriceEnabledDisplay', dischargePriceEnabled);
            setElementValue('dischargePriceOperator', 'above');
            setElementText('dischargePriceValue', dischargePlan.priceThreshold ?? 100);

            const dischargePriceDisplay = document.getElementById('dischargePriceDisplay');
            const dischargePriceDisabled = document.getElementById('dischargePriceDisabled');
            if (dischargePriceDisplay && dischargePriceDisabled) {
                dischargePriceDisplay.style.opacity = dischargePriceEnabled ? '1' : '0.4';
                dischargePriceDisabled.style.display = dischargePriceEnabled ? 'none' : 'inline';
            }

            setElementValue('dischargeSocOperator', 'equals');
            setElementValue('dischargeSocValue', autoSettings.discharge.stopSOC ?? 20);
        }
        
        function updateConditionStatus(operationType, conditionType, enabled) {
            // 适配新 plans[] 格式：更新第一个计划的对应字段
            const plan = autoSettings[operationType]?.plans?.[0];
            if (plan) {
                if (conditionType === 'time') {
                    plan.enabled = enabled;
                } else {
                    plan.priceEnabled = enabled;
                }
            }

            // Update visual state of the condition controls
            const prefix = operationType === 'charge' ? 'charge' : 'discharge';

            if (conditionType === 'time') {
                const startTimeInput = document.getElementById(`${prefix}StartTime`);
                const endTimeInput = document.getElementById(`${prefix}EndTime`);
                if (startTimeInput) { startTimeInput.disabled = !enabled; startTimeInput.style.opacity = enabled ? '1' : '0.5'; }
                if (endTimeInput) { endTimeInput.disabled = !enabled; endTimeInput.style.opacity = enabled ? '1' : '0.5'; }
            } else {
                const operatorSelect = document.getElementById(`${prefix}PriceOperator`);
                const valueInput = document.getElementById(`${prefix}PriceValue`);
                if (operatorSelect) { operatorSelect.disabled = !enabled; operatorSelect.style.opacity = enabled ? '1' : '0.5'; }
                if (valueInput) { valueInput.disabled = !enabled; valueInput.style.opacity = enabled ? '1' : '0.5'; }
            }
        }
        
        function updateAutoSettings() {
            // 适配新 plans[] 格式：将 UI 值写回第一个计划
            const chargePlan = autoSettings.charge.plans?.[0];
            const dischargePlan = autoSettings.discharge.plans?.[0];

            if (chargePlan) {
                const chargeStartTimeEl = document.getElementById('chargeStartTime');
                const chargeEndTimeEl = document.getElementById('chargeEndTime');
                const chargePriceValueEl = document.getElementById('chargePriceValue');
                const chargeSocValueEl = document.getElementById('chargeSocValue');

                if (!chargePlan.timeRange) chargePlan.timeRange = {};
                chargePlan.timeRange.start = chargeStartTimeEl ? chargeStartTimeEl.textContent : '22:00';
                chargePlan.timeRange.end = chargeEndTimeEl ? chargeEndTimeEl.textContent : '06:00';
                chargePlan.priceThreshold = parseFloat(chargePriceValueEl ? chargePriceValueEl.textContent : '50');
                autoSettings.charge.stopSOC = parseFloat(chargeSocValueEl ? chargeSocValueEl.value : 90);
            }

            if (dischargePlan) {
                const dischargeStartTimeEl = document.getElementById('dischargeStartTime');
                const dischargeEndTimeEl = document.getElementById('dischargeEndTime');
                const dischargePriceValueEl = document.getElementById('dischargePriceValue');
                const dischargeSocValueEl = document.getElementById('dischargeSocValue');

                if (!dischargePlan.timeRange) dischargePlan.timeRange = {};
                dischargePlan.timeRange.start = dischargeStartTimeEl ? dischargeStartTimeEl.textContent : '16:00';
                dischargePlan.timeRange.end = dischargeEndTimeEl ? dischargeEndTimeEl.textContent : '21:00';
                dischargePlan.priceThreshold = parseFloat(dischargePriceValueEl ? dischargePriceValueEl.textContent : '100');
                autoSettings.discharge.stopSOC = parseFloat(dischargeSocValueEl ? dischargeSocValueEl.value : 20);
            }

            // Restart auto check if in auto mode
            if (currentOperationMode === 'auto') {
                startAutoOperationCheck();
            }
        }
        
        // Performance utilities (inline to avoid CORS issues)
        function throttle(func, limit) {
            let inThrottle;
            let lastFunc;
            let lastRan;
            
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    lastRan = Date.now();
                    inThrottle = true;
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(() => {
                        if ((Date.now() - lastRan) >= limit) {
                            func.apply(this, args);
                            lastRan = Date.now();
                        }
                    }, Math.max(limit - (Date.now() - lastRan), 0));
                }
                
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            };
        }

        // Data cache class
        class DataCache {
            constructor(ttl = 5 * 60 * 1000, maxSize = 100) {
                this.cache = new Map();
                this.ttl = ttl;
                this.maxSize = maxSize;
            }
            
            set(key, data) {
                if (this.cache.size >= this.maxSize) {
                    const firstKey = this.cache.keys().next().value;
                    this.cache.delete(firstKey);
                }
                
                this.cache.set(key, {
                    data,
                    timestamp: Date.now()
                });
            }
            
            get(key) {
                const cached = this.cache.get(key);
                if (!cached) return null;
                
                if (Date.now() - cached.timestamp > this.ttl) {
                    this.cache.delete(key);
                    return null;
                }
                
                return cached.data;
            }
            
            clear() {
                this.cache.clear();
            }
        }

        // Chart manager class
        class ChartManager {
            constructor() {
                this.charts = new Map();
            }
            
            register(name, chart) {
                if (this.charts.has(name)) {
                    this.dispose(name);
                }
                this.charts.set(name, chart);
            }
            
            dispose(name) {
                const chart = this.charts.get(name);
                if (chart && typeof chart.dispose === 'function') {
                    chart.dispose();
                }
                this.charts.delete(name);
            }
        }
        
        // Create instances
        const dataCache = new DataCache();
        const chartManager = new ChartManager();
        
        // Initialize additional variables 
        let currentRegion = 'NSW';
        let selectedMainRegion = 'NSW'; // 新增：主地区选择
        
        // 时间条件段全局变量
        let timeConditionSegments = {
            charge: [], // 充电时间段
            discharge: [] // 放电时间段
        };
        let regionConditions = {}; // 存储各地区的条件设置
        
        // 全局地区数据对象

        // 生成随机设备统计数据的辅助函数（默认配置：有失败设备）
        function generateRandomDeviceStats() {
            const totalDevices = 500;
            const successCount = 450; // 固定下发成功450个
            const executingCount = 0; // 执行中为0
            const failedCount = 50; // 固定下发失败50个

            const stats = {
                total: totalDevices,
                success: successCount,
                executing: executingCount,
                failed: failedCount
            };

            return stats;
        }

        // 生成等待执行中状态的设备统计（还未下发指令）
        function generateWaitingDeviceStats() {
            const stats = {
                total: 500,
                success: 0, // 等待执行中，还未下发，成功数为0
                executing: 0, // 执行中为0
                failed: 0 // 失败数为0
            };

            return stats;
        }

        // 初始化地区数据

        // 测试函数是否可用
        try {
            const testWaiting = generateWaitingDeviceStats();
        } catch(e) {
            console.error('❌ generateWaitingDeviceStats error:', e);
        }

        try {
            const testRandom = generateRandomDeviceStats();
        } catch(e) {
            console.error('❌ generateRandomDeviceStats error:', e);
        }

        let regionData = {
            'NSW': {
                status: 'waitingExecution',
                deviceStats: generateWaitingDeviceStats() || { total: 500, success: 0, executing: 0, failed: 0 }
            },
            'QLD': {
                status: 'autoCharge',
                deviceStats: generateRandomDeviceStats() || { total: 500, success: 450, executing: 0, failed: 50 }
            },
            'VIC': {
                status: 'manualCharge',
                deviceStats: generateRandomDeviceStats() || { total: 500, success: 450, executing: 0, failed: 50 }
            },
            'SA': {
                status: 'autoDischarge',
                deviceStats: generateRandomDeviceStats() || { total: 500, success: 450, executing: 0, failed: 50 }
            },
            'TAS': {
                status: 'manualDischarge',
                deviceStats: generateRandomDeviceStats() || { total: 500, success: 450, executing: 0, failed: 50 }
            }
        };
        let chartType = 'both';
        let autoSwitchInterval;
        let mapAnimationInterval;
        let deviceLocations = []; // Fixed device locations


        // Initialize HeaderNav immediately when scripts are loaded
        function initHeaderNav() {
            
            if (typeof HeaderNav === 'undefined') {
                console.error('HeaderNav class not found!');
                return false;
            }
            
            try {
                const headerNav = new HeaderNav({
                    currentPage: 'home',
                    containerId: 'headerContainer',
                    showLanguageSelector: true
                });
                return true;
            } catch (error) {
                console.error('HeaderNav initialization failed:', error);
                return false;
            }
        }

        // Try to initialize HeaderNav immediately
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initHeaderNav);
        } else {
            initHeaderNav();
        }

        // Initialize all charts when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {

            // ========== 强制修复 regionData ==========

            // 检查并修复每个地区的 deviceStats
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            regions.forEach(region => {
                if (!regionData[region]) {
                    regionData[region] = { status: 'none' };
                }
                if (!regionData[region].deviceStats) {
                    // deviceStats auto-created for ${region}
                    if (region === 'NSW') {
                        regionData[region].deviceStats = { total: 500, success: 0, executing: 0, failed: 0 };
                    } else {
                        regionData[region].deviceStats = { total: 500, success: 450, executing: 0, failed: 50 };
                    }
                }
            });


            // 同步UI状态
            const autoToggleKnob = document.getElementById('autoToggleKnob');
            const toggleSwitch = document.querySelector('.auto-toggle-switch');
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            
            if (currentOperationMode === 'manual') {
                // 手动模式UI状态
                if (autoToggleKnob && toggleSwitch) {
                    autoToggleKnob.style.left = '2px';
                    autoToggleKnob.style.right = 'auto';
                    toggleSwitch.style.background = 'rgba(255,255,255,0.1)';
                }
                
                // 启用充放电按钮
                if (chargeBtn && dischargeBtn) {
                    chargeBtn.disabled = false;
                    dischargeBtn.disabled = false;
                    chargeBtn.style.opacity = '1';
                    dischargeBtn.style.opacity = '1';
                    chargeBtn.style.cursor = 'pointer';
                    dischargeBtn.style.cursor = 'pointer';
                }
            } else {
                // 自动模式UI状态
                if (autoToggleKnob && toggleSwitch) {
                    autoToggleKnob.style.left = '18px';
                    autoToggleKnob.style.right = 'auto';
                    toggleSwitch.style.background = '#4CD964';
                }
                
                // 隐藏充放电按钮
                if (chargeBtn && dischargeBtn) {
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                }
            }
            
            // Use setTimeout to ensure all dependencies are loaded
            setTimeout(() => {
                try {
                    // Make sure HeaderNav is initialized
                    if (!window.headerNav) {
                        initHeaderNav();
                    }
                    
                    // Initialize price circle color and water wave effect
                    updatePriceCircleColor();
                    
                    // 设置定时更新水波效果（每10秒更新一次）
                    setInterval(() => {
                        updateWaterWaveLevel();
                    }, 10000);
                    
                    // Initialize auto conditions display (always shown)
                    updateAutoConditionsDisplay();
                    
                    // Initialize SOC sliders
                    initSOCSliders();
                    
                    // Initialize operation mode (default to auto)
                    switchOperationMode(currentOperationMode);
                    // HeaderNav initialized successfully
                    
                    // 启动z-index监控器
                    startDrawerZIndexMonitor();
                    
                    // Initialize i18n system if not already initialized by HeaderNav
                    if (!window.i18n && typeof I18n !== 'undefined') {
                        // 确保默认使用中文，清除可能存在的英文设置
                        try {
                            const storedLang = localStorage.getItem('app_language');
                            if (storedLang === 'en') {
                                localStorage.removeItem('app_language');
                            }
                        } catch (e) {
                            // warn('Failed to check/clear language setting:', e);
                        }

                        window.i18n = new I18n({
                            defaultLanguage: 'zh',
                            containerId: 'headerLanguageSelector'
                        });
                    }
                    
                    // Ensure simulation buttons are translated after i18n is ready
                    setTimeout(() => {
                        if (window.i18n && window.i18n.isReady) {
                            window.i18n.updatePageTexts();
                            updateSimulationButtonsText();
                            // 再次强制更新
                            setTimeout(() => {
                                updateSimulationButtonsText();
                            }, 100);
                        }
                    }, 2000);
                    
                    // Listen for language change events to update simulation buttons
                    document.addEventListener('languageChanged', function(event) {
                        // 立即更新
                        updateSimulationButtonsText();
                        // 多次延迟更新以确保生效
                        setTimeout(() => {
                            updateSimulationButtonsText();
                        }, 50);
                        setTimeout(() => {
                            updateSimulationButtonsText();
                        }, 200);
                        setTimeout(() => {
                            updateSimulationButtonsText();
                        }, 500);
                    });
                    
                    // Function to specifically update simulation buttons text
                    function updateSimulationButtonsText() {
                        
                        if (!window.i18n) {
                            return;
                        }
                        
                        const currentLanguage = window.i18n.getCurrentLanguage();
                        
                        // 强制翻译每个按钮
                        const forcedButtonUpdates = [
                            {
                                selector: '[data-i18n="settings"]',
                                chinese: '设置',
                                english: 'Settings'
                            }
                        ];
                        
                        forcedButtonUpdates.forEach(update => {
                            const elements = document.querySelectorAll(update.selector);
                            elements.forEach(element => {
                                if (element) {
                                    const oldText = element.textContent;
                                    const newText = currentLanguage === 'en' ? update.english : update.chinese;
                                    element.textContent = newText;
                                }
                            });
                        });
                    }
                    
                    // 确保函数全局可用于调试
                    window.forceUpdateSimulationButtons = updateSimulationButtonsText;
                    
                    // 页面加载完成后立即更新一次
                    setTimeout(() => {
                        updateSimulationButtonsText();
                    }, 3000);
                    
                    // Initialize auto settings event listeners
                    const autoBatteryOperator = document.getElementById('autoBatteryOperator');
                    if (autoBatteryOperator) {
                        autoBatteryOperator.addEventListener('change', updateBatteryRangeVisibility);
                    }
                    
                    // Add language change listener for dynamic content
                    if (window.i18n) {
                        window.i18n.addObserver((newLanguage, oldLanguage) => {
                            updateDynamicContent(newLanguage);
                            
                            // Update region status badges
                            updateRegionStatusDisplay();
                            
                            // Refresh all charts with new language
                            if (marketChart) {
                                updateMarketChart();
                            }
                            if (powerChart && powerChartTimeSelector) {
                                const currentPeriod = powerChartTimeSelector.getCurrentPeriod();
                                const { labels, power, revenue } = generateAnalyticsData(currentPeriod);
                                updatePowerChartWithData(labels, power, revenue, currentPeriod);
                            }
                            if (mapChart) {
                                updateMapStatistics();
                            }

                            // Refresh condition regions if visible
                            if (currentConditionView !== 'default') {
                                const type = currentConditionView;
                                createConditionRegions(type);
                            }
                            
                            // Update default region display
                            updateRegionDisplay();
                            
                            // Update region status display with new language
                            updateRegionStatusDisplay();
                            
                            // 语言切换后重新调整间距
                            setTimeout(() => {
                                adjustSpacingForRegionSelector();
                            }, 300);
                            
                            // 更新大圆中的状态标签
                            const currentRegionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
                            updateStationStatusLabel(currentRegionStatus);
                        });
                    }
                } catch (error) {
                    console.error('HeaderNav failed to initialize:', error);
                }
            }, 10);
            
            // Add keyboard and click listeners for modal
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    const confirmModal = document.getElementById('confirmationModal');
                    if (confirmModal && confirmModal.style.display === 'block') {
                        closeConfirmationModal();
                    }
                }
                
                // 添加强制刷新快捷键 Ctrl+Shift+R
                if (event.ctrlKey && event.shiftKey && event.key === 'R') {
                    event.preventDefault();
                    window.location.reload(true);
                }
                
                // 添加F5强制刷新
                if (event.key === 'F5') {
                    event.preventDefault();
                    window.location.reload(true);
                }
            });
            
            // Add click outside to close functionality
            const confirmationModal = document.getElementById('confirmationModal');
            if (confirmationModal) {
                confirmationModal.addEventListener('click', function(event) {
                    if (event.target === confirmationModal) {
                        closeConfirmationModal();
                    }
                });
            }

            // ========== 再次确认并强制更新 NSW 显示 ==========
            if (regionData['NSW'] && regionData['NSW'].deviceStats) {
                const stats = regionData['NSW'].deviceStats;
                if (document.getElementById('totalDevices')) {
                    document.getElementById('totalDevices').textContent = stats.total;
                    document.getElementById('successfulDevices').textContent = stats.success;
                    document.getElementById('executingDevices').textContent = stats.executing;
                    document.getElementById('failedDevices').textContent = stats.failed;
                }
            } else {
                // error('❌ NSW deviceStats still missing after fix!');
            }

            try {
                // Generate fixed device locations once (exactly 500 devices)
                deviceLocations = generateDeviceLocations();

                // 调试：检查NSW设备状态
                const nswDevices = deviceLocations.filter(d => d.region === 'NSW');
                const nswStatusCounts = {
                    hidden: nswDevices.filter(d => d.status === 'hidden').length,
                    charging: nswDevices.filter(d => d.status === 'charging').length,
                    discharging: nswDevices.filter(d => d.status === 'discharging').length,
                    inactive: nswDevices.filter(d => d.status === 'inactive').length,
                    offline: nswDevices.filter(d => d.status === 'offline').length
                };

                // 立即显示NSW地区的设备统计数据（在任何其他操作之前）
                const nswStats = regionData['NSW'].deviceStats;
                if (document.getElementById('totalDevices')) {
                    document.getElementById('totalDevices').textContent = nswStats.total;
                    document.getElementById('successfulDevices').textContent = nswStats.success;
                    document.getElementById('executingDevices').textContent = nswStats.executing;
                    document.getElementById('failedDevices').textContent = nswStats.failed;
                }

                // 立即初始化抽屉的设备数据，确保点击时有数据可显示
                updateDeviceStatusCounts(nswStats.success, nswStats.executing, nswStats.failed, nswStats);

                // 初始化地区状态指示器
                updateRegionStatusIndicators();

                // 设置默认选中NSW地区
                const defaultRegion = document.querySelector('.region-select-tab[data-region="NSW"]');
                if (defaultRegion) {
                    selectMainRegion('NSW', defaultRegion);
                }

                // 强制立即显示NSW地区的设备统计数据（确保页面加载时就能看到）
                setTimeout(() => {
                    updateRegionDeviceStats('NSW');

                    const nswStatusBadge = document.querySelector('[data-region="NSW"] .region-status-badge');
                    if (nswStatusBadge) {
                        nswStatusBadge.setAttribute('data-status', 'waitingExecution');
                        nswStatusBadge.textContent = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
                        nswStatusBadge.style.background = 'rgba(30, 127, 255, 0.2)';
                        nswStatusBadge.style.color = '#1E7FFF';
                        nswStatusBadge.style.border = '1px dashed #1E7FFF';
                        nswStatusBadge.style.display = 'inline-block';
                        nswStatusBadge.style.padding = '6px 12px';
                        nswStatusBadge.style.borderRadius = '12px';
                        nswStatusBadge.style.fontSize = '11px';
                        nswStatusBadge.style.fontWeight = '600';
                    }
                }, 100);
                
                // 定期更新地区状态（模拟实时数据）
                setInterval(updateRegionStatusIndicators, 30000); // 每30秒更新一次

                // 设备统计数据由 selectMainRegion -> updateRegionDeviceStats 自动更新
                // 额外保险：延迟300ms再强制更新一次，确保页面加载完成后数据一定显示
                setTimeout(() => {
                    updateRegionDeviceStats('NSW');
                }, 300);

                
                // Check if chart containers exist
                const containers = ['powerRevenueChart', 'systemPerformance', 'marketChart', 'australiaMap'];
                containers.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                    }
                });
                
                
                try {
                    initPowerRevenueChart();
                } catch (e) {
                    // error('Failed to initialize power chart:', e);
                }
                
                try {
                    initSystemPerformanceChart();
                } catch (e) {
                    // error('Failed to initialize performance chart:', e);
                }
                
                try {
                    initMarketChart();
                } catch (e) {
                    // error('Failed to initialize market chart:', e);
                }
                
                try {
                    initMap();
                } catch (e) {
                    // error('Failed to initialize map:', e);
                }
                
                
                // Verify chart objects created
                setTimeout(() => {
                    
                    // Force resize all charts after initialization
                    if (marketChart) {
                        if (marketChart && typeof marketChart.resize === 'function') {
                            if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                        }
                    }
                    if (mapChart) {
                        if (mapChart && typeof mapChart.resize === 'function') {
                            mapChart.resize();
                        }
                    }
                    if (powerChart) {
                        if (powerChart && typeof powerChart.resize === 'function') {
                            powerChart.resize();
                        }
                    }
                    if (performanceChart) {
                        if (performanceChart && typeof performanceChart.resize === 'function') {
                            performanceChart.resize();
                        }
                    }
                }, 300);
                
                // Initialize time selector after charts are ready
                setTimeout(() => {
                    try {
                        initPowerChartTimeSelector();
                    } catch (error) {
                        // error('TimeSelector initialization failed:', error);
                    }
                }, 100);
                
                // Initialize with NSW region
                updatePriceCircleRegion('NSW');

                // Force apply button styles
                forceButtonStyles();
                // Apply styles periodically to ensure they stick  
                setInterval(forceButtonStyles, 3000);
                
                // Add device response modal click handlers
                setTimeout(() => {
                    const statusSummary = document.querySelector('.status-summary');
                    if (statusSummary) {
                        statusSummary.style.cursor = 'pointer';
                        statusSummary.addEventListener('click', showDeviceResponseModal);
                    }
                    
                    // Also check for any analytics cards with device response text
                    const allCards = document.querySelectorAll('.card, .metric-card, .stat-card');
                    allCards.forEach(card => {
                        const text = card.textContent;
                        if (text && (text.includes('设备响应') || text.includes('Device Response'))) {
                            card.style.cursor = 'pointer';
                            card.addEventListener('click', showDeviceResponseModal);
                        }
                    });
                }, 1000);
                
                // Initialize highest price region display
                // updateHighestPriceRegion(); // Removed - using fixed text now
                
                // Initialize other station data
                const availableHomesEl = document.getElementById('availableHomes');
                const availablePowerEl = document.getElementById('availablePower');
                const estimatedProfitEl = document.getElementById('estimatedProfit');
                
                if (availableHomesEl) availableHomesEl.textContent = '235';
                if (availablePowerEl) availablePowerEl.textContent = '23547kWh';
                if (estimatedProfitEl) estimatedProfitEl.textContent = '$12435';

                // Start real-time updates (每5秒更新一次)
                // 注意：首次更新会在 initMarketChart() 完成AEMO数据加载后自动执行
                setInterval(updateRealtimeData, 5000);
            } catch (error) {
                // error('Chart initialization failed:', error);
            }
            
            // Start auto switch if enabled
            const autoSwitchElement = document.getElementById('autoSwitch');
            if (autoSwitchElement && autoSwitchElement.checked) {
                startAutoSwitch();
            }
            
            // Add i18n observer to update charts when language changes
            if (window.i18n) {
                window.i18n.addObserver((newLanguage, oldLanguage) => {
                    // Update power chart
                    if (powerChart) {
                        const dischargeLabel = window.i18n.getText('discharge');
                        const revenueLabel = window.i18n.getText('totalRevenue');
                        powerChart.setOption({
                            legend: {
                                data: [dischargeLabel, revenueLabel]
                            },
                            yAxis: [
                                {
                                    name: newLanguage === 'en' ? 'Power (kWh)' : 'kWh'
                                },
                                {
                                    name: newLanguage === 'en' ? 'Revenue ($)' : '$'
                                }
                            ],
                            series: [
                                {
                                    name: dischargeLabel
                                },
                                {
                                    name: revenueLabel
                                }
                            ]
                        });
                    }
                    
                    // Update market chart
                    if (marketChart) {
                        marketChart.setOption({
                            legend: {
                                data: [
                                    window.i18n.getText('historicalPrice'),
                                    window.i18n.getText('demand'),
                                    window.i18n.getText('predictedPrice'),
                                    window.i18n.getText('predictedDemand')
                                ]
                            },
                            yAxis: [
                                {
                                    name: window.i18n.getText('price')
                                },
                                {
                                    name: window.i18n.getText('demand')
                                }
                            ],
                            series: [
                                {
                                    name: window.i18n.getText('historicalPrice')
                                },
                                {
                                    name: window.i18n.getText('demand')
                                },
                                {
                                    name: window.i18n.getText('predictedPrice')
                                },
                                {
                                    name: window.i18n.getText('predictedDemand')
                                }
                            ]
                        });
                    }
                    
                    // Re-init system performance chart to update series names
                    if (document.getElementById('systemPerformance')) {
                        initSystemPerformanceChart();
                    }
                    
                    // Update time selector labels for charts
                    const currentPeriod = powerChartTimeSelector ? powerChartTimeSelector.getCurrentPeriod() : 'month';
                    const { labels, power, revenue } = generateAnalyticsData(currentPeriod);
                    updatePowerChartWithData(labels, power, revenue, currentPeriod);
                });
            }
        });
        
        // 显示强制刷新通知
        function showRefreshNotification() {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #00ff88, #00aaff);
                color: #000;
                padding: 20px 40px;
                border-radius: 10px;
                font-size: 18px;
                font-weight: 600;
                z-index: 999999;
                box-shadow: 0 8px 32px rgba(0, 255, 136, 0.5);
                animation: pulse 0.5s ease-in-out;
            `;
            notification.textContent = window.i18n ? window.i18n.getText('forceRefreshing') : '正在强制刷新页面...';
            document.body.appendChild(notification);
        }

        // System Performance Chart (Simplified Overview)
        function initSystemPerformanceChart() {
            performanceChart = echarts.init(document.getElementById('systemPerformance'));
            
            const hours = [];
            const efficiency = [];
            const availability = [];
            
            // Generate last 12 hours of system performance data
            for (let i = 11; i >= 0; i--) {
                const time = new Date();
                time.setHours(time.getHours() - i);
                hours.push(`${time.getHours()}:00`);
                
                // Generate realistic performance metrics
                efficiency.push(93.8 + Math.random() * 6.2); // 93.8-100% efficiency
                availability.push(95 + Math.random() * 5); // 95-100% availability
            }

            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    textStyle: { color: '#fff' },
                    formatter: function(params) {
                        let result = params[0].name + '<br/>';
                        params.forEach(function(item) {
                            result += item.marker + ' ' + item.seriesName + ': ' + item.value.toFixed(1) + '%<br/>';
                        });
                        return result;
                    }
                },
                grid: {
                    left: '5%',
                    right: '5%',
                    bottom: '15%',
                    top: '10%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: hours,
                    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                    axisLabel: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 10 }
                },
                yAxis: {
                    type: 'value',
                    min: 85,
                    max: 100,
                    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                    axisLabel: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 10 },
                    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
                },
                series: [
                    {
                        name: window.i18n ? window.i18n.getText('executionEfficiency') : '执行效率',
                        type: 'line',
                        data: efficiency,
                        smooth: true,
                        lineStyle: { color: '#00ff88', width: 2 },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: 'rgba(0, 255, 136, 0.2)' },
                                { offset: 1, color: 'rgba(0, 255, 136, 0.05)' }
                            ])
                        },
                        symbol: 'none'
                    },
                    {
                        name: window.i18n ? window.i18n.getText('systemAvailability') : '系统可用性',
                        type: 'line',
                        data: availability,
                        smooth: true,
                        lineStyle: { color: '#00aaff', width: 2 },
                        symbol: 'none'
                    }
                ]
            };

            performanceChart.setOption(option);
            window.addEventListener('resize', throttle(() => {
                if (performanceChart && typeof performanceChart.resize === 'function') {
                    performanceChart.resize();
                }
            }, 250));
        }

        // Discharge & Profit chart
        // powerRevenueChart is already declared globally above
        function initPowerRevenueChart() {
            powerRevenueChart = echarts.init(document.getElementById('powerRevenueChart'));

            // Generate realistic Australian household energy data for 24 hours (48 data points, 30-min intervals)
            // Adjusted based on current Australian season
            function generateRealisticEnergyData() {
                const inputData = [];  // Grid purchase (kW)
                const outputData = []; // Solar + Battery feed-in (kW)
                const profitData = [];  // Profit ($)

                // Grid purchase rate: ~$0.30/kWh, Feed-in rate: ~$0.08/kWh (Australian typical rates)
                const gridRate = 0.30;
                const feedInRate = 0.08;

                // Get current month (1-12) to determine season
                const currentMonth = new Date().getMonth() + 1;
                const isSummer = currentMonth === 12 || currentMonth === 1 || currentMonth === 2; // Dec-Feb
                const isWinter = currentMonth === 6 || currentMonth === 7 || currentMonth === 8; // Jun-Aug

                // Seasonal multipliers for solar generation and grid purchase
                const solarMultiplier = isSummer ? 1.3 : isWinter ? 0.6 : 1.0;
                const gridMultiplier = isSummer ? 0.7 : isWinter ? 1.4 : 1.0;

                for (let i = 0; i < 48; i++) {
                    const hour = Math.floor(i / 2);
                    const minute = (i % 2) * 30;

                    let gridPurchase = 0;  // From grid
                    let feedIn = 0;        // To grid

                    // Night period (0:00-6:00): Low grid purchase, minimal feed-in
                    if (hour >= 0 && hour < 6) {
                        gridPurchase = (0.3 + Math.random() * 0.4) * gridMultiplier;
                        feedIn = Math.random() * 0.1;
                    }
                    // Morning peak (6:00-9:00): Increasing grid purchase, solar starts
                    else if (hour >= 6 && hour < 9) {
                        gridPurchase = (1.5 + (hour - 6) * 0.8 + Math.random() * 0.5) * gridMultiplier;
                        feedIn = Math.max(0, (hour - 6) * 0.8 + Math.random() * 0.5) * solarMultiplier;
                    }
                    // Mid-morning to afternoon (9:00-17:00): Solar peak, low grid purchase
                    else if (hour >= 9 && hour < 17) {
                        gridPurchase = (0.2 + Math.random() * 0.3) * gridMultiplier;

                        // Solar peak around midday (12:00-15:00)
                        if (hour >= 12 && hour < 15) {
                            feedIn = (4.5 + Math.random() * 1.5) * solarMultiplier;
                        } else if (hour >= 10 && hour < 12) {
                            feedIn = (3.0 + Math.random() * 1.0) * solarMultiplier;
                        } else if (hour >= 15 && hour < 17) {
                            feedIn = (2.5 + Math.random() * 1.0) * solarMultiplier;
                        } else {
                            feedIn = (2.0 + Math.random() * 0.8) * solarMultiplier;
                        }
                    }
                    // Evening peak (17:00-22:00): High grid purchase, declining solar
                    else if (hour >= 17 && hour < 22) {
                        gridPurchase = (2.5 + (hour - 17) * 0.3 + Math.random() * 0.8) * gridMultiplier;

                        // Solar declining, some battery discharge
                        if (hour < 19) {
                            feedIn = Math.max(0, (1.5 - (hour - 17) * 0.5 + Math.random() * 0.3) * solarMultiplier);
                        } else {
                            feedIn = Math.random() * 0.3;
                        }
                    }
                    // Late night (22:00-24:00): Decreasing grid purchase
                    else {
                        gridPurchase = (1.2 - (hour - 22) * 0.4 + Math.random() * 0.3) * gridMultiplier;
                        feedIn = Math.random() * 0.1;
                    }

                    // Calculate profit: feed-in revenue only
                    // Convert kW to kWh for 30-min interval (kW * 0.5h)
                    const profit = feedIn * 0.5 * feedInRate;

                    inputData.push(parseFloat(gridPurchase.toFixed(2)));
                    outputData.push(parseFloat(feedIn.toFixed(2)));
                    profitData.push(parseFloat(profit.toFixed(2)));
                }

                return { inputData, outputData, profitData };
            }

            const { inputData, outputData, profitData } = generateRealisticEnergyData();

            const options = {
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    textStyle: { color: '#fff' },
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: 'var(--color-text-secondary)'
                        }
                    }
                },
                legend: {
                    data: [
                        window.i18n ? window.i18n.getText('input') : 'Input',
                        window.i18n ? window.i18n.getText('output') : 'Output',
                        window.i18n ? window.i18n.getText('profit') : '获利'
                    ],
                    textStyle: { color: 'rgba(255, 255, 255, 0.7)' },
                    top: 0
                },
                grid: {
                    left: '3%',
                    right: '3%',
                    bottom: '3%',
                    top: '15%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: Array.from({length: 48}, (_, i) => {
                        const hour = Math.floor(i / 2);
                        const minute = (i % 2) * 30;
                        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                    }),
                    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                    axisLabel: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        interval: 5  // Show every 6th label to avoid crowding
                    }
                },
                yAxis: [{
                    type: 'value',
                    name: 'kW',
                    nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                    min: 0,
                    max: 8,
                    interval: 1,
                    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                    axisLabel: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        formatter: '{value}'
                    },
                    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }
                }, {
                    type: 'value',
                    name: window.i18n ? window.i18n.getText('profit') : '获利',
                    nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                    min: 0,
                    max: 0.3,
                    interval: 0.05,
                    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                    axisLabel: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        formatter: '${value}'
                    },
                    splitLine: { show: false }
                }],
                series: [{
                    name: window.i18n ? window.i18n.getText('input') : 'Input',
                    type: 'line',
                    data: inputData,
                    lineStyle: {
                        width: 3,
                        color: '#00ff88'
                    },
                    itemStyle: { color: '#00ff88' },
                    symbol: 'circle',
                    symbolSize: 6,
                    smooth: true
                }, {
                    name: window.i18n ? window.i18n.getText('output') : 'Output',
                    type: 'line',
                    data: outputData,
                    lineStyle: {
                        width: 3,
                        color: '#ffd700'
                    },
                    itemStyle: { color: '#ffd700' },
                    symbol: 'circle',
                    symbolSize: 6,
                    smooth: true
                }, {
                    name: window.i18n ? window.i18n.getText('profit') : '获利',
                    type: 'bar',
                    yAxisIndex: 1,
                    data: profitData,
                    itemStyle: {
                        color: '#1E7FFF',
                        opacity: 0.8
                    },
                    barWidth: '30%'
                }]
            };
            
            powerRevenueChart.setOption(options);
            window.addEventListener('resize', throttle(() => {
                if (powerRevenueChart && typeof powerRevenueChart.resize === 'function') {
                    powerRevenueChart.resize();
                }
            }, 250));
        }


        // 地区操作状态存储
        const regionOperationStatus = {
            'NSW': 'none',  // 修改为none，由regionData控制状态
            'QLD': 'discharging',
            'VIC': 'charging',
            'SA': 'discharging',
            'TAS': 'discharging'
        };
        
        // 获取地区操作状态
        function getRegionOperationStatus(region) {
            return regionOperationStatus[region] || 'none';
        }
        
        // 更新地区操作状态
        function updateRegionOperationStatus(region, status) {
            regionOperationStatus[region] = status;
        }

        // 更新地区按钮状态指示器
        function updateRegionStatusIndicators() {
            document.querySelectorAll('.region-select-tab').forEach(tab => {
                const region = tab.getAttribute('data-region');
                const status = getRegionOperationStatus(region);
                let statusElement = tab.querySelector('.region-status');
                
                // 先移除所有可能的占位元素
                const lastChild = tab.lastElementChild;
                if (lastChild && lastChild.tagName === 'SPAN' && !lastChild.classList.contains('region-status') && lastChild.style.width === '20px') {
                    lastChild.remove();
                }
                
                if (statusElement) {
                    // 移除现有状态类
                    statusElement.classList.remove('charging', 'discharging');
                    
                    // 新的状态显示逻辑已移至updateRegionStatusDisplay函数
                    // 这里保留为兼容性，但不再使用+/-符号
                } else {
                    // 确保有占位元素
                    const placeholder = document.createElement('span');
                    placeholder.style.width = '20px';
                    tab.appendChild(placeholder);
                }
            });
        }

        // 主地区选择函数
        function selectMainRegion(region, button) {
            selectedMainRegion = region;
            
            // 更新按钮状态
            document.querySelectorAll('.region-select-tab').forEach(tab => {
                tab.classList.remove('active');
                tab.style.background = 'transparent';
                tab.style.color = 'var(--color-text-secondary)';
                tab.style.border = '1px solid var(--color-border)';
                tab.style.borderRadius = '50px';
                
                // Reset region name color for non-selected tabs
                const regionNameSpan = tab.querySelector('span');
                if (regionNameSpan && !regionNameSpan.innerHTML.includes('<div')) {
                    regionNameSpan.style.color = 'var(--color-text-secondary)';
                }
            });
            button.classList.add('active');
            button.style.background = 'var(--color-region-primary)';
            button.style.color = '#000';
            button.style.border = 'none';
            button.style.borderRadius = '50px';
            
            // Ensure region name text is visible when selected - use white for better contrast
            const regionNameSpan = button.querySelector('span');
            if (regionNameSpan && !regionNameSpan.innerHTML.includes('<div')) {
                regionNameSpan.style.color = '#000';
                regionNameSpan.style.fontWeight = '700';
            }
            
            // 获取该地区的状态，如果不存在则使用默认值
            const regionStatus = regionData[region] ? regionData[region].status : 'none';
            
            // 更新电站管理状态
            updatePowerStationStatus(region, regionStatus);
            
            // 先立即更新该地区的设备统计显示（在切换面板之前）
            updateRegionDeviceStats(region);

            // 根据状态切换面板和按钮
            if (regionStatus === 'autoCharge' || regionStatus === 'manualCharge' || regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge') {
                // 有充放电标记的地区，显示地图，按钮变成停止
                currentOperation = (regionStatus === 'autoCharge' || regionStatus === 'manualCharge') ? 'charge' : 'discharge';
                switchPanel('map');
                updateActionButtonsToStop();
            } else {
                // 无标记的地区（status === 'none' 或 'waitingExecution'），显示地图面板以显示设备统计
                currentOperation = null;
                switchPanel('map'); // 改为显示地图面板，这样才能看到设备统计
                updateActionButtonsToChargeDis();
            }

            // 更新页面数据
            updatePageDataByRegion(region);

            // 总是更新地区显示，以确保切换时样式正确
            updateRegionDisplay();

            // 强制更新地区状态显示，确保状态文字正确显示
            setTimeout(() => {
                updateRegionStatusDisplay();
            }, 50);

            // 调整间距
            setTimeout(() => {
                adjustSpacingForRegionSelector();
            }, 100);

            // 再次更新设备统计（保险）
            setTimeout(() => {
                updateRegionDeviceStats(region);
            }, 150);
        }
        
        // 更新地区设备统计显示
        function updateRegionDeviceStats(region) {

            // 获取该地区的设备统计数据
            const stats = regionData[region]?.deviceStats;

            if (!stats) {
                // error(`❌ No device stats found for region: ${region}`);
                return;
            }


            // 更新页面显示
            const totalEl = document.getElementById('totalDevices');
            const successEl = document.getElementById('successfulDevices');
            const executingEl = document.getElementById('executingDevices');
            const failedEl = document.getElementById('failedDevices');


            if (!totalEl || !successEl || !executingEl || !failedEl) {
                return; // device stats not in current layout
                return;
            }

            // 强制更新文本内容
            totalEl.textContent = stats.total;
            successEl.textContent = stats.success;
            executingEl.textContent = stats.executing;
            failedEl.textContent = stats.failed;

            // 验证更新是否成功

            // 同步更新抽屉的设备数据（传入详细统计数据）
            updateDeviceStatusCounts(stats.success, stats.executing, stats.failed, stats);
        }

        // 更新电站管理状态
        function updatePowerStationStatus(region, status) {
            const statusText = document.getElementById('regionStatusText');
            const autoToggle = document.getElementById('autoToggleKnob');
            const circle = document.getElementById('mainPriceCircle');
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            
            // 不再更新状态文字 - 按用户要求移除标题后的状态文字
            if (statusText) {
                statusText.textContent = '';
                statusText.style.display = 'none';
            }
            
            // 更新自动开关状态 - 根据地区状态控制：只有自动操作或等待执行中时为开启状态
            if (autoToggle) {
                if (status === 'autoCharge' || status === 'autoDischarge' || status === 'waitingExecution' || (status === 'none' && currentOperationMode === 'auto')) {
                    // 自动模式：开关向右（开启状态）- 纯绿色背景，白色圆点
                    autoToggle.style.right = '1px';
                    autoToggle.style.left = 'auto';
                    autoToggle.style.background = '#fff';
                    autoToggle.parentElement.style.background = '#4CD964';
                } else {
                    // 手动模式：开关向左（关闭状态）
                    autoToggle.style.left = '1px';
                    autoToggle.style.right = 'auto';
                    autoToggle.style.background = '#fff';
                    autoToggle.parentElement.style.background = 'rgba(255,255,255,0.1)';
                }
            }
            
            // 控制充放电按钮的显示/隐藏
            if (chargeBtn && dischargeBtn) {
                if (status === 'none') {
                    // 无状态时显示充放电按钮
                    chargeBtn.style.display = 'flex';
                    dischargeBtn.style.display = 'flex';
                    
                    // 根据当前模式设置按钮状态
                    if (currentOperationMode === 'auto') {
                        chargeBtn.style.display = 'none';
                        dischargeBtn.style.display = 'none';
                    } else {
                        chargeBtn.disabled = false;
                        dischargeBtn.disabled = false;
                        chargeBtn.style.opacity = '1';
                        dischargeBtn.style.opacity = '1';
                        chargeBtn.style.cursor = 'pointer';
                        dischargeBtn.style.cursor = 'pointer';
                    }
                } else {
                    // 有状态时的按钮处理
                    if (currentOperationMode === 'auto') {
                        // 自动模式：隐藏按钮
                        chargeBtn.style.display = 'none';
                        dischargeBtn.style.display = 'none';
                    } else {
                        // 手动模式：隐藏按钮
                        chargeBtn.style.display = 'none';
                        dischargeBtn.style.display = 'none';
                    }
                }
            }
            
            // 更新水波颜色和高度
            if (circle) {
                const waterWaveContainer = circle.querySelector('#waterWaveContainer');
                const waterLevelContainer = circle.querySelector('#waterLevelContainer');
                
                if (status === 'autoCharge' || status === 'manualCharge') {
                    // 充电状态 - 使用菜单栏选中主题色，水波高度30%，添加大圆和水波动效
                    if (waterWaveContainer) {
                        waterWaveContainer.style.background = 'var(--color-primary, #00ff88)';
                    }
                    if (waterLevelContainer) {
                        waterLevelContainer.style.height = '100%';
                    }
                    // 给大圆添加向外微动效
                    circle.style.animation = 'chargeCirclePulse 2s ease-in-out infinite';
                } else if (status === 'autoDischarge' || status === 'manualDischarge') {
                    // 放电状态 - 黄色水波，水波高度80%，添加大圆和水波动效
                    if (waterWaveContainer) {
                        waterWaveContainer.style.background = '#FFC107';
                    }
                    if (waterLevelContainer) {
                        waterLevelContainer.style.height = '100%';
                    }
                    // 给大圆添加向外微动效
                    circle.style.animation = 'dischargeCirclePulse 2.2s ease-in-out infinite';
                } else {
                    // 无状态 - 蓝色水波，默认高度50%，无动效
                    if (waterWaveContainer) {
                        waterWaveContainer.style.background = '#5AC8FA';
                    }
                    if (waterLevelContainer) {
                        waterLevelContainer.style.height = '100%';
                    }
                    // 移除大圆动效
                    circle.style.animation = 'none';
                }
            }
            
            // 根据状态更新价格显示
            updatePriceByStatus(region, status);
            
            // 更新大圆中的状态标签
            updateStationStatusLabel(status);
            
            // 更新大圆显示状态
            updateCircleStatusDisplay();

            // 更新AI预测文本
            updateAIPredictionText();
        }

        // 更新电站状态标签
        function updateStationStatusLabel(status) {
            const statusLabel = document.getElementById('stationStatusLabel');
            if (!statusLabel) return;
            
            
            let statusText = '';
            let showLabel = true;
            
            if (status === 'none') {
                // 没有状态时隐藏标签
                showLabel = false;
            } else if (status === 'autoCharge') {
                statusText = window.i18n ? window.i18n.getText('autoCharge') : '智能充电';
            } else if (status === 'manualCharge') {
                statusText = window.i18n ? window.i18n.getText('manualCharge') : '手动充电';
            } else if (status === 'autoDischarge') {
                statusText = window.i18n ? window.i18n.getText('autoDischarge') : '智能放电';
            } else if (status === 'manualDischarge') {
                statusText = window.i18n ? window.i18n.getText('manualDischarge') : '手动放电';
            } else if (status === 'waitingExecution') {
                statusText = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
            }
            
            if (showLabel) {
                statusLabel.textContent = statusText;
                statusLabel.style.display = 'block';
            } else {
                statusLabel.style.display = 'none';
            }
        }
        
        // 根据状态更新价格
        function updatePriceByStatus(region, status) {
            let price;

            // 优先使用AEMO真实数据的当前价格
            if (aemoRealPriceData && aemoRealPriceData.length > 0) {
                // 计算当前时间索引
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const roundedMinute = Math.floor(currentMinute / 5) * 5;
                const currentTimeIndex = currentHour * 12 + (roundedMinute / 5);

                // 使用真实的现货价格
                price = aemoRealPriceData[currentTimeIndex];
            } else {
                // 后备方案：各地区固定价格
                const regionPrices = {
                    'NSW': 163,
                    'QLD': 34,
                    'VIC': 21,
                    'SA': 403,
                    'TAS': 390
                };
                price = regionPrices[region] || 163; // 默认NSW价格
            }

            // 更新价格显示
            const currentPriceElement = document.getElementById('currentPrice');
            if (currentPriceElement) currentPriceElement.textContent = '$' + (typeof price === 'number' ? price.toFixed(2) : price);
        }
        
        // 更新操作按钮为停止状态
        function updateActionButtonsToStop() {
            const actionButtonsContainer = document.querySelector('.action-buttons');
            if (!actionButtonsContainer) return;
            
            // 添加operating类
            actionButtonsContainer.classList.add('operating');
            
            // 处理充放电按钮
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            
            if (chargeBtn && dischargeBtn) {
                if (currentOperationMode === 'auto') {
                    // 自动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                } else {
                    // 手动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                }
            }
            
            // 不显示停止按钮，停止功能集成在大圆中
            // 移除任何现有的停止按钮
            const stopBtn = document.querySelector('.stop-btn');
            if (stopBtn) {
                stopBtn.remove();
            }
            
            // 不需要更改显示，保持价格显示
        }
        
        // 更新操作按钮为充放电状态
        function updateActionButtonsToChargeDis() {
            const actionButtonsContainer = document.querySelector('.action-buttons');
            if (!actionButtonsContainer) return;
            
            // 移除operating类
            actionButtonsContainer.classList.remove('operating');
            
            // 重置当前操作状态
            currentOperation = null;
            
            // 调用resetButtons确保正确重置
            resetButtons();
            
            // 移除停止按钮（而不仅是隐藏）
            const stopBtn = document.querySelector('.stop-btn');
            if (stopBtn) {
                stopBtn.remove();
            }
            
            // 确保按钮事件处理器正确绑定
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            if (chargeBtn) {
                chargeBtn.onclick = handleCharge;
            }
            if (dischargeBtn) {
                dischargeBtn.onclick = handleDischarge;
            }
        }
        
        // 根据地区更新页面数据
        function updatePageDataByRegion(region) {
            // 更新电站管理数据
            updatePowerStationData(region);
            
            // 更新市场数据
            updateMarketDataByRegion(region);
            
            // 更新统计卡片
            updateStatisticsCards(region);
            
            // 更新图表
            if (marketChart) {
                updateMarketChart();
            }
            if (powerRevenueChart) {
                updateDischargeChart(currentDischargePeriod, document.getElementById('discharge-date-input').value);
            }
            
            // 更新地图显示
            if (mapChart) {
                updateMapByRegion(region);
            }
        }
        
        // 更新电站管理数据
        function updatePowerStationData(region) {
            const regionData = {
                'NSW': { price: '$163', low: '$120.50', high: '$185.75', families: 120, power: '65kWh', profit: '$3500' },
                'QLD': { price: '$34', low: '$110.00', high: '$170.00', families: 90, power: '48kWh', profit: '$2800' },
                'VIC': { price: '$21', low: '$115.50', high: '$175.50', families: 100, power: '52kWh', profit: '$3100' },
                'SA': { price: '$403', low: '$125.00', high: '$190.00', families: 70, power: '38kWh', profit: '$2200' },
                'TAS': { price: '$390', low: '$100.00', high: '$160.00', families: 355, power: '32kWh', profit: '$1835' }
            };

            const data = regionData[region] || regionData['NSW'];

            // 更新价格显示
            const currentPriceEl = document.getElementById('currentPrice');
            const todayLowEl = document.getElementById('todayLow');
            const todayHighEl = document.getElementById('todayHigh');
            const regionIndicatorEl = document.getElementById('regionIndicator');

            // 优先使用AEMO真实数据的当前价格
            if (currentPriceEl) {
                if (aemoRealPriceData && aemoRealPriceData.length > 0) {
                    // 计算当前时间索引
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMinute = now.getMinutes();
                    const roundedMinute = Math.floor(currentMinute / 5) * 5;
                    const currentTimeIndex = currentHour * 12 + (roundedMinute / 5);

                    // 使用真实的现货价格
                    const currentPrice = aemoRealPriceData[currentTimeIndex];
                    currentPriceEl.textContent = '$' + currentPrice.toFixed(2);
                } else {
                    // 后备方案：使用固定价格
                    currentPriceEl.textContent = data.price;
                }
            }
            if (todayLowEl) todayLowEl.textContent = data.low;
            if (todayHighEl) todayHighEl.textContent = data.high;
            if (regionIndicatorEl) regionIndicatorEl.textContent = region;
            
            // 更新统计数据
            const totalFamiliesCardEl = document.getElementById('totalFamiliesCard');
            if (totalFamiliesCardEl) totalFamiliesCardEl.textContent = data.families;
            // 更新电站管理中的三个小卡片
            const powerStationCards = document.querySelectorAll('.power-station-container .stat-value');
            if (powerStationCards.length >= 3) {
                powerStationCards[0].textContent = data.families;  // 家庭数
                powerStationCards[1].textContent = data.power;  // 可放电量
                powerStationCards[2].textContent = data.profit;  // 预计获利
            }
            
            // 更新最高价格区域显示
            const highestPriceRegionElement = document.getElementById('highestPriceRegion') || document.getElementById('highestPriceRegionDisplay');
            if (highestPriceRegionElement) {
                highestPriceRegionElement.textContent = region;
            }
        }
        
        // 更新市场数据
        function updateMarketDataByRegion(region) {
            // 触发市场面板的地区切换
            const marketRegionTab = document.querySelector(`.region-tab[onclick*="${region}"]`);
            if (marketRegionTab) {
                switchMarketRegion(region, marketRegionTab);
            }
        }
        
        // 更新统计卡片
        function updateStatisticsCards(region) {
            const summaryData = {
                'NSW': { families: 120, capacity: '65kWh', discharge: '89kwh', profit: '$3500' },
                'QLD': { families: 90, capacity: '48kWh', discharge: '45kwh', profit: '$2800' },
                'VIC': { families: 100, capacity: '52kWh', discharge: '51kwh', profit: '$3100' },
                'SA': { families: 70, capacity: '38kWh', discharge: '32kwh', profit: '$2200' },
                'TAS': { families: 355, capacity: '32kWh', discharge: '17kwh', profit: '$1835' }
            };
            
            const data = summaryData[region] || summaryData['NSW'];
            
            // 更新汇总卡片
            const familySummary = document.getElementById('familySummaryCard');
            if (familySummary) familySummary.textContent = data.families;
            
            // 更新其他汇总数据
            const summaryElements = document.querySelectorAll('.info-summary-card .stat-value');
            if (summaryElements.length >= 4) {
                summaryElements[1].textContent = data.capacity;
                summaryElements[2].textContent = data.discharge;
                summaryElements[3].textContent = data.profit;
            }
        }
        
        // 更新地图显示
        function updateMapByRegion(region) {
            if (!mapChart) return;

            // 只显示选定地区的设备
            if (deviceLocations && deviceLocations.length > 0) {
                // 过滤选中地区的设备，同时过滤掉hidden状态的设备
                const filteredDevices = deviceLocations.filter(device =>
                    device.region === region && device.status !== 'hidden'
                );
                const seriesData = filteredDevices.map(device => ({
                    value: device.value,
                    id: device.id,
                    status: device.status,
                    region: device.region
                }));
                
                mapChart.setOption({
                    series: [{
                        data: seriesData
                    }]
                });
            }
            
            updateMapStatistics();
        }
        
        // Update functions
        function switchRegion(region, button) {
            currentRegion = region;
            
            // Update active button
            document.querySelectorAll('.chart-controls .tab').forEach(tab => {
                tab.classList.remove('active');
            });
            button.classList.add('active');
            
            // Update chart with new data
            updateMainChart('both');
        }

        function switchPriceRegion(region, button) {
            // Update active button
            const parent = button.parentElement;
            parent.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            button.classList.add('active');
        }

        // Discharge & Profit time period switching
        let currentDischargePeriod = 'day';
        
        function handleDischargePeriodChange() {
            const periodSelect = document.getElementById('discharge-period-select');
            const period = periodSelect.value;
            currentDischargePeriod = period;
            
            // Handle date picker visibility and type
            const datePicker = document.getElementById('discharge-date-picker');
            const dateInput = document.getElementById('discharge-date-input');
            
            if (period === 'cumulative') {
                // Hide date picker for cumulative
                datePicker.style.display = 'none';
            } else {
                // Show date picker
                datePicker.style.display = 'flex';
                
                // Set appropriate input type and default value
                const today = new Date();
                switch(period) {
                    case 'day':
                        dateInput.type = 'date';
                        dateInput.value = today.toISOString().split('T')[0];
                        dateInput.style.minWidth = '140px';
                        dateInput.style.width = '';
                        break;
                    case 'month':
                        dateInput.type = 'month';
                        dateInput.value = today.toISOString().slice(0, 7);
                        dateInput.style.minWidth = '140px';
                        dateInput.style.width = '';
                        break;
                    case 'year':
                        // For year, we'll use a number input
                        dateInput.type = 'number';
                        dateInput.min = '2020';
                        dateInput.max = today.getFullYear().toString();
                        dateInput.value = today.getFullYear().toString();
                        dateInput.style.minWidth = '100px';
                        dateInput.style.width = '100px';
                        break;
                }
            }
            
            // Update chart data based on period
            updateDischargeChart(period, dateInput.value);
        }
        
        function updateDischargeChart(period, dateValue) {
            if (!powerRevenueChart) {
                initPowerRevenueChart();
                if (!powerRevenueChart) {
                    // error('Failed to initialize powerRevenueChart');
                    return;
                }
            }

            let xAxisData, inputData, outputData, profitData;
            let yAxisConfig, yAxis2Config;
            const feedInRate = 0.08; // $0.08/kWh feed-in rate

            switch(period) {
                case 'day':
                    // Half-hourly data for selected day (48 data points) - Power in kW
                    xAxisData = Array.from({length: 48}, (_, i) => {
                        const hour = Math.floor(i / 2);
                        const minute = (i % 2) * 30;
                        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                    });

                    // Generate realistic Australian household energy data
                    // Adjusted based on current Australian season
                    inputData = [];
                    outputData = [];
                    profitData = [];

                    // Get current month (1-12) to determine season
                    const currentMonth = new Date().getMonth() + 1;
                    const isSummer = currentMonth === 12 || currentMonth === 1 || currentMonth === 2; // Dec-Feb
                    const isWinter = currentMonth === 6 || currentMonth === 7 || currentMonth === 8; // Jun-Aug

                    // Seasonal multipliers for solar generation and grid purchase
                    const solarMultiplier = isSummer ? 1.3 : isWinter ? 0.6 : 1.0;
                    const gridMultiplier = isSummer ? 0.7 : isWinter ? 1.4 : 1.0;

                    for (let i = 0; i < 48; i++) {
                        const hour = Math.floor(i / 2);
                        let gridPurchase = 0;
                        let feedIn = 0;

                        if (hour >= 0 && hour < 6) {
                            gridPurchase = (0.3 + Math.random() * 0.4) * gridMultiplier;
                            feedIn = Math.random() * 0.1;
                        } else if (hour >= 6 && hour < 9) {
                            gridPurchase = (1.5 + (hour - 6) * 0.8 + Math.random() * 0.5) * gridMultiplier;
                            feedIn = Math.max(0, (hour - 6) * 0.8 + Math.random() * 0.5) * solarMultiplier;
                        } else if (hour >= 9 && hour < 17) {
                            gridPurchase = (0.2 + Math.random() * 0.3) * gridMultiplier;
                            if (hour >= 12 && hour < 15) {
                                feedIn = (4.5 + Math.random() * 1.5) * solarMultiplier;
                            } else if (hour >= 10 && hour < 12) {
                                feedIn = (3.0 + Math.random() * 1.0) * solarMultiplier;
                            } else if (hour >= 15 && hour < 17) {
                                feedIn = (2.5 + Math.random() * 1.0) * solarMultiplier;
                            } else {
                                feedIn = (2.0 + Math.random() * 0.8) * solarMultiplier;
                            }
                        } else if (hour >= 17 && hour < 22) {
                            gridPurchase = (2.5 + (hour - 17) * 0.3 + Math.random() * 0.8) * gridMultiplier;
                            if (hour < 19) {
                                feedIn = Math.max(0, (1.5 - (hour - 17) * 0.5 + Math.random() * 0.3) * solarMultiplier);
                            } else {
                                feedIn = Math.random() * 0.3;
                            }
                        } else {
                            gridPurchase = (1.2 - (hour - 22) * 0.4 + Math.random() * 0.3) * gridMultiplier;
                            feedIn = Math.random() * 0.1;
                        }

                        const profit = feedIn * 0.5 * feedInRate; // kW * 0.5h = kWh

                        inputData.push(parseFloat(gridPurchase.toFixed(2)));
                        outputData.push(parseFloat(feedIn.toFixed(2)));
                        profitData.push(parseFloat(profit.toFixed(2)));
                    }

                    // Y-axis for day view: kW (0-8) and $ (0-0.3)
                    yAxisConfig = {
                        type: 'value',
                        name: 'kW',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 8,
                        interval: 1,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '{value}'
                        },
                        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }
                    };
                    yAxis2Config = {
                        type: 'value',
                        name: window.i18n ? window.i18n.getText('profit') : '获利',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 0.3,
                        interval: 0.05,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '${value}'
                        },
                        splitLine: { show: false }
                    };
                    break;

                case 'month':
                    // Daily data for selected month - Energy in kWh per day
                    const daysInMonth = new Date(dateValue.split('-')[0], dateValue.split('-')[1], 0).getDate();
                    xAxisData = Array.from({length: daysInMonth}, (_, i) => (i + 1).toString());

                    inputData = [];
                    outputData = [];
                    profitData = [];

                    for (let day = 0; day < daysInMonth; day++) {
                        // Simulate seasonal variation (summer = more solar)
                        const month = parseInt(dateValue.split('-')[1]);
                        const isSummer = month === 12 || month === 1 || month === 2;
                        const isWinter = month === 6 || month === 7 || month === 8;

                        // Daily grid purchase: 8-15 kWh/day
                        const gridPurchase = (isSummer ? 8 : isWinter ? 13 : 10) + Math.random() * 5;

                        // Daily feed-in: 15-35 kWh/day (summer higher)
                        const feedIn = (isSummer ? 25 : isWinter ? 15 : 20) + Math.random() * 10;

                        // Daily profit from feed-in
                        const profit = feedIn * feedInRate;

                        inputData.push(parseFloat(gridPurchase.toFixed(1)));
                        outputData.push(parseFloat(feedIn.toFixed(1)));
                        profitData.push(parseFloat(profit.toFixed(2)));
                    }

                    // Y-axis for month view: kWh per day (0-40) and $ (0-3)
                    yAxisConfig = {
                        type: 'value',
                        name: 'kWh',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 40,
                        interval: 5,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '{value}'
                        },
                        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }
                    };
                    yAxis2Config = {
                        type: 'value',
                        name: window.i18n ? window.i18n.getText('profit') : '获利',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 3,
                        interval: 0.5,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '${value}'
                        },
                        splitLine: { show: false }
                    };
                    break;

                case 'year':
                    // Monthly data for selected year - Energy in kWh per month
                    // Fixed order: Jan to Dec
                    xAxisData = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

                    inputData = [];
                    outputData = [];
                    profitData = [];

                    // Seasonal patterns for Australia (Southern hemisphere)
                    const monthlyPatterns = [
                        { grid: 280, feedIn: 850 },  // Jan (summer)
                        { grid: 260, feedIn: 780 },  // Feb (summer)
                        { grid: 300, feedIn: 720 },  // Mar (autumn)
                        { grid: 320, feedIn: 650 },  // Apr (autumn)
                        { grid: 350, feedIn: 580 },  // May (autumn)
                        { grid: 400, feedIn: 520 },  // Jun (winter)
                        { grid: 420, feedIn: 500 },  // Jul (winter)
                        { grid: 380, feedIn: 560 },  // Aug (winter)
                        { grid: 340, feedIn: 640 },  // Sep (spring)
                        { grid: 310, feedIn: 710 },  // Oct (spring)
                        { grid: 290, feedIn: 780 },  // Nov (spring)
                        { grid: 270, feedIn: 860 }   // Dec (summer)
                    ];

                    // Generate data in order from Jan to Dec
                    for (let i = 0; i < 12; i++) {
                        const pattern = monthlyPatterns[i];
                        const gridPurchase = pattern.grid + (Math.random() - 0.5) * 50;
                        const feedIn = pattern.feedIn + (Math.random() - 0.5) * 100;
                        const profit = feedIn * feedInRate;

                        inputData.push(parseFloat(gridPurchase.toFixed(0)));
                        outputData.push(parseFloat(feedIn.toFixed(0)));
                        profitData.push(parseFloat(profit.toFixed(2)));
                    }

                    // Y-axis for year view: kWh per month (0-1000) and $ (0-80)
                    yAxisConfig = {
                        type: 'value',
                        name: 'kWh',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 1000,
                        interval: 200,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '{value}'
                        },
                        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }
                    };
                    yAxis2Config = {
                        type: 'value',
                        name: window.i18n ? window.i18n.getText('profit') : '获利',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 80,
                        interval: 10,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '${value}'
                        },
                        splitLine: { show: false }
                    };
                    break;

                case 'cumulative':
                    // Cumulative data over time - Total kWh
                    xAxisData = ['2020', '2021', '2022', '2023', '2024'];

                    // Cumulative totals showing growth over years
                    inputData = [4200, 8800, 13500, 18800, 24500];
                    outputData = [8500, 18000, 28500, 40000, 52500];
                    profitData = [680, 1440, 2280, 3200, 4200];

                    // Y-axis for cumulative view: kWh (0-60000) and $ (0-5000)
                    yAxisConfig = {
                        type: 'value',
                        name: 'kWh',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 60000,
                        interval: 10000,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '{value}'
                        },
                        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }
                    };
                    yAxis2Config = {
                        type: 'value',
                        name: window.i18n ? window.i18n.getText('profit') : '获利',
                        nameTextStyle: { color: 'rgba(255, 255, 255, 0.6)' },
                        min: 0,
                        max: 5000,
                        interval: 1000,
                        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.2)' } },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.6)',
                            formatter: '${value}'
                        },
                        splitLine: { show: false }
                    };
                    break;
            }

            // Update chart with new data and Y-axis configuration
            powerRevenueChart.setOption({
                xAxis: {
                    data: xAxisData,
                    axisLabel: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        interval: period === 'day' ? 5 : 'auto'
                    }
                },
                yAxis: [yAxisConfig, yAxis2Config],
                series: [
                    { data: inputData },
                    { data: outputData },
                    { data: profitData }
                ]
            });
        }
        
        // Initialize discharge chart date input listener
        document.addEventListener('DOMContentLoaded', function() {
            const dateInput = document.getElementById('discharge-date-input');
            if (dateInput) {
                // Set today's date as default
                const today = new Date();
                dateInput.value = today.toISOString().split('T')[0];
                
                dateInput.addEventListener('change', function() {
                    updateDischargeChart(currentDischargePeriod, this.value);
                });
            }
        });


        // Update power chart title with current time period
        function updatePowerChartTitle() {
            const chartTitle = document.getElementById('powerChartTitle');
            if (chartTitle) {
                chartTitle.textContent = window.i18n ? window.i18n.getText('powerRevenueTrend') : '放电与收益趋势';
            }
        }

        // Initialize time selector for power chart
        function initPowerChartTimeSelector() {
            if (typeof TimeSelector === 'undefined') {
                // error('TimeSelector class not loaded');
                return;
            }
            powerChartTimeSelector = new TimeSelector({
                containerId: 'power-chart-time-selector',
                onPeriodChange: handlePowerChartPeriodChange,
                onCustomDateApply: handlePowerChartCustomDate,
                enableAutoRefresh: true,
                autoRefreshInterval: 30000,
                periods: [
                    { id: 'month', label: window.i18n ? window.i18n.getText('month') : '本月', shortcut: '1' },
                    { id: 'week', label: window.i18n ? window.i18n.getText('week') : '本周', shortcut: '2' },
                    { id: 'today', label: window.i18n ? window.i18n.getText('today') : '今日', shortcut: '3' },
                    { id: 'custom', label: window.i18n ? window.i18n.getText('custom') : '自定义', shortcut: '4' }
                ],
                quickSelectOptions: [
                    { label: window.i18n ? window.i18n.getText('last7Days') : '最近7天', days: 7 },
                    { label: window.i18n ? window.i18n.getText('last30Days') : '最近30天', days: 30 },
                    { label: window.i18n ? window.i18n.getText('last90Days') : '最近90天', days: 90 }
                ]
            });
            
            // Add language change observer to update TimeSelector
            if (window.i18n) {
                window.i18n.addObserver((newLanguage, oldLanguage) => {
                    // Re-initialize TimeSelector with new language
                    if (powerChartTimeSelector) {
                        const currentPeriod = powerChartTimeSelector.getCurrentPeriod();
                        powerChartTimeSelector.destroy();
                        initPowerChartTimeSelector();
                        // Restore current period
                        setTimeout(() => {
                            if (powerChartTimeSelector && currentPeriod !== 'today') {
                                powerChartTimeSelector.setCurrentPeriod(currentPeriod);
                            }
                        }, 100);
                    }
                });
            }
            
            // Set initial title to show default period (today)
            updatePowerChartTitle();
            
            // Force initial data load for today to ensure display
            setTimeout(() => {
                const { labels, power, revenue } = generateAnalyticsData('month');
                updatePowerChartWithData(labels, power, revenue, 'month');
            }, 200);
        }

        // Handle period change from time selector
        function handlePowerChartPeriodChange(period, data) {
            
            // Update chart title with current period
            updatePowerChartTitle();
            
            // Generate data for the selected period
            const { labels, power, revenue } = generateAnalyticsData(period);
            
            // Update the power chart
            updatePowerChartWithData(labels, power, revenue, period);
        }

        // Handle custom date range application
        function handlePowerChartCustomDate(startDate, endDate, dayCount) {
            
            // Format date range for display
            const startFormatted = new Date(startDate).toLocaleDateString('zh-CN');
            const endFormatted = new Date(endDate).toLocaleDateString('zh-CN');
            const customDateRange = `${startFormatted} 至 ${endFormatted}`;
            
            // Update chart title with custom date range
            updatePowerChartTitle();
            
            // Generate data for custom date range
            const { labels, power, revenue } = generateAnalyticsData('custom', startDate, endDate);
            
            // Update the power chart
            updatePowerChartWithData(labels, power, revenue, 'custom');
        }

        // Legacy function for backward compatibility
        function updateAnalytics(period) {
            if (powerChartTimeSelector) {
                // Map old period names to new ones
                const periodMap = {
                    'today': 'today',
                    'week': 'week', 
                    'month': 'month',
                    'custom': 'custom'
                };
                
                const mappedPeriod = periodMap[period] || period;
                powerChartTimeSelector.setCurrentPeriod(mappedPeriod);
            }
        }

        function generateAnalyticsData(period, startDate = null, endDate = null) {
            // Create cache key based on parameters
            const cacheKey = `analyticsData_${period}_${startDate || 'null'}_${endDate || 'null'}`;
            
            // Check cache first for standard periods (not custom with random data)
            if (period !== 'custom') {
                const cached = dataCache.get(cacheKey);
                if (cached) {
                    return cached;
                }
            }
            
            const labels = [];
            const power = [];
            const revenue = [];
            
            if (period === 'today') {
                for (let i = 0; i < 24; i += 2) {
                    labels.push(`${i}:00`);
                    power.push(Math.random() * 150 + 50);
                    revenue.push(Math.random() * 200 + 100);
                }
            } else if (period === 'week') {
                const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
                let days;
                if (currentLanguage === 'en') {
                    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                } else if (currentLanguage === 'ja') {
                    days = ['月', '火', '水', '木', '金', '土', '日'];
                } else if (currentLanguage === 'ko') {
                    days = ['월', '화', '수', '목', '금', '토', '일'];
                } else {
                    days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
                }
                days.forEach(day => {
                    labels.push(day);
                    power.push(Math.random() * 2000 + 1000);
                    revenue.push(Math.random() * 2500 + 1200);
                });
            } else if (period === 'month') {
                const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
                for (let i = 1; i <= 30; i++) {
                    if (currentLanguage === 'en' || currentLanguage === 'ja' || currentLanguage === 'ko') {
                        labels.push(`${i}`);
                    } else {
                        labels.push(`${i}日`);
                    }
                    power.push(Math.random() * 3000 + 1500);
                    revenue.push(Math.random() * 4000 + 2000);
                }
            } else if (period === 'custom' && startDate && endDate) {
                // Generate data for custom date range
                const start = new Date(startDate);
                const end = new Date(endDate);
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                
                for (let i = 0; i < diffDays; i++) {
                    const currentDate = new Date(start);
                    currentDate.setDate(start.getDate() + i);
                    
                    if (diffDays <= 7) {
                        // Show date format for week or less
                        labels.push(`${currentDate.getMonth() + 1}/${currentDate.getDate()}`);
                    } else if (diffDays <= 31) {
                        // Show day format for month
                        labels.push(`${currentDate.getDate()}日`);
                    } else {
                        // Show month/day for longer periods
                        labels.push(`${currentDate.getMonth() + 1}/${currentDate.getDate()}`);
                    }
                    
                    // Generate realistic historical data with some trend
                    const basePower = 1000 + Math.sin(i * 0.1) * 500;
                    const baseRevenue = 1500 + Math.sin(i * 0.15) * 700;
                    
                    power.push(Math.max(50, basePower + (Math.random() - 0.5) * 400));
                    revenue.push(Math.max(100, baseRevenue + (Math.random() - 0.5) * 600));
                }
            }
            
            const result = { labels, power, revenue };
            
            // Cache the result for standard periods
            if (period !== 'custom') {
                dataCache.set(cacheKey, result);
            }
            
            return result;
        }

        function updatePowerChartWithData(labels, power, revenue, period) {
            // Check if powerChart exists before updating
            if (!powerChart) {
                // warn('powerChart is not initialized, skipping update');
                return;
            }
            
            // Get updated translated labels
            const dischargeLabel = window.i18n ? window.i18n.getText('discharge') : '放电';
            const revenueLabel = window.i18n ? window.i18n.getText('totalRevenue') : '收益';
            
            powerChart.setOption({
                legend: {
                    data: [dischargeLabel, revenueLabel]
                },
                xAxis: { 
                    data: labels,
                    axisLabel: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        interval: labels.length > 15 ? Math.floor(labels.length / 10) : 0
                    }
                },
                series: [
                    { 
                        name: dischargeLabel,
                        data: power 
                    },
                    { 
                        name: revenueLabel,
                        data: revenue 
                    }
                ]
            });
        }


        // Legacy functions for backward compatibility
        function applyCustomDateRange() {
            if (powerChartTimeSelector) {
                powerChartTimeSelector.applyCustomDateRange();
            }
        }

        function resetToToday() {
            if (powerChartTimeSelector) {
                powerChartTimeSelector.resetToDefault();
            }
        }

        function setQuickRange(days) {
            if (powerChartTimeSelector) {
                powerChartTimeSelector.setQuickRange(days);
            }
        }

        function initializeDateInputs() {
            // This is now handled by the TimeSelector component
        }


        function updatePowerChart() {
            const date = document.getElementById('dateSelect').value;
            
            // Generate new data based on selected date
            const newData = [
                Math.random() * 150 + 50,
                Math.random() * 150 + 50,
                Math.random() * 150 + 50,
                Math.random() * 150 + 50,
                Math.random() * 150 + 50
            ];
            
            powerChart.setOption({
                series: [{ data: newData }]
            });
        }

        // Real-time data updates
        function updateRealtimeData() {
            // Get current region from the price circle indicator
            const regionIndicatorEl = document.getElementById('regionIndicator');
            const currentDisplayRegion = regionIndicatorEl ? regionIndicatorEl.textContent : 'NSW';
            
            // Update price data based on current region
            updatePriceCircleRegion(currentDisplayRegion);

            // 如果AEMO数据已加载，使用真实数据更新价格卡片
            if (aemoRealPriceData && aemoRealDemandData) {
                // 计算当前时间索引
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const roundedMinute = Math.floor(currentMinute / 5) * 5;
                const currentTimeIndex = currentHour * 12 + (roundedMinute / 5);

                // 计算30分钟后的索引（6个5分钟间隔）
                const forecastIndex = Math.min(currentTimeIndex + 6, aemoRealPriceData.length - 1);

                // 获取当前价格和需求
                const currentPrice = aemoRealPriceData[currentTimeIndex];
                const currentDemand = aemoRealDemandData[currentTimeIndex];

                // 获取预测价格和需求（30分钟后）
                const forecast30MinPrice = aemoRealPriceData[forecastIndex];
                const forecast30MinDemand = aemoRealDemandData[forecastIndex];

                // Update spot price
                const spotPriceEl = document.getElementById('spotPrice');
                if (spotPriceEl) spotPriceEl.textContent = '$' + currentPrice.toFixed(2);

                // Update power station management price (电站管理价格与现货价格保持一致)
                const stationPriceEl = document.getElementById('currentPrice');
                if (stationPriceEl) stationPriceEl.textContent = '$' + currentPrice.toFixed(2);

                // Update current demand
                const currentDemandEl = document.getElementById('currentDemand');
                if (currentDemandEl) currentDemandEl.textContent = Math.round(currentDemand).toLocaleString();

                // Update forecast price (30分钟后)
                const forecastPriceEl = document.getElementById('forecastPrice');
                if (forecastPriceEl) forecastPriceEl.textContent = '$' + forecast30MinPrice.toFixed(2);

                // Update forecast demand (30分钟后)
                const forecastDemandEl = document.getElementById('forecastDemand');
                if (forecastDemandEl) forecastDemandEl.textContent = Math.round(forecast30MinDemand).toLocaleString();
            }
            
            // Update power station management data with realistic values
            const baseHomes = 235;
            const basePower = 23547;
            const baseProfit = 12435;
            
            // Add small realistic variations
            const homesVariation = Math.floor((Math.random() - 0.5) * 10); // ±5 homes
            const powerVariation = Math.floor((Math.random() - 0.5) * 500); // ±250 kWh
            const profitVariation = Math.floor((Math.random() - 0.5) * 200); // ±100 dollars
            
            const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
            const unit = currentLanguage === 'en' ? '' : 
                        currentLanguage === 'ja' ? '個' :
                        currentLanguage === 'ko' ? '개' : '个';
            const availableHomesEl = document.getElementById('availableHomes');
            const availablePowerEl = document.getElementById('availablePower');
            const estimatedProfitEl = document.getElementById('estimatedProfit');
            
            if (availableHomesEl) availableHomesEl.textContent = (baseHomes + homesVariation);
            if (availablePowerEl) availablePowerEl.textContent = (basePower + powerVariation) + 'kWh';
            if (estimatedProfitEl) estimatedProfitEl.textContent = '$' + (baseProfit + profitVariation);
            
            // Add pulse effect to updated values (excluding today's high/low to avoid constant color change)
            const elements = ['currentPrice', 'spotPrice', 'currentDemand'];
            elements.forEach(id => {
                const elem = document.getElementById(id);
                elem.style.transition = 'color 0.3s';
                elem.style.color = '#00ff88';
                setTimeout(() => {
                    elem.style.color = '';
                }, 300);
            });
            
            // Update highest price region
            // updateHighestPriceRegion(); // Removed - using fixed text now
        }

        // Update highest price region display
        function updateHighestPriceRegion() {
            // 使用实际的地区价格数据
            const regionPrices = {
                'NSW': 163,
                'QLD': 34,
                'VIC': 21,
                'SA': 403,
                'TAS': 390
            };
            
            // Find region with highest price
            let highestRegion = 'NSW';
            let highestPrice = regionPrices['NSW'];
            
            for (const [region, price] of Object.entries(regionPrices)) {
                if (price > highestPrice) {
                    highestPrice = price;
                    highestRegion = region;
                }
            }
            
            // Update both displays
            const highestPriceElement = document.getElementById('highestPriceRegion');
            if (highestPriceElement) {
                highestPriceElement.textContent = highestRegion;
            }
            
            // Update the new display in region selection layer
            const highestRegionDisplay = document.getElementById('highestPriceRegionDisplay');
            if (highestRegionDisplay) {
                highestRegionDisplay.textContent = highestRegion;
            }
            
            const highestPriceValueDisplay = document.getElementById('highestPriceValue');
            if (highestPriceValueDisplay) {
                highestPriceValueDisplay.textContent = highestPrice;
            }
        }

        // Initialize Market Chart - Simplified and Reliable Version
        function initMarketChart() {
            const container = document.getElementById('marketChart');
            if (!container) {
                // error('Market chart container not found!');
                return;
            }
            
            // Dispose existing instance if any
            if (marketChart) {
                marketChart.dispose();
            }
            
            // Wait for container to be visible
            setTimeout(() => {
                // Initialize chart
                marketChart = echarts.init(container, 'dark');
                
                // Force container to have proper dimensions
                container.style.width = '100%';
                container.style.height = '400px';
                
                // Force a reflow to apply the new dimensions
                container.offsetHeight;
            
            // Real AEMO data from AEMO.xlsx - 从AEMO.xlsx文件中读取的真实数据（每5分钟一个数据点）
            aemoTimeLabels = ["00:00", "00:05", "00:10", "00:15", "00:20", "00:25", "00:30", "00:35", "00:40", "00:45", "00:50", "00:55", "01:00", "01:05", "01:10", "01:15", "01:20", "01:25", "01:30", "01:35", "01:40", "01:45", "01:50", "01:55", "02:00", "02:05", "02:10", "02:15", "02:20", "02:25", "02:30", "02:35", "02:40", "02:45", "02:50", "02:55", "03:00", "03:05", "03:10", "03:15", "03:20", "03:25", "03:30", "03:35", "03:40", "03:45", "03:50", "03:55", "04:00", "04:05", "04:10", "04:15", "04:20", "04:25", "04:30", "04:35", "04:40", "04:45", "04:50", "04:55", "05:00", "05:05", "05:10", "05:15", "05:20", "05:25", "05:30", "05:35", "05:40", "05:45", "05:50", "05:55", "06:00", "06:05", "06:10", "06:15", "06:20", "06:25", "06:30", "06:35", "06:40", "06:45", "06:50", "06:55", "07:00", "07:05", "07:10", "07:15", "07:20", "07:25", "07:30", "07:35", "07:40", "07:45", "07:50", "07:55", "08:00", "08:05", "08:10", "08:15", "08:20", "08:25", "08:30", "08:35", "08:40", "08:45", "08:50", "08:55", "09:00", "09:05", "09:10", "09:15", "09:20", "09:25", "09:30", "09:35", "09:40", "09:45", "09:50", "09:55", "10:00", "10:05", "10:10", "10:15", "10:20", "10:25", "10:30", "10:35", "10:40", "10:45", "10:50", "10:55", "11:00", "11:05", "11:10", "11:15", "11:20", "11:25", "11:30", "11:35", "11:40", "11:45", "11:50", "11:55", "12:00", "12:05", "12:10", "12:15", "12:20", "12:25", "12:30", "12:35", "12:40", "12:45", "12:50", "12:55", "13:00", "13:05", "13:10", "13:15", "13:20", "13:25", "13:30", "13:35", "13:40", "13:45", "13:50", "13:55", "14:00", "14:05", "14:10", "14:15", "14:20", "14:25", "14:30", "14:35", "14:40", "14:45", "14:50", "14:55", "15:00", "15:05", "15:10", "15:15", "15:20", "15:25", "15:30", "15:35", "15:40", "15:45", "15:50", "15:55", "16:00", "16:05", "16:10", "16:15", "16:20", "16:25", "16:30", "16:35", "16:40", "16:45", "16:50", "16:55", "17:00", "17:05", "17:10", "17:15", "17:20", "17:25", "17:30", "17:35", "17:40", "17:45", "17:50", "17:55", "18:00", "18:05", "18:10", "18:15", "18:20", "18:25", "18:30", "18:35", "18:40", "18:45", "18:50", "18:55", "19:00", "19:05", "19:10", "19:15", "19:20", "19:25", "19:30", "19:35", "19:40", "19:45", "19:50", "19:55", "20:00", "20:05", "20:10", "20:15", "20:20", "20:25", "20:30", "20:35", "20:40", "20:45", "20:50", "20:55", "21:00", "21:05", "21:10", "21:15", "21:20", "21:25", "21:30", "21:35", "21:40", "21:45", "21:50", "21:55", "22:00", "22:05", "22:10", "22:15", "22:20", "22:25", "22:30", "22:35", "22:40", "22:45", "22:50", "22:55", "23:00", "23:05", "23:10", "23:15", "23:20", "23:25", "23:30", "23:35", "23:40", "23:45", "23:50", "23:55"];
            aemoRealPriceData = [66.14, 66.04, 77.56, 80.01, 80.01, 80.01, 78.38, 66.28, 77.27, 63.98, 65.05, 64.0, 57.06, 62.87, 62.92, 65.64, 65.22, 65.23, 62.96, 65.0, 80.01, 76.94, 77.1, 65.0, 65.28, 65.3, 77.13, 65.54, 65.05, 64.66, 64.72, 64.28, 64.72, 64.69, 64.26, 64.72, 64.34, 64.33, 66.65, 65.0, 65.0, 65.08, 65.98, 65.0, 76.86, 65.15, 66.18, 76.19, 76.26, 79.95, 80.01, 80.01, 86.94, 105.79, 105.79, 130.23, 125.62, 127.49, 158.99, 158.99, 158.99, 126.29, 138.19, 158.99, 154.19, 158.99, 158.19, 120.01, 83.87, 84.79, 69.71, 68.86, -0.08, 0.01, -0.01, -8.23, -6.66, -8.19, -0.01, -6.66, 0, 0.01, -9.46, -5.84, -5.85, -5.99, 0.0, -2.65, -6.29, -6.29, -6.5, -6.46, -6.37, -8.79, -11.13, -11.25, -13.04, -11.32, -10.51, -11.63, -14.12, -12.25, -12.19, -11.72, -12.71, -11.9, -14.99, -11.98, -15.29, -15.6, -12.7, -14.99, -15.33, -18.48, -18.17, -15.46, -16.0, -17.93, -18.7, -17.51, -18.73, -18.44, -13.68, -16.0, -18.28, -19.01, -19.56, -20.0, -20.13, -18.79, -20.52, -22.73, -24.67, -20.75, -21.92, -25.09, -21.61, -21.3, -25.33, -25.94, -19.83, -21.12, -21.58, -21.14, -21.13, -25.14, -24.31, -20.0, -22.81, -24.72, -21.52, -23.94, -25.24, -22.9, -23.91, -32.19, -27.5, -27.5, -27.5, -34.11, -34.11, -24.72, -27.5, -34.11, -34.11, -34.11, -31.01, -27.5, -27.5, -27.5, -27.5, -27.5, -27.5, -27.5, -24.02, -20.27, -27.5, -27.5, -20.81, -20.1, -20.13, -20.51, -20.35, -27.5, -19.89, -18.84, -21.06, -27.5, -18.89, -12.99, -12.64, -12.26, -10.87, -12.76, -12.55, -12.42, -11.84, -3.0, -3.0, -8.96, -6.82, -6.81, 54.94, -6.19, -0.81, -0.72, -0.81, 0.45, 9.13, 16.65, 4.77, 51.86, 69.09, 83.54, 92.45, 132.77, 139.42, 136.16, 100.24, 139.83, 117.94, 114.8, 116.34, 101.53, 126.26, 120.29, 112.12, 117.51, 122.08, 132.59, 127.47, 132.84, 137.61, 129.37, 130.71, 139.68, 127.07, 161.15, 145.97, 158.68, 159.77, 149.87, 177.5, 134.17, 156.17, 160.24, 140.38, 177.7, 181.52, 131.7, 173.91, 171.39, 147.36, 146.24, 174.0, 243.2, 126.93, 158.5, 108.89, 128.97, 125.45, 106.33, 89.38, 88.05, 80.9, 87.3, 125.69, 123.79, 108.89, 108.89, 108.89, 108.89, 106.73, 106.96, 97.74, 100.01, 107.69, 105.74, 158.99, 158.99, 158.99, 158.99, 158.99, 158.99, 158.99, 158.99, 158.99, 158.99];
            aemoRealDemandData = [6944.17, 6898.47, 6893.63, 6829.3, 6850.61, 6774.74, 6759.83, 6648.21, 6669.78, 6569.73, 6617.86, 6573.83, 6479.18, 6468.57, 6466.79, 6530.03, 6436.35, 6466.99, 6438.46, 6480.32, 6391.91, 6429.17, 6460.58, 6421.28, 6443.13, 6272.65, 6341.68, 6276.72, 6274.57, 6278.81, 6241.81, 6228.63, 6242.68, 6247.2, 6195.57, 6217.48, 6210.87, 6195.27, 6197.42, 6210.22, 6210.93, 6244.7, 6276.44, 6274.01, 6295.57, 6296.73, 6314.99, 6353.57, 6340.07, 6325.78, 6427.73, 6462.66, 6537.16, 6588.73, 6552.47, 6576.69, 6635.77, 6665.0, 6732.0, 6746.01, 6799.1, 6853.33, 6969.46, 7014.85, 7087.52, 7164.67, 7161.88, 7079.85, 7092.18, 7153.41, 7111.21, 7078.06, 7047.26, 7053.51, 6980.02, 6954.91, 6998.64, 6901.06, 6878.11, 6845.43, 6794.63, 6706.81, 6580.9, 6542.29, 6439.06, 6447.79, 6580.94, 6451.57, 6312.2, 6196.7, 6189.7, 6024.56, 5891.87, 5764.17, 5675.92, 5574.41, 5437.06, 5298.3, 5304.67, 5198.75, 5073.44, 4929.02, 4854.91, 4917.83, 4876.59, 4901.98, 4874.92, 4913.56, 4909.23, 4773.02, 4775.89, 4708.02, 4725.72, 4640.68, 4478.4, 4455.44, 4513.4, 4428.34, 4369.43, 4425.16, 4391.35, 4356.77, 4375.8, 4376.23, 4304.1, 4223.98, 4182.73, 4219.16, 4357.73, 4205.29, 4243.99, 4155.65, 4174.0, 4124.9, 4218.79, 4233.37, 4218.3, 4197.21, 4146.02, 4184.5, 4150.86, 4200.1, 4148.84, 4060.27, 4064.63, 4027.7, 4062.16, 4055.0, 4064.33, 4148.36, 4143.95, 4073.54, 4071.72, 4091.67, 4104.26, 3957.83, 4044.9, 3962.61, 4046.45, 4021.29, 4077.47, 4091.37, 4106.81, 4116.55, 4093.43, 4154.6, 4189.06, 4172.79, 4327.09, 4454.43, 4481.58, 4385.69, 4507.94, 4538.22, 4771.57, 4758.78, 4753.8, 4776.51, 4938.62, 4991.94, 5110.06, 5027.95, 5078.17, 5199.79, 5292.9, 5354.01, 5436.35, 5546.75, 5787.91, 5874.7, 5981.58, 6246.98, 6364.78, 6339.58, 6457.68, 6499.84, 6667.6, 6825.92, 7021.9, 7147.29, 7254.92, 7341.2, 7526.05, 7364.37, 7477.81, 7575.31, 7730.51, 7845.58, 7941.2, 7962.68, 7892.07, 8014.79, 8033.63, 7996.21, 8033.32, 8170.29, 8129.35, 8103.97, 7977.04, 8143.95, 8140.22, 8201.66, 8159.9, 8136.33, 8146.82, 8060.84, 8090.79, 8165.4, 8184.86, 8196.96, 8200.54, 8190.62, 8174.33, 8199.12, 8068.88, 8161.38, 8066.38, 8125.4, 7979.9, 8062.75, 8012.55, 7958.27, 7975.92, 7805.3, 7864.63, 7886.33, 7878.94, 7793.18, 7755.09, 7710.03, 7768.5, 7665.61, 7565.89, 7512.26, 7617.91, 7671.08, 7538.85, 7541.03, 7483.12, 7586.36, 7578.41, 7594.6, 7600.68, 7555.02, 7407.75, 7356.12, 7444.59, 7427.32, 7431.03, 7366.29, 7356.18, 7322.61, 7310.67, 7278.75, 7208.81, 7247.65, 7286.98, 7159.5, 7244.63, 7149.35, 7162.89, 7165.12, 7161.65, 7048.02, 7082.02, 7023.69, 7116.38, 7145.64];

            // 获取当前时间并计算对应的数据索引
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            // 将分钟数向下取整到最近的5分钟
            const roundedMinute = Math.floor(currentMinute / 5) * 5;
            // 计算当前时间对应的数组索引（每小时12个点，每5分钟一个）
            const currentTimeIndex = currentHour * 12 + (roundedMinute / 5);

            const prices = [];
            const demands = [];
            const forecastPrices = [];
            const forecastDemands = [];

            // 遍历所有288个数据点
            for (let i = 0; i < aemoTimeLabels.length; i++) {
                if (i < currentTimeIndex) {
                    // 当前时间之前 - 历史数据，显示为实线
                    prices.push(aemoRealPriceData[i]);
                    demands.push(aemoRealDemandData[i]);
                    forecastPrices.push(null);
                    forecastDemands.push(null);
                } else if (i === currentTimeIndex) {
                    // 当前时间点 - 同时作为实线和虚线的连接点
                    prices.push(aemoRealPriceData[i]);
                    demands.push(aemoRealDemandData[i]);
                    forecastPrices.push(aemoRealPriceData[i]);
                    forecastDemands.push(aemoRealDemandData[i]);
                } else {
                    // 当前时间之后 - 预测数据，显示为虚线
                    prices.push(null);
                    demands.push(null);
                    forecastPrices.push(aemoRealPriceData[i]);
                    forecastDemands.push(aemoRealDemandData[i]);
                }
            }

                // Get translations
                const getText = (key) => window.i18n ? window.i18n.getText(key) : translations.en[key];
                const translations = {
                    en: {
                        historicalPrice: 'Historical Price',
                        predictedPrice: 'Predicted Price',
                        demand: 'Demand',
                        predictedDemand: 'Predicted Demand',
                        price: 'Price ($/MWh)',
                        demandUnit: 'Demand (MW)'
                    },
                    zh: {
                        historicalPrice: '历史价格',
                        predictedPrice: '预测价格',
                        demand: '需求',
                        predictedDemand: '预测需求',
                        price: '价格 ($/MWh)',
                        demandUnit: '需求 (MW)'
                    }
                };
                
                const option = {
                    backgroundColor: 'transparent',
                    tooltip: {
                        trigger: 'axis',
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        borderColor: '#00ff88',
                        borderWidth: 1,
                        textStyle: { color: '#fff' },
                        formatter: function(params) {
                            let result = `<div style="font-weight: bold; margin-bottom: 5px;">${params[0].axisValue}</div>`;
                            params.forEach(param => {
                                if (param.value !== null && param.value !== undefined) {
                                    const color = param.color;
                                    const value = param.seriesName.includes(getText('price')) || param.seriesName.includes('Price') 
                                        ? `$${param.value.toFixed ? param.value.toFixed(2) : param.value}` 
                                        : `${param.value.toFixed ? param.value.toFixed(0) : param.value} MW`;
                                    result += `<div>${param.marker} ${param.seriesName}: <strong>${value}</strong></div>`;
                                }
                            });
                            return result;
                        }
                    },
                    legend: {
                        data: [getText('historicalPrice'), getText('demand'), getText('predictedPrice'), getText('predictedDemand')],
                        textStyle: { color: 'rgba(255, 255, 255, 0.7)' },
                        top: 10
                    },
                    grid: {
                        left: '60',
                        right: '60',
                        bottom: '40',
                        top: '50',
                        containLabel: true
                    },
                    xAxis: {
                        type: 'category',
                        data: aemoTimeLabels,
                        axisLine: {
                            show: false  // 隐藏X轴线
                        },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            interval: 23, // 每2小时显示一次（每24个点=2小时，显示：00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00）
                            fontSize: 12,
                            rotate: 0
                        },
                        splitLine: { show: false }
                    },
                    yAxis: [
                        {
                            type: 'value',
                            name: getText('price'),
                            nameTextStyle: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: 12
                            },
                            position: 'left',
                            scale: true,  // 自动缩放
                            min: 'dataMin',  // 从数据最小值开始
                            max: 'dataMax',  // 到数据最大值结束
                            axisLine: {
                                show: false  // 隐藏Y轴线
                            },
                            axisLabel: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                formatter: '${value}'
                            },
                            splitLine: {
                                show: true,
                                lineStyle: {
                                    color: 'rgba(255, 255, 255, 0.05)',  // 降低网格线透明度
                                    type: 'dashed',
                                    width: 1
                                }
                            }
                        },
                        {
                            type: 'value',
                            name: getText('demandUnit'),
                            nameTextStyle: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: 12
                            },
                            position: 'right',
                            scale: true,  // 自动缩放
                            min: 'dataMin',  // 从数据最小值开始
                            max: 'dataMax',  // 到数据最大值结束
                            axisLine: {
                                show: false  // 隐藏Y轴线
                            },
                            axisLabel: {
                                color: 'rgba(255, 255, 255, 0.7)',
                                formatter: '{value} MW'
                            },
                        splitLine: { show: false }
                    }
                ],
                    series: [
                        {
                            name: getText('historicalPrice'),
                            type: 'line',
                            data: prices,
                            smooth: true,
                            symbol: 'circle',
                            symbolSize: 4,
                            lineStyle: {
                                color: '#00ff88',
                                width: 3
                            },
                            itemStyle: {
                                color: '#00ff88'
                            },
                            areaStyle: {
                                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(0, 255, 136, 0.3)' },
                                    { offset: 1, color: 'rgba(0, 255, 136, 0.05)' }
                                ])
                            },
                            markLine: {
                                symbol: 'none',
                                silent: true,
                                data: [
                                    {
                                        xAxis: currentTimeIndex,
                                        lineStyle: {
                                            color: 'rgba(255, 255, 255, 0.4)',
                                            type: 'dashed',
                                            width: 2
                                        },
                                        label: {
                                            show: false
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            name: getText('demand'),
                            type: 'line',
                            yAxisIndex: 1,
                            data: demands,
                            smooth: true,
                            symbol: 'circle',
                            symbolSize: 4,
                            lineStyle: { 
                                color: '#ffd700', 
                                width: 2
                            },
                            itemStyle: {
                                color: '#ffd700'
                            }
                        },
                        {
                            name: getText('predictedPrice'),
                            type: 'line',
                            data: forecastPrices,
                            smooth: true,
                            symbol: 'circle',
                            symbolSize: 4,
                            lineStyle: { 
                                color: '#00ff88', 
                                width: 2,
                                type: 'dashed'
                            },
                            itemStyle: {
                                color: '#00ff88'
                            },
                            areaStyle: {
                                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(0, 255, 136, 0.15)' },
                                    { offset: 1, color: 'rgba(0, 255, 136, 0.02)' }
                                ])
                            }
                        },
                        {
                            name: getText('predictedDemand'),
                            type: 'line',
                            yAxisIndex: 1,
                            data: forecastDemands,
                            smooth: true,
                            symbol: 'circle',
                            symbolSize: 4,
                            lineStyle: {
                                color: '#ffd700',
                                width: 2,
                                type: 'dashed'
                            },
                            itemStyle: {
                                color: '#ffd700'
                            }
                        }
                    ]
                };

                // Apply configuration
                marketChart.setOption(option);
                
                // Force resize after setting option
                setTimeout(() => {
                    if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                }, 100);
                
                // Handle resize
                window.addEventListener('resize', () => {
                    if (marketChart && typeof marketChart.resize === 'function') {
                        if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                    }
                });
                
                // Force initial resize
                setTimeout(() => {
                    if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                }, 100);


                // 数据初始化完成后立即更新价格卡片，避免显示默认值
                if (typeof updateRealtimeData === 'function') {
                    updateRealtimeData();
                }

                // AEMO数据就绪后启动AI分析（独立于 switchOperationMode，确保面板有数据）
                if (typeof startAICustodyAnalysis === 'function') {
                    startAICustodyAnalysis();
                }
            }, 50); // Small delay to ensure container is ready
        }

        // Initialize Australian States Map 
        function initMap() {
            const container = document.getElementById('australiaMap');
            if (!container) {
                return; // australiaMap not in current layout
                return;
            }
            
            try {
                mapChart = echarts.init(container);
            } catch (error) {
                // error('Failed to initialize mapChart:', error);
                return;
            }
            
            // Define Australian states with proper coordinates
            const australianStates = [
                // Main states
                { name: 'NSW', center: [147, -32], color: '#00ff88', radius: 25, deviceCount: 120 },
                { name: 'VIC', center: [144, -37], color: '#00aaff', radius: 20, deviceCount: 100 },
                { name: 'QLD', center: [145, -22], color: '#8A4AFF', radius: 28, deviceCount: 90 },
                { name: 'WA', center: [122, -26], color: '#ffaa00', radius: 30, deviceCount: 70 },
                { name: 'SA', center: [135, -30], color: '#9c27b0', radius: 22, deviceCount: 60 },
                { name: 'TAS', center: [147, -42], color: '#4caf50', radius: 12, deviceCount: 30 },
                { name: 'NT', center: [133, -19], color: '#2196f3', radius: 20, deviceCount: 20 },
                { name: 'ACT', center: [149, -35.3], color: '#ff9800', radius: 8, deviceCount: 10 }
            ];

            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'item',
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    borderColor: 'rgba(0, 255, 136, 0.5)',
                    borderWidth: 1,
                    textStyle: { color: '#fff', fontSize: 12 },
                    formatter: function(params) {
                        if (params.seriesType === 'scatter') {
                            if (params.seriesIndex === 1) {
                                // Device points
                                const getStatusText = (status) => {
                                    if (!window.i18n) {
                                        const statusMap = {
                                            'inactive': '待机',
                                            'active': '激活',
                                            'charging': '充电中',
                                            'discharging': '放电中',
                                            'offline': '离线'
                                        };
                                        return statusMap[status] || status;
                                    }
                                    
                                    const statusKeys = {
                                        'inactive': 'inactive',
                                        'active': 'active',
                                        'charging': 'charging',
                                        'discharging': 'discharging',
                                        'offline': 'offline'
                                    };
                                    
                                    return window.i18n.getText(statusKeys[status]) || status;
                                };
                                const deviceText = window.i18n ? window.i18n.getText('device') : '设备';
                                const statusText = window.i18n ? window.i18n.getText('status') : '状态';
                                const regionText = window.i18n ? window.i18n.getText('region') : '区域';
                                
                                return `<div style="padding: 12px; background: rgba(0,0,0,0.8); border-radius: 10px; color: white; border: 1px solid rgba(255,255,255,0.2);">
                                    <div style="color: #00ff88; font-weight: 600; font-size: 14px; margin-bottom: 8px;">${deviceText} ${params.data.id}</div>
                                    <div style="margin: 4px 0; font-size: 13px; display: flex; justify-content: space-between;">
                                        <span style="color: rgba(255,255,255,0.8);">${statusText}:</span> 
                                        <span style="color: #fff; font-weight: 500;">${getStatusText(params.data.status)}</span>
                                    </div>
                                    <div style="font-size: 13px; display: flex; justify-content: space-between;">
                                        <span style="color: rgba(255,255,255,0.8);">${regionText}:</span> 
                                        <span style="color: #fff; font-weight: 500;">${params.data.region}</span>
                                    </div>
                                </div>`;
                            } else if (params.seriesIndex === 0) {
                                // State centers
                                const stateText = window.i18n ? window.i18n.getText('state') : '州';
                                const deviceCountText = window.i18n ? window.i18n.getText('deviceCount') : '设备数量';
                                const statusText = window.i18n ? window.i18n.getText('status') : '状态';
                                const normalText = window.i18n ? window.i18n.getText('normalOperation') : '正常运行';
                                
                                return `<div style="padding: 12px; background: rgba(0,0,0,0.8); border-radius: 10px; color: white; border: 1px solid rgba(255,255,255,0.2);">
                                    <div style="color: ${params.data.color}; font-weight: 600; font-size: 14px; margin-bottom: 8px;">${params.data.name} ${stateText}</div>
                                    <div style="margin: 4px 0; font-size: 13px; display: flex; justify-content: space-between;">
                                        <span style="color: rgba(255,255,255,0.8);">${deviceCountText}:</span> 
                                        <span style="color: #fff; font-weight: 500;">${params.data.deviceCount}</span>
                                    </div>
                                    <div style="font-size: 13px; display: flex; justify-content: space-between;">
                                        <span style="color: rgba(255,255,255,0.8);">${statusText}:</span> 
                                        <span style="color: #00ff88; font-weight: 500;">${normalText}</span>
                                    </div>
                                </div>`;
                            }
                        }
                        return '';
                    }
                },
                graphic: [],
                xAxis: {
                    type: 'value',
                    min: 110,
                    max: 160,
                    show: false
                },
                yAxis: {
                    type: 'value',
                    min: -45,
                    max: -10,
                    show: false
                },
                grid: {
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                },
                series: [
                    // Region centers with glowing effect
                    {
                        name: 'States',
                        type: 'scatter',
                        data: australianStates.map(state => ({
                            value: state.center,
                            name: state.name,
                            color: state.color,
                            deviceCount: state.deviceCount,
                            symbolSize: state.radius * 2
                        })),
                        symbol: 'circle',
                        symbolSize: function(value, params) {
                            return params.data.symbolSize;
                        },
                        label: {
                            show: true,
                            formatter: function(params) {
                                return params.data.name;
                            },
                            position: 'inside',
                            color: '#000',
                            fontSize: 14,
                            fontWeight: 'bold'
                        },
                        itemStyle: {
                            color: function(params) {
                                return {
                                    type: 'radial',
                                    x: 0.5,
                                    y: 0.5,
                                    r: 0.5,
                                    colorStops: [
                                        { offset: 0, color: params.data.color },
                                        { offset: 0.7, color: params.data.color },
                                        { offset: 1, color: 'rgba(255, 255, 255, 0.3)' }
                                    ]
                                };
                            },
                            opacity: 0.8,
                            borderColor: function(params) {
                                return params.data.color;
                            },
                            borderWidth: 3,
                            shadowBlur: 20,
                            shadowColor: function(params) {
                                return params.data.color;
                            }
                        },
                        emphasis: {
                            scale: 1.1,
                            label: {
                                fontSize: 16
                            },
                            itemStyle: {
                                opacity: 1,
                                shadowBlur: 30
                            }
                        },
                        z: 1
                    },
                    // Device network points
                    {
                        name: 'Devices',
                        type: 'scatter',
                        data: deviceLocations
                            .filter(device => device.status !== 'hidden')  // 过滤掉hidden状态的设备
                            .map(device => ({
                                value: device.value,
                                id: device.id,
                                status: device.status,
                                region: device.region
                            })),
                        symbolSize: function(value, params) {
                            const status = params.data.status;
                            if (status === 'active' || status === 'charging' || status === 'discharging') {
                                return 8;
                            }
                            return status === 'offline' ? 3 : 5;
                        },
                        itemStyle: {
                            color: function(params) {
                                const status = params.data.status;
                                switch (status) {
                                    case 'charging': 
                                    case 'active':
                                        return currentOperation === 'charge' ? '#00ff88' : '#FFD700';
                                    case 'discharging': 
                                        return '#FFD700';
                                    case 'offline': 
                                        return 'rgba(255, 255, 255, 0.2)';
                                    default: 
                                        return 'rgba(255, 255, 255, 0.5)';
                                }
                            },
                            borderColor: 'rgba(255, 255, 255, 0.3)',
                            borderWidth: 1,
                            shadowBlur: function(params) {
                                const status = params.data.status;
                                return (status === 'active' || status === 'charging' || status === 'discharging') ? 10 : 3;
                            },
                            shadowColor: function(params) {
                                const status = params.data.status;
                                switch (status) {
                                    case 'charging':
                                    case 'active':
                                        return currentOperation === 'charge' ? 'rgba(0, 255, 136, 0.8)' : 'rgba(255, 215, 0, 0.8)';
                                    case 'discharging':
                                        return 'rgba(255, 215, 0, 0.8)';
                                    default:
                                        return 'rgba(255, 255, 255, 0.3)';
                                }
                            }
                        },
                        emphasis: {
                            scale: 1.5,
                            itemStyle: {
                                shadowBlur: 20,
                                shadowColor: 'rgba(0, 255, 136, 0.9)'
                            }
                        },
                        animation: true,
                        animationDuration: 800,
                        animationEasing: 'cubicOut',
                        z: 2
                    }
                ]
            };

            try {
                mapChart.setOption(option);
            } catch (error) {
                // error('Failed to set mapChart option:', error);
                return;
            }
            
            // Update status statistics
            const nswDevicesBeforeStats = deviceLocations.filter(d => d.region === 'NSW');

            updateMapStatistics();

            window.addEventListener('resize', throttle(() => {
                if (mapChart && typeof mapChart.resize === 'function') {
                    mapChart.resize();
                }
            }, 250));
        }
        

        // Generate Australian state device locations (exactly 500 devices)
        function generateDeviceLocations() {
            const locations = [];
            
            const australianStates = [
                { 
                    center: [147, -32], 
                    weight: 120, 
                    name: 'NSW', 
                    spread: 4,
                    cities: ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Coffs Harbour']
                },
                { 
                    center: [144, -37], 
                    weight: 100, 
                    name: 'VIC', 
                    spread: 3,
                    cities: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton']
                },
                { 
                    center: [145, -22], 
                    weight: 90, 
                    name: 'QLD', 
                    spread: 6,
                    cities: ['Brisbane', 'Gold Coast', 'Townsville', 'Cairns', 'Sunshine Coast']
                },
                { 
                    center: [122, -26], 
                    weight: 70, 
                    name: 'WA', 
                    spread: 8,
                    cities: ['Perth', 'Fremantle', 'Bunbury', 'Albany', 'Kalgoorlie']
                },
                { 
                    center: [135, -30], 
                    weight: 60, 
                    name: 'SA', 
                    spread: 4,
                    cities: ['Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge', 'Port Lincoln']
                },
                { 
                    center: [147, -42], 
                    weight: 30, 
                    name: 'TAS', 
                    spread: 2,
                    cities: ['Hobart', 'Launceston', 'Devonport', 'Burnie', 'Ulverstone']
                },
                { 
                    center: [133, -19], 
                    weight: 20, 
                    name: 'NT', 
                    spread: 5,
                    cities: ['Darwin', 'Alice Springs', 'Katherine', 'Palmerston', 'Tennant Creek']
                },
                { 
                    center: [149, -35.3], 
                    weight: 10, 
                    name: 'ACT', 
                    spread: 0.5,
                    cities: ['Canberra', 'Queanbeyan', 'Belconnen', 'Tuggeranong', 'Gungahlin']
                }
            ];
            
            // Calculate total weight for distribution
            const totalWeight = australianStates.reduce((sum, state) => sum + state.weight, 0);
            
            // Generate exactly 500 devices
            for (let i = 0; i < 500; i++) {
                // Select state based on weight distribution
                let randomWeight = Math.random() * totalWeight;
                let selectedState = australianStates[0];
                
                for (const state of australianStates) {
                    randomWeight -= state.weight;
                    if (randomWeight <= 0) {
                        selectedState = state;
                        break;
                    }
                }
                
                // Generate random point within state spread
                const angle = Math.random() * 2 * Math.PI;
                const distance = Math.random() * selectedState.spread;
                
                const longitude = selectedState.center[0] + distance * Math.cos(angle);
                const latitude = selectedState.center[1] + distance * Math.sin(angle);
                
                // Assign initial status based on region's actual state
                let initialStatus = 'hidden'; // Default: not visible on map
                const rand = Math.random();

                // 获取设备所在地区的状态
                const regionStatus = regionData[selectedState.name] ? regionData[selectedState.name].status : 'none';

                // 根据地区状态决定设备状态
                if (regionStatus === 'waitingExecution' || regionStatus === 'none') {
                    // 等待执行中或无状态：设备不显示（所有状态为0）
                    initialStatus = 'hidden';
                } else {
                    // 有操作状态的地区（充电/放电）：正常分配状态
                    if (rand < 0.05) {
                        initialStatus = 'offline';  // 5% offline
                    } else if (rand < 0.12 && (regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge')) {
                        initialStatus = 'discharging';  // 7% discharging (仅在放电地区)
                    } else if (rand < 0.18 && (regionStatus === 'autoCharge' || regionStatus === 'manualCharge')) {
                        initialStatus = 'charging';  // 6% charging (仅在充电地区)
                    } else {
                        initialStatus = 'inactive';  // 其余为inactive
                    }
                }

                // Select random city from state
                const randomCity = selectedState.cities[Math.floor(Math.random() * selectedState.cities.length)];

                locations.push({
                    value: [longitude, latitude],
                    id: i,
                    status: initialStatus,
                    region: selectedState.name,
                    city: randomCity
                });
            }
            
            return locations;
        }

        // Interactive functions with proper state management and confirmation
        function handleCharge() {
            
            // 确保 currentOperation 是 null 而不是 undefined 或其他值
            if (currentOperation === null || currentOperation === undefined) {
                // 没有当前操作，可以开始充电
                showOperationConfirmation('charge');
            } else if (currentOperation === 'charge') {
                // 当前正在充电，显示停止确认
                showStopConfirmation();
            } else if (currentOperation === 'discharge') {
                // 正在放电时不能充电
                return;
            } else {
                // 未知状态，重置并显示充电确认
                currentOperation = null;
                showOperationConfirmation('charge');
            }
        }
        
        // 将函数暴露到全局作用域
        window.handleCharge = handleCharge;

        function handleDischarge() {
            
            // 确保 currentOperation 是 null 而不是 undefined 或其他值
            if (currentOperation === null || currentOperation === undefined) {
                // 没有当前操作，可以开始放电
                showOperationConfirmation('discharge');
            } else if (currentOperation === 'discharge') {
                // 当前正在放电，显示停止确认
                showStopConfirmation();
            } else if (currentOperation === 'charge') {
                // 正在充电时不能放电
                return;
            } else {
                // 未知状态，重置并显示放电确认
                currentOperation = null;
                showOperationConfirmation('discharge');
            }
        }
        
        // 将函数暴露到全局作用域
        window.handleDischarge = handleDischarge;
        

        // 新的操作启动函数
        function startOperation(operationType) {

            // 重置弹窗关闭标志
            window.deviceResponseModalClosed = false;
            
            // 设置当前操作
            currentOperation = operationType;

            // 累积今日充放电数据（基于当前 SOC → 目标 SOC 计算）
            accumulateTodayData(operationType);

            // 确保有选中的地区，如果没有则默认选择NSW
            if (!selectedMainRegion) {
                selectedMainRegion = 'NSW';
                // 更新UI显示
                const nswTab = document.querySelector('.region-select-tab[data-region="NSW"]');
                if (nswTab) {
                    selectMainRegion('NSW', nswTab);
                }
            }
            
            // 更新当前地区的操作状态
            updateRegionOperationStatus(selectedMainRegion, operationType === 'charge' ? 'charging' : 'discharging');
            
            // 更新regionData中的状态以确保显示正确
            if (regionData[selectedMainRegion]) {
                const isAuto = currentOperationMode === 'auto';
                if (operationType === 'charge') {
                    regionData[selectedMainRegion].status = isAuto ? 'autoCharge' : 'manualCharge';
                } else if (operationType === 'discharge') {
                    regionData[selectedMainRegion].status = isAuto ? 'autoDischarge' : 'manualDischarge';
                }
                
                // 不在这里更新电站管理显示，因为下面的代码会设置正确的"充电中"/"放电中"状态
                // updatePowerStationStatus(selectedMainRegion, regionData[selectedMainRegion].status);
            }
            
            // 更新地区状态指示器
            updateRegionStatusIndicators();
            
            // 更新地区状态显示
            updateRegionStatusDisplay();
            
            // 立即更新价格圆圈颜色
            updatePriceCircleColor();
            
            // 不再更新电站管理标题的状态文字 - 按用户要求移除
            // const statusText = document.getElementById('regionStatusText');
            // if (statusText) {
            //     if (operationType === 'charge') {
            //         statusText.textContent = window.i18n ? window.i18n.getText('charging') : '充电中';
            //         statusText.style.color = '#00ff88';
            //         statusText.style.background = 'rgba(0, 255, 136, 0.1)';
            //         statusText.style.border = '1px solid rgba(0, 255, 136, 0.3)';
            //         statusText.style.display = 'inline-block';
            //     } else if (operationType === 'discharge') {
            //         statusText.textContent = window.i18n ? window.i18n.getText('discharging') : '放电中';
            //         statusText.style.color = '#FFC107';
            //         statusText.style.background = 'rgba(255, 193, 7, 0.1)';
            //         statusText.style.border = '1px solid rgba(255, 193, 7, 0.3)';
            //         statusText.style.display = 'inline-block';
            //     }
            // }
            
            // 更新按钮状态
            updateButtonsForOperation(operationType);

            // 切换到地图视图
            switchPanel('map');

            // 立即启动设备动画(不需要延迟,让startDeviceAnimation统一处理初始化)
            startDeviceAnimation();
            
            // 添加备用定时器，确保统计弹窗显示（如果动画未正常完成）
            // 设置为10秒后显示，正常情况下动画会在约13秒内完成
            if (operationType === 'discharge' || operationType === 'charge') {
                const fallbackTimer = setTimeout(() => {
                    // 检查是否已经显示了统计弹窗，并且操作没有被手动停止
                    const modal = document.getElementById('deviceResponseModal');
                    const executingCount = parseInt(document.getElementById('executingDevices')?.textContent || '0');
                    const currentProgress = executingCount === 0 ? 100 : Math.floor((activatedDevices / totalDevices) * 100);
                    
                    // 只有当操作仍在进行中、弹窗未显示、且进度达到100%时才显示
                    if (modal && modal.style.display === 'none' && currentOperation && currentOperation === operationType && currentProgress >= 100) {
                        showOperationStatistics();
                    } else if (currentProgress < 100) {
                    }
                }, 10000); // 10秒后触发
                
                // 保存定时器引用，以便在停止操作时清除
                window.operationFallbackTimer = fallbackTimer;
            }
        }
        
        // 更新按钮状态
        function updateButtonsForOperation(operationType) {
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            const actionButtons = document.querySelector('.action-buttons');
            
            if (operationType === 'charge' || operationType === 'discharge') {
                if (currentOperationMode === 'auto') {
                    // 自动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                } else {
                    // 手动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                }
            }
        }

        // 停止确认弹窗
        function showStopConfirmation() {
            // 使用标准的停止确认弹窗，不显示预计收益
            showStopConfirmationModal();
        }
        
        // 停止操作
        function stopOperation() {
            
            // 停止动画
            if (mapAnimationInterval) {
                clearInterval(mapAnimationInterval);
            }
            
            // 保存停止前的状态，用于判断是否需要设置为等待执行中
            const currentStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';

            // 重置当前操作状态
            currentOperation = null;
            
            // 重置按钮状态
            resetButtons();
            
            // 恢复大圆显示价格
            const priceDisplay = document.getElementById('priceDisplay');
            const stopDisplay = document.getElementById('stopDisplay');
            if (priceDisplay) priceDisplay.style.display = 'block';
            if (stopDisplay) {
                stopDisplay.style.display = 'none';
                stopDisplay.style.opacity = '0';
            }
            
            // 更新地区状态
            if (regionData[selectedMainRegion]) {
                // 如果是自动模式操作，停止后变为等待执行中
                if (currentStatus === 'autoCharge' || currentStatus === 'autoDischarge') {
                    regionData[selectedMainRegion].status = 'waitingExecution';
                    updatePowerStationStatus(selectedMainRegion, 'waitingExecution');
                } else {
                    // 手动模式操作，停止后变为none
                    regionData[selectedMainRegion].status = 'none';
                    updatePowerStationStatus(selectedMainRegion, 'none');
                }
            }
            
            // 更新地区状态指示器
            updateRegionStatusIndicators();
            
            // 更新地区状态显示
            updateRegionStatusDisplay();
            
            // 更新大圆显示状态
            updateCircleStatusDisplay();
            
            // 确保按钮事件处理器正确绑定
            setTimeout(() => {
                const chargeBtn = document.getElementById('chargeBtn');
                const dischargeBtn = document.getElementById('dischargeBtn');
                if (chargeBtn) {
                    chargeBtn.onclick = handleCharge;
                }
                if (dischargeBtn) {
                    dischargeBtn.onclick = handleDischarge;
                }
            }, 100);
            
            // 显示操作统计
            setTimeout(() => {
                showOperationStatistics();
            }, 200);
        }

        // 重置确认弹窗内容避免布局混乱
        function resetConfirmationModal() {
            const confirmModal = document.getElementById('confirmationModal');
            if (!confirmModal) return;
            
            // 关闭并重置弹窗
            confirmModal.classList.remove('show');
            confirmModal.style.display = 'none';
            confirmModal.style.opacity = '0';
            
            // 移除之前动态添加的收益行
            const confirmInfoGrid = document.getElementById('confirmInfoGrid');
            if (confirmInfoGrid) {
                // 移除所有动态添加的行（包括任何包含预计收益的行）
                const dynamicRows = confirmInfoGrid.querySelectorAll('div[style*="margin-top"]');
                dynamicRows.forEach(row => row.remove());
                
                // 额外检查：移除任何包含预计收益的元素
                const profitElements = confirmInfoGrid.querySelectorAll('[data-i18n="estimatedProfit"]');
                profitElements.forEach(element => {
                    const parentRow = element.closest('div[style*="flex"]');
                    if (parentRow && parentRow.parentElement === confirmInfoGrid) {
                        parentRow.remove();
                    }
                });
            }
            
            // 重置所有信息项为可见
            const allInfoItems = confirmModal.querySelectorAll('.modal-info-item');
            allInfoItems.forEach(item => {
                item.style.display = 'flex';
                item.style.flexDirection = 'column';
            });
        }

        // Show operation confirmation modal
        function showOperationConfirmation(operationType) {
            pendingOperation = operationType;
            
            // 重置弹窗内容避免布局混乱
            resetConfirmationModal();
            
            // Store current panel state before showing confirmation
            const activePanel = document.querySelector('.panel-content.active');
            if (activePanel) {
                if (activePanel.id === 'marketPanel') {
                    previousPanel = 'market';
                } else if (activePanel.id === 'mapPanel') {
                    previousPanel = 'map';
                }
            }
            
            // Get current data for confirmation
            const currentPrice = document.getElementById('currentPrice').textContent;
            const deviceCount = 500;
            const estimatedPower = (deviceCount * 6) / 1000; // 6kW per device, convert to MW
            
            // Update confirmation modal content
            const confirmModal = document.getElementById('confirmationModal');
            // 使用i18n获取操作名称
            const getOperationName = (type) => {
                return window.i18n ? window.i18n.getText(type) : (type === 'charge' ? '充电' : '放电');
            };
            
            const operationColors = {
                'charge': '#00ff88',
                'discharge': '#ffd700'
            };
            
            // Update modal icon and color based on operation type
            const confirmIcon = document.getElementById('confirmIcon');
            const modalIcon = confirmIcon.parentElement;
            
            if (operationType === 'charge') {
                confirmIcon.textContent = '⚡';
                modalIcon.style.background = 'linear-gradient(145deg, rgba(0, 255, 136, 0.15), rgba(0, 255, 136, 0.05))';
                modalIcon.style.boxShadow = '0 4px 12px rgba(0, 255, 136, 0.15)';
                document.getElementById('confirmOperationType').style.color = '#00ff88';
            } else if (operationType === 'discharge') {
                confirmIcon.textContent = '🔋';
                modalIcon.style.background = 'linear-gradient(145deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05))';
                modalIcon.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.15)';
                document.getElementById('confirmOperationType').style.color = '#ffd700';
            }
            
            // 使用i18n获取警告消息
            const getWarningMessage = (type) => {
                if (!window.i18n) {
                    return type === 'charge' ? 
                        '将开始对所有连接设备进行充电操作，此过程将消耗电网电力。' :
                        '将开始对所有连接设备进行放电操作，向电网输送电力以获取收益。';
                }
                
                const messages = {
                    'zh': {
                        'charge': '将开始对所有连接设备进行充电操作，此过程将消耗电网电力。',
                        'discharge': '将开始对所有连接设备进行放电操作，向电网输送电力以获取收益。'
                    },
                    'en': {
                        'charge': 'Will start charging all connected devices, this process will consume grid power.',
                        'discharge': 'Will start discharging all connected devices, sending power to the grid for revenue.'
                    },
                    'ja': {
                        'charge': '接続されたすべてのデバイスの充電を開始します。このプロセスでは電力網の電力を消費します。',
                        'discharge': '接続されたすべてのデバイスの放電を開始し、収益のために電力網に電力を送信します。'
                    },
                    'ko': {
                        'charge': '연결된 모든 장치의 충전을 시작합니다. 이 과정에서 전력망 전력을 소모합니다.',
                        'discharge': '연결된 모든 장치의 방전을 시작하여 수익을 위해 전력망에 전력을 보냅니다.'
                    }
                };
                
                const currentLanguage = window.i18n.getCurrentLanguage();
                return messages[currentLanguage] && messages[currentLanguage][type] ? 
                    messages[currentLanguage][type] : messages['zh'][type];
            };
            
            const operationName = getOperationName(operationType);
            const confirmTitleTexts = {
                'zh': `确认${operationName}操作`,
                'en': `Confirm ${operationName} Operation`,
                'ja': `${operationName}操作を確認`,
                'ko': `${operationName} 작업 확인`
            };
            const confirmMessageTexts = {
                'zh': `您确定要执行${operationName}操作吗？`,
                'en': `Are you sure to execute ${operationName} operation?`,
                'ja': `${operationName}操作を実行してもよろしいですか？`,
                'ko': `${operationName} 작업을 실행하시겠습니까?`
            };
            const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
            
            document.getElementById('confirmTitle').textContent = confirmTitleTexts[currentLanguage] || confirmTitleTexts['zh'];
            document.getElementById('confirmMessage').textContent = confirmMessageTexts[currentLanguage] || confirmMessageTexts['zh'];
            document.getElementById('confirmOperationType').textContent = operationName;
            
            const deviceTexts = {
                'zh': deviceCount + '个',
                'en': deviceCount.toString(), // 英文模式只显示数字
                'ja': deviceCount + '台',
                'ko': deviceCount + '대'
            };
            document.getElementById('confirmTargetDevices').textContent = deviceTexts[currentLanguage] || deviceTexts['zh'];
            
            // 首先重置所有信息项为可见状态
            const allInfoItems = confirmModal.querySelectorAll('.modal-info-item');
            allInfoItems.forEach(item => {
                item.style.display = 'flex';
                item.style.flexDirection = 'column';
            });
            
            // Remove any dynamically added rows from previous operations
            const confirmInfoGrid = document.getElementById('confirmInfoGrid');
            const dynamicRows = confirmInfoGrid.querySelectorAll('div[style*="margin-top"]');
            dynamicRows.forEach(row => row.remove());
            
            // Hide/show fields based on user requirements
            const estimatedPowerEl = document.getElementById('confirmEstimatedPower');
            const currentPriceEl = document.getElementById('confirmCurrentPrice');
            const durationEl = document.getElementById('confirmDuration');
            const costBenefitEl = document.getElementById('confirmCostBenefit');
            
            const estimatedPowerItem = estimatedPowerEl ? estimatedPowerEl.parentElement : null;
            const currentPriceItem = currentPriceEl ? currentPriceEl.parentElement : null;
            const durationItem = durationEl ? durationEl.parentElement : null;
            const costBenefitItem = costBenefitEl ? costBenefitEl.parentElement : null;
            
            // 判断是否为停止操作
            const isStopOperation = operationType.includes('stop') || pendingOperation.includes('stop');
            
            if (operationType === 'charge' || isStopOperation) {
                // For charge and stop operations: hide all profit-related fields
                if (estimatedPowerItem) estimatedPowerItem.style.display = 'none';
                if (currentPriceItem) currentPriceItem.style.display = 'none';
                if (durationItem) durationItem.style.display = 'none';
                if (costBenefitItem) costBenefitItem.style.display = 'none';
            } else if (operationType === 'discharge' && !isStopOperation) {
                // For discharge only (not stop discharge): show predicted profit
                if (estimatedPowerItem) estimatedPowerItem.style.display = 'none';
                if (currentPriceItem) currentPriceItem.style.display = 'none';
                if (durationItem) durationItem.style.display = 'none';
                if (costBenefitItem) costBenefitItem.style.display = 'none';
                
                const profitRow = document.createElement('div');
                profitRow.style.cssText = 'display: flex; gap: 20px; margin-top: 20px;';
                const profitLabel = window.i18n ? window.i18n.getText('estimatedProfit') : '预计收益';
                profitRow.innerHTML = `
                    <div class="modal-info-item" style="flex: 1; max-width: calc(50% - 10px); background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 20px 24px; transition: all 0.3s; display: flex; flex-direction: column;">
                        <div class="modal-info-label" style="color: rgba(255, 255, 255, 0.6); font-size: 14px; margin-bottom: 8px; font-weight: 400;" data-i18n="estimatedProfit">${profitLabel}</div>
                        <div class="modal-info-value" style="color: #ffd700; font-size: 20px; font-weight: 600;">+$${Math.floor(estimatedPower * parseInt(currentPrice.replace('$', '')) * 0.7)}</div>
                    </div>
                    <div style="flex: 1;"></div>
                `;
                confirmInfoGrid.appendChild(profitRow);
            }
            
            // Update warning message
            document.getElementById('warningText').textContent = getWarningMessage(operationType);
            
            // Update execute button
            const executeBtn = document.getElementById('confirmExecuteBtn');
            const executeBtnTexts = {
                'zh': `确认${operationName}`,
                'en': `Confirm ${operationName}`,
                'ja': `${operationName}確認`,
                'ko': `${operationName} 확인`
            };
            executeBtn.textContent = executeBtnTexts[currentLanguage] || executeBtnTexts['zh'];
            
            if (operationType === 'discharge') {
                executeBtn.style.background = 'linear-gradient(135deg, #ffd700, #ffcc00)';
                executeBtn.style.color = '#000';
                executeBtn.onmouseover = function() { 
                    this.style.transform='translateY(-1px)'; 
                    this.style.boxShadow='0 6px 20px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                };
                executeBtn.onmouseout = function() { 
                    this.style.transform='translateY(0)'; 
                    this.style.boxShadow='0 4px 16px rgba(255, 215, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                };
            } else if (operationType === 'charge') {
                // Charge按钮使用绿色
                executeBtn.style.background = 'linear-gradient(135deg, #00ff88, #00dd77)';
                executeBtn.style.color = '#000';
                executeBtn.onmouseover = function() { 
                    this.style.transform='translateY(-1px)'; 
                    this.style.boxShadow='0 6px 20px rgba(0, 255, 136, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                };
                executeBtn.onmouseout = function() { 
                    this.style.transform='translateY(0)'; 
                    this.style.boxShadow='0 4px 16px rgba(0, 255, 136, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                };
            } else {
                // 其他操作（停止等）使用红色
                executeBtn.style.background = 'linear-gradient(135deg, #ff4444, #ff3333)';
                executeBtn.style.color = '#fff';
            }
            
            // Show modal with animation
            confirmModal.classList.add('show');
            confirmModal.style.display = 'flex';
            
            // Add fade-in animation
            setTimeout(() => {
                confirmModal.style.opacity = '1';
            }, 10);
        }


        // Close confirmation modal
        function closeConfirmationModal() {
            const modal = document.getElementById('confirmationModal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
                modal.style.opacity = '0';
            }
            pendingOperation = null;
            
            // Don't change panel view when canceling - keep current state
            // This ensures the UI stays in the same state when user cancels
        }

        // Execute confirmed operation
        function executeConfirmedOperation() {
            if (!pendingOperation) return;

            const operationType = pendingOperation;
            closeConfirmationModal();

            
            if (operationType === 'stop' || operationType.startsWith('stop_')) {
                // Execute stop operation
                executeStopOperation();
            } else {
                // Show progress dialog first (隐藏充电进度弹窗)
                // showProgressDialog(operationType);

                // Execute start operation
                startOperation(operationType);
                
                // Start progress animation
                startProgressAnimation(operationType);
                
                // 确保价格圆圈颜色立即更新
                setTimeout(() => {
                    updatePriceCircleColor();
                }, 100);
            }
            
            pendingOperation = null;
        }

        // Execute the actual operation after confirmation
        function executeOperation(operationType) {
            
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            
            currentOperation = operationType;
            
            const actionButtons = document.querySelector('.action-buttons');
            
            if (operationType === 'charge') {
                // 处理按钮状态
                if (currentOperationMode === 'auto') {
                    // 自动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                } else {
                    // 手动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                }
                
                // 不更改显示，保持价格显示
                
                // Switch to map view only after confirmation
                switchPanel('map');
                setTimeout(() => {
                    startDeviceAnimation();
                }, 200);
            } else if (operationType === 'discharge') {
                // 处理按钮状态
                if (currentOperationMode === 'auto') {
                    // 自动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                } else {
                    // 手动模式：隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                }
                
                // 不更改显示，保持价格显示
                
                // Switch to map view only after confirmation
                switchPanel('map');
                setTimeout(() => {
                    startDeviceAnimation();
                }, 200);
            }
        }


        function showDetail(type) {
            // Add detail view logic here
        }

        // Panel switching functions
        function switchPanel(panel, button) {
            // Update panel visibility
            document.querySelectorAll('.panel-content').forEach(p => {
                p.classList.remove('active');
            });
            
            const targetPanel = document.getElementById(panel + 'Panel');
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
            
            // Update button states - always update, even if button not provided
            document.querySelectorAll('.panel-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Find and activate the correct tab button
            if (button) {
                button.classList.add('active');
            } else {
                // If no button provided, find the tab by panel name
                const targetTab = Array.from(document.querySelectorAll('.panel-tab')).find(tab => {
                    const onclick = tab.getAttribute('onclick');
                    return onclick && onclick.includes(`'${panel}'`);
                });
                if (targetTab) {
                    targetTab.classList.add('active');
                }
            }
            
            // Resize charts after switching
            setTimeout(() => {
                if (panel === 'market' && marketChart) {
                    if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                } else if (panel === 'map' && mapChart) {
                    mapChart.resize();
                }
            }, 100);
            
            // Additional resize with longer delay to ensure proper rendering
            setTimeout(() => {
                if (panel === 'market' && marketChart) {
                    if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                } else if (panel === 'map' && mapChart) {
                    mapChart.resize();
                }
            }, 300);
        }

        // Market region switching
        function switchMarketRegion(region, button) {
            // Update active button
            document.querySelectorAll('#marketPanel .region-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            button.classList.add('active');
            
            // Update current region
            currentRegion = region;
            
            // Update market chart with new data
            updateMarketChart(region);

            // Update power station management module prices
            updatePriceCircleRegion(region);
        }
        
        // Update price circle region
        function updatePriceCircleRegion(region) {
            const regionIndicatorEl = document.getElementById('regionIndicator');
            if (regionIndicatorEl) regionIndicatorEl.textContent = region;

            let price;

            // 优先使用AEMO真实数据的当前价格
            if (aemoRealPriceData && aemoRealPriceData.length > 0) {
                // 计算当前时间索引
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const roundedMinute = Math.floor(currentMinute / 5) * 5;
                const currentTimeIndex = currentHour * 12 + (roundedMinute / 5);

                // 使用真实的现货价格
                price = aemoRealPriceData[currentTimeIndex];
            } else {
                // 后备方案：各地区固定价格
                const regionPrices = {
                    'NSW': 163,
                    'QLD': 34,
                    'VIC': 21,
                    'SA': 403,
                    'TAS': 390
                };
                price = regionPrices[region] || 163; // 默认NSW价格
            }

            document.getElementById('currentPrice').textContent = '$' + (typeof price === 'number' ? price.toFixed(2) : price);

            // Add smooth transition effect
            const priceElement = document.getElementById('currentPrice');
            priceElement.style.transition = 'color 0.3s ease';
            priceElement.style.color = '#00ff88';
            setTimeout(() => {
                priceElement.style.color = '#fff';
            }, 300);
        }

        function updateMarketChart(region) {
            // 使用AEMO.xlsx的真实数据（每5分钟一个数据点）
            // 获取当前时间并计算对应的数据索引
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const roundedMinute = Math.floor(currentMinute / 5) * 5;
            const currentTimeIndex = currentHour * 12 + (roundedMinute / 5);

            const actualPrices = [];
            const actualDemands = [];
            const forecastPrices = [];
            const forecastDemands = [];

            // 遍历所有288个数据点
            for (let i = 0; i < aemoTimeLabels.length; i++) {
                if (i < currentTimeIndex) {
                    actualPrices.push(aemoRealPriceData[i]);
                    actualDemands.push(aemoRealDemandData[i]);
                    forecastPrices.push(null);
                    forecastDemands.push(null);
                } else if (i === currentTimeIndex) {
                    actualPrices.push(aemoRealPriceData[i]);
                    actualDemands.push(aemoRealDemandData[i]);
                    forecastPrices.push(aemoRealPriceData[i]);
                    forecastDemands.push(aemoRealDemandData[i]);
                } else {
                    actualPrices.push(null);
                    actualDemands.push(null);
                    forecastPrices.push(aemoRealPriceData[i]);
                    forecastDemands.push(aemoRealDemandData[i]);
                }
            }

            const chartOption = {
                xAxis: {
                    type: 'category',
                    data: aemoTimeLabels,
                    axisLine: { show: false },
                    axisLabel: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        interval: 23,
                        fontSize: 12,
                        rotate: 0
                    },
                    splitLine: { show: false }
                },
                yAxis: [
                    {
                        type: 'value',
                        scale: true,
                        min: 'dataMin',
                        max: 'dataMax',
                        axisLine: { show: false },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            formatter: '${value}'
                        },
                        splitLine: {
                            show: true,
                            lineStyle: {
                                color: 'rgba(255, 255, 255, 0.05)',
                                type: 'dashed',
                                width: 1
                            }
                        }
                    },
                    {
                        type: 'value',
                        scale: true,
                        min: 'dataMin',
                        max: 'dataMax',
                        axisLine: { show: false },
                        axisLabel: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            formatter: '{value} MW'
                        },
                        splitLine: { show: false }
                    }
                ],
                legend: {
                    data: [
                        window.i18n ? window.i18n.getText('historicalPrice') : '历史价格',
                        window.i18n ? window.i18n.getText('demand') : '需求',
                        window.i18n ? window.i18n.getText('predictedPrice') : '预测价格',
                        window.i18n ? window.i18n.getText('predictedDemand') : '预测需求'
                    ],
                    textStyle: { color: 'rgba(255, 255, 255, 0.7)' },
                    top: 10
                },
                series: [
                    {
                        data: actualPrices,
                        name: window.i18n ? window.i18n.getText('historicalPrice') : '历史价格',
                        markLine: {
                            symbol: 'none',
                            silent: true,
                            data: [
                                {
                                    xAxis: currentTimeIndex,
                                    lineStyle: {
                                        color: 'rgba(255, 255, 255, 0.4)',
                                        type: 'dashed',
                                        width: 2
                                    },
                                    label: {
                                        show: false
                                    }
                                }
                            ]
                        }
                    },
                    {
                        data: actualDemands,
                        name: window.i18n ? window.i18n.getText('demand') : '需求',
                        yAxisIndex: 1
                    },
                    {
                        data: forecastPrices,
                        name: window.i18n ? window.i18n.getText('predictedPrice') : '预测价格'
                    },
                    {
                        data: forecastDemands,
                        name: window.i18n ? window.i18n.getText('predictedDemand') : '预测需求',
                        yAxisIndex: 1
                    }
                ]
            };

            marketChart.setOption(chartOption);
        }

        // Auto switch functionality
        // 自动切换功能已移除
        // function toggleAutoSwitch() { }
        // function startAutoSwitch() { }
        // function stopAutoSwitch() { }

        // 处理停止操作
        function handleStop() {
            // 显示停止确认弹窗
            showStopConfirmationModal();
        }
        
        // 将函数暴露到全局作用域
        window.handleStop = handleStop;
        
        // 主圆圈悬停处理
        function handleMainCircleHover() {
            const regionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
            
            // 在4种状态下显示停止：autoCharge, manualCharge, autoDischarge, manualDischarge
            if (regionStatus === 'autoCharge' || regionStatus === 'manualCharge' || 
                regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge') {
                const priceDisplay = document.getElementById('priceDisplay');
                const statusDisplay = document.getElementById('statusDisplay');
                const stopDisplay = document.getElementById('stopDisplay');
                const mainCircle = document.getElementById('mainPriceCircle');
                const hoverOverlay = document.getElementById('hoverOverlay');
                
                // 隐藏价格和状态显示
                if (priceDisplay) {
                    priceDisplay.style.opacity = '0';
                }
                
                if (statusDisplay) {
                    statusDisplay.style.opacity = '0';
                }
                
                // 显示停止文本
                if (stopDisplay) {
                    stopDisplay.style.display = 'block';
                    setTimeout(() => {
                        stopDisplay.style.opacity = '1';
                    }, 10);
                }
                
                // 显示红色覆盖层
                if (hoverOverlay) {
                    hoverOverlay.style.opacity = '1';
                }
                
                if (mainCircle) {
                    mainCircle.style.transform = 'scale(1.05)';
                }
            }
        }
        
        // 主圆圈鼠标离开处理
        function handleMainCircleLeave() {
            const priceDisplay = document.getElementById('priceDisplay');
            const statusDisplay = document.getElementById('statusDisplay');
            const stopDisplay = document.getElementById('stopDisplay');
            const mainCircle = document.getElementById('mainPriceCircle');
            const hoverOverlay = document.getElementById('hoverOverlay');
            
            // 隐藏停止文本
            if (stopDisplay) {
                stopDisplay.style.opacity = '0';
                setTimeout(() => {
                    stopDisplay.style.display = 'none';
                }, 300);
            }
            
            // 恢复正确的显示状态
            updateCircleStatusDisplay();
            
            // 隐藏红色覆盖层
            if (hoverOverlay) {
                hoverOverlay.style.opacity = '0';
            }
            
            if (mainCircle) {
                mainCircle.style.transform = 'scale(1)';
            }
            
            // 只恢复水波颜色，不改变水位高度
            restoreWaterWaveColor();
        }
        
        // 恢复水波颜色但不改变水位高度的函数
        function restoreWaterWaveColor() {
            const waterWaveContainer = document.getElementById('waterWaveContainer');
            if (!waterWaveContainer) return;
            
            const regionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
            
            // 只恢复颜色，不改变水位高度
            if (regionStatus === 'autoCharge' || regionStatus === 'manualCharge') {
                // 充电状态 - 绿色水波
                waterWaveContainer.style.background = '#4CD964';
            } else if (regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge') {
                // 放电状态 - 黄色水波
                waterWaveContainer.style.background = '#FFC107';
            } else {
                // 无状态 - 青色/浅蓝色水波
                waterWaveContainer.style.background = '#5AC8FA';
            }
        }
        
        // 主圆圈点击处理
        function handleMainCircleClick() {
            const regionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
            
            // 在4种状态下响应点击：autoCharge, manualCharge, autoDischarge, manualDischarge
            if (regionStatus === 'autoCharge' || regionStatus === 'manualCharge' || 
                regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge') {
                // 显示停止确认弹窗
                showStopConfirmation();
            }
        }
        
        // 暴露函数到全局
        window.handleMainCircleHover = handleMainCircleHover;
        window.handleMainCircleLeave = handleMainCircleLeave;
        window.handleMainCircleClick = handleMainCircleClick;
        
        function showStopConfirmationModal() {
            // 首先重置弹窗，确保没有预计收益
            resetConfirmationModal();
            
            // 根据当前操作确定停止类型
            const currentOp = currentOperation || 'charge'; // 默认为充电
            const isCharging = currentOp === 'charge';
            
            // 使用 confirmationModal 以保持与充电弹窗一致的样式
            const modal = document.getElementById('confirmationModal');
            if (!modal) {
                console.error('confirmationModal not found');
                return;
            }
            
            // 首先重置所有信息项为可见状态
            const allInfoItems = modal.querySelectorAll('.modal-info-item');
            allInfoItems.forEach(item => {
                item.style.display = 'flex';
                item.style.flexDirection = 'column';
            });
            
            // 设置弹窗内容
            const confirmTitle = document.getElementById('confirmTitle');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmOperationType = document.getElementById('confirmOperationType');
            const confirmTargetDevices = document.getElementById('confirmTargetDevices');
            const warningText = document.getElementById('warningText');
            const confirmExecuteBtn = document.getElementById('confirmExecuteBtn');
            const confirmIcon = document.getElementById('confirmIcon');
            
            // 设置图标和标题
            if (confirmIcon) confirmIcon.textContent = '🛑';
            
            // Update modal icon style for stop operation
            const modalIcon = confirmIcon.parentElement;
            if (modalIcon) {
                modalIcon.style.background = 'linear-gradient(145deg, rgba(255, 68, 68, 0.15), rgba(255, 68, 68, 0.05))';
                modalIcon.style.boxShadow = '0 4px 12px rgba(255, 68, 68, 0.15)';
            }
            
            // Update operation type card color for stop
            const operationTypeElement = document.getElementById('confirmOperationType');
            if (operationTypeElement) {
                operationTypeElement.style.color = '#ff4444';
            }
            
            if (isCharging) {
                if (confirmTitle) confirmTitle.textContent = window.i18n ? window.i18n.getText('confirmStopChargeTitle') : '确认停止充电';
                if (confirmMessage) confirmMessage.textContent = window.i18n ? window.i18n.getText('confirmStopChargeMessage') : '您确定要停止充电操作吗？';
                if (confirmOperationType) confirmOperationType.textContent = window.i18n ? window.i18n.getText('stopCharge') : '停止充电';
                if (confirmExecuteBtn) {
                    confirmExecuteBtn.textContent = window.i18n ? window.i18n.getText('confirmStopCharge') : '确认停止充电';
                    confirmExecuteBtn.style.background = 'linear-gradient(135deg, #ff4444, #ff3333)';
                    confirmExecuteBtn.style.color = '#fff';
                    confirmExecuteBtn.style.boxShadow = '0 4px 16px rgba(255, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                    confirmExecuteBtn.onmouseover = function() { 
                        this.style.transform='translateY(-1px)'; 
                        this.style.boxShadow='0 6px 20px rgba(255, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'; 
                    };
                    confirmExecuteBtn.onmouseout = function() { 
                        this.style.transform='translateY(0)'; 
                        this.style.boxShadow='0 4px 16px rgba(255, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)'; 
                    };
                }
                if (warningText) warningText.textContent = window.i18n ? window.i18n.getText('stopChargeWarning') : '停止操作将立即终止所有设备的充电状态，设备将恢复到待机模式。';
            } else {
                if (confirmTitle) confirmTitle.textContent = window.i18n ? window.i18n.getText('confirmStopDischargeTitle') : '确认停止放电';
                if (confirmMessage) confirmMessage.textContent = window.i18n ? window.i18n.getText('confirmStopDischargeMessage') : '您确定要停止放电操作吗？';
                if (confirmOperationType) confirmOperationType.textContent = window.i18n ? window.i18n.getText('stopDischarge') : '停止放电';
                if (confirmExecuteBtn) {
                    confirmExecuteBtn.textContent = window.i18n ? window.i18n.getText('confirmStopDischarge') : '确认停止放电';
                    confirmExecuteBtn.style.background = 'linear-gradient(135deg, #ff4444, #ff3333)';
                    confirmExecuteBtn.style.color = '#fff';
                    confirmExecuteBtn.style.boxShadow = '0 4px 16px rgba(255, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                    confirmExecuteBtn.onmouseover = function() { 
                        this.style.transform='translateY(-1px)'; 
                        this.style.boxShadow='0 6px 20px rgba(255, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'; 
                    };
                    confirmExecuteBtn.onmouseout = function() { 
                        this.style.transform='translateY(0)'; 
                        this.style.boxShadow='0 4px 16px rgba(255, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)'; 
                    };
                }
                if (warningText) warningText.textContent = window.i18n ? window.i18n.getText('stopDischargeWarning') : '停止操作将立即终止所有设备的放电状态，设备将恢复到待机模式。';
            }
            
            // 设置影响设备数量
            if (confirmTargetDevices) {
                const deviceCount = window.i18n && window.i18n.getCurrentLanguage() === 'en' ? '500' : '500个';
                confirmTargetDevices.textContent = deviceCount;
            }
            
            // 隐藏其他不需要的信息项
            const estimatedPowerItem = document.getElementById('confirmEstimatedPower');
            const currentPriceItem = document.getElementById('confirmCurrentPrice');
            const durationItem = document.getElementById('confirmDuration');
            const costBenefitItem = document.getElementById('confirmCostBenefit');
            
            if (estimatedPowerItem && estimatedPowerItem.parentElement) {
                estimatedPowerItem.parentElement.style.display = 'none';
            }
            if (currentPriceItem && currentPriceItem.parentElement) {
                currentPriceItem.parentElement.style.display = 'none';
            }
            if (durationItem && durationItem.parentElement) {
                durationItem.parentElement.style.display = 'none';
            }
            if (costBenefitItem && costBenefitItem.parentElement) {
                costBenefitItem.parentElement.style.display = 'none';
            }
            
            // 设置pending operation为停止操作
            pendingOperation = 'stop';
            
            // 显示弹窗
            modal.classList.add('show');
            modal.style.display = 'flex';
            
            // 添加模态框打开动画
            setTimeout(() => {
                modal.style.opacity = '1';
            }, 10);
        }
        
        function executeStopOperation() {
            
            // 调用停止操作函数，它会处理所有的状态重置和UI更新
            stopOperation();
        }
        
        // Enhanced device animation with wave effect
        function startDeviceAnimation() {

            activatedDevices = 0;
            const totalDevices = 500;

            // Clear previous animation
            if (mapAnimationInterval) {
                clearInterval(mapAnimationInterval);
            }

            // Update UI - 从当前地区的数据开始动画,不重新生成随机数据
            const totalEl = document.getElementById('totalDevices');
            const successEl = document.getElementById('successfulDevices');
            const executingEl = document.getElementById('executingDevices');
            const failedEl = document.getElementById('failedDevices');


            // 使用当前地区已有的设备统计数据作为动画起点
            const currentRegionStats = regionData[selectedMainRegion]?.deviceStats;

            let initialSuccessCount, initialExecutingCount, initialFailedCount;

            if (currentRegionStats) {
                // 使用地区已有的数据
                initialSuccessCount = currentRegionStats.success;
                initialExecutingCount = currentRegionStats.executing;
                initialFailedCount = currentRegionStats.failed;
            } else {
                // 如果没有数据(不应该发生),则生成新的随机数据
                initialFailedCount = Math.floor(Math.random() * 46) + 5;
                initialSuccessCount = Math.floor(Math.random() * 101) + 100;
                initialExecutingCount = totalDevices - initialFailedCount - initialSuccessCount;
                console.warn(`No existing data for region ${selectedMainRegion}, generating new random data`);
            }

            // 设置初始激活数为已成功的数量
            activatedDevices = initialSuccessCount;

            if (totalEl) totalEl.textContent = totalDevices;
            if (successEl) successEl.textContent = initialSuccessCount;
            if (executingEl) executingEl.textContent = initialExecutingCount;
            if (failedEl) failedEl.textContent = initialFailedCount;

            // 更新设备状态数据
            updateDeviceStatusCounts(initialSuccessCount, initialExecutingCount, initialFailedCount);

            
            let animationStep = 0;
            const maxSteps = totalDevices / 3; // Complete animation in ~167 steps
            
            // Start wave animation
            mapAnimationInterval = setInterval(() => {
                if (animationStep < maxSteps) {
                    // Create wave effect - activate 2-4 devices per step with some randomness
                    const baseActivation = Math.floor(3 + Math.random() * 2); // 3-4 devices
                    const waveBonus = Math.sin((animationStep / maxSteps) * Math.PI * 2) * 2; // Wave pattern
                    const actualActivation = Math.max(1, Math.floor(baseActivation + waveBonus));
                    
                    activatedDevices = Math.min(activatedDevices + actualActivation, totalDevices);
                    animationStep++;

                    // Update UI with smooth progress
                    // 已处理的设备数逐渐增加
                    const processedDevices = activatedDevices;
                    const successCount = Math.floor(processedDevices * 0.95); // 95% success rate
                    const failCount = Math.floor(processedDevices * 0.05); // 5% failure rate
                    const executingCount = totalDevices - successCount - failCount; // 剩余未处理的设备

                    // 更新显示：成功 + 失败 + 执行中 = 设备总数（500）
                    safeSetText('successfulDevices', successCount);
                    safeSetText('executingDevices', executingCount);
                    safeSetText('failedDevices', failCount);

                    // 每10步打印一次进度日志
                    if (animationStep % 10 === 0) {
                    }

                    // Update device status data
                    updateDeviceStatusCounts(successCount, executingCount, failCount);
                    
                    // Update map with animation - this will sync the statistics
                    try {
                        updateMapDevicesWithAnimation(activatedDevices);
                    } catch (error) {
                        console.error('Error updating map devices:', error);
                    }
                    
                    // Add some visual effects for special milestones
                    if (activatedDevices % 50 === 0) {
                        createEnergyWave();
                    }
                    
                } else {
                    // Animation complete
                    clearInterval(mapAnimationInterval);
                    
                    // 确保所有设备都已处理完成
                    activatedDevices = totalDevices;
                    const finalSuccessCount = Math.floor(totalDevices * 0.95); // 95% success (475)
                    const finalFailCount = Math.floor(totalDevices * 0.05); // 5% failure (25)
                    const finalExecutingCount = totalDevices - finalSuccessCount - finalFailCount; // 剩余 (0)

                    // 更新显示：成功 + 失败 + 执行中 = 设备总数（500）
                    safeSetText('successfulDevices', finalSuccessCount);
                    safeSetText('executingDevices', finalExecutingCount);
                    safeSetText('failedDevices', finalFailCount);

                    // Update device status data
                    updateDeviceStatusCounts(finalSuccessCount, finalExecutingCount, finalFailCount);

                    // 保存最终数据回地区数据,以便下次切换回来时显示
                    if (regionData[selectedMainRegion]) {
                        regionData[selectedMainRegion].deviceStats = {
                            total: totalDevices,
                            success: finalSuccessCount,
                            executing: finalExecutingCount,
                            failed: finalFailCount
                        };
                    }

                    // 计算实际进度
                    const actualProgress = Math.round((activatedDevices / totalDevices) * 100);
                    
                    // 只有真正达到100%时才显示统计弹窗
                    if (actualProgress >= 100) {
                        // 动画完成后显示统计
                        setTimeout(() => {
                            showOperationStatistics();
                        }, 1000);
                    }
                }
            }, 80); // Slightly faster updates for smoother animation
        }

        function updateMapDevicesWithAnimation(activeCount) {
            if (!mapChart || !deviceLocations.length) return;
            
            // Update actual device statuses based on command progress
            // Simulate devices receiving commands and changing their real status
            const successRate = 0.85; // 85% of devices successfully receive and execute commands
            const executedDevices = Math.floor(activeCount * successRate);
            
            // Update device statuses to reflect real execution
            for (let i = 0; i < deviceLocations.length; i++) {
                const device = deviceLocations[i];

                if (device.status === 'offline' || device.status === 'hidden') {
                    // Offline devices stay offline, hidden devices stay hidden
                    continue;
                }
                
                if (i < executedDevices && currentOperation) {
                    // These devices have successfully received and executed the command
                    if (currentOperation === 'charge') {
                        device.status = 'charging';
                    } else if (currentOperation === 'discharge') {
                        device.status = 'discharging';
                    }
                } else if (i < activeCount) {
                    // These devices received command but haven't executed yet (processing)
                    device.status = 'active';
                } else {
                    // These devices are inactive/standby
                    if (device.status === 'charging' || device.status === 'discharging' || device.status === 'active') {
                        device.status = 'inactive';
                    }
                }
            }
            
            // Create animated device data based on real status (过滤掉hidden状态)
            const data = deviceLocations
                .filter(device => device.status !== 'hidden')  // 过滤掉hidden状态的设备
                .map((device, index) => {
                    const justActivated = index >= activeCount - 5 && index < activeCount; // Last 5 devices that got commands

                    return {
                        value: device.value,
                        id: device.id,
                        status: device.status, // Use actual device status
                        region: device.region,
                        city: device.city,
                        justActivated: justActivated
                    };
                });
            
            // Update the device series with enhanced styling
            mapChart.setOption({
                series: [
                    {}, // Keep region centers unchanged
                    {
                        name: 'Devices',
                        type: 'scatter',
                        data: data,
                        symbolSize: function(value, params) {
                            const status = params.data.status;
                            const justActivated = params.data.justActivated;
                            
                            if (justActivated) {
                                return 14; // Larger for just activated
                            } else if (status === 'charging' || status === 'discharging') {
                                return 8; // Larger for operational devices
                            } else if (status === 'active') {
                                return 6;
                            } else if (status === 'offline') {
                                return 4;
                            }
                            return 5;
                        },
                        itemStyle: {
                            color: function(params) {
                                const status = params.data.status;
                                const justActivated = params.data.justActivated;
                                
                                if (justActivated) {
                                    // Bright pulse effect for just activated devices
                                    if (status === 'charging') return '#00ff88';
                                    if (status === 'discharging') return '#8A4AFF';
                                    if (status === 'active') return '#ffcc00';
                                }
                                
                                // Enhanced status colors with gradients
                                switch (status) {
                                    case 'charging': 
                                        return '#00ff88'; // Vibrant green for charging
                                    case 'discharging': 
                                        return '#FFD700'; // Yellow for discharging
                                    case 'active':
                                        return '#ffcc00'; // Bright yellow for active
                                    case 'offline': 
                                        return 'rgba(120, 120, 120, 0.4)'; // Gray for offline
                                    default:
                                        return 'rgba(255, 255, 255, 0.6)'; // Soft white for inactive
                                }
                            },
                            borderColor: function(params) {
                                const status = params.data.status;
                                const justActivated = params.data.justActivated;
                                
                                if (justActivated) {
                                    return '#ffffff';
                                }
                                
                                switch (status) {
                                    case 'charging': return 'rgba(0, 255, 136, 0.8)';
                                    case 'discharging': return 'rgba(255, 215, 0, 0.8)';
                                    case 'active': return 'rgba(255, 204, 0, 0.8)';
                                    default: return 'rgba(255, 255, 255, 0.4)';
                                }
                            },
                            borderWidth: function(params) {
                                const status = params.data.status;
                                if (params.data.justActivated) return 3;
                                if (status === 'charging' || status === 'discharging') return 2;
                                return 1;
                            },
                            shadowBlur: function(params) {
                                const status = params.data.status;
                                const justActivated = params.data.justActivated;
                                
                                if (justActivated) {
                                    return 25; // Enhanced glow for new activations
                                } else if (status === 'charging' || status === 'discharging') {
                                    return 15; // Medium glow for operational devices
                                } else if (status === 'active') {
                                    return 8;
                                }
                                return 4;
                            },
                            shadowColor: function(params) {
                                const status = params.data.status;
                                const justActivated = params.data.justActivated;
                                
                                if (justActivated) {
                                    if (status === 'charging') return 'rgba(0, 255, 136, 0.9)';
                                    if (status === 'discharging') return 'rgba(255, 51, 102, 0.9)';
                                    if (status === 'active') return 'rgba(255, 204, 0, 0.9)';
                                }
                                
                                switch (status) {
                                    case 'charging':
                                        return 'rgba(0, 255, 136, 0.8)';
                                    case 'discharging':
                                        return 'rgba(255, 215, 0, 0.8)';
                                    case 'active':
                                        return 'rgba(255, 170, 0, 0.8)';
                                    default:
                                        return 'rgba(255, 255, 255, 0.3)';
                                }
                            }
                        },
                        emphasis: {
                            scale: 1.8,
                            itemStyle: {
                                shadowBlur: 30,
                                shadowColor: function(params) {
                                    const status = params.data.status;
                                    switch (status) {
                                        case 'charging': return 'rgba(0, 255, 136, 1)';
                                        case 'discharging': return 'rgba(255, 215, 0, 1)';
                                        case 'active': return 'rgba(255, 204, 0, 1)';
                                        default: return 'rgba(255, 255, 255, 0.8)';
                                    }
                                },
                                borderWidth: 3,
                                borderColor: '#ffffff'
                            }
                        },
                        animation: true,
                        animationDuration: 800,
                        animationEasing: 'cubicOut'
                    }
                ]
            });
            
            
            // Update map statistics with current active count
            updateMapStatistics(activeCount);
        }

        function createEnergyWave() {
            // Visual effect for energy wave (could be enhanced with more sophisticated graphics)
            if (mapChart) {
                const option = mapChart.getOption();
                
                // Add temporary graphic element for wave effect
                const waveGraphic = {
                    type: 'circle',
                    shape: {
                        cx: 300,
                        cy: 250,
                        r: 50
                    },
                    style: {
                        stroke: currentOperation === 'charge' ? '#00ff88' : '#8A4AFF',
                        lineWidth: 3,
                        fill: 'transparent',
                        opacity: 0.8
                    },
                    z: 10
                };
                
                // Add wave and remove after animation
                setTimeout(() => {
                    if (mapChart) {
                        const currentGraphic = mapChart.getOption().graphic || [];
                        mapChart.setOption({
                            graphic: [...currentGraphic, waveGraphic]
                        });
                        
                        // Remove wave after 500ms
                        setTimeout(() => {
                            updateMapStatistics(); // This resets the graphic to just statistics
                        }, 500);
                    }
                }, 50);
            }
        }

        function updateMapDevices(activeCount) {
            if (!mapChart || !deviceLocations.length) return;

            // Create updated device data that works with both geo and cartesian2d
            // Filter out hidden devices
            const data = deviceLocations
                .filter(device => device.status !== 'hidden')
                .map((device, index) => {
                    const isActive = index < activeCount;

                    return {
                        name: `设备${device.id}`,
                        value: device.value.concat ? device.value.concat([device.id]) : device.value,
                        id: device.id,
                        status: isActive ? 'active' : 'inactive',
                        city: device.city
                    };
                });
            
            // Update the device series (series[1], after cities series[0])
            mapChart.setOption({
                series: [
                    {}, // Keep cities unchanged
                    {
                        name: 'Devices',
                        type: 'scatter',
                        data: data
                    }
                ]
            });
            
            // Update legend with new counts
            updateMapLegend();
        }

        // 更新价格圆圈颜色的函数
        function updatePriceCircleColor() {
            // Update stop button visibility based on current state
            updateStopButtonVisibility();
            
            // Update action buttons visibility based on current state
            updateActionButtonsVisibility();
            
            // 获取当前选中地区的状态 - 使用regionData而不是regionOperationStatus
            const regionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
            
            // Update water wave colors based on operation status
            const waterWaveContainer = document.getElementById('waterWaveContainer');
            const mainCircle = document.getElementById('mainPriceCircle');
            
            if (!waterWaveContainer) {
                return;
            }
            
            const waterLevelContainer = document.getElementById('waterLevelContainer');
            
            if (regionStatus === 'autoCharge' || regionStatus === 'manualCharge') {
                // 充电状态 - 柔和的绿色渐变，与橙色明度匹配
                waterWaveContainer.style.background = 'linear-gradient(135deg, var(--color-circle-primary) 0%, #389e0d 100%)';
                if (waterLevelContainer) {
                    waterLevelContainer.style.height = '100%';
                }
            } else if (regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge') {
                // 放电状态 - 优化的橙色渐变，更加温暖
                waterWaveContainer.style.background = 'linear-gradient(135deg, #ff9500 0%, #ff7700 100%)';
                if (waterLevelContainer) {
                    waterLevelContainer.style.height = '100%';
                }
            } else {
                // 无状态 - 优化的蓝色渐变，更加柔和
                waterWaveContainer.style.background = 'linear-gradient(135deg, #007AFF 0%, #0056CC 100%)';
                if (waterLevelContainer) {
                    waterLevelContainer.style.height = '100%';
                }
            }
            
            // 更新大圆的光标样式
            if (mainCircle) {
                if (currentOperationMode === 'auto') {
                    // 自动模式下，大圆不可点击
                    mainCircle.style.cursor = 'default';
                } else {
                    // 手动模式下，只有在有操作进行时才可点击
                    if (currentOperation === 'charge' || currentOperation === 'discharge') {
                        mainCircle.style.cursor = 'pointer';
                    } else {
                        mainCircle.style.cursor = 'default';
                    }
                }
            }
        }

        // 更新停止按钮显示状态
        function updateStopButtonVisibility() {
            const mainPriceCircle = document.getElementById('mainPriceCircle');
            if (!mainPriceCircle) return;
            
            // 获取当前选中地区的状态
            const regionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
            
            // 在4种状态下都显示停止按钮：autoCharge, manualCharge, autoDischarge, manualDischarge
            const shouldShowStop = regionStatus === 'autoCharge' || regionStatus === 'manualCharge' || 
                                  regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge';
            
            if (shouldShowStop) {
                mainPriceCircle.classList.add('manual-operation');
            } else {
                mainPriceCircle.classList.remove('manual-operation');
            }
        }


        // 初始化SOC滑动条位置
        function initSOCSliders() {
            // 初始化充电停止SOC进度条
            const chargeSOCSlider = document.getElementById('chargeSOCSlider');
            const chargeProgressBar = document.getElementById('chargeSOCProgressBar');
            const chargeProgressDot = document.getElementById('chargeSOCProgressDot');
            const chargeInput = document.getElementById('chargeStopSOCInput');
            if (chargeSOCSlider && chargeProgressBar && chargeProgressDot && chargeInput) {
                // 设置初始进度条宽度
                chargeProgressBar.style.width = chargeSOCSlider.value + '%';
                // 设置初始圆点位置
                chargeProgressDot.style.left = chargeSOCSlider.value + '%';
                // 设置初始输入框值
                chargeInput.value = chargeSOCSlider.value;
            }
            
            // 初始化放电停止SOC进度条
            const dischargeSOCSlider = document.getElementById('dischargeSOCSlider');
            const dischargeProgressBar = document.getElementById('dischargeSOCProgressBar');
            const dischargeProgressDot = document.getElementById('dischargeSOCProgressDot');
            const dischargeInput = document.getElementById('dischargeStopSOCInput');
            if (dischargeSOCSlider && dischargeProgressBar && dischargeProgressDot && dischargeInput) {
                // 设置初始进度条位置 (从滑块位置到100%)
                dischargeProgressBar.style.left = dischargeSOCSlider.value + '%';
                dischargeProgressBar.style.width = (100 - dischargeSOCSlider.value) + '%';
                // 设置初始圆点位置
                dischargeProgressDot.style.left = dischargeSOCSlider.value + '%';
                // 设置初始输入框值
                dischargeInput.value = dischargeSOCSlider.value;
            }
        }

        // 更新充电停止SOC进度条
        function updateChargeSOC(socValue, skipConfirmation = false) {
            // 检查当前地区是否有运行状态
            const regionStatus = getRegionOperationStatus(selectedMainRegion);
            const hasRunningStatus = regionStatus === 'charging' || regionStatus === 'discharging';
            
            if (hasRunningStatus && !skipConfirmation) {
                // 有运行状态，显示确认弹窗
                showSOCChangeConfirmation('charge', socValue);
                return;
            }
            
            const progressBar = document.getElementById('chargeSOCProgressBar');
            const progressDot = document.getElementById('chargeSOCProgressDot');
            const socInput = document.getElementById('chargeStopSOCInput');
            const socDisplay = document.getElementById('chargeStopSOCDisplay');
            const socSlider = document.getElementById('chargeSOCSlider');
            
            if (progressBar && progressDot && socInput && socSlider) {
                // 更新进度条宽度
                progressBar.style.width = socValue + '%';
                
                // 更新圆点位置
                progressDot.style.left = socValue + '%';
                
                // 更新输入框值
                socInput.value = socValue;
                
                // 更新显示值
                if (socDisplay) {
                    socDisplay.textContent = socValue;
                }
                
                // 更新滑动条值
                socSlider.value = socValue;
                
                // 更新autoSettings中的值
                if (window.autoSettings) {
                    window.autoSettings.charge.stopSOC = parseInt(socValue);
                }
            }
            
        }

        // 从输入框更新充电停止SOC
        function updateChargeSOCFromInput(socValue) {
            // 限制在0-100范围内
            const validValue = Math.max(0, Math.min(100, parseInt(socValue) || 0));
            
            // 如果输入值无效，重置为有效值
            const socInput = document.getElementById('chargeStopSOCInput');
            if (socInput) {
                socInput.value = validValue;
            }
            
            // 更新进度条
            updateChargeSOC(validValue);
        }

        // 更新放电停止SOC进度条
        function updateDischargeSOC(socValue, skipConfirmation = false) {
            // 检查当前地区是否有运行状态
            const regionStatus = getRegionOperationStatus(selectedMainRegion);
            const hasRunningStatus = regionStatus === 'charging' || regionStatus === 'discharging';
            
            if (hasRunningStatus && !skipConfirmation) {
                // 有运行状态，显示确认弹窗
                showSOCChangeConfirmation('discharge', socValue);
                return;
            }
            
            const progressBar = document.getElementById('dischargeSOCProgressBar');
            const progressDot = document.getElementById('dischargeSOCProgressDot');
            const socInput = document.getElementById('dischargeStopSOCInput');
            const socDisplay = document.getElementById('dischargeStopSOCDisplay');
            const socSlider = document.getElementById('dischargeSOCSlider');
            
            if (progressBar && progressDot && socInput && socSlider) {
                // 进度条从 socValue 填充到 100%
                progressBar.style.left = socValue + '%';
                progressBar.style.width = (100 - socValue) + '%';
                
                // 更新圆点位置
                progressDot.style.left = socValue + '%';
                
                // 更新输入框值
                socInput.value = socValue;
                
                // 更新显示值
                if (socDisplay) {
                    socDisplay.textContent = socValue;
                }
                
                // 更新滑动条值
                socSlider.value = socValue;
                
                // 更新autoSettings中的值
                if (window.autoSettings) {
                    window.autoSettings.discharge.stopSOC = parseInt(socValue);
                }
            }
            
        }

        // 从输入框更新放电停止SOC
        function updateDischargeSOCFromInput(socValue) {
            // 限制在0-100范围内
            const validValue = Math.max(0, Math.min(100, parseInt(socValue) || 0));
            
            // 如果输入值无效，重置为有效值
            const socInput = document.getElementById('dischargeStopSOCInput');
            if (socInput) {
                socInput.value = validValue;
            }
            
            // 更新进度条
            updateDischargeSOC(validValue);
        }

        // Modal中充电SOC更新函数
        function updateModalChargeSOC(socValue) {
            const validValue = Math.max(0, Math.min(100, parseInt(socValue) || 0));
            
            // 更新输入框
            const socInput = document.getElementById('modalChargeStopSOC');
            const socInputAlt = document.getElementById('modalChargeSOCInput');
            if (socInput && parseInt(socInput.value) !== validValue) {
                socInput.value = validValue;
            }
            if (socInputAlt && parseInt(socInputAlt.value) !== validValue) {
                socInputAlt.value = validValue;
            }
            
            // 更新滑块
            const socSlider = document.getElementById('modalChargeSOCSlider');
            if (socSlider && parseInt(socSlider.value) !== validValue) {
                socSlider.value = validValue;
            }
            
            // 更新进度条
            const progressBar = document.getElementById('modalChargeSOCBar');
            if (progressBar) {
                progressBar.style.width = validValue + '%';
            } else {
                console.error('modalChargeSOCBar element not found!');
            }
            
            // 更新滑块位置
            const dot = document.getElementById('modalChargeSOCDot');
            const thumb = document.getElementById('modalChargeSOCThumb');
            if (dot) {
                dot.style.left = validValue + '%';
            } else {
                console.error('modalChargeSOCDot element not found!');
            }
            if (thumb) {
                thumb.style.left = validValue + '%';
            }
            
            // 同步更新主页面显示
            updateMainPageChargeSOC(validValue);
        }

        // Modal中放电SOC更新函数
        function updateModalDischargeSOC(socValue) {
            const validValue = Math.max(0, Math.min(100, parseInt(socValue) || 0));
            
            // 更新输入框
            const socInput = document.getElementById('modalDischargeStopSOC');
            const socInputAlt = document.getElementById('modalDischargeSOCInput');
            if (socInput && parseInt(socInput.value) !== validValue) {
                socInput.value = validValue;
            }
            if (socInputAlt && parseInt(socInputAlt.value) !== validValue) {
                socInputAlt.value = validValue;
            }
            
            // 更新滑块
            const socSlider = document.getElementById('modalDischargeSOCSlider');
            if (socSlider && parseInt(socSlider.value) !== validValue) {
                socSlider.value = validValue;
            }
            
            // 更新进度条 (放电从数值位置填充到100%)
            const progressBar = document.getElementById('modalDischargeSOCProgressBar');
            const progressBarAlt = document.getElementById('modalDischargeSOCBar');
            if (progressBar) {
                progressBar.style.left = validValue + '%';
                progressBar.style.width = (100 - validValue) + '%';
            } else {
                console.error('modalDischargeSOCProgressBar element not found!');
            }
            if (progressBarAlt) {
                progressBarAlt.style.left = validValue + '%';
                progressBarAlt.style.width = (100 - validValue) + '%';
            }
            
            // 更新滑块位置
            const dot = document.getElementById('modalDischargeSOCDot');
            const thumb = document.getElementById('modalDischargeSOCThumb');
            if (dot) {
                dot.style.left = validValue + '%';
            } else {
                console.error('modalDischargeSOCDot element not found!');
            }
            if (thumb) {
                thumb.style.left = validValue + '%';
            }
            
            // 同步更新主页面显示
            updateMainPageDischargeSOC(validValue);
        }

        // 同步更新主页面充电SOC显示
        function updateMainPageChargeSOC(socValue) {
            const valueDisplay = document.getElementById('chargeStopSOCValue');
            if (valueDisplay) {
                valueDisplay.textContent = socValue + '%';
            }
            
            const progressBar = document.getElementById('chargeSOCProgressBar');
            if (progressBar) {
                progressBar.style.width = socValue + '%';
            }
        }

        // 同步更新主页面放电SOC显示
        function updateMainPageDischargeSOC(socValue) {
            const valueDisplay = document.getElementById('dischargeStopSOCValue');
            if (valueDisplay) {
                valueDisplay.textContent = socValue + '%';
            }
            
            const progressBar = document.getElementById('dischargeSOCProgressBar');
            if (progressBar) {
                progressBar.style.left = socValue + '%';
                progressBar.style.width = (100 - socValue) + '%';
            }
        }

        // 同步主页面SOC值到Modal
        function syncSOCToModal() {
            // 获取主页面的SOC值
            const chargeValue = document.getElementById('chargeStopSOCValue');
            const dischargeValue = document.getElementById('dischargeStopSOCValue');
            
            if (chargeValue) {
                const chargeSOC = parseInt(chargeValue.textContent) || 90;
                updateModalChargeSOC(chargeSOC);
            }
            
            if (dischargeValue) {
                const dischargeSOC = parseInt(dischargeValue.textContent) || 20;
                updateModalDischargeSOC(dischargeSOC);
            }
        }

        // 点击充电SOC进度条设置值
        function handleChargeSOCClick(event) {
            const container = document.getElementById('chargeSOCProgressContainer');
            const rect = container.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const percentage = Math.round((clickX / rect.width) * 100);
            
            // 限制在0-100范围内
            const socValue = Math.max(0, Math.min(100, percentage));
            
            // 更新SOC值
            updateChargeSOC(socValue);
        }

        // 点击放电SOC进度条设置值
        function handleDischargeSOCClick(event) {
            const container = document.getElementById('dischargeSOCProgressContainer');
            const rect = container.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const percentage = Math.round((clickX / rect.width) * 100);
            
            // 限制在0-100范围内
            const socValue = Math.max(0, Math.min(100, percentage));
            
            // 更新SOC值
            updateDischargeSOC(socValue);
        }

        // 验证SOC输入
        function validateSOCInput(input, type) {
            const value = parseInt(input.value);
            if (isNaN(value) || value < 0 || value > 100) {
                // 恢复到之前的有效值
                if (type === 'charge') {
                    input.value = document.getElementById('chargeSOCSlider').value;
                } else {
                    input.value = document.getElementById('dischargeSOCSlider').value;
                }
                return;
            }
            
            // 更新相应的SOC值
            if (type === 'charge') {
                updateChargeSOC(value);
            } else {
                updateDischargeSOC(value);
            }
        }

        // 显示SOC变更确认弹窗
        function showSOCChangeConfirmation(type, newValue) {
            const regionStatus = getRegionOperationStatus(selectedMainRegion);
            const statusText = regionStatus === 'charging' ? 
                (window.i18n ? window.i18n.getText('charging') : '充电中') : 
                (window.i18n ? window.i18n.getText('discharging') : '放电中');
            
            const socTypeText = type === 'charge' ? 
                (window.i18n ? window.i18n.getText('chargeStopSOC') : '充电停止SOC') : 
                (window.i18n ? window.i18n.getText('dischargeStopSOC') : '放电停止SOC');
            
            const message = window.i18n?.getText('socChangeConfirmMessage') || 
                `当前地区正在${statusText}，是否立即应用${socTypeText}更改为${newValue}%？`;
            
            // 创建确认弹窗
            const modal = document.createElement('div');
            modal.id = 'socChangeConfirmModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2147483647;
                backdrop-filter: blur(15px) saturate(1.5);
            `;
            
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: rgba(20, 20, 30, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(20px);
                color: #fff;
            `;
            
            dialog.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px; color: ${type === 'charge' ? '#00ff88' : '#ffc107'};">
                        ${window.i18n?.getText('confirmSOCChange') || 'SOC设置确认'}
                    </div>
                    <div style="font-size: 14px; line-height: 1.5; color: rgba(255, 255, 255, 0.8);">
                        ${message}
                    </div>
                </div>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="socChangeApplyNow" style="
                        background: linear-gradient(135deg, ${type === 'charge' ? '#00ff88, #00cc6a' : '#ffc107, #ff9800'});
                        color: #000;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 10px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s;
                    ">
                        ${window.i18n?.getText('applyNow') || '立即应用'}
                    </button>
                    <button id="socChangeApplyNext" style="
                        background: rgba(255, 255, 255, 0.08);
                        color: rgba(255, 255, 255, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        padding: 10px 20px;
                        border-radius: 10px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s;
                    ">
                        ${window.i18n?.getText('applyNext') || '下次应用'}
                    </button>
                    <button id="socChangeCancel" style="
                        background: rgba(255, 255, 255, 0.05);
                        color: rgba(255, 255, 255, 0.6);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 10px 20px;
                        border-radius: 10px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s;
                    ">
                        ${window.i18n?.getText('cancel') || '取消'}
                    </button>
                </div>
            `;
            
            modal.appendChild(dialog);
            document.body.appendChild(modal);
            
            // 绑定事件
            document.getElementById('socChangeApplyNow').onclick = () => {
                // 立即应用
                if (type === 'charge') {
                    updateChargeSOC(newValue, true);
                } else {
                    updateDischargeSOC(newValue, true);
                }
                closeSocChangeModal();
            };
            
            document.getElementById('socChangeApplyNext').onclick = () => {
                // 下次应用 - 保存设置但不立即更新显示
                if (window.autoSettings) {
                    if (type === 'charge') {
                        window.autoSettings.charge.stopSOC = parseInt(newValue);
                    } else {
                        window.autoSettings.discharge.stopSOC = parseInt(newValue);
                    }
                }
                closeSocChangeModal();
            };
            
            document.getElementById('socChangeCancel').onclick = () => {
                // 取消 - 恢复原值
                if (type === 'charge') {
                    const slider = document.getElementById('chargeSOCSlider');
                    const input = document.getElementById('chargeStopSOCInput');
                    if (slider && input) {
                        input.value = slider.value;
                    }
                } else {
                    const slider = document.getElementById('dischargeSOCSlider');
                    const input = document.getElementById('dischargeStopSOCInput');
                    if (slider && input) {
                        input.value = slider.value;
                    }
                }
                closeSocChangeModal();
            };
            
            // 点击背景关闭
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.getElementById('socChangeCancel').click();
                }
            };
        }

        // 关闭SOC变更确认弹窗
        function closeSocChangeModal() {
            const modal = document.getElementById('socChangeConfirmModal');
            if (modal) {
                modal.remove();
            }
        }

        // 地区条件总览卡片功能
        let regionOverviewCardMinimized = false;

        // 切换地区条件总览卡片展开/缩小状态
        function toggleRegionOverviewCardExpansion() {
            const card = document.getElementById('regionOverviewCard');
            if (!card) return;

            regionOverviewCardMinimized = !regionOverviewCardMinimized;
            
            if (regionOverviewCardMinimized) {
                card.classList.add('minimized');
            } else {
                card.classList.remove('minimized');
            }
        }
        
        // 关闭地区条件总览卡片
        function closeRegionOverviewCard() {
            const card = document.getElementById('regionOverviewCard');
            const autoBtn = document.getElementById('autoConditionBtn');
            
            if (card) {
                card.style.display = 'none';
                // 确保不是缩小状态
                card.classList.remove('minimized');
                regionOverviewCardMinimized = false;
                
                // 恢复按钮为未选中状态
                if (autoBtn) {
                    autoBtn.style.background = 'rgba(255, 255, 255, 0.08)';
                    autoBtn.style.color = 'rgba(255, 255, 255, 0.8)';
                    autoBtn.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                    autoBtn.style.boxShadow = 'none';
                    autoBtn.style.fontWeight = '600';
                    autoBtn.style.transform = 'scale(1)';
                    autoBtn.classList.remove('selected');
                }
            }
        }

        // 初始化地区条件总览卡片
        function initRegionOverviewCard() {
            const card = document.getElementById('regionOverviewCard');
            if (!card) return;

            // 使卡片可拖拽
            makeRegionOverviewCardDraggable(card);
            
            // 初始化内容
            updateRegionOverviewContent();
            
            // 监听地区变化
            if (typeof selectedMainRegion !== 'undefined') {
                // 当地区变化时更新内容
                const originalSwitchRegion = window.switchMainRegion;
                if (originalSwitchRegion) {
                    window.switchMainRegion = function(region) {
                        originalSwitchRegion(region);
                        setTimeout(updateRegionOverviewContent, 100);
                    };
                }
            }
        }

        // 使地区条件总览卡片可拖拽
        function makeRegionOverviewCardDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            
            element.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                
                // 如果点击的是按钮，不启动拖拽
                const target = e.target;
                if (target.tagName === 'BUTTON' || target.closest('button')) {
                    return;
                }
                
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
                element.style.cursor = 'grabbing';
                element.style.transition = 'none';
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;
                
                // 边界检测
                const rect = element.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                
                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));
                
                element.style.top = newTop + "px";
                element.style.left = newLeft + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
                element.style.cursor = 'move';
                element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            }
        }

        // 更新地区条件总览内容
        function updateRegionOverviewContent() {
            const body = document.getElementById('regionOverviewBody');
            if (!body) return;


            // 模拟地区数据
            const regions = [
                {
                    name: 'NSW',
                    status: getRegionOperationStatus('NSW'),
                    chargeCondition: {
                        timeCondition: '08:00-09:00',
                        priceCondition: '< 60$',
                        stopSOC: '70%'
                    },
                    dischargeCondition: {
                        timeCondition: '18:00-20:00', 
                        priceCondition: '> 100$',
                        stopSOC: '20%'
                    }
                },
                {
                    name: 'VIC',
                    status: getRegionOperationStatus('VIC'),
                    chargeCondition: {
                        timeCondition: '07:30-08:30',
                        priceCondition: '< 55$',
                        stopSOC: '80%'
                    },
                    dischargeCondition: {
                        timeCondition: '17:00-19:00',
                        priceCondition: '> 90$', 
                        stopSOC: '25%'
                    }
                },
                {
                    name: 'QLD', 
                    status: getRegionOperationStatus('QLD'),
                    chargeCondition: {
                        timeCondition: '09:00-10:00',
                        priceCondition: '< 50$',
                        stopSOC: '75%'
                    },
                    dischargeCondition: {
                        timeCondition: '16:00-18:00',
                        priceCondition: '> 110$',
                        stopSOC: '15%'
                    }
                },
                {
                    name: 'SA',
                    status: getRegionOperationStatus('SA'), 
                    chargeCondition: {
                        timeCondition: '08:15-09:15',
                        priceCondition: '< 65$',
                        stopSOC: '85%'
                    },
                    dischargeCondition: {
                        timeCondition: '17:30-19:30',
                        priceCondition: '> 95$',
                        stopSOC: '30%'
                    }
                },
                {
                    name: 'TAS',
                    status: getRegionOperationStatus('TAS'),
                    chargeCondition: {
                        timeCondition: '07:00-08:00', 
                        priceCondition: '< 45$',
                        stopSOC: '90%'
                    },
                    dischargeCondition: {
                        timeCondition: '18:30-20:30',
                        priceCondition: '> 85$',
                        stopSOC: '10%'
                    }
                }
            ];

            // 生成表格HTML
            const tableHTML = `
                <table class="region-comparison-table">
                    <thead>
                        <tr>
                            <th style="width: 100px;" data-i18n="region">地区</th>
                            <th class="table-header-charge" colspan="3" data-i18n="chargeCondition">充电条件</th>
                            <th class="table-header-discharge" colspan="3" data-i18n="dischargeCondition">放电条件</th>
                        </tr>
                        <tr>
                            <th></th>
                            <th class="table-header-charge" data-i18n="timeCondition">时间</th>
                            <th class="table-header-charge" data-i18n="priceCondition">价格</th>
                            <th class="table-header-charge" data-i18n="stopSOC">停止SOC</th>
                            <th class="table-header-discharge" data-i18n="timeCondition">时间</th>
                            <th class="table-header-discharge" data-i18n="priceCondition">价格</th>
                            <th class="table-header-discharge" data-i18n="stopSOC">停止SOC</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${regions.map(region => {
                            // 将 'none' 状态映射为 'idle'
                            const mappedStatus = region.status === 'none' ? 'idle' : region.status;
                            const statusClass = mappedStatus === 'charging' ? 'charging' : 
                                              mappedStatus === 'discharging' ? 'discharging' : 'idle';
                            
                            return `
                                <tr>
                                    <td>
                                        <div class="region-name-cell">
                                            <span>${region.name}</span>
                                            <div class="region-status-indicator ${statusClass}"></div>
                                        </div>
                                    </td>
                                    <td class="condition-cell">
                                        <span class="condition-value">${region.chargeCondition.timeCondition}</span>
                                    </td>
                                    <td class="condition-cell">
                                        <span class="condition-value">${region.chargeCondition.priceCondition}</span>
                                    </td>
                                    <td class="condition-cell">
                                        <span class="condition-value">${region.chargeCondition.stopSOC}</span>
                                    </td>
                                    <td class="condition-cell">
                                        <span class="condition-value">${region.dischargeCondition.timeCondition}</span>
                                    </td>
                                    <td class="condition-cell">
                                        <span class="condition-value">${region.dischargeCondition.priceCondition}</span>
                                    </td>
                                    <td class="condition-cell">
                                        <span class="condition-value">${region.dischargeCondition.stopSOC}</span>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            body.innerHTML = tableHTML;

            // 应用i18n翻译
            if (window.i18n && window.i18n.isReady) {
                window.i18n.updatePageTexts();
            }
        }

        // 切换地区折叠项
        function toggleRegionAccordion(regionName) {
            const item = document.querySelector(`.region-accordion-item[data-region="${regionName}"]`);
            if (!item) return;
            
            item.classList.toggle('expanded');
            
            // 如果需要，可以关闭其他展开的项
            // document.querySelectorAll('.region-accordion-item').forEach(otherItem => {
            //     if (otherItem !== item) {
            //         otherItem.classList.remove('expanded');
            //     }
            // });
        }

        // 编辑充电停止SOC
        function editChargeStopSOC() {
            const display = document.getElementById('chargeStopSOCDisplay');
            const input = document.getElementById('chargeStopSOCInput');
            if (display && input) {
                display.style.display = 'none';
                input.style.display = 'block';
                input.focus();
                input.select();
            }
        }

        // 隐藏充电SOC输入框
        function hideChargeSOCInput() {
            const display = document.getElementById('chargeStopSOCDisplay');
            const input = document.getElementById('chargeStopSOCInput');
            if (display && input) {
                display.style.display = 'inline';
                input.style.display = 'none';
                // 更新显示的值
                display.textContent = input.value;
            }
        }

        // 编辑放电停止SOC
        function editDischargeStopSOC() {
            const display = document.getElementById('dischargeStopSOCDisplay');
            const input = document.getElementById('dischargeStopSOCInput');
            if (display && input) {
                display.style.display = 'none';
                input.style.display = 'block';
                input.focus();
                input.select();
            }
        }

        // 隐藏放电SOC输入框
        function hideDischargeSOCInput() {
            const display = document.getElementById('dischargeStopSOCDisplay');
            const input = document.getElementById('dischargeStopSOCInput');
            if (display && input) {
                display.style.display = 'inline';
                input.style.display = 'none';
                // 更新显示的值
                display.textContent = input.value;
            }
        }
        
        // 显示SOC编辑蒙版
        function showSOCEditOverlay() {
            const overlay = document.getElementById('socEditOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
            }
        }
        
        // 隐藏SOC编辑蒙版
        function hideSOCEditOverlay() {
            const overlay = document.getElementById('socEditOverlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        }
        
        // 打开SOC编辑弹窗
        function openSOCEditModal() {
            const modal = document.getElementById('socEditModal');
            if (!modal) return;
            
            // 获取当前值
            const chargeDisplay = document.getElementById('chargeStopSOCDisplay');
            const dischargeDisplay = document.getElementById('dischargeStopSOCDisplay');
            const currentCharge = chargeDisplay ? parseInt(chargeDisplay.textContent) : 90;
            const currentDischarge = dischargeDisplay ? parseInt(dischargeDisplay.textContent) : 20;
            
            // 设置弹窗初始值
            const chargeSlider = document.getElementById('modalChargeSOCSlider');
            const chargeInput = document.getElementById('modalChargeSOCInput');
            const dischargeSlider = document.getElementById('modalDischargeSOCSlider');
            const dischargeInput = document.getElementById('modalDischargeSOCInput');
            
            if (chargeSlider) chargeSlider.value = currentCharge;
            if (chargeInput) chargeInput.value = currentCharge;
            if (dischargeSlider) dischargeSlider.value = currentDischarge;
            if (dischargeInput) dischargeInput.value = currentDischarge;
            
            // 更新进度条
            updateModalChargeSOC(currentCharge);
            updateModalDischargeSOC(currentDischarge);
            
            // 显示弹窗
            modal.style.display = 'flex';
            
            // 更新i18n
            if (window.i18n && window.i18n.updatePageTexts) {
                setTimeout(() => {
                    window.i18n.updatePageTexts();
                }, 50);
            }
        }
        
        // 关闭SOC编辑弹窗
        function closeSOCEditModal() {
            const modal = document.getElementById('socEditModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }
        
        // 更新弹窗中的充电SOC
        function updateModalChargeSOCFromInput(value) {
            const validValue = Math.max(0, Math.min(100, parseInt(value) || 0));
            const input = document.getElementById('modalChargeSOCInput');
            if (input) input.value = validValue;
            updateModalChargeSOC(validValue);
        }
        
        
        function updateModalDischargeSOCFromInput(value) {
            const validValue = Math.max(0, Math.min(100, parseInt(value) || 0));
            const input = document.getElementById('modalDischargeSOCInput');
            if (input) input.value = validValue;
            updateModalDischargeSOC(validValue);
        }
        
        // 保存SOC设置
        function saveSOCSettings() {
            // 获取新值
            const chargeSOC = document.getElementById('modalChargeSOCInput').value;
            const dischargeSOC = document.getElementById('modalDischargeSOCInput').value;
            
            // 更新主页面显示
            const chargeDisplay = document.getElementById('chargeStopSOCDisplay');
            const dischargeDisplay = document.getElementById('dischargeStopSOCDisplay');
            const chargeProgressBar = document.getElementById('chargeSOCProgressBar');
            const dischargeProgressBar = document.getElementById('dischargeSOCProgressBar');
            
            if (chargeDisplay) chargeDisplay.textContent = chargeSOC;
            if (dischargeDisplay) dischargeDisplay.textContent = dischargeSOC;
            if (chargeProgressBar) chargeProgressBar.style.width = chargeSOC + '%';
            if (dischargeProgressBar) {
                dischargeProgressBar.style.left = dischargeSOC + '%';
                dischargeProgressBar.style.width = (100 - dischargeSOC) + '%';
            }
            
            // 更新全局设置
            if (window.autoSettings) {
                window.autoSettings.charge.stopSOC = parseInt(chargeSOC);
                window.autoSettings.discharge.stopSOC = parseInt(dischargeSOC);
            }
            
            // 关闭弹窗
            closeSOCEditModal();
            
        }

        // 点击充电SOC进度条设置值
        function handleChargeSOCBarClick(event) {
            const progressContainer = event.currentTarget;
            const rect = progressContainer.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const containerWidth = rect.width;
            const percentage = Math.round((clickX / containerWidth) * 100);
            
            // 限制在0-100范围内
            const socValue = Math.max(0, Math.min(100, percentage));
            
            // 更新滑动条值
            const slider = document.getElementById('chargeSOCSlider');
            if (slider) {
                slider.value = socValue;
                updateChargeSOC(socValue);
            }
        }

        // 点击放电SOC进度条设置值
        function handleDischargeSOCBarClick(event) {
            const progressContainer = event.currentTarget;
            const rect = progressContainer.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const containerWidth = rect.width;
            const percentage = Math.round((clickX / containerWidth) * 100);
            
            // 限制在0-100范围内
            const socValue = Math.max(0, Math.min(100, percentage));
            
            // 更新滑动条值
            const slider = document.getElementById('dischargeSOCSlider');
            if (slider) {
                slider.value = socValue;
                updateDischargeSOC(socValue);
            }
        }

        // 更新充电/放电按钮的显示状态
        function updateActionButtonsVisibility() {
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            const priceDisplay = document.getElementById('priceDisplay');
            const stopDisplay = document.getElementById('stopDisplay');

            if (!chargeBtn || !dischargeBtn) return;

            // 使用 regionData 获取更准确的状态
            const regionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';

            // 检查是否有操作正在进行
            const shouldHideButtons = regionStatus === 'autoCharge' || regionStatus === 'manualCharge' ||
                                     regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge';
            
            if (shouldHideButtons) {
                // 操作进行中，隐藏充放电按钮
                chargeBtn.style.display = 'none';
                dischargeBtn.style.display = 'none';
            } else {
                // 没有操作进行中，根据模式显示按钮
                if (currentOperationMode === 'auto') {
                    // 自动模式下隐藏按钮
                    chargeBtn.style.display = 'none';
                    dischargeBtn.style.display = 'none';
                } else {
                    // 手动模式下显示按钮
                    chargeBtn.style.display = 'flex';
                    dischargeBtn.style.display = 'flex';
                    chargeBtn.disabled = false;
                    dischargeBtn.disabled = false;
                    chargeBtn.style.opacity = '1';
                    dischargeBtn.style.opacity = '1';
                    chargeBtn.style.cursor = 'pointer';
                    dischargeBtn.style.cursor = 'pointer';
                }

                // 显示价格文字
                if (priceDisplay) priceDisplay.style.display = 'block';
                if (stopDisplay) {
                    stopDisplay.style.display = 'none';
                    stopDisplay.style.opacity = '0';
                }

                // 更新大圆显示状态
                updateCircleStatusDisplay();
            }
        }

        // 计算当前价格在今日低高价格中的占比并更新水波高度
        function updateWaterWaveLevel() {
            const currentPriceElement = document.getElementById('currentPrice');
            const todayLowElement = document.getElementById('todayLow');
            const todayHighElement = document.getElementById('todayHigh');
            const pricePercentageElement = document.getElementById('pricePercentage');
            const waterWave = document.getElementById('waterWave');
            
            if (!currentPriceElement || !todayLowElement || !todayHighElement || !pricePercentageElement || !waterWave) {
                return;
            }
            
            // 提取价格数值
            const currentPrice = parseFloat(currentPriceElement.textContent.replace('$', '').replace(/[^0-9.-]/g, '')) || 0;
            const todayLow = parseFloat(todayLowElement.textContent.replace('$', '').replace(/[^0-9.-]/g, '')) || 0;
            const todayHigh = parseFloat(todayHighElement.textContent.replace('$', '').replace(/[^0-9.-]/g, '')) || 0;
            
            
            // 计算价格占比 (0-100%)
            let percentage = 0;
            if (todayHigh > todayLow) {
                percentage = ((currentPrice - todayLow) / (todayHigh - todayLow)) * 100;
                percentage = Math.max(0, Math.min(100, percentage)); // 限制在0-100%范围内
            }
            
            // 更新百分比显示
            pricePercentageElement.textContent = `${Math.round(percentage)}%`;
            
            // 更新水位容器高度，而不是水波高度
            const waterLevelContainer = document.getElementById('waterLevelContainer');
            if (waterLevelContainer) {
                // 直接使用价格占比作为水位高度
                waterLevelContainer.style.height = '100%';
            }
        }

        function stopOperation() {
            // Stop animation
            if (mapAnimationInterval) {
                clearInterval(mapAnimationInterval);
            }
            
            // 清除备用定时器
            if (window.operationFallbackTimer) {
                clearTimeout(window.operationFallbackTimer);
                window.operationFallbackTimer = null;
            }
            
            // 保存停止前的操作类型，用于显示统计
            window.lastStoppedOperation = currentOperation;
            
            // 重置当前操作状态
            currentOperation = null;
            
            // 更新地区状态 - 移除当前地区的充放电标记
            updateRegionOperationStatus(selectedMainRegion, 'none');
            
            // 重置regionData中的状态
            if (regionData[selectedMainRegion]) {
                const currentStatus = regionData[selectedMainRegion].status;
                // 如果是自动模式操作，停止后变为等待执行中
                if (currentStatus === 'autoCharge' || currentStatus === 'autoDischarge') {
                    regionData[selectedMainRegion].status = 'waitingExecution';
                    updatePowerStationStatus(selectedMainRegion, 'waitingExecution');
                    
                    // 更新地区选择器状态
                    setTimeout(() => {
                        const selectedRegionTab = document.querySelector('.region-select-tab.active');
                        if (selectedRegionTab) {
                            const statusBadge = selectedRegionTab.querySelector('.region-status-badge');
                            if (statusBadge) {
                                statusBadge.setAttribute('data-status', 'waitingExecution');
                                statusBadge.textContent = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
                            }
                        }
                    }, 100);
                } else {
                    // 手动模式操作，停止后变为none
                    regionData[selectedMainRegion].status = 'none';
                    updatePowerStationStatus(selectedMainRegion, 'none');
                }
            }
            
            // 更新地区状态指示器
            updateRegionStatusIndicators();
            
            // 更新地区状态显示
            updateRegionStatusDisplay();
            
            // 立即更新价格圆圈颜色
            updatePriceCircleColor();
            
            // 添加延迟确保圆圈颜色更新
            setTimeout(() => {
                updatePriceCircleColor();
            }, 100);
            
            // 恢复充放电按钮
            updateActionButtonsToChargeDis();
            
            // 切换到行情面板
            switchPanel('market');
            
            // Show operation completion modal with device response statistics
            setTimeout(() => {
                showOperationStatistics();
            }, 500);
            
            // Start gradual device reset animation
            startDeviceResetAnimation();
            
            // Update UI to initial state
            safeSetText('successfulDevices', '0');
            safeSetText('executingDevices', '0');
            safeSetText('failedDevices', '0');
            safeSetText('totalDevices', '500');
            
            // Reset buttons to original state
            resetButtons();
            
            // Don't reset currentOperation immediately - keep it for the modal
            // It will be reset when the modal is closed
            
            // Update map to show initial device distribution
            updateMapStatistics();
        }

        function startDeviceResetAnimation() {
            
            let resetStep = 0;
            const maxResetSteps = 50; // Reset animation over 50 steps
            const devicesPerStep = Math.ceil(deviceLocations.length / maxResetSteps);
            
            const resetInterval = setInterval(() => {
                if (resetStep >= maxResetSteps) {
                    clearInterval(resetInterval);
                    activatedDevices = 0;
                    return;
                }
                
                // Reset a batch of devices each step
                const startIndex = resetStep * devicesPerStep;
                const endIndex = Math.min(startIndex + devicesPerStep, deviceLocations.length);
                
                for (let i = startIndex; i < endIndex; i++) {
                    const device = deviceLocations[i];
                    // Gradually change to initial status distribution based on region state
                    const rand = Math.random();

                    // 获取设备所在地区的状态
                    const regionStatus = regionData[device.region] ? regionData[device.region].status : 'none';

                    // 根据地区状态决定设备状态
                    if (regionStatus === 'waitingExecution' || regionStatus === 'none') {
                        // 等待执行中或无状态：设备不显示（所有状态为0）
                        device.status = 'hidden';
                    } else {
                        // 有操作状态的地区：正常分配状态
                        if (rand < 0.05) {
                            device.status = 'offline';  // 5% offline
                        } else if (rand < 0.12 && (regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge')) {
                            device.status = 'discharging';  // 7% discharging (仅在放电地区)
                        } else if (rand < 0.18 && (regionStatus === 'autoCharge' || regionStatus === 'manualCharge')) {
                            device.status = 'charging';  // 6% charging (仅在充电地区)
                        } else {
                            device.status = 'inactive';  // 其余为inactive
                        }
                    }
                }
                
                // Update map display
                updateMapWithDeviceStates();
                
                resetStep++;
            }, 100); // Update every 100ms for smooth animation
        }

        function resetDevicesToInitialState() {
            // Reset all devices to their original initial status based on region state
            deviceLocations.forEach(device => {
                const rand = Math.random();

                // 获取设备所在地区的状态
                const regionStatus = regionData[device.region] ? regionData[device.region].status : 'none';

                // 根据地区状态决定设备状态
                if (regionStatus === 'waitingExecution' || regionStatus === 'none') {
                    // 等待执行中或无状态：设备不显示（所有状态为0）
                    device.status = 'hidden';
                } else {
                    // 有操作状态的地区：正常分配状态
                    if (rand < 0.05) {
                        device.status = 'offline';  // 5% offline
                    } else if (rand < 0.12 && (regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge')) {
                        device.status = 'discharging';  // 7% discharging (仅在放电地区)
                    } else if (rand < 0.18 && (regionStatus === 'autoCharge' || regionStatus === 'manualCharge')) {
                        device.status = 'charging';  // 6% charging (仅在充电地区)
                    } else {
                        device.status = 'inactive';  // 其余为inactive
                    }
                }
            });

            // Update the map with initial device states
            // Filter out hidden devices
            if (mapChart && deviceLocations.length) {
                const data = deviceLocations
                    .filter(device => device.status !== 'hidden')
                    .map(device => ({
                        value: device.value,
                        id: device.id,
                        status: device.status,
                        region: device.region,
                        city: device.city
                    }));
                
                mapChart.setOption({
                    series: [
                        {}, // Keep state centers unchanged
                        {
                            name: 'Devices',
                            type: 'scatter',
                            data: data,
                            symbolSize: function(value, params) {
                                const status = params.data.status;
                                if (status === 'charging' || status === 'discharging') {
                                    return 8;
                                } else if (status === 'offline') {
                                    return 3;
                                }
                                return 5;
                            },
                            itemStyle: {
                                color: function(params) {
                                    const status = params.data.status;
                                    switch (status) {
                                        case 'charging': 
                                            return '#00ff88';
                                        case 'discharging': 
                                            return '#FFD700';
                                        case 'offline': 
                                            return 'rgba(255, 255, 255, 0.2)';
                                        default: 
                                            return 'rgba(255, 255, 255, 0.5)';
                                    }
                                },
                                borderColor: 'rgba(255, 255, 255, 0.3)',
                                borderWidth: 1,
                                shadowBlur: function(params) {
                                    const status = params.data.status;
                                    return (status === 'charging' || status === 'discharging') ? 10 : 3;
                                },
                                shadowColor: function(params) {
                                    const status = params.data.status;
                                    switch (status) {
                                        case 'charging':
                                            return 'rgba(0, 255, 136, 0.8)';
                                        case 'discharging':
                                            return 'rgba(255, 215, 0, 0.8)';
                                        default:
                                            return 'rgba(255, 255, 255, 0.3)';
                                    }
                                }
                            },
                            animation: true,
                            animationDuration: 800,
                            animationEasing: 'cubicOut'
                        }
                    ]
                });
            }
        }

        function resetButtons() {
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            const actionButtons = document.querySelector('.action-buttons');
            
            if (actionButtons) {
                actionButtons.classList.remove('operating');
            }
            
            // Reset charge button
            if (chargeBtn) {
                chargeBtn.innerHTML = `<span data-i18n="charge">${window.i18n ? window.i18n.getText('charge') : '充电'}</span>`;
                chargeBtn.classList.remove('stop-btn');
                chargeBtn.classList.add('charge-btn');
                chargeBtn.style.display = 'flex';
                chargeBtn.style.removeProperty('background');
                chargeBtn.style.color = '#000'; // 确保文字颜色为黑色
                chargeBtn.onclick = handleCharge;
                chargeBtn.style.pointerEvents = 'auto';
                
                // 根据当前模式设置按钮状态
                if (currentOperationMode === 'auto') {
                    chargeBtn.style.display = 'none';
                } else {
                    chargeBtn.disabled = false;
                    chargeBtn.style.opacity = '1';
                    chargeBtn.style.cursor = 'pointer';
                }
                
            }
            
            // Reset discharge button
            if (dischargeBtn) {
                dischargeBtn.innerHTML = `<span data-i18n="discharge">${window.i18n ? window.i18n.getText('discharge') : '放电'}</span>`;
                dischargeBtn.classList.remove('stop-btn');
                dischargeBtn.classList.add('discharge-btn');
                dischargeBtn.style.display = 'flex';
                dischargeBtn.style.removeProperty('background');
                dischargeBtn.style.color = '#000'; // 确保文字颜色为黑色
                dischargeBtn.onclick = handleDischarge;
                dischargeBtn.style.pointerEvents = 'auto';
                
                // 根据当前模式设置按钮状态
                if (currentOperationMode === 'auto') {
                    dischargeBtn.style.display = 'none';
                } else {
                    dischargeBtn.disabled = false;
                    dischargeBtn.style.opacity = '1';
                    dischargeBtn.style.cursor = 'pointer';
                }
                
            }
            
            // 更新大圆显示状态
            updateCircleStatusDisplay();
        }

        // Update map statistics display (shows actual device status, not command status)
        function updateMapStatistics(activeCount = 0) {
            if (!deviceLocations || !mapChart) return;


            // 获取当前地区的数据
            const currentRegion = regionData[selectedMainRegion] || regionData['NSW'];
            const regionStatus = currentRegion.status;
            const successCount = currentRegion.deviceStats.success;


            // 初始化计数
            let counts = {
                charging: 0,
                discharging: 0,
                processing: 0,
                inactive: 0,
                offline: 0
            };

            // 根据地区状态和下发成功数量计算显示数字
            if (regionStatus === 'waitingExecution' || regionStatus === 'none') {
                // NSW等待执行中：全部为0
                counts = {
                    charging: 0,
                    discharging: 0,
                    processing: 0,
                    inactive: 0,
                    offline: 0
                };
            } else if (regionStatus === 'autoCharge' || regionStatus === 'manualCharge') {
                // 充电地区：充电中 + 待机 + 离线 = 下发成功数量，放电中 = 0
                const total = successCount;
                counts.charging = Math.floor(total * 0.2);      // 20% 充电中
                counts.inactive = Math.floor(total * 0.7);      // 70% 待机
                counts.offline = total - counts.charging - counts.inactive; // 剩余为离线
                counts.discharging = 0; // 充电地区无放电设备
            } else if (regionStatus === 'autoDischarge' || regionStatus === 'manualDischarge') {
                // 放电地区：放电中 + 待机 + 离线 = 下发成功数量，充电中 = 0
                const total = successCount;
                counts.discharging = Math.floor(total * 0.2);   // 20% 放电中
                counts.inactive = Math.floor(total * 0.7);      // 70% 待机
                counts.offline = total - counts.discharging - counts.inactive; // 剩余为离线
                counts.charging = 0; // 放电地区无充电设备
            }


            // Update statistics display without background box
            const statisticsGraphic = [
                {
                    type: 'group',
                    right: 20,
                    top: 20,
                    children: [
                        // Charging indicator
                        {
                            type: 'circle',
                            shape: { r: 5 },
                            style: { fill: '#00ff88' },
                            position: [-15, 6],
                            z: 101
                        },
                        {
                            type: 'text',
                            style: {
                                text: `${window.i18n ? window.i18n.getText('charging') : '充电中'}: ${counts.charging}`,
                                fill: '#00ff88',
                                fontSize: 12
                            },
                            position: [0, 0],
                            z: 101
                        },
                        // Discharging indicator
                        {
                            type: 'circle',
                            shape: { r: 5 },
                            style: { fill: '#FFD700' },
                            position: [-15, 26],
                            z: 101
                        },
                        {
                            type: 'text',
                            style: {
                                text: `${window.i18n ? window.i18n.getText('discharging') : '放电中'}: ${counts.discharging}`,
                                fill: '#FFD700',
                                fontSize: 12
                            },
                            position: [0, 20],
                            z: 101
                        },
                        // Standby indicator
                        {
                            type: 'circle',
                            shape: { r: 5 },
                            style: { fill: 'rgba(255, 255, 255, 0.8)' },
                            position: [-15, 46],
                            z: 101
                        },
                        {
                            type: 'text',
                            style: {
                                text: `${window.i18n ? window.i18n.getText('standby') : '待机'}: ${counts.inactive}`,
                                fill: 'rgba(255, 255, 255, 0.8)',
                                fontSize: 12
                            },
                            position: [0, 40],
                            z: 101
                        },
                        // Offline indicator
                        {
                            type: 'circle',
                            shape: { r: 5 },
                            style: { fill: '#ff6b6b' },
                            position: [-15, 66],
                            z: 101
                        },
                        {
                            type: 'text',
                            style: {
                                text: `${window.i18n ? window.i18n.getText('offline') : '离线'}: ${counts.offline}`,
                                fill: '#ff6b6b',
                                fontSize: 12
                            },
                            position: [0, 60],
                            z: 101
                        }
                    ]
                }
            ];

            // Update the chart with new statistics
            mapChart.setOption({
                graphic: statisticsGraphic
            });
        }

        function fullReset() {
            resetButtons();
            currentOperation = null;
        }

        // 新的操作统计显示函数
        function showOperationStatistics() {
            
            // 检查用户是否已经关闭了弹窗
            if (window.deviceResponseModalClosed) {
                return;
            }
            
            const modal = document.getElementById('deviceResponseModal');
            if (!modal) {
                console.error('Device response modal not found!');
                return;
            }
            
            // 设置操作类型和消息
            let operationName = '';
            let messageText = '';
            let isStopOperation = false;
            
            const lastOperation = currentOperation || 'stop'; // 如果currentOperation为null，说明是停止操作
            
            if (lastOperation === 'charge') {
                operationName = window.i18n ? window.i18n.getText('charge') : 'Charge';
                messageText = window.i18n ? window.i18n.getText('chargeCompleteMessage') : 'Charging command completed. Here is the device response statistics report:';
            } else if (lastOperation === 'discharge') {
                operationName = window.i18n ? window.i18n.getText('discharge') : 'Discharge';
                messageText = window.i18n ? window.i18n.getText('dischargeCompleteMessage') : 'Discharging command completed. Here is the device response statistics report:';
            } else {
                // 这是停止操作
                isStopOperation = true;
                const stoppedType = window.lastStoppedOperation;
                if (stoppedType === 'charge') {
                    operationName = window.i18n ? window.i18n.getText('stopCharge') || '停止充电' : 'Stop Charging';
                } else if (stoppedType === 'discharge') {
                    operationName = window.i18n ? window.i18n.getText('stopDischarge') || '停止放电' : 'Stop Discharging';
                } else {
                    operationName = window.i18n ? window.i18n.getText('stop') : 'Stop';
                }
                messageText = window.i18n ? window.i18n.getText('stopCompleteMessage') : 'Stop command completed. Here is the device response statistics report:';
            }
            
            // 更新模态框内容
            const operationTypeDisplay = document.getElementById('operationTypeDisplay');
            const operationCompleteMessage = document.getElementById('operationCompleteMessage');
            const targetDevicesDisplay = document.getElementById('targetDevicesDisplay');
            const responseModalIcon = document.getElementById('responseModalIcon');
            const modalIcon = document.getElementById('modalIcon');
            
            if (operationTypeDisplay) {
                operationTypeDisplay.textContent = operationName;
                // 根据操作类型设置颜色
                if (isStopOperation) {
                    // 停止操作使用红色
                    operationTypeDisplay.style.color = '#ff6b6b';
                    if (responseModalIcon) {
                        responseModalIcon.style.background = 'linear-gradient(145deg, rgba(255, 107, 107, 0.15), rgba(255, 107, 107, 0.05))';
                        responseModalIcon.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.15)';
                    }
                    if (modalIcon) modalIcon.textContent = '🛑';
                } else if (lastOperation === 'discharge') {
                    operationTypeDisplay.style.color = '#ffd700';
                    if (responseModalIcon) {
                        responseModalIcon.style.background = 'linear-gradient(145deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05))';
                        responseModalIcon.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.15)';
                    }
                    if (modalIcon) modalIcon.textContent = '🔋';
                } else {
                    operationTypeDisplay.style.color = '#00ff88';
                    if (responseModalIcon) {
                        responseModalIcon.style.background = 'linear-gradient(145deg, rgba(0, 255, 136, 0.15), rgba(0, 255, 136, 0.05))';
                        responseModalIcon.style.boxShadow = '0 4px 12px rgba(0, 255, 136, 0.15)';
                    }
                    if (modalIcon) modalIcon.textContent = '⚡';
                }
            }
            if (operationCompleteMessage) operationCompleteMessage.textContent = messageText;
            if (targetDevicesDisplay) {
                const unit = window.i18n && window.i18n.getCurrentLanguage() === 'en' ? '' : '个';
                targetDevicesDisplay.textContent = '500' + unit;
            }
            
            // 获取当前地区的设备统计数据
            const currentRegionData = regionData[selectedMainRegion] || regionData['NSW'];
            const deviceStats = currentRegionData.deviceStats;

            // 更新弹窗中的统计数字
            const modalSuccessCount = document.getElementById('modalSuccessCount');
            const modalExecutingCount = document.getElementById('modalExecutingCount');
            const modalFailedCount = document.getElementById('modalFailedCount');

            if (modalSuccessCount) modalSuccessCount.textContent = deviceStats.success || 450;
            if (modalExecutingCount) modalExecutingCount.textContent = deviceStats.executing || 0;
            if (modalFailedCount) modalFailedCount.textContent = deviceStats.failed || 50;
            
            // 显示模态框 - 使用flex居中
            modal.style.display = 'flex';
            
        }

        // 直接复制操作记录页面的抽屉组件
        class HomeOperationDrawer extends DrawerComponent {
            constructor() {
                super({
                    containerId: 'homeOperationDrawer',
                    title: window.i18n ? window.i18n.getText('operationDetails') : '操作记录详情',
                    width: '500px',
                    tabs: [
                        { key: 'basic', label: window.i18n ? window.i18n.getText('basicInfo') : '基本信息' },
                        { key: 'stations', label: window.i18n ? window.i18n.getText('stationDetails') : '电站详情' },
                        { key: 'timeline', label: window.i18n ? window.i18n.getText('executionTimeline') : '执行时间线' }
                    ],
                    onClose: () => {
                    },
                    onTabSwitch: (tabKey, data) => {
                        this.setContent(data, tabKey);
                    }
                });
                
                // 在创建后立即设置z-index
                this.forceTopZIndex();
            }
            
            forceTopZIndex() {
                // 使用定时器确保DOM已经创建
                const attempts = 0;
                const maxAttempts = 10;
                
                const setZIndex = () => {
                    const drawer = document.getElementById(this.containerId);
                    if (drawer) {
                        // 设置抽屉的z-index
                        drawer.style.setProperty('z-index', '2147483647', 'important');
                        drawer.style.setProperty('position', 'fixed', 'important');
                        
                        // 设置内部元素的z-index
                        const allElements = drawer.querySelectorAll('*');
                        allElements.forEach(el => {
                            el.style.setProperty('z-index', '2147483647', 'important');
                        });
                        
                        return true;
                    }
                    return false;
                };
                
                // 立即尝试一次
                if (!setZIndex() && attempts < maxAttempts) {
                    // 如果失败，使用定时器重试
                    const interval = setInterval(() => {
                        if (setZIndex() || attempts >= maxAttempts) {
                            clearInterval(interval);
                        }
                        attempts++;
                    }, 100);
                }
            }
            
            // 重写open方法确保z-index最高
            open(data = null) {
                super.open(data);
                
                // 多次确保z-index设置
                const ensureZIndex = () => {
                    const drawer = document.getElementById(this.containerId);
                    if (drawer) {
                        // 设置容器z-index
                        drawer.style.setProperty('z-index', '2147483647', 'important');
                        drawer.style.setProperty('position', 'fixed', 'important');
                        
                        // 设置所有子元素
                        const overlay = drawer.querySelector('.drawer-overlay');
                        const container = drawer.querySelector('.drawer-container');
                        
                        if (overlay) {
                            overlay.style.setProperty('z-index', '2147483647', 'important');
                            overlay.style.setProperty('position', 'fixed', 'important');
                        }
                        
                        if (container) {
                            container.style.setProperty('z-index', '2147483647', 'important');
                            container.style.setProperty('position', 'fixed', 'important');
                        }
                    }
                };
                
                // 立即执行
                ensureZIndex();
                
                // 延迟执行多次以确保
                [10, 50, 100, 200, 500].forEach(delay => {
                    setTimeout(ensureZIndex, delay);
                });
                
                // 再次强制设置z-index
                this.forceTopZIndex();
            }
            
            generateContent(operation, tabKey) {
                if (!operation) return `<div>Loading data...</div>`;
                
                const commandInfo = this.getCommandInfo(operation.command);
                
                switch(tabKey) {
                    case 'basic':
                        return this.generateBasicInfo(operation, commandInfo);
                    case 'stations':
                        return this.generateStationDetails(operation);
                    case 'timeline':
                        return this.generateTimeline(operation);
                    default:
                        return this.generateBasicInfo(operation, commandInfo);
                }
            }
            
            getCommandInfo(command) {
                const commandTexts = {
                    'charge': window.i18n ? window.i18n.getText('charge') : '充电',
                    'discharge': window.i18n ? window.i18n.getText('discharge') : '放电',
                    'stop': window.i18n ? window.i18n.getText('stop') : '停止'
                };
                const commandMap = {
                    'charge': { text: commandTexts['charge'], class: 'charge' },
                    'discharge': { text: commandTexts['discharge'], class: 'discharge' },
                    'stop': { text: commandTexts['stop'], class: 'stop' }
                };
                return commandMap[command] || { text: command, class: 'default' };
            }

            generateBasicInfo(operation, commandInfo) {
                return `
                    <div class="detail-section">
                        <div class="detail-section-title">
                            <span>📊</span>
                            ${window.i18n ? window.i18n.getText('operationOverview') : '操作概览'}
                        </div>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">${operation.stations || operation.dispatched}</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('totalStations') : '总电站数'}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${operation.success || operation.activated}</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('successCount') : '成功数'}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${operation.failed || (operation.dispatched - operation.activated)}</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('failedCount') : '失败数'}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${operation.successRate || Math.round((operation.activated / operation.dispatched) * 100)}%</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('successRate') : '成功率'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-section-title">
                            <span>📝</span>
                            ${window.i18n ? window.i18n.getText('basicInfo') : '基本信息'}
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationTime') : '操作时间'}</span>
                            <span class="detail-value">${operation.time || new Date().toLocaleString(window.i18n ? (window.i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US') : 'zh-CN')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationCommand') : '操作命令'}</span>
                            <span class="detail-value">
                                <span class="command-tag ${commandInfo.class}">${commandInfo.text}</span>
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operator') : '操作人员'}</span>
                            <span class="detail-value">${window.i18n ? window.i18n.getText('systemAdmin') : '系统管理员'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationId') : '操作编号'}</span>
                            <span class="detail-value">#${operation.id ? operation.id.toString().padStart(8, '0') : Date.now().toString().slice(-8)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('executionStatus') : '执行状态'}</span>
                            <span class="detail-value">
                                <span class="status-tag success">${window.i18n ? window.i18n.getText('allSuccess') : '全部成功'}</span>
                            </span>
                        </div>
                    </div>
                `;
            }

            generateStationDetails(operation) {
                // 生成模拟的电站数据
                const stationCount = operation.stations || operation.dispatched || 500;
                const successCount = operation.success || operation.activated || 450;
                const stations = [];
                for (let i = 0; i < Math.min(stationCount, 10); i++) {
                    const isSuccess = i < successCount;
                    stations.push({
                        id: `ST${(1000 + i).toString()}`,
                        name: `${window.i18n ? window.i18n.getText('station') : '电站'}${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
                        status: isSuccess ? 'success' : 'failed',
                        location: `${window.i18n ? window.i18n.getText('area') : '区域'}${Math.floor(i / 10) + 1}`,
                        executeTime: new Date(new Date().getTime() + i * 1000).toLocaleTimeString('zh-CN')
                    });
                }
                
                return `
                    <div class="detail-section flex-fill">
                        <div class="detail-section-title">
                            <span>⚡</span>
                            ${window.i18n ? window.i18n.getText('stationExecutionDetails') : '电站执行详情'}
                        </div>
                        <div class="scrollable-list">
                            ${stations.map(station => `
                                <div class="detail-row">
                                    <div>
                                        <div class="detail-label">${station.name} (${station.id})</div>
                                        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-top: 2px;">
                                            ${station.location} • ${station.executeTime}
                                        </div>
                                    </div>
                                    <span class="status-tag ${station.status === 'success' ? 'success' : 'danger'}">
                                        ${station.status === 'success' ? (window.i18n ? window.i18n.getText('success') : '成功') : (window.i18n ? window.i18n.getText('failed') : '失败')}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            generateTimeline(operation) {
                const startTime = new Date(operation.time || Date.now());
                const successCount = operation.success || operation.activated || 450;
                const failedCount = operation.failed || (operation.dispatched - operation.activated) || 50;
                const timeline = [
                    { time: new Date(startTime.getTime() - 60000), event: window.i18n ? window.i18n.getText('commandCreated') : '操作命令创建', status: 'success' },
                    { time: new Date(startTime.getTime() - 30000), event: window.i18n ? window.i18n.getText('validationPassed') : '命令验证通过', status: 'success' },
                    { time: startTime, event: window.i18n ? window.i18n.getText('executionStarted') : '开始执行命令', status: 'success' },
                    { time: new Date(startTime.getTime() + 30000), event: `${successCount}${window.i18n ? window.i18n.getText('stationsSuccess') : '个电站执行成功'}`, status: 'success' },
                ];
                
                if (failedCount > 0) {
                    timeline.push({
                        time: new Date(startTime.getTime() + 45000),
                        event: `${failedCount}${window.i18n ? window.i18n.getText('stationsFailed') : '个电站执行失败'}`,
                        status: 'danger'
                    });
                }
                
                timeline.push({
                    time: new Date(startTime.getTime() + 60000),
                    event: window.i18n ? window.i18n.getText('executionCompleted') : '操作执行完成',
                    status: failedCount === 0 ? 'success' : 'warning'
                });
                
                return `
                    <div class="detail-section">
                        <div class="detail-section-title">
                            <span>🕰️</span>
                            ${window.i18n ? window.i18n.getText('executionTimeline') : '执行时间线'}
                        </div>
                        <div style="position: relative; padding-left: 24px;">
                            <div style="position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.1);"></div>
                            ${timeline.map((item, index) => `
                                <div style="position: relative; margin-bottom: 24px;">
                                    <div style="position: absolute; left: -20px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: ${item.status === 'success' ? '#34c759' : item.status === 'warning' ? '#ff9500' : '#ff3b30'};"></div>
                                    <div class="detail-row" style="border: none; padding: 0; margin-bottom: 4px;">
                                        <span class="detail-label">${item.event}</span>
                                        <span class="status-tag ${item.status}">
                                            ${item.status === 'success' ? (window.i18n ? window.i18n.getText('normal') : '正常') : item.status === 'warning' ? (window.i18n ? window.i18n.getText('warning') : '警告') : (window.i18n ? window.i18n.getText('error') : '错误')}
                                        </span>
                                    </div>
                                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">
                                        ${item.time.toLocaleString('zh-CN')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // Device Response Drawer Class - 完全复制自 OperationDrawer
        class DeviceResponseDrawer extends DrawerComponent {
            constructor() {
                super({
                    containerId: 'deviceResponseDrawerComponent',
                    title: window.i18n ? window.i18n.getText('operationLog.detailTitle') : '操作记录详情',
                    width: '500px',
                    tabs: [
                        { key: 'basic', label: window.i18n ? window.i18n.getText('operationLog.tabs.basic') : '基本信息' },
                        { key: 'stations', label: window.i18n ? window.i18n.getText('operationLog.tabs.stations') : '电站详情' },
                        { key: 'timeline', label: window.i18n ? window.i18n.getText('operationLog.tabs.timeline') : '执行时间线' }
                    ],
                    onClose: () => {
                    },
                    onTabSwitch: (tabKey, data) => {
                        this.setContent(data, tabKey);
                    }
                });
                
                // 确保抽屉在最顶层
                this.forceTopZIndex();
            }
            
            forceTopZIndex() {
                setTimeout(() => {
                    // 容器本身就是 drawer-overlay
                    const drawer = document.querySelector(`#${this.containerId}`);
                    if (drawer) {
                        drawer.style.setProperty('z-index', '2147483647', 'important');
                        drawer.style.setProperty('position', 'fixed', 'important');

                        // 设置内部容器
                        const container = drawer.querySelector('.drawer-container');
                        if (container) {
                            container.style.setProperty('z-index', '2147483647', 'important');
                            container.style.setProperty('position', 'fixed', 'important');
                        }
                    }
                }, 10);
            }

            open(operation) {
                super.open(operation);
                this.forceTopZIndex();
            }

            generateContent(operation, tabKey) {
                if (!operation) {
                    return `<div>${window.i18n ? window.i18n.getText('dataLoading') : 'Loading data...'}</div>`;
                }

                const commandInfo = this.getCommandInfo(operation.command || 'charge');

                switch(tabKey) {
                    case 'basic':
                        return this.generateBasicInfo(operation, commandInfo);
                    case 'stations':
                        return this.generateStationDetails(operation);
                    case 'timeline':
                        return this.generateTimeline(operation);
                    default:
                        return this.generateBasicInfo(operation, commandInfo);
                }
            }
            
            getCommandInfo(command) {
                const commandMap = {
                    'charge': {
                        text: window.i18n ? window.i18n.getText('operationLog.commands.charge') : '充电',
                        class: 'charge'
                    },
                    'discharge': {
                        text: window.i18n ? window.i18n.getText('operationLog.commands.discharge') : '放电',
                        class: 'discharge'
                    },
                    'stop_charge': {
                        text: window.i18n ? window.i18n.getText('operationLog.commands.stopCharge') : '停止充电',
                        class: 'stop-charge'
                    },
                    'stop_discharge': {
                        text: window.i18n ? window.i18n.getText('operationLog.commands.stopDischarge') : '停止放电',
                        class: 'stop-discharge'
                    }
                };
                return commandMap[command] || { text: command, class: '' };
            }
            
            generateBasicInfo(operation, commandInfo) {
                return `
                    <div class="detail-section">
                        <div class="detail-section-title">
                            <span>📊</span>
                            ${window.i18n ? window.i18n.getText('operationLog.overview.title') : '操作概览'}
                        </div>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">${operation.stations || operation.totalStations || 235}</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.totalStations') : '总电站数'}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${operation.success || operation.onlineStations || 230}</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.successCount') : '成功数'}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${operation.failed || 5}</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.failedCount') : '失败数'}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${operation.successRate || Math.round((230 / 235) * 100)}%</div>
                                <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.successRate') : '成功率'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detail-section">
                        <div class="detail-section-title">
                            <span>📝</span>
                            ${window.i18n ? window.i18n.getText('operationLog.basicInfo.title') : '基本信息'}
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operationTime') : '操作时间'}</span>
                            <span class="detail-value">${operation.time || new Date().toLocaleString()}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operationCommand') : '操作命令'}</span>
                            <span class="detail-value">
                                <span class="command-tag ${commandInfo.class}">${commandInfo.text}</span>
                            </span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operator') : '操作人员'}</span>
                            <span class="detail-value">${this.getOperatorName(operation.operator || 'System')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operationId') : '操作编号'}</span>
                            <span class="detail-value">#${(operation.id || Date.now()).toString().padStart(8, '0')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.executionStatus') : '执行状态'}</span>
                            <span class="detail-value">
                                <span class="status-tag ${(operation.failed || 5) === 0 ? 'success' : (operation.success || 230) > (operation.failed || 5) ? 'warning' : 'danger'}">
                                    ${(operation.failed || 5) === 0 ? (window.i18n ? window.i18n.getText('operationLog.basicInfo.allSuccess') : '全部成功') : (operation.success || 230) > (operation.failed || 5) ? (window.i18n ? window.i18n.getText('operationLog.basicInfo.partialSuccess') : '部分成功') : (window.i18n ? window.i18n.getText('operationLog.basicInfo.mostlyFailed') : '多数失败')}
                                </span>
                            </span>
                        </div>
                    </div>
                `;
            }
            
            getOperatorName(operator) {
                if (operator === 'System') {
                    return window.i18n ? window.i18n.getText('system') : '系统';
                }
                return operator;
            }
            
            generateStationDetails(operation) {
                // 生成模拟的电站数据
                const stations = [];
                const totalStations = operation.stations || operation.totalStations || 235;
                const successCount = operation.success || operation.onlineStations || 230;
                
                for (let i = 0; i < totalStations; i++) {
                    const isSuccess = i < successCount;
                    stations.push({
                        id: `ST${(1000 + i).toString()}`,
                        name: `${window.i18n ? window.i18n.getText('operationLog.stationDetails.station') : '电站'}${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
                        status: isSuccess ? 'success' : 'failed',
                        location: `${window.i18n ? window.i18n.getText('operationLog.stationDetails.area') : '区域'}${Math.floor(i / 10) + 1}`,
                        executeTime: new Date(new Date().getTime() + i * 1000).toLocaleTimeString(window.i18n ? (window.i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US') : 'zh-CN')
                    });
                }
                
                return `
                    <div class="detail-section flex-fill" style="margin-bottom: 0;">
                        <div class="detail-section-title">
                            <span>⚡</span>
                            ${window.i18n ? window.i18n.getText('operationLog.stationDetails.title') : '电站执行详情'}
                        </div>
                        <div class="scrollable-list" style="flex: 1; min-height: 600px; padding-bottom: 16px;">
                            ${stations.map(station => `
                                <div class="detail-row">
                                    <div>
                                        <div class="detail-label">${station.name} (${station.id})</div>
                                        <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-top: 2px;">
                                            ${station.location} • ${station.executeTime}
                                        </div>
                                    </div>
                                    <span class="status-tag ${station.status === 'success' ? 'success' : 'danger'}">
                                        ${station.status === 'success' ? (window.i18n ? window.i18n.getText('operationLog.stationDetails.success') : '成功') : (window.i18n ? window.i18n.getText('operationLog.stationDetails.failed') : '失败')}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            generateTimeline(operation) {
                const startTime = new Date(operation.time || new Date());
                const successCount = operation.success || operation.onlineStations || 230;
                const failedCount = operation.failed || 5;
                
                const timeline = [
                    { time: new Date(startTime.getTime() - 60000), event: window.i18n ? window.i18n.getText('operationLog.timeline.commandCreated') : '操作命令创建', status: 'success' },
                    { time: new Date(startTime.getTime() - 30000), event: window.i18n ? window.i18n.getText('operationLog.timeline.validationPassed') : '命令验证通过', status: 'success' },
                    { time: startTime, event: window.i18n ? window.i18n.getText('operationLog.timeline.executionStarted') : '开始执行命令', status: 'success' },
                    { time: new Date(startTime.getTime() + 30000), event: `${successCount}${window.i18n ? window.i18n.getText('operationLog.timeline.stationsSuccess') : '个电站执行成功'}`, status: 'success' },
                ];
                
                if (failedCount > 0) {
                    timeline.push({
                        time: new Date(startTime.getTime() + 45000),
                        event: `${failedCount}${window.i18n ? window.i18n.getText('operationLog.timeline.stationsFailed') : '个电站执行失败'}`,
                        status: 'danger'
                    });
                }
                
                timeline.push({
                    time: new Date(startTime.getTime() + 60000),
                    event: window.i18n ? window.i18n.getText('operationLog.timeline.executionCompleted') : '操作执行完成',
                    status: failedCount === 0 ? 'success' : 'warning'
                });
                
                return `
                    <div class="detail-section">
                        <div class="detail-section-title">
                            <span>🕰️</span>
                            ${window.i18n ? window.i18n.getText('operationLog.timeline.title') : '执行时间线'}
                        </div>
                        <div style="position: relative; padding-left: 24px;">
                            <div style="position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.1);"></div>
                            ${timeline.map((item, index) => `
                                <div style="position: relative; margin-bottom: 16px;">
                                    <div style="position: absolute; left: -20px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: ${item.status === 'success' ? '#34c759' : item.status === 'warning' ? '#ff9500' : '#ff3b30'};"></div>
                                    <div class="detail-row" style="border: none; padding: 0; margin-bottom: 4px;">
                                        <span class="detail-label">${item.event}</span>
                                        <span class="status-tag ${item.status}">
                                            ${item.status === 'success' ? (window.i18n ? window.i18n.getText('operationLog.timeline.normal') : '正常') : item.status === 'warning' ? (window.i18n ? window.i18n.getText('operationLog.timeline.warning') : '警告') : (window.i18n ? window.i18n.getText('operationLog.timeline.error') : '错误')}
                                        </span>
                                    </div>
                                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">
                                        ${item.time.toLocaleString(window.i18n ? (window.i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US') : 'zh-CN')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // 初始化抽屉组件（全局变量）
        window.homeOperationDrawer = null;

        // 打开操作详情抽屉
        function openOperationDrawer() {
            
            if (!window.homeOperationDrawer) {
                window.homeOperationDrawer = new HomeOperationDrawer();
            }

            // 构造操作记录格式的数据
            const dispatched = parseInt(document.getElementById('devicesDispatched')?.textContent || '500');
            const successRate = parseInt(document.getElementById('successRate')?.textContent || '89');
            const activated = Math.floor(dispatched * (successRate / 100));
            const operation = {
                id: Date.now() % 100000000,
                time: new Date().toLocaleString('zh-CN'),
                command: currentOperation || 'charge',
                operator: 'admin',
                stations: dispatched,
                success: activated,
                failed: dispatched - activated,
                dispatched: dispatched,
                activated: activated,
                successRate: Math.round((activated / dispatched) * 100)
            };

            
            // 直接打开抽屉并设置内容
            window.homeOperationDrawer.open();
            
            // 强制确保抽屉在最顶层
            setTimeout(() => {
                const drawerElement = document.getElementById('homeOperationDrawer');
                if (drawerElement) {
                    // 设置最高z-index
                    drawerElement.style.setProperty('z-index', '2147483647', 'important');
                    drawerElement.style.setProperty('position', 'fixed', 'important');
                    
                    // 查找并设置overlay的z-index
                    const overlay = document.querySelector('.drawer-overlay');
                    if (overlay) {
                        overlay.style.setProperty('z-index', '2147483646', 'important');
                        overlay.style.setProperty('position', 'fixed', 'important');
                    }
                    
                    // 查找抽屉容器
                    const container = drawerElement.querySelector('.drawer-container') || 
                                    document.querySelector('.drawer-container');
                    if (container) {
                        container.style.setProperty('z-index', '2147483647', 'important');
                        container.style.setProperty('position', 'fixed', 'important');
                    }
                    
                }
            }, 100);
            
            // 设置内容数据
            homeOperationDrawer.setContent(operation, 'basic');
        }

        // 全局z-index监控器
        function startDrawerZIndexMonitor() {
            setInterval(() => {
                const drawer = document.getElementById('homeOperationDrawer');
                if (drawer && drawer.style.display !== 'none') {
                    // 确保抽屉始终在最顶层
                    drawer.style.setProperty('z-index', '2147483647', 'important');
                    drawer.style.setProperty('position', 'fixed', 'important');
                    
                    const overlay = drawer.querySelector('.drawer-overlay');
                    if (overlay) {
                        overlay.style.setProperty('z-index', '2147483647', 'important');
                    }
                    
                    const container = drawer.querySelector('.drawer-container');
                    if (container) {
                        container.style.setProperty('z-index', '2147483647', 'important');
                    }
                }
            }, 100);
        }

        // 关闭模态框函数
        function closeModal() {
            const modal = document.getElementById('operationModal');
            const statusSummary = document.getElementById('statusSummary');
            const infoGrid = document.querySelector('.modal-info-grid');
            
            modal.style.display = 'none';
            
            // Reset modal display states
            statusSummary.style.display = 'none';
            infoGrid.style.display = 'grid';
            
            // Reset current operation after modal is closed
            currentOperation = null;
        }

        function viewDetails() {
            // Close the modal
            closeModal();
            
            // Update details panel with current operation data
            const detailsPanel = document.getElementById('operationDetailsPanel');
            const operationType = document.getElementById('operationType').textContent;
            const targetDevices = document.getElementById('targetDevices').textContent;
            const estimatedProfit = document.getElementById('estimatedProfit').textContent;
            
            // Update details panel content
            document.getElementById('detailsOperationType').textContent = operationType;
            document.getElementById('detailsTargetDevices').textContent = targetDevices;
            document.getElementById('detailsEstimatedProfit').textContent = estimatedProfit;
            document.getElementById('detailsOperationTime').textContent = new Date().toLocaleString();
            
            // Update execution status numbers
            document.getElementById('detailsDispatched').textContent = document.getElementById('devicesDispatched').textContent;
            
            // Show the details panel
            detailsPanel.style.display = 'block';
            setTimeout(() => {
                detailsPanel.classList.add('show');
            }, 10);
        }
        
        // Remove duplicate function - using the one at line 5875 instead

        function closeDetailsPanel() {
            const detailsPanel = document.getElementById('operationDetailsPanel');
            detailsPanel.classList.remove('show');
            setTimeout(() => {
                detailsPanel.style.display = 'none';
            }, 300);
        }

        // Device Status Drawer Functions
        let deviceStatusData = {
            failed: [],
            success: [],
            executing: []
        };

        // Update device status counts based on animation progress
        function updateDeviceStatusCounts(successCount, executingCount, failCount, detailedStats) {
            // 失败原因列表
            const failureReasons = [
                '网络连接超时',
                '设备离线',
                '指令格式错误',
                '设备忙碌',
                '电量不足',
                '通信协议错误',
                '设备未响应',
                '参数校验失败',
                'CRC校验错误',
                '设备故障'
            ];

            // Update success devices - all with 'success' status (下发成功)
            deviceStatusData.success = [];
            let nmiIndex = 2000;

            // 所有下发成功的设备统一状态为'success'
            for (let i = 0; i < successCount; i++) {
                deviceStatusData.success.push({
                    nmi: `NMI${String(nmiIndex++).padStart(6, '0')}`,
                    failureCount: 0,
                    status: 'success'
                });
            }

            // Update executing devices
            deviceStatusData.executing = [];
            for (let i = 0; i < executingCount; i++) {
                deviceStatusData.executing.push({
                    nmi: `NMI${String(3000 + i).padStart(6, '0')}`,
                    failureCount: 0,
                    status: 'executing'
                });
            }

            // Update failed devices - 添加失败原因
            deviceStatusData.failed = [];
            for (let i = 0; i < failCount; i++) {
                const failureCount = Math.floor(Math.random() * 5) + 1;
                // 随机选择失败原因
                const randomReason = failureReasons[Math.floor(Math.random() * failureReasons.length)];

                deviceStatusData.failed.push({
                    nmi: `NMI${String(1000 + i).padStart(6, '0')}`,
                    failureCount: failureCount,
                    failureReason: randomReason,
                    status: 'failed'
                });
            }

        }

        // Generate mock device data
        function generateDeviceData() {
            const totalDevices = 500;
            const failedCount = Math.floor(totalDevices * 0.05); // 5% failed
            const successCount = Math.floor(totalDevices * 0.95); // 95% success

            // 失败原因列表
            const failureReasons = [
                '网络连接超时',
                '设备离线',
                '指令格式错误',
                '设备忙碌',
                '电量不足',
                '通信协议错误',
                '设备未响应',
                '参数校验失败',
                'CRC校验错误',
                '设备故障'
            ];

            // Generate failed devices - 添加失败原因
            deviceStatusData.failed = [];
            for (let i = 0; i < failedCount; i++) {
                const failureCount = Math.floor(Math.random() * 5) + 1;
                const randomReason = failureReasons[Math.floor(Math.random() * failureReasons.length)];

                deviceStatusData.failed.push({
                    nmi: `NMI${String(1000 + i).padStart(6, '0')}`,
                    failureCount: failureCount,
                    failureReason: randomReason,
                    status: 'failed'
                });
            }

            // Generate success devices
            deviceStatusData.success = [];
            for (let i = 0; i < successCount; i++) {
                deviceStatusData.success.push({
                    nmi: `NMI${String(2000 + i).padStart(6, '0')}`,
                    failureCount: 0,
                    status: 'success'
                });
            }

            // Generate executing devices (initially 0, will be populated during operation)
            deviceStatusData.executing = [];
        }

        // 当前活动的tab类型
        let currentActiveTab = 'success';

        // Open device status drawer - 暴露到全局作用域
        window.openDeviceStatusDrawer = function(type) {

            const drawer = document.getElementById('deviceStatusDrawer');
            const drawerTableBody = document.getElementById('drawerTableBody');


            // 安全检查：确保所有必要的元素都存在
            if (!drawer || !drawerTableBody) {
                console.error('❌ Drawer elements not found!', {
                    drawer: !!drawer,
                    drawerTableBody: !!drawerTableBody
                });
                return;
            }

            // If no data exists yet (first time opening), use current displayed counts
            if (deviceStatusData.failed.length === 0 && deviceStatusData.success.length === 0 && deviceStatusData.executing.length === 0) {
                const currentSuccess = parseInt(document.getElementById('successfulDevices')?.textContent || '0');
                const currentExecuting = parseInt(document.getElementById('executingDevices')?.textContent || '0');
                const currentFailed = parseInt(document.getElementById('failedDevices')?.textContent || '0');


                // 获取当前地区的详细统计数据
                const currentRegionStats = regionData[selectedMainRegion]?.deviceStats;
                updateDeviceStatusCounts(currentSuccess, currentExecuting, currentFailed, currentRegionStats);
            }

            // 更新tab计数
            document.getElementById('tabCountSuccess').textContent = deviceStatusData.success.length;
            document.getElementById('tabCountExecuting').textContent = deviceStatusData.executing.length;
            document.getElementById('tabCountFailed').textContent = deviceStatusData.failed.length;

            // 设置当前活动tab并显示对应数据
            currentActiveTab = type || 'success';
            switchDeviceTab(currentActiveTab);

            // Show drawer - 添加 show 类来显示抽屉

            // 获取遮罩层和内容
            const overlay = drawer.querySelector('.drawer-overlay');
            const content = drawer.querySelector('.drawer-content');

            // 添加 show 类触发CSS动画
            drawer.classList.add('show');

            // 同时使用内联样式强制显示（确保一定能显示）
            drawer.style.visibility = 'visible';
            drawer.style.pointerEvents = 'all';
            drawer.style.zIndex = '999999';

            // 强制显示遮罩层 - 使用所有可能的样式属性
            if (overlay) {
                overlay.style.cssText = `
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0, 0, 0, 0.6) !important;
                    opacity: 1 !important;
                    display: block !important;
                    visibility: visible !important;
                    pointer-events: all !important;
                    z-index: 999998 !important;
                    backdrop-filter: blur(4px);
                `;
            } else {
                console.error('❌ Overlay element not found!');
            }

            // 确保内容在最上层
            if (content) {
                content.style.zIndex = '999999';
                content.style.position = 'fixed';
            }

            // 强制浏览器重排以确保样式生效
            drawer.offsetHeight;

        };

        // Close device status drawer - 暴露到全局作用域
        window.closeDeviceStatusDrawer = function() {
            const drawer = document.getElementById('deviceStatusDrawer');
            const overlay = drawer.querySelector('.drawer-overlay');

            // 移除 show 类触发关闭动画
            drawer.classList.remove('show');

            // 立即禁用遮罩层的点击事件，防止阻挡页面点击
            if (overlay) {
                overlay.style.pointerEvents = 'none';
                overlay.style.opacity = '0';
            }

            // 立即禁用drawer的点击事件
            drawer.style.pointerEvents = 'none';

            // 延迟后完全隐藏并清理所有样式
            setTimeout(() => {
                drawer.style.visibility = 'hidden';

                // 完全隐藏遮罩层
                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.style.visibility = 'hidden';
                }

            }, 300);
        };

        // Export drawer data - 暴露到全局作用域
        window.exportDrawerData = function() {

            // Get current active tab data
            let data = [];
            let tabName = '';

            if (currentActiveTab === 'failed') {
                data = deviceStatusData.failed;
                tabName = window.i18n ? window.i18n.getText('failed') : '下发失败';
            } else if (currentActiveTab === 'success') {
                data = deviceStatusData.success;
                tabName = window.i18n ? window.i18n.getText('success') : '下发成功';
            } else if (currentActiveTab === 'executing') {
                data = deviceStatusData.executing;
                tabName = window.i18n ? window.i18n.getText('executing') : '执行中';
            }

            if (data.length === 0) {
                const message = window.i18n && window.i18n.getCurrentLanguage() === 'en' ?
                    'No data to export' : '没有数据可以导出';
                alert(message);
                return;
            }

            // Get current language
            const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';

            // Create CSV headers based on tab type and language
            let headers = [];
            if (currentActiveTab === 'failed') {
                // 下发失败：NMI、失败次数、失败原因
                headers = currentLanguage === 'en' ?
                    ['NMI', 'Failure Count', 'Failure Reason'] :
                    ['NMI', '失败次数', '失败原因'];
            } else {
                // 下发成功和执行中：NMI、状态
                headers = currentLanguage === 'en' ?
                    ['NMI', 'Status'] :
                    ['NMI', '状态'];
            }

            // Status translation mapping
            const statusI18nKeys = {
                'success': 'success',
                'failed': 'failed',
                'charging': 'charging',
                'discharging': 'discharging',
                'standby': 'standby',
                'offline': 'offline',
                'executing': 'executing'
            };

            // Create CSV content
            let csvContent = '\uFEFF' + headers.join(',') + '\n'; // Add BOM for UTF-8

            // Add data rows based on tab type
            data.forEach(device => {
                let row = [];

                if (currentActiveTab === 'failed') {
                    // 下发失败：导出 NMI、失败次数、失败原因
                    row = [
                        device.nmi || '-',
                        device.failureCount || 0,
                        device.failureReason || '未知错误'
                    ];
                } else {
                    // 下发成功和执行中：导出 NMI、状态
                    const i18nKey = statusI18nKeys[device.status] || device.status;
                    const statusText = window.i18n ? window.i18n.getText(i18nKey) : device.status;

                    row = [
                        device.nmi || '-',
                        statusText
                    ];
                }

                csvContent += row.join(',') + '\n';
            });

            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const timestamp = now.getTime();
            const filename = `device_response_${currentActiveTab}_${timestamp}.csv`;

            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Show success message
            const message = currentLanguage === 'en' ?
                `Export successful! (${data.length} records)` :
                `导出成功！共 ${data.length} 条数据`;
            alert(message);
        };

        // Switch device tab - 暴露到全局作用域
        window.switchDeviceTab = function(type) {

            // 更新当前活动标签
            currentActiveTab = type;

            // 更新tab激活状态
            document.querySelectorAll('.drawer-tab').forEach(tab => {
                if (tab.getAttribute('data-tab') === type) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });

            // 获取对应类型的数据
            let data = [];
            if (type === 'failed') {
                data = deviceStatusData.failed;
            } else if (type === 'success') {
                data = deviceStatusData.success;
            } else if (type === 'executing') {
                data = deviceStatusData.executing;
            }

            // 更新表格表头和数据
            const drawerTableHead = document.getElementById('drawerTableHead');
            const drawerTableBody = document.getElementById('drawerTableBody');

            if (!drawerTableHead || !drawerTableBody) {
                console.error('❌ Table elements not found');
                return;
            }

            // 根据tab类型动态设置表头
            if (type === 'failed') {
                // 下发失败：显示 NMI、次数、失败原因
                drawerTableHead.innerHTML = `
                    <tr>
                        <th data-i18n="nmi">NMI</th>
                        <th data-i18n="failureCount">失败次数</th>
                        <th data-i18n="failureReason">失败原因</th>
                    </tr>
                `;
            } else {
                // 下发成功和执行中：显示 NMI、状态
                drawerTableHead.innerHTML = `
                    <tr>
                        <th data-i18n="nmi">NMI</th>
                        <th data-i18n="status">状态</th>
                    </tr>
                `;
            }

            // 状态文字翻译映射
            const statusI18nKeys = {
                'success': 'success',
                'failed': 'failed',
                'charging': 'charging',
                'discharging': 'discharging',
                'standby': 'standby',
                'offline': 'offline',
                'executing': 'executing'
            };

            // 清空表格并填充数据
            drawerTableBody.innerHTML = '';
            data.forEach(device => {
                const row = document.createElement('tr');

                if (type === 'failed') {
                    // 下发失败：显示 NMI、次数、失败原因
                    row.innerHTML = `
                        <td>${device.nmi || '-'}</td>
                        <td>${device.failureCount || 0}</td>
                        <td><span style="color: rgba(255, 107, 107, 0.9);">${device.failureReason || '未知错误'}</span></td>
                    `;
                } else {
                    // 下发成功和执行中：显示 NMI、状态
                    // 根据设备状态生成对应的徽章
                    let badgeClass = '';
                    const i18nKey = statusI18nKeys[device.status] || device.status;
                    let statusText = window.i18n ? window.i18n.getText(i18nKey) : device.status;

                    // 根据不同状态设置样式类
                    switch(device.status) {
                        case 'success':
                            badgeClass = 'success';
                            break;
                        case 'charging':
                            badgeClass = 'success';
                            break;
                        case 'discharging':
                            badgeClass = 'warning';
                            break;
                        case 'standby':
                            badgeClass = 'info';
                            break;
                        case 'offline':
                            badgeClass = 'secondary';
                            break;
                        case 'executing':
                            badgeClass = 'executing';
                            break;
                        default:
                            badgeClass = 'default';
                    }

                    const statusBadge = `<span class="status-badge ${badgeClass}">${statusText}</span>`;

                    row.innerHTML = `
                        <td>${device.nmi || '-'}</td>
                        <td>${statusBadge}</td>
                    `;
                }

                drawerTableBody.appendChild(row);
            });

            // 如果启用了i18n，重新应用翻译
            if (window.i18n && window.i18n.updatePageTexts) {
                window.i18n.updatePageTexts();
            }

        };

        function populateOperationDrawerData() {
            // Update basic information
            const operationType = currentOperation === 'charge' ? '充电' : (currentOperation === 'discharge' ? '放电' : '停止操作');
            document.getElementById('detailsOperationType').textContent = operationType;
            document.getElementById('detailsTargetDevices').textContent = (window.i18n && window.i18n.getCurrentLanguage() === 'en') ? '500 Devices' : '500个设备';
            const profitElement = document.getElementById('detailsEstimatedProfit');
            if (profitElement) {
                profitElement.innerHTML = '<span data-i18n="estimatedProfitValue">+$340</span>';
            }
            document.getElementById('detailsOperationTime').textContent = new Date().toLocaleString();
        }

        // Operation Details Tabs Functions (copied from OperationDrawer)
        let currentOperationData = null;
        let activeOperationTab = 'basic';

        function switchOperationTab(tabKey) {
            // Update active tab
            document.querySelectorAll('.operation-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelector(`[data-tab="${tabKey}"]`).classList.add('active');
            
            activeOperationTab = tabKey;
            
            // Generate content for the selected tab
            if (currentOperationData) {
                generateOperationTabContent(currentOperationData, tabKey);
            }
        }

        function generateOperationTabContent(operation, tabKey) {
            const contentContainer = document.getElementById('operationTabContent');
            
            switch(tabKey) {
                case 'basic':
                    contentContainer.innerHTML = generateBasicInfo(operation);
                    break;
                case 'stations':
                    contentContainer.innerHTML = generateStationDetails(operation);
                    break;
                case 'timeline':
                    contentContainer.innerHTML = generateTimeline(operation);
                    break;
                default:
                    contentContainer.innerHTML = generateBasicInfo(operation);
            }
        }

        function generateBasicInfo(operation) {
            const commandInfo = getCommandInfo(operation.command);
            
            return `
                <div class="detail-section">
                    <div class="detail-section-title">
                        <span>📊</span>
                        ${window.i18n ? window.i18n.getText('operationLog.overview.title') : '操作概览'}
                    </div>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">${operation.stations}</div>
                            <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.totalStations') : '总电站数'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${operation.success}</div>
                            <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.successCount') : '成功数'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${operation.failed}</div>
                            <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.failedCount') : '失败数'}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${Math.round((operation.success / operation.stations) * 100)}%</div>
                            <div class="stat-label">${window.i18n ? window.i18n.getText('operationLog.overview.successRate') : '成功率'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">
                        <span>📝</span>
                        ${window.i18n ? window.i18n.getText('operationLog.basicInfo.title') : '基本信息'}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operationTime') : '操作时间'}</span>
                        <span class="detail-value">${operation.time}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operationCommand') : '操作命令'}</span>
                        <span class="detail-value">
                            <span class="command-tag ${commandInfo.class}">${commandInfo.text}</span>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operator') : '操作人员'}</span>
                        <span class="detail-value">${getOperatorName(operation.operator)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.operationId') : '操作编号'}</span>
                        <span class="detail-value">#${operation.id.toString().padStart(8, '0')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${window.i18n ? window.i18n.getText('operationLog.basicInfo.executionStatus') : '执行状态'}</span>
                        <span class="detail-value">
                            <span class="status-tag ${operation.failed === 0 ? 'success' : operation.success > operation.failed ? 'warning' : 'danger'}">
                                ${operation.failed === 0 ? (window.i18n ? window.i18n.getText('operationLog.basicInfo.allSuccess') : '全部成功') : operation.success > operation.failed ? (window.i18n ? window.i18n.getText('operationLog.basicInfo.partialSuccess') : '部分成功') : (window.i18n ? window.i18n.getText('operationLog.basicInfo.mostlyFailed') : '多数失败')}
                            </span>
                        </span>
                    </div>
                </div>
            `;
        }

        function generateStationDetails(operation) {
            // Generate simulated station data
            const stations = [];
            for (let i = 0; i < operation.stations; i++) {
                const isSuccess = i < operation.success;
                stations.push({
                    id: `ST${(1000 + i).toString()}`,
                    name: `${window.i18n ? window.i18n.getText('operationLog.stationDetails.station') : '电站'}${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
                    status: isSuccess ? 'success' : 'failed',
                    location: `${window.i18n ? window.i18n.getText('operationLog.stationDetails.area') : '区域'}${Math.floor(i / 10) + 1}`,
                    executeTime: new Date(new Date(operation.time).getTime() + i * 1000).toLocaleTimeString(window.i18n ? (window.i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US') : 'zh-CN')
                });
            }
            
            return `
                <div class="detail-section">
                    <div class="detail-section-title">
                        <span>⚡</span>
                        ${window.i18n ? window.i18n.getText('operationLog.stationDetails.title') : '电站执行详情'}
                    </div>
                    <div class="scrollable-list">
                        ${stations.map(station => `
                            <div class="detail-row">
                                <div>
                                    <div class="detail-label">${station.name} (${station.id})</div>
                                    <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-top: 2px;">
                                        ${station.location} • ${station.executeTime}
                                    </div>
                                </div>
                                <span class="status-tag ${station.status === 'success' ? 'success' : 'danger'}">
                                    ${station.status === 'success' ? (window.i18n ? window.i18n.getText('operationLog.stationDetails.success') : '成功') : (window.i18n ? window.i18n.getText('operationLog.stationDetails.failed') : '失败')}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function generateTimeline(operation) {
            const startTime = new Date(operation.time);
            const timeline = [
                { time: new Date(startTime.getTime() - 60000), event: window.i18n ? window.i18n.getText('operationLog.timeline.commandCreated') : '操作命令创建', status: 'success' },
                { time: new Date(startTime.getTime() - 30000), event: window.i18n ? window.i18n.getText('operationLog.timeline.validationPassed') : '命令验证通过', status: 'success' },
                { time: startTime, event: window.i18n ? window.i18n.getText('operationLog.timeline.executionStarted') : '开始执行命令', status: 'success' },
                { time: new Date(startTime.getTime() + 30000), event: `${operation.success}${window.i18n ? window.i18n.getText('operationLog.timeline.stationsSuccess') : '个电站执行成功'}`, status: 'success' },
            ];
            
            if (operation.failed > 0) {
                timeline.push({
                    time: new Date(startTime.getTime() + 45000),
                    event: `${operation.failed}${window.i18n ? window.i18n.getText('operationLog.timeline.stationsFailed') : '个电站执行失败'}`,
                    status: 'danger'
                });
            }
            
            timeline.push({
                time: new Date(startTime.getTime() + 60000),
                event: window.i18n ? window.i18n.getText('operationLog.timeline.executionCompleted') : '操作执行完成',
                status: operation.failed === 0 ? 'success' : 'warning'
            });
            
            return `
                <div class="detail-section">
                    <div class="detail-section-title">
                        <span>🕰️</span>
                        ${window.i18n ? window.i18n.getText('operationLog.timeline.title') : '执行时间线'}
                    </div>
                    <div style="position: relative; padding-left: 24px;">
                        <div style="position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.1);"></div>
                        ${timeline.map((item, index) => `
                            <div style="position: relative; margin-bottom: 24px;">
                                <div style="position: absolute; left: -20px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: ${item.status === 'success' ? '#34c759' : item.status === 'warning' ? '#ff9500' : '#ff3b30'};"></div>
                                <div class="detail-row" style="border: none; padding: 0; margin-bottom: 4px;">
                                    <span class="detail-label">${item.event}</span>
                                    <span class="status-tag ${item.status}">
                                        ${item.status === 'success' ? (window.i18n ? window.i18n.getText('operationLog.timeline.normal') : '正常') : item.status === 'warning' ? (window.i18n ? window.i18n.getText('operationLog.timeline.warning') : '警告') : (window.i18n ? window.i18n.getText('operationLog.timeline.error') : '错误')}
                                    </span>
                                </div>
                                <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">
                                    ${item.time.toLocaleString(window.i18n ? (window.i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US') : 'zh-CN')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Helper functions
        function getCommandInfo(command) {
            const commands = {
                'charge': { text: window.i18n ? window.i18n.getText('charge') : '充电', class: 'charge' },
                'discharge': { text: window.i18n ? window.i18n.getText('discharge') : '放电', class: 'discharge' }
            };
            return commands[command] || { text: command, class: 'charge' };
        }

        function getOperatorName(operator) {
            const operators = {
                'admin': window.i18n ? window.i18n.getText('systemAdmin') : '系统管理员',
                'user1': window.i18n ? window.i18n.getText('operatorA') : '操作员A',
                'user2': window.i18n ? window.i18n.getText('operatorB') : '操作员B'
            };
            return operators[operator] || operator;
        }

        // Initialize operation data when modal shows device response statistics
        function initializeOperationData() {
            const now = new Date();
            currentOperationData = {
                id: Math.floor(Math.random() * 1000000),
                time: now.toLocaleString(window.i18n ? (window.i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US') : 'zh-CN'),
                command: currentOperation || 'discharge',
                operator: 'admin',
                stations: parseInt(document.getElementById('devicesDispatched')?.textContent || '500'),
                success: Math.floor(parseInt(document.getElementById('devicesDispatched')?.textContent || '500') * (parseInt(document.getElementById('successRate')?.textContent || '89') / 100)),
                failed: parseInt(document.getElementById('devicesDispatched')?.textContent || '500') - Math.floor(parseInt(document.getElementById('devicesDispatched')?.textContent || '500') * (parseInt(document.getElementById('successRate')?.textContent || '89') / 100))
            };
            
            // Generate initial content for the basic tab
            generateOperationTabContent(currentOperationData, 'basic');
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('operationModal');
            if (event.target === modal) {
                closeModal();
            }
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'r':
                        e.preventDefault();
                        updateRealtimeData();
                        break;
                    case '1':
                        e.preventDefault();
                        switchRegion('NSW', document.querySelector('.tab.active'));
                        break;
                    case '2':
                        e.preventDefault();
                        switchRegion('QLD', document.querySelectorAll('.tab')[1]);
                        break;
                }
            }
        });

        // Touch gestures for mobile
        let touchStartX = 0;
        let touchEndX = 0;

        document.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
        });

        document.addEventListener('touchend', function(e) {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        });

        function handleSwipe() {
            if (touchEndX < touchStartX - 50) {
                // Swipe left - next region
                const tabs = document.querySelectorAll('.chart-controls .tab');
                const activeIndex = Array.from(tabs).findIndex(tab => tab.classList.contains('active'));
                if (activeIndex < tabs.length - 1) {
                    tabs[activeIndex + 1].click();
                }
            }
            if (touchEndX > touchStartX + 50) {
                // Swipe right - previous region
                const tabs = document.querySelectorAll('.chart-controls .tab');
                const activeIndex = Array.from(tabs).findIndex(tab => tab.classList.contains('active'));
                if (activeIndex > 0) {
                    tabs[activeIndex - 1].click();
                }
            }
        }

        // Header functions
        function toggleMessages() {
            window.location.href = 'message-center.html';
        }

        function toggleLanguage() {
            const dropdown = document.getElementById('languageDropdown');
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }

        function changeLanguage(langCode, langName) {
            document.getElementById('currentLanguage').textContent = langName;
            document.getElementById('languageDropdown').style.display = 'none';
            // 这里可以添加实际的语言切换逻辑
        }

        function toggleUserMenu() {
            window.location.href = 'user-settings.html';
        }

        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.language-selector')) {
                document.getElementById('languageDropdown').style.display = 'none';
            }
        });

        
        // Force apply button colors
        function forceButtonStyles() {
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            
            if (chargeBtn && !chargeBtn.classList.contains('stop-btn')) {
                chargeBtn.style.setProperty('background', 'linear-gradient(135deg, #00D67A, #00FF88)', 'important');
                chargeBtn.style.setProperty('border', '2px solid rgba(0, 255, 136, 0.3)', 'important');
                chargeBtn.style.setProperty('color', '#000', 'important');
                chargeBtn.style.setProperty('box-shadow', '0 4px 12px rgba(0, 255, 136, 0.3)', 'important');
            }
            
            if (dischargeBtn && !dischargeBtn.classList.contains('stop-btn')) {
                dischargeBtn.style.setProperty('background', 'linear-gradient(135deg, #FFA500, #FFD700)', 'important');
                dischargeBtn.style.setProperty('border', '2px solid rgba(255, 215, 0, 0.3)', 'important');
                dischargeBtn.style.setProperty('color', '#000', 'important');
                dischargeBtn.style.setProperty('box-shadow', '0 4px 12px rgba(255, 215, 0, 0.3)', 'important');
            }
            
        }
        

        // 主题切换按钮逻辑
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.onclick = function() {
                document.body.classList.toggle('theme-dark');
                this.textContent = document.body.classList.contains('theme-dark') ? '☀️' : '🌙';
            }
        }
        
        // 更新动态内容的函数
        function updateDynamicContent(language) {
            if (!window.i18n) {
                console.warn('window.i18n not available in updateDynamicContent');
                return;
            }
            
            try {
                // 更新所有i18n元素
                window.i18n.updatePageTexts();
                
                // 更新页面标题
                const pageTitles = {
                    'zh': '能源管理中心',
                    'en': 'Energy Management Center',
                    'ja': 'エネルギー管理センター',
                    'ko': '에너지 관리 센터'
                };
                document.title = pageTitles[language] || pageTitles['zh'];
                
                // 更新确认按钮文本 (动态设置的)
                const confirmBtn = document.getElementById('confirmExecuteBtn');
                if (confirmBtn) {
                    const confirmText = window.i18n.getText('confirmExecute');
                    if (confirmText !== 'confirmExecute') {
                        confirmBtn.innerHTML = '<span data-i18n="confirmExecute">' + confirmText + '</span>';
                    }
                }
                
                // No need to update current operation text anymore as it's removed
                
                // 更新图表标题和图例
                updateChartTitles(language);
                
                // 更新阈值状态文本
                const thresholdStatus = document.querySelector('[data-threshold-status]');
                if (thresholdStatus) {
                    const statusKey = thresholdStatus.getAttribute('data-threshold-status');
                    if (statusKey) {
                        const translations = {
                            'zh': { 'not_exceeded': '未超阈', 'exceeded': '已超阈', 'warning': '警告' },
                            'en': { 'not_exceeded': 'Below Threshold', 'exceeded': 'Exceeded', 'warning': 'Warning' },
                            'ja': { 'not_exceeded': '閾値未満', 'exceeded': '閾値超過', 'warning': '警告' },
                            'ko': { 'not_exceeded': '임계값 미만', 'exceeded': '임계값 초과', 'warning': '경고' }
                        };
                        const text = translations[language] && translations[language][statusKey];
                        if (text) {
                            thresholdStatus.textContent = text;
                        }
                    }
                }
                
                // 更新价格统计文本
                const priceLabels = document.querySelectorAll('[data-price-label]');
                priceLabels.forEach(label => {
                    const labelKey = label.getAttribute('data-price-label');
                    if (labelKey === 'current-cumulative') {
                        const text = language === 'en' ? 'Current Cumulative Price' :
                                   language === 'ja' ? '現在の累積価格' :
                                   language === 'ko' ? '현재 누적 가격' : '当前累计价格';
                        label.textContent = text;
                    } else if (labelKey === 'forecast-cumulative') {
                        const text = language === 'en' ? 'Forecast Cumulative Price (5min)' :
                                   language === 'ja' ? '予測累積価格（5分）' :
                                   language === 'ko' ? '예측 누적 가격 (5분)' : '预测累计价格(5min)';
                        label.textContent = text;
                    } else if (labelKey === 'threshold-status') {
                        const text = language === 'en' ? 'Threshold Status' :
                                   language === 'ja' ? '閾値状態' :
                                   language === 'ko' ? '임계값 상태' : '阈值状态';
                        label.textContent = text;
                    }
                });
                
                // 更新百分比变化文本
                const changeElements = document.querySelectorAll('[data-change-text]');
                changeElements.forEach(elem => {
                    const changeValue = elem.getAttribute('data-change-text');
                    if (changeValue) {
                        const changeText = language === 'en' ? `↑ ${changeValue}% vs Yesterday` :
                                         language === 'ja' ? `↑ 昨日比${changeValue}%` :
                                         language === 'ko' ? `↑ 어제대비 ${changeValue}%` : `↑ 比昨日${changeValue}%`;
                        elem.textContent = changeText;
                    }
                });
                
                // 更新数量单位 (个 -> units)
                const countElements = ['totalHomes', 'confirmTargetDevices', 'targetDevices', 'totalFamiliesCard', 'todayDischargeFamilies', 'familySummaryCard'];
                countElements.forEach(id => {
                    const elem = document.getElementById(id);
                    if (elem && elem.textContent.includes('个')) {
                        const number = elem.textContent.replace('个', '');
                        const unit = language === 'en' ? '' : 
                                   language === 'ja' ? '個' :
                                   language === 'ko' ? '개' : '个';
                        elem.textContent = number + unit;
                    }
                });
                
                // 家庭单位已删除，不需要更新
                
                // 更新家庭/Family显示切换
                const chineseTexts = document.querySelectorAll('.chinese-text');
                const englishTexts = document.querySelectorAll('.english-text');
                
                if (language === 'en') {
                    chineseTexts.forEach(elem => elem.style.display = 'none');
                    englishTexts.forEach(elem => elem.style.display = 'inline');
                } else {
                    chineseTexts.forEach(elem => elem.style.display = 'inline');
                    englishTexts.forEach(elem => elem.style.display = 'none');
                }
                
                // 更新地区状态显示
                if (typeof updateRegionStatusDisplay === 'function') {
                    updateRegionStatusDisplay();
                } else {
                    console.warn('updateRegionStatusDisplay function not found');
                }
                
                // 更新电站状态标签
                if (typeof updateStationStatusLabel === 'function') {
                    const currentRegionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
                    updateStationStatusLabel(currentRegionStatus);
                } else {
                    console.warn('updateStationStatusLabel function not found');
                }
                
            } catch (error) {
                console.error('Error updating dynamic content:', error);
            }
        }
        
        // 更新图表标题
        function updateChartTitles(language) {
            // 更新市场图表
            if (marketChart) {
                const option = marketChart.getOption();
                if (option && option.legend && option.legend[0]) {
                    option.legend[0].data = [
                        window.i18n.getText('historicalPrice'),
                        window.i18n.getText('demand'),
                        window.i18n.getText('predictedPrice'),
                        window.i18n.getText('predictedDemand')
                    ];
                }
                if (option && option.yAxis) {
                    option.yAxis[0].name = window.i18n.getText('price');
                    option.yAxis[1].name = window.i18n.getText('demand');
                }
                if (option && option.series) {
                    option.series[0].name = window.i18n.getText('historicalPrice');
                    option.series[1].name = window.i18n.getText('demand');
                    option.series[2].name = window.i18n.getText('predictedPrice');
                    option.series[3].name = window.i18n.getText('predictedDemand');
                }
                marketChart.setOption(option, true);
            }
            
            // 更新功率图表
            if (powerChart) {
                const option = powerChart.getOption();
                if (option && option.legend && option.legend[0]) {
                    option.legend[0].data = [
                        window.i18n.getText('input'),
                        window.i18n.getText('output'),
                        window.i18n.getText('profit')
                    ];
                }
                if (option && option.series) {
                    option.series[0].name = window.i18n.getText('input');
                    option.series[1].name = window.i18n.getText('output');
                    option.series[2].name = window.i18n.getText('profit');
                }
                powerChart.setOption(option, true);
                
                // Force chart refresh for 'month' period to fix display issue
                if (powerChartTimeSelector && powerChartTimeSelector.getCurrentPeriod() === 'month') {
                    const { labels, power, revenue } = generateAnalyticsData('month');
                    updatePowerChartWithData(labels, power, revenue, 'month');
                }
            }
            
            // 更新图表标题
            const powerChartTitle = document.getElementById('powerChartTitle');
            if (powerChartTitle) {
                powerChartTitle.textContent = window.i18n.getText('powerRevenueTrend');
            }
        }
    


        // Device Command Modal Functions
        let isOperationActive = false;
        
        // 移除重复的函数定义，使用主要的handleCharge和handleDischarge函数
        
        
        function showDeviceCommandModal(operation, currentOpText) {
            const modal = document.getElementById('deviceCommandModal');
            const modalTitle = modal.querySelector('.modal-title');
            const operationType = document.getElementById('commandOperationType');
            const confirmBtn = document.getElementById('confirmCommandBtn');
            const warningMessage = modal.querySelector('.warning-message span');
            const executionTime = document.getElementById('commandExecutionTime');
            
            // Update modal based on operation type
            if (operation === 'charge') {
                modalTitle.textContent = window.i18n ? window.i18n.getText('confirmCharge') : '确认充电';
                operationType.textContent = window.i18n ? window.i18n.getText('charge') : '充电';
                operationType.className = 'operation-type charge';
                operationType.style.color = '#00ff88';
                warningMessage.textContent = window.i18n ? window.i18n.getText('operationWarning') : '此操作将影响所有选中的设备，请确认后继续。';
                
                // Hide estimated revenue for charge
                const revenueRow = document.getElementById('estimatedRevenueRow');
                if (revenueRow) revenueRow.style.display = 'none';
            } else if (operation === 'discharge') {
                modalTitle.textContent = window.i18n ? window.i18n.getText('confirmDischarge') : '确认放电';
                operationType.textContent = window.i18n ? window.i18n.getText('discharge') : '放电';
                operationType.className = 'operation-type discharge';
                warningMessage.textContent = window.i18n ? window.i18n.getText('operationWarning') : '此操作将影响所有选中的设备，请确认后继续。';
                
                // Show estimated revenue for discharge
                const revenueRow = document.getElementById('estimatedRevenueRow');
                if (revenueRow) {
                    revenueRow.style.display = 'flex';
                    const revenueElement = document.getElementById('commandEstimatedRevenue');
                    if (revenueElement) {
                        revenueElement.innerHTML = '<span data-i18n="estimatedProfitValue">+$340</span>';
                    }
                }
            } else if (operation === 'stop') {
                modalTitle.textContent = window.i18n ? window.i18n.getText('confirmStop') : '确认停止';
                const stopText = window.i18n ? window.i18n.getText('stopOperation') : '停止操作';
                operationType.textContent = stopText;
                operationType.className = 'operation-type stop';
                warningMessage.textContent = window.i18n ? window.i18n.getText('stopWarning') : '停止操作将立即终止所有设备的充电/放电状态，设备将恢复到待机模式。';
                
                // Hide estimated revenue for stop
                const revenueRow = document.getElementById('estimatedRevenueRow');
                if (revenueRow) revenueRow.style.display = 'none';
            }
            
            // Store operation for execution
            confirmBtn.setAttribute('data-operation', operation);
            
            // Show modal
            modal.style.display = 'flex';
        }
        
        function closeDeviceCommandModal() {
            const modal = document.getElementById('deviceCommandModal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
                modal.style.opacity = '0';
            }
        }
        
        function executeDeviceCommand() {
            const confirmBtn = document.getElementById('confirmCommandBtn');
            const operation = confirmBtn.getAttribute('data-operation');
            
            closeDeviceCommandModal();
            
            // Update button states
            const chargeBtn = document.getElementById('chargeBtn');
            const dischargeBtn = document.getElementById('dischargeBtn');
            const actionButtons = document.querySelector('.action-buttons');
            
            if (operation === 'stop') {
                // 执行停止操作
                executeStopOperation();
            } else {
                // Set active operation
                isOperationActive = true;
                currentOperation = operation;
                
                // Add operating class to container for centering
                actionButtons.classList.add('operating');
                
                // Update buttons - only show one centered stop button
                if (operation === 'charge') {
                    chargeBtn.innerHTML = `<span data-i18n="stop">${window.i18n ? window.i18n.getText('stop') : '停止'}</span>`;
                    chargeBtn.classList.remove('charge-btn');
                    chargeBtn.classList.add('stop-btn');
                    chargeBtn.style.setProperty('background', 'linear-gradient(135deg, #ff4444, #ff6b6b)', 'important');
                    chargeBtn.style.setProperty('border', '2px solid rgba(255, 68, 68, 0.3)', 'important');
                    chargeBtn.style.setProperty('color', '#fff', 'important');
                    chargeBtn.style.setProperty('flex', '1', 'important');
                    chargeBtn.style.setProperty('max-width', '200px', 'important');
                    
                    // Hide discharge button
                    dischargeBtn.style.display = 'none';
                } else if (operation === 'discharge') {
                    dischargeBtn.innerHTML = `<span data-i18n="stop">${window.i18n ? window.i18n.getText('stop') : '停止'}</span>`;
                    dischargeBtn.classList.remove('discharge-btn');
                    dischargeBtn.classList.add('stop-btn');
                    dischargeBtn.style.setProperty('background', 'linear-gradient(135deg, #ff4444, #ff6b6b)', 'important');
                    dischargeBtn.style.setProperty('border', '2px solid rgba(255, 68, 68, 0.3)', 'important');
                    dischargeBtn.style.setProperty('color', '#fff', 'important');
                    dischargeBtn.style.setProperty('flex', '1', 'important');
                    dischargeBtn.style.setProperty('max-width', '200px', 'important');
                    
                    // Hide charge button
                    chargeBtn.style.display = 'none';
                }
            }
            
            // Only show modal immediately for stop operation
            // For charge/discharge, the animation will handle showing the modal when complete
            if (operation === 'stop') {
                setTimeout(() => {
                    // 不再自动打开详情抽屉
                }, 1500);
            }
        }
        
        function showNotification(message, type = 'info') {
            // Simple notification (you can enhance this)
        }
        
        // Operation Result Modal Functions
        function showOperationResultModal(operation) {
            const modal = document.getElementById('operationResultModal');
            const message = document.getElementById('operationResultMessage');
            const operationType = document.getElementById('resultOperationType');
            const targetDevices = document.getElementById('resultTargetDevices');
            
            // Set operation type
            if (operation === 'charge') {
                operationType.textContent = window.i18n ? window.i18n.getText('charge') : '充电';
                operationType.style.color = '#00ff88';
                message.textContent = window.i18n ? window.i18n.getText('chargingCompleteMessage') : '充电指令下发完成，以下是设备响应统计报告：';
            } else if (operation === 'discharge') {
                operationType.textContent = window.i18n ? window.i18n.getText('discharge') : '放电';
                operationType.style.color = '#ffd700';
                message.textContent = window.i18n ? window.i18n.getText('dischargingCompleteMessage') : '放电指令下发完成，以下是设备响应统计报告：';
            }
            
            // Set target devices - 英文模式只显示数字
            const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
            if (currentLanguage === 'en') {
                targetDevices.textContent = '500';
            } else {
                targetDevices.textContent = (window.i18n && window.i18n.getCurrentLanguage() === 'en') ? '500' : '500个';
            }
            
            // 生成随机统计数据
            const commandsReceived = Math.floor(Math.random() * 10) + 490; // 490-499
            const devicesActivated = Math.floor(Math.random() * 50) + 430; // 430-479
            const successRate = Math.floor((devicesActivated / 500) * 100);
            
            document.getElementById('commandsReceived').textContent = commandsReceived;
            document.getElementById('devicesActivated').textContent = devicesActivated;
            document.getElementById('successRate').textContent = successRate + '%';
            
            // 显示弹窗
            modal.style.display = 'block';
        }
        
        function closeOperationResultModal() {
            document.getElementById('operationResultModal').style.display = 'none';
        }
        
        function viewDetailsFromResult() {
            closeOperationResultModal();
            showDeviceResponseModal();
        }
        
        // Device Response Modal Functions
        function showDeviceResponseModal() {
            const modal = document.getElementById('deviceResponseModal');
            modal.style.display = 'flex';
            // Load data for the modal
            loadDeviceResponseData();
        }
        
        // Export device response statistics
        function exportDeviceResponseStatistics() {
            // Get current data from modal
            const operationType = document.getElementById('operationTypeDisplay').textContent;
            const targetDevices = document.getElementById('targetDevicesDisplay').textContent;
            const successCount = document.getElementById('modalSuccessCount').textContent;
            const executingCount = document.getElementById('modalExecutingCount').textContent;
            const failedCount = document.getElementById('modalFailedCount').textContent;

            // Get current language
            const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';

            // Create CSV headers based on language
            const headers = currentLanguage === 'en' ?
                ['Export Time', 'Operation Type', 'Target Devices', 'Success', 'Executing', 'Failed', 'Success Rate'] :
                ['导出时间', '操作类型', '影响设备', '下发成功', '执行中', '下发失败', '成功率'];

            // Calculate success rate
            const total = parseInt(successCount) + parseInt(executingCount) + parseInt(failedCount);
            const successRate = total > 0 ? ((parseInt(successCount) / total) * 100).toFixed(1) + '%' : '0%';

            // Get current timestamp
            const now = new Date();
            const timestamp = now.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            // Create CSV content
            let csvContent = '\uFEFF' + headers.join(',') + '\n'; // Add BOM for UTF-8

            // Add data row
            const row = [
                timestamp,
                operationType,
                targetDevices,
                successCount,
                executingCount,
                failedCount,
                successRate
            ];
            csvContent += row.join(',') + '\n';

            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', `device_response_statistics_${now.getTime()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Show success message
            const message = currentLanguage === 'en' ? 'Export successful!' : '导出成功！';
            alert(message);
        }

        function closeDeviceResponseModal() {
            document.getElementById('deviceResponseModal').style.display = 'none';
            // 设置标志，防止自动重新显示
            window.deviceResponseModalClosed = true;
        }

        // 从设备响应弹窗点击统计数字打开设备状态抽屉
        window.openDeviceStatusDrawerFromModal = function(type) {
            // 不关闭设备响应统计弹窗，直接打开设备状态抽屉
            openDeviceStatusDrawer(type);
        };
        
        function viewDeviceResponseDetails() {
            // 使用新的抽屉组件
            if (!window.deviceResponseDrawer) {
                window.deviceResponseDrawer = new DeviceResponseDrawer();
            }

            // 创建与操作记录页面相同格式的数据
            const operation = {
                id: Date.now(),
                time: new Date().toLocaleString(),
                command: currentOperation || 'charge',
                operator: 'System',
                region: selectedMainRegion || 'NSW',
                stations: 235,
                success: 230,
                failed: 5
            };

            // 打开抽屉 - 不关闭设备响应统计弹窗
            window.deviceResponseDrawer.open(operation);
        }
        
        
        function switchDeviceResponseTab(tabName, tabElement) {
            // Update active tab
            document.querySelectorAll('.modal-tab').forEach(tab => tab.classList.remove('active'));
            tabElement.classList.add('active');
            
            // Show corresponding content
            document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
            document.getElementById(tabName + 'Tab').style.display = 'block';
        }
        
        function loadDeviceResponseData(operation) {
            // 模拟加载设备响应数据
            const deviceData = {
                operation: operation || currentOperation || 'charge',
                totalDevices: 500,
                commandsReceived: Math.floor(Math.random() * 10) + 490,
                devicesActivated: Math.floor(Math.random() * 50) + 430,
                onlineDevices: Math.floor(Math.random() * 10) + 490,
                executingDevices: Math.floor(Math.random() * 50) + 430,
                stations: generateStationData(50), // 生成50个电站数据
                timeline: generateTimelineData()
            };
            
            // 存储数据以供后续使用
            window.currentDeviceResponseData = deviceData;
            
            return deviceData;
        }
        
        // 生成随机电站数据
        function generateStationData(count) {
            const stations = [];
            const regions = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'];
            const statuses = ['online', 'charging', 'discharging', 'idle', 'offline'];
            const statusLabels = {
                online: { zh: '在线', en: 'Online' },
                charging: { zh: '充电中', en: 'Charging' },
                discharging: { zh: '放电中', en: 'Discharging' },
                idle: { zh: '空闲', en: 'Idle' },
                offline: { zh: '离线', en: 'Offline' }
            };
            
            for (let i = 0; i < count; i++) {
                const region = regions[Math.floor(Math.random() * regions.length)];
                const status = statuses[Math.floor(Math.random() * statuses.length)];
                stations.push({
                    id: `${region}-${String(i + 1).padStart(3, '0')}`,
                    name: `Station ${region}-${String(i + 1).padStart(3, '0')}`,
                    region: region,
                    location: `${region} Region`,
                    capacity: Math.floor(Math.random() * 400) + 100, // 100-500 kWh
                    power: Math.floor(Math.random() * 200) + 50, // 50-250 kW
                    soc: Math.floor(Math.random() * 100), // 0-100%
                    status: status,
                    statusLabel: statusLabels[status]
                });
            }
            
            return stations;
        }
        
        // 生成时间线数据
        function generateTimelineData() {
            const now = new Date();
            const timeline = [];
            
            // 指令下发
            timeline.push({
                time: formatTime(now),
                title: { zh: '指令下发', en: 'Command Issued' },
                description: { zh: '系统向所有设备发送操作指令', en: 'System sent operation command to all devices' },
                type: 'success'
            });
            
            // 设备响应
            const responseTime = new Date(now.getTime() + 5000);
            const respondedCount = Math.floor(Math.random() * 10) + 490;
            timeline.push({
                time: formatTime(responseTime),
                title: { zh: '设备响应', en: 'Devices Responded' },
                description: { 
                    zh: `${respondedCount}个设备确认收到指令`, 
                    en: `${respondedCount} devices confirmed receipt of command` 
                },
                type: 'success'
            });
            
            // 开始执行
            const executionTime = new Date(now.getTime() + 15000);
            const executingCount = Math.floor(Math.random() * 50) + 430;
            timeline.push({
                time: formatTime(executionTime),
                title: { zh: '开始执行', en: 'Execution Started' },
                description: { 
                    zh: `${executingCount}个设备开始执行操作`, 
                    en: `${executingCount} devices started executing operation` 
                },
                type: 'active'
            });
            
            // 部分完成
            const partialTime = new Date(now.getTime() + 60000);
            const completedCount = Math.floor(Math.random() * 100) + 300;
            timeline.push({
                time: formatTime(partialTime),
                title: { zh: '部分完成', en: 'Partial Completion' },
                description: { 
                    zh: `${completedCount}个设备已完成操作`, 
                    en: `${completedCount} devices completed operation` 
                },
                type: 'info'
            });
            
            return timeline;
        }
        
        // 格式化时间
        function formatTime(date) {
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
        }
        
        
        // 添加全局强制切换到市场页面的命令
        window.forceMarket = function() {
            switchPanel('market');
            
            // 更新按钮状态
            const marketTab = document.querySelector('[onclick*="switchPanel(\'market\')"]');
            const mapTab = document.querySelector('[onclick*="switchPanel(\'map\')"]');
            if (marketTab) marketTab.classList.add('active');
            if (mapTab) mapTab.classList.remove('active');
            
            // 更新面板显示
            const marketPanel = document.getElementById('marketPanel');
            const mapPanel = document.getElementById('mapPanel');
            if (marketPanel) {
                marketPanel.style.display = 'block';
                marketPanel.classList.add('active');
            }
            if (mapPanel) {
                mapPanel.style.display = 'none';
                mapPanel.classList.remove('active');
            }
            
        };
        
        // 在控制台输出帮助信息
        
        // 添加手动测试函数
        window.testMarketChart = function() {
            const container = document.getElementById('marketChart');
            if (!container) {
                // error('Market chart container not found!');
                return;
            }
            
            
            // 销毁旧实例
            if (marketChart) {
                marketChart.dispose();
            }
            
            // 创建新实例
            marketChart = echarts.init(container);
            
            // 使用最简单的配置
            const option = {
                title: { text: 'Market Test' },
                xAxis: { type: 'category', data: ['A', 'B', 'C'] },
                yAxis: { type: 'value' },
                series: [{ data: [120, 200, 150], type: 'line' }]
            };
            
            marketChart.setOption(option);
        };
        
        window.testMapChart = function() {
            const container = document.getElementById('australiaMap');
            if (!container) {
                console.error('Map chart container not found!');
                return;
            }
            
            // 切换到地图面板
            switchPanel('map');
            
            setTimeout(() => {
                
                // 销毁旧实例
                if (mapChart) {
                    mapChart.dispose();
                }
                
                // 创建新实例
                mapChart = echarts.init(container);
                
                // 使用最简单的配置
                const option = {
                    title: { text: 'Map Test' },
                    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
                    yAxis: { type: 'value' },
                    series: [{ data: [120, 200, 150], type: 'bar' }]
                };
                
                mapChart.setOption(option);
            }, 300);
        };
        
        
        // 修复函数 - 重新初始化所有图表
        window.fixCharts = function() {
            
            // 确保容器可见
            const marketPanel = document.getElementById('marketPanel');
            const mapPanel = document.getElementById('mapPanel');
            
            // 激活市场面板
            marketPanel.classList.add('active');
            marketPanel.style.display = 'flex';
            mapPanel.classList.remove('active');
            mapPanel.style.display = 'none';
            
            // 重新初始化市场图表
            setTimeout(() => {
                if (marketChart) {
                    marketChart.dispose();
                }
                initMarketChart();
                
                // 切换到地图面板并初始化
                setTimeout(() => {
                    mapPanel.classList.add('active');
                    mapPanel.style.display = 'flex';
                    marketPanel.classList.remove('active');
                    marketPanel.style.display = 'none';
                    
                    if (mapChart) {
                        mapChart.dispose();
                    }
                    initMap();
                    
                    // 切回市场面板
                    setTimeout(() => {
                        marketPanel.classList.add('active');
                        marketPanel.style.display = 'flex';
                        mapPanel.classList.remove('active');
                        mapPanel.style.display = 'none';
                        
                        if (marketChart) {
                            if (marketChart && typeof marketChart.resize === 'function') {
                            if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                        }
                        }
                        
                    }, 500);
                }, 500);
            }, 100);
        };
        
        
        // Update power revenue chart when language changes
        window.updatePowerRevenueChartLanguage = function() {
            if (!powerRevenueChart) return;
            
            powerRevenueChart.setOption({
                legend: {
                    data: [window.i18n.getText('input'), window.i18n.getText('output'), window.i18n.getText('profit')]
                },
                yAxis: [
                    {
                        name: window.i18n.getText('discharge')
                    },
                    {
                        name: window.i18n.getText('profit')
                    }
                ],
                series: [
                    {
                        name: window.i18n.getText('input')
                    },
                    {
                        name: window.i18n.getText('output')
                    },
                    {
                        name: window.i18n.getText('profit')
                    }
                ]
            });
        };
        
        // Update market chart when language changes
        window.updateMarketChartLanguage = function() {
            if (!marketChart) return;
            
            const getText = (key) => window.i18n ? window.i18n.getText(key) : translations.en[key];
            const translations = {
                en: {
                    historicalPrice: 'Historical Price',
                    predictedPrice: 'Predicted Price',
                    demand: 'Demand',
                    predictedDemand: 'Predicted Demand',
                    price: 'Price ($/MWh)',
                    demandUnit: 'Demand (MW)'
                },
                zh: {
                    historicalPrice: '历史价格',
                    predictedPrice: '预测价格',
                    demand: '需求',
                    predictedDemand: '预测需求',
                    price: '价格 ($/MWh)',
                    demandUnit: '需求 (MW)'
                }
            };
            
            marketChart.setOption({
                legend: {
                    data: [getText('historicalPrice'), getText('demand'), getText('predictedPrice'), getText('predictedDemand')]
                },
                yAxis: [
                    {
                        name: getText('price')
                    },
                    {
                        name: getText('demandUnit')
                    }
                ],
                series: [
                    {
                        name: getText('historicalPrice')
                    },
                    {
                        name: getText('demand')
                    },
                    {
                        name: getText('predictedPrice')
                    },
                    {
                        name: getText('predictedDemand')
                    }
                ]
            });
        };
        
        // Force re-initialization when page is fully loaded
        window.addEventListener('load', function() {
            setTimeout(() => {
                // Force reinitialize market chart if it's not visible
                const marketPanel = document.getElementById('marketPanel');
                if (marketPanel && marketPanel.classList.contains('active')) {
                    const marketContainer = document.getElementById('marketChart');
                    if (marketContainer && (!marketChart || marketContainer.offsetHeight === 0)) {
                        initMarketChart();
                    } else if (marketChart) {
                        if (marketChart && typeof marketChart.resize === 'function') {
                            if (marketChart && typeof marketChart.resize === 'function') {
                        marketChart.resize();
                    }
                        }
                    }
                }
            }, 1000);
        });
        
    


        
        // 模拟地区数据 - 扩展全局regionData对象
        Object.assign(regionData, {
            'NSW': {
                status: 'none',
                chargeTime: '08:00-09:00',
                dischargeTime: '18:00-22:00',
                chargePrice: '60$',
                dischargePrice: '120$',
                chargeSoc: '70%',
                dischargeSoc: '30%'
            },
            'QLD': {
                status: 'autoCharge',
                chargeTime: '07:00-11:00',
                dischargeTime: '17:00-21:00',
                chargePrice: '45$',
                dischargePrice: '110$',
                chargeSoc: '75%',
                dischargeSoc: '25%'
            },
            'VIC': {
                status: 'manualCharge',
                chargeTime: '06:00-10:00',
                dischargeTime: '19:00-23:00',
                chargePrice: '55$',
                dischargePrice: '130$',
                chargeSoc: '80%',
                dischargeSoc: '20%'
            },
            'SA': {
                status: 'autoDischarge',
                chargeTime: '09:00-13:00',
                dischargeTime: '16:00-20:00',
                chargePrice: '50$',
                dischargePrice: '125$',
                chargeSoc: '85%',
                dischargeSoc: '15%'
            },
            'TAS': {
                status: 'manualDischarge',
                chargeTime: '10:00-14:00',
                dischargeTime: '15:00-19:00',
                chargePrice: '40$',
                dischargePrice: '100$',
                chargeSoc: '90%',
                dischargeSoc: '10%'
            }
        });
        
        // 状态文本映射
        const statusText = {
            'none': { 'zh': '', 'en': '' },
            'autoCharge': { 'zh': '智能充电', 'en': 'AI Charge' },
            'autoDischarge': { 'zh': '智能放电', 'en': 'AI Discharge' },
            'manualCharge': { 'zh': '手动充电', 'en': 'Manual Charge' },
            'manualDischarge': { 'zh': '手动放电', 'en': 'Manual Discharge' }
        };
        
        // 当前条件视图状态
        let currentConditionView = 'default';
        
        // 显示自动条件
        function showAutoCondition() {
            const autoBtn = document.getElementById('autoConditionBtn');
            const regionOverviewCard = document.getElementById('regionOverviewCard');
            
            if (regionOverviewCard) {
                if (regionOverviewCard.style.display === 'none' || !regionOverviewCard.style.display) {
                    // 显示卡片
                    regionOverviewCard.style.display = 'block';
                    // 更新按钮为选中状态 - 使用深色主题风格
                    autoBtn.style.background = 'rgba(0, 255, 136, 0.15)';
                    autoBtn.style.color = '#00ff88';
                    autoBtn.style.border = '2px solid rgba(0, 255, 136, 0.3)';
                    autoBtn.style.boxShadow = '0 0 0 4px rgba(0, 255, 136, 0.1)';
                    autoBtn.style.fontWeight = '700';
                    autoBtn.style.transform = 'scale(1)';
                    autoBtn.classList.add('selected');
                    // 如果是缩小状态，展开它
                    if (regionOverviewCardMinimized) {
                        toggleRegionOverviewCardExpansion();
                    }
                } else {
                    // 隐藏卡片
                    regionOverviewCard.style.display = 'none';
                    // 恢复按钮为未选中状态
                    autoBtn.style.background = 'rgba(255, 255, 255, 0.08)';
                    autoBtn.style.color = 'rgba(255, 255, 255, 0.8)';
                    autoBtn.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                    autoBtn.style.boxShadow = 'none';
                    autoBtn.style.fontWeight = '600';
                    autoBtn.style.transform = 'scale(1)';
                    autoBtn.classList.remove('selected');
                }
            }
        }
        
        // 显示充电条件
        function showChargeCondition() {
            const chargeBtn = document.getElementById('chargeConditionBtn');
            const dischargeBtn = document.getElementById('dischargeConditionBtn');
            const defaultContainer = document.querySelector('.region-selection-tabs');
            const conditionContainer = document.getElementById('conditionRegionContainer');
            const selectorContainer = document.getElementById('regionSelectorContainer');
            
            if (currentConditionView === 'charge') {
                // 取消充电条件视图
                currentConditionView = 'default';
                chargeBtn.style.background = 'rgba(255,255,255,0.08)';
                chargeBtn.style.color = 'var(--color-text-secondary)';
                // 显示默认地区选择，隐藏条件地区选择
                defaultContainer.style.display = 'flex';
                conditionContainer.style.display = 'none';
                // 恢复默认高度
                selectorContainer.style.minHeight = '80px';
                // 确保选中的地区保持active状态
                const activeTab = document.querySelector(`.region-select-tab[data-region="${selectedMainRegion}"]`);
                if (activeTab && !activeTab.classList.contains('active')) {
                    selectMainRegion(selectedMainRegion, activeTab);
                }
            } else {
                // 显示充电条件视图
                currentConditionView = 'charge';
                chargeBtn.style.background = '#4CD964';
                chargeBtn.style.color = '#000';
                // 重置放电按钮
                dischargeBtn.style.background = 'rgba(255,255,255,0.08)';
                dischargeBtn.style.color = 'var(--color-text-secondary)';
                // 隐藏默认地区选择，显示条件地区选择
                defaultContainer.style.display = 'none';
                conditionContainer.style.display = 'flex';
                createConditionRegions('charge');
                // 调整容器高度以适应条件视图
                selectorContainer.style.minHeight = '140px';
                // 更新内容区域显示当前选中地区的数据
                updatePriceCircleRegion(selectedMainRegion);
            }
            
            // 延迟调整间距，等待高度动画完成
            setTimeout(() => {
                adjustSpacingForRegionSelector();
            }, 160);
        }
        
        // 显示放电条件
        function showDischargeCondition() {
            const chargeBtn = document.getElementById('chargeConditionBtn');
            const dischargeBtn = document.getElementById('dischargeConditionBtn');
            const defaultContainer = document.querySelector('.region-selection-tabs');
            const conditionContainer = document.getElementById('conditionRegionContainer');
            const selectorContainer = document.getElementById('regionSelectorContainer');
            
            if (currentConditionView === 'discharge') {
                // 取消放电条件视图
                currentConditionView = 'default';
                dischargeBtn.style.background = 'rgba(255,255,255,0.08)';
                dischargeBtn.style.color = 'var(--color-text-secondary)';
                // 显示默认地区选择，隐藏条件地区选择
                defaultContainer.style.display = 'flex';
                conditionContainer.style.display = 'none';
                // 恢复默认高度
                selectorContainer.style.minHeight = '80px';
                // 确保选中的地区保持active状态
                const activeTab = document.querySelector(`.region-select-tab[data-region="${selectedMainRegion}"]`);
                if (activeTab && !activeTab.classList.contains('active')) {
                    selectMainRegion(selectedMainRegion, activeTab);
                }
            } else {
                // 显示放电条件视图
                currentConditionView = 'discharge';
                dischargeBtn.style.background = '#FFC107';
                dischargeBtn.style.color = '#000';
                // 重置充电按钮
                chargeBtn.style.background = 'rgba(255,255,255,0.08)';
                chargeBtn.style.color = 'var(--color-text-secondary)';
                // 隐藏默认地区选择，显示条件地区选择
                defaultContainer.style.display = 'none';
                conditionContainer.style.display = 'flex';
                createConditionRegions('discharge');
                // 调整容器高度以适应条件视图
                selectorContainer.style.minHeight = '140px';
                // 更新内容区域显示当前选中地区的数据
                updatePriceCircleRegion(selectedMainRegion);
            }
            
            // 延迟调整间距，等待高度动画完成
            setTimeout(() => {
                adjustSpacingForRegionSelector();
            }, 160);
        }
        
        // 创建条件地区按钮
        function createConditionRegions(type) {
            const container = document.getElementById('conditionRegionContainer');
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            
            container.innerHTML = '';
            container.style.display = 'flex';
            
            regions.forEach((region, index) => {
                const timeText = window.i18n ? window.i18n.getText('timeCondition') : '时间条件';
                const priceText = window.i18n ? window.i18n.getText('priceCondition') : '价格条件';
                const chargeStopSOCText = window.i18n ? window.i18n.getText('chargeStopSOC') : '充电停止SOC';
                const dischargeStopSOCText = window.i18n ? window.i18n.getText('dischargeStopSOC') : '放电停止SOC';
                
                const bgColor = type === 'charge' ? '#4CD964' : 
                               type === 'discharge' ? '#FFC107' : 
                               'linear-gradient(135deg, #00ff88, #00dd77)';
                
                // 检查是否是当前选中的地区（与主地区选择保持一致）
                const isSelected = region === selectedMainRegion;
                
                const button = document.createElement('button');
                button.className = 'condition-region-btn';
                button.dataset.region = region;
                
                // 根据type调整按钮高度
                const minHeight = type === 'auto' ? '160px' : '100px';
                
                button.style.cssText = `
                    padding: 14px 16px;
                    background: ${isSelected ? bgColor : 'transparent'};
                    color: ${isSelected ? '#000' : 'var(--color-text-secondary)'};
                    border: ${isSelected ? '2px solid #000' : '1px solid var(--color-border)'};
                    border-radius: 50px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: flex-start;
                    justify-content: flex-start;
                    flex: 1;
                    min-height: ${minHeight};
                    flex-direction: column;
                    gap: 4px;
                `;
                
                // 获取该地区的状态
                const status = regionData[region].status;
                let statusBadgeHTML = '';
                
                if (status !== 'none') {
                    const statusTextMap = {
                        'autoCharge': window.i18n ? window.i18n.getText('autoCharge') : '智能充电',
                        'manualCharge': window.i18n ? window.i18n.getText('manualCharge') : '手动充电',
                        'autoDischarge': window.i18n ? window.i18n.getText('autoDischarge') : '智能放电',
                        'manualDischarge': window.i18n ? window.i18n.getText('manualDischarge') : '手动放电'
                    };
                    const statusText = statusTextMap[status] || status;
                    
                    // 为选中状态优化样式，确保在彩色背景上的可读性
                    if (isSelected) {
                        const borderStyle = (status === 'autoCharge' || status === 'autoDischarge') ? 'dashed' : 'solid';
                        statusBadgeHTML = `<span style="background: rgba(0,0,0,0.3); color: #000; padding: 6px 12px; border-radius: 16px; font-size: 13px; font-weight: 700; border: 1px ${borderStyle} #000;">${statusText}</span>`;
                    } else {
                        const statusStyle = getStatusStyle(status, false);
                        statusBadgeHTML = `<span style="${statusStyle.cssText}">${statusText}</span>`;
                    }
                }
                
                // 根据type生成不同的内容
                if (type === 'auto') {
                    button.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px; width: 100%; padding: 0 8px;">
                            <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                                <span style="font-size: 14px; font-weight: 600;">${region}</span>
                                ${statusBadgeHTML}
                            </div>
                            <div style="font-size: 11px; opacity: 0.9; text-align: left; line-height: 1.6; display: flex; flex-direction: column; gap: 6px;">
                                <div style="color: #4CD964; font-weight: 600;">充电条件</div>
                                <div style="padding-left: 8px;">
                                    <div>${timeText}: ${regionData[region].chargeTime}</div>
                                    <div>${priceText}: ${regionData[region].chargePrice}</div>
                                    <div>${chargeStopSOCText}: ${regionData[region].chargeSoc}</div>
                                </div>
                                <div style="color: #FFC107; font-weight: 600;">放电条件</div>
                                <div style="padding-left: 8px;">
                                    <div>${timeText}: ${regionData[region].dischargeTime}</div>
                                    <div>${priceText}: ${regionData[region].dischargePrice}</div>
                                    <div>${dischargeStopSOCText}: ${regionData[region].dischargeSoc}</div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    const stopSOCText = type === 'charge' ? chargeStopSOCText : dischargeStopSOCText;
                    button.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; width: 100%; padding: 0 8px;">
                            <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                                <span style="font-size: 14px; font-weight: 600;">${region}</span>
                                ${statusBadgeHTML}
                            </div>
                            <div style="font-size: 11px; opacity: 0.9; text-align: left; line-height: 1.6; display: flex; flex-direction: column; gap: 4px;">
                                <div>${timeText}: ${type === 'charge' ? regionData[region].chargeTime : regionData[region].dischargeTime}</div>
                                <div>${priceText}: ${type === 'charge' ? regionData[region].chargePrice : regionData[region].dischargePrice}</div>
                                <div>${stopSOCText}: ${type === 'charge' ? regionData[region].chargeSoc : regionData[region].dischargeSoc}</div>
                            </div>
                        </div>
                    `;
                }
                
                button.onclick = function() {
                    selectConditionRegion(region, this, type);
                };
                
                container.appendChild(button);
            });
        }
        
        // 选择条件地区
        function selectConditionRegion(region, button, type) {
            // 更新selectedMainRegion以保持与主地区选择同步
            selectedMainRegion = region;
            
            // 重新创建条件地区按钮以反映新的选中状态
            createConditionRegions(type);
            
            // 获取该地区的状态
            const regionStatus = regionData[region].status;
            
            // 更新电站管理状态
            updatePowerStationStatus(region, regionStatus);

            // 更新相关显示
            updatePriceCircleRegion(region);

            // 更新页面数据 - 这是关键的缺失部分
            updatePageDataByRegion(region);
            
            // 更新地区显示
            updateRegionDisplay();
            
            // 调整间距
            // 延迟调整间距，等待高度动画完成
            setTimeout(() => {
                adjustSpacingForRegionSelector();
            }, 160);
        }
        
        // 更新地区显示
        function updateRegionDisplay() {
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            const currentLanguage = getCurrentLanguage() || 'zh';
            
            
            regions.forEach(region => {
                const regionButton = document.querySelector(`[data-region="${region}"]`);
                if (!regionButton) {
                    return;
                }
                
                // 重新获取span元素，因为innerHTML可能改变了DOM结构
                let regionSpan = regionButton.querySelector('span:first-child');
                let statusBadge = regionButton.querySelector('.region-status-badge');
                
                if (!regionSpan || !statusBadge) {
                    return;
                }
                
                // 默认状态：只显示地区名称和状态
                regionSpan.textContent = region;
                
                // 确保地区名称有正确的颜色
                const isActive = regionButton.classList.contains('active');
                if (isActive) {
                    regionSpan.style.color = '#000'; // 选中的地区用黑色文字（在亮绿色背景上）
                    regionSpan.style.fontWeight = '700';
                } else {
                    regionSpan.style.color = 'var(--color-text-secondary)'; // 未选中的地区用次要文字颜色
                    regionSpan.style.fontWeight = '500';
                }
                
                // 更新data-status属性
                statusBadge.setAttribute('data-status', regionData[region].status);
                
                // 根据地区状态决定是否显示状态标记
                const status = regionData[region].status;
                if (status === 'none') {
                    statusBadge.style.display = 'none';
                    statusBadge.innerHTML = '';
                } else {
                    // 获取状态样式
                    const statusStyle = getStatusStyle(status, isActive);
                    statusBadge.style.cssText = statusStyle.cssText;
                    statusBadge.innerHTML = statusStyle.text;
                    statusBadge.style.display = 'inline-block';
                }
            });
            
            // 调整间距
            setTimeout(adjustSpacingForRegionSelector, 100);
        }
        
        // 获取状态标记样式
        function getStatusStyle(status, isActive) {
            if (status === 'none') return { cssText: '', text: '' };
            
            const statusTextMap = {
                'autoCharge': window.i18n ? window.i18n.getText('autoCharge') : '智能充电',
                'manualCharge': window.i18n ? window.i18n.getText('manualCharge') : '手动充电',
                'autoDischarge': window.i18n ? window.i18n.getText('autoDischarge') : '智能放电',
                'manualDischarge': window.i18n ? window.i18n.getText('manualDischarge') : '手动放电'
            };
            
            const statusColors = {
                'autoCharge': { bg: 'rgba(76, 217, 100, 0.2)', color: '#4CD964', border: '#4CD964', borderStyle: 'dashed' },
                'manualCharge': { bg: 'rgba(76, 217, 100, 0.2)', color: '#4CD964', border: '#4CD964', borderStyle: 'solid' },
                'autoDischarge': { bg: 'rgba(255, 193, 7, 0.2)', color: '#FFC107', border: '#FFC107', borderStyle: 'dashed' },
                'manualDischarge': { bg: 'rgba(255, 193, 7, 0.2)', color: '#FFC107', border: '#FFC107', borderStyle: 'solid' }
            };
            
            const style = statusColors[status];
            const text = statusTextMap[status];
            if (!style || !text) return { cssText: '', text: '' };
            
            // 如果是选中状态，使用黑色文字和边框
            const textColor = isActive ? '#000' : style.color;
            const borderColor = isActive ? '#000' : style.border;
            
            const cssText = `background: ${style.bg}; color: ${textColor}; padding: 6px 12px; border-radius: 16px; font-size: 13px; font-weight: 700; border: 1px ${style.borderStyle} ${borderColor};`;
            
            return { cssText, text };
        }
        
        
        // 动态调整间距以适应地区选择栏高度变化
        function adjustSpacingForRegionSelector() {
            const regionSelector = document.querySelector('.region-selector-fixed');
            const mainContent = document.querySelector('.main-content-scrollable');
            const regionSelectorContainer = document.getElementById('regionSelectorContainer');
            
            if (regionSelector && mainContent && regionSelectorContainer) {
                // 获取regionSelectorContainer的实际高度（这是包含内容的容器）
                const containerRect = regionSelectorContainer.getBoundingClientRect();
                const containerHeight = containerRect.height;
                
                // 获取region-selector-fixed的padding
                const selectorStyles = window.getComputedStyle(regionSelector);
                const paddingTop = parseFloat(selectorStyles.paddingTop) || 0;
                const paddingBottom = parseFloat(selectorStyles.paddingBottom) || 0;
                
                // 计算总高度
                const totalHeight = containerHeight + paddingTop + paddingBottom;
                
                // 基础top值(100px) + 选择器总高度 + 额外间距
                const extraSpacing = currentConditionView !== 'default' ? 30 : 20;
                const newMarginTop = 100 + totalHeight + extraSpacing;
                
                // 设置新的margin-top
                mainContent.style.marginTop = newMarginTop + 'px';
                
            }
        }
        
        // 添加ResizeObserver监听地区选择器高度变化
        let regionSelectorObserver;
        
        function initRegionSelectorObserver() {
            const regionSelectorContainer = document.getElementById('regionSelectorContainer');
            if (regionSelectorContainer && !regionSelectorObserver) {
                regionSelectorObserver = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        // 使用requestAnimationFrame确保在DOM更新后调整间距
                        requestAnimationFrame(() => {
                            adjustSpacingForRegionSelector();
                        });
                    }
                });
                regionSelectorObserver.observe(regionSelectorContainer);
            }
        }
        
        // 清理ResizeObserver
        function cleanupRegionSelectorObserver() {
            if (regionSelectorObserver) {
                regionSelectorObserver.disconnect();
                regionSelectorObserver = null;
            }
        }
        
        // 更新地区状态显示
        function updateRegionStatusDisplay() {
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            const currentLanguage = getCurrentLanguage() || 'zh';
            
            regions.forEach(region => {
                const regionButton = document.querySelector(`[data-region="${region}"]`);
                if (!regionButton) {
                    return;
                }
                
                const statusBadge = regionButton.querySelector('.region-status-badge');
                if (!statusBadge) {
                    return;
                }
                
                const status = regionData[region].status;
                
                // 使用i18n系统获取状态文本
                let statusDisplay = '';
                if (status !== 'none') {
                    const statusTextMap = {
                        'autoCharge': window.i18n ? window.i18n.getText('autoCharge') : '智能充电中',
                        'manualCharge': window.i18n ? window.i18n.getText('manualCharge') : '手动充电中',
                        'autoDischarge': window.i18n ? window.i18n.getText('autoDischarge') : '智能放电中',
                        'manualDischarge': window.i18n ? window.i18n.getText('manualDischarge') : '手动放电中',
                        'waitingExecution': window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中'
                    };
                    statusDisplay = statusTextMap[status] || status;
                } else {
                    // 对于所有地区，如果是自动模式，显示"等待执行中"
                    if (currentOperationMode === 'auto') {
                        statusDisplay = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
                    }
                }
                
                // 特殊处理NSW：如果其状态为waitingExecution，确保显示文字
                if (region === 'NSW' && status === 'waitingExecution') {
                    statusDisplay = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
                }
                
                // 更新状态文本
                statusBadge.textContent = statusDisplay;
                
                // 根据显示状态设置data-status属性
                if (statusDisplay && currentOperationMode === 'auto' && status === 'none') {
                    statusBadge.setAttribute('data-status', 'waitingExecution');
                } else {
                    statusBadge.setAttribute('data-status', status);
                }
                
                // 根据状态设置颜色和边框样式
                const statusColors = {
                    'none': { bg: 'transparent', color: 'transparent', border: 'transparent', borderStyle: 'none' },
                    'autoCharge': { bg: 'rgba(76, 217, 100, 0.2)', color: '#4CD964', border: '#4CD964', borderStyle: 'dashed' },
                    'manualCharge': { bg: 'rgba(76, 217, 100, 0.2)', color: '#4CD964', border: '#4CD964', borderStyle: 'solid' },
                    'autoDischarge': { bg: 'rgba(255, 193, 7, 0.2)', color: '#FFC107', border: '#FFC107', borderStyle: 'dashed' },
                    'manualDischarge': { bg: 'rgba(255, 193, 7, 0.2)', color: '#FFC107', border: '#FFC107', borderStyle: 'solid' },
                    'waitingExecution': { bg: 'rgba(30, 127, 255, 0.2)', color: '#1E7FFF', border: '#1E7FFF', borderStyle: 'dashed' }
                };
                
                // 获取实际的显示状态
                let displayStatus = status;
                if (statusDisplay && currentOperationMode === 'auto' && status === 'none') {
                    displayStatus = 'waitingExecution';
                }
                
                let colorScheme = statusColors[displayStatus];
                let shouldDisplay = displayStatus !== 'none';
                
                // 确保waitingExecution状态被正确显示
                if (displayStatus === 'waitingExecution') {
                    shouldDisplay = true;
                }
                
                if (colorScheme) {
                    statusBadge.style.background = colorScheme.bg;
                    statusBadge.style.color = colorScheme.color;
                    statusBadge.style.borderColor = colorScheme.border;
                    statusBadge.style.borderStyle = colorScheme.borderStyle;
                    statusBadge.style.borderWidth = shouldDisplay ? '1px' : '0';
                    statusBadge.style.display = shouldDisplay ? 'inline-block' : 'none';
                    statusBadge.style.fontSize = '13px';
                    statusBadge.style.fontWeight = '700';
                    statusBadge.style.padding = '6px 12px';
                }
            });
            
            // 每次更新显示后调整间距
            setTimeout(adjustSpacingForRegionSelector, 100);
            
            // 更新大圆内的状态显示
            updateCircleStatusDisplay();
        }
        
        // 更新大圆内的状态显示
        function updateCircleStatusDisplay() {
            const priceDisplay = document.getElementById('priceDisplay');
            const statusDisplay = document.getElementById('statusDisplay');
            const statusTextElement = document.getElementById('statusText');
            
            if (!priceDisplay || !statusDisplay || !statusTextElement) return;
            
            const selectedRegion = selectedMainRegion;
            if (!selectedRegion) return;
            
            const regionStatus = regionData[selectedRegion] ? regionData[selectedRegion].status : 'none';
            const data = regionData[selectedRegion];
            
            
            // 总是显示价格，隐藏单独的状态显示
            priceDisplay.style.display = 'block';
            priceDisplay.style.opacity = '1';
            statusDisplay.style.display = 'none';
            statusDisplay.style.opacity = '0';
            
            // 更新价格显示中的状态标签，根据地区的实际状态
            const stationStatusLabel = document.getElementById('stationStatusLabel');
            if (stationStatusLabel) {
                let statusText = '';
                
                if (regionStatus === 'autoCharge') {
                    statusText = window.i18n ? window.i18n.getText('autoCharge') : '智能充电中';
                } else if (regionStatus === 'autoDischarge') {
                    statusText = window.i18n ? window.i18n.getText('autoDischarge') : '智能放电中';
                } else if (regionStatus === 'manualCharge') {
                    statusText = window.i18n ? window.i18n.getText('manualCharge') : '手动充电中';
                } else if (regionStatus === 'manualDischarge') {
                    statusText = window.i18n ? window.i18n.getText('manualDischarge') : '手动放电中';
                } else if (regionStatus === 'waitingExecution') {
                    statusText = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
                } else {
                    // 无状态时根据当前模式显示
                    if (currentOperationMode === 'auto') {
                        statusText = window.i18n ? window.i18n.getText('waitingExecution') : '等待执行中';
                    } else {
                        statusText = window.i18n ? window.i18n.getText('manualMode') : '手动模式';
                    }
                }
                
                stationStatusLabel.textContent = statusText;
                stationStatusLabel.style.color = 'rgba(255,255,255,0.9)';
            }
            
            // 更新自动开关的禁用状态
            updateAutoSwitchDisabledState();
        }
        
        // 更新自动开关的禁用状态
        function updateAutoSwitchDisabledState() {
            const operationStatus = getRegionOperationStatus(selectedMainRegion);
            const isOperationActive = operationStatus === 'charging' || operationStatus === 'discharging';
            const toggleSwitch = document.querySelector('.auto-toggle-switch');
            
            if (!toggleSwitch) return;
            
            if (isOperationActive) {
                // 禁用状态：降低透明度，添加禁用光标
                toggleSwitch.style.opacity = '0.5';
                toggleSwitch.style.cursor = 'not-allowed';
                toggleSwitch.style.pointerEvents = 'auto'; // 保持可点击以显示提示
            } else {
                // 启用状态：恢复正常外观
                toggleSwitch.style.opacity = '1';
                toggleSwitch.style.cursor = 'pointer';
                toggleSwitch.style.pointerEvents = 'auto';
            }
        }
        
        // 获取当前语言
        function getCurrentLanguage() {
            // 优先从i18n系统获取当前语言
            if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
                return window.i18n.getCurrentLanguage();
            }
            // 降级方案：从HTML属性获取
            return document.documentElement.getAttribute('data-language') || 
                   document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
        }
        
        // 初始化显示
        document.addEventListener('DOMContentLoaded', function() {
            updateRegionDisplay();
            // 初始化圆形状态显示
            updateCircleStatusDisplay();
            // 初始化时调整间距
            setTimeout(adjustSpacingForRegionSelector, 300);
            
            // 强制更新NSW状态显示
            setTimeout(() => {
                updateRegionStatusDisplay();
            }, 500);
            
            // 初始化ResizeObserver监听地区选择器高度变化
            setTimeout(() => {
                initRegionSelectorObserver();
            }, 500);
            
            // 确保初始选中的地区有正确的颜色
            setTimeout(() => {
                const activeRegion = document.querySelector('.region-select-tab.active');
                if (activeRegion) {
                    activeRegion.style.background = 'var(--color-region-primary)';
                    activeRegion.style.color = '#000';
                    const activeSpan = activeRegion.querySelector('span:first-child');
                    if (activeSpan && !activeSpan.innerHTML.includes('<div')) {
                        activeSpan.style.color = '#000';
                        activeSpan.style.fontWeight = '700';
                    }
                }
            }, 100);
        });
        
        // 立即执行一次初始化（防止DOMContentLoaded已经触发）
        setTimeout(function() {
            updateRegionDisplay();
            adjustSpacingForRegionSelector();
            
            // 初始化ResizeObserver
            setTimeout(() => {
                initRegionSelectorObserver();
            }, 200);
            
            // 确保选中地区颜色正确
            const activeRegion = document.querySelector('.region-select-tab.active');
            if (activeRegion) {
                activeRegion.style.background = 'var(--color-region-primary)';
                activeRegion.style.color = '#000';
                const activeSpan = activeRegion.querySelector('span:first-child');
                if (activeSpan && !activeSpan.innerHTML.includes('<div')) {
                    activeSpan.style.color = '#000';
                    activeSpan.style.fontWeight = '700';
                }
            }
        }, 100);
        
        // 更强制的初始化
        window.addEventListener('load', function() {
            updateRegionDisplay();
            setTimeout(adjustSpacingForRegionSelector, 500);
            
            // 确保ResizeObserver已初始化
            setTimeout(() => {
                initRegionSelectorObserver();
            }, 600);
            
            // 最终确保选中地区颜色正确
            setTimeout(() => {
                const activeRegion = document.querySelector('.region-select-tab.active');
                if (activeRegion) {
                    activeRegion.style.background = 'var(--color-region-primary)';
                    activeRegion.style.color = '#000';
                    const activeSpan = activeRegion.querySelector('span:first-child');
                    if (activeSpan && !activeSpan.innerHTML.includes('<div')) {
                        activeSpan.style.color = '#000';
                        activeSpan.style.fontWeight = '700';
                    }
                }
            }, 200);
        });
        
        // 如果页面已经加载完成，立即执行
        if (document.readyState === 'complete') {
            updateRegionDisplay();
            setTimeout(adjustSpacingForRegionSelector, 100);
            
            // 立即初始化ResizeObserver
            setTimeout(() => {
                initRegionSelectorObserver();
            }, 150);
            
            // 确保选中地区颜色正确
            setTimeout(() => {
                const activeRegion = document.querySelector('.region-select-tab.active');
                if (activeRegion) {
                    activeRegion.style.background = 'var(--color-region-primary)';
                    activeRegion.style.color = '#000';
                    const activeSpan = activeRegion.querySelector('span:first-child');
                    if (activeSpan && !activeSpan.innerHTML.includes('<div')) {
                        activeSpan.style.color = '#000';
                        activeSpan.style.fontWeight = '700';
                    }
                }
            }, 50);
        }
        
        // 测试功能：强制更新翻译
        window.forceUpdateTranslations = function() {
            if (window.i18n && window.i18n.updatePageTexts) {
                window.i18n.updatePageTexts();
            }
            updateRegionDisplay();
            setTimeout(adjustSpacingForRegionSelector, 100);
            
            // 确保ResizeObserver已初始化
            setTimeout(() => {
                initRegionSelectorObserver();
            }, 120);
            
            // 确保选中地区颜色正确
            setTimeout(() => {
                const activeRegion = document.querySelector('.region-select-tab.active');
                if (activeRegion) {
                    activeRegion.style.background = 'var(--color-region-primary)';
                    activeRegion.style.color = '#000';
                    const activeSpan = activeRegion.querySelector('span:first-child');
                    if (activeSpan && !activeSpan.innerHTML.includes('<div')) {
                        activeSpan.style.color = '#000';
                        activeSpan.style.fontWeight = '700';
                    }
                }
            }, 150);
        };
        
        // 条件设置弹窗功能
        
        // Simplified modal - old complex functions removed
        
        // Simplified settings - removed complex timeline variables
        
        // Removed complex timeline functions - simplified modal only needs basic settings
        
        // 多段时间选择功能
        let currentConditionType = 'charge'; // 当前条件类型: charge 或 discharge
        let currentSelectedRegion = 'NSW'; // 当前选中的地区
        let selectedRegionData = {}; // 存储每个地区的时间设置
        
        // 时间段数据结构
        let chargeTimeSettings = { segments: [{ start: 22, end: 6, id: 'charge-1' }] }; // 22:00 - 06:00
        let dischargeTimeSettings = { segments: [{ start: 6, end: 22, id: 'discharge-1' }] }; // 06:00 - 22:00
        
        function switchConditionType(type) {
            // 保存当前数据
            saveRegionData(currentSelectedRegion, currentConditionType);
            
            // 切换条件类型
            currentConditionType = type;
            
            // 加载新的数据
            loadRegionData(currentSelectedRegion, type);
            
            // 更新UI
            updateModalUI();
            updateTimelineDisplay();
            updateModalCurrentSettings();
        }
        
        function switchModalRegion(region, button) {
            // 保存当前数据
            saveRegionData(currentSelectedRegion, currentConditionType);
            
            // 切换地区
            currentSelectedRegion = region;
            
            // 更新地区按钮状态
            document.querySelectorAll('.modal-region-tab').forEach(tab => {
                tab.classList.remove('active');
                tab.style.background = 'rgba(255,255,255,0.1)';
                tab.style.color = 'rgba(255,255,255,0.7)';
                tab.style.border = '1px solid rgba(255,255,255,0.2)';
            });
            
            button.classList.add('active');
            button.style.background = 'var(--color-region-primary)';
            button.style.color = '#000';
            button.style.border = 'none';
            
            // 加载新地区数据
            loadRegionData(region, currentConditionType);
            
            // 更新时间轴
            updateTimelineDisplay();
            updateModalCurrentSettings();
        }
        
        function updateModalUI() {
            const chargeBtn = document.getElementById('modalChargeBtn');
            const dischargeBtn = document.getElementById('modalDischargeBtn');
            
            if (currentConditionType === 'charge') {
                chargeBtn.style.background = 'linear-gradient(135deg, #00ff88, #00cc6a)';
                chargeBtn.style.color = '#000';
                chargeBtn.style.border = 'none';
                
                dischargeBtn.style.background = 'rgba(255,255,255,0.1)';
                dischargeBtn.style.color = 'rgba(255,255,255,0.6)';
                dischargeBtn.style.border = '1px solid rgba(255,255,255,0.2)';
            } else {
                dischargeBtn.style.background = 'linear-gradient(135deg, #FFC107, #FFB000)';
                dischargeBtn.style.color = '#000';
                dischargeBtn.style.border = 'none';
                
                chargeBtn.style.background = 'rgba(255,255,255,0.1)';
                chargeBtn.style.color = 'rgba(255,255,255,0.6)';
                chargeBtn.style.border = '1px solid rgba(255,255,255,0.2)';
            }
        }
        
        function loadRegionData(region, type) {
            // 确保有地区数据
            if (!selectedRegionData[region]) {
                selectedRegionData[region] = { charge: {}, discharge: {} };
            }
            
            const regionData = selectedRegionData[region];
            
            // 加载充电设置
            if (regionData.charge) {
                chargeTimeSettings = { 
                    segments: regionData.charge.segments || [{ start: 22, end: 6, id: `charge-${Date.now()}` }]
                };
                // 设置checkbox状态
                const chargeTimeCheckbox = document.getElementById('chargeTimeEnabled');
                const chargePriceCheckbox = document.getElementById('chargePriceEnabled');
                const chargePriceInput = document.getElementById('chargePrice');
                
                if (chargeTimeCheckbox) chargeTimeCheckbox.checked = regionData.charge.timeEnabled !== false;
                if (chargePriceCheckbox) chargePriceCheckbox.checked = regionData.charge.priceEnabled !== false;
                if (chargePriceInput && regionData.charge.priceThreshold) {
                    chargePriceInput.value = regionData.charge.priceThreshold;
                }
            } else {
                chargeTimeSettings = { segments: [{ start: 22, end: 6, id: `charge-${Date.now()}` }] };
            }
            
            // 加载放电设置
            if (regionData.discharge) {
                dischargeTimeSettings = { 
                    segments: regionData.discharge.segments || [{ start: 6, end: 22, id: `discharge-${Date.now()}` }]
                };
                // 设置checkbox状态
                const dischargeTimeCheckbox = document.getElementById('dischargeTimeEnabled');
                const dischargePriceCheckbox = document.getElementById('dischargePriceEnabled');
                const dischargePriceInput = document.getElementById('dischargePrice');
                
                if (dischargeTimeCheckbox) dischargeTimeCheckbox.checked = regionData.discharge.timeEnabled !== false;
                if (dischargePriceCheckbox) dischargePriceCheckbox.checked = regionData.discharge.priceEnabled !== false;
                if (dischargePriceInput && regionData.discharge.priceThreshold) {
                    dischargePriceInput.value = regionData.discharge.priceThreshold;
                }
            } else {
                dischargeTimeSettings = { segments: [{ start: 6, end: 22, id: `discharge-${Date.now()}` }] };
            }
        }
        
        function saveRegionData(region, type) {
            // 确保 selectedRegionData[region] 存在
            if (!selectedRegionData[region]) {
                selectedRegionData[region] = { charge: {}, discharge: {} };
            }
            
            // 获取checkbox状态
            const chargeTimeEnabled = document.getElementById('chargeTimeEnabled')?.checked;
            const chargePriceEnabled = document.getElementById('chargePriceEnabled')?.checked;
            const dischargeTimeEnabled = document.getElementById('dischargeTimeEnabled')?.checked;
            const dischargePriceEnabled = document.getElementById('dischargePriceEnabled')?.checked;
            
            // 获取价格值
            const chargePriceValue = document.getElementById('chargePrice')?.value || 50;
            const dischargePriceValue = document.getElementById('dischargePrice')?.value || 100;
            
            // 保存充电设置
            selectedRegionData[region].charge = {
                segments: chargeTimeSettings.segments,
                timeEnabled: chargeTimeEnabled !== undefined ? chargeTimeEnabled : true,
                priceEnabled: chargePriceEnabled !== undefined ? chargePriceEnabled : true,
                priceThreshold: parseInt(chargePriceValue)
            };
            
            // 保存放电设置
            selectedRegionData[region].discharge = {
                segments: dischargeTimeSettings.segments,
                timeEnabled: dischargeTimeEnabled !== undefined ? dischargeTimeEnabled : true,
                priceEnabled: dischargePriceEnabled !== undefined ? dischargePriceEnabled : true,
                priceThreshold: parseInt(dischargePriceValue)
            };
        }
        
        function updateModalCurrentSettings() {
            const currentSettings = document.getElementById('modalCurrentSettings');
            const typeText = currentConditionType === 'charge' ? '充电' : '放电';
            const settings = currentConditionType === 'charge' ? chargeTimeSettings : dischargeTimeSettings;
            
            if (settings.segments.length === 0) {
                currentSettings.innerHTML = `${currentSelectedRegion} - ${typeText}: ${window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'No time slots' : '未设置时间段'}`;
            } else if (settings.segments.length === 1) {
                const segment = settings.segments[0];
                const timeText = `${segment.start.toString().padStart(2, '0')}:00 - ${segment.end.toString().padStart(2, '0')}:00`;
                currentSettings.innerHTML = `${currentSelectedRegion} - ${typeText}: ${timeText}`;
            } else {
                currentSettings.innerHTML = `${currentSelectedRegion} - ${typeText}: ${settings.segments.length}${window.i18n && window.i18n.getCurrentLanguage() === 'en' ? ' slots' : '个时间段'}`;
            }
        }
        
        function updateTimelineDisplay() {
            const timeline = document.getElementById('timeline');
            if (!timeline) return;
            
            // 清除现有时间段
            document.querySelectorAll('.time-segment').forEach(segment => segment.remove());
            
            // 不在时间轴上显示时间段，只在时间条件卡片中显示
            // // 创建当前类型的时间段
            // const settings = currentConditionType === 'charge' ? chargeTimeSettings : dischargeTimeSettings;
            // settings.segments.forEach((segment, index) => {
            //     createTimeSegment(currentConditionType, segment, index);
            // });
        }
        
        function createTimeSegment(type, segment, index) {
            const timeline = document.getElementById('timeline');
            const element = document.createElement('div');
            element.className = 'time-segment';
            element.dataset.type = type;
            element.dataset.segmentId = segment.id;
            element.dataset.index = index;
            
            const color = type === 'charge' ? '#00ff88' : '#FFC107';
            const gradientColor = type === 'charge' ? '#00cc6a' : '#FFB000';
            
            // 计算位置和宽度
            let left, width;
            if (segment.start > segment.end) {
                // 跨日处理
                left = (segment.start / 24 * 100);
                width = ((24 - segment.start + segment.end) / 24 * 100);
            } else {
                left = (segment.start / 24 * 100);
                width = ((segment.end - segment.start) / 24 * 100);
            }
            
            element.style.cssText = `
                position: absolute;
                left: ${left}%;
                width: ${width}%;
                height: 48px;
                top: 6px;
                background: linear-gradient(135deg, ${color}, ${gradientColor});
                border-radius: 10px;
                cursor: move;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #000;
                font-size: 10px;
                font-weight: 600;
                user-select: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.2);
            `;
            
            const timeText = `${segment.start.toString().padStart(2, '0')}:00-${segment.end.toString().padStart(2, '0')}:00`;
            element.innerHTML = `
                <span>${timeText}</span>
                <button onclick="removeTimeSegment('${segment.id}')" style="position: absolute; top: -4px; right: -4px; width: 16px; height: 16px; background: #ff4444; color: #fff; border: none; border-radius: 50%; font-size: 10px; cursor: pointer; display: none;" class="delete-btn">×</button>
            `;
            
            // 添加悬停效果显示删除按钮
            element.addEventListener('mouseenter', () => {
                element.querySelector('.delete-btn').style.display = 'flex';
            });
            element.addEventListener('mouseleave', () => {
                element.querySelector('.delete-btn').style.display = 'none';
            });
            
            // 不在时间轴上显示时间段
            // timeline.appendChild(element);
        }
        
        function addTimeSegment() {
            const settings = currentConditionType === 'charge' ? chargeTimeSettings : dischargeTimeSettings;
            const newSegment = {
                start: 10,
                end: 14,
                id: `${currentConditionType}-${Date.now()}`
            };
            
            settings.segments.push(newSegment);
            updateTimelineDisplay();
            updateModalCurrentSettings();
            
            updateSelectionInfo(`<span style="color: #00ff88;">✓ 新时间段已添加: 10:00-14:00</span>`);
        }
        
        function removeTimeSegment(segmentId) {
            const settings = currentConditionType === 'charge' ? chargeTimeSettings : dischargeTimeSettings;
            settings.segments = settings.segments.filter(s => s.id !== segmentId);
            
            updateTimelineDisplay();
            updateModalCurrentSettings();
            
            updateSelectionInfo(`<span style="color: #ff4444;">✓ 时间段已删除</span>`);
        }
        
        function clearAllTimeSegments() {
            const settings = currentConditionType === 'charge' ? chargeTimeSettings : dischargeTimeSettings;
            settings.segments = [];
            
            updateTimelineDisplay();
            updateModalCurrentSettings();
            
            updateSelectionInfo(`<span style="color: #ff4444;">✓ 所有时间段已清除</span>`);
        }
        
        function updateSelectionInfo(message) {
            const info = document.getElementById('timeSelectionInfo');
            if (info) {
                info.innerHTML = message;
                setTimeout(() => {
                    info.innerHTML = '<span style="color: rgba(255,255,255,0.6); font-size: 12px;">💡 ' + (window.i18n ? window.i18n.getText('dragToAddTimeSlot') : '点击空白区域添加时间段，拖拽时间段调整时间') + '</span>';
                }, 3000);
            }
        }
        
        // Switch Modal Mode Function (已移除tab，函数保留以兼容)
        function switchModalMode(mode) {
            // 由于已移除手动/自动tab，此函数现在不执行任何操作
            // 自动条件始终显示
            const autoConditions = document.getElementById('autoModeConditions');
            if (autoConditions) {
                autoConditions.style.display = 'block';
            }
            
            // 仍然保存模式以兼容其他可能的调用
            localStorage.setItem('modalMode', mode);
        }

        // 旧函数已废弃，由 condition-settings-modal.js 中的同名函数替代
        // function saveConditionSettings() {
        //     // 保存当前正在编辑的数据
        //     saveRegionData(currentSelectedRegion, currentConditionType);
        //
        //     // 保存所有地区的设置数据到localStorage
        //     localStorage.setItem('regionTimeSettings', JSON.stringify(selectedRegionData));
        //
        //     // 更新显示的勾选状态
        //     updateConditionsDisplayFromSaved();
        //
        //     // 关闭弹窗
        //     closeConditionSettingsModal();
        //
        //     // 显示保存成功提示
        //     showAutoOperationNotification('设置', '多地区条件设置已保存');
        //
        //     console.log('多地区时间条件设置已保存:', selectedRegionData);
        // }
        
        // 从保存的设置更新显示
        function updateConditionsDisplayFromSaved() {
            const currentRegion = selectedMainRegion || 'NSW';
            const regionData = selectedRegionData[currentRegion];
            
            if (!regionData) {
                // 如果没有保存的数据，使用默认值
                var _ct = document.getElementById('chargeTimeEnabledDisplay');
                var _cp = document.getElementById('chargePriceEnabledDisplay');
                var _dt = document.getElementById('dischargeTimeEnabledDisplay');
                var _dp = document.getElementById('dischargePriceEnabledDisplay');
                if (_ct) _ct.checked = true;
                if (_cp) _cp.checked = true;
                if (_dt) _dt.checked = true;
                if (_dp) _dp.checked = true;
                return;
            }
            
            // 从保存的数据中获取checkbox状态
            const chargeTimeEnabled = regionData.charge?.timeEnabled !== false;
            const chargePriceEnabled = regionData.charge?.priceEnabled !== false;
            const dischargeTimeEnabled = regionData.discharge?.timeEnabled !== false;
            const dischargePriceEnabled = regionData.discharge?.priceEnabled !== false;
            
            // 更新checkbox显示
            const chargeTimeCheckbox = document.getElementById('chargeTimeEnabledDisplay');
            const chargePriceCheckbox = document.getElementById('chargePriceEnabledDisplay');
            const dischargeTimeCheckbox = document.getElementById('dischargeTimeEnabledDisplay');
            const dischargePriceCheckbox = document.getElementById('dischargePriceEnabledDisplay');
            
            if (chargeTimeCheckbox) chargeTimeCheckbox.checked = chargeTimeEnabled;
            if (chargePriceCheckbox) chargePriceCheckbox.checked = chargePriceEnabled;
            if (dischargeTimeCheckbox) dischargeTimeCheckbox.checked = dischargeTimeEnabled;
            if (dischargePriceCheckbox) dischargePriceCheckbox.checked = dischargePriceEnabled;
            
            // 更新显示的透明度和未使用标签
            updateConditionDisplayStyle('charge', 'time', chargeTimeEnabled);
            updateConditionDisplayStyle('charge', 'price', chargePriceEnabled);
            updateConditionDisplayStyle('discharge', 'time', dischargeTimeEnabled);
            updateConditionDisplayStyle('discharge', 'price', dischargePriceEnabled);
            
            // 更新时间和价格值
            if (regionData.charge) {
                const chargeSegments = regionData.charge.segments || regionData.charge.timeSegments;
                if (chargeSegments && chargeSegments.length > 0) {
                    document.getElementById('chargeStartTime').textContent = chargeSegments[0].start + ':00';
                    document.getElementById('chargeEndTime').textContent = chargeSegments[0].end + ':00';
                }
                if (regionData.charge.priceThreshold !== undefined) {
                    document.getElementById('chargePriceValue').textContent = regionData.charge.priceThreshold;
                }
            }
            
            if (regionData.discharge) {
                const dischargeSegments = regionData.discharge.segments || regionData.discharge.timeSegments;
                if (dischargeSegments && dischargeSegments.length > 0) {
                    document.getElementById('dischargeStartTime').textContent = dischargeSegments[0].start + ':00';
                    document.getElementById('dischargeEndTime').textContent = dischargeSegments[0].end + ':00';
                }
                if (regionData.discharge.priceThreshold !== undefined) {
                    document.getElementById('dischargePriceValue').textContent = regionData.discharge.priceThreshold;
                }
            }
        }
        
        // 更新条件显示样式
        function updateConditionDisplayStyle(type, condition, enabled) {
            const prefix = type === 'charge' ? 'charge' : 'discharge';
            const suffix = condition === 'time' ? 'Time' : 'Price';
            
            const display = document.getElementById(`${prefix}${suffix}Display`);
            const disabled = document.getElementById(`${prefix}${suffix}Disabled`);
            
            if (display && disabled) {
                if (enabled) {
                    display.style.opacity = '1';
                    disabled.style.display = 'none';
                } else {
                    display.style.opacity = '0.4';
                    disabled.style.display = 'inline';
                }
            }
        }
        
        // 页面加载时恢复设置
        function loadConditionSettings() {
            const savedRegionSettings = localStorage.getItem('regionTimeSettings');
            if (savedRegionSettings) {
                try {
                    selectedRegionData = JSON.parse(savedRegionSettings);
                    // 更新显示
                    updateConditionsDisplayFromSaved();
                } catch (e) {
                    console.error('恢复地区设置时出错:', e);
                    selectedRegionData = {};
                }
            } else {
                // 如果没有保存的设置，也更新显示为默认值
                updateConditionsDisplayFromSaved();
            }
        }
        
        // 在页面加载完成后恢复设置
        window.addEventListener('load', function() {
            setTimeout(loadConditionSettings, 500);
            // 再次检查模态框状态，确保在所有资源加载完成后恢复
            setTimeout(checkAndRestoreModal, 1000);
        });
        
        // 初始化条件模态框
        function initializeConditionModal() {
            // 确保全局变量存在
            if (!window.chargeTimeSegments) {
                window.chargeTimeSegments = [{ start: '22:00', end: '06:00' }];
            }
            if (!window.dischargeTimeSegments) {
                window.dischargeTimeSegments = [{ start: '16:00', end: '21:00' }];
            }
            
            // 确保局部变量已声明并同步
            if (typeof chargeTimeSegments === 'undefined') {
                // 如果局部变量未定义，创建一个临时的局部变量
                var chargeTimeSegments = [...window.chargeTimeSegments];
                var dischargeTimeSegments = [...window.dischargeTimeSegments];
                
                // 将它们设置为全局变量以供后续使用
                window.chargeTimeSegments = chargeTimeSegments;
                window.dischargeTimeSegments = dischargeTimeSegments;
            } else {
                // 同步数据
                chargeTimeSegments = [...window.chargeTimeSegments];
                dischargeTimeSegments = [...window.dischargeTimeSegments];
            }
            
            
            // 同步SOC值到Modal
            syncSOCToModal();
            
            // 测试：强制设置一个已知值
            setTimeout(() => {
                updateModalChargeSOC(90);
                updateModalDischargeSOC(20);
                
                // 测试输入框事件绑定
                const chargeInput = document.getElementById('modalChargeStopSOC');
                const dischargeInput = document.getElementById('modalDischargeStopSOC');
                
                if (chargeInput) {
                }
                if (dischargeInput) {
                }
                
                // 调用测试函数
                testSOCFunctionality();
            }, 500);
        }
        
        // 测试SOC功能的函数
        function testSOCFunctionality() {
            
            // 检查所有相关元素
            const elements = {
                chargeInput: document.getElementById('modalChargeStopSOC'),
                chargeSlider: document.getElementById('modalChargeSOCSlider'),
                chargeBar: document.getElementById('modalChargeSOCBar'),
                chargeDot: document.getElementById('modalChargeSOCDot'),
                dischargeInput: document.getElementById('modalDischargeStopSOC'),
                dischargeSlider: document.getElementById('modalDischargeSOCSlider'),
                dischargeBar: document.getElementById('modalDischargeSOCBar'),
                dischargeDot: document.getElementById('modalDischargeSOCDot')
            };
            
            
            // 测试充电SOC
            updateModalChargeSOC(75);
            
            // 测试放电SOC
            updateModalDischargeSOC(30);
            
            // 检查样式是否正确应用
            setTimeout(() => {
            }, 100);
        }
        
        // 处理设置编辑按钮点击
        function handleSettingsEdit() {
            // 检查当前选中地区的状态
            const currentRegionStatus = regionData[selectedMainRegion] ? regionData[selectedMainRegion].status : 'none';
            
            // 如果是自动充电或自动放电状态，显示提示并禁止编辑
            if (currentRegionStatus === 'autoCharge' || currentRegionStatus === 'autoDischarge') {
                showSettingsEditDisabledTooltip();
                return;
            }
            
            // 其他情况下可以正常编辑
            openConditionSettingsModal();
        }
        
        // 显示设置编辑禁用提示
        function showSettingsEditDisabledTooltip() {
            const editBtn = document.getElementById('settingsEditBtn');
            if (!editBtn) return;
            
            // 移除现有的提示
            const existingTooltip = document.getElementById('settingsEditTooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }
            
            // 创建提示元素
            const tooltip = document.createElement('div');
            tooltip.id = 'settingsEditTooltip';
            tooltip.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                z-index: 10000;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            `;
            
            // 设置提示文本
            const currentStatus = regionData[selectedMainRegion].status;
            if (currentStatus === 'autoCharge') {
                tooltip.textContent = window.i18n ? window.i18n.getText('autoChargingCannotEdit') : '智能充电进行中，无法编辑设置';
            } else if (currentStatus === 'autoDischarge') {
                tooltip.textContent = window.i18n ? window.i18n.getText('autoDischargingCannotEdit') : '智能放电进行中，无法编辑设置';
            }
            
            // 计算位置
            const rect = editBtn.getBoundingClientRect();
            tooltip.style.top = (rect.top - 45) + 'px';
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.transform = 'translateX(-50%)';
            
            document.body.appendChild(tooltip);
            
            // 显示提示
            setTimeout(() => {
                tooltip.style.opacity = '1';
            }, 10);
            
            // 3秒后自动隐藏
            setTimeout(() => {
                tooltip.style.opacity = '0';
                setTimeout(() => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                }, 300);
            }, 3000);
        }
        
        // 时间段管理系统
        class TimeSegmentManager {
            constructor() {
                this.chargeSegments = [{ id: 'charge_1', start: '22:00', end: '06:00' }];
                this.dischargeSegments = [{ id: 'discharge_1', start: '16:00', end: '21:00' }];
            }
            
            // 检查时间段是否有效（不重叠）
            isValidTimeSegment(newSegment, type, excludeId = null) {
                const segments = type === 'charge' ? this.chargeSegments : this.dischargeSegments;
                const filteredSegments = segments.filter(seg => seg.id !== excludeId);
                
                for (let segment of filteredSegments) {
                    if (this.isTimeOverlap(newSegment, segment)) {
                        return false;
                    }
                }
                return true;
            }
            
            // 检查两个时间段是否重叠
            isTimeOverlap(seg1, seg2) {
                const start1 = this.timeToMinutes(seg1.start);
                const end1 = this.timeToMinutes(seg1.end);
                const start2 = this.timeToMinutes(seg2.start);
                const end2 = this.timeToMinutes(seg2.end);
                
                // 处理跨日情况
                const end1Adjusted = end1 < start1 ? end1 + 1440 : end1;
                const end2Adjusted = end2 < start2 ? end2 + 1440 : end2;
                
                // 检查重叠
                return !(end1Adjusted <= start2 || end2Adjusted <= start1);
            }
            
            // 时间转换为分钟
            timeToMinutes(time) {
                const [hours, minutes] = time.split(':').map(Number);
                return hours * 60 + minutes;
            }
            
            // 分钟转换为时间
            minutesToTime(minutes) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
            }
            
            // 添加时间段
            addTimeSegment(type, start, end) {
                const newSegment = {
                    id: `${type}_${Date.now()}`,
                    start: start,
                    end: end
                };
                
                if (this.isValidTimeSegment(newSegment, type)) {
                    if (type === 'charge') {
                        this.chargeSegments.push(newSegment);
                    } else {
                        this.dischargeSegments.push(newSegment);
                    }
                    return newSegment;
                }
                return null;
            }
            
            // 更新时间段
            updateTimeSegment(id, start, end) {
                const chargeIndex = this.chargeSegments.findIndex(seg => seg.id === id);
                const dischargeIndex = this.dischargeSegments.findIndex(seg => seg.id === id);
                
                if (chargeIndex !== -1) {
                    const newSegment = { id, start, end };
                    if (this.isValidTimeSegment(newSegment, 'charge', id)) {
                        this.chargeSegments[chargeIndex] = newSegment;
                        return true;
                    }
                } else if (dischargeIndex !== -1) {
                    const newSegment = { id, start, end };
                    if (this.isValidTimeSegment(newSegment, 'discharge', id)) {
                        this.dischargeSegments[dischargeIndex] = newSegment;
                        return true;
                    }
                }
                return false;
            }
            
            // 删除时间段
            removeTimeSegment(id) {
                this.chargeSegments = this.chargeSegments.filter(seg => seg.id !== id);
                this.dischargeSegments = this.dischargeSegments.filter(seg => seg.id !== id);
            }
            
            // 获取时间段
            getTimeSegments(type) {
                return type === 'charge' ? this.chargeSegments : this.dischargeSegments;
            }
        }
        
        // 全局时间段管理器实例
        window.timeSegmentManager = new TimeSegmentManager();
        
        // 更新openConditionSettingsModal函数以初始化新的简化弹窗
        function openConditionSettingsModal() {
            
            try {
                // 确保时间段管理器已初始化
                if (!window.timeSegmentManager) {
                    window.timeSegmentManager = new TimeSegmentManager();
                }
                
                // 重新加载模态框内容，避免初始化问题
                initializeConditionModal();
                
                const modalContent = document.getElementById('modalContent');
                if (!modalContent) {
                    console.error('Modal content element not found!');
                    return;
                }
                
                modalContent.style.display = 'flex';
                
                // Restore saved mode or default to manual
                const savedMode = localStorage.getItem('modalMode') || 'manual';
                switchModalMode(savedMode);
                
                // 保存模态框打开状态到localStorage
                localStorage.setItem('conditionSettingsModalOpen', 'true');
                localStorage.setItem('modalPosition', JSON.stringify({
                    top: modalContent.style.top || '5%',
                    left: modalContent.style.left || 'calc(50% - 450px)'
                }));
                
                // 初始化模态框拖拽功能
                makeModalDraggable(modalContent);
                
                // 强制设置最高层级
                modalContent.style.setProperty('z-index', '2147483648', 'important');
                modalContent.style.setProperty('position', 'fixed', 'important');
                
                // 更新模态框的i18n翻译
                if (window.i18n && window.i18n.isReady) {
                    window.i18n.updatePageTexts();
                    // 立即更新模态框翻译
                    updateModalTranslations();
                    // 再次强制更新以确保生效
                    setTimeout(() => {
                        updateModalTranslations();
                    }, 100);
                    setTimeout(() => {
                        updateModalTranslations();
                    }, 300);
                }
                
                // 确保时间段列表容器存在
                setTimeout(() => {
                    const chargeContainer = document.getElementById('chargeTimeSegmentsList');
                    const dischargeContainer = document.getElementById('dischargeTimeSegmentsList');
                    
                    // 立即更新显示
                    updateTimeSegmentsList();
                }, 100);
                
                // 显示当前选中地区名称
                const regionNameEl = document.getElementById('modalRegionName');
                if (regionNameEl) {
                    regionNameEl.textContent = selectedMainRegion;
                }
                
                // 初始化全局变量
                if (!window.chargeTimeSegments) {
                    window.chargeTimeSegments = [{ start: '22:00', end: '06:00' }];
                }
                if (!window.dischargeTimeSegments) {
                    window.dischargeTimeSegments = [{ start: '16:00', end: '21:00' }];
                }
                
                // 加载当前地区的设置
                loadCurrentRegionConditionSettings();
                
                // 绑定事件监听
                setTimeout(() => {
                    bindTimeInputEvents();
                    // 确保时间选择事件也绑定
                    bindTimeSelectionEvents();
                    
                    // 再次更新i18n以确保所有动态内容都被翻译
                    if (window.i18n && window.i18n.isReady) {
                        window.i18n.updatePageTexts();
                        updateModalTranslations();
                    }
                }, 200);
            } catch (error) {
                console.error('Error opening modal:', error);
                alert((window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Error opening settings: ' : '打开设置弹窗时出错：') + error.message);
            }
        }
        
        // 专门用于更新模态框翻译的函数 - 强制版本
        function updateModalTranslations() {
            if (!window.i18n || !window.i18n.isReady) {
                return;
            }
            
            const currentLanguage = window.i18n.getCurrentLanguage();
            
            // 直接强制更新每个有问题的元素
            const forcedUpdates = [
                // 模态框标题
                {
                    selector: '#conditionSettingsModal h3[data-i18n="automationConditionsSettings"]',
                    chinese: '智能策略设置',
                    english: 'AI Strategy Settings'
                },
                {
                    selector: 'span[data-i18n="socSettings"]',
                    chinese: 'SOC设置',
                    english: 'SOC Settings'
                },
                {
                    selector: 'h3[data-i18n="settings"]',
                    chinese: '设置',
                    english: 'Settings'
                },
                {
                    selector: 'span[data-i18n="autoConditions"]',
                    chinese: '智能策略',
                    english: 'AI Strategy'
                },
                {
                    selector: 'span[data-i18n="autoSettings"]',
                    chinese: '智能托管设置',
                    english: 'AI Custody Settings'
                },
                {
                    selector: 'span[data-i18n="edit"]',
                    chinese: '编辑',
                    english: 'Edit'
                },
                {
                    selector: 'div[data-i18n="autoChargeCondition"]',
                    chinese: '智能充电条件',
                    english: 'AI Charge Conditions'
                },
                {
                    selector: 'div[data-i18n="autoDischargeCondition"]',
                    chinese: '智能放电条件',
                    english: 'AI Discharge Conditions'
                },
                {
                    selector: 'span[data-i18n="notUsed"]',
                    chinese: '(未使用)',
                    english: '(Not Used)'
                },
                // 选择充电时间按钮
                {
                    selector: '#chargeSelectBtn span[data-i18n="selectChargeTime"]',
                    chinese: '选择充电时间',
                    english: 'Select Charge Time'
                },
                // 选择放电时间按钮
                {
                    selector: '#dischargeSelectBtn span[data-i18n="selectDischargeTime"]',
                    chinese: '选择放电时间',
                    english: 'Select Discharge Time'
                },
                // 充电时间段标签
                {
                    selector: 'span[data-i18n="chargeTimeSlot"]',
                    chinese: '充电时间段',
                    english: 'Charge Time Slot'
                },
                // 放电时间段标签
                {
                    selector: 'span[data-i18n="dischargeTimeSlot"]',
                    chinese: '放电时间段',
                    english: 'Discharge Time Slot'
                },
                // 拖拽提示
                {
                    selector: 'span[data-i18n="dragToAddTimeSlot"]',
                    chinese: '在时间轴上拖拽即可添加时间段',
                    english: 'Drag on the timeline to add time slots'
                },
                // 时间条件
                {
                    selector: 'span[data-i18n="timeCondition"]',
                    chinese: '时间条件',
                    english: 'Time Condition'
                },
                // 充电
                {
                    selector: 'span[data-i18n="charge"]',
                    chinese: '充电',
                    english: 'Charge'
                },
                // 放电
                {
                    selector: 'span[data-i18n="discharge"]',
                    chinese: '放电',
                    english: 'Discharge'
                },
                // 充电条件
                {
                    selector: 'h4[data-i18n="chargeConditionSingle"]',
                    chinese: '充电条件',
                    english: 'Charge Condition'
                },
                // 放电条件
                {
                    selector: 'h4[data-i18n="dischargeConditionSingle"]',
                    chinese: '放电条件',
                    english: 'Discharge Condition'
                },
                // 价格条件
                {
                    selector: 'span[data-i18n="priceCondition"]',
                    chinese: '价格条件',
                    english: 'Price Condition'
                },
                // 低于
                {
                    selector: 'span[data-i18n="lessThan"]',
                    chinese: '低于',
                    english: 'Less than'
                },
                // 高于
                {
                    selector: 'span[data-i18n="greaterThan"]',
                    chinese: '高于',
                    english: 'Greater than'
                },
                // 取消
                {
                    selector: 'button[data-i18n="cancel"]',
                    chinese: '取消',
                    english: 'Cancel'
                },
                // 保存设置
                {
                    selector: 'button[data-i18n="saveSettings"]',
                    chinese: '保存设置',
                    english: 'Save Settings'
                }
            ];
            
            forcedUpdates.forEach(update => {
                const elements = document.querySelectorAll(update.selector);
                elements.forEach(element => {
                    if (element) {
                        const oldText = element.textContent;
                        const newText = currentLanguage === 'en' ? update.english : update.chinese;
                        element.textContent = newText;
                    }
                });
            });
            
            // 额外处理时间段列表中的动态内容
            updateTimeSegmentListTranslations();
        }
        
        // 更新时间段列表中的动态翻译内容
        function updateTimeSegmentListTranslations() {
            if (!window.i18n || !window.i18n.isReady) return;
            
            const currentLanguage = window.i18n.getCurrentLanguage();
            
            // 更新空状态提示文本
            const chargeContainer = document.getElementById('chargeTimeSegmentsList');
            if (chargeContainer && chargeContainer.innerHTML.includes('暂无充电时间段')) {
                const emptyText = currentLanguage === 'en' ? 'No charge time slots' : '暂无充电时间段';
                chargeContainer.innerHTML = `<div style="color: rgba(255,255,255,0.5); font-size: 12px; padding: 8px;">${emptyText}</div>`;
            }
            
            const dischargeContainer = document.getElementById('dischargeTimeSegmentsList');
            if (dischargeContainer && dischargeContainer.innerHTML.includes('暂无放电时间段')) {
                const emptyText = currentLanguage === 'en' ? 'No discharge time slots' : '暂无放电时间段';
                dischargeContainer.innerHTML = `<div style="color: rgba(255,255,255,0.5); font-size: 12px; padding: 8px;">${emptyText}</div>`;
            }
        }
        
        // 旧函数已废弃，由 condition-settings-modal.js 中的同名函数替代
        // function closeConditionSettingsModal() {
        //     console.log('Closing condition settings modal...');
        //     try {
        //         const modalContent = document.getElementById('modalContent');
        //         if (modalContent) {
        //             modalContent.style.display = 'none';
        //
        //             // 清除localStorage状态
        //             localStorage.removeItem('conditionSettingsModalOpen');
        //             localStorage.removeItem('modalPosition');
        //
        //             console.log('Modal closed successfully');
        //         } else {
        //             console.error('Modal content element not found when trying to close!');
        //         }
        //     } catch (error) {
        //         console.error('Error closing modal:', error);
        //     }
        // }
        
        // 初始化时间段显示
        function initTimeSegmentDisplay() {
            createTimeSegmentVisualizer();
            updateTimeSegmentDisplay();
        }
        
        // 创建时间段可视化器
        function createTimeSegmentVisualizer() {
            const container = document.getElementById('timeSegmentContainer');
            if (!container) return;
            
            container.innerHTML = `
                <div class="time-visualizer">
                    <div class="time-ruler">
                        <div class="time-hours"></div>
                        <div class="time-segments-display"></div>
                    </div>
                    <div class="time-controls">
                        <div class="segment-type-tabs">
                            <button class="segment-tab active" data-type="charge">充电时间</button>
                            <button class="segment-tab" data-type="discharge">放电时间</button>
                        </div>
                        <div class="segment-list"></div>
                        <button class="add-segment-btn">+ 添加时间段</button>
                    </div>
                </div>
            `;
            
            // 创建时间刻度
            const timeHours = container.querySelector('.time-hours');
            for (let i = 0; i < 24; i++) {
                const hour = document.createElement('div');
                hour.className = 'time-hour';
                hour.textContent = i.toString().padStart(2, '0') + ':00';
                hour.style.left = `${(i / 24) * 100}%`;
                timeHours.appendChild(hour);
            }
            
            // 绑定事件
            container.querySelectorAll('.segment-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    container.querySelectorAll('.segment-tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    updateTimeSegmentDisplay();
                });
            });
            
            container.querySelector('.add-segment-btn').addEventListener('click', () => {
                const activeType = container.querySelector('.segment-tab.active').dataset.type;
                showAddSegmentModal(activeType);
            });
        }
        
        // 更新时间段显示
        function updateTimeSegmentDisplay() {
            const container = document.getElementById('timeSegmentContainer');
            if (!container) return;
            
            const activeType = container.querySelector('.segment-tab.active').dataset.type;
            const segments = window.timeSegmentManager.getTimeSegments(activeType);
            const segmentsDisplay = container.querySelector('.time-segments-display');
            const segmentList = container.querySelector('.segment-list');
            
            // 清空现有显示
            segmentsDisplay.innerHTML = '';
            segmentList.innerHTML = '';
            
            // 显示时间段
            segments.forEach((segment, index) => {
                // 在时间轴上显示
                const segmentBar = createSegmentBar(segment, activeType);
                segmentsDisplay.appendChild(segmentBar);
                
                // 在列表中显示
                const segmentItem = createSegmentListItem(segment, activeType, index);
                segmentList.appendChild(segmentItem);
            });
        }
        
        // 创建时间段条形图
        function createSegmentBar(segment, type) {
            const bar = document.createElement('div');
            bar.className = 'time-segment-bar';
            bar.dataset.segmentId = segment.id;
            
            const startMinutes = window.timeSegmentManager.timeToMinutes(segment.start);
            const endMinutes = window.timeSegmentManager.timeToMinutes(segment.end);
            
            let left, width;
            if (endMinutes > startMinutes) {
                // 同一天
                left = (startMinutes / 1440) * 100;
                width = ((endMinutes - startMinutes) / 1440) * 100;
            } else {
                // 跨天
                left = (startMinutes / 1440) * 100;
                width = ((1440 - startMinutes + endMinutes) / 1440) * 100;
            }
            
            bar.style.left = left + '%';
            bar.style.width = width + '%';
            bar.style.backgroundColor = type === 'charge' ? '#00ff88' : '#FFC107';
            bar.style.opacity = '0.8';
            
            // 添加时间标签
            const label = document.createElement('span');
            label.className = 'segment-label';
            label.textContent = `${segment.start} - ${segment.end}`;
            bar.appendChild(label);
            
            return bar;
        }
        
        // 创建时间段列表项
        function createSegmentListItem(segment, type, index) {
            const item = document.createElement('div');
            item.className = 'segment-list-item';
            item.innerHTML = `
                <div class="segment-info">
                    <span class="segment-time">${segment.start} - ${segment.end}</span>
                    <span class="segment-type">${type === 'charge' ? '充电' : '放电'}</span>
                </div>
                <div class="segment-actions">
                    <button class="edit-segment-btn" onclick="editTimeSegment('${segment.id}')">编辑</button>
                    <button class="delete-segment-btn" onclick="deleteTimeSegment('${segment.id}')">删除</button>
                </div>
            `;
            
            return item;
        }
        
        // 显示添加时间段弹窗
        function showAddSegmentModal(type) {
            const modal = document.createElement('div');
            modal.className = 'add-segment-modal';
            modal.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content">
                        <h3>添加${type === 'charge' ? '充电' : '放电'}时间段</h3>
                        <div class="time-inputs">
                            <div class="input-group">
                                <label>开始时间</label>
                                <input type="time" id="segmentStart" value="09:00">
                            </div>
                            <div class="input-group">
                                <label>结束时间</label>
                                <input type="time" id="segmentEnd" value="17:00">
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="cancel-btn" onclick="closeAddSegmentModal()">取消</button>
                            <button class="confirm-btn" onclick="confirmAddSegment('${type}')">确认</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            modal.style.display = 'flex';
        }
        
        // 确认添加时间段
        function confirmAddSegment(type) {
            const startTime = document.getElementById('segmentStart').value;
            const endTime = document.getElementById('segmentEnd').value;
            
            if (!startTime || !endTime) {
                alert(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Please select start and end time' : '请选择开始和结束时间');
                return;
            }
            
            const newSegment = window.timeSegmentManager.addTimeSegment(type, startTime, endTime);
            if (newSegment) {
                updateTimeSegmentDisplay();
                closeAddSegmentModal();
            } else {
                alert(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Time slots overlap, please reselect' : '时间段重叠，请重新选择时间');
            }
        }
        
        // 关闭添加时间段弹窗
        function closeAddSegmentModal() {
            const modal = document.querySelector('.add-segment-modal');
            if (modal) {
                modal.remove();
            }
        }
        
        // 编辑时间段
        function editTimeSegment(segmentId) {
            const allSegments = [...window.timeSegmentManager.chargeSegments, ...window.timeSegmentManager.dischargeSegments];
            const segment = allSegments.find(seg => seg.id === segmentId);
            if (!segment) return;
            
            const type = segmentId.startsWith('charge') ? 'charge' : 'discharge';
            
            const modal = document.createElement('div');
            modal.className = 'edit-segment-modal';
            modal.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content">
                        <h3>编辑${type === 'charge' ? '充电' : '放电'}时间段</h3>
                        <div class="time-inputs">
                            <div class="input-group">
                                <label>开始时间</label>
                                <input type="time" id="editSegmentStart" value="${segment.start}">
                            </div>
                            <div class="input-group">
                                <label>结束时间</label>
                                <input type="time" id="editSegmentEnd" value="${segment.end}">
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="cancel-btn" onclick="closeEditSegmentModal()">取消</button>
                            <button class="confirm-btn" onclick="confirmEditSegment('${segmentId}')">确认</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            modal.style.display = 'flex';
        }
        
        // 确认编辑时间段
        function confirmEditSegment(segmentId) {
            const startTime = document.getElementById('editSegmentStart').value;
            const endTime = document.getElementById('editSegmentEnd').value;
            
            if (!startTime || !endTime) {
                alert('请选择开始和结束时间');
                return;
            }
            
            const success = window.timeSegmentManager.updateTimeSegment(segmentId, startTime, endTime);
            if (success) {
                updateTimeSegmentDisplay();
                closeEditSegmentModal();
            } else {
                alert('时间段重叠，请重新选择时间');
            }
        }
        
        // 关闭编辑时间段弹窗
        function closeEditSegmentModal() {
            const modal = document.querySelector('.edit-segment-modal');
            if (modal) {
                modal.remove();
            }
        }
        
        // 删除时间段
        function deleteTimeSegment(segmentId) {
            if (confirm(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Delete this time slot?' : '确认删除此时间段？')) {
                window.timeSegmentManager.removeTimeSegment(segmentId);
                updateTimeSegmentDisplay();
            }
        }
        
        // 确保函数全局可用
        // window.openConditionSettingsModal = openConditionSettingsModal; // 已被 condition-settings-modal.js 覆盖
        // window.closeConditionSettingsModal = closeConditionSettingsModal; // 已被 condition-settings-modal.js 覆盖
        // window.saveConditionSettings = saveConditionSettings; // 已被 condition-settings-modal.js 覆盖
        window.saveCurrentRegionSettings = saveCurrentRegionSettings;
        window.updateModalTranslations = updateModalTranslations;
        // window.checkAndRestoreModal = checkAndRestoreModal; // 已被 condition-settings-modal.js 覆盖
        window.editTimeSegment = editTimeSegment;
        window.deleteTimeSegment = deleteTimeSegment;
        window.closeAddSegmentModal = closeAddSegmentModal;
        window.confirmAddSegment = confirmAddSegment;
        window.closeEditSegmentModal = closeEditSegmentModal;
        window.confirmEditSegment = confirmEditSegment;
        
        // 调试函数 - 可以在控制台手动调用
        window.forceModalTranslation = function() {
            updateModalTranslations();
        };
        
        // 添加语言变化监听器，确保模态框内容也会更新
        document.addEventListener('languageChanged', function(event) {
            // 如果模态框是打开的，更新其翻译
            const modalContent = document.getElementById('modalContent');
            if (modalContent && modalContent.style.display === 'block') {
                updateModalTranslations();
                setTimeout(() => {
                    updateModalTranslations();
                }, 50);
                setTimeout(() => {
                    updateModalTranslations();
                }, 200);
                setTimeout(() => {
                    updateModalTranslations();
                }, 500);
            }
        });
        
        // 加载当前地区的条件设置
        function loadCurrentRegionConditionSettings() {
            const region = selectedMainRegion;
            if (!regionConditions[region]) {
                regionConditions[region] = {
                    charge: {
                        timeEnabled: true,
                        timeSegments: [{ start: '22:00', end: '06:00' }],
                        priceEnabled: true,
                        priceValue: 50
                    },
                    discharge: {
                        timeEnabled: true,
                        timeSegments: [{ start: '16:00', end: '21:00' }],
                        priceEnabled: true,
                        priceValue: 100
                    }
                };
            }
            
            const conditions = regionConditions[region];
            
            // 加载充电条件
            const chargeTimeEnabledEl = document.getElementById('modalChargeTimeEnabled');
            const chargePriceEnabledEl = document.getElementById('modalChargePriceEnabled');
            const chargePriceValueEl = document.getElementById('modalChargePriceValue');
            
            
            if (chargeTimeEnabledEl) chargeTimeEnabledEl.checked = conditions.charge.timeEnabled;
            if (chargePriceEnabledEl) chargePriceEnabledEl.checked = conditions.charge.priceEnabled;
            if (chargePriceValueEl) chargePriceValueEl.value = conditions.charge.priceValue;
            
            // 加载放电条件
            const dischargeTimeEnabledEl = document.getElementById('modalDischargeTimeEnabled');
            const dischargePriceEnabledEl = document.getElementById('modalDischargePriceEnabled');
            const dischargePriceValueEl = document.getElementById('modalDischargePriceValue');
            
            
            if (dischargeTimeEnabledEl) dischargeTimeEnabledEl.checked = conditions.discharge.timeEnabled;
            if (dischargePriceEnabledEl) dischargePriceEnabledEl.checked = conditions.discharge.priceEnabled;
            if (dischargePriceValueEl) dischargePriceValueEl.value = conditions.discharge.priceValue;
            
            // 确保全局变量已初始化
            window.chargeTimeSegments = window.chargeTimeSegments || [{ start: '22:00', end: '06:00' }];
            window.dischargeTimeSegments = window.dischargeTimeSegments || [{ start: '16:00', end: '21:00' }];
            
            // 初始化时间段数组
            chargeTimeSegments = [...(conditions.charge.timeSegments || [{ start: '22:00', end: '06:00' }])];
            dischargeTimeSegments = [...(conditions.discharge.timeSegments || [{ start: '16:00', end: '21:00' }])];
            
            // 更新全局变量
            window.chargeTimeSegments = chargeTimeSegments;
            window.dischargeTimeSegments = dischargeTimeSegments;
            
            // 初始化新系统的时间条件数据，确保每个segment都有type属性
            timeConditionSegments.charge = chargeTimeSegments.map(seg => ({
                ...seg,
                type: 'charge',
                id: seg.id || Date.now().toString() + Math.random()
            }));
            timeConditionSegments.discharge = dischargeTimeSegments.map(seg => ({
                ...seg,
                type: 'discharge',
                id: seg.id || Date.now().toString() + Math.random()
            }));
            
            
            // 延迟渲染以确保 DOM 元素已经加载
            setTimeout(() => {
                renderTimeSegments();
                updateTimeline();
                toggleConditionSettings();
                
                // 更新新系统的时间轴显示
                updateTimelineDisplay();
                updateTimeSegmentsList();
            }, 100);
        }
        
        // 保存当前地区的设置
        function saveCurrentRegionSettings() {
            const region = selectedMainRegion;
            
            try {
                if (!regionConditions[region]) {
                    regionConditions[region] = {
                        charge: {},
                        discharge: {}
                    };
                }
                
                // 获取元素并检查是否存在
                const chargeTimeEnabledEl = document.getElementById('modalChargeTimeEnabled');
                const chargePriceEnabledEl = document.getElementById('modalChargePriceEnabled');
                const chargePriceValueEl = document.getElementById('modalChargePriceValue');
                const dischargeTimeEnabledEl = document.getElementById('modalDischargeTimeEnabled');
                const dischargePriceEnabledEl = document.getElementById('modalDischargePriceEnabled');
                const dischargePriceValueEl = document.getElementById('modalDischargePriceValue');
                
                // 保存充电条件，使用新系统的数据（包含type属性）
                regionConditions[region].charge = {
                    timeEnabled: chargeTimeEnabledEl ? chargeTimeEnabledEl.checked : true,
                    timeSegments: timeConditionSegments.charge.map(seg => ({
                        start: seg.start,
                        end: seg.end,
                        type: 'charge',
                        id: seg.id
                    })),
                    priceEnabled: chargePriceEnabledEl ? chargePriceEnabledEl.checked : true,
                    priceCondition: 'below', // 固定为低于
                    priceValue: chargePriceValueEl ? parseFloat(chargePriceValueEl.value) : 50
                };
                
                // 保存放电条件，使用新系统的数据（包含type属性）
                regionConditions[region].discharge = {
                    timeEnabled: dischargeTimeEnabledEl ? dischargeTimeEnabledEl.checked : true,
                    timeSegments: timeConditionSegments.discharge.map(seg => ({
                        start: seg.start,
                        end: seg.end,
                        type: 'discharge',
                        id: seg.id
                    })),
                    priceEnabled: dischargePriceEnabledEl ? dischargePriceEnabledEl.checked : true,
                    priceCondition: 'above', // 固定为高于
                    priceValue: dischargePriceValueEl ? parseFloat(dischargePriceValueEl.value) : 100
                };
                
                
                // 保存到localStorage
                localStorage.setItem('regionConditions', JSON.stringify(regionConditions));
                
                // 关闭弹窗
                closeConditionSettingsModal();
                
                // 更新自动条件显示
                if (typeof updateAutoConditionsDisplay === 'function') {
                    updateAutoConditionsDisplay();
                }
                
                
                // 显示保存成功提示
                alert(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Settings saved!' : '设置已保存成功！');
            } catch (error) {
                console.error('保存设置时出错:', error);
                alert((window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Save failed: ' : '保存设置失败：') + error.message);
            }
        }
        
        // 保留原有的loadAllConditionSettings函数以防兼容性问题
        function loadAllConditionSettings() {
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            
            regions.forEach(region => {
                // 充电条件
                const chargeStartElement = document.getElementById(`chargeStart${region}`);
                const chargeEndElement = document.getElementById(`chargeEnd${region}`);
                const chargePriceConditionElement = document.getElementById(`chargePriceCondition${region}`);
                const chargePriceValueElement = document.getElementById(`chargePriceValue${region}`);
                
                if (chargeStartElement && chargeEndElement && chargePriceConditionElement && chargePriceValueElement) {
                    // 从localStorage或使用默认值
                    const savedChargeData = localStorage.getItem(`charge_${region}`);
                    if (savedChargeData) {
                        try {
                            const data = JSON.parse(savedChargeData);
                            chargeStartElement.value = data.startTime || '22:00';
                            chargeEndElement.value = data.endTime || '06:00';
                            chargePriceConditionElement.value = data.priceCondition || 'below';
                            chargePriceValueElement.value = data.priceValue || '50';
                        } catch (e) {
                            console.error('Error loading charge data for', region, e);
                        }
                    }
                }
                
                // 放电条件
                const dischargeStartElement = document.getElementById(`dischargeStart${region}`);
                const dischargeEndElement = document.getElementById(`dischargeEnd${region}`);
                const dischargePriceConditionElement = document.getElementById(`dischargePriceCondition${region}`);
                const dischargePriceValueElement = document.getElementById(`dischargePriceValue${region}`);
                
                if (dischargeStartElement && dischargeEndElement && dischargePriceConditionElement && dischargePriceValueElement) {
                    // 从localStorage或使用默认值
                    const savedDischargeData = localStorage.getItem(`discharge_${region}`);
                    if (savedDischargeData) {
                        try {
                            const data = JSON.parse(savedDischargeData);
                            dischargeStartElement.value = data.startTime || '17:00';
                            dischargeEndElement.value = data.endTime || '21:00';
                            dischargePriceConditionElement.value = data.priceCondition || 'above';
                            dischargePriceValueElement.value = data.priceValue || '120';
                        } catch (e) {
                            console.error('Error loading discharge data for', region, e);
                        }
                    }
                }
            });
        }
        
        // 保存所有地区的条件设置
        function saveAllConditionSettings() {
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            let savedCount = 0;
            
            regions.forEach(region => {
                // 保存充电条件
                const chargeData = {
                    startTime: document.getElementById(`chargeStart${region}`)?.value || '22:00',
                    endTime: document.getElementById(`chargeEnd${region}`)?.value || '06:00',
                    priceCondition: document.getElementById(`chargePriceCondition${region}`)?.value || 'below',
                    priceValue: document.getElementById(`chargePriceValue${region}`)?.value || '50'
                };
                
                localStorage.setItem(`charge_${region}`, JSON.stringify(chargeData));
                
                // 保存放电条件
                const dischargeData = {
                    startTime: document.getElementById(`dischargeStart${region}`)?.value || '17:00',
                    endTime: document.getElementById(`dischargeEnd${region}`)?.value || '21:00',
                    priceCondition: document.getElementById(`dischargePriceCondition${region}`)?.value || 'above',
                    priceValue: document.getElementById(`dischargePriceValue${region}`)?.value || '120'
                };
                
                localStorage.setItem(`discharge_${region}`, JSON.stringify(dischargeData));
                savedCount++;
            });
            
            // 关闭弹窗
            closeConditionSettingsModal();
            
            // 显示保存成功提示
            showAutoOperationNotification('设置', `已保存${savedCount}个地区的自动化条件设置`);
            
        }
        
        // 条件开关函数
        function toggleConditionSettings() {
            // 充电时间条件
            const chargeTimeEnabled = document.getElementById('chargeTimeEnabled')?.checked;
            const chargeTimeSettings = document.getElementById('chargeTimeSettings');
            if (chargeTimeSettings) {
                chargeTimeSettings.style.opacity = chargeTimeEnabled ? '1' : '0.5';
                chargeTimeSettings.style.pointerEvents = chargeTimeEnabled ? 'auto' : 'none';
            }
            
            // 充电价格条件
            const chargePriceEnabled = document.getElementById('chargePriceEnabled')?.checked;
            const chargePriceSettings = document.getElementById('chargePriceSettings');
            if (chargePriceSettings) {
                chargePriceSettings.style.opacity = chargePriceEnabled ? '1' : '0.5';
                chargePriceSettings.style.pointerEvents = chargePriceEnabled ? 'auto' : 'none';
            }
            
            // 放电时间条件
            const dischargeTimeEnabled = document.getElementById('dischargeTimeEnabled')?.checked;
            const dischargeTimeSettings = document.getElementById('dischargeTimeSettings');
            if (dischargeTimeSettings) {
                dischargeTimeSettings.style.opacity = dischargeTimeEnabled ? '1' : '0.5';
                dischargeTimeSettings.style.pointerEvents = dischargeTimeEnabled ? 'auto' : 'none';
            }
            
            // 放电价格条件
            const dischargePriceEnabled = document.getElementById('dischargePriceEnabled')?.checked;
            const dischargePriceSettings = document.getElementById('dischargePriceSettings');
            if (dischargePriceSettings) {
                dischargePriceSettings.style.opacity = dischargePriceEnabled ? '1' : '0.5';
                dischargePriceSettings.style.pointerEvents = dischargePriceEnabled ? 'auto' : 'none';
            }
        }
        
        // 添加事件监听
        setTimeout(() => {
            const checkboxes = [
                'chargeTimeEnabled',
                'chargePriceEnabled', 
                'dischargeTimeEnabled',
                'dischargePriceEnabled'
            ];
            
            checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.addEventListener('change', toggleConditionSettings);
                }
            });
        }, 500);
        
        // 多段时间管理 - 使用已经在顶部声明的全局变量
        
        // 添加充电时间段
        function addChargeTimeSegment() {
            const newSegment = { start: '22:00', end: '06:00' };
            window.chargeTimeSegments.push(newSegment);
            chargeTimeSegments = window.chargeTimeSegments;
            renderTimeSegments();
            updateTimeline();
            // 重新绑定事件
            setTimeout(() => bindTimeInputEvents(), 50);
        }
        
        // 添加放电时间段
        function addDischargeTimeSegment() {
            const newSegment = { start: '16:00', end: '21:00' };
            window.dischargeTimeSegments.push(newSegment);
            dischargeTimeSegments = window.dischargeTimeSegments;
            renderTimeSegments();
            updateTimeline();
            // 重新绑定事件
            setTimeout(() => bindTimeInputEvents(), 50);
        }
        
        // 渲染时间段
        function renderTimeSegments() {
            
            // 渲染充电时间段
            const chargeContainer = document.getElementById('chargeTimeSegments');
            if (chargeContainer) {
                chargeContainer.innerHTML = '';
                chargeTimeSegments.forEach((segment, index) => {
                    const segmentDiv = createTimeSegmentElement(segment, index, 'charge');
                    chargeContainer.appendChild(segmentDiv);
                });
            } else {
                console.warn('chargeTimeSegments container not found');
            }
            
            // 渲染放电时间段
            const dischargeContainer = document.getElementById('dischargeTimeSegments');
            if (dischargeContainer) {
                dischargeContainer.innerHTML = '';
                dischargeTimeSegments.forEach((segment, index) => {
                    const segmentDiv = createTimeSegmentElement(segment, index, 'discharge');
                    dischargeContainer.appendChild(segmentDiv);
                });
            } else {
                console.warn('dischargeTimeSegments container not found');
            }
        }
        
        // 创建时间段元素
        function createTimeSegmentElement(segment, index, type) {
            const segmentDiv = document.createElement('div');
            segmentDiv.className = 'time-segment';
            segmentDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);';
            
            const color = type === 'charge' ? '#00ff88' : '#FFC107';
            
            segmentDiv.innerHTML = `
                <span style="color: ${color}; font-size: 12px; min-width: 20px; font-weight: 500;">${index + 1}.</span>
                <input type="time" value="${segment.start}" data-index="${index}" data-field="start" data-type="${type}" class="time-input" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 6px; border-radius: 6px; font-size: 11px; outline: none; width: 70px;">
                <span style="color: rgba(255,255,255,0.6); font-size: 12px;">-</span>
                <input type="time" value="${segment.end}" data-index="${index}" data-field="end" data-type="${type}" class="time-input" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 6px; border-radius: 6px; font-size: 11px; outline: none; width: 70px;">
                <button onclick="removeTimeSegment(${index}, '${type}')" style="background: rgba(255,0,0,0.2); border: 1px solid rgba(255,0,0,0.3); color: #ff6b6b; padding: 2px 6px; border-radius: 6px; font-size: 10px; cursor: pointer; transition: all 0.3s;">×</button>
            `;
            
            return segmentDiv;
        }
        
        // 绑定时间输入事件
        function bindTimeInputEvents() {
            // 移除旧的事件监听器
            if (window.timeInputHandler) {
                document.removeEventListener('change', window.timeInputHandler);
            }
            
            // 创建新的事件监听器
            window.timeInputHandler = function(e) {
                if (e.target.classList.contains('time-input')) {
                    const index = parseInt(e.target.getAttribute('data-index'));
                    const field = e.target.getAttribute('data-field');
                    const type = e.target.getAttribute('data-type');
                    const value = e.target.value;
                    
                    updateTimeSegment(index, field, value, type);
                }
            };
            
            document.addEventListener('change', window.timeInputHandler);
        }
        
        // 更新时间段
        function updateTimeSegment(index, field, value, type) {
            
            if (type === 'charge' && index < chargeTimeSegments.length) {
                chargeTimeSegments[index][field] = value;
            } else if (type === 'discharge' && index < dischargeTimeSegments.length) {
                dischargeTimeSegments[index][field] = value;
            }
            
            // 检查并解决冲突
            resolveTimeConflicts();
            updateTimeline();
        }
        
        // 删除时间段
        function removeTimeSegment(index, type) {
            if (type === 'charge') {
                chargeTimeSegments.splice(index, 1);
            } else {
                dischargeTimeSegments.splice(index, 1);
            }
            
            renderTimeSegments();
            updateTimeline();
        }
        
        // 解决时间冲突（新的覆盖旧的）
        function resolveTimeConflicts() {
            
            // 先解决充电内部冲突
            const originalChargeLength = chargeTimeSegments.length;
            chargeTimeSegments = resolveInternalConflicts(chargeTimeSegments);
            
            // 再解决放电内部冲突
            const originalDischargeLength = dischargeTimeSegments.length;
            dischargeTimeSegments = resolveInternalConflicts(dischargeTimeSegments);
            
            // 最后解决充电和放电之间的冲突
            resolveCrossTypeConflicts();
            
            // 只在数量发生变化时才重新渲染
            if (chargeTimeSegments.length !== originalChargeLength || dischargeTimeSegments.length !== originalDischargeLength) {
                renderTimeSegments();
            }
        }
        
        // 解决内部冲突
        function resolveInternalConflicts(segments) {
            const resolved = [];
            
            segments.forEach(newSegment => {
                let hasConflict = false;
                
                // 检查与已存在段的冲突
                for (let i = resolved.length - 1; i >= 0; i--) {
                    if (timeSegmentsOverlap(newSegment, resolved[i])) {
                        // 有冲突，删除旧的
                        resolved.splice(i, 1);
                        hasConflict = true;
                    }
                }
                
                resolved.push(newSegment);
            });
            
            return resolved;
        }
        
        // 解决充电和放电之间的冲突
        function resolveCrossTypeConflicts() {
            const allSegments = [
                ...chargeTimeSegments.map(s => ({ ...s, type: 'charge', index: chargeTimeSegments.indexOf(s) })),
                ...dischargeTimeSegments.map(s => ({ ...s, type: 'discharge', index: dischargeTimeSegments.indexOf(s) }))
            ];
            
            // 按添加顺序排序（新的在后）
            for (let i = allSegments.length - 1; i >= 0; i--) {
                const current = allSegments[i];
                
                for (let j = i - 1; j >= 0; j--) {
                    const other = allSegments[j];
                    
                    if (timeSegmentsOverlap(current, other)) {
                        // 有冲突，删除较早的那个
                        if (other.type === 'charge') {
                            chargeTimeSegments.splice(other.index, 1);
                        } else {
                            dischargeTimeSegments.splice(other.index, 1);
                        }
                        
                        // 更新索引
                        allSegments.splice(j, 1);
                        i--; // 调整当前索引
                    }
                }
            }
        }
        
        // 判断时间段是否重叠
        function timeSegmentsOverlap(segment1, segment2) {
            const start1 = timeToMinutes(segment1.start);
            const end1 = timeToMinutes(segment1.end);
            const start2 = timeToMinutes(segment2.start);
            const end2 = timeToMinutes(segment2.end);
            
            // 处理跨夜情况
            const isOvernight1 = end1 < start1;
            const isOvernight2 = end2 < start2;
            
            if (isOvernight1 && isOvernight2) {
                return true; // 两个都跨夜，认为有重叠
            } else if (isOvernight1) {
                return (start2 >= start1 || end2 <= end1);
            } else if (isOvernight2) {
                return (start1 >= start2 || end1 <= end2);
            } else {
                return (start1 < end2 && start2 < end1);
            }
        }
        
        // 时间转换为分钟
        function timeToMinutes(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        }
        
        // 更新时间轴显示 - 已废弃，由 condition-settings-modal.js 中的 updateTimelineDisplay() 替代
        function updateTimeline() {
            // ⚠️ 不要清空 timelineDisplay，新系统使用 chargeTimelineBlocks 和 dischargeTimelineBlocks
            // 旧代码会干扰新的时间轴渲染系统，所以这个函数现在什么都不做

            // const timelineDisplay = document.getElementById('timelineDisplay');
            // if (!timelineDisplay) return;
            // timelineDisplay.innerHTML = '';  // ❌ 这行代码会清空时间轴！

            // 不在时间轴上显示时间段，只在时间条件卡片中显示
            // // 显示充电时间段
            // chargeTimeSegments.forEach(segment => {
            //     const segmentBar = createTimelineSegment(segment, 'charge');
            //     timelineDisplay.appendChild(segmentBar);
            // });

            // // 显示放电时间段
            // dischargeTimeSegments.forEach(segment => {
            //     const segmentBar = createTimelineSegment(segment, 'discharge');
            //     timelineDisplay.appendChild(segmentBar);
            // });
        }
        
        // 创建时间轴段
        function createTimelineSegment(segment, type) {
            const startHour = parseFloat(segment.start.replace(':', '.'));
            const endHour = parseFloat(segment.end.replace(':', '.'));
            
            const div = document.createElement('div');
            const color = type === 'charge' ? 'linear-gradient(135deg, #00ff88, #00dd77)' : 'linear-gradient(135deg, #FFC107, #FFB300)';
            
            if (endHour < startHour) {
                // 跨夜情况，分两段显示
                const container = document.createElement('div');
                
                // 第一段
                const part1 = document.createElement('div');
                const leftPercent1 = (startHour / 24) * 100;
                const widthPercent1 = ((24 - startHour) / 24) * 100;
                part1.style.cssText = `
                    position: absolute;
                    left: ${leftPercent1}%;
                    width: ${widthPercent1}%;
                    height: 24px;
                    background: ${color};
                    border-radius: 10px;
                    top: 4px;
                    opacity: 0.8;
                    transition: all 0.3s;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #000;
                    font-size: 10px;
                    font-weight: 600;
                `;
                part1.innerHTML = `${segment.start}-24:00`;
                
                // 第二段
                const part2 = document.createElement('div');
                const widthPercent2 = (endHour / 24) * 100;
                part2.style.cssText = `
                    position: absolute;
                    left: 0%;
                    width: ${widthPercent2}%;
                    height: 24px;
                    background: ${color};
                    border-radius: 10px;
                    top: 4px;
                    opacity: 0.8;
                    transition: all 0.3s;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #000;
                    font-size: 10px;
                    font-weight: 600;
                `;
                part2.innerHTML = `00:00-${segment.end}`;
                
                container.appendChild(part1);
                container.appendChild(part2);
                return container;
            } else {
                // 正常情况
                const leftPercent = (startHour / 24) * 100;
                const widthPercent = ((endHour - startHour) / 24) * 100;
                
                div.style.cssText = `
                    position: absolute;
                    left: ${leftPercent}%;
                    width: ${widthPercent}%;
                    height: 24px;
                    background: ${color};
                    border-radius: 10px;
                    top: 4px;
                    opacity: 0.8;
                    transition: all 0.3s;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #000;
                    font-size: 10px;
                    font-weight: 600;
                `;
                
                div.innerHTML = `${segment.start}-${segment.end}`;
                
                // 添加悬停效果
                div.onmouseenter = () => {
                    div.style.opacity = '1';
                    div.style.transform = 'scale(1.02)';
                };
                div.onmouseleave = () => {
                    div.style.opacity = '0.8';
                    div.style.transform = 'scale(1)';
                };
                
                return div;
            }
        }
        
        // 更新时间轴显示（同 updateTimeline）
        function updateTimelineDisplay() {
            updateTimeline();
        }
        
        // 创建时间轴段（同 createTimelineSegment）
        function createTimeSegmentBar(segment) {
            return createTimelineSegment(segment, segment.type || 'charge');
        }
        
        // 检查时间冲突（兼容性接口）
        function checkTimeConflicts(chargeSegments, dischargeSegments) {
            resolveTimeConflicts();
        }

        // ============== 时间条件管理系统 ==============
        
        // 时间条件状态管理（变量已在顶部声明）
        
        let currentTimeSelectionMode = null; // 'charge' 或 'discharge'
        let timeSelection = {
            isSelecting: false,
            startX: 0,
            current: null // { start: '09:00', end: '17:00', type: 'charge' }
        };

        // 设置时间选择模式
        function setTimeSelectionMode(mode) {
            
            // 确保 timeConditionSegments 已初始化
            if (!timeConditionSegments.charge || !timeConditionSegments.discharge) {
                console.error('timeConditionSegments not properly initialized!');
                timeConditionSegments = {
                    charge: [],
                    discharge: []
                };
            }
            
            currentTimeSelectionMode = mode;
            
            // 更新按钮状态
            const chargeBtn = document.getElementById('chargeSelectBtn');
            const dischargeBtn = document.getElementById('dischargeSelectBtn');
            const selectionBox = document.getElementById('timeSelectionBox');
            const interactArea = document.getElementById('timelineInteractArea');
            
            // 重置所有按钮
            chargeBtn.style.background = 'rgba(0,255,136,0.15)';
            chargeBtn.style.borderColor = 'rgba(0,255,136,0.3)';
            dischargeBtn.style.background = 'rgba(255,193,7,0.15)';
            dischargeBtn.style.borderColor = 'rgba(255,193,7,0.3)';
            
            if (mode === 'charge') {
                chargeBtn.style.background = 'rgba(0,255,136,0.3)';
                chargeBtn.style.borderColor = '#00ff88';
                if (selectionBox) {
                    selectionBox.style.background = 'rgba(0,255,136,0.3)';
                    selectionBox.style.borderColor = '#00ff88';
                }
                interactArea.style.cursor = 'crosshair';
            } else if (mode === 'discharge') {
                dischargeBtn.style.background = 'rgba(255,193,7,0.3)';
                dischargeBtn.style.borderColor = '#FFC107';
                if (selectionBox) {
                    selectionBox.style.background = 'rgba(255,193,7,0.3)';
                    selectionBox.style.borderColor = '#FFC107';
                }
                interactArea.style.cursor = 'crosshair';
            }
            
            // 绑定拖拽事件（只会绑定一次）
            bindTimeSelectionEvents();
            
            
            // 确保时间段显示正确
            updateTimelineDisplay();
            updateTimeSegmentsList();
        }

        // 全局变量用于事件处理
        let timeSelectionEventsBound = false;
        let isDraggingGlobal = false;
        let startXGlobal = 0;

        // 绑定时间选择拖拽事件（只绑定一次）
        function bindTimeSelectionEvents() {
            if (timeSelectionEventsBound) {
                return; // 防止重复绑定
            }
            
            const interactArea = document.getElementById('timelineInteractArea');
            if (!interactArea) {
                console.error('timelineInteractArea not found!');
                return;
            }
            
            
            // 鼠标按下
            interactArea.addEventListener('mousedown', (e) => {
                if (!currentTimeSelectionMode) return;
                
                isDraggingGlobal = true;
                timeSelection.isSelecting = true;
                startXGlobal = e.clientX - interactArea.getBoundingClientRect().left;
                timeSelection.startX = startXGlobal;
                
                const selectionBox = document.getElementById('timeSelectionBox');
                if (selectionBox) {
                    selectionBox.style.display = 'block';
                    selectionBox.style.left = startXGlobal + 'px';
                    selectionBox.style.width = '0px';
                }
                
                e.preventDefault();
            });
            
            // 鼠标移动
            interactArea.addEventListener('mousemove', (e) => {
                if (!isDraggingGlobal || !currentTimeSelectionMode) return;
                
                const currentX = e.clientX - interactArea.getBoundingClientRect().left;
                const selectionBox = document.getElementById('timeSelectionBox');
                
                const left = Math.min(startXGlobal, currentX);
                const width = Math.abs(currentX - startXGlobal);
                
                if (selectionBox) {
                    selectionBox.style.left = left + 'px';
                    selectionBox.style.width = width + 'px';
                }
                
                // 实时计算时间范围
                updateCurrentTimeSelection(left, width, interactArea.getBoundingClientRect().width);
            });
            
            // 鼠标抬起
            interactArea.addEventListener('mouseup', (e) => {
                
                if (!isDraggingGlobal || !currentTimeSelectionMode) {
                    return;
                }
                
                isDraggingGlobal = false;
                timeSelection.isSelecting = false;
                
                const currentX = e.clientX - interactArea.getBoundingClientRect().left;
                const totalWidth = interactArea.getBoundingClientRect().width;
                const left = Math.min(startXGlobal, currentX);
                const width = Math.abs(currentX - startXGlobal);
                
                
                if (width > 10) { // 最小拖拽距离
                    updateCurrentTimeSelection(left, width, totalWidth);
                    
                    // 自动添加时间段
                    autoAddTimeSegment();
                } else {
                    // 清除选择
                    clearTimeSelection();
                }
            });
            
            // 防止拖拽到外部
            document.addEventListener('mouseup', () => {
                if (isDraggingGlobal) {
                    isDraggingGlobal = false;
                    timeSelection.isSelecting = false;
                }
            });
            
            timeSelectionEventsBound = true;
        }

        // 更新当前时间选择
        function updateCurrentTimeSelection(left, width, totalWidth) {
            const startPercent = left / totalWidth;
            const endPercent = (left + width) / totalWidth;
            
            const startHour = Math.floor(startPercent * 24);
            const endHour = Math.ceil(endPercent * 24);
            
            const formatTime = (hour) => {
                return hour.toString().padStart(2, '0') + ':00';
            };
            
            timeSelection.current = {
                start: formatTime(Math.max(0, startHour)),
                end: formatTime(Math.min(24, endHour)),
                type: currentTimeSelectionMode
            };
            
        }

        // 自动添加时间段（框选完成后自动调用）
        function autoAddTimeSegment() {
            if (!timeSelection.current || !currentTimeSelectionMode) {
                return;
            }
            
            // 创建新时间段时，确保包含当前类型
            const newSegment = {
                start: timeSelection.current.start,
                end: timeSelection.current.end,
                id: Date.now().toString(), // 唯一ID
                type: currentTimeSelectionMode // 明确记录类型
            };
            
            
            // 检查与对方类型的时间冲突并处理
            const oppositeType = currentTimeSelectionMode === 'charge' ? 'discharge' : 'charge';
            const newOppositeSegments = [];
            
            timeConditionSegments[oppositeType].forEach((segment) => {
                if (isTimeSegmentOverlap(newSegment, segment)) {
                    // 有重叠，需要处理
                    const splitSegments = splitSegmentByOverlap(segment, newSegment);
                    newOppositeSegments.push(...splitSegments);
                } else {
                    // 无重叠，保留原段
                    newOppositeSegments.push(segment);
                }
            });
            
            // 更新对方类型的时间段
            timeConditionSegments[oppositeType] = newOppositeSegments;
            
            // 检查与自己类型的时间段，合并相邻或重叠的段
            const mergedSegment = { ...newSegment };
            const segmentsToRemove = [];
            
            
            timeConditionSegments[currentTimeSelectionMode].forEach((segment, index) => {
                if (shouldMergeSegments(mergedSegment, segment)) {
                    
                    // 合并时间段
                    const merged = mergeTimeSegments(mergedSegment, segment);
                    mergedSegment.start = merged.start;
                    mergedSegment.end = merged.end;
                    
                    segmentsToRemove.push(index);
                }
            });
            
            
            // 移除要合并的时间段
            for (let i = segmentsToRemove.length - 1; i >= 0; i--) {
                const removedSegment = timeConditionSegments[currentTimeSelectionMode].splice(segmentsToRemove[i], 1)[0];
            }
            
            // 添加合并后的时间段到正确的数组
            timeConditionSegments[currentTimeSelectionMode].push(mergedSegment);
            
            // 同步到旧系统的全局变量
            if (currentTimeSelectionMode === 'charge') {
                window.chargeTimeSegments = [...timeConditionSegments.charge];
                chargeTimeSegments = window.chargeTimeSegments;
            } else {
                window.dischargeTimeSegments = [...timeConditionSegments.discharge];
                dischargeTimeSegments = window.dischargeTimeSegments;
            }
            
            // 立即更新所有显示
            updateTimelineDisplay();
            updateTimeSegmentsList();
            
            // 也更新旧系统的显示（如果存在）
            if (typeof renderTimeSegments === 'function') {
                renderTimeSegments();
            }
            if (typeof updateTimeline === 'function') {
                updateTimeline();
            }
            
            // 清除选择框但保持选择模式
            clearTimeSelection();
            
            
            // 调试：显示当前所有时间段
            const chargeList = timeConditionSegments.charge.map(s => `${s.start}-${s.end}`).join(', ');
            const dischargeList = timeConditionSegments.discharge.map(s => `${s.start}-${s.end}`).join(', ');
        }

        // 添加当前时间选择
        function addCurrentTimeSelection() {
            
            if (!timeSelection.current || !currentTimeSelectionMode) {
                alert(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Please select time slots on timeline first' : '请先在时间轴上选择时间段');
                return;
            }
            
            const newSegment = {
                start: timeSelection.current.start,
                end: timeSelection.current.end,
                id: Date.now().toString() // 唯一ID
            };
            
            
            // 检查与对方类型的时间冲突
            const oppositeType = currentTimeSelectionMode === 'charge' ? 'discharge' : 'charge';
            const conflictingSegments = [];
            
            timeConditionSegments[oppositeType].forEach((segment, index) => {
                if (isTimeSegmentOverlap(newSegment, segment)) {
                    conflictingSegments.push(index);
                }
            });
            
            // 移除冲突的对方时间段
            for (let i = conflictingSegments.length - 1; i >= 0; i--) {
                const removedSegment = timeConditionSegments[oppositeType].splice(conflictingSegments[i], 1)[0];
            }
            
            // 检查与自己类型的时间冲突
            const sameTypeConflicts = [];
            timeConditionSegments[currentTimeSelectionMode].forEach((segment, index) => {
                if (isTimeSegmentOverlap(newSegment, segment)) {
                    sameTypeConflicts.push(index);
                }
            });
            
            // 移除冲突的同类型时间段
            for (let i = sameTypeConflicts.length - 1; i >= 0; i--) {
                const removedSegment = timeConditionSegments[currentTimeSelectionMode].splice(sameTypeConflicts[i], 1)[0];
            }
            
            // 添加新时间段
            timeConditionSegments[currentTimeSelectionMode].push(newSegment);
            
            // 更新显示
            updateTimelineDisplay();
            updateTimeSegmentsList();
            
            // 只清除当前选择框，但保持选择模式
            clearTimeSelection();
            
        }

        // 清除时间选择
        function clearTimeSelection() {
            timeSelection.current = null;
            
            const selectionBox = document.getElementById('timeSelectionBox');
            if (selectionBox) {
                selectionBox.style.display = 'none';
            } else {
                console.error('timeSelectionBox not found!');
            }
        }
        
        // ============== 时间条件矩形条系统 ==============
        
        let currentTimeBarMode = null; // 'charge' 或 'discharge'
        let timeBarSelection = {
            isSelecting: false,
            startX: 0,
            current: null
        };
        
        // 设置时间条选择模式
        function setTimeBarMode(mode) {
            
            currentTimeBarMode = mode;
            
            // 更新按钮状态
            const chargeBtn = document.getElementById('chargeTimeBarBtn');
            const dischargeBtn = document.getElementById('dischargeTimeBarBtn');
            const selectionBox = document.getElementById('timeBarSelection');
            
            if (chargeBtn && dischargeBtn) {
                if (mode === 'charge') {
                    chargeBtn.style.boxShadow = '0 0 12px rgba(0,255,136,0.5)';
                    dischargeBtn.style.boxShadow = 'none';
                    selectionBox.style.borderColor = '#00ff88';
                    selectionBox.style.backgroundColor = 'rgba(0,255,136,0.2)';
                } else {
                    dischargeBtn.style.boxShadow = '0 0 12px rgba(255,193,7,0.5)';
                    chargeBtn.style.boxShadow = 'none';
                    selectionBox.style.borderColor = '#FFC107';
                    selectionBox.style.backgroundColor = 'rgba(255,193,7,0.2)';
                }
            }
            
            // 绑定时间条交互事件
            initTimeBarInteraction();
        }
        
        // 初始化时间条交互
        function initTimeBarInteraction() {
            const interactArea = document.getElementById('timeBarInteraction');
            if (!interactArea) {
                return; // timeBar not in current layout
                return;
            }
            
            // 清除现有事件监听器
            interactArea.removeEventListener('mousedown', handleTimeBarMouseDown);
            interactArea.removeEventListener('mousemove', handleTimeBarMouseMove);
            interactArea.removeEventListener('mouseup', handleTimeBarMouseUp);
            
            // 添加新的事件监听器
            interactArea.addEventListener('mousedown', handleTimeBarMouseDown);
            interactArea.addEventListener('mousemove', handleTimeBarMouseMove);
            interactArea.addEventListener('mouseup', handleTimeBarMouseUp);
        }
        
        // 处理时间条鼠标按下
        function handleTimeBarMouseDown(e) {
            if (!currentTimeBarMode) return;
            
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            timeBarSelection.isSelecting = true;
            timeBarSelection.startX = x;
            
            const selectionBox = document.getElementById('timeBarSelection');
            if (selectionBox) {
                selectionBox.style.left = x + 'px';
                selectionBox.style.width = '0px';
                selectionBox.style.display = 'block';
            }
        }
        
        // 处理时间条鼠标移动
        function handleTimeBarMouseMove(e) {
            if (!timeBarSelection.isSelecting || !currentTimeBarMode) return;
            
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            const selectionBox = document.getElementById('timeBarSelection');
            if (selectionBox) {
                const left = Math.min(timeBarSelection.startX, x);
                const width = Math.abs(x - timeBarSelection.startX);
                
                selectionBox.style.left = left + 'px';
                selectionBox.style.width = width + 'px';
                
                // 计算时间范围
                const containerWidth = rect.width;
                const startPercent = left / containerWidth;
                const endPercent = (left + width) / containerWidth;
                
                const startTime = percentToTime(startPercent);
                const endTime = percentToTime(endPercent);
                
                timeBarSelection.current = {
                    start: startTime,
                    end: endTime,
                    type: currentTimeBarMode
                };
            }
        }
        
        // 处理时间条鼠标松开
        function handleTimeBarMouseUp(e) {
            if (!timeBarSelection.isSelecting || !currentTimeBarMode) return;
            
            timeBarSelection.isSelecting = false;
            
            // 如果有有效选择，添加时间段
            if (timeBarSelection.current) {
                addTimeBarSegment(timeBarSelection.current);
            }
            
            // 清除选择框
            const selectionBox = document.getElementById('timeBarSelection');
            if (selectionBox) {
                selectionBox.style.display = 'none';
            }
            
            timeBarSelection.current = null;
        }
        
        // 添加时间条段
        function addTimeBarSegment(segment) {
            
            // 确保 timeConditionSegments 已初始化
            if (!timeConditionSegments.charge || !timeConditionSegments.discharge) {
                timeConditionSegments = {
                    charge: [],
                    discharge: []
                };
            }
            
            const newSegment = {
                id: Date.now().toString() + Math.random(),
                start: segment.start,
                end: segment.end,
                type: segment.type
            };
            
            // 添加到相应的数组
            if (segment.type === 'charge') {
                timeConditionSegments.charge.push(newSegment);
            } else {
                timeConditionSegments.discharge.push(newSegment);
            }
            
            // 更新显示
            updateTimeConditionBars();
            updateTimeSegmentsList();
            
        }
        
        // 更新时间条件矩形条
        function updateTimeConditionBars() {
            const container = document.getElementById('timeConditionBars');
            if (!container) return;
            
            container.innerHTML = '';
            
            // 添加充电时间段
            timeConditionSegments.charge.forEach((segment, index) => {
                const bar = createTimeBar(segment, 'charge', index);
                container.appendChild(bar);
            });
            
            // 添加放电时间段
            timeConditionSegments.discharge.forEach((segment, index) => {
                const bar = createTimeBar(segment, 'discharge', index);
                container.appendChild(bar);
            });
        }
        
        // 创建时间条
        function createTimeBar(segment, type, index) {
            const bar = document.createElement('div');
            bar.className = `time-bar ${type}-bar`;
            
            const startPercent = timeToPercent(segment.start);
            const endPercent = timeToPercent(segment.end);
            const width = endPercent - startPercent;
            
            const color = type === 'charge' ? 
                'linear-gradient(135deg, #00ff88, #00dd77)' : 
                'linear-gradient(135deg, #FFC107, #FFB300)';
            
            const topPosition = type === 'charge' ? 6 : 24;
            
            bar.style.cssText = `
                position: absolute;
                top: ${topPosition}px;
                height: 18px;
                background: ${color};
                border-radius: 6px;
                left: ${startPercent}%;
                width: ${width}%;
                opacity: 0.9;
                cursor: pointer;
                transition: all 0.3s;
            `;
            
            // 添加删除功能
            bar.addEventListener('click', () => {
                removeTimeBarSegment(segment.id, type);
            });
            
            bar.addEventListener('mouseenter', () => {
                bar.style.opacity = '1';
                bar.style.transform = 'scale(1.02)';
            });
            
            bar.addEventListener('mouseleave', () => {
                bar.style.opacity = '0.9';
                bar.style.transform = 'scale(1)';
            });
            
            return bar;
        }
        
        // 删除时间条段
        function removeTimeBarSegment(segmentId, type) {
            if (type === 'charge') {
                timeConditionSegments.charge = timeConditionSegments.charge.filter(s => s.id !== segmentId);
            } else {
                timeConditionSegments.discharge = timeConditionSegments.discharge.filter(s => s.id !== segmentId);
            }
            
            updateTimeConditionBars();
            updateTimeSegmentsList();
        }
        
        // 时间转换为百分比
        function timeToPercent(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return ((hours * 60 + minutes) / (24 * 60)) * 100;
        }
        
        // 百分比转换为时间
        function percentToTime(percent) {
            const totalMinutes = (percent * 24 * 60) / 100;
            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.floor(totalMinutes % 60);
            
            // 对齐到30分钟间隔
            const alignedMinutes = Math.round(minutes / 30) * 30;
            const adjustedHours = alignedMinutes === 60 ? hours + 1 : hours;
            const finalMinutes = alignedMinutes === 60 ? 0 : alignedMinutes;
            
            return `${String(adjustedHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
        }
        
        // 初始化时间条件矩形条
        function initTimeConditionBars() {
            
            // 更新时间条件矩形条显示
            updateTimeConditionBars();
            
            // 默认选择充电模式
            setTimeBarMode('charge');
            
        }

        // 更新时间轴显示
        function updateTimelineDisplay() {
            
            const display = document.getElementById('timelineSegmentDisplay');
            if (!display) {
                return; // timeline not in current layout
                return;
            }
            
            // 清空现有显示
            display.innerHTML = '';
            
            // 显示充电时间段
            timeConditionSegments.charge.forEach((segment, index) => {
                const element = createTimelineSegmentElement(segment, 'charge');
                display.appendChild(element);
            });
            
            // 显示放电时间段
            timeConditionSegments.discharge.forEach((segment, index) => {
                const element = createTimelineSegmentElement(segment, 'discharge');
                display.appendChild(element);
            });
            
        }

        // 创建时间轴段元素
        function createTimelineSegmentElement(segment, type) {
            const element = document.createElement('div');
            
            const startHour = parseInt(segment.start.split(':')[0]);
            const endHour = parseInt(segment.end.split(':')[0]);
            
            const startPercent = (startHour / 24) * 100;
            let widthPercent = ((endHour - startHour) / 24) * 100;
            
            // 处理跨午夜的情况
            if (endHour < startHour) {
                widthPercent = ((24 - startHour + endHour) / 24) * 100;
            }
            
            // 使用segment自身的type属性（如果有），否则使用传入的type
            const actualType = segment.type || type;
            const color = actualType === 'charge' ? '#00ff88' : '#FFC107';
            const bgColor = actualType === 'charge' ? 'rgba(0,255,136,0.3)' : 'rgba(255,193,7,0.3)';
            
            element.style.cssText = `
                position: absolute;
                left: ${startPercent}%;
                width: ${widthPercent}%;
                height: 100%;
                background: ${bgColor};
                border: 1px solid ${color};
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            // 添加悬停效果
            element.onmouseenter = function() {
                element.style.opacity = '0.7';
                element.style.borderWidth = '2px';
            };
            
            element.onmouseleave = function() {
                element.style.opacity = '1';
                element.style.borderWidth = '1px';
            };
            
            // 添加点击事件以移除时间段
            element.onclick = function(e) {
                e.stopPropagation(); // 防止触发时间轴的拖拽事件
                
                // 从相应的数组中移除该时间段
                const segmentId = element.dataset.segmentId;
                const segmentType = element.dataset.segmentType;
                
                if (segmentType === 'charge') {
                    timeConditionSegments.charge = timeConditionSegments.charge.filter(s => s.id !== segmentId);
                } else if (segmentType === 'discharge') {
                    timeConditionSegments.discharge = timeConditionSegments.discharge.filter(s => s.id !== segmentId);
                }
                
                // 更新显示
                updateTimelineDisplay();
                updateTimeSegmentsList();
                
            };
            
            element.dataset.segmentType = actualType;
            element.dataset.segmentId = segment.id || `${actualType}-${Date.now()}`;
            
            return element;
        }

        // 更新时间段列表
        function updateTimeSegmentsList() {
            updateChargeSegmentsList();
            updateDischargeSegmentsList();
        }

        // 更新充电时间段列表
        function updateChargeSegmentsList() {
            const container = document.getElementById('chargeTimeSegmentsList');
            const countLabel = document.getElementById('chargeSegmentCount');
            
            if (!container) {
                return; // charge segments not in current layout
                return;
            }
            
            const segments = timeConditionSegments.charge;
            // 不再显示数量
            // countLabel.textContent = `(${segments.length}个)`;
            
            container.innerHTML = '';
            // 设置容器为水平布局
            container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; min-height: 30px;';
            
            if (segments.length === 0) {
                const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
                const emptyText = currentLanguage === 'en' ? 'No charge time slots' : '暂无充电时间段';
                container.innerHTML = `<div style="color: rgba(255,255,255,0.5); font-size: 12px; padding: 8px;">${emptyText}</div>`;
                return;
            }
            
            segments.forEach((segment, index) => {
                const segmentElement = createTimeSegmentListItem(segment, index, 'charge');
                container.appendChild(segmentElement);
            });
            
            // 确保翻译已更新
            if (window.i18n && window.i18n.isReady) {
                updateTimeSegmentListTranslations();
            }
        }

        // 更新放电时间段列表
        function updateDischargeSegmentsList() {
            
            const container = document.getElementById('dischargeTimeSegmentsList');
            const countLabel = document.getElementById('dischargeSegmentCount');
            
            if (!container) {
                return; // discharge segments not in current layout
                return;
            }
            
            const segments = timeConditionSegments.discharge;
            // 不再显示数量
            // countLabel.textContent = `(${segments.length}个)`;
            
            container.innerHTML = '';
            // 设置容器为水平布局
            container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; min-height: 30px;';
            
            if (segments.length === 0) {
                const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
                const emptyText = currentLanguage === 'en' ? 'No discharge time slots' : '暂无放电时间段';
                container.innerHTML = `<div style="color: rgba(255,255,255,0.5); font-size: 12px; padding: 8px;">${emptyText}</div>`;
                return;
            }
            
            segments.forEach((segment, index) => {
                const segmentElement = createTimeSegmentListItem(segment, index, 'discharge');
                container.appendChild(segmentElement);
            });
            
            // 确保翻译已更新
            if (window.i18n && window.i18n.isReady) {
                updateTimeSegmentListTranslations();
            }
        }

        // 创建时间段列表项
        function createTimeSegmentListItem(segment, index, type) {
            const item = document.createElement('div');
            // 使用segment自身的type属性（如果有），否则使用传入的type
            const actualType = segment.type || type;
            const color = actualType === 'charge' ? '#00ff88' : '#FFC107';
            const bgColor = actualType === 'charge' ? 'rgba(0,255,136,0.1)' : 'rgba(255,193,7,0.1)';
            const borderColor = actualType === 'charge' ? 'rgba(0,255,136,0.3)' : 'rgba(255,193,7,0.3)';
            
            item.style.cssText = `
                position: relative;
                display: inline-flex;
                align-items: center;
                padding: 6px 12px;
                background: ${bgColor};
                border: 1px solid ${borderColor};
                border-radius: 10px;
                font-size: 12px;
                color: ${color};
                font-weight: 500;
                min-width: 80px;
                justify-content: center;
            `;
            
            item.dataset.segmentType = actualType;
            item.dataset.segmentIndex = index;
            item.dataset.segmentId = segment.id;
            
            // 创建可编辑的时间显示
            const timeDisplay = document.createElement('span');
            timeDisplay.style.cursor = 'pointer';
            timeDisplay.textContent = `${segment.start} - ${segment.end}`;
            timeDisplay.onclick = () => enableTimeEditing(item, segment, index, actualType);
            
            item.innerHTML = `
                <button onclick="deleteTimeSegment(${index}, '${actualType}')" 
                        style="position: absolute; top: -4px; right: -4px; width: 16px; height: 16px; 
                               background: #ff4444; color: #fff; border: none; border-radius: 50%; 
                               font-size: 10px; cursor: pointer; display: flex; align-items: center; 
                               justify-content: center; line-height: 1; padding: 0; transition: all 0.3s;
                               box-shadow: 0 2px 4px rgba(0,0,0,0.2);"
                        onmouseover="this.style.background='#ff6666'" 
                        onmouseout="this.style.background='#ff4444'">×</button>
            `;
            
            item.insertBefore(timeDisplay, item.firstChild);
            
            return item;
        }

        // 启用时间编辑
        function enableTimeEditing(item, segment, index, type) {
            const color = type === 'charge' ? '#00ff88' : '#FFC107';
            const bgColor = type === 'charge' ? 'rgba(0,255,136,0.1)' : 'rgba(255,193,7,0.1)';
            
            // 创建输入框
            const startInput = document.createElement('input');
            startInput.type = 'time';
            startInput.value = segment.start;
            startInput.style.cssText = `
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: #fff;
                padding: 2px 4px;
                border-radius: 6px;
                font-size: 11px;
                outline: none;
                width: 60px;
            `;
            
            const endInput = document.createElement('input');
            endInput.type = 'time';
            endInput.value = segment.end;
            endInput.style.cssText = startInput.style.cssText;
            
            const separator = document.createElement('span');
            separator.textContent = ' - ';
            separator.style.color = color;
            
            // 保存原始内容
            const originalContent = item.innerHTML;
            
            // 清空并添加输入框
            item.innerHTML = '';
            item.appendChild(startInput);
            item.appendChild(separator);
            item.appendChild(endInput);
            
            // 添加确认和取消按钮
            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = '✓';
            confirmBtn.style.cssText = `
                margin-left: 4px;
                background: ${bgColor};
                border: 1px solid ${color};
                color: ${color};
                padding: 2px 6px;
                border-radius: 6px;
                font-size: 10px;
                cursor: pointer;
            `;
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '✗';
            cancelBtn.style.cssText = confirmBtn.style.cssText.replace(color, '#ff6666').replace(bgColor, 'rgba(255,0,0,0.1)');
            
            confirmBtn.onclick = () => {
                const newStart = startInput.value;
                const newEnd = endInput.value;
                
                if (newStart && newEnd) {
                    updateTimeSegment(index, 'start', newStart, type);
                    updateTimeSegment(index, 'end', newEnd, type);
                }
                
                // 恢复正常显示
                updateTimeSegmentsList();
            };
            
            cancelBtn.onclick = () => {
                // 恢复原始内容
                item.innerHTML = originalContent;
                // 重新绑定事件
                const timeDisplay = item.querySelector('span');
                if (timeDisplay) {
                    timeDisplay.onclick = () => enableTimeEditing(item, segment, index, type);
                }
            };
            
            item.appendChild(confirmBtn);
            item.appendChild(cancelBtn);
            
            // 聚焦第一个输入框
            startInput.focus();
            startInput.select();
        }

        // 更新时间段
        function updateTimeSegment(index, field, value, type) {
            if (!timeConditionSegments[type][index]) return;
            
            const oldSegment = { ...timeConditionSegments[type][index] };
            timeConditionSegments[type][index][field] = value;
            
            
            // 检查更新后的时间段是否与其他时间段冲突
            const updatedSegment = timeConditionSegments[type][index];
            const oppositeType = type === 'charge' ? 'discharge' : 'charge';
            
            // 检查与对方类型的冲突
            const conflictingOpposite = [];
            timeConditionSegments[oppositeType].forEach((segment, idx) => {
                if (isTimeSegmentOverlap(updatedSegment, segment)) {
                    conflictingOpposite.push(idx);
                }
            });
            
            // 移除冲突的对方时间段
            for (let i = conflictingOpposite.length - 1; i >= 0; i--) {
                const removed = timeConditionSegments[oppositeType].splice(conflictingOpposite[i], 1)[0];
            }
            
            // 检查与同类型其他时间段的冲突
            const conflictingSame = [];
            timeConditionSegments[type].forEach((segment, idx) => {
                if (idx !== index && isTimeSegmentOverlap(updatedSegment, segment)) {
                    conflictingSame.push(idx);
                }
            });
            
            // 移除冲突的同类型时间段
            for (let i = conflictingSame.length - 1; i >= 0; i--) {
                const removed = timeConditionSegments[type].splice(conflictingSame[i], 1)[0];
                // 如果删除的索引小于当前索引，需要调整当前索引
                if (conflictingSame[i] < index) {
                    index--;
                }
            }
            
            // 合并所有相邻或重叠的同类型时间段
            consolidateTimeSegments(type);
            
            // 同步到旧系统
            if (type === 'charge') {
                window.chargeTimeSegments = [...timeConditionSegments.charge];
                chargeTimeSegments = window.chargeTimeSegments;
            } else {
                window.dischargeTimeSegments = [...timeConditionSegments.discharge];
                dischargeTimeSegments = window.dischargeTimeSegments;
            }
            
            // 更新显示
            updateTimelineDisplay();
            updateTimeSegmentsList();
            
            // 更新旧系统显示
            if (typeof renderTimeSegments === 'function') {
                renderTimeSegments();
            }
            if (typeof updateTimeline === 'function') {
                updateTimeline();
            }
        }

        // 删除时间段
        function deleteTimeSegment(index, type) {
            if (!timeConditionSegments[type][index]) return;
            
            const removedSegment = timeConditionSegments[type].splice(index, 1)[0];
            
            // 合并所有相邻或重叠的同类型时间段
            consolidateTimeSegments(type);
            
            // 同步到旧系统
            if (type === 'charge') {
                window.chargeTimeSegments = [...timeConditionSegments.charge];
                chargeTimeSegments = window.chargeTimeSegments;
            } else {
                window.dischargeTimeSegments = [...timeConditionSegments.discharge];
                dischargeTimeSegments = window.dischargeTimeSegments;
            }
            
            // 更新显示
            updateTimelineDisplay();
            updateTimeSegmentsList();
            
            // 更新旧系统显示
            if (typeof renderTimeSegments === 'function') {
                renderTimeSegments();
            }
            if (typeof updateTimeline === 'function') {
                updateTimeline();
            }
        }

        // 检查时间段重叠
        function isTimeSegmentOverlap(segment1, segment2) {
            const start1 = timeStringToMinutes(segment1.start);
            const end1 = timeStringToMinutes(segment1.end);
            const start2 = timeStringToMinutes(segment2.start);
            const end2 = timeStringToMinutes(segment2.end);
            
            // 处理跨午夜的情况
            if (end1 < start1) { // segment1 跨午夜
                if (end2 < start2) { // segment2 也跨午夜
                    // 两个都跨午夜，需要检查是否真的有重叠
                    // 不重叠的情况：segment1的结束时间 < segment2的开始时间 且 segment2的结束时间 < segment1的开始时间
                    return !(end1 < start2 && end2 < start1);
                } else {
                    // segment1跨午夜，segment2不跨午夜
                    // segment2要么在晚上部分，要么在早上部分
                    return (start2 >= start1) || (end2 <= end1);
                }
            } else if (end2 < start2) { // 只有 segment2 跨午夜
                // segment2跨午夜，segment1不跨午夜
                return (start1 >= start2) || (end1 <= end2);
            } else { // 都不跨午夜
                return (start1 < end2) && (end1 > start2);
            }
        }

        // 时间字符串转分钟数
        function timeStringToMinutes(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        }

        // 分钟数转时间字符串
        function minutesToTimeString(minutes) {
            // 处理负数和超过24小时的情况
            minutes = ((minutes % 1440) + 1440) % 1440;
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        }

        // 检查两个时间段是否应该合并（重叠或相邻）
        function shouldMergeSegments(segment1, segment2) {
            const start1 = timeStringToMinutes(segment1.start);
            const end1 = timeStringToMinutes(segment1.end);
            const start2 = timeStringToMinutes(segment2.start);
            const end2 = timeStringToMinutes(segment2.end);
            
            // 处理跨午夜的情况
            if (end1 < start1 || end2 < start2) {
                // 复杂情况，暂时只处理有重叠的情况
                return isTimeSegmentOverlap(segment1, segment2);
            }
            
            // 都不跨午夜的简单情况
            // 检查是否重叠或相邻（相差不超过1分钟视为相邻）
            const gap = Math.min(Math.abs(start1 - end2), Math.abs(start2 - end1));
            return isTimeSegmentOverlap(segment1, segment2) || gap <= 1;
        }

        // 合并两个时间段
        function mergeTimeSegments(segment1, segment2) {
            const start1 = timeStringToMinutes(segment1.start);
            const end1 = timeStringToMinutes(segment1.end);
            const start2 = timeStringToMinutes(segment2.start);
            const end2 = timeStringToMinutes(segment2.end);
            
            // 处理跨午夜的情况
            const overnight1 = end1 < start1;
            const overnight2 = end2 < start2;
            
            if (overnight1 && overnight2) {
                // 两个都跨午夜，合并后仍跨午夜
                const minStart = Math.min(start1, start2);
                const maxEnd = Math.max(end1, end2);
                return {
                    start: minutesToTimeString(minStart),
                    end: minutesToTimeString(maxEnd)
                };
            } else if (overnight1 || overnight2) {
                // 其中一个跨午夜，需要特殊处理
                // 简化处理：返回覆盖两个时间段的最大范围
                let allTimes = [start1, end1, start2, end2];
                
                if (overnight1) {
                    // segment1跨午夜
                    if (start2 >= start1 || end2 <= end1) {
                        // segment2在晚上部分或早上部分
                        return segment1; // segment1已经包含segment2
                    }
                    // 需要扩展
                    if (start2 < start1 && end2 > end1) {
                        // segment2跨越了segment1的间隙
                        return {
                            start: '00:00',
                            end: '24:00'
                        };
                    }
                    return {
                        start: minutesToTimeString(Math.min(start1, start2)),
                        end: minutesToTimeString(Math.max(end1, end2))
                    };
                } else {
                    // segment2跨午夜
                    if (start1 >= start2 || end1 <= end2) {
                        return segment2; // segment2已经包含segment1
                    }
                    if (start1 < start2 && end1 > end2) {
                        return {
                            start: '00:00',
                            end: '24:00'
                        };
                    }
                    return {
                        start: minutesToTimeString(Math.min(start1, start2)),
                        end: minutesToTimeString(Math.max(end1, end2))
                    };
                }
            } else {
                // 都不跨午夜，简单合并
                const minStart = Math.min(start1, start2);
                const maxEnd = Math.max(end1, end2);
                return {
                    start: minutesToTimeString(minStart),
                    end: minutesToTimeString(maxEnd)
                };
            }
        }

        // 合并同类型的所有相邻或重叠时间段
        function consolidateTimeSegments(type) {
            const segments = timeConditionSegments[type];
            if (segments.length <= 1) return;
            
            
            // 重复合并直到没有可合并的段
            let hasChanges = true;
            while (hasChanges) {
                hasChanges = false;
                
                for (let i = 0; i < segments.length - 1; i++) {
                    for (let j = i + 1; j < segments.length; j++) {
                        if (shouldMergeSegments(segments[i], segments[j])) {
                            // 合并这两个段
                            const merged = mergeTimeSegments(segments[i], segments[j]);
                            
                            // 保留合并后的段在i位置
                            segments[i] = {
                                ...merged,
                                id: segments[i].id, // 保留原ID
                                type: type
                            };
                            
                            // 删除j位置的段
                            segments.splice(j, 1);
                            
                            hasChanges = true;
                            break;
                        }
                    }
                    if (hasChanges) break;
                }
            }
            
        }

        // 根据重叠分割时间段
        function splitSegmentByOverlap(existingSegment, newSegment) {
            const existing = {
                start: timeStringToMinutes(existingSegment.start),
                end: timeStringToMinutes(existingSegment.end)
            };
            const newSeg = {
                start: timeStringToMinutes(newSegment.start),
                end: timeStringToMinutes(newSegment.end)
            };
            
            const result = [];
            
            // 处理跨午夜的情况
            const existingOvernight = existing.end < existing.start;
            const newOvernight = newSeg.end < newSeg.start;
            
            if (existingOvernight && newOvernight) {
                // 两个都跨午夜，特殊处理
                // 可能产生0-2个片段
                if (newSeg.end < existing.start && existing.end < newSeg.start) {
                    // 新段完全覆盖旧段，返回空
                    return [];
                }
                
                if (existing.start > newSeg.end && newSeg.start > existing.end) {
                    // 无重叠
                    return [existingSegment];
                }
                
                // 部分重叠
                if (existing.start > newSeg.end) {
                    // 保留晚上部分
                    result.push({
                        ...existingSegment,
                        start: minutesToTimeString(existing.start),
                        end: minutesToTimeString(newSeg.start)
                    });
                }
                if (newSeg.end < existing.end) {
                    // 保留早上部分
                    result.push({
                        ...existingSegment,
                        start: minutesToTimeString(newSeg.end),
                        end: minutesToTimeString(existing.end)
                    });
                }
            } else if (existingOvernight) {
                // 只有existing跨午夜
                if (newSeg.start >= existing.start || newSeg.end <= existing.end) {
                    // 新段在晚上或早上部分
                    if (newSeg.start >= existing.start) {
                        // 新段在晚上部分
                        if (newSeg.end < 1440) {
                            // 保留更晚的部分
                            result.push({
                                ...existingSegment,
                                start: minutesToTimeString(newSeg.end),
                                end: existingSegment.end
                            });
                        }
                        // 保留早上部分
                        result.push({
                            ...existingSegment,
                            start: '00:00',
                            end: existingSegment.end
                        });
                    } else {
                        // 新段在早上部分
                        result.push({
                            ...existingSegment,
                            start: existingSegment.start,
                            end: '24:00'
                        });
                        if (newSeg.start > 0) {
                            result.push({
                                ...existingSegment,
                                start: '00:00',
                                end: minutesToTimeString(newSeg.start)
                            });
                        }
                        if (newSeg.end < existing.end) {
                            result.push({
                                ...existingSegment,
                                start: minutesToTimeString(newSeg.end),
                                end: existingSegment.end
                            });
                        }
                    }
                } else {
                    // 新段跨越午夜分界
                    if (newSeg.start > existing.end && newSeg.end < existing.start) {
                        // 保留existing
                        return [existingSegment];
                    }
                }
            } else if (newOvernight) {
                // 只有new跨午夜
                if (existing.start >= newSeg.start || existing.end <= newSeg.end) {
                    // existing完全被覆盖
                    return [];
                }
                // 部分覆盖
                if (existing.start < newSeg.start && existing.end > newSeg.start) {
                    result.push({
                        ...existingSegment,
                        start: existingSegment.start,
                        end: minutesToTimeString(newSeg.start)
                    });
                }
                if (existing.start < newSeg.end && existing.end > newSeg.end) {
                    result.push({
                        ...existingSegment,
                        start: minutesToTimeString(newSeg.end),
                        end: existingSegment.end
                    });
                }
            } else {
                // 都不跨午夜，简单情况
                if (newSeg.start <= existing.start && newSeg.end >= existing.end) {
                    // 完全覆盖
                    return [];
                }
                
                if (newSeg.start > existing.start && newSeg.start < existing.end) {
                    // 保留前半部分
                    result.push({
                        ...existingSegment,
                        start: existingSegment.start,
                        end: minutesToTimeString(newSeg.start)
                    });
                }
                
                if (newSeg.end > existing.start && newSeg.end < existing.end) {
                    // 保留后半部分
                    result.push({
                        ...existingSegment,
                        start: minutesToTimeString(newSeg.end),
                        end: existingSegment.end
                    });
                }
            }
            
            // 过滤掉无效的时间段（开始时间等于结束时间）
            return result.filter(seg => seg.start !== seg.end);
        }

        // 初始化时间条件模块
        function initTimeConditions() {
            
            // 确保timeConditionSegments已初始化
            if (typeof timeConditionSegments === 'undefined' || !timeConditionSegments.charge || !timeConditionSegments.discharge) {
                window.timeConditionSegments = {
                    charge: [
                        { id: 'default-charge', start: '22:00', end: '06:00', type: 'charge' }
                    ],
                    discharge: [
                        { id: 'default-discharge', start: '16:00', end: '21:00', type: 'discharge' }
                    ]
                };
                timeConditionSegments = window.timeConditionSegments;
            }
            
            // 初始化时间条件矩形条
            initTimeConditionBars();
            
            // 初始化旧系统的全局变量
            if (!window.chargeTimeSegments) {
                window.chargeTimeSegments = [];
            }
            if (!window.dischargeTimeSegments) {
                window.dischargeTimeSegments = [];
            }
            
            // 确保局部变量也初始化
            chargeTimeSegments = window.chargeTimeSegments;
            dischargeTimeSegments = window.dischargeTimeSegments;
            
            // 初始化显示
            updateTimelineDisplay();
            updateTimeSegmentsList();
            
        }
        
        // 在页面加载完成后初始化
        setTimeout(() => {
            initTimeConditions();
        }, 100);
        
        // 测试函数 - 手动添加时间段
        window.testAddTimeSegment = function(type = 'charge', start = '10:00', end = '12:00') {
            
            if (!timeConditionSegments[type]) {
                console.error('timeConditionSegments not initialized!');
                return;
            }
            
            const testSegment = {
                start: start,
                end: end,
                id: Date.now().toString(),
                type: type
            };
            
            timeConditionSegments[type].push(testSegment);
            
            // 更新显示
            updateTimelineDisplay();
            updateTimeSegmentsList();
            
        };
        
        // 调试函数 - 检查所有相关元素
        window.checkTimeConditionElements = function() {
            
            const elements = {
                'timelineInteractArea': document.getElementById('timelineInteractArea'),
                'timeSelectionBox': document.getElementById('timeSelectionBox'),
                'timelineSegmentDisplay': document.getElementById('timelineSegmentDisplay'),
                'chargeTimeSegmentsList': document.getElementById('chargeTimeSegmentsList'),
                'dischargeTimeSegmentsList': document.getElementById('dischargeTimeSegmentsList'),
                'chargeSelectBtn': document.getElementById('chargeSelectBtn'),
                'dischargeSelectBtn': document.getElementById('dischargeSelectBtn'),
                'chargeSegmentCount': document.getElementById('chargeSegmentCount'),
                'dischargeSegmentCount': document.getElementById('dischargeSegmentCount')
            };
            
            for (const [id, element] of Object.entries(elements)) {
            }
            
            
            return elements;
        };
        
        // 检查两个时间段是否重叠
        function isTimeOverlap(segment1, segment2) {
            const start1 = timeToMinutes(segment1.start);
            const end1 = timeToMinutes(segment1.end);
            const start2 = timeToMinutes(segment2.start);
            const end2 = timeToMinutes(segment2.end);
            
            // 处理跨午夜的情况
            if (end1 < start1) { // segment1 跨午夜
                if (end2 < start2) { // segment2 也跨午夜
                    return true; // 两个跨午夜的段肯定重叠
                } else {
                    return (start2 >= start1) || (end2 <= end1);
                }
            } else if (end2 < start2) { // 只有 segment2 跨午夜
                return (start1 >= start2) || (end1 <= end2);
            } else { // 都不跨午夜
                return (start1 < end2) && (end1 > start2);
            }
        }
        
        // 将时间字符串转换为分钟数
        function timeToMinutes(timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        }
        
        // 初始化事件监听和数据
        setTimeout(() => {
            // 初始化时间段数组
            if (typeof chargeTimeSegments === 'undefined') {
                chargeTimeSegments = [{ start: '22:00', end: '06:00' }];
            }
            if (typeof dischargeTimeSegments === 'undefined') {
                dischargeTimeSegments = [{ start: '16:00', end: '21:00' }];
            }
            
        }, 500);
        
        // 设置卡片的取消和保存功能
        function cancelSettings() {
            // 这里可以重置设置到之前的状态
            // 暂时只显示提示
            alert(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Settings cancelled' : '设置已取消');
        }
        
        function saveSettings() {
            // 这里可以保存当前设置状态
            // 暂时只显示提示
            alert(window.i18n && window.i18n.getCurrentLanguage() === 'en' ? 'Settings saved' : '设置已保存');
        }
    


        // 全局推送弹窗功能
        let pushNotificationTimeouts = {};

        // 显示推送弹窗
        function showPushNotification(notificationId, data = {}) {
            const notification = document.getElementById(notificationId);
            
            if (!notification) return;
            
            // 更新内容
            if (data.region || data.price || data.threshold || data.action || data.timeRemaining) {
                updateNotificationContent(notificationId, data);
            }
            
            // 显示弹窗
            notification.classList.add('show');
            notification.classList.remove('hide');
            
            // 不设置自动隐藏定时器，只能手动关闭
            // 清除之前的定时器（如果有的话）
            if (pushNotificationTimeouts[notificationId]) {
                clearTimeout(pushNotificationTimeouts[notificationId]);
                delete pushNotificationTimeouts[notificationId];
            }
        }

        // 关闭推送弹窗
        function closePushNotification(notificationId) {
            const notification = document.getElementById(notificationId);
            if (!notification) return;
            
            notification.classList.add('hide');
            notification.classList.remove('show');
            
            // 清除定时器
            if (pushNotificationTimeouts[notificationId]) {
                clearTimeout(pushNotificationTimeouts[notificationId]);
                delete pushNotificationTimeouts[notificationId];
            }
        }
        
        
        // 更新弹窗内容
        function updateNotificationContent(notificationId, data) {
            const notification = document.getElementById(notificationId);
            if (!notification) return;
            
            const contentElement = notification.querySelector('.push-notification-content p');
            const titleElement = notification.querySelector('.push-notification-title span:last-child');
            if (!contentElement) return;
            
            const currentLanguage = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
            
            if (notificationId === 'normalPushNotification') {
                const action = data.action || '充电';
                const region = data.region || 'NSW';
                const price = data.price || '300';
                const threshold = data.threshold || '250';
                
                // 普通：放电/充电提醒——地区
                if (titleElement) {
                    if (currentLanguage === 'en') {
                        const actionEn = action === '充电' ? 'Charge' : 'Discharge';
                        titleElement.textContent = data.customTitleEn || `${actionEn} Reminder - ${region}`;
                    } else {
                        titleElement.textContent = data.customTitle || `${action}提醒——${region}`;
                    }
                }
                
                // 内容：当前价格多少，超过/低于阈值，请放电/充电
                const highlightPrice = `<span class="highlight-number">$${price}</span>`;
                const highlightThreshold = `<span class="highlight-number">$${threshold}</span>`;
                
                if (currentLanguage === 'en') {
                    const comparison = action === '充电' ? 'below threshold' : 'above threshold';
                    const actionEn = action === '充电' ? 'charge' : 'discharge';
                    const highlightAction = `<span class="highlight-action">${actionEn}</span>`;
                    contentElement.innerHTML = `Current price ${highlightPrice} ${comparison} ${highlightThreshold}, please ${highlightAction}`;
                } else {
                    const comparison = action === '充电' ? '低于' : '超过';
                    const highlightAction = `<span class="highlight-action">${action}</span>`;
                    contentElement.innerHTML = (window.i18n && window.i18n.getCurrentLanguage() === 'en') ? `Price ${highlightPrice}, ${comparison} threshold ${highlightThreshold}, please ${highlightAction}` : `当前价格${highlightPrice}，${comparison}阈值${highlightThreshold}，请${highlightAction}`;
                }
                
            } else if (notificationId === 'advancedPushNotification') {
                const region = data.region || 'NSW';
                const price = data.price || '300';
                const timeRemaining = data.timeRemaining || '15分钟';
                const action = data.action || '充电';
                
                // 高级：最佳放电时机——地区
                if (titleElement) {
                    if (currentLanguage === 'en') {
                        const actionEn = action === '充电' ? 'Charge' : 'Discharge';
                        titleElement.textContent = data.customTitleEn || `Optimal ${actionEn} Reminder - ${region}`;
                    } else {
                        titleElement.textContent = data.customTitle || `最佳${action}时机——${region}`;
                    }
                }
                
                // 内容：当前价格多少，还有多久到达最佳放电时间，请做好准备
                const highlightPrice = `<span class="highlight-number">$${price}</span>`;
                const highlightTime = `<span class="highlight-time">${timeRemaining}</span>`;
                
                if (currentLanguage === 'en') {
                    const actionEn = action === '充电' ? 'charge' : 'discharge';
                    const timeEn = timeRemaining.replace('分钟', ' minutes');
                    contentElement.innerHTML = `${region} region ${actionEn} price ${highlightPrice}, ${timeEn} until optimal ${actionEn} time, please prepare`;
                } else {
                    const opportunityText = `最佳${action}时间`;
                    contentElement.innerHTML = (window.i18n && window.i18n.getCurrentLanguage() === 'en') ? `Price ${highlightPrice}, ${highlightTime} to ${opportunityText}, please prepare` : `当前价格${highlightPrice}，还有${highlightTime}到达${opportunityText}，请做好准备`;
                }
            }
        }

        // 模拟推送通知函数（供测试使用）
        function simulatePushNotifications() {
            let pushCount = 0;
            
            // 定义四种推送类型
            const pushTypes = [
                {
                    type: 'normal',
                    action: '充电',
                    title: '充电提醒——NSW',
                    titleEn: 'Charging Alert - NSW',
                    price: () => (200 + Math.floor(Math.random() * 50)).toString(),
                    threshold: '250',
                    region: 'NSW'
                },
                {
                    type: 'normal',
                    action: '放电',
                    title: '放电提醒——NSW',
                    titleEn: 'Discharging Alert - NSW',
                    price: () => (350 + Math.floor(Math.random() * 100)).toString(),
                    threshold: '300',
                    region: 'NSW'
                },
                {
                    type: 'advanced',
                    action: '充电',
                    title: '最佳充电时机——NSW',
                    titleEn: 'Optimal Charging Time - NSW',
                    price: () => (180 + Math.floor(Math.random() * 80)).toString(),
                    timeRemaining: () => (5 + Math.floor(Math.random() * 25)) + '分钟',
                    region: 'NSW'
                },
                {
                    type: 'advanced',
                    action: '放电',
                    title: '最佳放电时机——NSW',
                    titleEn: 'Optimal Discharging Time - NSW',
                    price: () => (400 + Math.floor(Math.random() * 100)).toString(),
                    timeRemaining: () => (10 + Math.floor(Math.random() * 30)) + '分钟',
                    region: 'NSW'
                }
            ];
            
            // 每10秒推送一次，循环显示四种类型
            setInterval(() => {
                const currentPush = pushTypes[pushCount % 4];
                pushCount++;
                
                if (currentPush.type === 'normal') {
                    showPushNotification('normal', {
                        region: 'NSW',
                        price: currentPush.price(),
                        threshold: currentPush.threshold,
                        action: currentPush.action,
                        customTitle: currentPush.title,
                        customTitleEn: currentPush.titleEn
                    });
                } else {
                    showPushNotification('advanced', {
                        region: 'NSW',
                        price: currentPush.price(),
                        timeRemaining: currentPush.timeRemaining(),
                        action: currentPush.action,
                        customTitle: currentPush.title,
                        customTitleEn: currentPush.titleEn
                    });
                }
            }, 10000); // 每10秒推送一次
            
            // 首次推送（页面加载后3秒）- 普通充电
            setTimeout(() => {
                showPushNotification('normal', {
                    region: 'NSW',
                    price: '300',
                    threshold: '250',
                    action: '充电',
                    customTitle: '充电提醒——普通',
                    customTitleEn: 'Charging Alert - Normal'
                });
            }, 3000);
        }

        // 立即尝试初始化HeaderNav
        setTimeout(() => {
            if (typeof initHeaderNav === 'function') {
                initHeaderNav();
            }
        }, 100);
        
        // 强制执行地区显示更新
        setTimeout(() => {
            if (typeof updateRegionDisplay === 'function') {
                updateRegionDisplay();
            }
        }, 200);
        
        // 启动模拟推送（仅供测试，可注释掉）
        // simulatePushNotifications();
        
    




        // 拖拽功能实现
        function makeDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            
            element.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                
                // 如果点击的是按钮或表单元素，不启动拖拽
                const target = e.target;
                if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || 
                    target.tagName === 'TEXTAREA' || target.closest('button') || target.closest('input') ||
                    target.closest('select') || target.closest('textarea') || target.classList.contains('expand-btn')) {
                    return;
                }
                
                // 如果是缩小状态且不是展开点击，允许拖拽
                if (element.classList.contains('minimized')) {
                    // 记录初始鼠标位置，用于判断是点击还是拖拽
                    window.dragStartX = e.clientX;
                    window.dragStartY = e.clientY;
                    window.isDragging = false;
                }
                
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
                element.style.cursor = 'grabbing';
                element.style.transition = 'none';
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                
                // 标记为正在拖拽
                if (element.classList.contains('minimized')) {
                    const deltaX = Math.abs(e.clientX - window.dragStartX);
                    const deltaY = Math.abs(e.clientY - window.dragStartY);
                    if (deltaX > 5 || deltaY > 5) {
                        window.isDragging = true;
                    }
                }
                
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;
                
                // 边界检测
                const rect = element.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                
                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));
                
                element.style.top = newTop + "px";
                element.style.left = newLeft + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
                element.style.cursor = 'move';
                element.style.transition = 'transform 0.2s ease';
            }
        }

        // 页面加载完成后初始化拖拽功能
        document.addEventListener('DOMContentLoaded', function() {
            
            // 初始化地区条件总览卡片
            setTimeout(() => {
                initRegionOverviewCard();
            }, 500);
            
            // 检查是否需要恢复模态框
            checkAndRestoreModal();
        });
        
        // 检查并恢复模态框状态
        function checkAndRestoreModal() {
            const isModalOpen = localStorage.getItem('conditionSettingsModalOpen');
            const savedPosition = localStorage.getItem('modalPosition');
            
            if (isModalOpen === 'true') {
                const modalContent = document.getElementById('modalContent');
                if (modalContent) {
                    // 确保时间段变量已初始化
                    window.chargeTimeSegments = window.chargeTimeSegments || [{ start: '22:00', end: '06:00' }];
                    window.dischargeTimeSegments = window.dischargeTimeSegments || [{ start: '16:00', end: '21:00' }];
                    
                    // 恢复模态框显示
                    modalContent.style.display = 'flex';
                    
                    // 恢复位置
                    if (savedPosition) {
                        try {
                            const position = JSON.parse(savedPosition);
                            modalContent.style.top = position.top;
                            modalContent.style.left = position.left;
                        } catch (e) {
                            console.error('Error parsing saved position:', e);
                        }
                    }
                    
                    // 初始化拖拽功能
                    makeModalDraggable(modalContent);
                    
                    // 强制设置最高层级
                    modalContent.style.setProperty('z-index', '2147483648', 'important');
                    modalContent.style.setProperty('position', 'fixed', 'important');
                    
                    // 更新翻译
                    if (window.i18n && window.i18n.isReady) {
                        window.i18n.updatePageTexts();
                        updateModalTranslations();
                    }
                    
                    // Restore saved mode
                    const savedMode = localStorage.getItem('modalMode') || 'manual';
                    switchModalMode(savedMode);
                    
                    // 加载当前地区的条件设置
                    setTimeout(loadConditionSettings, 500);
                    
                }
            }
        }

        // 模态框拖拽功能 - 复制测试卡片逻辑
        function makeModalDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            
            element.onmousedown = dragMouseDown;
            
            // 动态设置光标
            element.addEventListener('mouseover', function(e) {
                const target = e.target;
                if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || 
                    target.tagName === 'TEXTAREA' || target.closest('button') || target.closest('input') ||
                    target.closest('select') || target.closest('textarea') || target.type === 'range' || 
                    target.closest('input[type="range"]') || target.closest('[id*="SOC"]')) {
                    // 在交互元素上显示默认光标
                    return;
                } else {
                    // 在其他区域显示移动光标
                    element.style.cursor = 'move';
                }
            });

            function dragMouseDown(e) {
                e = e || window.event;
                
                // 如果点击的是按钮或表单元素，不启动拖拽
                const target = e.target;
                if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || 
                    target.tagName === 'TEXTAREA' || target.closest('button') || target.closest('input') ||
                    target.closest('select') || target.closest('textarea') || target.type === 'range' || 
                    target.closest('input[type="range"]') || target.closest('[id*="SOC"]')) {
                    return;
                }
                
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
                element.style.cursor = 'grabbing';
                element.style.transition = 'none';
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;
                
                // 边界检测
                const rect = element.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                
                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));
                
                element.style.top = newTop + "px";
                element.style.left = newLeft + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
                element.style.cursor = 'move';
                element.style.transition = 'none';
                
                // 保存拖拽后的位置
                if (localStorage.getItem('conditionSettingsModalOpen') === 'true') {
                    localStorage.setItem('modalPosition', JSON.stringify({
                        top: element.style.top,
                        left: element.style.left
                    }));
                }
            }
        }


        // 移动卡片到最近的屏幕边缘
        function moveToEdge(element) {
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            
            // 计算到各边缘的距离
            const distanceToLeft = centerX;
            const distanceToRight = screenWidth - centerX;
            const distanceToTop = centerY;
            const distanceToBottom = screenHeight - centerY;
            
            // 找到最近的边缘
            const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);
            
            let newLeft, newTop;
            
            if (minDistance === distanceToLeft) {
                // 移动到左边缘
                newLeft = 10;
                newTop = Math.max(10, Math.min(screenHeight - 70, rect.top));
            } else if (minDistance === distanceToRight) {
                // 移动到右边缘
                newLeft = screenWidth - 70;
                newTop = Math.max(10, Math.min(screenHeight - 70, rect.top));
            } else if (minDistance === distanceToTop) {
                // 移动到顶部边缘
                newLeft = Math.max(10, Math.min(screenWidth - 70, rect.left));
                newTop = 10;
            } else {
                // 移动到底部边缘
                newLeft = Math.max(10, Math.min(screenWidth - 70, rect.left));
                newTop = screenHeight - 70;
            }
            
            // 应用动画移动
            element.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            // 重置transition以便后续拖拽
            setTimeout(() => {
                element.style.transition = '';
            }, 500);
        }

        // Progress Dialog Variables
        let currentProgressData = {
            operationType: null,
            step1: { progress: 0, status: 'pending' },
            step2: { progress: 0, status: 'pending' },
            commandsSent: 0,
            successRate: 0
        };
        let progressAnimationInterval = null;

        // Show Progress Dialog
        function showProgressDialog(operationType) {
            
            // Reset progress data
            currentProgressData.operationType = operationType;
            currentProgressData.step1 = { progress: 0, status: 'pending' };
            currentProgressData.step2 = { progress: 0, status: 'pending' };
            currentProgressData.commandsSent = 500;
            currentProgressData.successRate = 0;
            
            // Update dialog content
            const progressTitle = document.getElementById('progressTitle');
            const progressIcon = document.getElementById('progressIcon');
            const progressSubtitle = document.getElementById('progressSubtitle');
            
            if (operationType === 'charge') {
                progressTitle.textContent = window.i18n ? window.i18n.getText('chargingProgress') : '充电进度';
                progressIcon.textContent = '⚡';
                progressSubtitle.textContent = window.i18n ? window.i18n.getText('operationInProgress') : '正在执行操作...';
            } else if (operationType === 'discharge') {
                progressTitle.textContent = window.i18n ? window.i18n.getText('dischargingProgress') : '放电进度';
                progressIcon.textContent = '🔋';
                progressSubtitle.textContent = window.i18n ? window.i18n.getText('operationInProgress') : '正在执行操作...';
            }
            
            // Update progress info
            document.getElementById('progressCommandsSent').textContent = currentProgressData.commandsSent;
            const operationTypeElement = document.getElementById('progressOperationType');
            if (operationType === 'charge') {
                operationTypeElement.textContent = window.i18n ? window.i18n.getText('charge') : '充电';
                operationTypeElement.style.color = '#00ff88';
            } else if (operationType === 'discharge') {
                operationTypeElement.textContent = window.i18n ? window.i18n.getText('discharge') : '放电';
                operationTypeElement.style.color = '#ffc107';
            }
            
            // Reset step status and progress bars
            document.getElementById('step1Status').textContent = window.i18n ? window.i18n.getText('waiting') : '等待中';
            document.getElementById('step1Status').style.background = 'rgba(255, 255, 255, 0.1)';
            document.getElementById('step1Status').style.color = 'rgba(255, 255, 255, 0.5)';
            document.getElementById('step1Progress').textContent = '0/100';
            document.getElementById('step1ProgressBar').style.width = '0%';
            
            document.getElementById('step2Status').textContent = window.i18n ? window.i18n.getText('waiting') : '等待中';
            document.getElementById('step2Status').style.background = 'rgba(255, 255, 255, 0.1)';
            document.getElementById('step2Status').style.color = 'rgba(255, 255, 255, 0.5)';
            document.getElementById('step2Progress').textContent = '0/100';
            document.getElementById('step2ProgressBar').style.width = '0%';
            
            // Show modal
            const progressDialog = document.getElementById('progressDialog');
            progressDialog.style.display = 'block';
            
            // Make dialog draggable
            makeProgressDialogDraggable();
            
            // Generate floating balls for all regions
            generateFloatingBalls(operationType);
        }

        // Make Progress Dialog Draggable
        function makeProgressDialogDraggable() {
            const dialog = document.getElementById('progressDialog');
            const header = dialog.querySelector('.progress-header');
            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;

            function dragStart(e) {
                if (e.type === "touchstart") {
                    initialX = e.touches[0].clientX - dialog.offsetLeft;
                    initialY = e.touches[0].clientY - dialog.offsetTop;
                } else {
                    initialX = e.clientX - dialog.offsetLeft;
                    initialY = e.clientY - dialog.offsetTop;
                }

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                    dialog.style.transition = 'none';
                }
            }

            function dragEnd() {
                isDragging = false;
                dialog.style.transition = '';
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    
                    if (e.type === "touchmove") {
                        currentX = e.touches[0].clientX - initialX;
                        currentY = e.touches[0].clientY - initialY;
                    } else {
                        currentX = e.clientX - initialX;
                        currentY = e.clientY - initialY;
                    }

                    dialog.style.left = currentX + "px";
                    dialog.style.top = currentY + "px";
                    dialog.style.transform = "none";
                }
            }

            // Mouse events
            header.addEventListener("mousedown", dragStart);
            document.addEventListener("mousemove", drag);
            document.addEventListener("mouseup", dragEnd);

            // Touch events
            header.addEventListener("touchstart", dragStart, { passive: false });
            document.addEventListener("touchmove", drag, { passive: false });
            document.addEventListener("touchend", dragEnd);
        }

        // Make Floating Container Draggable
        function makeFloatingContainerDraggable() {
            const container = document.getElementById('progressFloatingContainer');
            const toggleBtn = document.getElementById('progressToggleBtn');
            let isDragging = false;
            let hasDragged = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let startX;
            let startY;

            function dragStart(e) {
                if (e.type === "touchstart") {
                    initialX = e.touches[0].clientX - container.offsetLeft;
                    initialY = e.touches[0].clientY - container.offsetTop;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else {
                    initialX = e.clientX - container.offsetLeft;
                    initialY = e.clientY - container.offsetTop;
                    startX = e.clientX;
                    startY = e.clientY;
                }

                if (e.target === toggleBtn || toggleBtn.contains(e.target)) {
                    isDragging = true;
                    hasDragged = false;
                    container.style.transition = 'none';
                }
            }

            function dragEnd(e) {
                if (isDragging) {
                    isDragging = false;
                    container.style.transition = '';
                    
                    // If we have dragged, set flag to prevent toggle
                    if (hasDragged) {
                        isDragOperation = true;
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    
                    // Reset drag state after a short delay
                    setTimeout(() => {
                        hasDragged = false;
                    }, 100);
                }
            }

            function drag(e) {
                if (isDragging) {
                    let currentMouseX, currentMouseY;
                    
                    if (e.type === "touchmove") {
                        currentMouseX = e.touches[0].clientX;
                        currentMouseY = e.touches[0].clientY;
                        currentX = currentMouseX - initialX;
                        currentY = currentMouseY - initialY;
                    } else {
                        currentMouseX = e.clientX;
                        currentMouseY = e.clientY;
                        currentX = currentMouseX - initialX;
                        currentY = currentMouseY - initialY;
                    }

                    // Check if we've moved enough to consider it a drag
                    const dragDistance = Math.sqrt(
                        Math.pow(currentMouseX - startX, 2) + Math.pow(currentMouseY - startY, 2)
                    );
                    
                    if (dragDistance > 5) {
                        hasDragged = true;
                        e.preventDefault();
                        
                        container.style.left = currentX + "px";
                        container.style.top = currentY + "px";
                        container.style.right = "auto";
                        container.style.transform = "none";
                    }
                }
            }

            // Mouse events
            toggleBtn.addEventListener("mousedown", dragStart);
            document.addEventListener("mousemove", drag);
            document.addEventListener("mouseup", dragEnd);

            // Touch events
            toggleBtn.addEventListener("touchstart", dragStart, { passive: false });
            document.addEventListener("touchmove", drag, { passive: false });
            document.addEventListener("touchend", dragEnd);
        }

        // Minimize Progress Dialog to Floating Ball
        function minimizeProgressDialog() {
            const progressDialog = document.getElementById('progressDialog');
            const floatingContainer = document.getElementById('progressFloatingContainer');
            
            progressDialog.style.display = 'none';
            floatingContainer.style.display = 'block';
            
            // Make floating container draggable
            makeFloatingContainerDraggable();
        }

        // Toggle Progress Balls Expand/Collapse
        let isDragOperation = false;
        
        function toggleProgressBalls(e) {
            // Don't toggle if this was triggered after a drag operation
            if (isDragOperation) {
                isDragOperation = false;
                return;
            }
            
            const ballsContainer = document.getElementById('progressBallsContainer');
            const toggleIcon = document.getElementById('progressToggleIcon');
            
            if (ballsContainer.style.display === 'none') {
                // Expand
                ballsContainer.style.display = 'block';
                toggleIcon.textContent = '▼';
                toggleIcon.style.color = '#00ff88';
            } else {
                // Collapse
                ballsContainer.style.display = 'none';
                toggleIcon.textContent = '▲';
                toggleIcon.style.color = '#ffc107';
            }
        }

        // Generate Floating Balls for All Regions
        function generateFloatingBalls(operationType) {
            const container = document.getElementById('progressFloatingContainer');
            const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
            
            // Clear existing balls container content
            let ballsContainer = document.getElementById('progressBallsContainer');
            if (ballsContainer) {
                ballsContainer.innerHTML = '';
            } else {
                // Create balls container if it doesn't exist
                ballsContainer = document.createElement('div');
                ballsContainer.id = 'progressBallsContainer';
                ballsContainer.style.cssText = `
                    display: block;
                    transition: all 0.3s ease;
                `;
                container.appendChild(ballsContainer);
            }
            
            regions.forEach((region, index) => {
                const ball = document.createElement('div');
                ball.className = `progress-floating-ball progress-ball-${region.toLowerCase()}`;
                ball.setAttribute('data-region', region);
                
                // For discharge, only show progress for selected region
                const isSelectedRegion = region === selectedMainRegion;
                const shouldShowProgress = operationType === 'charge' || isSelectedRegion;
                
                ball.style.cssText = `
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: linear-gradient(145deg, #1e1e2e, #2a2a3a);
                    border: 2px solid ${shouldShowProgress ? (operationType === 'charge' ? '#00ff88' : '#ffc107') : 'rgba(255, 255, 255, 0.3)'};
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 12px;
                    cursor: pointer;
                    transition: all 0.3s;
                    position: relative;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    opacity: ${shouldShowProgress ? '1' : '0.5'};
                `;
                
                ball.innerHTML = `
                    <div style="font-size: 10px; font-weight: 600; color: #fff; margin-bottom: 2px;">${region}</div>
                    <div style="font-size: 12px; font-weight: 700; color: ${shouldShowProgress ? (operationType === 'charge' ? '#00ff88' : '#ffc107') : 'rgba(255, 255, 255, 0.5)'};">0%</div>
                `;
                
                ball.onclick = () => expandProgressDialog();
                ballsContainer.appendChild(ball);
            });
        }

        // Expand Progress Dialog from Floating Ball
        function expandProgressDialog() {
            const progressDialog = document.getElementById('progressDialog');
            const floatingContainer = document.getElementById('progressFloatingContainer');
            
            floatingContainer.style.display = 'none';
            progressDialog.style.display = 'block';
        }

        // Start Progress Animation
        function startProgressAnimation(operationType) {
            
            let step1Complete = false;
            let step2Complete = false;
            
            // Clear any existing interval
            if (progressAnimationInterval) {
                clearInterval(progressAnimationInterval);
            }
            
            progressAnimationInterval = setInterval(() => {
                // Step 1: Read device settings
                if (!step1Complete) {
                    currentProgressData.step1.progress += Math.random() * 5;
                    if (currentProgressData.step1.progress >= 100) {
                        currentProgressData.step1.progress = 100;
                        currentProgressData.step1.status = 'completed';
                        step1Complete = true;
                        
                        // Update step 1 status
                        document.getElementById('step1Status').textContent = window.i18n ? window.i18n.getText('completed') : '已完成';
                        document.getElementById('step1Status').style.background = 'rgba(0, 255, 136, 0.2)';
                        document.getElementById('step1Status').style.color = '#00ff88';
                    } else {
                        currentProgressData.step1.status = 'in_progress';
                        document.getElementById('step1Status').textContent = window.i18n ? window.i18n.getText('reading') : '读取中';
                        document.getElementById('step1Status').style.background = 'rgba(255, 193, 7, 0.2)';
                        document.getElementById('step1Status').style.color = '#ffc107';
                    }
                    document.getElementById('step1Progress').textContent = `${Math.floor(currentProgressData.step1.progress)}/100`;
                    document.getElementById('step1ProgressBar').style.width = `${currentProgressData.step1.progress}%`;
                }
                
                // Step 2: Modify device settings (starts only when step 1 is completed)
                // Sync with map page execution progress
                if (step1Complete && !step2Complete) {
                    // Get map execution progress from executing devices
                    const executingCount = parseInt(document.getElementById('executingDevices')?.textContent || '0');
                    const totalCount = parseInt(document.getElementById('totalDevices')?.textContent || '500');
                    const mapProgressValue = executingCount === 0 ? 100 : Math.floor(((totalCount - executingCount) / totalCount) * 100);
                    
                    // Sync step2 progress with map progress
                    currentProgressData.step2.progress = mapProgressValue;
                    
                    if (currentProgressData.step2.progress >= 100) {
                        currentProgressData.step2.progress = 100;
                        currentProgressData.step2.status = 'completed';
                        step2Complete = true;
                        
                        // Update step 2 status
                        document.getElementById('step2Status').textContent = window.i18n ? window.i18n.getText('completed') : '已完成';
                        document.getElementById('step2Status').style.background = 'rgba(0, 255, 136, 0.2)';
                        document.getElementById('step2Status').style.color = '#00ff88';
                        
                        // All steps complete, stop animation
                        clearInterval(progressAnimationInterval);
                    } else {
                        currentProgressData.step2.status = 'in_progress';
                        document.getElementById('step2Status').textContent = window.i18n ? window.i18n.getText('setting') : '设置中';
                        document.getElementById('step2Status').style.background = 'rgba(255, 193, 7, 0.2)';
                        document.getElementById('step2Status').style.color = '#ffc107';
                    }
                    document.getElementById('step2Progress').textContent = `${Math.floor(currentProgressData.step2.progress)}/100`;
                    document.getElementById('step2ProgressBar').style.width = `${currentProgressData.step2.progress}%`;
                }
                
                // Calculate total progress for floating balls
                const totalProgress = (currentProgressData.step1.progress + currentProgressData.step2.progress) / 2;
                
                // Update floating balls
                updateFloatingBalls(totalProgress);
                
            }, 100); // Update every 100ms
        }

        // Update Floating Balls Progress
        function updateFloatingBalls(progress) {
            const balls = document.querySelectorAll('.progress-floating-ball');
            balls.forEach(ball => {
                const region = ball.getAttribute('data-region');
                const progressElement = ball.querySelector('div:last-child');
                
                if (progressElement) {
                    // Only update the selected region, regardless of charge or discharge
                    if (region === selectedMainRegion) {
                        progressElement.textContent = `${Math.floor(progress)}%`;
                    } else {
                        // Keep other regions at 0% 
                        progressElement.textContent = '0%';
                    }
                }
            });
        }

    


// Dashboard i18n overlay - translate remaining hardcoded Chinese
(function() {
    function t(key, fallback) {
        return window.i18n ? window.i18n.getText(key) : fallback;
    }
    
    function applyDashboardTranslations() {
        if (!window.i18n) return;
        const T = (k, f) => window.i18n.getText('dashboard.' + k) || f;
        
        // 统计栏 5 大指标标签
        const statLabels = document.querySelectorAll('.stat-card-top div:first-child, [class*="stat"] div');
        
        // 用 id 精确替换
        const idMap = {
            'dataCutoffLabel': '* ' + T('dataCutoff', 'Data as of') + ' ',
            'stationStatusLabel': T('expectedExecution', 'Waiting for Execution'),
        };
        
        for (const [id, text] of Object.entries(idMap)) {
            const el = document.getElementById(id);
            if (el && el.textContent.match(/[\u4e00-\u9fff]/)) {
                // 保留动态部分
                if (id === 'dataCutoffLabel') {
                    const dateMatch = el.textContent.match(/\d{4}[-/]\d{2}[-/]\d{2}.*/);
                    el.textContent = text + (dateMatch ? dateMatch[0] : '');
                } else {
                    el.textContent = text;
                }
            }
        }
        
        // 统计指标标签（通过遍历特定容器）
        const statsTranslations = {
            '累计充电': T('totalChargeLabel', 'Total Charges'),
            '累计放电': T('totalDischargeLabel', 'Total Discharges'),
            '充电成本': T('chargeCost', 'Charge Cost'),
            '放电收益': T('dischargeRevenue', 'Discharge Revenue'),
            '净获利': T('netProfit', 'Net Profit'),
            '电站管理': T('stationManagement', 'Station Management'),
            '自动': T('autoOperation', 'Auto'),
            '等待执行中': T('expectedExecution', 'Waiting for Execution'),
            '当前SOC': T('currentSOC', 'Current SOC'),
            '电池成本': T('batteryCost', 'Battery Cost'),
            '今日获利': T('todayProfit', "Today's Profit"),
            '今日充电': T('todayCharge', 'Today Charge'),
            '今日放电': T('todayDischarge', 'Today Discharge'),
            '行情': T('market', 'Market'),
            '分析': T('analysis', 'Analysis'),
            '现货电价': t('dashboard.spotPrice', 'Spot Price'),
            '当前需求': t('dashboard.currentDemand', 'Current Demand'),
            '预测价格': t('dashboard.forecastPrice', 'Forecast Price'),
            '预测需求': t('dashboard.forecastDemand', 'Forecast Demand'),
            '需求': t('dashboard.demand', 'Demand'),
            '发电': t('dashboard.generation', 'Generation'),
            'AI 分析中': T('aiAnalyzing', 'AI Analyzing'),
            '预估利润': T('aiEstProfit', 'Est. Profit'),
            '充电': T('chargeLabel', 'Charge'),
            '放电': T('dischargeLabel', 'Discharge'),
            '时间': T('time', 'Time'),
            '均价': T('avgPrice', 'Avg Price'),
            '电量与获利': t('dashboard.powerAndProfit', 'Power & Profit'),
            '（获利=馈网量*价格）': t('dashboard.profitFormula', '(Profit = Feed-in × Price)'),
            '日': T('day', 'Day'),
            '本月': T('monthShort', 'This Month'),
            '年': T('year', 'Year'),
            '累计': T('cumulative', 'Cumulative'),
            '系统概览': t('dashboard.systemOverview', 'System Overview'),
            '总容量': t('dashboard.totalCapacity', 'Total Capacity'),
            '在线设备': t('dashboard.onlineDevices', 'Online Devices'),
            '网络状态': t('dashboard.networkStatus', 'Network Status'),
            '正常': t('dashboard.normal', 'Normal'),
            '累计放电上网量': t('dashboard.totalFeedIn', 'Total Feed-in'),
            '累计收益': t('dashboard.totalRevenue', 'Total Revenue'),
            '家庭': t('dashboard.family', 'Family'),
            '装机量': t('dashboard.installedCapacity', 'Installed Capacity'),
            '放电统计': t('dashboard.dischargeStats', 'Discharge Stats'),
            '馈网量': t('dashboard.feedInAmount', 'Feed-in Amount'),
            '用电量': t('dashboard.consumption', 'Consumption'),
            '超过目标用户': t('dashboard.aboveTarget', 'Above Target'),
            '未达目标用户': t('dashboard.belowTarget', 'Below Target'),
            '价格统计': t('dashboard.priceStats', 'Price Stats'),
            '今日价格': t('dashboard.todayPrice', 'Today Price'),
            '平均放电价格': t('dashboard.avgDischargePrice', 'Avg Discharge Price'),
            '卖电价': t('dashboard.sellPrice', 'Sell Price'),
            '今日最低': t('dashboard.todayLow', 'Today Low'),
            '今日最高': t('dashboard.todayHigh', 'Today High'),
            '确认充电操作': t('dashboard.confirmChargeTitle', 'Confirm Charge'),
            '您确定要执行充电操作吗？': t('dashboard.confirmChargeMsg', 'Are you sure you want to charge?'),
            '操作类型': t('dashboard.operationType', 'Operation Type'),
            '可调度设备': T('dispatchableDevices', 'Dispatchable Devices'),
            '预计功率': t('dashboard.estimatedPower', 'Est. Power'),
            '当前电价': T('currentPriceLabel', 'Current Price'),
            '预计获利': t('dashboard.estimatedProfit', 'Est. Profit'),
            '取消': t('common.cancel', 'Cancel'),
            '确认充电': t('dashboard.confirmChargeBtn', 'Confirm Charge'),
            '充电进度': t('dashboard.chargeProgress', 'Charge Progress'),
            '正在执行操作...': t('dashboard.executingOperation', 'Executing...'),
            '下发设备': t('dashboard.targetDevice', 'Target Device'),
            '预警': t('dashboard.warning', 'Warning'),
            '读取中': t('dashboard.reading', 'Reading...'),
            '等待中': t('dashboard.waiting', 'Waiting...'),
            '指令下发成功': t('dashboard.commandSuccess', 'Command Sent'),
            '系统正在执行您的操作指令...': t('dashboard.executingCommand', 'Executing your command...'),
            '设备响应统计': t('dashboard.deviceResponseStats', 'Device Response Stats'),
            '指令下发': T('commandIssued', 'Commands Issued'),
            '成功率': t('dashboard.successRate', 'Success Rate'),
            '查看详情': t('dashboard.viewDetails', 'View Details'),
            '关闭': t('common.close', 'Close'),
            '操作详情': t('dashboard.operationDetails', 'Operation Details'),
            '基本信息': t('dashboard.basicInfo', 'Basic Info'),
            '影响设备': t('dashboard.affectedDevices', 'Affected Devices'),
            '设备': T('device', 'Devices'),
            '操作时间': t('dashboard.operationTime', 'Operation Time'),
            '执行状态': t('dashboard.executionStatus', 'Execution Status'),
            '导出': t('dashboard.export', 'Export'),
            '下发成功': t('dashboard.commandSent', 'Sent'),
            '执行中': t('dashboard.executing', 'Executing'),
            '下发失败': t('dashboard.commandFailed', 'Failed'),
            '失败次数': t('dashboard.failCount', 'Fail Count'),
            '状态': t('dashboard.status', 'Status'),
            '自动化设置': T('aiCustodySettings', 'Auto Settings'),
            '自动模式类型': T('autoModeType', 'Auto Mode Type'),
            '自动充电中': T('aiCharge', 'AI Charging'),
            '自动放电中': T('aiDischarge', 'AI Discharging'),
            '为不同时间段设置不同的价格门槛': T('chargeStrategyTip', 'Set price thresholds for different time periods'),
            '添加时间段': T('addTimeSlot', 'Add Time Slot'),
            '电量条件': T('batteryCondition', 'Battery Condition'),
            '低于': t('dashboard.below', 'Below'),
            '高于': t('dashboard.above', 'Above'),
            '介于': t('dashboard.between', 'Between'),
            '保存设置': t('dashboard.saveSettings', 'Save Settings'),
            '设备指令': t('dashboard.deviceCommand', 'Device Command'),
            '立即': t('dashboard.immediately', 'Now'),
            '预计执行时间': T('estimatedTime', 'Est. Time'),
            '确认执行': t('dashboard.confirmExecute', 'Confirm Execute'),
            '操作完成，以下是设备响应统计报告：': t('dashboard.operationCompleteReport', 'Operation complete. Device response report:'),
            '点击下方数字查看设备详情': t('dashboard.clickToViewDetails', 'Click numbers to view device details'),
            '设置': t('common.settings', 'Settings'),
            'SOC 设置': t('dashboard.socSettings', 'SOC Settings'),
            '充电停止SOC': t('dashboard.chargeStopSOC', 'Charge Stop SOC'),
            '放电停止SOC': t('dashboard.dischargeStopSOC', 'Discharge Stop SOC'),
            '自动条件': t('dashboard.autoConditions', 'Auto Conditions'),
            '时间条件设置': t('dashboard.timeConditionSettings', 'Time Condition Settings'),
            '充电时间': T('chargeTime', 'Charge Time'),
            '放电时间': T('dischargeTime', 'Discharge Time'),
            '添加': t('common.add', 'Add'),
            '保存': t('common.save', 'Save'),
            '自动化条件': t('dashboard.automationConditions', 'Automation Conditions'),
            '区域': t('dashboard.region', 'Region'),
            '充电条件': t('dashboard.chargeCondition', 'Charge Condition'),
            '放电条件': t('dashboard.dischargeCondition', 'Discharge Condition'),
            '时间条件': t('dashboard.timeCondition', 'Time Condition'),
            '价格条件': t('dashboard.priceCondition', 'Price Condition'),
            '停止SOC': t('dashboard.stopSOC', 'Stop SOC'),
        };

        // 遍历 body 所有文本节点
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!parent || parent.closest('script, style, [data-i18n]')) continue;
            
            let text = node.textContent.trim();
            if (!text || !/[\u4e00-\u9fff]/.test(text)) continue;
            
            // 精确匹配
            if (statsTranslations[text]) {
                node.textContent = node.textContent.replace(text, statsTranslations[text]);
                continue;
            }
            
            // 包含匹配（处理 "1,286次" → "1,286 times"）
            if (/\d+次/.test(text)) {
                node.textContent = text.replace(/次/g, ' ' + T('timesUnit', 'times'));
            }
            if (/\d+个/.test(text)) {
                node.textContent = text.replace(/个/g, ' ' + T('device', 'devices'));
            }
            if (/分钟/.test(text)) {
                node.textContent = text.replace(/分钟/g, ' min');
            }
        }
        
        // 处理 select option
        document.querySelectorAll('option').forEach(opt => {
            const text = opt.textContent.trim();
            if (statsTranslations[text]) {
                opt.textContent = statsTranslations[text];
            }
        });
    }
    
    // 页面加载后执行
    if (document.readyState === 'complete') {
        setTimeout(applyDashboardTranslations, 500);
    } else {
        window.addEventListener('load', () => setTimeout(applyDashboardTranslations, 500));
    }
    
    // 语言切换时也执行
    if (window.i18n) {
        window.i18n.addObserver(() => setTimeout(applyDashboardTranslations, 200));
    }
    
    // 暴露给全局（方便其他地方调用）
    window.applyDashboardTranslations = applyDashboardTranslations;
})();
