/**
 * AEMO Real-time Price Proxy
 * 每5分钟从 nemweb.com.au 拉取最新 Dispatch 数据
 * 提供 /api/aemo/nsw1 JSON endpoint
 */
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = 8081;
const REGION = 'NSW1';
const CACHE_FILE = '/tmp/aemo_cache.json';
const FETCH_INTERVAL = 5 * 60 * 1000; // 5min

let cachedData = {
  price: null,
  demand: null,
  forecast_price: null,
  forecast_demand: null,
  timestamp: null,
  source: 'nemweb.com.au',
  region: REGION
};

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getLatestDispatchFile() {
  try {
    const res = await httpGet('http://nemweb.com.au/Reports/Current/DispatchIS_Reports/');
    const html = res.data.toString();
    // 解析所有 zip 文件链接，取最新的
    const matches = [...html.matchAll(/HREF="([^"]*PUBLIC_DISPATCHIS_[^"]+\.zip)"/g)];
    if (!matches.length) return null;
    const latest = matches[matches.length - 1][1];
    return latest.startsWith('http') ? latest : 'http://nemweb.com.au' + latest;
  } catch (e) {
    console.error('Error listing dispatch files:', e.message);
    return null;
  }
}

function parseCSV(csvText, region) {
  const lines = csvText.split('\n');
  let price = null, demand = null;

  for (const line of lines) {
    // Parse CSV properly handling quoted fields
    const cols = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    if (cols.length < 6) continue;
    const recType = cols[0];
    const table = (cols[2] || '').toUpperCase();

    // D,DISPATCH,PRICE,5,settlementdate,runno,REGIONID,dispatchinterval,intervention,RRP,...
    if (recType === 'D' && table === 'PRICE') {
      // Header: I,DISPATCH,PRICE,5,SETTLEMENTDATE,RUNNO,REGIONID,DISPATCHINTERVAL,INTERVENTION,RRP
      // So REGIONID=cols[6], RRP=cols[9]
      const rid = (cols[6] || '').toUpperCase();
      if (rid === region && cols.length > 9) {
        const rrp = parseFloat(cols[9]);
        if (!isNaN(rrp) && Math.abs(rrp) < 20000) price = rrp;
      }
    }

    // D,DISPATCH,REGIONSUM,9,settlementdate,runno,REGIONID,dispatchinterval,intervention,TOTALDEMAND,...
    if (recType === 'D' && table === 'REGIONSUM') {
      const rid = (cols[6] || '').toUpperCase();
      if (rid === region && cols.length > 9) {
        const td = parseFloat(cols[9]);
        if (!isNaN(td) && td > 0 && td < 100000) demand = td;
      }
    }
  }
  return { price, demand };
}

async function fetchAEMOData() {
  try {
    console.log('[AEMO] Fetching latest dispatch data...');
    const zipUrl = await getLatestDispatchFile();
    if (!zipUrl) { console.error('[AEMO] No dispatch file found'); return; }

    console.log('[AEMO] Downloading:', zipUrl);
    const res = await httpGet(zipUrl);
    if (res.status !== 200) { console.error('[AEMO] HTTP', res.status); return; }

    // 解压 zip -> csv
    const tmpZip = '/tmp/aemo_dispatch.zip';
    fs.writeFileSync(tmpZip, res.data);

    // unzip
    try { execSync(`cd /tmp && unzip -o ${tmpZip} 2>/dev/null`); } catch(e) {}

    // 找解压出的 CSV
    const files = fs.readdirSync('/tmp').filter(f => f.startsWith('PUBLIC_DISPATCHIS') && f.endsWith('.CSV'));
    if (!files.length) { console.error('[AEMO] No CSV found in zip'); return; }

    const csvPath = path.join('/tmp', files[files.length - 1]);
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const parsed = parseCSV(csvText, REGION);

    if (parsed.price !== null) cachedData.price = parsed.price;
    if (parsed.demand !== null) cachedData.demand = parsed.demand;

    // forecast: 用 price * random factor 模拟（真实需要 P5MIN 数据）
    // 后续可接 PREDISPATCH 数据
    if (cachedData.price !== null) {
      cachedData.forecast_price = Math.round((cachedData.price * (0.9 + Math.random() * 0.2)) * 100) / 100;
      cachedData.forecast_demand = cachedData.demand ? Math.round(cachedData.demand * (0.98 + Math.random() * 0.04)) : null;
    }

    cachedData.timestamp = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachedData, null, 2));
    console.log('[AEMO] Updated:', JSON.stringify(cachedData));

    // 清理
    try { fs.unlinkSync(tmpZip); fs.unlinkSync(csvPath); } catch(e) {}
  } catch (e) {
    console.error('[AEMO] Fetch error:', e.message);
  }
}

// HTTP Server
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/aemo/nsw1' || req.url === '/api/aemo/NSW1') {
    res.end(JSON.stringify(cachedData));
  } else if (req.url === '/api/aemo/health') {
    res.end(JSON.stringify({ status: 'ok', lastUpdate: cachedData.timestamp }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found. Use /api/aemo/nsw1' }));
  }
});

// 启动
server.listen(PORT, () => {
  console.log(`[AEMO Proxy] Running on port ${PORT}`);
  // 立即拉一次
  fetchAEMOData();
  // 每5分钟拉一次
  setInterval(fetchAEMOData, FETCH_INTERVAL);
});
