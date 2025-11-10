import { Request, Response, NextFunction } from 'express';
import { ExpenseService } from '../services/expense.service';
import {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
} from '../validation/expense.validation';

export class ExpenseController {
  constructor(private expenseService: ExpenseService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const data: CreateExpenseInput = req.body;
      const expense = await this.expenseService.createExpense(userId, data);
      res.status(201).json(expense);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ message: 'Missing expense ID' });
        return;
      }
      const expense = await this.expenseService.getExpenseById(id, userId);
      if (!expense) {
        res.status(404).json({ message: 'Expense not found or does not belong to user' });
        return;
      }
      res.status(200).json(expense);
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      // Use validatedQuery which contains properly typed/coerced values
      const query = (req.validatedQuery || req.query) as unknown as ListExpensesQuery;
      const result = await this.expenseService.getExpenses(userId, query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ message: 'Missing expense ID' });
        return;
      }
      const data: UpdateExpenseInput = req.body;
      const expense = await this.expenseService.updateExpense(id, userId, data);
      if (!expense) {
        res.status(404).json({ message: 'Expense not found or does not belong to user' });
        return;
      }
      res.status(200).json(expense);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ message: 'Missing expense ID' });
        return;
      }
      const deleted = await this.expenseService.deleteExpense(id, userId);
      if (!deleted) {
        res.status(404).json({ message: 'Expense not found or does not belong to user' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  exportCSV = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      // Use validated query parameters
      const query = (req.validatedQuery || req.query) as unknown as ListExpensesQuery;

      // Generate CSV
      const csv = await this.expenseService.exportExpensesAsCSV(userId, query);

      // Generate filename with current date
      const today = new Date().toISOString().split('T')[0];
      const filename = `expenses_${today}.csv`;

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };
}
