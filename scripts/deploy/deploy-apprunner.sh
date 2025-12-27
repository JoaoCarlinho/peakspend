#!/bin/bash
# Deploy backend to AWS App Runner
# Usage: ./deploy-apprunner.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# AWS Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-971422717446}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# App Runner Service
APP_RUNNER_SERVICE_ARN="arn:aws:apprunner:${AWS_REGION}:${AWS_ACCOUNT_ID}:service/peakspend-${ENVIRONMENT}-backend/9c8bf5a4be7641019d3766787565f78c"

# ECR Repository
ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPO="peakspend-${ENVIRONMENT}-backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Get latest image digest from ECR
get_latest_image() {
    log_step "Getting latest image digest from ECR..."

    IMAGE_DIGEST=$(aws ecr describe-images \
        --repository-name "$ECR_REPO" \
        --region "$AWS_REGION" \
        --query 'sort_by(imageDetails,& imagePushedAt)[-1].imageDigest' \
        --output text)

    if [ -z "$IMAGE_DIGEST" ] || [ "$IMAGE_DIGEST" == "None" ]; then
        log_error "No images found in ECR repository: $ECR_REPO"
        exit 1
    fi

    log_info "Latest image digest: $IMAGE_DIGEST"
    echo "${ECR_BASE}/${ECR_REPO}@${IMAGE_DIGEST}"
}

# Trigger App Runner deployment
deploy_apprunner() {
    log_step "Triggering App Runner deployment..."

    # Start deployment
    OPERATION_ID=$(aws apprunner start-deployment \
        --service-arn "$APP_RUNNER_SERVICE_ARN" \
        --region "$AWS_REGION" \
        --query 'OperationId' \
        --output text)

    log_info "Deployment started. Operation ID: $OPERATION_ID"

    # Wait for deployment to complete
    log_step "Waiting for deployment to complete..."

    MAX_WAIT=600  # 10 minutes
    ELAPSED=0
    INTERVAL=15

    while [ $ELAPSED -lt $MAX_WAIT ]; do
        STATUS=$(aws apprunner describe-service \
            --service-arn "$APP_RUNNER_SERVICE_ARN" \
            --region "$AWS_REGION" \
            --query 'Service.Status' \
            --output text)

        log_info "Service status: $STATUS (${ELAPSED}s elapsed)"

        if [ "$STATUS" == "RUNNING" ]; then
            log_info "Deployment completed successfully!"
            return 0
        elif [ "$STATUS" == "OPERATION_IN_PROGRESS" ]; then
            sleep $INTERVAL
            ELAPSED=$((ELAPSED + INTERVAL))
        else
            log_error "Unexpected status: $STATUS"
            exit 1
        fi
    done

    log_error "Deployment timed out after ${MAX_WAIT}s"
    exit 1
}

# Verify deployment
verify_deployment() {
    log_step "Verifying deployment..."

    SERVICE_URL=$(aws apprunner describe-service \
        --service-arn "$APP_RUNNER_SERVICE_ARN" \
        --region "$AWS_REGION" \
        --query 'Service.ServiceUrl' \
        --output text)

    log_info "Service URL: https://${SERVICE_URL}"

    # Health check
    log_step "Running health check..."

    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${SERVICE_URL}/health" || echo "000")

    if [ "$HTTP_STATUS" == "200" ]; then
        log_info "Health check passed! (HTTP $HTTP_STATUS)"
    else
        log_warn "Health check returned HTTP $HTTP_STATUS"
    fi
}

# Main execution
log_info "=== App Runner Deployment ==="
log_info "AWS Region: $AWS_REGION"
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "Environment: $ENVIRONMENT"
log_info "Service ARN: $APP_RUNNER_SERVICE_ARN"

# Execute deployment
deploy_apprunner
verify_deployment

log_info "=== App Runner deployment complete! ==="
