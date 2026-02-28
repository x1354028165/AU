// Language translations
const translations = {
    en: {
        // VPP Content
        vppTitle: "Virtual Power Plant",
        vppSubtitle: "The Future of Distributed Energy",
        // Auth Content
        signIn: "Sign In",
        createAccount: "Create Account",
        userLogin: "User Login",
        userRegister: "User Register",
        username: "Username/Email",
        password: "Password",
        nickname: "Nickname",
        account: "Account",
        email: "Email",
        confirmPassword: "Confirm Password",
        forgotPassword: "Forgot Password",
        backToLogin: "Back to login",
        submitLogin: "Login",
        submitRegister: "Submit",
        sendResetLink: "Send Reset Link",
        // Placeholders
        usernamePlaceholder: "Please enter username/email",
        passwordPlaceholder: "Please enter password",
        nicknamePlaceholder: "Please enter nickname",
        accountPlaceholder: "Please enter account",
        emailPlaceholder: "Please enter email",
        confirmPasswordPlaceholder: "Please confirm password",
        captcha: "Verification Code",
        captchaPlaceholder: "Answer",
        // Footer
        companyInfo: "System Copyright Owner: Xuheng Electronics (Shenzhen) Co., Ltd.",
        contactPhone: "Website Record: Guangdong ICP No. 2021169764",
        recordNumber: "Contact: xuheng@alwayscontrol.com.cn",
        contactEmail: "",
        // Messages
        loginSuccess: "Login successful!",
        registerSuccess: "Registration successful!",
        resetSuccess: "Reset link sent to your email.",
        passwordMismatch: "Passwords do not match",
        invalidEmail: "Please enter a valid email address",
        passwordTooShort: "Password must be at least 8 characters",
        nicknameTooShort: "Nickname must be at least 3 characters",
        accountTooShort: "Account must be at least 3 characters",
        invalidCaptcha: "Incorrect verification code",
    },
    zh: {
        // VPP Content
        vppTitle: "虚拟电厂",
        vppSubtitle: "分布式能源的未来",
        // Auth Content
        signIn: "登录",
        createAccount: "创建账户",
        userLogin: "用户登录",
        userRegister: "用户注册",
        username: "用户名/邮箱",
        password: "密码",
        nickname: "昵称",
        account: "账号",
        email: "邮箱",
        confirmPassword: "确认密码",
        forgotPassword: "忘记密码",
        backToLogin: "返回登录",
        submitLogin: "登录",
        submitRegister: "提交",
        sendResetLink: "发送重置链接",
        // Placeholders
        usernamePlaceholder: "请输入用户名/邮箱",
        passwordPlaceholder: "请输入密码",
        nicknamePlaceholder: "请输入昵称",
        accountPlaceholder: "请输入账号",
        emailPlaceholder: "请输入邮箱",
        confirmPasswordPlaceholder: "请确认密码",
        captcha: "验证码",
        captchaPlaceholder: "答案",
        // Footer
        companyInfo: "系统版权所有者：旭衡电子（深圳）有限公司",
        contactPhone: "网站备案信息：粤ICP备2021169764号",
        recordNumber: "联系方式：xuheng@alwayscontrol.com.cn",
        contactEmail: "",
        // Messages
        loginSuccess: "登录成功！",
        registerSuccess: "注册成功！",
        resetSuccess: "重置链接已发送到您的邮箱。",
        passwordMismatch: "两次密码不一致",
        invalidEmail: "请输入有效的邮箱地址",
        passwordTooShort: "密码至少需要8个字符",
        nicknameTooShort: "昵称至少需要3个字符",
        accountTooShort: "账号至少需要3个字符",
        invalidCaptcha: "验证码错误",
    }
};

// Current language
let currentLang = 'en';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Always default to English
    currentLang = 'en';
    
    // Update language switcher
    updateLanguageSwitcher();
    
    // Apply translations
    updateTranslations();
    
    // Language switcher click handler
    document.getElementById('langSwitcher').addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'zh' : 'en';
        updateLanguageSwitcher();
        updateTranslations();
    });
    
    // Form navigation
    document.getElementById('registerLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('register');
    });
    
    document.getElementById('forgotLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchForm('forgot');
    });
    
    // Back to login links
    document.querySelectorAll('.back-to-login').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchForm('login');
        });
    });
    
    // Form submissions
    document.querySelector('#loginForm .auth-form').addEventListener('submit', handleLogin);
    document.querySelector('#registerForm .auth-form').addEventListener('submit', handleRegister);
    document.querySelector('#forgotForm .auth-form').addEventListener('submit', handleForgotPassword);
});

// Update language switcher display
function updateLanguageSwitcher() {
    const langTexts = document.querySelectorAll('.lang-text');
    langTexts.forEach(text => {
        if (text.dataset.lang === currentLang) {
            text.classList.add('active');
        } else {
            text.classList.remove('active');
        }
    });
}

// Update all translations
function updateTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            element.textContent = translations[currentLang][key];
        }
    });
    
    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (translations[currentLang][key]) {
            element.placeholder = translations[currentLang][key];
        }
    });
}

// Switch between forms
function switchForm(formName) {
    document.querySelectorAll('.auth-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetForm = document.getElementById(formName + 'Form');
    if (targetForm) {
        targetForm.classList.add('active');
        
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;

    // No validation - directly login
    localStorage.setItem('userName', 'Admin User');
    localStorage.setItem('userEmail', email || 'admin@xuheng.com');
    localStorage.setItem('isLoggedIn', 'true');

    // Redirect immediately
    window.location.href = 'role-select.html';
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();
    
    const account = document.getElementById('registerAccount').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validation
    if (account.length < 3) {
        showMessage(translations[currentLang].accountTooShort || translations[currentLang].nicknameTooShort, 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showMessage(translations[currentLang].invalidEmail, 'error');
        return;
    }
    
    if (password.length < 8) {
        showMessage(translations[currentLang].passwordTooShort, 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage(translations[currentLang].passwordMismatch, 'error');
        return;
    }
    
    // Validate captcha
    if (!validateCaptcha('register')) {
        showMessage(translations[currentLang].invalidCaptcha, 'error');
        refreshCaptcha('register');
        return;
    }
    
    // Simulate API call
    try {
        await simulateApiCall();
        showMessage(translations[currentLang].registerSuccess, 'success');
        
        // Switch to login form after success
        setTimeout(() => switchForm('login'), 2000);
    } catch (error) {
        showMessage('Registration failed. Please try again.', 'error');
    }
}

// Handle forgot password
async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail').value;
    
    if (!validateEmail(email)) {
        showMessage(translations[currentLang].invalidEmail, 'error');
        return;
    }
    
    // Validate captcha
    if (!validateCaptcha('forgot')) {
        showMessage(translations[currentLang].invalidCaptcha, 'error');
        refreshCaptcha('forgot');
        return;
    }
    
    // Simulate API call
    try {
        await simulateApiCall();
        showMessage(translations[currentLang].resetSuccess, 'success');
        
        // Switch back to login after success
        setTimeout(() => switchForm('login'), 3000);
    } catch (error) {
        showMessage('Failed to send reset link. Please try again.', 'error');
    }
}

// Email validation
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Simulate API call
function simulateApiCall() {
    return new Promise((resolve) => {
        setTimeout(resolve, 1000);
    });
}

// Show message
function showMessage(message, type) {
    // Remove existing message
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
        position: fixed;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        animation: slideDown 0.3s ease;
        ${type === 'success' ? 
            'background: #52c41a; color: #fff;' : 
            'background: #ff4d4f; color: #fff;'}
    `;
    
    document.body.appendChild(messageEl);
    
    // Remove after 3 seconds
    setTimeout(() => {
        messageEl.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => messageEl.remove(), 300);
    }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translate(-50%, -20px);
        }
        to {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    }
    
    @keyframes slideUp {
        from {
            opacity: 1;
            transform: translate(-50%, 0);
        }
        to {
            opacity: 0;
            transform: translate(-50%, -20px);
        }
    }
`;
document.head.appendChild(style);

// Captcha functionality
const captchaData = {
    login: { num1: 0, num2: 0, answer: 0 },
    register: { num1: 0, num2: 0, answer: 0 },
    forgot: { num1: 0, num2: 0, answer: 0 }
};

function generateCaptcha(formType) {
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    let num1, num2, answer;
    
    switch(operation) {
        case '+':
            num1 = Math.floor(Math.random() * 50) + 1;
            num2 = Math.floor(Math.random() * 50) + 1;
            answer = num1 + num2;
            break;
        case '-':
            num1 = Math.floor(Math.random() * 50) + 20;
            num2 = Math.floor(Math.random() * num1);
            answer = num1 - num2;
            break;
        case '*':
            num1 = Math.floor(Math.random() * 10) + 1;
            num2 = Math.floor(Math.random() * 10) + 1;
            answer = num1 * num2;
            break;
    }
    
    captchaData[formType] = { num1, num2, answer, operation };
    return `${num1} ${operation} ${num2} = ?`;
}

function refreshCaptcha(formType) {
    const questionEl = document.getElementById(`${formType}CaptchaQuestion`);
    const answerEl = document.getElementById(`${formType}CaptchaAnswer`);
    
    if (questionEl) {
        questionEl.textContent = generateCaptcha(formType);
        if (answerEl) {
            answerEl.value = '';
        }
    }
}

function validateCaptcha(formType) {
    const answerEl = document.getElementById(`${formType}CaptchaAnswer`);
    const userAnswer = parseInt(answerEl.value);
    return userAnswer === captchaData[formType].answer;
}

// Initialize captchas on page load
document.addEventListener('DOMContentLoaded', () => {
    refreshCaptcha('login');
    refreshCaptcha('register');
    refreshCaptcha('forgot');
});