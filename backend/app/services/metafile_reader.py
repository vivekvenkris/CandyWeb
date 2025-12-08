import os
import json
from typing import Dict, Optional, List, Tuple
from datetime import datetime
from multiprocessing import Pool, cpu_count

from app.models.candidate import MetaFile, Beam
from config import settings


# Helper functions for neighbor calculation (module-level for multiprocessing)
import math
import numpy as np


def _position_within_beam(beam: Beam, ra: float, dec: float) -> bool:
    """Check if a point (ra, dec) in hours/degrees is within a beam ellipse"""
    if not all([beam.ellipse_x, beam.ellipse_y, beam.ellipse_angle is not None]):
        # Fallback: simple distance check
        ra_deg = ra * 15.0
        dec_deg = dec
        beam_ra_deg = beam.ra * 15.0
        beam_dec_deg = beam.dec
        distance = math.sqrt((ra_deg - beam_ra_deg)**2 + (dec_deg - beam_dec_deg)**2)
        return distance < 0.1

    # Convert RA from hours to degrees
    x = ra * 15.0
    y = dec
    x0 = beam.ra * 15.0
    y0 = beam.dec
    a = beam.ellipse_x
    b = beam.ellipse_y
    theta = -beam.ellipse_angle

    # Rotate point into ellipse coordinate system
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    xr = cos_theta * (x - x0) - sin_theta * (y - y0)
    yr = sin_theta * (x - x0) + cos_theta * (y - y0)

    # Check if point is inside ellipse
    return (xr**2 / a**2) + (yr**2 / b**2) <= 1.0


def _check_containment(b1: Beam, b2: Beam) -> bool:
    """Check if the center of b1 is inside b2 or vice versa"""
    return _position_within_beam(b2, b1.ra, b1.dec) or \
           _position_within_beam(b1, b2.ra, b2.dec)


def _ellipse_parametric(t_values, a, b, x0, y0, theta):
    """Generate parametric points on an ellipse"""
    cos_t = np.cos(t_values)
    sin_t = np.sin(t_values)
    x = x0 + a * cos_t * np.cos(theta) - b * sin_t * np.sin(theta)
    y = y0 + a * cos_t * np.sin(theta) + b * sin_t * np.cos(theta)
    return x, y


def _discrete_overlap(b1: Beam, b2: Beam, num_points: int = 100) -> bool:
    """Check if two beam ellipses overlap using discrete point sampling"""
    # First check if centers are contained
    if _check_containment(b1, b2):
        return True

    # Check if either beam is missing ellipse parameters
    if not all([b1.ellipse_x, b1.ellipse_y, b1.ellipse_angle is not None]):
        return False
    if not all([b2.ellipse_x, b2.ellipse_y, b2.ellipse_angle is not None]):
        return False

    # Generate points on the perimeter of beam1
    t_values = np.linspace(0, 2 * np.pi, num_points)

    # Convert RA from hours to degrees for calculations
    b1_ra_deg = b1.ra * 15.0
    b1_dec_deg = b1.dec

    x1, y1 = _ellipse_parametric(
        t_values,
        b1.ellipse_x,
        b1.ellipse_y,
        b1_ra_deg,
        b1_dec_deg,
        b1.ellipse_angle
    )

    # Check if any points on the perimeter of b1 lie inside b2
    for x, y in zip(x1, y1):
        ra_hours = x / 15.0
        if _position_within_beam(b2, ra_hours, y):
            return True

    return False


def _compute_neighbors_for_beam(args: Tuple[str, Beam, Dict[str, Beam]]) -> Tuple[str, List[str]]:
    """Compute neighbors for a single beam (for parallel processing)"""
    beam_name, beam, all_beams = args
    neighbor_names = []

    for other_name, other_beam in all_beams.items():
        if beam_name == other_name:
            continue

        if _discrete_overlap(beam, other_beam):
            neighbor_names.append(other_name)

    return beam_name, neighbor_names


class MetaFileReader:
    """
    Reads and parses APSUSE metafiles
    Mirrors functionality of Java ApsuseMetaReader
    """

    @staticmethod
    def parse_angle(angle_str: str, format: str) -> float:
        """
        Parse angle string to decimal value

        Args:
            angle_str: Angle string (e.g., "12:34:56.78")
            format: "HMS" for hours or "DMS" for degrees

        Returns:
            Decimal hours (for HMS) or decimal degrees (for DMS)
        """
        try:
            parts = angle_str.strip().split(':')
            if len(parts) == 3:
                h, m, s = map(float, parts)
                sign = 1 if not angle_str.strip().startswith('-') else -1
                value = sign * (abs(h) + m/60.0 + s/3600.0)
                return value
            return float(angle_str)
        except:
            return 0.0

    @staticmethod
    async def parse_file(metafile_path: str) -> MetaFile:
        """
        Parse APSUSE metafile

        Args:
            metafile_path: Path to metafile (JSON or text format)

        Returns:
            MetaFile object
        """
        if not os.path.exists(metafile_path):
            raise FileNotFoundError(f"Metafile not found: {metafile_path}")

        metafile = MetaFile(file_name=os.path.basename(metafile_path))

        try:
            # Try JSON format first
            with open(metafile_path, 'r') as f:
                data = json.load(f)

            # Parse JSON metafile
            metafile.bandwidth = data.get('bandwidth')
            metafile.output_dir = data.get('output_dir')
            metafile.schedule_block_id = data.get('schedule_block_id')
            metafile.project_name = data.get('project_name')
            metafile.tsamp_coherent = data.get('tsamp_coherent')
            metafile.num_chans_coherent = data.get('num_chans_coherent')
            metafile.tsamp_incoherent = data.get('tsamp_incoherent')
            metafile.num_chans_incoherent = data.get('num_chans_incoherent')
            metafile.centre_freq = data.get('centre_freq')

            # Parse UTC
            if 'utc' in data:
                try:
                    metafile.utc = datetime.fromisoformat(data['utc'])
                except:
                    pass

            # Parse beamshape (applies to all beams in old format)
            beamshape = None
            if 'beamshape' in data:
                beamshape_str = data.get('beamshape')
                if isinstance(beamshape_str, str):
                    # Old format: beamshape is a JSON string
                    try:
                        beamshape = json.loads(beamshape_str)
                    except:
                        pass
                elif isinstance(beamshape_str, dict):
                    # Already parsed
                    beamshape = beamshape_str

            # Parse beams
            beams_data = data.get('beams', {})
            for beam_name, beam_info in beams_data.items():
                # Skip IFBF beams
                if 'ifbf' in beam_name.lower():
                    continue

                # Handle both old format (comma-separated string) and new format (dict)
                if isinstance(beam_info, str):
                    # Old format: "beam_id,beam_num,ra,dec"
                    parts = beam_info.split(',')
                    if len(parts) >= 4:
                        ra_str = parts[2].strip()
                        dec_str = parts[3].strip()
                        # Parse HMS/DMS format
                        ra = MetaFileReader.parse_angle(ra_str, 'HMS')
                        dec = MetaFileReader.parse_angle(dec_str, 'DMS')
                    else:
                        continue

                    # Use beamshape for ellipse params
                    # Convert angle from degrees to radians
                    import math
                    angle_deg = beamshape.get('angle') if beamshape else None
                    angle_rad = math.radians(angle_deg) if angle_deg is not None else None

                    beam = Beam(
                        name=beam_name,
                        ra=ra,
                        dec=dec,
                        radius=None,
                        ellipse_x=beamshape.get('x') if beamshape else None,
                        ellipse_y=beamshape.get('y') if beamshape else None,
                        ellipse_angle=angle_rad
                    )
                else:
                    # New format: dict with fields
                    beam = Beam(
                        name=beam_name,
                        ra=beam_info.get('ra', 0.0),
                        dec=beam_info.get('dec', 0.0),
                        radius=beam_info.get('radius'),
                        ellipse_x=beam_info.get('ellipse_x'),
                        ellipse_y=beam_info.get('ellipse_y'),
                        ellipse_angle=beam_info.get('ellipse_angle')
                    )

                metafile.beams[beam_name] = beam

            # Parse boresight
            if 'boresight' in data:
                boresight_info = data['boresight']
                if isinstance(boresight_info, str):
                    # Old format: "beam_id,beam_num,ra,dec"
                    parts = boresight_info.split(',')
                    if len(parts) >= 4:
                        ra_str = parts[2].strip()
                        dec_str = parts[3].strip()
                        # Parse HMS/DMS format
                        ra = MetaFileReader.parse_angle(ra_str, 'HMS')
                        dec = MetaFileReader.parse_angle(dec_str, 'DMS')
                        metafile.boresight = Beam(
                            name='boresight',
                            ra=ra,
                            dec=dec,
                            radius=None
                        )
                else:
                    # New format: dict
                    metafile.boresight = Beam(
                        name=boresight_info.get('name', 'boresight'),
                        ra=boresight_info.get('ra', 0.0),
                        dec=boresight_info.get('dec', 0.0),
                        radius=boresight_info.get('radius')
                    )

        except json.JSONDecodeError:
            # Fallback to text format parsing
            metafile = await MetaFileReader._parse_text_format(metafile_path)

        # Calculate RA/DEC bounds
        if metafile.beams:
            ras = [b.ra for b in metafile.beams.values()]
            decs = [b.dec for b in metafile.beams.values()]

            metafile.min_ra = min(ras)
            metafile.max_ra = max(ras)
            metafile.min_dec = min(decs)
            metafile.max_dec = max(decs)

        # Find neighbors for all beams (if enabled in config)
        if settings.CALCULATE_NEIGHBORS:
            MetaFileReader._find_neighbours(metafile)

        return metafile

    @staticmethod
    async def _parse_text_format(metafile_path: str) -> MetaFile:
        """
        Parse text-based metafile format (legacy)

        This is a simplified parser - extend based on actual format
        """
        metafile = MetaFile(file_name=os.path.basename(metafile_path))
        metafile.stale = True  # Mark as stale if text format

        # Add basic parsing logic here based on actual text format
        # For now, return empty metafile marked as stale

        return metafile

    @staticmethod
    def _find_neighbours(metafile: MetaFile):
        """
        Find neighboring beams for each beam based on ellipse overlap detection

        Uses discrete point sampling on ellipse perimeters to detect overlaps
        Parallel processing using multiprocessing Pool for performance
        """
        if not metafile.beams:
            return

        # Determine number of processes
        num_cores = settings.NEIGHBOR_CALC_CORES
        if num_cores <= 0:
            num_cores = cpu_count()

        num_beams = len(metafile.beams)
        # Use fewer processes if we have fewer beams
        num_processes = min(num_cores, num_beams)

        print(f"Computing neighbors for {num_beams} beams using {num_processes} processes...")

        # Prepare arguments for parallel processing
        args_list = [
            (beam_name, beam, metafile.beams)
            for beam_name, beam in metafile.beams.items()
        ]

        # Use multiprocessing Pool to compute neighbors in parallel
        try:
            with Pool(processes=num_processes) as pool:
                results = pool.map(_compute_neighbors_for_beam, args_list)

            # Update beams with computed neighbors
            for beam_name, neighbor_names in results:
                metafile.beams[beam_name].neighbour_beams = neighbor_names

            print(f"Neighbor computation complete. Average neighbors per beam: {sum(len(n) for _, n in results) / len(results):.1f}")
        except Exception as e:
            print(f"Error in parallel neighbor computation: {e}")
            # Fallback to sequential processing
            print("Falling back to sequential processing...")
            for beam_name, beam in metafile.beams.items():
                _, neighbor_names = _compute_neighbors_for_beam((beam_name, beam, metafile.beams))
                beam.neighbour_beams = neighbor_names
