/**
 * PaymentCardList Component
 *
 * Displays and manages payment cards with encrypted storage.
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
  Chip,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import {
  sensitiveDataService,
  PaymentCardSummary,
  PaymentCardDetails,
  AddPaymentCardInput,
} from '../../services/sensitiveDataService';

const cardTypeColors: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info'> = {
  visa: 'primary',
  mastercard: 'secondary',
  amex: 'info',
  discover: 'warning',
  unknown: 'default',
};

export const PaymentCardList: React.FC = () => {
  const [cards, setCards] = useState<PaymentCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState<PaymentCardDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AddPaymentCardInput>({
    cardNumber: '',
    expiryMonth: new Date().getMonth() + 1,
    expiryYear: new Date().getFullYear() + 1,
    cardholderName: '',
    nickname: '',
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await sensitiveDataService.getPaymentCards();
      setCards(data);
      setError(null);
    } catch {
      setError('Failed to load payment cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleAddCard = async () => {
    if (!formData.cardNumber) {
      setError('Card number is required');
      return;
    }

    setFormLoading(true);
    try {
      const newCard = await sensitiveDataService.addPaymentCard(formData);
      setCards((prev) => [newCard, ...prev]);
      setAddFormOpen(false);
      setFormData({
        cardNumber: '',
        expiryMonth: new Date().getMonth() + 1,
        expiryYear: new Date().getFullYear() + 1,
        cardholderName: '',
        nickname: '',
      });
    } catch {
      setError('Failed to add payment card. Please check the card details.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleViewDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const details = await sensitiveDataService.getPaymentCardDetails(id);
      setDetailsDialog(details);
    } catch {
      setError('Failed to load card details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this payment card?')) {
      return;
    }
    try {
      await sensitiveDataService.deletePaymentCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError('Failed to delete payment card');
    }
  };

  const formatExpiry = (month: number, year: number) => {
    return `${month.toString().padStart(2, '0')}/${year.toString().slice(-2)}`;
  };

  // Generate year options for the next 10 years
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear + i);

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
            <CreditCardIcon color="primary" />
            <Typography variant="h6">Payment Cards</Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddFormOpen(true)}
          >
            Add Card
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {cards.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No payment cards added yet.
          </Typography>
        ) : (
          <List disablePadding>
            {cards.map((card) => (
              <ListItem key={card.id} divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{card.nickname || card.cardholderName || 'Payment Card'}</span>
                      <Chip
                        label={card.cardType.toUpperCase()}
                        size="small"
                        color={cardTypeColors[card.cardType.toLowerCase()] || 'default'}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <span>****{card.lastFour}</span>
                      <span style={{ marginLeft: 16 }}>
                        Exp: {formatExpiry(card.expiryMonth, card.expiryYear)}
                      </span>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => handleViewDetails(card.id)}
                    disabled={loadingDetails}
                  >
                    <VisibilityIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(card.id)} color="error">
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {/* Add Card Dialog */}
        <Dialog open={addFormOpen} onClose={() => setAddFormOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Payment Card</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Card Number"
                value={formData.cardNumber}
                onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                required
                fullWidth
                type="password"
                autoComplete="off"
                inputProps={{ maxLength: 19 }}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="Expiry Month"
                    type="number"
                    value={formData.expiryMonth}
                    onChange={(e) =>
                      setFormData({ ...formData, expiryMonth: parseInt(e.target.value) || 1 })
                    }
                    inputProps={{ min: 1, max: 12 }}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Expiry Year"
                    select
                    value={formData.expiryYear}
                    onChange={(e) =>
                      setFormData({ ...formData, expiryYear: parseInt(e.target.value) })
                    }
                    fullWidth
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
              <TextField
                label="Cardholder Name (Optional)"
                value={formData.cardholderName}
                onChange={(e) => setFormData({ ...formData, cardholderName: e.target.value })}
                fullWidth
              />
              <TextField
                label="Nickname (Optional)"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                fullWidth
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddFormOpen(false)} disabled={formLoading}>
              Cancel
            </Button>
            <Button onClick={handleAddCard} variant="contained" disabled={formLoading}>
              {formLoading ? 'Adding...' : 'Add Card'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Details Dialog */}
        <Dialog open={!!detailsDialog} onClose={() => setDetailsDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Card Details</DialogTitle>
          <DialogContent>
            {detailsDialog && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <Alert severity="warning">
                  This information is sensitive. Do not share it with others.
                </Alert>
                <TextField
                  label="Card Number"
                  value={detailsDialog.cardNumber}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                <TextField
                  label="Card Type"
                  value={detailsDialog.cardType.toUpperCase()}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                <TextField
                  label="Expiry"
                  value={formatExpiry(detailsDialog.expiryMonth, detailsDialog.expiryYear)}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                {detailsDialog.cardholderName && (
                  <TextField
                    label="Cardholder Name"
                    value={detailsDialog.cardholderName}
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
