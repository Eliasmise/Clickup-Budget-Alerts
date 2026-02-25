import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopApi } from '../src/shared/ipc';

const api: DesktopApi = {
  getInitialData: () => ipcRenderer.invoke('app:get-initial-data'),
  testConnection: (token?: string) => ipcRenderer.invoke('auth:test-connection', token),
  saveToken: (token: string) => ipcRenderer.invoke('auth:save-token', token),
  clearToken: () => ipcRenderer.invoke('auth:clear-token'),
  getScopeTree: () => ipcRenderer.invoke('scope:get-tree'),
  createAlert: (draft) => ipcRenderer.invoke('alerts:create', draft),
  updateAlert: (id, draft) => ipcRenderer.invoke('alerts:update', id, draft),
  deleteAlert: (id) => ipcRenderer.invoke('alerts:delete', id),
  duplicateAlert: (id) => ipcRenderer.invoke('alerts:duplicate', id),
  reorderAlerts: (ids) => ipcRenderer.invoke('alerts:reorder', ids),
  refreshAlert: (id) => ipcRenderer.invoke('alerts:refresh', id),
  refreshAllAlerts: () => ipcRenderer.invoke('alerts:refresh-all'),
  updateUiPreferences: (prefs) => ipcRenderer.invoke('prefs:update', prefs),
  exportCsv: () => ipcRenderer.invoke('alerts:export-csv')
};

contextBridge.exposeInMainWorld('clickupMonitor', api);
