import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Psychology as AIIcon,
  TrendingUp as PatternIcon,
  Rule as RuleIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import type { CategorySuggestion } from '../../types/ml-suggestion';

interface CategorySuggestionsProps {
  suggestions: CategorySuggestion[];
  isLoading: boolean;
  onSelect: (categoryId: string, categoryName: string) => void;
  selectedCategoryId?: string;
}

export function CategorySuggestions({
  suggestions,
  isLoading,
  onSelect,
  selectedCategoryId,
}: CategorySuggestionsProps) {
  if (isLoading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AIIcon color="primary" />
            <Typography variant="subtitle2" fontWeight="medium">
              AI Suggestions
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              Analyzing expense...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'ml':
        return <AIIcon fontSize="small" />;
      case 'pattern':
        return <PatternIcon fontSize="small" />;
      case 'rule':
        return <RuleIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'ml':
        return 'AI Prediction';
      case 'pattern':
        return 'Pattern Match';
      case 'rule':
        return 'Rule Based';
      default:
        return source;
    }
  };

  const getConfidenceColor = (confidence: number): 'success' | 'warning' | 'default' => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'default';
  };

  return (
    <Card variant="outlined" sx={{ bgcolor: 'primary.50', borderColor: 'primary.200' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AIIcon color="primary" />
          <Typography variant="subtitle2" fontWeight="medium" color="primary">
            AI Category Suggestions
          </Typography>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Click a suggestion to auto-fill the category field
        </Typography>

        <Stack spacing={1.5}>
          {suggestions.slice(0, 3).map((suggestion, index) => {
            const isSelected = selectedCategoryId === suggestion.categoryId;
            return (
              <Box
                key={suggestion.categoryId}
                onClick={() => onSelect(suggestion.categoryId, suggestion.categoryName)}
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: isSelected ? 'primary.100' : 'background.paper',
                  border: '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: isSelected ? 'primary.100' : 'grey.50',
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                    boxShadow: 1,
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {index === 0 && (
                      <Chip
                        label="Top Pick"
                        size="small"
                        color="primary"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    <Typography variant="body2" fontWeight="medium">
                      {suggestion.categoryName}
                    </Typography>
                    {isSelected && <CheckIcon color="primary" fontSize="small" />}
                  </Box>
                  <Chip
                    icon={getSourceIcon(suggestion.source)}
                    label={getSourceLabel(suggestion.source)}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                </Box>

                <Box sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Confidence:
                    </Typography>
                    <Chip
                      label={`${(suggestion.confidence * 100).toFixed(0)}%`}
                      size="small"
                      color={getConfidenceColor(suggestion.confidence)}
                      sx={{ height: 18, fontSize: '0.7rem' }}
                    />
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={suggestion.confidence * 100}
                    color={getConfidenceColor(suggestion.confidence)}
                    sx={{ height: 4, borderRadius: 2 }}
                  />
                </Box>

                {suggestion.reasoning && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    {suggestion.reasoning}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>

        {suggestions.length > 3 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            +{suggestions.length - 3} more suggestions available
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
