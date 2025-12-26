FROM python:3.13-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Production settings: no reload, single worker (can scale via ECS)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
