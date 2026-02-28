/**
 * 告警/消息中心组件
 * 支持实时消息推送、分类显示、状态管理等功能
 */
class NotificationCenter {
    constructor(options = {}) {
        this.containerId = options.containerId || 'notificationCenter';
        this.badgeId = options.badgeId || 'messageBadge';
        this.iconId = options.iconId || 'messageIcon';
        this.maxNotifications = options.maxNotifications || 50;
        this.autoMarkReadDelay = options.autoMarkReadDelay || 3000;
        
        this.notifications = [];
        this.unreadCount = 0;
        this.isOpen = false;
        
        this.init();
        this.startSimulation(); // 模拟实时消息
    }
    
    init() {
        // 完全禁用notification-center，避免创建任何徽章
        return;
        // this.createNotificationHTML();
        // this.bindEvents();
        // this.loadMockData();
    }
    
    createNotificationHTML() {
        const notificationHTML = `
            <div class="notification-dropdown" id="${this.containerId}" style="display: none;">
                <div class="notification-header">
                    <div class="notification-title">
                        <span class="notification-icon">🔔</span>
                        <span class="notification-title-text">消息中心</span>
                        <span class="notification-count" id="notificationCount">${this.unreadCount}</span>
                    </div>
                    <div class="notification-actions">
                        <button class="notification-action-btn" onclick="window.notificationCenter.markAllAsRead()">
                            全部已读
                        </button>
                        <button class="notification-action-btn" onclick="window.notificationCenter.clearAll()">
                            清空
                        </button>
                    </div>
                </div>
                
                <div class="notification-tabs">
                    <div class="notification-tab active" onclick="window.notificationCenter.switchTab('all', this)">
                        全部 <span class="tab-count" id="allCount">0</span>
                    </div>
                    <div class="notification-tab" onclick="window.notificationCenter.switchTab('alert', this)">
                        告警 <span class="tab-count" id="alertCount">0</span>
                    </div>
                    <div class="notification-tab" onclick="window.notificationCenter.switchTab('system', this)">
                        系统 <span class="tab-count" id="systemCount">0</span>
                    </div>
                    <div class="notification-tab" onclick="window.notificationCenter.switchTab('operation', this)">
                        操作 <span class="tab-count" id="operationCount">0</span>
                    </div>
                </div>
                
                <div class="notification-content">
                    <div class="notification-list" id="notificationList">
                        <!-- 消息列表将在这里渲染 -->
                    </div>
                    <div class="notification-empty" id="notificationEmpty" style="display: none;">
                        <div class="empty-icon">📭</div>
                        <div class="empty-text">暂无消息</div>
                    </div>
                </div>
                
                <div class="notification-footer">
                    <button class="notification-footer-btn" onclick="window.notificationCenter.viewMore()">
                        查看更多
                    </button>
                </div>
            </div>
        `;
        
        // 插入到message-center元素后面
        const messageCenter = document.querySelector('.message-center');
        if (messageCenter) {
            messageCenter.insertAdjacentHTML('afterend', notificationHTML);
        }
        
        // 设置全局实例引用
        window.notificationCenter = this;
    }
    
    bindEvents() {
        // 禁用所有notification-center功能，避免干扰
        return;
        
        // 点击外部区域关闭下拉框
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.notification-dropdown') && !e.target.closest('.message-center')) {
                this.close();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    loadMockData() {
        // 加载模拟消息数据
        const mockNotifications = [
            {
                id: 1,
                type: 'alert',
                title: '电站异常告警',
                message: '电站A01检测到充电功率异常，请及时检查',
                time: new Date(Date.now() - 300000),
                read: false,
                level: 'high'
            },
            {
                id: 2,
                type: 'system',
                title: '系统维护通知',
                message: '系统将于今晚22:00-24:00进行例行维护',
                time: new Date(Date.now() - 1800000),
                read: false,
                level: 'medium'
            },
            {
                id: 3,
                type: 'operation',
                title: '操作执行完成',
                message: '充电指令已成功下发至45个电站',
                time: new Date(Date.now() - 3600000),
                read: true,
                level: 'low'
            },
            {
                id: 4,
                type: 'alert',
                title: '温度告警',
                message: '电站B12温度超过安全阈值',
                time: new Date(Date.now() - 7200000),
                read: false,
                level: 'high'
            },
            {
                id: 5,
                type: 'system',
                title: '版本更新',
                message: '系统已更新至v2.1.0，新增多项功能',
                time: new Date(Date.now() - 86400000),
                read: true,
                level: 'low'
            }
        ];
        
        this.notifications = mockNotifications;
        this.updateCounts();
        this.updateBadge();
        this.renderNotifications();
    }
    
    startSimulation() {
        // 模拟实时消息推送
        setInterval(() => {
            if (Math.random() < 0.1) { // 10% 概率生成新消息
                this.addNotification(this.generateRandomNotification());
            }
        }, 10000); // 每10秒检查一次
    }
    
    generateRandomNotification() {
        const types = ['alert', 'system', 'operation'];
        const levels = ['high', 'medium', 'low'];
        const templates = {
            alert: [
                { title: '电站异常告警', message: '电站{id}检测到异常，请及时处理' },
                { title: '温度告警', message: '电站{id}温度超过安全阈值' },
                { title: '电池告警', message: '电站{id}电池状态异常' }
            ],
            system: [
                { title: '系统通知', message: '系统将进行例行维护' },
                { title: '版本更新', message: '系统已更新到新版本' },
                { title: '配置变更', message: '系统配置已更新' }
            ],
            operation: [
                { title: '操作完成', message: '{action}指令执行完成' },
                { title: '任务完成', message: '定时任务执行成功' },
                { title: '数据同步', message: '数据同步已完成' }
            ]
        };
        
        const type = types[Math.floor(Math.random() * types.length)];
        const level = levels[Math.floor(Math.random() * levels.length)];
        const template = templates[type][Math.floor(Math.random() * templates[type].length)];
        
        const stationId = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + 
                         (Math.floor(Math.random() * 99) + 1).toString().padStart(2, '0');
        const actions = ['充电', '放电', '停止充电', '停止放电'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        
        return {
            id: Date.now(),
            type: type,
            title: template.title,
            message: template.message.replace('{id}', stationId).replace('{action}', action),
            time: new Date(),
            read: false,
            level: level
        };
    }
    
    addNotification(notification) {
        this.notifications.unshift(notification);
        
        // 限制消息数量
        if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(0, this.maxNotifications);
        }
        
        this.updateCounts();
        this.updateBadge();
        this.renderNotifications();
    }
    
    // Desktop notifications disabled
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        const dropdown = document.getElementById(this.containerId);
        if (!dropdown) return;
        
        this.isOpen = true;
        dropdown.style.display = 'block';
        
        // 强制重排，然后添加show类实现动画
        dropdown.offsetHeight;
        dropdown.classList.add('show');
        
        // 自动标记前3个未读消息为已读
        this.autoMarkVisible();
    }
    
    close() {
        const dropdown = document.getElementById(this.containerId);
        if (!dropdown) return;
        
        this.isOpen = false;
        dropdown.classList.remove('show');
        
        // 动画完成后隐藏
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 300);
    }
    
    switchTab(type, button) {
        // 更新标签按钮状态
        document.querySelectorAll('.notification-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        button.classList.add('active');
        
        this.currentTab = type;
        this.renderNotifications();
    }
    
    renderNotifications() {
        const listContainer = document.getElementById('notificationList');
        const emptyContainer = document.getElementById('notificationEmpty');
        if (!listContainer || !emptyContainer) return;
        
        const filteredNotifications = this.getFilteredNotifications();
        
        if (filteredNotifications.length === 0) {
            listContainer.style.display = 'none';
            emptyContainer.style.display = 'flex';
            return;
        }
        
        listContainer.style.display = 'block';
        emptyContainer.style.display = 'none';
        
        listContainer.innerHTML = filteredNotifications.map(notification => 
            this.renderNotificationItem(notification)
        ).join('');
    }
    
    renderNotificationItem(notification) {
        const timeString = this.formatTime(notification.time);
        const levelClass = `level-${notification.level}`;
        const typeIcon = this.getTypeIcon(notification.type);
        
        return `
            <div class="notification-item ${notification.read ? 'read' : 'unread'} ${levelClass}" 
                 data-id="${notification.id}">
                <div class="notification-item-icon">
                    ${typeIcon}
                </div>
                <div class="notification-item-content">
                    <div class="notification-item-header">
                        <div class="notification-item-title">${notification.title}</div>
                        <div class="notification-item-time">${timeString}</div>
                    </div>
                    <div class="notification-item-message">${notification.message}</div>
                    <div class="notification-item-actions">
                        ${!notification.read ? `
                            <button class="notification-item-btn" onclick="window.notificationCenter.markAsRead(${notification.id})">
                                标记已读
                            </button>
                        ` : ''}
                        <button class="notification-item-btn danger" onclick="window.notificationCenter.deleteNotification(${notification.id})">
                            删除
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    getFilteredNotifications() {
        if (!this.currentTab || this.currentTab === 'all') {
            return this.notifications;
        }
        return this.notifications.filter(n => n.type === this.currentTab);
    }
    
    getTypeIcon(type) {
        const icons = {
            alert: '⚠️',
            system: '⚙️',
            operation: '⚡'
        };
        return icons[type] || '📝';
    }
    
    formatTime(time) {
        const now = new Date();
        const diff = now - time;
        
        if (diff < 60000) { // 1分钟内
            return '刚刚';
        } else if (diff < 3600000) { // 1小时内
            return `${Math.floor(diff / 60000)}分钟前`;
        } else if (diff < 86400000) { // 24小时内
            return `${Math.floor(diff / 3600000)}小时前`;
        } else { // 超过24小时
            return time.toLocaleDateString('zh-CN');
        }
    }
    
    updateCounts() {
        const counts = {
            all: this.notifications.length,
            alert: this.notifications.filter(n => n.type === 'alert').length,
            system: this.notifications.filter(n => n.type === 'system').length,
            operation: this.notifications.filter(n => n.type === 'operation').length
        };
        
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        
        // 更新标签计数
        Object.keys(counts).forEach(type => {
            const countElement = document.getElementById(`${type}Count`);
            if (countElement) {
                countElement.textContent = counts[type];
            }
        });
        
        // 更新总计数
        const totalCountElement = document.getElementById('notificationCount');
        if (totalCountElement) {
            totalCountElement.textContent = this.unreadCount;
        }
    }
    
    updateBadge() {
        const badge = document.querySelector('.message-badge');
        if (!badge) return;
        
        if (this.unreadCount > 0) {
            badge.style.display = 'block';
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
    
    markAsRead(id) {
        const notification = this.notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            this.updateCounts();
            this.updateBadge();
            this.renderNotifications();
        }
    }
    
    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.updateCounts();
        this.updateBadge();
        this.renderNotifications();
    }
    
    deleteNotification(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.updateCounts();
        this.updateBadge();
        this.renderNotifications();
    }
    
    clearAll() {
        this.notifications = [];
        this.updateCounts();
        this.updateBadge();
        this.renderNotifications();
    }
    
    autoMarkVisible() {
        // 自动标记可见的未读消息为已读
        const visibleUnread = this.getFilteredNotifications()
            .filter(n => !n.read)
            .slice(0, 3);
            
        setTimeout(() => {
            visibleUnread.forEach(n => {
                n.read = true;
            });
            this.updateCounts();
            this.updateBadge();
            this.renderNotifications();
        }, this.autoMarkReadDelay);
    }
    
    viewMore() {
        // 跳转到完整的消息中心页面
        console.log('跳转到消息中心页面');
        this.close();
    }
    
}

// 注释掉自动初始化，避免干扰
// document.addEventListener('DOMContentLoaded', function() {
//     // 延迟初始化，确保header-nav先加载
//     setTimeout(() => {
//         if (document.querySelector('.message-center')) {
//             window.notificationCenterInstance = new NotificationCenter();
//         }
//     }, 100);
// });

// 导出供其他文件使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationCenter;
}