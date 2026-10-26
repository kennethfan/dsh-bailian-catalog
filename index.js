/**
 * dsh-bailian-catalog — Host 半身。
 *
 * 职责：提供 GET /api/bailian-catalog/list，读取 DSH 凭证库中的百炼密钥，
 * 通过官方 `ctx.llm.discoverModels(...)` 探测（OpenAI 兼容端点）的 /models
 * 列表，以 JSON 返回给设置页。
 *
 * 安全约定：
 *   - 密钥只在 Host 内存中使用，绝不写入响应或日志；
 *   - 密钥来源是 credentials 服务（回退环境变量由该服务负责）；
 *   - 每个路由先过 connection.requestRejection 的 Host/Origin 栅栏，
 *     挡掉 DNS rebinding 与跨站调用；
 *   - 读取接口（list/usage）只读；写入接口（add/remove）仅改动
 *     llm-pi-ai 中目标 provider 的 models，且经 settings.mutate 结构化写入。
 *
 * 默认端点指向**公共** DashScope 兼容端点，不指向任何个人空间域名；
 * 使用百炼专属空间（MaaS 网关）时由用户通过 config.baseURL 覆盖。
 *
 * @module index.js
 */

export const name = 'bailian-catalog'

// credentials：读取百炼密钥；llm：官方模型发现机制（内部自带 fetch 与 Bearer 鉴权）。
export const inject = ['credentials', 'llm']

/** 默认探测端点：公共 DashScope OpenAI 兼容端点（不指向任何个人空间）。 */
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/** 默认凭证引用名。credentials 服务会依次查托管存储、进程环境与 .env。 */
const DEFAULT_CRED_REF = 'BAILIAN_API_KEY'

/** 默认写入的目标 provider（llm-pi-ai 的 providers 键）。 */
const DEFAULT_PROVIDER = 'bailian'

/** llm-pi-ai 注册模型发现所用的 settings 命名空间。 */
const SETTINGS_NS = 'llm-pi-ai'


/**
 * 内置模型家族规则表（有序，先匹配先生效）。
 * 端点上很多模型 id 没有 `owner/` 前缀（作者端点 178 个里 105 个如此），
 * 仅按前缀分组会把它们全挤进「其他」，因此按 id 特征归类到实际家族。
 * 可用 config.families 追加自定义规则，自定义规则先于本表匹配。
 */
const DEFAULT_FAMILY_RULES = [
  [/^(cmaas-)?qwen/i, '通义千问'],
  [/^glm/i, '智谱'],
  [/^kimi/i, 'Kimi'],
  [/^deepseek/i, 'DeepSeek'],
  [/^minimax/i, 'MiniMax'],
  [/^wan/i, '通义万相'],
  [/^z-image/i, 'Z-Image'],
  [/^step/i, '阶跃星辰'],
  [/^mimo/i, '小米'],
  [/^unisound/i, 'Unisound'],
  [/^fun-asr/i, 'FunASR'],
  [/^tongyi/i, '通义'],
]

/** 无法归入任何家族时的兜底分组名。 */
const OTHER_FAMILY = '其他'

/** 从模型 id 推导所属命名空间，例如 `kimi/kimi-k2.8` → `kimi`，无前缀归入「其他」。 */
function vendorOf(id) {
  const text = String(id)
  const slash = text.indexOf('/')
  return slash > 0 ? text.slice(0, slash) : OTHER_FAMILY
}

/**
 * 解析 config.families 里的自定义规则。
 * 形如 `[{ pattern: '^my-model', family: '自制' }]`；pattern 按不区分大小写的正则解释。
 * 非法条目只产生告警并跳过，绝不抛错——配置写错不应让插件失效。
 *
 * @param {unknown} raw
 * @returns {{ rules: Array<[RegExp, string]>, warnings: string[] }}
 */
function parseFamilyRules(raw) {
  const rules = []
  const warnings = []
  if (raw === undefined || raw === null) return { rules, warnings }
  if (!Array.isArray(raw)) {
    warnings.push('config.families 必须是数组，当前已忽略')
    return { rules, warnings }
  }
  raw.forEach((item, index) => {
    const pattern = item && typeof item.pattern === 'string' ? item.pattern.trim() : ''
    const family = item && typeof item.family === 'string' ? item.family.trim() : ''
    if (!pattern || !family) {
      warnings.push(`config.families[${index}] 需要同时提供 pattern 与 family，已跳过`)
      return
    }
    try {
      rules.push([new RegExp(pattern, 'i'), family])
    } catch (err) {
      warnings.push(`config.families[${index}] 的正则无效（${pattern}），已跳过`)
    }
  })
  return { rules, warnings }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ baseURL?: string, families?: Array<{ pattern: string, family: string }> }} [config]
 */
export function apply(ctx, config) {
  const baseURL = (config && typeof config.baseURL === 'string' && config.baseURL.trim()) || DEFAULT_BASE_URL

  // provider 与凭证变量名均可配置：别人的 provider 未必叫 bailian，密钥变量也未必同名。
  const providerName =
    (config && typeof config.provider === 'string' && config.provider.trim()) || DEFAULT_PROVIDER
  const credRef = (config && typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim()) || DEFAULT_CRED_REF

  // 自定义规则先匹配，内置规则兜底：这样用户能把某个模型从内置家族里改归别处。
  const { rules: customRules, warnings: familyWarnings } = parseFamilyRules(config && config.families)
  const familyRules = [...customRules, ...DEFAULT_FAMILY_RULES]

  /**
   * 从模型 id 推导模型家族，例如 `qwen3.8-max` → `通义千问`、`vanchin/deepseek-v3` → `DeepSeek`。
   * 先按完整 id 匹配（覆盖 `MiniMax/speech-02-hd` 这类叶子名不含厂商标识的），再按叶子名匹配。
   */
  function familyOf(id) {
    const text = String(id)
    const leaf = text.split('/').pop()
    for (const [pattern, family] of familyRules) if (pattern.test(text)) return family
    for (const [pattern, family] of familyRules) if (pattern.test(leaf)) return family
    return OTHER_FAMILY
  }

  /** 拉取百炼全量模型；失败时抛错，由路由转成 JSON 错误。 */
  async function listModels() {
    const hit = await ctx.credentials.resolve(credRef)
    const apiKey = hit && typeof hit.value === 'string' ? hit.value : undefined
    if (!apiKey) {
      throw new Error('凭证库中未找到 ' + credRef + '，请先在 设置 → 模型 里填写百炼 API Key，或用 config.apiKeyEnv 指定别的变量名')
    }

    // 官方发现机制：内部请求 `${baseURL}/models` 并携带 Authorization: Bearer。
    const discovered = await ctx.llm.discoverModels(SETTINGS_NS, {
      baseURL,
      api: 'openai-completions',
      apiKey,
    })

    const models = (discovered || []).map((model) => ({
      id: model.id,
      name: model.name || model.id,
      vendor: vendorOf(model.id),
      family: familyOf(model.id),
      contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : null,
      maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : null,
    }))
    models.sort((a, b) => a.id.localeCompare(b.id))

    // 家族按成员数降序排列，数量相同时按名称排序，便于面板稳定分组。
    const counts = new Map()
    for (const model of models) counts.set(model.family, (counts.get(model.family) || 0) + 1)
    const families = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    // 附带当前 provider 配置里已有的模型 id，供面板标记「已加入」。
    let configured = []
    try {
      configured = readProviderModels().models.map((model) => model && String(model.id)).filter(Boolean)
    } catch (err) {
      // 配置不可读时忽略，不影响清单展示
    }

    return {
      models,
      total: models.length,
      families,
      baseURL,
      fetchedAt: Date.now(),
      configured,
      ...(familyWarnings.length ? { familyWarnings } : {}),
    }
  }

  // 全局 Agent 工具：注册在根上下文，所有会话都能调用，用于查询百炼模型清单。
  // 参数直接写成 JSON Schema，避免额外依赖 @deepseek-ai/dsh-tools。
  const tools = ctx.get('tools')
  if (tools !== undefined) {
    ctx.effect(
      () =>
        tools.register({
          name: 'bailian_list_models',
          description:
            'List the models an Alibaba Bailian (DashScope) OpenAI-compatible endpoint advertises. ' +
            'Use when the user asks which models Bailian offers, whether a model id exists, or needs ' +
            'a valid model id before configuring one. Returns ids grouped by model family and namespace.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Optional case-insensitive substring filter applied to model ids, e.g. "qwen" or "deepseek".',
              },
              family: {
                type: 'string',
                description:
                  'Optional exact model-family filter, e.g. "通义千问", "DeepSeek", "智谱", "Kimi", "MiniMax". Unrecognised ids use "其他".',
              },
              vendor: {
                type: 'string',
                description:
                  'Optional exact namespace filter taken from the `owner/` prefix of the id, e.g. "kimi", "ZHIPU", "MiniMax". Ids without a prefix use "其他".',
              },
            },
            additionalProperties: false,
          },
          output: {
            schema: { type: 'object' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
          },
          async execute(args) {
            const payload = await listModels()
            const keyword = args && typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
            const family = args && typeof args.family === 'string' ? args.family.trim() : ''
            const vendor = args && typeof args.vendor === 'string' ? args.vendor.trim() : ''
            let models = payload.models
            if (keyword) models = models.filter((model) => model.id.toLowerCase().includes(keyword))
            if (family) models = models.filter((model) => model.family === family)
            if (vendor) models = models.filter((model) => model.vendor === vendor)
            const countBy = (key) => {
              const map = new Map()
              for (const model of models) map.set(model[key], (map.get(model[key]) || 0) + 1)
              return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            }
            return {
              total: models.length,
              endpoint: payload.baseURL,
              families: countBy('family'),
              namespaces: countBy('vendor'),
              models: models.map((model) => ({ id: model.id, family: model.family, vendor: model.vendor })),
            }
          },
        }),
      'bailian-catalog: agent tool',
    )
  }

  /**
   * 汇总「当前会话额度」：取最近活跃的活会话，返回其模型、已用 tokens 与上下文窗口。
   * - 已用 tokens 来自 tokenMeter.measure()（与会话内 compaction 判定同源）
   * - 窗口优先取会话请求头记录的 contextWindow，缺失时向 llm 适配器解析
   */
  async function usageReport() {
    const sessions = ctx.get('sessions')
    const meter = ctx.get('tokenMeter')
    const llm = ctx.get('llm')
    if (sessions === undefined || meter === undefined) {
      return { current: null, sessions: [], error: 'sessions/tokenMeter 服务不可用' }
    }

    const rows = []
    for (const session of sessions.list()) {
      try {
        const requestContext = typeof session.requestContext === 'function' ? session.requestContext() : undefined
        const measured = meter.measure(session)
        rows.push({
          id: String(session.id),
          model: requestContext && requestContext.model ? requestContext.model : null,
          provider: requestContext && requestContext.provider ? requestContext.provider : null,
          contextWindow: requestContext && typeof requestContext.contextWindow === 'number' ? requestContext.contextWindow : null,
          usedTokens: measured && typeof measured.totalTokens === 'number' ? measured.totalTokens : null,
          seq: Number(session.seq),
        })
      } catch (err) {
        // 单个损坏会话不影响整份报告
      }
    }

    // 事件序号最大的会话 = 最近活跃，近似「当前会话」。
    rows.sort((a, b) => b.seq - a.seq)
    const current = rows.find((row) => row.model !== null) || rows[0] || null

    let contextWindow = current ? current.contextWindow : null
    if (current && contextWindow === null && current.provider && current.model && llm !== undefined) {
      try {
        const resolved = await llm.resolveModelInfo(current.provider, current.model)
        contextWindow = resolved && resolved.context ? resolved.context.contextWindow : null
      } catch (err) {
        // 适配器不认识该路由时保持未知
      }
    }

    return {
      current: current ? { ...current, contextWindow } : null,
      sessions: rows.slice(0, 10),
      fetchedAt: Date.now(),
    }
  }

  /** 读取 llm-pi-ai 中目标 provider 的配置描述与模型数组。 */
  function readProviderModels() {
    const settings = ctx.get('settings')
    if (settings === undefined) throw new Error('settings 服务不可用')
    const descriptors = settings.describe()
    const target =
      descriptors.find((descriptor) => String(descriptor.ns) === SETTINGS_NS) ||
      descriptors.find((descriptor) => {
        const value = descriptor && descriptor.value
        return value && typeof value === 'object' && value.providers && value.providers[providerName]
      })
    if (!target) throw new Error('未找到 llm-pi-ai 的 provider 配置：' + providerName)
    const value = target.value && typeof target.value === 'object' ? target.value : {}
    const provider =
      value.providers && value.providers[providerName] && typeof value.providers[providerName] === 'object'
        ? value.providers[providerName]
        : {}
    const models = Array.isArray(provider.models) ? provider.models.slice() : []
    return { settings, target, models }
  }

  /**
   * 把一个模型 id 追加进目标 provider 配置。
   * 走 settings 服务的结构化写入（profile 补丁），不直接改 YAML 文本。
   * 幂等：已存在则返回 already。回滚：'remove' 动作。
   */
  async function addModel(modelId) {
    const { settings, target, models } = readProviderModels()
    const id = String(modelId || '').trim()
    if (!id) throw new Error('缺少模型 ID')

    if (models.some((model) => model && String(model.id) === id)) {
      return { added: false, already: true, model: id, total: models.length, provider: providerName }
    }

    const next = models.concat([{ id, name: id }])
    await settings.mutate(
      String(target.ns),
      [{ op: 'set', path: ['providers', providerName, 'models'], value: next }],
      target.revision,
    )
    return { added: true, model: id, total: next.length, provider: providerName }
  }

  /** 从目标 provider 配置中移除一个模型（加入的回滚路径）。 */
  async function removeModel(modelId) {
    const { settings, target, models } = readProviderModels()
    const id = String(modelId || '').trim()
    if (!id) throw new Error('缺少模型 ID')

    const next = models.filter((model) => !(model && String(model.id) === id))
    if (next.length === models.length) {
      return { removed: false, missing: true, model: id, total: models.length, provider: providerName }
    }
    await settings.mutate(
      String(target.ns),
      [{ op: 'set', path: ['providers', providerName, 'models'], value: next }],
      target.revision,
    )
    return { removed: true, model: id, total: next.length, provider: providerName }
  }

  // webServer 在插件 apply 阶段可能尚未发布，用 ctx.inject 等待服务就绪；
  // 服务被替换时回调会重新执行，路由不会悬挂。
  ctx.inject(['webServer'], (scoped) => {
    const server = scoped.webServer
    const sendJson = (res, status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload))
    }

    /**
     * 每个路由先过 connection 服务的信任栅栏：它的 Host/Origin 校验挡 DNS
     * rebinding 与跨站调用，浏览器登录态则拦下未认证调用者。
     * 返回 true 表示已拒绝并结束响应。
     */
    const rejected = (req, res) => {
      const connection = ctx.get('connection')
      if (connection === undefined || typeof connection.requestRejection !== 'function') return false
      const rejection = connection.requestRejection(req)
      if (rejection === undefined) return false
      res.writeHead(rejection, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: 'request rejected' }))
      return true
    }

    scoped.effect(
      () =>
        server.register({
          kind: 'exact',
          path: '/api/bailian-catalog/list',
          handler: async (req, res) => {
            if (rejected(req, res)) return
            try {
              sendJson(res, 200, await listModels())
            } catch (err) {
              sendJson(res, 500, { error: String((err && err.message) || err) })
            }
          },
        }),
      'bailian-catalog: model list route',
    )
    scoped.effect(
      () =>
        server.register({
          kind: 'exact',
          path: '/api/bailian-catalog/usage',
          handler: async (req, res) => {
            if (rejected(req, res)) return
            try {
              sendJson(res, 200, await usageReport())
            } catch (err) {
              sendJson(res, 500, { error: String((err && err.message) || err) })
            }
          },
        }),
      'bailian-catalog: usage route',
    )
    scoped.effect(
      () =>
        server.register({
          kind: 'exact',
          path: '/api/bailian-catalog/add',
          handler: async (req, res) => {
            if (rejected(req, res)) return
            if (String(req.method || 'GET').toUpperCase() !== 'POST') {
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }
            try {
              sendJson(res, 200, await addModel((await readJsonBody(req)).id))
            } catch (err) {
              sendJson(res, 500, { error: String((err && err.message) || err) })
            }
          },
        }),
      'bailian-catalog: add model route',
    )
    scoped.effect(
      () =>
        server.register({
          kind: 'exact',
          path: '/api/bailian-catalog/remove',
          handler: async (req, res) => {
            if (rejected(req, res)) return
            if (String(req.method || 'GET').toUpperCase() !== 'POST') {
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }
            try {
              sendJson(res, 200, await removeModel((await readJsonBody(req)).id))
            } catch (err) {
              sendJson(res, 500, { error: String((err && err.message) || err) })
            }
          },
        }),
      'bailian-catalog: remove model route',
    )
  })
}

/** 读取并解析 JSON 请求体；空体返回空对象。 */
async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}
