import React, { useEffect, useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  ThemeProvider,
  createTheme,
  Container,
  Paper,
  Chip
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Storage,
  Settings,
  CloudSync,
  FiberManualRecord
} from '@mui/icons-material';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Dashboard from './components/Dashboard';
import ConnectionForm from './components/ConnectionForm';
import SessionList from './components/SessionList';
import SavedConnections from './components/SavedConnections';
import SettingsPage from './components/SettingsPage';
import { wsClient, apiClient } from './api/client';

const drawerWidth = 240;
const queryClient = new QueryClient();

// Create theme with nice colors
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb',
    },
    secondary: {
      main: '#10b981',
    },
    background: {
      default: '#f9fafb',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

interface NavigationProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  daemonStatus: string;
}

function Navigation({ mobileOpen, setMobileOpen, daemonStatus }: NavigationProps) {
  const navigate = useNavigate();

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'New Connection', icon: <CloudSync />, path: '/connect' },
    { text: 'Active Sessions', icon: <Storage />, path: '/sessions' },
    { text: 'Saved Connections', icon: <Storage />, path: '/saved' },
    { text: 'Settings', icon: <Settings />, path: '/settings' },
  ];

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Mutagen GUI
        </Typography>
      </Toolbar>
      <Box sx={{ p: 2 }}>
        <Chip
          icon={
            <FiberManualRecord
              sx={{
                color: daemonStatus === 'running' ? '#10b981' : '#ef4444',
                fontSize: 12,
              }}
            />
          }
          label={`Daemon: ${daemonStatus}`}
          size="small"
          variant="outlined"
        />
      </Box>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton onClick={() => navigate(item.path)}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            Mutagen Sync Manager
          </Typography>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
    </>
  );
}

function AppContent() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState<string>('unknown');
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for navigation from Electron menu
    if (window.electronAPI) {
      window.electronAPI.onNavigate((path: string) => {
        navigate(path);
      });

      // Handle import/export from menu
      window.electronAPI.onExportConnections(() => {
        // Trigger export
        apiClient.exportConnections().then((data) => {
          if (window.electronAPI) {
            window.electronAPI.saveExportFile(data);
          }
        });
      });

      window.electronAPI.onImportConnections(async (filePath: string) => {
        try {
          const response = await fetch(filePath);
          const data = await response.json();
          const result = await apiClient.importConnections(data);
          alert(`Imported ${result.imported} connections, skipped ${result.skipped} duplicates.`);
        } catch (error) {
          alert(`Import failed: ${error}`);
        }
      });
    }

    // Connect WebSocket
    wsClient.connect();

    // Check daemon status
    const checkDaemon = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/daemon/status');
        const data = await response.json();
        setDaemonStatus(data.status);
      } catch (error) {
        console.error('Failed to check daemon status:', error);
        setDaemonStatus('error');
      }
    };

    checkDaemon();
    const interval = setInterval(checkDaemon, 30000); // Check every 30 seconds instead of 5

    return () => {
      clearInterval(interval);
      wsClient.disconnect();
    };
  }, []);

  return (
    <Box sx={{ display: 'flex' }}>
      <Navigation
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        daemonStatus={daemonStatus}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Container maxWidth="lg">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/connect" element={<ConnectionForm />} />
            <Route path="/connections/edit/:id" element={<ConnectionForm />} />
            <Route path="/sessions" element={<SessionList />} />
            <Route path="/connections" element={<SavedConnections />} />
            <Route path="/saved" element={<SavedConnections />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Container>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <CssBaseline />
          <AppContent />
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;