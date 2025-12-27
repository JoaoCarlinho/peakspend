#!/bin/bash
# Deploy services to AWS ECS
# Usage: ./deploy-ecs.sh [service]
# Services: ml-service, mlflow, workers, all

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# AWS Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-971422717446}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# ECS Cluster
ECS_CLUSTER="peakspend-${ENVIRONMENT}"

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

# Force new deployment of an ECS service
deploy_ecs_service() {
    local SERVICE_NAME=$1
    local FULL_SERVICE_NAME="peakspend-${ENVIRONMENT}-${SERVICE_NAME}"

    log_step "Deploying ECS service: $FULL_SERVICE_NAME"

    # Force new deployment
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$FULL_SERVICE_NAME" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --output text > /dev/null

    log_info "Deployment triggered for $FULL_SERVICE_NAME"

    # Wait for service to stabilize
    log_step "Waiting for service to stabilize..."

    aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER" \
        --services "$FULL_SERVICE_NAME" \
        --region "$AWS_REGION"

    log_info "Service $FULL_SERVICE_NAME is stable"
}

# Check service status
check_service_status() {
    local SERVICE_NAME=$1
    local FULL_SERVICE_NAME="peakspend-${ENVIRONMENT}-${SERVICE_NAME}"

    log_step "Checking status of $FULL_SERVICE_NAME..."

    aws ecs describe-services \
        --cluster "$ECS_CLUSTER" \
        --services "$FULL_SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'services[0].{DesiredCount:desiredCount,RunningCount:runningCount,PendingCount:pendingCount,Status:status}' \
        --output table
}

deploy_ml_service() {
    deploy_ecs_service "ml-service"
    check_service_status "ml-service"
}

deploy_mlflow() {
    deploy_ecs_service "mlflow"
    check_service_status "mlflow"
}

deploy_workers() {
    deploy_ecs_service "workers"
    check_service_status "workers"
}

deploy_all() {
    log_info "Deploying all ECS services..."

    deploy_ml_service
    deploy_mlflow
    deploy_workers

    log_info "All ECS services deployed successfully!"
}

SERVICE="${1:-all}"

log_info "=== ECS Deployment ==="
log_info "AWS Region: $AWS_REGION"
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "Environment: $ENVIRONMENT"
log_info "ECS Cluster: $ECS_CLUSTER"

case "$SERVICE" in
    ml-service)
        deploy_ml_service
        ;;
    mlflow)
        deploy_mlflow
        ;;
    workers)
        deploy_workers
        ;;
    all)
        deploy_all
        ;;
    *)
        log_error "Unknown service: $SERVICE"
        echo "Usage: $0 [ml-service|mlflow|workers|all]"
        exit 1
        ;;
esac

log_info "=== ECS deployment complete! ==="
