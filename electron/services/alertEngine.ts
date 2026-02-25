import { endOfDay, endOfMonth, startOfDay, startOfMonth } from 'date-fns';

import type { AlertConfig, AlertSnapshot, AlertStatus, TimeEntry, TimeRange } from '../../src/shared/types';

const roundHours = (value: number): number => Math.round(value * 100) / 100;

const uniqIds = (ids: string[] | undefined): string[] =>
  [...new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0))];

export const computeTimeRange = (alert: AlertConfig, now = new Date()): TimeRange => {
  if (alert.timeRangeMode === 'none') return {};

  if (alert.timeRangeMode === 'monthly') {
    return {
      startMs: startOfMonth(now).getTime(),
      endMs: endOfMonth(now).getTime()
    };
  }

  if (!alert.startDate || !alert.endDate) return {};

  return {
    startMs: startOfDay(new Date(alert.startDate)).getTime(),
    endMs: endOfDay(new Date(alert.endDate)).getTime()
  };
};

const resolveStatus = (alert: AlertConfig, percentUsed: number): AlertStatus => {
  if (!alert.active) return 'inactive';
  if (percentUsed >= alert.criticalThresholdPct) return 'red';
  if (percentUsed >= alert.warningThresholdPct) return 'yellow';
  return 'green';
};

const resolveScopeSummary = (alert: AlertConfig): string => {
  const modeLabel =
    alert.timeRangeMode === 'monthly'
      ? 'Current month'
      : alert.timeRangeMode === 'custom'
        ? `Custom (${alert.startDate ?? 'n/a'} to ${alert.endDate ?? 'n/a'})`
        : 'Cumulative';

  if (alert.type === 'folder') {
    return `Folder: ${alert.folderName ?? alert.folderId ?? 'Unknown'} | ${modeLabel}`;
  }

  if (alert.type === 'list') {
    return `List: ${alert.listName ?? alert.listId ?? 'Unknown'} | ${modeLabel}`;
  }

  const scopeName =
    alert.customScopeType === 'folder'
      ? alert.folderName ?? alert.folderId ?? 'Unknown folder'
      : alert.listName ?? alert.listId ?? 'Unknown list';

  return `Custom ${alert.customScopeType ?? 'scope'}: ${scopeName} | ${modeLabel}`;
};

export const applyEntryFilters = (alert: AlertConfig, entries: TimeEntry[]): TimeEntry[] => {
  const excluded = new Set(uniqIds(alert.excludedTaskIds));
  const includeOnly = new Set(uniqIds(alert.includeOnlyTaskIds));

  return entries.filter((entry) => {
    if (!entry.taskId) {
      return includeOnly.size === 0;
    }

    if (excluded.has(entry.taskId)) return false;
    if (includeOnly.size > 0 && !includeOnly.has(entry.taskId)) return false;
    return true;
  });
};

export const buildSnapshot = (alert: AlertConfig, entries: TimeEntry[], warningMessage?: string): AlertSnapshot => {
  const totalHours = roundHours(entries.reduce((sum, entry) => sum + entry.durationMs / 3_600_000, 0));
  const budget = alert.budgetHours;
  const rawPercent = budget > 0 ? (totalHours / budget) * 100 : 0;
  const percentUsed = roundHours(rawPercent);
  const remainingHours = roundHours(Math.max(0, budget - totalHours));
  const overByHours = roundHours(Math.max(0, totalHours - budget));

  return {
    status: resolveStatus(alert, percentUsed),
    hoursUsed: totalHours,
    budgetHours: budget,
    remainingHours,
    overByHours,
    percentUsed,
    entryCount: entries.length,
    lastRefreshedAt: new Date().toISOString(),
    scopeSummary: resolveScopeSummary(alert),
    warningMessage
  };
};

export const buildErrorSnapshot = (alert: AlertConfig, errorMessage: string): AlertSnapshot => ({
  status: 'error',
  hoursUsed: alert.lastSnapshot?.hoursUsed ?? 0,
  budgetHours: alert.budgetHours,
  remainingHours: alert.lastSnapshot?.remainingHours ?? alert.budgetHours,
  overByHours: alert.lastSnapshot?.overByHours ?? 0,
  percentUsed: alert.lastSnapshot?.percentUsed ?? 0,
  entryCount: alert.lastSnapshot?.entryCount ?? 0,
  lastRefreshedAt: new Date().toISOString(),
  scopeSummary: alert.lastSnapshot?.scopeSummary ?? resolveScopeSummary(alert),
  errorMessage
});
