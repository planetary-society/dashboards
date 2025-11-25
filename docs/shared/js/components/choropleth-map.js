/**
 * Bubble Map Component
 * D3.js-based US map with bubbles at district centroids
 * Bubble size proportional to data values
 */

import { COLORS, MAP_CONFIG } from '../constants.js';
import { debounce } from '../utils.js';

export class ChoroplethMap {
    /**
     * Create a bubble map
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {string} options.colorScale - Color scale to use ('spending', 'cancellations', 'custom')
     * @param {string} options.level - Geographic level ('district', 'state')
     * @param {Object} options.customColors - Custom color configuration {zero, low, high}
     * @param {boolean} options.showLegend - Whether to show the legend
     * @param {boolean} options.interactive - Whether map is interactive
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            colorScale: options.colorScale || 'spending',
            level: options.level || 'district',
            customColors: options.customColors || null,
            interactive: options.interactive !== false,
            maxRadius: options.maxRadius || 20,
            minRadius: options.minRadius || 3
        };

        this.svg = null;
        this.projection = null;
        this.path = null;
        this.tooltip = null;
        this.geojsonData = null;
        this.dataMap = {};
        this.hoverInfo = {};
        this.maxValue = 1;
        this.minValue = 0;

        this.width = 0;
        this.height = 0;

        // Get color configuration
        this.colors = this.options.customColors ||
            COLORS.choropleth[this.options.colorScale] ||
            COLORS.choropleth.spending;
    }

    /**
     * Initialize the map with GeoJSON data
     * @param {string|Object} geojsonSource - URL or GeoJSON object
     */
    async init(geojsonSource) {
        if (!this.container) {
            console.error('Map container not found');
            return;
        }

        // Load GeoJSON if URL provided
        if (typeof geojsonSource === 'string') {
            try {
                const response = await fetch(geojsonSource);
                this.geojsonData = await response.json();
            } catch (error) {
                console.error('Failed to load GeoJSON:', error);
                this.showError('Failed to load map data');
                return;
            }
        } else {
            this.geojsonData = geojsonSource;
        }

        this.setupDimensions();
        this.createSvg();
        this.createTooltip();
        this.setupProjection();
        this.render();
        this.setupResizeHandler();
    }

    /**
     * Set up dimensions based on container size
     * Uses a fixed aspect ratio to prevent resize loops
     */
    setupDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 800;
        // Use a fixed aspect ratio (roughly matches US map proportions)
        this.height = Math.min(this.width * 0.6, 500);
    }

    /**
     * Create the SVG element
     */
    createSvg() {
        // Clear existing content
        this.container.innerHTML = '';

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('class', 'bubble-map-svg')
            .style('width', '100%')
            .style('height', 'auto')
            .style('display', 'block');

        // Create groups for layering (base map behind bubbles)
        this.baseGroup = this.svg.append('g')
            .attr('class', 'base-map');

        this.bubbleGroup = this.svg.append('g')
            .attr('class', 'bubbles');
    }

    /**
     * Create the tooltip element
     */
    createTooltip() {
        // Remove existing tooltip if present
        d3.select('.map-tooltip').remove();

        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'map-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('pointer-events', 'none');
    }

    /**
     * Set up the D3 projection
     */
    setupProjection() {
        // Use Albers USA projection for proper continental US + Alaska/Hawaii
        this.projection = d3.geoAlbersUsa()
            .fitSize([this.width, this.height], this.geojsonData);

        this.path = d3.geoPath().projection(this.projection);
    }

    /**
     * Set data for the map
     * @param {Object} dataMap - Map of GEOID to value
     * @param {Object} hoverInfo - Map of GEOID to hover HTML
     * @param {number} maxValue - Maximum value for scaling
     * @param {number} minValue - Minimum value for scaling
     */
    setData(dataMap, hoverInfo = {}, maxValue = null, minValue = 0) {
        this.dataMap = dataMap;
        this.hoverInfo = hoverInfo;
        this.minValue = minValue;

        // Calculate max value if not provided
        if (maxValue === null) {
            const values = Object.values(dataMap).filter(v => v > 0);
            this.maxValue = values.length > 0 ? Math.max(...values) : 1;
        } else {
            this.maxValue = maxValue;
        }

        this.render();
    }

    /**
     * Create radius scale for bubbles
     * Uses sqrt scale for perceptually accurate area representation
     */
    createRadiusScale() {
        return d3.scaleSqrt()
            .domain([0, this.maxValue])
            .range([this.options.minRadius, this.options.maxRadius]);
    }

    /**
     * Render the map with base layer and bubbles
     */
    render() {
        if (!this.geojsonData || !this.baseGroup) return;

        const self = this;

        // ===== 1. Draw base map (district/state outlines) =====
        this.baseGroup.selectAll('path.district')
            .data(this.geojsonData.features, d => d.properties.GEOID || d.id)
            .join('path')
            .attr('class', 'district')
            .attr('d', this.path)
            .attr('fill', this.colors.zero)
            .attr('stroke', MAP_CONFIG.districtBorderColor)
            .attr('stroke-width', MAP_CONFIG.districtBorderWidth)
            .attr('fill-opacity', 1);

        // ===== 2. Prepare bubble data =====
        const radiusScale = this.createRadiusScale();

        const bubbleData = this.geojsonData.features
            .map(feature => {
                const geoid = feature.properties.GEOID || feature.id;
                const value = this.dataMap[geoid] || 0;
                const centroid = this.path.centroid(feature);
                return { feature, geoid, value, centroid };
            })
            .filter(d => d.value > 0 && !isNaN(d.centroid[0]) && !isNaN(d.centroid[1]));

        // Sort by value descending so smaller bubbles render on top
        bubbleData.sort((a, b) => b.value - a.value);

        // ===== 3. Draw bubbles =====
        this.bubbleGroup.selectAll('circle.bubble')
            .data(bubbleData, d => d.geoid)
            .join('circle')
            .attr('class', 'bubble')
            .attr('cx', d => d.centroid[0])
            .attr('cy', d => d.centroid[1])
            .attr('r', d => radiusScale(d.value))
            .attr('fill', this.colors.high)
            .attr('fill-opacity', 0.6)
            .attr('stroke', this.colors.high)
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.8)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                if (self.options.interactive) {
                    self.handleMouseOver(event, d, this);
                }
            })
            .on('mousemove', function(event) {
                if (self.options.interactive) {
                    self.handleMouseMove(event);
                }
            })
            .on('mouseout', function(event, d) {
                if (self.options.interactive) {
                    self.handleMouseOut(event, d, this);
                }
            });
    }

    /**
     * Handle mouse over event on bubble
     */
    handleMouseOver(event, d, element) {
        const content = this.hoverInfo[d.geoid] || `Value: ${d.value}`;

        // Highlight the bubble
        d3.select(element)
            .attr('fill-opacity', 0.9)
            .attr('stroke-width', 2);

        // Show tooltip
        this.tooltip
            .html(content)
            .style('opacity', 1);
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(event) {
        this.tooltip
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }

    /**
     * Handle mouse out event
     */
    handleMouseOut(event, d, element) {
        // Reset bubble styling
        d3.select(element)
            .attr('fill-opacity', 0.6)
            .attr('stroke-width', 1);

        // Hide tooltip
        this.tooltip.style('opacity', 0);
    }

    /**
     * Set up resize handler
     */
    setupResizeHandler() {
        let lastWidth = this.width;

        const handleResize = debounce(() => {
            const rect = this.container.getBoundingClientRect();
            const newWidth = rect.width || 800;

            // Only update if width actually changed
            if (Math.abs(newWidth - lastWidth) > 5) {
                lastWidth = newWidth;
                this.setupDimensions();
                this.svg
                    .attr('viewBox', `0 0 ${this.width} ${this.height}`);
                this.setupProjection();
                this.render();
            }
        }, 250);

        // Use ResizeObserver for better performance
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(handleResize);
            resizeObserver.observe(this.container);
        } else {
            window.addEventListener('resize', handleResize);
        }
    }

    /**
     * Show an error message in the container
     * @param {string} message - Error message
     */
    showError(message) {
        this.container.innerHTML = `
            <div class="error-message">
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Destroy the map and clean up
     */
    destroy() {
        if (this.tooltip) {
            this.tooltip.remove();
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

/**
 * Create a district-level bubble map
 * @param {string} containerId - Container element ID
 * @param {string} geojsonUrl - URL to GeoJSON file
 * @param {string} colorScale - Color scale name
 * @returns {ChoroplethMap} Map instance
 */
export async function createDistrictMap(containerId, geojsonUrl, colorScale = 'spending') {
    const map = new ChoroplethMap(containerId, {
        colorScale,
        level: 'district'
    });
    await map.init(geojsonUrl);
    return map;
}

/**
 * Create a state-level bubble map
 * @param {string} containerId - Container element ID
 * @param {string} geojsonUrl - URL to GeoJSON file
 * @param {string} colorScale - Color scale name
 * @returns {ChoroplethMap} Map instance
 */
export async function createStateMap(containerId, geojsonUrl, colorScale = 'spending') {
    const map = new ChoroplethMap(containerId, {
        colorScale,
        level: 'state'
    });
    await map.init(geojsonUrl);
    return map;
}
