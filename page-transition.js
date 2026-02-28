/**
 * Page Transition System v3
 * 骨架屏 + prefetch预加载 + 导航栏持久化
 */
(function() {
    // ===== 1. 立即注入骨架屏样式（在 <head> 中执行，不等 body） =====
    var style = document.createElement('style');
    style.textContent = `
        #page-transition-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 999999; opacity: 1;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        #page-transition-overlay.hidden { opacity: 0; }

        .skeleton-screen {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 999998; display: none;
        }
        .skeleton-screen.active { display: block; }

        /* 骨架导航栏 */
        .sk-nav {
            height: 56px; background: rgba(255,255,255,0.03);
            display: flex; align-items: center; padding: 0 24px; gap: 32px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sk-nav .sk-logo { width: 120px; height: 24px; background: rgba(0,255,136,0.15); border-radius: 4px; }
        .sk-nav .sk-link { width: 60px; height: 16px; background: rgba(255,255,255,0.06); border-radius: 4px; }
        .sk-nav .sk-link.active { background: rgba(0,255,136,0.2); }

        /* 骨架内容区 */
        .sk-content { padding: 88px 24px 24px; }
        .sk-title { width: 200px; height: 32px; background: rgba(255,255,255,0.06); border-radius: 6px; margin-bottom: 24px; }
        .sk-cards { display: flex; gap: 16px; margin-bottom: 24px; }
        .sk-card { flex: 1; height: 80px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); }
        .sk-table { background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); }
        .sk-row { height: 48px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .sk-row:last-child { border-bottom: none; }

        /* 脉冲动画 */
        .sk-pulse { animation: skPulse 1.5s ease-in-out infinite; }
        @keyframes skPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
        }

        /* 顶部进度条 */
        .page-loading-bar {
            position: fixed; top: 0; left: 0; height: 2px;
            background: linear-gradient(90deg, #00ff88, #00cc6a);
            z-index: 1000000; transition: width 0.4s ease;
            box-shadow: 0 0 8px rgba(0,255,136,0.4);
        }
    `;
    document.head.appendChild(style);

    var overlay, skeleton, prefetchedPages = {};

    function createSkeleton() {
        skeleton = document.createElement('div');
        skeleton.className = 'skeleton-screen';
        skeleton.innerHTML = `
            <div class="sk-nav sk-pulse">
                <div class="sk-logo"></div>
                <div class="sk-link active"></div>
                <div class="sk-link"></div>
                <div class="sk-link"></div>
                <div class="sk-link"></div>
            </div>
            <div class="sk-content">
                <div class="sk-title sk-pulse"></div>
                <div class="sk-cards sk-pulse">
                    <div class="sk-card"></div>
                    <div class="sk-card"></div>
                    <div class="sk-card"></div>
                    <div class="sk-card"></div>
                    <div class="sk-card"></div>
                </div>
                <div class="sk-table sk-pulse">
                    <div class="sk-row"></div>
                    <div class="sk-row"></div>
                    <div class="sk-row"></div>
                    <div class="sk-row"></div>
                    <div class="sk-row"></div>
                    <div class="sk-row"></div>
                    <div class="sk-row"></div>
                </div>
            </div>
        `;
        document.body.appendChild(skeleton);
    }

    function init() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // 创建覆盖层
        overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';
        document.body.prepend(overlay);

        createSkeleton();

        // 淡出覆盖层（页面已加载）
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                overlay.classList.add('hidden');
                setTimeout(function() { overlay.style.display = 'none'; }, 250);
            });
        });

        // 进度条
        var bar = document.createElement('div');
        bar.className = 'page-loading-bar';
        bar.style.width = '0%';
        document.body.prepend(bar);
        requestAnimationFrame(function() { bar.style.width = '70%'; });
        window.addEventListener('load', function() {
            bar.style.width = '100%';
            setTimeout(function() {
                bar.style.opacity = '0';
                setTimeout(function() { bar.remove(); }, 200);
            }, 150);
        });

        // ===== 2. Prefetch：悬停菜单时预加载 =====
        document.addEventListener('mouseover', function(e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            var href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('javascript')) return;
            if (prefetchedPages[href]) return;
            prefetchedPages[href] = true;
            var pf = document.createElement('link');
            pf.rel = 'prefetch';
            pf.href = href;
            document.head.appendChild(pf);
        });

        // ===== 3. 拦截导航点击 =====
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
        // 立刻显示骨架屏
        if (skeleton) {
            skeleton.classList.add('active');
        }

        // 同时预加载
        if (!prefetchedPages[href]) {
            var pf = document.createElement('link');
            pf.rel = 'prefetch';
            pf.href = href;
            document.head.appendChild(pf);
        }

        // 50ms 后跳转（让骨架屏先显示）
        setTimeout(function() {
            window.location.href = href;
        }, 50);
    }

    window.__navigate = navigateTo;

    // beforeunload 兜底
    window.addEventListener('beforeunload', function() {
        if (skeleton) skeleton.classList.add('active');
    });

    // ===== 4. 页面可见时预加载所有菜单页面 =====
    window.addEventListener('load', function() {
        setTimeout(function() {
            var links = document.querySelectorAll('a[href$=".html"]');
            links.forEach(function(a) {
                var h = a.getAttribute('href');
                if (h && !prefetchedPages[h] && !h.startsWith('http')) {
                    prefetchedPages[h] = true;
                    var pf = document.createElement('link');
                    pf.rel = 'prefetch';
                    pf.href = h;
                    document.head.appendChild(pf);
                }
            });
        }, 2000); // 2秒后开始预加载，不影响当前页加载
    });

    init();
})();
