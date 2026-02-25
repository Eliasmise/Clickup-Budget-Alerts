import clsx from 'clsx';

import { formatRelativeRefresh, hours, statusCardClass, statusDotClass, statusLabel } from '../utils';
import type { AlertConfig } from '../shared/types';

interface AlertCardProps {
  alert: AlertConfig;
  isRefreshing: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function AlertCard({
  alert,
  isRefreshing,
  onRefresh,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleActive,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown
}: AlertCardProps) {
  const snapshot = alert.lastSnapshot;
  const status = snapshot?.status ?? (alert.active ? 'inactive' : 'inactive');

  return (
    <article className={clsx('rounded-2xl border p-4 shadow-soft transition', statusCardClass[status])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-stonewarm-900">{alert.name}</h3>
          <p className="mt-1 text-sm text-stonewarm-700">{alert.description || 'No description'}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-sand-100 px-2 py-1 text-xs font-medium text-stonewarm-900">
          <span className={clsx('h-2.5 w-2.5 rounded-full', statusDotClass[status])} />
          {statusLabel(status)}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-stonewarm-700">
        <p>{snapshot?.scopeSummary ?? `${alert.type.toUpperCase()} scope`}</p>
        <p>{formatRelativeRefresh(alert.lastRefreshedAt)}</p>
        {snapshot?.errorMessage ? <p className="text-clay-600">{snapshot.errorMessage}</p> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-sand-100 p-3">
          <p className="text-xs uppercase tracking-wide text-stonewarm-700">Hours used</p>
          <p className="mt-1 text-lg font-semibold text-stonewarm-900">{hours(snapshot?.hoursUsed ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-sand-100 p-3">
          <p className="text-xs uppercase tracking-wide text-stonewarm-700">Budget</p>
          <p className="mt-1 text-lg font-semibold text-stonewarm-900">{hours(alert.budgetHours)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-stonewarm-700">Remaining</p>
          <p className="mt-1 font-semibold text-stonewarm-900">{hours(snapshot?.remainingHours ?? alert.budgetHours)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stonewarm-700">% Used</p>
          <p className="mt-1 font-semibold text-stonewarm-900">{(snapshot?.percentUsed ?? 0).toFixed(2)}%</p>
        </div>
      </div>

      {(snapshot?.overByHours ?? 0) > 0 ? (
        <p className="mt-2 text-sm font-medium text-terracotta">Over by {hours(snapshot?.overByHours ?? 0)}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rounded-lg border border-stonewarm-300 px-3 py-1.5 text-stonewarm-900 transition hover:bg-sand-100 disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <button onClick={onEdit} className="rounded-lg border border-stonewarm-300 px-3 py-1.5 text-stonewarm-900 hover:bg-sand-100">
          Edit
        </button>
        <button
          onClick={onDuplicate}
          className="rounded-lg border border-stonewarm-300 px-3 py-1.5 text-stonewarm-900 hover:bg-sand-100"
        >
          Duplicate
        </button>
        <button onClick={onToggleActive} className="rounded-lg border border-stonewarm-300 px-3 py-1.5 text-stonewarm-900 hover:bg-sand-100">
          {alert.active ? 'Deactivate' : 'Activate'}
        </button>
        <button onClick={onDelete} className="rounded-lg border border-clay-500 px-3 py-1.5 text-clay-600 hover:bg-clay-500/10">
          Delete
        </button>
      </div>

      <div className="mt-2 flex gap-2 text-xs">
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="rounded-lg border border-stonewarm-300 px-2 py-1 text-stonewarm-900 disabled:opacity-40"
        >
          Move Up
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="rounded-lg border border-stonewarm-300 px-2 py-1 text-stonewarm-900 disabled:opacity-40"
        >
          Move Down
        </button>
      </div>
    </article>
  );
}
