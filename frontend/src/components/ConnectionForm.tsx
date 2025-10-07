import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  MenuItem,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  IconButton,
  InputAdornment,
  Snackbar
} from '@mui/material';
import {
  Save,
  CloudUpload,
  FolderOpen,
  Key,
  Add
} from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient, Connection, SSHKey } from '../api/client';
import { useNavigate } from 'react-router-dom';
import InitialSyncDialog from './InitialSyncDialog';

const ConnectionForm: React.FC = () => {
  const navigate = useNavigate();
  const [showSuccess, setShowSuccess] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [formData, setFormData] = useState<Connection>({
    name: '',
    host: '',
    port: 22,
    username: '',
    remote_path: '',
    local_path: '',
    ssh_key_path: '',
    sync_mode: 'two-way-safe',
    tags: [],
  });

  // Fetch SSH keys
  const { data: sshKeys = [] } = useQuery<SSHKey[]>({
    queryKey: ['ssh-keys'],
    queryFn: () => apiClient.listSSHKeys(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Connection) => apiClient.createSession(data),
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/sessions');
      }, 2000);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'port' ? parseInt(value) || 22 : value,
    }));
  };

  const handleSelectChange = (name: string) => (e: any) => {
    setFormData(prev => ({
      ...prev,
      [name]: e.target.value,
    }));
  };

  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      const updatedTags = [...tags, newTag];
      setTags(updatedTags);
      setFormData(prev => ({ ...prev, tags: updatedTags }));
      setNewTag('');
    }
  };

  const handleDeleteTag = (tagToDelete: string) => {
    const updatedTags = tags.filter(tag => tag !== tagToDelete);
    setTags(updatedTags);
    setFormData(prev => ({ ...prev, tags: updatedTags }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Show the initial sync dialog instead of creating immediately
    setSyncDialogOpen(true);
  };

  const handleSyncConfirm = (direction: 'download' | 'upload' | 'skip') => {
    setIsSyncing(true);
    // Add the initial sync direction to the form data
    const dataWithSync = {
      ...formData,
      initial_sync_direction: direction
    };
    createMutation.mutate(dataWithSync, {
      onSettled: () => {
        setIsSyncing(false);
        setSyncDialogOpen(false);
      }
    });
  };

  const selectLocalPath = async () => {
    // Use Electron's native directory picker if available
    if (window.electronAPI) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setFormData(prev => ({ ...prev, local_path: path }));
      }
    } else {
      // Fallback for web
      const path = prompt('Enter local path:');
      if (path) {
        setFormData(prev => ({ ...prev, local_path: path }));
      }
    }
  };

  const selectSSHKeyFile = async () => {
    // Use Electron's native file picker if available
    if (window.electronAPI) {
      const path = await window.electronAPI.selectSSHKey();
      if (path) {
        setFormData(prev => ({ ...prev, ssh_key_path: path }));
      }
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Create New Connection
      </Typography>

      <Paper sx={{ p: 3, mt: 2 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Connection Name */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Connection Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                helperText="A unique name for this connection"
              />
            </Grid>

            {/* Host and Port */}
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                required
                label="Host/IP Address"
                name="host"
                value={formData.host}
                onChange={handleChange}
                placeholder="example.com or 192.168.1.100"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                required
                label="Port"
                name="port"
                type="number"
                value={formData.port}
                onChange={handleChange}
              />
            </Grid>

            {/* Username */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                required
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="root"
              />
            </Grid>

            {/* SSH Key */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>SSH Key</InputLabel>
                <Select
                  value={formData.ssh_key_path || ''}
                  onChange={handleSelectChange('ssh_key_path')}
                  label="SSH Key"
                  endAdornment={
                    window.electronAPI && (
                      <InputAdornment position="end">
                        <IconButton onClick={selectSSHKeyFile} edge="end" size="small">
                          <FolderOpen />
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                >
                  <MenuItem value="">
                    <em>None (use SSH agent or password)</em>
                  </MenuItem>
                  {sshKeys.map((key) => (
                    <MenuItem key={key.path} value={key.path}>
                      <Box display="flex" alignItems="center">
                        <Key fontSize="small" sx={{ mr: 1 }} />
                        {key.name}
                      </Box>
                    </MenuItem>
                  ))}
                  <MenuItem value="custom" onClick={selectSSHKeyFile}>
                    <Box display="flex" alignItems="center">
                      <FolderOpen fontSize="small" sx={{ mr: 1 }} />
                      Browse for key file...
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Remote Path */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Remote Path"
                name="remote_path"
                value={formData.remote_path}
                onChange={handleChange}
                placeholder="/home/user/project"
                helperText="The path on the remote server to sync"
              />
            </Grid>

            {/* Local Path */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Local Path"
                name="local_path"
                value={formData.local_path}
                onChange={handleChange}
                placeholder="/home/myuser/projects/remote-project"
                helperText="Where to store files locally"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={selectLocalPath} edge="end">
                        <FolderOpen />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            {/* Sync Mode */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Sync Mode</InputLabel>
                <Select
                  value={formData.sync_mode}
                  onChange={handleSelectChange('sync_mode')}
                  label="Sync Mode"
                >
                  <MenuItem value="two-way-safe">
                    Two-way Sync (Safe) - Bidirectional with conflict protection
                  </MenuItem>
                  <MenuItem value="two-way-resolved">
                    Two-way Sync (Auto-resolve) - Bidirectional with automatic conflict resolution
                  </MenuItem>
                  <MenuItem value="one-way-safe">
                    One-way Upload (Safe) - Local changes to remote, protects remote files
                  </MenuItem>
                  <MenuItem value="one-way-replica">
                    One-way Download (Mirror) - Remote replaces local completely
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Tags */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Add Tags"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={handleAddTag} edge="end">
                        <Add />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Box mt={1}>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    onDelete={() => handleDeleteTag(tag)}
                    sx={{ mr: 1, mb: 1 }}
                  />
                ))}
              </Box>
            </Grid>

            {/* Error Display */}
            {createMutation.isError && (
              <Grid item xs={12}>
                <Alert severity="error">
                  {(createMutation.error as Error).message}
                </Alert>
              </Grid>
            )}

            {/* Submit Buttons */}
            <Grid item xs={12}>
              <Box display="flex" gap={2}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<CloudUpload />}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create & Connect'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Save />}
                  onClick={() => {
                    // Save without connecting - would need a separate API endpoint
                    alert('Save functionality coming soon!');
                  }}
                >
                  Save for Later
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>

      <Snackbar
        open={showSuccess}
        autoHideDuration={2000}
        onClose={() => setShowSuccess(false)}
        message="Connection created successfully!"
      />

      <InitialSyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onConfirm={handleSyncConfirm}
        connectionName={formData.name}
        localPath={formData.local_path}
        remotePath={formData.remote_path}
        isFirstTime={true}
        isSyncing={isSyncing}
      />
    </Box>
  );
};

export default ConnectionForm;