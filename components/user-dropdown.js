/**
 * 用户下拉菜单组件
 */
class UserDropdown {
    constructor(options = {}) {
        this.containerId = options.containerId || 'userDropdownContainer';
        this.onLogout = options.onLogout || (() => {});
        this.userData = {
            name: localStorage.getItem('userName') || 'demo',
            email: localStorage.getItem('userEmail') || 'demo@example.com',
            avatar: localStorage.getItem('userAvatar') || null
        };
        
        this.verificationMethod = 'code'; // 'code' or 'password'
        this.countdownTimer = null;
        this.countdownSeconds = 60;
        
        this.init();
    }
    
    init() {
        this.render();
        this.bindEvents();
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        // 获取默认头像
        const defaultAvatar = this.getDefaultAvatar();
        const avatarSrc = this.userData.avatar || defaultAvatar;
        
        container.innerHTML = `
            <div class="user-dropdown-container">
                <div class="user-avatar-wrapper">
                    <img src="${avatarSrc}" alt="用户头像" class="user-avatar" id="headerUserAvatar" style="width: 36px; height: 36px; border-radius: 50%; cursor: pointer;">
                </div>
                <div class="user-dropdown-menu">
                    <div class="dropdown-user-name">${this.userData.name}</div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-item" onclick="userDropdown.openSettings()">
                        <span class="dropdown-item-icon">⚙️</span>
                        <span>设置</span>
                    </div>
                    <div class="dropdown-item" onclick="userDropdown.showLogoutConfirm()">
                        <span class="dropdown-item-icon">🚪</span>
                        <span>退出</span>
                    </div>
                </div>
            </div>
            
            <!-- 退出确认对话框 -->
            <div class="logout-confirm-dialog" id="logoutConfirmDialog">
                <div class="confirm-dialog-content">
                    <div class="confirm-dialog-title">确认退出</div>
                    <div class="confirm-dialog-message">您确定要退出系统吗？</div>
                    <div class="confirm-dialog-buttons">
                        <button class="confirm-btn cancel" onclick="userDropdown.hideLogoutConfirm()">取消</button>
                        <button class="confirm-btn confirm" onclick="userDropdown.confirmLogout()">确认退出</button>
                    </div>
                </div>
            </div>
            
            <!-- 设置弹窗 -->
            <div class="settings-modal" id="settingsModal">
                <div class="settings-content">
                    <div class="settings-header">
                        <h2 class="settings-title">用户设置</h2>
                        <button class="settings-close" onclick="userDropdown.closeSettings()">✕</button>
                    </div>
                    <div class="settings-body">
                        <div class="settings-tabs">
                            <button class="settings-tab active" onclick="userDropdown.switchTab('profile')">个人信息</button>
                            <button class="settings-tab" onclick="userDropdown.switchTab('email')">修改邮箱</button>
                            <button class="settings-tab" onclick="userDropdown.switchTab('password')">修改密码</button>
                        </div>
                        
                        <!-- 个人信息 -->
                        <div class="settings-section active" id="profileSection">
                            <div class="avatar-upload-section">
                                <div class="avatar-preview">
                                    <img src="${avatarSrc}" alt="头像预览" id="avatarPreview">
                                </div>
                                <div>
                                    <input type="file" id="avatarInput" accept="image/*" style="display: none;" onchange="userDropdown.handleAvatarChange(event)">
                                    <button class="avatar-upload-btn" onclick="document.getElementById('avatarInput').click()">选择头像</button>
                                    <div class="settings-hint">支持 JPG、PNG 格式，大小不超过 2MB</div>
                                </div>
                            </div>
                            
                            <div class="settings-form-group">
                                <label class="settings-label">昵称</label>
                                <input type="text" class="settings-input" id="userNameInput" value="${this.userData.name}" placeholder="请输入昵称">
                                <span class="error-message" id="nameError"></span>
                            </div>
                        </div>
                        
                        <!-- 修改邮箱 -->
                        <div class="settings-section" id="emailSection">
                            <div class="verification-method">
                                <button class="method-btn active" onclick="userDropdown.switchVerificationMethod('code')">验证码验证</button>
                                <button class="method-btn" onclick="userDropdown.switchVerificationMethod('password')">密码验证</button>
                            </div>
                            
                            <div id="emailCodeVerification">
                                <div class="settings-form-group">
                                    <label class="settings-label">当前邮箱</label>
                                    <input type="email" class="settings-input" value="${this.userData.email}" disabled>
                                </div>
                                
                                <div class="settings-form-group">
                                    <label class="settings-label">新邮箱</label>
                                    <input type="email" class="settings-input" id="newEmailInput" placeholder="请输入新邮箱">
                                    <span class="error-message" id="emailError"></span>
                                </div>
                                
                                <div class="settings-form-group">
                                    <label class="settings-label">验证码</label>
                                    <div class="verification-code-group">
                                        <input type="text" class="settings-input" id="emailCodeInput" placeholder="请输入验证码" style="flex: 1;">
                                        <button class="send-code-btn" id="sendEmailCodeBtn" onclick="userDropdown.sendVerificationCode('email')">发送验证码</button>
                                    </div>
                                    <span class="error-message" id="emailCodeError"></span>
                                </div>
                            </div>
                            
                            <div id="emailPasswordVerification" style="display: none;">
                                <div class="settings-form-group">
                                    <label class="settings-label">当前邮箱</label>
                                    <input type="email" class="settings-input" value="${this.userData.email}" disabled>
                                </div>
                                
                                <div class="settings-form-group">
                                    <label class="settings-label">新邮箱</label>
                                    <input type="email" class="settings-input" id="newEmailPasswordInput" placeholder="请输入新邮箱">
                                </div>
                                
                                <div class="settings-form-group">
                                    <label class="settings-label">登录密码</label>
                                    <input type="password" class="settings-input" id="emailPasswordInput" placeholder="请输入登录密码">
                                    <span class="error-message" id="emailPasswordError"></span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 修改密码 -->
                        <div class="settings-section" id="passwordSection">
                            <div class="settings-form-group">
                                <label class="settings-label">原密码</label>
                                <input type="password" class="settings-input" id="oldPasswordInput" placeholder="请输入原密码">
                                <span class="error-message" id="oldPasswordError"></span>
                            </div>
                            
                            <div class="settings-form-group">
                                <label class="settings-label">新密码</label>
                                <input type="password" class="settings-input" id="newPasswordInput" placeholder="请输入新密码">
                                <div class="settings-hint">密码长度 8-20 位，需包含字母和数字</div>
                                <span class="error-message" id="newPasswordError"></span>
                            </div>
                            
                            <div class="settings-form-group">
                                <label class="settings-label">确认密码</label>
                                <input type="password" class="settings-input" id="confirmPasswordInput" placeholder="请再次输入新密码">
                                <span class="error-message" id="confirmPasswordError"></span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-footer">
                        <button class="cancel-btn" onclick="userDropdown.closeSettings()">取消</button>
                        <button class="save-btn" onclick="userDropdown.saveSettings()">保存</button>
                    </div>
                </div>
            </div>
            
            <!-- 成功提示 -->
            <div class="success-message" id="successMessage"></div>
        `;
    }
    
    getDefaultAvatar() {
        // 返回一个默认头像的 data URL
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjMzMzMzMzIi8+CjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE4IiBmaWxsPSIjNjY2NjY2Ii8+CjxwYXRoIGQ9Ik0yNSA3NUMyNSA2MS4xOTI5IDM2LjE5MjkgNTAgNTAgNTBDNjMuODA3MSA1MCA3NSA2MS4xOTI5IDc1IDc1VjEwMEgyNVY3NVoiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
    }
    
    bindEvents() {
        // 关闭下拉菜单
        document.addEventListener('click', (e) => {
            const container = document.querySelector('.user-dropdown-container');
            if (container && !container.contains(e.target)) {
                // 点击外部时不自动关闭，让CSS hover处理
            }
        });
    }
    
    showLogoutConfirm() {
        const dialog = document.getElementById('logoutConfirmDialog');
        if (dialog) {
            dialog.classList.add('show');
        }
    }
    
    hideLogoutConfirm() {
        const dialog = document.getElementById('logoutConfirmDialog');
        if (dialog) {
            dialog.classList.remove('show');
        }
    }
    
    confirmLogout() {
        this.hideLogoutConfirm();
        // 清除本地存储
        localStorage.clear();
        sessionStorage.clear();
        // 调用回调函数
        this.onLogout();
        // 跳转到登录页
        window.location.href = 'vpp-login.html';
    }
    
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.add('show');
        }
    }
    
    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.remove('show');
        }
        // 清除错误提示
        document.querySelectorAll('.error-message').forEach(el => {
            el.classList.remove('show');
            el.textContent = '';
        });
    }
    
    switchTab(tab) {
        // 切换标签
        document.querySelectorAll('.settings-tab').forEach(t => {
            t.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // 切换内容
        document.querySelectorAll('.settings-section').forEach(s => {
            s.classList.remove('active');
        });
        document.getElementById(tab + 'Section').classList.add('active');
    }
    
    switchVerificationMethod(method) {
        this.verificationMethod = method;
        
        // 切换按钮状态
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // 切换内容
        if (method === 'code') {
            document.getElementById('emailCodeVerification').style.display = 'block';
            document.getElementById('emailPasswordVerification').style.display = 'none';
        } else {
            document.getElementById('emailCodeVerification').style.display = 'none';
            document.getElementById('emailPasswordVerification').style.display = 'block';
        }
    }
    
    handleAvatarChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 检查文件大小
        if (file.size > 2 * 1024 * 1024) {
            this.showError('avatarError', '图片大小不能超过2MB');
            return;
        }
        
        // 检查文件类型
        if (!file.type.startsWith('image/')) {
            this.showError('avatarError', '请选择图片文件');
            return;
        }
        
        // 预览图片
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('avatarPreview').src = e.target.result;
            // 临时存储，保存时才真正更新
            this.tempAvatar = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    sendVerificationCode(type) {
        const btn = document.getElementById('sendEmailCodeBtn');
        if (btn.disabled) return;
        
        // 获取邮箱
        const email = document.getElementById('newEmailInput').value;
        if (!email) {
            this.showError('emailError', '请输入新邮箱');
            return;
        }
        
        if (!this.validateEmail(email)) {
            this.showError('emailError', '请输入有效的邮箱地址');
            return;
        }
        
        // 模拟发送验证码
        btn.disabled = true;
        let seconds = this.countdownSeconds;
        
        const updateButton = () => {
            btn.textContent = `${seconds}秒后重试`;
            seconds--;
            
            if (seconds < 0) {
                btn.disabled = false;
                btn.textContent = '发送验证码';
                clearInterval(this.countdownTimer);
            }
        };
        
        updateButton();
        this.countdownTimer = setInterval(updateButton, 1000);
        
        // 模拟发送成功
        console.log('验证码已发送到:', email);
        this.showSuccess('验证码已发送');
    }
    
    saveSettings() {
        const activeSection = document.querySelector('.settings-section.active');
        const sectionId = activeSection.id;
        
        let isValid = true;
        
        switch (sectionId) {
            case 'profileSection':
                isValid = this.saveProfile();
                break;
            case 'emailSection':
                isValid = this.saveEmail();
                break;
            case 'passwordSection':
                isValid = this.savePassword();
                break;
        }
        
        if (isValid) {
            this.closeSettings();
            this.showSuccess('保存成功');
        }
    }
    
    saveProfile() {
        const name = document.getElementById('userNameInput').value.trim();
        
        if (!name) {
            this.showError('nameError', '请输入用户名');
            return false;
        }
        
        if (name.length < 2 || name.length > 20) {
            this.showError('nameError', '用户名长度应在2-20个字符之间');
            return false;
        }
        
        // 保存数据
        this.userData.name = name;
        localStorage.setItem('userName', name);
        
        if (this.tempAvatar) {
            this.userData.avatar = this.tempAvatar;
            localStorage.setItem('userAvatar', this.tempAvatar);
            // 更新头部头像
            document.getElementById('headerUserAvatar').src = this.tempAvatar;
        }
        
        return true;
    }
    
    saveEmail() {
        if (this.verificationMethod === 'code') {
            const newEmail = document.getElementById('newEmailInput').value.trim();
            const code = document.getElementById('emailCodeInput').value.trim();
            
            if (!newEmail) {
                this.showError('emailError', '请输入新邮箱');
                return false;
            }
            
            if (!this.validateEmail(newEmail)) {
                this.showError('emailError', '请输入有效的邮箱地址');
                return false;
            }
            
            if (!code) {
                this.showError('emailCodeError', '请输入验证码');
                return false;
            }
            
            // 模拟验证码验证（实际应调用后端API）
            if (code !== '123456') {
                this.showError('emailCodeError', '验证码错误');
                return false;
            }
            
            // 保存邮箱
            this.userData.email = newEmail;
            localStorage.setItem('userEmail', newEmail);
            
        } else {
            const newEmail = document.getElementById('newEmailPasswordInput').value.trim();
            const password = document.getElementById('emailPasswordInput').value;
            
            if (!newEmail) {
                this.showError('emailPasswordError', '请输入新邮箱');
                return false;
            }
            
            if (!this.validateEmail(newEmail)) {
                this.showError('emailPasswordError', '请输入有效的邮箱地址');
                return false;
            }
            
            if (!password) {
                this.showError('emailPasswordError', '请输入密码');
                return false;
            }
            
            // 模拟密码验证（实际应调用后端API）
            if (password !== '123456') {
                this.showError('emailPasswordError', '密码错误');
                return false;
            }
            
            // 保存邮箱
            this.userData.email = newEmail;
            localStorage.setItem('userEmail', newEmail);
        }
        
        return true;
    }
    
    savePassword() {
        const oldPassword = document.getElementById('oldPasswordInput').value;
        const newPassword = document.getElementById('newPasswordInput').value;
        const confirmPassword = document.getElementById('confirmPasswordInput').value;
        
        if (!oldPassword) {
            this.showError('oldPasswordError', '请输入原密码');
            return false;
        }
        
        if (!newPassword) {
            this.showError('newPasswordError', '请输入新密码');
            return false;
        }
        
        if (!this.validatePassword(newPassword)) {
            this.showError('newPasswordError', '密码长度8-20位，需包含字母和数字');
            return false;
        }
        
        if (newPassword !== confirmPassword) {
            this.showError('confirmPasswordError', '两次输入的密码不一致');
            return false;
        }
        
        // 模拟密码验证（实际应调用后端API）
        if (oldPassword !== '123456') {
            this.showError('oldPasswordError', '原密码错误');
            return false;
        }
        
        // 保存新密码（实际应调用后端API）
        console.log('密码已更新');
        
        return true;
    }
    
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    validatePassword(password) {
        // 8-20位，包含字母和数字
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,20}$/;
        return passwordRegex.test(password);
    }
    
    showError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        }
    }
    
    showSuccess(message) {
        const successElement = document.getElementById('successMessage');
        if (successElement) {
            successElement.textContent = message;
            successElement.classList.add('show');
            
            setTimeout(() => {
                successElement.classList.remove('show');
            }, 3000);
        }
    }
}

// 全局实例
let userDropdown = null;