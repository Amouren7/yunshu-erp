# 财务模块 API 实测报告（server/api/finance.mjs）

> 项目：云枢ERP（Yunshu ERP）
> 被测文件：`server/api/finance.mjs`（本次唯一新增的后端代码文件）
> 测试服务：`http://127.0.0.1:8788`（独立端口，Lead 的 8787 服务未停止/未修改）
> 运行环境：Windows / Node v23.9 / 全 ESM / `node:sqlite` / 系统日期 2026-10-23
> 测试账号：`admin / admin123`（系统管理员）、`guest / guest123`（只读访客，验证权限）
> 测试方式：PowerShell 5.1 `Invoke-RestMethod` 逐一发起真实 HTTP 请求
> 测试结果：**168 项断言全部通过（168 PASS / 0 FAIL）**
> 数据快照时点：2026-10-23 12:2x（共享演示库，其他模块联调会持续产生新单据/凭证，数值会随快照时点变化）

---

## 1. 交付内容

| 文件 | 说明 |
|---|---|
| `server/api/finance.mjs` | 新增财务模块 API，导出 `register(router)`；服务端 `server/index.mjs` 自动发现挂载，无需改动其他文件 |
| `docs/dev/finance-api-test.md` | 本实测报告 |

权限模型（与现有模块一致，由 `server/index.mjs` 统一校验）：

- 读接口：`finance.view`
- 写接口：`finance.create`（手工凭证）/ `finance.edit`（发票修改、科目映射修改）
- 返回结构：`{ success: true, data: ... }`（框架自动包装）；出错统一 `throw new ApiError('中文提示', 400|403|404)`
- 金额统一 `round2`；SQL 全部参数化；列表排序字段走白名单（`orderBy` / 本地 `sortSql`）
- 分页统一 `http.paginate`（默认 20/页，最大 500；明细账默认 50/页）

---

## 2. 端点清单与实测结果

### 2.1 财务总览

`GET /api/finance/overview`（权限 `finance.view`，可选 `period=yyyy-MM`，默认当前月）

返回扁平 KPI 字段 + 分组字段（便于前端 KPI 卡片与明细面板）：

| 字段 | 实测值（2026-10） | 说明 |
|---|---|---|
| `ar_balance` | 7,227,662.73 | 应收余额（未结清 AR 发票 价税合计-已核销） |
| `ap_balance` | 1,546,151.88 | 应付余额（未结清 AP 发票） |
| `month_receipt` / `month_payment` | 1,316,283.87 / 361,104.61 | 本月收款 / 付款（POSTED payments，13 / 6 笔） |
| `cash_balance` / `bank_balance` / `cash_total` | 0 / 5,814,021.44 / 5,814,021.44 | 1001 / 1002 总账余额（voucher_lines 汇总） |
| `month_income` / `month_cost` / `month_profit` | 2,103,209.20 / 1,683,683.07 / 419,526.13 | 本月收入 / 成本费用 / 利润（利润表口径） |
| `overdue_ar_amount` / `overdue_ar_count` | 3,281,929.18 / 21 | 逾期应收金额 / 笔数（`due_date < 今天`） |
| `overdue_ap_amount` / `overdue_ap_count` | 589,167.31 / 3 | 逾期应付（附带） |
| `receivable` / `payable` | 含 `gl_balance`、`diff` | 总账口径对账：AR 7,220,385.53（差 7,277.20）、AP 1,544,168.73（差 1,983.15） |
| `month.receipt_count` / `month.payment_count` | 13 / 6 | 本月收付款笔数 |

实测：`period=2026-09` 正常返回；`period=2026-13` → `HTTP 400 period 格式应为 yyyy-MM`。

### 2.2 发票列表（AR / AP）

`GET /api/finance/invoices`（`finance.view`）

| 参数 | 说明 |
|---|---|
| `invoiceType` | `AR`（应收）/ `AP`（应付），缺省为全部 |
| `status` | 支持逗号分隔多值，如 `未收,部分收款` |
| `partnerId` | 客户/供应商 ID |
| `keyword` | 匹配发票号、来源单号、备注、客户/供应商名称与编码 |
| `startDate` / `endDate` | 发票日期区间（`invoice_date`） |
| `dueStartDate` / `dueEndDate` | 到期日区间 |
| `overdue=1` | 只看逾期未结清发票（按 AR/AP 各自未结清状态判断，不会把已付 AP 误判为逾期） |
| `orderBy` | 白名单：`invoice_date`/`due_date`/`total_amount`/`paid_amount`/`remain_amount`/`invoice_no`/`id`/`created_at`，可带 `asc`/`desc` |
| `page` / `pageSize` | 分页（默认 1 / 20，最大 500） |

返回：`{ rows, total, page, pageSize, summary: { total_amount, paid_amount, remain_amount } }`
`rows` 含：`partner_name`、`partner_code`、`remain_amount`、`overdue_days`（负数=未到期）、`allocation_count`（核销笔数）、发票全字段。

实测：

- AR：total=136，`summary` 合计 23,494,288.35 / 已收 16,273,902.82 / 未结清 7,220,385.53（**与总账 1122 完全一致**）
- AP：total=101，合计 9,476,450.11 / 已付 7,932,281.38 / 未结清 1,544,168.73（**与总账 2202 完全一致**）
- `overdue=1`：24 笔（14 AR + 10 AP），逾期未收合计 3,871,096.49
- 关键字无匹配 / `page=999` → `rows: []` 且 `total` 正常返回
- 非法 `invoiceType=XX` → `HTTP 400 invoiceType 只能为 AR 或 AP`
- 排序白名单生效（`orderBy=total_amount asc` 首行 -2,079.20）；注入串自动回退默认排序

### 2.3 发票详情

`GET /api/finance/invoices/:id`（`finance.view`）

返回：发票全字段 + `remain_amount`、`overdue_days`、`partner`（客户/供应商档案）、`doc`（开票来源单据，含 `doc_no`）、`source_doc`（上游 SO/PO）、`allocations`（核销记录：`payment_no`/`payment_date`/`amount`/`method`/`account_code`…）、`payments`（同 allocations 的别名）、`vouchers`（关联凭证，可钻取）。

实测样例（id=172）：`YSFP2026070096` 已收 / 广州市南沙工业互联网有限公司 / 来源单 `XSFH2026070094` / 上游 `XSDD2026070094` / 核销 1 笔（`SKD2026100113` 119,570.27 银行转账）/ 关联凭证 `记-202607-0128`。
不存在 → 404；`abc` → `HTTP 400 发票 ID 不合法`。

### 2.4 发票修改

`PUT /api/finance/invoices/:id`（`finance.edit`），body 仅允许 `due_date`、`remark`。

实测：`{ due_date: '2026-12-31', remark: '财务 API 实测备注' }` → 更新成功且重新查询已持久化；中文备注读写正常。
校验：其他字段（如 `total_amount`）→ `HTTP 400 不允许修改字段：total_amount（仅支持 due_date / remark）`；`2026/12/31` → `HTTP 400 due_date格式应为 YYYY-MM-DD`；不存在 → 404。

### 2.5 收付款记录

`GET /api/finance/payments`（`finance.view`）
参数：`paymentType=RECEIPT|PAYMENT`、`status`、`method`、`partnerId`、`keyword`、`startDate`/`endDate`、`orderBy`、分页。
返回 `{ rows, total, page, pageSize }`；`rows` 含 `partner_name`、`partner_code`、`method`、`amount`、`allocated_amount`、`invoice_count`（关联发票数量）。

实测：收款 total=114、付款 total=85；样例 `SKD2026100113` 广州市南沙工业互联网有限公司 119,570.27 银行转账 / 核销 1 张；非法 `paymentType=XX` → 400。

### 2.6 记账凭证列表

`GET /api/finance/vouchers`（`finance.view`）
参数：`period`、`voucherType=AUTO|MANUAL`、`status`、`sourceType`、`keyword`（凭证号/摘要/来源类型）、`startDate`/`endDate`、`orderBy`（`voucher_date`/`voucher_no`/`period`/`total_debit`/`created_at`/`id`）、分页。
返回 `{ rows, total, page, pageSize }`；`rows` 含 `line_count`（分录行数）、`source_no`（来源单据号：DN/GRN/RC/PY 取 `documents.doc_no`，MO 取 `work_orders.order_no`）。

实测：2026-10 total=157；`sourceType=DN` → `source_no=XSFH2026100132`；`sourceType=MO` → `source_no=SCGD2026100177`；无凭证期间 total=0；非法 `voucherType` → 400。

### 2.7 凭证详情

`GET /api/finance/vouchers/:id`（`finance.view`）
返回凭证头 + `lines`（科目编码/名称/借/贷/摘要/往来单位 `partner_type|partner_id|partner_name`、科目 `category`/`direction`）+ `source_doc` + `line_count`。
实测：`记-202610-0157`（FEE，3 行，借=贷 127,000）分录借贷平衡；不存在 → 404。

### 2.8 手工凭证录入

`POST /api/finance/vouchers`（`finance.create`）
body：`{ voucher_date, summary, lines: [{ account_code, summary, debit, credit, partner_id?, partner_type? }] }`

校验（全部实测命中）：

| 校验 | 实测响应 |
|---|---|
| 借贷不平衡 | `400 借贷不平衡：借方合计 100，贷方合计 90` |
| 科目不存在 | `400 第 1 行科目不存在：999999` |
| 借贷同时为 0 | `400 第 1 行借贷金额不能同时为 0` |
| 同一行同时有借有贷 | `400 第 1 行不能同时填写借方和贷方金额` |
| 分录为空 | `400 凭证分录不能为空` |
| 日期格式错误 | `400 voucher_date格式应为 YYYY-MM-DD` |
| 往来单位不存在 | `400 第 2 行往来单位不存在` |

成功实测：`记-202610-0158`，状态 `POSTED`、类型 `MANUAL`、借=贷 1,234.56、2 行分录、自动生成凭证号（`记-yyyymm-0001` 序号）、分录回填往来单位名称（深圳华控自动化有限公司）；写入后列表/详情均可查。测试产生的凭证已删除，未污染演示数据。

> 实现说明：`lib/numbering.mjs` 的 `nextVoucherNo()` 按「期间内凭证数 + 1」取号，在并发写入或删除凭证后会与已有序号冲突（实测出现过 `UNIQUE constraint failed: vouchers.voucher_no`）。财务模块改用「当前期间最大序号 + 1」并在事务内取号（`nextManualVoucherNo`），已消除该问题。

### 2.9 科目树

`GET /api/finance/accounts/tree`（`finance.view`，可选 `period`）
按 `parent_code` 组织为嵌套树，节点含 `code/name/category/direction/level/is_leaf/opening_balance`、
`current: { debit, credit, balance }`（本期借/贷/期末余额）、`ytd: { debit, credit, balance }`（本年累计借/贷/期末余额）、`children`。
父级自动汇总下级（借贷发生额直接累加；余额按父科目方向换算，借贷混合子科目取负）。

实测：59 个科目节点 / 54 个根节点；`1002 银行存款` 期初 5,611,142.18 + 本期借 1,316,283.87 - 贷 1,113,404.61 = 期末 5,814,021.44；`2221 应交税费` 挂 5 个子科目，期初 1,449,350.01、本期借 110,095.57 / 贷 273,417.20、期末 1,612,671.64（= 销项税额 2,702,882.75 - 进项税额 1,090,211.11，与资产负债表一致）。

### 2.10 科目余额表（试算平衡）

`GET /api/finance/trial-balance`（`finance.view`，`period` 或 `startDate`+`endDate`，缺省当前月）
返回 `{ period, startDate, endDate, rows, totals }`；每行 `opening_balance`（期初，按科目方向）、`debit`、`credit`、`closing_balance`（期末，按方向）。

实测（2026-10）：18 个有余额/发生额的科目；期初借方合计 = 贷方合计 = 30,340,950.72；本期借 = 贷 = 9,640,687.96；期末借方合计 = 贷方合计 = 33,338,457.08；`totals.balanced=true`。自定义区间 `2026-01-01~2026-10-23` 同样平衡；`startDate > endDate` → 400。

### 2.11 明细账

`GET /api/finance/ledger`（`finance.view`，必填 `accountCode`，可选 `startDate`/`endDate`/`period`/分页，默认 50/页）
返回 `{ account, startDate, endDate, opening_balance, closing_balance, total_debit, total_credit, rows, total, page, pageSize }`；`rows` 含凭证号/日期/摘要/借/贷/往来单位/**逐笔余额 `balance`**（用 SQL 窗口函数在整段区间累计后分页，翻页余额连续）。

实测：`1122` 2026-10 共 26 笔，期初 6,160,043.00 + 借 2,376,626.40 - 贷 1,316,283.87 = 期末 7,220,385.53；逐笔余额从 6,647,954.40 递增；`1001` 无发生额（total=0、余额 0）；`222101` 贷方科目余额方向正确。缺少 `accountCode` → 400；科目不存在 → 404。

### 2.12 利润表

`GET /api/finance/income-statement`（`finance.view`，`period=yyyy-MM`，默认当前月）
返回 `{ period, startDate, endDate, yearStart, current, ytd, items }`：
- `current` / `ytd`：本月数 / 本年累计数（字段一致）
- `items`：18 个报表项目（`{ key, label, level, subtotal, current, ytd }`），前端可直接渲染

实测（2026-10 本月 / 2026 年累计）：

| 项目 | 本月 | 本年累计 |
|---|---|---|
| 主营业务收入 | 2,103,209.20 | 17,779,260.60 |
| 主营业务成本 | 906,383.07 | 7,513,544.19 |
| 销售费用 | 200,338.00 | 2,003,380.00 |
| 管理费用 | 443,806.00 | 4,438,060.00 |
| 研发费用 | 133,156.00 | 1,331,560.00 |
| 营业利润 | 419,526.13 | 2,492,716.41 |
| 利润总额 | 419,526.13 | 2,492,716.41 |
| 净利润 | **419,526.13（正）** | **2,492,716.41（正）** |

公式校验通过：净利润 = 营业收入 - 营业成本 - 税金及附加 - 期间费用 + 投资收益 + 营业外收支 - 所得税。`period=2026-09` 返回 9 月净利润 299,217.44；非法 period → 400。

### 2.13 资产负债表

`GET /api/finance/balance-sheet`（`finance.view`，`period` 或 `asOfDate`）
返回 `{ period, asOfDate, assets: [{key,name,amount,items}], liabilities: [...], equity: [...], totals }`，按期末累计余额计算。

实测（2026-10 期末）：

| 项目 | 金额 |
|---|---|
| 流动资产合计 | 12,615,538.27（货币资金 5,814,021.44、应收账款 7,220,385.53、存货 -376,305.65、待处理财产损溢 -42,563.05） |
| 非流动资产合计 | 1,200,000.00（固定资产净值） |
| **资产总计** | **13,815,538.27** |
| 流动负债合计 | 3,156,840.37（应付账款 1,544,168.73、应交税费 1,612,671.64） |
| 非流动负债合计 | 0 |
| **负债合计** | **3,156,840.37** |
| 实收资本 | 8,000,000.00 |
| 未分配利润 | 2,658,697.90（含未结转损益 2,658,697.90） |
| **所有者权益合计** | **10,658,697.90** |
| **负债和所有者权益总计** | **13,815,538.27** |
| 差异 / 是否平衡 | **0 / balanced=true** |

历史期间：2026-09 末资产 12,636,810.55、负债 2,397,638.78、权益 10,239,171.77，差异 0；`asOfDate=2026-06-30` 资产 11,197,590.70，正常返回。

### 2.14 现金流量表（简化）

`GET /api/finance/cash-flow`（`finance.view`，`period=yyyy-MM`）
返回 `{ period, startDate, endDate, operating, investing, financing, net_increase, opening_cash, closing_cash, check, items }`；`items` 为 17 行可直接渲染的报表行（含小计/净额）。

实测（2026-10）：

| 类别 | 项目 | 金额 |
|---|---|---|
| 经营活动 | 销售商品、提供劳务收到的现金 | 1,316,283.87 |
| 经营活动 | 购买商品、接受劳务支付的现金 | 361,104.61 |
| 经营活动 | 支付给职工以及为职工支付的现金 | 401,300.00 |
| 经营活动 | 支付其他与经营活动有关的现金 | 351,000.00 |
| 经营活动 | 经营活动净额 | 202,879.26 |
| 投资活动 | 购建固定资产支付的现金 | 0（本期无） |
| 筹资活动 | 吸收投资 / 借款 | 0（本期无） |
| 合计 | 现金及现金等价物净增加额 | 202,879.26 |

校验：期初现金 5,611,142.18 + 净增加 202,879.26 = 期末现金 5,814,021.44，`check.diff = 0`。
2026-01（期初建账月）：经营活动净额 -144,848.38、投资活动净额 -1,500,000（购建固定资产）、筹资活动净额 +8,000,000（吸收投资），净增加 6,355,151.62，期初 -1,910,488.44 → 期末 4,444,663.18，校验差异 0。非法 period → 400。

### 2.15 账龄分析（应收 / 应付）

`GET /api/finance/ar-aging`、`GET /api/finance/ap-aging`（`finance.view`）
返回 `{ asOfDate, invoiceType, rows, summary: { buckets: [{key,label,amount,count,ratio}], total: {amount,count,partner_count} } }`；`rows` 按客户/供应商汇总，含四档金额（`0-30`/`31-60`/`61-90`/`90+`）、`total`、`invoice_count`、`max_overdue_days`、`oldest_due_date`。

实测（截至 2026-10-23）：

| 账龄区间 | 应收金额（笔数） | 占比 | 应付金额（笔数） |
|---|---|---|---|
| 0-30 天 | 5,430,804.87（33） | 75.1% | 1,461,308.09（10） |
| 31-60 天 | 1,733,989.52（7） | 24.0% | 0 |
| 61-90 天 | 19,933.20（1） | 0.3% | 0 |
| 90 天以上 | 42,935.14（2） | 0.6% | 84,843.79（1） |
| **合计** | **7,227,662.73（43 笔 / 25 客户）** | 100% | **1,546,151.88（11 笔 / 8 供应商）** |

四区间合计 = 总额（校验通过）；`rows` 第一名：应收 东莞市精密制造有限公司 1,308,715.38（最长逾期 24 天）。

### 2.16 应收 / 应付汇总排行

`GET /api/finance/receivable-summary`、`GET /api/finance/payable-summary`（`finance.view`）
返回 `{ asOfDate, invoiceType, limit: 20, rows, summary: { total_amount, invoice_count, partner_count } }`；按未结清余额降序取 Top 20。

实测：应收 25 个客户、合计 7,227,662.73（返回前 20）；第一名 东莞市精密制造有限公司 1,308,715.38、逾期 420,670.98；应付 8 家供应商、合计 1,546,151.88，第一名 深圳市鑫源电子科技有限公司 886,417.20。

### 2.17 科目映射（gl_mappings）

`GET /api/finance/gl-mappings`（`finance.view`）
返回 `{ rows, total }`；每行含 `key`、`account_code`、`description`、`account_name`、`category`、`direction`、`is_leaf`、`status`、`label`（中文标签）。实测 17 条：AR→1122 应收账款、AP→2202 应付账款、REVENUE→6001、COGS→6401、TAX_OUTPUT→222101、TAX_INPUT→222102、CASH→1001、BANK→1002、WIP→5001 等。

`PUT /api/finance/gl-mappings`（`finance.edit`），body `{ key, account_code }`：
校验映射键存在、科目存在且启用、必须是明细科目（`is_leaf=1`）；更新后调用 `gl.clearCache()` 使过账缓存失效。
实测：`OTHER_INCOME → 6111` 更新成功、再次查询已生效，随后还原为 6301；未知键 / 科目不存在 / 非明细科目（2221）/ 缺少 account_code 均返回 400。

### 2.18 权限验证

| 场景 | 结果 |
|---|---|
| 未登录访问 `/api/finance/overview` | `HTTP 401` |
| `guest`（只读访客，仅有 `finance.view`）读发票列表 | `HTTP 200` |
| `guest` POST 手工凭证 | `HTTP 403 无访问权限（需要 finance.create）` |
| `guest` PUT 发票 / PUT 科目映射 | `HTTP 403 无访问权限（需要 finance.edit）` |

---

## 3. 报表口径说明

### 3.1 总览

- 应收/应付余额 = **未结清发票口径**：`SUM(total_amount - paid_amount)`，排除状态 `已收/已核销/已作废`（AR）与 `已付/已核销/已作废`（AP）。
- 本月收款/付款 = `payments` 中 `status='POSTED'` 且 `payment_date` 落在本月。
- 现金+银行存款 = `voucher_lines` 中 `1001`/`1002` 的累计 `借-贷`（POSTED 凭证），分别给出 `cash_balance` 与 `bank_balance`。
- 本月收入/成本费用/利润 = 利润表口径（见 3.3），利润为「营业利润」；同时给出 `month_net_profit`（净利润）。
- 逾期应收 = 未结清 AR 且 `due_date < 今天`。

### 3.2 发票列表 summary 与总账对账

`/api/finance/invoices` 的 `summary` 是**筛选结果全量**的发票净额（含红字/已核销发票），因此：

- AR：23,494,288.35 - 16,273,902.82 = **7,220,385.53 = 总账 1122 余额（完全一致）**
- AP：9,476,450.11 - 7,932,281.38 = **1,544,168.73 = 总账 2202 余额（完全一致）**

而总览/账龄使用「未结清」口径（排除红字已核销发票），故与总账存在小额差异：AR 差 7,277.20、AP 差 1,983.15（即种子数据中的红字退货发票）。**对账时请使用发票列表 summary 或总账口径**，报表余额使用未结清口径，两者差异可由红字发票解释。

### 3.3 利润表

- 收入类科目（`category=INCOME`）金额 = **贷方发生额 - 借方发生额**；成本费用类（`COST/EXPENSE`）金额 = **借方发生额 - 贷方发生额**。
- 营业收入 = 6001 主营业务收入 + 6051 其他业务收入；营业成本 = 6401 + 6402。
- 营业利润 = 营业收入 - 营业成本 - 6403 税金及附加 - 期间费用（6601 销售 + 6602 管理 + 6603 财务 + 6604 研发）+ 6111 投资收益。
- 利润总额 = 营业利润 + 6301 营业外收入 - 6711 营业外支出；净利润 = 利润总额 - 6801 所得税费用。
- 本月数取 `period` 区间；本年累计取 `yearStart(period) ~ period 月末`。

### 3.4 资产负债表

按**累计发生额**计算期末余额（POSTED 凭证，自建账起至期末）：

- 借方类科目（ASSET/COST/EXPENSE）金额 = 借 - 贷；贷方类科目（LIABILITY/EQUITY/INCOME）金额 = 贷 - 借。
- 因此备抵科目（1602 累计折旧、1231 坏账准备）与借方余额的负债明细（222102 进项税额）自然带出负号，报表自动平衡。
- COST 类科目（5001 生产成本等）并入「存货」列示；2401 递延收益列入非流动负债。
- **未分配利润 = 4103 本年利润 + 4104 利润分配 + 未结转损益**（收入类贷方净额 - 费用类借方净额，自建账起累计）。系统未做期末结转，用该口径还原未分配利润，保证「资产 = 负债 + 所有者权益」。
- 实测平衡：差异 0.00（2026-10 与 2026-09 均为 0）。

### 3.5 现金流量表

- 遍历期间内**含 1001/1002 的 POSTED 凭证**：现金账户借方发生额 = 流入，贷方发生额 = 流出。
- 按**对方科目发生额占比**把现金收支分摊到经营/投资/筹资项目（四舍五入差额由末行承接，保证分摊合计 = 现金收支总额）：
  - 经营流入：对方为 6001/6051/1122/1121/2203 → 销售商品收到现金；其余 → 其他经营。
  - 经营流出：2202/2201/存货类（1401~1471、5001~5301、1123）→ 购买商品支付现金；2211 → 支付职工薪酬；2221/222101~222105/6403/6801 → 支付税费；6601~6604/6711/1221 → 其他经营。
  - 投资：1601/1602/1604/1701/1702/1801 的借/贷方 → 购建/处置长期资产。
  - 筹资：4001/4002 贷方 → 吸收投资；2001/2231/2241 贷方 → 取得借款；2001/2231/2241/4104 借方 → 偿还债务/分配股利。
- `check.diff` 校验「期末现金 - 期初现金 - 净增加额」，实测为 0。

### 3.6 科目树 / 科目余额表 / 明细账

- 余额统一按**科目正常方向**表示（借方科目：借-贷；贷方科目：贷-借），负数为反向余额。
- 科目树父级汇总：借/贷发生额直接累加；余额按父科目方向换算（子科目方向不同取负），如 2221（贷）汇总 222101（贷，正）+ 222102（借，负）。
- 明细账逐笔余额 = 期初余额 ± 本笔借贷，使用 SQL 窗口函数在完整区间累计后分页，翻页余额连续。
- 试算平衡：`totals.balanced` 校验期初/本期/期末借贷合计是否相等。

### 3.7 账龄

- 以发票 `due_date` 为基准计算逾期天数；**未到期（≤0 天）归入 0-30 天档**；区间为 0-30 / 31-60 / 61-90 / 90+。
- 只统计未结清发票（`total_amount - paid_amount > 0.005`）。

---

## 4. 测试数据与清理

- 所有**读接口**对共享演示库只读，不产生副作用。
- **写接口实测**产生的数据已在测试结束后清理并校验恢复：
  - 手工凭证 `记-202610-0158`（id 1819）已删除（含分录）；
  - 被修改的发票 `YSFP2026100136`（id 237）的 `due_date`/`remark` 已还原；
  - 科目映射 `OTHER_INCOME` 已还原为 6301；
  - 清理后 `vouchers=1817 / voucher_lines=4181`，全库借贷合计相等（114,859,160.58 = 114,859,160.58）。
- 测试脚本未写入项目仓库（位于 `D:\temp\`，仅本报告入库）。

---

## 5. 前端字段建议（页面数据契约）

| 页面 | 接口 | 建议直接使用的字段 |
|---|---|---|
| 财务总览 KPI 卡片 | `GET /finance/overview` | `ar_balance`、`ap_balance`、`month_receipt`、`month_payment`、`cash_total`、`month_income`、`month_cost`、`month_profit`、`overdue_ar_amount`/`overdue_ar_count`；明细面板用 `receivable`/`payable`/`cash`/`month` 分组；对账差异看 `receivable.diff` |
| 应收/应付发票列表 | `GET /finance/invoices` | `rows[].invoice_no`、`partner_name`、`invoice_date`、`due_date`、`total_amount`、`paid_amount`、`remain_amount`、`status`、`overdue_days`、`allocation_count`；表尾汇总用 `summary`；筛选项：`invoiceType`、`status`、`partnerId`、日期区间、`overdue=1` |
| 发票详情/核销抽屉 | `GET /finance/invoices/:id` | `partner`（联系人/电话/税号/信用额度）、`doc`/`source_doc`（来源单钻取）、`allocations[].payment_no/payment_date/amount/method`、`vouchers[].voucher_no` |
| 发票编辑弹窗 | `PUT /finance/invoices/:id` | 仅提交 `due_date`、`remark`；其余字段禁用 |
| 收付款流水 | `GET /finance/payments` | `payment_no`、`payment_date`、`partner_name`、`payment_type`、`method`、`amount`、`allocated_amount`、`invoice_count`、`status` |
| 凭证查询 | `GET /finance/vouchers` | `voucher_no`、`voucher_date`、`period`、`voucher_type`、`summary`、`total_debit`、`line_count`、`source_type`/`source_no`（钻取来源单据） |
| 凭证详情 | `GET /finance/vouchers/:id` | `lines[].account_code/account_name/summary/debit/credit/partner_name` |
| 手工凭证录入 | `POST /finance/vouchers` | 提交 `voucher_date`、`summary`、`lines`；前端做借贷平衡即时校验（后端仍会校验）；返回即完整凭证（含凭证号） |
| 科目树 | `GET /finance/accounts/tree` | 递归渲染 `children`；列：`opening_balance`、`current.debit`、`current.credit`、`current.balance`、`ytd.debit`、`ytd.credit`、`ytd.balance`；`is_leaf` 控制是否允许挂凭证 |
| 科目余额表 | `GET /finance/trial-balance` | `rows[].code/name/direction/opening_balance/debit/credit/closing_balance`；表尾用 `totals`（含 `balanced` 提示） |
| 明细账 | `GET /finance/ledger` | 表头 `account`/`opening_balance`/`closing_balance`；行 `voucher_date`、`voucher_no`、`summary`、`debit`、`credit`、`balance`、`partner_name` |
| 利润表 | `GET /finance/income-statement` | 直接用 `items[]` 渲染（`label`/`current`/`ytd`/`level`/`subtotal`）；合计行看 `current.net_profit`/`ytd.net_profit` |
| 资产负债表 | `GET /finance/balance-sheet` | `assets`/`liabilities`/`equity` 分组数组（`items[].name/amount`）；底部用 `totals.asset_total`、`liability_equity_total`、`balanced` |
| 现金流量表 | `GET /finance/cash-flow` | 直接用 `items[]`（`group`/`label`/`amount`/`subtotal`）；顶部用 `net_increase`、`opening_cash`、`closing_cash` |
| 账龄分析 | `GET /finance/ar-aging`、`ap-aging` | `summary.buckets[]`（含 `ratio` 画占比条）、`summary.total`；表格 `rows[]`（四档金额 + `max_overdue_days`） |
| 应收/应付排行 | `GET /finance/receivable-summary`、`payable-summary` | `rows[]`（`partner_name`、`remain_amount`、`overdue_amount`、`max_overdue_days`）、`summary` |
| 科目映射设置 | `GET/PUT /finance/gl-mappings` | 行含 `key`/`label`/`account_code`/`account_name`；下拉选科目可用 `/api/meta/options?type=account`（仅返回明细科目）；保存后映射立即生效 |

通用约定：

- 金额字段均为数字（元，2 位小数），前端用 `toFixed(2)` / 千分位格式化即可。
- 期间参数统一 `yyyy-MM`；日期统一 `YYYY-MM-DD`。
- 分页返回统一 `{ rows, total, page, pageSize }`（除总览、报表、账龄、排行等聚合接口）。
- 排序参数 `orderBy` 形如 `total_amount desc`，仅白名单字段生效。

> 联调确认：前端 `web/src/pages/finance/`（总览、发票、收付款、凭证、三大报表、科目余额表、明细账、账龄、科目映射）当前使用的请求路径与字段名与本报告契约一致，未发现字段不匹配。

---

## 6. 已知数据特性与注意事项

1. **红字发票**：种子数据含销售/采购退货红字发票（状态 `已核销`、金额为负），未结清口径会排除它们，导致未结清余额与总账差 7,277.20（AR）/1,983.15（AP）；发票列表全量 summary 与总账完全一致，可用于对账。
2. **存货为负（-376,305.65）**：种子数据生产成本（5001）为贷方余额 -2,077,279.09（生产完工按材料成本 ×118% 结转，而领料全额计入 WIP），属种子数据特性；资产负债表仍严格平衡。
3. **待处理财产损溢（1901）为贷方余额 -42,563.05**：盘点差异未做后续结转，属种子数据特性。
4. **2026-01 期初现金为负（-1,910,488.44）**：期初建账凭证日期为 2026-01-01，而 2025-11/12 已发生业务，导致建账前现金为负；只影响 2026-01 现金流量表的期初数展示，不影响期末余额与净增加额。
5. **共享演示库**：其他模块（销售/采购/生产/库存等）联调会持续新增单据与凭证，本报告数值为 2026-10-23 12:2x 快照；报表校验类断言（借贷平衡、资产=负债+权益、现金流勾稽）在任何时点都应成立。
6. **凭证号并发**：手工凭证取号已改为「期间最大序号 + 1」（事务内），避免 `lib/numbering.mjs` 的 COUNT 取号在并发/删除场景撞号。
7. **科目映射缓存**：`PUT /finance/gl-mappings` 更新后会调用 `gl.clearCache()`，过账与报表立即使用新映射；无需重启服务。

---

## 7. 复现方式（摘要）

```powershell
# 1) 启动独立测试服务（不要动 Lead 的 8787）
cd '<项目根目录>\erp-suite'
$env:ERP_PORT=8788; node server/index.mjs

# 2) 登录拿 token
$login = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/auth/login' -Method POST `
  -Body ([Text.Encoding]::UTF8.GetBytes('{"username":"admin","password":"admin123"}')) `
  -ContentType 'application/json; charset=utf-8'
$h = @{ Authorization = "Bearer $($login.data.token)" }

# 3) 逐端点验证
Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/finance/overview' -Headers $h | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/finance/balance-sheet?period=2026-10' -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/finance/income-statement?period=2026-10' -Headers $h | ConvertTo-Json -Depth 8
```

实测命令覆盖：17 组端点 + 参数组合 + 空结果 + 分页 + 排序白名单 + 400/403/404 校验 + 写入后回查，共 168 项断言，全部通过。
