import csv
import os
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import re
from astropy.coordinates import Angle
from astropy import units as u

from app.models.candidate import Candidate, CandidateType


class CandidateFileReader:
    """
    Reads and parses candidate CSV files
    Mirrors functionality of Java CandidateFileReader
    """

    # Expected CSV column names
    CSV_COLUMNS = [
        "pointing_id", "beam_id", "beam_name", "source_name",
        "ra", "dec", "gl", "gb",
        "mjd_start", "utc_start",
        "f0_user", "f0_opt", "f0_opt_err",
        "f1_user", "f1_opt", "f1_opt_err",
        "acc_user", "acc_opt", "acc_opt_err",
        "dm_user", "dm_opt", "dm_opt_err",
        "sn_fft", "sn_fold",
        "pepoch", "maxdm_ymw16", "dist_ymw16",
        "png_path", "metafile_path", "filterbank_path", "candidate_tarball_path",
        "tobs"
    ]

    CLASSIFIER_NAMES = [
        "pics_palfa",
        "pics_trapum_ter5",
        "pics_m_LS_recall",
        "pics_pm_LS_fscore"
    ]

    @staticmethod
    def parse_ra_angle(hms_str: str) -> Optional[Angle]:
        """Parse HH:MM:SS.SSS or decimal hours into an Angle."""
        if not hms_str:
            return None
        try:
            if ':' in hms_str:
                return Angle(hms_str, unit=u.hourangle)
            return Angle(float(hms_str), unit=u.hourangle)
        except Exception as e:
            print(f"Error parsing RA '{hms_str}': {e}")
            return None

    @staticmethod
    def parse_degree_angle(angle_str: str) -> Optional[Angle]:
        """Parse DD:MM:SS.SSS or decimal degrees into an Angle."""
        if not angle_str:
            return None
        try:
            if ':' in angle_str:
                return Angle(angle_str, unit=u.degree)
            return Angle(float(angle_str), unit=u.degree)
        except Exception as e:
            print(f"Error parsing degree angle '{angle_str}': {e}")
            return None

    @staticmethod
    async def read_candidate_file(
        csv_path: str,
        base_dir: str
    ) -> tuple[List[Candidate], Dict[str, List[Candidate]], str]:
        """
        Read candidates from CSV file

        Args:
            csv_path: Path to candidates.csv
            base_dir: Base directory for resolving relative paths

        Returns:
            Tuple of (all_candidates, candidates_by_utc, csv_header)
        """
        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"CSV file not found: {csv_path}")

        candidates: List[Candidate] = []
        candidates_by_utc: Dict[str, List[Candidate]] = {}
        csv_header = ""

        with open(csv_path, 'r') as f:
            # Read all lines
            lines = f.readlines()

            # Find header line
            header_line = None
            for line in lines:
                if 'utc_start' in line.lower() and not line.strip().startswith('#'):
                    header_line = line.strip()
                    csv_header = header_line
                    break

            if not header_line:
                raise ValueError("CSV header with 'utc_start' not found")

            # Parse header to get column positions
            headers = header_line.split(',')
            raw_header_map = {h.strip(): i for i, h in enumerate(headers)}

            # Create normalized header map with aliases (_usr -> _user)
            header_map = {}
            for h, i in raw_header_map.items():
                header_map[h] = i
                # Add alias: if header has _usr, also map it to _user version
                if '_usr' in h:
                    normalized = h.replace('_usr', '_user')
                    header_map[normalized] = i

            # Track discovered classifier names
            classifier_names = [h for h in headers if 'pics' in h.lower()]

            # Process data lines
            line_num = 0
            for line in lines:
                if line.strip().startswith('#') or 'pointing_id' in line.lower():
                    continue

                line_num += 1
                chunks = line.strip().split(',')

                if len(chunks) < 5:  # Skip invalid lines
                    continue

                try:
                    candidate = Candidate(line_num=line_num, csv_line=line.strip())

                    # Parse each field based on header position
                    for col in CandidateFileReader.CSV_COLUMNS:
                        if col in header_map:
                            idx = header_map[col]
                            if idx < len(chunks):
                                value = chunks[idx].strip()

                                # Parse based on column type
                                if col == "pointing_id":
                                    candidate.pointing_id = int(value) if value else None
                                elif col == "beam_id":
                                    candidate.beam_id = int(value) if value else None
                                elif col in ["beam_name", "source_name"]:
                                    setattr(candidate, col, value)
                                elif col == "ra":
                                    candidate.ra = CandidateFileReader.parse_ra_angle(value)
                                elif col == "dec":
                                    candidate.dec = CandidateFileReader.parse_degree_angle(value)
                                elif col in ["gl", "gb"]:
                                    setattr(candidate, col, CandidateFileReader.parse_degree_angle(value))
                                elif col == "mjd_start":
                                    candidate.mjd_start = float(value) if value else None
                                elif col == "utc_start":
                                    candidate.utc_start = value
                                    try:
                                        candidate.start_utc = datetime.fromisoformat(value)
                                    except:
                                        pass
                                elif col in [
                                    "f0_user", "f0_opt", "f0_opt_err",
                                    "f1_user", "f1_opt", "f1_opt_err",
                                    "acc_user", "acc_opt", "acc_opt_err",
                                    "dm_user", "dm_opt", "dm_opt_err",
                                    "sn_fft", "sn_fold", "pepoch",
                                    "maxdm_ymw16", "dist_ymw16", "tobs"
                                ]:
                                    setattr(candidate, col, float(value) if value else None)
                                elif col in ["png_path", "metafile_path", "filterbank_path", "candidate_tarball_path"]:
                                    setattr(candidate, col, value if value else None)

                    # Parse classifier scores
                    for classifier in classifier_names:
                        if classifier in header_map:
                            idx = header_map[classifier]
                            if idx < len(chunks):
                                try:
                                    candidate.classifier_scores[classifier] = float(chunks[idx])
                                except:
                                    pass

                    candidates.append(candidate)

                    # Group by UTC
                    utc_key = candidate.utc_start or "unknown"
                    if utc_key not in candidates_by_utc:
                        candidates_by_utc[utc_key] = []
                    candidates_by_utc[utc_key].append(candidate)

                except Exception as e:
                    print(f"Error parsing line {line_num}: {e}")
                    continue

        print(f"Read {len(candidates)} candidates from {csv_path}")
        print(f"Found {len(candidates_by_utc)} unique UTCs")
        print(f"Found {len(classifier_names)} classifier scores: {classifier_names}")

        return candidates, candidates_by_utc, csv_header
