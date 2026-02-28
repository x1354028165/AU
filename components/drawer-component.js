/**
 * 通用抽屉组件
 * 用于显示详情信息的右侧滑出面板
 */
class DrawerComponent {
    constructor(options = {}) {
        this.containerId = options.containerId || 'drawerContainer';
        this.width = options.width || '480px';
        this.title = options.title || '详情';
        this.tabs = options.tabs || [];
        this.onClose = options.onClose || (() => {});
        this.onTabSwitch = options.onTabSwitch || (() => {});
        
        this.isOpen = false;
        this.activeTab = null;
        
        this.init();
    }
    
    init() {
        this.createDrawerHTML();
        this.bindEvents();
    }
    
    createDrawerHTML() {
        const drawerHTML = `
            <div class="drawer-overlay" id="${this.containerId}" style="display: none;">
                <div class="drawer-container" style="width: ${this.width};">
                    <div class="drawer-header">
                        <div class="drawer-back" onclick="window.drawerInstance.close()">
                            <span>←</span>
                            <span class="drawer-title">${this.title}</span>
                        </div>
                        <div class="drawer-close" onclick="window.drawerInstance.close()">✕</div>
                    </div>
                    
                    ${this.tabs.length > 0 ? `
                    <div class="drawer-tabs">
                        ${this.tabs.map((tab, index) => `
                            <div class="drawer-tab ${index === 0 ? 'active' : ''}" 
                                 onclick="window.drawerInstance.switchTab('${tab.key}', this)"
                                 data-tab="${tab.key}">
                                ${tab.label}
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                    
                    <div class="drawer-content" id="drawerContent">
                        <!-- 内容将通过 setContent 方法设置 -->
                    </div>
                </div>
            </div>
        `;
        
        // 如果容器不存在，创建并添加到body
        let container = document.getElementById(this.containerId);
        if (!container) {
            document.body.insertAdjacentHTML('beforeend', drawerHTML);
        }
        
        // 设置全局实例引用
        window.drawerInstance = this;
    }
    
    bindEvents() {
        // 点击遮罩层关闭抽屉
        const overlay = document.getElementById(this.containerId);
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.close();
                }
            });
        }
        
        // ESC键关闭抽屉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    open(data = null) {
        const overlay = document.getElementById(this.containerId);
        if (!overlay) return;

        this.isOpen = true;
        overlay.style.display = 'block';

        // 强制重排，然后添加show类实现动画
        overlay.offsetHeight;
        overlay.classList.add('show');

        // 如果有数据，设置初始标签页
        if (data && this.tabs.length > 0) {
            this.activeTab = this.tabs[0].key;
            this.setContent(data);
        }

        // 阻止body滚动
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        const overlay = document.getElementById(this.containerId);
        if (!overlay) return;
        
        this.isOpen = false;
        overlay.classList.remove('show');
        
        // 动画完成后隐藏
        setTimeout(() => {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }, 300);
        
        // 调用关闭回调
        this.onClose();
    }
    
    switchTab(tabKey, buttonElement) {
        // 更新标签按钮状态
        document.querySelectorAll('.drawer-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        buttonElement.classList.add('active');
        
        this.activeTab = tabKey;
        
        // 调用标签切换回调
        this.onTabSwitch(tabKey, this.currentData);
    }
    
    setContent(data, tabKey = null) {
        this.currentData = data;
        const contentContainer = document.getElementById('drawerContent');
        if (!contentContainer) return;

        const targetTab = tabKey || this.activeTab || (this.tabs.length > 0 ? this.tabs[0].key : 'default');

        // 根据标签页生成内容
        const content = this.generateContent(data, targetTab);
        contentContainer.innerHTML = content;
    }
    
    generateContent(data, tabKey) {
        // 子类应该重写此方法来生成具体内容
        return `<div>请在子类中实现 generateContent 方法</div>`;
    }
    
    setTitle(title) {
        const titleElement = document.querySelector('.drawer-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
    
    destroy() {
        const overlay = document.getElementById(this.containerId);
        if (overlay) {
            overlay.remove();
        }
        
        // 清理全局引用
        if (window.drawerInstance === this) {
            window.drawerInstance = null;
        }
        
        // 恢复body滚动
        document.body.style.overflow = '';
    }
}

// 导出供其他文件使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawerComponent;
}