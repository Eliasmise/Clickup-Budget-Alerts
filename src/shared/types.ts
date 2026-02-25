export type AlertType = 'folder' | 'list' | 'custom';
export type ScopeType = 'folder' | 'list';
export type TimeRangeMode = 'monthly' | 'custom' | 'none';
export type AlertStatus = 'green' | 'yellow' | 'red' | 'inactive' | 'error';
export type StatusFilter = 'all' | 'green' | 'yellow' | 'red' | 'inactive' | 'error';
export type SortBy = 'percentUsed' | 'name' | 'lastRefreshed';

export interface TeamInfo {
  id: string;
  name: string;
}

export interface FolderInfo {
  id: string;
  name: string;
  teamId: string;
}

export interface ListInfo {
  id: string;
  name: string;
  folderId: string;
  teamId: string;
}

export interface TaskInfo {
  id: string;
  name: string;
  listId: string;
}

export interface ScopeTreeFolder extends FolderInfo {
  lists: ListInfo[];
}

export interface ScopeTreeTeam extends TeamInfo {
  folders: ScopeTreeFolder[];
}

export interface TimeEntry {
  id: string;
  taskId?: string;
  durationMs: number;
  startMs?: number;
  endMs?: number;
  userId?: string;
  raw?: unknown;
}

export interface AlertSnapshot {
  status: AlertStatus;
  hoursUsed: number;
  budgetHours: number;
  remainingHours: number;
  overByHours: number;
  percentUsed: number;
  entryCount: number;
  lastRefreshedAt: string;
  scopeSummary: string;
  warningMessage?: string;
  errorMessage?: string;
}

export interface AlertConfig {
  id: string;
  order: number;
  name: string;
  description?: string;
  type: AlertType;
  teamId: string;
  folderId?: string;
  folderName?: string;
  listId?: string;
  listName?: string;
  customScopeType?: ScopeType;
  timeRangeMode: TimeRangeMode;
  startDate?: string;
  endDate?: string;
  budgetHours: number;
  warningThresholdPct: number;
  criticalThresholdPct: number;
  excludedTaskIds: string[];
  includeOnlyTaskIds?: string[];
  refreshFrequencyMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt?: string;
  lastSnapshot?: AlertSnapshot;
}

export interface AlertDraft {
  name: string;
  description?: string;
  type: AlertType;
  teamId: string;
  folderId?: string;
  folderName?: string;
  listId?: string;
  listName?: string;
  customScopeType?: ScopeType;
  timeRangeMode: TimeRangeMode;
  startDate?: string;
  endDate?: string;
  budgetHours: number;
  warningThresholdPct: number;
  criticalThresholdPct: number;
  excludedTaskIds: string[];
  includeOnlyTaskIds?: string[];
  refreshFrequencyMinutes: number;
  active: boolean;
}

export interface RefreshAlertResult {
  alert: AlertConfig;
  success: boolean;
  errorMessage?: string;
}

export interface DashboardSummary {
  activeAlerts: number;
  green: number;
  yellow: number;
  red: number;
  overBudget: number;
}

export interface UiPreferences {
  search: string;
  statusFilter: StatusFilter;
  sortBy: SortBy;
}

export interface PersistedState {
  version: number;
  encryptedToken?: string;
  alerts: AlertConfig[];
  uiPreferences: UiPreferences;
}

export interface AuthState {
  hasToken: boolean;
  teams: TeamInfo[];
}

export interface InitialData {
  auth: AuthState;
  alerts: AlertConfig[];
  uiPreferences: UiPreferences;
}

export interface ClickUpApiErrorShape {
  message: string;
  status?: number;
  code?: string;
}

export interface TimeRange {
  startMs?: number;
  endMs?: number;
}
