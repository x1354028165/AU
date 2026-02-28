/**
 * 用户菜单组件 - 简洁版
 * 提供用户头像悬停菜单、设置和退出功能
 */
class UserMenu {
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
        
        // 设置全局引用
        window.userMenu = this;
    }
    
    injectStyles() {
        if (document.getElementById('userMenuStyles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'userMenuStyles';
        styles.innerHTML = `
            /* 用户菜单容器 */
            .user-menu-wrapper {
                position: relative;
            }
            
            /* 头像按钮 */
            .user-avatar-btn {
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
            
            .user-avatar-btn:hover {
                border-color: #00ff88;
                transform: scale(1.05);
            }
            
            .user-avatar-btn img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            /* 下拉菜单 */
            .user-dropdown-menu {
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
            
            .user-menu-wrapper:hover .user-dropdown-menu {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            /* 菜单项 */
            .menu-item {
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
            
            .menu-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .menu-item.danger:hover {
                background: rgba(255, 59, 48, 0.15);
                color: #ff3b30;
            }
            
            .menu-divider {
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 4px 0;
            }
            
            /* 设置面板 */
            .settings-panel {
                position: fixed;
                top: 0;
                right: -400px;
                width: 400px;
                height: 100%;
                background: #1a1a1a;
                border-left: 1px solid rgba(255, 255, 255, 0.1);
                z-index: 2000;
                transition: right 0.3s ease;
                overflow-y: auto;
            }
            
            .settings-panel.show {
                right: 0;
            }
            
            .settings-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1999;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .settings-backdrop.show {
                opacity: 1;
                visibility: visible;
            }
            
            .settings-header {
                padding: 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .settings-title {
                font-size: 20px;
                font-weight: 600;
                color: #fff;
            }
            
            .settings-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 24px;
                cursor: pointer;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s ease;
            }
            
            .settings-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .settings-content {
                padding: 24px;
            }
            
            .settings-section {
                margin-bottom: 32px;
            }
            
            .section-title {
                font-size: 16px;
                font-weight: 600;
                color: #fff;
                margin-bottom: 16px;
            }
            
            /* 头像上传 */
            .avatar-section {
                display: flex;
                align-items: center;
                gap: 20px;
                margin-bottom: 24px;
            }
            
            .avatar-preview {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: #333;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                font-weight: 600;
                color: #fff;
                overflow: hidden;
                border: 3px solid rgba(255, 255, 255, 0.1);
            }
            
            .avatar-preview img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .avatar-upload-btn {
                padding: 8px 16px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .avatar-upload-btn:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            
            /* 表单 */
            .form-group {
                margin-bottom: 16px;
            }
            
            .form-label {
                display: block;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 8px;
            }
            
            .form-input {
                width: 100%;
                padding: 10px 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                transition: all 0.2s ease;
            }
            
            .form-input:focus {
                outline: none;
                border-color: #00ff88;
                background: rgba(255, 255, 255, 0.08);
            }
            
            .form-input:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* 验证码 */
            .verify-group {
                display: flex;
                gap: 12px;
            }
            
            .verify-group .form-input {
                flex: 1;
            }
            
            .verify-btn {
                padding: 10px 16px;
                background: rgba(0, 255, 136, 0.1);
                border: 1px solid rgba(0, 255, 136, 0.3);
                border-radius: 8px;
                color: #00ff88;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
            }
            
            .verify-btn:hover:not(:disabled) {
                background: rgba(0, 255, 136, 0.15);
            }
            
            .verify-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* 密码输入 */
            .password-group {
                position: relative;
            }
            
            .password-toggle {
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                cursor: pointer;
                font-size: 16px;
            }
            
            .password-toggle:hover {
                color: #fff;
            }
            
            /* 按钮 */
            .btn-primary {
                width: 100%;
                padding: 12px;
                background: #00ff88;
                color: #000;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .btn-primary:hover {
                background: #00dd77;
                transform: translateY(-1px);
            }
            
            /* 退出确认 */
            .logout-confirm {
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
            
            .logout-confirm.show {
                opacity: 1;
                visibility: visible;
            }
            
            .logout-icon {
                font-size: 48px;
                margin-bottom: 16px;
            }
            
            .logout-text {
                font-size: 16px;
                color: #fff;
                margin-bottom: 24px;
            }
            
            .logout-buttons {
                display: flex;
                gap: 12px;
            }
            
            .btn-cancel {
                flex: 1;
                padding: 10px 20px;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .btn-cancel:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            
            .btn-confirm {
                flex: 1;
                padding: 10px 20px;
                background: #ff3b30;
                color: #fff;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .btn-confirm:hover {
                background: #ff2d20;
            }
            
            /* 提示 */
            .toast {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                z-index: 4000;
                transform: translateX(400px);
                transition: all 0.3s ease;
            }
            
            .toast.show {
                transform: translateX(0);
            }
            
            .toast.success {
                border-color: #00ff88;
            }
            
            .toast.error {
                border-color: #ff3b30;
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
            <div class="user-menu-wrapper">
                <div class="user-avatar-btn">
                    ${avatarContent}
                </div>
                
                <div class="user-dropdown-menu">
                    <button class="menu-item" id="settingsBtn">
                        <span>⚙️</span>
                        <span>设置</span>
                    </button>
                    <div class="menu-divider"></div>
                    <button class="menu-item danger" id="logoutBtn">
                        <span>🚪</span>
                        <span>退出</span>
                    </button>
                </div>
            </div>
            
            <!-- 设置面板 -->
            <div class="settings-backdrop" onclick="userMenu.closeSettings()"></div>
            <div class="settings-panel">
                <div class="settings-header">
                    <h3 class="settings-title">设置</h3>
                    <button class="settings-close" onclick="userMenu.closeSettings()">×</button>
                </div>
                
                <div class="settings-content">
                    <!-- 个人信息 -->
                    <div class="settings-section">
                        <h4 class="section-title">个人信息</h4>
                        
                        <div class="avatar-section">
                            <div class="avatar-preview" id="avatarPreview">
                                ${avatarContent}
                            </div>
                            <div>
                                <input type="file" id="avatarInput" accept="image/*" style="display: none;" onchange="userMenu.handleAvatarChange(event)">
                                <button class="avatar-upload-btn" onclick="document.getElementById('avatarInput').click()">
                                    上传头像
                                </button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">用户名</label>
                            <input type="text" class="form-input" id="username" value="${this.userData.name}">
                        </div>
                        
                        <button class="btn-primary" onclick="userMenu.saveProfile()">保存</button>
                    </div>
                    
                    <!-- 修改邮箱 -->
                    <div class="settings-section">
                        <h4 class="section-title">修改邮箱</h4>
                        
                        <div class="form-group">
                            <label class="form-label">当前邮箱</label>
                            <input type="email" class="form-input" value="${this.userData.email}" disabled>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">新邮箱</label>
                            <input type="email" class="form-input" id="newEmail" placeholder="请输入新邮箱">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">验证码</label>
                            <div class="verify-group">
                                <input type="text" class="form-input" id="emailCode" placeholder="请输入验证码">
                                <button class="verify-btn" id="sendCodeBtn" onclick="userMenu.sendCode()">
                                    发送验证码
                                </button>
                            </div>
                        </div>
                        
                        <button class="btn-primary" onclick="userMenu.updateEmail()">更新邮箱</button>
                    </div>
                    
                    <!-- 修改密码 -->
                    <div class="settings-section">
                        <h4 class="section-title">修改密码</h4>
                        
                        <div class="form-group">
                            <label class="form-label">原密码</label>
                            <div class="password-group">
                                <input type="password" class="form-input" id="oldPassword" placeholder="请输入原密码">
                                <button class="password-toggle" onclick="userMenu.togglePassword('oldPassword')">
                                    👁
                                </button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">新密码</label>
                            <div class="password-group">
                                <input type="password" class="form-input" id="newPassword" placeholder="请输入新密码">
                                <button class="password-toggle" onclick="userMenu.togglePassword('newPassword')">
                                    👁
                                </button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">确认密码</label>
                            <div class="password-group">
                                <input type="password" class="form-input" id="confirmPassword" placeholder="请再次输入新密码">
                                <button class="password-toggle" onclick="userMenu.togglePassword('confirmPassword')">
                                    👁
                                </button>
                            </div>
                        </div>
                        
                        <button class="btn-primary" onclick="userMenu.updatePassword()">更新密码</button>
                    </div>
                </div>
            </div>
            
            <!-- 退出确认 -->
            <div class="settings-backdrop" id="logoutBackdrop" onclick="userMenu.hideLogoutConfirm()"></div>
            <div class="logout-confirm" id="logoutConfirm">
                <div class="logout-icon">🚪</div>
                <div class="logout-text">确定要退出登录吗？</div>
                <div class="logout-buttons">
                    <button class="btn-cancel" onclick="userMenu.hideLogoutConfirm()">取消</button>
                    <button class="btn-confirm" onclick="userMenu.confirmLogout()">确定退出</button>
                </div>
            </div>
            
            <!-- 提示 -->
            <div class="toast" id="toast"></div>
        `;
    }
    
    bindEvents() {
        // 绑定设置按钮点击事件
        setTimeout(() => {
            const settingsBtn = document.getElementById('settingsBtn');
            if (settingsBtn) {
                settingsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openSettings();
                });
            }
            
            // 绑定退出按钮点击事件
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showLogoutConfirm();
                });
            }
            
            // 绑定所有需要的事件
            this.bindAllEvents();
        }, 100);
        
        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSettings();
                this.hideLogoutConfirm();
            }
        });
    }
    
    // 绑定所有内联事件
    bindAllEvents() {
        // 绑定关闭设置按钮
        const closeSettingsBtn = document.querySelector('.settings-close');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        }
        
        // 绑定背景点击关闭
        const backdrop = document.querySelector('.settings-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => this.closeSettings());
        }
        
        // 绑定保存按钮
        const saveProfileBtn = document.querySelector('.btn-primary');
        if (saveProfileBtn && saveProfileBtn.textContent === '保存') {
            saveProfileBtn.addEventListener('click', () => this.saveProfile());
        }
        
        // 绑定退出确认按钮
        const cancelBtn = document.querySelector('.btn-cancel');
        const confirmBtn = document.querySelector('.btn-confirm');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideLogoutConfirm());
        }
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmLogout());
        }
        
        // 绑定退出背景
        const logoutBackdrop = document.getElementById('logoutBackdrop');
        if (logoutBackdrop) {
            logoutBackdrop.addEventListener('click', () => this.hideLogoutConfirm());
        }
    }
    
    // 打开设置
    openSettings() {
        // 直接跳转到设置页面（使用相对路径）
        window.location.href = 'user-settings.html';
    }
    
    // 关闭设置
    closeSettings() {
        document.querySelector('.settings-backdrop').classList.remove('show');
        document.querySelector('.settings-panel').classList.remove('show');
    }
    
    // 处理头像上传
    handleAvatarChange(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const avatarData = e.target.result;
                document.getElementById('avatarPreview').innerHTML = `<img src="${avatarData}" alt="头像">`;
                this.userData.avatar = avatarData;
            };
            reader.readAsDataURL(file);
        }
    }
    
    // 保存个人信息
    saveProfile() {
        const username = document.getElementById('username').value.trim();
        
        if (!username) {
            this.showToast('用户名不能为空', 'error');
            return;
        }
        
        this.userData.name = username;
        localStorage.setItem('userName', username);
        
        if (this.userData.avatar) {
            localStorage.setItem('userAvatar', this.userData.avatar);
        }
        
        // 更新头像显示
        document.querySelector('.user-avatar-btn').innerHTML = 
            this.userData.avatar 
                ? `<img src="${this.userData.avatar}" alt="头像">` 
                : username.charAt(0).toUpperCase();
        
        this.showToast('保存成功', 'success');
    }
    
    // 发送验证码
    sendCode() {
        const btn = document.getElementById('sendCodeBtn');
        const email = document.getElementById('newEmail').value.trim();
        
        if (!email) {
            this.showToast('请先输入新邮箱', 'error');
            return;
        }
        
        btn.disabled = true;
        let countdown = 60;
        
        const timer = setInterval(() => {
            btn.textContent = `${countdown}秒后重试`;
            countdown--;
            
            if (countdown < 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.textContent = '发送验证码';
            }
        }, 1000);
        
        this.showToast('验证码已发送', 'success');
    }
    
    // 更新邮箱
    updateEmail() {
        const newEmail = document.getElementById('newEmail').value.trim();
        const code = document.getElementById('emailCode').value.trim();
        
        if (!newEmail || !code) {
            this.showToast('请填写完整信息', 'error');
            return;
        }
        
        // 模拟验证
        if (code === '123456') {
            this.userData.email = newEmail;
            localStorage.setItem('userEmail', newEmail);
            
            document.getElementById('newEmail').value = '';
            document.getElementById('emailCode').value = '';
            
            this.showToast('邮箱更新成功', 'success');
        } else {
            this.showToast('验证码错误', 'error');
        }
    }
    
    // 更新密码
    updatePassword() {
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!oldPassword || !newPassword || !confirmPassword) {
            this.showToast('请填写完整信息', 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            this.showToast('新密码至少6位', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            this.showToast('两次密码不一致', 'error');
            return;
        }
        
        // 清空表单
        document.getElementById('oldPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        this.showToast('密码更新成功', 'success');
    }
    
    // 切换密码显示
    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        input.type = input.type === 'password' ? 'text' : 'password';
    }
    
    // 显示退出确认
    showLogoutConfirm() {
        document.getElementById('logoutBackdrop').classList.add('show');
        document.getElementById('logoutConfirm').classList.add('show');
    }
    
    // 隐藏退出确认
    hideLogoutConfirm() {
        document.getElementById('logoutBackdrop').classList.remove('show');
        document.getElementById('logoutConfirm').classList.remove('show');
    }
    
    // 确认退出
    confirmLogout() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'vpp-login.html';
    }
    
    // 显示提示
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// 自动初始化
if (typeof window !== 'undefined') {
    window.UserMenu = UserMenu;
}