import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box, Typography, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { ExpenseList } from '../components/expenses/ExpenseList';
import { ExpenseFiltersComponent } from '../components/expenses/ExpenseFilters';
import type { ExpenseFilters } from '../types/expense';

export function ExpensesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ExpenseFilters>({});

  const handleFiltersChange = (newFilters: ExpenseFilters) => {
    setFilters(newFilters);
  };

  const handleSearchChange = (searchTerm: string) => {
    setFilters((prev) => ({ ...prev, search: searchTerm }));
  };

  const handleRowClick = (expense: { id: string }) => {
    navigate(`/expenses/${expense.id}`);
  };

  const handleEdit = (expense: { id: string }) => {
    navigate(`/expenses/${expense.id}/edit`);
  };

  const handleAddExpense = () => {
    navigate('/expenses/new');
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Expenses
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddExpense}
        >
          Add Expense
        </Button>
      </Box>

      <ExpenseFiltersComponent
        onFiltersChange={handleFiltersChange}
        onSearchChange={handleSearchChange}
      />

      <ExpenseList
        filters={filters}
        onRowClick={handleRowClick}
        onEdit={handleEdit}
      />
    </Container>
  );
}
