// Performance optimization utilities

// Debounce function - delays function execution until after wait milliseconds have elapsed since the last time it was invoked
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        
        if (callNow) func.apply(this, args);
    };
}

// Throttle function - ensures function is called at most once per specified time period
export function throttle(func, limit) {
    let inThrottle;
    let lastFunc;
    let lastRan;
    
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            lastRan = Date.now();
            inThrottle = true;
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, Math.max(limit - (Date.now() - lastRan), 0));
        }
        
        setTimeout(() => {
            inThrottle = false;
        }, limit);
    };
}

// Request Animation Frame throttle - for smooth animations
export function rafThrottle(func) {
    let rafId = null;
    
    return function(...args) {
        if (rafId !== null) {
            return;
        }
        
        rafId = requestAnimationFrame(() => {
            func.apply(this, args);
            rafId = null;
        });
    };
}

// Lazy load external scripts
export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve(script);
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
}

// Intersection Observer for lazy loading components
export function lazyLoadComponent(element, callback, options = {}) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                callback(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, {
        rootMargin: '50px 0px',
        threshold: 0.01,
        ...options
    });
    
    observer.observe(element);
    return observer;
}

// Performance monitoring
export function measurePerformance(name, func) {
    const startTime = performance.now();
    const result = func();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
    
    // Log slow operations
    if (duration > 50) {
        console.warn(`[Performance Warning] ${name} is slow: ${duration.toFixed(2)}ms`);
    }
    
    return result;
}

// Memory-efficient data caching
export class DataCache {
    constructor(ttl = 5 * 60 * 1000, maxSize = 100) {
        this.cache = new Map();
        this.ttl = ttl;
        this.maxSize = maxSize;
    }
    
    set(key, data) {
        // Remove oldest entries if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
    
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        // Check if data is still fresh
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    has(key) {
        const cached = this.cache.get(key);
        if (!cached) return false;
        
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }
    
    clear() {
        this.cache.clear();
    }
    
    // Clean up expired entries
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

// Chart lifecycle management
export class ChartManager {
    constructor() {
        this.charts = new Map();
        this.setupCleanup();
    }
    
    register(name, chart) {
        // Dispose existing chart if any
        if (this.charts.has(name)) {
            this.dispose(name);
        }
        
        this.charts.set(name, chart);
    }
    
    get(name) {
        return this.charts.get(name);
    }
    
    dispose(name) {
        const chart = this.charts.get(name);
        if (chart && typeof chart.dispose === 'function') {
            chart.dispose();
        }
        this.charts.delete(name);
    }
    
    disposeAll() {
        for (const [name, chart] of this.charts) {
            if (chart && typeof chart.dispose === 'function') {
                chart.dispose();
            }
        }
        this.charts.clear();
    }
    
    resize(name) {
        const chart = this.charts.get(name);
        if (chart && typeof chart.resize === 'function') {
            chart.resize();
        }
    }
    
    resizeAll() {
        for (const [name, chart] of this.charts) {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        }
    }
    
    setupCleanup() {
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.disposeAll();
        });
        
        // Handle visibility change to pause/resume animations
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Pause animations or reduce update frequency
                this.pauseAnimations();
            } else {
                // Resume animations
                this.resumeAnimations();
            }
        });
    }
    
    pauseAnimations() {
        // Implementation depends on chart library
        console.log('[ChartManager] Pausing animations');
    }
    
    resumeAnimations() {
        // Implementation depends on chart library
        console.log('[ChartManager] Resuming animations');
    }
}

// Virtual Scroller for large lists
export class VirtualScroller {
    constructor(container, options = {}) {
        this.container = container;
        this.itemHeight = options.itemHeight || 50;
        this.renderItem = options.renderItem || (() => {});
        this.buffer = options.buffer || 5;
        this.items = [];
        this.scrollTop = 0;
        this.containerHeight = 0;
        
        this.init();
    }
    
    init() {
        this.container.style.position = 'relative';
        this.container.style.overflow = 'auto';
        
        // Create content container
        this.content = document.createElement('div');
        this.content.style.position = 'relative';
        this.container.appendChild(this.content);
        
        // Throttled scroll handler
        this.handleScroll = throttle(() => {
            this.scrollTop = this.container.scrollTop;
            this.render();
        }, 16);
        
        this.container.addEventListener('scroll', this.handleScroll);
        
        // Handle resize
        this.handleResize = throttle(() => {
            this.containerHeight = this.container.clientHeight;
            this.render();
        }, 250);
        
        window.addEventListener('resize', this.handleResize);
        
        // Initial measurements
        this.containerHeight = this.container.clientHeight;
    }
    
    setItems(items) {
        this.items = items;
        this.content.style.height = `${items.length * this.itemHeight}px`;
        this.render();
    }
    
    render() {
        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
        const endIndex = Math.min(
            this.items.length,
            Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + this.buffer
        );
        
        // Clear existing content
        this.content.innerHTML = '';
        
        // Render visible items
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.items[i];
            const element = this.renderItem(item, i);
            element.style.position = 'absolute';
            element.style.top = `${i * this.itemHeight}px`;
            element.style.height = `${this.itemHeight}px`;
            element.style.width = '100%';
            this.content.appendChild(element);
        }
    }
    
    destroy() {
        this.container.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);
        this.content.remove();
    }
}

// Export singleton instances
export const chartManager = new ChartManager();
export const globalCache = new DataCache();

// Auto cleanup cache periodically
setInterval(() => {
    globalCache.cleanup();
}, 60000); // Every minute