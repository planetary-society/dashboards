import pandas as pd
from common import TPSStyle, download_csv_to_dataframe
import pandas as pd
import pygal
import os
from PIL import Image
import base64
# Define the PyGal plotting function
def plot_nasa_budget_pygal(df, output_path='img/nasa-budget-latest.svg'):
  """
  Plots NASA budget Submission and Projection using PyGal and saves to SVG.

  Args:
      df (pd.DataFrame): DataFrame containing NASA budget data.
      output_path (str): The path (including filename) to save the SVG file.
  """
  # --- Data Cleaning (Similar to Plotly version) ---
  cols_to_plot = [
      'Year',
      'White House Budget Submission',
      'White House Budget Projection'
  ]
  plot_df = df[cols_to_plot].copy()

  budget_cols = {
      'White House Budget Submission': 'Submission',
      'White House Budget Projection': 'Projection'
  }

  for col, new_name in budget_cols.items():
    if col in plot_df.columns:
        plot_df[new_name] = plot_df[col].astype(str).str.replace(r'[$,]', '', regex=True)
        plot_df[new_name] = pd.to_numeric(plot_df[new_name], errors='coerce')
    else:
        plot_df[new_name] = pd.NA

  plot_df['Year'] = pd.to_numeric(plot_df['Year'], errors='coerce')

  # Convert Year to string for labels, handle potential float conversion if needed
  years_list = plot_df['Year'].astype(int).astype(str).tolist()

  # Convert budget columns to lists, replacing NaN with None for PyGal
  submission_list = [x if pd.notna(x) else None for x in plot_df['Submission']]
  projection_list = [x if pd.notna(x) else None for x in plot_df['Projection']]

  # --- Create PyGal Chart ---
  config = pygal.Config()
  config.x_title = 'Fiscal Year'
  config.y_title = 'Amount (Millions of USD)'
  config.x_labels = years_list
  config.style = TPSStyle
  config.width = 1000
  config.height = 563
  config.show_legend = False
  config.show_dots = True # Add markers
  config.x_label_rotation = 90 # Rotate labels if years overlap
  config.value_formatter = lambda x: f"{x:,.0f}" if x is not None else "N/A"
  config.pretty_print = True
  config.interpolate = None  # Explicitly disable interpolation across None values
  config.fill = False       # Ensure lines are not filled
  
  line_chart = pygal.Line(config)

  # --- Add Data Series ---
  # Submission (Solid Line)
  line_chart.add('Submission', submission_list)

  # Projection (Dotted Line, specific dash array)
  line_chart.add('Projection', projection_list, stroke_style={'width': 2, 'dasharray': '6, 4'}) # 'dasharray' creates dotted/dashed effect

  # --- Ensure Output Directory Exists ---
  output_dir = os.path.dirname(output_path)
  if output_dir and not os.path.exists(output_dir):
      os.makedirs(output_dir)
      print(f"Created directory: {output_dir}")

  # --- Render to SVG File ---
  line_chart.render_to_file(output_path)
  


def relative_budget_change(
    csv_file: str = "NASA_budget_relative_change.csv",
    logo_file: str = "TPS_Logo_1Line-Black.png",
    output_path: str = "."
):
    # Input CSV and output SVG filenames
    base_name, _ = os.path.splitext(csv_file)
    svg_file = f'{base_name}.svg'


    # Prepare paths
    base = os.path.splitext(os.path.basename(csv_file))[0]
    svg_path = os.path.join(output_path, f"{base}.svg")

    # Load & clean data
    df = pd.read_csv(csv_file)
    df["YoY"] = pd.to_numeric(df["Year-over-year % change"], errors="coerce")
    df = df.dropna(subset=["YoY"])
    years = df["Fiscal Year"].astype(str).tolist()
    changes = df["YoY"].tolist()

    # Chart style & dimensions
    style = TPSStyle()
    style.stroke_opacity = 0
    style.stroke_width = 0
    chart_width, chart_height = 775, 500

    chart = pygal.Bar(
        style=style,
        include_zero=True,
        show_legend=False,
        x_label_rotation=90,
        show_minor_x_labels=True,
        show_x_axis=True,
        show_y_guides=True,
        y_guides=[0],
        value_formatter=lambda v: f"{int(v*100)}%",  # percent labels
    )
    chart.width = chart_width
    chart.height = chart_height
    chart.x_labels = [yr if i % 5 == 0 else "" for i, yr in enumerate(years)]
    bars = [
        {"value": v, "color": "#037CC2" if v >= 0 else "#FF5D47"}
        for v in changes
    ]
    chart.add("∆%", bars, stroke=False)

    # Render to string
    svg = chart.render(is_unicode=True)

    # Load logo to get aspect ratio
    img = Image.open(logo_file)
    img_w, img_h = img.size
    logo_w = chart_width * 0.33
    logo_h = logo_w * (img_h / img_w)
    x_pos = (chart_width - logo_w) / 2
    padding = -30
    y_pos = chart_height - logo_h - padding

    # Base64-encode the logo
    with open(logo_file, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    mime = "png" if logo_file.lower().endswith(".png") else "jpeg"
    href = f"data:image/{mime};base64,{b64}"

    # Build <image> tag and insert before </svg>
    image_tag = (
        f'<image x="{x_pos}" y="{y_pos}" '
        f'width="{logo_w}" height="{logo_h}" '
        f'href="{href}" preserveAspectRatio="xMidYMid meet"/>'
    )
    final_svg = svg.replace("</svg>", f"  {image_tag}\n</svg>")

    # Write out final SVG
    with open(svg_path, "w", encoding="utf-8") as out:
        out.write(final_svg)

    print(f"Chart with embedded logo saved to {svg_path}")
    
if __name__ == "__main__":
    # Example usage
    relative_budget_change()