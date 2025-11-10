# peakspend - ML Service

Python 3.13 FastAPI service for machine learning inference and training.

## Tech Stack

- Python 3.13.7
- FastAPI 0.120.4
- XGBoost
- scikit-learn
- MLflow
- Celery + Redis

## Prerequisites

- Python 3.13.7
- Redis 7

## Setup

### 1. Create Virtual Environment

```bash
python3.13 -m venv venv
```

### 2. Activate Virtual Environment

**Unix/macOS:**
```bash
source venv/bin/activate
```

**Windows:**
```bash
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
cp .env.example .env
```

### 5. Run Development Server

```bash
uvicorn app.main:app --reload --port 8000
```

ML Service will be available at [http://localhost:8000](http://localhost:8000)

## Project Structure

```
app/
├── api/        # API endpoints
├── models/     # ML models
├── services/   # Business logic
├── tasks/      # Celery tasks
├── schemas/    # Pydantic schemas
├── config/     # Configuration
└── utils/      # Utility functions
```

## Available Endpoints

- `GET /health` - Health check
- `GET /ready` - Readiness probe

## Docker

Use Docker Compose from project root:

```bash
docker-compose up ml-service
```

## Code Quality Tools

### Type Checking

Run mypy for Python type checking:

```bash
mypy app/
```

### Code Formatting

Format code with Ruff:

```bash
ruff format app/
```

### Linting

Check code with Ruff linter:

```bash
ruff check app/
```

Auto-fix linting issues:

```bash
ruff check --fix app/
```
