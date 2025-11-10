import { Router } from 'express';
import { ExpenseController } from '../controllers/expense.controller';
import { ExpenseService } from '../services/expense.service';
import { requireAuth } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  uuidParamSchema,
} from '../validation/expense.validation';
import { getPrismaClient } from '../config/database';

/**
 * Expense Routes
 *
 * RESTful API endpoints for expense CRUD operations
 * All routes require authentication
 */

const router = Router();

// Initialize service and controller
const prisma = getPrismaClient();
const expenseService = new ExpenseService(prisma);
const expenseController = new ExpenseController(expenseService);

/**
 * POST /api/expenses
 * Create a new expense
 *
 * Requires: authentication, valid expense data
 * Returns: 201 Created with expense object
 */
router.post('/', requireAuth, validateRequest(createExpenseSchema), expenseController.create);

/**
 * GET /api/expenses/export
 * Export expenses as CSV
 *
 * Requires: authentication
 * Query params: dateFrom, dateTo, categoryId, etc.
 * Returns: 200 OK with CSV file
 *
 * IMPORTANT: This route must be defined BEFORE /:id to prevent 'export' being matched as an ID
 */
router.get('/export', requireAuth, validateRequest(listExpensesQuerySchema), expenseController.exportCSV);

/**
 * GET /api/expenses/:id
 * Get a single expense by ID
 *
 * Requires: authentication, valid UUID
 * Returns: 200 OK with expense object, or 404 Not Found
 */
router.get('/:id', requireAuth, validateRequest(uuidParamSchema), expenseController.getById);

/**
 * GET /api/expenses
 * Get paginated list of expenses
 *
 * Requires: authentication
 * Query params: page, limit, sortBy, sortOrder, filters, search
 * Returns: 200 OK with { data, pagination }
 */
router.get('/', requireAuth, validateRequest(listExpensesQuerySchema), expenseController.list);

/**
 * PATCH /api/expenses/:id
 * Update an existing expense
 *
 * Requires: authentication, valid UUID, partial expense data
 * Returns: 200 OK with updated expense, or 404 Not Found
 */
router.patch(
  '/:id',
  requireAuth,
  validateRequest(uuidParamSchema.merge(updateExpenseSchema)),
  expenseController.update
);

/**
 * DELETE /api/expenses/:id
 * Delete an expense
 *
 * Requires: authentication, valid UUID
 * Returns: 204 No Content, or 404 Not Found
 */
router.delete('/:id', requireAuth, validateRequest(uuidParamSchema), expenseController.delete);


export default router;
