# Changelog

## 0.2.0

### Added

- **Availability probing** — `POST /api/bailian-catalog/probe` sends one `max_tokens: 1` chat request and classifies the answer as `ok`, `unpurchased`, `unauthorized`, `not-found`, `not-chat`, `rate-limited`, `timeout` or `error`. A model listed by `/models` is not necessarily one you may call: an unopened model answers `403 AccessDenied.Unpurchased`, and DSH reports every upstream 401/403 as "invalid API key", which points at the key rather than the entitlement.
- **Probe-guarded add** — adding a model now probes first. Blocking states (`unpurchased`, `unauthorized`, `not-found`, `error`, `timeout`) are refused and nothing is written, so an unusable model cannot enter the route and fail every turn once selected. Non-chat models cannot be judged by a chat request, so they are allowed through with the probe result attached.
- **`config.families`** — custom family rules, matched before the built-in table, so a model can also be reclassified away from the rule that would otherwise claim it. Invalid input is skipped with a warning instead of failing the plugin.
- **Route fence** — every route calls `connection.requestRejection` before doing any work; no-cookie requests get 401, cross-site origins 403.
- **`config.provider` / `config.apiKeyEnv`** — the target provider key and credential reference are configurable instead of hardcoded.

### Changed

- The default `baseURL` is the public DashScope compatible endpoint. It previously pointed at the author's own Model Studio workspace, which would have sent every installer's key to a workspace they have no access to.
- Models are grouped by **family** derived from id patterns rather than by the `owner/` prefix, which left most of the list in a single bucket. The prefix is kept as a secondary namespace value.
- The list payload carries `families`, and the agent tool gained a `family` filter and a `families` summary.

### Fixed

- Probe classification no longer reports non-chat models (embedding, image, speech, rerank) as errors. They reject a `messages` payload by design, so they are reported as `not-chat`; a 400 with an empty body is treated the same way.
- Error code and message are read from the payload top level as well as from an `error` object, since this endpoint uses both shapes.

## 0.1.0

- Initial release: model catalog settings panel, add/remove in the Bailian provider route, current-session context quota, and the `bailian_list_models` agent tool.
