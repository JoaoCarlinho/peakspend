import { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  Box,
  TextField,
  Button,
  Stack,
  FormControl,
  FormLabel,
  FormHelperText,
  InputAdornment,
  Alert,
  CircularProgress,
  Typography,
  IconButton,
} from '@mui/material';
import { CloudUpload, Delete as DeleteIcon } from '@mui/icons-material';
import { CategorySelect } from '../categories/CategorySelect';
import { CategorySuggestions } from '../ml-suggestions/CategorySuggestions';
import { ErrorDetection } from '../ml-suggestions/ErrorDetection';
import { useCategorySuggestions } from '../../hooks/useMLRecommendations';
import { receiptService, type OcrResult } from '../../services/receiptService';
import type { Expense, CreateExpenseInput, UpdateExpenseInput } from '../../types/expense';

interface ExpenseFormProps {
  expense?: Expense;
  onSubmit: (data: CreateExpenseInput | UpdateExpenseInput) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

interface ExpenseFormData {
  merchant: string;
  amount: string;
  date: string;
  notes: string;
  categoryId: string;
}

export function ExpenseForm({ expense, onSubmit, onCancel, isSubmitting = false }: ExpenseFormProps) {
  // Receipt upload state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>(expense?.receiptUrl ?? undefined);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [showOcrReview, setShowOcrReview] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors: formErrors, isValid },
    watch,
    setValue,
  } = useForm<ExpenseFormData>({
    mode: 'onChange',
    defaultValues: {
      merchant: expense?.merchant || '',
      amount: expense?.amount?.toString() || '',
      date: expense?.date ? expense.date.split('T')[0] : new Date().toISOString().split('T')[0],
      notes: expense?.notes || '',
      categoryId: expense?.categoryId || '',
    },
  });

  // Watch form fields for ML suggestions
  const merchant = watch('merchant');
  const amount = watch('amount');
  const date = watch('date');
  const notes = watch('notes');
  const categoryId = watch('categoryId');

  // Fetch ML suggestions with integrated error detection
  const {
    suggestions,
    errors,
    coldStart,
    isLoading: isSuggestionsLoading,
    metrics,
  } = useCategorySuggestions(
    merchant || '',
    parseFloat(amount) || 0,
    {
      date: date || new Date().toISOString(),
      notes: notes || undefined,
      category: categoryId || undefined,
      enabled: !!(merchant && merchant.length >= 2 && amount && parseFloat(amount) > 0),
    }
  );

  // Handle suggestion selection
  const handleSuggestionSelect = (selectedCategoryId: string, categoryName: string) => {
    setValue('categoryId', selectedCategoryId, { shouldValidate: true });
  };

  // Handle receipt file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setOcrResult(null);
    setShowOcrReview(false);

    // Validate file
    const validation = receiptService.validateFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file');
      return;
    }

    setReceiptFile(file);

    // Auto-upload and process OCR
    setIsUploading(true);
    try {
      // Step 1: Upload to S3
      const uploadResponse = await receiptService.uploadReceipt(file);
      setReceiptUrl(uploadResponse.receiptUrl);

      // Step 2: Process OCR
      setIsProcessingOcr(true);
      const ocrData = await receiptService.processOcr(uploadResponse.key);
      setOcrResult(ocrData);
      setShowOcrReview(true);

      // Step 3: Auto-populate form fields
      if (ocrData.merchant) {
        setValue('merchant', ocrData.merchant, { shouldValidate: true });
      }
      if (ocrData.amount) {
        setValue('amount', ocrData.amount.toString(), { shouldValidate: true });
      }
      if (ocrData.date) {
        // Convert ISO date to YYYY-MM-DD format
        const dateObj = new Date(ocrData.date);
        const formattedDate = dateObj.toISOString().split('T')[0];
        setValue('date', formattedDate, { shouldValidate: true });
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Failed to process receipt'
      );
    } finally {
      setIsUploading(false);
      setIsProcessingOcr(false);
    }
  };

  // Remove receipt
  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptUrl(undefined);
    setUploadError(null);
    setOcrResult(null);
    setShowOcrReview(false);
  };

  const handleFormSubmit = async (data: ExpenseFormData) => {
    // Receipt is already uploaded during file selection
    // Convert YYYY-MM-DD to ISO datetime string (YYYY-MM-DDTHH:mm:ss.sssZ)
    const dateObject = new Date(data.date);
    const isoDate = dateObject.toISOString();

    const formattedData = {
      merchant: data.merchant,
      amount: parseFloat(data.amount),
      date: isoDate,
      notes: data.notes && data.notes.trim() !== '' ? data.notes : undefined,
      categoryId: data.categoryId && data.categoryId.trim() !== '' ? data.categoryId : undefined,
      receiptUrl: receiptUrl,
    };

    onSubmit(formattedData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit(handleFormSubmit)} noValidate>
      <Stack spacing={3}>
        {/* Error Detection */}
        {errors && errors.length > 0 && (
          <ErrorDetection errors={errors} isLoading={isSuggestionsLoading} />
        )}

        {/* OCR Processing Status */}
        {isProcessingOcr && (
          <Alert severity="info" icon={<CircularProgress size={20} />}>
            Processing receipt with OCR... This may take a few seconds.
          </Alert>
        )}

        {/* OCR Results Review */}
        {showOcrReview && ocrResult && (
          <Alert
            severity="success"
            onClose={() => setShowOcrReview(false)}
            sx={{ '& .MuiAlert-message': { width: '100%' } }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Receipt data extracted successfully! Review and edit if needed:
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {ocrResult.merchant && (
                <Typography variant="body2">
                  Merchant: <strong>{ocrResult.merchant}</strong>
                  {ocrResult.confidence.merchant && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      ({Math.round(ocrResult.confidence.merchant)}% confidence)
                    </Typography>
                  )}
                </Typography>
              )}
              {ocrResult.amount && (
                <Typography variant="body2">
                  Amount: <strong>${ocrResult.amount.toFixed(2)}</strong>
                  {ocrResult.confidence.amount && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      ({Math.round(ocrResult.confidence.amount)}% confidence)
                    </Typography>
                  )}
                </Typography>
              )}
              {ocrResult.date && (
                <Typography variant="body2">
                  Date: <strong>{new Date(ocrResult.date).toLocaleDateString()}</strong>
                  {ocrResult.confidence.date && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      ({Math.round(ocrResult.confidence.date)}% confidence)
                    </Typography>
                  )}
                </Typography>
              )}
            </Box>
          </Alert>
        )}

        {/* Merchant */}
        <FormControl error={!!formErrors.merchant} fullWidth>
          <FormLabel required>Merchant</FormLabel>
          <Controller
            name="merchant"
            control={control}
            rules={{
              required: 'Merchant is required',
              minLength: { value: 1, message: 'Merchant name cannot be empty' },
            }}
            render={({ field }) => (
              <TextField
                {...field}
                error={!!formErrors.merchant}
                placeholder="Enter merchant name"
                disabled={isSubmitting}
              />
            )}
          />
          {formErrors.merchant && (
            <FormHelperText>{formErrors.merchant.message}</FormHelperText>
          )}
        </FormControl>

        {/* Amount */}
        <FormControl error={!!formErrors.amount} fullWidth>
          <FormLabel required>Amount</FormLabel>
          <Controller
            name="amount"
            control={control}
            rules={{
              required: 'Amount is required',
              validate: {
                positive: (value) => {
                  const num = parseFloat(value);
                  return (num > 0 && !isNaN(num)) || 'Amount must be a positive number';
                },
              },
            }}
            render={({ field }) => (
              <TextField
                {...field}
                type="number"
                error={!!formErrors.amount}
                placeholder="0.00"
                disabled={isSubmitting}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                inputProps={{
                  step: '0.01',
                  min: '0',
                }}
              />
            )}
          />
          {formErrors.amount && (
            <FormHelperText>{formErrors.amount.message}</FormHelperText>
          )}
        </FormControl>

        {/* Date */}
        <FormControl error={!!formErrors.date} fullWidth>
          <FormLabel required>Date</FormLabel>
          <Controller
            name="date"
            control={control}
            rules={{
              required: 'Date is required',
            }}
            render={({ field }) => (
              <TextField
                {...field}
                type="date"
                error={!!formErrors.date}
                disabled={isSubmitting}
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
          {formErrors.date && (
            <FormHelperText>{formErrors.date.message}</FormHelperText>
          )}
        </FormControl>

        {/* ML Category Suggestions */}
        {(suggestions.length > 0 || isSuggestionsLoading) && (
          <CategorySuggestions
            suggestions={suggestions}
            isLoading={isSuggestionsLoading}
            onSelect={handleSuggestionSelect}
            selectedCategoryId={categoryId}
          />
        )}

        {/* Category */}
        <FormControl fullWidth>
          <FormLabel>Category</FormLabel>
          <Controller
            name="categoryId"
            control={control}
            render={({ field }) => (
              <CategorySelect
                value={field.value}
                onChange={field.onChange}
                disabled={isSubmitting}
                allowEmpty={true}
              />
            )}
          />
        </FormControl>

        {/* Notes */}
        <FormControl fullWidth>
          <FormLabel>Notes</FormLabel>
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                multiline
                rows={4}
                placeholder="Add notes about this expense..."
                disabled={isSubmitting}
              />
            )}
          />
        </FormControl>

        {/* Receipt Upload */}
        <FormControl fullWidth>
          <FormLabel>Receipt</FormLabel>
          <Box sx={{ mt: 1 }}>
            {uploadError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {uploadError}
              </Alert>
            )}

            {receiptFile || receiptUrl ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {receiptFile ? receiptFile.name : 'Receipt uploaded'}
                </Typography>
                <IconButton
                  size="small"
                  onClick={handleRemoveReceipt}
                  disabled={isSubmitting || isUploading}
                  aria-label="Remove receipt"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ) : (
              <Button
                component="label"
                variant="outlined"
                startIcon={<CloudUpload />}
                disabled={isSubmitting || isUploading}
                fullWidth
              >
                Upload Receipt
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  onChange={handleFileChange}
                />
              </Button>
            )}

            <FormHelperText>
              Supported formats: JPG, PNG, PDF (max 10MB). Form will auto-fill from receipt.
            </FormHelperText>
          </Box>
        </FormControl>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            onClick={onCancel}
            disabled={isSubmitting || isUploading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!isValid || isSubmitting || isUploading || isProcessingOcr}
            startIcon={(isUploading || isProcessingOcr) ? <CircularProgress size={20} /> : undefined}
          >
            {isUploading
              ? 'Uploading...'
              : isProcessingOcr
              ? 'Processing...'
              : isSubmitting
              ? 'Saving...'
              : 'Save'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
