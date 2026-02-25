import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

import type { AlertConfig, PersistedState, UiPreferences } from '../../src/shared/types';

const STATE_FILE_NAME = 'clickup-budget-monitor.json';
const STATE_VERSION = 1;

const defaultUiPreferences = (): UiPreferences => ({
  search: '',
  statusFilter: 'all',
  sortBy: 'percentUsed'
});

const defaultState = (): PersistedState => ({
  version: STATE_VERSION,
  alerts: [],
  uiPreferences: defaultUiPreferences()
});

const sortByOrder = (alerts: AlertConfig[]): AlertConfig[] =>
  [...alerts].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

const encryptToken = (token: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    return `enc:${encrypted.toString('base64')}`;
  }
  return `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
};

const decryptToken = (encoded: string): string => {
  if (encoded.startsWith('enc:')) {
    const body = encoded.slice(4);
    const decrypted = safeStorage.decryptString(Buffer.from(body, 'base64'));
    return decrypted;
  }
  if (encoded.startsWith('plain:')) {
    return Buffer.from(encoded.slice(6), 'base64').toString('utf8');
  }
  return '';
};

export class LocalStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, STATE_FILE_NAME);
  }

  private async ensureStateFile(): Promise<void> {
    try {
      await fs.access(this.filePath);
    } catch {
      await this.writeState(defaultState());
    }
  }

  private normalizeState(state: PersistedState): PersistedState {
    return {
      version: STATE_VERSION,
      encryptedToken: state.encryptedToken,
      alerts: sortByOrder(state.alerts ?? []),
      uiPreferences: {
        ...defaultUiPreferences(),
        ...(state.uiPreferences ?? {})
      }
    };
  }

  async readState(): Promise<PersistedState> {
    await this.ensureStateFile();
    const content = await fs.readFile(this.filePath, 'utf8');

    try {
      const parsed = JSON.parse(content) as PersistedState;
      return this.normalizeState(parsed);
    } catch {
      const cleanState = defaultState();
      await this.writeState(cleanState);
      return cleanState;
    }
  }

  async writeState(state: PersistedState): Promise<void> {
    const normalized = this.normalizeState(state);
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(normalized, null, 2), 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }

  async getAlerts(): Promise<AlertConfig[]> {
    const state = await this.readState();
    return state.alerts;
  }

  async setAlerts(alerts: AlertConfig[]): Promise<AlertConfig[]> {
    const state = await this.readState();
    const nextAlerts = sortByOrder(alerts);
    await this.writeState({ ...state, alerts: nextAlerts });
    return nextAlerts;
  }

  async hasToken(): Promise<boolean> {
    const state = await this.readState();
    return Boolean(state.encryptedToken);
  }

  async getToken(): Promise<string | undefined> {
    const state = await this.readState();
    if (!state.encryptedToken) return undefined;

    try {
      const token = decryptToken(state.encryptedToken);
      return token || undefined;
    } catch {
      return undefined;
    }
  }

  async setToken(token: string): Promise<void> {
    const state = await this.readState();
    await this.writeState({ ...state, encryptedToken: encryptToken(token.trim()) });
  }

  async clearToken(): Promise<void> {
    const state = await this.readState();
    await this.writeState({ ...state, encryptedToken: undefined });
  }

  async getUiPreferences(): Promise<UiPreferences> {
    const state = await this.readState();
    return state.uiPreferences;
  }

  async setUiPreferences(partial: Partial<UiPreferences>): Promise<UiPreferences> {
    const state = await this.readState();
    const nextPrefs: UiPreferences = {
      ...defaultUiPreferences(),
      ...state.uiPreferences,
      ...partial
    };
    await this.writeState({ ...state, uiPreferences: nextPrefs });
    return nextPrefs;
  }
}
