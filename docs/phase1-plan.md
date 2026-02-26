# Phase 1 执行计划：权限与确权

**创建日期：** 2026-02-26
**状态：** 执行中

## 目标
实现纯前端 Demo，展示储能电站管理平台的角色权限、资产确权与划转功能。

## 技术栈
- Tailwind CSS 3.3+ (Play CDN)
- Lucide Icons 0.280+ (CDN)
- 纯前端，无后端，数据内存存储，角色用 localStorage

## 目录结构
```
au-bess-base/
├── index.html          # 登录入口
├── dashboard.html      # 主框架页面
├── js/
│   ├── auth.js         # 数据与权限逻辑
│   └── ui_router.js    # UI渲染与划转交互
└── css/
    └── main.css        # 样式与动画
```

## 执行步骤

### Step 1：创建项目骨架
- 在 `/root/projects/aus-energy/` 下创建 `au-bess-base/` 及子目录

### Step 2：编写 js/auth.js
- 定义 `stations` 数组（4个电站，含租约字段）
- 定义 `users` 数组（owner_1, op_a, op_b）
- 实现 `getCurrentUser()` — 从 localStorage 读取角色
- 实现 `getStationsByRole()` — 业主返回全量，运维方过滤匹配项
- 实现 `assignStation(id, opId)` — 更新 operator_id 并触发重新渲染

### Step 3：编写 js/ui_router.js
- 实现 `initDashboard()` — 入口函数
- 实现 `renderSidebar(role)` — 业主菜单 vs 运维方菜单
- 实现 `renderStationList()` — 生成电站卡片（业主含 Assign，运维仅查看）
- 实现 `handleAssign(id, targetOpId)` — confirm 确认 + Toast
- 实现 `showToast(msg)` — 顶部绿色提示，2秒消失

### Step 4：编写 index.html
- 三个登录按钮：业主 / 运维A / 运维B
- 点击设置 localStorage 跳转 dashboard.html

### Step 5：编写 dashboard.html
- 左侧固定侧边栏 w-64 + 右侧内容区
- 引入 CDN 和 JS 文件

### Step 6：编写 css/main.css
- Toast 动画、卡片样式、状态标识、租约倒计时

### Step 7：测试验证
- 按测试用例文档逐项验证

### Step 8：提交代码
- Git commit

## 配色方案
- **业主端 (Owner)**：Slate (#1E293B) + Amber (#F59E0B)
- **运维端 (Operator)**：深黑 (#020617) + Emerald (#10B981)

## 数据模型
```javascript
stations: [
  { id: 'st_01', name: 'Sydney North BESS', owner: 'owner_1', operator_id: 'op_a', soh: 99.98, capacity: '5MW/10MWh', location: 'Newcastle, NSW', lease_start: '2025-01-01', lease_end: '2028-12-31', annual_fee: 850000 },
  { id: 'st_02', name: 'Melbourne West Power', owner: 'owner_1', operator_id: 'op_b', soh: 99.95, capacity: '2.5MW/5MWh', location: 'Geelong, VIC', lease_start: '2024-06-01', lease_end: '2027-05-31', annual_fee: 420000 },
  { id: 'st_03', name: 'Brisbane Energy Hub', owner: 'owner_1', operator_id: 'op_a', soh: 99.99, capacity: '10MW/20MWh', location: 'Sunshine Coast, QLD', lease_start: '2025-02-15', lease_end: '2030-02-14', annual_fee: 1200000 },
  { id: 'st_04', name: 'Adelaide Storage A', owner: 'owner_1', operator_id: 'unassigned', soh: 100.0, capacity: '5MW/10MWh', location: 'Adelaide, SA', lease_start: '-', lease_end: '-', annual_fee: 0 }
]
```
