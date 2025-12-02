import os
import json
from typing import Dict, Optional
from datetime import datetime

from app.models.candidate import MetaFile, Beam


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

        # Find neighbors for all beams
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
        Find neighboring beams for each beam based on Gaussian beam intersection

        Mirrors Java MetaFile.findNeighbours()
        """
        import math

        def beam_intersection(b1: Beam, b2: Beam) -> float:
            """Calculate Gaussian beam intersection value"""
            if not all([b2.ellipse_x, b2.ellipse_y, b2.ellipse_angle]):
                # If ellipse params missing, use distance
                ra_diff = (b1.ra - b2.ra) * 15.0  # Convert RA hours to degrees
                dec_diff = b1.dec - b2.dec
                distance = math.sqrt(ra_diff**2 + dec_diff**2)
                return math.exp(-distance**2)

            # Gaussian ellipse intersection calculation
            x_mean = b1.ra
            y_mean = b1.dec
            x = b2.ra
            y = b2.dec
            angle = b2.ellipse_angle - math.pi
            x_sigma = b2.ellipse_x
            y_sigma = b2.ellipse_y

            a = (math.cos(angle)**2 / (2 * x_sigma**2) +
                 math.sin(angle)**2 / (2 * y_sigma**2))
            b = (-math.sin(2 * angle) / (4 * x_sigma**2) +
                 math.sin(2 * angle) / (4 * y_sigma**2))
            c = (math.sin(angle)**2 / (2 * x_sigma**2) +
                 math.cos(angle)**2 / (2 * y_sigma**2))
            d = (a * (x - x_mean)**2 +
                 2 * b * (x - x_mean) * (y - y_mean) +
                 c * (y - y_mean)**2)

            # Avoid overflow in exp - cap d to reasonable range
            d = min(max(d, -100), 100)
            try:
                return math.exp(-d)  # Note: should be -d for Gaussian
            except (OverflowError, ValueError):
                return 0.0

        # For each beam, find top 6 neighbors
        for b1_name, b1 in metafile.beams.items():
            beam_responses = {}

            for b2_name, b2 in metafile.beams.items():
                if b1_name == b2_name:
                    continue
                beam_responses[b2_name] = beam_intersection(b1, b2)

            # Sort by intersection value and take top 6
            sorted_beams = sorted(beam_responses.items(), key=lambda x: x[1])
            top_6 = [name for name, _ in sorted_beams[:min(6, len(sorted_beams))]]

            b1.neighbour_beams = top_6
