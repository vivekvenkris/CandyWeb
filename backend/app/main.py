from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import sys

# Add parent directory to path for config import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routers import candidates, files, auth
from config import settings

app = FastAPI(
    title="CandyWeb API",
    description="Web-based pulsar candidate viewer API",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api", tags=["authentication"])
app.include_router(candidates.router, prefix="/api/candidates", tags=["candidates"])
app.include_router(files.router, prefix="/api/files", tags=["files"])


@app.get("/")
async def root():
    return {
        "message": "CandyWeb API",
        "version": "1.0.0",
        "docs": "/docs",
        "data_root": settings.SERVER_DATA_ROOT
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/config")
async def get_config():
    """Get server configuration (non-sensitive info only)"""
    return {
        "data_root": settings.SERVER_DATA_ROOT,
        "autosave_interval": settings.AUTOSAVE_INTERVAL,
        "max_candidates": settings.MAX_CANDIDATES_PER_REQUEST
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
