# dsh-token-cost

English | [简体中文](README.zh-CN.md)

Adds a **conversation cost** readout to the [DeepSeek Harness](https://github.com/deepseek-ai) composer status bar: every model request is priced at the time it actually happened and for the model it actually used, so the amount updates live with the conversation and expands into a breakdown on click.

- Shows `¥x.xxxx` in the status bar; click to expand: request count, cache-hit / cache-miss / cache-write input tokens, output tokens, peak vs off-peak cost split, per-model breakdown, and holiday-table coverage.
- Prices the **peak / off-peak** tiers separately (the official off-peak price is half the peak price) with a built-in statutory holiday calendar.
- Amounts accumulate as integer micro-yuan (1 CNY = 1,000,000 micro) and are formatted only for display, avoiding floating-point drift.
- Client-side registration is fully isolated: a failed step only degrades that feature and never breaks DSH startup.

## Pricing rules

### Formula

For each model request:

```
cost = cache-miss input × In_miss + cache-write input × In_write + cache-hit input × In_hit + output × Out
```

Unit prices come from *model × tier* in CNY per million tokens. Inputs are read from the `usage` field of `assistant/message` events (`inputTokens` is the cache-miss part), and the model comes from `message.source.model`.

### Peak and off-peak

Judged in Beijing time (UTC+8):

- **Peak**: Monday–Friday, 09:00–12:00 and 14:00–18:00;
- **Off-peak**: everything else, including all-day weekends and statutory holidays;
- Dates in the holiday table price as off-peak all day, even when they fall on a weekday;
- Make-up workdays (weekend days that the State Council designates as working days) also price as off-peak: the official price list only marks Monday–Friday as peak, so make-up days are not in it.

Years not covered by the holiday table fall back to the weekday-only rule, which means requests made during holiday daytime hours can only be **over**estimated, never underestimated.

### Retries and replacement

Multiple usage samples for the same `turn + step` are treated as one request: the later sample **replaces** the earlier one instead of adding to it. `llm/retry-started` closes the current replacement window, so a retry counts as another billable request. This mirrors the host `tokenUsage` projection, so the amount and the status-bar token totals reconcile.

### Unknown models

Models missing from the price table are counted but add no cost, and the view records the number of `unpricedRequests` instead of silently treating them as free.

## Price table

CNY per million tokens (snapshot 2026-10-17; the [official pricing page](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) prevails).

| Model | Tier | Cache-hit input | Cache-miss input | Cache-write input | Output |
| --- | --- | --- | --- | --- | --- |
| `deepseek-flash` | Peak | 0.04 | 2 | 2 | 8 |
| `deepseek-flash` | Off-peak | 0.02 | 1 | 1 | 4 |
| `deepseek-v4-pro` | Peak | 0.30 | 9 | 9 | 27 |
| `deepseek-v4-pro` | Off-peak | 0.15 | 4.5 | 4.5 | 13.5 |

## Holiday table

`holidays.js` is a generated file embedding the State Council holiday calendar for 2025–2026 (source: [timor.tech](https://timor.tech/api/holiday)). Make-up workdays are generated as well, but the current pricing rule does not use them — they are kept as data so that a future rule change can enable them directly.

To update:

```bash
node scripts/update-holidays.mjs 2027 2028
```

The script fetches and validates each year (a suspiciously low number of days is treated as an unpublished calendar and rejected with a non-zero exit code), merges the result, and deterministically rewrites `holidays.js`; rerunning is a no-op. Do not edit that file by hand.

## Installation

### Option 1: plugin manager (recommended)

With a host that exposes the `plugin_manager` tool, install straight from a local directory:

```
plugin_manager action=install_bundle <repo>
```

### Option 2: manual

1. Clone this repository anywhere (referred to below as `<repo>`).
2. Add the following to the profile `package.json`:

   ```json
   {
     "dependencies": { "dsh-token-cost": "file:<repo>" },
     "dsh": { "profile": { "bundles": [ "...", "dsh-token-cost" ] } }
   }
   ```

3. Point the profile's `node_modules/dsh-token-cost` at `<repo>` (directory junction or `pnpm install`).
4. **Restart DSH Desktop** (newly installed bundles are not hot-loaded).

The plugin itself has no third-party runtime dependencies, so no extra dependency links are needed.

To uninstall: remove the entries from `bundles` and `dependencies`, then restart.

## Troubleshooting

Every client-side registration step (locale, styles, dock entry) is isolated: a thrown error is recorded as diagnostics instead of propagating, so one failing feature cannot take down the whole Web startup. Diagnostics:

- Console: `[dsh-token-cost] <step>: <error name and message>`;
- `localStorage["dsh-token-cost:last-error"]`: JSON `{ at, label, detail }` with the error name, message and stack.

If no amount appears: make sure the plugin is enabled on the **Plugins** page, then restart once; if it still does not appear, include the diagnostics above in your report.

## Compatibility

- The host must provide the `sessionProjections` service (session projection registry) and the `conversation.composer.dock` UI slot;
- Verified on DeepSeek Harness `0.2.1-rc.5`.

## Development

### Layout

| File | Purpose |
| --- | --- |
| `index.js` | Host half: the `tokenCost` session projection (`foldTokenCost` / `viewTokenCost`), peak/off-peak logic, price table |
| `holidays.js` | Statutory holiday and make-up workday table (generated, do not edit) |
| `scripts/update-holidays.mjs` | Fetch and merge the next year's holiday schedule |
| `client.js` | Client half: the status-bar `billing` entry and the details panel |
| `locale/zh.json`, `locale/en.json` | Plugin metadata (`meta.title` / `meta.description`) |
| `package.json` | Package manifest: entry points, `dsh.client`, `icon`, `files` |
| `cordis.patch.yml` | Bundle patch that inserts the plugin into the profile bundle |
| `icon.svg` | Plugin icon |
| `.gitignore` | Ignores `node_modules/` and OS junk files |

### Design invariants

- Fold state must be serializable and resumable from any checkpoint, and resuming must match a full replay;
- A new sample for the same `turn + step` replaces the previous one; identical samples return the same state reference to avoid pointless broadcasts;
- Amounts accumulate only integer micro-yuan; formatting happens in the view layer only;
- Unknown models are never silently priced as free.

### Verification

The implementation was validated end-to-end against a real session log (the fold matched an independent per-event recomputation field by field, and checkpoint resumption was equivalent), covering:

- peak/off-peak boundaries (holidays, make-up workdays, weekends, tier start/end minutes) and multi-model prices;
- same `turn + step` replacement, `llm/retry-started` windows, and unpriced unknown models;
- projection state reference stability (unrelated events and identical samples do not trigger broadcasts);
- client slot registration arguments and the dock/panel copy;
- three degraded environments (locale registration throws, `localStorage` write throws, and the healthy case) where `apply()` never throws.

## Known limits

- **Current session only**: subagent sessions' usage is not in the parent session log and is not counted;
- **Estimates**: based on the public price list and the peak/off-peak tier at request time, not an official invoice; the server-side billing is authoritative;
- **The price table expires**: update `PRICE_TABLE` in `index.js` when prices change;
- **Holiday coverage is bounded**: outside the embedded years it falls back to the weekday rule, overestimating holiday daytime by at most 2×;
- **API prices and tier rules may change**: refer to the official documentation.
