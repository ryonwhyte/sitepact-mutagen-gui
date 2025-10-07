# Sitepact Mutagen GUI

A modern desktop application for managing Mutagen file synchronization sessions with an intuitive graphical interface.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-green)
![Python](https://img.shields.io/badge/python-%3E%3D3.8-blue)

## Overview

Sitepact Mutagen GUI provides a user-friendly desktop interface for [Mutagen](https://mutagen.io/), a high-performance file synchronization tool. It simplifies the process of setting up and managing file sync sessions between your local machine and remote servers.

## ✨ Key Features

### Desktop Application
- 🖥️ **Native Desktop Experience** - Standalone app with system tray integration
- 📁 **Native File Dialogs** - OS-native file and folder selection
- 🔔 **Desktop Notifications** - Real-time sync status updates
- ⌨️ **Global Shortcuts** - Quick access to common actions

### Connection Management
- 🚀 **Easy Setup** - Intuitive form-based connection creation
- 🔄 **Smart Initial Sync** - Choose to download, upload, or skip initial sync with rsync
- 🔑 **SSH Key Management** - Auto-detection of SSH keys with custom key support
- 💾 **Save & Reuse** - Store frequently used connections
- 🏷️ **Tagging System** - Organize connections with custom tags
- 📦 **Import/Export** - Transfer connections between machines

### Synchronization
- 🎯 **Multiple Sync Modes**:
  - Two-way Sync (Safe) - Bidirectional with conflict protection
  - Two-way Sync (Auto-resolve) - Automatic conflict resolution
  - One-way Upload - Local to remote synchronization
  - One-way Download - Remote to local mirroring
- 📊 **Real-time Monitoring** - Live status updates via WebSockets
- 🎮 **Session Control** - Pause, resume, flush, or terminate with one click

## 🔧 Prerequisites

- **Node.js** v22.0.0 or higher
- **Python** 3.8 or higher
- **Mutagen** - [Installation Guide](https://mutagen.io/documentation/introduction/installation)
- **rsync** (for initial sync functionality)
- **SSH** client configured for remote access

## 📦 Installation

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/sitepact-mutagen-gui.git
cd sitepact-mutagen-gui
```

2. Run the setup script:
```bash
./start-desktop.sh
```

This will automatically:
- Check Node.js version (uses nvm if available)
- Install frontend dependencies
- Set up Python virtual environment
- Install backend dependencies
- Launch the desktop application

### Manual Setup

If you prefer manual setup:

1. **Backend Setup:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. **Frontend Setup:**
```bash
cd frontend
npm install
```

3. **Start the Application:**
```bash
cd frontend
npm run electron-dev
```

## 🚀 Usage

### Creating Your First Connection

1. Click **"New Connection"** in the sidebar or dashboard
2. Fill in your connection details:
   - **Connection Name**: A friendly identifier
   - **Host**: Remote server address
   - **Username**: SSH username
   - **Port**: SSH port (default: 22)
   - **SSH Key**: Select from detected keys or browse
   - **Paths**: Remote and local directories to sync
   - **Sync Mode**: Choose synchronization behavior

3. Click **"Create & Connect"**
4. **Initial Sync Dialog** appears:
   - 📥 **Download from Remote**: Pull all files from server
   - 📤 **Upload to Remote**: Push local files to server
   - ⏭️ **Skip Initial Sync**: Start Mutagen without initial transfer

### Managing Sessions

#### Dashboard
- Overview of all active sessions
- Quick statistics (Active, Connected, Total)
- One-click session creation

#### Active Sessions
- Detailed session information
- Real-time connection status
- Individual session controls:
  - ⏸️ Pause/Resume
  - 🔄 Flush changes
  - 🛑 Terminate

#### Saved Connections
- Quick connect to saved configurations
- Edit or delete saved connections
- Bulk import/export functionality

### SSH Configuration

The application automatically detects SSH keys from:
- `~/.ssh/id_rsa`
- `~/.ssh/id_ed25519`
- `~/.ssh/id_ecdsa`
- Other private keys in `~/.ssh/`

Additionally:
- Use SSH agent for key management
- Browse for custom key files
- Fallback to password authentication

## 🏗️ Development

### Tech Stack

- **Frontend**: React, TypeScript, Material-UI, Electron
- **Backend**: FastAPI, SQLAlchemy, asyncio
- **Build Tools**: Vite, electron-builder
- **State Management**: React Query (TanStack Query)
- **Real-time**: WebSockets

### Project Structure

```
sitepact-mutagen-gui/
├── backend/
│   ├── main.py              # FastAPI server & Mutagen wrapper
│   ├── requirements.txt     # Python dependencies
│   └── mutagen_gui.db      # SQLite database
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ConnectionForm.tsx
│   │   │   ├── SessionList.tsx
│   │   │   ├── SavedConnections.tsx
│   │   │   └── InitialSyncDialog.tsx
│   │   └── api/           # API client
│   ├── electron/          # Electron main process
│   │   ├── main.js       # Window management & system tray
│   │   └── preload.js    # IPC bridge
│   └── package.json
├── start-desktop.sh       # Quick start script
└── README.md
```

### API Documentation

Interactive API documentation available at:
```
http://localhost:8000/docs
```

### Development Mode

Run with hot reload:

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
python main.py

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Electron
cd frontend
npm run electron-dev
```

## 📦 Building for Production

### Create Distributable Packages

```bash
cd frontend

# Linux (AppImage, deb, rpm)
npm run dist:linux

# macOS (dmg, pkg)
npm run dist:mac

# Windows (exe installer)
npm run dist:win

# All platforms
npm run dist
```

Distributables will be created in `frontend/dist-electron/`

## 🐛 Troubleshooting

### Common Issues

#### Mutagen Not Found
```bash
# Verify installation
mutagen version

# Add to PATH if needed
export PATH=$PATH:/path/to/mutagen
```

#### SSH Connection Fails
```bash
# Test SSH connection
ssh user@host

# Check key permissions
chmod 600 ~/.ssh/id_rsa
```

#### Port Already in Use
```bash
# Kill existing processes
pkill -f "python.*main.py"
pkill -f electron
```

#### Sync Not Working
- Check session status in Active Sessions
- Review logs: `mutagen sync list -l`
- Verify file permissions on both systems

### Debug Mode

View console output with DevTools:
- Press `Ctrl+Shift+I` (Linux/Windows)
- Press `Cmd+Option+I` (macOS)

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Mutagen](https://mutagen.io/) - High-performance file synchronization
- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- [React](https://reactjs.org/) - User interface library
- [Material-UI](https://mui.com/) - React component library
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework

## 📞 Support

For issues, questions, or feature requests, please [open an issue](https://github.com/yourusername/sitepact-mutagen-gui/issues) on GitHub.

---

**Note**: This application requires Mutagen to be installed separately. Sitepact Mutagen GUI provides a graphical interface for Mutagen's functionality.