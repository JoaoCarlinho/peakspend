import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Paper,
  Snackbar,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { ExpenseDetail } from '../components/expenses/ExpenseDetail';
import { ExpenseForm } from '../components/expenses/ExpenseForm';
import {
  useExpense,
  useUpdateExpense,
  useDeleteExpense,
  useCreateExpense,
} from '../hooks/useExpenses';
import type { UpdateExpenseInput, CreateExpenseInput } from '../types/expense';

export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNewExpense = id === 'new';
  const [isEditing, setIsEditing] = useState(isNewExpense);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const { data: expense, isLoading, isError, error } = useExpense(id!);
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (isNewExpense) {
      // When creating a new expense, cancel means go back to list
      navigate('/expenses');
    } else {
      // When editing, cancel means exit edit mode
      setIsEditing(false);
    }
  };

  const handleSubmit = async (data: UpdateExpenseInput | CreateExpenseInput) => {
    try {
      if (isNewExpense) {
        const newExpense = await createMutation.mutateAsync(data as CreateExpenseInput);
        setSnackbar({
          open: true,
          message: 'Expense created successfully',
          severity: 'success',
        });
        setTimeout(() => navigate(`/expenses/${newExpense.id}`), 1000);
      } else {
        await updateMutation.mutateAsync({ id: id!, input: data as UpdateExpenseInput });
        setSnackbar({
          open: true,
          message: 'Expense updated successfully',
          severity: 'success',
        });
        setIsEditing(false);
      }
    } catch {
      setSnackbar({
        open: true,
        message: isNewExpense ? 'Failed to create expense' : 'Failed to update expense',
        severity: 'error',
      });
    }
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id!);
      setSnackbar({
        open: true,
        message: 'Expense deleted successfully',
        severity: 'success',
      });
      setDeleteDialogOpen(false);
      setTimeout(() => navigate('/expenses'), 1000);
    } catch {
      setSnackbar({
        open: true,
        message: 'Failed to delete expense',
        severity: 'error',
      });
      setDeleteDialogOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
  };

  const handleBack = () => {
    navigate('/expenses');
  };

  // Show loading state only when fetching existing expense
  if (!isNewExpense && isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading expense...
        </Typography>
      </Container>
    );
  }

  // Show error state only when fetching existing expense failed
  if (!isNewExpense && (isError || !expense)) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Failed to load expense'}
        </Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>
          Back to Expenses
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{ mb: 2 }}
        >
          Back to Expenses
        </Button>
        <Typography variant="h4" component="h1">
          {isNewExpense ? 'Create Expense' : isEditing ? 'Edit Expense' : 'Expense Details'}
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        {isEditing ? (
          <ExpenseForm
            expense={expense}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
            isSubmitting={isNewExpense ? createMutation.isPending : updateMutation.isPending}
          />
        ) : (
          <ExpenseDetail
            expense={expense}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
      >
        <DialogTitle>Delete Expense?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this expense? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
