// 全局通知和测试卡片组件
(function() {
    'use strict';

    // 创建通知弹窗HTML
    function createNotificationHTML() {
        return `
            <div id="chargeNotification" class="notification-popup" style="display: none;">
                <div class="notification-card">
                    <div class="notification-header">
                        <div class="notification-title">
                            <span class="notification-icon"></span><span class="title-text"></span>
                        </div>
                        <button class="notification-close-btn" onclick="closeNotification()">×</button>
                    </div>
                    <div class="notification-content">
                        <span class="content-text"></span>
                    </div>
                </div>
            </div>
            
            <div id="dischargeNotification" class="notification-popup" style="display: none;">
                <div class="notification-card">
                    <div class="notification-header">
                        <div class="notification-title">
                            <span class="notification-icon"></span><span class="title-text"></span>
                        </div>
                        <button class="notification-close-btn" onclick="closeNotification()">×</button>
                    </div>
                    <div class="notification-content">
                        <span class="content-text"></span>
                    </div>
                </div>
            </div>
            
            <div id="optimalTimeNotification" class="notification-popup" style="display: none;">
                <div class="notification-card">
                    <div class="notification-header">
                        <div class="notification-title">
                            <span class="notification-icon"></span><span class="title-text"></span>
                        </div>
                        <button class="notification-close-btn" onclick="closeNotification()">×</button>
                    </div>
                    <div class="notification-content">
                        <span class="content-text"></span>
                    </div>
                </div>
            </div>
            
            <div id="lowPriceNotification" class="notification-popup" style="display: none;">
                <div class="notification-card">
                    <div class="notification-header">
                        <div class="notification-title">
                            <span class="notification-icon"></span><span class="title-text"></span>
                        </div>
                        <button class="notification-close-btn" onclick="closeNotification()">×</button>
                    </div>
                    <div class="notification-content">
                        <span class="content-text"></span>
                    </div>
                </div>
            </div>
        `;
    }

    // 创建测试卡片HTML
    

    // 创建样式
    function createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* 通知弹窗样式 */
            .notification-popup {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10001;
            }


            .notification-card {
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(24px) saturate(180%);
                -webkit-backdrop-filter: blur(24px) saturate(180%);
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 16px 18px;
                width: 380px;
                box-shadow: 
                    0 12px 40px rgba(0, 0, 0, 0.4),
                    0 4px 16px rgba(0, 0, 0, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1),
                    0 0 0 1px rgba(255, 255, 255, 0.05);
                animation: slideInScale 0.5s cubic-bezier(0.23, 1, 0.32, 1);
                position: relative;
                overflow: hidden;
            }

            .notification-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            }

            @keyframes slideInScale {
                0% {
                    transform: translateX(120%) scale(0.8);
                    opacity: 0;
                }
                60% {
                    transform: translateX(-5%) scale(1.02);
                    opacity: 0.9;
                }
                100% {
                    transform: translateX(0) scale(1);
                    opacity: 1;
                }
            }

            .notification-header {
                position: relative;
                margin-bottom: 8px;
                margin-top: -15px;
            }

            .notification-title {
                width: calc(100% - 30px);
                display: block;
                text-align: left;
                font-size: 15px;
                font-weight: 600;
                color: #ffffff;
                letter-spacing: -0.03em;
                margin: 0;
                padding: 0;
                margin-top: -5px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .notification-icon {
                font-size: 17px;
                margin-right: 8px;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
            }

            .notification-close-btn {
                position: absolute;
                top: 5px;
                right: 2px;
                background: rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.7);
                width: 26px;
                height: 26px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                font-size: 15px;
                font-weight: 500;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }

            .notification-close-btn:hover {
                background: rgba(255, 255, 255, 0.15);
                color: #fff;
                transform: scale(1.05);
                border-color: rgba(255, 255, 255, 0.2);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            }

            .notification-content {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.92);
                line-height: 1.5;
                text-align: left;
                margin: 0;
                padding: 0;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            }

            .price-value {
                font-weight: 700;
                font-size: 13px;
                color: #000;
                background: linear-gradient(135deg, #00ff88 0%, #00e676 100%);
                padding: 3px 8px;
                border-radius: 6px;
                margin: 0 3px;
                display: inline-block;
                box-shadow: 
                    0 2px 6px rgba(0, 255, 136, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(0, 255, 136, 0.4);
            }

            .threshold-value {
                font-weight: 600;
                font-size: 13px;
                color: #fff;
                background: linear-gradient(135deg, #007bff 0%, #0056d3 100%);
                padding: 3px 8px;
                border-radius: 6px;
                margin: 0 3px;
                display: inline-block;
                box-shadow: 
                    0 2px 6px rgba(0, 123, 255, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.15);
                border: 1px solid rgba(0, 123, 255, 0.4);
            }

            .time-value {
                font-weight: 600;
                font-size: 13px;
                color: #fff;
                background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
                padding: 3px 8px;
                border-radius: 6px;
                margin: 0 3px;
                display: inline-block;
                box-shadow: 
                    0 2px 6px rgba(255, 107, 53, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.15);
                border: 1px solid rgba(255, 107, 53, 0.4);
            }

            @media (max-width: 768px) {
                .notification-card {
                    width: calc(100% - 40px);
                    max-width: 380px;
                    margin: 0 20px;
                }
                
                .notification-popup {
                    top: 20px;
                    right: 10px;
                    left: 10px;
                    width: auto;
                }
            }
        `;
        return style;
    }

    // 通知内容配置
    const notificationConfigs = {
        charge: {
            icon: '🔋',
            zh: {
                title: '充电提醒——NSW',
                content: '当前电价<span class="price-value">$20</span>，低于阈值<span class="threshold-value">$250</span>，请充电'
            },
            en: {
                title: 'Charge Reminder——NSW',
                content: 'Current electricity price <span class="price-value">$20</span>, below threshold <span class="threshold-value">$250</span>, please charge'
            }
        },
        discharge: {
            icon: '⚡',
            zh: {
                title: '放电提醒——NSW',
                content: '当前电价<span class="price-value">$300</span>，高于阈值<span class="threshold-value">$250</span>，请放电'
            },
            en: {
                title: 'Discharge Reminder——NSW',
                content: 'Current electricity price <span class="price-value">$300</span>, above threshold <span class="threshold-value">$250</span>, please discharge'
            }
        },
        optimal: {
            icon: '⚡',
            zh: {
                title: '最佳放电时机提醒——NSW',
                content: 'NSW地区充电价格<span class="price-value">$300</span>，还有<span class="time-value">27分钟</span>到达最佳放电时机，请做好准备'
            },
            en: {
                title: 'Optimal Discharge Time Reminder——NSW',
                content: 'NSW electricity price <span class="price-value">$300</span>, <span class="time-value">27 minutes</span> until optimal discharge time, please prepare'
            }
        },
        lowPrice: {
            icon: '🔋',
            zh: {
                title: '低价充电提醒——NSW',
                content: 'NSW地区充电价格<span class="price-value">$20</span>，还有<span class="time-value">27分钟</span>到达低价充电时机，请做好准备'
            },
            en: {
                title: 'Low Price Charge Reminder——NSW',
                content: 'NSW electricity price <span class="price-value">$20</span>, <span class="time-value">27 minutes</span> until low price charging time, please prepare'
            }
        }
    };

    // 更新弹窗内容的函数
    function updateNotificationContent(notificationId, type) {
        const notification = document.getElementById(notificationId);
        if (!notification) return;
        
        const titleText = notification.querySelector('.title-text');
        const contentText = notification.querySelector('.content-text');
        const iconElement = notification.querySelector('.notification-icon');
        
        if (titleText && contentText && iconElement) {
            const currentLang = (window.i18n && window.i18n.currentLanguage) || 'zh';
            const config = notificationConfigs[type];
            
            if (config) {
                iconElement.textContent = config.icon;
                titleText.textContent = config[currentLang].title;
                contentText.innerHTML = config[currentLang].content;
            }
        }
    }

    // 通用关闭弹窗函数
    window.closeNotification = function() {
        const notifications = document.querySelectorAll('.notification-popup');
        notifications.forEach(notification => {
            if (notification.style.display === 'block') {
                notification.style.display = 'none';
            }
        });
    };

    // 充电提醒弹窗函数
    window.showChargeNotification = function() {
        closeNotification(); // 先关闭其他弹窗
        updateNotificationContent('chargeNotification', 'charge');
        document.getElementById('chargeNotification').style.display = 'block';
    };

    // 放电提醒弹窗函数
    window.showDischargeNotification = function() {
        closeNotification();
        updateNotificationContent('dischargeNotification', 'discharge');
        document.getElementById('dischargeNotification').style.display = 'block';
    };

    // 最佳时机提醒弹窗函数
    window.showOptimalNotification = function() {
        console.log('showOptimalNotification called');
        closeNotification();
        updateNotificationContent('optimalTimeNotification', 'optimal');
        const element = document.getElementById('optimalTimeNotification');
        console.log('optimalTimeNotification element found:', element);
        if (element) {
            element.style.display = 'block';
            console.log('optimalTimeNotification shown');
        } else {
            console.error('optimalTimeNotification element not found!');
        }
    };

    // 低价充电提醒弹窗函数
    window.showLowPriceNotification = function() {
        closeNotification();
        updateNotificationContent('lowPriceNotification', 'lowPrice');
        document.getElementById('lowPriceNotification').style.display = 'block';
    };

    // ESC键关闭弹窗
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const popup = document.getElementById('chargeNotification');
            if (popup && popup.style.display === 'block') {
                closeChargeNotification();
            }
        }
    });

    // 模拟通知函数
    // 模拟通知函数
    window.simulateChargeNotification = function() {
        console.log('显示充电提醒弹窗');
        showChargeNotification();
    };

    window.simulateDischargeNotification = function() {
        console.log('显示放电提醒弹窗');
        showDischargeNotification();
    };

    window.simulateOptimalNotification = function() {
        console.log('显示最佳时机提醒弹窗');
        console.log('optimalNotification element:', document.getElementById('optimalNotification'));
        showOptimalNotification();
    };

    window.simulateLowPriceNotification = function() {
        console.log('显示低价充电提醒弹窗');
        showLowPriceNotification();
    };

    // 初始化拖拽功能
    function initTestCardDrag() {
        const container = document.getElementById('testCardContainer');
        const dragHandle = document.getElementById('testCardDragHandle');
        
        if (!container || !dragHandle) return;
        
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        
        // 从localStorage恢复位置
        const savedPosition = localStorage.getItem('testCardPosition');
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                const rect = container.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                
                const validX = Math.max(0, Math.min(pos.x || 0, maxX));
                const validY = Math.max(0, Math.min(pos.y || 0, maxY));
                
                container.style.bottom = 'auto';
                container.style.left = '0';
                container.style.top = '0';
                container.style.transform = `translate3d(${validX}px, ${validY}px, 0)`;
                xOffset = validX;
                yOffset = validY;
            } catch (e) {
                console.error('Failed to restore test card position:', e);
                localStorage.removeItem('testCardPosition');
            }
        }
        
        function dragStart(e) {
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            
            if (e.target === dragHandle || dragHandle.contains(e.target)) {
                isDragging = true;
                container.style.cursor = 'grabbing';
            }
        }
        
        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            container.style.cursor = 'auto';
            
            localStorage.setItem('testCardPosition', JSON.stringify({
                x: xOffset,
                y: yOffset
            }));
        }
        
        function drag(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            
            if (isDragging) {
                if (e.type === "touchmove") {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                
                xOffset = currentX;
                yOffset = currentY;
                
                const rect = container.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                
                currentX = Math.max(0, Math.min(currentX, maxX));
                currentY = Math.max(0, Math.min(currentY, maxY));
                
                container.style.bottom = 'auto';
                container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        }
        
        dragHandle.addEventListener('mousedown', dragStart);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('mousemove', drag);
        
        dragHandle.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchend', dragEnd);
        document.addEventListener('touchmove', drag, { passive: false });
    }

    // 重置测试卡片位置
    window.resetTestCardPosition = function() {
        const container = document.getElementById('testCardContainer');
        if (container) {
            container.style.bottom = '20px';
            container.style.left = '20px';
            container.style.top = 'auto';
            container.style.transform = 'none';
            localStorage.removeItem('testCardPosition');
            updateTestCardPosition();
            console.log('Test card position reset to bottom-left corner');
        }
    };

    // 更新测试卡片位置显示
    function updateTestCardPosition() {
        const container = document.getElementById('testCardContainer');
        const positionSpan = document.getElementById('testCardPosition');
        if (container && positionSpan) {
            const rect = container.getBoundingClientRect();
            positionSpan.textContent = `(${Math.round(rect.left)}, ${Math.round(rect.top)})`;
        }
    }

    // 测试工具相关函数
    window.toggleTestTools = function() {
        console.log('toggleTestTools called!'); // Debug log
        const panel = document.getElementById('testToolsPanel');
        const toggle = document.getElementById('testToolsToggle');
        console.log('Panel:', panel, 'Toggle:', toggle); // Debug log
        if (panel && toggle) {
            if (panel.style.display === 'none' || !panel.style.display) {
                panel.style.display = 'block';
                toggle.style.transform = 'rotate(45deg)';
                console.log('Panel opened'); // Debug log
                
                // 强制更新面板内的翻译
                setTimeout(() => {
                    console.log('Checking i18n availability:', window.i18n);
                    
                    // 尝试直接调用updatePageTexts
                    if (window.i18n && window.i18n.updatePageTexts) {
                        console.log('Calling updatePageTexts directly');
                        window.i18n.updatePageTexts();
                    }
                    
                    // 同时尝试手动更新
                    if (window.i18n) {
                        const currentLang = window.i18n.currentLanguage || 'zh';
                        console.log('Current language:', currentLang);
                        
                        // 使用正确的翻译
                        const translations = {
                            zh: {
                                pushNotificationTest: '推送通知测试',
                                simulateCharge: '充电提醒',
                                simulateDischarge: '放电提醒',
                                simulateOptimal: '最佳放电时机提醒',
                                simulateLowPrice: '低价充电提醒'
                            },
                            en: {
                                pushNotificationTest: 'Push Notification Test',
                                simulateCharge: 'Charge Reminder',
                                simulateDischarge: 'Discharge Reminder',
                                simulateOptimal: 'Optimal Discharge Time Reminder',
                                simulateLowPrice: 'Low Price Charge Reminder'
                            }
                        };
                        
                        const langTexts = translations[currentLang] || translations.zh;
                        
                        panel.querySelectorAll('[data-i18n]').forEach(el => {
                            const key = el.getAttribute('data-i18n');
                            const text = langTexts[key];
                            if (text) {
                                el.textContent = text;
                                console.log(`Manually updated: ${key} -> ${text}`);
                            }
                        });
                    }
                }, 100);
            } else {
                panel.style.display = 'none';
                toggle.style.transform = 'rotate(0deg)';
                console.log('Panel closed'); // Debug log
            }
        } else {
            console.error('Panel or toggle not found!'); // Debug log
        }
    };

    window.closeTestTools = function() {
        const panel = document.getElementById('testToolsPanel');
        const toggle = document.getElementById('testToolsToggle');
        if (panel && toggle) {
            panel.style.display = 'none';
            toggle.style.transform = 'rotate(0deg)';
        }
    };

    window.showTestCard = function() {
        const container = document.getElementById('testCardContainer');
        if (container) {
            container.style.display = 'block';
            updateTestCardPosition();
            console.log('Test card shown');
        }
    };

    window.hideTestCard = function() {
        const container = document.getElementById('testCardContainer');
        if (container) {
            container.style.display = 'none';
            console.log('Test card hidden');
        }
    };

    window.randomTestCard = function() {
        const container = document.getElementById('testCardContainer');
        if (container) {
            const maxX = window.innerWidth - 300;
            const maxY = window.innerHeight - 150;
            const randomX = Math.max(0, Math.floor(Math.random() * maxX));
            const randomY = Math.max(0, Math.floor(Math.random() * maxY));
            
            container.style.bottom = 'auto';
            container.style.left = '0';
            container.style.top = '0';
            container.style.transform = `translate3d(${randomX}px, ${randomY}px, 0)`;
            
            localStorage.setItem('testCardPosition', JSON.stringify({
                x: randomX,
                y: randomY
            }));
            
            updateTestCardPosition();
            console.log(`Test card moved to random position: (${randomX}, ${randomY})`);
        }
    };

    // 自动测试相关已删除

    // 监听语言切换事件
    function listenToLanguageChange() {
        // 监听语言切换事件
        if (window.i18n && window.i18n.addObserver) {
            window.i18n.addObserver((newLang) => {
                // 更新所有弹窗内容
                updateNotificationContent('chargeNotification', 'charge');
                updateNotificationContent('dischargeNotification', 'discharge');
                updateNotificationContent('optimalTimeNotification', 'optimal');
                updateNotificationContent('lowPriceNotification', 'lowPrice');
            });
        }
        
        // 定期检查语言变化
        let lastLang = (window.i18n && window.i18n.currentLanguage) || 'zh';
        setInterval(() => {
            const currentLang = (window.i18n && window.i18n.currentLanguage) || 'zh';
            if (currentLang !== lastLang) {
                lastLang = currentLang;
                // 更新所有弹窗内容
                updateNotificationContent('chargeNotification', 'charge');
                updateNotificationContent('dischargeNotification', 'discharge');
                updateNotificationContent('optimalTimeNotification', 'optimal');
                updateNotificationContent('lowPriceNotification', 'lowPrice');
            }
        }, 500);
    }

    // 初始化组件
    function init() {
        // 添加样式
        document.head.appendChild(createStyles());
        
        // 创建所有通知弹窗
        const container = document.createElement('div');
        container.innerHTML = createNotificationHTML();
        document.body.appendChild(container);
        
        // 监听语言切换
        listenToLanguageChange();
        
        // Debug: 确认组件已加载
        console.log('Global notifications component loaded with all notifications');
        console.log('toggleTestTools function available:', typeof window.toggleTestTools);
        
        // 检查所有弹窗元素是否创建成功
        console.log('chargeNotification:', document.getElementById('chargeNotification'));
        console.log('dischargeNotification:', document.getElementById('dischargeNotification'));
        console.log('optimalTimeNotification:', document.getElementById('optimalTimeNotification'));
        console.log('lowPriceNotification:', document.getElementById('lowPriceNotification'));
        
        // 测试函数是否可用
        setTimeout(() => {
            console.log('Testing notification functions:');
            console.log('simulateOptimalNotification available:', typeof window.simulateOptimalNotification);
            console.log('showOptimalNotification available:', typeof window.showOptimalNotification);
        }, 1000);
    }

    // 等待DOM加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // 提供全局测试函数
    window.testOptimalNotification = function() {
        console.log('=== Testing Optimal Notification ===');
        const elem = document.getElementById('optimalTimeNotification');
        console.log('Element found:', elem);
        if (elem) {
            console.log('Current display:', elem.style.display);
            elem.style.display = 'block';
            console.log('New display:', elem.style.display);
            updateNotificationContent('optimalTimeNotification', 'optimal');
            console.log('Content updated');
        }
    };
})();