"""
PSRCAT Database Parser

Parses the psrcat.db file to search for known pulsars.
"""
import os
import math
from typing import List, Dict, Optional


class PSRCATParser:
    """Parse and query the PSRCAT database"""

    def __init__(self, psrcat_db_path: str):
        """
        Initialize parser with path to psrcat.db file

        Args:
            psrcat_db_path: Path to psrcat.db file
        """
        self.psrcat_db_path = psrcat_db_path
        self.pulsars = []
        if os.path.exists(psrcat_db_path):
            self._parse_file()

    def _parse_file(self):
        """Parse the psrcat.db file and extract pulsar information"""
        with open(self.psrcat_db_path, 'r') as f:
            current_pulsar = {}

            for line in f:
                line = line.strip()

                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue

                # Separator indicates end of pulsar entry
                if line.startswith('@-'):
                    if current_pulsar:
                        self.pulsars.append(current_pulsar)
                        current_pulsar = {}
                    continue

                # Parse pulsar parameters
                parts = line.split()
                if len(parts) < 2:
                    continue

                param = parts[0]

                # Extract key parameters
                if param == 'PSRJ':
                    current_pulsar['name'] = parts[1]
                elif param == 'PSRB':
                    current_pulsar['name_b'] = parts[1]
                elif param == 'RAJ':
                    # RA in HH:MM:SS.SS format
                    try:
                        current_pulsar['ra_str'] = parts[1]
                        current_pulsar['ra_deg'] = self._ra_to_degrees(parts[1])
                    except:
                        pass
                elif param == 'DECJ':
                    # DEC in DD:MM:SS.S format
                    try:
                        current_pulsar['dec_str'] = parts[1]
                        current_pulsar['dec_deg'] = self._dec_to_degrees(parts[1])
                    except:
                        pass
                elif param == 'P0':
                    # Period in seconds
                    try:
                        current_pulsar['p0'] = float(parts[1])
                    except:
                        pass
                elif param == 'F0':
                    # Frequency in Hz
                    try:
                        current_pulsar['f0'] = float(parts[1])
                    except:
                        pass
                elif param == 'DM':
                    # Dispersion measure in pc/cc
                    try:
                        current_pulsar['dm'] = float(parts[1])
                    except:
                        pass
                elif param == 'DIST_DM':
                    # Distance from YMW17 in kpc
                    try:
                        current_pulsar['dist_kpc'] = float(parts[1])
                    except:
                        pass

            # Add last pulsar if any
            if current_pulsar:
                self.pulsars.append(current_pulsar)

    def _ra_to_degrees(self, ra_str: str) -> float:
        """
        Convert RA string (HH:MM:SS.SS) to degrees

        Args:
            ra_str: RA in format HH:MM:SS.SS

        Returns:
            RA in degrees
        """
        parts = ra_str.split(':')
        hours = float(parts[0])
        minutes = float(parts[1]) if len(parts) > 1 else 0
        seconds = float(parts[2]) if len(parts) > 2 else 0

        # Convert to degrees (15 degrees per hour)
        return (hours + minutes / 60.0 + seconds / 3600.0) * 15.0

    def _dec_to_degrees(self, dec_str: str) -> float:
        """
        Convert DEC string (+DD:MM:SS.S) to degrees

        Args:
            dec_str: DEC in format +DD:MM:SS.S or -DD:MM:SS.S

        Returns:
            DEC in degrees
        """
        # Handle sign
        sign = 1.0
        if dec_str.startswith('-'):
            sign = -1.0
            dec_str = dec_str[1:]
        elif dec_str.startswith('+'):
            dec_str = dec_str[1:]

        parts = dec_str.split(':')
        degrees = float(parts[0])
        minutes = float(parts[1]) if len(parts) > 1 else 0
        seconds = float(parts[2]) if len(parts) > 2 else 0

        return sign * (degrees + minutes / 60.0 + seconds / 3600.0)

    def _angular_distance(self, ra1_deg: float, dec1_deg: float, ra2_deg: float, dec2_deg: float) -> float:
        """
        Calculate angular distance between two positions in degrees
        Using haversine formula

        Args:
            ra1_deg: RA of first position in degrees
            dec1_deg: DEC of first position in degrees
            ra2_deg: RA of second position in degrees
            dec2_deg: DEC of second position in degrees

        Returns:
            Angular distance in degrees
        """
        # Convert to radians
        ra1 = math.radians(ra1_deg)
        dec1 = math.radians(dec1_deg)
        ra2 = math.radians(ra2_deg)
        dec2 = math.radians(dec2_deg)

        # Haversine formula
        delta_ra = ra2 - ra1
        delta_dec = dec2 - dec1

        a = math.sin(delta_dec / 2)**2 + math.cos(dec1) * math.cos(dec2) * math.sin(delta_ra / 2)**2
        c = 2 * math.asin(math.sqrt(a))

        return math.degrees(c)

    def search_nearby(
        self,
        ra_deg: float,
        dec_deg: float,
        radius_arcmin: float = 5.0,
        dm: Optional[float] = None,
        dm_tolerance: Optional[float] = None
    ) -> List[Dict]:
        """
        Search for pulsars near given coordinates

        Args:
            ra_deg: Right ascension in degrees
            dec_deg: Declination in degrees
            radius_arcmin: Search radius in arcminutes
            dm: Dispersion measure for matching
            dm_tolerance: DM tolerance in pc/cc

        Returns:
            List of matching pulsars with distance information
        """
        radius_deg = radius_arcmin / 60.0
        matches = []

        for pulsar in self.pulsars:
            # Skip pulsars without coordinates
            if 'ra_deg' not in pulsar or 'dec_deg' not in pulsar:
                continue

            # Calculate angular distance
            dist = self._angular_distance(ra_deg, dec_deg, pulsar['ra_deg'], pulsar['dec_deg'])

            # Check if within radius
            if dist <= radius_deg:
                # Check DM if specified
                if dm is not None and dm_tolerance is not None and 'dm' in pulsar:
                    if abs(pulsar['dm'] - dm) > dm_tolerance:
                        continue

                # Add distance info
                match = pulsar.copy()
                match['angular_distance_arcmin'] = dist * 60.0
                match['angular_distance_deg'] = dist

                # Calculate distance in parsecs if available
                if 'dist_kpc' in match:
                    match['dist_pc'] = match['dist_kpc'] * 1000.0

                matches.append(match)

        # Sort by distance
        matches.sort(key=lambda x: x['angular_distance_deg'])

        return matches
