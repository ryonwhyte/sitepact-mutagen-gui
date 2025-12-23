const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const electronIsDev = require('electron-is-dev');
const fs = require('fs');

// Fix: electron-is-dev v3 is an ES module, need to access .default
const isDev = electronIsDev.default !== undefined ? electronIsDev.default : electronIsDev;

// Keep a global reference of the window object
let mainWindow = null;
let tray = null;
let backendProcess = null;

// Enable live reload for Electron in development
if (isDev) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (e) {
    // electron-reload not available in production, that's fine
    console.log('electron-reload not available (production mode)');
  }
}

// Backend management
function startBackend() {
  const backendPath = isDev
    ? path.join(__dirname, '..', '..', 'backend', 'main.py')
    : path.join(process.resourcesPath, 'backend', 'main.py');

  // Try to use venv first, install if needed, fallback to system python
  let pythonPath;
  if (isDev) {
    pythonPath = path.join(__dirname, '..', '..', 'backend', 'venv', 'bin', 'python');
  } else {
    // In production, create venv in user's home directory to avoid permission issues
    const os = require('os');
    const venvDir = path.join(os.homedir(), '.mutagen-sync-manager', 'venv');
    const venvPython = path.join(venvDir, 'bin', 'python');

    if (fs.existsSync(venvPython)) {
      pythonPath = venvPython;
    } else {
      // Try to create venv on first run
      console.log('Setting up Python environment on first run...');
      try {
        const { execSync } = require('child_process');
        // Create parent directory first
        fs.mkdirSync(path.dirname(venvDir), { recursive: true });
        execSync(`python3 -m venv "${venvDir}"`, { stdio: 'inherit' });
        execSync(`"${venvPython}" -m pip install --quiet -r "${backendPath.replace('main.py', 'requirements.txt')}"`, { stdio: 'inherit' });
        pythonPath = venvPython;
        console.log('Python environment setup complete!');
      } catch (error) {
        console.error('Failed to setup Python environment:', error);
        console.log('Falling back to system Python. You may need to install dependencies manually:');
        console.log(`  pip3 install -r "${backendPath.replace('main.py', 'requirements.txt')}"`);
        pythonPath = 'python3';
      }
    }
  }

  backendProcess = spawn(pythonPath, [backendPath]);

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });
}

// Vite dev server management (for development)
let viteProcess = null;
let vitePort = 5173; // Default port

function startViteDevServer() {
  if (!isDev) return Promise.resolve();

  return new Promise((resolve) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    viteProcess = spawn(npmCmd, ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      shell: true
    });

    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Vite: ${output}`);

      // Extract port from Vite output
      const portMatch = output.match(/http:\/\/localhost:(\d+)/);
      if (portMatch) {
        vitePort = parseInt(portMatch[1]);
        console.log(`Vite running on port ${vitePort}`);
      }

      // Wait for Vite to be ready
      if (output.includes('ready in') || output.includes('Local:')) {
        setTimeout(resolve, 1000); // Give it a second to fully start
      }
    });

    viteProcess.stderr.on('data', (data) => {
      console.error(`Vite Error: ${data}`);
    });

    viteProcess.on('close', (code) => {
      console.log(`Vite process exited with code ${code}`);
      viteProcess = null;
    });
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// Create the application window
function createWindow() {
  // Check if icon exists
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
  const iconOptions = {};
  if (fs.existsSync(iconPath) && fs.statSync(iconPath).size > 100) {
    iconOptions.icon = iconPath;
  }

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    ...iconOptions,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false, // Don't show until ready
  });

  // Load the app
  const startUrl = isDev
    ? `http://localhost:${vitePort}`
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Show notification that app is ready (skip icon if not available)
    if (Notification.isSupported()) {
      const notificationOptions = {
        title: 'Mutagen Sync Manager',
        body: 'Application is ready'
      };
      const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
      if (fs.existsSync(iconPath) && fs.statSync(iconPath).size > 100) {
        notificationOptions.icon = iconPath;
      }
      new Notification(notificationOptions).show();
    }
  });

  // DevTools available via View menu (Ctrl+Shift+I) or F12

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent window close, minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      if (process.platform === 'darwin') {
        app.dock.hide();
      }

      // Show tray balloon on first minimize
      if (tray && !tray.balloonShown) {
        tray.displayBalloon({
          title: 'Mutagen Sync Manager',
          content: 'Application minimized to tray. Click the tray icon to restore.'
        });
        tray.balloonShown = true;
      }
    }
    return false;
  });
}

// Create system tray
function createTray() {
  // Try to load tray icon, skip if not available
  try {
    const iconPath = path.join(__dirname, '..', 'public', 'tray-icon.png');

    // Check if the icon file exists and is a real image
    if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size < 100) {
      console.log('Tray icon not found or invalid, skipping tray creation');
      return;
    }

      tray = new Tray(iconPath);
  } catch (error) {
    console.log('Error creating tray:', error);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (process.platform === 'darwin') {
            app.dock.show();
          }
        }
      }
    },
    {
      label: 'Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', '/');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'New Connection',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', '/connect');
        }
      }
    },
    {
      label: 'Active Sessions',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', '/sessions');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start Daemon',
      click: () => {
        mainWindow.webContents.send('start-daemon');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Mutagen Sync Manager');
  tray.setContextMenu(contextMenu);

  // Restore window on tray icon click
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        if (process.platform === 'darwin') {
          app.dock.show();
        }
      }
    }
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('navigate', '/connect');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Import Connections',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('import-connections', result.filePaths[0]);
            }
          }
        },
        {
          label: 'Export Connections',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('export-connections');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow.webContents.send('navigate', '/')
        },
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow.webContents.send('navigate', '/connect')
        },
        {
          label: 'Active Sessions',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow.webContents.send('navigate', '/sessions')
        },
        {
          label: 'Saved Connections',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow.webContents.send('navigate', '/saved')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/ryonwhyte/sitepact-mutagen-gui');
          }
        },
        {
          label: 'Mutagen Docs',
          click: () => {
            shell.openExternal('https://mutagen.io/documentation/introduction/');
          }
        },
        { type: 'separator' },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/ryonwhyte/sitepact-mutagen-gui/issues');
          }
        },
        {
          label: 'GitHub Repository',
          click: () => {
            shell.openExternal('https://github.com/ryonwhyte/sitepact-mutagen-gui');
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Mutagen Sync Manager',
              message: 'Mutagen Sync Manager v1.2.0',
              detail: 'A modern desktop application for managing Mutagen file synchronization sessions.\n\nFeatures:\n• Easy SSH connection management\n• Real-time sync status monitoring\n• Multiple sync modes (two-way, one-way)\n• Conflict resolution\n• Import/Export connections\n\nBuilt with Electron, React, Material-UI, and FastAPI.\n\n© 2024 Ryon Whyte',
              buttons: ['OK'],
              icon: path.join(__dirname, '..', 'public', 'icon.png')
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers for native features
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-ssh-key', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'showHiddenFiles'],
    defaultPath: path.join(require('os').homedir(), '.ssh'),
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('show-notification', async (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      icon: path.join(__dirname, '..', 'public', 'icon.png')
    }).show();
  }
});

ipcMain.handle('save-export-file', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `mutagen-connections-${new Date().toISOString().split('T')[0]}.json`,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled) {
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// Helper to wait for backend to be ready
async function waitForBackend(maxAttempts = 30) {
  const http = require('http');

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:8000/', (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });
      console.log('Backend is ready!');
      return true;
    } catch (error) {
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  console.log('Backend not ready after max attempts, continuing anyway...');
  return false;
}

// App event handlers
app.whenReady().then(async () => {
  // Start backend server
  startBackend();

  // In development, start Vite dev server
  if (isDev) {
    console.log('Starting Vite dev server...');
    await startViteDevServer();
  }

  // Wait for backend to be ready
  console.log('Waiting for backend to be ready...');
  await waitForBackend();

  createWindow();
  createTray();
  createMenu();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Stop backend when app quits
  stopBackend();

  // Stop Vite dev server in development
  if (viteProcess) {
    viteProcess.kill();
    viteProcess = null;
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}