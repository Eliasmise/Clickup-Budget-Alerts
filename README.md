# ClickUp Budget Alert Monitor

Production-ready MVP desktop app built with Electron + React + TypeScript for tracking ClickUp time against configurable budget alerts.

## What this app does

- Stores your ClickUp token locally and tests connectivity
- Loads accessible ClickUp workspaces, folders, and lists
- Supports three alert types:
  - Folder Budget Alert
  - List Budget Alert
  - Custom Scoped Alert (folder/list + exclusions + include-only task IDs)
- Calculates hours used from ClickUp time entries with date range handling:
  - Monthly (current month)
  - Custom date range
  - No date limit (cumulative)
- Displays color-coded status cards:
  - Green: below warning threshold
  - Yellow: warning threshold reached
  - Red: critical threshold reached
- Handles partial failures per card on refresh-all
- Persists alerts + UI preferences locally
- Exports dashboard snapshots to CSV

## Tech stack

- Electron
- React + TypeScript + Vite
- Zustand state management
- Tailwind CSS
- Local JSON persistence in Electron `userData` directory
- Electron `safeStorage` encryption for token when available

## Project structure

```text
.
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── services/
│       ├── alertEngine.ts
│       ├── clickupClient.ts
│       ├── refreshAlerts.ts
│       └── storage.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── hooks/
│   │   └── useBudgetMonitorStore.ts
│   ├── components/
│   │   ├── AlertCard.tsx
│   │   ├── AlertFormModal.tsx
│   │   ├── AuthPanel.tsx
│   │   └── SummaryStrip.tsx
│   └── shared/
│       ├── ipc.ts
│       ├── types.ts
│       └── validation.ts
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start in development mode (renderer + electron):

```bash
npm run dev
```

3. Build production bundles:

```bash
npm run build
```

## Usage flow

1. Open app
2. Enter ClickUp API token
3. Click `Test Connection`
4. Click `Save Token`
5. Create alert (`New Alert`)
6. Refresh one card or `Refresh All`
7. Edit, duplicate, reorder, deactivate/reactivate as needed

## Alert calculation rules

- Source of truth: ClickUp time entries endpoint (`/team/{team_id}/time_entries`)
- Aggregation: sums `duration` from entries and converts ms to hours
- Formatting: two-decimal hours (`47.25 h`)
- Date handling:
  - Monthly: local timezone start/end of current month
  - Custom: start-of-day to end-of-day local time
  - None: no date filters
- Exclusions: removes entries with matching task IDs
- Include-only: keeps only matching task IDs when provided
- Empty result: `0.00 h`

## Local persistence

Stored in Electron user-data directory as `clickup-budget-monitor.json`.

State includes:
- encrypted token
- alert configurations
- UI preferences (search/filter/sort)

## Reliability details

- Typed ClickUp client with retry + timeout handling
- Handles invalid/revoked tokens and permission failures
- Handles missing folder/list scope as card-level error (no app crash)
- Refresh-all isolates each alert so one failure doesn’t block others
- Validation on both renderer (form) and main process (IPC)

## Commands

- `npm run dev`: Start Vite + Electron
- `npm run build`: Build renderer and electron bundles
- `npm run typecheck`: TypeScript type-check
- `npm run preview`: Preview renderer build

## Notes

- This is local-first MVP: no cloud DB required.
- If `safeStorage` encryption is unavailable on your machine, token falls back to encoded local storage (still local, less secure than OS-backed encryption).
