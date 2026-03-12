import html2canvas from 'html2canvas';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AlertCard } from './components/AlertCard';
import { AlertFormModal } from './components/AlertFormModal';
import { AuthPanel } from './components/AuthPanel';
import { SummaryStrip } from './components/SummaryStrip';
import { useBudgetMonitorStore } from './hooks/useBudgetMonitorStore';
import type { AlertConfig, AlertDraft, RefreshAlertResult } from './shared/types';
import { computeSummary, getVisibleAlerts, statusFilterOptions } from './utils';

const HOURLY_REFRESH_MS = 60 * 60 * 1000;
const QUEUE_DELAY_MS = 30 * 1000;
const MAX_RATE_LIMIT_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimitError = (message?: string): boolean => /rate\\s*limit|429|too many requests/i.test(message ?? '');

const toDraft = (alert: AlertConfig): AlertDraft => ({
  name: alert.name,
  description: alert.description,
  type: alert.type,
  teamId: alert.teamId,
  folderId: alert.folderId,
  folderName: alert.folderName,
  listId: alert.listId,
  listName: alert.listName,
  customScopeType: alert.customScopeType,
  timeRangeMode: alert.timeRangeMode,
  startDate: alert.startDate,
  endDate: alert.endDate,
  budgetHours: alert.budgetHours,
  warningThresholdPct: alert.warningThresholdPct,
  criticalThresholdPct: alert.criticalThresholdPct,
  excludedTaskIds: alert.excludedTaskIds,
  includeOnlyTaskIds: alert.includeOnlyTaskIds,
  refreshFrequencyMinutes: alert.refreshFrequencyMinutes,
  active: alert.active
});

function App() {
  const {
    initialized,
    loading,
    auth,
    alerts,
    scopeTree,
    uiPreferences,
    errorMessage,
    noticeMessage,
    refreshingAll,
    refreshingAlertIds,
    init,
    clearToken,
    createAlert,
    updateAlert,
    deleteAlert,
    duplicateAlert,
    reorderAlerts,
    refreshAlert,
    refreshAll,
    updateUiPreferences,
    exportCsv,
    clearMessage
  } = useBudgetMonitorStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertConfig>();
  const [hourlyRefreshInProgress, setHourlyRefreshInProgress] = useState(false);
  const [nextHourlyRunAt, setNextHourlyRunAt] = useState<number>(Date.now() + 5_000);
  const [localNotice, setLocalNotice] = useState<string>();

  useEffect(() => {
    void init();
  }, [init]);

  const orderedAlerts = useMemo(() => [...alerts].sort((a, b) => a.order - b.order), [alerts]);
  const visibleAlerts = useMemo(() => getVisibleAlerts(orderedAlerts, uiPreferences), [orderedAlerts, uiPreferences]);
  const summary = useMemo(() => computeSummary(orderedAlerts), [orderedAlerts]);

  const handleCreate = () => {
    setEditingAlert(undefined);
    setIsModalOpen(true);
  };

  const handleEdit = (alert: AlertConfig) => {
    setEditingAlert(alert);
    setIsModalOpen(true);
  };

  const handleMove = async (alertId: string, direction: -1 | 1) => {
    const ids = orderedAlerts.map((item) => item.id);
    const index = ids.indexOf(alertId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;

    const swapped = [...ids];
    [swapped[index], swapped[nextIndex]] = [swapped[nextIndex], swapped[index]];
    await reorderAlerts(swapped);
  };

  const handleSaveAlert = async (draft: AlertDraft) => {
    if (editingAlert) {
      await updateAlert(editingAlert.id, draft);
      return;
    }

    await createAlert(draft);
  };

  const handleCopySnapshot = useCallback(async (alertId: string) => {
    const cardElement = document.querySelector<HTMLElement>(`[data-alert-card-id="${alertId}"]`);
    if (!cardElement) {
      setLocalNotice('Unable to find card snapshot target.');
      return;
    }

    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        ignoreElements: (element) => (element as HTMLElement).dataset.snapshotExclude === 'true'
      });
      const dataUrl = canvas.toDataURL('image/png');
      await window.clickupMonitor.copyImageToClipboard(dataUrl);
      setLocalNotice('Card snapshot copied to clipboard.');
    } catch {
      setLocalNotice('Failed to copy card snapshot.');
    }
  }, []);

  const runQueuedHourlyRefresh = useCallback(async () => {
    if (hourlyRefreshInProgress) return;

    const activeAlertIds = orderedAlerts.filter((alert) => alert.active).map((alert) => alert.id);
    setNextHourlyRunAt(Date.now() + HOURLY_REFRESH_MS);

    if (activeAlertIds.length === 0) return;

    setHourlyRefreshInProgress(true);
    setLocalNotice('Hourly queued refresh started.');

    const queue = [...activeAlertIds];
    const retryMap = new Map<string, number>();

    try {
      while (queue.length > 0) {
        const alertId = queue.shift();
        if (!alertId) break;

        let result: RefreshAlertResult | undefined;
        let refreshErrorMessage: string | undefined;

        try {
          result = await refreshAlert(alertId);
          refreshErrorMessage = result.errorMessage;
        } catch (error) {
          refreshErrorMessage = error instanceof Error ? error.message : 'Unknown refresh failure.';
        }

        if (isRateLimitError(refreshErrorMessage)) {
          const retries = retryMap.get(alertId) ?? 0;
          if (retries < MAX_RATE_LIMIT_RETRIES) {
            retryMap.set(alertId, retries + 1);
            queue.push(alertId);
          }
        }

        if (queue.length > 0) {
          await sleep(QUEUE_DELAY_MS);
        }
      }

      setLocalNotice('Hourly queued refresh completed.');
    } finally {
      setHourlyRefreshInProgress(false);
    }
  }, [hourlyRefreshInProgress, orderedAlerts, refreshAlert]);

  useEffect(() => {
    if (!auth.hasToken) return;

    const tick = () => {
      if (hourlyRefreshInProgress) return;
      if (Date.now() >= nextHourlyRunAt) {
        void runQueuedHourlyRefresh();
      }
    };

    tick();
    const timer = setInterval(tick, 5_000);
    return () => clearInterval(timer);
  }, [auth.hasToken, hourlyRefreshInProgress, nextHourlyRunAt, runQueuedHourlyRefresh]);

  useEffect(() => {
    if (!localNotice) return;
    const timer = setTimeout(() => setLocalNotice(undefined), 5_000);
    return () => clearTimeout(timer);
  }, [localNotice]);

  const appSignal = useMemo(() => {
    if (hourlyRefreshInProgress) {
      return {
        tone: 'yellow' as const,
        label: 'Queued update in progress'
      };
    }

    const activeAlerts = orderedAlerts.filter((alert) => alert.active);
    if (activeAlerts.length === 0) {
      return {
        tone: 'green' as const,
        label: 'No active alerts'
      };
    }

    const staleThreshold = Date.now() - HOURLY_REFRESH_MS;
    const hasError = activeAlerts.some((alert) => alert.lastSnapshot?.status === 'error');
    const hasStaleUpdate = activeAlerts.some((alert) => {
      if (!alert.lastRefreshedAt) return true;
      const refreshedAt = new Date(alert.lastRefreshedAt).getTime();
      return Number.isNaN(refreshedAt) || refreshedAt < staleThreshold;
    });

    if (hasError || hasStaleUpdate) {
      return {
        tone: 'red' as const,
        label: 'Update error or stale data'
      };
    }

    return {
      tone: 'green' as const,
      label: 'All alerts updated in the last hour'
    };
  }, [hourlyRefreshInProgress, orderedAlerts]);

  const signalDotClass =
    appSignal.tone === 'green' ? 'bg-moss' : appSignal.tone === 'yellow' ? 'bg-amberearth' : 'bg-terracotta';

  if (!initialized || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand-50 text-stonewarm-900">
        <p className="text-sm">Loading ClickUp Budget Alert Monitor...</p>
      </main>
    );
  }

  if (!auth.hasToken) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,196,164,0.35),_rgba(248,245,239,1)_55%)] px-6 pb-10 pt-2">
        <AuthPanel />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8f5ef_0%,_#f1ebdf_100%)] px-5 py-5 md:px-8">
      <section className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stonewarm-200 bg-white px-5 py-4 shadow-soft">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${signalDotClass}`} title={appSignal.label} />
              <h1 className="text-2xl font-semibold text-stonewarm-900">ClickUp Budget Alert Monitor</h1>
            </div>
            <p className="mt-1 text-sm text-stonewarm-700">
              {auth.teams.length} workspace{auth.teams.length === 1 ? '' : 's'} connected
            </p>
            <p className="text-xs text-stonewarm-700">{appSignal.label}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreate}
              className="rounded-xl bg-olive-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-600"
            >
              New Alert
            </button>
            <button
              onClick={() => void refreshAll()}
              disabled={refreshingAll}
              className="rounded-xl border border-stonewarm-300 px-4 py-2 text-sm font-medium text-stonewarm-900 transition hover:bg-sand-100 disabled:opacity-60"
            >
              {refreshingAll ? 'Refreshing...' : 'Refresh All'}
            </button>
            <button
              onClick={() => void exportCsv()}
              className="rounded-xl border border-stonewarm-300 px-4 py-2 text-sm font-medium text-stonewarm-900 transition hover:bg-sand-100"
            >
              Export CSV
            </button>
            <button
              onClick={() => void clearToken()}
              className="rounded-xl border border-clay-500 px-4 py-2 text-sm font-medium text-clay-600 transition hover:bg-clay-500/10"
            >
              Replace Token
            </button>
          </div>
        </header>

        {errorMessage ? (
          <button
            className="w-full rounded-xl border border-clay-500/30 bg-clay-500/10 px-4 py-2 text-left text-sm text-clay-600"
            onClick={clearMessage}
          >
            {errorMessage}
          </button>
        ) : null}

        {noticeMessage ? (
          <button
            className="w-full rounded-xl border border-moss/30 bg-moss/10 px-4 py-2 text-left text-sm text-moss"
            onClick={clearMessage}
          >
            {noticeMessage}
          </button>
        ) : null}

        {localNotice ? (
          <div className="w-full rounded-xl border border-stonewarm-300 bg-sand-100 px-4 py-2 text-left text-sm text-stonewarm-900">
            {localNotice}
          </div>
        ) : null}

        <SummaryStrip summary={summary} />

        <section className="rounded-2xl border border-stonewarm-200 bg-white p-4 shadow-soft">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={uiPreferences.search}
              onChange={(event) => updateUiPreferences({ search: event.target.value })}
              placeholder="Search alerts"
              className="rounded-xl border border-stonewarm-200 bg-sand-50 px-3 py-2 text-sm text-stonewarm-900 outline-none ring-clay-500 transition focus:ring-2"
            />

            <select
              className="rounded-xl border border-stonewarm-200 bg-sand-50 px-3 py-2 text-sm text-stonewarm-900"
              value={uiPreferences.statusFilter}
              onChange={(event) => updateUiPreferences({ statusFilter: event.target.value as typeof uiPreferences.statusFilter })}
            >
              {statusFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-stonewarm-200 bg-sand-50 px-3 py-2 text-sm text-stonewarm-900"
              value={uiPreferences.sortBy}
              onChange={(event) => updateUiPreferences({ sortBy: event.target.value as typeof uiPreferences.sortBy })}
            >
              <option value="percentUsed">Sort by % used</option>
              <option value="name">Sort by name</option>
              <option value="lastRefreshed">Sort by last refreshed</option>
            </select>
          </div>
        </section>

        {visibleAlerts.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-stonewarm-300 bg-white/70 px-6 py-16 text-center shadow-soft">
            <h2 className="text-lg font-semibold text-stonewarm-900">No alerts yet</h2>
            <p className="mt-2 text-sm text-stonewarm-700">Create your first folder or list budget alert to start monitoring usage.</p>
            <button
              onClick={handleCreate}
              className="mt-4 rounded-xl bg-olive-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-600"
            >
              Create First Alert
            </button>
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {visibleAlerts.map((alert) => {
              const orderedIndex = orderedAlerts.findIndex((item) => item.id === alert.id);
              return (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  isRefreshing={refreshingAlertIds.includes(alert.id)}
                  onRefresh={() => void refreshAlert(alert.id)}
                  onEdit={() => handleEdit(alert)}
                  onDelete={() => {
                    if (window.confirm(`Delete alert "${alert.name}"?`)) {
                      void deleteAlert(alert.id);
                    }
                  }}
                  onDuplicate={() => void duplicateAlert(alert.id)}
                  onToggleActive={() => void updateAlert(alert.id, { ...toDraft(alert), active: !alert.active })}
                  onCopySnapshot={() => void handleCopySnapshot(alert.id)}
                  onMoveUp={() => void handleMove(alert.id, -1)}
                  onMoveDown={() => void handleMove(alert.id, 1)}
                  canMoveUp={orderedIndex > 0}
                  canMoveDown={orderedIndex < orderedAlerts.length - 1}
                />
              );
            })}
          </section>
        )}
      </section>

      <AlertFormModal
        open={isModalOpen}
        scopeTree={scopeTree}
        initialAlert={editingAlert}
        onClose={() => {
          setEditingAlert(undefined);
          setIsModalOpen(false);
        }}
        onSubmit={handleSaveAlert}
      />
    </main>
  );
}

export default App;
