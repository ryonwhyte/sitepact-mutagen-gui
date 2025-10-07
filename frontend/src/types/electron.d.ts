// Type definitions for Electron API exposed via preload script

interface ElectronAPI {
  // File/Directory selection
  selectDirectory: () => Promise<string | null>;
  selectSSHKey: () => Promise<string | null>;

  // Notifications
  showNotification: (title: string, body: string) => Promise<void>;

  // Import/Export
  saveExportFile: (data: any) => Promise<{ success: boolean; path?: string }>;

  // Navigation
  onNavigate: (callback: (path: string) => void) => void;

  // Import connections
  onImportConnections: (callback: (filePath: string) => void) => void;

  // Export connections
  onExportConnections: (callback: () => void) => void;

  // Daemon control
  onStartDaemon: (callback: () => void) => void;

  // Platform info
  platform: NodeJS.Platform;

  // App info
  getVersion: () => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}