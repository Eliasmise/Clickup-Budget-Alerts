import { FormEvent, useMemo, useState } from 'react';

import { useBudgetMonitorStore } from '../hooks/useBudgetMonitorStore';

export function AuthPanel() {
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState<string>();
  const [lastTestOk, setLastTestOk] = useState(false);
  const [testedTeams, setTestedTeams] = useState<Array<{ id: string; name: string }>>([]);

  const testConnection = useBudgetMonitorStore((state) => state.testConnection);
  const configureToken = useBudgetMonitorStore((state) => state.configureToken);
  const authTeams = useBudgetMonitorStore((state) => state.auth.teams);

  const teamSummary = useMemo(() => {
    if (!authTeams.length) return 'No workspace loaded yet.';
    return `${authTeams.length} workspace${authTeams.length === 1 ? '' : 's'} accessible.`;
  }, [authTeams]);

  const handleTest = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!token.trim()) {
      setTestMessage('Enter a token before testing the connection.');
      return;
    }

    setTesting(true);
    setTestMessage(undefined);

    try {
      const result = await testConnection(token.trim());
      setLastTestOk(result.ok);
      setTestedTeams(result.teams);
      setTestMessage(result.ok ? result.message ?? 'Connection successful.' : result.message ?? 'Connection failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!token.trim()) {
      setTestMessage('Token is required.');
      return;
    }

    setSaving(true);
    setTestMessage(undefined);

    try {
      const result = await configureToken(token.trim());
      setLastTestOk(result.ok);
      setTestedTeams(result.teams);
      setTestMessage(result.ok ? 'Token saved and workspace loaded.' : result.message ?? 'Unable to save token.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto mt-16 w-full max-w-xl rounded-2xl border border-stonewarm-200 bg-white p-8 shadow-soft">
      <h1 className="text-2xl font-semibold text-stonewarm-900">ClickUp Budget Alert Monitor</h1>
      <p className="mt-2 text-sm text-stonewarm-700">
        Add your ClickUp API token to start calculating budget alerts across folders and lists.
      </p>

      <form onSubmit={handleTest} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stonewarm-900">ClickUp API Token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="pk_..."
            className="w-full rounded-xl border border-stonewarm-200 bg-sand-50 px-3 py-2 text-sm text-stonewarm-900 outline-none ring-clay-500 transition focus:ring-2"
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={testing || saving}
            className="rounded-xl border border-stonewarm-300 px-4 py-2 text-sm font-medium text-stonewarm-900 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || testing}
            className="rounded-xl bg-olive-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Token'}
          </button>
          {lastTestOk ? <span className="self-center text-xs text-moss">Connection verified</span> : null}
        </div>
      </form>

      <div className="mt-4 rounded-xl bg-sand-100 p-3 text-xs text-stonewarm-700">
        <p>{testMessage ?? 'No connection test run yet.'}</p>
        <p className="mt-1">{teamSummary}</p>
        {(testedTeams.length > 0 || authTeams.length > 0) ? (
          <p className="mt-1 text-[11px] text-stonewarm-700">
            Teams: {(testedTeams.length > 0 ? testedTeams : authTeams).map((team) => team.name).join(', ')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
