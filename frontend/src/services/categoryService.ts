import { apiClient } from './api';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types/category';

export const categoryService = {
  async getAll(): Promise<Category[]> {
    const response = await apiClient.get<{ categories: Category[] }>('/api/categories');
    return response.data.categories;
  },

  async create(data: CreateCategoryInput): Promise<Category> {
    const response = await apiClient.post('/api/categories', data);
    return response.data;
  },

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    const response = await apiClient.put(`/api/categories/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/categories/${id}`);
  },
};
