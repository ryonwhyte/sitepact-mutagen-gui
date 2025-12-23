import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Alert,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Save,
  RestartAlt,
  CloudSync
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../api/client';

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState({
    autoStartDaemon: true,
    autoReconnect: true,
    syncInterval: 5,
    defaultFileMode: '0644',
    defaultDirMode: '0755',
    defaultSyncMode: 'one-way-safe',
    enableNotifications: true,
    theme: 'light'
  });

  const [saved, setSaved] = useState(false);

  // Start daemon mutation
  const startDaemonMutation = useMutation({
    mutationFn: () => apiClient.startDaemon(),
    onSuccess: () => {
      alert('Daemon started successfully');
    },
  });

  const handleChange = (name: string) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = () => {
    // In a real app, this would save to backend
    localStorage.setItem('mutagen-sync-manager-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    const defaultSettings = {
      autoStartDaemon: true,
      autoReconnect: true,
      syncInterval: 5,
      defaultFileMode: '0644',
      defaultDirMode: '0755',
      defaultSyncMode: 'one-way-safe',
      enableNotifications: true,
      theme: 'light'
    };
    setSettings(defaultSettings);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Settings saved successfully!
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Daemon Settings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Daemon Settings
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoStartDaemon}
                  onChange={handleChange('autoStartDaemon')}
                />
              }
              label="Auto-start daemon on launch"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoReconnect}
                  onChange={handleChange('autoReconnect')}
                />
              }
              label="Auto-reconnect sessions"
            />

            <TextField
              fullWidth
              label="Sync check interval (seconds)"
              type="number"
              value={settings.syncInterval}
              onChange={handleChange('syncInterval')}
              margin="normal"
              InputProps={{
                inputProps: { min: 1, max: 60 }
              }}
            />

            <Box mt={2}>
              <Button
                variant="outlined"
                startIcon={<CloudSync />}
                onClick={() => startDaemonMutation.mutate()}
                disabled={startDaemonMutation.isPending}
              >
                Start Daemon Now
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Default Sync Settings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Default Sync Settings
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <FormControl fullWidth margin="normal">
              <InputLabel>Default Sync Mode</InputLabel>
              <Select
                value={settings.defaultSyncMode}
                onChange={handleChange('defaultSyncMode')}
                label="Default Sync Mode"
              >
                <MenuItem value="one-way-safe">One-way Safe</MenuItem>
                <MenuItem value="one-way-replica">One-way Replica</MenuItem>
                <MenuItem value="two-way-safe">Two-way Safe</MenuItem>
                <MenuItem value="two-way-resolved">Two-way Resolved</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Default file permissions"
              value={settings.defaultFileMode}
              onChange={handleChange('defaultFileMode')}
              margin="normal"
              helperText="Unix file permissions (e.g., 0644)"
            />

            <TextField
              fullWidth
              label="Default directory permissions"
              value={settings.defaultDirMode}
              onChange={handleChange('defaultDirMode')}
              margin="normal"
              helperText="Unix directory permissions (e.g., 0755)"
            />
          </Paper>
        </Grid>

        {/* UI Settings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              User Interface
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <FormControl fullWidth margin="normal">
              <InputLabel>Theme</InputLabel>
              <Select
                value={settings.theme}
                onChange={handleChange('theme')}
                label="Theme"
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
                <MenuItem value="auto">Auto (System)</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={settings.enableNotifications}
                  onChange={handleChange('enableNotifications')}
                />
              }
              label="Enable desktop notifications"
            />
          </Paper>
        </Grid>

        {/* About */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              About
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Typography variant="body2" color="text.secondary" paragraph>
              Mutagen Sync Manager v1.0.0
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              A modern interface for managing Mutagen file synchronization sessions.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Built with React, Material-UI, and FastAPI
            </Typography>
          </Paper>
        </Grid>

        {/* Action Buttons */}
        <Grid item xs={12}>
          <Box display="flex" gap={2}>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
            >
              Save Settings
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestartAlt />}
              onClick={handleReset}
            >
              Reset to Defaults
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SettingsPage;