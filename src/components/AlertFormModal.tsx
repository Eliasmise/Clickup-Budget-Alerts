import { useEffect, useMemo, useState } from 'react';

import { alertDraftSchema } from '../shared/validation';
import type { AlertConfig, AlertDraft, ScopeTreeTeam } from '../shared/types';
import { formatTaskIds, parseTaskIdInput } from '../utils';

interface AlertFormModalProps {
  open: boolean;
  scopeTree: ScopeTreeTeam[];
  initialAlert?: AlertConfig;
  onClose: () => void;
  onSubmit: (draft: AlertDraft) => Promise<void>;
}

type FormState = {
  name: string;
  description: string;
  type: 'folder' | 'list' | 'custom';
  teamId: string;
  folderId: string;
  listId: string;
  customScopeType: 'folder' | 'list';
  timeRangeMode: 'monthly' | 'custom' | 'none';
  startDate: string;
  endDate: string;
  budgetHours: string;
  warningThresholdPct: string;
  criticalThresholdPct: string;
  excludedTaskIds: string;
  includeOnlyTaskIds: string;
  refreshFrequencyMinutes: string;
  active: boolean;
};

const createDefaultState = (scopeTree: ScopeTreeTeam[], initial?: AlertConfig): FormState => {
  if (initial) {
    return {
      name: initial.name,
      description: initial.description ?? '',
      type: initial.type,
      teamId: initial.teamId,
      folderId: initial.folderId ?? '',
      listId: initial.listId ?? '',
      customScopeType: initial.customScopeType ?? 'folder',
      timeRangeMode: initial.timeRangeMode,
      startDate: initial.startDate ?? '',
      endDate: initial.endDate ?? '',
      budgetHours: String(initial.budgetHours),
      warningThresholdPct: String(initial.warningThresholdPct),
      criticalThresholdPct: String(initial.criticalThresholdPct),
      excludedTaskIds: formatTaskIds(initial.excludedTaskIds),
      includeOnlyTaskIds: formatTaskIds(initial.includeOnlyTaskIds),
      refreshFrequencyMinutes: String(initial.refreshFrequencyMinutes ?? 0),
      active: initial.active
    };
  }

  const firstTeam = scopeTree[0];
  const firstFolder = firstTeam?.folders[0];
  const firstList = firstFolder?.lists[0];

  return {
    name: '',
    description: '',
    type: 'folder',
    teamId: firstTeam?.id ?? '',
    folderId: firstFolder?.id ?? '',
    listId: firstList?.id ?? '',
    customScopeType: 'folder',
    timeRangeMode: 'monthly',
    startDate: '',
    endDate: '',
    budgetHours: '50',
    warningThresholdPct: '80',
    criticalThresholdPct: '100',
    excludedTaskIds: '',
    includeOnlyTaskIds: '',
    refreshFrequencyMinutes: '0',
    active: true
  };
};

const inputClass =
  'w-full rounded-xl border border-stonewarm-200 bg-sand-50 px-3 py-2 text-sm text-stonewarm-900 outline-none ring-clay-500 transition focus:ring-2';

export function AlertFormModal({ open, scopeTree, initialAlert, onClose, onSubmit }: AlertFormModalProps) {
  const [form, setForm] = useState<FormState>(() => createDefaultState(scopeTree, initialAlert));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(createDefaultState(scopeTree, initialAlert));
      setErrors({});
    }
  }, [open, scopeTree, initialAlert]);

  const selectedTeam = useMemo(() => scopeTree.find((team) => team.id === form.teamId), [scopeTree, form.teamId]);
  const folders = selectedTeam?.folders ?? [];
  const allLists = useMemo(() => folders.flatMap((folder) => folder.lists), [folders]);

  const currentFolderLists = useMemo(() => {
    if (!form.folderId) return allLists;
    const folder = folders.find((item) => item.id === form.folderId);
    return folder?.lists ?? [];
  }, [allLists, folders, form.folderId]);

  if (!open) return null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTeamChange = (teamId: string) => {
    const team = scopeTree.find((item) => item.id === teamId);
    const firstFolder = team?.folders[0];
    const firstList = firstFolder?.lists[0];

    setForm((prev) => ({
      ...prev,
      teamId,
      folderId: firstFolder?.id ?? '',
      listId: firstList?.id ?? ''
    }));
  };

  const handleFolderChange = (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    setForm((prev) => ({
      ...prev,
      folderId,
      listId: folder?.lists[0]?.id ?? ''
    }));
  };

  const handleSubmit = async () => {
    const draft: AlertDraft = {
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      teamId: form.teamId,
      folderId: form.folderId || undefined,
      listId: form.listId || undefined,
      customScopeType: form.type === 'custom' ? form.customScopeType : undefined,
      timeRangeMode: form.timeRangeMode,
      startDate: form.timeRangeMode === 'custom' ? form.startDate || undefined : undefined,
      endDate: form.timeRangeMode === 'custom' ? form.endDate || undefined : undefined,
      budgetHours: Number(form.budgetHours),
      warningThresholdPct: Number(form.warningThresholdPct),
      criticalThresholdPct: Number(form.criticalThresholdPct),
      excludedTaskIds: parseTaskIdInput(form.excludedTaskIds),
      includeOnlyTaskIds: parseTaskIdInput(form.includeOnlyTaskIds),
      refreshFrequencyMinutes: Number(form.refreshFrequencyMinutes),
      active: form.active
    };

    const parsed = alertDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] ? String(issue.path[0]) : 'form';
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      await onSubmit(parsed.data);
      onClose();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Failed to save alert.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-stonewarm-900/45 p-8">
      <div className="w-full max-w-3xl rounded-2xl border border-stonewarm-200 bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-stonewarm-900">
              {initialAlert ? 'Edit budget alert' : 'Create budget alert'}
            </h2>
            <p className="mt-1 text-sm text-stonewarm-700">Configure scope, thresholds, exclusions, and refresh cadence.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-stonewarm-300 px-3 py-1.5 text-sm text-stonewarm-900">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Alert Name</span>
            <input className={inputClass} value={form.name} onChange={(event) => update('name', event.target.value)} />
            {errors.name ? <span className="mt-1 block text-xs text-clay-600">{errors.name}</span> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Alert Type</span>
            <select className={inputClass} value={form.type} onChange={(event) => update('type', event.target.value as FormState['type'])}>
              <option value="folder">Folder Budget Alert</option>
              <option value="list">List Budget Alert</option>
              <option value="custom">Custom Scoped Alert</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Description / Notes</span>
            <input
              className={inputClass}
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
              placeholder="Optional notes visible on the card"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Workspace</span>
            <select className={inputClass} value={form.teamId} onChange={(event) => handleTeamChange(event.target.value)}>
              {scopeTree.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          {form.type === 'custom' ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stonewarm-900">Custom Scope Type</span>
              <select
                className={inputClass}
                value={form.customScopeType}
                onChange={(event) => update('customScopeType', event.target.value as 'folder' | 'list')}
              >
                <option value="folder">Folder</option>
                <option value="list">List</option>
              </select>
            </label>
          ) : null}

          {(form.type === 'folder' || (form.type === 'custom' && form.customScopeType === 'folder')) && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stonewarm-900">Folder Scope</span>
              <select className={inputClass} value={form.folderId} onChange={(event) => handleFolderChange(event.target.value)}>
                <option value="">Select folder</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              {errors.folderId ? <span className="mt-1 block text-xs text-clay-600">{errors.folderId}</span> : null}
            </label>
          )}

          {(form.type === 'list' || (form.type === 'custom' && form.customScopeType === 'list')) && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stonewarm-900">List Scope</span>
              <select className={inputClass} value={form.listId} onChange={(event) => update('listId', event.target.value)}>
                <option value="">Select list</option>
                {(form.type === 'list' ? allLists : currentFolderLists).map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              {errors.listId ? <span className="mt-1 block text-xs text-clay-600">{errors.listId}</span> : null}
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Time Range</span>
            <select
              className={inputClass}
              value={form.timeRangeMode}
              onChange={(event) => update('timeRangeMode', event.target.value as FormState['timeRangeMode'])}
            >
              <option value="monthly">Monthly (current month)</option>
              <option value="custom">Custom date range</option>
              <option value="none">No date limit (cumulative)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Budget Hours</span>
            <input
              type="number"
              min={0.01}
              step="0.25"
              className={inputClass}
              value={form.budgetHours}
              onChange={(event) => update('budgetHours', event.target.value)}
            />
            {errors.budgetHours ? <span className="mt-1 block text-xs text-clay-600">{errors.budgetHours}</span> : null}
          </label>

          {form.timeRangeMode === 'custom' ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-stonewarm-900">Start Date</span>
                <input type="date" className={inputClass} value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
                {errors.startDate ? <span className="mt-1 block text-xs text-clay-600">{errors.startDate}</span> : null}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-stonewarm-900">End Date</span>
                <input type="date" className={inputClass} value={form.endDate} onChange={(event) => update('endDate', event.target.value)} />
                {errors.endDate ? <span className="mt-1 block text-xs text-clay-600">{errors.endDate}</span> : null}
              </label>
            </>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Warning Threshold (%)</span>
            <input
              type="number"
              min={0}
              step="1"
              className={inputClass}
              value={form.warningThresholdPct}
              onChange={(event) => update('warningThresholdPct', event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Critical Threshold (%)</span>
            <input
              type="number"
              min={1}
              step="1"
              className={inputClass}
              value={form.criticalThresholdPct}
              onChange={(event) => update('criticalThresholdPct', event.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Excluded Task IDs (comma separated)</span>
            <input
              className={inputClass}
              value={form.excludedTaskIds}
              onChange={(event) => update('excludedTaskIds', event.target.value)}
              placeholder="abc123, xyz789"
            />
            {errors.excludedTaskIds ? <span className="mt-1 block text-xs text-clay-600">{errors.excludedTaskIds}</span> : null}
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Include-Only Task IDs (optional)</span>
            <input
              className={inputClass}
              value={form.includeOnlyTaskIds}
              onChange={(event) => update('includeOnlyTaskIds', event.target.value)}
              placeholder="Leave blank to include all tasks"
            />
            {errors.includeOnlyTaskIds ? <span className="mt-1 block text-xs text-clay-600">{errors.includeOnlyTaskIds}</span> : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stonewarm-900">Refresh Frequency</span>
            <select
              className={inputClass}
              value={form.refreshFrequencyMinutes}
              onChange={(event) => update('refreshFrequencyMinutes', event.target.value)}
            >
              <option value="0">Manual only</option>
              <option value="5">Every 5 minutes</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every 60 minutes</option>
            </select>
          </label>

          <label className="flex items-center gap-2 pt-6 text-sm text-stonewarm-900">
            <input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} />
            Alert active
          </label>
        </div>

        {errors.form ? <p className="mt-3 text-sm text-clay-600">{errors.form}</p> : null}
        {errors.warningThresholdPct ? <p className="mt-3 text-sm text-clay-600">{errors.warningThresholdPct}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-stonewarm-300 px-4 py-2 text-sm font-medium text-stonewarm-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-xl bg-olive-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-600 disabled:opacity-60"
          >
            {saving ? 'Saving...' : initialAlert ? 'Save Changes' : 'Create Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}
