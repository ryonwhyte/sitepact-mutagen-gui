const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File/Directory selection
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectSSHKey: () => ipcRenderer.invoke('select-ssh-key'),

  // Notifications
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', { title, body }),

  // Import/Export
  saveExportFile: (data) => ipcRenderer.invoke('save-export-file', data),

  // Navigation
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, path) => callback(path));
  },

  // Import connections
  onImportConnections: (callback) => {
    ipcRenderer.on('import-connections', (event, filePath) => callback(filePath));
  },

  // Export connections
  onExportConnections: (callback) => {
    ipcRenderer.on('export-connections', () => callback());
  },

  // Daemon control
  onStartDaemon: (callback) => {
    ipcRenderer.on('start-daemon', () => callback());
  },

  // Platform info
  platform: process.platform,

  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
});