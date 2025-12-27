#!/bin/bash
# Push Docker images to AWS ECR
# Usage: ./push-to-ecr.sh [service]
# Services: backend, ml-service, mlflow, workers, all

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# AWS Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-971422717446}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# ECR Repository base
ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Image tag
GIT_COMMIT=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "latest")
IMAGE_TAG="${IMAGE_TAG:-$GIT_COMMIT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ecr_login() {
    log_info "Logging into ECR..."
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ECR_BASE"
    log_info "ECR login successful"
}

push_image() {
    local REPO=$1
    local FULL_TAG="${ECR_BASE}/${REPO}:${IMAGE_TAG}"
    local LATEST_TAG="${ECR_BASE}/${REPO}:latest"

    log_info "Pushing $FULL_TAG..."
    docker push "$FULL_TAG"

    log_info "Pushing $LATEST_TAG..."
    docker push "$LATEST_TAG"

    log_info "Successfully pushed $REPO"
}

push_backend() {
    local REPO="peakspend-${ENVIRONMENT}-backend"
    push_image "$REPO"
}

push_ml_service() {
    local REPO="peakspend-${ENVIRONMENT}-ml-service"
    push_image "$REPO"
}

push_mlflow() {
    local REPO="peakspend-${ENVIRONMENT}-mlflow"
    push_image "$REPO"
}

push_workers() {
    local REPO="peakspend-${ENVIRONMENT}-workers"
    push_image "$REPO"
}

push_all() {
    log_info "Pushing all images to ECR..."

    push_backend
    push_ml_service
    push_mlflow
    push_workers

    log_info "All images pushed successfully!"
}

SERVICE="${1:-all}"

log_info "AWS Region: $AWS_REGION"
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "Environment: $ENVIRONMENT"
log_info "Image Tag: $IMAGE_TAG"

# Login to ECR first
ecr_login

case "$SERVICE" in
    backend)
        push_backend
        ;;
    ml-service)
        push_ml_service
        ;;
    mlflow)
        push_mlflow
        ;;
    workers)
        push_workers
        ;;
    all)
        push_all
        ;;
    *)
        log_error "Unknown service: $SERVICE"
        echo "Usage: $0 [backend|ml-service|mlflow|workers|all]"
        exit 1
        ;;
esac

log_info "ECR push complete!"
