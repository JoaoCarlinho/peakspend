import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { S3Service } from '../services/s3.service';
import { OcrService } from '../services/ocr.service';
import { receiptService, RawOCRResult } from '../services/receipt.service';
import { requireAuth } from '../middleware/auth.middleware';
import logger from '../config/logger';

const router = Router();
const s3Service = new S3Service();
const ocrService = new OcrService();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and PDF files are allowed.'));
    }
  },
});

/**
 * POST /api/receipts/upload
 * Upload receipt file to S3
 *
 * Requires: authentication, multipart/form-data with 'receipt' field
 * Returns: 201 Created with S3 key and signed URL
 */
router.post(
  '/upload',
  requireAuth,
  upload.single('receipt'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      // Upload to S3
      const s3Key = await s3Service.uploadFile(
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
        },
        userId
      );

      // Generate signed URL for immediate access
      const signedUrl = await s3Service.getSignedUrl(s3Key);

      res.status(201).json({
        key: s3Key,
        receiptUrl: signedUrl,
        filename: file.originalname,
        size: file.size,
        contentType: file.mimetype,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Handle multer errors
router.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      return;
    }
    res.status(400).json({ message: `Upload error: ${err.message}` });
    return;
  }

  if (err.message.includes('Invalid file type')) {
    res.status(400).json({ message: err.message });
    return;
  }
  logger.log('error', `File upload failed ${err}`);
  res.status(500).json({ message: `File upload failed ${err}` });
});

/**
 * POST /api/receipts/ocr
 * Process receipt OCR from S3 key with Ollama enhancement
 *
 * USE CASE 1: Receipt OCR Enhancement with Ollama
 * Workflow: AWS Textract → Ollama LLM → Structured Data
 *
 * Requires: authentication, receipt S3 key in body
 * Returns: 200 OK with extracted and enhanced data
 */
router.post(
  '/ocr',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { s3Key } = req.body as { s3Key?: string };
      if (!s3Key) {
        res.status(400).json({ message: 'Missing s3Key in request body' });
        return;
      }

      // Verify the receipt belongs to the user (s3Key should start with receipts/{userId}/)
      if (!s3Key.startsWith(`receipts/${userId}/`)) {
        res.status(403).json({ message: 'Access denied to this receipt' });
        return;
      }

      // Step 1: Process OCR with AWS Textract
      const ocrResult = await ocrService.processReceipt(s3Key);

      // Step 2: Build raw OCR text from Textract results
      const rawText = [
        ocrResult.merchant || '',
        ocrResult.date || '',
        ...(ocrResult.lineItems || []).map(item =>
          `${item.description}${item.amount ? ` $${item.amount}` : ''}`
        ),
        ocrResult.amount ? `TOTAL $${ocrResult.amount}` : '',
      ].filter(line => line.trim().length > 0).join('\n');

      // Step 3: Convert to RawOCRResult format
      const rawOcrResult: RawOCRResult = {
        text: rawText,
        confidence: ocrResult.confidence.amount ||
          ocrResult.confidence.merchant ||
          ocrResult.confidence.date || 0.85,
        blocks: (ocrResult.lineItems || []).map(item => ({
          text: item.description,
          type: 'LINE_ITEM',
          confidence: 0.9,
        })),
      };

      // Step 4: Enhance with Ollama (USE CASE 1)
      const enhancedData = await receiptService.processReceipt(rawOcrResult);

      res.status(200).json({
        ...enhancedData,
        // Include original OCR data for reference
        originalOcr: ocrResult,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('NoSuchKey')) {
          res.status(404).json({ message: 'Receipt not found in S3' });
          return;
        }
      }
      next(error);
    }
  }
);

export default router;
