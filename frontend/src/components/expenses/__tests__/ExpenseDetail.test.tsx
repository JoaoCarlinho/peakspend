import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
    category: { id: '1', name: 'Groceries', color: '#4CAF50' },
    categoryId: '1',
    notes: 'Weekly groceries',
    receiptUrl: null,
    createdAt: '2025-11-01T10:00:00Z',
    updatedAt: '2025-11-01T10:00:00Z',
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
  });

  it('renders expense details correctly', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
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
      />,
    );

    // Date should be formatted as "November 1, 2025"
    expect(screen.getByText('November 1, 2025')).toBeInTheDocument();
  });

  it('displays category with chip', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    const categoryChip = screen.getByText('Groceries');
    expect(categoryChip).toHaveClass('MuiChip-label');
  });

  it('does not display category section when no category', () => {
    const uncategorizedExpense = { ...mockExpense, category: null, categoryId: null };

    renderWithProviders(
      <ExpenseDetail
        expense={uncategorizedExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Category section should not be rendered
    expect(screen.queryByText('Category')).not.toBeInTheDocument();
  });

  it('handles edit button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('handles delete button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledTimes(1);
  });

  it('displays receipt button when receiptUrl exists', () => {
    const expenseWithReceipt = {
      ...mockExpense,
      receiptUrl: 'https://example.com/receipt.jpg',
    };

    renderWithProviders(
      <ExpenseDetail
        expense={expenseWithReceipt}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Check for receipt button
    const receiptButton = screen.getByRole('link', { name: /view receipt/i });
    expect(receiptButton).toBeInTheDocument();
    expect(receiptButton).toHaveAttribute('href', 'https://example.com/receipt.jpg');
  });

  it('does not display receipt when receiptUrl is null', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    const receiptButton = screen.queryByRole('link', { name: /view receipt/i });
    expect(receiptButton).not.toBeInTheDocument();
  });

  it('does not display notes section when not provided', () => {
    const expenseWithoutNotes = { ...mockExpense, notes: null };

    renderWithProviders(
      <ExpenseDetail
        expense={expenseWithoutNotes}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    // Notes section should not be rendered
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    // But other content should still be present
    expect(screen.getByText('Whole Foods')).toBeInTheDocument();
  });

  it('formats amount with currency symbol', () => {
    renderWithProviders(
      <ExpenseDetail
        expense={mockExpense}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
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
      />,
    );

    // Check that created/updated timestamps are displayed
    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });
});
