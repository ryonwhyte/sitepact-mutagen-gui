import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
  Alert,
  LinearProgress
} from '@mui/material';
import {
  CloudDownload,
  CloudUpload,
  Sync
} from '@mui/icons-material';

interface InitialSyncDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (direction: 'download' | 'upload' | 'skip') => void;
  connectionName: string;
  localPath: string;
  remotePath: string;
  isFirstTime: boolean;
  isSyncing?: boolean;
}

const InitialSyncDialog: React.FC<InitialSyncDialogProps> = ({
  open,
  onClose,
  onConfirm,
  connectionName,
  localPath,
  remotePath,
  isFirstTime,
  isSyncing = false
}) => {
  const [syncDirection, setSyncDirection] = useState<'download' | 'upload' | 'skip'>('download');

  const handleConfirm = () => {
    onConfirm(syncDirection);
  };

  return (
    <Dialog open={open} onClose={!isSyncing ? onClose : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center">
          <Sync sx={{ mr: 1 }} />
          {isFirstTime ? 'Initial Sync Setup' : 'Sync Direction'}
        </Box>
      </DialogTitle>

      <DialogContent>
        {isSyncing ? (
          <Box>
            <Typography variant="body1" gutterBottom>
              Performing initial sync...
            </Typography>
            <LinearProgress sx={{ mt: 2, mb: 1 }} />
            <Typography variant="caption" color="text.secondary">
              This may take a few moments depending on the size of your files.
            </Typography>
          </Box>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              {isFirstTime
                ? `Setting up connection "${connectionName}" for the first time. Choose how to sync your files initially.`
                : `Connection "${connectionName}" already exists. Choose how to sync before starting.`}
            </Alert>

            <Typography variant="subtitle2" gutterBottom>
              Local Path: <code>{localPath}</code>
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              Remote Path: <code>{remotePath}</code>
            </Typography>

            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" gutterBottom>
                Choose initial sync direction:
              </Typography>

              <RadioGroup
                value={syncDirection}
                onChange={(e) => setSyncDirection(e.target.value as 'download' | 'upload' | 'skip')}
              >
                <FormControlLabel
                  value="download"
                  control={<Radio />}
                  label={
                    <Box display="flex" alignItems="center">
                      <CloudDownload sx={{ mr: 1, color: 'primary.main' }} />
                      <Box>
                        <Typography variant="body1">
                          Download from Remote
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Download all files from the remote server to your local folder
                        </Typography>
                      </Box>
                    </Box>
                  }
                />

                <FormControlLabel
                  value="upload"
                  control={<Radio />}
                  label={
                    <Box display="flex" alignItems="center">
                      <CloudUpload sx={{ mr: 1, color: 'secondary.main' }} />
                      <Box>
                        <Typography variant="body1">
                          Upload to Remote
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Upload all files from your local folder to the remote server
                        </Typography>
                      </Box>
                    </Box>
                  }
                />

                <FormControlLabel
                  value="skip"
                  control={<Radio />}
                  label={
                    <Box display="flex" alignItems="center">
                      <Sync sx={{ mr: 1, color: 'warning.main' }} />
                      <Box>
                        <Typography variant="body1">
                          Skip Initial Sync
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Start Mutagen sync without initial file transfer (use existing files)
                        </Typography>
                      </Box>
                    </Box>
                  }
                />
              </RadioGroup>
            </Box>

            {syncDirection !== 'skip' && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {syncDirection === 'download'
                  ? 'This will overwrite any existing files in your local folder.'
                  : 'This will overwrite any existing files on the remote server.'}
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      {!isSyncing && (
        <DialogActions>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirm} variant="contained" autoFocus>
            {syncDirection === 'skip' ? 'Skip & Continue' : 'Start Sync'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default InitialSyncDialog;