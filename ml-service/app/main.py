from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    dashboard,
    feedback,
    health,
    inference,
    recommendations,
    retraining,
    training,
)

app = FastAPI(
    title="PeakSpend ML Service",
    version="1.0.0",
    description=(
        "Machine Learning service for intelligent expense categorization"
    ),
)

# Configure CORS for backend and frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Backend API
        "http://backend:3000",  # Backend API (Docker)
        "http://localhost:5173",  # Frontend dev server
        "http://frontend:5173",  # Frontend (Docker)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(health.router)
app.include_router(training.router)
app.include_router(inference.router)
app.include_router(recommendations.router)
app.include_router(feedback.router)
app.include_router(retraining.router)
app.include_router(dashboard.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
