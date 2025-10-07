import React from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  CloudSync,
  Storage,
  CheckCircle,
  Error,
  Warning,
  PlayArrow,
  Pause,
  Refresh
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient, MutagenSession } from '../api/client';

const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch sessions
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.listSessions(),
    refetchInterval: 30000, // Poll every 30 seconds instead of 5
  });

  // Fetch daemon status
  const { data: daemonStatus } = useQuery({
    queryKey: ['daemon-status'],
    queryFn: () => apiClient.getDaemonStatus(),
    refetchInterval: 30000, // Poll every 30 seconds instead of 5
  });

  // Session action mutation
  const actionMutation = useMutation({
    mutationFn: ({ session_name, action }: { session_name: string; action: any }) =>
      apiClient.performSessionAction({ session_name, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'connected':
        return <CheckCircle color="success" />;
      case 'disconnected':
      case 'paused':
        return <Warning color="warning" />;
      case 'error':
        return <Error color="error" />;
      default:
        return <CloudSync />;
    }
  };

  const getStatusColor = (status: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'connected':
        return 'success';
      case 'paused':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const activeSessions = sessions.filter((s: MutagenSession) =>
    s.status?.toLowerCase() !== 'terminated'
  );

  const connectedSessions = activeSessions.filter((s: MutagenSession) =>
    s.alpha?.connected && s.beta?.connected
  );

  if (isLoading) {
    return <LinearProgress />;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* Statistics Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              height: 120,
            }}
          >
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Active Sessions
            </Typography>
            <Typography component="p" variant="h3">
              {activeSessions.length}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              height: 120,
            }}
          >
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Connected
            </Typography>
            <Typography component="p" variant="h3">
              {connectedSessions.length}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              height: 120,
            }}
          >
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Daemon Status
            </Typography>
            <Chip
              label={daemonStatus?.status || 'Unknown'}
              color={daemonStatus?.status === 'running' ? 'success' : 'error'}
              sx={{ mt: 1 }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              height: 120,
            }}
          >
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Total Sessions
            </Typography>
            <Typography component="p" variant="h3">
              {sessions.length}
            </Typography>
          </Paper>
        </Grid>

        {/* Active Sessions List */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Active Sessions
            </Typography>

            {activeSessions.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <CloudSync sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  No Active Sessions
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Get started by creating your first connection to sync files between your local machine and a remote server.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<CloudSync />}
                  onClick={() => navigate('/connect')}
                  size="large"
                >
                  Create New Connection
                </Button>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {activeSessions.map((session: MutagenSession) => (
                  <Grid item xs={12} md={6} lg={4} key={session.identifier}>
                    <Card>
                      <CardContent>
                        <Box display="flex" alignItems="center" mb={1}>
                          {getStatusIcon(session.status)}
                          <Typography variant="h6" ml={1}>
                            {session.name}
                          </Typography>
                        </Box>

                        <Chip
                          label={session.status}
                          color={getStatusColor(session.status)}
                          size="small"
                          sx={{ mb: 1 }}
                        />

                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          <strong>Local:</strong> {session.alpha?.url}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Remote:</strong> {session.beta?.url}
                        </Typography>

                        <Box mt={1}>
                          <Chip
                            label={`Local: ${session.alpha?.connected ? 'Connected' : 'Disconnected'}`}
                            color={session.alpha?.connected ? 'success' : 'error'}
                            size="small"
                            sx={{ mr: 1 }}
                          />
                          <Chip
                            label={`Remote: ${session.beta?.connected ? 'Connected' : 'Disconnected'}`}
                            color={session.beta?.connected ? 'success' : 'error'}
                            size="small"
                          />
                        </Box>
                      </CardContent>
                      <CardActions>
                        {session.status?.toLowerCase() === 'paused' ? (
                          <Button
                            size="small"
                            startIcon={<PlayArrow />}
                            onClick={() =>
                              actionMutation.mutate({
                                session_name: session.name,
                                action: 'resume',
                              })
                            }
                          >
                            Resume
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            startIcon={<Pause />}
                            onClick={() =>
                              actionMutation.mutate({
                                session_name: session.name,
                                action: 'pause',
                              })
                            }
                          >
                            Pause
                          </Button>
                        )}
                        <Button
                          size="small"
                          startIcon={<Refresh />}
                          onClick={() =>
                            actionMutation.mutate({
                              session_name: session.name,
                              action: 'flush',
                            })
                          }
                        >
                          Flush
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>

        {/* Getting Started Guide */}
        {sessions.length === 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <Typography variant="h5" sx={{ color: 'white', mb: 2 }}>
                Welcome to Mutagen GUI! 🚀
              </Typography>
              <Typography variant="body1" sx={{ color: 'white', mb: 3 }}>
                Mutagen GUI helps you sync files between your local machine and remote servers with ease.
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      mb: 1
                    }}>
                      <Typography variant="h6" sx={{ color: 'white' }}>1</Typography>
                    </Box>
                    <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>
                      Create Connection
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                      Set up SSH connection details to your remote server
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      mb: 1
                    }}>
                      <Typography variant="h6" sx={{ color: 'white' }}>2</Typography>
                    </Box>
                    <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>
                      Start Syncing
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                      Mutagen will sync files between local and remote paths
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      mb: 1
                    }}>
                      <Typography variant="h6" sx={{ color: 'white' }}>3</Typography>
                    </Box>
                    <Typography variant="h6" sx={{ color: 'white', mb: 1 }}>
                      Manage Sessions
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                      Monitor, pause, resume, or stop sync sessions anytime
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default Dashboard;