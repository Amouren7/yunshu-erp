# 01 经典 ERP 功能分析（ERPNext / Odoo / 用友金蝶 对标）

- 文档版本：v1.0
- 编写日期：**2026-10-23**
- 编写人：rea-analyst（分析专员）
- 适用项目：云枢ERP（`<项目根目录>\erp-suite`，单公司、SQLite + Node + React 演示/实用型系统）
- 上游参考仓库（均为真实克隆、可复核的 commit）：
  - ERPNext：`frappe/erpnext`，commit `83569a2ea044311454cbff9a23251879e14053fe`，提交日期 2026-10-23（`develop` 分支快照）
  - Odoo：`odoo/odoo`，commit `945000ed08c4218f35a66f1dca7cc0784dfd3aee`，提交日期 2026-10-06
  - Frappe HRMS：`frappe/hrms`，commit `ff82141805f85f09494da22c6e438a8980093d2a`，提交日期 2026-10-22
  - 三仓均以 `git clone --filter=blob:none --no-checkout --depth 1` 拉取，用 `git ls-tree -r --name-only HEAD` 得到**零失真**的 doctype / addon 清单，未依赖任何二手资料。

## 0. 一句话结论

经典 ERP 的复杂度不在"表多"，而在**单据链 + 状态机 + 过账规则 + 主数据约束**四件事。ERPNext 用 549 个 DocType（分布在 21 个模块目录中）覆盖全流程，Odoo 用 644 个 addon 做模块化拼装，二者共同证明：**一张单据的价值 90% 来自"它由哪张单生成、能生成哪张单、什么状态下能做什么动作、过账影响哪些科目"**。云枢ERP 应坚持"单一 documents 表 + doc_type 注册表 + 状态机 + 效果处理器"的路线，把功能点按单据链补齐，而不是按模块堆表。

## 1. 调研方法与证据

### 1.1 克隆与盘点命令（真实执行）

```powershell
# ERPNext：blobless + no-checkout，只拉目录树
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/frappe/erpnext.git "<项目根目录>\_refs\erpnext"
git -C "<项目根目录>\_refs\erpnext" show HEAD:erpnext/modules.txt          # 21 个模块
git -C "<项目根目录>\_refs\erpnext" ls-tree -r --name-only HEAD |
  Where-Object { $_ -match '^erpnext/[^/]+/doctype/[^/]+/[^/]+\.json$' }          # 549 个 DocType
# 按需取单个 DocType 定义（自动按需抓取 blob，不下载整仓）
git -C "<项目根目录>\_refs\erpnext" show HEAD:erpnext/selling/doctype/sales_order/sales_order.json

# Odoo：同样 blobless + no-checkout，只数 addon
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/odoo/odoo.git "<项目根目录>\_refs\odoo"
git -C "<项目根目录>\_refs\odoo" ls-tree -r --name-only HEAD addons        # 48,149 个文件 → 644 个 addon

# HRMS：补齐人力资源域
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/frappe/hrms.git "<项目根目录>\_refs\hrms"
# 164 个 DocType，10 个模块：HR Setup / Tenure / Recruitment / Shift and Attendance / Leaves /
# Expenses / Performance / Payroll / Tax and Benefits / HR
```

盘点到的原始数据已落盘，便于复核：

| 文件 | 内容 |
|---|---|
| `<项目根目录>\_refs\erpnext-doctypes.txt` | 549 条 ERPNext DocType 路径 |
| `<项目根目录>\_refs\erpnext-doctypes-by-module.md` | 按 21 个模块分组的 DocType 清单 |
| `<项目根目录>\_refs\erpnext-key-doctypes.json` | 24 个核心 DocType 的 `is_submittable / autoname / Select 字段选项` |
| `<项目根目录>\_refs\odoo-addons.txt` | 644 个 Odoo addon 名 |
| `<项目根目录>\_refs\hrms-doctypes-by-module.md` | 164 个 HRMS DocType 按模块分组 |

### 1.2 ERPNext 模块规模（DocType 数）

| 模块 | DocType 数 | 代表内容 |
|---|---:|---|
| accounts | 195 | 总账、发票、付款、税、银行对账、预算、折旧、定价规则 |
| stock | 82 | 物料、仓库、出入库、批次序列、调拨、盘点、库存台账 |
| manufacturing | 50 | BOM、工单、工序、工作中心、生产计划、MPS、一揽子订单 |
| setup | 43 | 公司、部门、员工、客户组、供应商组、UOM、销售员、区域 |
| crm | 28 | 线索、商机、合同、活动、销售阶段、竞品 |
| assets | 26 | 固定资产、折旧、资本化、维修、移位 |
| selling | 22 | 客户、报价、销售订单、产品包、信用额度、销售团队 |
| buying | 20 | 供应商、采购订单、RFQ、供应商报价、供应商评分卡 |
| quality_management | 16 | 质量目标、流程、评审、不符合项、行动项 |
| projects | 15 | 项目、任务、工时、活动成本 |
| subcontracting | 13 | 委外订单、委外 BOM、委外收发 |
| support | 11 | 工单、SLA、保修、服务日 |
| 其他（maintenance/regional/portal…） | — | 维护计划、区域、门户、EDI、电话 |

### 1.3 优先级定义（本项目语境）

| 优先级 | 含义 | 交付要求 |
|---|---|---|
| **P0** | 首版必须，缺了主流程走不通或演示不成立 | 必须可点、可提交、可过账、有数据 |
| **P1** | 增强版，显著提升"像真 ERP"的完整度和管理闭环 | 有页面 + 有状态 + 有校验，允许规则简化 |
| **P2** | 远期/不做，只保留数据模型或设计说明 | 不要求页面，避免拖垮工期 |

> 编号规则：`域-序号`。域：BD 基础数据、SD 销售、PD 采购、IM 库存、MF 生产、FI 财务、HR 人力、CR 客户关系、RP 报表、SY 系统。

## 2. 功能矩阵

### 2.1 基础数据与主数据（BD，32 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| BD-01 | 公司/组织档案 | `company` 单条：名称、税号、地址、电话、法人、开户行、默认币种、会计期间起始月 | P0 | ERPNext `setup/company`；Odoo `base`（res.company） |
| BD-02 | 部门树 | `departments(parent_id)`，禁止环；停用部门不可挂新单据 | P0 | ERPNext `setup/department`；Odoo `hr` |
| BD-03 | 岗位/职务 | `designations`：岗位名称、职级、默认部门 | P1 | ERPNext `setup/designation` |
| BD-04 | 员工档案 | `employees`：工号、部门、岗位、入职/离职、薪资、银行卡；`status` 在职/试用/离职 | P0 | ERPNext `setup/employee`；HRMS `hr` |
| BD-05 | 客户档案 | `customers`：编码、名称、类别、等级、区域、行业、联系人、税号、信用额度与账期、业务员 | P0 | ERPNext `selling/customer`（101 字段）；Odoo `contacts` |
| BD-06 | 客户分组/等级 | `category` + `level`，驱动价格与信用策略 | P1 | ERPNext `setup/customer_group` |
| BD-07 | 客户信用额度 | `credit_limit` + `credit_days`；提交订单时校验"未收金额 + 本单 ≤ 额度" | P0 | ERPNext `selling/customer_credit_limit` |
| BD-08 | 多联系人 | `contacts`（可挂 customer/supplier），主联系人标记 | P1 | Odoo `contacts`；行业通识 |
| BD-09 | 供应商档案 | `suppliers`：编码、类别、联系人、税号、开户行、账期、评级、状态 | P0 | ERPNext `buying/supplier` |
| BD-10 | 供应商分组与评级 | `category/rating`；与到货及时率/来料合格率挂钩（P1 先人工评级） | P1 | ERPNext `setup/supplier_group` + `buying/supplier_scorecard` |
| BD-11 | 物料主数据 | `items`：编码、名称、规格、类型（原料/半成品/成品/服务/虚拟件）、单位、品牌、条码、采购价/销售价/成本、税率、安全库存、批次/效期控制 | P0 | ERPNext `stock/item`（135 字段）；Odoo `stock`（product.template） |
| BD-12 | 物料分类 | `item_categories(parent_id)`，支持多级与 `item_type` 双层分类 | P0 | ERPNext `setup/item_group` |
| BD-13 | 计量单位与换算 | `uoms(rate)` + 物料主单位；跨单位换算写单行 | P0 | ERPNext `setup/uom`；Odoo `uom` |
| BD-14 | 多计量单位（采购/销售单位） | 物料可配置"采购单位/销售单位 + 换算率" | P2 | ERPNext `stock/uom_conversion_detail` |
| BD-15 | 物料变体（颜色/尺寸） | 变体属性 + 变体 SKU 生成 | P2 | ERPNext `stock/item_variant` |
| BD-16 | 仓库定义 | `warehouses`：编码、名称、类型（原料/成品/半成品/委外/不良品）、地址、负责人 | P0 | ERPNext `stock/warehouse`；Odoo `stock.warehouse` |
| BD-17 | 库位/货架 | `locations(warehouse_id, code)`，两级即可 | P1 | Odoo `stock.location`；行业通识 |
| BD-18 | 批号/序列号档案 | `batches(item_id, batch_no, prod_date, expiry_date)`；序列号档案 P2 | P1 | ERPNext `stock/batch`、`stock/serial_no` |
| BD-19 | 条码 | `items.barcode`，扫码带出物料 | P1 | ERPNext `stock/item_barcode` |
| BD-20 | 价格表/协议价 | `price_lists` + `item_prices(item, partner, min_qty, price)`；取价顺序：协议价 > 客户价 > 价格表 > 标准售价 | P1 | ERPNext `stock/price_list` + `stock/item_price`；Odoo `product` pricelist |
| BD-21 | 税码/税率 | `tax_rates`：名称、税率、销项/进项标记；单据行按税率算税，允许一单多税率 | P0 | ERPNext `accounts/item_tax_template`；Odoo `account`（account.tax） |
| BD-22 | 付款条件 | `payment_terms`：现款/月结 30/60/90/预付比例；带出到单据 `due_date` 计算 | P0 | ERPNext `accounts/payment_terms_template` + `payment_schedule` |
| BD-23 | 币种与汇率 | `currencies(rate, is_base)`；外币单据按成交日汇率折本位币 | P1 | ERPNext `setup/currency_exchange` |
| BD-24 | 会计科目表 | `accounts(code, name, category, direction, parent_code, is_leaf)`；预置中国小企业准则科目 | P0 | ERPNext `accounts/account`（root_type/report_type/account_type 三分类） |
| BD-25 | 成本中心/项目辅助核算 | `cost_centers` + 凭证行 `dept_id`；按部门/项目出费用报表 | P1 | ERPNext `accounts/cost_center`、`accounting_dimension` |
| BD-26 | 银行账户 | `bank_accounts`：账户名、开户行、账号、对应科目（1002 明细） | P1 | ERPNext `accounts/bank_account` |
| BD-27 | 编号规则 | `number_series(doc_type, prefix, next_no, pad, date_pattern)`；如 `XSDD202610230001` | P1 | ERPNext naming series；Odoo `ir.sequence` |
| BD-28 | 打印模板 | 单据打印（A4 出库单/对账单），HTML 模板 + 打印次数计数 | P2 | 行业通识（ERPNext Print Format） |
| BD-29 | 数据导入 | Excel/CSV 导入客户、供应商、物料、期初库存；失败行回滚并报错 | P1 | 行业通识（ERPNext Data Import） |
| BD-30 | 附件管理 | 单据附件表 `attachments(doc_id, file_path, size, mime)` | P1 | 行业通识（Odoo `ir.attachment`） |
| BD-31 | 多公司/多账套 | 单库多公司隔离（`company_id` 全表冗余） | P2 | ERPNext `setup/company`；Odoo `res.company` |
| BD-32 | 自定义字段 | 单据 `extra_json` 已预留，前端按 `doc_type.fields` 渲染 | P1（已具备扩展点） | 行业通识（ERPNext Custom Field） |

**本组落地建议**：BD-01/02/04/05/09/11/12/13/16/21/22/24 是 P0 的 12 根柱子，正好对应现有 `schema.sql` 中的 `departments / employees / customers / suppliers / items / item_categories / uoms / tax_rates / warehouses / accounts / gl_mappings / number_series`。需补：公司档案、付款条件主数据、价格表（目前 `items.price_sale` 单价格，先做 BD-20 的 P1 版本）。

### 2.2 销售管理（SD，27 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| SD-01 | 销售报价单 | 新单据 `QUO`；状态 `DRAFT/OPEN/REPLIED/PARTIALLY_ORDERED/ORDERED/LOST/CANCELLED/EXPIRED`（ERPNext 8 值） | P1 | ERPNext `selling/quotation`（is_submittable=1，status 8 值） |
| SD-02 | 报价转销售订单 | 报价单"转订单"按行复制，记录 `source_type=QUO, source_id`，回写报价单为 ORDERED | P1 | ERPNext Quotation → Sales Order；Odoo `sale` |
| SD-03 | 销售订单 | 已实现 `SO`；状态 9 值见 `docTypes.mjs`（DRAFT→SUBMITTED→APPROVED→PARTIAL_SHIPPED→FULL_SHIPPED→COMPLETED→CLOSED→VOID） | P0（已实现） | ERPNext `selling/sales_order`（status 9 值 + delivery_status/billing_status 双维度） |
| SD-04 | 行级价格/折扣/税额计算 | `qty*price*(1-discount_rate)` 未税金额，行税 = 未税×税率，表头汇总 | P0（已实现） | 通识；ERPNext `sales_order_item`（124 字段） |
| SD-05 | 最低价/超折扣审批 | 低于 `items.price_sale × 最低折扣` 时强制走审批（转 SUBMITTED 需审批人） | P1 | 行业通识（用友"价格政策"） |
| SD-06 | 订单审批 | `submit → approve`，审批人写 `approved_by/approved_at`，日志进 `document_logs` | P0（已实现） | ERPNext 工作流；Odoo `sale` 确认动作 |
| SD-07 | 信用检查 | 提交/审批时校验客户信用额度与超期应收；超限阻断并提示 | P0 | ERPNext `customer_credit_limit`；Odoo `sale` 信用模块 |
| SD-08 | 订单变更/关闭 | APPROVED 后可"关闭"（不再发货/开票）；变更留日志 | P1 | ERPNext `sales_order` status Closed；通识 |
| SD-09 | 发货通知/拣货 | 由 SO 生成 `DN`，按行回写 `delivered_qty`；支持部分发货 | P0（已实现） | ERPNext `stock/delivery_note`（status 8 值） |
| SD-10 | 装箱单 | 按发货单生成装箱明细（箱号、毛重、体积） | P2 | ERPNext `stock/packing_slip` |
| SD-11 | 发货出库过账 | 审批 DN 时扣减库存、生成应收发票、生成凭证（借 1122/贷 6001+2221；借 6401/贷 1405） | P0（已实现） | ERPNext Delivery Note 过账；现行 `posting.mjs` effectSalesDelivery |
| SD-12 | 物流跟踪 | 发货单 `x_logistics / x_tracking_no`；列表可查 | P1（字段已具备） | ERPNext `stock/shipment` |
| SD-13 | 销售发票 | 目前由 DN 自动生成 AR 发票；P1 支持"先开票后发货"与发票独立编辑 | P0/P1 | ERPNext `accounts/sales_invoice`（status 13 值） |
| SD-14 | 销售退货 | 已实现 `SR`：红字冲收入/销项税/应收，库存回库并按原成本冲成本 | P0（已实现） | ERPNext Sales Invoice Return；现行 `effectSalesReturn` |
| SD-15 | 换货 | 退货单 + 新发货单组合，或独立"换货单" | P2 | 行业通识 |
| SD-16 | 预收款/定金 | `RC` 收款单支持不挂发票的预收，形成 `2203 预收账款` | P1 | ERPNext `payment_entry`（未分配金额）；Odoo `account.payment` |
| SD-17 | 收款与发票核销 | `RC` 行挂 AR 发票，核销后回写发票 `paid_amount/status`；支持一收款多发票 | P0（已实现） | ERPNext `accounts/payment_reconciliation`；Odoo 对账 |
| SD-18 | 应收账龄 | 按 `due_date` 分 30/60/90/90+ 四档，含未开票应收 | P0 | ERPNext Accounts Receivable 报表；Odoo 账龄表 |
| SD-19 | 客户对账单 | 按客户+期间列发票/收款/余额，可导出 | P1 | 行业通识（用友"客户对账单"） |
| SD-20 | 销售提成 | 按业务员/订单金额/回款额计佣，生成提成单 | P1 | ERPNext `setup/sales_partner` |
| SD-21 | 销售目标 | 按业务员/月设目标，仪表盘展示完成率 | P2 | ERPNext `setup/target_detail` |
| SD-22 | 销售合同 | `contracts` 已建表；与订单关联、到期提醒 | P1（表已存在，待接页面） | ERPNext `crm/contract`；Odoo `sale` 合同 |
| SD-23 | 促销/优惠券 | 定价规则：满减/买赠/折扣券，按优先级叠加 | P1 | ERPNext `accounts/pricing_rule`、`coupon_code` |
| SD-24 | 会员/积分 | 积分获取与抵扣 | P2 | ERPNext `accounts/loyalty_program` |
| SD-25 | POS 零售 | 门店收银、挂单、日结 | P2 | Odoo `point_of_sale`（含 50+ 扩展 addon） |
| SD-26 | 电商/网店对接 | 网店订单同步、库存同步 | P2 | Odoo `website_sale` |
| SD-27 | 履行状态双维度 | 订单同时维护 `delivery_status（未发/部分/全发）` 与 `billing_status（未开/部分/全开）` | P1 | ERPNext Sales Order 的 per_delivered / per_billed |

**本组关键**：ERPNext 销售订单没有"一个万能状态"，而是 **status + delivery_status + billing_status + advance_payment_status 四个正交字段**。云枢ERP 当前用单状态链，P0 可接受；P1 建议补 `delivered_ratio`、`billed_ratio` 两个冗余字段，报表直接读，不实时聚合。

### 2.3 采购管理（PD，21 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| PD-01 | 采购申请 | 需求部门提 `PRQ`，可按库存缺口/销售订单生成；审批后转采购订单 | P1 | ERPNext `stock/material_request`（status 11 值 + purpose 6 值） |
| PD-02 | 询价比价 | `RFQ` 多供应商报价，比价后转 PO | P1 | ERPNext `buying/request_for_quotation` |
| PD-03 | 供应商报价 | 供应商报价单独立建档，记录有效期 | P1 | ERPNext `buying/supplier_quotation` |
| PD-04 | 采购订单 | 已实现 `PO`；状态 8 值（含 PARTIAL_RECEIVED/FULL_RECEIVED） | P0（已实现） | ERPNext `buying/purchase_order`（status 11 值） |
| PD-05 | 采购审批 | 提交→审核；超过金额阈值升级审批（P2） | P0（已实现） | ERPNext 工作流；Odoo `purchase`（to approve） |
| PD-06 | 收货入库 | 由 PO 生成 `GRN`，按行回写 `delivered_qty`；支持部分入库 | P0（已实现） | ERPNext `stock/purchase_receipt` |
| PD-07 | 到货质检 | 入库单挂质检单（合格/不合格/让步接收），不合格转退货 | P1 | ERPNext `stock/quality_inspection` |
| PD-08 | 采购发票 | 由 GRN 自动生成 AP 发票；P1 支持供应商发票号登记 | P0（已实现） | ERPNext `accounts/purchase_invoice`（status 11 值） |
| PD-09 | 三单匹配 | PO ↔ 入库单 ↔ 发票 数量/单价一致性校验，差异挂起 | P0（需补） | Odoo `account` 3-way match；行业通识 |
| PD-10 | 采购退货 | 已实现 `PR`：冲应付/进项税转出/冲存货 | P0（已实现） | ERPNext Purchase Return；现行 `effectPurchaseReturn` |
| PD-11 | 预付款 | `PY` 付款单支持无发票预付，形成 `1123 预付账款` | P1 | ERPNext `payment_entry`；Odoo `account.payment` |
| PD-12 | 付款与核销 | `PY` 行挂 AP 发票核销，回写发票状态 | P0（已实现） | ERPNext `payment_reconciliation` |
| PD-13 | 应付账龄 | 按到期日分档，含未开票应付（暂估） | P0 | ERPNext Accounts Payable 报表 |
| PD-14 | 供应商对账 | 按供应商+期间列发票/付款/余额 | P1 | 行业通识 |
| PD-15 | 供应商绩效 | 到货及时率、合格率、价格竞争力，季度评分 | P2 | ERPNext `buying/supplier_scorecard`（含 8 个评分维度 DocType） |
| PD-16 | 采购价格历史 | 供应商×物料最近成交价、最低价、均价曲线 | P1 | ERPNext `stock/item_price` |
| PD-17 | 框架协议/一揽子订单 | 年度框架价 + 分批下单，累计量控制 | P1 | ERPNext `manufacturing/blanket_order` |
| PD-18 | 委外加工 | 委外订单 + 发料 + 收货 + 加工费结算 | P2 | ERPNext `subcontracting`（13 个 DocType） |
| PD-19 | 采购计划/MRP | 由销售订单 + 库存 + 在途算净需求，生成采购建议 | P1 | ERPNext `manufacturing/material_request_plan_item`；Odoo MRP |
| PD-20 | 进口/报关 | 报关单、关税、到岸成本分摊 | P2 | ERPNext `stock/landed_cost_voucher`；行业通识 |
| PD-21 | 暂估入库/票到冲回 | 月末货到票未到，先暂估入库，次月红冲 | P1 | 行业通识（用友"暂估应付款"） |

**本组关键**：ERPNext 采购订单的 `status` 把"收货"和"开票"两件事合并在一个枚举里（To Receive and Bill / To Bill / To Receive），这与销售订单的正交做法不同——因为采购侧通常以"收票"为终止节点。云枢ERP 的 P0 实现用 `PARTIAL_RECEIVED/FULL_RECEIVED` 近似即可；P1 后再拆 `received_ratio / billed_ratio`。

### 2.4 库存管理（IM，24 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| IM-01 | 库存台账/流水 | `stock_ledger`：每次出入库写一行，含方向、数量、单位成本、结存数量/成本 | P0（已实现） | ERPNext `stock/stock_ledger_entry` |
| IM-02 | 实时库存 | `stock_balances(item, warehouse)`：qty / reserved_qty / avg_cost，主键联合 | P0（已实现） | ERPNext `stock/bin`；Odoo `stock.quant` |
| IM-03 | 库存调拨 | 已实现 `TR`：出库仓→入库仓，成本随货结转 | P0（已实现） | ERPNext `stock/stock_entry`（Material Transfer） |
| IM-04 | 盘点/盘盈亏 | 已实现 `ADJ`：账面 vs 实盘，差异入 `1901 待处理财产损溢`→ `6602/6711` | P0（已实现） | ERPNext `stock/stock_reconciliation` |
| IM-05 | 其他出入库 | 已实现 `OI/OO`：盘盈盘亏、借入借出、样品、研发领用 | P0（已实现） | ERPNext Stock Entry 类型枚举 |
| IM-06 | 批次管理 | 出入库行带 `batch_no`；批次库存单独可查 | P1（字段已具备，缺批次库存表） | ERPNext `stock/batch` |
| IM-07 | 效期与先进先出 | 物料 `shelf_life_days`；出库按效期升序推荐批次 | P1 | ERPNext Batch expiry；Odoo `product_expiry` |
| IM-08 | 序列号追踪 | 单件序列号出入库与流向 | P1 | ERPNext `stock/serial_no` |
| IM-09 | 安全库存/再订货点 | `safety_stock / reorder_point / max_stock` 已建字段；低于阈值进补货建议 | P0 | ERPNext `stock/item_reorder` |
| IM-10 | 库存预警 | 仪表盘红黄灯：低于安全库存、超储、临期、呆滞 | P0 | 行业通识（用友"库存预警"） |
| IM-11 | 移动加权平均成本 | 入库重算 `avg_cost=(旧金额+新金额)/(旧数量+新数量)`；出库按当前均价 | P0（已实现） | ERPNext `stock/stock_ledger_entry`（MA/FIFO 可配） |
| IM-12 | 成本调整/重估 | 手工调整库存成本并生成调整凭证 | P2 | ERPNext `stock/repost_item_valuation` |
| IM-13 | 存货跌价准备 | 按可变现净值计提 `1471 存货跌价准备` | P2 | 行业通识（企业会计准则） |
| IM-14 | 库龄/呆滞分析 | 按入库批次算库龄，>90/180/365 天分层 | P1 | 行业通识 |
| IM-15 | 库存预留 | 订单审核后预留数量，可用量 = 现存 − 预留 | P1（`reserved_qty` 已建） | ERPNext `stock/stock_reservation_entry`；Odoo 预留 |
| IM-16 | 条码出入库 | 扫码枪/PDA：扫物料码 → 填数量 → 生成单据行 | P1 | ERPNext `stock/item_barcode`；Odoo `barcodes` |
| IM-17 | 多仓库支持 | 单据表头/行均可指定仓库；调拨跨仓 | P0（已实现） | ERPNext `stock/warehouse` |
| IM-18 | 质检库存/冻结 | 待检区库存不可发货，检验后释放 | P2 | Odoo `quality` 质检点；ERPNext Quality Inspection |
| IM-19 | 组装/拆卸 | BOM 型组装单（成品入库、组件出库） | P2 | ERPNext Stock Entry（Manufacture/Repack） |
| IM-20 | 在途/在检库存 | 调拨在途数量单独统计，不入可用量 | P2 | ERPNext Stock Entry `transfer_status` |
| IM-21 | 库存报表 | 收发存汇总表、明细账、库存金额表 | P0 | 行业通识（用友"收发存汇总表"） |
| IM-22 | 帐实对账 | 库存台账 vs 总账存货科目余额核对，差异表 | P1 | 行业通识（ERPNext Stock and Account Value 报表） |
| IM-23 | 仓管权限隔离 | 按仓库授权，仓管只能操作本仓单据 | P1 | 行业通识（Odoo 多仓权限） |
| IM-24 | 批次追溯 | 正向（成品→原料批次）、反向（原料→受影响成品） | P2 | ERPNext Serial/Batch traceability |

**本组关键**：库存是本项目最容易"看起来对、算起来错"的部分。必须坚持三条不变量：① 任何库存变动只能来自单据过账（禁止直接改 `stock_balances`）；② `stock_ledger` 只增不改，冲销用反向分录；③ 出库成本 = 出库时点的 `avg_cost`，写死在台账行，后续改价不影响历史。

### 2.5 生产制造（MF，24 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| MF-01 | 物料清单 BOM | `boms` + `bom_lines`：父件、子件、用量、损耗率、版本、产出数量 | P0（已建表，缺页面/成本） | ERPNext `manufacturing/bom`（94 字段，is_submittable=1） |
| MF-02 | BOM 版本管理 | 版本号 + 生效日期；工单锁定创建时的 BOM 版本 | P1 | ERPNext BOM 版本；Odoo BoM 版本 |
| MF-03 | 工艺路线 | `routings`：工序序列、工作中心、标准工时 | P1 | ERPNext `manufacturing/routing` |
| MF-04 | 工序主数据 | `processes`（已建）：工序名、工作中心、标准工时 | P1 | ERPNext `manufacturing/operation` |
| MF-05 | 工作中心 | `work_centers`（已建）：产能（每日工时）、小时费率 | P1 | ERPNext `manufacturing/workstation` |
| MF-06 | 生产订单/工单 | `work_orders` + 材料/工序子表；状态建议 `DRAFT/RELEASED/IN_PROGRESS/COMPLETED/CLOSED/VOID`（已建） | P0（已建表，缺页面与过账） | ERPNext `manufacturing/work_order`（status 9 值）；Odoo `mrp.production`（draft/confirmed/progress/to_close/done/cancel） |
| MF-07 | 生产计划 | 按销售订单/预测汇总生成生产计划，建议开工/完工日期 | P1 | ERPNext `manufacturing/production_plan`（status 8 值） |
| MF-08 | 主生产计划 MPS | 月度产能与需求平衡表 | P2 | ERPNext `manufacturing/master_production_schedule` |
| MF-09 | MRP 运算 | BOM 展开 + 库存/在途/在制 → 净需求 → 采购/生产建议 | P1 | ERPNext Production Plan / Material Request Plan；Odoo `mrp` |
| MF-10 | 领料/退料 | 工单按 BOM 定额发料，允许超领（审批）；退料回库 | P0 | ERPNext Material Request（Manufacture）+ Stock Entry |
| MF-11 | 工序报工 | 每道工序记录开始/结束、完成数、不良数、操作工 | P1 | ERPNext `manufacturing/job_card`；Odoo `mrp.workorder`（blocked/ready/progress/done/cancel） |
| MF-12 | 完工入库 | 完工单：成品入库、按 BOM 结转材料成本 + 人工/制造费用 | P0 | ERPNext Work Order 完工；现行库存/凭证框架可扩展 |
| MF-13 | 报废/损耗 | 报废单：材料或成品报废，成本入 `5602 营业外支出`/`5101` | P1 | ERPNext Stock Entry（Material Issue/Scrap） |
| MF-14 | 委外工序 | 工序外协：发料给加工商、收回半成品、结算加工费 | P2 | ERPNext `subcontracting`；Odoo `mrp_subcontracting` |
| MF-15 | 生产成本归集 | `5001 生产成本` 下按工单设辅助核算：直接材料/直接人工/制造费用 | P0 | 行业通识（成本会计） |
| MF-16 | 制造费用分摊 | `5101 制造费用` 按工时/机时/产量分摊入工单 | P1 | 行业通识 |
| MF-17 | 标准成本/差异 | 标准成本 vs 实际差异分析（价差/量差） | P2 | ERPNext `stock/item_standard_cost`；Odoo 标准成本法 |
| MF-18 | 产能与排产 | 工作中心负荷图、有限产能排产 | P2 | ERPNext `workstation_working_hour`；Odoo `mrp` 排程 |
| MF-19 | 生产看板 | 工单进度甘特/看板：待生产/进行中/已完工 | P1 | 行业通识（Odoo Manufacturing Orders 看板） |
| MF-20 | 生产质检 | 首检/巡检/终检记录，不合格转返工/报废 | P2 | ERPNext Quality Inspection（stock） |
| MF-21 | 设备维护 | 保养计划、保养记录、故障停机 | P2 | ERPNext `maintenance/maintenance_schedule`；Odoo `maintenance` |
| MF-22 | 工时统计 | 按工单/工序/人员汇总工时，用于人工成本与效率 | P1 | ERPNext `manufacturing/job_card_time_log` |
| MF-23 | 替代料 | BOM 行替代物料，缺料时自动替换并留痕 | P2 | ERPNext `stock/item_alternative` |
| MF-24 | 批次追溯 | 成品批次 → 材料批次 → 供应商/来料检验 | P2 | ERPNext Serial and Batch Bundle；Odoo lot traceability |

**本组关键**：生产是"单据链最长"的域：`销售订单/预测 → 生产计划 → 工单 → 领料单 → 报工 → 完工入库 → 成本结转`。ERPNext 把它拆成 50 个 DocType 是因为要覆盖离散制造全场景；云枢ERP 首版只做 **BOM + 工单 + 领料 + 完工 + 成本归集** 五件事（MF-01/06/10/12/15），其余 P1/P2。

### 2.6 财务会计（FI，32 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| FI-01 | 会计科目表 | `accounts` 已建；按中国小企业会计准则预置 5 大类 + 明细 | P0（已建，待补全科目） | ERPNext `accounts/account`（root_type: Asset/Liability/Income/Expense/Equity） |
| FI-02 | 凭证录入 | `vouchers` + `voucher_lines`；一行借一行贷，借贷必平 | P0（已实现人工部分） | ERPNext `accounts/journal_entry`（voucher_type 18 值） |
| FI-03 | 自动凭证生成 | 按单据效果映射科目：销售出库/采购入库/收付款/调拨/盘点/生产 | P0（已实现 10 类过账效果，其中 9 类生成凭证） | 现行 `posting.mjs`；ERPNext 自动记账 |
| FI-04 | 凭证审核/过账 | `status DRAFT/POSTED/VOID`；已过账凭证禁止编辑，只能红冲 | P0 | ERPNext Journal Entry 提交后不可改 |
| FI-05 | 红冲/反过账 | 生成反向凭证并关联原凭证 `reversal_of` | P1 | ERPNext Journal Entry 冲销 |
| FI-06 | 总账 | 按科目汇总期内发生额与余额 | P0（`accountBalances` 已有） | ERPNext `accounts/gl_entry` |
| FI-07 | 明细账 | 按科目+期间列每一笔分录含摘要/对方科目 | P0 | 行业通识（用友"明细账"） |
| FI-08 | 科目余额表 | 期初/本期借/本期贷/期末，按级次展开 | P0 | 行业通识 |
| FI-09 | 资产负债表 | 按报表项目取科目余额，支持年初数 | P0 | ERPNext `accounts/financial_report_template` |
| FI-10 | 利润表 | 收入-成本-费用=利润，本期/本年累计 | P0 | 同上 |
| FI-11 | 现金流量表 | 经营/投资/筹资三类，简化直接法 | P1 | 行业通识（小企业准则现金流量表） |
| FI-12 | 应收账款管理 | `invoices(AR)`：开票/收款/余额/账龄 | P0（已实现） | ERPNext `accounts/sales_invoice` |
| FI-13 | 应付账款管理 | `invoices(AP)` 同上 | P0（已实现） | ERPNext `accounts/purchase_invoice` |
| FI-14 | 收款单 | `RC`：客户、金额、结算方式、核销发票 | P0（已实现） | ERPNext `accounts/payment_entry`（payment_type: Receive/Pay/Internal Transfer） |
| FI-15 | 付款单 | `PY`：供应商、金额、账户 | P0（已实现） | 同上 |
| FI-16 | 核销/冲销 | `payment_allocations` 已建；支持部分核销、反核销 | P0（已实现） | ERPNext `payment_reconciliation` |
| FI-17 | 预收/预付 | 未核销余额挂 `2203/1123`，后续自动冲抵 | P1 | 行业通识 |
| FI-18 | 其他应收/应付款 | 员工借款、押金、代垫款 | P2 | 行业通识 |
| FI-19 | 费用报销 | 报销单 → 审批 → 付款 → 凭证（借费用/贷 1002） | P1 | HRMS `expense_claim`；Odoo `hr_expense` |
| FI-20 | 固定资产卡片 | `assets`：原值、残值率、使用年限、折旧方法、部门、状态 | P1 | ERPNext `assets/asset`（status 11 值，is_submittable=1） |
| FI-21 | 折旧计提 | 月折旧额 =（原值−残值）/ 年限 / 12；生成折旧凭证 | P1 | ERPNext `assets/depreciation_schedule` |
| FI-22 | 期末结转 | 结转损益到 `4103 本年利润`，再结转到 `4104 利润分配` | P1 | 行业通识 |
| FI-23 | 结账/反结账 | `accounting_period` 锁定期间，禁止再记账 | P1 | ERPNext `accounts/accounting_period` |
| FI-24 | 期初余额 | 科目期初 + 库存期初 + 往来期初，试算平衡校验 | P1 | 行业通识（ERPNext Opening Entry / Opening Invoice） |
| FI-25 | 银行对账 | 银行流水导入 → 与收付款匹配 → 余额调节表 | P1 | ERPNext `accounts/bank_reconciliation_tool`；Odoo 银行对账 |
| FI-26 | 承兑汇票/票据 | 票据台账、到期提示、贴现 | P2 | 行业通识 |
| FI-27 | 预算控制 | 部门/科目预算，超预算预警或阻断 | P2 | ERPNext `accounts/budget` |
| FI-28 | 税务管理 | 销项/进项台账、增值税申报表（简版） | P1 | ERPNext tax templates；行业通识 |
| FI-29 | 汇兑损益 | 外币余额期末重估，生成汇兑损益凭证 | P2 | ERPNext `accounts/exchange_rate_revaluation` |
| FI-30 | 多币种核算 | 外币单据 + 本位币折算 + 汇率表 | P2 | ERPNext Currency Exchange |
| FI-31 | 辅助核算 | 凭证行带部门/项目/客户/供应商，出多维报表 | P1 | ERPNext Cost Center / Accounting Dimension |
| FI-32 | 财务指标 | 毛利率、净利率、资产负债率、周转率、流动比率 | P1 | 行业通识 |

**本组关键**：ERPNext 的 `Account` 用 **root_type（5 大类）+ report_type（资产负债表/利润表）+ account_type（30 个语义角色）** 三层描述科目，这是自动记账的关键——过账规则应绑定 `account_type` 而不是硬编码科目号。云枢ERP 当前用 `gl_mappings` 的 key 映射科目号（AR/AP/REVENUE/COGS/…），P0 够用；P1 建议在 `accounts` 表补 `account_type` 语义列，让映射表可切换账套。

### 2.7 人力资源（HR，17 项，依据 Frappe HRMS 164 DocType）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| HR-01 | 组织架构 | 部门树 + 汇报关系 + 编制人数 | P0（部分已建） | HRMS `hr`；ERPNext `setup/department` |
| HR-02 | 员工档案 | `employees` 已建；补合同、紧急联系人、学历、银行卡 | P0（已建） | HRMS `hr`（Employee 120+ 字段） |
| HR-03 | 员工异动 | 入职/转正/调岗/晋升/离职 五类异动单 | P1 | HRMS `employee_onboarding / promotion / transfer / separation` |
| HR-04 | 考勤 | `attendances` 已建：正常/迟到/早退/缺勤/请假/加班 | P0（已建） | HRMS `attendance`、`employee_checkin` |
| HR-05 | 排班 | 班次模板 + 排班表 | P2 | HRMS `shift_type`、`shift_schedule` |
| HR-06 | 请假 | `leave_requests` 已建；年假余额、请假类型 | P0（已建） | HRMS `leave_application`、`leave_allocation` |
| HR-07 | 加班 | 加班申请 → 审批 → 计入薪资 | P1 | HRMS `overtime_slip`、`overtime_type` |
| HR-08 | 薪资结构 | 薪资项（基本/绩效/补贴/扣款/社保/公积金/个税） | P0 | HRMS `salary_structure`、`salary_component`（44 DocType） |
| HR-09 | 工资条计算 | `payrolls` 已建：按期间×员工生成，含应发/实发 | P0（已建） | HRMS `salary_slip`、`payroll_entry` |
| HR-10 | 社保公积金 | 企业/个人比例，按城市基数上下限 | P1 | HRMS `employee_benefit_application`；行业通识 |
| HR-11 | 个税计算 | 累计预扣法，专项附加扣除 | P1 | HRMS `income_tax_slab`；中国税法 |
| HR-12 | 工资发放与凭证 | 发放生成凭证：借 `2211 应付职工薪酬`/贷 `1002` | P1 | 行业通识 |
| HR-13 | 招聘 | 职位需求 → 候选人 → 面试 → Offer | P2 | HRMS `job_requisition / job_applicant / interview / job_offer` |
| HR-14 | 绩效 | 考核周期、KPI/KRA、评分、结果 | P2 | HRMS `appraisal`、`appraisal_cycle`、`kra` |
| HR-15 | 培训 | 培训计划、报名、结果、费用 | P2 | HRMS `training_program / training_event / training_result` |
| HR-16 | 费用报销 | 员工报销单 → 审批 → 付款 | P1 | HRMS `expense_claim`(6 DocType) |
| HR-17 | 合同管理 | 劳动合同签订/续签/到期提醒 | P1 | 行业通识（HRMS appointment_letter） |

**本组关键**：HRMS 单独成仓（164 个 DocType、10 个模块），说明 HR 的复杂度足以独立成产品。本项目 HR 只做"档案 + 考勤 + 请假 + 工资条 + 入转调离"（P0/P1），招聘/绩效/培训一律 P2，不要展开。

### 2.8 客户关系（CR，15 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| CR-01 | 线索 | `leads` 已建；状态 8 值：待跟进/已联系/已确认商机/已转客户/已流失（简化） | P0（已建） | ERPNext `crm/lead`（status 8 值 + qualification_status 3 值） |
| CR-02 | 商机 | `opportunities` 已建；阶段、金额、赢率、预计成交日 | P0（已建） | ERPNext `crm/opportunity`（status 6 值） |
| CR-03 | 线索转客户 | 一键转客户/商机，保留来源链路 | P0 | ERPNext Lead → Customer/Opportunity |
| CR-04 | 活动/拜访记录 | `crm_activities`（电话/拜访/邮件/微信），下一步跟进时间 | P0（已建） | ERPNext `crm/appointment`、`crm_note` |
| CR-05 | 销售漏斗 | 按阶段统计商机数与金额，转化率 | P1 | ERPNext `crm/sales_stage`；Odoo CRM 漏斗 |
| CR-06 | 流失原因 | 输单原因分类统计 | P1 | ERPNext `crm/opportunity_lost_reason` |
| CR-07 | 报价跟踪 | 商机关联报价单，跟踪报价状态 | P1 | ERPNext Opportunity → Quotation |
| CR-08 | 合同台账 | `contracts` 已建；金额、起止、状态 | P1（已建） | ERPNext `crm/contract` |
| CR-09 | 客户 360 | 客户详情页聚合：订单/回款/应收/服务/活动 | P1 | 行业通识（用友/金蝶客户档案全景） |
| CR-10 | 服务工单 | 客户报修/投诉 → 派工 → 处理 → 关闭 | P2 | ERPNext `support/issue`（status 5 值） |
| CR-11 | SLA | 响应/解决时限、超时提醒 | P2 | ERPNext `support/service_level_agreement` |
| CR-12 | 保修 | 保修卡、保修期、维修记录 | P2 | ERPNext `support/warranty_claim` |
| CR-13 | 满意度 | 服务后回访评分 | P2 | ERPNext `quality_management/quality_feedback` |
| CR-14 | 营销活动 | 活动计划、预算、名单、转化 | P2 | ERPNext `crm/campaign`、`crm/email_campaign`；Odoo `mass_mailing` |
| CR-15 | 公海/分配 | 线索回收规则、自动分配、保护期 | P2 | 行业通识（销售易/纷享销客） |

### 2.9 报表与 BI（RP，14 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| RP-01 | 经营驾驶舱 | 今日/本月：销售额、回款、订单数、库存总值、应收应付、毛利 | P0 | 行业通识；ERPNext 工作台 |
| RP-02 | 销售报表 | 按客户/业务员/商品/月份维度汇总 + 同比环比 | P0 | ERPNext Selling Analytics |
| RP-03 | 采购报表 | 按供应商/物料/月份汇总，到货及时率 | P0 | ERPNext Buying Analytics |
| RP-04 | 库存报表 | 收发存汇总、库存金额、周转天数 | P0 | ERPNext Stock Balance 报表 |
| RP-05 | 财务报表 | 三大表 + 科目余额表 + 明细账 | P0 | ERPNext Financial Statements |
| RP-06 | 生产报表 | 工单完成率、在制、工时、材料消耗 | P1 | ERPNext Production Analytics |
| RP-07 | 应收账龄 | 客户×账龄区间矩阵 | P0 | ERPNext AR Aging |
| RP-08 | 应付账龄 | 供应商×账龄区间矩阵 | P0 | ERPNext AP Aging |
| RP-09 | 毛利分析 | 订单/商品毛利率，低于阈值标红 | P0 | 行业通识 |
| RP-10 | 客户/商品排行 | Top N 客户、Top N 商品、滞销品 | P1 | ERPNext 报表中心 |
| RP-11 | 自定义报表 | 选表/选字段/条件/分组，保存为报表 | P2 | ERPNext Report Builder；Odoo Studio |
| RP-12 | 导出/打印 | 列表导出 CSV/Excel，单据打印 | P1 | 行业通识 |
| RP-13 | 定时报表 | 每日/每周邮件推送经营日报 | P2 | ERPNext Auto Email Report；Odoo `digest` |
| RP-14 | 数据钻取 | 汇总数点进去看明细单据 | P1 | 行业通识 |

### 2.10 系统管理（SY，18 项）

| 编号 | 功能点 | 实现要点（表/字段/规则） | 优先级 | 来源依据 |
|---|---|---|---|---|
| SY-01 | 登录/会话 | `users/sessions` 已建；token + 过期时间 | P0（已实现） | 行业通识；ERPNext 用户体系 |
| SY-02 | 用户管理 | 用户绑定员工/部门，启用停用 | P0（已实现） | ERPNext User |
| SY-03 | 角色与权限 | `roles.permissions` JSON：`模块.动作`，如 `sales.approve` | P0（已实现） | ERPNext Role Permission；Odoo `res.groups` |
| SY-04 | 数据权限 | `data_scope: all/dept/self`，查询自动加条件 | P1（已建字段，待接入） | 行业通识（用友数据权限） |
| SY-05 | 菜单/导航 | 按角色动态菜单 | P0 | 行业通识 |
| SY-06 | 操作日志 | `audit_logs`：谁在何时对哪个实体做了什么 | P0（已实现） | ERPNext Activity Log；Odoo `mail.thread` |
| SY-07 | 单据流转日志 | `document_logs`：动作、原状态、新状态、操作人、备注 | P0（已实现） | ERPNext 单据状态历史 |
| SY-08 | 系统参数 | `settings` 键值；公司信息、默认税率、启用模块 | P0（已实现） | ERPNext System Settings |
| SY-09 | 编号规则 | `number_series` 可配置前缀/位数/日期片段 | P1（已实现基础版） | ERPNext Naming Series |
| SY-10 | 字典/枚举 | 状态、类型、来源等枚举集中管理 | P1 | 行业通识 |
| SY-11 | 审批流配置 | 按金额/部门配置多级审批 | P2 | ERPNext Workflow；Odoo Studio |
| SY-12 | 消息通知/待办 | 待审批、预警、提醒进站内信 | P1（`notices` 已建） | ERPNext Notification；Odoo `bus` |
| SY-13 | 备份恢复 | SQLite 每日备份 + 一键恢复 | P1 | 行业通识 |
| SY-14 | 数据初始化 | 一键生成演示数据（见 `03-种子数据方案.md`） | P0（已实现 `seed` 脚本，待扩容） | 行业通识 |
| SY-15 | API 开放 | REST 接口 + token 鉴权，供外部系统对接 | P2 | Odoo XML-RPC/JSON-RPC；ERPNext REST |
| SY-16 | 多语言 | 中英切换 | P2 | Odoo i18n；ERPNext 翻译 |
| SY-17 | 打印模板 | 单据模板可配（字段、Logo、盖章） | P2 | ERPNext Print Format |
| SY-18 | 系统监控 | 健康检查、慢查询、错误日志 | P2 | 行业通识 |

## 3. 统计与优先级分布

| 域 | 项数 | P0 | P1 | P2 |
|---|---:|---:|---:|---:|
| 基础数据 BD | 32 | 12 | 14 | 6 |
| 销售 SD | 27 | 12 | 10 | 5 |
| 采购 PD | 21 | 8 | 8 | 5 |
| 库存 IM | 24 | 10 | 9 | 5 |
| 生产 MF | 24 | 5 | 8 | 11 |
| 财务 FI | 32 | 12 | 13 | 7 |
| 人力 HR | 17 | 6 | 7 | 4 |
| CRM | 15 | 4 | 5 | 6 |
| 报表 RP | 14 | 7 | 5 | 2 |
| 系统 SY | 18 | 8 | 5 | 5 |
| **合计** | **224** | **84** | **84** | **56** |

> 说明：矩阵共 **224 条功能点**（远超 120 条的要求），其中 P0 84 条。P0 条目全部有明确落地位置：要么已实现（`docTypes.mjs` 12 类单据 + `posting.mjs` 10 类过账效果 + `schema.sql` 30 张表），要么在 `04-模块落地清单.md` 中给出表/字段/状态机。P2 条目只保留设计说明，不占首版工期。

## 4. 对标差异与我方取舍

### 4.1 三种路线的差异

| 维度 | ERPNext | Odoo | 用友/金蝶（U8/云星空） | 云枢ERP 取舍 |
|---|---|---|---|---|
| 架构 | 单仓 549 DocType，模块=目录，元数据驱动表单 | 644 addon，模块可装卸，ORM 元数据 | 大而全，按模块授权，重实施 | 单 SQLite 库 + 单据注册表 + React 通用单据页 |
| 单据模型 | 每种单据一张 doctype，字段 40~235 个 | 每个业务对象一个 model，字段极多 | 单据模板 + 自定义项 | **统一 documents 表 + doc_type 配置**（已实现，正确方向） |
| 状态机 | 单 `status` + 多个正交子状态（delivery/billing） | 单 `state` + 计算字段（如 invoice_status） | 单据状态 + 审批流 | 单状态链 + 2~3 个冗余比率字段 |
| 过账 | 提交时生成 GL Entry，按 account_type 取科目 | 过账时生成 account.move.line，按科目类型与税配置 | 凭证模板 + 科目对照表 | `gl_mappings` 按 key 取科目号（P0）；P1 补 account_type |
| 权限 | Role + DocPerm（按单据/字段） | group + record rule（域表达式） | 功能权限 + 数据权限 + 字段权限 | `roles.permissions` 字符串 + `data_scope`（够用） |
| 扩展 | Custom Field / 自定义 DocType | Studio / 继承 | 自定义项 / 插件 | `extra_json` + `doc_type.fields` 里的 `x_` 前缀字段（已用） |

### 4.2 从对标中提炼的 10 条设计规律

1. **单据链必须有"来源字段"**：ERPNext 每张子单据都有 `against`/`source` 反查。我方 `documents.source_type/source_id/source_no` + `document_lines.source_line_id` 已具备，务必在所有转单动作中填满。
2. **行级跟踪数量是硬需求**：`delivered_qty / invoiced_qty` 必须落在行上，否则"部分发货/部分开票"永远算不对（现行 `document_lines` 已建，需在过账时回写）。
3. **状态与动作分离**：状态是枚举，动作是"从哪些状态可到哪些状态 + 需要什么权限"，用表驱动（现行 `transitions` 数组即正确做法）。
4. **过账即事实**：已审核单据不可改，只能红冲；库存台账与凭证只增不改。
5. **主数据先行**：客户/供应商/物料/仓库/科目/税率/账期缺失时，单据页面应禁止保存并给出跳转链接。
6. **金额四舍五入统一在服务端**：所有金额 `round2`，税额按行算再汇总（避免总计与明细差 1 分）。
7. **编号按类型独立序列**：`doc_type → prefix → 序号`，日期片段可选；跨年不重置或按年重置需配置。
8. **审批留痕**：`submitted_by/at`、`approved_by/at`、`voided_at` + `document_logs` 三件套，任何状态变化都要写日志。
9. **报表先做"数得出来的"**：账龄、收发存、毛利、科目余额都是可从台账直接聚合的；不要先做"自定义报表设计器"。
10. **演示数据是功能的一部分**：ERP 的空系统等于不可用。种子数据要覆盖"每个状态至少一条"（见 03 文档）。

## 5. 附：ERPNext 核心 DocType 状态机证据（真实抽取）

以下状态值直接来自 `git show HEAD:.../*.json` 的 `fields[].options`，可作为我方状态机设计的权威参照：

| DocType | is_submittable | status 选项（原文） |
|---|---|---|
| Sales Order | 1 | Draft / On Hold / To Pay / To Deliver and Bill / To Bill / To Deliver / Completed / Cancelled / Closed |
| Quotation | 1 | Draft / Open / Replied / Partially Ordered / Ordered / Lost / Cancelled / Expired |
| Purchase Order | 1 | Draft / On Hold / To Pay / To Receive and Bill / To Bill / To Receive / Completed / Cancelled / Closed / Delivered |
| Delivery Note | 1 | Draft / To Bill / Partially Billed / Completed / Return / Return Issued / Cancelled / Closed |
| Sales Invoice | 1 | Draft / Return / Credit Note Issued / Submitted / Paid / Partly Paid / Unpaid / Unpaid and Discounted / Partly Paid and Discounted / Overdue and Discounted / Overdue / Cancelled / Internal Transfer |
| Purchase Invoice | 1 | Draft / Return / Debit Note Issued / Submitted / Paid / Partly Paid / Unpaid / Overdue / Cancelled / Internal Transfer |
| Payment Entry | 1 | Draft / Submitted / Cancelled（payment_type: Receive / Pay / Internal Transfer） |
| Journal Entry | 1 | 无 status；voucher_type 18 值（Journal Entry / Bank Entry / Cash Entry / Contra Entry / Depreciation Entry / Exchange Rate Revaluation …） |
| Material Request | 1 | Draft / Submitted / Stopped / Cancelled / Pending / Partially Ordered / Partially Received / Ordered / Issued / Transferred / Received（purpose 6 值） |
| Work Order | 1 | Draft / Submitted / Not Started / In Process / Stock Reserved / Stock Partially Reserved / Completed / Stopped / Closed / Cancelled |
| Production Plan | 1 | Draft / Submitted / Not Started / In Process / Completed / Closed / Cancelled / Material Requested |
| Asset | 1 | Draft / Submitted / Cancelled / Partially Depreciated / Fully Depreciated / Sold / Scrapped / In Maintenance / Out of Order / Issue / Receipt / Capitalized / Work In Progress |
| Lead | 0 | Lead / Open / Replied / Opportunity / Quotation / Lost Quotation / Interested / Converted / Do Not Contact |
| Opportunity | 0 | Open / Quotation / Converted / Lost / Replied / Closed |
| Issue | 0 | Open / Replied / On Hold / Resolved / Closed |

Odoo 侧对照（`git show` 读取模型源码中的 `fields.Selection`）：

| 模型 | 状态枚举（原文） |
|---|---|
| `sale.order` | draft（Quotation）/ sent（Quotation Sent）/ sale（Sales Order）/ cancel（Cancelled）；另有 `locked` 布尔锁 |
| `purchase.order` | draft（RFQ）/ sent（RFQ Sent）/ to approve / purchase / cancel |
| `stock.picking` | draft / waiting / confirmed / assigned / done / cancel |
| `mrp.production` | draft / confirmed / progress / to_close / done / cancel；另有 reservation_state：confirmed/assigned/waiting |
| `mrp.workorder` | blocked / ready / progress / done / cancel |
| `account.move` | draft / posted / cancel；move_type：entry / out_invoice / out_refund / in_invoice / in_refund / out_receipt / in_receipt |
| `account.payment` | draft / paid / reconciled / canceled / rejected；payment_type：inbound / outbound |

> 结论：**没有一家把"部分发货""部分开票""部分收款"混在一个状态里**。ERPNext 用独立子状态字段，Odoo 用计算字段。云枢ERP 若坚持单状态链，必须在 `documents` 增加数值列（`delivered_ratio`、`billed_ratio`、`paid_ratio`），否则状态与事实会脱节。

---

**下一步**：业务流程与凭证规则见 `02-业务流程蓝图.md`；种子数据见 `03-种子数据方案.md`；可执行落地拆解见 `04-模块落地清单.md`。
