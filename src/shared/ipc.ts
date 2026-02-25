import type {
  AlertConfig,
  AlertDraft,
  InitialData,
  RefreshAlertResult,
  ScopeTreeTeam,
  TeamInfo,
  UiPreferences
} from './types';

export interface ConnectionResult {
  ok: boolean;
  teams: TeamInfo[];
  message?: string;
}

export interface DesktopApi {
  getInitialData: () => Promise<InitialData>;
  testConnection: (token?: string) => Promise<ConnectionResult>;
  saveToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
  getScopeTree: () => Promise<ScopeTreeTeam[]>;
  createAlert: (draft: AlertDraft) => Promise<AlertConfig>;
  updateAlert: (id: string, draft: AlertDraft) => Promise<AlertConfig>;
  deleteAlert: (id: string) => Promise<void>;
  duplicateAlert: (id: string) => Promise<AlertConfig>;
  reorderAlerts: (ids: string[]) => Promise<AlertConfig[]>;
  refreshAlert: (id: string) => Promise<RefreshAlertResult>;
  refreshAllAlerts: () => Promise<RefreshAlertResult[]>;
  updateUiPreferences: (prefs: Partial<UiPreferences>) => Promise<UiPreferences>;
  exportCsv: () => Promise<{ filePath: string }>;
}
