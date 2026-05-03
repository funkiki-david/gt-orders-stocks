# GT Orders & Stocks - 5-3-2026 新增方案与部署讨论

Date: 2026-05-03
Status: Planning draft

## 1. 会议目标

这次讨论不再围绕基础 CRUD，而是围绕两个核心问题：

- 新增哪些功能，才能让系统更接近真实仓库日常操作
- 如何部署上线，保证现有订单、库存和托盘参考数据不被破坏

当前系统已经具备可运行基础：

- Sales Orders: 草稿、编辑、确认、库存预留、关联出库、自动发货状态
- Inventory: SKU、库存流水、入库、出库、调整、转仓、低库存
- Master Data: 客户、产品、用户、角色权限
- Pallet Foundation: La Mirada 托盘位置、库存余额表、Sheet13 托盘参考数据

下一步重点应该是：先确认库存真相模型，再推进托盘级执行和部署。

## 2. 建议的总方向

推荐采用分阶段策略：

1. 短期：`skus` 继续作为界面兼容用的汇总库存
2. 中期：`inventory_balances` 成为库存操作的主表
3. 长期：La Mirada 使用托盘级库存，Dallas 维持仓库级库存

也就是说，不建议直接用 Sheet13 覆盖现有 SKU 总库存。Sheet13 应继续作为 reference layer，先做 reconciliation，再决定哪些数据进入 live balance。

## 3. 新增方案 A: 库存对账 Reconciliation

### 目标

建立一个安全流程，把参考数据、系统库存和实物盘点连接起来。

### 建议新增功能

- Reconciliation dashboard
  - 按 SKU 显示 `SKU total`、`inventory_balances total`、`pallet reference total`
  - 显示差异数量和差异状态
  - 支持按仓库、SKU、category、差异状态筛选

- Reconciliation review page
  - 单个 SKU 的仓库/托盘分布
  - Sheet13 reference rows
  - 当前 live balance rows
  - 历史 inventory movements

- Reconciliation actions
  - `Accept reference as live balance`
  - `Create adjustment from physical count`
  - `Move unmatched qty to Unknown Pallet Location`
  - `Mark as needs review`

### 推荐规则

- Sheet13 不能自动覆盖 live stock
- physical count 的结果可以生成 `ADJUSTMENT` movement
- 所有对账动作必须写入 audit log
- 对账完成前，托盘参考数据只用于查看和建议，不参与发货扣减

## 4. 新增方案 B: La Mirada 托盘级仓库执行

### 目标

让 La Mirada 的日常操作从“SKU 数量”升级到“SKU + warehouse + pallet location”。

### 建议新增功能

- Receiving 入库
  - 选择 warehouse
  - 如果是 La Mirada，必须选择 pallet location
  - 支持创建新 pallet location 或选择 `Unknown`

- Pallet move 移库
  - 从一个 pallet location 移到另一个 pallet location
  - 保留 movement ledger
  - 不改变 SKU 总库存

- Picking 拣货
  - 销售订单发货时显示可用托盘
  - 按 available qty 推荐托盘
  - 允许用户选择一个或多个托盘完成出库

- Exception handling 异常处理
  - 托盘数量不足
  - SKU 与托盘参考不匹配
  - 未知托盘
  - 实物数量与系统数量不一致

### 推荐 pick 逻辑

第一版不需要复杂优化算法，建议使用简单规则：

1. 优先选择已经有 live balance 的托盘
2. 按可用数量从小到大或从大到小可配置
3. 不允许扣到负数
4. 如果库存不足，订单不能完成发货，只能标记为异常

## 5. 新增方案 C: 库存真相模型升级

### 当前状态

现在系统中有三层库存信息：

- `skus.quantityOnHand` / `skus.quantityReserved`
- `inventory_balances`
- `pallet_stock_references`

### 推荐决定

`inventory_balances` 应成为未来的 operational source of truth。

原因：

- 可以表达 warehouse-level stock
- 可以表达 pallet-level stock
- 可以兼容 La Mirada 和 Dallas 两种仓库模式
- 可以从 movement ledger 重新汇总 SKU totals

### 过渡原则

- `skus.quantityOnHand` 继续保留，作为汇总快照和旧页面兼容字段
- 每次 inventory movement 更新 `inventory_balances`
- movement 完成后重新汇总并同步 `skus.quantityOnHand`
- 报表逐步改为从 `inventory_balances` 汇总，而不是直接相信 SKU totals

## 6. 新增方案 D: SKU Master Cleanup

### 目标

减少 SKU、历史订单、Sheet13 reference 之间的不一致。

### 建议新增功能

- SKU alias / mapping table
  - source SKU code
  - canonical SKU id
  - source name
  - confidence
  - notes

- Unmatched reference queue
  - Sheet13 中未能匹配到系统 SKU 的行
  - 支持人工选择匹配 SKU
  - 支持标记为 ignore 或 new SKU candidate

### 不建议

- 不建议在没有人工确认时自动合并 SKU
- 不建议仅靠 product name 模糊匹配直接修改正式 SKU

## 7. 部署方案

### 推荐部署形态

第一阶段推荐使用简单稳定的部署：

- PostgreSQL: managed Postgres 或独立 Docker volume
- Backend: Node.js service
- Frontend: static build served by Nginx/Vercel/Netlify/Render static site
- Environment: separate `.env` for production

如果这是内部运营工具，优先选择容易备份和恢复的方案，而不是过度复杂的云架构。

### 部署前检查

- 数据库备份
- 确认 production `DATABASE_URL`
- 确认 JWT secret 已设置
- 确认 CORS 只开放正式 frontend domain
- 跑 backend build
- 跑 frontend build
- 跑关键 e2e workflow
- 手动检查订单确认、出库、库存调整、托盘页面

### 建议命令

Backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run build
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run build
npm run preview
```

Local database:

```bash
docker compose up -d postgres
```

### 数据部署顺序

1. 部署 schema / table changes
2. 确认 default warehouses 存在
3. 导入或确认 pallet locations
4. 导入 Sheet13 reference data
5. 跑 reconciliation report
6. 人工确认差异
7. 才允许 reference data 转 live balance

### 上线保护

- 上线前冻结库存导入和人工 Excel 修改
- 保留旧数据备份
- 第一周保留 daily export
- 所有库存调整必须有 reason
- 对账功能上线前，不允许批量覆盖 live inventory

## 8. 推荐实施顺序

### Phase 1: Reconciliation Read-Only

交付：

- reconciliation report
- SKU / balance / reference 三方对比
- unmatched SKU queue

目标：

- 看清差异，不改库存

### Phase 2: Controlled Adjustment

交付：

- physical count adjustment workflow
- audit log
- Unknown Pallet Location workflow

目标：

- 允许人工确认后修正系统库存

### Phase 3: Pallet-Level Fulfillment

交付：

- order fulfillment 时选择 pallet
- 按 pallet 扣减库存
- 出库异常提示

目标：

- La Mirada 进入托盘级日常执行

### Phase 4: Reporting Migration

交付：

- dashboard 从 `inventory_balances` 汇总
- low stock 按 warehouse 显示
- SKU detail 显示仓库和托盘分布

目标：

- 报表和操作统一到同一个库存真相模型

## 9. 需要当天拍板的问题

建议会议中直接确认以下决定：

1. `inventory_balances` 是否确定为未来库存主表
2. `skus.quantityOnHand` 是否只作为汇总快照保留
3. La Mirada 是否必须托盘级出入库
4. Dallas 是否继续保持 warehouse-level only
5. `Unknown Pallet Location` 是临时桶还是正式异常流程
6. 谁有权限执行 physical count adjustment
7. Sheet13 reference 转 live balance 是否必须人工确认
8. 上线前是否需要先完成 reconciliation read-only report

## 10. 推荐结论

推荐结论如下：

- 正式库存真相逐步迁移到 `inventory_balances`
- `skus` 保留为汇总快照，不能长期作为唯一库存来源
- Sheet13 继续作为 reference，不直接覆盖 live inventory
- 先做 read-only reconciliation，再做 controlled adjustment
- La Mirada 进入 pallet-level workflow
- Dallas 保持 warehouse-level workflow
- 部署先求稳定、备份、可回滚，再推进复杂自动化

这条路线可以避免最危险的问题：在 SKU 总库存、托盘参考数据、实际仓库实物之间还没有完全对齐时，过早让系统自动扣减错误的托盘库存。

## 11. 2026-05-03 后台重建与 Stock Overview 上下文记录

当前前端页面：

- `http://localhost:5173/inventory/stock-overview`
- 页面标题：`Stock Overview`
- 页面定位：给 SDR / Warehouse / Admin 快速查看 SKU stock、available、reservation、physical location 状态

当前观察到的前端状态：

- `Stock Overview` 首屏仍保留：
  - `Actions`
  - `Activity Log`
  - `Pallet Locations`
  - `Low Stock`
- summary cards 当前显示：
  - `Total SKUs`
  - `Low Stock Items`
  - `Today's Movements`
- 本地页面刷新时，summary data 可能显示为 `0`，这需要结合当前 backend / database seed / rebuild 状态判断，不应直接理解为业务真实库存为 0。

后台与重建相关上下文：

- 后台 rebuild 后，`Stock Overview` 应继续作为库存入口页面，而不是 Dashboard 首页的重复摘要。
- Dashboard 首页已经开始往 task-oriented 方向调整：
  - 顶部优先展示 `Daily Workflow`
  - 顶部展示 `Fast Links`
  - 隐藏非关键 summary / overview 信息
- 后续后台数据重建时，需要重点确认：
  - `/api/inventory/dashboard` 是否从正确的数据源汇总
  - `/api/inventory/skus` 是否能返回当前导入后的 SKU records
  - `/api/inventory/low-stock` 是否基于 rebuild 后的库存真相计算
  - `/api/inventory/movements` 是否保留或重建历史 movement ledger

设计方向记录：

- `Stock Overview` 应承担 inventory data inspection，不应该把所有摘要重复放到 Dashboard。
- Dashboard 应承担 daily operation routing，让 SDR / Warehouse 一进入系统就知道下一步做什么。
- `Daily Workflow` 中的每一步都应提供直接跳转到对应页面的小 pill link。
- `Fast Links` 应继续作为角色相关的 direct action list：
  - SDR / Manager: sales order work
  - Warehouse: inventory action work
  - Admin / Manager: activity review

下一步建议：

- 如果 backend rebuild 后 `Stock Overview` 仍显示 0，需要先检查 backend API response，再决定是 seed/import 问题、API 汇总问题，还是前端 query/render 问题。
- 在库存主表确定前，`Stock Overview` 可以继续显示 SKU-level totals，但要为后续 `inventory_balances` / pallet-level source of truth 迁移预留 UI。
