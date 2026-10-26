# dsh-bailian-catalog

[English](README.md) | 中文

在 DSH Web GUI 的 **设置 → 百炼模型** 里列出**百炼（DashScope / Model Studio）平台当前凭证可用的全部模型**，并可把其中任意一个加入（或移出）百炼 provider 路由；同时显示**当前会话的上下文额度**。

## 功能

1. **设置页面板**：展示模型总数、探测端点、刷新时间，支持搜索、按模型家族折叠、一键复制模型 ID。
2. **加入配置**：每个模型一行「加入」按钮，写入 `llm-pi-ai` 的 `providers.bailian.models`，之后该模型即可在模型选择器中选用；再点一次即移除。加入前会先探测，详见[可用性探测](#可用性探测)。
3. **可用性探测**：每行一个「探测」按钮，发一个最小 chat 请求，报告该模型是否真的可调用，避免把「未开通」误认成「Key 无效」。
4. **当前会话额度**：显示所用模型的上下文窗口、已用 tokens、剩余量与进度条。
5. **Agent 工具**：`bailian_list_models`，任何会话都可调用，支持 `query` 子串过滤、`family` 家族精确过滤与 `vendor` 命名空间精确过滤。

## 可用性探测

`/models` 列出的模型，不等于你有权调用。百炼空间未开通某个模型时返回 `403 AccessDenied.Unpurchased`，而 DSH 会把上游所有 401/403 统一显示为**「API 密钥无效」**——把问题指向 Key，而不是权限。探测可以判定真实原因。

`POST /api/bailian-catalog/probe` 发一个 `max_tokens: 1` 的 chat 请求，按返回分类：

| 状态 | 含义 |
| --- | --- |
| `ok` | 可调用 |
| `unpurchased` | 空间未开通该模型，或额度用尽（`AccessDenied.Unpurchased`）|
| `unauthorized` | Key 无效或已过期 |
| `not-found` | 模型不存在，或 OpenAI 兼容接口不支持（嵌入、重排）|
| `not-chat` | 非对话模型（嵌入 / 图像 / 语音）拒绝了 `messages` 载荷——路由是通的，但 chat 请求验不了它 |
| `rate-limited` | 触发限流，稍后重试 |
| `timeout` / `error` | 没有可用结论 |

`not-chat` 被刻意归为**中性结果而非失败**：用 chat 请求探测图像或嵌入模型必然返回 400，这不能说明模型是否可用。

**加入配置受探测保护。** 处于阻塞状态（`unpurchased`、`unauthorized`、`not-found`、`error`、`timeout`）的模型**不会被写入**路由，面板会说明原因。把一个用不了的模型写进路由，正是「选错一次、整个会话每一轮都失败」的根源。`not-chat` 模型允许写入（chat 请求无法判断它），探测结果会随写入一起返回。

## 分组方式

端点上很多模型 id 没有 `owner/` 前缀（作者端点上约六成如此），只按前缀分组会把它们全挤进同一个桶。因此改为按**模型家族**分组，由 id 特征推导（`qwen*` → 通义千问、`glm*` → 智谱、`kimi*` → Kimi、`deepseek*` → DeepSeek、`minimax*` → MiniMax、`wan*` → 通义万相 等），原 `owner/` 前缀保留为次要的**命名空间**字段。在作者端点上，绝大多数模型都能归入具体家族，落进「其他」的只剩 `gui-plus` 与两个运维条目。

## 工作原理

- **Host 半身**（`index.js`）
  - 通过 `credentials` 服务读取 `BAILIAN_API_KEY`（凭证库优先，回退环境变量），密钥只在 Host 内存中使用，不写入页面、不落盘。
  - 通过官方 `llm.discoverModels()` 探测 `GET {baseURL}/models`（内部自带 `Authorization: Bearer`），拿到模型清单。
  - 额度：读取最近活跃的活会话，用 `tokenMeter.measure()` 算已用 tokens、`session.requestContext()` 取模型与窗口；窗口缺失时向 `llm.resolveModelInfo()` 解析。
  - 加入/移出配置走 `settings.mutate()` 的结构化写入（profile 补丁），不直接改写 YAML 文本。
  - 探测：发一个 `max_tokens: 1` 的 chat 请求并带硬超时，再按返回分类；错误码与错误信息同时从 `error` 对象和响应顶层读取，因为这个端点两种结构都会出现。
  - 每个路由在做任何事之前都先调用 `connection.requestRejection`。
- **浏览器半身**（`client.js`）
  - 手写 `ModuleLoader` bundle，**无构建步骤**，仅依赖 shell 提供的 `react`。
  - 注册 `settings.section`（id `bailian-catalog`，order 12），从同源接口取数渲染。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/bailian-catalog/list` | 模型清单，附 `configured`（已加入配置的 id）与 `families` |
| `GET` | `/api/bailian-catalog/usage` | 当前会话的模型、已用 tokens 与上下文窗口 |
| `POST` | `/api/bailian-catalog/probe` | `{ id }`，发一个最小 chat 请求，按上表分类 |
| `POST` | `/api/bailian-catalog/add` | `{ id }`，先探测；返回 `already`、`blocked` 或 `added` |
| `POST` | `/api/bailian-catalog/remove` | `{ id }`，从配置中移除 |

每个路由都先过 `connection.requestRejection`：它的 Host/Origin 栅栏与浏览器认证会在任何模型清单或配置写入可达之前拦下调用者。无 cookie 请求得 `401`，跨站 `Origin` 得 `403`。

> `settings.mutate` 会在首次写入时把 schema 默认值（`input: []`、`compat: { chatTemplateKwargs: {}, chatTemplateArgs: {} }`）物化进补丁。这些是语义无害的默认值，但会让补丁文件多出几行。

## 额度口径

百炼 `sk-` Key **没有**余额/额度查询接口（实测 `/dashboard/billing/*`、`/user/balance`、`/usage` 均为 404），账户余额只能靠阿里云 AccessKey 调 BSS OpenAPI。本插件的「额度」指**上下文额度**：

- 显示：当前会话所用模型的上下文窗口、已用 tokens、剩余量与进度条；
- 状态：`额度充足 · 可运行` / `临近上限` / `额度已耗尽 · 不可运行`；
- 数据来源与会话内 compaction 判定同源，因此「额度用完」即「这个会话跑不动了」，新建会话即可恢复。

## 安装

从 GitHub：

```sh
dsh plugin --profile <profile> add github:kennethfan/dsh-bailian-catalog
```

从本地检出：

```sh
dsh plugin --profile <profile> add link:/path/to/dsh-bailian-catalog
```

Host 半身需要重启 `dsh` 进程后路由才存在；浏览器半身刷新页面即可。

## 前置条件

需要你自己的百炼（DashScope / Model Studio）API Key；若使用专属百炼空间，还需要该空间的 MaaS 网关地址。本插件**不附带任何凭证**，也**不指向任何个人空间**：默认端点是公共 DashScope 兼容端点。

## 配置

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `baseURL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 要枚举的端点。使用专属百炼空间时改为该空间的 MaaS 网关。 |
| `provider` | `bailian` | add/remove 写入的 `llm-pi-ai` provider 键名。 |
| `apiKeyEnv` | `BAILIAN_API_KEY` | 经 `credentials` 服务解析的凭证引用名。 |
| `families` | `[]` | 追加的家族规则（见下）。 |

```yaml
- insert:
    - id: bailian-catalog
      name: 'dsh-bailian-catalog'
      config:
        baseURL: https://llm-<你的空间>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
        provider: bailian
        apiKeyEnv: BAILIAN_API_KEY
```

空间网关与公共端点的响应结构一致，区别只在于网关按你的 Key 返回其可用的模型。

### 自定义家族规则

`families` 用于追加自定义规则。自定义规则**先于内置规则匹配**，因此也能把某个模型从内置家族里改归别处：

```yaml
- id: bailian-catalog
  name: 'dsh-bailian-catalog'
  config:
    families:
      - pattern: '^gui-plus$'   # 不区分大小写的正则
        family: GUI
      - pattern: '^sre-gpu'
        family: 运维
```

与内置表一致：先拿完整 id 匹配，再拿叶子名（`/` 之后的部分）匹配。

配置写错不会让插件失效——正则非法、缺 `pattern` 或 `family`、`families` 不是数组，都会跳过并在设置页显示告警，内置规则照常工作。

## 已知边界

- 端点返回的是**当前 API Key 可用**的模型，不是百炼官网的全量目录（作者端点为 180 个）。列在清单里不代表有权调用——请探测确认。
- 探测每点一次花一个请求；不会对整张清单自动探测，那是几百次调用。
- chat 请求无法判断嵌入、图像、语音与重排模型，它们会返回 `not-chat`，保持未验证状态。
- 读取接口无副作用；只有 add/remove 会写入，且只改目标 provider 的 `models` 列表。
- 默认仅本机可访问（web server 绑定 127.0.0.1），路由栅栏也是按这个来源模型设计的。

## 许可

MIT