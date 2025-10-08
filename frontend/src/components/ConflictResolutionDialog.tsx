import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Alert,
  Chip
} from '@mui/material';
import {
  Warning,
  Computer,
  Cloud
} from '@mui/icons-material';

interface ConflictFile {
  path: string;
  alphaHash?: string;
  betaHash?: string;
}

interface ConflictResolutionDialogProps {
  open: boolean;
  sessionName: string;
  conflicts: ConflictFile[];
  onResolve: (resolution: 'alpha' | 'beta') => void;
  onCancel: () => void;
}

const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  open,
  sessionName,
  conflicts,
  onResolve,
  onCancel
}) => {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Warning color="warning" />
          Sync Conflicts Detected
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          The session <strong>{sessionName}</strong> has {conflicts.length} conflicting file(s).
          Files exist in both locations with different content.
        </Alert>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose which version to keep:
        </Typography>

        <List dense>
          {conflicts.map((conflict, index) => (
            <ListItem key={index} sx={{ bgcolor: 'grey.50', mb: 1, borderRadius: 1 }}>
              <ListItemText
                primary={conflict.path}
                primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
              />
            </ListItem>
          ))}
        </List>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'info.50', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Keep Local:</strong> Your local changes will overwrite the remote files<br/>
            <strong>Keep Remote:</strong> Remote files will overwrite your local changes
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="outlined"
          startIcon={<Cloud />}
          onClick={() => onResolve('beta')}
          color="secondary"
        >
          Keep Remote
        </Button>
        <Button
          variant="contained"
          startIcon={<Computer />}
          onClick={() => onResolve('alpha')}
          color="primary"
        >
          Keep Local
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConflictResolutionDialog;
