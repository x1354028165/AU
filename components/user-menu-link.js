/**
 * 用户菜单组件 - 链接版
 * 使用纯HTML链接，确保点击有效
 */
class UserMenuLink {
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
        this.bindEvents();
    }
    
    injectStyles() {
        if (document.getElementById('userMenuLinkStyles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'userMenuLinkStyles';
        styles.innerHTML = `
            .user-menu-link-wrapper {
                position: relative;
                display: inline-block;
            }
            
            .user-avatar-link {
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
            
            .user-avatar-link:hover {
                border-color: #00ff88;
                transform: scale(1.05);
            }
            
            .user-avatar-link img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .user-dropdown-link {
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
            
            .user-menu-link-wrapper:hover .user-dropdown-link {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .menu-link-item {
                display: block;
                padding: 10px 16px;
                border-radius: 8px;
                color: #fff !important;
                text-decoration: none !important;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
                transition: all 0.2s ease;
            }
            
            .menu-link-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .menu-link-button {
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
            
            .menu-link-button:hover {
                background: rgba(255, 59, 48, 0.15);
                color: #ff3b30;
            }
            
            .menu-link-divider {
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 4px 0;
            }
            
            /* 退出确认对话框 */
            .logout-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                z-index: 99999;
                display: none;
            }
            
            .logout-dialog-overlay.show {
                display: block;
            }
            
            .logout-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                padding: 32px;
                text-align: center;
                min-width: 300px;
            }
            
            .logout-dialog-icon {
                font-size: 48px;
                margin-bottom: 16px;
            }
            
            .logout-dialog-text {
                font-size: 16px;
                color: #fff;
                margin-bottom: 24px;
            }
            
            .logout-dialog-buttons {
                display: flex;
                gap: 12px;
            }
            
            .logout-dialog-btn {
                flex: 1;
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .logout-dialog-cancel {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .logout-dialog-cancel:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            
            .logout-dialog-confirm {
                background: #ff3b30;
                color: #fff;
            }
            
            .logout-dialog-confirm:hover {
                background: #ff2d20;
            }
        `;
        document.head.appendChild(styles);
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Container not found:', this.containerId);
            return;
        }
        
        const avatarContent = this.userData.avatar 
            ? `<img src="${this.userData.avatar}" alt="头像">` 
            : this.userData.name.charAt(0).toUpperCase();
        
        container.innerHTML = `
            <div class="user-menu-link-wrapper">
                <div class="user-avatar-link">
                    ${avatarContent}
                </div>
                
                <div class="user-dropdown-link">
                    <a href="user-settings.html" class="menu-link-item">
                        <span>⚙️</span>
                        <span>设置</span>
                    </a>
                    <div class="menu-link-divider"></div>
                    <button class="menu-link-button" id="logoutBtnLink">
                        <span>🚪</span>
                        <span>退出</span>
                    </button>
                </div>
            </div>
            
        `;
    }
    
    bindEvents() {
        // 退出按钮
        const logoutBtn = document.getElementById('logoutBtnLink');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.showLogoutDialog();
            });
        }
        
        // 取消按钮
        const cancelBtn = document.getElementById('logoutCancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideLogoutDialog();
            });
        }
        
        // 确认退出按钮
        const confirmBtn = document.getElementById('logoutConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.doLogout();
            });
        }
        
    }
    
    showLogoutDialog() {
        // 创建新的退出确认弹窗
        const modalHtml = `
            <div class="custom-logout-modal" id="customLogoutModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                z-index: 999999;
                display: flex;
                justify-content: center;
                align-items: center;
            ">
                <div class="custom-logout-box" style="
                    background: #1a1a1a;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    padding: 32px;
                    text-align: center;
                    min-width: 320px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                ">
                    <div style="font-size: 48px; margin-bottom: 20px;">🚪</div>
                    <div style="font-size: 18px; color: #fff; margin-bottom: 28px;">确定要退出登录吗？</div>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button id="customCancelBtn" style="
                            padding: 10px 28px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 8px;
                            color: #fff;
                            font-size: 14px;
                            cursor: pointer;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">取消</button>
                        <button id="customConfirmBtn" style="
                            padding: 10px 28px;
                            background: #ff3b30;
                            border: none;
                            border-radius: 8px;
                            color: #fff;
                            font-size: 14px;
                            cursor: pointer;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#e63329'" onmouseout="this.style.background='#ff3b30'">确定退出</button>
                    </div>
                </div>
            </div>
        `;
        
        // 添加到body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // 绑定事件
        const modal = document.getElementById('customLogoutModal');
        const cancelBtn = document.getElementById('customCancelBtn');
        const confirmBtn = document.getElementById('customConfirmBtn');
        
        // 点击取消或背景关闭
        const closeModal = () => {
            modal.remove();
        };
        
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // 点击确认退出
        confirmBtn.addEventListener('click', () => {
            this.doLogout();
        });
    }
    
    hideLogoutDialog() {
        const modal = document.getElementById('customLogoutModal');
        if (modal) {
            modal.remove();
        }
    }
    
    doLogout() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'vpp-login.html';
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.UserMenuLink = UserMenuLink;
}