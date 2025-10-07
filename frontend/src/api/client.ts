/**
 * API client for backend communication
 */

const API_BASE = 'http://localhost:8000/api';

export interface Connection {
  id?: number;
  name: string;
  host: string;
  port: number;
  username: string;
  remote_path: string;
  local_path: string;
  ssh_key_path?: string;
  sync_mode: string;
  tags: string[];
  is_favorite?: boolean;
  created_at?: string;
  last_used?: string;
}

export interface SSHKey {
  name: string;
  path: string;
  fingerprint?: string;
}

export interface MutagenSession {
  name: string;
  identifier: string;
  status: string;
  alpha: {
    url: string;
    connected: boolean;
  };
  beta: {
    url: string;
    connected: boolean;
  };
}

export interface SessionAction {
  session_name: string;
  action: 'resume' | 'pause' | 'flush' | 'terminate';
}

class ApiClient {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // SSH Keys
  async listSSHKeys(): Promise<SSHKey[]> {
    return this.fetch<SSHKey[]>('/ssh-keys');
  }

  // Daemon
  async getDaemonStatus(): Promise<{ status: string }> {
    return this.fetch('/daemon/status');
  }

  async startDaemon(): Promise<{ message: string }> {
    return this.fetch('/daemon/start', { method: 'POST' });
  }

  // Sessions
  async listSessions(): Promise<MutagenSession[]> {
    return this.fetch<MutagenSession[]>('/sessions');
  }

  async createSession(connection: Connection): Promise<{ message: string; result: string }> {
    return this.fetch('/sessions/create', {
      method: 'POST',
      body: JSON.stringify(connection),
    });
  }

  async performSessionAction(action: SessionAction): Promise<{ message: string; result: string }> {
    return this.fetch('/sessions/action', {
      method: 'POST',
      body: JSON.stringify(action),
    });
  }

  // Saved Connections
  async listConnections(): Promise<Connection[]> {
    return this.fetch<Connection[]>('/connections');
  }

  async deleteConnection(id: number): Promise<{ message: string }> {
    return this.fetch(`/connections/${id}`, { method: 'DELETE' });
  }

  async quickConnect(id: number): Promise<{ message: string; name: string }> {
    return this.fetch(`/connections/${id}/connect`, { method: 'POST' });
  }

  // Export/Import
  async exportConnections(): Promise<any> {
    return this.fetch('/export', { method: 'POST' });
  }

  async importConnections(data: any): Promise<{ message: string; imported: number; skipped: number }> {
    return this.fetch('/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();

// WebSocket for real-time updates
export class WSClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.ws = new WebSocket('ws://localhost:8000/ws');

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      this.ws = null;
      // Attempt to reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    };
  }

  disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }
}

export const wsClient = new WSClient();