/**
 * 通用分页组件
 * 支持多语言，样式统一
 */
class Pagination {
    constructor(options = {}) {
        this.containerId = options.containerId || 'paginationContainer';
        this.currentPage = options.currentPage || 1;
        this.pageSize = options.pageSize || 20;
        this.totalItems = options.totalItems || 0;
        this.onPageChange = options.onPageChange || (() => {});
        this.onPageSizeChange = options.onPageSizeChange || (() => {});
        this.maxVisiblePages = options.maxVisiblePages || 5;
        this.showPageSizeSelector = options.showPageSizeSelector !== false;
        this.showPageJump = options.showPageJump !== false;
        this.pageSizeOptions = options.pageSizeOptions || [10, 20, 50, 100];
        
        this.init();
    }
    
    init() {
        this.createPaginationHTML();
        this.bindEvents();
    }
    
    createPaginationHTML() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.warn(`Pagination: Container ${this.containerId} not found`);
            return;
        }
        
        const totalPages = Math.ceil(this.totalItems / this.pageSize);
        const startRecord = this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
        const endRecord = Math.min(this.currentPage * this.pageSize, this.totalItems);
        
        // 获取翻译文本
        const totalText = window.i18n ? window.i18n.getText('pagination.total') : '共';
        const itemsText = window.i18n ? window.i18n.getText('pagination.items') : '条';
        const goText = window.i18n ? window.i18n.getText('pagination.go') : 'Go';
        const prevText = window.i18n ? window.i18n.getText('pagination.prev') : '上一页';
        const nextText = window.i18n ? window.i18n.getText('pagination.next') : '下一页';
        
        // 页码选项
        const pageSizeOptionsHTML = this.pageSizeOptions.map(size => 
            `<option value="${size}" ${size === this.pageSize ? 'selected' : ''}>${size}</option>`
        ).join('');
        
        // 页码按钮
        const buttonsHTML = this.generatePageButtons(totalPages);
        
        const paginationHTML = `
            <div class="pagination-section">
                <div class="pagination-info">
                    <span>${totalText} ${this.totalItems} ${itemsText}</span>
                </div>
                <div class="pagination-controls">
                    ${this.showPageSizeSelector ? `
                    <div class="page-size-selector">
                        <select class="page-size-select" onchange="window.pagination_${this.containerId}.changePageSize(this.value)">
                            ${pageSizeOptionsHTML}
                        </select>
                    </div>
                    ` : ''}
                    <div class="pagination-buttons">
                        ${buttonsHTML}
                    </div>
                    ${this.showPageJump ? `
                    <div class="page-jump">
                        <input type="number" class="page-input" min="1" max="${totalPages}" placeholder="${goText}" 
                               onkeypress="if(event.key==='Enter') window.pagination_${this.containerId}.jumpToPage(this.value)">
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        container.innerHTML = paginationHTML;
        
        // 设置全局引用
        window[`pagination_${this.containerId}`] = this;
        
        // 添加样式
        this.addStyles();
    }
    
    generatePageButtons(totalPages) {
        let buttonsHTML = '';
        
        // 上一页按钮
        const prevDisabled = this.currentPage === 1;
        buttonsHTML += `
            <button class="page-btn ${prevDisabled ? 'disabled' : ''}" 
                    ${prevDisabled ? 'disabled' : ''} 
                    onclick="window.pagination_${this.containerId}.goToPage(${this.currentPage - 1})">
                &lt;
            </button>
        `;
        
        // 页码按钮
        const startPage = Math.max(1, this.currentPage - Math.floor(this.maxVisiblePages / 2));
        const endPage = Math.min(totalPages, startPage + this.maxVisiblePages - 1);
        const adjustedStartPage = Math.max(1, endPage - this.maxVisiblePages + 1);
        
        for (let i = adjustedStartPage; i <= endPage; i++) {
            const isActive = i === this.currentPage;
            buttonsHTML += `
                <button class="page-btn ${isActive ? 'active' : ''}" 
                        onclick="window.pagination_${this.containerId}.goToPage(${i})">
                    ${i}
                </button>
            `;
        }
        
        // 下一页按钮
        const nextDisabled = this.currentPage === totalPages || totalPages === 0;
        buttonsHTML += `
            <button class="page-btn ${nextDisabled ? 'disabled' : ''}" 
                    ${nextDisabled ? 'disabled' : ''} 
                    onclick="window.pagination_${this.containerId}.goToPage(${this.currentPage + 1})">
                &gt;
            </button>
        `;
        
        return buttonsHTML;
    }
    
    addStyles() {
        // 检查是否已有样式
        if (document.getElementById('paginationStyles')) return;
        
        const style = document.createElement('style');
        style.id = 'paginationStyles';
        style.textContent = `
            .pagination-section {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 30px 40px;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                background: rgba(255, 255, 255, 0.02);
            }
            
            .pagination-info {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.6);
            }
            
            .pagination-controls {
                display: flex;
                align-items: center;
                gap: 20px;
            }
            
            .page-size-selector {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.6);
            }
            
            .page-size-select {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.8);
                padding: 6px 12px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.3s ease;
                outline: none;
            }
            
            .page-size-select:focus {
                border-color: #00ff88;
                background: rgba(0, 255, 136, 0.05);
            }
            
            .page-size-select option {
                background: #1a1a1a;
                color: #fff;
            }
            
            .pagination-buttons {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .page-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.7);
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
                outline: none;
            }
            
            .page-btn:hover:not(:disabled):not(.disabled) {
                background: rgba(0, 255, 136, 0.1);
                color: #00ff88;
                border-color: rgba(0, 255, 136, 0.3);
            }
            
            .page-btn.active {
                background: #00ff88;
                border-color: #00ff88;
                color: #000;
                font-weight: 600;
                box-shadow: 0 2px 8px rgba(0, 255, 136, 0.3);
            }
            
            .page-btn:disabled,
            .page-btn.disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            
            .page-jump {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .page-input {
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.8);
                width: 50px;
                height: 32px;
                text-align: center;
                font-size: 13px;
                outline: none;
                transition: all 0.3s ease;
            }
            
            .page-input:focus {
                border-color: #00ff88;
                background: rgba(0, 255, 136, 0.05);
            }
            
            .page-input::placeholder {
                color: rgba(255, 255, 255, 0.4);
            }
            
            /* 响应式 */
            @media (max-width: 768px) {
                .pagination-section {
                    flex-direction: column;
                    gap: 20px;
                    align-items: stretch;
                }
                
                .pagination-controls {
                    justify-content: center;
                    flex-wrap: wrap;
                }
                
                .page-btn {
                    width: 32px;
                    height: 32px;
                    font-size: 13px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // 添加语言变化监听
        if (window.i18n) {
            window.i18n.addObserver(() => {
                this.refresh();
            });
        }
    }
    
    // 跳转到指定页面
    goToPage(page) {
        const totalPages = Math.ceil(this.totalItems / this.pageSize);
        if (page < 1 || page > totalPages || page === this.currentPage) return;
        
        this.currentPage = page;
        this.refresh();
        this.onPageChange(page, this.pageSize);
    }
    
    // 跳转到页面（输入框）
    jumpToPage(page) {
        const pageNum = parseInt(page);
        if (isNaN(pageNum)) return;
        
        this.goToPage(pageNum);
        
        // 清空输入框
        const input = document.querySelector(`#${this.containerId} .page-input`);
        if (input) input.value = '';
    }
    
    // 改变页面大小
    changePageSize(newPageSize) {
        this.pageSize = parseInt(newPageSize);
        this.currentPage = 1; // 重置到第一页
        this.refresh();
        this.onPageSizeChange(this.pageSize);
    }
    
    // 更新总数据量
    updateTotal(totalItems) {
        this.totalItems = totalItems;
        this.refresh();
    }
    
    // 刷新分页组件
    refresh() {
        this.createPaginationHTML();
    }
    
    // 获取当前分页信息
    getPageInfo() {
        return {
            currentPage: this.currentPage,
            pageSize: this.pageSize,
            totalItems: this.totalItems,
            totalPages: Math.ceil(this.totalItems / this.pageSize),
            startRecord: this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1,
            endRecord: Math.min(this.currentPage * this.pageSize, this.totalItems)
        };
    }
}

// 导出供其他文件使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pagination;
}