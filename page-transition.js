/**
 * Page Transition System
 * 解决菜单切换闪屏问题
 */
(function() {
    // 1. 页面加载时的顶部 loading 条
    const bar = document.createElement('div');
    bar.className = 'page-loading-bar';
    bar.style.width = '0%';
    document.body.prepend(bar);
    
    // 快速推进到 70%
    requestAnimationFrame(() => { bar.style.width = '70%'; });
    
    // 页面加载完成后推到 100% 然后消失
    window.addEventListener('load', () => {
        bar.style.width = '100%';
        setTimeout(() => {
            bar.style.opacity = '0';
            setTimeout(() => bar.remove(), 300);
        }, 200);
    });

    // 2. 拦截导航链接，添加淡出动画
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        // 只处理本站 HTML 页面链接
        if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('javascript')) return;
        if (!href.endsWith('.html')) return;
        
        e.preventDefault();
        
        // 淡出当前页面
        document.body.style.transition = 'opacity 0.15s ease';
        document.body.style.opacity = '0';
        
        setTimeout(() => {
            window.location.href = href;
        }, 150);
    });

    // 3. 页面载入时淡入
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.2s ease';
        document.body.style.opacity = '1';
    });
})();
