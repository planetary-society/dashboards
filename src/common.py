import pandas as pd
import requests
import io

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

