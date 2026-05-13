# Weekly Tracker

Personal weekly habit tracker for Chresten — single user, deployed as a PWA on iPhone + iPad + laptop.

Live at **https://weeklytracker.vercel.app**.

## Stack

- **Vite + React 18** — single-page app, no routing.
- **Vercel** hosting (project: `weekly_tracker`, team: `chrestenhyde-7634s-projects`).
- **Upstash Redis** (via Vercel Marketplace integration) for cross-device state sync.
- **Service Worker** (`public/sw.js`) for PWA install + offline support.

## Architecture

The entire UI lives in `src/App.jsx`. State is a single blob:

```js
{
  tasks: string[],
  checksByWeek: { [weekKey: 'YYYY-MM-DD']: { [`${taskIdx}_${dayIdx}`]: boolean } }
}
```

`weekKey` is the Monday of the current week. The checkbox key encodes the task row index and the day column index (0=Mon … 6=Sun).

**Sync model:**
- Local: `localStorage` mirror under `wt_state_v2`. App is fully usable offline.
- Remote: `/api/state` (Node serverless function in `api/state.js`) reads/writes one Redis key (`wt:state`). Auth via `x-pin` header matched against the `SYNC_PIN` env var.
- Flow: on mount, fetch from server → if server has data, replace local; if empty, push local up. On each state change, debounced POST to server (~600ms). All errors fall back to local-only.

The PIN is stored per-device in `localStorage` under `wt_pin`. Setting it is surfaced via a tappable sync-status badge in the header.

## Deploy

**Auto-deploy via GitHub push is BLOCKED** by Vercel. Every commit pushed to `main` creates a deployment that stays in `BLOCKED`/`buildSkipped: true` state with `errorLink` pointing at `troubleshoot-project-collaboration#account-configuration`. Disabling `gitForkProtection` didn't help; root cause likely an unverified Vercel account email or commit-author trust issue (see Hobby-tier limitations).

**Working deploy command:**

```
npx vercel --prod --yes
```

Run from the project root. This bypasses the broken git integration and ships current local code in ~10s.

## Vercel env vars (required for sync to work)

- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — auto-injected by the Upstash integration. Don't edit.
- `SYNC_PIN` — the shared secret for `/api/state`. Must be set in Project Settings → Environment Variables before sync works.

After changing env vars, redeploy (CLI or dashboard) — running env vars don't hot-swap.

## Service worker

`public/sw.js` uses cache name `weekly-tracker-vN`. Bump `N` whenever you change cached assets so existing PWAs evict their cache on next open. Strategy: network-first for HTML, cache-first for assets, untouched for `/api/*`.
