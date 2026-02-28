
        // ========== Global Variables ==========
        let toastCounter = 0;
        let filteredData = [];

        // Statistics table variables
        let statsCurrentPage = 1;
        let statsPageSize = 10;
        let dailyStatsData = [];
        let statsPagination = null;
        let currentSortColumn = null;
        let currentSortDirection = 'asc'; // 'asc' or 'desc'

        // ========== Operator i18n ==========
        const operatorsCN = ['李怡悦', '王乐康', '张三', '李四', '王五', '赵六', '孙七', '周八', '系统自动'];
        const operatorsEN = ['Yiyue Li', 'Lekang Wang', 'John Zhang', 'Mike Li', 'David Wang', 'Lucy Zhao', 'Tom Sun', 'Emily Zhou', 'System Auto'];

        function getOperatorName(cnName) {
            const index = operatorsCN.indexOf(cnName);
            if (window.i18n && window.i18n.getCurrentLanguage() === 'en' && index !== -1) {
                return operatorsEN[index];
            }
            return cnName;
        }

        // ========== Weighted Random ==========
        function weightedRandomIndex(weights) {
            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            for (let i = 0; i < weights.length; i++) {
                r -= weights[i];
                if (r <= 0) return i;
            }
            return weights.length - 1;
        }

        // ========== Mock Data Generation ==========
        const commands = ['charge', 'discharge'];
        const sources = ['AEMO', 'EMS', 'Manual', 'VPP'];
        const results = ['success', 'completed', 'partial', 'failed'];
        const resultWeights = [0.5, 0.3, 0.12, 0.08];
        const regions = ['NSW', 'QLD', 'VIC', 'SA', 'TAS'];
        const stationList = [
            'Hornsdale Power Reserve', 'Victorian Big Battery', 'Wallgrove BESS',
            'Wandoan South BESS', 'Bouldercombe BESS', 'Torrens Island BESS',
            'Waratah Super Battery', 'Capital Battery', 'Lake Bonney BESS',
            'Broken Hill BESS', 'Hazelwood BESS', 'Moorabool BESS'
        ];

        const allDispatchRecords = [];

        // 15 hand-crafted records
        const seedRecords = [
            { id: 1, time: '2024-02-17 06:25', command: 'charge', source: 'EMS', region: 'NSW', stationName: 'Wallgrove BESS', power: 25.5, duration: 30, operator: '李怡悦', result: 'success', processed: false },
            { id: 2, time: '2024-02-17 07:01', command: 'charge', source: 'Manual', region: 'NSW', stationName: 'Waratah Super Battery', power: 18.0, duration: 25, operator: '王乐康', result: 'completed', processed: false },
            { id: 3, time: '2024-02-17 14:10', command: 'discharge', source: 'AEMO', region: 'NSW', stationName: 'Broken Hill BESS', power: 42.0, duration: 8, operator: '系统自动', result: 'success', processed: false },
            { id: 4, time: '2024-02-17 18:00', command: 'discharge', source: 'EMS', region: 'QLD', stationName: 'Wandoan South BESS', power: 35.2, duration: 45, operator: '李怡悦', result: 'success', processed: true },
            { id: 5, time: '2024-02-17 20:35', command: 'charge', source: 'VPP', region: 'QLD', stationName: 'Bouldercombe BESS', power: 18.8, duration: 20, operator: '系统自动', result: 'completed', processed: true },
            { id: 6, time: '2024-02-17 23:07', command: 'discharge', source: 'Manual', region: 'QLD', stationName: 'Wandoan South BESS', power: 30.0, duration: 35, operator: '王乐康', result: 'success', processed: false },
            { id: 7, time: '2024-02-16 09:15', command: 'charge', source: 'AEMO', region: 'VIC', stationName: 'Victorian Big Battery', power: 30.0, duration: 55, operator: '张三', result: 'completed', processed: true },
            { id: 8, time: '2024-02-16 14:30', command: 'charge', source: 'EMS', region: 'VIC', stationName: 'Hazelwood BESS', power: 22.3, duration: 40, operator: '张三', result: 'partial', processed: false },
            { id: 9, time: '2024-02-16 16:45', command: 'discharge', source: 'VPP', region: 'VIC', stationName: 'Moorabool BESS', power: 28.7, duration: 35, operator: '李四', result: 'success', processed: true },
            { id: 10, time: '2024-02-16 20:15', command: 'discharge', source: 'Manual', region: 'SA', stationName: 'Torrens Island BESS', power: 40.5, duration: 30, operator: '王五', result: 'success', processed: true },
            { id: 11, time: '2024-02-15 09:20', command: 'charge', source: 'EMS', region: 'SA', stationName: 'Hornsdale Power Reserve', power: 15.0, duration: 50, operator: '赵六', result: 'completed', processed: true },
            { id: 12, time: '2024-02-15 11:35', command: 'discharge', source: 'AEMO', region: 'TAS', stationName: 'Capital Battery', power: 38.5, duration: 12, operator: '系统自动', result: 'success', processed: false },
            { id: 13, time: '2024-02-15 15:50', command: 'charge', source: 'VPP', region: 'TAS', stationName: 'Capital Battery', power: 20.1, duration: 25, operator: '系统自动', result: 'partial', processed: false },
            { id: 14, time: '2024-02-15 18:00', command: 'discharge', source: 'AEMO', region: 'NSW', stationName: 'Wallgrove BESS', power: 45.0, duration: 50, operator: '周八', result: 'success', processed: true },
            { id: 15, time: '2024-02-14 10:00', command: 'charge', source: 'EMS', region: 'TAS', stationName: 'Capital Battery', power: 12.0, duration: 30, operator: '孙七', result: 'failed', processed: false }
        ];
        seedRecords.forEach(r => allDispatchRecords.push(r));

        // Generate 305 more random records
        for (let i = 16; i <= 320; i++) {
            const randomDate = new Date(2024, 1, Math.floor(Math.random() * 28) + 1, Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
            allDispatchRecords.push({
                id: i,
                time: randomDate.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-'),
                command: commands[Math.floor(Math.random() * commands.length)],
                source: sources[Math.floor(Math.random() * sources.length)],
                region: regions[Math.floor(Math.random() * regions.length)],
                stationName: stationList[Math.floor(Math.random() * stationList.length)],
                power: parseFloat((Math.random() * 50 + 1).toFixed(1)),
                duration: Math.floor(5 + Math.random() * 55),
                operator: operatorsCN[Math.floor(Math.random() * (operatorsCN.length - 1))],
                result: results[weightedRandomIndex(resultWeights)],
                processed: Math.random() > 0.4
            });
        }

        allDispatchRecords.sort((a, b) => new Date(b.time) - new Date(a.time));
        filteredData = [...allDispatchRecords];

        // ========== Generate Daily Statistics ==========
        function generateDailyStats(records) {
            // 首先按 date + station 分组收集记录
            const groupedRecords = new Map();

            records.forEach(record => {
                const date = record.time.split(' ')[0];
                const key = `${date}_${record.stationName}`;

                if (!groupedRecords.has(key)) {
                    groupedRecords.set(key, {
                        date: date,
                        station: record.stationName,
                        region: record.region,
                        records: []
                    });
                }

                groupedRecords.get(key).records.push(record);
            });

            // 处理每个分组，识别操作段
            const statsMap = new Map();

            groupedRecords.forEach((group, key) => {
                // 按时间排序
                const sortedRecords = group.records.sort((a, b) => {
                    return new Date(a.time) - new Date(b.time);
                });

                let manualCount = 0;
                let automatedCount = 0;

                // 识别操作模式段：每个不同的（命令类型 + 操作模式）组合算一段
                // 这样可以统计有多少个"智能充电"、"人工充电"、"智能放电"、"人工放电"标记
                const segments = [];
                let currentSegment = null;

                sortedRecords.forEach((record, index) => {
                    // 统计操作模式
                    if (record.source === 'Manual') {
                        manualCount++;
                    } else {
                        automatedCount++;
                    }

                    // 判断操作模式（人工 vs 自动）
                    const isManual = record.source === 'Manual';
                    const command = record.command;

                    // 判断是否需要开启新段
                    let isNewSegment = false;

                    if (!currentSegment) {
                        // 第一条记录，开启新段
                        isNewSegment = true;
                    } else if (currentSegment.command !== command || currentSegment.isManual !== isManual) {
                        // 命令类型或操作模式改变，开启新段
                        isNewSegment = true;
                    } else if (index > 0) {
                        // 同命令同模式，检查时间间隔
                        const prevTime = new Date(sortedRecords[index - 1].time);
                        const currTime = new Date(record.time);
                        const hoursDiff = (currTime - prevTime) / (1000 * 60 * 60);

                        // 时间间隔超过2小时，视为新段
                        if (hoursDiff > 2) {
                            isNewSegment = true;
                        }
                    }

                    if (isNewSegment) {
                        currentSegment = {
                            command: command,
                            isManual: isManual,
                            startTime: record.time
                        };
                        segments.push(currentSegment);
                    }
                });

                // 统计充电和放电的段数（每段对应一个标记）
                const chargeSegments = segments.filter(s => s.command === 'charge').length;
                const dischargeSegments = segments.filter(s => s.command === 'discharge').length;

                statsMap.set(key, {
                    date: group.date,
                    station: group.station,
                    region: group.region,
                    chargeCount: chargeSegments,
                    dischargeCount: dischargeSegments,
                    manualCount: manualCount,
                    automatedCount: automatedCount,
                    totalOperations: sortedRecords.length
                });
            });

            // Convert map to array and add computed fields
            const statsArray = Array.from(statsMap.values()).map(stat => {
                // Determine operation mode
                let operationMode = '';
                let chargeCount = 0;
                let dischargeCount = 0;

                if (stat.manualCount > 0 && stat.automatedCount > 0) {
                    // 混合模式：机器人 + 人工
                    operationMode = 'hybrid';
                    chargeCount = 2;
                    dischargeCount = 2;
                } else if (stat.manualCount > 0) {
                    // 纯人工
                    operationMode = 'manual';
                    chargeCount = 1;
                    dischargeCount = 1;
                } else {
                    // 纯机器人
                    operationMode = 'automated';
                    chargeCount = 1;
                    dischargeCount = 1;
                }

                return {
                    ...stat,
                    operationMode: operationMode,
                    chargeCount: chargeCount,
                    dischargeCount: dischargeCount
                };
            });

            // Sort by date desc, then by station name
            statsArray.sort((a, b) => {
                const dateCompare = b.date.localeCompare(a.date);
                if (dateCompare !== 0) return dateCompare;
                return a.station.localeCompare(b.station);
            });

            return statsArray;
        }

        // Initialize daily stats
        dailyStatsData = generateDailyStats(allDispatchRecords);

        // Populate station filter dropdown
        (function populateStationFilter() {
            const select = document.getElementById('stationFilter');
            const uniqueStations = [...new Set(allDispatchRecords.map(r => r.stationName))].sort();
            uniqueStations.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });
        })();

        // ========== Display Info Helpers ==========
        function getCommandInfo(command) {
            const t = (key, fallback) => window.i18n ? window.i18n.getText(key) : fallback;
            const commandMap = {
                'charge':    { text: t('operationLog.commands.charge', '充电'),    class: 'command-charge' },
                'discharge': { text: t('operationLog.commands.discharge', '放电'),  class: 'command-discharge' }
            };
            return commandMap[command] || { text: command, class: 'command-charge' };
        }

        function getSourceInfo(source) {
            const t = (key, fallback) => window.i18n ? window.i18n.getText(key) : fallback;
            const sourceMap = {
                'AEMO':   { text: 'AEMO',                                    class: 'source-aemo' },
                'EMS':    { text: 'EMS',                                      class: 'source-ems' },
                'Manual': { text: t('operationLog.sources.manual', '手动'),    class: 'source-manual' },
                'VPP':    { text: 'VPP',                                      class: 'source-vpp' }
            };
            return sourceMap[source] || { text: source, class: '' };
        }

        function getResultInfo(result) {
            const t = (key, fallback) => window.i18n ? window.i18n.getText(key) : fallback;
            const resultMap = {
                'success':   { text: t('operationLog.results.success', '成功'),     class: 'result-success' },
                'completed': { text: t('operationLog.results.completed', '已完成'),  class: 'result-completed' },
                'partial':   { text: t('operationLog.results.partial', '部分完成'),   class: 'result-partial' },
                'failed':    { text: t('operationLog.results.failed', '失败'),       class: 'result-failed' }
            };
            return resultMap[result] || { text: result, class: '' };
        }

        function getOperationModeText(operationMode) {
            const t = (key, fallback) => window.i18n ? window.i18n.getText(key) : fallback;
            const modeMap = {
                'manual': t('operationLog.dailyStats.modes.manual', '人工'),
                'automated': t('operationLog.dailyStats.modes.automated', '智能托管'),
                'hybrid': t('operationLog.dailyStats.modes.manual', '人工') + ';' + t('operationLog.dailyStats.modes.automated', '智能托管')
            };
            return modeMap[operationMode] || operationMode;
        }

        // ========== Toast Notifications ==========
        function showToast(type, title, message, duration = 3000) {
            toastCounter++;
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.id = `toast-${toastCounter}`;
            toast.innerHTML = `
                <div class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'i'}</div>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="hideToast('${toast.id}')">&times;</button>
            `;
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => hideToast(toast.id), duration);
        }
        function hideToast(id) {
            const toast = document.getElementById(id);
            if (toast) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }
        function showInfoToast(title, message) { showToast('info', title, message); }
        function showSuccessToast(title, message) { showToast('success', title, message); }
        function showErrorToast(title, message, d = 4000) { showToast('error', title, message, d); }

        // ========== Daily Stats Table Rendering ==========
        function updateStatsTableDisplay() {
            const tbody = document.getElementById('dailyStatsTableBody');
            const startIndex = (statsCurrentPage - 1) * statsPageSize;
            const endIndex = startIndex + statsPageSize;
            const pageData = dailyStatsData.slice(startIndex, endIndex);

            tbody.innerHTML = '';

            if (pageData.length === 0) {
                const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:rgba(255,255,255,0.5);">${t('operationLog.noData', '暂无数据')}</td></tr>`;
                return;
            }

            pageData.forEach(stat => {
                const row = document.createElement('tr');

                // Operation mode badge
                let operationModeClass = '';
                let operationModeText = getOperationModeText(stat.operationMode);

                if (stat.operationMode === 'manual') {
                    operationModeClass = 'background: rgba(88, 86, 214, 0.15); color: #5856d6; border: 1px solid rgba(88, 86, 214, 0.3);';
                } else if (stat.operationMode === 'automated') {
                    operationModeClass = 'background: rgba(0, 122, 255, 0.15); color: #007aff; border: 1px solid rgba(0, 122, 255, 0.3);';
                } else {
                    operationModeClass = 'background: rgba(255, 149, 0, 0.15); color: #ff9500; border: 1px solid rgba(255, 149, 0, 0.3);';
                }

                const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;

                row.innerHTML = `
                    <td style="white-space:nowrap; font-weight: 500;">${stat.date}</td>
                    <td>${stat.station}</td>
                    <td style="text-align: center; color: #34c759; font-weight: 600;">${stat.chargeCount}</td>
                    <td style="text-align: center; color: #FFD60A; font-weight: 600;">${stat.dischargeCount}</td>
                    <td style="text-align: center;"><span class="status-badge" style="${operationModeClass}">${operationModeText}</span></td>
                    <td>
                        <a href="#" class="action-link" style="color: #00ff88;" onclick="viewStationDailyDetails('${stat.date}', '${stat.station}', '${stat.operationMode}'); return false;">${t('operationLog.buttons.viewDetails', '详情')}</a>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }

        function updateStatsPaginationDisplay() {
            if (statsPagination) {
                statsPagination.update({
                    totalItems: dailyStatsData.length,
                    currentPage: statsCurrentPage,
                    pageSize: statsPageSize
                });
            }
        }

        // ========== Sorting Functions ==========
        function sortStatsTable(column) {
            // Toggle sort direction if clicking the same column
            if (currentSortColumn === column) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = column;
                currentSortDirection = 'asc';
            }

            // Sort the data
            dailyStatsData.sort((a, b) => {
                let valA = a[column];
                let valB = b[column];

                // Handle different data types
                if (typeof valA === 'string') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }

                if (valA < valB) {
                    return currentSortDirection === 'asc' ? -1 : 1;
                }
                if (valA > valB) {
                    return currentSortDirection === 'asc' ? 1 : -1;
                }
                return 0;
            });

            // Update sort indicators
            updateSortIndicators();

            // Refresh table display
            updateStatsTableDisplay();
        }

        function updateSortIndicators() {
            // Clear all sort indicators
            const columns = ['date', 'station', 'capacity', 'chargeCount', 'dischargeCount', 'operationMode'];
            columns.forEach(col => {
                const indicator = document.getElementById(`sort-${col}`);
                if (indicator) {
                    indicator.textContent = '';
                }
            });

            // Set current sort indicator
            if (currentSortColumn) {
                const indicator = document.getElementById(`sort-${currentSortColumn}`);
                if (indicator) {
                    indicator.textContent = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
                }
            }
        }

        // ========== Filter Functions ==========
        function applyOpFilters() {
            const station = document.getElementById('stationFilter').value;
            const command = document.getElementById('opCommandFilter').value;
            const date = document.getElementById('opDateInput').value.trim();

            filteredData = allDispatchRecords.filter(record => {
                if (station && record.stationName !== station) return false;
                if (command && record.command !== command) return false;
                if (date && !record.time.startsWith(date)) return false;
                return true;
            });

            // Update daily stats based on filtered data
            dailyStatsData = generateDailyStats(filteredData);
            statsCurrentPage = 1;

            updateStatsTableDisplay();
            updateStatsPaginationDisplay();

            const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
            showInfoToast(t('operationLog.buttons.search', '查询'), `${filteredData.length} ${t('operationLog.total', '共')} `);
        }

        function resetOpFilters() {
            document.getElementById('stationFilter').selectedIndex = 0;
            document.getElementById('opCommandFilter').selectedIndex = 0;
            document.getElementById('opDateInput').value = '';
            filteredData = [...allDispatchRecords];

            // Reset daily stats
            dailyStatsData = generateDailyStats(allDispatchRecords);
            statsCurrentPage = 1;

            updateStatsTableDisplay();
            updateStatsPaginationDisplay();
        }

        // Realtime search on select change
        function setupOpRealTimeSearch() {
            const selects = ['stationFilter', 'opCommandFilter'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('change', () => applyOpFilters());
            });
        }

        // ========== Export Statistics ==========
        function exportDailyStats() {
            if (!dailyStatsData.length) {
                showErrorToast('导出失败', '没有可导出的统计数据');
                return;
            }
            const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
            const headers = [
                t('operationLog.dailyStats.date', '日期'),
                t('operationLog.dailyStats.station', '电站'),
                t('operationLog.dailyStats.capacity', '装机容量'),
                t('operationLog.dailyStats.chargeCount', '充电次数'),
                t('operationLog.dailyStats.dischargeCount', '放电次数'),
                t('operationLog.dailyStats.operationMode', '操作方式')
            ];
            const rows = dailyStatsData.map(stat => [
                stat.date,
                stat.station,
                stat.capacity,
                stat.chargeCount,
                stat.dischargeCount,
                getOperationModeText(stat.operationMode)
            ]);
            let csv = headers.join(',') + '\n';
            rows.forEach(row => { csv += row.map(item => `"${item}"`).join(',') + '\n'; });
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `daily_station_statistics_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showSuccessToast('导出成功', `已导出 ${dailyStatsData.length} 条统计记录`);
        }

        // ========== View Station Daily Details ==========
        function viewStationDailyDetails(date, stationName, operationMode) {
            // Navigate to station detail page with parameters
            const params = new URLSearchParams({
                date: date,
                station: encodeURIComponent(stationName),
                mode: operationMode || 'hybrid'
            });
            window.location.href = `operation-log-detail.html?${params.toString()}`;
        }

        // ========== Edit Station ==========
        function editStation(date, stationName) {
            showInfoToast('编辑功能', `编辑电站: ${stationName} (${date})`);
            // TODO: 实现编辑功能
        }

        // ========== Delete Station ==========
        function deleteStation(date, stationName) {
            if (confirm(`确定要删除电站 "${stationName}" 在 ${date} 的记录吗？`)) {
                showSuccessToast('删除成功', `已删除电站 ${stationName} 的记录`);
                // TODO: 实现实际的删除逻辑
            }
        }


        // ========== Date Picker for opDateInput ==========
        function setupOpDatePicker() {
            const dateInput = document.getElementById('opDateInput');
            if (!dateInput) return;
            dateInput.addEventListener('click', function(e) {
                e.stopPropagation();
                // Simple date input via prompt (lightweight approach)
                const val = prompt(window.i18n ? window.i18n.getText('operationLog.filter.timePlaceholder') : '请输入日期 (YYYY-MM-DD)', dateInput.value || '2024-02-');
                if (val !== null) {
                    dateInput.value = val;
                    applyOpFilters();
                }
            });
        }

        // ========== Initialization ==========
        document.addEventListener('DOMContentLoaded', () => {
            // Initialize i18n
            if (window.I18nManager) {
                window.i18n = new I18nManager();
                const savedLang = localStorage.getItem('app_language') || 'zh';
                window.i18n.setLanguage(savedLang);
            }

            // Force translate after delay
            setTimeout(() => {
                if (window.i18n && window.i18n.updatePageTexts) {
                    window.i18n.updatePageTexts();
                }
            }, 100);
            setTimeout(() => {
                if (window.i18n && window.i18n.updatePageTexts) {
                    window.i18n.updatePageTexts();
                }
            }, 500);

            // Initialize HeaderNav
            const headerNav = new HeaderNav({
                currentPage: 'operationLog',
                containerId: 'headerContainer'
            });

            // Initialize pagination for statistics table
            statsPagination = new Pagination({
                containerId: 'statsPaginationContainer',
                currentPage: statsCurrentPage,
                pageSize: statsPageSize,
                totalItems: dailyStatsData.length,
                onPageChange: (page, size) => {
                    statsCurrentPage = page;
                    updateStatsTableDisplay();
                },
                onPageSizeChange: (size) => {
                    statsPageSize = size;
                    statsCurrentPage = 1;
                    updateStatsTableDisplay();
                }
            });

            // Initial render
            updateStatsTableDisplay();
            updateStatsPaginationDisplay();

            // Setup realtime search
            setupOpRealTimeSearch();
            setupOpDatePicker();

            // Language change observer
            if (window.i18n) {
                window.i18n.addObserver((newLang, oldLang) => {
                    updateStatsTableDisplay();
                    updateStatsPaginationDisplay();
                });
            }

        });
    