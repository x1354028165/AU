/**
 * Page Transition System v2
 * 用固定覆盖层 + 预加载消除黑屏
 */
(function() {
    var overlay;
    
    function init() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        
        // 创建覆盖层
        overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0',
            width: '100%', height: '100%',
            background: '#000',
            zIndex: '999999',
            opacity: '1',
            transition: 'opacity 0.25s ease',
            pointerEvents: 'none'
        });
        document.body.prepend(overlay);

        // 淡出覆盖层
        requestAnimationFrame(function() {
            overlay.style.opacity = '0';
            setTimeout(function() { overlay.style.display = 'none'; }, 300);
        });

        // loading 条
        var bar = document.createElement('div');
        bar.className = 'page-loading-bar';
        bar.style.width = '0%';
        document.body.prepend(bar);
        requestAnimationFrame(function() { bar.style.width = '60%'; });
        window.addEventListener('load', function() {
            bar.style.width = '100%';
            setTimeout(function() {
                bar.style.opacity = '0';
                setTimeout(function() { bar.remove(); }, 300);
            }, 200);
        });

        // 拦截 <a> 点击
        document.addEventListener('click', function(e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            var href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('javascript') || href.startsWith('mailto')) return;
            e.preventDefault();
            navigateTo(href);
        });
    }

    function navigateTo(href) {
        // 预加载
        var prefetch = document.createElement('link');
        prefetch.rel = 'prefetch';
        prefetch.href = href;
        document.head.appendChild(prefetch);
        
        if (overlay) {
            overlay.style.display = 'block';
            overlay.style.opacity = '0';
            void overlay.offsetHeight;
            overlay.style.opacity = '1';
        }

        setTimeout(function() {
            window.location.href = href;
        }, 100);
    }

    window.__navigate = navigateTo;

    // beforeunload 兜底
    window.addEventListener('beforeunload', function() {
        if (overlay) {
            overlay.style.display = 'block';
            overlay.style.opacity = '1';
        }
    });

    // 立即尝试初始化，如果 body 不存在就等 DOMContentLoaded
    init();
})();
