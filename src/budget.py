import pandas as pd
import plotly.express as px
import plotly.graph_objects as go # Import graph_objects for fine-tuning
import io

# Define the plotting function
def plot_nasa_budget_submission_projection(df):
  """
  Plots the White House Budget Submission and Projection for NASA over the years.

  Args:
      df (pd.DataFrame): DataFrame containing NASA budget data with 'Year',
                          'White House Budget Submission (Millions)', and
                          'White House Budget Projection (Millions)' columns.

  Returns:
      plotly.graph_objects.Figure: A Plotly figure object showing the line chart.
  """
  # --- Data Cleaning ---
  cols_to_plot = [
      'Year',
      'White House Budget Submission',
      'White House Budget Projection'
  ]
  # Select relevant columns and create a copy
  plot_df = df[cols_to_plot].copy()

  # Define columns to clean and their new numeric names
  budget_cols = {
      'White House Budget Submission': 'Submission',
      'White House Budget Projection': 'Projection'
  }

  for col, new_name in budget_cols.items():
    # Ensure column exists before trying to clean
    if col in plot_df.columns:
        # Remove non-numeric characters ('$' and ',')
        plot_df[new_name] = plot_df[col].astype(str).str.replace(r'[$,]', '', regex=True)
        # Convert to numeric, coercing errors
        plot_df[new_name] = pd.to_numeric(plot_df[new_name], errors='coerce')
    else:
        # Handle missing column if necessary, e.g., create a column of NaNs
        plot_df[new_name] = pd.NA


  # Ensure 'Year' is numeric and drop rows with invalid Year
  plot_df['Year'] = pd.to_numeric(plot_df['Year'], errors='coerce')
  plot_df.dropna(subset=['Year'], inplace=True)
  plot_df.sort_values('Year', inplace=True) # Ensure chronological order

  # --- Data Reshaping (Melting) ---
  # Melt the DataFrame to long format for easier plotting with Plotly Express
  plot_df_melted = pd.melt(
      plot_df,
      id_vars=['Year'],
      value_vars=['Submission', 'Projection'], # Columns to turn into rows
      var_name='Budget Type', # Name for the new column indicating the original column name
      value_name='Amount (Millions USD)' # Name for the new column containing the numeric values
  )

  # Drop rows where the amount itself is NaN after melting
  plot_df_melted.dropna(subset=['Amount (Millions USD)'], inplace=True)

  # --- Plotting ---
  fig = px.line(
      plot_df_melted,
      x='Year',
      y='Amount (Millions USD)',
      color='Budget Type', # Assigns different colors to Submission and Projection
      line_dash='Budget Type', # Assigns different dash styles
      markers=True,
      title='NASA White House Budget: Submission vs. Projection',
      labels={
          'Year': 'Fiscal Year',
          'Amount (Millions USD)': 'Amount (Millions of USD)',
          'Budget Type': 'Budget Type' # Label for the legend
      },
      hover_data={'Year': True, 'Amount (Millions USD)': ':.2f'}
  )

  # --- Custom Styling ---
  # Manually set line styles and colors after initial creation
  # Plotly Express cycles through styles. We want specific ones.
  submission_color = px.colors.qualitative.Plotly[0] # Get the first default color
  projection_color = px.colors.qualitative.Plotly[1] # Get the second default color (adjust if needed)
  # Let's make projection lighter - using 'lightsteelblue' as an example, or lighten the default blue
  lighter_projection_color = 'lightskyblue' # Example light color

  for trace in fig.data:
      if trace.name == 'Submission':
          trace.line.dash = 'solid'
          trace.line.color = submission_color
      elif trace.name == 'Projection':
          trace.line.dash = 'dot' # Use 'dot' for dotted line
          trace.line.color = lighter_projection_color # Assign the lighter color


  fig.update_layout(
      xaxis_title='Fiscal Year',
      yaxis_title='Amount (Millions of USD)',
      hovermode='x unified',
      legend_title_text='Budget Type'
  )

  return fig