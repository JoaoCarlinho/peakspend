import { PrismaClient, Category, Prisma } from '../generated/prisma/client';

export interface CreateCategoryInput {
  name: string;
  color: string;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string;
}

/**
 * Category Service
 *
 * Handles category management (default + user custom categories)
 */
export class CategoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get all categories for a user (default + user's custom)
   */
  async getCategories(userId: string): Promise<Array<Category & { _count?: { expenses: number } }>> {
    const categories = await this.prisma.category.findMany({
      where: {
        OR: [
          { userId: null, isDefault: true }, // Default categories
          { userId }, // User's custom categories
        ],
      },
      include: {
        _count: {
          select: {
            expenses: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' }, // Default first
        { name: 'asc' },
      ],
    });

    return categories;
  }

  /**
   * Get a single category by ID
   */
  async getCategoryById(id: string, userId: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: {
        id,
        OR: [
          { userId: null, isDefault: true },
          { userId },
        ],
      },
    });
  }

  /**
   * Create a custom category for a user
   */
  async createCategory(userId: string, data: CreateCategoryInput): Promise<Category> {
    // Check for duplicate name
    const existing = await this.prisma.category.findFirst({
      where: {
        name: {
          equals: data.name,
          mode: 'insensitive',
        },
        OR: [
          { userId: null, isDefault: true },
          { userId },
        ],
      },
    });

    if (existing) {
      throw new Error('Category with this name already exists');
    }

    return this.prisma.category.create({
      data: {
        userId,
        name: data.name,
        color: data.color,
        isDefault: false,
      },
    });
  }

  /**
   * Update a custom category
   */
  async updateCategory(
    id: string,
    userId: string,
    data: UpdateCategoryInput
  ): Promise<Category | null> {
    // Check if category exists and is user's custom category
    const existing = await this.prisma.category.findFirst({
      where: {
        id,
        userId,
        isDefault: false,
      },
    });

    if (!existing) {
      return null;
    }

    // Check for duplicate name if name is being updated
    if (data.name) {
      const duplicate = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          name: {
            equals: data.name,
            mode: 'insensitive',
          },
          OR: [
            { userId: null, isDefault: true },
            { userId },
          ],
        },
      });

      if (duplicate) {
        throw new Error('Category with this name already exists');
      }
    }

    const updateData: Prisma.CategoryUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.color !== undefined) updateData.color = data.color;

    return this.prisma.category.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete a custom category
   */
  async deleteCategory(id: string, userId: string): Promise<boolean> {
    // Check if category exists and is user's custom category
    const existing = await this.prisma.category.findFirst({
      where: {
        id,
        userId,
        isDefault: false,
      },
    });

    if (!existing) {
      return false;
    }

    // Delete category (expenses will have categoryId set to null due to onDelete: SetNull)
    await this.prisma.category.delete({
      where: { id },
    });

    return true;
  }
}
