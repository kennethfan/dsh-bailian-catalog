# dsh-bailian-catalog

English | [中文](README.zh.md)

Lists every **Alibaba Bailian (DashScope / Model Studio)** model the configured credential can reach, inside the DSH Web GUI under **Settings → 百炼模型**, and adds or removes any of them from the Bailian provider route. It also shows the current session's context quota.

## What it does

1. **Settings panel**: total model count, probed endpoint, refresh time, search, per-vendor collapsing, and one-click copy of a model id.
2. **Add to config**: every row has an *Add* button that writes the model into `llm-pi-ai`'s `providers.bailian.models`, after which the model appears in the model picker. Clicking it again removes the model.
3. **Current session quota**: the context window, tokens used, remaining budget and a usage bar for the model the active session is running on.
4. **Agent tool**: `bailian_list_models`, callable from any session, with a `query` substring filter and an exact `vendor` filter.

## How it works

- **Host half** (`index.js`)
  - Reads `BAILIAN_API_KEY` through the `credentials` service (credential store first, environment fallback). The key stays in host memory: it is never sent to the browser and never written to disk.
  - Enumerates models through the official `llm.discoverModels()` path, which requests `GET {baseURL}/models` with `Authorization: Bearer`.
  - Quota: reads the most recently active live session, measures used tokens with `tokenMeter.measure()`, and takes the model and window from `session.requestContext()`, falling back to `llm.resolveModelInfo()` when the window is unknown.
  - Add/remove writes through `settings.mutate()`, the structured profile-patch write path, rather than editing YAML text.
- **Browser half** (`client.js`)
  - A hand-written `ModuleLoader` bundle with **no build step**, depending only on the shell-provided `react`.
  - Registers a `settings.section` (id `bailian-catalog`, order 12) and renders from the same-origin endpoints.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/bailian-catalog/list` | Model list, plus `configured` (ids already in the route) |
| `GET` | `/api/bailian-catalog/usage` | Active session's model, tokens used and context window |
| `POST` | `/api/bailian-catalog/add` | `{ id }`, idempotent; returns `already` when present |
| `POST` | `/api/bailian-catalog/remove` | `{ id }`, removes it from the route |

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

## Configuration

The `cordis.patch.yml` row can override the probed endpoint:

```yaml
- insert:
    - id: bailian-catalog
      name: 'dsh-bailian-catalog'
      config:
        baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1
```

The default is the Bailian MaaS gateway configured for `llm-pi-ai` in the profile; the public endpoint works too (both returned identical bodies when tested).

## Known limits

- The endpoint returns the models **the current API key can use**, not Bailian's full public catalog (178 on the author's endpoint).
- The endpoints are read-only; no inference is attempted, so the list reflects what the endpoint declares.
- Reachable from localhost only (the web server binds 127.0.0.1); no extra remote authentication is added.

## License

MIT