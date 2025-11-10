export interface Category {
  id: string;
  name: string;
  color: string | null;
  icon?: string | null;
  isDefault: boolean;
  userId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    expenses: number;
  };
}

export interface CreateCategoryInput {
  name: string;
  color: string;
  icon?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string;
  icon?: string;
}
