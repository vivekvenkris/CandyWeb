from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict
from pydantic import BaseModel

from app.models.candidate import Candidate, CandidateType
from app.services.candidate_reader import CandidateFileReader
from app.services.metafile_reader import MetaFileReader
from app.services.harmonic_matcher import HarmonicMatcher

router = APIRouter()

# In-memory storage (replace with database in production)
_candidates_cache: Dict[str, List[Candidate]] = {}
_candidates_by_utc_cache: Dict[str, Dict[str, List[Candidate]]] = {}
_csv_header_cache: Dict[str, str] = {}


class LoadCandidatesRequest(BaseModel):
    csv_path: str
    base_dir: str


class LoadCandidatesResponse(BaseModel):
    total_candidates: int
    utcs: List[str]
    csv_header: str
    classifiers: List[str]


class FilterRequest(BaseModel):
    base_dir: str
    utc: str
    types: List[CandidateType]
    sort_by: str = "FOLD_SNR"
    sort_order: str = "desc"  # "asc" or "desc"


class UpdateClassificationRequest(BaseModel):
    base_dir: str
    line_num: int
    candidate_type: CandidateType


class BulkClassifyRequest(BaseModel):
    base_dir: str
    line_nums: List[int]
    candidate_type: CandidateType
    only_same_beam: bool = False
    beam_name: Optional[str] = None


@router.post("/load", response_model=LoadCandidatesResponse)
async def load_candidates(request: LoadCandidatesRequest):
    """
    Load candidates from CSV file
    """
    import os
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from config import settings

    try:
        # Construct full path to CSV file
        full_csv_path = os.path.join(settings.SERVER_DATA_ROOT, request.csv_path)

        candidates, candidates_by_utc, csv_header = await CandidateFileReader.read_candidate_file(
            full_csv_path,
            request.base_dir
        )

        # Store in cache
        _candidates_cache[request.base_dir] = candidates
        _candidates_by_utc_cache[request.base_dir] = candidates_by_utc
        _csv_header_cache[request.base_dir] = csv_header

        # Find harmonic similarities for each UTC
        for utc, utc_candidates in candidates_by_utc.items():
            HarmonicMatcher.find_candidate_similarities(
                utc_candidates,
                freq_tolerance=1e-4,
                dm_tolerance=5.0
            )

        # Get unique classifiers
        classifiers = set()
        for c in candidates:
            classifiers.update(c.classifier_scores.keys())

        return LoadCandidatesResponse(
            total_candidates=len(candidates),
            utcs=sorted(candidates_by_utc.keys()),
            csv_header=csv_header,
            classifiers=sorted(list(classifiers))
        )

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading candidates: {str(e)}")


@router.post("/filter", response_model=List[Candidate])
async def filter_candidates(request: FilterRequest):
    """
    Filter and sort candidates for a specific UTC
    """
    if request.base_dir not in _candidates_by_utc_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    utc_map = _candidates_by_utc_cache[request.base_dir]
    if request.utc not in utc_map:
        raise HTTPException(status_code=404, detail=f"UTC {request.utc} not found")

    # Filter by types
    filtered = [
        c for c in utc_map[request.utc]
        if c.candidate_type in request.types and c.visible
    ]

    # Sort
    filtered.sort(
        key=lambda c: c.get_sortable_value(request.sort_by) or 0.0,
        reverse=(request.sort_order == "desc")
    )

    return filtered


@router.put("/classify")
async def update_classification(request: UpdateClassificationRequest):
    """
    Update classification for a single candidate
    """
    if request.base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    # Find and update candidate
    for candidate in _candidates_cache[request.base_dir]:
        if candidate.line_num == request.line_num:
            candidate.candidate_type = request.candidate_type
            return {"success": True, "line_num": request.line_num}

    raise HTTPException(status_code=404, detail=f"Candidate line {request.line_num} not found")


@router.post("/bulk-classify")
async def bulk_classify(request: BulkClassifyRequest):
    """
    Bulk classify multiple candidates (e.g., similar candidates)
    """
    if request.base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    updated_count = 0

    for candidate in _candidates_cache[request.base_dir]:
        if candidate.line_num in request.line_nums:
            # Check beam filter if requested
            if request.only_same_beam and request.beam_name:
                if candidate.beam_name != request.beam_name:
                    continue

            candidate.candidate_type = request.candidate_type
            updated_count += 1

    return {"success": True, "updated_count": updated_count}


@router.get("/{base_dir}/similar/{line_num}")
async def get_similar_candidates(base_dir: str, line_num: int):
    """
    Get similar candidates for a given candidate
    """
    if base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    # Find the candidate
    target_candidate = None
    for c in _candidates_cache[base_dir]:
        if c.line_num == line_num:
            target_candidate = c
            break

    if not target_candidate:
        raise HTTPException(status_code=404, detail=f"Candidate line {line_num} not found")

    # Get similar candidates
    similar_line_nums = target_candidate.similar_candidates
    similar_candidates = [
        c for c in _candidates_cache[base_dir]
        if c.line_num in similar_line_nums
    ]

    return {
        "target": target_candidate,
        "similar": similar_candidates,
        "count": len(similar_candidates)
    }


@router.get("/{base_dir}/stats")
async def get_statistics(base_dir: str):
    """
    Get statistics about loaded candidates
    """
    if base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    candidates = _candidates_cache[base_dir]

    # Count by type
    type_counts = {}
    for ctype in CandidateType:
        type_counts[ctype.value] = sum(1 for c in candidates if c.candidate_type == ctype)

    return {
        "total": len(candidates),
        "by_type": type_counts,
        "utcs": len(_candidates_by_utc_cache.get(base_dir, {}))
    }


@router.get("/{base_dir}/all", response_model=List[Candidate])
async def get_all_candidates(base_dir: str):
    """
    Get all candidates from all UTCs
    """
    if base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    return _candidates_cache[base_dir]


@router.get("/{base_dir}/metafile")
async def get_metafile(base_dir: str, utc: Optional[str] = Query(None)):
    """
    Get metafile data for the given base directory and optional UTC.
    Reads metafile path from candidates CSV for the given UTC.
    """
    import os
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from config import settings

    if not utc:
        raise HTTPException(status_code=400, detail="UTC parameter is required")

    # Get all candidates for this UTC
    if base_dir not in _candidates_by_utc_cache:
        raise HTTPException(status_code=404, detail=f"No candidates loaded for base_dir: {base_dir}")

    utc_candidates = _candidates_by_utc_cache[base_dir].get(utc, [])
    if not utc_candidates:
        raise HTTPException(status_code=404, detail=f"No candidates found for UTC: {utc}")

    # Extract unique metafile paths from all candidates for this UTC
    metafile_paths = set()
    for candidate in utc_candidates:
        if candidate.metafile_path:
            metafile_paths.add(candidate.metafile_path)

    if not metafile_paths:
        raise HTTPException(
            status_code=404,
            detail=f"No metafile_path found in candidates for UTC: {utc}"
        )

    if len(metafile_paths) > 1:
        raise HTTPException(
            status_code=500,
            detail=f"Multiple metafile paths found for UTC {utc}: {metafile_paths}. Expected only one unique metafile per UTC."
        )

    # Get the single unique metafile path
    relative_metafile_path = metafile_paths.pop()
    metafile_path = os.path.join(settings.SERVER_DATA_ROOT, base_dir, relative_metafile_path)

    print(f"Reading metafile from path: {metafile_path}")

    if not os.path.exists(metafile_path):
        raise HTTPException(
            status_code=404,
            detail=f"Metafile not found at path: {metafile_path}"
        )

    try:
        metafile = await MetaFileReader.parse_file(metafile_path)
        return metafile
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error parsing metafile at {metafile_path}: {str(e)}"
        )
