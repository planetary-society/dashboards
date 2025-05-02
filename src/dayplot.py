import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import matplotlib as mpl
import numpy as np # Needed for range

print("Starting script...")

# --- (Optional) Font Styling ---
# (Same font styling block as before - uncomment and modify if desired)
# try:
#     mpl.rcParams['font.sans-serif'] = ['YOUR_PREFERRED_FONT_NAME', 'Arial']
#     mpl.rcParams['font.family'] = 'sans-serif'
# except Exception as e:
#     print(f"Couldn't set custom font: {e}")
# mpl.rcParams['font.size'] = 10
# ... (rest of font settings)

# --- 1. Load Data ---
try:
    df = pd.read_csv('NASA_mission_starts.csv')
    print("Data loaded successfully.")
except FileNotFoundError:
    print("Error: 'NASA_mission_starts.csv' not found.")
    print("Please make sure the CSV file is in the same directory as the script.")
    exit()

# --- 2. Clean Data ---
# (Same cleaning steps as before)
df_filtered = df[df['Nation'].str.startswith('United States', na=False)].copy()
df_filtered.dropna(subset=['Formulation Start Date'], inplace=True)
df_filtered['Formulation Start Date'] = pd.to_datetime(df_filtered['Formulation Start Date'], errors='coerce')
df_filtered.dropna(subset=['Formulation Start Date'], inplace=True)
df_filtered = df_filtered[df_filtered['Formulation Start Date'] >= '2000-01-01'].copy()
required_divisions = ["Planetary Science", "Heliophysics", "Astrophysics", "Earth Science"]
df_filtered = df_filtered[df_filtered['Division'].isin(required_divisions)].copy()
print(f"Data filtered. Found {len(df_filtered)} relevant mission starts.")

# --- 3. Prepare Data for Heatmap (Yearly) ---
# Extract Year
df_filtered['Year'] = df_filtered['Formulation Start Date'].dt.year

# Group by Division and Year, count missions
heatmap_data = df_filtered.groupby(['Division', 'Year']).size().reset_index(name='Mission Count')

# Pivot the table for heatmap format
heatmap_pivot = heatmap_data.pivot(index='Division', columns='Year', values='Mission Count')

# Define the full range of years for the plot axis
all_years = np.arange(2000, 2026) # Years 2000 to 2025 inclusive

# Reindex columns to include all years, fill missing values with 0
heatmap_pivot = heatmap_pivot.reindex(columns=all_years, fill_value=0)

# Reindex rows to ensure consistent division order, fill missing with 0
heatmap_pivot = heatmap_pivot.reindex(index=required_divisions, fill_value=0)

# Fill any other potential NaN values with 0 (shouldn't be needed after reindex with fill_value)
heatmap_pivot.fillna(0, inplace=True)

# Convert counts to integers
heatmap_pivot = heatmap_pivot.astype(int)

# --- 4. Create Heatmap with Styling (Yearly, Box-like) ---
output_filename = 'NASA_mission_starts_yearly_styled.png'

if not heatmap_pivot.empty:
    try:
        # Adjust figsize for aspect ratio: ~26 columns / 4 rows = ~6.5 width/height ratio
        # Experiment with height to control overall size
        num_rows = len(required_divisions)
        num_cols = len(all_years)
        aspect_ratio = num_cols / num_rows
        fig_height = 3.5 # Adjust this base height as needed
        fig_width = fig_height * aspect_ratio * 0.8 # Fine-tune multiplier for aesthetics
        plt.figure(figsize=(fig_width, fig_height))


        # Use seaborn heatmap with adjusted styling
        ax = sns.heatmap(
            heatmap_pivot,
            cmap="Blues",           # Sequential colormap
            linewidths=0.75,        # Slightly thicker lines for box separation
            linecolor='lightgray',  # Light color for lines
            cbar=True,              # Show color bar
            cbar_kws={'label': 'Mission Starts', 'shrink': 0.9}, # Adjusted shrink
            annot=True,             # Show counts in cells
            fmt="d",                # Integer format for annotations
            annot_kws={"size": 9}   # Adjusted annotation font size
            # square=True # Setting square=True forces box shape but might crop labels/titles
        )

        # --- 5. Customize Plot ---
        ax.set_title('NASA Mission Starts by Division (Yearly, 2000-2025)', fontsize=16, pad=20)
        ax.set_xlabel('Year', fontsize=12)
        ax.set_ylabel('NASA Science Division', fontsize=12)

        # Adjust x-axis tick frequency if needed (e.g., show every 2 years)
        tick_spacing = 2 # Show label every 2 years
        ax.xaxis.set_major_locator(mticker.MultipleLocator(tick_spacing))
        # Ensure labels align with ticks
        ax.set_xticklabels([col if (col - all_years[0]) % tick_spacing == 0 else "" for col in heatmap_pivot.columns])

        plt.xticks(rotation=45, ha='right', fontsize=10)
        plt.yticks(rotation=0, fontsize=10)

        # Remove axis ticks for a cleaner look
        ax.tick_params(axis='both', which='both', length=0)

        # Ensure layout fits elements well
        plt.tight_layout(rect=[0, 0, 1, 0.95]) # Adjust layout

        # --- 6. Save the Plot ---
        plt.savefig(output_filename, dpi=300) # Save with higher resolution
        print(f"Yearly styled heatmap successfully saved as {output_filename}")

        # --- 7. Show the Plot (optional) ---
        # plt.show() # Uncomment this line if you want the plot window to open

    except Exception as e:
        print(f"\nAn unexpected error occurred during plotting: {e}")

else:
    print("No data available for plotting after filtering.")

print("Script finished.")