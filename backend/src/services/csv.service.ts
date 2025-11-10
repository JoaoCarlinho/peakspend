import { Expense, Category } from '../generated/prisma/client';

export class CsvService {
  generateExpensesCsv(expenses: Array<Expense & { category: Category | null }>): string {
    const headers = ['Date', 'Merchant', 'Amount', 'Category', 'Notes'];
    const rows = expenses.map((exp) => [
      this.formatDate(exp.date),
      this.escapeCsv(exp.merchant || ''),
      exp.amount.toString(),
      this.escapeCsv(exp.category?.name || 'Uncategorized'),
      this.escapeCsv(exp.notes || ''),
    ]);

    const csvLines = [headers.join(','), ...rows.map((r) => r.join(','))];
    return csvLines.join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    return value;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  generateFilename(): string {
    const today = new Date();
    return `expenses_${this.formatDate(today)}.csv`;
  }
}
