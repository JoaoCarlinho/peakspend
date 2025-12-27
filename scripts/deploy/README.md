# PeakSpend Deployment Scripts

Scripts for building, pushing, and deploying PeakSpend services to AWS.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Docker installed and running
- Node.js 20+ (for frontend build)

## Quick Start

Deploy everything to production:

```bash
./deploy-all.sh
```

## Script Execution Order

For a complete production deployment, run scripts in this order:

1. **Build Docker images for cloud**
   ```bash
   ./build-docker-cloud.sh all
   ```

2. **Push images to ECR**
   ```bash
   ./push-to-ecr.sh all
   ```

3. **Deploy App Runner (Backend API)**
   ```bash
   ./deploy-apprunner.sh
   ```

4. **Deploy ECS services**
   ```bash
   ./deploy-ecs.sh all
   ```

5. **Deploy Frontend**
   ```bash
   ./deploy-frontend.sh
   ```

Or use the master script that runs all steps:

```bash
./deploy-all.sh
```

## Individual Scripts

### build-docker-local.sh

Build Docker images for local development.

```bash
./build-docker-local.sh [service]
# Services: backend, frontend, ml-service, mlflow, workers, all
```

### build-docker-cloud.sh

Build Docker images for cloud deployment (linux/amd64, production-optimized).

```bash
./build-docker-cloud.sh [service]
# Services: backend, ml-service, mlflow, workers, all
```

Environment variables:
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_ACCOUNT_ID` - AWS account ID (default: 971422717446)
- `ENVIRONMENT` - Deployment environment (default: production)
- `IMAGE_TAG` - Docker image tag (default: git commit hash)

### push-to-ecr.sh

Push Docker images to AWS ECR.

```bash
./push-to-ecr.sh [service]
# Services: backend, ml-service, mlflow, workers, all
```

### deploy-apprunner.sh

Deploy backend to AWS App Runner.

```bash
./deploy-apprunner.sh
```

### deploy-ecs.sh

Deploy services to AWS ECS.

```bash
./deploy-ecs.sh [service]
# Services: ml-service, mlflow, workers, all
```

### deploy-frontend.sh

Build frontend and deploy to S3/CloudFront.

```bash
./deploy-frontend.sh
```

Environment variables:
- `VITE_API_URL` - Backend API URL
- `CLOUDFRONT_DISTRIBUTION_ID` - CloudFront distribution ID

### deploy-all.sh

Master deployment script that runs all steps.

```bash
./deploy-all.sh [options]
```

Options:
- `--skip-build` - Skip Docker build step
- `--skip-push` - Skip ECR push step
- `--backend-only` - Deploy only backend services
- `--frontend-only` - Deploy only frontend

## Service Architecture

| Service | Deployment Target | ECR Repository |
|---------|-------------------|----------------|
| Backend API | App Runner | peakspend-production-backend |
| ML Service | ECS | peakspend-production-ml-service |
| MLflow | ECS | peakspend-production-mlflow |
| Workers | ECS | peakspend-production-workers |
| Frontend | S3 + CloudFront | N/A (static files) |

## Troubleshooting

### ECR Login Issues
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 971422717446.dkr.ecr.us-east-1.amazonaws.com
```

### Check App Runner Logs
```bash
aws logs tail /aws/apprunner/peakspend-production-backend --follow
```

### Check ECS Service Status
```bash
aws ecs describe-services --cluster peakspend-production --services peakspend-production-ml-service
```

### Verify Deployment
```bash
curl https://rczwkm4t9i.us-east-1.awsapprunner.com/health
```
