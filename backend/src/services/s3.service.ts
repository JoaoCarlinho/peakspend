import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * S3 Service
 *
 * Handles all AWS S3 operations for receipt storage
 * Uses AWS SDK v3 with proper error handling
 * Supports MinIO for local development via S3_ENDPOINT configuration
 */
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;
  private publicEndpoint: string | undefined;

  constructor() {
    const region = process.env['AWS_REGION'] || 'us-east-1';
    this.bucketName = process.env['S3_BUCKET_NAME'] || 'peakspend-receipts-dev';
    const endpoint = process.env['S3_ENDPOINT']; // For MinIO: http://minio:9000
    const forcePathStyle = process.env['S3_FORCE_PATH_STYLE'] === 'true';

    // Public endpoint for browser access (replaces internal Docker hostname with localhost)
    this.publicEndpoint = process.env['S3_PUBLIC_ENDPOINT']; // e.g., http://localhost:9000

    const s3Config: any = {
      region,
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
      },
    };

    // MinIO/LocalStack support: use custom endpoint with path-style URLs
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = forcePathStyle;
      console.log(`📦 S3Service: Using custom endpoint ${endpoint} (MinIO/LocalStack mode)`);

      // If no public endpoint specified, auto-convert minio:9000 to localhost:9000
      if (!this.publicEndpoint && endpoint.includes('minio:')) {
        this.publicEndpoint = endpoint.replace('minio:', 'localhost:');
        console.log(`📦 S3Service: Public endpoint auto-configured as ${this.publicEndpoint}`);
      }
    }

    this.s3Client = new S3Client(s3Config);
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
    let signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // Replace internal Docker hostname with public endpoint for browser access
    if (this.publicEndpoint && signedUrl.includes('minio:')) {
      const internalHost = new URL(process.env['S3_ENDPOINT'] || '').host;
      const publicHost = new URL(this.publicEndpoint).host;
      signedUrl = signedUrl.replace(internalHost, publicHost);
      console.log(`📦 S3Service: Converted signed URL to use public endpoint`);
    }

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
