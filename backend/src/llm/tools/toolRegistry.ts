/**
 * Tool Registry
 *
 * Maintains metadata about available tools including parameter definitions,
 * descriptions, and examples. This information is used by the Tool Permission
 * Query API to provide clients with discovery information.
 *
 * Usage:
 *   import { toolRegistry, getToolMetadata } from '@/llm/tools/toolRegistry';
 *
 *   // Get metadata for a specific tool
 *   const metadata = getToolMetadata('getExpenses');
 *
 *   // Get all registered tools
 *   const allTools = getAllToolMetadata();
 */

/**
 * Parameter type definitions
 */
export type ParameterType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description: string;
  default?: unknown;
  enum?: string[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/**
 * Tool example
 */
export interface ToolExample {
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Complete tool metadata
 */
export interface ToolMetadata {
  name: string;
  description: string;
  parameters: ToolParameter[];
  examples?: ToolExample[];
  category?: string;
  version?: string;
}

/**
 * Tool registry - maps tool names to their metadata
 */
const toolRegistry = new Map<string, ToolMetadata>();

// Register expense-related tools
toolRegistry.set('getExpenses', {
  name: 'getExpenses',
  description: "Retrieve user's expense records with optional filtering",
  parameters: [
    {
      name: 'category',
      type: 'string',
      required: false,
      description: 'Filter by expense category',
      enum: ['food', 'transport', 'entertainment', 'utilities', 'shopping', 'healthcare', 'travel', 'other'],
    },
    {
      name: 'startDate',
      type: 'date',
      required: false,
      description: 'Filter expenses from this date (ISO format)',
    },
    {
      name: 'endDate',
      type: 'date',
      required: false,
      description: 'Filter expenses until this date (ISO format)',
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Maximum number of results',
      default: 50,
      maximum: 100,
    },
    {
      name: 'offset',
      type: 'number',
      required: false,
      description: 'Number of results to skip for pagination',
      default: 0,
    },
  ],
  examples: [
    {
      description: 'Get all food expenses from last week',
      parameters: { category: 'food', startDate: '2024-12-07' },
    },
    {
      description: 'Get recent expenses with pagination',
      parameters: { limit: 20, offset: 0 },
    },
  ],
  category: 'expenses',
});

toolRegistry.set('getExpensesByCategory', {
  name: 'getExpensesByCategory',
  description: 'Get expenses grouped and summarized by category',
  parameters: [
    {
      name: 'startDate',
      type: 'date',
      required: false,
      description: 'Start of the period to analyze',
    },
    {
      name: 'endDate',
      type: 'date',
      required: false,
      description: 'End of the period to analyze',
    },
  ],
  examples: [
    {
      description: 'Get category breakdown for current month',
      parameters: { startDate: '2024-12-01' },
    },
  ],
  category: 'expenses',
});

toolRegistry.set('searchExpenses', {
  name: 'searchExpenses',
  description: 'Search expenses by various criteria including text, date, and amount',
  parameters: [
    {
      name: 'query',
      type: 'string',
      required: false,
      description: 'Text to search for in description or merchant',
      maxLength: 500,
    },
    {
      name: 'minAmount',
      type: 'number',
      required: false,
      description: 'Minimum expense amount',
      minimum: 0,
    },
    {
      name: 'maxAmount',
      type: 'number',
      required: false,
      description: 'Maximum expense amount',
    },
    {
      name: 'startDate',
      type: 'date',
      required: false,
      description: 'Filter expenses from this date',
    },
    {
      name: 'endDate',
      type: 'date',
      required: false,
      description: 'Filter expenses until this date',
    },
  ],
  examples: [
    {
      description: 'Search for grocery expenses',
      parameters: { query: 'grocery' },
    },
    {
      description: 'Find large expenses',
      parameters: { minAmount: 100 },
    },
  ],
  category: 'expenses',
});

toolRegistry.set('getExpenseStats', {
  name: 'getExpenseStats',
  description: 'Get statistical summary of expenses for a time period',
  parameters: [
    {
      name: 'startDate',
      type: 'date',
      required: false,
      description: 'Start of the period to analyze',
    },
    {
      name: 'endDate',
      type: 'date',
      required: false,
      description: 'End of the period to analyze',
    },
    {
      name: 'groupBy',
      type: 'string',
      required: false,
      description: 'Group statistics by day, week, or month',
      enum: ['day', 'week', 'month'],
      default: 'month',
    },
  ],
  examples: [
    {
      description: 'Get monthly spending statistics',
      parameters: { startDate: '2024-01-01', groupBy: 'month' },
    },
  ],
  category: 'expenses',
});

// Receipt tools
toolRegistry.set('parseReceipt', {
  name: 'parseReceipt',
  description: 'Parse receipt image using OCR to extract expense data',
  parameters: [
    {
      name: 'imageUrl',
      type: 'string',
      required: true,
      description: 'URL of the receipt image to parse',
    },
  ],
  examples: [
    {
      description: 'Parse a receipt image',
      parameters: { imageUrl: 'https://storage.example.com/receipts/abc123.jpg' },
    },
  ],
  category: 'receipts',
});

toolRegistry.set('categorizeExpense', {
  name: 'categorizeExpense',
  description: 'Automatically categorize an expense based on description and merchant',
  parameters: [
    {
      name: 'description',
      type: 'string',
      required: true,
      description: 'Description of the expense',
    },
    {
      name: 'merchant',
      type: 'string',
      required: false,
      description: 'Name of the merchant',
    },
    {
      name: 'amount',
      type: 'number',
      required: false,
      description: 'Amount of the expense',
    },
  ],
  category: 'receipts',
});

toolRegistry.set('suggestCategory', {
  name: 'suggestCategory',
  description: 'Get AI-powered category suggestions for an expense',
  parameters: [
    {
      name: 'description',
      type: 'string',
      required: true,
      description: 'Description of the expense',
    },
  ],
  category: 'receipts',
});

// Budget tools
toolRegistry.set('getBudgets', {
  name: 'getBudgets',
  description: "Get user's budget settings and limits",
  parameters: [],
  category: 'budgets',
});

toolRegistry.set('getBudgetProgress', {
  name: 'getBudgetProgress',
  description: 'Get progress against budget for current period',
  parameters: [
    {
      name: 'category',
      type: 'string',
      required: false,
      description: 'Specific category to check progress for',
    },
  ],
  category: 'budgets',
});

// Admin tools
toolRegistry.set('getAllUsersExpenses', {
  name: 'getAllUsersExpenses',
  description: 'Retrieve expenses for all users (admin dashboard)',
  parameters: [
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Maximum number of results',
      default: 100,
      maximum: 1000,
    },
    {
      name: 'offset',
      type: 'number',
      required: false,
      description: 'Number of results to skip',
      default: 0,
    },
  ],
  category: 'admin',
});

toolRegistry.set('getUserExpenses', {
  name: 'getUserExpenses',
  description: 'Retrieve expenses for a specific user by ID',
  parameters: [
    {
      name: 'userId',
      type: 'string',
      required: true,
      description: 'UUID of the user to retrieve expenses for',
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Maximum number of results',
      default: 50,
    },
  ],
  category: 'admin',
});

toolRegistry.set('getUserStats', {
  name: 'getUserStats',
  description: 'Get expense statistics for a specific user',
  parameters: [
    {
      name: 'userId',
      type: 'string',
      required: true,
      description: 'UUID of the user',
    },
  ],
  category: 'admin',
});

// Security tools
toolRegistry.set('getAuditLogs', {
  name: 'getAuditLogs',
  description: 'Retrieve audit log entries for security review',
  parameters: [
    {
      name: 'startDate',
      type: 'date',
      required: false,
      description: 'Filter logs from this date',
    },
    {
      name: 'endDate',
      type: 'date',
      required: false,
      description: 'Filter logs until this date',
    },
    {
      name: 'userId',
      type: 'string',
      required: false,
      description: 'Filter logs for specific user',
    },
    {
      name: 'eventType',
      type: 'string',
      required: false,
      description: 'Filter by event type',
    },
  ],
  category: 'security',
});

toolRegistry.set('getSecurityEvents', {
  name: 'getSecurityEvents',
  description: 'Retrieve security events and alerts',
  parameters: [
    {
      name: 'severity',
      type: 'string',
      required: false,
      description: 'Filter by severity level',
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    },
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by event status',
      enum: ['PENDING', 'ACKNOWLEDGED', 'RESOLVED'],
    },
    {
      name: 'limit',
      type: 'number',
      required: false,
      description: 'Maximum number of results',
      default: 50,
    },
  ],
  category: 'security',
});

toolRegistry.set('reviewFlaggedContent', {
  name: 'reviewFlaggedContent',
  description: 'Review content flagged for human review',
  parameters: [
    {
      name: 'status',
      type: 'string',
      required: false,
      description: 'Filter by review status',
      enum: ['pending', 'approved', 'rejected'],
    },
  ],
  category: 'security',
});

toolRegistry.set('getSystemMetrics', {
  name: 'getSystemMetrics',
  description: 'Get system performance and security metrics',
  parameters: [
    {
      name: 'period',
      type: 'string',
      required: false,
      description: 'Time period for metrics',
      enum: ['hour', 'day', 'week', 'month'],
      default: 'day',
    },
  ],
  category: 'security',
});

toolRegistry.set('exportAuditLogs', {
  name: 'exportAuditLogs',
  description: 'Export audit logs for compliance reporting',
  parameters: [
    {
      name: 'format',
      type: 'string',
      required: true,
      description: 'Export format',
      enum: ['json', 'csv'],
    },
    {
      name: 'startDate',
      type: 'date',
      required: true,
      description: 'Start date for export range',
    },
    {
      name: 'endDate',
      type: 'date',
      required: true,
      description: 'End date for export range',
    },
  ],
  category: 'security',
});

/**
 * Get metadata for a specific tool
 */
export function getToolMetadata(toolName: string): ToolMetadata | null {
  return toolRegistry.get(toolName) ?? null;
}

/**
 * Get all registered tool metadata
 */
export function getAllToolMetadata(): ToolMetadata[] {
  return Array.from(toolRegistry.values());
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): ToolMetadata[] {
  return Array.from(toolRegistry.values()).filter((tool) => tool.category === category);
}

/**
 * Get all available categories
 */
export function getCategories(): string[] {
  const categories = new Set<string>();
  for (const tool of toolRegistry.values()) {
    if (tool.category) {
      categories.add(tool.category);
    }
  }
  return Array.from(categories);
}

/**
 * Register a new tool (for dynamic registration)
 */
export function registerToolMetadata(metadata: ToolMetadata): void {
  toolRegistry.set(metadata.name, metadata);
}

/**
 * Check if a tool is registered
 */
export function hasToolMetadata(toolName: string): boolean {
  return toolRegistry.has(toolName);
}

export { toolRegistry };
