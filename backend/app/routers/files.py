from fastapi import APIRouter, HTTPException, Cookie
from fastapi.responses import FileResponse
from typing import List, Optional
from pydantic import BaseModel
import os
import sys
from pathlib import Path

# Add parent directory to path for config import
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from config import settings
from app.services.database import validate_session as db_validate_session

router = APIRouter()


class DirectoryInfo(BaseModel):
    path: str
    name: str
    is_file: bool


class SaveClassificationRequest(BaseModel):
    base_dir: str
    filename: str
    candidates: List[dict]  # List of {line_num, utc, png_path, classification}
    csv_header: str


@router.get("/list-directories")
async def list_directories(server_root: Optional[str] = None):
    """
    List available directories on the server

    If server_root is not provided, uses the configured SERVER_DATA_ROOT from settings
    """
    try:
        # Use configured root if not provided
        if server_root is None:
            server_root = settings.SERVER_DATA_ROOT

        if not os.path.exists(server_root):
            raise HTTPException(status_code=404, detail=f"Server root directory not found: {server_root}")

        directories = []
        for item in os.listdir(server_root):
            item_path = os.path.join(server_root, item)
            if os.path.isdir(item_path):
                # Check if it contains candidates.csv
                csv_path = os.path.join(item_path, "candidates.csv")
                has_csv = os.path.exists(csv_path)

                directories.append({
                    "path": item,  # Return relative path (just the directory name)
                    "name": item,
                    "has_candidates_csv": has_csv
                })

        return {
            "server_root": server_root,
            "directories": directories
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing directories: {str(e)}")


@router.get("/image")
async def get_image(path: str):
    """
    Serve candidate PNG image
    Path should be relative to SERVER_DATA_ROOT
    """
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from config import settings

    # Construct full path relative to SERVER_DATA_ROOT
    full_path = os.path.join(settings.SERVER_DATA_ROOT, path)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")

    # Add aggressive caching headers to speed up image loading
    return FileResponse(
        full_path,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",  # Cache for 1 year (images don't change)
            "ETag": f'"{os.path.getmtime(full_path)}"',  # Use modification time as ETag
        }
    )


@router.post("/save-classification")
async def save_classification(
    request: SaveClassificationRequest,
    session_token: Optional[str] = Cookie(None)
):
    """
    Save classification results to CSV file
    """
    # Validate session and get username
    session = db_validate_session(session_token) if session_token else None
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")

    username = session["username"]

    try:
        # Get absolute path from server data root
        base_path = os.path.join(settings.SERVER_DATA_ROOT, request.base_dir)

        # Replace 'user' with actual username in filename
        filename = request.filename.replace('_user.csv', f'_{username}.csv')
        save_path = os.path.join(base_path, filename)

        # Ensure directory exists
        os.makedirs(os.path.dirname(save_path), exist_ok=True)

        # Write classification CSV
        with open(save_path, 'w') as f:
            f.write("beamid,utc,png,classification\n")
            for cand in request.candidates:
                line = f"{cand.get('beam_id', '')},{cand.get('utc', '')},{cand.get('png_path', '')},{cand.get('classification', '')}\n"
                f.write(line)

        # Also write full CSV
        full_path = save_path.replace('.csv', '_full.csv')
        with open(full_path, 'w') as f:
            f.write(request.csv_header + ",classification\n")
            for cand in request.candidates:
                line = f"{cand.get('csv_line', '')},{cand.get('classification', '')}\n"
                f.write(line)

        return {
            "success": True,
            "path": save_path,
            "full_path": full_path,
            "filename": filename
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving classification: {str(e)}")


@router.post("/load-classification")
async def load_classification(base_dir: str, filename: str):
    """
    Load existing classification from file
    """
    try:
        load_path = os.path.join(base_dir, filename)

        if not os.path.exists(load_path):
            raise HTTPException(status_code=404, detail="Classification file not found")

        classifications = []
        with open(load_path, 'r') as f:
            lines = f.readlines()

            # Skip header
            for line in lines[1:]:
                if line.strip():
                    parts = line.strip().split(',')
                    if len(parts) >= 4:
                        classifications.append({
                            "beam_id": parts[0],
                            "utc": parts[1],
                            "png_path": parts[2],
                            "classification": parts[3]
                        })

        return {"classifications": classifications}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading classification: {str(e)}")
