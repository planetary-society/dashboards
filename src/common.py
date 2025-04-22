import pandas as pd
import requests
import io
from pygal.style import Style, darken

# Define the custom Planetary Society PyGal charting style
class TPSStyle(Style):
    """
    PyGal style inspired by matplotlib 'urban' theme and The Planetary Society branding.
    Uses Poppins font and TPS color palette.
    """
    # Define Base Properties
    background = '#F5F5F5'  # Slushy Brine
    plot_background = '#F5F5F5' # Match background
    foreground = '#414141' # Crater Shadow for text/subtle lines
    foreground_strong = '#000000' # Black Hole for bolder text/lines if needed
    foreground_subtle = '#8C8C8C' # Lunar Soil for very subtle elements

    # Define Color Cycle (Primary, Secondary, Faded, Others)
    # Order: Neptune Blue, Plasma Purple, Light Blue 1, Light Blue 2, Rocket Flame?, Light Plasma 1, Light Plasma 2
    colors = (
        '#037CC2', # Neptune Blue (Primary)
        '#643788', # Plasma Purple (Secondary)
        '#80BDE0', # Faded Neptune 1
        '#BFDEF0', # Faded Neptune 2
        '#FF5D47', # Rocket Flame (Use sparingly - good for highlighting?)
        '#B19BC3', # Light Plasma 1 (From guide, near tertiary colors)
        '#D8CDE1'  # Light Plasma 2 (From guide, tertiary)
        '#8C8C8C', # Lunar Soil
    )

    # Font Configuration (Poppins)
    # NOTE: 'Poppins' must be installed on the system viewing the SVG,
    # or use web fonts if embedding in HTML.
    font_family = 'Poppins, sans-serif'
    title_font_family = 'Poppins, sans-serif'
    legend_font_family = 'Poppins, sans-serif'
    tooltip_font_family = 'Poppins, sans-serif'
    major_label_font_family = 'Poppins, sans-serif'
    label_font_family = 'Poppins, sans-serif'

    # Font Sizes (Adjust as needed, mimicking 'urban' relative sizes)
    title_font_size = 18
    legend_font_size = 14
    tooltip_font_size = 12
    major_label_font_size = 11 # Slightly smaller than default
    label_font_size = 10      # Slightly smaller than default

    # Axis and Grid Styling (Clean look inspired by 'urban')
    guide_stroke_color = '#C3C3C3'  # Comet Dust for grid lines
    major_guide_stroke_color = '#C3C3C3' # Comet Dust for major grid lines
    guide_stroke_width = 0.8 # Slightly thicker than default for visibility
    major_guide_stroke_width = 0.8
    guide_stroke_dasharray = '3,3' # Make grid lines subtle dashed
    major_guide_stroke_dasharray = '3,3'

    axis_stroke_width = 1.5 # Thickness of the main x/y axis lines if shown
    axis_stroke_color = foreground_subtle # Use subtle grey for axis lines

    # Remove minor ticks/labels (like urban theme)
    show_minor_x_labels = False
    show_minor_y_labels = False

    # Tooltip Style
    tooltip_background = darken(background, 5) # Slightly darker background
    tooltip_fill = True
    tooltip_border_radius = 4
    tooltip_font_color = foreground_strong # Use black for tooltip text

    # Other properties
    transition = '0s' # Disable animations for a static feel if desired
    opacity = 0.9 # Default opacity for lines/bars
    opacity_hover = 1.0 # Full opacity on hover
    stroke_opacity = 0.95
    stroke_opacity_hover = 1.0
    stroke_width = 4 # Default stroke width for lines

def download_csv_to_dataframe(url: str) -> pd.DataFrame:
    """
    Downloads a CSV file from a URL and loads it into a pandas DataFrame.

    Args:
        url: The URL of the CSV file.

    Returns:
        A pandas DataFrame containing the data from the CSV file.
        Returns an empty DataFrame if the download or parsing fails.
    """
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        csv_content = response.content
        # Use io.StringIO to treat the byte string as a file
        df = pd.read_csv(io.StringIO(csv_content.decode('utf-8')))
        return df
    except requests.exceptions.RequestException as e:
        print(f"Error downloading file from {url}: {e}")
        return pd.DataFrame()
    except pd.errors.ParserError as e:
        print(f"Error parsing CSV data from {url}: {e}")
        return pd.DataFrame()
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return pd.DataFrame()

