/**
 * 用户菜单组件 - 极简版
 * 只包含下拉菜单，设置跳转到独立页面
 */
class UserMenuSimple {
    constructor(options = {}) {
        this.containerId = options.containerId || 'userDropdownContainer';
        this.userData = {
            name: localStorage.getItem('userName') || '用户',
            email: localStorage.getItem('userEmail') || 'user@example.com',
            avatar: localStorage.getItem('userAvatar') || null
        };
        
        this.init();
    }
    
    init() {
        this.injectStyles();
        this.render();
        
        // 设置全局引用
        window.userMenuSimple = this;
    }
    
    injectStyles() {
        if (document.getElementById('userMenuSimpleStyles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'userMenuSimpleStyles';
        styles.innerHTML = `
            /* 用户菜单容器 */
            .user-menu-simple {
                position: relative;
            }
            
            /* 头像按钮 */
            .user-avatar-simple {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: #333;
                color: #fff;
                border: 2px solid transparent;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                font-weight: 600;
                overflow: hidden;
                transition: all 0.3s ease;
            }
            
            .user-avatar-simple:hover {
                border-color: #00ff88;
                transform: scale(1.05);
            }
            
            .user-avatar-simple img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            /* 下拉菜单 */
            .user-dropdown-simple {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background: rgba(20, 20, 20, 0.98);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 8px;
                min-width: 180px;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-10px);
                transition: all 0.2s ease;
                z-index: 1000;
                backdrop-filter: blur(10px);
            }
            
            .user-menu-simple:hover .user-dropdown-simple {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            /* 菜单项 */
            .menu-item-simple {
                padding: 10px 16px;
                border-radius: 8px;
                cursor: pointer;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 10px;
                background: none;
                border: none;
                width: 100%;
                text-align: left;
                font-size: 14px;
                transition: all 0.2s ease;
            }
            
            .menu-item-simple:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .menu-item-simple.danger:hover {
                background: rgba(255, 59, 48, 0.15);
                color: #ff3b30;
            }
            
            .menu-divider-simple {
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 4px 0;
            }
            
            /* 退出确认 */
            .logout-confirm-simple {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                padding: 24px;
                z-index: 3000;
                text-align: center;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .logout-confirm-simple.show {
                opacity: 1;
                visibility: visible;
            }
            
            .logout-backdrop-simple {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2999;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .logout-backdrop-simple.show {
                opacity: 1;
                visibility: visible;
            }
            
            .logout-icon-simple {
                font-size: 48px;
                margin-bottom: 16px;
            }
            
            .logout-text-simple {
                font-size: 16px;
                color: #fff;
                margin-bottom: 24px;
            }
            
            .logout-buttons-simple {
                display: flex;
                gap: 12px;
            }
            
            .btn-simple {
                flex: 1;
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .btn-cancel-simple {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .btn-cancel-simple:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            
            .btn-confirm-simple {
                background: #ff3b30;
                color: #fff;
            }
            
            .btn-confirm-simple:hover {
                background: #ff2d20;
            }
        `;
        document.head.appendChild(styles);
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        const avatarContent = this.userData.avatar 
            ? `<img src="${this.userData.avatar}" alt="头像">` 
            : this.userData.name.charAt(0).toUpperCase();
        
        container.innerHTML = `
            <div class="user-menu-simple">
                <div class="user-avatar-simple">
                    ${avatarContent}
                </div>
                
                <div class="user-dropdown-simple">
                    <button class="menu-item-simple" onclick="userMenuSimple.goToSettings()">
                        <span>⚙️</span>
                        <span>设置</span>
                    </button>
                    <div class="menu-divider-simple"></div>
                    <button class="menu-item-simple danger" onclick="userMenuSimple.showLogoutConfirm()">
                        <span>🚪</span>
                        <span>退出</span>
                    </button>
                </div>
            </div>
            
            <!-- 退出确认 -->
            <div class="logout-backdrop-simple" onclick="userMenuSimple.hideLogoutConfirm()"></div>
            <div class="logout-confirm-simple">
                <div class="logout-icon-simple">🚪</div>
                <div class="logout-text-simple">确定要退出登录吗？</div>
                <div class="logout-buttons-simple">
                    <button class="btn-simple btn-cancel-simple" onclick="userMenuSimple.hideLogoutConfirm()">取消</button>
                    <button class="btn-simple btn-confirm-simple" onclick="userMenuSimple.confirmLogout()">确定退出</button>
                </div>
            </div>
        `;
    }
    
    // 跳转到设置页面
    goToSettings() {
        window.location.href = 'user-settings.html';
    }
    
    // 显示退出确认
    showLogoutConfirm() {
        document.querySelector('.logout-backdrop-simple').classList.add('show');
        document.querySelector('.logout-confirm-simple').classList.add('show');
    }
    
    // 隐藏退出确认
    hideLogoutConfirm() {
        document.querySelector('.logout-backdrop-simple').classList.remove('show');
        document.querySelector('.logout-confirm-simple').classList.remove('show');
    }
    
    // 确认退出
    confirmLogout() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'vpp-login.html';
    }
}

// 自动初始化
if (typeof window !== 'undefined') {
    window.UserMenuSimple = UserMenuSimple;
}