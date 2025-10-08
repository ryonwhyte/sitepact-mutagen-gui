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
  MenuItem
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
import { apiClient, Connection } from '../api/client';

const SavedConnections: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
      if (file) {
        const text = await file.text();
        const data = JSON.parse(text);

        try {
          const result = await apiClient.importConnections(data);
          alert(`Imported ${result.imported} connections, skipped ${result.skipped} duplicates.`);
          queryClient.invalidateQueries({ queryKey: ['connections'] });
        } catch (error) {
          alert(`Import failed: ${error}`);
        }
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
                  <Box display="flex" justifyContent="space-between" alignItems="start">
                    <Box flex={1}>
                      <Typography variant="h6" gutterBottom>
                        {connection.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {connection.username}@{connection.host}:{connection.port}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                        Remote: {connection.remote_path}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Local: {connection.local_path}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuClick(e, connection.id!)}
                    >
                      <MoreVert />
                    </IconButton>
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
                    onClick={() => connectMutation.mutate(connection.id!)}
                    disabled={connectMutation.isPending}
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
    </Box>
  );
};

export default SavedConnections;