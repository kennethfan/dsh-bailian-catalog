/**
 * dsh-bailian-catalog — 浏览器半身。
 *
 * 手写 ModuleLoader bundle：无构建步骤，只依赖 shell 已提供的 react。
 * 贡献一个设置页 section（settings.section，id `bailian-catalog`），
 * 从同源 `/api/bailian-catalog/list` 读取百炼全量模型并展示：
 * 搜索、厂商分组折叠、一键复制模型 ID、手动刷新。
 *
 * 颜色全部取自主题变量，明暗主题切换无需额外处理。
 */
window.__ModuleLoader__.load({
  id: 'dsh-bailian-catalog',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, useState, useEffect } = React

    // slots 是硬依赖：设置页 section 必须挂在 slot 上。
    const inject = ['slots']

    const CSS = `
.bac-wrap { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; }
.bac-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.bac-head-text { min-width: 0; }
.bac-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary, #e6e6e6); }
.bac-sub { margin-top: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary, #999); word-break: break-all; line-height: 1.5; }
.bac-btn { flex: none; background: var(--dsw-alias-bg-layer-2, #26272c); color: var(--dsw-alias-label-primary, #e6e6e6); border: 1px solid var(--dsw-alias-border-l1, #33343a); border-radius: 7px; cursor: pointer; font-size: 12px; padding: 6px 12px; white-space: nowrap; }
.bac-btn:hover { border-color: var(--dsw-alias-border-l2, #3a3b41); }
.bac-btn:disabled { opacity: 0.55; cursor: default; }
.bac-search { width: 100%; box-sizing: border-box; background: var(--dsw-alias-bg-base, #16171b); color: inherit; border: 1px solid var(--dsw-alias-border-l1, #33343a); border-radius: 8px; padding: 9px 12px; font-size: 12.5px; outline: none; }
.bac-search:focus { border-color: var(--dsw-alias-brand-primary, #4f8cff); }
.bac-error { padding: 12px 14px; border-radius: 8px; font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-state-error-primary, #ff6b6b); border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff6b6b) 35%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ff6b6b) 8%, transparent); }
.bac-empty { padding: 28px 14px; text-align: center; font-size: 12.5px; color: var(--dsw-alias-label-secondary, #999); }
.bac-group { border: 1px solid var(--dsw-alias-border-l1, #33343a); border-radius: 10px; overflow: hidden; }
.bac-group + .bac-group { margin-top: 10px; }
.bac-ghead { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; padding: 9px 12px; cursor: pointer; background: var(--dsw-alias-bg-layer-2, #26272c); border: none; color: var(--dsw-alias-label-primary, #e6e6e6); font-size: 12px; font-weight: 600; text-align: left; }
.bac-ghead:hover { background: var(--dsw-alias-border-l1, #33343a); }
.bac-caret { width: 12px; color: var(--dsw-alias-label-secondary, #999); font-size: 10px; }
.bac-gname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bac-count { flex: none; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-secondary, #999); }
.bac-rows { display: flex; flex-direction: column; }
.bac-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-top: 1px solid var(--dsw-alias-border-l1, #33343a); }
.bac-row:hover { background: var(--dsw-alias-bg-layer-2, #26272c); }
.bac-id { flex: 1; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bac-meta { flex: none; font-size: 10.5px; color: var(--dsw-alias-label-secondary, #999); font-variant-numeric: tabular-nums; }
.bac-copy { flex: none; background: transparent; border: none; color: var(--dsw-alias-label-secondary, #999); cursor: pointer; font-size: 11px; padding: 3px 8px; border-radius: 5px; }
.bac-copy:hover { background: var(--dsw-alias-border-l1, #33343a); color: var(--dsw-alias-label-primary, #e6e6e6); }
.bac-copy-on { color: var(--dsw-alias-state-success-primary, #3fb950); }
.bac-quota { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1, #33343a); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #26272c); }
.bac-quota-empty { color: var(--dsw-alias-label-secondary, #999); font-size: 12px; }
.bac-quota-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; font-weight: 600; }
.bac-quota-model { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 400; font-size: 11.5px; color: var(--dsw-alias-brand-primary, #4f8cff); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bac-quota-meta { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #999); font-variant-numeric: tabular-nums; }
.bac-bar { height: 6px; border-radius: 999px; background: var(--dsw-alias-border-l1, #33343a); overflow: hidden; }
.bac-bar-fill { height: 100%; border-radius: 999px; background: var(--dsw-alias-state-success-primary, #3fb950); transition: width 0.3s ease; }
.bac-bar-warn { background: var(--dsw-alias-state-warn-primary, #d9a514); }
.bac-bar-danger { background: var(--dsw-alias-state-error-primary, #ff6b6b); }
.bac-quota-status { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #999); }
.bac-quota-off { color: var(--dsw-alias-state-error-primary, #ff6b6b); }
.bac-add { flex: none; background: transparent; border: 1px solid var(--dsw-alias-border-l1, #33343a); color: var(--dsw-alias-label-secondary, #999); cursor: pointer; font-size: 11px; padding: 2px 8px; border-radius: 5px; }
.bac-add:hover { border-color: var(--dsw-alias-brand-primary, #4f8cff); color: var(--dsw-alias-brand-primary, #4f8cff); }
.bac-add:disabled { opacity: 0.55; cursor: default; }
.bac-add-on { color: var(--dsw-alias-state-success-primary, #3fb950); border-color: transparent; }
.bac-note { font-size: 12px; color: var(--dsw-alias-state-success-primary, #3fb950); }
`

    /** 从模型 id 推导厂商分组，例如 `kimi/kimi-k2.8` → `kimi`。 */
    function vendorOf(id) {
      const text = String(id)
      const slash = text.indexOf('/')
      return slash > 0 ? text.slice(0, slash) : '其他'
    }

    /** 千分位数字，便于阅读 token 量。 */
    function formatNum(value) {
      return Number(value).toLocaleString('en-US')
    }

    /** 设置页「百炼模型」面板。 */
    function Section() {
      const [models, setModels] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [baseURL, setBaseURL] = useState('')
      const [fetchedAt, setFetchedAt] = useState(0)
      const [query, setQuery] = useState('')
      const [collapsed, setCollapsed] = useState({})
      const [copied, setCopied] = useState('')
      const [usage, setUsage] = useState(null)
      const [usageError, setUsageError] = useState(null)
      const [added, setAdded] = useState({})
      const [adding, setAdding] = useState({})
      const [addNote, setAddNote] = useState('')

      /** 读取同源 JSON 接口；Host 半身负责凭证与鉴权。 */
      async function load() {
        setLoading(true)
        setError(null)
        try {
          const res = await fetch('/api/bailian-catalog/list', { headers: { accept: 'application/json' } })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.error) {
            setError(data.error || '请求失败：HTTP ' + res.status)
            setModels([])
          } else {
            setModels(Array.isArray(data.models) ? data.models : [])
            setBaseURL(data.baseURL || '')
            setFetchedAt(data.fetchedAt || 0)
            const configured = {}
            for (const id of Array.isArray(data.configured) ? data.configured : []) configured[id] = true
            setAdded(configured)
          }
        } catch (err) {
          setError('无法连接插件后端：' + String((err && err.message) || err))
        }
        setLoading(false)
      }

      useEffect(() => {
        load()
        loadUsage()
      }, [])

      /** 读取「当前会话额度」；与模型清单独立失败，互不影响。 */
      async function loadUsage() {
        try {
          const res = await fetch('/api/bailian-catalog/usage', { headers: { accept: 'application/json' } })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.error) {
            setUsageError(data.error || '额度读取失败：HTTP ' + res.status)
            setUsage(null)
          } else {
            setUsage(data.current || null)
            setUsageError(null)
          }
        } catch (err) {
          setUsageError('无法读取额度：' + String((err && err.message) || err))
        }
      }

      /** 复制模型 id；剪贴板不可用时静默失败。 */
      async function copy(id) {
        try {
          await navigator.clipboard.writeText(id)
        } catch (err) {
          /* 忽略剪贴板限制 */
        }
        setCopied(id)
        setTimeout(() => setCopied(current => (current === id ? '' : current)), 1200)
      }

      const keyword = query.trim().toLowerCase()
      const filtered = keyword ? models.filter(model => model.id.toLowerCase().includes(keyword)) : models

      // 按厂商分组，保持首次出现顺序；「其他」永远排最后。
      const order = []
      const byVendor = new Map()
      for (const model of filtered) {
        const vendor = model.vendor || vendorOf(model.id)
        if (!byVendor.has(vendor)) {
          byVendor.set(vendor, [])
          order.push(vendor)
        }
        byVendor.get(vendor).push(model)
      }
      order.sort((a, b) => (a === '其他' ? 1 : b === '其他' ? -1 : a.localeCompare(b)))

      /** 加入百炼 provider 配置（写 profile 补丁）；成功后该模型可在模型选择器中选用。 */
      async function addToConfig(id) {
        setAdding(current => ({ ...current, [id]: true }))
        setAddNote('')
        try {
          const res = await fetch('/api/bailian-catalog/add', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ id }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.error) {
            setAddNote('加入失败：' + (data.error || 'HTTP ' + res.status))
          } else if (data.already) {
            setAdded(current => ({ ...current, [id]: true }))
            setAddNote('该模型已在配置中')
          } else {
            setAdded(current => ({ ...current, [id]: true }))
            setAddNote('已加入配置：' + id + '（共 ' + data.total + ' 个百炼模型）')
          }
        } catch (err) {
          setAddNote('加入失败：' + String((err && err.message) || err))
        }
        setAdding(current => ({ ...current, [id]: false }))
      }

      /** 从百炼 provider 配置移除（加入的回滚路径）。 */
      async function removeFromConfig(id) {
        setAdding(current => ({ ...current, [id]: true }))
        setAddNote('')
        try {
          const res = await fetch('/api/bailian-catalog/remove', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ id }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.error) {
            setAddNote('移除失败：' + (data.error || 'HTTP ' + res.status))
          } else {
            setAdded(current => {
              const next = { ...current }
              delete next[id]
              return next
            })
            setAddNote(data.missing ? '该模型不在配置中' : '已移出配置：' + id + '（剩余 ' + data.total + ' 个）')
          }
        } catch (err) {
          setAddNote('移除失败：' + String((err && err.message) || err))
        }
        setAdding(current => ({ ...current, [id]: false }))
      }

      function refresh() {
        load()
        loadUsage()
      }

      const header = h('div', { className: 'bac-head' },
        h('div', { className: 'bac-head-text' },
          h('div', { className: 'bac-title' }, '百炼模型'),
          h('div', { className: 'bac-sub' },
            loading && models.length === 0
              ? '正在读取百炼模型清单…'
              : '共 ' + models.length + ' 个模型' +
                (baseURL ? ' · ' + baseURL : '') +
                (fetchedAt ? ' · ' + new Date(fetchedAt).toLocaleTimeString() : ''),
          ),
        ),
        h('button', { className: 'bac-btn', onClick: refresh, disabled: loading }, loading ? '刷新中…' : '刷新'),
      )

      /** 当前会话额度卡片：窗口、已用、剩余与可运行状态。 */
      function renderQuota() {
        if (usageError) return h('div', { className: 'bac-error' }, usageError)
        if (!usage) return h('div', { className: 'bac-quota bac-quota-empty' }, '当前没有活跃会话，额度信息暂不可用')

        const used = typeof usage.usedTokens === 'number' ? usage.usedTokens : null
        const limit = typeof usage.contextWindow === 'number' ? usage.contextWindow : null
        const remaining = used !== null && limit !== null ? Math.max(0, limit - used) : null
        const percent = used !== null && limit ? Math.min(100, (used / limit) * 100) : null
        const tone = percent === null ? '' : percent >= 90 ? ' bac-bar-danger' : percent >= 70 ? ' bac-bar-warn' : ''

        let status
        if (limit === null) status = '窗口未知，无法判断剩余额度'
        else if (remaining <= 0) status = '额度已耗尽 · 不可运行，请新建会话'
        else if (percent >= 90) status = '临近上限 · 建议压缩或新建会话'
        else status = '额度充足 · 可运行'

        return h('div', { className: 'bac-quota' },
          h('div', { className: 'bac-quota-head' },
            h('span', null, '当前会话额度'),
            h('span', { className: 'bac-quota-model', title: usage.model || '' }, usage.model || '未知模型'),
          ),
          h('div', { className: 'bac-quota-meta' },
            used !== null ? formatNum(used) + ' 已用' : '已用未知',
            limit !== null ? ' / ' + formatNum(limit) : '',
            remaining !== null ? ' · 剩余 ' + formatNum(remaining) : '',
          ),
          percent !== null
            ? h('div', { className: 'bac-bar' }, h('div', { className: 'bac-bar-fill' + tone, style: { width: percent + '%' } }))
            : null,
          h('div', { className: 'bac-quota-status' + (remaining !== null && remaining <= 0 ? ' bac-quota-off' : '') }, status),
        )
      }

      const search = h('input', {
        className: 'bac-search',
        value: query,
        placeholder: '搜索模型 ID，例如 qwen / deepseek / kimi',
        onChange: event => setQuery(event.target.value),
      })

      let body
      if (error) {
        body = h('div', { className: 'bac-error' }, error)
      } else if (loading && models.length === 0) {
        body = h('div', { className: 'bac-empty' }, '加载中…')
      } else if (filtered.length === 0) {
        body = h('div', { className: 'bac-empty' }, keyword ? '没有匹配「' + query + '」的模型' : '端点未返回任何模型')
      } else {
        body = h('div', null, order.map(vendor => {
          const rows = byVendor.get(vendor)
          const open = !collapsed[vendor]
          return h('div', { className: 'bac-group', key: vendor },
            h('button', {
              className: 'bac-ghead',
              onClick: () => setCollapsed(current => ({ ...current, [vendor]: !current[vendor] })),
            },
              h('span', { className: 'bac-caret' }, open ? '▼' : '▶'),
              h('span', { className: 'bac-gname' }, vendor),
              h('span', { className: 'bac-count' }, String(rows.length)),
            ),
            open
              ? h('div', { className: 'bac-rows' }, rows.map(model =>
                  h('div', { className: 'bac-row', key: model.id },
                    h('span', { className: 'bac-id', title: model.id }, model.id),
                    model.contextWindow
                      ? h('span', { className: 'bac-meta' }, Math.round(model.contextWindow / 1000) + 'K')
                      : null,
                    h('button', {
                      className: 'bac-add' + (added[model.id] ? ' bac-add-on' : ''),
                      onClick: () => (added[model.id] ? removeFromConfig(model.id) : addToConfig(model.id)),
                      disabled: !!adding[model.id],
                      title: added[model.id] ? '点击移出配置' : '加入百炼配置，之后可在模型选择器中选用',
                    }, added[model.id] ? '已加入' : (adding[model.id] ? '加入中…' : '加入')),
                    h('button', {
                      className: 'bac-copy' + (copied === model.id ? ' bac-copy-on' : ''),
                      onClick: () => copy(model.id),
                      title: '复制模型 ID',
                    }, copied === model.id ? '已复制' : '复制'),
                  ),
                ))
              : null,
          )
        }))
      }

      return h('div', { className: 'bac-wrap' }, header, renderQuota(), search,
        addNote ? h('div', { className: 'bac-note' }, addNote) : null,
        body)
    }

    /** 插件入口：注册样式与设置页 section。 */
    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'dsh-bailian-catalog')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'bailian-catalog: styles')

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'bailian-catalog',
            order: 12,
            label: '百炼模型',
          },
          () => h(Section, null),
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'bailian-catalog'
    return module.exports
  },
})
