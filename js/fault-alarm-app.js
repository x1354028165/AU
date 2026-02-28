
        // ==================== Data ====================
        let allAlarms = [];
        let filteredAlarms = [];
        let currentTab = 'unprocessed';
        let currentPage = 1;
        let pageSize = 100;
        let sortField = 'time';
        let sortOrder = 'desc';

        // Mock alarm data
        function generateMockAlarms() {
            const descriptions = ['总压高', '绝缘低', '单体压差大', '单体电压高', '温度过高', 'SOC过低', '通信中断', '过流告警'];
            const levels = ['alarm', 'fault'];
            const levelNames = { alarm: '告警', fault: '故障' };
            const devices = ['BMS', 'PCS', 'EMS', 'METER'];
            const stations = ['Logistics Distribution', 'Solar Farm Alpha', 'Battery Station Beta', 'Grid Hub Gamma'];
            const statuses = ['unprocessed', 'processed'];
            const statusNames = { unprocessed: '未处理', processed: '已处理' };

            const alarms = [];
            const now = new Date();
            let idCounter = 1;

            // Generate 4 unprocessed alarms (matching the screenshot)
            for (let i = 0; i < 4; i++) {
                alarms.push({
                    id: idCounter++,
                    time: new Date(2026, 1, 5, 11, 50, 0), // 2026-02-05 11:50:00
                    timezone: 'UTC+10:00',
                    description: descriptions[i],
                    level: 'alarm',
                    levelName: '告警',
                    device: 'BMS',
                    station: 'Logistics Distribution',
                    status: 'unprocessed',
                    statusName: '未处理',
                    recoveryTime: null,
                    selected: false
                });
            }

            // Generate 20 processed alarms with varied data
            for (let i = 0; i < 20; i++) {
                const alarmTime = new Date(2026, 1, 5 - Math.floor(i / 5), 10 - (i % 5), 30 + (i % 4) * 10, 0);
                const recoveryTime = new Date(alarmTime.getTime() + (30 + Math.random() * 90) * 60000); // 30-120 minutes later
                const descIndex = i % descriptions.length;
                const levelIndex = i % 2;
                const deviceIndex = i % devices.length;
                const stationIndex = i % stations.length;

                alarms.push({
                    id: idCounter++,
                    time: alarmTime,
                    timezone: 'UTC+10:00',
                    description: descriptions[descIndex],
                    level: levels[levelIndex],
                    levelName: levelNames[levels[levelIndex]],
                    device: devices[deviceIndex],
                    station: stations[stationIndex],
                    status: 'processed',
                    statusName: '已处理',
                    recoveryTime: recoveryTime,
                    selected: false
                });
            }

            return alarms;
        }

        // ==================== Filter Functions ====================
        function clearFilters() {
            document.getElementById('stationFilter').selectedIndex = 0;
            document.getElementById('levelFilter').selectedIndex = 0;
            document.getElementById('startDate').value = '';
            document.getElementById('endDate').value = '';
        }

        function searchAlarms() {
            applyFilters();
            renderTable();
            updateCounts();
        }

        function applyFilters() {
            const station = document.getElementById('stationFilter').value;
            const level = document.getElementById('levelFilter').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;

            filteredAlarms = allAlarms.filter(alarm => {
                // 角色过滤：运维方只看自己电站的故障
                if (window._operatorStationFilter && !window._operatorStationFilter.includes(alarm.station)) return false;
                
                // Status filter by current tab
                if (currentTab !== 'all' && alarm.status !== currentTab) return false;

                // Level filter
                if (level && alarm.level !== level) return false;

                // Station filter
                if (station && alarm.station !== station) return false;

                // Date range filter
                if (startDate) {
                    const start = new Date(startDate);
                    if (alarm.time < start) return false;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    if (alarm.time > end) return false;
                }

                return true;
            });

            // Sort
            sortAlarms();
        }

        function sortAlarms() {
            filteredAlarms.sort((a, b) => {
                let valA, valB;
                if (sortField === 'time') {
                    valA = a.time.getTime();
                    valB = b.time.getTime();
                } else if (sortField === 'recoveryTime') {
                    valA = a.recoveryTime ? a.recoveryTime.getTime() : 0;
                    valB = b.recoveryTime ? b.recoveryTime.getTime() : 0;
                }
                return sortOrder === 'asc' ? valA - valB : valB - valA;
            });
        }

        function sortTable(field) {
            if (sortField === field) {
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortOrder = 'desc';
            }

            // Update sort icons
            document.querySelectorAll('.sort-icon').forEach(icon => {
                icon.textContent = '⇅';
                icon.classList.remove('active');
            });
            const activeIcon = document.getElementById(`sort-${field}`);
            if (activeIcon) {
                activeIcon.textContent = sortOrder === 'asc' ? '▲' : '▼';
                activeIcon.classList.add('active');
            }

            sortAlarms();
            renderTable();
        }

        // ==================== Tab Functions ====================
        function updateActionButtons() {
            const selectAllWrapper = document.getElementById('selectAllWrapper');
            const btnBatchProcess = document.getElementById('btnBatchProcess');
            const btnExport = document.getElementById('btnExport');
            const btnMarkProcessed = document.getElementById('btnMarkProcessed');
            const btnMarkUnprocessed = document.getElementById('btnMarkUnprocessed');

            if (currentTab === 'unprocessed') {
                // 未处理：显示"全选"、"一键处理"和"导出"
                selectAllWrapper.style.display = 'flex';
                btnBatchProcess.style.display = 'block';
                btnExport.style.display = 'block';
                btnMarkProcessed.style.display = 'none';
                btnMarkUnprocessed.style.display = 'none';
            } else if (currentTab === 'processed') {
                // 已处理：显示"全选"和"导出"
                selectAllWrapper.style.display = 'flex';
                btnBatchProcess.style.display = 'none';
                btnExport.style.display = 'block';
                btnMarkProcessed.style.display = 'none';
                btnMarkUnprocessed.style.display = 'none';
            }
        }

        function switchStatusTab(btn, status) {
            document.querySelectorAll('.status-tab').forEach(tab => tab.classList.remove('active'));
            btn.classList.add('active');
            currentTab = status;
            currentPage = 1;

            // 重置全选复选框
            const selectAllBtn = document.getElementById('selectAllBtn');
            if (selectAllBtn) selectAllBtn.checked = false;

            updateActionButtons();
            applyFilters();
            renderTable();
        }

        // ==================== Table Rendering ====================
        function formatAlarmTime(date, timezone) {
            if (!date) return '--';
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const tz = timezone || 'UTC+10:00';
            return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}(${tz})`;
        }

        function getLevelHTML(level) {
            const dotClass = level === 'alarm' ? 'warning' : 'danger';
            const i18nKey = `faultAlarm.levels.${level}`;
            const defaultNames = { alarm: '告警', fault: '故障' };
            const name = (window.i18n && window.i18n.getText(i18nKey) !== i18nKey) ? window.i18n.getText(i18nKey) : defaultNames[level];
            return `<span class="alarm-level"><span class="alarm-level-dot ${dotClass}"></span>${name}</span>`;
        }

        function getStatusHTML(status) {
            const dotClass = status === 'unprocessed' ? 'unprocessed' : 'processed';
            const i18nKey = `faultAlarm.status.${status}`;
            const defaultNames = { unprocessed: '未处理', processed: '已处理' };
            const name = (window.i18n && window.i18n.getText(i18nKey) !== i18nKey) ? window.i18n.getText(i18nKey) : defaultNames[status];
            return `<span class="alarm-status"><span class="alarm-status-dot ${dotClass}"></span>${name}</span>`;
        }

        function renderTable() {
            const tbody = document.getElementById('alarmTableBody');
            if (!tbody) return;

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filteredAlarms.length);
            const pageData = filteredAlarms.slice(startIndex, endIndex);

            if (pageData.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 60px 20px; color: var(--color-text-secondary);">
                            <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.4;">📭</div>
                            <div data-i18n="faultAlarm.noData">暂无数据</div>
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = pageData.map(alarm => `
                    <tr>
                        <td class="checkbox-col">
                            <input type="checkbox" ${alarm.selected ? 'checked' : ''} onchange="toggleSelect(${alarm.id}, this.checked)">
                        </td>
                        <td>${formatAlarmTime(alarm.time, alarm.timezone)}</td>
                        <td>${alarm.station}</td>
                        <td>${alarm.device}</td>
                        <td>${alarm.description}</td>
                        <td>${getLevelHTML(alarm.level)}</td>
                        <td>${getStatusHTML(alarm.status)}</td>
                        <td>${alarm.recoveryTime ? formatAlarmTime(alarm.recoveryTime) : '--'}</td>
                        <td>
                            <div class="action-btns-container">
                                ${(alarm.status === 'unprocessed' && (localStorage.getItem('userRole') || 'operator') === 'owner') ? '<button class="btn-resolve-inline" onclick="resolveAlarmFromDetail(' + alarm.id + ')" data-i18n="faultAlarm.buttons.resolve">处理</button>' : ''}
                                <button class="btn-detail" onclick="showAlarmDetail(${alarm.id})" data-i18n="faultAlarm.buttons.detail">详情</button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }

            updatePagination();
            updateSelectAllCheckbox();
        }

        // ==================== Selection ====================
        function selectAllCurrentPage(checked) {
            // 全选复选框：选中/取消所有页面的数据
            filteredAlarms.forEach(alarm => {
                alarm.selected = checked;
            });
            renderTable();
            updateSelectAllCheckbox();
        }

        function toggleSelectAll(checkbox) {
            // 表头复选框：仅选中当前页
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filteredAlarms.length);
            for (let i = startIndex; i < endIndex; i++) {
                filteredAlarms[i].selected = checkbox.checked;
            }
            renderTable();
        }

        function toggleSelect(id, checked) {
            const alarm = allAlarms.find(a => a.id === id);
            if (alarm) alarm.selected = checked;

            // Update select-all checkbox (只反映当前页状态)
            updateSelectAllCheckbox();
        }

        function updateSelectAllCheckbox() {
            // 更新表头的当前页全选复选框
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, filteredAlarms.length);
            const pageData = filteredAlarms.slice(startIndex, endIndex);
            const allPageSelected = pageData.length > 0 && pageData.every(a => a.selected);
            const selectAllCheckbox = document.getElementById('selectAll');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allPageSelected;
            }

            // 更新操作栏的全选复选框（所有页）
            const allAlarmsSelected = filteredAlarms.length > 0 && filteredAlarms.every(a => a.selected);
            const selectAllBtn = document.getElementById('selectAllBtn');
            if (selectAllBtn) {
                selectAllBtn.checked = allAlarmsSelected;
            }
        }

        // ==================== Alarm Detail ====================
        function showAlarmDetail(alarmId) {
            const alarm = allAlarms.find(a => a.id === alarmId);
            if (!alarm) return;

            // Get i18n texts
            const getText = (key, defaultText) => {
                return (window.i18n && window.i18n.getText(key) !== key) ? window.i18n.getText(key) : defaultText;
            };

            // Build detail HTML
            const detailHTML = `
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.alarmTime', '告警时间')}</div>
                    <div class="detail-item-value">${formatAlarmTime(alarm.time, alarm.timezone)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.alarmStation', '告警站点')}</div>
                    <div class="detail-item-value">${alarm.station}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.alarmDevice', '告警设备')}</div>
                    <div class="detail-item-value">${alarm.device}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.description', '告警描述')}</div>
                    <div class="detail-item-value description">${alarm.description}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.alarmLevel', '告警等级')}</div>
                    <div class="detail-item-value">${getLevelHTML(alarm.level)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.alarmStatus', '告警状态')}</div>
                    <div class="detail-item-value">${getStatusHTML(alarm.status)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-item-label">${getText('faultAlarm.detail.recoveryTime', '解决时间')}</div>
                    <div class="detail-item-value">${alarm.recoveryTime ? formatAlarmTime(alarm.recoveryTime) : '--'}</div>
                </div>
            `;

            // Fill drawer body
            document.getElementById('detailDrawerBody').innerHTML = detailHTML;

            // Update footer based on alarm status
            const footer = document.getElementById('detailDrawerFooter');
            if (alarm.status === 'unprocessed' && (localStorage.getItem('userRole') || 'operator') === 'owner') {
                footer.innerHTML = `<button class="btn-resolve" onclick="resolveAlarmFromDetail(${alarm.id})" data-i18n="faultAlarm.buttons.resolve">处理</button>`;
                footer.style.display = 'flex';
            } else {
                footer.style.display = 'none';
            }

            // Show drawer
            document.getElementById('detailDrawerOverlay').classList.add('active');
            document.getElementById('detailDrawer').classList.add('active');
        }

        async function resolveAlarmFromDetail(alarmId) {
            // Get i18n text
            const getText = (key, defaultText) => {
                return (window.i18n && window.i18n.getText(key) !== key) ? window.i18n.getText(key) : defaultText;
            };

            // Confirmation dialog
            const confirmMessage = getText('faultAlarm.confirm.resolve', '确认将此告警标记为已处理？');
            const confirmTitle = getText('faultAlarm.confirm.title', '确认操作');
            const confirmed = await showConfirmDialog(confirmMessage, confirmTitle);

            if (!confirmed) {
                return;
            }

            const alarm = allAlarms.find(a => a.id === alarmId);
            if (alarm) {
                alarm.status = 'processed';
                alarm.statusName = '已处理';
                alarm.recoveryTime = new Date();

                // Close drawer
                closeAlarmDetail();

                // Refresh table and counts
                applyFilters();
                renderTable();
                updateCounts();
            }
        }

        function closeAlarmDetail() {
            document.getElementById('detailDrawerOverlay').classList.remove('active');
            document.getElementById('detailDrawer').classList.remove('active');
        }

        // ==================== Confirm Dialog ====================
        function showConfirmDialog(message, title = '确认操作') {
            return new Promise((resolve) => {
                const overlay = document.getElementById('confirmOverlay');
                const titleEl = document.getElementById('confirmTitle');
                const messageEl = document.getElementById('confirmMessage');
                const cancelBtn = document.getElementById('confirmCancelBtn');
                const confirmBtn = document.getElementById('confirmConfirmBtn');

                // Get i18n text
                const getText = (key, defaultText) => {
                    return (window.i18n && window.i18n.getText(key) !== key) ? window.i18n.getText(key) : defaultText;
                };

                // Set content
                titleEl.textContent = title;
                messageEl.textContent = message;

                // Update button texts with i18n
                cancelBtn.textContent = getText('faultAlarm.confirm.cancel', '取消');
                confirmBtn.textContent = getText('faultAlarm.confirm.confirm', '确认');

                // Show overlay
                overlay.classList.add('active');

                // Handle cancel
                const handleCancel = () => {
                    overlay.classList.remove('active');
                    resolve(false);
                    cleanup();
                };

                // Handle confirm
                const handleConfirm = () => {
                    overlay.classList.remove('active');
                    resolve(true);
                    cleanup();
                };

                // Handle overlay click
                const handleOverlayClick = (e) => {
                    if (e.target === overlay) {
                        handleCancel();
                    }
                };

                // Cleanup function
                const cleanup = () => {
                    cancelBtn.removeEventListener('click', handleCancel);
                    confirmBtn.removeEventListener('click', handleConfirm);
                    overlay.removeEventListener('click', handleOverlayClick);
                };

                // Add event listeners
                cancelBtn.addEventListener('click', handleCancel);
                confirmBtn.addEventListener('click', handleConfirm);
                overlay.addEventListener('click', handleOverlayClick);
            });
        }

        // ==================== Batch Actions ====================
        function getSelectedAlarms() {
            return allAlarms.filter(a => a.selected);
        }

        async function batchProcess() {
            // Get i18n text
            const getText = (key, defaultText) => {
                return (window.i18n && window.i18n.getText(key) !== key) ? window.i18n.getText(key) : defaultText;
            };

            const selected = getSelectedAlarms();

            // Confirmation dialog with different messages based on selection
            let confirmMessage;
            if (selected.length === 0) {
                const unprocessedCount = filteredAlarms.filter(a => a.status === 'unprocessed').length;
                confirmMessage = getText('faultAlarm.confirm.batchProcessAll', `确认一键处理所有 ${unprocessedCount} 条未处理告警？`).replace('${count}', unprocessedCount);
            } else {
                confirmMessage = getText('faultAlarm.confirm.batchProcessSelected', `确认一键处理选中的 ${selected.length} 条告警？`).replace('${count}', selected.length);
            }

            const confirmTitle = getText('faultAlarm.confirm.title', '确认操作');
            const confirmed = await showConfirmDialog(confirmMessage, confirmTitle);

            if (!confirmed) {
                return;
            }

            if (selected.length === 0) {
                // Process all visible unprocessed alarms
                filteredAlarms.forEach(a => {
                    if (a.status === 'unprocessed') {
                        a.status = 'processed';
                        a.statusName = '已处理';
                        a.recoveryTime = new Date();
                    }
                });
            } else {
                selected.forEach(a => {
                    a.status = 'processed';
                    a.statusName = '已处理';
                    a.recoveryTime = new Date();
                    a.selected = false;
                });
            }
            applyFilters();
            renderTable();
            updateCounts();
        }

        function markAsProcessed() {
            const selected = getSelectedAlarms();
            selected.forEach(a => {
                a.status = 'processed';
                a.statusName = '已处理';
                a.selected = false;
            });
            applyFilters();
            renderTable();
            updateCounts();
        }

        function markAsUnprocessed() {
            const selected = getSelectedAlarms();
            selected.forEach(a => {
                a.status = 'unprocessed';
                a.statusName = '未处理';
                a.selected = false;
            });
            applyFilters();
            renderTable();
            updateCounts();
        }

        function exportAlarms() {
            // Generate CSV from filtered data
            const headers = ['告警时间', '描述', '告警等级', '告警设备', '告警站点', '告警状态', '恢复时间'];
            const rows = filteredAlarms.map(a => [
                formatAlarmTime(a.time, a.timezone),
                a.description,
                a.levelName,
                a.device,
                a.station,
                a.statusName,
                a.recoveryTime ? formatAlarmTime(a.recoveryTime) : '--'
            ]);

            let csv = '\uFEFF' + headers.join(',') + '\n';
            rows.forEach(row => {
                csv += row.map(cell => `"${cell}"`).join(',') + '\n';
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `fault_alarms_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
        }

        // ==================== Count Updates ====================
        function updateCounts() {
            const counts = {
                unprocessed: allAlarms.filter(a => a.status === 'unprocessed').length
            };

            document.getElementById('countUnprocessed').textContent = counts.unprocessed;
        }

        // ==================== Pagination ====================
        function updatePagination() {
            const totalPages = Math.max(1, Math.ceil(filteredAlarms.length / pageSize));
            document.getElementById('totalCount').textContent = filteredAlarms.length;
            document.getElementById('currentPageInput').value = currentPage;
            document.getElementById('prevPage').disabled = currentPage <= 1;
            document.getElementById('nextPage').disabled = currentPage >= totalPages;
        }

        function changePage(delta) {
            const totalPages = Math.max(1, Math.ceil(filteredAlarms.length / pageSize));
            const newPage = currentPage + delta;
            if (newPage >= 1 && newPage <= totalPages) {
                currentPage = newPage;
                renderTable();
            }
        }

        function goToPage(value) {
            const totalPages = Math.max(1, Math.ceil(filteredAlarms.length / pageSize));
            const page = parseInt(value);
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                renderTable();
            }
        }

        function changePageSize(value) {
            pageSize = parseInt(value);
            currentPage = 1;
            renderTable();
        }

        // ==================== Init ====================
        function initPage() {
            // Set default date range (last 7 days)
            const now = new Date();
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);

            document.getElementById('startDate').value = weekAgo.toISOString().slice(0, 10);
            document.getElementById('endDate').value = now.toISOString().slice(0, 10);

            // Load data
            allAlarms = generateMockAlarms();
            updateActionButtons();
            applyFilters();
            renderTable();
            updateCounts();
        }

        // ==================== DOMContentLoaded ====================
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize HeaderNav component
            const headerNav = new HeaderNav({
                currentPage: 'faultAlarm',
                containerId: 'headerContainer'
            });

            // 角色权限：运维方隐藏处理按钮 + 数据过滤（必须在 initPage 前）
            const _role = localStorage.getItem('userRole') || 'operator';
            if (_role === 'operator') {
                const operatorStations = ['Logistics Distribution', 'Solar Farm Alpha'];
                window._operatorStationFilter = operatorStations;
            }

            // Initialize page
            initPage();

            // 运维方：隐藏处理按钮
            if (_role === 'operator') {
                ['btnBatchProcess', 'btnMarkProcessed', 'btnMarkUnprocessed'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                document.querySelectorAll('.btn-resolve-inline, .btn-resolve').forEach(el => el.style.display = 'none');
            }

            // Update i18n texts
            setTimeout(() => {
                if (window.i18n && window.i18n.updatePageTexts) {
                    window.i18n.updatePageTexts();
                }
            }, 500);
        });
    