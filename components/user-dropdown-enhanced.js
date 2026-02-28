/**
 * 增强版用户下拉菜单组件
 * 包含完整的设置和退出功能
 */
class UserDropdownEnhanced {
    constructor(options = {}) {
        this.containerId = options.containerId || 'userDropdownContainer';
        this.onLogout = options.onLogout || (() => window.location.href = 'vpp-login.html');
        
        // 用户数据
        this.userData = {
            name: localStorage.getItem('userName') || 'demo',
            email: localStorage.getItem('userEmail') || 'user@example.com',
            avatar: localStorage.getItem('userAvatar') || null
        };
        
        // 状态
        this.isDropdownOpen = false;
        this.isSettingsOpen = false;
        this.countdownTimer = null;
        
        this.init();
    }
    
    init() {
        this.injectStyles();
        this.render();
        this.bindEvents();
    }
    
    injectStyles() {
        if (document.getElementById('userDropdownEnhancedStyles')) return;
        
        const styleSheet = document.createElement('style');
        styleSheet.id = 'userDropdownEnhancedStyles';
        styleSheet.innerHTML = `
            /* 用户下拉菜单容器 */
            .user-dropdown-enhanced {
                position: relative;
                display: inline-block;
            }
            
            /* 用户头像按钮 */
            .user-avatar-enhanced {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: linear-gradient(135deg, #333, #444);
                color: #fff;
                border: 2px solid rgba(255, 255, 255, 0.1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                font-weight: 600;
                overflow: hidden;
                transition: all 0.3s ease;
            }
            
            .user-avatar-enhanced:hover {
                border-color: #00ff88;
                transform: scale(1.05);
                box-shadow: 0 0 12px rgba(0, 255, 136, 0.3);
            }
            
            .user-avatar-enhanced img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            /* 下拉菜单 */
            .dropdown-menu-enhanced {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 12px;
                background: rgba(26, 26, 26, 0.98);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 8px;
                min-width: 200px;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-10px);
                transition: all 0.3s ease;
                z-index: 9999 !important;
                backdrop-filter: blur(20px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            }
            
            .user-dropdown-enhanced:hover .dropdown-menu-enhanced {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) !important;
            }
            
            /* 强制显示调试 */
            .dropdown-menu-enhanced.debug-show {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) !important;
            }
            
            /* 用户信息区 */
            .user-info-enhanced {
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 8px;
            }
            
            .user-name-enhanced {
                font-size: 16px;
                font-weight: 600;
                color: #fff;
                margin-bottom: 4px;
            }
            
            .user-email-enhanced {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.6);
                word-break: break-all;
            }
            
            /* 菜单项 */
            .dropdown-item-enhanced {
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
            
            .dropdown-item-enhanced:hover {
                background: rgba(255, 255, 255, 0.08);
                transform: translateX(2px);
            }
            
            .dropdown-item-enhanced.danger:hover {
                background: rgba(255, 59, 48, 0.1);
                color: #ff3b30;
            }
            
            /* 设置弹窗 */
            .settings-modal-enhanced {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(10px);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .settings-modal-enhanced.show {
                opacity: 1;
                visibility: visible;
            }
            
            .settings-content-enhanced {
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow: hidden;
                transform: scale(0.9);
                transition: all 0.3s ease;
            }
            
            .settings-modal-enhanced.show .settings-content-enhanced {
                transform: scale(1);
            }
            
            .settings-header-enhanced {
                padding: 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .settings-title-enhanced {
                font-size: 20px;
                font-weight: 600;
                color: #fff;
            }
            
            .close-btn-enhanced {
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
                transition: all 0.3s ease;
            }
            
            .close-btn-enhanced:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .settings-body-enhanced {
                padding: 24px;
                max-height: calc(90vh - 140px);
                overflow-y: auto;
            }
            
            /* 标签页 */
            .settings-tabs-enhanced {
                display: flex;
                gap: 8px;
                margin-bottom: 24px;
                padding: 4px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
            }
            
            .tab-btn-enhanced {
                flex: 1;
                padding: 10px 16px;
                background: none;
                border: none;
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.6);
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .tab-btn-enhanced:hover {
                color: #fff;
            }
            
            .tab-btn-enhanced.active {
                background: #00ff88;
                color: #000;
            }
            
            .tab-content-enhanced {
                display: none;
            }
            
            .tab-content-enhanced.active {
                display: block;
                animation: fadeIn 0.3s ease;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            /* 表单元素 */
            .form-group-enhanced {
                margin-bottom: 20px;
            }
            
            .form-label-enhanced {
                display: block;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 8px;
            }
            
            .form-input-enhanced {
                width: 100%;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                transition: all 0.3s ease;
            }
            
            .form-input-enhanced:focus {
                outline: none;
                border-color: #00ff88;
                background: rgba(255, 255, 255, 0.08);
            }
            
            /* 头像上传区 */
            .avatar-upload-enhanced {
                display: flex;
                align-items: center;
                gap: 20px;
                margin-bottom: 24px;
            }
            
            .avatar-preview-enhanced {
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
            
            .avatar-preview-enhanced img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .upload-btn-enhanced {
                padding: 8px 16px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .upload-btn-enhanced:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
            }
            
            /* 验证码区域 */
            .verification-row-enhanced {
                display: flex;
                gap: 12px;
                align-items: flex-end;
            }
            
            .verification-row-enhanced .form-group-enhanced {
                flex: 1;
                margin-bottom: 0;
            }
            
            .verification-btn-enhanced {
                padding: 12px 20px;
                background: rgba(0, 255, 136, 0.1);
                border: 1px solid rgba(0, 255, 136, 0.3);
                border-radius: 8px;
                color: #00ff88;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
                white-space: nowrap;
            }
            
            .verification-btn-enhanced:hover:not(:disabled) {
                background: rgba(0, 255, 136, 0.15);
                border-color: rgba(0, 255, 136, 0.5);
            }
            
            .verification-btn-enhanced:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* 保存按钮 */
            .save-btn-enhanced {
                width: 100%;
                padding: 12px;
                background: #00ff88;
                color: #000;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .save-btn-enhanced:hover {
                background: #00dd77;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
            }
            
            /* 退出确认弹窗 */
            .logout-confirm-enhanced {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                padding: 24px;
                z-index: 3000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                text-align: center;
                min-width: 300px;
            }
            
            .logout-confirm-enhanced.show {
                opacity: 1;
                visibility: visible;
                transform: translate(-50%, -50%) scale(1);
            }
            
            .logout-icon-enhanced {
                font-size: 48px;
                margin-bottom: 16px;
            }
            
            .logout-text-enhanced {
                font-size: 16px;
                color: #fff;
                margin-bottom: 24px;
            }
            
            .logout-buttons-enhanced {
                display: flex;
                gap: 12px;
            }
            
            .logout-btn-enhanced {
                flex: 1;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                border: none;
            }
            
            .logout-btn-cancel {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .logout-btn-cancel:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            
            .logout-btn-confirm {
                background: #ff3b30;
                color: #fff;
            }
            
            .logout-btn-confirm:hover {
                background: #ff2d20;
            }
            
            /* 提示消息 */
            .toast-enhanced {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 16px 20px;
                background: #1a1a1a;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                z-index: 4000;
                transform: translateX(400px);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .toast-enhanced.show {
                transform: translateX(0);
            }
            
            .toast-enhanced.success {
                border-color: rgba(0, 255, 136, 0.3);
                background: rgba(0, 255, 136, 0.1);
            }
            
            .toast-enhanced.error {
                border-color: rgba(255, 59, 48, 0.3);
                background: rgba(255, 59, 48, 0.1);
            }
            
            /* 密码可见性切换 */
            .password-input-group {
                position: relative;
            }
            
            .toggle-password-enhanced {
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                cursor: pointer;
                padding: 4px;
                font-size: 18px;
            }
            
            .toggle-password-enhanced:hover {
                color: #fff;
            }
            
            /* 滚动条样式 */
            .settings-body-enhanced::-webkit-scrollbar {
                width: 8px;
            }
            
            .settings-body-enhanced::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
            }
            
            .settings-body-enhanced::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            
            .settings-body-enhanced::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }
        `;
        document.head.appendChild(styleSheet);
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('UserDropdownEnhanced: Container not found:', this.containerId);
            return;
        }
        
        const avatarContent = this.userData.avatar 
            ? `<img src="${this.userData.avatar}" alt="头像">` 
            : this.userData.name.charAt(0).toUpperCase();
        
        container.innerHTML = `
            <div class="user-dropdown-enhanced">
                <div class="user-avatar-enhanced" title="${this.userData.name}">
                    ${avatarContent}
                </div>
                
                <div class="dropdown-menu-enhanced">
                    <div class="user-info-enhanced">
                        <div class="user-name-enhanced">${this.userData.name}</div>
                    </div>
                    
                    <button class="dropdown-item-enhanced" onclick="userDropdownEnhanced.openSettings()">
                        <span>⚙️</span>
                        <span>设置</span>
                    </button>
                    
                    <button class="dropdown-item-enhanced danger" onclick="userDropdownEnhanced.showLogoutConfirm()">
                        <span>🚪</span>
                        <span>退出</span>
                    </button>
                </div>
            </div>
            
            <!-- 设置弹窗 -->
            <div class="settings-modal-enhanced" id="settingsModalEnhanced">
                <div class="settings-content-enhanced">
                    <div class="settings-header-enhanced">
                        <h3 class="settings-title-enhanced">用户设置</h3>
                        <button class="close-btn-enhanced" onclick="userDropdownEnhanced.closeSettings()">×</button>
                    </div>
                    
                    <div class="settings-body-enhanced">
                        <!-- 标签页 -->
                        <div class="settings-tabs-enhanced">
                            <button class="tab-btn-enhanced active" onclick="userDropdownEnhanced.switchTab('profile')">个人信息</button>
                            <button class="tab-btn-enhanced" onclick="userDropdownEnhanced.switchTab('email')">修改邮箱</button>
                            <button class="tab-btn-enhanced" onclick="userDropdownEnhanced.switchTab('password')">修改密码</button>
                        </div>
                        
                        <!-- 个人信息 -->
                        <div class="tab-content-enhanced active" id="profileTab">
                            <div class="avatar-upload-enhanced">
                                <div class="avatar-preview-enhanced" id="avatarPreviewEnhanced">
                                    ${avatarContent}
                                </div>
                                <div>
                                    <input type="file" id="avatarInputEnhanced" accept="image/*" style="display: none;" onchange="userDropdownEnhanced.handleAvatarChange(event)">
                                    <button class="upload-btn-enhanced" onclick="document.getElementById('avatarInputEnhanced').click()">
                                        上传头像
                                    </button>
                                    <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 8px;">
                                        支持 JPG、PNG 格式
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-group-enhanced">
                                <label class="form-label-enhanced">用户名</label>
                                <input type="text" class="form-input-enhanced" id="usernameEnhanced" value="${this.userData.name}">
                            </div>
                            
                            <button class="save-btn-enhanced" onclick="userDropdownEnhanced.saveProfile()">保存信息</button>
                        </div>
                        
                        <!-- 修改邮箱 -->
                        <div class="tab-content-enhanced" id="emailTab">
                            <div class="form-group-enhanced">
                                <label class="form-label-enhanced">当前邮箱</label>
                                <input type="email" class="form-input-enhanced" value="${this.userData.email}" disabled>
                            </div>
                            
                            <div class="form-group-enhanced">
                                <label class="form-label-enhanced">新邮箱</label>
                                <input type="email" class="form-input-enhanced" id="newEmailEnhanced" placeholder="请输入新邮箱">
                            </div>
                            
                            <div class="verification-row-enhanced">
                                <div class="form-group-enhanced">
                                    <label class="form-label-enhanced">验证码</label>
                                    <input type="text" class="form-input-enhanced" id="emailCodeEnhanced" placeholder="请输入验证码">
                                </div>
                                <button class="verification-btn-enhanced" id="sendEmailCodeBtn" onclick="userDropdownEnhanced.sendEmailCode()">
                                    发送验证码
                                </button>
                            </div>
                            
                            <button class="save-btn-enhanced" onclick="userDropdownEnhanced.updateEmail()">更新邮箱</button>
                        </div>
                        
                        <!-- 修改密码 -->
                        <div class="tab-content-enhanced" id="passwordTab">
                            <div class="form-group-enhanced">
                                <label class="form-label-enhanced">原密码</label>
                                <div class="password-input-group">
                                    <input type="password" class="form-input-enhanced" id="oldPasswordEnhanced" placeholder="请输入原密码">
                                    <button class="toggle-password-enhanced" onclick="userDropdownEnhanced.togglePassword('oldPasswordEnhanced')">
                                        👁
                                    </button>
                                </div>
                            </div>
                            
                            <div class="form-group-enhanced">
                                <label class="form-label-enhanced">新密码</label>
                                <div class="password-input-group">
                                    <input type="password" class="form-input-enhanced" id="newPasswordEnhanced" placeholder="请输入新密码">
                                    <button class="toggle-password-enhanced" onclick="userDropdownEnhanced.togglePassword('newPasswordEnhanced')">
                                        👁
                                    </button>
                                </div>
                            </div>
                            
                            <div class="form-group-enhanced">
                                <label class="form-label-enhanced">确认密码</label>
                                <div class="password-input-group">
                                    <input type="password" class="form-input-enhanced" id="confirmPasswordEnhanced" placeholder="请再次输入新密码">
                                    <button class="toggle-password-enhanced" onclick="userDropdownEnhanced.togglePassword('confirmPasswordEnhanced')">
                                        👁
                                    </button>
                                </div>
                            </div>
                            
                            <button class="save-btn-enhanced" onclick="userDropdownEnhanced.updatePassword()">更新密码</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 退出确认弹窗 -->
            <div class="logout-confirm-enhanced" id="logoutConfirmEnhanced">
                <div class="logout-icon-enhanced">🚪</div>
                <div class="logout-text-enhanced">确定要退出登录吗？</div>
                <div class="logout-buttons-enhanced">
                    <button class="logout-btn-enhanced logout-btn-cancel" onclick="userDropdownEnhanced.hideLogoutConfirm()">取消</button>
                    <button class="logout-btn-enhanced logout-btn-confirm" onclick="userDropdownEnhanced.confirmLogout()">确定退出</button>
                </div>
            </div>
            
            <!-- Toast提示 -->
            <div class="toast-enhanced" id="toastEnhanced"></div>
        `;
    }
    
    bindEvents() {
        // 点击外部关闭设置弹窗
        document.getElementById('settingsModalEnhanced').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModalEnhanced') {
                this.closeSettings();
            }
        });
    }
    
    // 打开设置
    openSettings() {
        document.getElementById('settingsModalEnhanced').classList.add('show');
    }
    
    // 关闭设置
    closeSettings() {
        document.getElementById('settingsModalEnhanced').classList.remove('show');
    }
    
    // 切换标签页
    switchTab(tab) {
        // 更新标签按钮状态
        document.querySelectorAll('.tab-btn-enhanced').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // 切换内容
        document.querySelectorAll('.tab-content-enhanced').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tab + 'Tab').classList.add('active');
    }
    
    // 处理头像上传
    handleAvatarChange(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                this.showToast('头像文件不能超过 5MB', 'error');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const avatarData = e.target.result;
                document.getElementById('avatarPreviewEnhanced').innerHTML = `<img src="${avatarData}" alt="头像">`;
                this.userData.avatar = avatarData;
            };
            reader.readAsDataURL(file);
        }
    }
    
    // 保存个人信息
    saveProfile() {
        const username = document.getElementById('usernameEnhanced').value.trim();
        
        if (!username) {
            this.showToast('用户名不能为空', 'error');
            return;
        }
        
        this.userData.name = username;
        localStorage.setItem('userName', username);
        
        if (this.userData.avatar) {
            localStorage.setItem('userAvatar', this.userData.avatar);
        }
        
        // 更新显示
        this.updateDisplay();
        this.showToast('个人信息已保存', 'success');
    }
    
    // 发送邮箱验证码
    sendEmailCode() {
        const btn = document.getElementById('sendEmailCodeBtn');
        const newEmail = document.getElementById('newEmailEnhanced').value.trim();
        
        if (!newEmail) {
            this.showToast('请先输入新邮箱', 'error');
            return;
        }
        
        if (!this.validateEmail(newEmail)) {
            this.showToast('请输入有效的邮箱地址', 'error');
            return;
        }
        
        // 模拟发送验证码
        btn.disabled = true;
        let countdown = 60;
        
        const updateCountdown = () => {
            btn.textContent = `${countdown}秒后重试`;
            countdown--;
            
            if (countdown < 0) {
                clearInterval(this.countdownTimer);
                btn.disabled = false;
                btn.textContent = '发送验证码';
            }
        };
        
        updateCountdown();
        this.countdownTimer = setInterval(updateCountdown, 1000);
        
        this.showToast('验证码已发送到您的邮箱', 'success');
    }
    
    // 更新邮箱
    updateEmail() {
        const newEmail = document.getElementById('newEmailEnhanced').value.trim();
        const code = document.getElementById('emailCodeEnhanced').value.trim();
        
        if (!newEmail || !code) {
            this.showToast('请填写所有字段', 'error');
            return;
        }
        
        if (!this.validateEmail(newEmail)) {
            this.showToast('请输入有效的邮箱地址', 'error');
            return;
        }
        
        // 模拟验证码验证
        if (code === '123456') {
            this.userData.email = newEmail;
            localStorage.setItem('userEmail', newEmail);
            
            // 清空表单
            document.getElementById('newEmailEnhanced').value = '';
            document.getElementById('emailCodeEnhanced').value = '';
            
            // 更新显示
            this.updateDisplay();
            this.showToast('邮箱已更新', 'success');
        } else {
            this.showToast('验证码错误', 'error');
        }
    }
    
    // 更新密码
    updatePassword() {
        const oldPassword = document.getElementById('oldPasswordEnhanced').value;
        const newPassword = document.getElementById('newPasswordEnhanced').value;
        const confirmPassword = document.getElementById('confirmPasswordEnhanced').value;
        
        if (!oldPassword || !newPassword || !confirmPassword) {
            this.showToast('请填写所有密码字段', 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            this.showToast('新密码长度至少为6位', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            this.showToast('两次输入的密码不一致', 'error');
            return;
        }
        
        // 模拟密码更新
        // 清空表单
        document.getElementById('oldPasswordEnhanced').value = '';
        document.getElementById('newPasswordEnhanced').value = '';
        document.getElementById('confirmPasswordEnhanced').value = '';
        
        this.showToast('密码已更新', 'success');
    }
    
    // 切换密码可见性
    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        input.type = input.type === 'password' ? 'text' : 'password';
    }
    
    // 显示退出确认
    showLogoutConfirm() {
        document.getElementById('logoutConfirmEnhanced').classList.add('show');
    }
    
    // 隐藏退出确认
    hideLogoutConfirm() {
        document.getElementById('logoutConfirmEnhanced').classList.remove('show');
    }
    
    // 确认退出
    confirmLogout() {
        this.showToast('正在退出...', 'success');
        setTimeout(() => {
            localStorage.clear();
            sessionStorage.clear();
            this.onLogout();
        }, 1000);
    }
    
    // 显示提示消息
    showToast(message, type = 'success') {
        const toast = document.getElementById('toastEnhanced');
        const icon = type === 'success' ? '✅' : '❌';
        
        toast.className = `toast-enhanced ${type}`;
        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    // 验证邮箱格式
    validateEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }
    
    // 更新显示
    updateDisplay() {
        // 更新下拉菜单中的用户信息
        document.querySelector('.user-name-enhanced').textContent = this.userData.name;
        document.querySelector('.user-email-enhanced').textContent = this.userData.email;
        
        // 更新头像
        const avatarContent = this.userData.avatar 
            ? `<img src="${this.userData.avatar}" alt="头像">` 
            : this.userData.name.charAt(0).toUpperCase();
        
        document.querySelector('.user-avatar-enhanced').innerHTML = avatarContent;
    }
}

// 创建全局实例
let userDropdownEnhanced = null;