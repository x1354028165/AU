/**
 * 简洁用户下拉菜单组件
 */
class UserDropdownSimpleNew {
    constructor(options = {}) {
        this.containerId = options.containerId || 'userDropdownContainer';
        this.container = null;
        this.init();
    }
    
    init() {
        this.render();
        this.bindEvents();
        this.updateTranslations();
        
        // Listen for language changes
        document.addEventListener('languageChanged', () => {
            this.updateTranslations();
        });
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        this.container = container;
        container.innerHTML = `
            <div class="user-dropdown-simple-new">
                <div class="user-avatar-simple-new">
                    <img src="https://i.pravatar.cc/150?img=1" alt="用户头像" class="avatar-img">
                </div>
                
                <div class="dropdown-menu-simple-new">
                    <div class="dropdown-user-name-simple-new">demo</div>
                    <div class="dropdown-divider-simple-new"></div>
                    <div class="dropdown-item-simple-new" data-action="settings">
                        <span class="dropdown-icon-simple-new">⚙️</span>
                        <span data-i18n-key="common.settings">设置</span>
                    </div>
                    <div class="dropdown-item-simple-new" data-action="logout">
                        <span class="dropdown-icon-simple-new">🚪</span>
                        <span data-i18n-key="common.logout">退出</span>
                    </div>
                </div>
            </div>
            
            <!-- 退出确认弹窗 -->
            <div class="logout-confirm-simple-new" id="logoutConfirmSimpleNew">
                <div class="logout-confirm-content-simple-new">
                    <div class="logout-confirm-title-simple-new" data-i18n-key="common.confirmLogout">确认退出</div>
                    <div class="logout-confirm-message-simple-new" data-i18n-key="common.confirmLogoutMsg">您确定要退出系统吗？</div>
                    <div class="logout-confirm-buttons-simple-new">
                        <button class="logout-btn-cancel-simple-new" data-action="cancel" data-i18n-key="common.cancel">取消</button>
                        <button class="logout-btn-confirm-simple-new" data-action="confirm" data-i18n-key="common.confirmLogout">确认退出</button>
                    </div>
                </div>
            </div>
        `;
        
        this.injectStyles();
    }
    
    injectStyles() {
        if (document.getElementById('userDropdownSimpleNewStyles')) return;
        
        const style = document.createElement('style');
        style.id = 'userDropdownSimpleNewStyles';
        style.textContent = `
            /* 用户下拉菜单容器 */
            .user-dropdown-simple-new {
                position: relative;
                display: inline-block;
            }
            
            /* 用户头像 */
            .user-avatar-simple-new {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .avatar-img {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
            }
            
            .user-avatar-simple-new:hover {
                transform: scale(1.05);
            }
            
            /* 下拉菜单 */
            .dropdown-menu-simple-new {
                position: absolute;
                top: calc(100% + 8px);
                right: 0;
                background: rgba(0, 0, 0, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 8px;
                min-width: 180px;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-10px);
                transition: all 0.3s ease;
                z-index: 9999;
                backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            }
            
            .user-dropdown-simple-new:hover .dropdown-menu-simple-new {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            /* 用户名显示 */
            .dropdown-user-name-simple-new {
                padding: 12px 16px;
                text-align: center;
                font-size: 14px;
                font-weight: 500;
                color: #fff;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                margin-bottom: 4px;
            }
            
            /* 分割线 */
            .dropdown-divider-simple-new {
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 4px 0;
            }
            
            /* 菜单项 */
            .dropdown-item-simple-new {
                padding: 12px 16px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 12px;
                color: rgba(255, 255, 255, 0.9);
                font-size: 14px;
            }
            
            .dropdown-item-simple-new:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .dropdown-icon-simple-new {
                width: 16px;
                height: 16px;
                opacity: 0.8;
            }
            
            /* 退出确认弹窗 */
            .logout-confirm-simple-new {
                position: fixed;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.8);
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 99999 !important;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
                margin: 0 !important;
                padding: 0 !important;
            }
            
            .logout-confirm-simple-new.show {
                opacity: 1;
                visibility: visible;
            }
            
            .logout-confirm-content-simple-new {
                background: rgba(20, 20, 20, 0.98);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 32px;
                max-width: 400px;
                width: 90%;
                max-width: 350px;
                min-width: 300px;
                text-align: center;
                backdrop-filter: blur(20px);
                transform: scale(0.9);
                transition: transform 0.3s ease;
                position: relative;
                margin: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
            }
            
            .logout-confirm-simple-new.show .logout-confirm-content-simple-new {
                transform: scale(1);
            }
            
            .logout-confirm-title-simple-new {
                font-size: 20px;
                font-weight: 600;
                color: #fff;
                margin-bottom: 12px;
            }
            
            .logout-confirm-message-simple-new {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 24px;
            }
            
            .logout-confirm-buttons-simple-new {
                display: flex;
                gap: 12px;
                justify-content: center;
            }
            
            .logout-btn-cancel-simple-new {
                padding: 10px 24px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.9);
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .logout-btn-cancel-simple-new:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
            }
            
            .logout-btn-confirm-simple-new {
                padding: 10px 24px;
                border-radius: 8px;
                border: none;
                background: #ff4444;
                color: #fff;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .logout-btn-confirm-simple-new:hover {
                background: #ff3333;
                transform: translateY(-1px);
            }
        `;
        
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // 使用事件委托处理点击事件
        document.addEventListener('click', (e) => {
            const dropdownItem = e.target.closest('.dropdown-item-simple-new');
            if (dropdownItem) {
                const action = dropdownItem.getAttribute('data-action');
                e.preventDefault();
                e.stopPropagation();
                
                if (action === 'settings') {
                    this.openSettings();
                } else if (action === 'logout') {
                    this.showLogoutConfirm();
                }
                return;
            }
            
            // 处理弹窗按钮
            if (e.target.closest('.logout-btn-cancel-simple-new')) {
                e.preventDefault();
                this.hideLogoutConfirm();
                return;
            }
            
            if (e.target.closest('.logout-btn-confirm-simple-new')) {
                e.preventDefault();
                this.confirmLogout();
                return;
            }
        });
    }
    
    openSettings() {
        // 跳转到设置页面
        window.location.href = 'user-settings.html';
    }
    
    showLogoutConfirm() {
        const dialog = document.getElementById('logoutConfirmSimpleNew');
        if (dialog) {
            // 确保弹窗在最顶层
            dialog.style.position = 'fixed';
            dialog.style.top = '0';
            dialog.style.left = '0';
            dialog.style.width = '100vw';
            dialog.style.height = '100vh';
            dialog.style.zIndex = '99999';
            dialog.style.display = 'flex';
            dialog.style.alignItems = 'center';
            dialog.style.justifyContent = 'center';
            
            dialog.classList.add('show');
        } else {
            console.error('Logout confirm dialog not found');
        }
    }
    
    hideLogoutConfirm() {
        const dialog = document.getElementById('logoutConfirmSimpleNew');
        if (dialog) {
            dialog.classList.remove('show');
        }
    }
    
    confirmLogout() {
        this.hideLogoutConfirm();
        // 清除本地存储
        localStorage.clear();
        sessionStorage.clear();
        // 跳转到登录页
        window.location.href = 'vpp-login.html';
    }
    
    updateTranslations() {
        if (!window.i18n || !this.container) return;
        
        // Update dropdown menu items
        const settingsText = this.container.querySelector('[data-i18n-key="common.settings"]');
        if (settingsText) {
            settingsText.textContent = window.i18n.getText('common.settings');
        }
        
        const logoutText = this.container.querySelector('[data-i18n-key="common.logout"]');
        if (logoutText) {
            logoutText.textContent = window.i18n.getText('common.logout');
        }
        
        // Update logout confirmation dialog
        const confirmTitle = document.querySelector('[data-i18n-key="common.confirmLogout"]');
        if (confirmTitle) {
            confirmTitle.textContent = window.i18n.getText('common.confirmLogout');
        }
        
        const confirmMessage = document.querySelector('[data-i18n-key="common.confirmLogoutMsg"]');
        if (confirmMessage) {
            confirmMessage.textContent = window.i18n.getText('common.confirmLogoutMsg');
        }
        
        const cancelBtn = document.querySelector('[data-i18n-key="common.cancel"]');
        if (cancelBtn) {
            cancelBtn.textContent = window.i18n.getText('common.cancel');
        }
        
        const confirmBtn = document.querySelector('.logout-btn-confirm-simple-new[data-i18n-key="common.confirmLogout"]');
        if (confirmBtn) {
            confirmBtn.textContent = window.i18n.getText('common.confirmLogout');
        }
    }
}

// 全局实例
let userDropdownSimpleNew = null;