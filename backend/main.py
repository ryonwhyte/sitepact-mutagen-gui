"""
Mutagen GUI Backend API
FastAPI application for managing Mutagen sync sessions
"""

import asyncio
import json
import logging
import os
import subprocess
import shlex
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import aiofiles
import asyncssh
from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session as DBSession
from contextlib import contextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Mutagen GUI API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:*",  # Allow any localhost port for Electron
        "http://127.0.0.1:*",
    ],
    allow_origin_regex=r"http://localhost:\d+",  # Allow any localhost port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
DATABASE_URL = "sqlite:///./mutagen_gui.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class SavedConnection(Base):
    __tablename__ = "saved_connections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    host = Column(String)
    port = Column(Integer, default=22)
    username = Column(String)
    remote_path = Column(String)
    local_path = Column(String)
    ssh_key_path = Column(String, nullable=True)
    sync_mode = Column(String, default="one-way-safe")
    created_at = Column(DateTime, default=datetime.now)
    last_used = Column(DateTime, nullable=True)
    is_favorite = Column(Boolean, default=False)
    tags = Column(Text, nullable=True)  # JSON array of tags

Base.metadata.create_all(bind=engine)

# Pydantic models
class ConnectionConfig(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str
    remote_path: str
    local_path: str
    ssh_key_path: Optional[str] = None
    sync_mode: str = "two-way-safe"
    tags: List[str] = []
    initial_sync_direction: Optional[str] = None  # 'download', 'upload', or 'skip'

class SessionAction(BaseModel):
    session_name: str
    action: str  # resume, pause, flush, terminate

class SSHKey(BaseModel):
    name: str
    path: str
    fingerprint: Optional[str] = None

class MutagenSession(BaseModel):
    name: str
    identifier: str
    status: str
    alpha_url: str
    alpha_connected: bool
    beta_url: str
    beta_connected: bool

# Database dependency
@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Mutagen wrapper class
class MutagenManager:
    """Wrapper for Mutagen CLI operations"""

    def __init__(self):
        self.mutagen_bin = self._find_mutagen()
        self.active_monitors = {}

    def _find_mutagen(self) -> Optional[str]:
        """Find mutagen binary in PATH"""
        paths = [
            "/home/linuxbrew/.linuxbrew/bin/mutagen",
            "/usr/local/bin/mutagen",
            "/usr/bin/mutagen"
        ]
        for path in paths:
            if Path(path).exists():
                return path

        # Try to find in PATH
        result = subprocess.run(["which", "mutagen"], capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip()

        logger.warning("Mutagen binary not found in system")
        return None

    def is_mutagen_installed(self) -> bool:
        """Check if Mutagen is installed"""
        return self.mutagen_bin is not None

    async def run_command(self, *args: str, timeout: int = 60, env: Optional[Dict[str, str]] = None) -> str:
        """Execute mutagen command"""
        if not self.mutagen_bin:
            raise HTTPException(
                status_code=503,
                detail="Mutagen is not installed. Please install Mutagen first: https://mutagen.io/documentation/introduction/installation"
            )
        cmd = [self.mutagen_bin] + list(args)
        logger.info(f"Running command: {' '.join(cmd)}")

        # Merge environment variables with current environment
        cmd_env = os.environ.copy()
        if env:
            cmd_env.update(env)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=cmd_env
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

            if proc.returncode != 0:
                error_msg = stderr.decode() if stderr else stdout.decode()
                raise RuntimeError(f"Command failed: {error_msg}")

            return stdout.decode()
        except asyncio.TimeoutError:
            raise RuntimeError(f"Command timed out after {timeout} seconds")

    async def list_sessions(self) -> List[Dict[str, Any]]:
        """List all mutagen sync sessions"""
        output = await self.run_command("sync", "list")
        return self._parse_sessions(output)

    def _parse_sessions(self, output: str) -> List[Dict[str, Any]]:
        """Parse mutagen list output"""
        sessions = []
        current_session = None

        for line in output.split('\n'):
            line = line.strip()

            if line.startswith("Name:"):
                if current_session:
                    sessions.append(current_session)
                current_session = {
                    "name": line.split(":", 1)[1].strip(),
                    "alpha": {},
                    "beta": {}
                }
            elif current_session:
                if line.startswith("Identifier:"):
                    current_session["identifier"] = line.split(":", 1)[1].strip()
                elif line.startswith("Status:"):
                    current_session["status"] = line.split(":", 1)[1].strip()
                elif line.startswith("Alpha:"):
                    current_endpoint = "alpha"
                elif line.startswith("Beta:"):
                    current_endpoint = "beta"
                elif "URL:" in line and "current_endpoint" in locals():
                    current_session[current_endpoint]["url"] = line.split(":", 1)[1].strip()
                elif "Connected:" in line and "current_endpoint" in locals():
                    current_session[current_endpoint]["connected"] = "Yes" in line

        if current_session:
            sessions.append(current_session)

        return sessions

    async def perform_initial_sync(self, config: ConnectionConfig, direction: str) -> str:
        """Perform initial sync using rsync before creating Mutagen session"""
        if direction == 'skip':
            return "Skipped initial sync"

        # Create local directory if it doesn't exist
        Path(config.local_path).mkdir(parents=True, exist_ok=True)

        # Build rsync command
        remote_url = f"{config.username}@{config.host}:{config.remote_path}"

        # Build SSH command for rsync
        ssh_cmd = f"ssh -p {config.port}"
        if config.ssh_key_path:
            ssh_cmd += f" -i {config.ssh_key_path}"
        # Add options to bypass strict host checking
        ssh_cmd += " -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

        rsync_args = [
            "rsync", "-avz", "--progress",
            "-e", ssh_cmd
        ]

        if direction == 'download':
            # Download from remote to local
            rsync_args.extend([f"{remote_url}/", config.local_path])
        elif direction == 'upload':
            # Upload from local to remote
            rsync_args.extend([f"{config.local_path}/", remote_url])

        # Run rsync
        try:
            proc = await asyncio.create_subprocess_exec(
                *rsync_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)

            if proc.returncode != 0:
                error_msg = stderr.decode() if stderr else stdout.decode()
                raise RuntimeError(f"Rsync failed: {error_msg}")

            return stdout.decode()
        except asyncio.TimeoutError:
            raise RuntimeError("Initial sync timed out after 5 minutes")

    def sanitize_name(self, name: str) -> str:
        """Sanitize connection name for use in Mutagen session names and SSH config"""
        # Replace spaces and special characters with hyphens
        # Mutagen session names don't allow spaces
        return name.replace(' ', '-').replace('_', '-')

    async def create_session(self, config: ConnectionConfig) -> str:
        """Create a new mutagen sync session"""
        # Perform initial sync if requested
        if config.initial_sync_direction and config.initial_sync_direction != 'skip':
            await self.perform_initial_sync(config, config.initial_sync_direction)

        # Create local directory if it doesn't exist
        Path(config.local_path).mkdir(parents=True, exist_ok=True)

        # Sanitize the session name (Mutagen doesn't allow spaces)
        session_name = self.sanitize_name(config.name)

        # Build command arguments - keep it simple like the old script
        args = [
            "sync", "create",
            f"--name={session_name}",
            f"--mode={config.sync_mode}",
            "--default-file-mode=0644",
            "--default-directory-mode=0755"
        ]

        # Determine remote URL - will be modified if SSH key is used
        remote_url = None

        # If SSH key is specified, ensure SSH config is set up
        # This is the most reliable approach for Mutagen
        if config.ssh_key_path:
            # Fix permissions if needed (SSH requires 600)
            key_path = Path(config.ssh_key_path)
            if key_path.exists():
                current_perms = key_path.stat().st_mode & 0o777
                if current_perms != 0o600:
                    logger.info(f"Fixing SSH key permissions from {oct(current_perms)} to 0600")
                    key_path.chmod(0o600)

                # Add or update SSH config entry for this host
                ssh_config_path = Path.home() / '.ssh' / 'config'
                ssh_config_path.parent.mkdir(parents=True, exist_ok=True)

                # Create a unique host alias for this connection (sanitized)
                host_alias = f"mutagen-{session_name}"

                # Read existing config
                existing_config = ""
                if ssh_config_path.exists():
                    existing_config = ssh_config_path.read_text()

                # Check if entry already exists
                entry_marker = f"# Mutagen GUI: {config.name}"
                if entry_marker not in existing_config:
                    # Append new entry
                    new_entry = f"\n{entry_marker}\nHost {host_alias}\n"
                    new_entry += f"  HostName {config.host}\n"
                    new_entry += f"  User {config.username}\n"
                    new_entry += f"  Port {config.port}\n"
                    new_entry += f"  IdentityFile {config.ssh_key_path}\n"
                    new_entry += f"  StrictHostKeyChecking no\n"
                    new_entry += f"  UserKnownHostsFile /dev/null\n\n"

                    with ssh_config_path.open('a') as f:
                        f.write(new_entry)
                    logger.info(f"Added SSH config entry for {host_alias}")

                # Use the host alias in the remote URL
                remote_url = f"{config.username}@{host_alias}:{config.remote_path}"

                # Try to add key to ssh-agent (if it's running and key isn't encrypted)
                # This helps avoid passphrase prompts for keys without passphrases
                try:
                    # Check if agent is running
                    agent_check = subprocess.run(['ssh-add', '-l'],
                                                capture_output=True,
                                                check=False)
                    if agent_check.returncode == 0:
                        # Try to add the key (will only work for unencrypted keys)
                        subprocess.run(['ssh-add', config.ssh_key_path],
                                     capture_output=True,
                                     stdin=subprocess.DEVNULL,  # Don't prompt for passphrase
                                     check=False,
                                     timeout=2)
                        logger.info(f"Attempted to add key to ssh-agent: {config.ssh_key_path}")
                except Exception as e:
                    logger.debug(f"Could not add key to agent (this is normal): {e}")

        # If no SSH key, construct remote URL with port if needed
        if not remote_url:
            if config.port and config.port != 22:
                remote_url = f"{config.username}@{config.host}:{config.port}:{config.remote_path}"
            else:
                remote_url = f"{config.username}@{config.host}:{config.remote_path}"

        # Determine source and destination based on sync mode
        # For two-way modes, order doesn't matter much
        # For one-way modes, we need to be careful
        if config.sync_mode == "one-way-replica":
            # One-way replica: source overwrites destination
            args.extend([remote_url, config.local_path])  # Remote -> Local
        else:
            # Default: local first (works for two-way and one-way-safe)
            args.extend([config.local_path, remote_url])

        # Run the command - Mutagen will use system SSH config and agent
        result = await self.run_command(*args, timeout=120)
        return result

    async def perform_action(self, session_name: str, action: str) -> str:
        """Perform an action on a session"""
        valid_actions = ["resume", "pause", "flush", "terminate", "reset"]

        if action not in valid_actions:
            raise ValueError(f"Invalid action: {action}")

        result = await self.run_command("sync", action, session_name)
        return result

    async def daemon_status(self) -> str:
        """Check daemon status"""
        try:
            output = await self.run_command("daemon", "list")
            if "running" in output.lower():
                return "running"
            return "stopped"
        except:
            return "stopped"

    async def start_daemon(self) -> None:
        """Start mutagen daemon"""
        await self.run_command("daemon", "start")

# Global Mutagen manager instance
mutagen_mgr = MutagenManager()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# API Routes
@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Mutagen GUI API", "version": "1.0.0"}

@app.get("/api/ssh-keys")
async def list_ssh_keys() -> List[SSHKey]:
    """List available SSH keys"""
    ssh_dir = Path.home() / ".ssh"
    keys = []

    if ssh_dir.exists():
        for file in ssh_dir.iterdir():
            if file.is_file() and not file.name.endswith('.pub'):
                # Check if it looks like a private key
                try:
                    with open(file, 'r') as f:
                        first_line = f.readline()
                        if 'PRIVATE KEY' in first_line or file.name.startswith('id_'):
                            keys.append(SSHKey(
                                name=file.name,
                                path=str(file)
                            ))
                except:
                    pass

    return keys

@app.get("/api/system/mutagen-installed")
async def check_mutagen_installed():
    """Check if Mutagen is installed"""
    installed = mutagen_mgr.is_mutagen_installed()
    return {
        "installed": installed,
        "path": mutagen_mgr.mutagen_bin if installed else None,
        "install_url": "https://mutagen.io/documentation/introduction/installation"
    }

@app.get("/api/daemon/status")
async def get_daemon_status():
    """Get daemon status"""
    status = await mutagen_mgr.daemon_status()
    return {"status": status}

@app.post("/api/daemon/start")
async def start_daemon():
    """Start daemon"""
    await mutagen_mgr.start_daemon()
    return {"message": "Daemon started"}

@app.get("/api/sessions")
async def list_sessions():
    """List all sync sessions"""
    try:
        # Ensure daemon is running first
        daemon_status = await mutagen_mgr.daemon_status()
        if daemon_status != "Running":
            logger.info("Daemon not running, starting it...")
            await mutagen_mgr.start_daemon()
            # Give daemon a moment to start
            await asyncio.sleep(1)

        sessions = await mutagen_mgr.list_sessions()
        return sessions
    except RuntimeError as e:
        if "timed out" in str(e).lower():
            # Return empty list on timeout rather than failing
            logger.warning(f"Session list timed out (daemon may be starting): {e}")
            return []
        raise

@app.post("/api/sessions/create")
async def create_session(config: ConnectionConfig):
    """Create a new sync session"""
    try:
        # Save or update connection in database
        with get_db() as db:
            # Check if connection already exists
            existing = db.query(SavedConnection).filter(SavedConnection.name == config.name).first()

            if existing:
                # Update existing connection
                existing.host = config.host
                existing.port = config.port
                existing.username = config.username
                existing.remote_path = config.remote_path
                existing.local_path = config.local_path
                existing.ssh_key_path = config.ssh_key_path
                existing.sync_mode = config.sync_mode
                existing.tags = json.dumps(config.tags) if config.tags else None
                existing.last_used = datetime.now()
            else:
                # Create new connection
                saved = SavedConnection(
                    name=config.name,
                    host=config.host,
                    port=config.port,
                    username=config.username,
                    remote_path=config.remote_path,
                    local_path=config.local_path,
                    ssh_key_path=config.ssh_key_path,
                    sync_mode=config.sync_mode,
                    tags=json.dumps(config.tags) if config.tags else None
                )
                db.add(saved)

            db.commit()

        # Create mutagen session
        result = await mutagen_mgr.create_session(config)

        # Broadcast update
        await manager.broadcast({"type": "session_created", "name": config.name})

        return {"message": "Session created", "result": result}
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/action")
async def perform_session_action(action: SessionAction):
    """Perform an action on a session"""
    try:
        result = await mutagen_mgr.perform_action(action.session_name, action.action)

        # Broadcast update
        await manager.broadcast({
            "type": "session_action",
            "session": action.session_name,
            "action": action.action
        })

        return {"message": f"Action {action.action} performed", "result": result}
    except Exception as e:
        logger.error(f"Failed to perform action: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_name}/conflicts")
async def get_session_conflicts(session_name: str):
    """Get conflicts for a session"""
    try:
        # Get detailed session info with conflicts
        result = await mutagen_mgr.run_command("sync", "list", "--long", session_name)

        # Parse conflicts from output
        conflicts = []
        lines = result.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if line.startswith('(alpha)') or line.startswith('(beta)'):
                # Extract file path
                parts = line.split()
                if len(parts) >= 2:
                    path = parts[1]
                    # Check if we already have this conflict
                    if not any(c['path'] == path for c in conflicts):
                        conflicts.append({'path': path})
            i += 1

        return {"conflicts": conflicts, "count": len(conflicts)}
    except Exception as e:
        logger.error(f"Failed to get conflicts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_name}/resolve-conflicts")
async def resolve_conflicts(session_name: str, resolution: dict):
    """Resolve session conflicts by recreating with appropriate mode"""
    try:
        winner = resolution.get('winner', 'alpha')  # 'alpha' for local, 'beta' for remote

        if winner not in ['alpha', 'beta']:
            raise HTTPException(status_code=400, detail="Winner must be 'alpha' or 'beta'")

        # Get session info first
        sessions = await mutagen_mgr.list_sessions()
        session = next((s for s in sessions if s["name"] == session_name), None)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Terminate the existing session
        await mutagen_mgr.run_command("sync", "terminate", session_name)
        logger.info(f"Terminated session {session_name}")

        # Extract alpha and beta URLs
        alpha_url = session["alpha"]["url"]
        beta_url = session["beta"]["url"]

        # Recreate with one-way-replica mode to force the winner's version
        if winner == 'alpha':
            # Local → Remote (force local to override remote)
            result = await mutagen_mgr.run_command(
                "sync", "create",
                f"--name={session_name}",
                "--mode=one-way-replica",
                "--default-file-mode=0644",
                "--default-directory-mode=0755",
                alpha_url, beta_url
            )
        else:
            # Remote → Local (force remote to override local)
            result = await mutagen_mgr.run_command(
                "sync", "create",
                f"--name={session_name}",
                "--mode=one-way-replica",
                "--default-file-mode=0644",
                "--default-directory-mode=0755",
                beta_url, alpha_url
            )

        logger.info(f"Recreated session {session_name} with {winner} as winner")

        return {"message": f"Conflicts resolved - {winner} version will be used", "result": result}
    except Exception as e:
        logger.error(f"Failed to resolve conflicts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/connections")
async def list_saved_connections():
    """List saved connections"""
    with get_db() as db:
        connections = db.query(SavedConnection).all()
        return [
            {
                "id": c.id,
                "name": c.name,
                "host": c.host,
                "port": c.port,
                "username": c.username,
                "remote_path": c.remote_path,
                "local_path": c.local_path,
                "ssh_key_path": c.ssh_key_path,
                "sync_mode": c.sync_mode,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "last_used": c.last_used.isoformat() if c.last_used else None,
                "is_favorite": c.is_favorite,
                "tags": json.loads(c.tags) if c.tags else []
            }
            for c in connections
        ]

@app.delete("/api/connections/{connection_id}")
async def delete_connection(connection_id: int):
    """Delete a saved connection"""
    with get_db() as db:
        connection = db.query(SavedConnection).filter(SavedConnection.id == connection_id).first()
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")

        db.delete(connection)
        db.commit()

        return {"message": "Connection deleted"}

@app.post("/api/connections/{connection_id}/connect")
async def quick_connect(connection_id: int):
    """Quick connect using saved connection"""
    with get_db() as db:
        connection = db.query(SavedConnection).filter(SavedConnection.id == connection_id).first()
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")

        # Update last used
        connection.last_used = datetime.now()
        db.commit()

        # Create config from saved connection
        config = ConnectionConfig(
            name=connection.name,
            host=connection.host,
            port=connection.port,
            username=connection.username,
            remote_path=connection.remote_path,
            local_path=connection.local_path,
            ssh_key_path=connection.ssh_key_path,
            sync_mode=connection.sync_mode,
            tags=json.loads(connection.tags) if connection.tags else []
        )

        # Check if session already exists (use sanitized name)
        session_name = mutagen_mgr.sanitize_name(config.name)
        sessions = await mutagen_mgr.list_sessions()
        existing = [s for s in sessions if s["name"] == session_name]

        if existing:
            # Resume existing session
            await mutagen_mgr.perform_action(session_name, "resume")
            return {"message": "Session resumed", "name": session_name}
        else:
            # Create new session
            result = await mutagen_mgr.create_session(config)
            return {"message": "Session created", "name": session_name, "result": result}

@app.get("/api/connections/{connection_id}")
async def get_connection(connection_id: int):
    """Get a single connection by ID"""
    with get_db() as db:
        connection = db.query(SavedConnection).filter(SavedConnection.id == connection_id).first()
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")

        return {
            "id": connection.id,
            "name": connection.name,
            "host": connection.host,
            "port": connection.port,
            "username": connection.username,
            "remote_path": connection.remote_path,
            "local_path": connection.local_path,
            "ssh_key_path": connection.ssh_key_path,
            "sync_mode": connection.sync_mode,
            "tags": json.loads(connection.tags) if connection.tags else [],
            "created_at": connection.created_at.isoformat() if connection.created_at else None,
            "last_used": connection.last_used.isoformat() if connection.last_used else None,
            "is_favorite": connection.is_favorite
        }

@app.post("/api/connections/{connection_id}/duplicate")
async def duplicate_connection(connection_id: int):
    """Duplicate a saved connection"""
    with get_db() as db:
        connection = db.query(SavedConnection).filter(SavedConnection.id == connection_id).first()
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")

        # Create a new connection with " (Copy)" appended to name
        base_name = f"{connection.name} (Copy)"
        copy_name = base_name
        counter = 1

        # Ensure unique name
        while db.query(SavedConnection).filter(SavedConnection.name == copy_name).first():
            counter += 1
            copy_name = f"{base_name} {counter}"

        new_connection = SavedConnection(
            name=copy_name,
            host=connection.host,
            port=connection.port,
            username=connection.username,
            remote_path=connection.remote_path,
            local_path=connection.local_path,
            ssh_key_path=connection.ssh_key_path,
            sync_mode=connection.sync_mode,
            tags=connection.tags,
            is_favorite=False
        )

        db.add(new_connection)
        db.commit()
        db.refresh(new_connection)

        return {
            "message": "Connection duplicated",
            "id": new_connection.id,
            "name": new_connection.name
        }

@app.put("/api/connections/{connection_id}")
async def update_connection(connection_id: int, config: ConnectionConfig):
    """Update an existing saved connection"""
    with get_db() as db:
        connection = db.query(SavedConnection).filter(SavedConnection.id == connection_id).first()
        if not connection:
            raise HTTPException(status_code=404, detail="Connection not found")

        # Update connection details
        connection.name = config.name
        connection.host = config.host
        connection.port = config.port
        connection.username = config.username
        connection.remote_path = config.remote_path
        connection.local_path = config.local_path
        connection.ssh_key_path = config.ssh_key_path
        connection.sync_mode = config.sync_mode
        connection.tags = json.dumps(config.tags) if config.tags else None

        db.commit()

        return {"message": "Connection updated successfully"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()

            # Echo back or handle specific commands
            await websocket.send_json({"type": "echo", "data": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/export")
async def export_connections():
    """Export all connections and settings"""
    with get_db() as db:
        connections = db.query(SavedConnection).all()

        export_data = {
            "version": "1.0.0",
            "exported_at": datetime.now().isoformat(),
            "connections": [
                {
                    "name": c.name,
                    "host": c.host,
                    "port": c.port,
                    "username": c.username,
                    "remote_path": c.remote_path,
                    "local_path": c.local_path,
                    "ssh_key_path": c.ssh_key_path,
                    "sync_mode": c.sync_mode,
                    "tags": json.loads(c.tags) if c.tags else [],
                    "is_favorite": c.is_favorite
                }
                for c in connections
            ]
        }

        return export_data

@app.post("/api/import")
async def import_connections(data: dict):
    """Import connections from export file"""
    try:
        with get_db() as db:
            imported = 0
            skipped = 0

            for conn_data in data.get("connections", []):
                # Check if connection already exists
                existing = db.query(SavedConnection).filter(
                    SavedConnection.name == conn_data["name"]
                ).first()

                if existing:
                    skipped += 1
                    continue

                # Create new connection
                connection = SavedConnection(
                    name=conn_data["name"],
                    host=conn_data["host"],
                    port=conn_data.get("port", 22),
                    username=conn_data["username"],
                    remote_path=conn_data["remote_path"],
                    local_path=conn_data["local_path"],
                    ssh_key_path=conn_data.get("ssh_key_path"),
                    sync_mode=conn_data.get("sync_mode", "one-way-safe"),
                    tags=json.dumps(conn_data.get("tags", [])),
                    is_favorite=conn_data.get("is_favorite", False)
                )
                db.add(connection)
                imported += 1

            db.commit()

            return {
                "message": "Import complete",
                "imported": imported,
                "skipped": skipped
            }
    except Exception as e:
        logger.error(f"Import failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)