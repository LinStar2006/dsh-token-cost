# dsh-token-cost

[English](README.md) | 简体中文

为 [DeepSeek Harness](https://github.com/deepseek-ai) 的输入框状态栏增加一项**本会话花费**：按每次模型请求的实际发生时刻与所用模型逐次计价，金额随对话实时更新，点击可展开明细。

- 状态栏显示 `¥x.xxxx`，点击展开：请求数、缓存命中 / 未命中 / 写入输入 token、输出 token、高峰与空闲金额拆分、按模型拆账、节假日数据覆盖范围。
- 计价区分**高峰 / 空闲**两个价档（官方空闲价 = 高峰价的一半），并内置法定节假日判断。
- 金额以整数「微元」累计（1 元 = 1,000,000 micro），只在展示时格式化，避免浮点累加误差。
- 客户端注册过程完全隔离：任何一步注册失败只降级对应功能，不影响 DSH 启动。

## 计算规则

### 计价公式

对每条模型请求：

```
cost = 未命中输入 × In_miss + 缓存写输入 × In_write + 缓存命中输入 × In_hit + 输出 × Out
```

其中单价由「模型 × 峰谷档」决定，单位为元 / 百万 token；输入按 `assistant/message` 事件的 `usage` 字段取（`inputTokens` 为未命中部分），模型取 `message.source.model`。

### 峰谷时段

以北京时间判断：

- **高峰**：周一至周五 09:00–12:00、14:00–18:00；
- **空闲**：其余时间，含周末与法定节假日全天；
- 节假日表内的日期全天按空闲计价（即使落在工作日）；
- 调休补班日（国务院安排为上班的周六 / 周日）同样按空闲计价：官方价目表只把周一至周五列为高峰时段，补班日不在其列。

节假日表未覆盖的年份回退为纯星期规则，因此只会**高估**、不会低估在节假日白天发生的请求。

### 重试与替换

同一 `turn + step` 的多次用量样本视为同一次请求：后到的样本**替换**先前的样本，而不是累加；`llm/retry-started` 结束当前替换窗口，因此重试会作为一次新的计费用量统计。这与宿主 `tokenUsage` 投影的语义一致，保证金额与状态栏 token 总量可以互相印证。

### 未知模型

价目表中没有的模型只计数、不累加金额，并记录 `unpricedRequests` 笔数，不会静默按 0 元处理成「免费」。

## 价目表

单位：元 / 百万 token（快照 2026-10-17，以[官方定价页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)为准）。

| 模型 | 时段 | 缓存命中输入 | 缓存未命中输入 | 缓存写输入 | 输出 |
| --- | --- | --- | --- | --- | --- |
| `deepseek-flash` | 高峰 | 0.04 | 2 | 2 | 8 |
| `deepseek-flash` | 空闲 | 0.02 | 1 | 1 | 4 |
| `deepseek-v4-pro` | 高峰 | 0.30 | 9 | 9 | 27 |
| `deepseek-v4-pro` | 空闲 | 0.15 | 4.5 | 4.5 | 13.5 |

## 节假日表

`holidays.js` 是生成文件，内置 2025–2026 年国务院放假安排（数据源 [timor.tech](https://timor.tech/api/holiday)）。补班日期也一并生成，但当前计价规则不使用它们——它们只作为数据保留，便于将来官方口径调整时直接启用。

更新方式：

```bash
node scripts/update-holidays.mjs 2027 2028
```

脚本会逐年拉取并校验完整性（放假天数明显不足视为日历未发布，拒绝写入并以非零码退出），合并后确定性重写 `holidays.js`，重复运行结果不变。请勿手工编辑该文件。

## 安装

### 方式一：插件管理器（推荐）

宿主提供 `plugin_manager` 工具时，可直接以本地目录安装：

```
plugin_manager action=install_bundle <仓库目录>
```

### 方式二：手动安装

1. 把本仓库放到任意目录（下文记为 `<repo>`）。
2. 在 profile 的 `package.json` 中加入：

   ```json
   {
     "dependencies": { "dsh-token-cost": "file:<repo>" },
     "dsh": { "profile": { "bundles": [ "...", "dsh-token-cost" ] } }
   }
   ```

3. 让 profile 的 `node_modules/dsh-token-cost` 指向 `<repo>`（目录联接或 `pnpm install`）。
4. **重启 DSH Desktop**（新装的组合包不会热加载）。

插件本身没有第三方运行时依赖，不需要额外链接依赖目录。

卸载：从 `bundles` 与 `dependencies` 中删除对应项并重启。

## 故障排查

客户端半的每个注册步骤（locale、样式、状态栏条目）都是隔离执行的：任何一步抛错只记录诊断、不向上抛，避免「一个功能注册失败 → 整个 Web 启动失败」。诊断位置：

- 控制台：`[dsh-token-cost] <步骤>: <错误名与消息>`；
- `localStorage["dsh-token-cost:last-error"]`：JSON `{ at, label, detail }`，含错误名、消息与堆栈。

若状态栏没有出现金额：确认插件在「插件」页处于开启状态，再重启一次；如仍无，请附上上述诊断信息。

## 兼容性

- 宿主需要提供 `sessionProjections` 服务（会话投影注册表）与 `conversation.composer.dock` UI 槽位；
- 已在 DeepSeek Harness `0.2.1-rc.5` 上验证。

## 开发

### 目录结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半：`tokenCost` 会话投影（`foldTokenCost` / `viewTokenCost`）、峰谷判定、价目表 |
| `holidays.js` | 法定节假日 / 调休补班日期表（生成文件，勿手改） |
| `scripts/update-holidays.mjs` | 拉取并合并新一年的节假日安排 |
| `client.js` | 客户端半：状态栏 `billing` 条目与明细弹层 |
| `locale/zh.json`、`locale/en.json` | 插件元信息（`meta.title` / `meta.description`） |
| `package.json` | 包清单：入口、`dsh.client`、`icon`、`files` |
| `cordis.patch.yml` | 组合补丁，把插件插入 profile 的组合 |
| `icon.svg` | 插件图标 |
| `.gitignore` | 忽略 `node_modules/` 与系统垃圾文件 |

### 设计不变量

- 折叠状态必须可序列化、可从任意 checkpoint 续跑，续跑结果与一次性重放一致；
- 同一 `turn + step` 的新样本替换旧样本，相同样本返回原引用以抑制无意义广播；
- 金额只累计整数微元，格式化只发生在视图层；
- 未知模型不静默计价。

### 验证

实现时用真实会话日志做过端到端校验（折叠结果与逐条独立重算逐字段一致、checkpoint 续跑等价），并覆盖：

- 峰谷边界（含节假日、补班日、周末、时段起止分钟）与多模型价格；
- 同一 `turn + step` 替换、`llm/retry-started` 窗口、未知模型不计价；
- 投影状态的引用不变性（无关事件与相同样本不触发广播）；
- 客户端槽位注册参数、状态栏与明细面板渲染文案；
- 三种降级环境（locale 注册抛错、`localStorage` 写入抛错，及全部正常）下 `apply()` 均不抛出。

## 已知边界

- **只统计当前会话**：子代理（subagent）会话的用量不在父会话日志里，不计入；
- **金额是估算**：基于公开价目表与请求时刻的峰谷判断，不是官方账单，实际以服务端计费为准；
- **价目表会过期**：官方调价后需要更新 `index.js` 中的 `PRICE_TABLE`；
- **节假日表有覆盖范围**：内置年份之外回退纯星期规则，法定节假日白天最多高估 2 倍；
- **API 价格与时段规则可能变化**：以官方文档为准。
