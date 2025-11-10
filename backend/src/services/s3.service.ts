import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * S3 Service
 *
 * Handles all AWS S3 operations for receipt storage
 * Uses AWS SDK v3 with proper error handling
 */
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env['AWS_REGION'] || 'us-east-1';
    this.bucketName = process.env['S3_BUCKET_NAME'] || 'peakspend-receipts-dev';

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
      },
    });
  }

  /**
   * Upload file to S3
   *
   * @param file - File buffer and metadata
   * @param userId - User ID for folder organization
   * @returns S3 key of uploaded file
   */
  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    userId: string
  ): Promise<string> {
    const timestamp = Date.now();
    const randomId = uuidv4();
    const extension = file.originalname.split('.').pop();
    const key = `receipts/${userId}/${timestamp}-${randomId}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        'user-id': userId,
        'original-filename': file.originalname,
      },
    });

    await this.s3Client.send(command);

    return key;
  }

  /**
   * Generate signed URL for secure file access
   *
   * @param key - S3 object key
   * @returns Signed URL valid for 15 minutes
   */
  async getSignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    // Generate signed URL with 15 minute expiration
    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    return signedUrl;
  }

  /**
   * Delete file from S3
   *
   * @param key - S3 object key
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }
}
