/**
 * AddGoalForm Component
 *
 * Form for creating new budget goals.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Box,
  Alert,
} from '@mui/material';
import type { CreateGoalInput, GoalType } from '../../services/goalsService';

export interface AddGoalFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateGoalInput) => Promise<void>;
  categories?: string[];
}

const goalTypes: { value: GoalType; label: string; description: string }[] = [
  { value: 'savings', label: 'Savings Goal', description: 'Save money toward a target' },
  { value: 'spending_limit', label: 'Spending Limit', description: 'Limit spending in a category' },
  { value: 'reduction', label: 'Reduction Goal', description: 'Reduce spending over time' },
];

export const AddGoalForm: React.FC<AddGoalFormProps> = ({
  open,
  onClose,
  onSubmit,
  categories = [],
}) => {
  const [description, setDescription] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('savings');
  const [category, setCategory] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError('Please enter a goal description');
      return;
    }

    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid target amount');
      return;
    }

    if (!deadline) {
      setError('Please select a deadline');
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        description: description.trim(),
        goalType,
        category: category || undefined,
        targetAmount: amount,
        deadline,
      });
      handleClose();
    } catch (err) {
      setError('Failed to create goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDescription('');
    setGoalType('savings');
    setCategory('');
    setTargetAmount('');
    setDeadline('');
    setError(null);
    onClose();
  };

  // Default deadline to 30 days from now
  const minDate = new Date().toISOString().split('T')[0];
  const defaultDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create New Goal</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Goal Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Save for vacation, Reduce dining out"
              required
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Goal Type</InputLabel>
              <Select
                value={goalType}
                label="Goal Type"
                onChange={(e) => setGoalType(e.target.value as GoalType)}
              >
                {goalTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    <Box>
                      <Box>{type.label}</Box>
                      <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {type.description}
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Category (Optional)</InputLabel>
              <Select
                value={category}
                label="Category (Optional)"
                onChange={(e) => setCategory(e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Target Amount"
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              inputProps={{ min: 0, step: 0.01 }}
              required
              fullWidth
            />

            <TextField
              label="Deadline"
              type="date"
              value={deadline || defaultDeadline}
              onChange={(e) => setDeadline(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: minDate }}
              required
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creating...' : 'Create Goal'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
