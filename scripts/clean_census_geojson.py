#!/usr/bin/env python3
"""
Clean Census Bureau Congressional Districts GeoJSON for D3.js compatibility.

WHEN TO USE:
Run this script after downloading a new congressional districts GeoJSON file
from the Census Bureau (e.g., when Congress changes from 119th to 120th).

WHY THIS IS NEEDED:
Census Bureau GeoJSON files (especially KML exports) have two issues that
prevent proper rendering in D3.js:

1. 3D COORDINATES: Census files include elevation [lon, lat, 0.0] but D3's
   geoAlbersUsa projection expects 2D [lon, lat]. 3D coords cause the
   projection to fail silently.

2. WINDING ORDER: Census files use RFC 7946 counterclockwise winding, but
   D3.js expects clockwise exterior rings. Wrong winding causes polygons
   to render "inside out" (fill on outside, not inside).

USAGE:
    python3 scripts/clean_census_geojson.py <input_file> [output_file]

    If output_file is omitted, overwrites the input file.

EXAMPLE:
    # Download new file from Census Bureau, then:
    python3 scripts/clean_census_geojson.py \
        downloads/cb_2026_us_cd121_20m.geojson \
        docs/data/us_congressional_districts.geojson
"""

import json
import sys
import os


def calculate_winding(coords):
    """
    Calculate signed area to determine winding order.
    Negative = counterclockwise (CCW), Positive = clockwise (CW)
    D3.js expects CW for exterior rings.
    """
    total = 0
    for i in range(len(coords) - 1):
        x1, y1 = coords[i][:2]
        x2, y2 = coords[i + 1][:2]
        total += (x2 - x1) * (y2 + y1)
    return total


def strip_elevation(coords):
    """Recursively strip 3rd coordinate (elevation) from all coordinates."""
    if isinstance(coords[0], (int, float)):
        return coords[:2]
    return [strip_elevation(c) for c in coords]


def reverse_rings(geometry):
    """Reverse all polygon rings to flip winding order from CCW to CW."""
    if geometry['type'] == 'Polygon':
        geometry['coordinates'] = [ring[::-1] for ring in geometry['coordinates']]
    elif geometry['type'] == 'MultiPolygon':
        geometry['coordinates'] = [[ring[::-1] for ring in poly] for poly in geometry['coordinates']]
    return geometry


def needs_winding_fix(geometry):
    """Check if the geometry has counterclockwise winding (needs fix)."""
    if geometry['type'] == 'Polygon':
        coords = geometry['coordinates'][0]
    elif geometry['type'] == 'MultiPolygon':
        coords = geometry['coordinates'][0][0]
    else:
        return False

    return calculate_winding(coords) < 0  # Negative = CCW = needs fix


def clean_geojson(input_path, output_path=None):
    """
    Clean a Census Bureau GeoJSON file for D3.js compatibility.

    Performs:
    1. Strips elevation (3rd coordinate) from all coordinates
    2. Fixes winding order (CCW -> CW) if needed
    3. Removes unnecessary KML export properties
    4. Sets standard CRS
    """
    if output_path is None:
        output_path = input_path

    print(f"Loading {input_path}...")
    with open(input_path, 'r') as f:
        data = json.load(f)

    if data.get('type') != 'FeatureCollection':
        print("ERROR: Input file is not a GeoJSON FeatureCollection")
        sys.exit(1)

    feature_count = len(data.get('features', []))
    print(f"Processing {feature_count} features...")

    # Check if winding fix is needed (sample first feature)
    if data['features']:
        sample_geom = data['features'][0]['geometry']
        # Check after stripping elevation
        sample_coords = strip_elevation(sample_geom['coordinates'])
        temp_geom = {'type': sample_geom['type'], 'coordinates': sample_coords}
        fix_winding = needs_winding_fix(temp_geom)
        if fix_winding:
            print("  - Winding order: CCW detected, will convert to CW")
        else:
            print("  - Winding order: Already CW (OK)")

    # Essential Census Bureau properties to keep
    essential_props = [
        'STATEFP',      # State FIPS code
        'CD119FP', 'CD120FP', 'CD121FP', 'CD118FP',  # District number (varies by Congress)
        'GEOIDFQ',      # Full GEOID
        'GEOID',        # Short GEOID (used for data joins)
        'NAMELSAD',     # Full name
        'LSAD',         # Legal/Statistical Area Description
        'CDSESSN',      # Congressional session number
        'ALAND',        # Land area
        'AWATER'        # Water area
    ]

    coords_fixed = 0
    winding_fixed = 0
    props_cleaned = 0

    for feature in data['features']:
        # 1. Strip elevation from coordinates
        original_coords = feature['geometry']['coordinates']
        feature['geometry']['coordinates'] = strip_elevation(original_coords)

        # Check if coords were 3D
        if feature['geometry']['type'] == 'Polygon':
            sample = original_coords[0][0] if original_coords[0] else []
        elif feature['geometry']['type'] == 'MultiPolygon':
            sample = original_coords[0][0][0] if original_coords[0][0] else []
        else:
            sample = []

        if len(sample) > 2:
            coords_fixed += 1

        # 2. Fix winding order if needed
        if fix_winding:
            feature['geometry'] = reverse_rings(feature['geometry'])
            winding_fixed += 1

        # 3. Clean properties (remove KML cruft)
        original_prop_count = len(feature['properties'])
        feature['properties'] = {
            k: v for k, v in feature['properties'].items()
            if k in essential_props
        }
        if len(feature['properties']) < original_prop_count:
            props_cleaned += 1

    # Set standard CRS
    data['crs'] = {
        'type': 'name',
        'properties': {'name': 'urn:ogc:def:crs:EPSG::4269'}
    }

    # Summary
    print(f"\nTransformations applied:")
    print(f"  - Coordinates fixed (3D→2D): {coords_fixed}")
    print(f"  - Winding order fixed: {winding_fixed}")
    print(f"  - Properties cleaned: {props_cleaned}")

    # Save
    print(f"\nSaving to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(data, f)

    # File size comparison
    input_size = os.path.getsize(input_path)
    output_size = os.path.getsize(output_path)
    print(f"File size: {output_size:,} bytes ({output_size/1024/1024:.2f} MB)")

    if input_path != output_path:
        reduction = (1 - output_size/input_size) * 100
        print(f"Size reduction: {reduction:.1f}%")

    print("\nDone! The GeoJSON is now ready for D3.js.")

    # Verify
    print("\n--- Verification ---")
    with open(output_path, 'r') as f:
        verify = json.load(f)

    sample = verify['features'][0]
    print(f"Sample feature GEOID: {sample['properties'].get('GEOID')}")
    print(f"Sample properties: {list(sample['properties'].keys())}")

    if sample['geometry']['type'] == 'MultiPolygon':
        coord = sample['geometry']['coordinates'][0][0][0]
    else:
        coord = sample['geometry']['coordinates'][0][0]
    print(f"Sample coordinate: {coord} ({len(coord)}D)")

    winding = calculate_winding(
        sample['geometry']['coordinates'][0][0]
        if sample['geometry']['type'] == 'MultiPolygon'
        else sample['geometry']['coordinates'][0]
    )
    print(f"Winding order: {'CW (correct)' if winding > 0 else 'CCW (ERROR!)'}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(input_file):
        print(f"ERROR: Input file not found: {input_file}")
        sys.exit(1)

    clean_geojson(input_file, output_file)
