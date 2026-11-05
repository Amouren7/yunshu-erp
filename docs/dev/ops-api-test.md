# 业务中后台 API 实测报告（生产 / 人力 / CRM / 系统 / 报表）

- 测试日期：2026-10-23
- 测试环境：Windows / Node v23.9.0（`node:sqlite`）/ 服务端零外部依赖
- 被测服务：`$env:ERP_PORT=8789; node server/index.mjs`（独立端口，未影响 Lead 在 8787 的服务）
- 登录账号：`admin / admin123`（系统管理员，权限 `*`）
- 测试方式：PowerShell 5.1 `Invoke-RestMethod` 真实 HTTP 请求（非单元测试桩），写操作均落库并回读校验
- 结论：**77 个端点全部可用**；38 个 GET 端点全部 200 且数据合理；生产工单「创建→下达→领料→完工→关闭」全流程跑通，`stock_ledger` 与 `vouchers` 均产生新记录且借贷平衡。

## 一、交付文件

| 文件 | 说明 | 大小 |
|---|---|---|
| `server/api/production.mjs` | 生产管理（10 个端点） | ~40 KB |
| `server/api/hr.mjs` | 人力资源（13 个端点） | ~28 KB |
| `server/api/crm.mjs` | 客户关系（20 个端点） | ~35 KB |
| `server/api/system.mjs` | 系统管理（21 个端点） | ~29 KB |
| `server/api/reports.mjs` | 报表中心（13 个端点） | ~43 KB |

> 只新增上述 5 个文件与本报告，未修改任何既有文件。`server/index.mjs` 会自动发现 `server/api/*.mjs` 并挂载 `register(router)`。

## 二、约定与实现要点

- 返回结构：直接 `return` 业务数据，框架统一包 `{ success: true, data }`；错误 `throw new ApiError('中文提示', 400)`。
- 列表统一 `{ rows, total, page, pageSize }`（薪资/合同/销售汇总等额外带 `summary`）。
- 金额统一 `round2`（2 位小数）；所有 SQL 参数化，排序/分页无字符串拼接用户输入。
- 权限：`production.* / hr.* / crm.* / system.* / reports.*`；读 `*.view`，写 `*.create / edit / delete`，审批动作 `*.approve`。
- 生产领料/完工**真正调用** `server/lib/posting.mjs` 的 `postMaterialIssue` / `postProductionCompletion`，库存余额、库存流水、记账凭证联动。
- 契约兼容：客户编码规则 `KH + 4位序号`；合同号沿用 `nextDocNo('CONTRACT')`；生产工单号沿用 `nextDocNo('MO')`。

## 三、端点清单（77 个）

### 1) 生产管理 `production.mjs`（10）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/production/overview` | production.view | 状态分布/在产数/本月完工数量/本月领料金额/产能利用率/BOM 数/缺料数 |
| GET | `/api/production/work-orders` | production.view | 参数 status,keyword,itemId,startDate,endDate,priority,page,pageSize；行含 item_code/item_name/进度% |
| GET | `/api/production/work-orders/:id` | production.view | 含 materials/operations/BOM 明细/可执行 actions |
| POST | `/api/production/work-orders` | production.create | 自动取启用 BOM 展开物料（qty×BOM×(1+损耗%)）与工序，`nextDocNo('MO')` |
| PUT | `/api/production/work-orders/:id` | production.edit | 仅 DRAFT 可改 qty/日期/优先级/备注/仓库，物料与工序重算 |
| DELETE | `/api/production/work-orders/:id` | production.delete | 仅 DRAFT |
| POST | `/api/production/work-orders/:id/action` | production.approve | release / start / issue（过账领料）/ complete（过账完工入库）/ close / void |
| GET | `/api/production/materials-requirements` | production.view | 简易 MRP：未完工工单 + 未发货 SO 净需求 vs 库存，给出建议采购/生产数量与缺口 |
| GET | `/api/production/work-center-load` | production.view | 工作中心计划/实际工时、产能工时、负荷率、利用率、工时成本 |
| GET | `/api/production/schedule` | production.view | 排产看板：RELEASED/IN_PROGRESS 按计划日期+优先级排序，逾期/紧急统计、按日期分组 |

### 2) 人力资源 `hr.mjs`（13）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/hr/overview` | hr.view | 在职人数/部门分布/本月出勤率/本月薪资/待审批请假/本月入离职 |
| GET | `/api/hr/attendances` | hr.view | employeeId,startDate,endDate,status,departmentId,keyword,page |
| POST | `/api/hr/attendances/generate` | hr.create | body {year,month}：为在职员工生成工作日考勤（周一至周五、当天及以前、跳过已有） |
| PUT | `/api/hr/attendances/:id` | hr.edit | 状态/打卡时间/工时/加班/备注 |
| GET | `/api/hr/payrolls` | hr.view | period,employeeId,status,departmentId,keyword,page；带 summary{total_net,total_tax,total_insurance,count} |
| POST | `/api/hr/payrolls/generate` | hr.create | 绩效 5%~15%、加班（按当月考勤加班工时×1.5）、补贴、社保 10.5%、公积金 5%、简化个税 3% 超额，状态草稿 |
| POST | `/api/hr/payrolls/:id/confirm` | hr.approve | 草稿→已确认 |
| POST | `/api/hr/payrolls/batch-confirm` | hr.approve | body {period} 批量确认 |
| GET | `/api/hr/leaves` | hr.view | status,employeeId,leaveType,departmentId,日期区间,page |
| POST | `/api/hr/leaves` | hr.create | 请假申请（天数不传按工作日自动计算），状态待审批 |
| PUT | `/api/hr/leaves/:id` | hr.edit | 仅待审批可改 |
| POST | `/api/hr/leaves/:id/approve` | hr.approve | body {approved:true/false} → 已批准/已驳回，回填审批人 |
| GET | `/api/hr/departments/stats` | hr.view | 部门人数/正式/男女/薪资成本/人均/最新期间薪资 |

### 3) 客户关系 `crm.mjs`（20）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/crm/overview` | crm.view | 线索数/转化率、商机漏斗（数量/金额/加权金额）、本月新增客户、合同金额、待跟进 |
| GET/POST | `/api/crm/leads` | crm.view / crm.create | status,source,ownerId,keyword,page；新建 |
| PUT/DELETE | `/api/crm/leads/:id` | crm.edit / crm.delete | 已转客户线索禁止删除 |
| POST | `/api/crm/leads/:id/convert` | crm.edit | 写 customers（KH+序号）、线索状态=已转客户、回填未关联商机的 customer_id |
| GET/POST | `/api/crm/opportunities` | crm.view / crm.create | stage,status,customerId,ownerId,keyword,page；带金额/加权金额 summary |
| PUT/DELETE | `/api/crm/opportunities/:id` | crm.edit / crm.delete | 阶段变化自动重算赢率与状态 |
| POST | `/api/crm/opportunities/:id/stage` | crm.edit | body {stage}，赢率映射：初步接洽20/需求确认40/方案报价60/商务谈判80/赢单100/输单0 |
| GET/POST | `/api/crm/activities` | crm.view / crm.create | refType,refId,activityType,ownerId,日期,page；行含 ref_name |
| PUT/DELETE | `/api/crm/activities/:id` | crm.edit / crm.delete | 跟进记录 |
| GET/POST | `/api/crm/contracts` | crm.view / crm.create | status,customerId,keyword,日期,page；带金额汇总；新建自动生成合同号 |
| PUT/DELETE | `/api/crm/contracts/:id` | crm.edit / crm.delete | 合同维护 |
| GET | `/api/crm/customers/rank` | crm.view | 客户贡献排行（DN 汇总：单数/金额/成本/毛利/毛利率） |

### 4) 系统管理 `system.mjs`（21）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET/POST | `/api/system/users` | system.view / system.create | 行含角色名/部门名/岗位；新建必填密码（scrypt+salt） |
| PUT/DELETE | `/api/system/users/:id` | system.edit / system.delete | 编辑可不改密码；不能删 admin、不能删自己、admin 不能停用/改名 |
| POST | `/api/system/users/:id/reset-password` | system.edit | body {password}，同时清理该用户会话 |
| GET/POST | `/api/system/roles` | system.view / system.create | permissions 为 JSON 数组，返回解析后数组与 builtin 标记 |
| PUT/DELETE | `/api/system/roles/:id` | system.edit / system.delete | 内置角色不可删除；有用户引用不可删除 |
| GET/PUT | `/api/system/settings` | system.view / system.edit | settings 键值表；PUT 支持 `{settings:{k:v}}`、数组或平铺对象 |
| GET | `/api/system/audit-logs` | system.view | userId,module,action,entity,keyword,startDate,endDate,page；附模块/动作可选项 |
| GET | `/api/system/number-series` | system.view | 单号规则 + 下一个单号预览 |
| PUT | `/api/system/number-series/:docType` | system.edit | prefix/pad/next_no/date_pattern 校验 |
| GET/POST | `/api/system/notices` | system.view / system.create | 通知列表（含未读数）/发布 |
| POST | `/api/system/notices/:id/read` | system.edit | 标记已读 |
| DELETE | `/api/system/notices/:id` | system.delete | 删除通知 |
| GET | `/api/system/info` | system.view | 版本/Node/启动时间/运行时长/数据库文件与大小/内存/各表数据量/当前用户 |
| GET | `/api/system/gl-mappings` | system.view | 总账映射（含科目名/类别） |
| PUT | `/api/system/gl-mappings/:key` | system.edit | 修改映射并清理 GL 缓存 |

### 5) 报表中心 `reports.mjs`（13，均 `reports.view`）

| 路径 | 说明 |
|---|---|
| `/api/reports/sales-summary` | 按客户：单数/数量/未税金额/税额/价税合计/成本/毛利/毛利率 |
| `/api/reports/sales-by-item` | 按产品汇总 |
| `/api/reports/sales-by-salesperson` | 按业务员汇总 |
| `/api/reports/sales-monthly` | 近 N 个月趋势（默认 12） |
| `/api/reports/purchase-summary` | 按供应商汇总 |
| `/api/reports/purchase-by-item` | 按产品汇总（含均价） |
| `/api/reports/purchase-monthly` | 采购月度趋势 |
| `/api/reports/inventory-balance` | 按仓库/分类汇总 + Top20 库存金额 |
| `/api/reports/inventory-turnover` | 周转率 = 本期出库成本 / 平均库存，周转天数 + 分类明细 |
| `/api/reports/gross-profit` | 毛利分析（单据级）+ 汇总 |
| `/api/reports/customer-contribution` | 客户贡献 ABC 分析（累计占比 70/90 分档） |
| `/api/reports/product-ranking` | 畅销榜 Top N，按金额或数量排序 |
| `/api/reports/kpi-dashboard` | 综合 KPI：销售/采购/毛利/库存/应收/应付/现金/订单/客户/生产/人力，含环比、同比 |

报表口径：`amount` = 未税销售额（`documents.subtotal`），`total_amount` = 价税合计，`profit = amount - cost_amount`，`profit_rate = profit / amount`。销售类统一状态口径 `APPROVED / PARTIAL_SHIPPED / FULL_SHIPPED / COMPLETED`，采购类 `APPROVED / PARTIAL_RECEIVED / FULL_RECEIVED / COMPLETED`；默认时间范围为近 12 个月。

## 四、实测结果

### 4.1 GET 冒烟测试（38/38 通过）

生产 6 + HR 5 + CRM 6 + 系统 8 + 报表 13 = 38 个 GET 端点全部 `200`，抽样数据：

| 端点 | 关键数据 |
|---|---|
| production/overview | 工单 181，在产 2，BOM 7，产能利用率 80.00%，本月完工 2444 台，本月领料 1,167,573.05 |
| work-orders | 行含 item_code/item_name/进度%，分页正常 |
| work-orders/178 | 物料 8 行、工序 3 行、BOM 明细完整 |
| materials-requirements | 12 个需求物料，3 个缺口（RM-LCD01/RM-TOUCH01/RM-HMI-CPU 各缺 25.2，建议采购金额 65,520） |
| work-center-load | WC01 负荷 69.09%，WC02 279.68%（演示大单排产），WC03 110.55% |
| schedule | 2 张已下达工单按计划日期排序，逾期/紧急统计正确 |
| hr/overview | 在职 27，出勤率 98.91%，本月薪资 388,752.69（27 人），待审批请假 3 |
| hr/attendances | 459 条（2026-10 至 23 日），含姓名/部门 |
| hr/payrolls | 2026-10 27 条，已确认；summary net 388,752.69 / tax 7,848.02 |
| hr/departments/stats | 11 个部门，薪资成本合计 388,752.69 |
| crm/overview | 线索 15、转化率 33.33%，商机 9/5,170,000，赢率 33.33%，合同 6/6,196,000，客户 23 |
| crm/customers/rank | Top1 武汉光谷智造 2,757,766.81 |
| system/info | v1.0.0，Node v23.9.0，单据 700，DB 2.16 MB，运行时长/启动时间正常 |
| reports/sales-summary | 22 客户，132 单，未税 20,740,668.80，毛利 11,941,290.60，毛利率 57.57% |
| reports/inventory-balance | 库存金额 1,714,673.32，28 SKU，3 仓库 7 分类 |
| reports/inventory-turnover | 周转率 23.73 次，周转天数 15.04 天，出库成本 20,345,239.92 |
| reports/kpi-dashboard | 本月销售 2,194,920（环比 +10.35%），采购 846,889，毛利 1,259,518.99（57.38%），应收 5,670,827.02，应付 956,984.57 |

### 4.2 生产工单全流程（验收重点）

流程：`创建 → 修改 → 下达(release) → 领料(issue) → 完工(complete) → 关闭(close)`

| 步骤 | 结果 |
|---|---|
| 创建 FG-RT300 × 10 | `SCGD2026100179`，DRAFT；自动展开 BOM 物料 5 行、工序 1 道（组装，计划工时 12h） |
| 修改数量 10→12、优先级→紧急 | 物料需求自动重算为 12.12（含 1% 损耗） |
| release | RELEASED；重复 release → 400 |
| 未领料直接 complete | 400「只有生产中的工单可以报完工」 |
| issue | 5 行物料逐行调用 `postMaterialIssue` 过账，`issued_qty` 累加、状态→IN_PROGRESS |
| complete(qty=12) | 调用 `postProductionCompletion` 入库，单位成本 = 已领料金额×1.18/12 = 79.59，状态→COMPLETED |
| close | COMPLETED→CLOSED |

**库存联动证据（HTTP 回读）**

- 领料前 `RM-SENSOR01` 库存 1252.16 → 领料后 1240.04（-12.12）。
- `/api/inventory/ledger?docType=MO` 记录数 1292 → 1298（+6）：5 条领料 `OUT` + 1 条完工 `IN`。
- 完工入库流水：`FG-RT300` +12，单位成本 79.59，金额 955.08；`stock_balances` 成品仓 668 → 680。

**凭证联动证据（只读查库校验）**

`vouchers` 中 `source_type='MO' AND source_id=179` 共 **6 张凭证**，全部 `POSTED` 且借贷平衡：

| 凭证号 | 摘要 | 借方 | 贷方 | 金额 |
|---|---|---|---|---|
| 记-202610-0161~0165 | 生产领料 SCGD2026100179 | 5001 生产成本 | 1403 原材料 | 315.12 / 108.90 / 333.30 / 42.42 / 9.70 |
| 记-202610-0166 | 完工入库 SCGD2026100179 | 1405 库存商品 | 5001 生产成本 | 955.08 |

全库凭证数 1820 → 1826，库存流水 1813 → 1819，均与本工单业务量一致。

### 4.3 其他写操作（均真实落库并回读）

**HR**
- 生成 2026-09 考勤 594 条（22 个工作日 × 27 名在职员工）；重复生成 `generated=0, skipped=594`。
- 生成 2026-10 薪资 27 条，net 合计 388,752.69、个税 7,848.02；重复生成跳过 27 条。
- 单条确认 1 条、批量确认 26 条 → 全部「已确认」。
- 新建请假单（年假 2026-10-26~27）→ 改天数 1.5 → 审批通过（审批人=张伟）。

**CRM**
- 新建线索「API实测线索-智慧工厂」→ 改状态已联系 → 转客户成功生成 `KH0023`，线索状态回填「已转客户」；已转客户线索删除被拒 400。
- 新建商机 → 阶段推进：初步接洽(20) → 商务谈判(80) → 赢单(100/已赢单)，阶段修改自动重算赢率。
- 跟进记录新建/修改/删除；合同新建（自动编号 `HT2026100001`）/修改/删除，合同列表汇总金额正确。

**系统**
- 新建用户 `testops`（返回不含 password_hash/salt）→ 编辑姓名/角色/邮箱 → 重置密码 → **用新密码登录成功** → 删除；删除 admin、删除当前登录账号均被拒 400。
- 新建角色 `TEST_ROLE`（2 项权限）→ 编辑为 3 项 → 删除；删除内置角色被拒 400。
- 修改系统参数（公司电话）→ 读取确认 → 恢复原值。
- 修改单号规则 TR `pad=5` 验证预览格式 → 恢复 `pad=4`。
- 通知发布 → 标记已读 → 删除。
- 更新总账映射 INVENTORY→1405（含缓存清理）。

### 4.4 权限验证

| 角色 | 请求 | 结果 |
|---|---|---|
| HR（sunyue/hr123） | GET /api/hr/overview | 200 |
| HR | POST /api/system/users | 403（无 system.create） |
| HR | GET /api/production/work-orders | 403（无 production.view） |
| GUEST（guest/guest123） | GET /api/reports/sales-summary、/api/production/overview | 200 |
| GUEST | POST /api/production/work-orders、POST /api/system/users | 403 |

权限按 `模块.view/create/edit/delete/approve` 生效，支持角色 `模块.*` 通配，管理员 `*` 全通过。

## 五、测试断言说明

自动化脚本共 101 项断言，首轮 98 项 PASS、3 项 FAIL，逐项复核确认均为**测试脚本预期问题，非接口缺陷**：

1. 「完工入库流水 IN 金额」断言失败：PowerShell 5.1 对标量结果取 `.Count` 为空导致条件为假；实际 `/api/inventory/ledger` 回读与只读查库均确认 1 条 IN（955.08）。
2. 「MRP 建议采购物料数=0」：首轮仅有一张小额工单，库存充足确实无缺口（结果正确）；随后创建演示大单后 MRP 正确给出 3 条采购建议（65,520）。
3. 「CRM 线索总数=14」：测试中新建并转化了 1 条线索，实际应为 15（接口返回正确）。

## 六、测试数据与遗留说明

为保证看板/MRP 演示效果，本次实测**保留**以下业务数据（如需纯净环境执行 `npm run seed` 重新初始化）：

| 数据 | 内容 | 用途 |
|---|---|---|
| 生产工单 | `SCGD2026100179`（FG-RT300×12，CLOSED，含领料/完工流水与 6 张凭证） | 全流程验收证据 |
| 生产工单 | `SCGD2026100180`（FG-GW1000×5，RELEASED） | 排产看板/MRP 演示 |
| 生产工单 | `SCGD2026100182`（FG-HMI700×150，RELEASED，紧急） | 工作中心超负荷（WC02 279.68%）、MRP 缺口演示 |
| 考勤 | 2026-09 共 594 条（另 1 条 2026-09 记录改为「加班」） | 考勤生成验证 |
| 薪资 | 2026-10 共 27 条，全部「已确认」 | 薪资生成/确认验证 |
| 请假 | 1 条已批准记录（员工 5，年假 2026-10-26~27） | 请假审批验证 |
| CRM | 线索 15（+1 已转客户）、客户 `KH0023`「API实测客户有限公司」 | 线索转化验证 |
| 单号序列 | `CONTRACT.next_no` 因测试合同 +1（现为 2） | 合同自动编号验证 |

已清理：测试用户/角色/商机/跟进/合同/通知/草稿工单均已删除；系统参数、单号规则 pad 已恢复原值；库存与凭证为真实业务结果，未清理。

## 七、注意事项

1. **服务需重启加载新模块**：`server/index.mjs` 在启动时扫描挂载 `server/api/*.mjs`，当前运行在 8787 的旧进程不会自动看到 5 个新文件，需重启后生效（本次实测使用 8789 独立进程，未影响 8787）。
2. **MRP 的销售需求**：种子数据中销售订单均为 `FULL_SHIPPED`（无 `APPROVED/PARTIAL_SHIPPED` 未发订单），因此 MRP 的销售订单来源需求需新建并审核销售订单后才会出现；当前 MRP 需求来自未完工生产工单。
3. **允许负库存**：`settings.allow_negative_stock=1` 时领料不做库存校验（按现有 posting/stock 逻辑直接出库），生产领料可能出现负库存，请前端在工单领料前展示库存提示。
4. **完工单位成本口径**：按任务要求为「已领料金额 × 1.18 / 本次完工数量」；分多次部分完工时每次均按该公式计算本批次成本，若财务要求严格按工单总量分摊，可后续调整。
5. **报表金额口径**：报表统一「未税金额」为销售额、「价税合计」单列；工作台 dashboard 使用价税合计，两者数值不同属口径差异，前端展示时请注意标题区分。
6. **同比为空**：种子数据仅覆盖近 12 个月，`kpi-dashboard` 的同比（去年同期）在无数据时返回 `null`（前端显示「-」），环比正常。
7. **合同编号**：`contracts` 表历史编号为 `HT20260001` 格式，新建自动编号走 `number_series`（`HT2026100001`），两种格式并存不冲突（`contract_no` 唯一）。
8. 种子数据中 `FG-RT300` 等成品平均成本偏低，导致报表毛利率偏高（57% 左右），属种子数据成本口径，非接口计算错误。

## 八、复测命令速查

```powershell
# 启动独立测试端口（不要停 8787）
cd "<项目根目录>\erp-suite"
$env:ERP_PORT=8789; node server/index.mjs

# 登录拿 token
$login = Invoke-RestMethod -Uri http://127.0.0.1:8789/api/auth/login -Method Post `
  -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
$H = @{ Authorization = "Bearer $($login.data.token)" }

# 工单全流程
$wo = Invoke-RestMethod -Uri http://127.0.0.1:8789/api/production/work-orders -Method Post -Headers $H `
  -ContentType 'application/json' -Body '{"item_id":3,"qty":10,"warehouse_id":2,"material_wh_id":1}'
$id = $wo.data.id
Invoke-RestMethod -Uri "http://127.0.0.1:8789/api/production/work-orders/$id/action" -Method Post -Headers $H -Body '{"action":"release"}'
Invoke-RestMethod -Uri "http://127.0.0.1:8789/api/production/work-orders/$id/action" -Method Post -Headers $H -Body '{"action":"issue"}'
Invoke-RestMethod -Uri "http://127.0.0.1:8789/api/production/work-orders/$id/action" -Method Post -Headers $H -Body '{"action":"complete"}'
Invoke-RestMethod -Uri "http://127.0.0.1:8789/api/inventory/ledger?docType=MO&pageSize=20" -Headers $H
```
