import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Stack,
  Alert,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Label as LabelIcon,
} from '@mui/icons-material';
import type { Category } from '../../types/category';

interface CategoryListProps {
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

export function CategoryList({ categories, onEdit, onDelete }: CategoryListProps) {
  const defaultCategories = categories.filter((cat) => cat.isDefault);
  const customCategories = categories.filter((cat) => !cat.isDefault);

  const renderCategory = (category: Category) => (
    <Box
      key={category.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 2,
        mb: 1,
        borderRadius: 1,
        bgcolor: 'grey.50',
        '&:hover': {
          bgcolor: 'grey.100',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            backgroundColor: category.color || '#9E9E9E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LabelIcon sx={{ color: 'white' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight="medium">
            {category.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {category.isDefault ? 'System Category' : 'Custom Category'}
            {category._count && ` • ${category._count.expenses} expenses`}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        {!category.isDefault && (
          <>
            <IconButton
              size="small"
              onClick={() => onEdit(category)}
              aria-label="Edit category"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => onDelete(category)}
              aria-label="Delete category"
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </Box>
    </Box>
  );

  return (
    <Stack spacing={3}>
      {/* Default Categories */}
      {defaultCategories.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              System Categories
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Default categories provided by PeakSpend
            </Typography>
            {defaultCategories.map(renderCategory)}
          </CardContent>
        </Card>
      )}

      {/* Custom Categories */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Custom Categories
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your personalized expense categories
          </Typography>
          {customCategories.length > 0 ? (
            customCategories.map(renderCategory)
          ) : (
            <Alert severity="info">
              No custom categories yet. Create your first category to organize expenses your way!
            </Alert>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
