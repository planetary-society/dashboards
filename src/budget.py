import pandas as pd
import plotly.express as px
import plotly.graph_objects as go # Import graph_objects for fine-tuning
import io
from .common import TPSStyle, download_csv_to_dataframe

import pandas as pd
import pygal
from pygal.style import Style # To customize style if needed
import os
import io

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