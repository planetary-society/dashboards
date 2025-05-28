# .github/scripts/fetch_data.py
import os
import requests
import sys
import fnmatch
import argparse
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def fetch_files_from_repo(get_type):
    """Fetch files from the repo based on the get_type argument."""
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

    if get_type == "summaries":
        directory = "reports"
        patterns = ['*summary.csv']
        output_dir = "data"
    elif get_type == "html":
        directory = "html"
        patterns = ['*.html', '*.css', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.webp']
        output_dir = "docs/nasa-spending"
    else:
        logger.error("ERROR: Invalid --get argument. Use 'summaries' or 'html'.")
        sys.exit(1)

    try:
        # List files in the target directory
        url = f"https://api.github.com/repos/{repo}/contents/{directory}"
        logger.info(f"Listing files in {repo}/{directory}/")

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        files = response.json()

        # Find all files matching the patterns
        matching_files = []
        for file in files:
            if file['type'] == 'file' and any(fnmatch.fnmatch(file['name'], pat) for pat in patterns):
                matching_files.append(file)

        if not matching_files:
            logger.error(f"ERROR: No files matching {patterns} found in {directory}/ directory")
            logger.error("Available files:")
            for file in files:
                if file['type'] == 'file':
                    logger.error(f"  - {file['name']}")
            sys.exit(1)

        logger.info(f"Found {len(matching_files)} matching files to download:")
        for file in matching_files:
            logger.info(f"  - {file['name']}")

        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

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

                output_path = os.path.join(output_dir, file['name'])
                # Use binary mode for images, text mode for others
                if any(file['name'].lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']):
                    with open(output_path, 'wb') as f:
                        f.write(file_response.content)
                else:
                    with open(output_path, 'w', encoding='utf-8') as f:
                        f.write(file_response.text)

                downloaded_files.append(file['name'])
                logger.info(f"  ✅ Saved {file['name']} ({len(file_response.content)} bytes)")

            except requests.exceptions.RequestException as e:
                logger.info(f"  ❌ Failed to download {file['name']}: {e}")
                continue

        if downloaded_files:
            logger.info(f"\n✅ Successfully downloaded {len(downloaded_files)} files:")
            for filename in downloaded_files:
                logger.info(f"   - {output_dir}/{filename}")
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
    parser = argparse.ArgumentParser(description="Fetch files from a private GitHub repo.")
    parser.add_argument('--get', choices=['summaries', 'html'], required=True, help="What to fetch: 'summaries' or 'html'")
    args = parser.parse_args()
    fetch_files_from_repo(args.get)