import type { ReactElement } from 'react';
import { Box, Chip, Tooltip, CircularProgress } from '@mui/material';
import {
  School as SchoolIcon,
  Stars as StarsIcon,
  EmojiEvents as TrophyIcon,
} from '@mui/icons-material';
import { useImprovementMetrics } from '../../hooks/useMLMetrics';

export function LearningBadge() {
  const { data: improvementData, isLoading } = useImprovementMetrics();

  if (isLoading) {
    return <CircularProgress size={20} />;
  }

  if (!improvementData) {
    return null;
  }

  const { learningRate } = improvementData;
  const learningProgress = Math.min(100, Math.max(0, learningRate * 100));

  const getLevel = (progress: number): { label: string; icon: ReactElement; color: 'default' | 'primary' | 'success' } => {
    if (progress >= 80) {
      return {
        label: 'Expert AI',
        icon: <TrophyIcon />,
        color: 'success',
      };
    }
    if (progress >= 50) {
      return {
        label: 'Smart AI',
        icon: <StarsIcon />,
        color: 'primary',
      };
    }
    return {
      label: 'Learning',
      icon: <SchoolIcon />,
      color: 'default',
    };
  };

  const level = getLevel(learningProgress);

  return (
    <Tooltip
      title={
        <Box>
          <Box sx={{ fontWeight: 'bold', mb: 0.5 }}>AI Learning Level</Box>
          <Box sx={{ fontSize: '0.875rem' }}>
            Your AI has completed {learningProgress.toFixed(0)}% of its training
          </Box>
          <Box sx={{ fontSize: '0.875rem', mt: 0.5 }}>
            Accuracy: {(improvementData.accuracyImprovement * 100).toFixed(1)}% improvement
          </Box>
        </Box>
      }
      arrow
    >
      <Chip
        icon={level.icon}
        label={level.label}
        color={level.color}
        size="small"
        sx={{ cursor: 'pointer' }}
      />
    </Tooltip>
  );
}
