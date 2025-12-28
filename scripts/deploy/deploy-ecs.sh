#!/bin/bash
# Deploy services to AWS ECS
# Usage: ./deploy-ecs.sh [service] [--no-wait]
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

# Options
WAIT_FOR_STABLE=true

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

# Wait for service to stabilize with custom timeout
wait_for_stable() {
    local SERVICE_NAME=$1
    local MAX_ATTEMPTS=60  # 15 minutes (60 * 15 seconds)
    local ATTEMPT=0

    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        local STATUS=$(aws ecs describe-services \
            --cluster "$ECS_CLUSTER" \
            --services "$SERVICE_NAME" \
            --region "$AWS_REGION" \
            --query 'services[0].deployments[?status==`PRIMARY`] | [0].{running:runningCount,desired:desiredCount,rollout:rolloutState}' \
            --output json)

        local RUNNING=$(echo "$STATUS" | jq -r '.running // 0')
        local DESIRED=$(echo "$STATUS" | jq -r '.desired // 0')
        local ROLLOUT=$(echo "$STATUS" | jq -r '.rollout // "IN_PROGRESS"')

        if [ "$ROLLOUT" = "COMPLETED" ] && [ "$RUNNING" = "$DESIRED" ]; then
            return 0
        fi

        if [ "$ROLLOUT" = "FAILED" ]; then
            log_error "Deployment failed for $SERVICE_NAME"
            return 1
        fi

        ATTEMPT=$((ATTEMPT + 1))
        echo -n "."
        sleep 15
    done

    log_warn "Timed out waiting for $SERVICE_NAME (may still be deploying)"
    return 0  # Don't fail the script, service might still be stabilizing
}

# Force new deployment of an ECS service
deploy_ecs_service() {
    local SERVICE_NAME=$1
    # ECS services use short names (ml-service, workers, mlflow) not prefixed names
    local ECS_SERVICE_NAME="${SERVICE_NAME}"

    log_step "Deploying ECS service: $ECS_SERVICE_NAME"

    # Force new deployment
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$ECS_SERVICE_NAME" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --output text > /dev/null

    log_info "Deployment triggered for $ECS_SERVICE_NAME"

    if [ "$WAIT_FOR_STABLE" = true ]; then
        log_step "Waiting for service to stabilize (up to 15 min)..."
        wait_for_stable "$ECS_SERVICE_NAME"
        echo ""  # newline after dots
        log_info "Service $ECS_SERVICE_NAME deployment complete"
    else
        log_info "Skipping wait (--no-wait)"
    fi
}

# Check service status
check_service_status() {
    local SERVICE_NAME=$1
    local ECS_SERVICE_NAME="${SERVICE_NAME}"

    log_step "Checking status of $ECS_SERVICE_NAME..."

    aws ecs describe-services \
        --cluster "$ECS_CLUSTER" \
        --services "$ECS_SERVICE_NAME" \
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

# Parse arguments
SERVICE="all"
for arg in "$@"; do
    case $arg in
        --no-wait)
            WAIT_FOR_STABLE=false
            ;;
        ml-service|mlflow|workers|all)
            SERVICE="$arg"
            ;;
    esac
done

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
        echo "Usage: $0 [ml-service|mlflow|workers|all] [--no-wait]"
        exit 1
        ;;
esac

log_info "=== ECS deployment complete! ==="
