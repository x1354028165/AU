/**
 * 重新设计的消息中心组件
 * 修复点击移动问题，简化逻辑
 */
class MessageCenterNew {
    constructor(options = {}) {
        this.containerId = options.containerId || 'messageCenterNew';
        this.messages = [];
        this.unreadCount = 0;
        
        this.init();
    }
    
    init() {
        this.createMessageCenterHTML();
        this.bindEvents();
        this.loadMockMessages();
        this.updateMessageDisplay();
    }
    
    createMessageCenterHTML() {
        // 查找或创建消息中心容器
        let messageCenter = document.querySelector('.message-center');
        if (!messageCenter) {
            // 如果不存在，尝试在导航栏中找到位置
            const navActions = document.querySelector('.nav-actions');
            if (navActions) {
                messageCenter = document.createElement('div');
                messageCenter.className = 'message-center';
                navActions.appendChild(messageCenter);
            }
        }
        
        if (messageCenter) {
            // 清除所有现有事件监听器
            const newMessageCenter = messageCenter.cloneNode(false);
            messageCenter.parentNode.replaceChild(newMessageCenter, messageCenter);
            messageCenter = newMessageCenter;
            
            // 重新创建消息中心图标
            messageCenter.innerHTML = `
                <div class="message-icon-container">
                    <svg class="message-icon" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21"/>
                    </svg>
                    <span class="message-badge" id="messageBadge" style="display: none;">0</span>
                </div>
            `;
            
            // 保存实例引用
            const self = this;
            
            // 添加点击事件来跳转到消息中心页面
            messageCenter.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Message center clicked, navigating to message-center.html');
                
                // 清除未读计数和隐藏徽章
                self.markAllAsRead();
                
                // 跳转到消息中心页面
                window.location.href = 'message-center.html';
            });
            
            // 确保有样式
            this.addGlassEffectStyles();
        }
    }
    
    addGlassEffectStyles() {
        // 检查是否已有样式
        if (document.getElementById('messageGlassStyles')) return;
        
        const style = document.createElement('style');
        style.id = 'messageGlassStyles';
        style.textContent = `
            .message-center {
                position: relative;
                cursor: pointer;
                padding: 12px;
                border-radius: 16px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                
                /* Glass effect */
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
                
                /* Prevent any movement */
                transform-origin: center;
                will-change: transform, box-shadow;
            }
            
            .message-center:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                transform: translateY(-1px) scale(1.02);
            }
            
            .message-center:active {
                transform: translateY(0) scale(0.98);
                transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .message-icon-container {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .message-icon {
                color: rgba(255, 255, 255, 0.9);
                transition: all 0.3s ease;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
            }
            
            .message-center:hover .message-icon {
                color: rgba(255, 255, 255, 1);
                transform: scale(1.1);
            }
            
            .message-badge {
                position: absolute;
                top: -6px;
                right: -6px;
                background: linear-gradient(135deg, #ff3b30, #ff6b6b);
                color: white;
                border-radius: 12px;
                min-width: 20px;
                height: 20px;
                font-size: 11px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 6px;
                
                /* Glass effect for badge */
                border: 2px solid rgba(255, 255, 255, 0.3);
                box-shadow: 0 2px 8px rgba(255, 59, 48, 0.3), 
                           0 1px 2px rgba(0, 0, 0, 0.2);
                backdrop-filter: blur(4px);
                
                animation: messageBadgePulse 2s infinite;
                z-index: 1;
            }
            
            @keyframes messageBadgePulse {
                0%, 100% { 
                    transform: scale(1);
                    box-shadow: 0 2px 8px rgba(255, 59, 48, 0.3), 
                               0 1px 2px rgba(0, 0, 0, 0.2);
                }
                50% { 
                    transform: scale(1.1);
                    box-shadow: 0 4px 16px rgba(255, 59, 48, 0.5), 
                               0 2px 4px rgba(0, 0, 0, 0.3);
                }
            }
            
            /* Dark theme adjustments */
            body.theme-dark .message-center {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.1);
            }
            
            body.theme-dark .message-center:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
            }
        `;
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // 模拟消息更新
        setInterval(() => {
            if (Math.random() < 0.1) { // 10% 概率
                this.addNewMessage();
            }
        }, 15000); // 每15秒检查一次
    }
    
    loadMockMessages() {
        // 加载一些基础消息用于计算未读数
        this.messages = [
            {
                id: 1,
                type: 'alert',
                title: '充电提醒',
                message: '当前价格低于阈值，建议充电',
                time: new Date(Date.now() - 300000),
                read: false
            },
            {
                id: 2,
                type: 'alert', 
                title: '放电提醒',
                message: '当前价格高于阈值，建议放电',
                time: new Date(Date.now() - 600000),
                read: false
            }
        ];
    }
    
    addNewMessage() {
        const messages = [
            { title: '充电提醒', message: '当前价格有利，建议充电' },
            { title: '放电提醒', message: '当前价格较高，建议放电' },
            { title: '系统通知', message: '系统维护完成' }
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        const newMessage = {
            id: Date.now(),
            type: 'alert',
            title: randomMessage.title,
            message: randomMessage.message,
            time: new Date(),
            read: false
        };
        
        this.messages.unshift(newMessage);
        
        // 限制消息数量
        this.messages = this.messages.slice(0, 20);
        
        this.updateMessageDisplay();
    }
    
    updateMessageDisplay() {
        this.unreadCount = this.messages.filter(m => !m.read).length;
        this.updateBadge();
    }
    
    updateBadge() {
        const badge = document.getElementById('messageBadge');
        if (!badge) return;
        
        if (this.unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
    
    // 标记消息为已读
    markAsRead(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (message) {
            message.read = true;
            this.updateMessageDisplay();
        }
    }
    
    // 标记所有消息为已读
    markAllAsRead() {
        this.messages.forEach(m => m.read = true);
        this.updateMessageDisplay();
    }
    
    // 获取未读消息数
    getUnreadCount() {
        return this.unreadCount;
    }
}

// 自动初始化
document.addEventListener('DOMContentLoaded', function() {
    // 等待header-nav初始化完成后再初始化消息中心
    setTimeout(() => {
        if (document.querySelector('.message-center')) {
            window.messageCenterNew = new MessageCenterNew();
        }
    }, 100);
});

// 导出供其他文件使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageCenterNew;
}