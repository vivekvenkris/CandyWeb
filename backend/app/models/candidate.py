from typing import Optional, Dict, List, Any
from pydantic import BaseModel, ConfigDict, field_serializer, field_validator, PrivateAttr
from datetime import datetime
from enum import Enum
from astropy.coordinates import Angle, SkyCoord
from astropy import units as u


def _coerce_angle(value: Any, unit: u.UnitBase) -> Optional[Angle]:
    """Convert raw values into Angle instances with the requested unit."""
    if value is None:
        return None

    if isinstance(value, Angle):
        return value

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        value = stripped

    try:
        return Angle(value, unit=unit)
    except Exception:
        return None


def _serialize_angle(value: Optional[Angle], unit: u.UnitBase) -> Optional[float]:
    """Serialize Angle values as primitive floats for API responses."""
    if value is None:
        return None
    return value.to_value(unit)


class CandidateType(str, Enum):
    """Candidate classification types"""
    KNOWN_PSR = "KNOWN_PSR"
    T1_CAND = "T1_CAND"
    T2_CAND = "T2_CAND"
    RFI = "RFI"
    NOISE = "NOISE"
    UNCAT = "UNCAT"
    NB_PSR = "NB_PSR"


class Candidate(BaseModel):
    """Pulsar candidate model matching JavaFX application"""
    model_config = ConfigDict(
        use_enum_values=True,
        arbitrary_types_allowed=True,
        validate_assignment=True
    )

    # Identification
    pointing_id: Optional[int] = None
    beam_id: Optional[int] = None
    beam_name: Optional[str] = None
    source_name: Optional[str] = None
    line_num: Optional[int] = None

    # Coordinates
    ra: Optional[Angle] = None  # Stored as Angle (hourangle)
    dec: Optional[Angle] = None  # Stored as Angle (degrees)
    gl: Optional[Angle] = None  # Galactic longitude (degrees)
    gb: Optional[Angle] = None  # Galactic latitude (degrees)

    # Private cached coordinate
    _coord: Optional[SkyCoord] = PrivateAttr(default=None)

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

    @field_validator("ra", mode="before")
    @classmethod
    def _validate_ra(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.hourangle)

    @field_validator("dec", "gl", "gb", mode="before")
    @classmethod
    def _validate_degree_angles(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.degree)

    @field_serializer("ra")
    @classmethod
    def _serialize_ra(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.hourangle)

    @field_serializer("dec", "gl", "gb")
    @classmethod
    def _serialize_degree_angles(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.degree)

    @property
    def coord(self) -> Optional[SkyCoord]:
        """Get cached SkyCoord, computing it if needed"""
        if self._coord is None and self.ra is not None and self.dec is not None:
            self._coord = SkyCoord(ra=self.ra, dec=self.dec, frame='icrs')
        return self._coord

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
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    ra: Optional[Angle] = None  # hourangle
    dec: Optional[Angle] = None  # degrees
    radius: Optional[float] = None  # degrees
    ellipse_x: Optional[float] = None  # semi-major axis (radians)
    ellipse_y: Optional[float] = None  # semi-minor axis (radians)
    ellipse_angle: Optional[float] = None  # rotation angle (radians)
    neighbour_beams: List[str] = []

    @field_validator("ra", mode="before")
    @classmethod
    def _validate_ra(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.hourangle)

    @field_validator("dec", mode="before")
    @classmethod
    def _validate_dec(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.degree)

    @field_serializer("ra")
    @classmethod
    def _serialize_ra(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.hourangle)

    @field_serializer("dec")
    @classmethod
    def _serialize_dec(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.degree)

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
    model_config = ConfigDict(arbitrary_types_allowed=True)

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
    min_ra: Optional[Angle] = None  # Angle (hourangle)
    max_ra: Optional[Angle] = None
    min_dec: Optional[Angle] = None  # degrees
    max_dec: Optional[Angle] = None
    png_path: Optional[str] = None
    stale: bool = False

    @field_validator("min_ra", "max_ra", mode="before")
    @classmethod
    def _validate_ra_bounds(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.hourangle)

    @field_validator("min_dec", "max_dec", mode="before")
    @classmethod
    def _validate_dec_bounds(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.degree)

    @field_serializer("min_ra", "max_ra")
    @classmethod
    def _serialize_ra_bounds(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.hourangle)

    @field_serializer("min_dec", "max_dec")
    @classmethod
    def _serialize_dec_bounds(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.degree)


class Pulsar(BaseModel):
    """Known pulsar from PSRCAT"""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    ra: Optional[Angle] = None  # hourangle
    dec: Optional[Angle] = None  # degrees
    dm: Optional[float] = None
    p0: Optional[float] = None  # period (seconds)
    f0: Optional[float] = None  # frequency (Hz)
    f1: Optional[float] = None
    pepoch: Optional[float] = None
    ephemeris: Optional[str] = None

    # Private cached coordinate
    _coord: Optional[SkyCoord] = PrivateAttr(default=None)

    @field_validator("ra", mode="before")
    @classmethod
    def _validate_ra(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.hourangle)

    @field_validator("dec", mode="before")
    @classmethod
    def _validate_dec(cls, value: Any) -> Optional[Angle]:
        return _coerce_angle(value, u.degree)

    @field_serializer("ra")
    @classmethod
    def _serialize_ra(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.hourangle)

    @field_serializer("dec")
    @classmethod
    def _serialize_dec(cls, value: Optional[Angle]) -> Optional[float]:
        return _serialize_angle(value, u.degree)

    @property
    def coord(self) -> Optional[SkyCoord]:
        """Get cached SkyCoord, computing it if needed"""
        if self._coord is None and self.ra is not None and self.dec is not None:
            self._coord = SkyCoord(ra=self.ra, dec=self.dec, frame='icrs')
        return self._coord

    @property
    def frequency(self) -> Optional[float]:
        """Get frequency from period or f0"""
        if self.f0:
            return self.f0
        elif self.p0 and self.p0 != 0:
            return 1.0 / self.p0
        return None
