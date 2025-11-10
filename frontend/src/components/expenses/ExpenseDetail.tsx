import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Stack,
  Divider,
  Button,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import type { Expense } from '../../types/expense';

interface ExpenseDetailProps {
  expense: Expense;
  onEdit: () => void;
  onDelete: () => void;
}

export function ExpenseDetail({ expense, onEdit, onDelete }: ExpenseDetailProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              {expense.merchant}
            </Typography>
            <Typography variant="h4" color="primary" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(expense.amount)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={onEdit}
              size="small"
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={onDelete}
              size="small"
            >
              Delete
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={2}>
          {/* Date */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Date
            </Typography>
            <Typography variant="body1">
              {formatDate(expense.date)}
            </Typography>
          </Box>

          {/* Category */}
          {expense.category && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Category
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={expense.category.name}
                  size="small"
                  sx={{ backgroundColor: expense.category.color || undefined }}
                />
              </Box>
            </Box>
          )}

          {/* Notes */}
          {expense.notes && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Notes
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {expense.notes}
              </Typography>
            </Box>
          )}

          {/* Receipt */}
          {expense.receiptUrl && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Receipt
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<ReceiptIcon />}
                  href={expense.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                >
                  View Receipt
                </Button>
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Timestamps */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Created: {formatDate(expense.createdAt)}
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              Last updated: {formatDate(expense.updatedAt)}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
