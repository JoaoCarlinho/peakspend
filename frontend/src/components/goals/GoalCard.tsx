/**
 * GoalCard Component
 *
 * Displays a single budget goal with progress indicator and actions.
 */

import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  LinearProgress,
  Box,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SavingsIcon from '@mui/icons-material/Savings';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import type { BudgetGoal, GoalType, GoalStatus } from '../../services/goalsService';

export interface GoalCardProps {
  goal: BudgetGoal;
  onEdit?: (goal: BudgetGoal) => void;
  onDelete?: (goalId: string) => void;
  onAddProgress?: (goalId: string) => void;
}

const goalTypeIcons: Record<GoalType, React.ReactNode> = {
  savings: <SavingsIcon />,
  spending_limit: <TrendingDownIcon />,
  reduction: <TrendingDownIcon />,
};

const goalTypeLabels: Record<GoalType, string> = {
  savings: 'Savings Goal',
  spending_limit: 'Spending Limit',
  reduction: 'Reduction Goal',
};

const statusColors: Record<GoalStatus, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  active: 'primary',
  achieved: 'success',
  failed: 'error',
  abandoned: 'default',
};

export const GoalCard: React.FC<GoalCardProps> = ({ goal, onEdit, onDelete, onAddProgress }) => {
  const daysRemaining = Math.ceil(
    (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysRemaining < 0;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {goalTypeIcons[goal.goalType]}
            <Typography variant="caption" color="text.secondary">
              {goalTypeLabels[goal.goalType]}
            </Typography>
          </Box>
          <Chip label={goal.status} size="small" color={statusColors[goal.status]} />
        </Box>

        <Typography variant="h6" gutterBottom noWrap title={goal.description}>
          {goal.description}
        </Typography>

        {goal.category && (
          <Chip label={goal.category} size="small" variant="outlined" sx={{ mb: 1 }} />
        )}

        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Progress
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {goal.progressPercent.toFixed(0)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(goal.progressPercent, 100)}
            color={goal.progressPercent >= 100 ? 'success' : 'primary'}
            sx={{ height: 8, borderRadius: 1 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {formatCurrency(goal.currentAmount)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatCurrency(goal.targetAmount)}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TrendingUpIcon fontSize="small" color={isOverdue ? 'error' : 'action'} />
          <Typography
            variant="caption"
            color={isOverdue ? 'error.main' : 'text.secondary'}
          >
            {isOverdue
              ? `${Math.abs(daysRemaining)} days overdue`
              : `${daysRemaining} days remaining`}
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
        {goal.status === 'active' && onAddProgress && (
          <Tooltip title="Add progress">
            <IconButton size="small" onClick={() => onAddProgress(goal.id)} color="primary">
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
        {onEdit && (
          <Tooltip title="Edit goal">
            <IconButton size="small" onClick={() => onEdit(goal)}>
              <EditIcon />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title="Delete goal">
            <IconButton size="small" onClick={() => onDelete(goal.id)} color="error">
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        )}
      </CardActions>
    </Card>
  );
};
