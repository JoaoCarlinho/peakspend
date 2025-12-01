/**
 * Component tests for MLPerformanceWidget
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import axios from 'axios';
import { MLPerformanceWidget } from '../../src/components/ml-suggestions/MLPerformanceWidget';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

// Mock useAuth hook
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test_user_123', email: 'test@example.com' },
  }),
}));

describe('MLPerformanceWidget', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderWidget = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MLPerformanceWidget />
      </QueryClientProvider>
    );
  };

  it('renders loading state initially', () => {
    mockedAxios.get.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWidget();

    expect(screen.getByText(/Loading AI performance/i)).toBeInTheDocument();
  });

  it('does not render when no feedback data', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        user_id: 'test_user_123',
        accuracy_7d: 0.0,
        predictions_7d: 0,
        acceptance_rate: 0.0,
        total_feedback: 0, // No feedback
        is_improving: false,
        improvement_message: '',
      },
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders with ML performance data', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        user_id: 'test_user_123',
        accuracy_7d: 0.85,
        predictions_7d: 50,
        acceptance_rate: 82.0,
        total_feedback: 60,
        is_improving: true,
        improvement_message: 'Model improved by +12.5%',
      },
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText(/Your AI Assistant is Learning/i)).toBeInTheDocument();
    });

    // Check accuracy display
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('50 predictions')).toBeInTheDocument();

    // Check acceptance rate
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('60 total')).toBeInTheDocument();

    // Check improvement message
    expect(screen.getByText(/Model improved by \+12\.5%/i)).toBeInTheDocument();
  });

  it('handles high accuracy correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        user_id: 'test_user_123',
        accuracy_7d: 0.92,
        predictions_7d: 100,
        acceptance_rate: 90.0,
        total_feedback: 120,
        is_improving: true,
        improvement_message: 'Model performing excellently',
      },
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });

  it('handles low accuracy correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        user_id: 'test_user_123',
        accuracy_7d: 0.45,
        predictions_7d: 20,
        acceptance_rate: 50.0,
        total_feedback: 25,
        is_improving: false,
        improvement_message: 'Model needs more training data',
      },
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('does not render improvement message when not improving', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        user_id: 'test_user_123',
        accuracy_7d: 0.75,
        predictions_7d: 30,
        acceptance_rate: 70.0,
        total_feedback: 35,
        is_improving: false,
        improvement_message: 'Stable performance',
      },
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    // Should not show improvement message when is_improving is false
    expect(screen.queryByText(/Stable performance/i)).not.toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('API Error'));

    const { container } = renderWidget();

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
