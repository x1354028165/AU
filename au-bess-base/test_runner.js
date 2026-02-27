/**
 * Phase 4 完整测试
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
  Blob: class { constructor(a,b){this.data=a;} },
  URL: { createObjectURL: ()=>'blob:test', revokeObjectURL: ()=>{} },
  document: { createElement: ()=>({click:()=>{},href:'',download:''}), body:{appendChild:()=>{},removeChild:()=>{}} },
};
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(__dirname+'/js/auth.js','utf8')+`
;this.__T=TRANSLATIONS;this.__getLang=getLang;this.__getTrans=getTrans;
this.__switchLang=switchLang;this.__stations=stations;this.__users=users;
this.__verifyCredentials=verifyCredentials;this.__verifyMFA=verifyMFA;
this.__getStationsByRole=getStationsByRole;this.__getOperators=getOperators;
this.__getUserName=getUserName;this.__formatAUD=formatAUD;
this.__getLeaseRemaining=getLeaseRemaining;this.__DEFAULT_STATIONS=DEFAULT_STATIONS;
this.__getCurrentUser=getCurrentUser;this.__assignStation=assignStation;
`, sandbox);

vm.runInContext(fs.readFileSync(__dirname+'/js/simulator.js','utf8')+`
;this.__generatePrice=generatePrice;this.__parseCapacity=parseCapacity;
this.__runAutoBidder=runAutoBidder;this.__getDispatchLogs=getDispatchLogs;
this.__logDispatch=logDispatch;this.__getCurrentPrice=getCurrentPrice;
`, sandbox);

vm.runInContext(fs.readFileSync(__dirname+'/js/reports.js','utf8')+`
;this.__downloadCSV=downloadCSV;
`, sandbox);

const { __T:T, __getLang:getLang, __getTrans:getTrans, __switchLang:switchLang,
  __stations:stations, __users:users, __verifyCredentials:verifyCredentials,
  __verifyMFA:verifyMFA, __getStationsByRole:getStationsByRole,
  __getOperators:getOperators, __getUserName:getUserName, __formatAUD:formatAUD,
  __getLeaseRemaining:getLeaseRemaining, __DEFAULT_STATIONS:DS,
  __getCurrentUser:getCurrentUser, __assignStation:assignStation,
  __generatePrice:generatePrice, __parseCapacity:parseCapacity,
  __runAutoBidder:runAutoBidder, __getDispatchLogs:getDispatchLogs,
  __logDispatch:logDispatch, __getCurrentPrice:getCurrentPrice,
  __downloadCSV:downloadCSV } = sandbox;

let pass=0, fail=0;
function test(n,c){if(c){console.log('✅ '+n);pass++;}else{console.log('❌ '+n);fail++;}}

// ====== i18n Phase 4 ======
console.log('\n--- i18n Phase 4 ---');
test('EN kpi_total_cap', T.en.kpi_total_cap === 'Total Capacity');
test('ZH kpi_total_cap', T.zh.kpi_total_cap === '总资产容量');
test('EN strategy_panel', T.en.strategy_panel === 'Dispatch Strategy');
test('ZH strategy_panel', T.zh.strategy_panel === '调度策略面板');
test('EN soh_trend', T.en.soh_trend === 'SoH Degradation Trend (30 Days)');
test('ZH soh_trend', T.zh.soh_trend === '电池健康度 30 天衰减趋势');
test('EN charge_at', !!T.en.charge_at);
test('EN discharge_at', !!T.en.discharge_at);
test('EN reserve_soc', !!T.en.reserve_soc);
test('EN emergency_charge', !!T.en.emergency_charge);
test('EN save_strategy', !!T.en.save_strategy);
test('Key count match', Object.keys(T.en).length === Object.keys(T.zh).length);

// ====== Data Model - Strategy ======
console.log('\n--- Strategy Data Model ---');
test('st_01 has strategy', !!DS[0].strategy);
test('st_01 charge_threshold=50', DS[0].strategy.charge_threshold === 50);
test('st_01 discharge_threshold=200', DS[0].strategy.discharge_threshold === 200);
test('st_01 reserve_soc=10', DS[0].strategy.reserve_soc === 10);
test('st_01 mode=auto', DS[0].strategy.mode === 'auto');
test('All 4 have strategy', DS.every(s => !!s.strategy));

// ====== Dynamic Strategy Bidder ======
console.log('\n--- Dynamic Strategy ---');

// Test custom charge threshold: set to $150, price $120 → should charge
const ts1 = { ...DS[0], soc:50, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:150, discharge_threshold:200, reserve_soc:10, mode:'auto' } };
runAutoBidder(ts1, 120);
test('Custom threshold $150: charge at $120', ts1.status === 'CHARGING');

// Default threshold: price $120 → should NOT charge (threshold=50)
const ts2 = { ...DS[0], soc:50, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:200, reserve_soc:10, mode:'auto' } };
runAutoBidder(ts2, 120);
test('Default threshold $50: idle at $120', ts2.status === 'IDLE');

// Custom discharge threshold: set to $100, price $150 → should discharge
const ts3 = { ...DS[0], soc:80, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:100, reserve_soc:10, mode:'auto' } };
runAutoBidder(ts3, 150);
test('Custom discharge $100: discharge at $150', ts3.status === 'DISCHARGING');

// Manual charge mode
const ts4 = { ...DS[0], soc:50, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:200, reserve_soc:10, mode:'manual_charge' } };
runAutoBidder(ts4, 500); // high price but forced charge
test('Manual charge at high price', ts4.status === 'CHARGING');

// Manual discharge mode
const ts5 = { ...DS[0], soc:80, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:200, reserve_soc:10, mode:'manual_discharge' } };
runAutoBidder(ts5, 10); // low price but forced discharge
test('Manual discharge at low price', ts5.status === 'DISCHARGING');

// Manual idle mode
const ts6 = { ...DS[0], soc:50, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:200, reserve_soc:10, mode:'manual_idle' } };
runAutoBidder(ts6, 30);
test('Manual idle ignores low price', ts6.status === 'IDLE');
runAutoBidder(ts6, 500);
test('Manual idle ignores high price', ts6.status === 'IDLE');

// Reserve SoC: reserve=30, SoC=25 → cannot discharge
const ts7 = { ...DS[0], soc:25, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:200, reserve_soc:30, mode:'auto' } };
runAutoBidder(ts7, 500);
test('Reserve SoC 30%: no discharge at SoC 25%', ts7.status === 'IDLE');

// Efficiency
const ts8 = { ...DS[0], soc:80, operator_id:'op_a', status:'IDLE', revenue_today:0, cumulative_mwh:0,
  strategy: { charge_threshold:50, discharge_threshold:200, reserve_soc:10, mode:'auto' } };
runAutoBidder(ts8, 500);
test('Revenue > 0 with efficiency', ts8.revenue_today > 0);
const cap = parseCapacity(DS[0].capacity);
const expected = cap.mw * (5/60) * 500 * 0.88;
test('88% efficiency correct', Math.abs(ts8.revenue_today - expected) < 0.01);

// ====== Previous tests still pass ======
console.log('\n--- Existing Tests ---');
test('Login admin', verifyCredentials('admin','admin123')?.id === 'owner_1');
test('MFA valid', verifyMFA('123456'));
test('MFA invalid', !verifyMFA('abc'));
storage.role='owner';
test('Owner 4', getStationsByRole().length === 4);
storage.role='op_a';
test('OpA 2', getStationsByRole().length === 2);
test('Lease future', getLeaseRemaining('2028-12-31') > 0);
test('AUD format', formatAUD(850000).startsWith('A$'));
test('Parse cap', parseCapacity('5MW/10MWh').mw === 5);

// ====== Dispatch Logs ======
console.log('\n--- Dispatch Logs ---');
logDispatch('12:00:00', {name:'Test',id:'st_01',operator_id:'op_a'}, 'CHARGING', 30, -10);
test('Log recorded', getDispatchLogs().length >= 1);
test('Log filterable', getDispatchLogs('op_a').length >= 1);

// ====== CSV ======
let csvOk=true; try{downloadCSV([['a','b'],[1,2]],'t.csv');}catch(e){csvOk=false;}
test('CSV no throw', csvOk);

// ====== Result ======
console.log('\n========================================');
console.log(`Total: ${pass+fail} | Pass: ${pass} | Fail: ${fail}`);
console.log(`Pass Rate: ${((pass/(pass+fail))*100).toFixed(1)}%`);
console.log(fail===0?'🎉 ALL TESTS PASSED':'⚠️ SOME TESTS FAILED');
console.log('========================================');
process.exit(fail>0?1:0);
