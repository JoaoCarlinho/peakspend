import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Label as LabelIcon } from '@mui/icons-material';
import { useCategories } from '../../hooks/useCategories';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}

export function CategorySelect({
  value,
  onChange,
  error = false,
  disabled = false,
  required = false,
  label = 'Category',
  placeholder = 'Select a category',
  allowEmpty = true,
}: CategorySelectProps) {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <FormControl fullWidth disabled>
        <InputLabel>{label}</InputLabel>
        <Select value="">
          <MenuItem value="">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              Loading categories...
            </Box>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }

  return (
    <FormControl fullWidth error={error} disabled={disabled} required={required}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        renderValue={(selected) => {
          if (!selected) return placeholder;
          const category = categories?.find((cat) => cat.id === selected);
          if (!category) return placeholder;
          return (
            <Chip
              icon={<LabelIcon />}
              label={category.name}
              size="small"
              sx={{
                backgroundColor: category.color || '#9E9E9E',
                color: 'white',
                '& .MuiChip-icon': {
                  color: 'white',
                },
              }}
            />
          );
        }}
      >
        {allowEmpty && (
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
        )}
        {categories?.map((category) => (
          <MenuItem key={category.id} value={category.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: 0.5,
                  backgroundColor: category.color || '#9E9E9E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <LabelIcon sx={{ fontSize: 16, color: 'white' }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box>{category.name}</Box>
                {category.isDefault && (
                  <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    System
                  </Box>
                )}
              </Box>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
