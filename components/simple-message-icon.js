/**
 * 简单的消息中心图标组件
 * 只负责显示图标和跳转到消息中心页面
 * 没有任何徽章、计数或其他复杂功能
 */
class SimpleMessageIcon {
    constructor() {
        this.init();
    }
    
    init() {
        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.createIcon());
        } else {
            this.createIcon();
        }
    }
    
    createIcon() {
        // 查找消息中心容器
        const messageCenter = document.querySelector('.message-center');
        if (!messageCenter) {
            console.log('Message center container not found');
            return;
        }
        
        // 清空容器并添加简单的图标
        messageCenter.innerHTML = '';
        messageCenter.style.cssText = 'cursor: pointer; padding: 8px; display: flex; align-items: center;';
        
        // 创建铃铛图标
        const icon = document.createElement('span');
        icon.style.cssText = 'font-size: 20px; color: rgba(255,255,255,0.8);';
        icon.textContent = '🔔';
        
        messageCenter.appendChild(icon);
        
        // 添加点击事件 - 只跳转到消息中心页面
        messageCenter.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'message-center.html';
        };
        
        // 移除所有其他事件监听器
        const newMessageCenter = messageCenter.cloneNode(true);
        messageCenter.parentNode.replaceChild(newMessageCenter, messageCenter);
        
        // 重新绑定点击事件
        newMessageCenter.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'message-center.html';
        };
    }
}

// 自动初始化
new SimpleMessageIcon();