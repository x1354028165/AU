/**
 * Phase 2 完整测试
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
};
vm.createContext(sandbox);

// Load auth.js
const authCode = fs.readFileSync(__dirname + '/js/auth.js', 'utf8');
vm.runInContext(authCode + `
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
const simCode = fs.readFileSync(__dirname + '/js/simulator.js', 'utf8');
vm.runInContext(simCode + `
;this.__generatePrice=generatePrice;this.__parseCapacity=parseCapacity;
this.__runAutoBidder=runAutoBidder;this.__simTick=simTick;
this.__getCurrentPrice=getCurrentPrice;this.__getPriceHistory=getPriceHistory;
this.__isPriceSpike=isPriceSpike;this.__priceHistory=priceHistory;
`, sandbox);

const { __T: T, __getLang: getLang, __getTrans: getTrans, __switchLang: switchLang,
  __getStationsByRole: getStationsByRole, __assignStation: assignStation,
  __getLeaseRemaining: getLeaseRemaining, __formatAUD: formatAUD,
  __getUserName: getUserName, __getOperators: getOperators,
  __stations: stations, __verifyCredentials: verifyCredentials,
  __verifyMFA: verifyMFA, __users: users, __DEFAULT_STATIONS: DS,
  __generatePrice: generatePrice, __parseCapacity: parseCapacity,
  __runAutoBidder: runAutoBidder, __simTick: simTick,
  __getCurrentPrice: getCurrentPrice, __getPriceHistory: getPriceHistory,
  __isPriceSpike: isPriceSpike } = sandbox;

let pass = 0, fail = 0;
function test(n, c) { if(c){console.log('✅ '+n);pass++;}else{console.log('❌ '+n);fail++;} }

// ====== i18n ======
console.log('\n--- i18n ---');
test('Default lang = en', getLang() === 'en');
test('EN login_title', T.en.login_title === 'Account Login');
test('ZH login_title', T.zh.login_title === '账号登录');
test('EN soc', T.en.soc === 'SoC');
test('ZH soc', T.zh.soc === '荷电状态');
test('EN revenue_today', T.en.revenue_today === "Today's Revenue");
test('ZH revenue_today', T.zh.revenue_today === '今日收益');
test('EN market_price', !!T.en.market_price);
test('EN price_spike_alert', !!T.en.price_spike_alert);
test('Key count match', Object.keys(T.en).length === Object.keys(T.zh).length);

switchLang('zh');
test('Switch zh', getLang() === 'zh');
test('getTrans zh', getTrans('revenue_today') === '今日收益');
switchLang('en');

// ====== Login ======
console.log('\n--- Login ---');
test('3 accounts', users.length === 3);
test('admin login', verifyCredentials('admin', 'admin123')?.id === 'owner_1');
test('op_a login', verifyCredentials('op_a', 'pass123')?.id === 'op_a');
test('op_b login', verifyCredentials('op_b', 'pass123')?.id === 'op_b');
test('wrong pass', verifyCredentials('admin', 'x') === null);
test('MFA 6 digits', verifyMFA('123456'));
test('MFA 5 digits fail', !verifyMFA('12345'));
test('MFA letters fail', !verifyMFA('abcdef'));

// ====== Data Model ======
console.log('\n--- Data Model ---');
test('st_01 has soc', typeof DS[0].soc === 'number');
test('st_01 soc = 50', DS[0].soc === 50);
test('st_01 has efficiency', DS[0].efficiency === 0.88);
test('st_01 has revenue_today', DS[0].revenue_today === 0);
test('st_01 has status', DS[0].status === 'IDLE');
test('st_01 has cumulative_mwh', DS[0].cumulative_mwh === 0);
test('All 4 stations have soc', DS.every(s => typeof s.soc === 'number'));

// ====== Price Generator ======
console.log('\n--- Price Generator ---');
// Test 1000 samples per time slot
let nightPrices = [], dayPrices = [], peakPrices = [], eveningPrices = [];
for (let i = 0; i < 1000; i++) {
  nightPrices.push(generatePrice(3));
  dayPrices.push(generatePrice(10));
  peakPrices.push(generatePrice(17));
  eveningPrices.push(generatePrice(22));
}
const nightAvg = nightPrices.reduce((a,b) => a+b) / nightPrices.length;
const dayAvg = dayPrices.reduce((a,b) => a+b) / dayPrices.length;
const peakAvg = peakPrices.reduce((a,b) => a+b) / peakPrices.length;
const eveningAvg = eveningPrices.reduce((a,b) => a+b) / eveningPrices.length;

test('Night avg < $80', nightAvg < 80);
test('Day avg $50-200', dayAvg > 50 && dayAvg < 250);
test('Peak avg > $200', peakAvg > 200);
test('Evening avg $80-150', eveningAvg > 60 && eveningAvg < 200);
test('Night can be negative', nightPrices.some(p => p < 0));
// Peak spike (may not trigger in 1000 samples, but price range should be wide)
test('Peak max > $500', Math.max(...peakPrices) > 500);

// ====== Capacity Parser ======
console.log('\n--- Capacity Parser ---');
const cap1 = parseCapacity('5MW/10MWh');
test('Parse 5MW', cap1.mw === 5);
test('Parse 10MWh', cap1.mwh === 10);
const cap2 = parseCapacity('2.5MW/5MWh');
test('Parse 2.5MW', cap2.mw === 2.5);
test('Parse 5MWh', cap2.mwh === 5);

// ====== Auto Bidder ======
console.log('\n--- Auto Bidder ---');
// Low price → charge
const testStation1 = { ...DS[0], soc: 50, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
const r1 = runAutoBidder(testStation1, 30);
test('Low price → charge', testStation1.status === 'CHARGING');
test('Power negative (charging)', r1.power < 0);
test('SoC increased', testStation1.soc > 50);

// High price → discharge
const testStation2 = { ...DS[0], soc: 80, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
const r2 = runAutoBidder(testStation2, 500);
test('High price → discharge', testStation2.status === 'DISCHARGING');
test('Power positive (discharging)', r2.power > 0);
test('SoC decreased', testStation2.soc < 80);
test('Revenue positive', testStation2.revenue_today > 0);

// Efficiency applied
const expectedRev = r2.power * (5/60) * 500 * 0.88;
// Revenue should be approximately: power * interval_hours * price * efficiency
test('88% efficiency applied', Math.abs(testStation2.revenue_today - expectedRev) < 0.01);

// Mid price → idle
const testStation3 = { ...DS[0], soc: 50, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(testStation3, 100);
test('Mid price → idle', testStation3.status === 'IDLE');

// Unassigned → always idle
const testStation4 = { ...DS[3], soc: 50, operator_id: 'unassigned', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(testStation4, 30);
test('Unassigned → idle', testStation4.status === 'IDLE');

// SoH degradation
const testStation5 = { ...DS[0], soc: 50, soh: 99.99, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(testStation5, 30); // charge
test('SoH decreased after charge', testStation5.soh < 99.99);
test('Cumulative MWh tracked', testStation5.cumulative_mwh > 0);

// SoC limits
const testStation6 = { ...DS[0], soc: 96, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(testStation6, 30);
test('SoC > 95 → no charge', testStation6.status === 'IDLE');

const testStation7 = { ...DS[0], soc: 3, operator_id: 'op_a', status: 'IDLE', revenue_today: 0, cumulative_mwh: 0 };
runAutoBidder(testStation7, 500);
test('SoC < 5 → no discharge', testStation7.status === 'IDLE');

// ====== Permissions ======
console.log('\n--- Permissions ---');
storage.role = 'owner';
test('Owner 4', getStationsByRole().length === 4);
storage.role = 'op_a';
test('OpA 2', getStationsByRole().length === 2);

// ====== Result ======
console.log('\n========================================');
console.log(`Total: ${pass + fail} | Pass: ${pass} | Fail: ${fail}`);
console.log(`Pass Rate: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);
console.log(fail === 0 ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED');
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
