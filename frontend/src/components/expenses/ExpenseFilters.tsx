import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Stack,
  Chip,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Clear as ClearIcon, Search as SearchIcon } from '@mui/icons-material';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../../hooks/useCategories';
import type { ExpenseFilters } from '../../types/expense';

interface ExpenseFiltersProps {
  onFiltersChange: (filters: ExpenseFilters) => void;
  onSearchChange: (search: string) => void;
}

export function ExpenseFiltersComponent({ onFiltersChange, onSearchChange }: ExpenseFiltersProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { data: categories } = useCategories();

  const handleSearchChange = (value: string) => {
    setSearch(value);

    // Clear existing timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    // Set new debounced timer (300ms)
    const timer = setTimeout(() => {
      onSearchChange(value);
    }, 300);

    setSearchDebounceTimer(timer);
  };

  const handleApplyFilters = () => {
    const filters: ExpenseFilters = {};

    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (categoryId) filters.categoryId = categoryId;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);

    onFiltersChange(filters);
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setCategoryId('');
    setMinAmount('');
    setMaxAmount('');
    setSearch('');
    onFiltersChange({});
    onSearchChange('');
  };

  const hasActiveFilters = dateFrom || dateTo || categoryId || minAmount || maxAmount;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack spacing={2}>
        {/* Search */}
        <TextField
          fullWidth
          placeholder="Search merchant or notes..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: search && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => handleSearchChange('')}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {/* Date Range */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="From Date"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200, flex: 1 }}
          />
          <TextField
            label="To Date"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200, flex: 1 }}
          />
        </Box>

        {/* Category Filter */}
        <Box sx={{ minWidth: 200 }}>
          <CategorySelect
            value={categoryId}
            onChange={setCategoryId}
            label="Filter by Category"
            placeholder="All Categories"
            allowEmpty={true}
          />
        </Box>

        {/* Amount Range */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Min Amount"
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            sx={{ minWidth: 200, flex: 1 }}
          />
          <TextField
            label="Max Amount"
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            sx={{ minWidth: 200, flex: 1 }}
          />
        </Box>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={handleApplyFilters}>
            Apply Filters
          </Button>
          <Button variant="outlined" onClick={handleClearFilters} disabled={!hasActiveFilters}>
            Clear All
          </Button>
        </Box>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {dateFrom && (
              <Chip
                label={`From: ${dateFrom}`}
                onDelete={() => setDateFrom('')}
                size="small"
              />
            )}
            {dateTo && (
              <Chip
                label={`To: ${dateTo}`}
                onDelete={() => setDateTo('')}
                size="small"
              />
            )}
            {categoryId && (
              <Chip
                label={`Category: ${categories?.find((c) => c.id === categoryId)?.name || 'Unknown'}`}
                onDelete={() => setCategoryId('')}
                size="small"
              />
            )}
            {minAmount && (
              <Chip
                label={`Min: $${minAmount}`}
                onDelete={() => setMinAmount('')}
                size="small"
              />
            )}
            {maxAmount && (
              <Chip
                label={`Max: $${maxAmount}`}
                onDelete={() => setMaxAmount('')}
                size="small"
              />
            )}
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
