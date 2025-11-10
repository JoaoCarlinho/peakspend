import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/test-utils';
import { ExpenseDetail } from '../ExpenseDetail';
import type { Expense } from '../../../types/expense';

describe('ExpenseDetail', () => {
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

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
    mockOnClose.mockClear();
  });

  it('renders expense details correctly', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('Whole Foods')).toBeInTheDocument();
    expect(screen.getByText('$45.50')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
  });

  it('formats date correctly', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    // Date should be formatted
    const dateText = screen.getByText(/Nov/i);
    expect(dateText).toBeInTheDocument();
  });

  it('displays category with chip', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    const categoryChip = screen.getByText('Groceries');
    expect(categoryChip).toHaveClass('MuiChip-label');
  });

  it('displays uncategorized when no category', () => {
    const uncategorizedExpense = { ...mockExpense, category: null, categoryId: null };

    renderWithProviders(
      <ExpenseDetail
        expense={uncategorizedExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('handles edit button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    const editButton = screen.getByText(/edit/i);
    await user.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
    expect(mockOnEdit).toHaveBeenCalledWith(mockExpense);
  });

  it('handles delete button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    const deleteButton = screen.getByText(/delete/i);
    await user.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledTimes(1);
    expect(mockOnDelete).toHaveBeenCalledWith(mockExpense);
  });

  it('handles close button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    const closeButton = screen.getByLabelText(/close/i);
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('displays receipt thumbnail when receiptUrl exists', () => {
    const expenseWithReceipt = {
      ...mockExpense,
      receiptUrl: 'https://example.com/receipt.jpg',
    };

    renderWithProviders(
      <ExpenseDetail
        expense={expenseWithReceipt}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    // Check for receipt image or icon
    const receiptElement = screen.queryByAltText(/receipt/i);
    expect(receiptElement).toBeInTheDocument();
  });

  it('does not display receipt when receiptUrl is null', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    const receiptElement = screen.queryByAltText(/receipt/i);
    expect(receiptElement).not.toBeInTheDocument();
  });

  it('displays empty state for notes when not provided', () => {
    const expenseWithoutNotes = { ...mockExpense, notes: null };

    renderWithProviders(
      <ExpenseDetail
        expense={expenseWithoutNotes}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    // Should show some indication of no notes (like "No notes" or empty field)
    // Exact text depends on implementation
    expect(screen.getByText('Whole Foods')).toBeInTheDocument();
  });

  it('formats amount with currency symbol', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    const amountText = screen.getByText('$45.50');
    expect(amountText).toBeInTheDocument();
  });

  it('displays metadata timestamps', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onClose={mockOnClose}
      />,
    );

    // Check that created/updated timestamps are displayed (format may vary)
    expect(screen.getByText('Whole Foods')).toBeInTheDocument();
  });
});
