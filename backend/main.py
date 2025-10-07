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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
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
    created_at = Column(DateTime, default=datetime.utcnow)
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

    def _find_mutagen(self) -> str:
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

        raise RuntimeError("Mutagen binary not found")

    async def run_command(self, *args: str, timeout: int = 60) -> str:
        """Execute mutagen command"""
        cmd = [self.mutagen_bin] + list(args)
        logger.info(f"Running command: {' '.join(cmd)}")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
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

        rsync_args = [
            "rsync", "-avz", "--progress",
            "-e", f"ssh -p {config.port}"
        ]

        if config.ssh_key_path:
            rsync_args[4] = f"ssh -p {config.port} -i {config.ssh_key_path}"

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

    async def create_session(self, config: ConnectionConfig) -> str:
        """Create a new mutagen sync session"""
        # Perform initial sync if requested
        if config.initial_sync_direction and config.initial_sync_direction != 'skip':
            await self.perform_initial_sync(config, config.initial_sync_direction)

        # Construct remote URL
        remote_url = f"{config.username}@{config.host}:{config.remote_path}"

        # Create local directory if it doesn't exist
        Path(config.local_path).mkdir(parents=True, exist_ok=True)

        # Build command arguments
        args = [
            "sync", "create",
            f"--name={config.name}",
            f"--mode={config.sync_mode}",
            "--default-file-mode=0644",
            "--default-directory-mode=0755"
        ]

        # Add SSH options if needed
        if config.port != 22:
            args.append(f"--ssh-port={config.port}")

        if config.ssh_key_path:
            args.append(f"--ssh-identity-file={config.ssh_key_path}")

        # Determine source and destination based on sync mode
        # For two-way modes, order doesn't matter much
        # For one-way modes, we need to be careful
        if config.sync_mode == "one-way-replica":
            # One-way replica: source overwrites destination
            args.extend([remote_url, config.local_path])  # Remote -> Local
        else:
            # Default: local first (works for two-way and one-way-safe)
            args.extend([config.local_path, remote_url])

        # Run the command
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
    sessions = await mutagen_mgr.list_sessions()
    return sessions

@app.post("/api/sessions/create")
async def create_session(config: ConnectionConfig):
    """Create a new sync session"""
    try:
        # Save connection to database
        with get_db() as db:
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
        connection.last_used = datetime.utcnow()
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

        # Check if session already exists
        sessions = await mutagen_mgr.list_sessions()
        existing = [s for s in sessions if s["name"] == config.name]

        if existing:
            # Resume existing session
            await mutagen_mgr.perform_action(config.name, "resume")
            return {"message": "Session resumed", "name": config.name}
        else:
            # Create new session
            result = await mutagen_mgr.create_session(config)
            return {"message": "Session created", "name": config.name, "result": result}

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
            "exported_at": datetime.utcnow().isoformat(),
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