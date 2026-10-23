# dsh-bailian-catalog

[English](README.md) | 中文

在 DSH Web GUI 的 **设置 → 百炼模型** 里列出**百炼（DashScope / Model Studio）平台当前凭证可用的全部模型**，并可把其中任意一个加入（或移出）百炼 provider 路由；同时显示**当前会话的上下文额度**。

## 功能

1. **设置页面板**：展示模型总数、探测端点、刷新时间，支持搜索、按模型家族折叠、一键复制模型 ID。
2. **加入配置**：每个模型一行「加入」按钮，写入 `llm-pi-ai` 的 `providers.bailian.models`，之后该模型即可在模型选择器中选用；再点一次即移除。
3. **当前会话额度**：显示所用模型的上下文窗口、已用 tokens、剩余量与进度条。
4. **Agent 工具**：`bailian_list_models`，任何会话都可调用，支持 `query` 子串过滤、`family` 家族精确过滤与 `vendor` 命名空间精确过滤。

## 分组方式

端点上很多模型 id 没有 `owner/` 前缀（作者端点 178 个里有 105 个如此），只按前缀分组会把它们全挤进同一个桶。因此改为按**模型家族**分组，由 id 特征推导（`qwen*` → 通义千问、`glm*` → 智谱、`kimi*` → Kimi、`deepseek*` → DeepSeek、`minimax*` → MiniMax、`wan*` → 通义万相 等），原 `owner/` 前缀保留为次要的**命名空间**字段。在作者端点上，178 个模型中有 175 个可归入 12 个家族。

## 工作原理

- **Host 半身**（`index.js`）
  - 通过 `credentials` 服务读取 `BAILIAN_API_KEY`（凭证库优先，回退环境变量），密钥只在 Host 内存中使用，不写入页面、不落盘。
  - 通过官方 `llm.discoverModels()` 探测 `GET {baseURL}/models`（内部自带 `Authorization: Bearer`），拿到模型清单。
  - 额度：读取最近活跃的活会话，用 `tokenMeter.measure()` 算已用 tokens、`session.requestContext()` 取模型与窗口；窗口缺失时向 `llm.resolveModelInfo()` 解析。
  - 加入/移出配置走 `settings.mutate()` 的结构化写入（profile 补丁），不直接改写 YAML 文本。
- **浏览器半身**（`client.js`）
  - 手写 `ModuleLoader` bundle，**无构建步骤**，仅依赖 shell 提供的 `react`。
  - 注册 `settings.section`（id `bailian-catalog`，order 12），从同源接口取数渲染。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/bailian-catalog/list` | 模型清单，附 `configured`（已加入配置的 id 列表） |
| `GET` | `/api/bailian-catalog/usage` | 当前会话的模型、已用 tokens 与上下文窗口 |
| `POST` | `/api/bailian-catalog/add` | `{ id }`，幂等，已存在返回 `already` |
| `POST` | `/api/bailian-catalog/remove` | `{ id }`，从配置中移除 |

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

## 配置

`cordis.patch.yml` 中的行可覆盖探测端点：

```yaml
- insert:
    - id: bailian-catalog
      name: 'dsh-bailian-catalog'
      config:
        baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1
```

默认端点取 profile 中 `llm-pi-ai` 配置的百炼 MaaS 网关；公共端点亦可（实测两者返回一致）。

## 已知边界

- 端点返回的是**当前 API Key 可用**的模型，不是百炼官网的全量目录（作者端点为 178 个）。
- 接口只读，不做推理测试；列表反映端点声明。
- 默认仅本机可访问（web server 绑定 127.0.0.1），未额外做远程鉴权。

## 许可

MIT