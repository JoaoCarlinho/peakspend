/**
 * Tool Permission Query API Routes
 *
 * Provides endpoints for clients to discover available tools based on their role.
 * Integrates with ToolPermissionsService and ToolRegistry to return filtered,
 * role-appropriate tool information.
 *
 * Endpoints:
 * - GET /api/tools/available - Get all tools available for current user
 * - GET /api/tools/:toolName - Get details for a specific tool
 * - GET /api/tools/categories - Get available tool categories
 *
 * Usage:
 *   import toolsRouter from '@/llm/tools/tools.routes';
 *   app.use('/api/tools', toolsRouter);
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getCurrentUserId,
  getCurrentUserRole,
  hasUserContext,
} from '../../security/userContext.service';
import { toolPermissionsService, Role, ToolRateLimit } from '../../security/toolPermissions.service';
import { getToolMetadata, getCategories, ToolParameter } from './toolRegistry';
import logger from '../../config/logger';

const router = Router();

// In-memory cache for tool lists per role
interface CacheEntry {
  tools: ToolResponse[];
  timestamp: number;
}

const toolsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Response format for a tool in the available list
 */
interface ToolResponse {
  name: string;
  description: string;
  dataScope: string;
  parameters: ToolParameter[];
  rateLimit?: ToolRateLimit;
  category?: string;
}

/**
 * Response format for available tools endpoint
 */
interface AvailableToolsResponse {
  tools: ToolResponse[];
  role: string;
  totalAvailable: number;
  cached: boolean;
}

/**
 * Response format for tool details endpoint
 */
interface ToolDetailsResponse {
  name: string;
  description: string;
  dataScope: string;
  parameters: ToolParameter[];
  examples?: Array<{ description: string; parameters: Record<string, unknown> }>;
  rateLimit?: ToolRateLimit;
  category?: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Query params schema for available tools endpoint
 */
const AvailableToolsQuerySchema = z.object({
  category: z.string().optional(),
});

/**
 * GET /api/tools/available
 * Get all tools available for the current user's role
 */
router.get('/available', async (req: Request, res: Response): Promise<void> => {
  // Check authentication
  if (!hasUserContext()) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required to view available tools',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  const userId = getCurrentUserId();
  const role = getCurrentUserRole();

  if (!role) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INVALID_USER_CONTEXT',
        message: 'Invalid user context',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  // Parse query params
  const queryResult = AvailableToolsQuerySchema.safeParse(req.query);
  const categoryFilter = queryResult.success ? queryResult.data.category : undefined;

  // Check cache
  const cacheKey = `${role}:${categoryFilter || 'all'}`;
  const cached = toolsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('Returning cached tools list', {
      event: 'TOOLS_API_CACHE_HIT',
      role,
      category: categoryFilter,
    });

    const response: AvailableToolsResponse = {
      tools: cached.tools,
      role,
      totalAvailable: cached.tools.length,
      cached: true,
    };
    res.json(response);
    return;
  }

  // Get tools for role from permissions service
  const permissions = toolPermissionsService.getToolsForRole(role as Role);

  // Build response with merged metadata
  let tools: ToolResponse[] = permissions.map((permission) => {
    const metadata = getToolMetadata(permission.toolName);

    const tool: ToolResponse = {
      name: permission.toolName,
      description: permission.description || metadata?.description || '',
      dataScope: permission.dataScope,
      parameters: metadata?.parameters ?? [],
    };

    if (permission.rateLimit) {
      tool.rateLimit = permission.rateLimit;
    }
    if (metadata?.category) {
      tool.category = metadata.category;
    }

    return tool;
  });

  // Apply category filter if specified
  if (categoryFilter) {
    tools = tools.filter((tool) => tool.category === categoryFilter);
  }

  // Update cache
  toolsCache.set(cacheKey, { tools, timestamp: Date.now() });

  logger.info('Returning tools list', {
    event: 'TOOLS_API_LIST',
    userId,
    role,
    category: categoryFilter,
    count: tools.length,
  });

  const response: AvailableToolsResponse = {
    tools,
    role,
    totalAvailable: tools.length,
    cached: false,
  };

  res.json(response);
});

/**
 * GET /api/tools/categories
 * Get available tool categories
 */
router.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  const categories = getCategories();
  res.json({ categories });
});

/**
 * GET /api/tools/:toolName
 * Get detailed information about a specific tool
 */
router.get('/:toolName', async (req: Request, res: Response): Promise<void> => {
  const toolName = req.params['toolName'];

  if (!toolName) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INVALID_REQUEST',
        message: 'Tool name is required',
      },
    };
    res.status(400).json(errorResponse);
    return;
  }

  // Check authentication
  if (!hasUserContext()) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required to view tool details',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  const userId = getCurrentUserId();
  const userRole = getCurrentUserRole();

  if (!userRole) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'INVALID_USER_CONTEXT',
        message: 'Invalid user context',
      },
    };
    res.status(401).json(errorResponse);
    return;
  }

  // userRole is now guaranteed to be defined after the guard check
  const role: string = userRole;

  // Check if tool exists
  const permission = toolPermissionsService.getToolPermission(toolName);
  const metadata = getToolMetadata(toolName);

  if (!permission && !metadata) {
    logger.debug('Tool not found', {
      event: 'TOOLS_API_NOT_FOUND',
      toolName,
      userId: userId || 'unknown',
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'TOOL_NOT_FOUND',
        message: `Tool '${toolName}' does not exist`,
      },
    };
    res.status(404).json(errorResponse);
    return;
  }

  // Check if user has access to this tool
  if (!toolPermissionsService.isToolAllowed(toolName, role as Role)) {
    logger.warn('Tool access denied in API', {
      event: 'TOOLS_API_ACCESS_DENIED',
      toolName,
      userId: userId || 'unknown',
      role,
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: 'TOOL_ACCESS_DENIED',
        message: 'You do not have permission to access this tool',
      },
    };
    res.status(403).json(errorResponse);
    return;
  }

  logger.debug('Returning tool details', {
    event: 'TOOLS_API_DETAILS',
    toolName,
    userId: userId || 'unknown',
    role,
  });

  const response: ToolDetailsResponse = {
    name: toolName,
    description: permission?.description || metadata?.description || '',
    dataScope: permission?.dataScope || 'own',
    parameters: metadata?.parameters ?? [],
  };

  if (metadata?.examples) {
    response.examples = metadata.examples;
  }
  if (permission?.rateLimit) {
    response.rateLimit = permission.rateLimit;
  }
  if (metadata?.category) {
    response.category = metadata.category;
  }

  res.json(response);
});

/**
 * Invalidate the tools cache (for config reloads)
 */
export function invalidateToolsCache(): void {
  toolsCache.clear();
  logger.info('Tools cache invalidated', { event: 'TOOLS_CACHE_INVALIDATED' });
}

export default router;
