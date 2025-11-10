import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  LinearProgress
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  Refresh,
  Delete,
  Info,
  CheckCircle,
  Error,
  Warning
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, MutagenSession } from '../api/client';
import ConflictResolutionDialog from './ConflictResolutionDialog';

const SessionList: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<MutagenSession | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [conflictSession, setConflictSession] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);

  // Fetch sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.listSessions(),
    refetchInterval: 30000, // Poll every 30 seconds instead of 3
    retry: 3, // Retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  // Session action mutation
  const actionMutation = useMutation({
    mutationFn: ({ session_name, action }: { session_name: string; action: any }) =>
      apiClient.performSessionAction({ session_name, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  // Conflict resolution mutation
  const resolveMutation = useMutation({
    mutationFn: ({ sessionName, winner }: { sessionName: string; winner: 'alpha' | 'beta' }) =>
      apiClient.resolveConflicts(sessionName, winner),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setConflictSession(null);
      setConflicts([]);
    },
  });

  // Check for conflicts when sessions load or update
  useEffect(() => {
    const checkConflicts = async () => {
      for (const session of sessions) {
        try {
          const result = await apiClient.getSessionConflicts(session.name);
          if (result.count > 0) {
            setConflictSession(session.name);
            setConflicts(result.conflicts);
            break; // Show one at a time
          }
        } catch (error) {
          // Ignore errors for individual session conflict checks
          console.debug(`Could not check conflicts for ${session.name}:`, error);
        }
      }
    };

    if (sessions.length > 0) {
      checkConflicts();
    }
  }, [sessions]);

  const handleAction = (sessionName: string, action: string) => {
    if (action === 'terminate') {
      setConfirmDelete(sessionName);
    } else {
      actionMutation.mutate({ session_name: sessionName, action });
    }
  };

  const confirmTerminate = () => {
    if (confirmDelete) {
      actionMutation.mutate({ session_name: confirmDelete, action: 'terminate' });
      setConfirmDelete(null);
    }
  };

  const showDetails = (session: MutagenSession) => {
    setSelectedSession(session);
    setDetailsOpen(true);
  };

  const handleResolveConflict = (winner: 'alpha' | 'beta') => {
    if (conflictSession) {
      resolveMutation.mutate({ sessionName: conflictSession, winner });
    }
  };

  const getStatusChip = (status: string) => {
    const color = status === 'Connected' || status === 'Running'
      ? 'success'
      : status === 'Paused'
      ? 'warning'
      : 'error';

    const icon = status === 'Connected' || status === 'Running'
      ? <CheckCircle />
      : <Error />;

    return <Chip label={status} color={color} size="small" icon={icon} />;
  };

  const getConnectionChip = (connected: boolean) => {
    return (
      <Chip
        label={connected ? 'Connected' : 'Disconnected'}
        color={connected ? 'success' : 'error'}
        size="small"
        variant="outlined"
      />
    );
  };

  if (isLoading) {
    return <LinearProgress />;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Active Sessions
      </Typography>

      <Paper sx={{ mt: 2 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Local</TableCell>
                <TableCell>Remote</TableCell>
                <TableCell>Connections</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      No active sessions. Create a new connection to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session: MutagenSession) => (
                  <TableRow key={session.identifier}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {session.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {session.identifier}
                      </Typography>
                    </TableCell>
                    <TableCell>{getStatusChip(session.status)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        {session.alpha?.url}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        {session.beta?.url}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        {getConnectionChip(session.alpha?.connected)}
                        {getConnectionChip(session.beta?.connected)}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={0.5}>
                        {session.status?.toLowerCase() === 'paused' ? (
                          <Tooltip title="Resume">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleAction(session.name, 'resume')}
                            >
                              <PlayArrow />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Pause">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleAction(session.name, 'pause')}
                            >
                              <Pause />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Flush">
                          <IconButton
                            size="small"
                            color="info"
                            onClick={() => handleAction(session.name, 'flush')}
                          >
                            <Refresh />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Details">
                          <IconButton
                            size="small"
                            onClick={() => showDetails(session)}
                          >
                            <Info />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Terminate">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleAction(session.name, 'terminate')}
                          >
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Session Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Session Details: {selectedSession?.name}</DialogTitle>
        <DialogContent>
          {selectedSession && (
            <Box sx={{ pt: 2 }}>
              <TextField
                fullWidth
                label="Session ID"
                value={selectedSession.identifier}
                InputProps={{ readOnly: true }}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Status"
                value={selectedSession.status}
                InputProps={{ readOnly: true }}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Local Path"
                value={selectedSession.alpha?.url}
                InputProps={{ readOnly: true }}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Local Connection"
                value={selectedSession.alpha?.connected ? 'Connected' : 'Disconnected'}
                InputProps={{ readOnly: true }}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Remote Path"
                value={selectedSession.beta?.url}
                InputProps={{ readOnly: true }}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Remote Connection"
                value={selectedSession.beta?.connected ? 'Connected' : 'Disconnected'}
                InputProps={{ readOnly: true }}
                margin="normal"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Confirm Termination</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to terminate the session "{confirmDelete}"?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" onClick={confirmTerminate} variant="contained">
            Terminate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        open={!!conflictSession}
        sessionName={conflictSession || ''}
        conflicts={conflicts}
        onResolve={handleResolveConflict}
        onCancel={() => {
          setConflictSession(null);
          setConflicts([]);
        }}
      />
    </Box>
  );
};

export default SessionList;