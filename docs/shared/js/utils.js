/**
 * Shared Utility Functions
 * CSV parsing, formatting, GEOID conversion, and other helpers
 */

import { STATE_FIPS_MAP } from './constants.js';

/**
 * Parse CSV text into an array of objects
 * Handles quoted fields containing commas
 * @param {string} csvText - Raw CSV text
 * @returns {Array<Object>} Array of row objects with header keys
 */
export function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        const row = {};

        headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim() || '';
        });

        rows.push(row);
    }

    return rows;
}

/**
 * Parse a single CSV line, handling quoted fields
 * @param {string} line - CSV line
 * @returns {Array<string>} Array of field values
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

/**
 * Format a number as currency
 * @param {number|string} value - Value to format
 * @param {boolean} abbreviated - Use abbreviated form ($1.2M) vs full ($1,234,567)
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, abbreviated = true, decimals = 1) {
    const num = typeof value === 'string' ? parseCurrency(value) : value;

    if (num === null || isNaN(num) || num < 0) {
        return 'N/A';
    }

    if (num === 0) {
        return '$0';
    }

    if (abbreviated) {
        if (num >= 1_000_000_000) {
            return `$${(num / 1_000_000_000).toFixed(decimals)}B`;
        }
        if (num >= 1_000_000) {
            return `$${(num / 1_000_000).toFixed(decimals)}M`;
        }
        if (num >= 1_000) {
            return `$${(num / 1_000).toFixed(decimals)}K`;
        }
        return `$${num.toFixed(0)}`;
    }

    // Full format with commas
    return '$' + num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

/**
 * Parse a currency string to a number
 * Handles formats like "$1,234,567" or "1234567"
 * @param {string|number} value - Currency string or number
 * @returns {number|null} Numeric value or null if invalid
 */
export function parseCurrency(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    // If already a number, return it
    if (typeof value === 'number') {
        return isNaN(value) ? null : value;
    }

    const cleaned = String(value).replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);

    return isNaN(num) ? null : num;
}

/**
 * Truncate text to specified length, ending on word boundary
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum character length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncateText(text, maxLength = 200) {
    if (!text || text.length <= maxLength) return text || '';

    // Find the last space within the limit
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    // If no space found, just cut at maxLength
    const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
    return text.substring(0, cutPoint) + '...';
}

/**
 * Format a date string consistently
 * @param {string} dateStr - Date string in various formats
 * @param {string} format - Output format ('long', 'short', 'iso')
 * @returns {string} Formatted date string
 */
export function formatDate(dateStr, format = 'long') {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    switch (format) {
        case 'long':
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        case 'short':
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        case 'iso':
            return date.toISOString().split('T')[0];
        default:
            return date.toLocaleDateString('en-US');
    }
}

/**
 * Convert district string to GEOID format
 * @param {string} districtStr - District in format 'XX-YY' (e.g., 'CA-37')
 * @returns {string|null} 4-digit GEOID (e.g., '0637') or null if invalid
 */
export function getGeoidFromDistrict(districtStr) {
    if (!districtStr || typeof districtStr !== 'string' || !districtStr.includes('-')) {
        return null;
    }

    const parts = districtStr.split('-');
    if (parts.length !== 2) return null;

    const stateAbbr = parts[0].toUpperCase();
    const districtNum = parts[1].toUpperCase();

    const stateFips = STATE_FIPS_MAP[stateAbbr];
    if (!stateFips) return null;

    // Handle special district codes
    if (districtNum === 'ZZ' || districtNum === '00') {
        return `${stateFips}${districtNum}`;
    }

    // Pad district number to 2 digits
    const parsed = parseInt(districtNum, 10);
    if (isNaN(parsed)) return null;

    return `${stateFips}${parsed.toString().padStart(2, '0')}`;
}

/**
 * Convert state abbreviation to FIPS code
 * @param {string} stateAbbr - Two-letter state abbreviation
 * @returns {string|null} 2-digit FIPS code or null if invalid
 */
export function getStateFips(stateAbbr) {
    if (!stateAbbr || typeof stateAbbr !== 'string') return null;
    return STATE_FIPS_MAP[stateAbbr.toUpperCase()] || null;
}

/**
 * Get district display name from GEOID
 * @param {string} geoid - 4-digit GEOID
 * @param {Object} fipsToState - FIPS to state abbreviation mapping
 * @returns {string} Display name like 'CA-37'
 */
export function getDistrictFromGeoid(geoid, fipsToState) {
    if (!geoid || geoid.length < 4) return geoid;

    const stateFips = geoid.substring(0, 2);
    const districtNum = geoid.substring(2);
    const stateAbbr = fipsToState[stateFips];

    if (!stateAbbr) return geoid;
    return `${stateAbbr}-${districtNum}`;
}

/**
 * Group array of objects by a key
 * @param {Array<Object>} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Object with keys as group values
 */
export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const groupKey = item[key];
        if (!result[groupKey]) {
            result[groupKey] = [];
        }
        result[groupKey].push(item);
        return result;
    }, {});
}

/**
 * Sum values in an array by a key
 * @param {Array<Object>} array - Array of objects
 * @param {string} key - Key to sum
 * @returns {number} Sum of values
 */
export function sumBy(array, key) {
    return array.reduce((sum, item) => {
        const value = typeof item[key] === 'number' ? item[key] : parseCurrency(item[key]);
        return sum + (value || 0);
    }, 0);
}

/**
 * Count unique values in an array by a key
 * @param {Array<Object>} array - Array of objects
 * @param {string} key - Key to count unique values
 * @returns {number} Count of unique values
 */
export function countUnique(array, key) {
    return new Set(array.map(item => item[key])).size;
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit time in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Check if viewport is mobile
 * @returns {boolean} True if viewport width is less than 768px
 */
export function isMobile() {
    return window.innerWidth < 768;
}

/**
 * Check if viewport is tablet
 * @returns {boolean} True if viewport width is between 768px and 1024px
 */
export function isTablet() {
    return window.innerWidth >= 768 && window.innerWidth < 1024;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Create an HTML element from a string
 * @param {string} html - HTML string
 * @returns {Element} DOM element
 */
export function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
}

/**
 * Fetch JSON with error handling
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch text with error handling
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} Text response
 */
export async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text();
}
