from typing import Optional, Dict, List
from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class CandidateType(str, Enum):
    """Candidate classification types"""
    KNOWN_PSR = "KNOWN_PSR"
    T1_CAND = "T1_CAND"
    T2_CAND = "T2_CAND"
    RFI = "RFI"
    NOISE = "NOISE"
    UNCAT = "UNCAT"
    NB_PSR = "NB_PSR"


class Angle(BaseModel):
    """Represents an astronomical angle"""
    value: float
    format: str  # "HMS", "DMS", "DEG", "RAD"

    def to_decimal_hours(self) -> float:
        """Convert to decimal hours for RA"""
        if self.format == "HMS":
            return self.value
        elif self.format == "DEG":
            return self.value / 15.0
        elif self.format == "RAD":
            return self.value * 12.0 / 3.14159265359
        return self.value

    def to_degrees(self) -> float:
        """Convert to degrees for DEC"""
        if self.format == "DMS" or self.format == "DEG":
            return self.value
        elif self.format == "RAD":
            return self.value * 180.0 / 3.14159265359
        elif self.format == "HMS":
            return self.value * 15.0
        return self.value


class Candidate(BaseModel):
    """Pulsar candidate model matching JavaFX application"""

    # Identification
    pointing_id: Optional[int] = None
    beam_id: Optional[int] = None
    beam_name: Optional[str] = None
    source_name: Optional[str] = None
    line_num: Optional[int] = None

    # Coordinates
    ra: Optional[float] = None  # Stored as decimal hours
    dec: Optional[float] = None  # Stored as degrees
    gl: Optional[float] = None  # Galactic longitude (degrees)
    gb: Optional[float] = None  # Galactic latitude (degrees)

    # Time
    mjd_start: Optional[float] = None
    utc_start: Optional[str] = None
    start_utc: Optional[datetime] = None

    # Frequency parameters
    f0_user: Optional[float] = None
    f0_opt: Optional[float] = None
    f0_opt_err: Optional[float] = None

    f1_user: Optional[float] = None
    f1_opt: Optional[float] = None
    f1_opt_err: Optional[float] = None

    # Acceleration
    acc_user: Optional[float] = None
    acc_opt: Optional[float] = None
    acc_opt_err: Optional[float] = None

    # Dispersion measure
    dm_user: Optional[float] = None
    dm_opt: Optional[float] = None
    dm_opt_err: Optional[float] = None

    # Signal-to-noise ratios
    sn_fft: Optional[float] = None
    sn_fold: Optional[float] = None

    # Additional parameters
    pepoch: Optional[float] = None
    maxdm_ymw16: Optional[float] = None
    dist_ymw16: Optional[float] = None
    tobs: Optional[float] = None

    # File paths
    png_path: Optional[str] = None
    metafile_path: Optional[str] = None
    filterbank_path: Optional[str] = None
    candidate_tarball_path: Optional[str] = None

    # Classification
    candidate_type: CandidateType = CandidateType.UNCAT

    # Classifier scores (dynamic)
    classifier_scores: Dict[str, float] = {}

    # Additional computed fields
    similar_candidates: List[int] = []  # Line numbers of similar candidates
    visible: bool = True
    csv_line: Optional[str] = None

    class Config:
        use_enum_values = True

    @property
    def opt_p0(self) -> Optional[float]:
        """Period from frequency"""
        if self.f0_opt and self.f0_opt != 0:
            return 1.0 / self.f0_opt
        return None

    @property
    def beam_number(self) -> Optional[int]:
        """Extract integer beam number from beam name"""
        if not self.beam_name:
            return None
        # Extract number from formats like "cfbf00001" or "01"
        import re
        match = re.search(r'\d+', self.beam_name)
        if match:
            return int(match.group())
        return None

    def get_sortable_value(self, parameter: str) -> Optional[float]:
        """Get sortable value for a given parameter"""
        param_map = {
            "DM": self.dm_opt,
            "F0": self.f0_opt,
            "F1": self.f1_opt,
            "ACC": self.acc_opt,
            "FOLD_SNR": self.sn_fold,
            "FFT_SNR": self.sn_fft,
            "BEAM_NUM": float(self.beam_number) if self.beam_number else None,
            "TOBS": self.tobs,
            "CSV_LINE": float(self.line_num) if self.line_num else None,
        }

        # Check classifier scores
        if parameter in self.classifier_scores:
            return self.classifier_scores[parameter]

        return param_map.get(parameter)


class Beam(BaseModel):
    """Beam information"""
    name: str
    ra: float  # decimal hours
    dec: float  # degrees
    radius: Optional[float] = None  # degrees
    ellipse_x: Optional[float] = None  # semi-major axis (radians)
    ellipse_y: Optional[float] = None  # semi-minor axis (radians)
    ellipse_angle: Optional[float] = None  # rotation angle (radians)
    neighbour_beams: List[str] = []

    @property
    def integer_beam_name(self) -> Optional[int]:
        """Extract integer beam number"""
        import re
        match = re.search(r'\d+', self.name)
        if match:
            return int(match.group())
        return None


class MetaFile(BaseModel):
    """Metadata file information"""
    file_name: Optional[str] = None
    bandwidth: Optional[float] = None
    beams: Dict[str, Beam] = {}
    boresight: Optional[Beam] = None
    output_dir: Optional[str] = None
    schedule_block_id: Optional[str] = None
    utc: Optional[datetime] = None
    project_name: Optional[str] = None
    tsamp_coherent: Optional[float] = None
    num_chans_coherent: Optional[int] = None
    tsamp_incoherent: Optional[float] = None
    num_chans_incoherent: Optional[int] = None
    centre_freq: Optional[float] = None
    min_ra: Optional[float] = None  # decimal hours
    max_ra: Optional[float] = None
    min_dec: Optional[float] = None  # degrees
    max_dec: Optional[float] = None
    png_path: Optional[str] = None
    stale: bool = False


class Pulsar(BaseModel):
    """Known pulsar from PSRCAT"""
    name: str
    ra: Optional[float] = None  # decimal hours
    dec: Optional[float] = None  # degrees
    dm: Optional[float] = None
    p0: Optional[float] = None  # period (seconds)
    f0: Optional[float] = None  # frequency (Hz)
    f1: Optional[float] = None
    pepoch: Optional[float] = None
    ephemeris: Optional[str] = None

    @property
    def frequency(self) -> Optional[float]:
        """Get frequency from period or f0"""
        if self.f0:
            return self.f0
        elif self.p0 and self.p0 != 0:
            return 1.0 / self.p0
        return None
