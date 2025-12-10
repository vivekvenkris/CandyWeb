"""
PSRCAT Database Parser

Parses the psrcat.db file to search for known pulsars.
"""
import os
from typing import List, Dict, Optional
from astropy.coordinates import Angle, SkyCoord
from astropy import units as u


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
                        current_pulsar['ra'] = Angle(parts[1], unit=u.hourangle)
                    except Exception:
                        pass
                elif param == 'DECJ':
                    # DEC in DD:MM:SS.S format
                    try:
                        current_pulsar['dec_str'] = parts[1]
                        current_pulsar['dec'] = Angle(parts[1], unit=u.degree)
                    except Exception:
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
        for pulsar in self.pulsars:
            if 'ra' in pulsar and 'dec' in pulsar:
                pulsar['coord'] = SkyCoord(ra=pulsar['ra'], dec=pulsar['dec'], frame='icrs')

    def shortlist_by_region(
        self,
        center: SkyCoord,
        radius_deg: float = 10.0
    ) -> List[Dict]:
        """
        Create a shortlist of pulsars within a region for fast searching.

        Args:
            center: Center coordinates (e.g., boresight)
            radius_deg: Radius in degrees to include pulsars

        Returns:
            List of pulsars within the region
        """
        shortlist = []
        for pulsar in self.pulsars:
            if 'coord' not in pulsar:
                continue

            dist = center.separation(pulsar['coord']).degree
            if dist <= radius_deg:
                shortlist.append(pulsar)

        print(f"Shortlisted {len(shortlist)} pulsars within {radius_deg}° of center")
        return shortlist

    def search_nearby(
        self,
        target: SkyCoord,
        radius_arcmin: float = 5.0,
        dm: Optional[float] = None,
        dm_tolerance: Optional[float] = None,
        shortlist: Optional[List[Dict]] = None
    ) -> List[Dict]:
        """
        Search for pulsars near given coordinates

        Args:
            target: Target coordinates as SkyCoord
            radius_arcmin: Search radius in arcminutes
            dm: Dispersion measure for matching
            dm_tolerance: DM tolerance in pc/cc
            shortlist: Optional pre-filtered list of pulsars to search (for performance)

        Returns:
            List of matching pulsars with distance information
        """
        radius_deg = radius_arcmin / 60.0
        matches = []

        # Use shortlist if provided, otherwise search all pulsars
        search_list = shortlist if shortlist is not None else self.pulsars

        for pulsar in search_list:
            # Skip pulsars without coordinates
            if 'coord' not in pulsar:
                continue

            if dm is not None and dm_tolerance is not None and 'dm' in pulsar:
                    if abs(pulsar['dm'] - dm) > dm_tolerance:
                        continue

            # Calculate angular distance
            dist = target.separation(pulsar['coord']).degree

            # Check if within radius
            if dist <= radius_deg:
                # Check DM if specified
                
                # Add distance info
                match = pulsar
                match['angular_distance_arcmin'] = dist * 60.0
                match['angular_distance_deg'] = dist

                # Calculate distance in parsecs if available
                if 'dist_kpc' in match:
                    match['dist_pc'] = match['dist_kpc'] * 1000.0

                matches.append(match)

        # Sort by distance
        matches.sort(key=lambda x: x['angular_distance_deg'])

        return matches
