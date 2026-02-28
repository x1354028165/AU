/**
 * Page Transition System v2
 * 用固定覆盖层 + 预加载消除黑屏
 */
(function() {
    // 创建覆盖层（与背景同色，避免白/黑闪）
    const overlay = document.createElement('div');
    overlay.id = 'page-transition-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        background: '#000',
        zIndex: '999999',
        opacity: '1',
        transition: 'opacity 0.25s ease',
        pointerEvents: 'none'
    });
    document.body.prepend(overlay);

    // 页面加载完成后，淡出覆盖层（露出内容）
    function revealPage() {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }

    // DOM ready 就开始淡出（不等所有资源）
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        requestAnimationFrame(revealPage);
    } else {
        document.addEventListener('DOMContentLoaded', revealPage);
    }

    // 顶部 loading 条
    const bar = document.createElement('div');
    bar.className = 'page-loading-bar';
    bar.style.width = '0%';
    document.body.prepend(bar);
    requestAnimationFrame(() => { bar.style.width = '60%'; });
    window.addEventListener('load', () => {
        bar.style.width = '100%';
        setTimeout(() => {
            bar.style.opacity = '0';
            setTimeout(() => bar.remove(), 300);
        }, 200);
    });

    // 统一导航函数
    function navigateTo(href) {
        if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto')) return false;
        
        // 预加载
        const prefetch = document.createElement('link');
        prefetch.rel = 'prefetch';
        prefetch.href = href;
        document.head.appendChild(prefetch);

        // 显示覆盖层
        overlay.style.display = 'block';
        overlay.style.opacity = '0';
        void overlay.offsetHeight;
        overlay.style.opacity = '1';

        // 覆盖层盖住后再跳转
        setTimeout(() => {
            window.location.href = href;
        }, 100);
        return true;
    }

    // 暴露给全局（供 onclick="window.location.href=..." 使用）
    window.__navigate = navigateTo;

    // 拦截 <a> 点击
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('javascript') || href.startsWith('mailto')) return;
        e.preventDefault();
        navigateTo(href);
    });

    // 拦截 window.location.href 赋值
    const origDescriptor = Object.getOwnPropertyDescriptor(window, 'location') || {};
    // Proxy approach: override location.href setter won't work in all browsers
    // Instead, monkey-patch via beforeunload
    let navigating = false;
    window.addEventListener('beforeunload', () => {
        if (!navigating) {
            // 外部跳转（非我们触发的），也显示覆盖层
            overlay.style.display = 'block';
            overlay.style.opacity = '1';
        }
    });

    // Mark our own navigations
    const origNavigateTo = navigateTo;
    function navigateToTracked(href) {
        navigating = true;
        return origNavigateTo(href);
    }
    window.__navigate = navigateToTracked;
})();
