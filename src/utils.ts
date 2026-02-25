import type { AlertConfig, AlertStatus, DashboardSummary, StatusFilter, UiPreferences } from './shared/types';

export const hours = (value: number): string => `${value.toFixed(2)} h`;

export const statusDotClass: Record<AlertStatus, string> = {
  green: 'bg-moss',
  yellow: 'bg-amberearth',
  red: 'bg-terracotta',
  inactive: 'bg-stonewarm-200',
  error: 'bg-clay-500'
};

export const statusCardClass: Record<AlertStatus, string> = {
  green: 'border-moss/40 bg-white',
  yellow: 'border-amberearth/40 bg-white',
  red: 'border-terracotta/40 bg-white',
  inactive: 'border-stonewarm-200 bg-white/80',
  error: 'border-clay-500/40 bg-white'
};

export const statusLabel = (status: AlertStatus): string => {
  if (status === 'green') return 'Safe';
  if (status === 'yellow') return 'Warning';
  if (status === 'red') return 'Critical';
  if (status === 'inactive') return 'Inactive';
  return 'Error';
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

export const getVisibleAlerts = (alerts: AlertConfig[], ui: UiPreferences): AlertConfig[] => {
  const query = normalizeText(ui.search);

  const filtered = alerts.filter((alert) => {
    const status = alert.lastSnapshot?.status ?? 'inactive';
    const matchesStatus = ui.statusFilter === 'all' || ui.statusFilter === status;

    if (!matchesStatus) return false;

    if (!query) return true;

    const haystack = [
      alert.name,
      alert.description ?? '',
      alert.folderName ?? '',
      alert.listName ?? '',
      alert.type,
      alert.lastSnapshot?.scopeSummary ?? ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });

  return filtered.sort((a, b) => {
    if (ui.sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }

    if (ui.sortBy === 'lastRefreshed') {
      const av = a.lastRefreshedAt ? new Date(a.lastRefreshedAt).getTime() : 0;
      const bv = b.lastRefreshedAt ? new Date(b.lastRefreshedAt).getTime() : 0;
      return bv - av;
    }

    const ap = a.lastSnapshot?.percentUsed ?? 0;
    const bp = b.lastSnapshot?.percentUsed ?? 0;
    return bp - ap;
  });
};

export const computeSummary = (alerts: AlertConfig[]): DashboardSummary => {
  const summary: DashboardSummary = {
    activeAlerts: 0,
    green: 0,
    yellow: 0,
    red: 0,
    overBudget: 0
  };

  for (const alert of alerts) {
    if (!alert.active) continue;

    summary.activeAlerts += 1;
    const status = alert.lastSnapshot?.status;
    if (status === 'green') summary.green += 1;
    if (status === 'yellow') summary.yellow += 1;
    if (status === 'red') summary.red += 1;
    if ((alert.lastSnapshot?.overByHours ?? 0) > 0) summary.overBudget += 1;
  }

  return summary;
};

export const parseTaskIdInput = (input: string): string[] =>
  [...new Set(input.split(',').map((id) => id.trim()).filter((id) => id.length > 0))];

export const formatTaskIds = (values: string[] | undefined): string => (values ?? []).join(', ');

export const formatRelativeRefresh = (iso: string | undefined): string => {
  if (!iso) return 'Never refreshed';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never refreshed';

  return `Last refreshed ${date.toLocaleString()}`;
};

export const statusFilterOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All statuses', value: 'all' },
  { label: 'Green', value: 'green' },
  { label: 'Yellow', value: 'yellow' },
  { label: 'Red', value: 'red' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Errors', value: 'error' }
];
