/**
 * GoalsList Component
 *
 * Displays a list of budget goals with filtering and actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { GoalCard } from './GoalCard';
import { AddGoalForm } from './AddGoalForm';
import { goalsService, BudgetGoal, GoalStatus, CreateGoalInput } from '../../services/goalsService';

export interface GoalsListProps {
  categories?: string[];
}

export const GoalsList: React.FC<GoalsListProps> = ({ categories = [] }) => {
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('all');
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [progressAmount, setProgressAmount] = useState('');

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await goalsService.getGoals();
      setGoals(data);
      setError(null);
    } catch (err) {
      setError('Failed to load goals');
      console.error('Failed to fetch goals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleCreateGoal = async (input: CreateGoalInput) => {
    const newGoal = await goalsService.createGoal(input);
    setGoals((prev) => [newGoal, ...prev]);
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) {
      return;
    }
    try {
      await goalsService.deleteGoal(goalId);
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch {
      setError('Failed to delete goal');
    }
  };

  const handleAddProgress = (goalId: string) => {
    setSelectedGoalId(goalId);
    setProgressAmount('');
    setProgressDialogOpen(true);
  };

  const handleProgressSubmit = async () => {
    if (!selectedGoalId) return;

    const amount = parseFloat(progressAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    try {
      const updatedGoal = await goalsService.updateProgress(selectedGoalId, { amount });
      setGoals((prev) => prev.map((g) => (g.id === selectedGoalId ? updatedGoal : g)));
      setProgressDialogOpen(false);
      setSelectedGoalId(null);
    } catch {
      setError('Failed to update progress');
    }
  };

  const filteredGoals =
    statusFilter === 'all' ? goals : goals.filter((g) => g.status === statusFilter);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Budget Goals</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddFormOpen(true)}
        >
          Add Goal
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value as GoalStatus | 'all')}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="achieved">Achieved</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="abandoned">Abandoned</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Goals Grid */}
      {filteredGoals.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            {statusFilter === 'all'
              ? 'No goals yet. Create your first budget goal!'
              : `No ${statusFilter} goals found.`}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredGoals.map((goal) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={goal.id}>
              <GoalCard
                goal={goal}
                onDelete={handleDeleteGoal}
                onAddProgress={handleAddProgress}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add Goal Form */}
      <AddGoalForm
        open={addFormOpen}
        onClose={() => setAddFormOpen(false)}
        onSubmit={handleCreateGoal}
        categories={categories}
      />

      {/* Progress Dialog */}
      <Dialog open={progressDialogOpen} onClose={() => setProgressDialogOpen(false)}>
        <DialogTitle>Add Progress</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Amount"
            type="number"
            fullWidth
            value={progressAmount}
            onChange={(e) => setProgressAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            inputProps={{ min: 0, step: 0.01 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleProgressSubmit} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
