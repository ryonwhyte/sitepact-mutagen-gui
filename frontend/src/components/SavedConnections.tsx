import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  Fab,
  InputAdornment,
  Menu,
  MenuItem,
  Snackbar,
  Alert
} from '@mui/material';
import {
  CloudUpload,
  Delete,
  Edit,
  Star,
  StarBorder,
  MoreVert,
  Search,
  Add,
  FileDownload,
  FileUpload,
  ContentCopy
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, Connection, ExcludedDeletionItem } from '../api/client';
import ExcludedDeletionDialog from './ExcludedDeletionDialog';

const SavedConnections: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  // Excluded-path deletion confirmation (remote only)
  const [deletion, setDeletion] = useState<{ connection: Connection; items: ExcludedDeletionItem[] } | null>(null);
  const [deletionSelected, setDeletionSelected] = useState<string[]>([]);
  const [deletionRemember, setDeletionRemember] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);

  // Fetch saved connections
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiClient.listConnections(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setDeleteConfirm(null);
    },
  });

  // Quick connect mutation
  const connectMutation = useMutation({
    mutationFn: (id: number) => apiClient.quickConnect(id),
    onSuccess: () => {
      navigate('/sessions');
    },
  });

  // Connect flow. If the connection is set to delete excluded paths on the remote, first
  // preview what exists there and let the user approve deletions (esp. remote-only paths)
  // before connecting. Otherwise connect straight away.
  const handleConnect = async (connection: Connection) => {
    if (!connection.delete_excluded || !connection.ignores?.length) {
      connectMutation.mutate(connection.id!);
      return;
    }
    try {
      const preview = await apiClient.previewExcludedDeletions(connection);
      const present = (preview.items || []).filter(i => i.exists_remote);
      if (preview.error) {
        setSnackbar({ msg: `Could not check remote for excluded paths: ${preview.error}. Connecting without deleting.`, severity: 'error' });
        connectMutation.mutate(connection.id!);
        return;
      }
      if (present.length === 0) {
        connectMutation.mutate(connection.id!);
        return;
      }
      // Remembered "auto" choice: delete everything excluded that exists on the remote without
      // prompting, then connect.
      if (connection.delete_excluded_mode === 'auto') {
        setDeletionBusy(true);
        try {
          const res = await apiClient.deleteExcluded(connection, present.map(i => i.path));
          if (res.failed?.length) {
            setSnackbar({ msg: `Auto-deleted ${res.deleted.length}, failed ${res.failed.length} on the remote.`, severity: 'error' });
          } else if (res.deleted?.length) {
            setSnackbar({ msg: `Auto-removed ${res.deleted.length} excluded path(s) from the remote.`, severity: 'success' });
          }
        } catch (error: any) {
          setSnackbar({ msg: `Auto-delete failed: ${error?.message || error}`, severity: 'error' });
        } finally {
          setDeletionBusy(false);
          connectMutation.mutate(connection.id!);
        }
        return;
      }
      // Ask mode: default-select the safe ones (also present locally, will re-sync); leave
      // remote-only paths unchecked so their permanent deletion needs a deliberate click.
      setDeletionSelected(present.filter(i => i.exists_local).map(i => i.path));
      setDeletionRemember(false);
      setDeletion({ connection, items: present });
    } catch (error: any) {
      setSnackbar({ msg: `Preview failed: ${error?.message || error}. Connecting without deleting.`, severity: 'error' });
      connectMutation.mutate(connection.id!);
    }
  };

  const toggleDeletionPath = (path: string) => {
    setDeletionSelected(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  // Persist a remembered choice on the connection so we stop prompting on future connects.
  // 'auto' = always delete without asking; feature off = never delete / never ask.
  const rememberChoice = async (connection: Connection, choice: 'auto' | 'off') => {
    try {
      await apiClient.updateConnection(connection.id!, {
        ...connection,
        delete_excluded: choice === 'auto',
        delete_excluded_mode: choice === 'auto' ? 'auto' : 'ask',
      });
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    } catch (error: any) {
      setSnackbar({ msg: `Could not save your choice: ${error?.message || error}`, severity: 'error' });
    }
  };

  const runDeletionThenConnect = async () => {
    if (!deletion) return;
    const connection = deletion.connection;
    setDeletionBusy(true);
    try {
      const res = await apiClient.deleteExcluded(connection, deletionSelected);
      if (res.failed?.length) {
        setSnackbar({ msg: `Deleted ${res.deleted.length}, failed ${res.failed.length}: ${res.failed.map(f => f.path).join(', ')}`, severity: 'error' });
      } else if (res.deleted?.length) {
        setSnackbar({ msg: `Removed ${res.deleted.length} path(s) from the remote.`, severity: 'success' });
      }
      if (deletionRemember) await rememberChoice(connection, 'auto');
    } catch (error: any) {
      setSnackbar({ msg: `Delete failed: ${error?.message || error}`, severity: 'error' });
    } finally {
      const id = connection.id!;
      setDeletionBusy(false);
      setDeletion(null);
      setDeletionSelected([]);
      connectMutation.mutate(id);
    }
  };

  const skipDeletionThenConnect = async () => {
    if (!deletion) return;
    const connection = deletion.connection;
    const id = connection.id!;
    if (deletionRemember) await rememberChoice(connection, 'off');
    setDeletion(null);
    setDeletionSelected([]);
    connectMutation.mutate(id);
  };

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: number) => apiClient.duplicateConnection(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      // Navigate to edit the duplicated connection
      navigate(`/connections/edit/${data.id}`);
    },
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: () => apiClient.exportConnections(),
    onSuccess: (data) => {
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mutagen-connections-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const result = await apiClient.importConnections(data);
        setSnackbar({
          msg: `Imported ${result.imported} connection(s), skipped ${result.skipped} duplicate(s).`,
          severity: 'success',
        });
        queryClient.invalidateQueries({ queryKey: ['connections'] });
      } catch (error: any) {
        const detail = error?.response?.data?.detail || error?.message || String(error);
        setSnackbar({ msg: `Import failed: ${detail}`, severity: 'error' });
      }
    };
    input.click();
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, id: number) => {
    setAnchorEl(event.currentTarget);
    setSelectedId(id);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedId(null);
  };

  const filteredConnections = connections.filter((conn: Connection) =>
    conn.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conn.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (conn.tags && conn.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">
          Saved Connections
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            startIcon={<FileDownload />}
            onClick={() => exportMutation.mutate()}
            variant="outlined"
          >
            Export
          </Button>
          <Button
            startIcon={<FileUpload />}
            onClick={handleImport}
            variant="outlined"
          >
            Import
          </Button>
        </Box>
      </Box>

      {/* Search Bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search connections..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* Connections Grid */}
      <Grid container spacing={2}>
        {filteredConnections.length === 0 ? (
          <Grid item xs={12}>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                {searchTerm
                  ? 'No connections found matching your search.'
                  : 'No saved connections yet. Create your first connection!'}
              </Typography>
              {!searchTerm && (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => navigate('/connect')}
                  sx={{ mt: 2 }}
                >
                  Create Connection
                </Button>
              )}
            </Paper>
          </Grid>
        ) : (
          filteredConnections.map((connection: Connection) => (
            <Grid item xs={12} md={6} lg={4} key={connection.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" gap={1}>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="h6" gutterBottom noWrap>
                        {connection.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {connection.username}@{connection.host}:{connection.port}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" mt={1} sx={{ wordBreak: 'break-all' }}>
                        Remote: {connection.remote_path}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: 'break-all' }}>
                        Local: {connection.local_path}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      sx={{ flexShrink: 0 }}
                      onClick={(e) => handleMenuClick(e, connection.id!)}
                    >
                      <MoreVert />
                    </IconButton>
                  </Box>

                  {/* Sync mode + exclusions summary */}
                  <Box mt={1} display="flex" gap={0.5} flexWrap="wrap">
                    <Chip label={connection.sync_mode} size="small" variant="outlined" />
                    {connection.ignores && connection.ignores.length > 0 && (
                      <Chip label={`${connection.ignores.length} ${connection.ignores.length === 1 ? 'ignore' : 'ignores'}`} size="small" variant="outlined" />
                    )}
                    {connection.delete_excluded && (
                      <Tooltip title={connection.delete_excluded_mode === 'auto'
                        ? 'Excluded paths are deleted from the remote automatically on connect'
                        : 'You are asked before excluded paths are deleted from the remote on connect'}>
                        <Chip
                          label={connection.delete_excluded_mode === 'auto' ? 'auto-delete excluded' : 'delete excluded (ask)'}
                          size="small"
                          color="warning"
                          variant={connection.delete_excluded_mode === 'auto' ? 'filled' : 'outlined'}
                        />
                      </Tooltip>
                    )}
                  </Box>

                  {/* Tags */}
                  {connection.tags && connection.tags.length > 0 && (
                    <Box mt={1}>
                      {connection.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      ))}
                    </Box>
                  )}

                  {/* Metadata */}
                  <Box mt={2}>
                    <Typography variant="caption" color="text.secondary">
                      Last used: {formatDate(connection.last_used)}
                    </Typography>
                  </Box>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<CloudUpload />}
                    onClick={() => handleConnect(connection)}
                    disabled={connectMutation.isPending || deletionBusy}
                  >
                    Connect
                  </Button>
                  <Tooltip title={connection.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
                    <IconButton size="small">
                      {connection.is_favorite ? <Star color="warning" /> : <StarBorder />}
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          handleMenuClose();
          navigate(`/connections/edit/${selectedId}`);
        }}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={() => {
          handleMenuClose();
          if (selectedId) {
            duplicateMutation.mutate(selectedId);
          }
        }}>
          <ContentCopy fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem onClick={() => {
          handleMenuClose();
          setDeleteConfirm(selectedId);
        }}>
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Connection?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this saved connection? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add"
        onClick={() => navigate('/connect')}
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
        }}
      >
        <Add />
      </Fab>

      {/* Import/export feedback (in-app, avoids the native alert() that renders as boxes in the snap) */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.msg}
          </Alert>
        ) : undefined}
      </Snackbar>

      <ExcludedDeletionDialog
        open={!!deletion}
        connectionName={deletion?.connection.name || ''}
        items={deletion?.items || []}
        selected={deletionSelected}
        onToggle={toggleDeletionPath}
        onDelete={runDeletionThenConnect}
        onSkip={skipDeletionThenConnect}
        onCancel={() => { if (!deletionBusy) { setDeletion(null); setDeletionSelected([]); setDeletionRemember(false); } }}
        remember={deletionRemember}
        onRememberChange={setDeletionRemember}
        busy={deletionBusy}
      />
    </Box>
  );
};

export default SavedConnections;