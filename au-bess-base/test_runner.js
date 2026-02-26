/**
 * Phase 1 增强版完整测试
 * 运行: node test_runner.js
 */
const fs = require('fs');
const vm = require('vm');

// ====== 模拟浏览器环境 ======
const storage = {};
const sandbox = {
  localStorage: {
    getItem: k => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  },
  navigator: { language: 'zh-CN' },
  window: {},
  console: console,
  Date: Date,
  JSON: JSON,
  Math: Math,
  parseInt: parseInt,
  parseFloat: parseFloat,
  setTimeout: setTimeout,
  String: String,
  Number: Number,
  Array: Array,
  Object: Object,
};
vm.createContext(sandbox);

// ====== 加载 auth.js（用脚本方式，让 const 在 context 内部可见）======
const authCode = fs.readFileSync(__dirname + '/js/auth.js', 'utf8');

// 追加导出代码到 sandbox
const testWrapper = authCode + `
;
// 暴露到 sandbox 
this.__TRANSLATIONS = TRANSLATIONS;
this.__getLang = getLang;
this.__getTrans = getTrans;
this.__switchLang = switchLang;
this.__toggleLang = toggleLang;
this.__getCurrentUser = getCurrentUser;
this.__getUserName = getUserName;
this.__getOperators = getOperators;
this.__getStationsByRole = getStationsByRole;
this.__assignStation = assignStation;
this.__getLeaseRemaining = getLeaseRemaining;
this.__formatAUD = formatAUD;
this.__stations = stations;
`;

vm.runInContext(testWrapper, sandbox);

// ====== 提取函数 ======
const TRANSLATIONS = sandbox.__TRANSLATIONS;
const getLang = sandbox.__getLang;
const getTrans = sandbox.__getTrans;
const switchLang = sandbox.__switchLang;
const toggleLang = sandbox.__toggleLang;
const getStationsByRole = sandbox.__getStationsByRole;
const assignStation = sandbox.__assignStation;
const getLeaseRemaining = sandbox.__getLeaseRemaining;
const formatAUD = sandbox.__formatAUD;
const getUserName = sandbox.__getUserName;
const getOperators = sandbox.__getOperators;
const stations = sandbox.__stations;

// ====== 测试框架 ======
let pass = 0, fail = 0;
function test(name, condition) {
  if (condition) { console.log('✅ ' + name); pass++; }
  else { console.log('❌ ' + name); fail++; }
}

// ====== i18n 测试 ======
console.log('\n--- i18n Tests ---');
test('TRANSLATIONS.en exists', !!TRANSLATIONS.en);
test('TRANSLATIONS.zh exists', !!TRANSLATIONS.zh);
test('EN: assets_overview', TRANSLATIONS.en.assets_overview === 'Assets Overview');
test('ZH: assets_overview', TRANSLATIONS.zh.assets_overview === '资产概览');
test('EN: 24+ keys', Object.keys(TRANSLATIONS.en).length >= 24);
test('ZH: 24+ keys', Object.keys(TRANSLATIONS.zh).length >= 24);
test('ZH key count = EN key count', Object.keys(TRANSLATIONS.zh).length === Object.keys(TRANSLATIONS.en).length);

test('Auto detect zh-CN → zh', getLang() === 'zh');
test('getTrans default = 退出登录', getTrans('sign_out') === '退出登录');

switchLang('en');
test('Switch to en', getLang() === 'en');
test('getTrans en: Sign Out', getTrans('sign_out') === 'Sign Out');
test('getTrans en: Portfolio', getTrans('menu_portfolio') === 'Portfolio');
test('getTrans en: Pending Assignment', getTrans('pending_assignment') === 'Pending Assignment');

switchLang('zh');
test('Switch to zh', getLang() === 'zh');
test('getTrans zh: 退出登录', getTrans('sign_out') === '退出登录');
test('getTrans zh: 资产总览', getTrans('menu_portfolio') === '资产总览');
test('getTrans zh: 待分配', getTrans('pending_assignment') === '待分配');

toggleLang();
test('toggleLang zh→en', getLang() === 'en');
toggleLang();
test('toggleLang en→zh', getLang() === 'zh');

// ====== 权限隔离测试 ======
console.log('\n--- Permission Tests ---');
storage.role = 'owner';
test('Owner sees 4 stations', getStationsByRole().length === 4);

storage.role = 'op_a';
const opA = getStationsByRole();
test('OpA sees 2 stations', opA.length === 2);
test('OpA has st_01', opA.some(s => s.id === 'st_01'));
test('OpA has st_03', opA.some(s => s.id === 'st_03'));
test('OpA no st_02', !opA.some(s => s.id === 'st_02'));
test('OpA no st_04(unassigned)', !opA.some(s => s.id === 'st_04'));

storage.role = 'op_b';
const opB = getStationsByRole();
test('OpB sees 1 station', opB.length === 1);
test('OpB has st_02', opB[0].id === 'st_02');

// ====== 划转测试 ======
console.log('\n--- Assignment Tests ---');
test('Assign st_04→op_a succeeds', assignStation('st_04', 'op_a') === true);
test('st_04 operator = op_a', stations.find(s => s.id === 'st_04').operator_id === 'op_a');
test('Assign invalid station fails', assignStation('st_99', 'op_a') === false);

storage.role = 'op_a';
test('OpA now sees 3 stations', getStationsByRole().length === 3);
test('st_04 appears in OpA list', getStationsByRole().some(s => s.id === 'st_04'));

// ====== 持久化测试 ======
console.log('\n--- Persistence Tests ---');
test('Data persisted to localStorage', !!storage.stations);
const saved = JSON.parse(storage.stations);
test('Persisted st_04 = op_a', saved.find(s => s.id === 'st_04').operator_id === 'op_a');

// ====== 工具函数测试 ======
console.log('\n--- Utility Tests ---');
test('Lease future date > 0', getLeaseRemaining('2028-12-31') > 0);
test('Lease past date < 0', getLeaseRemaining('2020-01-01') < 0);
test('Lease unset = "-"', getLeaseRemaining('-') === '-');
test('AUD 850k includes "850"', formatAUD(850000).includes('850'));
test('AUD 850k starts with A$', formatAUD(850000).startsWith('A$'));
test('AUD 0 = "-"', formatAUD(0) === '-');
test('getUserName(op_a) = GreenGrid', getUserName('op_a') === 'GreenGrid Operations');
test('getUserName(owner_1) = Pacific', getUserName('owner_1') === 'Pacific Energy Group');
test('getOperators() = 2', getOperators().length === 2);

// ====== 结果 ======
console.log('\n========================================');
console.log(`Total: ${pass + fail} | Pass: ${pass} | Fail: ${fail}`);
console.log(`Pass Rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);
console.log(fail === 0 ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED');
console.log('========================================');

process.exit(fail > 0 ? 1 : 0);
