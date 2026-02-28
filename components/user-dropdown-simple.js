/**
 * 用户下拉菜单组件 - 简化版
 */
class UserDropdownSimple {
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
        this.render();
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Container not found:', this.containerId);
            return;
        }
        
        // 创建样式
        if (!document.getElementById('userDropdownSimpleStyles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'userDropdownSimpleStyles';
            styleSheet.innerHTML = `
                .user-dropdown-wrapper {
                    position: relative;
                    display: inline-block;
                }
                
                .user-avatar-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: #333;
                    color: #fff;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    overflow: hidden;
                }
                
                .user-avatar-btn img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                
                .dropdown-content {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 8px;
                    background: rgba(20, 20, 20, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    padding: 8px;
                    min-width: 160px;
                    display: none;
                    z-index: 1000;
                }
                
                .user-dropdown-wrapper:hover .dropdown-content {
                    display: block;
                }
                
                .dropdown-item {
                    padding: 10px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: none;
                    border: none;
                    width: 100%;
                    text-align: left;
                    font-size: 14px;
                }
                
                .dropdown-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                
                /* 简单的设置弹窗 */
                .simple-settings-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #1a1a1a;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 16px;
                    padding: 24px;
                    width: 400px;
                    z-index: 2000;
                    display: none;
                    color: #fff;
                }
                
                .simple-settings-modal.show {
                    display: block;
                }
                
                .settings-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    z-index: 1999;
                    display: none;
                }
                
                .settings-backdrop.show {
                    display: block;
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .modal-title {
                    font-size: 20px;
                    font-weight: 600;
                    color: #fff;
                }
                
                .close-button {
                    background: none;
                    border: none;
                    color: #fff;
                    font-size: 24px;
                    cursor: pointer;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                
                .close-button:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                
                .form-group {
                    margin-bottom: 16px;
                }
                
                .form-label {
                    display: block;
                    margin-bottom: 6px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 14px;
                }
                
                .form-input {
                    width: 100%;
                    padding: 10px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                }
                
                .form-input:focus {
                    outline: none;
                    border-color: #00ff88;
                }
                
                .save-button {
                    background: #00ff88;
                    color: #000;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    width: 100%;
                    margin-top: 10px;
                }
                
                .save-button:hover {
                    background: #00dd77;
                }
            `;
            document.head.appendChild(styleSheet);
        }
        
        // 头像内容
        const avatarContent = this.userData.avatar 
            ? `<img src="${this.userData.avatar}" alt="头像">` 
            : this.userData.name.charAt(0).toUpperCase();
        
        // 渲染HTML
        container.innerHTML = `
            <div class="user-dropdown-wrapper">
                <button class="user-avatar-btn" title="${this.userData.name}">
                    ${avatarContent}
                </button>
                <div class="dropdown-content">
                    <button class="dropdown-item" onclick="userDropdownSimple.openSettings()">
                        <span>⚙️</span>
                        <span>设置</span>
                    </button>
                    <div style="height: 1px; background: rgba(255, 255, 255, 0.1); margin: 4px 0;"></div>
                    <button class="dropdown-item" onclick="userDropdownSimple.logout()">
                        <span>🚪</span>
                        <span>退出</span>
                    </button>
                </div>
            </div>
            
            <!-- 背景遮罩 -->
            <div class="settings-backdrop" id="settingsBackdrop" onclick="userDropdownSimple.closeSettings()"></div>
            
            <!-- 设置弹窗 -->
            <div class="simple-settings-modal" id="simpleSettingsModal">
                <div class="modal-header">
                    <h3 class="modal-title">用户设置</h3>
                    <button class="close-button" onclick="userDropdownSimple.closeSettings()">×</button>
                </div>
                
                <div class="form-group">
                    <label class="form-label">用户名</label>
                    <input type="text" class="form-input" id="usernameInput" value="${this.userData.name}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">邮箱</label>
                    <input type="email" class="form-input" id="emailInput" value="${this.userData.email}">
                </div>
                
                <button class="save-button" onclick="userDropdownSimple.saveSettings()">保存设置</button>
            </div>
        `;
    }
    
    openSettings() {
        // 直接跳转到设置页面
        window.location.href = 'user-settings.html';
    }
    
    closeSettings() {
        document.getElementById('settingsBackdrop').classList.remove('show');
        document.getElementById('simpleSettingsModal').classList.remove('show');
    }
    
    saveSettings() {
        const username = document.getElementById('usernameInput').value;
        const email = document.getElementById('emailInput').value;
        
        if (username && email) {
            this.userData.name = username;
            this.userData.email = email;
            
            localStorage.setItem('userName', username);
            localStorage.setItem('userEmail', email);
            
            alert('设置已保存！');
            this.closeSettings();
            
            // 重新渲染
            this.render();
        }
    }
    
    logout() {
        if (confirm('确定要退出登录吗？')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'vpp-login.html';
        }
    }
}

// 全局实例
let userDropdownSimple = null;