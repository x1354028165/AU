
        let chargeDischargeChart;
        let currentViewMode = 'chart', currentTimePeriod = 'day', currentRegion = 'all';
        let currentStation = '';  // 当前选中电站
        let tableData = [], currentPage = 1, pageSize = 10, pagination = null;
        let currentSortColumn = null, currentSortDirection = null;
        let sharedData = { rows: [], totals: {} };

        const stationNames = [
            'Sydney Solar Farm', 'Melbourne Battery Hub', 'Brisbane Energy Park',
            'Adelaide Power Station', 'Perth Grid Storage', 'Hobart Green Energy',
            'Newcastle Battery Array', 'Gold Coast Solar Storage', 'Canberra Power Grid',
            'Darwin Energy Center', 'Cairns Solar Hub', 'Townsville Battery Park'
        ];

        const regionMultipliers = { all: 1, NSW: 0.30, QLD: 0.22, VIC: 0.20, SA: 0.18, TAS: 0.10 };

        // 各电站容量权重（模拟不同 BESS 容量占比，合计 ≈ 1.0）
        const stationMultipliers = {
            'Sydney Solar Farm': 0.12,
            'Melbourne Battery Hub': 0.11,
            'Brisbane Energy Park': 0.10,
            'Adelaide Power Station': 0.09,
            'Perth Grid Storage': 0.08,
            'Hobart Green Energy': 0.06,
            'Newcastle Battery Array': 0.10,
            'Gold Coast Solar Storage': 0.08,
            'Canberra Power Grid': 0.07,
            'Darwin Energy Center': 0.06,
            'Cairns Solar Hub': 0.07,
            'Townsville Battery Park': 0.06
        };

        // 各时段基础数据：充电量MWh, 放电量MWh, 充电均价$/MWh, 放电均价$/MWh
        const periodBaseData = {
            day:   { charge: 2.45, discharge: 2.18, buyPrice: 44, sellPrice: 240 },
            month: { charge: 73.5, discharge: 65.4, buyPrice: 42, sellPrice: 235 },
            year:  { charge: 882, discharge: 784.8, buyPrice: 43, sellPrice: 238 },
            total: { charge: 2646, discharge: 2354.4, buyPrice: 41, sellPrice: 232 }
        };

        // ========== 初始化 ==========
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => {
                if (typeof HeaderNav !== 'undefined') {
                    window.headerNav = new HeaderNav({ containerId: 'headerContainer', currentPage: 'report' });
                }
                // 填充电站下拉列表 — 角色过滤
                const _role = localStorage.getItem('userRole') || 'operator';
                const visibleStations = _role === 'operator' ? stationNames.slice(0, 2) : stationNames;
                const stationSelect = document.getElementById('stationSelector');
                visibleStations.forEach((name, idx) => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    if (idx === 0) opt.selected = true;
                    stationSelect.appendChild(opt);
                });
                currentStation = visibleStations[0];

                const today = new Date();
                const timeInput = document.getElementById('timeSelector');
                if (timeInput) { timeInput.type = 'date'; timeInput.value = today.toISOString().split('T')[0]; }
                updateDateDisplay();

                generateSharedData();
                updateStats();
                initAllCharts();
                generateTableData();

                if (window.i18n) {
                    window.i18n.addObserver(() => { updateDateDisplay(); generateSharedData(); updateStats(); refreshCharts(); generateTableData(); loadTableData(); });
                    setTimeout(() => { if (window.i18n.updatePageTexts) window.i18n.updatePageTexts(); }, 100);
                }

                window.addEventListener('resize', () => {
                    [chargeDischargeChart].forEach(c => {
                        if (c && !c.isDisposed()) c.resize();
                    });
                });
            }, 200);
        });

        // ========== 控制函数 ==========
        function handleStationChange() { currentStation = document.getElementById('stationSelector').value; refreshData(); }
        function handleRegionChange() { currentRegion = document.getElementById('regionSelector').value; refreshData(); }
        function handleTimeInputChange() { updateDateDisplay(); refreshData(); }

        // 根据 i18n 语言格式化日期显示
        function updateDateDisplay() {
            const timeInput = document.getElementById('timeSelector');
            const displayLabel = document.getElementById('timeSelectorDisplay');
            const wrapper = timeInput.closest('.date-input-wrapper');
            if (!displayLabel || !timeInput) return;
            const isEn = window.i18n && window.i18n.getCurrentLanguage() === 'en';
            const monthNamesEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

            if (currentTimePeriod === 'total' || timeInput.disabled) {
                wrapper.classList.add('disabled');
                wrapper.style.display = 'none';
                return;
            }
            wrapper.classList.remove('disabled');
            wrapper.style.display = 'inline-block';

            const val = timeInput.value;
            if (!val) { displayLabel.textContent = '—'; return; }

            if (currentTimePeriod === 'day') {
                // val = "2026-02-10"
                const [y, m, d] = val.split('-').map(Number);
                displayLabel.textContent = isEn
                    ? `${monthNamesEn[m - 1]} ${d}, ${y}`
                    : `${y}年${String(m).padStart(2,'0')}月${String(d).padStart(2,'0')}日`;
            } else if (currentTimePeriod === 'month') {
                // val = "2026-02"
                const [y, m] = val.split('-').map(Number);
                displayLabel.textContent = isEn
                    ? `${monthNamesEn[m - 1]} ${y}`
                    : `${y}年${String(m).padStart(2,'0')}月`;
            } else if (currentTimePeriod === 'year') {
                displayLabel.textContent = val;
            }
        }

        function switchTimePeriod(period, el) {
            currentTimePeriod = period;
            document.querySelectorAll('.time-pill').forEach(p => p.classList.remove('active'));
            el.classList.add('active');
            const timeInput = document.getElementById('timeSelector');
            const today = new Date();
            if (period === 'total') { timeInput.disabled = true; }
            else {
                timeInput.disabled = false;
                if (period === 'day') { timeInput.type = 'date'; timeInput.value = today.toISOString().split('T')[0]; }
                else if (period === 'month') { timeInput.type = 'month'; timeInput.value = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0'); }
                else { timeInput.type = 'number'; timeInput.min = 2020; timeInput.max = 2030; timeInput.value = today.getFullYear(); }
            }
            updateDateDisplay();
            refreshData();
        }

        function switchViewMode(mode, el) {
            currentViewMode = mode;
            document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            document.getElementById('chartViewContent').style.display = mode === 'chart' ? 'block' : 'none';
            document.getElementById('tableViewContent').style.display = mode === 'table' ? 'block' : 'none';
            if (mode === 'chart') setTimeout(() => refreshCharts(), 100);
            else { generateTableData(); if (!pagination) initializePagination(); else refreshTableData(); }
        }


        // ========== 数据刷新 ==========
        function refreshData() {
            generateSharedData();
            updateStats();
            if (currentViewMode === 'chart') refreshCharts();
            else refreshTableData();
        }

        function getMultiplier() { return stationMultipliers[currentStation] || 0.08; }

        // ========== 统一数据源：生成一次，三处共享 ==========
        function generateSharedData() {
            const base = periodBaseData[currentTimePeriod];
            const m = getMultiplier();
            const totalCharge = base.charge * m;
            const totalDischarge = base.discharge * m;
            const isEn = window.i18n && window.i18n.getCurrentLanguage() === 'en';
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

            let labels, cWeights, dWeights;
            if (currentTimePeriod === 'day') {
                labels = Array.from({length:24}, (_,i) => `${i.toString().padStart(2,'0')}:00`);
                cWeights = hourlyChargeWeight; dWeights = hourlyDischargeWeight;
            } else if (currentTimePeriod === 'month') {
                const now = new Date();
                const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
                labels = Array.from({length:days}, (_,i) => isEn ? `Day ${i+1}` : `${i+1}日`);
                const w = 1/days; cWeights = Array(days).fill(w); dWeights = Array(days).fill(w);
            } else if (currentTimePeriod === 'year') {
                labels = Array.from({length:12}, (_,i) => isEn ? monthNames[i] : `${i+1}月`);
                cWeights = monthlyWeight; dWeights = monthlyWeight;
            } else {
                labels = ['2021','2022','2023','2024','2025'];
                cWeights = [0.12,0.16,0.20,0.24,0.28]; dWeights = [0.12,0.16,0.20,0.24,0.28];
            }

            const rows = [];
            labels.forEach((label, idx) => {
                const charge = +(totalCharge * cWeights[idx] * (0.85 + Math.random()*0.3)).toFixed(2);
                const discharge = +(totalDischarge * dWeights[idx] * (0.85 + Math.random()*0.3)).toFixed(2);
                let avgBuyPrice, avgSellPrice;
                if (currentTimePeriod === 'day') {
                    const h = idx;
                    const buyVar = h < 6 ? 0.6+Math.random()*0.3 : h > 16 ? 1.0+Math.random()*0.3 : 0.8+Math.random()*0.3;
                    const sellVar = h < 6 ? 0.5+Math.random()*0.3 : h > 16 ? 1.1+Math.random()*0.4 : 0.8+Math.random()*0.3;
                    avgBuyPrice = +(base.buyPrice * buyVar).toFixed(1);
                    avgSellPrice = +(base.sellPrice * sellVar).toFixed(1);
                } else {
                    avgBuyPrice = +(base.buyPrice * (0.85+Math.random()*0.3)).toFixed(1);
                    avgSellPrice = +(base.sellPrice * (0.85+Math.random()*0.3)).toFixed(1);
                }
                const chargeCost = Math.round(charge * avgBuyPrice);
                const dischargeRevenue = Math.round(discharge * avgSellPrice);
                const netProfit = dischargeRevenue - chargeCost;
                rows.push({ timeLabel: label, charge, discharge, avgBuyPrice, avgSellPrice, chargeCost, dischargeRevenue, netProfit });
            });

            const agg = rows.reduce((s,r) => ({
                charge: s.charge+r.charge, discharge: s.discharge+r.discharge,
                cost: s.cost+r.chargeCost, revenue: s.revenue+r.dischargeRevenue, profit: s.profit+r.netProfit
            }), {charge:0, discharge:0, cost:0, revenue:0, profit:0});
            agg.avgBuyPrice = agg.charge > 0 ? +(agg.cost/agg.charge).toFixed(1) : base.buyPrice;
            agg.avgSellPrice = agg.discharge > 0 ? +(agg.revenue/agg.discharge).toFixed(1) : base.sellPrice;

            sharedData = { rows, totals: agg };
        }

        // ========== 指标卡：从 sharedData.totals 读取 ==========
        function updateStats() {
            const totals = sharedData.totals;
            document.getElementById('statCharge').innerHTML = totals.charge.toFixed(1) + '<span class="stat-unit">MWh</span>';
            document.getElementById('statDischarge').innerHTML = totals.discharge.toFixed(1) + '<span class="stat-unit">MWh</span>';
            document.getElementById('statAvgBuyPrice').innerHTML = '$' + Math.round(totals.avgBuyPrice) + '<span class="stat-unit">/MWh</span>';
            document.getElementById('statAvgSellPrice').innerHTML = '$' + Math.round(totals.avgSellPrice) + '<span class="stat-unit">/MWh</span>';
            const profitEl = document.getElementById('statNetProfit');
            profitEl.textContent = '$' + totals.profit.toLocaleString();
            profitEl.className = 'stat-value ' + (totals.profit >= 0 ? 'profit-positive' : 'profit-negative');

            const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
            const compareTexts = {
                day: t('report.compare.day', '比昨日'),
                month: t('report.compare.month', '比上月'),
                year: t('report.compare.year', '比去年'),
                total: ''
            };
            document.querySelectorAll('.compare-text').forEach(el => el.textContent = compareTexts[currentTimePeriod]);
            document.querySelectorAll('.stat-change').forEach(el => el.style.display = currentTimePeriod === 'total' ? 'none' : 'block');
        }

        // ========== 图表 ==========
        function initAllCharts() { initChargeDischargeChart(); }
        function refreshCharts() { if (currentViewMode === 'chart') setTimeout(() => initAllCharts(), 100); }

        // 图表通用tooltip样式
        const tooltipStyle = { backgroundColor: 'rgba(0,0,0,0.9)', borderColor: 'rgba(255,255,255,0.1)', textStyle: { color: '#fff' } };
        const axisLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.08)' } };
        const splitLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } };
        const axisLabelStyle = { color: 'rgba(255,255,255,0.6)', fontSize: 11 };

        // 充放电量 + 累计净利润图表（从 sharedData 读取）
        function initChargeDischargeChart() {
            const dom = document.getElementById('chargeDischargeChart');
            if (chargeDischargeChart) chargeDischargeChart.dispose();
            chargeDischargeChart = echarts.init(dom);

            const rows = sharedData.rows;
            if (!rows.length) return;

            const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
            const labelCharge = t('report.chart.charge', '充电量');
            const labelDischarge = t('report.chart.discharge', '放电量');
            const labelCumProfit = t('report.chart.cumProfit', '累计净利润');

            const labels = rows.map(r => r.timeLabel);
            const chargeData = rows.map(r => r.charge);
            const dischargeData = rows.map(r => r.discharge);

            // 累计净利润：逐行累加 netProfit，最终值 === 指标卡净利润 === 表格合计净利润
            let cum = 0;
            const cumProfitData = rows.map(r => { cum += r.netProfit; return Math.round(cum); });

            const titleEl = document.getElementById('chartTitle');
            if (titleEl) titleEl.textContent = (currentStation || '') + ' — ' + labelCharge + ' & ' + labelCumProfit;

            const rotateLabel = labels.length > 15;

            chargeDischargeChart.setOption({
                tooltip: {
                    ...tooltipStyle, trigger: 'axis',
                    formatter: p => {
                        let html = `<div style="font-weight:600;margin-bottom:6px;">${p[0].axisValue}</div>`;
                        p.forEach(i => {
                            if (i.seriesName === labelCumProfit) {
                                html += `${i.marker} ${i.seriesName}: <b>$${i.value.toLocaleString()}</b><br/>`;
                            } else {
                                html += `${i.marker} ${i.seriesName}: <b>${i.value.toLocaleString()} MWh</b><br/>`;
                            }
                        });
                        return html;
                    }
                },
                legend: { data: [labelCharge, labelDischarge, labelCumProfit], textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 13 }, top: 0, itemGap: 24 },
                grid: { left: '3%', right: '4%', bottom: rotateLabel ? '12%' : '5%', top: '10%', containLabel: true },
                xAxis: { type: 'category', data: labels, axisLine: axisLineStyle, axisLabel: { ...axisLabelStyle, rotate: rotateLabel ? 45 : 0, fontSize: rotateLabel ? 10 : 12 } },
                yAxis: [
                    { type: 'value', name: 'MWh', nameTextStyle: axisLabelStyle, axisLine: axisLineStyle, axisLabel: axisLabelStyle, splitLine: splitLineStyle },
                    { type: 'value', name: '$', nameTextStyle: axisLabelStyle, axisLine: axisLineStyle, axisLabel: { ...axisLabelStyle, formatter: v => '$' + v.toLocaleString() }, splitLine: { show: false } }
                ],
                dataZoom: labels.length > 24 ? [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 5, height: 20, borderColor: 'rgba(255,255,255,0.1)', fillerColor: 'rgba(0,255,136,0.15)', textStyle: { color: 'rgba(255,255,255,0.5)' } }] : [],
                series: [
                    {
                        name: labelCharge, type: 'bar', yAxisIndex: 0, data: chargeData, barGap: '15%',
                        itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#1e7fff'},{offset:1,color:'rgba(30,127,255,0.2)'}]), borderRadius: [3,3,0,0] }
                    },
                    {
                        name: labelDischarge, type: 'bar', yAxisIndex: 0, data: dischargeData,
                        itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#00ff88'},{offset:1,color:'rgba(0,255,136,0.2)'}]), borderRadius: [3,3,0,0] }
                    },
                    {
                        name: labelCumProfit, type: 'line', yAxisIndex: 1, data: cumProfitData, smooth: true, symbol: 'circle', symbolSize: 5,
                        lineStyle: { color: '#ffd700', width: 2.5 },
                        itemStyle: { color: '#ffd700', borderColor: '#fff', borderWidth: 1 },
                        areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(255,215,0,0.25)'},{offset:1,color:'rgba(255,215,0,0.02)'}]) }
                    }
                ]
            });
        }

        // ========== 表格 ==========
        function sortTable(col, dir, el) {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            if (currentSortColumn === col && currentSortDirection === dir) { currentSortColumn = null; currentSortDirection = null; generateTableData(); }
            else { currentSortColumn = col; currentSortDirection = dir; el.classList.add('active'); tableData.sort((a,b) => dir === 'asc' ? a[col] - b[col] : b[col] - a[col]); }
            loadTableData();
        }
        function exportTableData() {  }

        function initializePagination() {
            pagination = new Pagination({ containerId: 'paginationContainer', currentPage, pageSize, totalItems: tableData.length, onPageChange: p => { currentPage = p; loadTableData(); }, onPageSizeChange: s => { pageSize = s; currentPage = 1; loadTableData(); } });
            loadTableData();
        }

        // 小时级充放电分布权重（模拟真实 BESS 调度：凌晨低价充电，傍晚高价放电）
        const hourlyChargeWeight = [0.08,0.08,0.09,0.09,0.08,0.06,0.04,0.02,0.01,0.01,0.01,0.01,0.01,0.02,0.02,0.03,0.03,0.03,0.04,0.04,0.05,0.05,0.06,0.07];
        const hourlyDischargeWeight = [0.01,0.01,0.01,0.01,0.01,0.01,0.02,0.03,0.04,0.04,0.03,0.03,0.03,0.04,0.05,0.06,0.08,0.09,0.09,0.08,0.06,0.05,0.04,0.02];
        // 月级权重（夏季用电高峰收益更高）
        const monthlyWeight = [0.07,0.07,0.08,0.08,0.08,0.09,0.10,0.10,0.09,0.08,0.08,0.08];

        // 表格直接读取 sharedData，不再独立生成数据
        function generateTableData() {
            const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
            const titleEl = document.getElementById('tableTitle');
            if (titleEl) titleEl.textContent = currentStation || t('report.table.title', '站点明细');
            const headerEl = document.getElementById('timeColumnHeader');
            if (headerEl) {
                const headerMap = {
                    day: t('report.table.period', '时段'),
                    month: t('report.table.dateCol', '日期'),
                    year: t('report.table.monthCol', '月份'),
                    total: t('report.table.yearCol', '年份')
                };
                headerEl.textContent = headerMap[currentTimePeriod] || t('report.table.period', '时段');
            }
            tableData = sharedData.rows;
        }

        function loadTableData() {
            const tbody = document.getElementById('tableBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            const t = (k, f) => window.i18n ? window.i18n.getText(k) : f;
            if (!tableData.length) { generateTableData(); if (!tableData.length) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--color-text-secondary);">${t('report.table.noData', '暂无数据')}</td></tr>`; return; } }

            const start = (currentPage-1)*pageSize, end = Math.min(start+pageSize, tableData.length);
            const pageData = tableData.slice(start, end);

            pageData.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="white-space:nowrap;font-weight:500;">${row.timeLabel}</td>
                    <td>${row.charge.toFixed(2)}</td>
                    <td>${row.discharge.toFixed(2)}</td>
                    <td>$${row.avgBuyPrice.toFixed(1)}</td>
                    <td>$${row.avgSellPrice.toFixed(1)}</td>
                    <td>$${row.chargeCost.toLocaleString()}</td>
                    <td>$${row.dischargeRevenue.toLocaleString()}</td>
                    <td class="${row.netProfit>=0?'profit-positive':'profit-negative'}">$${row.netProfit.toLocaleString()}</td>`;
                tbody.appendChild(tr);
            });

            // 合计行
            const totals = tableData.reduce((s,r) => ({ charge:s.charge+r.charge, discharge:s.discharge+r.discharge, cost:s.cost+r.chargeCost, revenue:s.revenue+r.dischargeRevenue, profit:s.profit+r.netProfit }), {charge:0,discharge:0,cost:0,revenue:0,profit:0});
            const avgBuy = totals.charge > 0 ? (totals.cost / totals.charge).toFixed(1) : '0.0';
            const avgSell = totals.discharge > 0 ? (totals.revenue / totals.discharge).toFixed(1) : '0.0';
            const totalRow = document.createElement('tr');
            totalRow.style.borderTop = '2px solid var(--color-border)';
            totalRow.style.background = 'var(--color-bg)';
            totalRow.innerHTML = `
                <td style="text-align:center;font-weight:600;color:var(--color-primary);">${t('report.table.total', '合计')}</td>
                <td style="font-weight:600;">${totals.charge.toFixed(2)}</td>
                <td style="font-weight:600;">${totals.discharge.toFixed(2)}</td>
                <td style="font-weight:600;">$${avgBuy}</td>
                <td style="font-weight:600;">$${avgSell}</td>
                <td style="font-weight:600;">$${totals.cost.toLocaleString()}</td>
                <td style="font-weight:600;">$${totals.revenue.toLocaleString()}</td>
                <td class="${totals.profit>=0?'profit-positive':'profit-negative'}" style="font-weight:600;">$${totals.profit.toLocaleString()}</td>`;
            tbody.appendChild(totalRow);
        }

        function refreshTableData() {
            generateTableData(); currentPage = 1;
            if (pagination) pagination = new Pagination({ containerId:'paginationContainer', currentPage:1, pageSize, totalItems:tableData.length, onPageChange:p=>{currentPage=p;loadTableData();}, onPageSizeChange:s=>{pageSize=s;currentPage=1;loadTableData();} });
            loadTableData();
        }
    