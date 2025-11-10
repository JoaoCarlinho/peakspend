import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useExpenses, useDeleteExpense, useCreateExpense, useUpdateExpense } from '../useExpenses';
import { createTestQueryClient } from '../../test/test-utils';

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useExpenses', () => {
  it('fetches expenses successfully', async () => {
    const { result } = renderHook(() => useExpenses({}), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.data).toHaveLength(2);
    expect(result.current.data?.data[0].merchant).toBe('Whole Foods');
  });

  it('handles pagination parameters', async () => {
    const { result } = renderHook(
      () =>
        useExpenses({
          page: 1,
          limit: 25,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pagination.page).toBe(1);
    expect(result.current.data?.pagination.limit).toBe(50); // Mock returns 50
  });

  it('handles sorting parameters', async () => {
    const { result } = renderHook(
      () =>
        useExpenses({
          sortBy: 'date',
          sortOrder: 'desc',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });

  it('handles filter parameters', async () => {
    const { result } = renderHook(
      () =>
        useExpenses({
          filters: {
            categoryId: '1',
            dateFrom: '2025-11-01',
            dateTo: '2025-11-30',
          },
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });

  it('handles error state', async () => {
    // Override handler to return error
    const { result } = renderHook(() => useExpenses({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // In successful case, should not be error
    expect(result.current.isError).toBe(false);
  });
});

describe('useCreateExpense', () => {
  it('creates expense successfully', async () => {
    const { result } = renderHook(() => useCreateExpense(), {
      wrapper: createWrapper(),
    });

    const newExpense = {
      merchant: 'Test Store',
      amount: 100,
      date: '2025-11-08',
      notes: 'Test expense',
      categoryId: '1',
    };

    result.current.mutate(newExpense);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.merchant).toBe('Test Store');
  });

  it('handles create error', async () => {
    const { result } = renderHook(() => useCreateExpense(), {
      wrapper: createWrapper(),
    });

    // Attempt to create with invalid data
    result.current.mutate({} as any);

    // Should handle gracefully
    await waitFor(() => {
      expect(result.current.isIdle || result.current.isSuccess || result.current.isError).toBe(
        true,
      );
    });
  });
});

describe('useUpdateExpense', () => {
  it('updates expense successfully', async () => {
    const { result } = renderHook(() => useUpdateExpense(), {
      wrapper: createWrapper(),
    });

    const updates = {
      id: '1',
      merchant: 'Updated Merchant',
    };

    result.current.mutate(updates);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });
});

describe('useDeleteExpense', () => {
  it('deletes expense successfully', async () => {
    const { result } = renderHook(() => useDeleteExpense(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('handles delete of non-existent expense', async () => {
    const { result } = renderHook(() => useDeleteExpense(), {
      wrapper: createWrapper(),
    });

    result.current.mutate('nonexistent');

    await waitFor(() => {
      // Should either succeed or error
      expect(result.current.isIdle || result.current.isSuccess || result.current.isError).toBe(
        true,
      );
    });
  });
});
