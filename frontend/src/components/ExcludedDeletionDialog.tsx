import React, { useMemo } from 'react';
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
  ListItemIcon,
  Checkbox,
  Alert,
  Chip,
  FormControlLabel,
  Divider
} from '@mui/material';
import {
  WarningAmber,
  DeleteForever,
  Cloud
} from '@mui/icons-material';
import { ExcludedDeletionItem } from '../api/client';

interface ExcludedDeletionDialogProps {
  open: boolean;
  connectionName: string;
  items: ExcludedDeletionItem[];
  selected: string[];
  onToggle: (path: string) => void;
  onDelete: () => void;
  onSkip: () => void;
  onCancel: () => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
  busy?: boolean;
}

const ExcludedDeletionDialog: React.FC<ExcludedDeletionDialogProps> = ({
  open,
  connectionName,
  items,
  selected,
  onToggle,
  onDelete,
  onSkip,
  onCancel,
  remember,
  onRememberChange,
  busy = false
}) => {
  const remoteOnlyCount = useMemo(
    () => items.filter(i => i.exists_remote && !i.exists_local && selected.includes(i.path)).length,
    [items, selected]
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningAmber color="warning" />
          Delete excluded paths on the remote?
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          These excluded paths still exist on the remote for <strong>{connectionName}</strong>.
          Deletion happens on the remote only and cannot be undone. Your local files are never touched.
        </Alert>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Tick the paths you want removed from the remote:
        </Typography>

        <List dense>
          {items.map((item) => {
            const remoteOnly = item.exists_remote && !item.exists_local;
            const checked = selected.includes(item.path);
            return (
              <ListItem
                key={item.path}
                onClick={() => !busy && onToggle(item.path)}
                sx={{
                  bgcolor: remoteOnly ? 'error.50' : 'grey.50',
                  mb: 1,
                  borderRadius: 1,
                  border: remoteOnly ? '1px solid' : 'none',
                  borderColor: 'error.light',
                  cursor: busy ? 'default' : 'pointer'
                }}
                secondaryAction={
                  remoteOnly ? (
                    <Chip size="small" color="error" label="remote only, no local copy" />
                  ) : (
                    <Chip size="small" variant="outlined" label="also local, will re-sync" />
                  )
                }
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Checkbox
                    edge="start"
                    checked={checked}
                    disabled={busy}
                    color={remoteOnly ? 'error' : 'primary'}
                    inputProps={{ readOnly: true, tabIndex: -1 }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={item.path}
                  primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                />
              </ListItem>
            );
          })}
        </List>

        {remoteOnlyCount > 0 && (
          <Alert severity="error" icon={<DeleteForever />} sx={{ mt: 1 }}>
            {remoteOnlyCount} selected path{remoteOnlyCount > 1 ? 's' : ''} exist only on the remote.
            There is no local copy, so deleting {remoteOnlyCount > 1 ? 'them' : 'it'} is permanent.
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />
        <FormControlLabel
          control={
            <Checkbox
              checked={remember}
              disabled={busy}
              onChange={(e) => onRememberChange(e.target.checked)}
            />
          }
          label="Remember my choice for this connection (stop asking on connect)"
        />
        {remember && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4, mt: -0.5 }}>
            Delete: this connection will delete excluded paths from the remote automatically each time.
            Skip: it will stop deleting them. You can change this later in the connection settings.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel connect
        </Button>
        <Button
          variant="outlined"
          startIcon={<Cloud />}
          onClick={onSkip}
          disabled={busy}
        >
          Skip, keep remote files
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteForever />}
          onClick={onDelete}
          disabled={busy || selected.length === 0}
        >
          Delete {selected.length > 0 ? `${selected.length} ` : ''}&amp; connect
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExcludedDeletionDialog;
