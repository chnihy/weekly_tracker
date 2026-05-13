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

`git push origin main` triggers an auto-build on Vercel that ships to `weeklytracker.vercel.app`.

**Commit author email matters.** Vercel's git integration BLOCKS commits whose author email isn't recognized as belonging to the connected GitHub account (`chnihy`). Use Chresten's GitHub noreply email:

```
69132469+chnihy@users.noreply.github.com
```

Set it once locally so every commit uses it without having to remember:

```
git config user.email 69132469+chnihy@users.noreply.github.com
```

If you ever need to bypass git and ship local code directly:

```
npx vercel --prod --yes
```

## Vercel env vars (required for sync to work)

- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — auto-injected by the Upstash integration. Don't edit.
- `SYNC_PIN` — the shared secret for `/api/state`. Must be set in Project Settings → Environment Variables before sync works.

After changing env vars, redeploy (CLI or dashboard) — running env vars don't hot-swap.

## Service worker

`public/sw.js` uses cache name `weekly-tracker-vN`. Bump `N` whenever you change cached assets so existing PWAs evict their cache on next open. Strategy: network-first for HTML, cache-first for assets, untouched for `/api/*`.
