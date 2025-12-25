/**
 * BankAccountList Component
 *
 * Displays and manages bank accounts with encrypted storage.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import {
  sensitiveDataService,
  BankAccountSummary,
  BankAccountDetails,
  AddBankAccountInput,
} from '../../services/sensitiveDataService';

export const BankAccountList: React.FC = () => {
  const [accounts, setAccounts] = useState<BankAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState<BankAccountDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AddBankAccountInput>({
    accountNumber: '',
    routingNumber: '',
    nickname: '',
    bankName: '',
    accountType: 'checking',
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await sensitiveDataService.getBankAccounts();
      setAccounts(data);
      setError(null);
    } catch {
      setError('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleAddAccount = async () => {
    if (!formData.accountNumber || !formData.routingNumber) {
      setError('Account number and routing number are required');
      return;
    }

    setFormLoading(true);
    try {
      const newAccount = await sensitiveDataService.addBankAccount(formData);
      setAccounts((prev) => [newAccount, ...prev]);
      setAddFormOpen(false);
      setFormData({
        accountNumber: '',
        routingNumber: '',
        nickname: '',
        bankName: '',
        accountType: 'checking',
      });
    } catch {
      setError('Failed to add bank account');
    } finally {
      setFormLoading(false);
    }
  };

  const handleViewDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const details = await sensitiveDataService.getBankAccountDetails(id);
      setDetailsDialog(details);
    } catch {
      setError('Failed to load account details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this bank account?')) {
      return;
    }
    try {
      await sensitiveDataService.deleteBankAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('Failed to delete bank account');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceIcon color="primary" />
            <Typography variant="h6">Bank Accounts</Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddFormOpen(true)}
          >
            Add Account
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {accounts.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No bank accounts added yet.
          </Typography>
        ) : (
          <List disablePadding>
            {accounts.map((account) => (
              <ListItem key={account.id} divider>
                <ListItemText
                  primary={account.nickname || account.bankName || 'Bank Account'}
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>****{account.lastFour}</span>
                      {account.accountType && (
                        <Chip label={account.accountType} size="small" variant="outlined" />
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => handleViewDetails(account.id)}
                    disabled={loadingDetails}
                  >
                    <VisibilityIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(account.id)} color="error">
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {/* Add Account Dialog */}
        <Dialog open={addFormOpen} onClose={() => setAddFormOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Bank Account</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Account Number"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                required
                fullWidth
                type="password"
                autoComplete="off"
              />
              <TextField
                label="Routing Number"
                value={formData.routingNumber}
                onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value })}
                required
                fullWidth
                inputProps={{ maxLength: 9 }}
              />
              <TextField
                label="Nickname (Optional)"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                fullWidth
              />
              <TextField
                label="Bank Name (Optional)"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>Account Type</InputLabel>
                <Select
                  value={formData.accountType}
                  label="Account Type"
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      accountType: e.target.value as 'checking' | 'savings',
                    })
                  }
                >
                  <MenuItem value="checking">Checking</MenuItem>
                  <MenuItem value="savings">Savings</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddFormOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button onClick={handleAddAccount} variant="contained" disabled={formLoading}>
              {formLoading ? 'Adding...' : 'Add Account'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Details Dialog */}
        <Dialog open={!!detailsDialog} onClose={() => setDetailsDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Account Details</DialogTitle>
          <DialogContent>
            {detailsDialog && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <Alert severity="warning">
                  This information is sensitive. Do not share it with others.
                </Alert>
                <TextField
                  label="Account Number"
                  value={detailsDialog.accountNumber}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                <TextField
                  label="Routing Number"
                  value={detailsDialog.routingNumber}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                {detailsDialog.bankName && (
                  <TextField
                    label="Bank Name"
                    value={detailsDialog.bankName}
                    InputProps={{ readOnly: true }}
                    fullWidth
                  />
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetailsDialog(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};
