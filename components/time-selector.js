/**
 * 时间选择器组件
 * Time Selector Component
 * @version 1.0.0
 * @author AlwaysControl
 */

class TimeSelector {
    constructor(options = {}) {
        this.options = {
            containerId: 'time-selector-container',
            onPeriodChange: null,
            onCustomDateApply: null,
            enableAutoRefresh: true,
            autoRefreshInterval: 30000,
            maxDateRange: 365,
            quickSelectOptions: [
                { label: window.i18n ? window.i18n.getText('last7Days') : '最近7天', days: 7 },
                { label: window.i18n ? window.i18n.getText('last30Days') : '最近30天', days: 30 },
                { label: window.i18n ? window.i18n.getText('last90Days') : '最近90天', days: 90 },
                { label: window.i18n ? window.i18n.getText('last6Months') : '最近6个月', days: 180 },
                { label: window.i18n ? window.i18n.getText('last1Year') : '最近1年', days: 365 }
            ],
            periods: [
                { id: 'day', label: window.i18n ? window.i18n.getText('dayReport') : '日报', shortcut: '1' },
                { id: 'month', label: window.i18n ? window.i18n.getText('monthReport') : '月报', shortcut: '2' },
                { id: 'year', label: window.i18n ? window.i18n.getText('yearReport') : '年报', shortcut: '3' },
                { id: 'total', label: window.i18n ? window.i18n.getText('totalReport') : '累计', shortcut: '4' },
                { id: 'custom', label: window.i18n ? window.i18n.getText('selectTime') : '选择时间', shortcut: '5' }
            ],
            ...options
        };

        this.currentPeriod = 'day';
        this.autoRefreshTimer = null;
        this.dataCache = new Map();
        
        this.init();
    }

    /**
     * 初始化组件
     */
    init() {
        this.createHTML();
        this.bindEvents();
        this.initializeDateInputs();
        
        if (this.options.enableAutoRefresh) {
            this.startAutoRefresh();
        }
        
        this.addKeyboardShortcuts();
        this.addAccessibilityFeatures();
    }

    /**
     * 创建HTML结构
     */
    createHTML() {
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            console.error(`TimeSelector: Container with id "${this.options.containerId}" not found`);
            return;
        }

        container.innerHTML = `
            <div class="time-filter-section">
                <div class="time-filter-group">
                    <span class="time-filter-label" style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-right: 10px;" data-i18n-key="timeFilter">${window.i18n ? window.i18n.getText('timeFilter') : '时间筛选'}</span>
                    ${this.options.periods.map((period, index) => `
                        <button 
                            class="time-tab ${index === 0 ? 'active' : ''}" 
                            data-period="${period.id}"
                            id="time-tab-${period.id}"
                            role="tab"
                            aria-selected="${index === 0}"
                            title="${period.label} (Ctrl+${period.shortcut})"
                        >
                            ${period.label}
                        </button>
                    `).join('')}
                    <button class="refresh-btn" id="refresh-data-btn" title="${window.i18n ? window.i18n.getText('refreshData') : '手动刷新数据'}">
                        🔄 ${window.i18n ? window.i18n.getText('refresh') : '刷新'}
                    </button>
                </div>
            </div>

            <div class="custom-date-panel" id="custom-date-panel">
                <div class="date-inputs-container">
                    <div class="date-range-wrapper">
                        <div class="date-input-wrapper">
                            <label for="start-date-input">${window.i18n ? window.i18n.getText('startDate') : '开始日期'}</label>
                            <input type="date" id="start-date-input" class="date-input">
                        </div>
                        <div class="date-input-wrapper">
                            <label for="end-date-input">${window.i18n ? window.i18n.getText('endDate') : '结束日期'}</label>
                            <input type="date" id="end-date-input" class="date-input">
                        </div>
                    </div>
                    <div class="date-actions">
                        <button class="time-btn time-btn-secondary" id="reset-date-btn">${window.i18n ? window.i18n.getText('reset') : '重置'}</button>
                        <button class="time-btn time-btn-primary" id="apply-date-btn">${window.i18n ? window.i18n.getText('query') : '查询'}</button>
                    </div>
                </div>
                <div class="quick-select-area">
                    <span class="quick-select-label">${window.i18n ? window.i18n.getText('quickSelect') : '快速选择'}</span>
                    ${this.options.quickSelectOptions.map(option => `
                        <button class="quick-select-btn" data-days="${option.days}">
                            ${option.label}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 时间标签点击事件
        document.querySelectorAll('.time-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const period = e.target.dataset.period;
                if (period) {
                    this.switchPeriod(period, e.target);
                }
            });
            
            // 添加mousedown事件防止被拖拽干扰
            tab.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        });

        // 自定义日期应用按钮
        const applyBtn = document.getElementById('apply-date-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.applyCustomDateRange();
            });
            applyBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        }

        // 重置按钮
        const resetBtn = document.getElementById('reset-date-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.resetToDefault();
            });
            resetBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        }

        // 刷新按钮
        const refreshBtn = document.getElementById('refresh-data-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.refreshData();
            });
            refreshBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        }

        // 快速选择按钮
        document.querySelectorAll('.quick-select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const days = parseInt(e.target.dataset.days);
                if (days) {
                    this.setQuickRange(days);
                }
            });
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        });

        // 日期输入验证
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        
        if (startInput && endInput) {
            startInput.addEventListener('change', () => this.validateDateRange());
            endInput.addEventListener('change', () => this.validateDateRange());
            
            // 防止拖拽干扰日期输入
            startInput.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            endInput.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            
            // 防止点击事件冒泡
            startInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            endInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // 页面可见性变化处理
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAutoRefresh();
            } else if (this.options.enableAutoRefresh) {
                this.resumeAutoRefresh();
            }
        });
    }

    /**
     * 切换时间周期
     */
    switchPeriod(period, buttonElement) {
        // 添加加载状态
        if (buttonElement) {
            buttonElement.style.opacity = '0.7';
            buttonElement.style.pointerEvents = 'none';
        }

        // 更新活动状态
        document.querySelectorAll('.time-tab').forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });

        if (buttonElement) {
            buttonElement.classList.add('active');
            buttonElement.setAttribute('aria-selected', 'true');
        }

        this.currentPeriod = period;

        // 处理自定义时间选择
        if (period === 'custom') {
            this.showCustomDatePanel();
            this.initializeDateInputs();
        } else {
            this.hideCustomDatePanel();
            
            // 停止自动刷新（非日报模式）
            if (period !== 'day') {
                this.pauseAutoRefresh();
            } else if (this.options.enableAutoRefresh) {
                this.startAutoRefresh();
            }
        }

        // 恢复按钮状态
        setTimeout(() => {
            if (buttonElement) {
                buttonElement.style.opacity = '1';
                buttonElement.style.pointerEvents = 'auto';
            }
        }, 300);

        // 触发回调
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(period, this.getPeriodData(period));
        }

        this.showNotification(`已切换到${this.getPeriodLabel(period)}`, 'info');
    }

    /**
     * 显示自定义日期面板
     */
    showCustomDatePanel() {
        const panel = document.getElementById('custom-date-panel');
        if (panel) {
            panel.style.display = 'block';
            setTimeout(() => {
                panel.classList.add('show');
            }, 10);
        }
    }

    /**
     * 隐藏自定义日期面板
     */
    hideCustomDatePanel() {
        const panel = document.getElementById('custom-date-panel');
        if (panel) {
            panel.classList.remove('show');
            setTimeout(() => {
                panel.style.display = 'none';
            }, 300);
        }
    }

    /**
     * 初始化日期输入框
     */
    initializeDateInputs() {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        
        if (startInput && endInput) {
            startInput.value = yesterday.toISOString().split('T')[0];
            endInput.value = today.toISOString().split('T')[0];
        }
    }

    /**
     * 设置快速日期范围
     */
    setQuickRange(days) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days + 1);
        
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        
        if (startInput && endInput) {
            startInput.value = startDate.toISOString().split('T')[0];
            endInput.value = endDate.toISOString().split('T')[0];
            
            this.validateDateRange();
            
            // 自动应用快速选择
            setTimeout(() => {
                this.applyCustomDateRange();
            }, 100);
        }
    }

    /**
     * 应用自定义日期范围
     */
    applyCustomDateRange() {
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        const applyBtn = document.getElementById('apply-date-btn');
        
        if (!startInput || !endInput) return;
        
        const startDate = startInput.value;
        const endDate = endInput.value;
        
        // 验证输入
        if (!startDate || !endDate) {
            this.showNotification('请选择开始和结束日期', 'error');
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            this.showNotification('开始日期不能晚于结束日期', 'error');
            return;
        }
        
        // 验证日期范围
        const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > this.options.maxDateRange) {
            this.showNotification(`选择的时间范围不能超过${this.options.maxDateRange}天`, 'error');
            return;
        }
        
        // 显示加载状态
        if (applyBtn) {
            const originalText = applyBtn.textContent;
            applyBtn.textContent = '加载中...';
            applyBtn.style.opacity = '0.7';
            applyBtn.style.pointerEvents = 'none';
            
            setTimeout(() => {
                applyBtn.textContent = originalText;
                applyBtn.style.opacity = '1';
                applyBtn.style.pointerEvents = 'auto';
            }, 1000);
        }
        
        // 停止自动刷新
        this.pauseAutoRefresh();
        
        // 触发回调
        if (this.options.onCustomDateApply) {
            this.options.onCustomDateApply(startDate, endDate, diffDays + 1);
        }
        
        this.showNotification(`已应用自定义时间范围 (${diffDays + 1}天)`, 'success');
    }

    /**
     * 重置到默认状态
     */
    resetToDefault() {
        this.hideCustomDatePanel();
        this.switchPeriod('day', document.getElementById('time-tab-day'));
    }

    /**
     * 验证日期范围
     */
    validateDateRange() {
        const startInput = document.getElementById('start-date-input');
        const endInput = document.getElementById('end-date-input');
        
        if (!startInput || !endInput) return false;
        
        const startDate = startInput.value;
        const endDate = endInput.value;
        
        // 重置样式
        startInput.className = 'date-input';
        endInput.className = 'date-input';
        
        if (startDate && endDate) {
            if (new Date(startDate) > new Date(endDate)) {
                startInput.className = 'date-input invalid';
                endInput.className = 'date-input invalid';
                return false;
            }
            
            // 检查范围是否过大
            const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > this.options.maxDateRange) {
                startInput.className = 'date-input warning';
                endInput.className = 'date-input warning';
                return false;
            }
            
            // 有效范围
            startInput.className = 'date-input valid';
            endInput.className = 'date-input valid';
            return true;
        }
        
        return false;
    }

    /**
     * 开始自动刷新
     */
    startAutoRefresh() {
        this.pauseAutoRefresh();
        this.autoRefreshTimer = setInterval(() => {
            if (this.currentPeriod === 'day') {
                this.refreshData();
            }
        }, this.options.autoRefreshInterval);
    }

    /**
     * 暂停自动刷新
     */
    pauseAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    }

    /**
     * 恢复自动刷新
     */
    resumeAutoRefresh() {
        if (this.currentPeriod === 'day') {
            this.startAutoRefresh();
        }
    }

    /**
     * 刷新数据
     */
    refreshData() {
        const refreshBtn = document.getElementById('refresh-data-btn');
        if (refreshBtn) {
            refreshBtn.style.opacity = '0.5';
            refreshBtn.style.pointerEvents = 'none';
        }
        
        // 清除缓存
        this.dataCache.clear();
        
        // 触发数据更新
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(this.currentPeriod, this.getPeriodData(this.currentPeriod));
        }
        
        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.style.opacity = '1';
                refreshBtn.style.pointerEvents = 'auto';
            }
            this.showNotification(window.i18n ? window.i18n.getText('dataRefreshed') : '数据已刷新', 'info');
        }, 1000);
    }

    /**
     * 添加键盘快捷键
     */
    addKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                const period = this.options.periods.find(p => p.shortcut === e.key);
                if (period) {
                    e.preventDefault();
                    const tabElement = document.getElementById(`time-tab-${period.id}`);
                    this.switchPeriod(period.id, tabElement);
                }
            }
        });
    }

    /**
     * 添加无障碍功能
     */
    addAccessibilityFeatures() {
        // 为时间标签添加ARIA标签和键盘导航
        const timeFilterGroup = document.querySelector('.time-filter-group');
        if (timeFilterGroup) {
            timeFilterGroup.setAttribute('role', 'tablist');
            
            timeFilterGroup.addEventListener('keydown', (e) => {
                const tabs = Array.from(timeFilterGroup.querySelectorAll('.time-tab'));
                const currentIndex = tabs.findIndex(tab => tab === document.activeElement);
                
                switch (e.key) {
                    case 'ArrowRight':
                    case 'ArrowDown':
                        e.preventDefault();
                        const nextIndex = (currentIndex + 1) % tabs.length;
                        tabs[nextIndex].focus();
                        break;
                    case 'ArrowLeft':
                    case 'ArrowUp':
                        e.preventDefault();
                        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                        tabs[prevIndex].focus();
                        break;
                    case 'Enter':
                    case ' ':
                        e.preventDefault();
                        document.activeElement.click();
                        break;
                }
            });
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        // 移除已存在的通知
        const existingNotification = document.querySelector('.time-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `time-notification time-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * 获取周期标签
     */
    getPeriodLabel(period) {
        const periodConfig = this.options.periods.find(p => p.id === period);
        return periodConfig ? periodConfig.label : period;
    }

    /**
     * 获取周期数据配置
     */
    getPeriodData(period) {
        return {
            period: period,
            label: this.getPeriodLabel(period),
            isRealTime: period === 'day',
            cacheKey: `data_${period}_${Date.now()}`
        };
    }

    /**
     * 销毁组件
     */
    destroy() {
        this.pauseAutoRefresh();
        
        // 移除事件监听器
        document.removeEventListener('keydown', this.keyboardHandler);
        document.removeEventListener('visibilitychange', this.visibilityHandler);
        
        // 清空容器
        const container = document.getElementById(this.options.containerId);
        if (container) {
            container.innerHTML = '';
        }
    }

    /**
     * 获取当前选择的时间范围
     */
    getCurrentTimeRange() {
        if (this.currentPeriod === 'custom') {
            const startInput = document.getElementById('start-date-input');
            const endInput = document.getElementById('end-date-input');
            
            if (startInput && endInput) {
                return {
                    period: 'custom',
                    startDate: startInput.value,
                    endDate: endInput.value
                };
            }
        }
        
        return {
            period: this.currentPeriod
        };
    }

    /**
     * 设置当前周期
     */
    setCurrentPeriod(period) {
        const tabElement = document.getElementById(`time-tab-${period}`);
        if (tabElement) {
            this.switchPeriod(period, tabElement);
        }
    }
}

// 导出组件类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeSelector;
} else if (typeof window !== 'undefined') {
    window.TimeSelector = TimeSelector;
}