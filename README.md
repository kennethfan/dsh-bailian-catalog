# dsh-bailian-catalog

English | [中文](README.zh.md)

Lists every **Alibaba Bailian (DashScope / Model Studio)** model the configured credential can reach, inside the DSH Web GUI under **Settings → 百炼模型**, and adds or removes any of them from the Bailian provider route. It also shows the current session's context quota.

## What it does

1. **Settings panel**: total model count, probed endpoint, refresh time, search, per-family collapsing, and one-click copy of a model id.
2. **Add to config**: every row has an *Add* button that writes the model into `llm-pi-ai`'s `providers.bailian.models`, after which the model appears in the model picker. Clicking it again removes the model. The add is probed first — see [Availability probing](#availability-probing).
3. **Availability probe**: a per-row *Probe* button that sends one minimal chat request and reports whether the model is actually callable, so an unopened model is not mistaken for a bad key.
4. **Current session quota**: the context window, tokens used, remaining budget and a usage bar for the model the active session is running on.
5. **Agent tool**: `bailian_list_models`, callable from any session, with a `query` substring filter, an exact `family` filter and an exact `vendor` (namespace) filter.

## Availability probing

A model listed by `/models` is not necessarily a model you may call. A Bailian workspace that has not opened a model answers `403 AccessDenied.Unpurchased`, and DSH surfaces every upstream 401/403 as **"invalid API key"** — which points at the key instead of at the entitlement. Probing settles it.

`POST /api/bailian-catalog/probe` sends one `max_tokens: 1` chat request and classifies the answer:

| State | Meaning |
| --- | --- |
| `ok` | Callable |
| `unpurchased` | The workspace has not opened this model, or its quota is exhausted (`AccessDenied.Unpurchased`) |
| `unauthorized` | The key is invalid or expired |
| `not-found` | The model does not exist, or the OpenAI-compatible interface does not support it (embedding, rerank) |
| `not-chat` | A non-chat model (embedding, image, speech) rejected the `messages` payload — the route is reachable, but a chat request cannot verify it |
| `rate-limited` | Throttled; retry later |
| `timeout` / `error` | No usable answer |

`not-chat` is deliberately a neutral result rather than a failure: probing an image or embedding model with a chat request always returns `400`, which says nothing about whether the model is available.

**Adding is guarded by the probe.** A model in a blocking state (`unpurchased`, `unauthorized`, `not-found`, `error`, `timeout`) is **not written** to the route, and the panel shows why. Writing an unusable model into the route is what turns one bad selection into a session that fails on every turn. `not-chat` models are allowed through, since a chat request cannot judge them, and the probe result is returned alongside the write.

## Grouping

Many endpoints advertise ids without an `owner/` prefix — roughly six in ten on the author's endpoint — so grouping by that prefix alone would leave most models in a single bucket. Models are grouped by **family** instead, derived from id patterns (`qwen*` → 通义千问, `glm*` → 智谱, `kimi*` → Kimi, `deepseek*` → DeepSeek, `minimax*` → MiniMax, `wan*` → 通义万相, and so on), with the `owner/` prefix kept as a secondary *namespace* value. On the author's endpoint nearly every model resolves to a real family; only `gui-plus` and two ops entries fall through to 其他.

## How it works

- **Host half** (`index.js`)
  - Reads `BAILIAN_API_KEY` through the `credentials` service (credential store first, environment fallback). The key stays in host memory: it is never sent to the browser and never written to disk.
  - Enumerates models through the official `llm.discoverModels()` path, which requests `GET {baseURL}/models` with `Authorization: Bearer`.
  - Quota: reads the most recently active live session, measures used tokens with `tokenMeter.measure()`, and takes the model and window from `session.requestContext()`, falling back to `llm.resolveModelInfo()` when the window is unknown.
  - Add/remove writes through `settings.mutate()`, the structured profile-patch write path, rather than editing YAML text.
  - Probing posts one `max_tokens: 1` chat request with a hard timeout and classifies the answer; error code and message are read from both the `error` object and the payload top level, since this endpoint uses both shapes.
  - Every route calls `connection.requestRejection` before doing any work.
- **Browser half** (`client.js`)
  - A hand-written `ModuleLoader` bundle with **no build step**, depending only on the shell-provided `react`.
  - Registers a `settings.section` (id `bailian-catalog`, order 12) and renders from the same-origin endpoints.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/bailian-catalog/list` | Model list, plus `configured` (ids already in the route) and `families` |
| `GET` | `/api/bailian-catalog/usage` | Active session's model, tokens used and context window |
| `POST` | `/api/bailian-catalog/probe` | `{ id }`, one minimal chat request, classified into the states above |
| `POST` | `/api/bailian-catalog/add` | `{ id }`, probed first; returns `already`, `blocked`, or `added` |
| `POST` | `/api/bailian-catalog/remove` | `{ id }`, removes it from the route |

Every route asks `connection.requestRejection` first, so the Host/Origin fence and browser authentication gate callers before any model list or config write is reachable. A no-cookie request gets `401`; a cross-site `Origin` gets `403`.

> The first `settings.mutate` write materializes schema defaults (`input: []`, `compat: { chatTemplateKwargs: {}, chatTemplateArgs: {} }`) into the patch. They are semantically inert, but they add a few lines to the file.

## What "quota" means here

A Bailian `sk-` key has **no** balance or quota endpoint (the usual paths — `/dashboard/billing/*`, `/user/balance`, `/usage` — all return 404), and account balance is only reachable through the Alibaba Cloud BSS OpenAPI with an AccessKey. So this plugin reports **context quota** instead:

- the context window, tokens used, remaining budget and a usage bar for the active session's model;
- states: enough budget, near the ceiling, or exhausted;
- it is measured the same way the in-session compaction decision is, so "exhausted" means that session can no longer continue and a new session restores the budget.

## Install

From GitHub:

```sh
dsh plugin --profile <profile> add github:kennethfan/dsh-bailian-catalog
```

From a local checkout:

```sh
dsh plugin --profile <profile> add link:/path/to/dsh-bailian-catalog
```

The host half needs a `dsh` process restart before its routes exist; the browser half appears after a page refresh.

## Prerequisites

You need your own Bailian (DashScope / Model Studio) API key, and — if you use a dedicated Model Studio workspace — that workspace's MaaS gateway URL. This plugin ships **no** credential and points at **no** private workspace: the default endpoint is the public DashScope compatible endpoint.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `baseURL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Endpoint to enumerate. Point it at your workspace's MaaS gateway when you use a dedicated Bailian space. |
| `provider` | `bailian` | The `llm-pi-ai` provider key that add/remove writes to. |
| `apiKeyEnv` | `BAILIAN_API_KEY` | Credential reference resolved through the `credentials` service. |
| `families` | `[]` | Extra family rules (see below). |

```yaml
- insert:
    - id: bailian-catalog
      name: 'dsh-bailian-catalog'
      config:
        baseURL: https://llm-<your-workspace>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
        provider: bailian
        apiKeyEnv: BAILIAN_API_KEY
```

A workspace gateway returns the same body shape as the public endpoint; it simply sees whatever models your key is entitled to.

### Custom family rules

`families` adds your own rules to the family table. They are matched **before** the built-in rules, so a rule can also reclassify something a built-in rule would otherwise claim:

```yaml
- id: bailian-catalog
  name: 'dsh-bailian-catalog'
  config:
    families:
      - pattern: '^gui-plus$'   # case-insensitive regular expression
        family: GUI
      - pattern: '^sre-gpu'
        family: 运维
```

A rule is tested against the full model id first and against the leaf name (the part after `/`) second, exactly like the built-in table.

Invalid input is skipped rather than fatal — a bad regular expression, a missing `pattern` or `family`, or a `families` value that is not an array each produce a warning that the settings panel shows, and the built-in rules keep working.

## Known limits

- The endpoint returns the models **the current API key can use**, not Bailian's full public catalog (180 on the author's endpoint). Listing a model does not imply entitlement — probe it.
- Probing costs one request per click. It is not run automatically for the whole list, since that would be hundreds of calls.
- A chat request cannot judge embedding, image, speech or rerank models; they report `not-chat` and stay unverified.
- Reads are safe; only add/remove write, and only to the configured provider's `models` list.
- Reachable from localhost only (the web server binds 127.0.0.1); the route fence assumes that origin model.

## License

MIT