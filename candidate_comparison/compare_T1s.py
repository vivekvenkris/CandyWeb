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


class Candidate:
    """Represents a pulsar candidate with comparison methods."""

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

        # PNG path
        self.png_path = str(row['png_path'])

        # Store all original data for reference
        self.data = row.to_dict()

    def is_related(self, other: 'Candidate', period_thresh: float,
                   dm_thresh: float, tobs_over_c: float) -> Tuple[bool, float, float]:
        """
        Check if another candidate is related based on DM and period.

        Implements orbit demodulation to compare periods in the same reference frame.

        Args:
            other: Another candidate to compare with
            period_thresh: Period threshold for matching (seconds)
            dm_thresh: DM threshold for matching (pc/cm³)
            tobs_over_c: Observation time / speed of light for demodulation

        Returns:
            Tuple of (is_related, delta_dm, delta_period)
        """
        # Check DM threshold first (fast rejection)
        delta_dm = abs(self.dm - other.dm)
        if delta_dm > dm_thresh:
            return False, delta_dm, float('inf')

        # Demodulate the orbit to compare periods in same reference frame
        # Correct the other candidate's period for acceleration difference
        corrected_other_f0 = other.f0 - (other.acc - self.acc) * other.f0 * tobs_over_c

        if corrected_other_f0 <= 0:
            return False, delta_dm, float('inf')

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

        return is_match, delta_dm, delta_period


def find_png_file(png_path: str, base_dirs: List[str]) -> Optional[str]:
    """
    Find the actual PNG file given a relative path and base directories.

    Args:
        png_path: Relative path to PNG file (e.g., 'path/to/png')
        base_dirs: List of base directories to search in

    Returns:
        Full path to PNG file if found, None otherwise
    """
    # If the path is already absolute and exists, return it
    if os.path.isabs(png_path) and os.path.exists(png_path):
        return png_path

    # Search in each base directory
    for base_dir in base_dirs:
        # Try direct path under base directory
        full_path = os.path.join(base_dir, png_path)
        if os.path.exists(full_path):
            return full_path

        # Try walking through subdirectories to find the file
        # This handles cases like base_path/path1/path/to/png
        png_basename = os.path.basename(png_path)
        png_dirname = os.path.dirname(png_path)

        for root, dirs, files in os.walk(base_dir):
            # Check if current directory ends with the png_dirname
            if root.endswith(png_dirname) or png_dirname == '':
                candidate_path = os.path.join(root, png_basename)
                if os.path.exists(candidate_path):
                    # Verify this matches the full relative path structure
                    if candidate_path.endswith(png_path):
                        return candidate_path

    return None


def load_candidates(csv_path: str, obs_name: str) -> List[Candidate]:
    """
    Load T1 classified candidates from a CSV file.

    Args:
        csv_path: Path to *_full.csv file
        obs_name: Name of the observation

    Returns:
        List of Candidate objects
    """
    df = pd.read_csv(csv_path)

    # Filter for T1 classifications
    # Assuming classification column is named 'classification' or 'class'
    class_col = None
    for col in ['classification', 'class', 'Classification', 'Class']:
        if col in df.columns:
            class_col = col
            break

    if class_col is None:
        raise ValueError(f"Could not find classification column in {csv_path}")

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
                          delta_dm: float, delta_period: float,
                          base_dirs1: List[str], base_dirs2: List[str],
                          output_dir: str, match_idx: int,
                          tobs_over_c: float):
    """
    Create a comparison plot showing both candidates and their delta values.

    Args:
        cand1: First candidate (from OBS1)
        cand2: Second candidate (from OBS2)
        delta_dm: DM difference
        delta_period: Period difference
        base_dirs1: Base directories to search for OBS1 PNGs
        base_dirs2: Base directories to search for OBS2 PNGs
        output_dir: Directory to save output plot
        match_idx: Index of this match (for filename)
        tobs_over_c: Observation time / speed of light for demodulation
    """
    # Find PNG files
    png1 = find_png_file(cand1.png_path, base_dirs1)
    png2 = find_png_file(cand2.png_path, base_dirs2)

    if png1 is None:
        print(f"Warning: Could not find PNG for {cand1.obs_name}: {cand1.png_path}")
    if png2 is None:
        print(f"Warning: Could not find PNG for {cand2.obs_name}: {cand2.png_path}")

    # Calculate demodulated period for cand2
    corrected_f0 = cand2.f0 - (cand2.acc - cand1.acc) * cand2.f0 * tobs_over_c
    corrected_period = 1.0 / corrected_f0 if corrected_f0 > 0 else 0.0

    # Create figure with adjusted layout for table
    fig = plt.figure(figsize=(20, 10))
    gs = GridSpec(3, 2, figure=fig, height_ratios=[0.8, 0.8, 4], hspace=0.3, wspace=0.2)

    # Title with delta values
    title_ax = fig.add_subplot(gs[0, :])
    title_ax.axis('off')
    title_text = (
        f"Matched Candidates: {cand1.obs_name} ↔ {cand2.obs_name}\n"
        f"ΔDM = {delta_dm:.2f} pc/cm³  |  ΔP₀ (demodulated) = {delta_period*1000:.4f} ms"
    )
    title_ax.text(0.5, 0.5, title_text, ha='center', va='center',
                 fontsize=14, fontweight='bold', transform=title_ax.transAxes)

    # Table with parameters
    table_ax = fig.add_subplot(gs[1, :])
    table_ax.axis('off')

    # Create table data
    table_data = [
        ['Parameter', cand1.obs_name, cand2.obs_name, 'Δ'],
        ['DM (pc/cm³)', f'{cand1.dm:.2f}', f'{cand2.dm:.2f}', f'{delta_dm:.2f}'],
        ['P₀_opt (ms)', f'{cand1.period*1000:.4f}', f'{cand2.period*1000:.4f}',
         f'{abs(cand1.period - cand2.period)*1000:.4f}'],
        ['P₀_demod (ms)', f'{cand1.period*1000:.4f}', f'{corrected_period*1000:.4f}',
         f'{delta_period*1000:.4f}'],
        ['Acc (m/s²)', f'{cand1.acc:.2e}', f'{cand2.acc:.2e}',
         f'{abs(cand1.acc - cand2.acc):.2e}']
    ]

    table = table_ax.table(cellText=table_data, cellLoc='center', loc='center',
                          colWidths=[0.25, 0.25, 0.25, 0.25])
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 2)

    # Style header row
    for i in range(4):
        table[(0, i)].set_facecolor('#4CAF50')
        table[(0, i)].set_text_props(weight='bold', color='white')

    # Alternate row colors
    for i in range(1, 5):
        for j in range(4):
            if i % 2 == 0:
                table[(i, j)].set_facecolor('#f0f0f0')

    # Display first PNG (left side)
    ax1 = fig.add_subplot(gs[2, 0])
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

    # Display second PNG (right side)
    ax2 = fig.add_subplot(gs[2, 1])
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

    # Save plot
    output_path = os.path.join(output_dir, f"match_{match_idx:03d}.png")
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close(fig)

    print(f"  Saved: {output_path}")


def compare_observations(csv1: str, csv2: str,
                        base_dirs1: List[str], base_dirs2: List[str],
                        output_dir: str,
                        dm_thresh: float = 100.0,
                        period_thresh: float = 0.001,
                        tobs: float = 1800.0):
    """
    Compare T1 candidates between two observations.

    Args:
        csv1: Path to first observation's *_full.csv file
        csv2: Path to second observation's *_full.csv file
        base_dirs1: Base directories to search for OBS1 PNGs
        base_dirs2: Base directories to search for OBS2 PNGs
        output_dir: Directory to save comparison plots
        dm_thresh: DM threshold for matching (pc/cm³)
        period_thresh: Period threshold for matching (seconds)
        tobs: Observation time (seconds) for orbit demodulation
    """
    # Speed of light in m/s
    c = 299792458.0
    tobs_over_c = tobs / c

    # Load candidates
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

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Compare candidates
    print("\n" + "="*60)
    print("COMPARING CANDIDATES")
    print("="*60)
    print(f"Thresholds: ΔDM ≤ {dm_thresh} pc/cm³, ΔP₀ ≤ {period_thresh*1000} ms")
    print(f"Observation time: {tobs} s")
    print()

    matches = []
    match_idx = 0

    for i, cand1 in enumerate(candidates1):
        print(f"Checking OBS1 candidate {i+1}/{len(candidates1)} "
              f"(DM={cand1.dm:.2f}, P₀={cand1.period*1000:.4f} ms)...")

        for j, cand2 in enumerate(candidates2):
            is_match, delta_dm, delta_period = cand1.is_related(
                cand2, period_thresh, dm_thresh, tobs_over_c
            )

            if is_match:
                print(f"  ✓ Match with OBS2 candidate {j+1}: "
                      f"ΔDM={delta_dm:.2f}, ΔP₀={delta_period*1000:.4f} ms")

                matches.append({
                    'obs1_idx': i,
                    'obs2_idx': j,
                    'delta_dm': delta_dm,
                    'delta_period': delta_period,
                    'cand1': cand1,
                    'cand2': cand2
                })

                # Create comparison plot
                create_comparison_plot(
                    cand1, cand2, delta_dm, delta_period,
                    base_dirs1, base_dirs2, output_dir, match_idx, tobs_over_c
                )
                match_idx += 1

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
                'obs2_dm': match['cand2'].dm,
                'obs2_period_ms': match['cand2'].period * 1000,
                'delta_dm': match['delta_dm'],
                'delta_period_ms': match['delta_period'] * 1000,
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
    --dm-thresh 50 \\
    --period-thresh 0.0005 \\
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
    parser.add_argument('--dm-thresh', type=float, default=100.0,
                       help='DM threshold for matching in pc/cm³ (default: 100.0)')
    parser.add_argument('--period-thresh', type=float, default=0.001,
                       help='Period threshold for matching in seconds (default: 0.001)')
    parser.add_argument('--tobs', type=float, default=1800.0,
                       help='Observation time in seconds for orbit demodulation (default: 1800.0)')

    args = parser.parse_args()

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
        args.tobs
    )


if __name__ == '__main__':
    main()
