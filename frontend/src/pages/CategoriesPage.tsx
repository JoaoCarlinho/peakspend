import { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { CategoryList } from '../components/categories/CategoryList';
import { CategoryForm } from '../components/categories/CategoryForm';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '../hooks/useCategories';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types/category';

export function CategoriesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>();
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const { data: categories, isLoading, isError, error } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const handleCreateClick = () => {
    setSelectedCategory(undefined);
    setFormOpen(true);
  };

  const handleEditClick = (category: Category) => {
    setSelectedCategory(category);
    setFormOpen(true);
  };

  const handleDeleteClick = (category: Category) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleFormSubmit = async (data: CreateCategoryInput | UpdateCategoryInput) => {
    try {
      if (selectedCategory) {
        await updateMutation.mutateAsync({
          id: selectedCategory.id,
          data: data as UpdateCategoryInput,
        });
        setSnackbar({
          open: true,
          message: 'Category updated successfully',
          severity: 'success',
        });
      } else {
        await createMutation.mutateAsync(data as CreateCategoryInput);
        setSnackbar({
          open: true,
          message: 'Category created successfully',
          severity: 'success',
        });
      }
      setFormOpen(false);
      setSelectedCategory(undefined);
    } catch {
      setSnackbar({
        open: true,
        message: selectedCategory ? 'Failed to update category' : 'Failed to create category',
        severity: 'error',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedCategory) return;

    try {
      await deleteMutation.mutateAsync(selectedCategory.id);
      setSnackbar({
        open: true,
        message: 'Category deleted successfully',
        severity: 'success',
      });
      setDeleteDialogOpen(false);
      setSelectedCategory(undefined);
    } catch {
      setSnackbar({
        open: true,
        message: 'Failed to delete category',
        severity: 'error',
      });
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          Error loading categories: {(error as Error)?.message || 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Categories
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Organize your expenses with custom categories
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateClick}>
          Create Category
        </Button>
      </Box>

      {/* Category List */}
      {categories && categories.length > 0 ? (
        <CategoryList
          categories={categories}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
        />
      ) : (
        <Alert severity="info">No categories found. Create your first category to get started!</Alert>
      )}

      {/* Create/Edit Form Dialog */}
      <CategoryForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setSelectedCategory(undefined);
        }}
        onSubmit={handleFormSubmit}
        category={selectedCategory}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Category</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the category "{selectedCategory?.name}"? This action
            cannot be undone.
          </DialogContentText>
          {selectedCategory?._count && selectedCategory._count.expenses > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This category is used by {selectedCategory._count.expenses} expense(s). Deleting it will
              remove the category from those expenses.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
