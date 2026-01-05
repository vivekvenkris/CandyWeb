from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict
from pydantic import BaseModel
import httpx
from astropy.coordinates import SkyCoord

from app.models.candidate import Candidate, CandidateType
from app.services.candidate_reader import CandidateFileReader
from app.services.metafile_reader import MetaFileReader
from app.services.harmonic_matcher import HarmonicMatcher
from app.services.psrcat_parser import PSRCATParser

router = APIRouter()

# In-memory storage (replace with database in production)
_candidates_cache: Dict[str, List[Candidate]] = {}
_candidates_by_utc_cache: Dict[str, Dict[str, List[Candidate]]] = {}
_csv_header_cache: Dict[str, str] = {}

# Cached PSRCAT parser instance (singleton to avoid re-parsing the DB on every request)
_psrcat_parser: Optional[PSRCATParser] = None

# Cached PSRCAT shortlist per base_dir (only pulsars within observation's sky coverage)
_psrcat_shortlist_cache: Dict[str, List[Dict]] = {}


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

        # Generate PSRCAT shortlist for this observation
        # Use boresight coordinates if available, otherwise use first candidate
        if metafile.boresight and metafile.boresight.ra is not None and metafile.boresight.dec is not None:
            from astropy.coordinates import SkyCoord
            boresight_coord = SkyCoord(ra=metafile.boresight.ra, dec=metafile.boresight.dec, frame='icrs')

            # Initialize PSRCAT parser if needed
            global _psrcat_parser
            if _psrcat_parser is None and os.path.exists(settings.PSRCAT_DB_PATH):
                print(f"Initializing PSRCAT parser for shortlisting")
                _psrcat_parser = PSRCATParser(settings.PSRCAT_DB_PATH)
                print(f"PSRCAT parser initialized with {len(_psrcat_parser.pulsars)} pulsars")

            if _psrcat_parser is not None:
                # Create shortlist within 10 degrees of boresight
                shortlist = _psrcat_parser.shortlist_by_region(boresight_coord, radius_deg=10.0)

                # Cache the shortlist with key: base_dir:utc
                shortlist_key = f"{base_dir}:{utc}"
                _psrcat_shortlist_cache[shortlist_key] = shortlist
                print(f"Cached PSRCAT shortlist for {shortlist_key}: {len(shortlist)} pulsars")

        return metafile
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error parsing metafile at {metafile_path}: {str(e)}"
        )


@router.get("/pulsar-scraper/search")
async def search_pulsar_scraper(
    line_num: int = Query(..., description="Candidate line number"),
    base_dir: str = Query(..., description="Base directory name")
):
    """
    Query the pulsar survey scraper database for known pulsars near the candidate position.
    Converts RA/DEC from candidate to degrees and queries the external database.
    """
    import os
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from config import settings

    # Find the candidate
    if base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    target_candidate = None
    for c in _candidates_cache[base_dir]:
        if c.line_num == line_num:
            target_candidate = c
            break

    if not target_candidate:
        raise HTTPException(status_code=404, detail=f"Candidate line {line_num} not found")

    # Check if candidate has RA/DEC
    if target_candidate.ra is None or target_candidate.dec is None:
        raise HTTPException(
            status_code=400,
            detail="Candidate does not have RA/DEC coordinates"
        )

    # Convert RA/DEC to degrees for searching
    ra_deg = target_candidate.ra.degree
    dec_deg = target_candidate.dec.degree
    ra_hours = target_candidate.ra.hour

    # Get DM for search
    dm = target_candidate.dm_opt or 0.0

    # Build query URL
    scraper_url = (
        f"https://pulsar.cgca-hub.org/api"
        f"?type=search"
        f"&ra={ra_deg}"
        f"&dec={dec_deg}"
        f"&radius={settings.PULSAR_SCRAPER_RADIUS}"
        f"&dm={dm}"
        f"&dmtol={settings.PULSAR_SCRAPER_DM_TOL}"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(scraper_url)
            response.raise_for_status()
            data = response.json()

            # Transform PSC2 API response from dict to array
            # PSC2 returns {searchra: ..., searchdec: ..., nmatches: N, PSRNAME1: {...}, PSRNAME2: {...}}
            # We need to convert to array of pulsar objects
            metadata_keys = {'searchra', 'searchdec', 'searchcoord', 'searchrad', 'searchdm', 'searchdmtolerance', 'nmatches'}
            pulsars = []

            for key, value in data.items():
                if key not in metadata_keys and isinstance(value, dict):
                    # This is a pulsar entry
                    pulsar_data = {"name": key}

                    # Flatten the nested structure - extract 'value' from each field
                    for field_key, field_value in value.items():
                        if isinstance(field_value, dict) and 'value' in field_value:
                            pulsar_data[field_key] = field_value['value']
                        else:
                            pulsar_data[field_key] = field_value

                    # Map PSC2 fields to expected frontend fields
                    if 'ra' in pulsar_data:
                        pulsar_data['raj_deg'] = pulsar_data['ra']
                    if 'dec' in pulsar_data:
                        pulsar_data['decj_deg'] = pulsar_data['dec']
                    if 'period' in pulsar_data:
                        # Convert period from ms to seconds
                        pulsar_data['p0'] = pulsar_data['period'] / 1000.0
                    if 'distance' in pulsar_data:
                        # Convert distance from degrees to arcminutes
                        pulsar_data['angular_separation'] = pulsar_data['distance'] * 60.0

                    pulsars.append(pulsar_data)

            return {
                "candidate": {
                    "line_num": line_num,
                    "ra_hours": ra_hours,
                    "ra_deg": ra_deg,
                    "dec_deg": dec_deg,
                    "dm": dm
                },
                "search_params": {
                    "radius_arcmin": settings.PULSAR_SCRAPER_RADIUS,
                    "dm_tolerance": settings.PULSAR_SCRAPER_DM_TOL
                },
                "nmatches": data.get('nmatches', 0),
                "results": pulsars
            }
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error querying pulsar scraper database: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )


@router.get("/psrcat/search")
async def search_psrcat(
    line_num: int = Query(..., description="Candidate line number"),
    base_dir: str = Query(..., description="Base directory name")
):
    """
    Query the local PSRCAT database for known pulsars near the candidate position.
    Converts RA/DEC from candidate to degrees and searches the local psrcat.db file.
    """
    import os
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from config import settings

    # Find the candidate
    if base_dir not in _candidates_cache:
        raise HTTPException(status_code=404, detail="Candidates not loaded")

    target_candidate = None
    for c in _candidates_cache[base_dir]:
        if c.line_num == line_num:
            target_candidate = c
            break

    if not target_candidate:
        raise HTTPException(status_code=404, detail=f"Candidate line {line_num} not found")

    # Check if candidate has RA/DEC
    if target_candidate.ra is None or target_candidate.dec is None:
        raise HTTPException(
            status_code=400,
            detail="Candidate does not have RA/DEC coordinates"
        )


    # Convert RA/DEC to degrees for searching
    ra_deg = target_candidate.ra.degree
    dec_deg = target_candidate.dec.degree
    ra_hours = target_candidate.ra.hour

    # Get DM for search
    dm = target_candidate.dm_opt or 0.0

    # Check if PSRCAT database exists
    if not os.path.exists(settings.PSRCAT_DB_PATH):
        raise HTTPException(
            status_code=404,
            detail=f"PSRCAT database not found at {settings.PSRCAT_DB_PATH}"
        )

    try:
        # Use cached parser instance, or create one if it doesn't exist
        global _psrcat_parser
        if _psrcat_parser is None:
            print(f"Initializing PSRCAT parser from {settings.PSRCAT_DB_PATH}")
            _psrcat_parser = PSRCATParser(settings.PSRCAT_DB_PATH)
            print(f"PSRCAT parser initialized with {len(_psrcat_parser.pulsars)} pulsars")

        parser = _psrcat_parser

        # Get cached SkyCoord from candidate
        target_coord = target_candidate.coord
        if target_coord is None:
            raise HTTPException(
                status_code=400,
                detail="Failed to create coordinate from candidate RA/DEC"
            )

        # Search with configured radius in degrees
        # Convert degrees to arcminutes for the search_nearby function
        radius_arcmin = settings.PSRCAT_SEARCH_RADIUS_DEG * 60.0

        # Try to use shortlist if available
        shortlist_key = f"{base_dir}:{target_candidate.utc_start}"
        shortlist = _psrcat_shortlist_cache.get(shortlist_key)

        if shortlist is not None:
            print(f"Using PSRCAT shortlist with {len(shortlist)} pulsars")
        else:
            print(f"No shortlist available, searching all {len(parser.pulsars)} pulsars")

        # Get ALL pulsars within radius (no DM filtering)
        matches = parser.search_nearby(
            target=target_coord,
            radius_arcmin=radius_arcmin,
            dm=None,  # Don't filter by DM
            dm_tolerance=None,  # Don't filter by DM
            shortlist=shortlist  # Use shortlist if available
        )

        # Calculate frequency ratios and DM differences for all matches
        candidate_f0 = target_candidate.f0_opt or target_candidate.f0_user
        candidate_dm = target_candidate.dm_opt or 0.0

        # Convert matches to JSON-serializable format
        serializable_matches = []
        for match in matches:
            # Calculate DM difference
            if 'dm' in match and match['dm'] is not None:
                delta_dm = abs(match['dm'] - candidate_dm)
            else:
                delta_dm = None

            # Calculate frequency ratios
            if candidate_f0 and ('f0' in match or 'p0' in match):
                pulsar_f0 = match.get('f0') or (1.0 / match['p0'] if 'p0' in match else None)
                if pulsar_f0:
                    freq_ratio_cand_psr = candidate_f0 / pulsar_f0
                    freq_ratio_psr_cand = pulsar_f0 / candidate_f0
                else:
                    freq_ratio_cand_psr = None
                    freq_ratio_psr_cand = None
            else:
                freq_ratio_cand_psr = None
                freq_ratio_psr_cand = None

            # Create serializable dict with only primitive types
            serializable_match = {
                'name': match.get('name'),
                'name_b': match.get('name_b'),
                'ra_str': match.get('ra_str'),
                'dec_str': match.get('dec_str'),
                'dm': match.get('dm'),
                'p0': match.get('p0'),
                'f0': match.get('f0'),
                'dist_kpc': match.get('dist_kpc'),
                'dist_pc': match.get('dist_pc'),
                'angular_distance_arcmin': match.get('angular_distance_arcmin'),
                'angular_distance_deg': match.get('angular_distance_deg'),
                'delta_dm': delta_dm,
                'freq_ratio_cand_psr': freq_ratio_cand_psr,
                'freq_ratio_psr_cand': freq_ratio_psr_cand,
            }
            serializable_matches.append(serializable_match)

        return {
            "candidate": {
                "line_num": line_num,
                "ra_hours": ra_hours,
                "ra_deg": ra_deg,
                "dec_deg": dec_deg,
                "dm": candidate_dm,
                "f0": candidate_f0
            },
            "search_params": {
                "radius_deg": settings.PSRCAT_SEARCH_RADIUS_DEG,
                "radius_arcmin": radius_arcmin
            },
            "results": serializable_matches,
            "count": len(serializable_matches)
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error searching PSRCAT database: {str(e)}"
        )
