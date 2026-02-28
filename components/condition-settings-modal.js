// 电站管理条件设置模态框组件
(function() {
    'use strict';
    
    console.log('🚀 Condition Settings Modal JS loaded successfully!');
    
    // 时间条件数据版本号 - 用于检测数据格式变化
    const TIME_PERIODS_VERSION = '1.2';

    // 时间条件数据 - 支持分时多阶策略
    const defaultTimePeriods = {
        charge: [
            {
                id: 'charge-1',
                startTime: '00:00',
                endTime: '07:00',
                priceThreshold: 50,
                priceEnabled: true
            }
        ],
        discharge: [
            {
                id: 'discharge-1',
                startTime: '00:00',
                endTime: '18:00',
                priceThreshold: 10000,
                priceEnabled: true
            },
            {
                id: 'discharge-2',
                startTime: '18:00',
                endTime: '21:00',
                priceThreshold: 150,
                priceEnabled: true
            },
            {
                id: 'discharge-3',
                startTime: '21:00',
                endTime: '23:59',
                priceThreshold: 10000,
                priceEnabled: true
            }
        ]
    };

    let timePeriods = JSON.parse(JSON.stringify(defaultTimePeriods));

    // 创建模态框HTML
    function createModalHTML() {
        return `
        <!-- Condition Settings Modal -->
        <div id="modalContent" class="modal-content" style="display: none; position: fixed; top: 5%; left: calc(50% - 450px); background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); padding: 0; width: 900px; max-width: 95%; max-height: 90vh; border-radius: 16px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); z-index: 2147483648; transition: none; user-select: none; cursor: move; flex-direction: column;">
            <div class="modal-header" style="padding: 24px 32px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.02); position: sticky; top: 0; z-index: 1;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;" data-i18n="automationConditionsSettings">自动化条件设置</h3>
                    <span id="modalRegionName" style="padding: 4px 12px; background: var(--color-primary); color: #000; border-radius: 20px; font-size: 12px; font-weight: 600;">NSW</span>
                </div>
                <button onclick="closeConditionSettingsModal()" style="background: none; border: none; color: rgba(255,255,255,0.6); font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='none'">×</button>
            </div>
            
            <div class="modal-body" style="padding: 24px 32px; overflow-y: auto; flex: 1;">
                <div style="color: #fff; font-size: 14px; margin-bottom: 24px;">
                    <span data-i18n="conditionSettingsDescription">设置自动化充放电条件</span>
                </div>
                
                <!-- 自动条件标题 -->
                <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 700; color: #fff;" data-i18n="autoConditions">自动条件</h2>
                
                <!-- 时间条件设置 -->
                <div class="time-condition-container" style="display: flex; flex-direction: column; gap: 32px;">
                    <!-- 充电时间段管理 -->
                    <div class="time-periods-section" style="background: rgba(255, 255, 255, 0.02); border-radius: 8px; padding: 24px; border: 1px solid rgba(255, 255, 255, 0.05);">
                        <h3 style="font-size: 18px; font-weight: 600; color: rgba(255, 255, 255, 0.9); margin: 0 0 12px 0;" data-i18n="settings.timeCondition.chargeTime" data-text-zh="充电条件" data-text-en="Charge Condition">充电条件</h3>
                        <div style="margin-bottom: 16px; padding: 10px 12px; background: rgba(0, 255, 136, 0.08); border-left: 3px solid #00ff88; border-radius: 4px; font-size: 13px; color: rgba(255, 255, 255, 0.8); line-height: 1.5;">
                            💡 支持分时多阶策略:为不同时间段设置不同价格门槛,系统将同时监测所有时间段,任意条件满足即触发充电
                        </div>
                        <div id="chargeTimePeriods" class="time-periods-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;"></div>
                        <button class="btn btn-secondary add-period-btn" onclick="addTimePeriod('charge')" style="width: 100%; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; background: transparent; border: 2px dashed rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.6); border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">
                            <span>+</span>
                            <span data-i18n="settings.timeCondition.addChargePeriod" data-text-zh="添加充电时间段" data-text-en="Add Charge Period">添加充电时间段</span>
                        </button>
                    </div>

                    <!-- 放电时间段管理 -->
                    <div class="time-periods-section" style="background: rgba(255, 255, 255, 0.02); border-radius: 8px; padding: 24px; border: 1px solid rgba(255, 255, 255, 0.05);">
                        <h3 style="font-size: 18px; font-weight: 600; color: rgba(255, 255, 255, 0.9); margin: 0 0 12px 0;" data-i18n="settings.timeCondition.dischargeTime" data-text-zh="放电条件" data-text-en="Discharge Condition">放电条件</h3>
                        <div style="margin-bottom: 16px; padding: 10px 12px; background: rgba(255, 193, 7, 0.08); border-left: 3px solid #ffc107; border-radius: 4px; font-size: 13px; color: rgba(255, 255, 255, 0.8); line-height: 1.5;">
                            💡 支持分时多阶策略:为不同时间段设置不同价格门槛,系统将同时监测所有时间段,任意条件满足即触发放电
                        </div>
                        <div id="dischargeTimePeriods" class="time-periods-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;"></div>
                        <button class="btn btn-secondary add-period-btn" onclick="addTimePeriod('discharge')" style="width: 100%; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; background: transparent; border: 2px dashed rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.6); border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">
                            <span>+</span>
                            <span data-i18n="settings.timeCondition.addDischargePeriod" data-text-zh="添加放电时间段" data-text-en="Add Discharge Period">添加放电时间段</span>
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Modal Footer -->
            <div class="modal-footer" style="padding: 16px 32px; background: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: flex-end; gap: 12px;">
                <button onclick="closeConditionSettingsModal()" style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.3s;" data-i18n="cancel">取消</button>
                <button onclick="saveConditionSettings()" style="background: linear-gradient(135deg, #00ff88, #00dd77); color: #000; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.3s; border: none;" data-i18n="saveSettings">保存设置</button>
            </div>
            
            <!-- 时间条件样式 -->
            <style>
                .time-period-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 10px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    transition: all 0.3s ease;
                    min-width: 0;
                }

                .time-period-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: rgba(255, 255, 255, 0.1);
                }

                .time-period-item.disabled {
                    opacity: 0.5;
                }

                .time-period-checkbox {
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                }

                .time-period-inputs {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex: 1;
                    min-width: 0;
                    flex-wrap: nowrap;
                }

                .time-input {
                    width: 70px;
                    padding: 4px 6px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 12px;
                    text-align: center;
                    transition: all 0.3s ease;
                    flex-shrink: 0;
                }

                .time-input.price-input {
                    width: 60px;
                }
                
                .time-input:focus {
                    outline: none;
                    border-color: #00ff88;
                    box-shadow: 0 0 0 3px rgba(0, 255, 136, 0.1);
                }
                
                .time-input:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .time-period-separator {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 14px;
                }
                
                .time-period-actions {
                    display: flex;
                    gap: 8px;
                }
                
                .period-action-btn {
                    padding: 4px 8px;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 4px;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                
                .period-action-btn:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.9);
                    border-color: rgba(255, 255, 255, 0.1);
                }
                
                .period-action-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                
                .period-action-btn.delete {
                    color: #ff6b6b;
                }
                
                .period-action-btn.delete:hover {
                    background: rgba(255, 107, 107, 0.1);
                    border-color: rgba(255, 107, 107, 0.3);
                }
                
                .add-period-btn:hover {
                    background: rgba(255, 255, 255, 0.02);
                    border-color: rgba(255, 255, 255, 0.3);
                    color: rgba(255, 255, 255, 0.9);
                }
            </style>
            
        </div>
        `;
    }

    // 模态框拖拽功能
    function makeModalDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            e = e || window.event;
            
            // 如果点击的是按钮或表单元素，不启动拖拽
            const target = e.target;
            if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || 
                target.tagName === 'TEXTAREA' || target.closest('button') || target.closest('input') ||
                target.closest('select') || target.closest('textarea')) {
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
    
    // 打开模态框
    function openConditionSettingsModal() {
        console.log('🚀 Opening condition settings modal...');
        
        const modalContent = document.getElementById('modalContent');
        if (!modalContent) {
            console.error('❌ Modal content element not found!');
            return;
        }
        
        console.log('✅ Modal content element found');
        modalContent.style.display = 'block';
        
        // 保存模态框打开状态到localStorage
        localStorage.setItem('conditionSettingsModalOpen', 'true');
        localStorage.setItem('modalPosition', JSON.stringify({
            top: modalContent.style.top || '5%',
            left: modalContent.style.left || 'calc(50% - 450px)'
        }));
        
        // 初始化模态框拖拽功能
        makeModalDraggable(modalContent);
        
        console.log('About to render time conditions...');
        
        // 渲染时间条件
        renderTimePeriods();
        
        // 强制设置最高层级
        modalContent.style.setProperty('z-index', '2147483648', 'important');
        modalContent.style.setProperty('position', 'fixed', 'important');
        
        console.log('Modal opened successfully');
    }
    
    // 关闭模态框
    function closeConditionSettingsModal() {
        console.log('Closing condition settings modal...');
        const modalContent = document.getElementById('modalContent');
        if (modalContent) {
            modalContent.style.display = 'none';
            
            // 清除localStorage状态
            localStorage.removeItem('conditionSettingsModalOpen');
            localStorage.removeItem('modalPosition');
        }
    }
    
    // 检查并恢复模态框状态
    function checkAndRestoreModal() {
        const isModalOpen = localStorage.getItem('conditionSettingsModalOpen');
        const savedPosition = localStorage.getItem('modalPosition');
        
        if (isModalOpen === 'true') {
            const modalContent = document.getElementById('modalContent');
            if (modalContent) {
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
                
                // 渲染时间条件
                renderTimePeriods();
                
                // 初始化拖拽功能
                makeModalDraggable(modalContent);
            }
        }
    }
    
    // 初始化组件
    function initConditionSettingsModal() {
        console.log('Initializing condition settings modal...');

        // 不创建新的模态框，使用现有的 modalContent
        // index.html 中已经有了模态框，我们只需要初始化时间条件功能

        // 从localStorage加载保存的时间条件
        loadTimePeriods();

        // 初始化主界面条件显示
        updateMainPageConditionsDisplay();

        // 检查是否需要恢复模态框
        checkAndRestoreModal();

        // 添加语言切换监听，确保模态框中的文本随语言切换更新
        if (window.i18n && typeof window.i18n.addObserver === 'function') {
            window.i18n.addObserver((newLanguage, oldLanguage) => {
                console.log('Language changed, updating conditions display...');
                // 如果模态框当前是打开状态，重新渲染时间段以更新价格标签
                const modalContent = document.getElementById('modalContent');
                if (modalContent && modalContent.style.display !== 'none') {
                    renderTimePeriods();
                }
                // 同时更新主界面的条件显示
                updateMainPageConditionsDisplay();
            });
        }
    }
    
    // 时间条件相关函数
    function renderTimePeriods() {
        console.log('🎨 Rendering time periods...');
        console.log('📊 Current timePeriods:', timePeriods);
        
        // 先检查模态框是否存在
        const modal = document.getElementById('modalContent');
        if (!modal) {
            console.error('❌ Modal not found when trying to render time periods!');
            return;
        }
        console.log('✅ Modal exists when rendering');
        
        // 渲染充电时间段
        const chargeContainer = document.getElementById('chargeTimePeriods');
        if (chargeContainer) {
            console.log('🔋 Found charge container, rendering periods...');
            chargeContainer.innerHTML = '';
            timePeriods.charge.forEach((period, index) => {
                console.log(`🔋 Creating charge period ${index + 1}:`, period);
                chargeContainer.appendChild(createTimePeriodElement(period, 'charge'));
            });
            console.log('✅ Rendered charge periods:', timePeriods.charge.length);
        } else {
            console.error('❌ chargeTimePeriods container not found!');
            console.log('🔍 Available elements with time-related IDs:');
            ['chargeTimePeriods', 'dischargeTimePeriods', 'time-condition-container'].forEach(id => {
                const elem = document.getElementById(id);
                console.log(`  ${id}: ${elem ? 'EXISTS' : 'NOT FOUND'}`);
            });
        }

        // 渲染放电时间段
        const dischargeContainer = document.getElementById('dischargeTimePeriods');
        if (dischargeContainer) {
            console.log('⚡ Found discharge container, rendering periods...');
            dischargeContainer.innerHTML = '';
            timePeriods.discharge.forEach((period, index) => {
                console.log(`⚡ Creating discharge period ${index + 1}:`, period);
                dischargeContainer.appendChild(createTimePeriodElement(period, 'discharge'));
            });
            console.log('✅ Rendered discharge periods:', timePeriods.discharge.length);
        } else {
            console.error('❌ dischargeTimePeriods container not found!');
        }
        
        // 更新时间轴显示
        updateTimelineDisplay();
    }

    // 更新24小时时间轴显示
    function updateTimelineDisplay() {
        console.log('📅 Updating timeline display...');

        const chargeBlocks = document.getElementById('chargeTimelineBlocks');
        const dischargeBlocks = document.getElementById('dischargeTimelineBlocks');

        if (!chargeBlocks || !dischargeBlocks) {
            console.warn('⚠️ Timeline containers not found, will retry...');
            // 延迟重试,确保DOM已完全加载
            setTimeout(() => {
                const chargeRetry = document.getElementById('chargeTimelineBlocks');
                const dischargeRetry = document.getElementById('dischargeTimelineBlocks');
                if (chargeRetry && dischargeRetry) {
                    console.log('✅ Timeline containers found on retry, rendering...');
                    renderTimelineContent(chargeRetry, dischargeRetry);
                } else {
                    console.error('❌ Timeline containers still not found after retry');
                }
            }, 100);
            return;
        }

        renderTimelineContent(chargeBlocks, dischargeBlocks);
    }

    // 渲染时间轴内容的辅助函数
    function renderTimelineContent(chargeBlocks, dischargeBlocks) {
        // 清空现有显示
        chargeBlocks.innerHTML = '';
        dischargeBlocks.innerHTML = '';

        console.log(`🔋 Rendering ${timePeriods.charge.length} charge periods`);
        console.log(`⚡ Rendering ${timePeriods.discharge.length} discharge periods`);

        // 渲染充电时间段
        timePeriods.charge.forEach((period, index) => {
            const blocks = createTimelineBlocks(period, '#00ff88');
            blocks.forEach(block => {
                chargeBlocks.appendChild(block);
                console.log(`  ✓ Added charge block ${index + 1}: ${period.startTime}-${period.endTime}`);
            });
        });

        // 渲染放电时间段
        timePeriods.discharge.forEach((period, index) => {
            const blocks = createTimelineBlocks(period, '#ffc107');
            blocks.forEach(block => {
                dischargeBlocks.appendChild(block);
                console.log(`  ✓ Added discharge block ${index + 1}: ${period.startTime}-${period.endTime}`);
            });
        });

        console.log('✅ Timeline display updated successfully');
        console.log(`   - Charge blocks: ${chargeBlocks.children.length}`);
        console.log(`   - Discharge blocks: ${dischargeBlocks.children.length}`);
    }

    // 创建时间轴块
    function createTimelineBlocks(period, color) {
        const startMinutes = timeToMinutes(period.startTime);
        const endMinutes = timeToMinutes(period.endTime);
        const startHour = (startMinutes / (24 * 60)) * 100;
        const endHour = (endMinutes / (24 * 60)) * 100;
        
        const blocks = [];
        
        // 处理跨天的情况 (如 22:00 - 06:00)
        if (startHour > endHour) {
            // 分两段显示: 22:00-24:00 和 00:00-06:00
            const block1 = document.createElement('div');
            block1.style.cssText = `
                position: absolute;
                left: ${startHour}%;
                width: ${100 - startHour}%;
                height: 100%;
                background: ${color};
                border-radius: 2px;
                opacity: 0.8;
            `;
            
            const block2 = document.createElement('div');
            block2.style.cssText = `
                position: absolute;
                left: 0%;
                width: ${endHour}%;
                height: 100%;
                background: ${color};
                border-radius: 2px;
                opacity: 0.8;
            `;
            
            blocks.push(block1, block2);
        } else {
            // 正常情况
            const block = document.createElement('div');
            block.style.cssText = `
                position: absolute;
                left: ${startHour}%;
                width: ${endHour - startHour}%;
                height: 100%;
                background: ${color};
                border-radius: 2px;
                opacity: 0.8;
            `;
            blocks.push(block);
        }
        
        return blocks;
    }

    function createTimePeriodElement(period, type) {
        const div = document.createElement('div');
        div.className = 'time-period-item';

        // 确保价格字段存在(兼容旧数据)
        const priceEnabled = period.priceEnabled !== undefined ? period.priceEnabled : true;
        const priceThreshold = period.priceThreshold || (type === 'charge' ? 50 : 100);

        // 根据类型设置价格比较文字和颜色 - 使用国际化
        const priceLabel = type === 'charge' ?
            (window.i18n?.getText('lessThanPrice') || '低于') :
            (window.i18n?.getText('greaterThanPrice') || '高于');
        const themeColor = type === 'charge' ? '#00ff88' : '#ffc107';

        div.innerHTML = `
            <div class="time-period-inputs">
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <input type="time" class="time-input"
                           value="${period.startTime}"
                           onchange="updateTimePeriod('${period.id}', '${type}', 'startTime', this.value)">
                    <span class="time-period-separator">-</span>
                    <input type="time" class="time-input"
                           value="${period.endTime}"
                           onchange="updateTimePeriod('${period.id}', '${type}', 'endTime', this.value)">
                </div>

                <div style="display: flex; align-items: center; gap: 4px; margin-left: auto; flex-shrink: 0;">
                    <input type="checkbox"
                           ${priceEnabled ? 'checked' : ''}
                           onchange="updateTimePeriod('${period.id}', '${type}', 'priceEnabled', this.checked)"
                           style="width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;">
                    <span style="color: rgba(255, 255, 255, 0.7); font-size: 11px; white-space: nowrap; flex-shrink: 0;">${priceLabel}</span>
                    <input type="number"
                           class="time-input price-input"
                           value="${priceThreshold}"
                           ${!priceEnabled ? 'disabled' : ''}
                           onchange="updateTimePeriod('${period.id}', '${type}', 'priceThreshold', parseFloat(this.value))"
                           style="width: 55px; ${!priceEnabled ? 'opacity: 0.5;' : ''} border-color: ${themeColor};">
                </div>
            </div>
            <button class="period-action-btn delete"
                    onclick="deleteTimePeriod('${period.id}', '${type}')"
                    title="删除"
                    style="flex-shrink: 0;">
                ✕
            </button>
        `;

        // 防止拖拽干扰
        div.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        return div;
    }

    function addTimePeriod(type) {
        console.log('Adding time period for type:', type);

        const newPeriod = {
            id: `${type}-${Date.now()}`,
            startTime: '00:00',
            endTime: '01:00',  // 默认1小时时间段，避免开始时间等于结束时间
            priceThreshold: type === 'charge' ? 50 : 100,  // 默认价格门槛
            priceEnabled: true  // 默认启用价格条件
        };

        timePeriods[type].push(newPeriod);
        renderTimePeriods();
        saveTimePeriods();

        console.log('Added new period:', newPeriod);
    }

    function deleteTimePeriod(id, type) {
        console.log('Deleting time period:', id, type);
        
        timePeriods[type] = timePeriods[type].filter(p => p.id !== id);
        renderTimePeriods();
        saveTimePeriods();
        
        console.log('Deleted period:', id);
    }

    function updateTimePeriod(id, type, field, value) {
        console.log('Updating time period:', id, type, field, value);
        
        const period = timePeriods[type].find(p => p.id === id);
        if (period) {
            const oldValue = period[field];
            period[field] = value;
            
            // 时间冲突检测已移除 - 根据用户要求
            
            saveTimePeriods();
            // 更新时间轴显示
            updateTimelineDisplay();
        }
    }

    // 检查时间冲突
    function hasTimeConflict() {
        const allPeriods = [...timePeriods.charge, ...timePeriods.discharge];
        
        for (let i = 0; i < allPeriods.length; i++) {
            for (let j = i + 1; j < allPeriods.length; j++) {
                if (isTimeOverlap(allPeriods[i], allPeriods[j])) {
                    return true;
                }
            }
        }
        return false;
    }

    // 检查两个时间段是否重叠
    function isTimeOverlap(period1, period2) {
        const start1 = timeToMinutes(period1.startTime);
        const end1 = timeToMinutes(period1.endTime);
        const start2 = timeToMinutes(period2.startTime);
        const end2 = timeToMinutes(period2.endTime);
        
        // 处理跨天情况
        const isOvernight1 = start1 > end1;
        const isOvernight2 = start2 > end2;
        
        if (isOvernight1 && isOvernight2) {
            // 两个都是跨天时间段
            return true; // 简化处理：跨天时间段之间总是有重叠
        } else if (isOvernight1) {
            // period1跨天，period2不跨天
            return (start2 <= end1) || (start2 >= start1);
        } else if (isOvernight2) {
            // period2跨天，period1不跨天
            return (start1 <= end2) || (start1 >= start2);
        } else {
            // 都不跨天
            return (start1 < end2) && (start2 < end1);
        }
    }

    // 时间转换为分钟数
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // 显示时间冲突警告
    function showTimeConflictWarning() {
        const message = getCurrentLanguage() === 'en' ? 
            'Time periods cannot overlap!' : 
            '时间段不能重叠！';
        
        // 创建警告提示
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ff4757, #ff3742);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
            z-index: 10000;
            font-size: 14px;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        `;
        warning.textContent = message;
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(warning);
        
        // 3秒后自动消失
        setTimeout(() => {
            warning.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                if (warning.parentNode) warning.parentNode.removeChild(warning);
                if (style.parentNode) style.parentNode.removeChild(style);
            }, 300);
        }, 3000);
    }

    // 获取当前语言
    function getCurrentLanguage() {
        return localStorage.getItem('language') || 'zh';
    }


    function loadTimePeriods() {
        const saved = localStorage.getItem('modalTimePeriods');
        const savedVersion = localStorage.getItem('modalTimePeriodsVersion');

        if (saved && savedVersion === TIME_PERIODS_VERSION) {
            try {
                timePeriods = JSON.parse(saved);
                console.log('✅ Loaded time periods from localStorage:', timePeriods);
            } catch (e) {
                console.error('❌ Failed to load time periods:', e);
                console.log('🔄 Using default time periods');
                timePeriods = JSON.parse(JSON.stringify(defaultTimePeriods));
            }
        } else {
            if (savedVersion && savedVersion !== TIME_PERIODS_VERSION) {
                console.log('🔄 Version mismatch (saved:', savedVersion, 'current:', TIME_PERIODS_VERSION, ') - resetting to defaults');
            } else {
                console.log('📋 No saved time periods found - using defaults');
            }
            timePeriods = JSON.parse(JSON.stringify(defaultTimePeriods));
            // 保存新的默认值和版本号
            saveTimePeriods();
        }
    }

    function saveTimePeriods() {
        localStorage.setItem('modalTimePeriods', JSON.stringify(timePeriods));
        localStorage.setItem('modalTimePeriodsVersion', TIME_PERIODS_VERSION);
        console.log('💾 Saved time periods to localStorage:', timePeriods);
        console.log('📌 Version:', TIME_PERIODS_VERSION);
        // 同时更新主界面的条件显示
        updateMainPageConditionsDisplay();
    }

    // 更新主界面的充放电条件显示
    function updateMainPageConditionsDisplay() {
        console.log('📊 Updating main page conditions display...');

        // 获取主界面的容器
        const chargeList = document.getElementById('chargeConditionsList');
        const dischargeList = document.getElementById('dischargeConditionsList');

        if (!chargeList || !dischargeList) {
            console.warn('⚠️ Main page condition containers not found');
            return;
        }

        // 获取国际化文本 - 直接使用 i18n API
        const priceText = window.i18n?.getText('price') || '价格';
        const lessThanText = window.i18n?.getText('lessThanPrice') || '低于';
        const greaterThanText = window.i18n?.getText('greaterThanPrice') || '高于';

        console.log('📝 Price text:', priceText, '(should be "Price" in English mode)');

        // 渲染充电条件
        chargeList.innerHTML = '';
        if (timePeriods.charge && timePeriods.charge.length > 0) {
            timePeriods.charge.forEach(period => {
                const item = document.createElement('div');
                item.style.cssText = 'display: flex; align-items: center; gap: 20px;';

                // 根据价格是否启用显示不同内容
                if (period.priceEnabled) {
                    item.innerHTML = `
                        <span style="font-size: 14px; color: rgba(255,255,255,0.95); white-space: nowrap;">${period.startTime}-${period.endTime}</span>
                        <span style="font-size: 14px; color: rgba(255,255,255,0.95); white-space: nowrap;">${priceText}&lt;<span style="color: #00ff88;">$${period.priceThreshold}</span></span>
                    `;
                } else {
                    item.innerHTML = `
                        <span style="font-size: 14px; color: rgba(255,255,255,0.95); white-space: nowrap;">${period.startTime}-${period.endTime}</span>
                    `;
                }
                chargeList.appendChild(item);
            });
        }

        // 如果没有充电条件，显示提示
        if (chargeList.children.length === 0) {
            chargeList.innerHTML = '<div style="font-size: 12px; color: rgba(255,255,255,0.5); font-style: italic;">-</div>';
        }

        // 渲染放电条件
        dischargeList.innerHTML = '';
        if (timePeriods.discharge && timePeriods.discharge.length > 0) {
            timePeriods.discharge.forEach(period => {
                const item = document.createElement('div');
                item.style.cssText = 'display: flex; align-items: center; gap: 20px;';

                // 根据价格是否启用显示不同内容
                if (period.priceEnabled) {
                    item.innerHTML = `
                        <span style="font-size: 14px; color: rgba(255,255,255,0.95); white-space: nowrap;">${period.startTime}-${period.endTime}</span>
                        <span style="font-size: 14px; color: rgba(255,255,255,0.95); white-space: nowrap;">${priceText}&gt;<span style="color: #FFC107;">$${period.priceThreshold}</span></span>
                    `;
                } else {
                    item.innerHTML = `
                        <span style="font-size: 14px; color: rgba(255,255,255,0.95); white-space: nowrap;">${period.startTime}-${period.endTime}</span>
                    `;
                }
                dischargeList.appendChild(item);
            });
        }

        // 如果没有放电条件，显示提示
        if (dischargeList.children.length === 0) {
            dischargeList.innerHTML = '<div style="font-size: 12px; color: rgba(255,255,255,0.5); font-style: italic;">-</div>';
        }

        console.log('✅ Main page conditions display updated');
    }

    // 保存条件设置并关闭模态框
    function saveConditionSettings() {
        console.log('💾 Saving condition settings...');
        saveTimePeriods();
        
        // 显示保存成功提示
        const message = getCurrentLanguage() === 'en' ? 
            'Settings saved successfully!' : 
            '设置已保存！';
        
        // 创建成功提示
        const successAlert = document.createElement('div');
        successAlert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00ff88, #00cc6a);
            color: #000;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
            z-index: 10000;
            font-size: 14px;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        `;
        successAlert.textContent = message;
        
        document.body.appendChild(successAlert);
        
        // 3秒后自动消失
        setTimeout(() => {
            successAlert.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                if (successAlert.parentNode) successAlert.parentNode.removeChild(successAlert);
            }, 300);
        }, 2000);
        
        // 关闭模态框
        closeConditionSettingsModal();
    }

    // 暴露函数到全局
    window.openConditionSettingsModal = openConditionSettingsModal;
    window.closeConditionSettingsModal = closeConditionSettingsModal;
    window.addTimePeriod = addTimePeriod;
    window.deleteTimePeriod = deleteTimePeriod;
    window.updateTimePeriod = updateTimePeriod;
    window.renderTimePeriods = renderTimePeriods;
    window.checkAndRestoreModal = checkAndRestoreModal;
    window.saveConditionSettings = saveConditionSettings;
    window.updateMainPageConditionsDisplay = updateMainPageConditionsDisplay;

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('📄 DOMContentLoaded - initializing modal...');
            initConditionSettingsModal();
        });
    } else {
        console.log('📄 Document already loaded - initializing modal...');
        initConditionSettingsModal();
    }
    
    // 延迟检查（确保所有资源加载完成）
    setTimeout(() => {
        console.log('⏰ Delayed check - restoring modal state...');
        checkAndRestoreModal();
    }, 1000);
    
    // 额外的检查：确保函数在页面完全加载后可用
    window.addEventListener('load', () => {
        console.log('🌍 Window load event - ensuring modal is ready...');
        const modalContent = document.getElementById('modalContent');
        if (modalContent) {
            console.log('🔧 Modal found on window load, initializing time periods...');
            // 延迟一点时间确保DOM完全加载
            setTimeout(() => {
                renderTimePeriods();
                // 同时更新主界面的条件显示
                updateMainPageConditionsDisplay();
            }, 500);
        }

        // 额外延迟更新主界面显示，确保DOM容器已加载
        setTimeout(() => {
            console.log('🔄 Extra delayed update for main page conditions...');
            updateMainPageConditionsDisplay();
        }, 1500);
    });

})();