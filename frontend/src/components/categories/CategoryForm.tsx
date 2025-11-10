import { useForm, Controller } from 'react-hook-form';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  FormControl,
  FormLabel,
  FormHelperText,
  Box,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../../types/category';

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCategoryInput | UpdateCategoryInput) => void | Promise<void>;
  category?: Category;
  isSubmitting?: boolean;
}

interface CategoryFormData {
  name: string;
  color: string;
}

const PRESET_COLORS = [
  '#4CAF50', // green
  '#FF9800', // orange
  '#2196F3', // blue
  '#9C27B0', // purple
  '#F44336', // red
  '#00BCD4', // cyan
  '#FFEB3B', // yellow
  '#795548', // brown
  '#607D8B', // blue-grey
  '#E91E63', // pink
  '#3F51B5', // indigo
  '#009688', // teal
];

export function CategoryForm({ open, onClose, onSubmit, category, isSubmitting = false }: CategoryFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<CategoryFormData>({
    mode: 'onChange',
    defaultValues: {
      name: category?.name || '',
      color: category?.color || PRESET_COLORS[0],
    },
  });

  const handleFormSubmit = (data: CategoryFormData) => {
    onSubmit(data);
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{category ? 'Edit Category' : 'Create Category'}</DialogTitle>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <DialogContent>
          <Stack spacing={3}>
            {/* Name */}
            <FormControl error={!!errors.name} fullWidth>
              <FormLabel required>Category Name</FormLabel>
              <Controller
                name="name"
                control={control}
                rules={{
                  required: 'Category name is required',
                  minLength: { value: 1, message: 'Category name cannot be empty' },
                  maxLength: { value: 50, message: 'Category name must be 50 characters or less' },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    error={!!errors.name}
                    placeholder="Enter category name"
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.name && <FormHelperText>{errors.name.message}</FormHelperText>}
            </FormControl>

            {/* Color Picker */}
            <FormControl fullWidth>
              <FormLabel required>Color</FormLabel>
              <Controller
                name="color"
                control={control}
                rules={{ required: 'Please select a color' }}
                render={({ field }) => (
                  <Box sx={{ mt: 1 }}>
                    <ToggleButtonGroup
                      {...field}
                      exclusive
                      onChange={(_, value) => {
                        if (value !== null) {
                          field.onChange(value);
                        }
                      }}
                      aria-label="category color"
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(6, 1fr)',
                        gap: 1,
                        width: '100%',
                      }}
                    >
                      {PRESET_COLORS.map((color) => (
                        <ToggleButton
                          key={color}
                          value={color}
                          aria-label={color}
                          sx={{
                            width: 60,
                            height: 60,
                            backgroundColor: color,
                            border: '2px solid',
                            borderColor: field.value === color ? 'primary.main' : 'grey.300',
                            '&:hover': {
                              backgroundColor: color,
                              opacity: 0.8,
                            },
                            '&.Mui-selected': {
                              backgroundColor: color,
                              borderColor: 'primary.main',
                              borderWidth: 3,
                              '&:hover': {
                                backgroundColor: color,
                              },
                            },
                          }}
                        />
                      ))}
                    </ToggleButtonGroup>
                  </Box>
                )}
              />
            </FormControl>

            {/* Preview */}
            <Controller
              name="color"
              control={control}
              render={({ field }) => (
                <Controller
                  name="name"
                  control={control}
                  render={({ field: nameField }) => (
                    <Box sx={{ mt: 2 }}>
                      <FormLabel>Preview</FormLabel>
                      <Box
                        sx={{
                          mt: 1,
                          p: 2,
                          backgroundColor: field.value,
                          borderRadius: 1,
                          color: 'white',
                          textAlign: 'center',
                          fontWeight: 'medium',
                        }}
                      >
                        {nameField.value || 'Category Name'}
                      </Box>
                    </Box>
                  )}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Saving...' : category ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
