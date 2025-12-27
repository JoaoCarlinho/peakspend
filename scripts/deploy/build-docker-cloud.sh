#!/bin/bash
# Build Docker images for cloud deployment (production-optimized)
# Usage: ./build-docker-cloud.sh [service]
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

# Image tag (use git commit hash or 'latest')
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

build_backend() {
    local REPO="peakspend-${ENVIRONMENT}-backend"
    local FULL_TAG="${ECR_BASE}/${REPO}:${IMAGE_TAG}"
    local LATEST_TAG="${ECR_BASE}/${REPO}:latest"

    log_info "Building backend for cloud: $FULL_TAG"

    docker build \
        --platform linux/amd64 \
        --build-arg NODE_ENV=production \
        -t "$FULL_TAG" \
        -t "$LATEST_TAG" \
        -f "$PROJECT_ROOT/backend/Dockerfile" \
        "$PROJECT_ROOT/backend"

    log_info "Backend image built: $FULL_TAG"
    echo "$FULL_TAG" >> /tmp/built_images.txt
    echo "$LATEST_TAG" >> /tmp/built_images.txt
}

build_ml_service() {
    local REPO="peakspend-${ENVIRONMENT}-ml-service"
    local FULL_TAG="${ECR_BASE}/${REPO}:${IMAGE_TAG}"
    local LATEST_TAG="${ECR_BASE}/${REPO}:latest"

    log_info "Building ML service for cloud: $FULL_TAG"

    docker build \
        --platform linux/amd64 \
        -t "$FULL_TAG" \
        -t "$LATEST_TAG" \
        -f "$PROJECT_ROOT/ml-service/Dockerfile" \
        "$PROJECT_ROOT/ml-service"

    log_info "ML service image built: $FULL_TAG"
    echo "$FULL_TAG" >> /tmp/built_images.txt
    echo "$LATEST_TAG" >> /tmp/built_images.txt
}

build_mlflow() {
    local REPO="peakspend-${ENVIRONMENT}-mlflow"
    local FULL_TAG="${ECR_BASE}/${REPO}:${IMAGE_TAG}"
    local LATEST_TAG="${ECR_BASE}/${REPO}:latest"

    log_info "Building MLflow for cloud: $FULL_TAG"

    docker build \
        --platform linux/amd64 \
        -t "$FULL_TAG" \
        -t "$LATEST_TAG" \
        -f "$PROJECT_ROOT/infrastructure/mlflow/Dockerfile" \
        "$PROJECT_ROOT/infrastructure/mlflow"

    log_info "MLflow image built: $FULL_TAG"
    echo "$FULL_TAG" >> /tmp/built_images.txt
    echo "$LATEST_TAG" >> /tmp/built_images.txt
}

build_workers() {
    local REPO="peakspend-${ENVIRONMENT}-workers"
    local FULL_TAG="${ECR_BASE}/${REPO}:${IMAGE_TAG}"
    local LATEST_TAG="${ECR_BASE}/${REPO}:latest"

    log_info "Building workers for cloud: $FULL_TAG"

    docker build \
        --platform linux/amd64 \
        --build-arg NODE_ENV=production \
        -t "$FULL_TAG" \
        -t "$LATEST_TAG" \
        -f "$PROJECT_ROOT/backend/Dockerfile.worker" \
        "$PROJECT_ROOT/backend"

    log_info "Workers image built: $FULL_TAG"
    echo "$FULL_TAG" >> /tmp/built_images.txt
    echo "$LATEST_TAG" >> /tmp/built_images.txt
}

build_all() {
    log_info "Building all Docker images for cloud deployment..."
    log_info "Image tag: $IMAGE_TAG"

    # Clear previous build list
    rm -f /tmp/built_images.txt

    build_backend
    build_ml_service
    build_mlflow
    build_workers

    log_info "All cloud images built successfully!"
    log_info "Built images saved to /tmp/built_images.txt"
}

SERVICE="${1:-all}"

log_info "AWS Region: $AWS_REGION"
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "Environment: $ENVIRONMENT"
log_info "Image Tag: $IMAGE_TAG"

case "$SERVICE" in
    backend)
        build_backend
        ;;
    ml-service)
        build_ml_service
        ;;
    mlflow)
        build_mlflow
        ;;
    workers)
        build_workers
        ;;
    all)
        build_all
        ;;
    *)
        log_error "Unknown service: $SERVICE"
        echo "Usage: $0 [backend|ml-service|mlflow|workers|all]"
        exit 1
        ;;
esac

log_info "Cloud Docker build complete!"
