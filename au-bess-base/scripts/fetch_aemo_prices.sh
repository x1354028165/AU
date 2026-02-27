#!/bin/bash
# 从 AEMO NEMWeb 下载最近的区域电价数据，生成 JSON
# 输出到 au-bess-base/data/aemo_prices.json

set -e
WORK_DIR="/tmp/aemo_fetch"
OUT_DIR="/root/projects/aus-energy/au-bess-base/data"
mkdir -p "$WORK_DIR" "$OUT_DIR"

# 获取最近的文件列表（取最新50个，约4小时数据）
echo "Fetching file list from NEMWeb..."
FILE_LIST=$(curl -sL "https://nemweb.com.au/Reports/Current/DispatchIS_Reports/" | grep -oP 'PUBLIC_DISPATCHIS_[^"]+\.zip' | tail -50)

echo "Downloading and extracting..."
PRICES_CSV="$WORK_DIR/all_prices.csv"
> "$PRICES_CSV"

for f in $FILE_LIST; do
  curl -sO "https://nemweb.com.au/Reports/Current/DispatchIS_Reports/$f" --output-dir "$WORK_DIR" 2>/dev/null || continue
  cd "$WORK_DIR"
  unzip -oq "$f" 2>/dev/null || continue
  CSV_FILE="${f%.zip}.CSV"
  if [ -f "$CSV_FILE" ]; then
    grep "^D,DISPATCH,PRICE" "$CSV_FILE" >> "$PRICES_CSV" 2>/dev/null
    rm -f "$CSV_FILE"
  fi
  rm -f "$f"
  cd /root/projects/aus-energy
done

# 解析为 JSON
echo "Generating JSON..."
python3 << 'PYEOF'
import csv
import json
from collections import defaultdict

prices = defaultdict(list)

with open("/tmp/aemo_fetch/all_prices.csv", "r") as f:
    for line in f:
        parts = line.strip().split(",")
        if len(parts) < 11:
            continue
        # D,DISPATCH,PRICE,5,"2026/02/27 15:55:00",1,NSW1,20260227143,0,37.89019,...
        timestamp = parts[4].strip('"')
        region = parts[6].strip()
        rrp = float(parts[9])
        prices[region].append({
            "time": timestamp,
            "price": round(rrp, 2)
        })

# 按时间排序
for region in prices:
    prices[region].sort(key=lambda x: x["time"])

result = {
    "source": "AEMO NEMWeb DispatchIS",
    "updated": prices.get("NSW1", [{}])[-1].get("time", ""),
    "regions": dict(prices)
}

with open("/root/projects/aus-energy/au-bess-base/data/aemo_prices.json", "w") as f:
    json.dump(result, f, indent=2)

print(f"Done. Regions: {list(prices.keys())}, Points per region: {len(prices.get('NSW1', []))}")
PYEOF

echo "Output: $OUT_DIR/aemo_prices.json"
