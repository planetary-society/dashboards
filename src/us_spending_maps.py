"""
US Spending Maps Module

A simplified module for creating interactive choropleth maps of US government spending data.
Supports both congressional district and state-level visualizations with customizable color schemes.

Key Features:
- Works with CSV data containing geographic identifiers and spending values
- Supports both congressional districts ('CA-01') and states ('CA')
- Automatically detects GeoJSON format (FIPS codes vs state abbreviations)
- Stepped or continuous color scales with logarithmic scaling options
- Interactive hover tooltips with formatted spending amounts
- Customizable aggregation functions (mean, sum, median)

Example Usage:
    # District-level map
    result = create_spending_map(
        csv_path='spending_data.csv',
        geo_col='district',
        value_cols=['fy_2024', 'fy_2023', 'fy_2022'],
        level='district',
        use_stepped=True
    )
    
    # State-level map  
    result = create_spending_map(
        csv_path='state_data.csv',
        geo_col='state',
        value_cols=['total_spending'],
        level='state',
        use_stepped=True,
        geojson_path='us_states.json'
    )
"""

import pandas as pd
import json
import math
import folium
import branca
from branca.colormap import LinearColormap, StepColormap
from pathlib import Path
from typing import Dict, Optional, Tuple, Union, List
import warnings
import re

class USSpendingMaps:
    """
    Core class for creating choropleth maps of US spending data.
    
    Handles data processing, color calculation, and map generation for both
    congressional districts and states. Automatically adapts to different
    GeoJSON formats and provides flexible styling options.
    """
    
    # US state abbreviations to FIPS code mapping for geographic conversions
    STATE_FIPS_MAP = {
        'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08', 'CT': '09',
        'DE': '10', 'DC': '11', 'FL': '12', 'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17',
        'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
        'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29', 'MT': '30', 'NE': '31',
        'NV': '32', 'NH': '33', 'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38',
        'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46',
        'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54',
        'WI': '55', 'WY': '56', 'AS': '60', 'GU': '66', 'MP': '69', 'PR': '72', 'VI': '78'
    }
    
    # Default color scheme for choropleth maps
    COLORS = {
        'no_data': '#FFFFFF',      # White for areas with no data
        'low_spending': '#ACCCDE',  # Light blue for low spending
        'high_spending': '#037CC2'  # Dark blue for high spending
    }
    
    # Stepped scale spending ranges with corresponding color steps
    # Used for binned color visualization instead of continuous gradients
    # (from 6-class Multi-hue, colorblind-safe scheme, ColorBrewer)
    SPENDING_STEPS = [
        # Threshold,    Color, Legend Label
        (500_000,       "#fdfde6",  '< $500K'),         # Lightest Blue
        (5_000_000,     "#d6ebca",  '$500K to $5M'),
        (50_000_000,    '#7fcdbb',  '$5M to $50M'),
        (250_000_000,   '#41b6c4',  '$50M to $250M'),
        (1_000_000_000, '#2c7fb8',  '$250M to $1B'),
        (5_000_000_000,  '#253494',  '$1B+')                 # Darkest Blue
    ]
    
    def __init__(self, geojson_path: Union[str, Path]):
        """
        Initialize mapper with geographic boundary data.
        
        Args:
            geojson_path: Path to GeoJSON file containing geographic boundaries
                         (congressional districts or states)
        """
        self.geojson_path = Path(geojson_path)
        self.geojson_data = self._load_geojson()
        
    def _load_geojson(self) -> Optional[dict]:
        """Load and parse GeoJSON file, handling common errors gracefully."""
        try:
            with open(self.geojson_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            warnings.warn(f"Could not load GeoJSON: {e}")
            return None
    
    @staticmethod
    def get_district_geoid(area_str: str) -> Optional[str]:
        """
        Convert district string to GEOID format used in congressional districts GeoJSON.
        
        Args:
            area_str: District in format 'STATE-DISTRICT' (e.g., 'CA-01', 'TX-36', 'AK-00')
            
        Returns:
            4-digit GEOID string (e.g., '0601') or None if conversion fails
        """
        if not isinstance(area_str, str) or '-' not in area_str:
            return None
            
        # Split state abbreviation and district number
        state_abbr, area_num = area_str.split('-', 1)
        state_fips = USSpendingMaps.STATE_FIPS_MAP.get(state_abbr.upper())
        
        if not state_fips:
            return None
        
        # Handle special cases: at-large districts (00) and special districts (ZZ)
        if area_num.upper() in ['00', 'ZZ']:
            return f"{state_fips}{area_num.upper()}"
        
        # Convert district number to zero-padded format
        try:
            return f"{state_fips}{int(area_num):02d}"
        except ValueError:
            return None
    
    @staticmethod
    def get_state_fips(state_abbr: str) -> Optional[str]:
        """
        Convert state abbreviation to 2-digit FIPS code.
        
        Args:
            state_abbr: Two-letter state abbreviation (e.g., 'CA', 'TX')
            
        Returns:
            2-digit FIPS code (e.g., '06', '48') or None if invalid
        """
        if not isinstance(state_abbr, str):
            return None
        return USSpendingMaps.STATE_FIPS_MAP.get(state_abbr.upper())
    
    def _get_stepped_color(self, value: float) -> str:
        """
        Determines the color for a given value based on the predefined SPENDING_STEPS.
        Args:
            value: The spending value.
        Returns:
            A hex color string.
        """
        if pd.isna(value) or value <= 0:
            return self.COLORS['no_data']

        for threshold, color_hex, _ in self.SPENDING_STEPS:
            if value < threshold:
                return color_hex
        
        # This part should ideally not be reached if float('inf') is the last threshold
        # and handles all values greater than the preceding threshold.
        # However, as a robust fallback, return the color of the highest defined step.
        return self.SPENDING_STEPS[-1][1] if self.SPENDING_STEPS else self.COLORS['no_data']
    
    def _get_continuous_color(self, value: float, min_val: float, max_val: float, use_log: bool = True) -> str:
        """
        Calculate color for continuous color scale with optional logarithmic scaling.
        
        Args:
            value: Spending amount to color
            min_val: Minimum value in dataset for scaling
            max_val: Maximum value in dataset for scaling
            use_log: Whether to use logarithmic scaling (better for wide value ranges)
            
        Returns:
            Hex color string
        """
        if pd.isna(value) or value <= 0:
            return self.COLORS['no_data']
        
        if max_val <= min_val:
            return self.COLORS['low_spending']
        
        # Calculate interpolation factor (0 to 1)
        if use_log:
            # Logarithmic scaling - better for data with wide ranges
            t = (math.log1p(value) - math.log1p(max(min_val, 0))) / \
                (math.log1p(max_val) - math.log1p(max(min_val, 0)))
        else:
            # Linear scaling
            t = (value - min_val) / (max_val - min_val)
        
        # Clamp interpolation factor to valid range
        t = max(0, min(1, t))
        
        # Parse hex colors and interpolate RGB components
        low_r, low_g, low_b = int(self.COLORS['low_spending'][1:3], 16), \
                             int(self.COLORS['low_spending'][3:5], 16), \
                             int(self.COLORS['low_spending'][5:7], 16)
        high_r, high_g, high_b = int(self.COLORS['high_spending'][1:3], 16), \
                                int(self.COLORS['high_spending'][3:5], 16), \
                                int(self.COLORS['high_spending'][5:7], 16)
        
        r = int(low_r + (high_r - low_r) * t)
        g = int(low_g + (high_g - low_g) * t)
        b = int(low_b + (high_b - low_b) * t)
        
        return f'#{r:02x}{g:02x}{b:02x}'
    
    def prepare_data(self, df: pd.DataFrame, geo_col: str, value_cols: Union[str, List[str]], 
                    agg_func: str = 'mean', level: str = 'district') -> Tuple[Dict[str, float], float, float]:
        """
        Process CSV data into format suitable for choropleth mapping.
        
        Args:
            df: DataFrame with geographic and spending data
            geo_col: Column containing geographic identifiers
            value_cols: Column name(s) containing spending values
            agg_func: How to aggregate multiple value columns ('mean', 'sum', 'median')
            level: Geographic level - 'district' or 'state'
        
        Returns:
            Tuple of (geo_id_to_value_dict, min_value, max_value)
        """
        df_clean = df.copy()
        
        # Ensure value_cols is a list for consistent processing
        if isinstance(value_cols, str):
            value_cols = [value_cols]
        
        # Convert spending columns to numeric, replacing invalid values with 0
        for col in value_cols:
            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce').fillna(0)
        
        # Aggregate multiple spending columns into single value
        if agg_func == 'mean':
            df_clean['agg_value'] = df_clean[value_cols].mean(axis=1)
        elif agg_func == 'sum':
            df_clean['agg_value'] = df_clean[value_cols].sum(axis=1)
        elif agg_func == 'median':
            df_clean['agg_value'] = df_clean[value_cols].median(axis=1)
        
        # Convert geographic identifiers to format expected by GeoJSON
        if level == 'district':
            df_clean['GEO_ID'] = df_clean[geo_col].apply(self.get_district_geoid)
        elif level == 'state':
            df_clean['GEO_ID'] = df_clean[geo_col].apply(self.get_state_fips)
        else:
            raise ValueError("level must be 'district' or 'state'")
            
        # Remove rows with invalid geographic IDs or missing values
        df_clean = df_clean.dropna(subset=['GEO_ID', 'agg_value'])
        
        # Create mapping from geographic ID to aggregated spending value
        geo_id_to_value = df_clean.set_index('GEO_ID')['agg_value'].to_dict()
        values = list(geo_id_to_value.values())
        
        return geo_id_to_value, min(values) if values else 0, max(values) if values else 1
    
    def create_map(self, geo_id_to_value: Dict[str, float], min_val: float, max_val: float,
                  title: str = "Spending Map", use_stepped: bool = False, 
                  hover_data: Optional[Dict[str, str]] = None) -> folium.Map:
        """
        Generate interactive choropleth map with spending data.
        
        Args:
            geo_id_to_value: Mapping from geographic IDs to spending values
            min_val: Minimum spending value for color scaling
            max_val: Maximum spending value for color scaling
            title: Map title displayed in legend
            use_stepped: Whether to use stepped color scale vs continuous
            hover_data: Optional mapping from geographic IDs to hover text
            
        Returns:
            Configured Folium map object ready for display or saving
        """
        if not self.geojson_data:
            raise ValueError("No GeoJSON data loaded")
        
        # Create base map centered on continental US
        
        
        m = folium.Map(location=[40.3736377, 110.0833],
                       zoom_start=4, tiles="CartoDB voyagernolabels",
                       max_bounds=True, min_zoom=3, max_zoom=8)
        
        # Center map on continental US bounds
        m.fit_bounds([[23.7, -122.5], [46.7, -68.79]])

        # Prepare GeoJSON with hover information
        geojson_copy = json.loads(json.dumps(self.geojson_data))  # Deep copy to avoid modifying original
        hover_added = False
        
        if hover_data:
            for feature in geojson_copy['features']:
                # Try multiple common property names for geographic identifiers
                # Different GeoJSON files use different property structures
                geo_id = (feature['properties'].get('GEOID') or       # Congressional districts
                         feature['properties'].get('STATEFP') or     # State FIPS in properties
                         feature['properties'].get('STATE') or       # State name in properties
                         feature['properties'].get('FIPS') or        # Generic FIPS code
                         feature.get('id'))                          # Top-level ID (common for states)
                
                if geo_id and geo_id in hover_data:
                    feature['properties']['hover_info'] = hover_data[geo_id]
                    hover_added = True
                else:
                    # Provide fallback to prevent tooltip errors
                    feature['properties']['hover_info'] = "No data available"
        
        # Define styling function for each geographic feature
        def get_style(feature):
            # Extract geographic ID using same logic as hover data
            geo_id = (feature['properties'].get('GEOID') or 
                     feature['properties'].get('STATEFP') or
                     feature['properties'].get('STATE') or
                     feature['properties'].get('FIPS') or
                     feature.get('id'))
            
            # Get spending value for this geographic area
            value = geo_id_to_value.get(geo_id, 0) if geo_id else 0
            
            # Calculate fill color based on spending amount and scale type
            if use_stepped:
                fill_color = self._get_stepped_color(value)
            else:
                fill_color = self._get_continuous_color(value, min_val, max_val)
            
            return {
                'fillColor': fill_color,
                'color': '#555555',      # Border color
                'weight': 0.5,           # Border width
                'fillOpacity': 0.75      # Fill transparency
            }
        
        # Add choropleth layer to map
        geojson_layer = folium.GeoJson(
            geojson_copy,
            style_function=get_style,
            name=title
        )
        
        # Add interactive hover tooltips if data is available
        if hover_data and hover_added:
            try:
                tooltip = folium.GeoJsonTooltip(
                    fields=['hover_info'],
                    aliases=[''],
                    labels=False,
                    sticky=True,
                    parse_html=True,
                    style=("background-color: white; color: black; font-family: sans-serif; "
                          "font-size: 12px; padding: 10px;")
                )
                geojson_layer.add_child(tooltip)
            except Exception as e:
                warnings.warn(f"Could not add hover tooltips: {e}")
        
        geojson_layer.add_to(m)
        
        # Add appropriate legend based on color scale type
        if use_stepped:
            self._add_stepped_legend(m)
        else:
            self._add_continuous_legend(m, title, min_val, max_val)
        
        return m
    
    def _add_stepped_legend(self, m, title="NASA Science Spending"):
        """Add a custom stepped legend to the map with horizontal color bar."""
        import branca.element
        
        # Build color segments HTML
        color_segments = []
        for _, color, _ in self.SPENDING_STEPS:
            color_segments.append(f"<div class='color-segment' style='background:{color};'></div>")
        
        # Build label items HTML
        label_items = []
        for _, _, label in self.SPENDING_STEPS:
            # HTML encode < and > symbols
            html_label = label.replace('<', '&lt;').replace('>', '&gt;')
            label_items.append(f"<div class='label-item'>{html_label}</div>")
        
        # Create custom legend HTML template
        legend_html = f'''
        <div id='maplegend' class='maplegend'>
            <div class='legend-scale'>
            <div class='legend-bar'>
                {''.join(color_segments)}
            </div>
            <div class='legend-labels'>
                {''.join(label_items)}
            </div>
            </div>
        </div>
        
        <style type='text/css'>
        .maplegend {{
            position: absolute;
            z-index: 9999;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 8px;
            border: 2px solid #ccc;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15);
            padding: 5px;
            font-size: 10px;
            font-family: 'Helvetica', sans-serif;
            left: 20px;
            bottom: 60px;
            min-width: 350px;
        }}
        
        .maplegend .legend-title {{
            text-align: center;
            margin-bottom: 10px;
            font-weight: bold;
            font-size: 15px;
            color: #333;
        }}
        
        .maplegend .legend-scale {{
            width: 100%;
        }}
        
        .maplegend .legend-bar {{
            display: flex;
            width: 100%;
            height: 20px;
            border: 1px solid #999;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }}
        
        .maplegend .color-segment {{
            flex: 1;
            height: 100%;
        }}
        
        .maplegend .legend-labels {{
            display: flex;
            width: 100%;
            justify-content: space-between;
        }}
        
        .maplegend .label-item {{
            flex: 1;
            text-align: center;
            font-size: 11px;
            color: #555;
            line-height: 1.2;
        }}
        
        /* Mobile responsive styles */
        @media (max-width: 768px) {{
            .maplegend {{
            left: 10px;
            right: 10px;
            bottom: 15px;
            min-width: 0;
            width: auto;
            padding: 10px;
            font-size: 13px;
            }}
            
            .maplegend .legend-bar {{
            height: 16px;
            margin-bottom: 6px;
            }}
            
            .maplegend .label-item {{
            font-size: 10px;
            }}
            
            .maplegend .legend-title {{
            font-size: 14px;
            margin-bottom: 8px;
            }}
        }}
        
        @media (max-width: 480px) {{
            .maplegend {{
            padding: 8px;
            font-size: 12px;
            left: 5px;
            right: 5px;
            bottom: 10px;
            }}
            
            .maplegend .legend-bar {{
            height: 14px;
            margin-bottom: 5px;
            }}
            
            .maplegend .label-item {{
            font-size: 9px;
            }}
            
            .maplegend .legend-title {{
            font-size: 13px;
            margin-bottom: 6px;
            }}
        }}
        </style>
        '''
        
        # Create the legend element and add to map
        legend = branca.element.Element(legend_html)
        m.get_root().html.add_child(legend)
        
        return m

    def _add_continuous_legend(self, map_obj: folium.Map, title: str, min_val: float, max_val: float):
        """
        Add continuous color scale legend using Folium's built-in colormap.
        
        Args:
            map_obj: Folium map to add legend to
            title: Legend title
            min_val: Minimum value for scale
            max_val: Maximum value for scale
        """
        colormap = LinearColormap(
            colors=[self.COLORS['low_spending'], self.COLORS['high_spending']],
            vmin=0, 
            vmax=max_val
        )
        colormap.caption = f"{title} (Log Scale)"
        colormap.add_to(map_obj)

def amount_formatter(value: float, abbr: bool = True, decimal: int = 1) -> str:
    """
    Format spending amount as a string with appropriate units.
    
    Args:
        value: Spending amount to format
        abbr: Whether to use abbreviated units (e.g., 'K', 'M', 'B') or full dollar amounts
    
    Returns:
        Formatted string with appropriate unit (e.g., '$1.2M', '$500K', '$3.4 billion')
    """
    if pd.isna(value) or value < 0:
        return "No data"
    
    billion_suffix = 'B' if abbr else ' billion'
    million_suffix = 'M' if abbr else ' million'
    
    if value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.{decimal}f}{billion_suffix}"
    elif value >= 1_000_000:
        return f"${value / 1_000_000:.{decimal}f}{million_suffix}"
    elif value >= 1_000:
        if abbr:
            return f"${value / 1_000:.{decimal}f}K"
        else:
            return f"${value:,.0f}"
    elif value == 0:
        return "$0"
    else:
        return f"${value:.{decimal}f}"

def create_spending_map(csv_path: str, geo_col: str, value_cols: Union[str, List[str]], 
                       title: str = "Spending Map", agg_func: str = 'mean', 
                       use_stepped: bool = False, level: str = 'district',
                       geojson_path: str = 'us_congressional_districts.geojson') -> Dict:
    """
    Convenience function to create a complete spending map from CSV data.
    
    This is the main entry point for most use cases. Handles data loading,
    processing, geographic ID conversion, hover text generation, and map creation.
    
    Args:
        csv_path: Path to CSV file with spending data
        geo_col: Column containing geographic identifiers 
                ('CA-01' format for districts, 'CA' format for states)
        value_cols: Column name(s) containing spending values to visualize
        title: Map title for display and legend
        agg_func: How to combine multiple value columns ('mean', 'sum', 'median')
        use_stepped: Whether to use stepped color ranges vs continuous gradient
        level: Geographic level - 'district' for congressional districts, 'state' for states
        geojson_path: Path to GeoJSON file with geographic boundaries
    
    Returns:
        Dictionary containing:
            'map': Folium map object ready for display/saving
            'data': Dictionary mapping geographic IDs to spending values  
            'dataframe': Original DataFrame
            'stats': Dictionary with 'min', 'max', 'count' of processed data
    
    Example:
        # Create district map with stepped colors
        result = create_spending_map(
            csv_path='nasa_spending.csv',
            geo_col='district', 
            value_cols=['fy_2024_obligations', 'fy_2023_obligations'],
            title='NASA Spending by District',
            level='district',
            use_stepped=True
        )
        result['map'].save('nasa_map.html')
    """
    # Load CSV data and initialize mapping tools
    df = pd.read_csv(csv_path)
    mapper = USSpendingMaps(geojson_path)
    
    # Process data into geographic ID to value mapping
    geo_id_to_value, min_val, max_val = mapper.prepare_data(df, geo_col, value_cols, agg_func, level)
    
    # Prepare data for hover tooltips
    df_with_geo = df.copy()
    if level == 'district':
        df_with_geo['GEO_ID'] = df_with_geo[geo_col].apply(mapper.get_district_geoid)
        geo_label = "District"
    else:  # state level processing
        # Auto-detect GeoJSON format to determine ID format needed
        if mapper.geojson_data and len(mapper.geojson_data['features']) > 0:
            first_feature = mapper.geojson_data['features'][0]
            sample_id = first_feature.get('id')
            
            # If GeoJSON uses 2-letter state abbreviations, use them directly
            if sample_id and len(sample_id) == 2 and sample_id.isalpha():
                df_with_geo['GEO_ID'] = df_with_geo[geo_col].str.upper()
            else:
                # Otherwise convert to FIPS codes
                df_with_geo['GEO_ID'] = df_with_geo[geo_col].apply(mapper.get_state_fips)
        else:
            # Default to FIPS codes if format can't be determined
            df_with_geo['GEO_ID'] = df_with_geo[geo_col].apply(mapper.get_state_fips)
        
        geo_label = "State"
    
    # Prepare value columns for aggregation
    if isinstance(value_cols, str):
        value_cols_list = [value_cols]
    else:
        value_cols_list = value_cols
    
    # Convert spending columns to numeric format
    for col in value_cols_list:
        df_with_geo[col] = pd.to_numeric(df_with_geo[col], errors='coerce').fillna(0)
    
    # Calculate aggregated spending values for hover display
    if agg_func == 'mean':
        df_with_geo['agg_value'] = df_with_geo[value_cols_list].mean(axis=1)
    elif agg_func == 'sum':
        df_with_geo['agg_value'] = df_with_geo[value_cols_list].sum(axis=1)
    elif agg_func == 'median':
        df_with_geo['agg_value'] = df_with_geo[value_cols_list].median(axis=1)
    
    # Generate hover tooltip text with formatted spending amounts
    hover_data = {}
    for _, row in df_with_geo.dropna(subset=['GEO_ID']).iterrows():
        geo_id = row['GEO_ID']
        geo_name = row[geo_col]
        value = row['agg_value']
        
        value_str = amount_formatter(value,False)  # Use full dollar amounts for hover text
        
        # Extract FY year from value column names using regex
        hover_context = agg_func.capitalize()
        if isinstance(value_cols_list, list) and len(value_cols_list) > 0:
            numeric_years = [int(match.group(1)) for col in value_cols_list if (match := re.search(r'(\d{4})', col))]
            start_year = min(numeric_years) if numeric_years else None
            end_year = max(numeric_years) if numeric_years else None
            if start_year and end_year:
                hover_context = f"({agg_func.capitalize()} from FY {start_year} to FY {end_year})".replace("Mean", "Average")
        
        # Build hover text with geographic info and spending details
        hover_data[geo_id] = (
            f"<b>{geo_label}: {geo_name}</b><br>"
            f"Annual Spending: {value_str}<br>"
            f"{hover_context}"
        )
    
    # Convert data format to match GeoJSON structure for state maps
    if level == 'state':
        # Check if GeoJSON uses state abbreviations instead of FIPS codes
        if mapper.geojson_data and len(mapper.geojson_data['features']) > 0:
            first_feature = mapper.geojson_data['features'][0]
            sample_id = first_feature.get('id')
            
            if sample_id and len(sample_id) == 2 and sample_id.isalpha():
                # Convert from FIPS codes back to state abbreviations for matching
                new_geo_id_to_value = {}
                fips_to_state = {v: k for k, v in mapper.STATE_FIPS_MAP.items()}
                
                for geo_id, value in geo_id_to_value.items():
                    if geo_id in fips_to_state:
                        state_abbr = fips_to_state[geo_id]
                        new_geo_id_to_value[state_abbr] = value
                    else:
                        new_geo_id_to_value[geo_id] = value  # Keep as-is if not a FIPS code
                
                geo_id_to_value = new_geo_id_to_value
    
    # Generate final map with all styling and interactivity
    spending_map = mapper.create_map(geo_id_to_value, min_val, max_val, title, use_stepped, hover_data)

    return {
        'map': spending_map,
        'data': geo_id_to_value,
        'stats': {'min': min_val, 'max': max_val, 'count': len(geo_id_to_value)},
        'dataframe': df
    }


# Quick test if run directly
if __name__ == "__main__":
    map = create_spending_map(csv_path="data/NASA-district-Science-summary.csv",
                              geo_col="district",
                              level="district",
                              value_cols=["fy_2024_obligations", "fy_2023_obligations","fy_2022_obligations"],
                              use_stepped=True,
                              geojson_path="us_congressional_districts.geojson"
                            )
    map['map'].save("nasa_district_map2.html")