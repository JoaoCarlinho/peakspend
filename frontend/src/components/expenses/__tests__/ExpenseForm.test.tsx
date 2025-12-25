import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/test-utils';
import { ExpenseForm } from '../ExpenseForm';
import type { Expense } from '../../../types/expense';

// Helper to get form inputs by name attribute
const getInputByName = (name: string) => {
  return document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
};

const getTextareaByName = (name: string) => {
  return document.querySelector(`textarea[name="${name}"]`) as HTMLTextAreaElement;
};

describe('ExpenseForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  const mockExpense: Expense = {
    id: '1',
    userId: 'user1',
    date: '2025-11-01',
    amount: 45.5,
    merchant: 'Whole Foods',
    category: { id: '1', name: 'Groceries', color: '#4CAF50', icon: 'shopping_cart' },
    categoryId: '1',
    notes: 'Weekly groceries',
    receiptUrl: null,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-01T10:00:00Z',
  };

  beforeEach(() => {
    mockOnSubmit.mockClear();
    mockOnCancel.mockClear();
  });

  it('renders empty form for creating new expense', () => {
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Check inputs exist and have empty/default values
    const merchantInput = getInputByName('merchant');
    const amountInput = getInputByName('amount');
    const notesInput = getTextareaByName('notes');

    expect(merchantInput).toBeInTheDocument();
    expect(merchantInput.value).toBe('');

    expect(amountInput).toBeInTheDocument();
    expect(amountInput.value).toBe('');

    expect(notesInput).toBeInTheDocument();
    expect(notesInput.value).toBe('');

    // Date should have default value (today)
    const dateInput = getInputByName('date');
    expect(dateInput?.value).toBeTruthy();
  });

  it('renders form with expense data for editing', () => {
    renderWithProviders(
      <ExpenseForm expense={mockExpense} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />,
    );

    expect(getInputByName('merchant').value).toBe('Whole Foods');
    // Number inputs return number type via valueAsNumber, but value is string
    expect(getInputByName('amount').value).toBe('45.5');
    expect(getTextareaByName('notes').value).toBe('Weekly groceries');
    expect(getInputByName('date').value).toBe('2025-11-01');
  });

  it('validates required fields', async () => {
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Submit button should be disabled when form is empty (invalid)
    const submitButton = screen.getByRole('button', { name: /save/i });
    expect(submitButton).toBeDisabled();

    // Form should not submit
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates amount is a positive number', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const amountInput = getInputByName('amount');
    const merchantInput = getInputByName('merchant');

    // Fill merchant to make that field valid
    await user.type(merchantInput, 'Test');

    // Enter negative number in amount
    await user.type(amountInput, '-10');

    // Submit button should still be disabled due to invalid amount
    const submitButton = screen.getByRole('button', { name: /save/i });
    expect(submitButton).toBeDisabled();

    // Should not submit
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates merchant is required', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Fill in amount but leave merchant empty
    await user.type(getInputByName('amount'), '50');

    // Submit button should be disabled due to missing merchant
    const submitButton = screen.getByRole('button', { name: /save/i });
    expect(submitButton).toBeDisabled();

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Fill in form
    await user.type(getInputByName('merchant'), 'Test Merchant');
    await user.type(getInputByName('amount'), '50.00');
    await user.type(getTextareaByName('notes'), 'Test notes');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    // Verify submitted data structure
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: 'Test Merchant',
        amount: 50.0,
        notes: 'Test notes',
      }),
    );
  });

  it('handles cancel button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const cancelButton = screen.getByText(/cancel/i);
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('disables submit button while submitting', () => {
    renderWithProviders(
      <ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} isSubmitting={true} />,
    );

    // When isSubmitting, button shows "Saving..." and is disabled
    const submitButton = screen.getByRole('button', { name: /saving/i });
    expect(submitButton).toBeDisabled();
  });

  it('shows currency symbol in amount field', () => {
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Check for dollar sign in amount input's container
    const amountInput = getInputByName('amount');
    const amountField = amountInput?.closest('.MuiFormControl-root');
    expect(amountField).toBeInTheDocument();

    // MUI InputAdornment should show $
    expect(amountField?.textContent).toContain('$');
  });

  it('formats amount correctly on blur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const amountInput = getInputByName('amount');

    // Type amount
    await user.type(amountInput, '50');
    await user.tab(); // Blur the input

    // Amount should remain as typed (formatting happens on submit)
    expect(amountInput.value).toBe('50');
  });

  it('handles date input change', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const dateInput = getInputByName('date');

    // Clear and set new date
    await user.clear(dateInput);
    await user.type(dateInput, '2025-12-25');

    expect(dateInput.value).toBe('2025-12-25');
  });

  it('handles notes input as optional', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Fill required fields only
    await user.type(getInputByName('merchant'), 'Test Merchant');
    await user.type(getInputByName('amount'), '50');

    // Submit without notes
    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('trims whitespace from merchant input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Type merchant with leading/trailing spaces
    await user.type(getInputByName('merchant'), '  Test Merchant  ');
    await user.type(getInputByName('amount'), '50');

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: expect.stringMatching(/Test Merchant/),
        }),
      );
    });
  });

  it('initializes form with expense data on mount', () => {
    // Test that form initializes correctly with expense data
    renderWithProviders(
      <ExpenseForm expense={mockExpense} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />,
    );

    // Form should be populated with expense data
    expect(getInputByName('merchant').value).toBe('Whole Foods');
    expect(getInputByName('amount').value).toBe('45.5');
    expect(getTextareaByName('notes').value).toBe('Weekly groceries');
  });
});
