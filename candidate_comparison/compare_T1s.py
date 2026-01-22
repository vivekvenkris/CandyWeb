#!/usr/bin/env python3
"""
Compare T1 classified candidates between two observations.

For each T1 candidate in OBS1, checks all T1 candidates in OBS2 to find matches
within DM and period thresholds. When comparing periods, demodulates the orbit
to ensure comparison in the same reference frame.

Generates plots showing matched candidates with their PNGs and delta values.
"""

import argparse
import os
import sys
from pathlib import Path
from typing import List, Tuple, Optional
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from PIL import Image
from astropy.coordinates import SkyCoord
import astropy.units as u
from multiprocessing import Pool, Manager, cpu_count


class Candidate:
    """Represents a pulsar candidate with comparison methods."""

    # Lookup table for tobs values based on png_path
    TOBS_LOOKUP = {
        'full': 7200,
        '60m': 3600,
        '30m': 1800,
        '15m': 900
    }

    def __init__(self, row: pd.Series, obs_name: str):
        """
        Initialize candidate from a CSV row.

        Args:
            row: Pandas Series containing candidate data
            obs_name: Name of the observation (e.g., 'OBS1', 'OBS2')
        """
        self.obs_name = obs_name

        # Handle different possible column names (case insensitive)
        # DM
        dm_col = None
        for col in ['dm_opt', 'DM_opt', 'dm', 'DM']:
            if col in row.index:
                dm_col = col
                break
        if dm_col is None:
            raise ValueError("Could not find DM column")
        self.dm = float(row[dm_col])

        # Period/Frequency - prefer f0_opt, calculate period if needed
        if 'f0_opt' in row.index:
            self.f0 = float(row['f0_opt'])
            self.period = 1.0 / self.f0 if self.f0 > 0 else 0.0
        elif 'F0' in row.index or 'f0' in row.index:
            f0_col = 'F0' if 'F0' in row.index else 'f0'
            self.f0 = float(row[f0_col])
            self.period = 1.0 / self.f0 if self.f0 > 0 else 0.0
        elif 'P0' in row.index or 'p0' in row.index or 'period' in row.index:
            p0_col = 'P0' if 'P0' in row.index else ('p0' if 'p0' in row.index else 'period')
            self.period = float(row[p0_col])
            self.f0 = 1.0 / self.period if self.period > 0 else 0.0
        else:
            raise ValueError("Could not find frequency or period column")

        # Acceleration
        acc_col = None
        for col in ['acc_opt', 'Acc', 'acc', 'acceleration']:
            if col in row.index:
                acc_col = col
                break
        self.acc = float(row[acc_col]) if acc_col else 0.0

        # RA and DEC
        ra_col = None
        for col in ['ra_opt', 'RA_opt', 'ra', 'RA']:
            if col in row.index:
                ra_col = col
                break
        if ra_col is None:
            raise ValueError("Could not find RA column")
        self.ra = row[ra_col]  # Keep as string for SkyCoord parsing

        dec_col = None
        for col in ['dec_opt', 'DEC_opt', 'dec', 'DEC']:
            if col in row.index:
                dec_col = col
                break
        if dec_col is None:
            raise ValueError("Could not find DEC column")
        self.dec = row[dec_col]  # Keep as string for SkyCoord parsing

        # PNG path
        self.png_path = str(row['png_path'])

        # Determine tobs from png_path using lookup table
        self.tobs = self._determine_tobs(self.png_path)

        # Store all original data for reference
        self.data = row.to_dict()

    def _determine_tobs(self, png_path: str) -> float:
        """
        Determine observation time from png_path using lookup table.

        Args:
            png_path: Path to the PNG file

        Returns:
            Observation time in seconds (default: 1800 if not found)
        """
        for key, tobs in self.TOBS_LOOKUP.items():
            if key in png_path:
                return tobs
        # Default to 30m if no match found
        return 1800.0

    def is_ignored_frequency(self, ignore_periods: List[float], period_thresh: float) -> bool:
        """
        Check if this candidate's period matches any ignored periods.

        Args:
            ignore_periods: List of periods to ignore (in seconds)
            period_thresh: Period threshold for matching (seconds)

        Returns:
            True if this candidate should be ignored, False otherwise
        """
        for ignore_period in ignore_periods:
            if abs(self.period - ignore_period) <= 10*period_thresh:
                return True
        return False

    def angular_distance(self, other: 'Candidate') -> float:
        """
        Calculate angular distance between two candidates in arcseconds.

        Uses astropy's SkyCoord for accurate spherical geometry calculations.

        Args:
            other: Another candidate to compare with

        Returns:
            Angular distance in arcseconds
        """
        coord1 = SkyCoord(ra=str(self.ra), dec=str(self.dec),
                         unit=(u.hourangle, u.deg))
        coord2 = SkyCoord(ra=str(other.ra), dec=str(other.dec),
                         unit=(u.hourangle, u.deg))
        separation = coord1.separation(coord2)
        return separation.arcsecond

    def is_related(self, other: 'Candidate', period_thresh: float,
                   dm_thresh: float, pos_thresh: float) -> Tuple[bool, float, float, float]:
        """
        Check if another candidate is related based on DM, period, and position.

        Implements orbit demodulation to compare periods in the same reference frame.
        Uses each candidate's tobs value determined from their png_path.

        Args:
            other: Another candidate to compare with
            period_thresh: Period threshold for matching (seconds)
            dm_thresh: DM threshold for matching (pc/cm³)
            pos_thresh: Position threshold for matching (arcseconds)

        Returns:
            Tuple of (is_related, delta_dm, delta_period, angular_distance)
        """
        # Check DM threshold first (fast rejection)
        delta_dm = abs(self.dm - other.dm)
        if delta_dm > dm_thresh:
            return False, delta_dm, float('inf'), float('inf')

        # Check position threshold (fast rejection)
        angular_dist = self.angular_distance(other)
        if angular_dist > pos_thresh:
            return False, delta_dm, float('inf'), angular_dist

        # Demodulate the orbit to compare periods in same reference frame
        # Use the other candidate's tobs value for demodulation
        c = 299792458.0  # Speed of light in m/s
        other_tobs_over_c = other.tobs / c

        # Correct the other candidate's period for acceleration difference
        corrected_other_f0 = other.f0 - (other.acc - self.acc) * other.f0 * other_tobs_over_c

        if corrected_other_f0 <= 0:
            return False, delta_dm, float('inf'), angular_dist

        corrected_other_period = 1.0 / corrected_other_f0

        # Direct period difference
        direct_period_difference = abs(self.period - corrected_other_period)

        # Calculate true period difference accounting for harmonics
        # Only use modulo if periods are reasonably close (within factor of 2)
        period_ratio = max(self.period, corrected_other_period) / min(self.period, corrected_other_period)

        if period_ratio <= 2.0:
            # Periods are close, use modulo to account for small harmonic differences
            if self.period / corrected_other_period > 1.0:
                true_period_difference = self.period % corrected_other_period
            else:
                true_period_difference = corrected_other_period % self.period

            # Check if related based on either modulo difference or direct difference
            is_match = (true_period_difference <= period_thresh or
                       direct_period_difference <= period_thresh)

            # Return the smaller of the two differences for reporting
            delta_period = min(true_period_difference, direct_period_difference)
        else:
            # Periods are very different, only use direct comparison
            is_match = direct_period_difference <= period_thresh
            delta_period = direct_period_difference

        return is_match, delta_dm, delta_period, angular_dist


def find_png_file(png_path: str, base_dirs: List[str], verbose: bool = False) -> Optional[str]:
    """
    Find the actual PNG file given a relative path and base directories.

    Args:
        png_path: Relative path to PNG file (e.g., 'path/to/png')
        base_dirs: List of base directories to search in
        verbose: If True, print search progress

    Returns:
        Full path to PNG file if found, None otherwise
    """
    if verbose:
        print(f"    Searching for PNG: {png_path}")

    # If the path is already absolute and exists, return it
    if os.path.isabs(png_path) and os.path.exists(png_path):
        if verbose:
            print(f"    Found (absolute path): {png_path}")
        return png_path

    # Search in each base directory
    for base_dir in base_dirs:
        if verbose:
            print(f"    Searching in base directory: {base_dir}")

        # Try direct path under base directory
        full_path = os.path.join(base_dir, png_path)
        if os.path.exists(full_path):
            if verbose:
                print(f"    Found (direct): {full_path}")
            return full_path

        # Try walking through subdirectories to find the file
        # This handles cases like base_path/path1/path/to/png
        png_basename = os.path.basename(png_path)
        png_dirname = os.path.dirname(png_path)

        if verbose:
            print(f"    Walking subdirectories...")

        for root, dirs, files in os.walk(base_dir):
            # Check if current directory ends with the png_dirname
            if root.endswith(png_dirname) or png_dirname == '':
                candidate_path = os.path.join(root, png_basename)
                if os.path.exists(candidate_path):
                    # Verify this matches the full relative path structure
                    if candidate_path.endswith(png_path):
                        if verbose:
                            print(f"    Found (walked): {candidate_path}")
                        return candidate_path

    if verbose:
        print(f"    PNG not found")
    return None


def load_candidates(csv_path: str, obs_name: str) -> List[Candidate]:
    """
    Load T1 classified candidates from a CSV file.
    If no classification column exists, loads all candidates.

    Args:
        csv_path: Path to *_full.csv file
        obs_name: Name of the observation

    Returns:
        List of Candidate objects
    """
    df = pd.read_csv(csv_path)

    # Check for classification column
    class_col = None
    for col in ['classification', 'class', 'Classification', 'Class']:
        if col in df.columns:
            class_col = col
            break

    if class_col is None:
        # No classification column - use all candidates
        print(f"No classification column found in {obs_name}, using all {len(df)} candidates")
        t1_df = df
    else:
        # Filter for T1 - handle both 'T1' and 'T1_CAND' values
        t1_df = df[df[class_col].str.contains('T1', case=False, na=False)]
        print(f"Loaded {len(t1_df)} T1 candidates from {obs_name}")

    candidates = []
    for _, row in t1_df.iterrows():
        try:
            candidates.append(Candidate(row, obs_name))
        except Exception as e:
            print(f"Warning: Could not parse candidate: {e}")
            continue

    return candidates


def create_comparison_plot(cand1: Candidate, cand2: Candidate,
                          delta_dm: float, delta_period: float, angular_dist: float,
                          base_dirs1: List[str], base_dirs2: List[str],
                          output_dir: str, match_idx: int, verbose: bool = True):
    """
    Create a comparison plot showing both candidates and their delta values.

    Args:
        cand1: First candidate (from OBS1)
        cand2: Second candidate (from OBS2)
        delta_dm: DM difference
        delta_period: Period difference
        angular_dist: Angular distance in arcseconds
        base_dirs1: Base directories to search for OBS1 PNGs
        base_dirs2: Base directories to search for OBS2 PNGs
        output_dir: Directory to save output plot
        match_idx: Index of this match (for filename)
        verbose: If True, print search progress
    """
    # Find PNG files
    if verbose:
        print(f"  Searching for {cand1.obs_name} PNG...")
    png1 = find_png_file(cand1.png_path, base_dirs1, verbose=verbose)

    if verbose:
        print(f"  Searching for {cand2.obs_name} PNG...")
    png2 = find_png_file(cand2.png_path, base_dirs2, verbose=verbose)

    # Calculate demodulated period for cand2 using its tobs value
    c = 299792458.0  # Speed of light in m/s
    cand2_tobs_over_c = cand2.tobs / c
    corrected_f0 = cand2.f0 - (cand2.acc - cand1.acc) * cand2.f0 * cand2_tobs_over_c
    corrected_period = 1.0 / corrected_f0 if corrected_f0 > 0 else 0.0

    # Calculate change in velocity: c * (p2-p1) / (0.5*(p1+p2))
    c = 299792458.0  # Speed of light in m/s
    p1 = cand1.period
    p2 = corrected_period
    delta_velocity_ms = c * (p2 - p1) / (0.5 * (p1 + p2)) if (p1 + p2) > 0 else 0.0
    delta_velocity_kms = delta_velocity_ms / 1000.0  # Convert to km/s

    # Create figure with 3-column layout: title on top, table on left, PNGs on right
    fig = plt.figure(figsize=(25, 10))
    gs = GridSpec(2, 3, figure=fig, height_ratios=[0.4, 5], width_ratios=[1.5, 1.75, 1.75],
                  hspace=0.3, wspace=0.15)

    # Title with delta values (spans all columns)
    title_ax = fig.add_subplot(gs[0, :])
    title_ax.axis('off')
    title_text = (
        f"Matched Candidates: {cand1.obs_name} ↔ {cand2.obs_name}\n"
        f"ΔDM = {delta_dm:.2f} pc/cm³  |  ΔP₀ (demodulated) = {delta_period*1000:.4f} ms  |  Angular Distance = {angular_dist:.2f} arcsec"
    )
    title_ax.text(0.5, 0.5, title_text, ha='center', va='center',
                 fontsize=14, fontweight='bold', transform=title_ax.transAxes)

    # Table with parameters (left column)
    table_ax = fig.add_subplot(gs[1, 0])
    table_ax.axis('off')

    # Create table data
    table_data = [
        ['Parameter', cand1.obs_name, cand2.obs_name, 'Δ'],
        ['DM (pc/cm³)', f'{cand1.dm:.6f}', f'{cand2.dm:.6f}', f'{delta_dm:.6f}'],
        ['P₀_opt (ms)', f'{cand1.period*1000:.6f}', f'{cand2.period*1000:.6f}',
         f'{abs(cand1.period - cand2.period)*1000:.6f}'],
        ['P₀_demod (ms)', f'{cand1.period*1000:.6f}', f'{corrected_period*1000:.6f}',
         f'{delta_period*1000:.6f}'],
        ['ΔV (km/s)', '', '', f'{delta_velocity_kms:.1f}'],
        ['Acc (m/s²)', f'{cand1.acc:.6e}', f'{cand2.acc:.6e}',
         f'{abs(cand1.acc - cand2.acc):.6e}'],
        ['Tobs (s)', f'{cand1.tobs:.0f}', f'{cand2.tobs:.0f}', ''],
        ['RA', str(cand1.ra), str(cand2.ra), ''],
        ['DEC', str(cand1.dec), str(cand2.dec), ''],
        ['Angular Dist (arcsec)', '', '', f'{angular_dist:.6f}']
    ]

    table = table_ax.table(cellText=table_data, cellLoc='center', loc='center',
                          colWidths=[0.25, 0.25, 0.25, 0.25])
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1, 2.5)

    # Style header row
    for i in range(4):
        table[(0, i)].set_facecolor('#4CAF50')
        table[(0, i)].set_text_props(weight='bold', color='white')

    # Alternate row colors
    for i in range(1, 10):
        for j in range(4):
            if i % 2 == 0:
                table[(i, j)].set_facecolor('#f0f0f0')

    # Display first PNG (middle column)
    ax1 = fig.add_subplot(gs[1, 1])
    if png1 and os.path.exists(png1):
        img1 = Image.open(png1)
        ax1.imshow(img1)
        ax1.set_title(f"{cand1.obs_name}", fontsize=12, fontweight='bold')
    else:
        ax1.text(0.5, 0.5, "No PNG found",
                ha='center', va='center', transform=ax1.transAxes,
                fontsize=16, color='red')
        ax1.set_title(f"{cand1.obs_name}", fontsize=12, fontweight='bold')
    ax1.axis('off')

    # Display second PNG (right column)
    ax2 = fig.add_subplot(gs[1, 2])
    if png2 and os.path.exists(png2):
        img2 = Image.open(png2)
        ax2.imshow(img2)
        ax2.set_title(f"{cand2.obs_name}", fontsize=12, fontweight='bold')
    else:
        ax2.text(0.5, 0.5, "No PNG found",
                ha='center', va='center', transform=ax2.transAxes,
                fontsize=16, color='red')
        ax2.set_title(f"{cand2.obs_name}", fontsize=12, fontweight='bold')
    ax2.axis('off')

    # Save plot with P₀ in filename
    p0_ms = cand1.period * 1000  # Convert to milliseconds
    output_path = os.path.join(output_dir, f"match_{match_idx:03d}_{p0_ms:.1f}ms.png")
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close(fig)

    if verbose:
        print(f"  Saved: {output_path}")


def _process_candidate_worker(args):
    """
    Worker function for parallel processing of candidate comparisons.

    Args:
        args: Tuple containing (cand1, cand1_idx, candidates2, period_thresh,
              dm_thresh, pos_thresh, base_dirs1, base_dirs2, output_dir,
              match_counter, lock)

    Returns:
        List of match dictionaries for this cand1
    """
    (cand1, cand1_idx, candidates2, period_thresh, dm_thresh, pos_thresh,
     base_dirs1, base_dirs2, output_dir, match_counter, lock) = args

    local_matches = []

    print(f"Checking OBS1 candidate {cand1_idx+1} "
          f"(DM={cand1.dm:.2f}, P₀={cand1.period*1000:.4f} ms, Tobs={cand1.tobs:.0f}s, RA={cand1.ra}, DEC={cand1.dec})...")

    for j, cand2 in enumerate(candidates2):
        is_match, delta_dm, delta_period, angular_dist = cand1.is_related(
            cand2, period_thresh, dm_thresh, pos_thresh
        )

        if is_match:
            print(f"  ✓ Match with OBS2 candidate {j+1}: "
                  f"ΔDM={delta_dm:.2f}, ΔP₀={delta_period*1000:.4f} ms, AngDist={angular_dist:.2f} arcsec")

            # Get next match index in a thread-safe manner
            with lock:
                match_idx = match_counter.value
                match_counter.value += 1

            local_matches.append({
                'obs1_idx': cand1_idx,
                'obs2_idx': j,
                'delta_dm': delta_dm,
                'delta_period': delta_period,
                'angular_dist': angular_dist,
                'cand1': cand1,
                'cand2': cand2,
                'match_idx': match_idx
            })

            # Create comparison plot (verbose=False to reduce output clutter in parallel mode)
            create_comparison_plot(
                cand1, cand2, delta_dm, delta_period, angular_dist,
                base_dirs1, base_dirs2, output_dir, match_idx, verbose=False
            )

    return local_matches


def compare_observations(csv1: str, csv2: str,
                        base_dirs1: List[str], base_dirs2: List[str],
                        output_dir: str,
                        dm_thresh: float = 1.0,
                        period_thresh: float = 5e-6,
                        pos_thresh: float = 30.0,
                        ignore_periods: Optional[List[float]] = None,
                        nthreads: Optional[int] = None):
    """
    Compare T1 candidates between two observations.

    Args:
        csv1: Path to first observation's *_full.csv file
        csv2: Path to second observation's *_full.csv file
        base_dirs1: Base directories to search for OBS1 PNGs
        base_dirs2: Base directories to search for OBS2 PNGs
        output_dir: Directory to save comparison plots
        dm_thresh: DM threshold for matching (pc/cm³, default: 1.0)
        period_thresh: Period threshold for matching (seconds, default: 5e-6)
        pos_thresh: Position threshold for matching (arcseconds, default: 30.0)
        ignore_periods: List of periods (in seconds) to ignore. Candidates with periods
                       matching these values (within period_thresh) will be excluded.
        nthreads: Number of parallel threads to use. If None, uses all available CPU cores.
    """
    # Default ignore periods if not specified
    if ignore_periods is None:
        ignore_periods = []

    # Load candidates (tobs is automatically determined from png_path)
    print("\n" + "="*60)
    print("LOADING CANDIDATES")
    print("="*60)
    candidates1 = load_candidates(csv1, "OBS1")
    candidates2 = load_candidates(csv2, "OBS2")

    if not candidates1:
        print("Error: No T1 candidates found in OBS1")
        return
    if not candidates2:
        print("Error: No T1 candidates found in OBS2")
        return

    # Filter out ignored frequencies
    if ignore_periods:
        print(f"\nFiltering candidates with ignored periods: {[p*1000 for p in ignore_periods]} ms")
        initial_count1 = len(candidates1)
        initial_count2 = len(candidates2)

        candidates1 = [c for c in candidates1 if not c.is_ignored_frequency(ignore_periods, period_thresh)]
        candidates2 = [c for c in candidates2 if not c.is_ignored_frequency(ignore_periods, period_thresh)]

        filtered1 = initial_count1 - len(candidates1)
        filtered2 = initial_count2 - len(candidates2)
        print(f"Filtered {filtered1} candidates from OBS1, {filtered2} from OBS2")

    if not candidates1:
        print("Error: No T1 candidates remaining in OBS1 after filtering")
        return
    if not candidates2:
        print("Error: No T1 candidates remaining in OBS2 after filtering")
        return

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Determine number of threads
    if nthreads is None:
        nthreads = cpu_count()

    # Compare candidates
    print("\n" + "="*60)
    print("COMPARING CANDIDATES")
    print("="*60)
    print(f"Thresholds: ΔDM ≤ {dm_thresh} pc/cm³, ΔP₀ ≤ {period_thresh*1000} ms, Position ≤ {pos_thresh} arcsec")
    print(f"Note: Tobs values are automatically determined from png_path")
    print(f"Using {nthreads} parallel threads")
    print()

    # Create shared counter and lock for thread-safe match numbering
    with Manager() as manager:
        match_counter = manager.Value('i', 0)
        lock = manager.Lock()

        # Prepare arguments for parallel processing
        worker_args = [
            (cand1, i, candidates2, period_thresh, dm_thresh, pos_thresh,
             base_dirs1, base_dirs2, output_dir, match_counter, lock)
            for i, cand1 in enumerate(candidates1)
        ]

        # Process candidates in parallel
        matches = []
        with Pool(processes=nthreads) as pool:
            results = pool.map(_process_candidate_worker, worker_args)

            # Flatten results from all workers
            for result in results:
                matches.extend(result)

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Total T1 candidates in OBS1: {len(candidates1)}")
    print(f"Total T1 candidates in OBS2: {len(candidates2)}")
    print(f"Total matches found: {len(matches)}")
    print(f"Output directory: {output_dir}")

    # Save match summary to CSV
    if matches:
        summary_data = []
        for match in matches:
            summary_data.append({
                'obs1_dm': match['cand1'].dm,
                'obs1_period_ms': match['cand1'].period * 1000,
                'obs1_tobs_s': match['cand1'].tobs,
                'obs1_ra': match['cand1'].ra,
                'obs1_dec': match['cand1'].dec,
                'obs2_dm': match['cand2'].dm,
                'obs2_period_ms': match['cand2'].period * 1000,
                'obs2_tobs_s': match['cand2'].tobs,
                'obs2_ra': match['cand2'].ra,
                'obs2_dec': match['cand2'].dec,
                'delta_dm': match['delta_dm'],
                'delta_period_ms': match['delta_period'] * 1000,
                'angular_dist_arcsec': match['angular_dist'],
                'obs1_png': match['cand1'].png_path,
                'obs2_png': match['cand2'].png_path
            })

        summary_df = pd.DataFrame(summary_data)
        summary_path = os.path.join(output_dir, 'matches_summary.csv')
        summary_df.to_csv(summary_path, index=False)
        print(f"Match summary saved to: {summary_path}")


def main():
    parser = argparse.ArgumentParser(
        description='Compare T1 classified candidates between two observations',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s obs1_full.csv obs2_full.csv -o output_matches

  %(prog)s obs1_full.csv obs2_full.csv \\
    --base-dir1 /data/obs1 \\
    --base-dir2 /data/obs2 \\
    --dm-thresh 2.0 \\
    --period-thresh 1e-5 \\
    --pos-thresh 60.0 \\
    --ignore-periods 3.928 4.44 6.06 \\
    -o matches
        """ 
    )

    parser.add_argument('csv1', help='First observation *_full.csv file (OBS1)')
    parser.add_argument('csv2', help='Second observation *_full.csv file (OBS2)')
    parser.add_argument('-o', '--output-dir', default='comparison_results',
                       help='Output directory for comparison plots (default: comparison_results)')
    parser.add_argument('--base-dir1', action='append', default=[],
                       help='Base directory to search for OBS1 PNGs (can specify multiple)')
    parser.add_argument('--base-dir2', action='append', default=[],
                       help='Base directory to search for OBS2 PNGs (can specify multiple)')
    parser.add_argument('--dm-thresh', type=float, default=1.0,
                       help='DM threshold for matching in pc/cm³ (default: 1.0)')
    parser.add_argument('--period-thresh', type=float, default=5e-6,
                       help='Period threshold for matching in seconds (default: 5e-6)')
    parser.add_argument('--pos-thresh', type=float, default=30.0,
                       help='Position threshold for matching in arcseconds (default: 30.0)')
    parser.add_argument('--ignore-periods', type=float, nargs='*', default=None,
                       help='Periods (in milliseconds) to ignore. Candidates with these periods will be excluded. '
                            'Example: --ignore-periods 3.928 4.44 6.06')
    parser.add_argument('--nthreads', type=int, default=None,
                       help='Number of parallel threads to use (default: all available CPU cores)')

    args = parser.parse_args()

    # Convert ignore periods from milliseconds to seconds
    ignore_periods = None
    if args.ignore_periods is not None:
        ignore_periods = [p / 1000.0 for p in args.ignore_periods]

    # If no base directories specified, use the directory of the CSV file
    base_dirs1 = args.base_dir1 if args.base_dir1 else [os.path.dirname(os.path.abspath(args.csv1))]
    base_dirs2 = args.base_dir2 if args.base_dir2 else [os.path.dirname(os.path.abspath(args.csv2))]

    # Run comparison
    compare_observations(
        args.csv1, args.csv2,
        base_dirs1, base_dirs2,
        args.output_dir,
        args.dm_thresh,
        args.period_thresh,
        args.pos_thresh,
        ignore_periods,
        args.nthreads
    )


if __name__ == '__main__':
    main()
