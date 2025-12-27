#!/bin/bash
# Build Docker images for local development
# Usage: ./build-docker-local.sh [service]
# Services: backend, frontend, ml-service, mlflow, workers, all

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

build_backend() {
    log_info "Building backend Docker image..."
    docker build -t peakspend-backend:local \
        -f "$PROJECT_ROOT/backend/Dockerfile" \
        "$PROJECT_ROOT/backend"
    log_info "Backend image built: peakspend-backend:local"
}

build_frontend() {
    log_info "Building frontend Docker image..."
    docker build -t peakspend-frontend:local \
        -f "$PROJECT_ROOT/frontend/Dockerfile" \
        "$PROJECT_ROOT/frontend"
    log_info "Frontend image built: peakspend-frontend:local"
}

build_ml_service() {
    log_info "Building ML service Docker image..."
    docker build -t peakspend-ml-service:local \
        -f "$PROJECT_ROOT/ml-service/Dockerfile" \
        "$PROJECT_ROOT/ml-service"
    log_info "ML service image built: peakspend-ml-service:local"
}

build_mlflow() {
    log_info "Building MLflow Docker image..."
    docker build -t peakspend-mlflow:local \
        -f "$PROJECT_ROOT/infrastructure/mlflow/Dockerfile" \
        "$PROJECT_ROOT/infrastructure/mlflow"
    log_info "MLflow image built: peakspend-mlflow:local"
}

build_workers() {
    log_info "Building workers Docker image..."
    docker build -t peakspend-workers:local \
        -f "$PROJECT_ROOT/backend/Dockerfile.worker" \
        "$PROJECT_ROOT/backend"
    log_info "Workers image built: peakspend-workers:local"
}

build_all() {
    log_info "Building all Docker images..."
    build_backend
    build_frontend
    build_ml_service
    build_mlflow
    build_workers
    log_info "All images built successfully!"
}

SERVICE="${1:-all}"

case "$SERVICE" in
    backend)
        build_backend
        ;;
    frontend)
        build_frontend
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
        echo "Usage: $0 [backend|frontend|ml-service|mlflow|workers|all]"
        exit 1
        ;;
esac

log_info "Docker build complete!"
