# .github/scripts/fetch_data.py
import os
import requests
import sys
import fnmatch
from datetime import datetime
import logging
# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def fetch_csv_files_from_private_repo():
    """Fetch all *summary.csv files of NASA economic impact reports repo"""
    
    token = os.environ.get('PRIVATE_REPO_TOKEN')
    repo = os.environ.get('PRIVATE_REPO')
    
    if not token or not repo:
        logger.error("ERROR: Missing PRIVATE_REPO_TOKEN or PRIVATE_REPO environment variables")
        sys.exit(1)
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }
    
    try:
        # First, list files in the reports directory
        reports_url = f"https://api.github.com/repos/{repo}/contents/reports"
        logger.info(f"Listing files in {repo}/reports/")
        
        response = requests.get(reports_url, headers=headers)
        response.raise_for_status()
        
        files = response.json()
        
        # Find all files matching the pattern "*summary.csv"
        matching_files = []
        for file in files:
            if file['type'] == 'file' and fnmatch.fnmatch(file['name'], '*summary.csv'):
                matching_files.append(file)
        
        if not matching_files:
            logger.error("ERROR: No files matching '*summary.csv' found in reports/ directory")
            logger.error("Available files:")
            for file in files:
                if file['type'] == 'file':
                    logger.error(f"  - {file['name']}")
            sys.exit(1)
        
        logger.info(f"Found {len(matching_files)} matching files to download:")
        for file in matching_files:
            logger.info(f"  - {file['name']}")
        
        # Ensure data directory exists
        os.makedirs('data', exist_ok=True)
        
        # Download headers for raw file content
        download_headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github.v3.raw',
            'X-GitHub-Api-Version': '2022-11-28'
        }
        
        # Download each matching file
        downloaded_files = []
        for file in matching_files:
            try:
                logger.info(f"Downloading {file['name']}...")
                file_response = requests.get(file['download_url'], headers=download_headers)
                file_response.raise_for_status()
                
                # Save file with original name in data/ directory
                output_path = f"data/{file['name']}"
                with open(output_path, 'w', encoding='utf-8') as f:
                    f.write(file_response.text)
                
                downloaded_files.append(file['name'])
                logger.info(f"  ✅ Saved {file['name']} ({len(file_response.text)} bytes)")
                
            except requests.exceptions.RequestException as e:
                logger.info(f"  ❌ Failed to download {file['name']}: {e}")
                continue
        
        if downloaded_files:
            logger.info(f"\n✅ Successfully downloaded {len(downloaded_files)} files:")
            for filename in downloaded_files:
                logger.info(f"   - data/{filename}")
        else:
            logger.error("❌ No files were successfully downloaded")
            sys.exit(1)
        
    except requests.exceptions.RequestException as e:
        logger.error(f"ERROR: Failed to fetch file list: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Response status: {e.response.status_code}")
            logger.error(f"Response body: {e.response.text[:500]}")
        sys.exit(1)

if __name__ == "__main__":
    fetch_csv_files_from_private_repo()