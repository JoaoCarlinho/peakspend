import { Request, Response, NextFunction } from 'express';
import { CategoryService, CreateCategoryInput, UpdateCategoryInput } from '../services/category.service';

/**
 * Category Controller
 *
 * Handles HTTP requests for category CRUD operations
 */
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  /**
   * GET /api/categories
   * Get all categories for user
   */
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const categories = await this.categoryService.getCategories(userId);

      res.status(200).json(categories);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/categories
   * Create a new custom category
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const data: CreateCategoryInput = req.body;

      const category = await this.categoryService.createCategory(userId, data);

      res.status(201).json(category);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
        return;
      }
      next(error);
    }
  };

  /**
   * PUT /api/categories/:id
   * Update a custom category
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ message: 'Missing category ID' });
        return;
      }

      const data: UpdateCategoryInput = req.body;

      const category = await this.categoryService.updateCategory(id, userId, data);

      if (!category) {
        res.status(404).json({
          message: 'Category not found or cannot be edited',
        });
        return;
      }

      res.status(200).json(category);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        res.status(409).json({ message: error.message });
        return;
      }
      next(error);
    }
  };

  /**
   * DELETE /api/categories/:id
   * Delete a custom category
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ message: 'Missing category ID' });
        return;
      }

      const deleted = await this.categoryService.deleteCategory(id, userId);

      if (!deleted) {
        res.status(404).json({
          message: 'Category not found or cannot be deleted',
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
