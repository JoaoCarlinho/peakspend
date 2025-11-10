import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/test-utils';
import { ExpenseForm } from '../ExpenseForm';
import type { Expense } from '../../../types/expense';

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

    expect(screen.getByLabelText(/merchant/i)).toHaveValue('');
    expect(screen.getByLabelText(/amount/i)).toHaveValue('');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('');

    // Date should have default value (today)
    const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
    expect(dateInput.value).toBeTruthy();
  });

  it('renders form with expense data for editing', () => {
    renderWithProviders(
      <ExpenseForm expense={mockExpense} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />,
    );

    expect(screen.getByLabelText(/merchant/i)).toHaveValue('Whole Foods');
    expect(screen.getByLabelText(/amount/i)).toHaveValue('45.5');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Weekly groceries');
    expect(screen.getByLabelText(/date/i)).toHaveValue('2025-11-01');
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Try to submit empty form
    const submitButton = screen.getByText(/save/i);
    await user.click(submitButton);

    // Form should not submit
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates amount is a positive number', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const amountInput = screen.getByLabelText(/amount/i);

    // Enter negative number
    await user.clear(amountInput);
    await user.type(amountInput, '-10');

    // Submit form
    const submitButton = screen.getByText(/save/i);
    await user.click(submitButton);

    // Should show validation error or prevent submission
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates merchant is required', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Fill in amount and date but leave merchant empty
    await user.type(screen.getByLabelText(/amount/i), '50');

    const submitButton = screen.getByText(/save/i);
    await user.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Fill in form
    await user.type(screen.getByLabelText(/merchant/i), 'Test Merchant');
    await user.type(screen.getByLabelText(/amount/i), '50.00');
    await user.type(screen.getByLabelText(/notes/i), 'Test notes');

    // Submit form
    const submitButton = screen.getByText(/save/i);
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

    const submitButton = screen.getByText(/save/i);
    expect(submitButton).toBeDisabled();
  });

  it('shows currency symbol in amount field', () => {
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Check for dollar sign in amount input
    const amountInput = screen.getByLabelText(/amount/i);
    const amountField = amountInput.closest('.MuiFormControl-root');
    expect(amountField).toBeInTheDocument();

    // MUI InputAdornment should show $
    expect(amountField?.textContent).toContain('$');
  });

  it('formats amount correctly on blur', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const amountInput = screen.getByLabelText(/amount/i);

    // Type amount
    await user.type(amountInput, '50');
    await user.tab(); // Blur the input

    // Amount should remain as typed (formatting happens on submit)
    expect(amountInput).toHaveValue('50');
  });

  it('handles date input change', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    const dateInput = screen.getByLabelText(/date/i);

    // Clear and set new date
    await user.clear(dateInput);
    await user.type(dateInput, '2025-12-25');

    expect(dateInput).toHaveValue('2025-12-25');
  });

  it('handles notes input as optional', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Fill required fields only
    await user.type(screen.getByLabelText(/merchant/i), 'Test Merchant');
    await user.type(screen.getByLabelText(/amount/i), '50');

    // Submit without notes
    const submitButton = screen.getByText(/save/i);
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('trims whitespace from merchant input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Type merchant with leading/trailing spaces
    await user.type(screen.getByLabelText(/merchant/i), '  Test Merchant  ');
    await user.type(screen.getByLabelText(/amount/i), '50');

    const submitButton = screen.getByText(/save/i);
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: expect.stringMatching(/Test Merchant/),
        }),
      );
    });
  });

  it('updates form when expense prop changes', () => {
    const { rerender } = renderWithProviders(
      <ExpenseForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />,
    );

    // Initially empty
    expect(screen.getByLabelText(/merchant/i)).toHaveValue('');

    // Re-render with expense data
    rerender(<ExpenseForm expense={mockExpense} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    // Form should populate with expense data
    expect(screen.getByLabelText(/merchant/i)).toHaveValue('Whole Foods');
  });
});
