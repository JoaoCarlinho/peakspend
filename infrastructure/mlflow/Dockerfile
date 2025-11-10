FROM ghcr.io/mlflow/mlflow:latest

# Install PostgreSQL client library
RUN pip install --no-cache-dir psycopg2-binary

EXPOSE 5000

CMD ["mlflow", "server", "--host", "0.0.0.0", "--port", "5000"]
