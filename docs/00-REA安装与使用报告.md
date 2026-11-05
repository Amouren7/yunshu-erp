# 00 REA 安装与使用报告

- 文档版本：v1.0
- 编写日期：**2026-10-23**
- 编写人：rea-analyst
- 对象：`https://github.com/morluto/rea.git`（REA = Reverse Engineer Anything，MCP + CLI 逆向分析工具）
- 本地源码探针：`<项目根目录>\_rea_probe`（已是最新 `main`，干净工作区）
- 安装位置：`C:\Users\<用户名>\AppData\Roaming\npm\node_modules\rea-agents`（npm 全局）
- 结论先给：**安装成功、CLI 可用、MCP 服务可启动并通过自检、JavaScript 静态逆向已实际跑通并产出可复核 Evidence；原生二进制逆向（Ghidra/Hopper/IDA）因缺少分析引擎不可用；DSH 的 MCP 注册被 Node 版本检查拦截，按任务要求只给配置片段、未改动 DSH 配置。**

## 1. 环境

| 项 | 值（真实采样） |
|---|---|
| 操作系统 | Windows 11（`Microsoft Windows NT 10.0.22631.0`），x64 |
| Node.js | **v23.9.0**（非 LTS，REA 官方要求 `^22.19 ‖ ^24.11 ‖ >=26`） |
| npm | 10.9.2，registry = `https://registry.npmmirror.com` |
| npm engine-strict | `false`（默认，引擎不匹配只告警不阻断） |
| npm 全局前缀 | `C:\Users\<用户名>\AppData\Roaming\npm` |
| DSH | `DSH_HOME=C:\Users\<用户名>\.dsh`，`DSH_PROFILE=desktop`，Web GUI `http://127.0.0.1:60521` |
| Java（Ghidra 前置） | 已存在：Microsoft JDK 21.0.12（`C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`） |
| Ghidra / Hopper / IDA | **均未安装/未配置**（`GHIDRA_INSTALL_DIR` 为空；Hopper 不支持 win32） |
| Chrome | 已安装：`C:\Program Files\Google\Chrome\Application\chrome.exe`（浏览器观测类命令的前置） |
| git | 可用（本次 ERPNext/Odoo/HRMS 克隆均成功） |

## 2. 安装过程（真实命令 + 真实输出）

### 2.1 先确认 npm 上有已构建包

```powershell
npm view rea-agents version dist.tarball engines --json
```

真实输出：

```json
{
  "version": "6.7.0",
  "dist.tarball": "https://registry.npmmirror.com/rea-agents/-/rea-agents-6.7.0.tgz",
  "engines": { "node": "^22.19.0 || ^24.11.0 || >=26.0.0" }
}
```

### 2.2 全局安装（首选路径，成功）

```powershell
npm install --global rea-agents@latest --no-fund --no-audit
```

真实输出（节选，关键三行）：

```text
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'rea-agents@6.7.0',
npm warn EBADENGINE   required: { node: '^22.19.0 || ^24.11.0 || >=26.0.0' },
npm warn EBADENGINE   current: { node: 'v23.9.0', npm: '10.9.2' }
npm warn EBADENGINE }
npm warn EBADENGINE Unsupported engine { package: '@babel/parser@8.0.4' ... }   # 4 个 Babel 子包同样告警
npm warn deprecated prebuild-install@7.1.3: No longer maintained. ...
added 174 packages in 20s
```

- **结论**：Node 23.9 只触发 `EBADENGINE` 告警，**没有阻断安装**（`npm config get engine-strict` = `false`），因此无需 `--ignore-engines`。
- 安装体积：`258.6 MB`（含 `dist/` 全部 47 个能力目录 + 依赖）。
- 未走"本地安装 `tools\rea` / 源码构建"两条备选路径：全局安装一次成功，无需降级方案。

### 2.3 安装后自检

```powershell
rea --version          # → 6.7.0
npm ls -g rea-agents --depth=0
# C:\Users\<用户名>\AppData\Roaming\npm
# `-- rea-agents@6.7.0
Get-Command rea        # → C:\Users\<用户名>\AppData\Roaming\npm\rea.ps1
```

## 3. 可用命令 / 工具清单（真实取自 REA 自身清单）

REA 6.7.0 的规模（来自 `rea providers` / `rea capabilities` 输出中的 `server_identity.catalog.counts`）：

| 指标 | 数量 |
|---|---:|
| CLI 命令 | **153** |
| MCP 工具 | **207** |
| MCP 提示词（prompts） | 6 |
| MCP 协议版本 | `2025-11-25` |
| 目录摘要（catalog digest） | `96d8f6e6…a32441c`（doctor 自检一致） |

### 3.1 命令族（按用途归类，节选自 `rea --help`）

| 族 | 代表命令 | 本机可用性 |
|---|---|---|
| JS/Electron 静态分析 | `analyze-javascript-application`、`recover-javascript-sources`、`inspect-electron-fuses`、`inspect-electron-page`、`trace-javascript-semantics`、`compare-javascript-export-shapes` | ✅ 可用（本次已实测） |
| 产物/包结构 | `inspect-artifact`、`extract-artifact`、`inspect-managed-artifact`、`inspect-keyed-archive`、`inspect-plist` | ✅ 可用（.NET 静态、artifact graph 无需外部引擎） |
| 网站/浏览器观测 | `list-browser-targets`、`inspect-web-page`、`analyze-web-bundle`、`capture-web-screenshot`、`export-web-scripts`、`observe-web-execution` | ⚠️ 需 Chrome + CDP（本机有 Chrome，本次未实测） |
| 网络抓包 | `inspect-web-network-capture`（HAR/SAZ/qlog）、`inspect-pcap-capture`、`inspect-packet-capture` | ⚠️ pcap 需 tshark（未装）；HAR/SAZ 静态解析可用 |
| 原生二进制 | `analyze`、`inspect`、`decompile`、`function`、`search`、`xrefs`、`read-bytes`、`inspect-native-api` | ❌ 未配置 Ghidra/IDA/Hopper |
| Go/Rust/GPU/PE 证书等静态格式 | `inspect-go-binary`、`inspect-rust-binary`、`inspect-binary-layout`、`inspect-pe-resources`、`inspect-apk-signature` | ✅ 多数无需外部引擎（本次未逐一实测） |
| Android | `inspect-android-package`、`list-adb-devices`、`pull-adb-package`、`decode-android-resources` | ❌ 缺 JADX/adb/apktool（`REA_JADX_MCP_JAR` 未配置） |
| SQLite | `inspect-sqlite-database` | ❌ 需 Node 24.15+/26（本机 23.9，`unsupported_version`） |
| 进程/调试 | `capture-process`、`debug-with-gdb`、`instrument-with-frida`、`observe-native-calls` | ❌ 依赖 Linux/macOS 工具链 |
| 注册与运维 | `setup`、`doctor`、`providers`、`capabilities`、`uninstall`、`update`、`mcp add/doctor`、`completions` | ✅ 可用 |

### 3.2 全局选项（所有命令通用）

```text
--format <toon|json|yaml|md|jsonl>   输出格式（默认 toon，适合 LLM 阅读）
--filter-output <keys>               按 key 路径裁剪输出（如 application,evidence）
--token-limit / --token-offset       控制返回 token 量
--full-output                        输出完整信封（Evidence 元数据）
--schema                             打印命令的 JSON Schema
--llms, --llms-full                  打印 LLM 可读清单
--version / --update / --help
```

> 使用建议：脚本化时一律 `--format json`；大输出先 `--filter-output` 或 `--token-limit` 裁剪，避免一次吐出几十 MB（本次 dayjs 完整 JSON 达 **40.6 MB**，必须裁剪后再进上下文）。

### 3.3 关键子命令的真实 `--help`（节选，全文见 `tools\rea\logs\cli-help.txt`）

```text
rea analyze-javascript-application <path> [options]
  --max-semantic-nodes <n>              全应用语义节点上限，默认 100000
  --max-semantic-nodes-per-file <n>     单文件上限，默认 20000
  --max-semantic-unknowns <n>           未知记录上限，默认 100000
  --source-path <array>                 只分析指定文件（可重复），不隐式带依赖
  --max-heap-mb <n>                     分析 Worker 堆上限，默认 1024
  --analysis-timeout-ms <n>             单文件分析超时，默认 300000
  --artifact-format <auto|asar|directory>
  --integrity-policy <fail|record-and-continue>

rea recover-javascript-sources <path> <outputDirectory> [options]
  --additional-path <array>             关联 JS 分片
  --extraction-mode <structural|heuristic|inspection>
  --rewrite-level <minimal|standard|aggressive>

rea analyze-web-bundle <endpoint> <targetId> [options]
  --allowed-origins <array>  --observation-ms <n>  --fetch-source-maps
```

## 4. 实际分析案例（本次真实执行）

### 4.1 目标选择

- 目标：`<项目根目录>\erp-suite\node_modules\dayjs`（本项目实际依赖的日期库，447 个文件、esm/cjs 双格式、含 locale 分片），属于典型"中老年 npm 包"结构，**适合验证模块图/导入关系/语义关系**。
- 命令（原始输入，可复现）：

```powershell
node "C:\Users\<用户名>\AppData\Roaming\npm\node_modules\rea-agents\scripts\rea.mjs" `
  analyze-javascript-application "<项目根目录>\erp-suite\node_modules\dayjs" `
  --json --max-semantic-nodes 8000 --max-semantic-nodes-per-file 2000 --analysis-timeout-ms 120000 `
  1> "<项目根目录>\tools\rea\logs\dayjs-analysis-clean.json" `
  2> "<项目根目录>\tools\rea\logs\dayjs-analysis.stderr.log"
```

### 4.2 真实结果（40.6 MB JSON 的摘要）

| 指标 | 真实值 |
|---|---|
| 退出码 | `0` |
| 耗时 | **44.2 秒**（单机、无缓存） |
| 进度事件 | 460 条（stderr，含每个文件解析进度） |
| 纳入文件 | `relevant_files = 447` |
| 解析 JS 文件 | `parsed_javascript_files = 445` |
| 解析失败 | `parse_failures = 0`、`invalid_utf8_files = 0` |
| 读取文本量 | `text_bytes_read = 587,904` 字节 |
| 访问 AST 节点 | **91,982** |
| findings | 1,287 |
| 应用图 | schema `JavaScriptApplicationGraph`，**2,020 节点 / 2,106 边** |
| 节点种类 | `javascript-module` 1,566、`javascript-asset` 433、`endpoint` 16、`artifact` 3、`package` 1、`electron-main` 1 |
| 边种类 | `contains` 893、`imports` 804、`exposes` 391、`calls` 16、`loads` 1、`maps_to` 1 |
| 语义图 | `JavaScriptSemanticRelationGraph`，8,000 节点（**触顶**）、6,865 关系、2,724 未知项、227 指纹 |
| 覆盖状态 | `partial`，限值 `semantic_graph_node_ceiling=8000`、`semantic_graph_file_node_ceiling=2000` |
| 完整性 | `root_artifact_sha256=62884b4b…30ed`、`inventory_graph_sha256=2590beea…478b`、`integrity_contradictions=[]` |

**未知项（unknown）真实样例**（体现 REA 的"证据伦理"——不知道就说不知道，而不是猜）：

```json
{
  "family": "call-flow",
  "relation_kinds": ["calls"],
  "reason": "dynamic-call",
  "detail": "Unsupported MemberExpression call target.",
  "evidence": { "location": { "source": "dayjs.min.js", "start": { "line": 1, "column": 1401 },
                              "end": { "line": 1, "column": 1436 } } }
}
```

**语义关系真实样例**（带字节级位置证据，可回查）：

```json
{
  "relation": "aliases",
  "resolution": "candidate",
  "evidence": {
    "location": { "kind": "source-range", "source": "esm/index.js",
                  "start": { "line": 381, "column": 25 }, "end": { "line": 381, "column": 27 } }
  }
}
```

### 4.3 输出结构（对后续脚本化很重要）

一次 `analyze-javascript-application --json` 返回的是**单条 Evidence 信封**，顶层字段：

```text
evidence_id, subject{name,digest.sha256,local_path,format}, provider{id,name,version},
analysis_profile, predicate_type, operation, parameters, raw_result, normalized_result,
confidence(derived), authority(shipped-artifact), environment, limitations[], locations[],
relationship_coverage, evidence_links[]
```

`normalized_result` 下再分：

```text
input_path, format, root_artifact_sha256, inventory_manifest_id, inventory_graph_sha256,
integrity_contradictions[], graph{JavaScriptApplicationGraph}, summary{Electron 边界统计},
statistics{...}, limitations[], semantic_graph{JavaScriptSemanticRelationGraph}
```

> 注意两个坑：① **进度信息走 stderr**，不要把 stdout/stderr 合并后再解析 JSON（PowerShell 的 `2>&1` 会把 Node 的 stderr 以错误记录形式插入文本，破坏 JSON）；② PowerShell 的 `>` 重定向默认写 UTF-16LE，本次解析前需 `fs.readFileSync(p,"utf16le")`。

### 4.4 一次失败/中止的尝试（如实记录）

- 尝试：对 `erp-suite\node_modules\antd`（**3,755 个文件**，含 1.5 MB 的 `antd.min.js`）做整包静态分析。
- 参数：`--max-semantic-nodes 30000 --max-semantic-nodes-per-file 3000 --max-heap-mb 1500 --analysis-timeout-ms 240000`。
- 结果：启动后 **约 7 分钟未完成**（进度仍在逐文件解析），为控制时间与内存手动终止，未产出结果文件。
- 经验（已写入使用建议）：**REA 适合"按目标圈定范围"**——用 `--source-path` 选几个文件/子目录，或对子包（如 `antd/es/form`）单独分析；整包扫描要预留 10+ 分钟并加大 `--max-semantic-nodes`，且输出 JSON 会达到几十 MB。

## 5. 能力可用性矩阵（本机实测）

| 能力 | 状态 | 依据 |
|---|---|---|
| CLI 全部命令注册 | ✅ | `rea --help` 列出 153 命令，退出码 0 |
| JS/Electron 静态分析 | ✅ 实测通过 | dayjs 案例：445 文件、2,020 节点、44.2 s |
| Artifact/包结构检视 | ✅ | `capabilities` 显示 `rea-artifact-graph` 全操作 `available:true` |
| .NET 静态分析 | ✅（未实测样例） | `rea-dotnet-static` 的 `inspect_managed_artifact/members/native_boundaries` 均 `available:true` |
| MCP stdio 服务 | ✅ 自检通过 | `rea mcp doctor --json`：`healthy:true`、tools 207/207、prompts 6/6、digest 一致 |
| 原生二进制深逆（Ghidra/IDA/Hopper/Kuna） | ❌ | `doctor`：4 个 provider 全部 `not_configured`；Hopper 明确 `unsupported_host`（win32） |
| Windows Ghidra P0 | ⚠️ 理论可用，未配置 | 需解压 Ghidra 12.1.x 并设 `GHIDRA_INSTALL_DIR`；JDK21 已具备 |
| Android（JADX/adb/apktool） | ❌ | `REA_JADX_MCP_JAR` 等未配置 |
| SQLite 检视 | ❌ | Node 23.9 < 24.15 的 `DatabaseSync.limits` 要求，`unsupported_version` |
| 网站/CDP 观测 | ⚠️ 前置满足、未实测 | Chrome 已装；需先 `list-browser-targets` 拿 targetId |
| 固件/信号/pcap/进程捕获 | ❌ | 依赖 Linux 工具链（binwalk/sigrok/tshark/ptrace） |

`rea doctor --json` 的结论（真实输出摘要，退出码 1）：

```text
healthy=false, environment_healthy=false, checks=18
  node:false（Node 23.9 不在支持矩阵）   host:true
  hopper/ghidra/ida-registration/jadx/kuna-installation: 全部 false
  skill:identity: missing（未执行 rea setup）
  registration:*: 10 个客户端全部 missing（未配置任何 Agent）
providerInspections: ghidra/ida/jadx/kuna 均 configured=false
```

> 注意：`doctor` 的 `healthy=false` 主要反映**"没有注册任何 Agent + 没有原生分析引擎 + Node 版本不受支持"**，不否定 JS 静态分析能力——后者已被 4.2 的实测证明。

## 6. 与 DSH 的 MCP 集成评估（结论：只给片段，不改配置）

### 6.1 REA 官方支持 DSH

REA 6.5.0+ 支持 `--client dsh`（本机 6.7.0 满足）。其文档 `docs/client-configuration.md#deepseek-harness` 明确：DSH 通过 **Cordis YAML patch** 注册 MCP，而不是 `mcpServers` 对象；`rea setup --client dsh` 会把 REA 条目写入 `$DSH_HOME/cordis.patch.yml`（本机 `C:\Users\<用户名>\.dsh\cordis.patch.yml`），并保留无关 patch 与注释。

### 6.2 实际尝试（未写入任何文件）

1. 只读勘察 `~\.dsh`：确认 `cordis.patch.yml` **当前不存在**（`Test-Path` = False）；存在 `profiles\desktop`、`settings.yaml.imported`、`profile-backups\` 等，本次未改动任何文件。
2. 执行只读计划命令：

```powershell
rea setup --client dsh --dry-run --json
```

真实输出（关键字段）：

```json
{
  "status": "needs_human",
  "plannedActions": [],
  "appliedActions": [],
  "clients": {},
  "doctor": { "healthy": false, "environment_healthy": false },
  "remediation": "Install Node.js 22.x (>=22.19), 24.x (>=24.11), or 26+ and rerun setup."
}
```

3. `rea mcp doctor --json`（MCP 服务自检，**不写配置**）：

```json
{
  "healthy": true,
  "adapter": "production-stdio",
  "server": { "name": "rea", "version": "6.7.0", "protocol_version": "2025-11-25" },
  "inventory": { "tools": { "expected": 207, "observed": 207, "missing": [] },
                 "prompts": { "expected": 6, "observed": 6, "missing": [] } },
  "identity": { "observed_catalog_digest": "96d8f6e6…a32441c" },
  "request_flow": { "tool": "binary_session", "ok": true }
}
```

### 6.3 决策：跳过自动注册，理由与风险

| 风险点 | 说明 |
|---|---|
| Node 版本不受支持 | `rea setup` 自带环境检查直接拒绝（`needs_human`），强行手写配置等于绕过官方校验，后续 `doctor`/`update` 都会报不一致 |
| 改的是全局 profile 补丁 | `cordis.patch.yml` 作用于**所有 DSH profile**；本机 desktop profile 曾被重置两次（有 `profile-backups` 记录），配置损坏的修复成本高 |
| 无法在线验证 | 注册后需重启 DSH 才会加载；当前会话无法验证成功与否，属"改了但不知道是否有效"的盲操作 |
| 收益有限 | REA 的 MCP 工具与 CLI 完全同源（207 工具 = 153 命令的能力面），当前用 CLI 已可完成全部分析；MCP 只是让 Agent 直接调用 |

**按任务要求：不修改 DSH 配置，只给出可直接粘贴的注册片段（等 Node 升到受支持版本后再执行）。**

### 6.4 待注册片段（将来可用）

```yaml
# 追加到 C:\Users\<用户名>\.dsh\cordis.patch.yml（文件当前不存在，新建即可）
- insert:
    - id: rea-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: rea
        transport: stdio
        command: C:\Program Files\nodejs\node.exe        # 必须用绝对路径、且 Node >=22.19 的受支持版本
        args: ["C:/Users/<用户名>/AppData/Roaming/npm/node_modules/rea-agents/scripts/rea.mjs", "mcp"]
```

安全执行步骤（真要做时）：

```powershell
# 1) 备份（必须）
Copy-Item "$env:USERPROFILE\.dsh\cordis.patch.yml" "$env:USERPROFILE\.dsh\cordis.patch.yml.bak-$(Get-Date -f yyyyMMdd-HHmmss)" -ErrorAction SilentlyContinue
# 2) 若有 Node 24，用官方流程生成（它自带校验与备份）
#    rea setup --client dsh --dry-run --json      # 先看计划
#    rea setup --client dsh --yes --skill=false    # 再应用
# 3) 重启 DSH，检查工具是否出现：mcp__rea__*
# 4) 回滚：删除 rea-mcp 条目或恢复 .bak 文件
```

## 7. 对云枢ERP 项目的作用（不是花架子，有 4 个具体用法）

1. **逆向竞品 ERP 前端，提取真实功能清单**：用友 U8/金蝶云星空/T+ 的桌面端多为 Electron 或 CEF 壳。REA 的 `analyze-javascript-application` + `recover-javascript-sources` 可直接从安装目录恢复路由表、菜单树、单据类型常量，产出"竞品到底有哪些单据/状态/字段"的一手证据——这正是本任务 `01-ERP功能分析.md` 想做的事，只是开源 ERP 有源码可直接 `git`，商业 ERP 只能靠这类工具。（合规前提：仅分析拥有/获授权软件，见 REA `DISCLAIMER.md`。）
2. **给分析结论加"证据等级"**：REA 的 Evidence 信封区分 **observed / derived / inferred / unknown**，并带 sha256 与 source-range。这个习惯已用于本项目文档：ERPNext/Odoo 的状态枚举均标注"来自 commit + 文件路径"，非通识内容不硬写。
3. **审计自己的构建产物**：`inspect-artifact` 可对 `dist/`、asar、安装包做完整性清点，配合 `inspect-electron-fuses` 检查打包配置是否被意外改写（Electron 桌面版 ERP 客户端适用）。
4. **不适用场景**：ERPNext/Odoo/HRMS 是 Python 源码，**不要用 REA**（`grep/git` 更快更准）；REA 的价值在"没有源码/只有产物/需要运行时证据"的场合。这也是本次仓库分析全部用 `git ls-tree + git show` 的原因。

## 8. 限制与遗留问题（如实）

1. **Node 23.9 不在官方支持矩阵**：CLI 实测可用，但 `rea setup`/`doctor` 判为不健康；升级到 Node 24.11+ 或 26+ 后应重跑 `rea setup` 与 `rea doctor`。
2. **原生逆向完全不可用**：没有 Ghidra/Hopper/IDA/Kuna，`analyze/decompile/function/search(strings|procedures)` 这些命令运行会失败（缺 provider）。若后续需要二进制分析：装 Ghidra 12.1.x → `setx GHIDRA_INSTALL_DIR <path>` → `rea doctor --json` 确认 `ghidra` 为 available（Windows 上仅支持静态布局/反编译子集，且不支持数据库改名）。
3. **SQLite 检视不可用**（Node 版本限制），与 ERP 项目强相关（本项目就是 SQLite）——但该项目是自己写的库，无需逆向，影响可忽略。
4. **分析输出体积大**：dayjs 40.6 MB、antd 整包扫不完。脚本化必须裁字段（`--filter-output graph.summary,statistics`）或分目标。
5. **Windows 上部分 provider 仅静态子集**：`disk layout/strings/symbols` 可以，内存搜索/改名等被标记 `unsupported_host`。
6. **未实测**：`recover-javascript-sources`（源码恢复）、`analyze-web-bundle`（需先启动带 CDP 的 Chrome）、`inspect-web-network-capture`、`.NET`/`Go`/`Rust` 静态检视。这些留作后续需要时验证，结论中不得声称已跑通。

## 9. 交付物与可复核资产

| 路径 | 内容 |
|---|---|
| `<项目根目录>\tools\rea\logs\cli-help.txt` | 12 个关键子命令 `--help` 全文（17.5 KB） |
| `<项目根目录>\tools\rea\logs\dayjs-analysis-clean.json` | dayjs 完整 Evidence（40.6 MB，UTF-16LE） |
| `<项目根目录>\tools\rea\logs\dayjs-analysis.stderr.log` | 460 条进度事件（147 KB） |
| `<项目根目录>\tools\rea\logs\mcp-doctor.json` | `rea mcp doctor --json` 自检输出 |
| `<项目根目录>\tools\rea\logs\doctor.json` | `rea doctor --json` 健康诊断（25.8 KB） |
| `<项目根目录>\_rea_probe` | REA 源码（干净 main，未改动） |

## 10. 一句话交付结论

**REA 可以作为本项目"取证型分析"的标准工具链：JS/Electron/产物包/网站四类目标开箱即用（本次 dayjs 实测 44 秒、2,020 节点、证据链完整），原生二进制需自备 Ghidra 才可用；MCP 服务本身健康（207 工具），但本机 Node 23.9 不受官方支持，故未注册进 DSH，片段与回滚步骤已备好。对 ERP 研究的正确姿态是：开源 ERP 用 git 读源码（本次 549+644+164 个 doctype/addon 已盘点），商业 ERP 产物才用 REA 逆。**
