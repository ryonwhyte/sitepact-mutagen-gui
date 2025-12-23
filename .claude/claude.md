# Mutagen Sync Manager

## Project Overview

This is a desktop application for managing Mutagen file synchronization sessions. It provides a graphical interface for creating, managing, and monitoring bidirectional file sync between local and remote systems via SSH.

## Architecture

### Frontend (React + Electron)
- **Location**: `frontend/`
- **Framework**: React with TypeScript
- **UI**: Material-UI (MUI)
- **State Management**: TanStack Query (React Query)
- **Build**: Vite + Electron Builder

### Backend (Python FastAPI)
- **Location**: `backend/`
- **Framework**: FastAPI
- **Database**: SQLite with SQLAlchemy
- **Core**: Mutagen CLI wrapper

### Desktop App
- **Platform**: Electron
- **Target**: Linux (.deb, AppImage)
- **Build Command**: `npm run dist:linux` (from `frontend/`)

## Key Features

1. **Connection Management**
   - Save and edit SSH connection configurations
   - SSH key authentication with automatic permission fixing
   - Quick connect from saved connections
   - Import/Export connections as JSON

2. **Session Monitoring**
   - Real-time session status via WebSocket
   - View active sync sessions
   - Pause, resume, flush, and terminate sessions

3. **Conflict Resolution**
   - Automatic conflict detection
   - Dialog to choose local or remote version
   - Recreates session with one-way-replica mode to resolve

4. **SSH Configuration**
   - Automatic SSH config file management
   - Host aliases for each connection
   - Auto-fixes key permissions (chmod 0600)
   - Attempts ssh-agent integration

## Project Structure

```
mutagen-sync-manager/
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ConnectionForm.tsx
│   │   │   ├── SessionList.tsx
│   │   │   ├── SavedConnections.tsx
│   │   │   ├── ConflictResolutionDialog.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── api/
│   │   │   └── client.ts    # API client + WebSocket
│   │   └── App.tsx
│   ├── electron/
│   │   └── main.js          # Electron main process
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── main.py              # FastAPI app + Mutagen wrapper
│   ├── requirements.txt
│   └── mutagen_sync.db      # SQLite database
├── builds/                  # Build artifacts (.deb, AppImage)
├── start-desktop.sh         # Startup script
└── README.md
```

## Development

### Start Development Server
```bash
./start-desktop.sh
```

This script:
1. Activates Python venv and starts FastAPI backend
2. Starts Vite dev server
3. Launches Electron in development mode

### Build Production
```bash
cd frontend
npm run dist:linux
```

Outputs:
- `.deb` package
- AppImage

Build artifacts are created in `frontend/dist/` and copied to `builds/`

## API Endpoints

### Connections
- `GET /api/connections` - List saved connections
- `GET /api/connections/{id}` - Get connection details
- `POST /api/connections` - Create connection
- `PUT /api/connections/{id}` - Update connection
- `DELETE /api/connections/{id}` - Delete connection
- `POST /api/connections/{id}/connect` - Quick connect

### Sessions
- `GET /api/sessions` - List active Mutagen sessions
- `POST /api/sessions/create` - Create new session
- `POST /api/sessions/action` - Perform action (pause/resume/flush/terminate)
- `GET /api/sessions/{name}/conflicts` - Get session conflicts
- `POST /api/sessions/{name}/resolve-conflicts` - Resolve conflicts

### Daemon
- `GET /api/daemon/status` - Check Mutagen daemon status
- `POST /api/daemon/start` - Start daemon

### Import/Export
- `POST /api/export` - Export connections as JSON
- `POST /api/import` - Import connections from JSON

## SSH Key Handling

The app automatically:
1. Creates SSH config entries with host aliases (e.g., `mutagen-{connection-name}`)
2. Fixes key permissions to 0600 if needed
3. Attempts to add key to ssh-agent (non-interactive)

SSH config format:
```
# Mutagen Sync Manager: {connection-name}
Host mutagen-{connection-name}
  HostName {host}
  User {username}
  Port {port}
  IdentityFile {ssh_key_path}
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
```

## Conflict Resolution

When Mutagen detects file conflicts:
1. Frontend polls `/api/sessions/{name}/conflicts`
2. If conflicts found, displays `ConflictResolutionDialog`
3. User chooses "Keep Local" (alpha) or "Keep Remote" (beta)
4. Backend terminates session and recreates with `--mode=one-way-replica`

This forces the chosen version to overwrite the other.

## Database Schema

**connections** table:
- id (primary key)
- name
- host
- port
- username
- remote_path
- local_path
- ssh_key_path (optional)
- sync_mode (default: "two-way-safe")
- tags (JSON array)
- is_favorite (boolean)
- created_at
- last_used

## WebSocket Events

Real-time updates via `ws://localhost:8000/ws`:
- Session status changes
- Daemon status updates

## Common Issues

### SSH Key Passphrases
Keys with passphrases may show one-time prompts but will work after canceling. The SSH config allows connection to succeed.

### Build Size
`.deb` and AppImage files are ~100MB+ and excluded from git via `.gitignore`

## Tech Stack

**Frontend:**
- React 18
- TypeScript
- Material-UI v5
- TanStack Query
- React Router
- Vite
- Electron

**Backend:**
- Python 3.12+
- FastAPI
- SQLAlchemy
- asyncssh
- Mutagen CLI

**Desktop:**
- Electron
- electron-builder
