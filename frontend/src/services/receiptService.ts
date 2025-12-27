import { apiClient } from './api';

interface UploadReceiptResponse {
  receiptUrl: string;
  key: string;
  size: number;
  contentType: string;
}

export interface OcrResult {
  merchant?: string;
  date?: string;
  amount?: number;
  lineItems?: Array<{ description: string; amount?: number }>;
  notes?: string;
  confidence: {
    merchant?: number;
    date?: number;
    amount?: number;
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

export const receiptService = {
  /**
   * Validate receipt file before upload
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Invalid file type. Please upload JPG, PNG, or PDF files only.',
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: 'File size exceeds 10MB limit.',
      };
    }

    return { valid: true };
  },

  /**
   * Upload receipt file to S3
   */
  async uploadReceipt(file: File): Promise<UploadReceiptResponse> {
    const formData = new FormData();
    formData.append('receipt', file);

    const response = await apiClient.post<UploadReceiptResponse>(
      '/api/receipts/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  /**
   * Process receipt OCR to extract expense data
   */
  async processOcr(s3Key: string): Promise<OcrResult> {
    const response = await apiClient.post<OcrResult>('/api/receipts/ocr', {
      s3Key,
    });

    return response.data;
  },
};
