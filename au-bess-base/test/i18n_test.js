/**
 * i18n 全局翻译自动化测试
 * 运行: node test/i18n_test.js
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push('❌ ' + msg);
  }
}

// ========== 1. 加载 TRANSLATIONS ==========
const authCode = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf-8');
const m = authCode.match(/const TRANSLATIONS\s*=\s*(\{[\s\S]*?\n\};)/);
if (!m) { console.log('FATAL: Cannot extract TRANSLATIONS'); process.exit(1); }
eval('var TRANSLATIONS = ' + m[1]);

const enKeys = Object.keys(TRANSLATIONS.en).sort();
const zhKeys = Object.keys(TRANSLATIONS.zh).sort();

// ========== 测试组 1: Key 对齐 ==========
console.log('\n📋 测试组 1: EN/ZH Key 完全对齐');
assert(enKeys.length === zhKeys.length, `Key 数量不一致: EN=${enKeys.length}, ZH=${zhKeys.length}`);

const missingInZh = enKeys.filter(k => !TRANSLATIONS.zh.hasOwnProperty(k));
const missingInEn = zhKeys.filter(k => !TRANSLATIONS.en.hasOwnProperty(k));
assert(missingInZh.length === 0, `EN 有但 ZH 缺少: ${missingInZh.join(', ')}`);
assert(missingInEn.length === 0, `ZH 有但 EN 缺少: ${missingInEn.join(', ')}`);

// ========== 测试组 2: 值非空 ==========
console.log('📋 测试组 2: 所有翻译值非空');
enKeys.forEach(k => {
  assert(TRANSLATIONS.en[k] !== '', `EN['${k}'] 值为空`);
  assert(TRANSLATIONS.en[k] !== undefined, `EN['${k}'] 值为 undefined`);
});
zhKeys.forEach(k => {
  assert(TRANSLATIONS.zh[k] !== '', `ZH['${k}'] 值为空`);
  assert(TRANSLATIONS.zh[k] !== undefined, `ZH['${k}'] 值为 undefined`);
});

// ========== 测试组 3: EN 值不含中文 ==========
console.log('📋 测试组 3: EN 值不含中文字符');
const zhCharRe = /[\u4e00-\u9fff]/;
enKeys.forEach(k => {
  assert(!zhCharRe.test(String(TRANSLATIONS.en[k])), `EN['${k}'] 包含中文: "${TRANSLATIONS.en[k]}"`);
});

// ========== 测试组 4: ZH 值确实包含中文（排除纯数字/符号/英文缩写类） ==========
console.log('📋 测试组 4: ZH 值包含中文（非纯英文）');
const exemptKeys = ['app_title', 'bess_label', 'soc', 'soh', 'kpi_avg_soc', 'kpi_avg_soh']; // 允许英文缩写
zhKeys.forEach(k => {
  if (exemptKeys.includes(k)) return;
  const val = String(TRANSLATIONS.zh[k]);
  // 如果长度 > 3 且不含中文，可能是漏翻译
  if (val.length > 5) {
    assert(zhCharRe.test(val), `ZH['${k}'] 可能未翻译（无中文）: "${val}"`);
  }
});

// ========== 测试组 5: 所有 getTrans() 调用的 key 存在 ==========
console.log('📋 测试组 5: getTrans() 调用的 key 全部存在');
const jsFiles = ['js/reports.js', 'js/ui_router.js', 'js/simulator.js', 'js/auth.js'];
const allGetTransKeys = new Set();
jsFiles.forEach(f => {
  try {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf-8');
    const re = /getTrans\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = re.exec(code)) !== null) allGetTransKeys.add(match[1]);
  } catch(e) {}
});
allGetTransKeys.forEach(k => {
  assert(TRANSLATIONS.en.hasOwnProperty(k), `getTrans('${k}') 在 EN 中不存在`);
  assert(TRANSLATIONS.zh.hasOwnProperty(k), `getTrans('${k}') 在 ZH 中不存在`);
});

// ========== 测试组 6: 硬编码中文扫描（非注释行） ==========
console.log('📋 测试组 6: JS 代码无硬编码中文（排除注释）');
['js/reports.js', 'js/ui_router.js', 'js/simulator.js'].forEach(f => {
  const lines = fs.readFileSync(path.join(__dirname, '..', f), 'utf-8').split('\n');
  lines.forEach((line, i) => {
    const s = line.trim();
    if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
    // 找引号/反引号内的中文
    const strings = line.match(/['"`][^'"`]*[\u4e00-\u9fff][^'"`]*['"`]/g);
    if (strings) {
      strings.forEach(str => {
        // 排除 getTrans 同行的情况和 zhCharRe 变量
        if (line.includes('getTrans') || line.includes('zhCharRe') || line.includes('CITY_NAMES') || line.includes('tzGmtMap')) return;
        assert(false, `${f}:${i+1} 硬编码中文: ${str.substring(0, 60)}`);
      });
    }
  });
});

// ========== 测试组 7: 硬编码英文用户可见文案扫描 ==========
console.log('📋 测试组 7: 模板字符串中无硬编码英文文案');
const enHardcodePatterns = [
  />\s*(Status|Coming soon|Portfolio Health|Asset Rental|Monthly Rental|Core Device|No devices|Failed to)\s*</i,
  />\s*(Awaiting|Fixed by|Ack'd by|All Clear)\s*</i,
];
['js/reports.js', 'js/ui_router.js'].forEach(f => {
  const lines = fs.readFileSync(path.join(__dirname, '..', f), 'utf-8').split('\n');
  lines.forEach((line, i) => {
    if (line.trim().startsWith('//')) return;
    enHardcodePatterns.forEach(pat => {
      const match = line.match(pat);
      if (match && !line.includes('getTrans')) {
        assert(false, `${f}:${i+1} 硬编码英文: "${match[1]}"`);
      }
    });
  });
});

// ========== 测试组 8: (ALARM) 标签使用 getTrans ==========
console.log('📋 测试组 8: (ALARM) 标签走翻译');
['js/ui_router.js'].forEach(f => {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf-8');
  const alarmHardcode = code.match(/["'`]\(ALARM\)["'`]/g);
  assert(!alarmHardcode, `${f} 仍有硬编码 (ALARM): ${alarmHardcode}`);
});

// ========== 测试组 9: formatLocalTime 城市名国际化 ==========
console.log('📋 测试组 9: formatLocalTime 支持中文城市名');
assert(authCode.includes('CITY_NAMES_ZH'), 'auth.js 缺少 CITY_NAMES_ZH 城市名映射');
assert(authCode.includes("'悉尼'"), 'CITY_NAMES_ZH 缺少悉尼');
assert(authCode.includes("'墨尔本'"), 'CITY_NAMES_ZH 缺少墨尔本');
assert(authCode.includes("'布里斯班'"), 'CITY_NAMES_ZH 缺少布里斯班');
assert(authCode.includes("getLang"), 'formatLocalTime 未检查语言');

// ========== 测试组 10: 告警消息翻译兼容 ==========
console.log('📋 测试组 10: 告警消息翻译 key');
assert(TRANSLATIONS.en.hasOwnProperty('alarm_msg_temp'), '缺少 alarm_msg_temp');
assert(TRANSLATIONS.en.hasOwnProperty('alarm_msg_soc'), '缺少 alarm_msg_soc');
assert(TRANSLATIONS.en['alarm_msg_temp'].includes('{0}'), 'alarm_msg_temp EN 缺少 {0} 占位符');
assert(TRANSLATIONS.zh['alarm_msg_temp'].includes('{0}'), 'alarm_msg_temp ZH 缺少 {0} 占位符');
assert(TRANSLATIONS.en['alarm_msg_soc'].includes('{0}'), 'alarm_msg_soc EN 缺少 {0} 占位符');
assert(TRANSLATIONS.zh['alarm_msg_soc'].includes('{0}'), 'alarm_msg_soc ZH 缺少 {0} 占位符');

// ========== 测试组 11: 描述模板参数化翻译 ==========
console.log('📋 测试组 11: 参数化翻译模板');
['avg_soh_desc', 'rental_rate_desc', 'annual_label'].forEach(k => {
  assert(TRANSLATIONS.en[k].includes('{0}'), `EN['${k}'] 缺少 {0} 占位符`);
  assert(TRANSLATIONS.zh[k].includes('{0}'), `ZH['${k}'] 缺少 {0} 占位符`);
});

// ========== 测试组 12: 语法验证 ==========
console.log('📋 测试组 12: JS 文件语法正确');
const { execSync } = require('child_process');
jsFiles.forEach(f => {
  try {
    execSync(`node -c ${path.join(__dirname, '..', f)}`, { stdio: 'pipe' });
    passed++;
  } catch(e) {
    failed++;
    errors.push(`❌ ${f} 语法错误: ${e.message}`);
  }
});

// ========== 测试组 13: HTML 版本号更新 ==========
console.log('📋 测试组 13: HTML 资源版本号');
['dashboard.html', 'index.html'].forEach(f => {
  const html = fs.readFileSync(path.join(__dirname, '..', f), 'utf-8');
  const vMatches = html.match(/\?v=(\d+)/g);
  assert(vMatches && vMatches.length > 0, `${f} 缺少版本号参数`);
});

// ========== 结果 ==========
console.log('\n' + '='.repeat(50));
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}  📊 总用例: ${passed + failed}`);
if (errors.length) {
  console.log('\n失败详情:');
  errors.forEach(e => console.log('  ' + e));
}
console.log('='.repeat(50));
process.exit(failed > 0 ? 1 : 0);
