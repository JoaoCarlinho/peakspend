# peakspend

AI-powered expense management application demonstrating cutting-edge machine learning integration in fintech.

## Overview

peakspend is a portfolio-driven expense management application featuring a **context-aware AI Financial Assistant** that learns user patterns to provide intelligent expense categorization, anomaly detection, and personalized recommendations.

### Architecture

**Multi-Service Architecture:**
- **Frontend** - React 19.2 PWA with TypeScript and Material-UI
- **Backend** - Node.js 22 LTS REST API with Express and Prisma
- **ML Service** - Python 3.13 FastAPI service with XGBoost and MLflow
- **Database** - PostgreSQL 17.6 (ACID-compliant for financial data)
- **Cache/Queue** - Redis 7

**Technology Stack:**
- Frontend: React, TypeScript, Vite, Material-UI, React Query
- Backend: Express, TypeScript, Prisma, Passport.js, JWT
- ML: FastAPI, XGBoost, scikit-learn, MLflow, Celery
- Infrastructure: Docker Compose, AWS (ECS, RDS, S3, Textract)

## Prerequisites

- **Node.js** 22 LTS
- **Python** 3.13.7
- **Docker Desktop** (with Docker Compose)
- **Git**
- **AWS CLI** (for production deployment)

## Quick Start

### 1. Clone Repository

\`\`\`bash
git clone https://github.com/your-org/peakspend.git
cd peakspend
\`\`\`

### 2. Setup Environment Variables

\`\`\`bash
# Frontend
cp frontend/.env.example frontend/.env

# Backend
cp backend/.env.example backend/.env

# ML Service
cp ml-service/.env.example ml-service/.env
\`\`\`

Edit the `.env` files with your local configuration.

### 3. Start Services with Docker Compose

\`\`\`bash
docker-compose up -d
\`\`\`

This starts:
- PostgreSQL at `localhost:5432`
- Redis at `localhost:6379`
- MLflow at `localhost:5000`
- Backend API at `localhost:3000`
- ML Service at `localhost:8000`
- Frontend at `localhost:5173`

### 4. Access Application

Open your browser to [http://localhost:5173](http://localhost:5173)

## Development

### Local Development (without Docker)

**Frontend:**
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

**Backend:**
\`\`\`bash
cd backend
npm install
npx prisma migrate dev
npm run dev
\`\`\`

**ML Service:**
\`\`\`bash
cd ml-service
python3.13 -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
\`\`\`

### Docker Compose Commands

\`\`\`bash
# Start all services
docker-compose up

# Start in detached mode
docker-compose up -d

# Stop all services
docker-compose down

# Rebuild and start
docker-compose up --build

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend
\`\`\`

## Project Structure

\`\`\`
peakspend/
├── frontend/           # React PWA
├── backend/            # Node.js Express API
├── ml-service/         # Python FastAPI ML service
├── infrastructure/     # Terraform/IaC
├── docs/               # Documentation
├── docker-compose.yml
└── README.md
\`\`\`

See individual service READMEs for detailed documentation:
- [Frontend README](frontend/README.md)
- [Backend README](backend/README.md)
- [ML Service README](ml-service/README.md)

## Key Features

- **Context-Aware AI Categorization** - XGBoost-powered expense categorization that learns from user behavior
- **ML Performance Dashboard** - Real-time visualization of model accuracy, learning progress, and category performance
- **Anomaly Detection** - Automatic detection of unusual spending patterns
- **Smart Recommendations** - Personalized suggestions based on spending history
- **Receipt OCR** - AWS Textract integration for automatic receipt data extraction
- **Real-time Learning** - Continuous model improvement through user feedback
- **Privacy-First ML** - Per-user model isolation for data privacy
- **CSV Export** - Export expenses for external analysis and accounting software

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [Architecture Document](docs/architecture.md)
- [Epic 1 Technical Specification](docs/tech-spec-epic-1.md)

## Code Quality Tools

This project uses modern code quality tools configured with strict settings across all services:

### TypeScript Services (Frontend & Backend)

**Linting with ESLint:**
```bash
# Frontend
cd frontend && npm run lint
cd frontend && npm run lint:fix

# Backend
cd backend && npm run lint
cd backend && npm run lint:fix
```

**Formatting with Prettier:**
```bash
# Frontend
cd frontend && npm run format
cd frontend && npm run format:check

# Backend
cd backend && npm run format
cd backend && npm run format:check
```

**Type Checking:**
```bash
# Frontend
cd frontend && npx tsc --noEmit

# Backend
cd backend && npx tsc --noEmit
```

### Python ML Service

**Type Checking with mypy:**
```bash
cd ml-service && mypy app/
```

**Formatting & Linting with Ruff:**
```bash
cd ml-service && ruff format app/
cd ml-service && ruff check app/
cd ml-service && ruff check --fix app/
```

### Configuration Details

- **TypeScript**: Strict mode enabled with all strict flags
- **ESLint**: Configured with TypeScript, React (frontend), and Node.js (backend) best practices
- **Prettier**: Consistent formatting (single quotes, 100 char width, semicolons)
- **mypy**: Strict Python type checking for ML service
- **Ruff**: Fast Python linter and formatter replacing Black and Flake8

## Testing

This project has comprehensive test coverage across all services using modern testing tools.

### Frontend Tests (Vitest + React Testing Library)

\`\`\`bash
# Run tests in watch mode
cd frontend && npm test

# Run tests with coverage
cd frontend && npm run test:coverage

# Run tests with UI
cd frontend && npm run test:ui
\`\`\`

**Testing Stack:**
- **Vitest**: Fast unit test framework optimized for Vite
- **React Testing Library**: User-centric component testing
- **MSW (Mock Service Worker)**: API mocking
- **jest-axe**: Accessibility testing
- **@testing-library/user-event**: User interaction simulation

**Coverage Requirements:**
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

**Test Files:**
- Component tests: `**/__tests__/*.test.tsx`
- Hook tests: `hooks/__tests__/*.test.tsx`
- Accessibility tests: `components/__tests__/accessibility.test.tsx`

### Backend Tests (Jest + Supertest)

\`\`\`bash
# Run backend tests
cd backend && npm test

# Run with coverage
cd backend && npm run test:coverage
\`\`\`

### ML Service Tests (pytest)

\`\`\`bash
# Run ML service tests
cd ml-service && pytest

# Run with coverage
cd ml-service && pytest --cov=app --cov-report=html
\`\`\`

## CI/CD Pipeline

This project uses **GitHub Actions** for continuous integration and deployment.

### Workflow Triggers

- **Pull Requests** to `main`: Runs all tests and linters
- **Push to `main`**: Runs tests, builds Docker images, and deploys to AWS ECS

### Pipeline Stages

1. **Test Stage** (Parallel)
   - **Backend Tests**: ESLint + Unit/Integration tests with coverage
   - **Frontend Tests**: ESLint + Build verification (full tests in Epic 6)
   - **ML Service Tests**: pytest with coverage reporting

2. **Build Stage** (On main merge only)
   - Build Docker images for all three services
   - Tag images with git commit SHA and `latest`
   - Push to Amazon ECR

3. **Deploy Stage** (On main merge only)
   - Run database migrations (Prisma)
   - Deploy backend to AWS ECS
   - Deploy frontend to AWS ECS
   - Deploy ML service to AWS ECS
   - Wait for all deployments to stabilize

### Required GitHub Secrets

Configure these in your GitHub repository settings:

\`\`\`
AWS_ACCESS_KEY_ID       # AWS credentials for ECR/ECS access
AWS_SECRET_ACCESS_KEY   # AWS credentials for ECR/ECS access
DATABASE_URL            # Production PostgreSQL connection string
JWT_SECRET              # JWT signing secret
AWS_S3_BUCKET           # S3 bucket for receipt storage
\`\`\`

### Monitoring Pipeline Status

- PR checks show test results and build status
- Deployment notifications appear in Actions logs
- Coverage reports uploaded to Codecov

### Manual Deployment

To trigger a deployment manually:

\`\`\`bash
# Push to main branch
git push origin main
\`\`\`

To deploy a specific commit:

\`\`\`bash
# Tag the commit and push
git tag deploy-v1.0.0
git push origin deploy-v1.0.0
\`\`\`

## Monitoring and Logging

This project uses **AWS CloudWatch** for centralized logging and monitoring across all services.

### Logging

**Structured Logging Enabled:**
- **Backend**: Winston logger with CloudWatch integration
- **ML Service**: Python logging with watchtower CloudWatch handler
- **Frontend**: Error logging via API endpoints

**Log Configuration:**
- Log retention: 90 days
- Log groups: `/peakspend/backend`, `/peakspend/ml-service`, `/peakspend/frontend`
- Development: Console output with colors
- Production: JSON format to CloudWatch

### Metrics

**Application Metrics Tracked:**
- API request duration (p50, p95, p99)
- Request counts and error rates
- ML inference latency
- Database query performance

**Infrastructure Metrics:**
- ECS container CPU/Memory utilization
- RDS database connections and performance
- Redis memory usage
- S3 request metrics

### CloudWatch Alarms

Critical alarms configured:
- High error rate (>5%)
- High API latency (p95 >500ms)
- Database connection pool near limit (>80%)
- ECS container restart frequency
- ML inference latency (>1s)
- Redis memory usage (>80%)

Alerts sent via SNS to configured email/Slack channels.

### CloudWatch Dashboards

Access dashboards in AWS Console:
1. **Application Overview**: Request rates, latency, error rates
2. **ML Performance**: Inference metrics, accuracy trends
3. **Infrastructure Health**: CPU, memory, database metrics

**Deploy Monitoring Infrastructure:**

\`\`\`bash
# Deploy CloudWatch alarms (CloudFormation)
aws cloudformation deploy \\
  --template-file infrastructure/cloudwatch-alarms.yml \\
  --stack-name peakspend-monitoring \\
  --capabilities CAPABILITY_IAM

# Create CloudWatch dashboard
aws cloudwatch put-dashboard \\
  --dashboard-name PeakSpend-Overview \\
  --dashboard-body file://infrastructure/cloudwatch-dashboard.json
\`\`\`

## MLflow Experiment Tracking

This project uses **MLflow** for ML experiment tracking, model registry, and versioning.

### MLflow Features

**Experiment Tracking:**
- Per-user experiments for model isolation
- Hyperparameter logging (max_depth, learning_rate, n_estimators)
- Metrics tracking (accuracy, precision, recall, F1, top-3 accuracy)
- Training metadata (samples, features, classes)

**Model Registry:**
- Versioned models per user
- Model naming: `expense_categorizer_user_{user_id}`
- Stage transitions: None → Staging → Production
- Model lineage and metadata

### Accessing MLflow UI

**Local Development:**
```bash
# MLflow UI available at http://localhost:5000
docker-compose up mlflow
```

Navigate to [http://localhost:5000](http://localhost:5000) to view:
- Experiments and runs
- Model performance metrics
- Hyperparameter comparisons
- Model registry and versions

### Training a Model

**Via ML Service API:**
```bash
curl -X POST http://localhost:8000/api/training/train \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "user123",
    "training_data": [
      {
        "merchant": "Starbucks",
        "amount": 5.50,
        "category": "Dining",
        "notes": "Coffee"
      },
      ...50+ samples...
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "run_id": "abc123...",
  "model_name": "expense_categorizer_user_user123",
  "metrics": {
    "accuracy": 0.87,
    "precision_macro": 0.85,
    "recall_macro": 0.86,
    "f1_macro": 0.85,
    "top3_accuracy": 0.95
  },
  "samples": {
    "train": 40,
    "validation": 10
  }
}
```

### Making Predictions

**Via ML Service API:**
```bash
curl -X POST http://localhost:8000/api/inference/predict \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "user123",
    "merchant": "Whole Foods",
    "amount": 42.50,
    "notes": "Weekly groceries",
    "top_k": 3
  }'
```

**Response:**
```json
{
  "user_id": "user123",
  "predictions": [
    {
      "category": "Groceries",
      "confidence": 0.85,
      "confidence_pct": 85.0
    },
    {
      "category": "Shopping",
      "confidence": 0.10,
      "confidence_pct": 10.0
    },
    {
      "category": "Dining",
      "confidence": 0.05,
      "confidence_pct": 5.0
    }
  ],
  "model_version": "Production"
}
```

### MLflow Python API

**Loading Models in Code:**
```python
from app.models.categorizer import ExpenseCategorizer

# Load latest production model
categorizer = ExpenseCategorizer.load_from_mlflow(
    user_id="user123",
    stage="Production"
)

# Load specific version
categorizer = ExpenseCategorizer.load_from_mlflow(
    user_id="user123",
    version=2
)
```

### MLflow Configuration

**Environment Variables:**
```bash
# ML Service
MLFLOW_TRACKING_URI=http://mlflow:5000

# MLflow Service
MLFLOW_BACKEND_STORE_URI=postgresql://user:pass@postgres:5432/mlflow
MLFLOW_DEFAULT_ARTIFACT_ROOT=/mlflow/artifacts
```

**Backend Store:** PostgreSQL database for experiment/run metadata

**Artifact Store:** Local filesystem (development) or S3 (production)

## License

MIT

## Authors

- caiojoao

---

**Built with BMAD (BMM Agile Development) methodology**
