from typing import List, Dict
from app.models.candidate import Candidate


class HarmonicMatcher:
    """
    Finds similar candidates using harmonic/frequency matching
    Mirrors functionality of Java Helpers.findCandidateSimilarities
    """

    @staticmethod
    def find_candidate_similarities(
        candidates: List[Candidate],
        freq_tolerance: float = 1e-4,
        scale_tolerance: bool = False,
        dm_tolerance: float = 5.0,
        include_fractions: bool = False
    ):
        """
        Find similar candidates based on frequency harmonics and DM

        Args:
            candidates: List of candidates to analyze
            freq_tolerance: Frequency matching tolerance
            scale_tolerance: Whether to scale tolerance with harmonic number
            dm_tolerance: DM difference tolerance (pc/cc)
            include_fractions: Include fractional harmonics (1/2, 1/3, etc.)
        """
        # Build frequency map for fast lookup
        freq_map: Dict[int, Candidate] = {}
        for c in candidates:
            if c.line_num and c.f0_opt:
                freq_map[c.line_num] = c

        # For each candidate, find similar ones
        for candidate in candidates:
            if not candidate.f0_opt or not candidate.dm_opt:
                continue

            similar = []

            for other in candidates:
                if (candidate.line_num == other.line_num or
                    not other.f0_opt or not other.dm_opt):
                    continue

                # Check DM difference
                dm_diff = abs(candidate.dm_opt - other.dm_opt)
                if dm_diff > dm_tolerance:
                    continue

                # Check frequency harmonics
                if HarmonicMatcher._is_harmonic_match(
                    candidate.f0_opt,
                    other.f0_opt,
                    freq_tolerance,
                    scale_tolerance,
                    include_fractions
                ):
                    similar.append(other.line_num or 0)

            candidate.similar_candidates = similar

    @staticmethod
    def _is_harmonic_match(
        f1: float,
        f2: float,
        tolerance: float,
        scale_tolerance: bool,
        include_fractions: bool
    ) -> bool:
        """
        Check if two frequencies are harmonically related

        Args:
            f1: First frequency
            f2: Second frequency
            tolerance: Base tolerance
            scale_tolerance: Scale tolerance by harmonic number
            include_fractions: Include fractional harmonics

        Returns:
            True if frequencies match harmonically
        """
        # Check harmonics from 1 to 16
        for i in range(1, 17):
            # Whole number harmonics
            for j in range(1, 17):
                harmonic = float(i) / float(j)

                # Calculate tolerance for this harmonic
                tol = tolerance
                if scale_tolerance:
                    tol = tolerance * harmonic

                min_f = f1 * (harmonic - tol)
                max_f = f1 * (harmonic + tol)

                if min_f <= f2 <= max_f:
                    return True

            # Fractional harmonics if enabled
            if include_fractions:
                for j in range(1, 17):
                    if i == j:
                        continue
                    fraction = float(j) / float(i)

                    tol = tolerance
                    if scale_tolerance:
                        tol = tolerance * fraction

                    min_f = f1 * (fraction - tol)
                    max_f = f1 * (fraction + tol)

                    if min_f <= f2 <= max_f:
                        return True

        return False

    @staticmethod
    def get_frequency_ratio(f1: float, f2: float) -> tuple[float, float]:
        """
        Get frequency ratios for display

        Returns:
            (f1/f2, f2/f1)
        """
        ratio1 = f1 / f2 if f2 != 0 else 0.0
        ratio2 = f2 / f1 if f1 != 0 else 0.0
        return (ratio1, ratio2)
