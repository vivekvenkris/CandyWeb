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
from astropy.coordinates import Angle
from astropy import units as u


def _position_within_beam(beam: Beam, ra: Angle, dec: Angle) -> bool:
    """Check if a point (ra, dec) is within a beam ellipse."""
    if beam.ra is None or beam.dec is None or ra is None or dec is None:
        return False

    if not (beam.ellipse_x and beam.ellipse_y and beam.ellipse_angle is not None):
        # Fallback: simple distance check in degrees
        ra_deg = ra.to_value(u.degree)
        dec_deg = dec.to_value(u.degree)
        beam_ra_deg = beam.ra.to_value(u.degree)
        beam_dec_deg = beam.dec.to_value(u.degree)
        distance = math.sqrt((ra_deg - beam_ra_deg)**2 + (dec_deg - beam_dec_deg)**2)
        return distance < 0.1

    # Convert to degrees for ellipse math
    x = ra.to_value(u.degree)
    y = dec.to_value(u.degree)
    x0 = beam.ra.to_value(u.degree)
    y0 = beam.dec.to_value(u.degree)
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
    if b1.ra is None or b1.dec is None or b2.ra is None or b2.dec is None:
        return False

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

    # Convert RA/DEC to degrees for calculations
    b1_ra_deg = b1.ra.to_value(u.degree)
    b1_dec_deg = b1.dec.to_value(u.degree)

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
        if _position_within_beam(b2, Angle(x, unit=u.degree), Angle(y, unit=u.degree)):
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
    def parse_angle(angle_str: str, format: str) -> Optional[Angle]:
        """
        Parse angle string to an Angle

        Args:
            angle_str: Angle string (e.g., "12:34:56.78")
            format: "HMS" for hours or "DMS" for degrees

        Returns:
            Angle in the requested unit, or None if parsing fails
        """
        if not angle_str:
            return None

        try:
            angle_str = angle_str.strip()
            unit = u.hourangle if format.upper() == 'HMS' else u.degree
            if ':' in angle_str:
                return Angle(angle_str, unit=unit)
            return Angle(float(angle_str), unit=unit)
        except:
            return None

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
            ras = [b.ra for b in metafile.beams.values() if b.ra is not None]
            decs = [b.dec for b in metafile.beams.values() if b.dec is not None]

            if ras:
                metafile.min_ra = min(ras, key=lambda angle: angle.to_value(u.degree))
                metafile.max_ra = max(ras, key=lambda angle: angle.to_value(u.degree))
            if decs:
                metafile.min_dec = min(decs, key=lambda angle: angle.to_value(u.degree))
                metafile.max_dec = max(decs, key=lambda angle: angle.to_value(u.degree))

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
