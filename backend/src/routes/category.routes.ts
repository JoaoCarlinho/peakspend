import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { CategoryService } from '../services/category.service';
import { requireAuth } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  uuidParamSchema,
} from '../validation/category.validation';
import { getPrismaClient } from '../config/database';

const router = Router();
const prisma = getPrismaClient();
const categoryService = new CategoryService(prisma);
const categoryController = new CategoryController(categoryService);

/**
 * GET /api/categories
 * Get all categories (default + user's custom)
 */
router.get('/', requireAuth, categoryController.list);

/**
 * POST /api/categories
 * Create a new custom category
 */
router.post('/', requireAuth, validateRequest(createCategorySchema), categoryController.create);

/**
 * PUT /api/categories/:id
 * Update a custom category
 */
router.put(
  '/:id',
  requireAuth,
  validateRequest(uuidParamSchema.merge(updateCategorySchema)),
  categoryController.update
);

/**
 * DELETE /api/categories/:id
 * Delete a custom category
 */
router.delete('/:id', requireAuth, validateRequest(uuidParamSchema), categoryController.delete);

export default router;
