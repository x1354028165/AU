/**
 * Phase 3 完整测试
 */
const fs = require('fs');
const vm = require('vm');

const storage = {};
const sandbox = {
  localStorage: {
    getItem: k => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  navigator: { language: 'en-AU' },
  window: {},
  console, Date, JSON, Math, parseInt, parseFloat, String, Number, Array, Object, RegExp,
  setInterval: () => 999, clearInterval: () => {},
  Blob: class { constructor(a, b) { this.data = a; this.type = b; } },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  document: {
    createElement: () => ({ click: () => {}, href: '', download: '' }),
    body: { appendChild: () => {}, removeChild: () => {} }
  },
};
vm.createContext(sandbox);

// Load auth.js
vm.runInContext(fs.readFileSync(__dirname + '/js/auth.js', 'utf8') + `
;this.__T=TRANSLATIONS;this.__getLang=getLang;this.__getTrans=getTrans;
this.__switchLang=switchLang;this.__toggleLang=toggleLang;
this.__getCurrentUser=getCurrentUser;this.__getUserName=getUserName;
this.__getOperators=getOperators;this.__getStationsByRole=getStationsByRole;
this.__assignStation=assignStation;this.__getLeaseRemaining=getLeaseRemaining;
this.__formatAUD=formatAUD;this.__stations=stations;
this.__verifyCredentials=verifyCredentials;this.__verifyMFA=verifyMFA;
this.__users=users;this.__DEFAULT_STATIONS=DEFAULT_STATIONS;
`, sandbox);

// Load simulator.js
vm.runInContext(fs.readFileSync(__dirname + '/js/simulator.js', 'utf8') + `
;this.__generatePrice=generatePrice;this.__parseCapacity=parseCapacity;
this.__runAutoBidder=runAutoBidder;this.__simTick=simTick;
this.__getCurrentPrice=getCurrentPrice;this.__getPriceHistory=getPriceHistory;
this.__isPriceSpike=isPriceSpike;this.__getDispatchLogs=getDispatchLogs;
this.__logDispatch=logDispatch;this.__dispatchLogs=dispatchLogs;
`, sandbox);

// Load reports.js
vm.runInContext(fs.readFileSync(__dirname + '/js/reports.js', 'utf8') + `
;this.__downloadCSV=downloadCSV;this.__exportLeaderboardCSV=exportLeaderboardCSV;
this.__exportLogsCSV=exportLogsCSV;
`, sandbox);

const { __T: T, __getLang: getLang, __getTrans: getTrans, __switchLang: switchLang,
  __getStationsByRole: getStationsByRole, __assignStation: assignStation,
  __getLeaseRemaining: getLeaseRemaining, __formatAUD: formatAUD,
  __getUserName: getUserName, __getOperators: getOperators,
  __stations: stations, __verifyCredentials: verifyCredentials,
  __verifyMFA: verifyMFA, __users: users, __DEFAULT_STATIONS: DS,
  __generatePrice: generatePrice, __parseCapacity: parseCapacity,
  __runAutoBidder: runAutoBidder, __simTick: simTick,
  __getCurrentPrice: getCurrentPrice, __getDispatchLogs: getDispatchLogs,
  __logDispatch: logDispatch, __dispatchLogs: dispatchLogs,
  __downloadCSV: downloadCSV } = sandbox;

let pass = 0, fail = 0;
function test(n, c) { if(c){console.log('✅ '+n);pass++;}else{console.log('❌ '+n);fail++;} }

// ====== i18n (Phase 3 additions) ======
console.log('\n--- i18n Phase 3 ---');
test('Default lang = en', getLang() === 'en');
test('EN export_csv', T.en.export_csv === 'Export CSV');
test('ZH export_csv', T.zh.export_csv === '导出 CSV');
test('EN leaderboard', T.en.leaderboard === 'Operator Leaderboard');
test('ZH leaderboard', T.zh.leaderboard === '运维方绩效榜');
test('EN logs_title', T.en.logs_title === 'Dispatch Logs');
test('ZH logs_title', T.zh.logs_title === '调度日志');
test('EN table_rev_per_mw', T.en.table_rev_per_mw === 'Revenue/MW');
test('EN table_soh_loss', T.en.table_soh_loss === 'SoH Loss');
test('EN no_logs', !!T.en.no_logs);
test('Key count match', Object.keys(T.en).length === Object.keys(T.zh).length);

switchLang('zh');
test('ZH getTrans export', getTrans('export_csv') === '导出 CSV');
switchLang('en');

// ====== Login ======
console.log('\n--- Login ---');
test('admin login', verifyCredentials('admin', 'admin123')?.id === 'owner_1');
test('op_a login', verifyCredentials('op_a', 'pass123')?.id === 'op_a');
test('op_b login', verifyCredentials('op_b', 'pass123')?.id === 'op_b');
test('MFA valid', verifyMFA('123456'));
test('MFA invalid', !verifyMFA('abc'));

// ====== Data Model ======
console.log('\n--- Data Model ---');
test('All have soc', DS.every(s => typeof s.soc === 'number'));
test('All have efficiency 0.88', DS.every(s => s.efficiency === 0.88));

// ====== Price & Bidder ======
console.log('\n--- Price & Bidder ---');
let prices = []; for(let i=0;i<100;i++) prices.push(generatePrice(17));
test('Peak prices generated', prices.every(p => typeof p === 'number'));

const ts1 = { ...DS[0], soc: 50, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(ts1, 30);
test('Charge at $30', ts1.status === 'CHARGING');

const ts2 = { ...DS[0], soc: 80, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(ts2, 500);
test('Discharge at $500', ts2.status === 'DISCHARGING');
test('88% eff', ts2.revenue_today > 0);

// ====== Dispatch Logs ======
console.log('\n--- Dispatch Logs ---');
// Manually log some entries
logDispatch('10:00:00', { name: 'TestA', id: 'st_01', operator_id: 'op_a' }, 'CHARGING', 30, -12.5);
logDispatch('10:05:00', { name: 'TestA', id: 'st_01', operator_id: 'op_a' }, 'DISCHARGING', 500, 183.33);
logDispatch('10:10:00', { name: 'TestB', id: 'st_02', operator_id: 'op_b' }, 'CHARGING', 25, -10.42);

test('All logs = 3', getDispatchLogs().length === 3);
test('OpA logs = 2', getDispatchLogs('op_a').length === 2);
test('OpB logs = 1', getDispatchLogs('op_b').length === 1);
test('Log has time', getDispatchLogs()[0].time === '10:00:00');
test('Log has stationName', getDispatchLogs()[0].stationName === 'TestA');
test('Log has action', getDispatchLogs()[0].action === 'CHARGING');
test('Log has price', getDispatchLogs()[0].price === 30);
test('Log has revenue', getDispatchLogs()[0].revenue === -12.5);

// ====== CSV Export ======
console.log('\n--- CSV Export ---');
// Test downloadCSV doesn't throw
let csvOk = true;
try { downloadCSV([['a','b'],[1,2]], 'test.csv'); } catch(e) { csvOk = false; }
test('downloadCSV no throw', csvOk);

// ====== Permissions ======
console.log('\n--- Permissions ---');
storage.role = 'owner';
test('Owner 4', getStationsByRole().length === 4);
storage.role = 'op_a';
test('OpA 2', getStationsByRole().length === 2);

// ====== Utilities ======
console.log('\n--- Utilities ---');
test('Lease future', getLeaseRemaining('2028-12-31') > 0);
test('Lease past', getLeaseRemaining('2020-01-01') < 0);
test('AUD format', formatAUD(850000).startsWith('A$'));
test('Parse cap', parseCapacity('10MW/20MWh').mw === 10);

// ====== Result ======
console.log('\n========================================');
console.log(`Total: ${pass + fail} | Pass: ${pass} | Fail: ${fail}`);
console.log(`Pass Rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);
console.log(fail === 0 ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED');
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
