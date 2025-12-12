/**
 * Shared Constants
 * State FIPS mapping, color scales, and configuration
 */

// US State abbreviations to FIPS code mapping
// Source: https://www.census.gov/library/reference/code-lists/ansi.html
export const STATE_FIPS_MAP = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08',
    'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12', 'GA': '13', 'HI': '15',
    'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21',
    'LA': '22', 'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27',
    'MS': '28', 'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
    'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
    'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46',
    'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53',
    'WV': '54', 'WI': '55', 'WY': '56', 'AS': '60', 'GU': '66', 'MP': '69',
    'PR': '72', 'VI': '78'
};

// Reverse mapping: FIPS code to state abbreviation
export const FIPS_STATE_MAP = Object.fromEntries(
    Object.entries(STATE_FIPS_MAP).map(([abbr, fips]) => [fips, abbr])
);

// Color palette - The Planetary Society branding
export const COLORS = {
    // Brand colors
    primary: '#037CC2',
    secondary: '#643788',
    accent: '#FF5D47',
    lightBlue: '#80BDE0',
    lightPurple: '#B19BC3',
    gray: '#414141',

    // UI colors
    background: '#F5F5F5',
    surface: '#FFFFFF',
    border: '#dee2e6',
    valueBox: '#bf4105',

    // Choropleth color scales
    choropleth: {
        spending: {
            zero: '#FFFFFF',
            low: '#ACCCDE',
            high: '#037CC2'
        },
        cancellations: {
            zero: '#FFFFFF',    // White for districts
            low: '#FF5D47',     // TPS orange
            high: '#FF5D47'     // TPS orange for bubbles
        },
        // NASA Science spending - blue scale (TPS primary)
        science: {
            zero: '#f0f0f0',
            scale: ['#e3f2fd', '#90caf9', '#42a5f5', '#1e88e5', '#1565c0']
        },
        // Missions count - orange/amber scale
        missions: {
            zero: '#f0f0f0',
            scale: ['#fff3e0', '#ffcc80', '#ffa726', '#fb8c00', '#ef6c00']
        },
        // Stepped scale for spending (from ColorBrewer, colorblind-safe)
        spendingSteps: [
            { threshold: 500000, color: '#fdfde6', label: '< $500K' },
            { threshold: 5000000, color: '#d6ebca', label: '$500K to $5M' },
            { threshold: 50000000, color: '#7fcdbb', label: '$5M to $50M' },
            { threshold: 250000000, color: '#41b6c4', label: '$50M to $250M' },
            { threshold: 1000000000, color: '#2c7fb8', label: '$250M to $1B' },
            { threshold: Infinity, color: '#253494', label: '$1B+' }
        ],
        // NASA Science stepped scale (colorblind-safe blue scale)
        scienceSteps: [
            { threshold: 500000, color: '#f7fbff', label: '< $500K' },
            { threshold: 5000000, color: '#deebf7', label: '$500K to $5M' },
            { threshold: 50000000, color: '#9ecae1', label: '$5M to $50M' },
            { threshold: 250000000, color: '#4292c6', label: '$50M to $250M' },
            { threshold: 1000000000, color: '#2171b5', label: '$250M to $1B' },
            { threshold: Infinity, color: '#084594', label: '$1B+' }
        ]
    }
};

// Map configuration
export const MAP_CONFIG = {
    // Continental US bounds
    bounds: {
        southwest: [23.7, -122.5],
        northeast: [46.7, -68.79]
    },
    // Default center (roughly center of continental US)
    center: [39.8283, -98.5795],
    // Styling - district borders (soft/subtle)
    districtBorderColor: '#888',
    districtBorderWidth: 0.5,
    fillOpacity: 0.85,
    // Styling - state boundaries (stronger)
    stateBorderColor: '#555',
    stateBorderWidth: 1,
    // Default zoom levels
    defaultZoom: 4,
    minZoom: 3,
    maxZoom: 8
};

// Data URLs - relative to dashboard location
export const DATA_URLS = {
    districts: '../data/us_congressional_districts.geojson',
    states: '../data/gz_2010_us_040_00_5m.json',
    cancellations: '../data/cancellations/nasa_cancelled_contracts_latest.csv',
    // NASA Science spending data
    scienceDistrict: '../data/science/NASA-district-Science-summary.csv',
    scienceState: '../data/science/NASA-state-Science-summary.csv',
    // External download links
    downloadCSV: 'https://docs.google.com/spreadsheets/d/1I3qXx1XDLKukqAd9U6zVp7S861XUAKZaAp0vrmsDJpg/export?format=csv',
    downloadXLSX: 'https://docs.google.com/spreadsheets/d/1I3qXx1XDLKukqAd9U6zVp7S861XUAKZaAp0vrmsDJpg/export?format=xlsx'
};

// Contact information
export const CONTACT = {
    email: 'casey.dreier@planetary.org',
    organization: 'The Planetary Society',
    website: 'https://planetary.org'
};

// Responsive breakpoints (match CSS)
export const BREAKPOINTS = {
    sm: 480,
    md: 768,
    lg: 1024,
    xl: 1280
};

// Icon names (Bootstrap Icons)
export const ICONS = {
    contracts: 'files',
    value: 'chevron-double-down',
    recipients: 'building-down',
    districts: 'bank',
    download: 'download',
    external: 'box-arrow-up-right',
    email: 'envelope'
};
