import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { alertDraftSchema } from '../src/shared/validation';
import type {
  AlertConfig,
  AlertDraft,
  InitialData,
  RefreshAlertResult,
  ScopeTreeTeam,
  UiPreferences
} from '../src/shared/types';
import { ClickUpClient } from './services/clickupClient';
import { refreshSingleAlert } from './services/refreshAlerts';
import { buildErrorSnapshot } from './services/alertEngine';
import { LocalStore } from './services/storage';

let mainWindow: BrowserWindow | null = null;
let store: LocalStore;

const sortAlerts = (alerts: AlertConfig[]): AlertConfig[] =>
  [...alerts].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

const dedupeIds = (ids: string[] | undefined): string[] =>
  [...new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0))];

const withClient = async <T>(fn: (client: ClickUpClient) => Promise<T>): Promise<T> => {
  const token = await store.getToken();
  if (!token) {
    throw new Error('No ClickUp token configured. Add a token in settings first.');
  }
  const client = new ClickUpClient(token);
  return fn(client);
};

const hydrateDraftNames = (draft: AlertDraft, scopeTree: ScopeTreeTeam[]): AlertDraft => {
  const team = scopeTree.find((item) => item.id === draft.teamId);
  if (!team) return draft;

  const folder = draft.folderId ? team.folders.find((item) => item.id === draft.folderId) : undefined;
  const lists = team.folders.flatMap((item) => item.lists);
  const list = draft.listId ? lists.find((item) => item.id === draft.listId) : undefined;

  return {
    ...draft,
    folderName: folder?.name,
    listName: list?.name
  };
};

const applyDraftToAlert = (alert: AlertConfig, draft: AlertDraft): AlertConfig => {
  const nowIso = new Date().toISOString();

  return {
    ...alert,
    ...draft,
    description: draft.description?.trim() || '',
    excludedTaskIds: dedupeIds(draft.excludedTaskIds),
    includeOnlyTaskIds: dedupeIds(draft.includeOnlyTaskIds),
    updatedAt: nowIso
  };
};

const sanitizeDraft = (draft: AlertDraft): AlertDraft => {
  const parsed = alertDraftSchema.parse({
    ...draft,
    description: draft.description?.trim(),
    excludedTaskIds: dedupeIds(draft.excludedTaskIds),
    includeOnlyTaskIds: dedupeIds(draft.includeOnlyTaskIds)
  });

  return {
    ...parsed,
    description: parsed.description?.trim(),
    excludedTaskIds: dedupeIds(parsed.excludedTaskIds),
    includeOnlyTaskIds: dedupeIds(parsed.includeOnlyTaskIds)
  };
};

const refreshAllInternal = async (alerts: AlertConfig[]): Promise<RefreshAlertResult[]> => {
  return withClient(async (client) => {
    const results: RefreshAlertResult[] = [];
    const teamMemberCache = new Map<string, string[]>();

    for (const alert of sortAlerts(alerts)) {
      let teamMemberIds = teamMemberCache.get(alert.teamId);
      if (!teamMemberIds) {
        try {
          teamMemberIds = await client.getTeamMemberIds(alert.teamId);
        } catch {
          teamMemberIds = [];
        }
        teamMemberCache.set(alert.teamId, teamMemberIds);
      }

      const refreshed = await refreshSingleAlert(client, alert, undefined, teamMemberIds);
      results.push(refreshed);
    }

    const nextAlertsById = new Map(results.map((item) => [item.alert.id, item.alert]));
    const nextAlerts = sortAlerts(
      alerts.map((alert) => {
        const replacement = nextAlertsById.get(alert.id);
        return replacement ?? alert;
      })
    );

    await store.setAlerts(nextAlerts);
    return results;
  });
};

const formatCsv = (alerts: AlertConfig[]): string => {
  const headers = [
    'Alert Name',
    'Type',
    'Status',
    'Hours Used',
    'Budget Hours',
    'Remaining Hours',
    'Percent Used',
    'Over By Hours',
    'Last Refreshed',
    'Scope'
  ];

  const esc = (value: string | number | undefined): string => {
    const str = value === undefined ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

  const rows = alerts.map((alert) => {
    const snapshot = alert.lastSnapshot;
    return [
      alert.name,
      alert.type,
      snapshot?.status ?? 'n/a',
      snapshot?.hoursUsed ?? 0,
      alert.budgetHours,
      snapshot?.remainingHours ?? alert.budgetHours,
      snapshot?.percentUsed ?? 0,
      snapshot?.overByHours ?? 0,
      alert.lastRefreshedAt ?? '',
      snapshot?.scopeSummary ?? ''
    ]
      .map(esc)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
};

const registerIpcHandlers = (): void => {
  ipcMain.handle('app:get-initial-data', async (): Promise<InitialData> => {
    const [alerts, uiPreferences, hasToken] = await Promise.all([
      store.getAlerts(),
      store.getUiPreferences(),
      store.hasToken()
    ]);

    if (!hasToken) {
      return {
        auth: { hasToken: false, teams: [] },
        alerts,
        uiPreferences
      };
    }

    try {
      const token = await store.getToken();
      if (!token) {
        return {
          auth: { hasToken: false, teams: [] },
          alerts,
          uiPreferences
        };
      }

      const teams = await new ClickUpClient(token).getTeams();
      return {
        auth: { hasToken: true, teams },
        alerts,
        uiPreferences
      };
    } catch {
      return {
        auth: { hasToken: true, teams: [] },
        alerts,
        uiPreferences
      };
    }
  });

  ipcMain.handle('auth:test-connection', async (_, tokenArg?: string) => {
    const token = tokenArg?.trim() || (await store.getToken());

    if (!token) {
      return {
        ok: false,
        teams: [],
        message: 'Provide a ClickUp token first.'
      };
    }

    try {
      const client = new ClickUpClient(token);
      const teams = await client.getTeams();
      return {
        ok: true,
        teams,
        message: teams.length > 0 ? undefined : 'Connected, but no accessible workspaces were found.'
      };
    } catch (error) {
      return {
        ok: false,
        teams: [],
        message: error instanceof Error ? error.message : 'Connection test failed.'
      };
    }
  });

  ipcMain.handle('auth:save-token', async (_, token: string) => {
    if (!token?.trim()) {
      throw new Error('Token cannot be empty.');
    }
    await store.setToken(token.trim());
  });

  ipcMain.handle('auth:clear-token', async () => {
    await store.clearToken();
  });

  ipcMain.handle('scope:get-tree', async () => withClient((client) => client.getScopeTree()));

  ipcMain.handle('alerts:create', async (_, draft: AlertDraft) => {
    const safeDraft = sanitizeDraft(draft);
    const alerts = await store.getAlerts();

    const hydratedDraft = await withClient(async (client) => {
      const scopeTree = await client.getScopeTree();
      return hydrateDraftNames(safeDraft, scopeTree);
    });

    const nowIso = new Date().toISOString();
    const nextAlert: AlertConfig = {
      id: randomUUID(),
      order: alerts.length,
      ...hydratedDraft,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const nextAlerts = sortAlerts([...alerts, nextAlert]);
    await store.setAlerts(nextAlerts);

    return nextAlert;
  });

  ipcMain.handle('alerts:update', async (_, id: string, draft: AlertDraft) => {
    const safeDraft = sanitizeDraft(draft);
    const alerts = await store.getAlerts();
    const current = alerts.find((item) => item.id === id);
    if (!current) throw new Error('Alert not found.');

    const hydratedDraft = await withClient(async (client) => {
      const scopeTree = await client.getScopeTree();
      return hydrateDraftNames(safeDraft, scopeTree);
    });

    const updated = applyDraftToAlert(current, hydratedDraft);

    const nextAlerts = sortAlerts(alerts.map((item) => (item.id === id ? updated : item)));
    await store.setAlerts(nextAlerts);

    return updated;
  });

  ipcMain.handle('alerts:delete', async (_, id: string) => {
    const alerts = await store.getAlerts();
    const filtered = alerts.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index }));
    await store.setAlerts(filtered);
  });

  ipcMain.handle('alerts:duplicate', async (_, id: string) => {
    const alerts = await store.getAlerts();
    const existing = alerts.find((item) => item.id === id);
    if (!existing) throw new Error('Alert not found.');

    const nowIso = new Date().toISOString();
    const copy: AlertConfig = {
      ...existing,
      id: randomUUID(),
      order: alerts.length,
      name: `${existing.name} (Copy)`,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const nextAlerts = sortAlerts([...alerts, copy]);
    await store.setAlerts(nextAlerts);
    return copy;
  });

  ipcMain.handle('alerts:reorder', async (_, ids: string[]) => {
    const alerts = await store.getAlerts();
    const byId = new Map(alerts.map((item) => [item.id, item]));
    const next: AlertConfig[] = [];

    for (const id of ids) {
      const found = byId.get(id);
      if (found) next.push(found);
    }

    for (const alert of alerts) {
      if (!ids.includes(alert.id)) next.push(alert);
    }

    const normalized = next.map((alert, index) => ({ ...alert, order: index, updatedAt: new Date().toISOString() }));
    await store.setAlerts(normalized);
    return normalized;
  });

  ipcMain.handle('alerts:refresh', async (_, id: string) => {
    const alerts = await store.getAlerts();
    const target = alerts.find((item) => item.id === id);
    if (!target) throw new Error('Alert not found.');

    const result = await withClient(async (client) => {
      const teamMemberIds = await client.getTeamMemberIds(target.teamId).catch(() => []);
      return refreshSingleAlert(client, target, undefined, teamMemberIds);
    });

    const nextAlerts = alerts.map((item) => (item.id === id ? result.alert : item));
    await store.setAlerts(nextAlerts);

    return result;
  });

  ipcMain.handle('alerts:refresh-all', async () => {
    const alerts = await store.getAlerts();
    if (alerts.length === 0) return [] as RefreshAlertResult[];

    try {
      return await refreshAllInternal(alerts);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh alerts.';
      const nowIso = new Date().toISOString();
      const failedResults: RefreshAlertResult[] = alerts.map((alert) => {
        const snapshot = buildErrorSnapshot(alert, message);
        return {
          success: false,
          errorMessage: message,
          alert: {
            ...alert,
            lastRefreshedAt: nowIso,
            updatedAt: nowIso,
            lastSnapshot: snapshot
          }
        };
      });

      await store.setAlerts(failedResults.map((item) => item.alert));
      return failedResults;
    }
  });

  ipcMain.handle('prefs:update', async (_, partial: Partial<UiPreferences>) => {
    return store.setUiPreferences(partial);
  });

  ipcMain.handle('alerts:export-csv', async () => {
    const alerts = await store.getAlerts();
    const csv = formatCsv(sortAlerts(alerts));

    const saveResult = await dialog.showSaveDialog({
      title: 'Export Budget Alert Summary',
      defaultPath: `clickup-budget-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      throw new Error('Export canceled.');
    }

    await fs.writeFile(saveResult.filePath, csv, 'utf8');
    return { filePath: saveResult.filePath };
  });
};

const createWindow = (): void => {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f8f5ef',
    title: 'ClickUp Budget Alert Monitor',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

app.whenReady().then(async () => {
  store = new LocalStore(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
