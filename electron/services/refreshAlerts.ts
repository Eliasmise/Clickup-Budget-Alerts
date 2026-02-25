import type { AlertConfig, RefreshAlertResult, ScopeTreeTeam } from '../../src/shared/types';
import { buildErrorSnapshot, buildSnapshot, computeTimeRange, applyEntryFilters } from './alertEngine';
import { ClickUpApiError, ClickUpClient } from './clickupClient';

const getScopeWarning = (alert: AlertConfig, tree: ScopeTreeTeam[]): string | undefined => {
  const team = tree.find((item) => item.id === alert.teamId);
  if (!team) return 'Selected workspace is no longer accessible.';

  if (alert.type === 'folder' || (alert.type === 'custom' && alert.customScopeType === 'folder')) {
    const folderExists = team.folders.some((folder) => folder.id === alert.folderId);
    if (!folderExists) return 'Selected folder is missing or inaccessible.';
  }

  if (alert.type === 'list' || (alert.type === 'custom' && alert.customScopeType === 'list')) {
    const listExists = team.folders.some((folder) => folder.lists.some((list) => list.id === alert.listId));
    if (!listExists) return 'Selected list is missing or inaccessible.';
  }

  return undefined;
};

export const refreshSingleAlert = async (
  client: ClickUpClient,
  alert: AlertConfig,
  scopeTreeOverride?: ScopeTreeTeam[]
): Promise<RefreshAlertResult> => {
  if (!alert.active) {
    const snapshot = buildSnapshot(alert, []);
    const inactiveSnapshot = { ...snapshot, status: 'inactive' as const };
    return {
      success: true,
      alert: {
        ...alert,
        lastRefreshedAt: inactiveSnapshot.lastRefreshedAt,
        lastSnapshot: inactiveSnapshot,
        updatedAt: new Date().toISOString()
      }
    };
  }

  try {
    const scopeTree = scopeTreeOverride ?? (await client.getScopeTree());
    const warning = getScopeWarning(alert, scopeTree);

    if (warning) {
      const snapshot = buildErrorSnapshot(alert, warning);
      return {
        success: false,
        errorMessage: warning,
        alert: {
          ...alert,
          lastRefreshedAt: snapshot.lastRefreshedAt,
          lastSnapshot: snapshot,
          updatedAt: new Date().toISOString()
        }
      };
    }

    const timeRange = computeTimeRange(alert);
    const entries = await client.getTimeEntries({
      teamId: alert.teamId,
      startMs: timeRange.startMs,
      endMs: timeRange.endMs,
      folderId:
        alert.type === 'folder' || (alert.type === 'custom' && alert.customScopeType === 'folder')
          ? alert.folderId
          : undefined,
      listId:
        alert.type === 'list' || (alert.type === 'custom' && alert.customScopeType === 'list')
          ? alert.listId
          : undefined
    });

    const filteredEntries = applyEntryFilters(alert, entries);
    const snapshot = buildSnapshot(alert, filteredEntries);

    return {
      success: true,
      alert: {
        ...alert,
        excludedTaskIds: [...new Set(alert.excludedTaskIds)],
        includeOnlyTaskIds: alert.includeOnlyTaskIds ? [...new Set(alert.includeOnlyTaskIds)] : [],
        lastRefreshedAt: snapshot.lastRefreshedAt,
        lastSnapshot: snapshot,
        updatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    const message =
      error instanceof ClickUpApiError ? error.message : 'Failed to refresh alert due to an unexpected error.';
    const snapshot = buildErrorSnapshot(alert, message);

    return {
      success: false,
      errorMessage: message,
      alert: {
        ...alert,
        lastRefreshedAt: snapshot.lastRefreshedAt,
        lastSnapshot: snapshot,
        updatedAt: new Date().toISOString()
      }
    };
  }
};
