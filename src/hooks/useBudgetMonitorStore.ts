import { create } from 'zustand';

import type { ConnectionResult } from '../shared/ipc';
import type {
  AlertConfig,
  AlertDraft,
  RefreshAlertResult,
  ScopeTreeTeam,
  UiPreferences
} from '../shared/types';

interface BudgetMonitorState {
  initialized: boolean;
  loading: boolean;
  errorMessage?: string;
  noticeMessage?: string;
  auth: {
    hasToken: boolean;
    teams: Array<{ id: string; name: string }>;
  };
  scopeTree: ScopeTreeTeam[];
  alerts: AlertConfig[];
  uiPreferences: UiPreferences;
  refreshingAll: boolean;
  refreshingAlertIds: string[];
  init: () => Promise<void>;
  testConnection: (token?: string) => Promise<ConnectionResult>;
  configureToken: (token: string) => Promise<ConnectionResult>;
  clearToken: () => Promise<void>;
  loadScopeTree: () => Promise<void>;
  createAlert: (draft: AlertDraft) => Promise<void>;
  updateAlert: (id: string, draft: AlertDraft) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
  duplicateAlert: (id: string) => Promise<void>;
  reorderAlerts: (ids: string[]) => Promise<void>;
  refreshAlert: (id: string) => Promise<RefreshAlertResult>;
  refreshAll: () => Promise<RefreshAlertResult[]>;
  runAutoRefreshDue: () => Promise<void>;
  updateUiPreferences: (partial: Partial<UiPreferences>) => void;
  exportCsv: () => Promise<string | undefined>;
  clearMessage: () => void;
}

const addRefreshingId = (ids: string[], id: string): string[] => (ids.includes(id) ? ids : [...ids, id]);
const removeRefreshingId = (ids: string[], id: string): string[] => ids.filter((item) => item !== id);

const sortAlerts = (alerts: AlertConfig[]): AlertConfig[] =>
  [...alerts].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

const mergeRefreshResults = (alerts: AlertConfig[], results: RefreshAlertResult[]): AlertConfig[] => {
  const byId = new Map(results.map((item) => [item.alert.id, item.alert]));
  return sortAlerts(alerts.map((alert) => byId.get(alert.id) ?? alert));
};

export const useBudgetMonitorStore = create<BudgetMonitorState>((set, get) => ({
  initialized: false,
  loading: true,
  auth: {
    hasToken: false,
    teams: []
  },
  scopeTree: [],
  alerts: [],
  uiPreferences: {
    search: '',
    statusFilter: 'all',
    sortBy: 'percentUsed'
  },
  refreshingAll: false,
  refreshingAlertIds: [],

  init: async () => {
    set({ loading: true, errorMessage: undefined });
    try {
      const payload = await window.clickupMonitor.getInitialData();
      set({
        initialized: true,
        loading: false,
        auth: payload.auth,
        alerts: sortAlerts(payload.alerts),
        uiPreferences: payload.uiPreferences,
        errorMessage: undefined
      });

      if (payload.auth.hasToken) {
        await get().loadScopeTree();
      }
    } catch (error) {
      set({
        initialized: true,
        loading: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to initialize app.'
      });
    }
  },

  testConnection: async (token?: string) => {
    const result = await window.clickupMonitor.testConnection(token);
    if (!result.ok) {
      set({ errorMessage: result.message });
    }
    return result;
  },

  configureToken: async (token: string) => {
    set({ loading: true, errorMessage: undefined, noticeMessage: undefined });
    try {
      const result = await window.clickupMonitor.testConnection(token);
      if (!result.ok) {
        set({ loading: false, errorMessage: result.message ?? 'Token validation failed.' });
        return result;
      }

      await window.clickupMonitor.saveToken(token.trim());
      const scopeTree = await window.clickupMonitor.getScopeTree();

      set({
        loading: false,
        auth: { hasToken: true, teams: result.teams },
        scopeTree,
        errorMessage: undefined,
        noticeMessage: 'Token saved successfully.'
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save token.';
      set({ loading: false, errorMessage: message });
      return { ok: false, teams: [], message };
    }
  },

  clearToken: async () => {
    await window.clickupMonitor.clearToken();
    set({
      auth: { hasToken: false, teams: [] },
      scopeTree: [],
      errorMessage: undefined,
      noticeMessage: 'Token cleared.'
    });
  },

  loadScopeTree: async () => {
    try {
      const scopeTree = await window.clickupMonitor.getScopeTree();
      const teams = scopeTree.map((team) => ({ id: team.id, name: team.name }));
      set({ scopeTree, auth: { hasToken: true, teams } });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load workspace scopes.' });
    }
  },

  createAlert: async (draft: AlertDraft) => {
    const created = await window.clickupMonitor.createAlert(draft);
    set((state) => ({ alerts: sortAlerts([...state.alerts, created]) }));
  },

  updateAlert: async (id: string, draft: AlertDraft) => {
    const updated = await window.clickupMonitor.updateAlert(id, draft);
    set((state) => ({
      alerts: sortAlerts(state.alerts.map((item) => (item.id === id ? updated : item)))
    }));
  },

  deleteAlert: async (id: string) => {
    await window.clickupMonitor.deleteAlert(id);
    set((state) => ({
      alerts: sortAlerts(state.alerts.filter((item) => item.id !== id).map((item, idx) => ({ ...item, order: idx })))
    }));
  },

  duplicateAlert: async (id: string) => {
    const duplicated = await window.clickupMonitor.duplicateAlert(id);
    set((state) => ({ alerts: sortAlerts([...state.alerts, duplicated]) }));
  },

  reorderAlerts: async (ids: string[]) => {
    const reordered = await window.clickupMonitor.reorderAlerts(ids);
    set({ alerts: sortAlerts(reordered) });
  },

  refreshAlert: async (id: string) => {
    set((state) => ({ refreshingAlertIds: addRefreshingId(state.refreshingAlertIds, id) }));

    try {
      const result = await window.clickupMonitor.refreshAlert(id);
      set((state) => ({
        alerts: sortAlerts(state.alerts.map((item) => (item.id === id ? result.alert : item))),
        refreshingAlertIds: removeRefreshingId(state.refreshingAlertIds, id),
        errorMessage: result.success ? undefined : result.errorMessage
      }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh alert.';
      set((state) => ({
        refreshingAlertIds: removeRefreshingId(state.refreshingAlertIds, id),
        errorMessage: message
      }));
      throw error;
    }
  },

  refreshAll: async () => {
    set({ refreshingAll: true, errorMessage: undefined });

    try {
      const results = await window.clickupMonitor.refreshAllAlerts();
      set((state) => ({
        refreshingAll: false,
        alerts: mergeRefreshResults(state.alerts, results)
      }));

      const failures = results.filter((item) => !item.success).length;
      if (failures > 0) {
        set({ errorMessage: `${failures} alert refresh${failures === 1 ? '' : 'es'} failed.` });
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refresh all failed.';
      set({ refreshingAll: false, errorMessage: message });
      throw error;
    }
  },

  runAutoRefreshDue: async () => {
    const now = Date.now();
    const dueAlerts = get().alerts.filter((alert) => {
      if (!alert.active) return false;
      if (!alert.refreshFrequencyMinutes || alert.refreshFrequencyMinutes <= 0) return false;
      const last = alert.lastRefreshedAt ? new Date(alert.lastRefreshedAt).getTime() : 0;
      return now - last >= alert.refreshFrequencyMinutes * 60_000;
    });

    for (const alert of dueAlerts) {
      try {
        await get().refreshAlert(alert.id);
      } catch {
        // Error state is already surfaced by refreshAlert.
      }
    }
  },

  updateUiPreferences: (partial) => {
    set((state) => ({
      uiPreferences: {
        ...state.uiPreferences,
        ...partial
      }
    }));

    void window.clickupMonitor.updateUiPreferences(partial).catch(() => {
      // Preference persistence errors should not block dashboard usage.
    });
  },

  exportCsv: async () => {
    try {
      const result = await window.clickupMonitor.exportCsv();
      set({ noticeMessage: `CSV exported to ${result.filePath}` });
      return result.filePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSV export failed.';
      if (message !== 'Export canceled.') {
        set({ errorMessage: message });
      }
      return undefined;
    }
  },

  clearMessage: () => {
    set({ errorMessage: undefined, noticeMessage: undefined });
  }
}));
