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
  Snackbar,
  FormControlLabel,
  Switch,
  RadioGroup,
  Radio,
  FormLabel
} from '@mui/material';
import {
  Save,
  CloudUpload,
  FolderOpen,
  Key,
  Add
} from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient, Connection, SSHKey, ExcludedDeletionItem } from '../api/client';
import { useNavigate, useParams } from 'react-router-dom';
import InitialSyncDialog from './InitialSyncDialog';
import ExcludedDeletionDialog from './ExcludedDeletionDialog';

// Quick-add exclusion presets. Clicking one merges its patterns into the list.
const IGNORE_PRESETS: { label: string; patterns: string[] }[] = [
  { label: 'Node', patterns: ['node_modules', 'dist', '.cache'] },
  { label: 'WordPress theme', patterns: ['node_modules', 'src', 'og', 'pages', 'package.json', 'package-lock.json'] },
  { label: 'Python', patterns: ['__pycache__', 'venv', '.venv', '*.pyc'] },
  { label: 'Common junk', patterns: ['.DS_Store', '*.log', '.env*', '.idea', '.vscode'] },
];

const ConnectionForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const [showSuccess, setShowSuccess] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  // Excluded-path deletion confirmation (remote only), shown between initial sync and create
  const [pendingCreate, setPendingCreate] = useState<Connection | null>(null);
  const [deletionItems, setDeletionItems] = useState<ExcludedDeletionItem[]>([]);
  const [deletionSelected, setDeletionSelected] = useState<string[]>([]);
  const [deletionRemember, setDeletionRemember] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);

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
    ignores: [],
    ignore_vcs: true,
    delete_excluded: false,
    delete_excluded_mode: 'ask',
  });

  // Fetch SSH keys
  const { data: sshKeys = [] } = useQuery<SSHKey[]>({
    queryKey: ['ssh-keys'],
    queryFn: () => apiClient.listSSHKeys(),
  });

  // Load connection data if editing
  useEffect(() => {
    if (isEditMode && id) {
      setIsLoading(true);
      apiClient.getConnection(parseInt(id))
        .then((connection) => {
          setFormData(connection);
          setTags(connection.tags || []);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to load connection:', error);
          setIsLoading(false);
        });
    }
  }, [id, isEditMode]);

  const createMutation = useMutation({
    mutationFn: (data: Connection) => apiClient.createSession(data),
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/sessions');
      }, 2000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Connection) => apiClient.updateConnection(parseInt(id!), data),
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/connections');
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

  const addIgnores = (patterns: string[]) => {
    setFormData(prev => {
      const merged = Array.from(new Set([...(prev.ignores || []), ...patterns]));
      return { ...prev, ignores: merged };
    });
  };

  const removeIgnore = (pattern: string) => {
    setFormData(prev => ({
      ...prev,
      ignores: (prev.ignores || []).filter(p => p !== pattern),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode) {
      // Update the connection without syncing
      updateMutation.mutate(formData);
    } else {
      // Show the initial sync dialog for new connections
      setSyncDialogOpen(true);
    }
  };

  const runCreate = (data: Connection) => {
    setIsSyncing(true);
    createMutation.mutate(data, {
      onSettled: () => {
        setIsSyncing(false);
        setSyncDialogOpen(false);
      }
    });
  };

  const handleSyncConfirm = async (direction: 'download' | 'upload' | 'skip') => {
    const dataWithSync: Connection = {
      ...formData,
      initial_sync_direction: direction,
    } as Connection;

    // If not deleting excluded paths, create straight away.
    if (!dataWithSync.delete_excluded || !dataWithSync.ignores?.length) {
      runCreate(dataWithSync);
      return;
    }

    // Lock the sync dialog while we probe the remote so a double-click can't fire twice.
    setIsSyncing(true);
    try {
      const preview = await apiClient.previewExcludedDeletions(dataWithSync);
      const present = (preview.items || []).filter(i => i.exists_remote);
      if (preview.error || present.length === 0) {
        runCreate(dataWithSync);
        return;
      }
      if (dataWithSync.delete_excluded_mode === 'auto') {
        await apiClient.deleteExcluded(dataWithSync, present.map(i => i.path)).catch(() => undefined);
        runCreate(dataWithSync);
        return;
      }
      // Ask: close the sync dialog and hand off to the confirmation dialog.
      setIsSyncing(false);
      setSyncDialogOpen(false);
      setPendingCreate(dataWithSync);
      setDeletionItems(present);
      setDeletionSelected(present.filter(i => i.exists_local).map(i => i.path));
      setDeletionRemember(false);
      setDeletionOpen(true);
    } catch {
      runCreate(dataWithSync);
    }
  };

  const finishPendingCreate = (data: Connection) => {
    setDeletionOpen(false);
    setDeletionItems([]);
    setDeletionSelected([]);
    setPendingCreate(null);
    runCreate(data);
  };

  const runDeletionThenCreate = async () => {
    if (!pendingCreate) return;
    setDeletionBusy(true);
    try {
      await apiClient.deleteExcluded(pendingCreate, deletionSelected);
    } catch {
      // Non-fatal: proceed to create even if deletion failed.
    } finally {
      setDeletionBusy(false);
      const data = deletionRemember
        ? { ...pendingCreate, delete_excluded: true, delete_excluded_mode: 'auto' as const }
        : pendingCreate;
      finishPendingCreate(data);
    }
  };

  const skipDeletionThenCreate = () => {
    if (!pendingCreate) return;
    const data = deletionRemember
      ? { ...pendingCreate, delete_excluded: false, delete_excluded_mode: 'ask' as const }
      : pendingCreate;
    finishPendingCreate(data);
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

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {isEditMode ? 'Edit Connection' : 'Create New Connection'}
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

            {/* Section: sync options */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                Sync options
              </Typography>
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

            {/* Section: exclusions */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                Exclusions
              </Typography>
            </Grid>

            {/* Excluded paths (ignores) */}
            <Grid item xs={12}>
              <Box mb={1} display="flex" gap={0.5} flexWrap="wrap" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                  Quick add:
                </Typography>
                {IGNORE_PRESETS.map((preset) => (
                  <Chip
                    key={preset.label}
                    label={preset.label}
                    size="small"
                    variant="outlined"
                    icon={<Add />}
                    onClick={() => addIgnores(preset.patterns)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Excluded paths (one per line)"
                placeholder={"node_modules\n.git\n*.log\n.env*"}
                value={(formData.ignores || []).join('\n')}
                onChange={(e) => {
                  const list = e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                  setFormData((prev) => ({ ...prev, ignores: list }));
                }}
                helperText="Paths or globs Mutagen will skip (mutagen --ignore). Kept out of the sync in both directions."
              />
              {(formData.ignores || []).length > 0 && (
                <Box mt={1} display="flex" gap={0.5} flexWrap="wrap">
                  {(formData.ignores || []).map((pattern) => (
                    <Chip
                      key={pattern}
                      label={pattern}
                      size="small"
                      onDelete={() => removeIgnore(pattern)}
                    />
                  ))}
                </Box>
              )}
              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Switch
                    checked={formData.ignore_vcs !== false}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, ignore_vcs: e.target.checked }))
                    }
                  />
                }
                label="Ignore VCS directories (.git, .svn, ...)"
              />
              <FormControlLabel
                sx={{ mt: 0.5, display: 'flex' }}
                control={
                  <Switch
                    color="warning"
                    checked={formData.delete_excluded === true}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, delete_excluded: e.target.checked }))
                    }
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Delete excluded paths from the remote on connect</Typography>
                    <Typography variant="caption" color="warning.main">
                      Destructive: removes matching top-level folders/files on the remote server.
                      Your local copies are never touched.
                    </Typography>
                  </Box>
                }
              />
              {formData.delete_excluded && (
                <FormControl sx={{ mt: 1, ml: 6 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>When excluded paths exist on the remote</FormLabel>
                  <RadioGroup
                    value={formData.delete_excluded_mode || 'ask'}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, delete_excluded_mode: e.target.value as 'ask' | 'auto' }))
                    }
                  >
                    <FormControlLabel
                      value="ask"
                      control={<Radio size="small" />}
                      label={<Typography variant="body2">Ask me each time (recommended)</Typography>}
                    />
                    <FormControlLabel
                      value="auto"
                      control={<Radio size="small" color="warning" />}
                      label={<Typography variant="body2">Delete automatically without asking</Typography>}
                    />
                  </RadioGroup>
                </FormControl>
              )}
            </Grid>

            {/* Error Display */}
            {(createMutation.isError || updateMutation.isError) && (
              <Grid item xs={12}>
                <Alert severity="error">
                  {((createMutation.error || updateMutation.error) as Error).message}
                </Alert>
              </Grid>
            )}

            {/* Submit Buttons */}
            <Grid item xs={12}>
              <Box display="flex" gap={2}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={isEditMode ? <Save /> : <CloudUpload />}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {isEditMode
                    ? (updateMutation.isPending ? 'Updating...' : 'Update Connection')
                    : (createMutation.isPending ? 'Creating...' : 'Create & Connect')
                  }
                </Button>
                {!isEditMode && (
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
                )}
                <Button
                  variant="outlined"
                  onClick={() => navigate(isEditMode ? '/connections' : '/dashboard')}
                >
                  Cancel
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
        message={isEditMode ? "Connection updated successfully!" : "Connection created successfully!"}
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

      <ExcludedDeletionDialog
        open={deletionOpen}
        connectionName={pendingCreate?.name || formData.name}
        items={deletionItems}
        selected={deletionSelected}
        onToggle={(path) =>
          setDeletionSelected(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])
        }
        onDelete={runDeletionThenCreate}
        onSkip={skipDeletionThenCreate}
        onCancel={() => { if (!deletionBusy) { setDeletionOpen(false); setPendingCreate(null); setDeletionItems([]); setDeletionSelected([]); setDeletionRemember(false); } }}
        remember={deletionRemember}
        onRememberChange={setDeletionRemember}
        busy={deletionBusy}
      />
    </Box>
  );
};

export default ConnectionForm;