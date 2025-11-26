/**
 * Choropleth/Bubble Map Component
 * D3.js-based US map supporting both filled choropleth and bubble visualization modes
 */

import { COLORS, MAP_CONFIG } from '../constants.js';
import { debounce } from '../utils.js';

// Module-level shared tooltip for all map instances
let sharedTooltip = null;

export class ChoroplethMap {
    /**
     * Create a choropleth or bubble map
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {string} options.colorScale - Color scale to use ('spending', 'cancellations', 'science', 'custom')
     * @param {string} options.level - Geographic level ('district', 'state')
     * @param {string} options.mapType - Map type: 'bubble' (default) or 'choropleth'
     * @param {Object} options.customColors - Custom color configuration {zero, low, high}
     * @param {boolean} options.showLegend - Whether to show the legend (default: true for choropleth)
     * @param {boolean} options.interactive - Whether map is interactive
     * @param {boolean} options.preProjected - Whether the data is pre-projected (skip projection)
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            colorScale: options.colorScale || 'spending',
            level: options.level || 'district',
            mapType: options.mapType || 'bubble',
            customColors: options.customColors || null,
            interactive: options.interactive !== false,
            showLegend: options.showLegend !== false,
            maxRadius: options.maxRadius || 20,
            minRadius: options.minRadius || 3,
            preProjected: options.preProjected || false
        };

        this.svg = null;
        this.projection = null;
        this.path = null;
        this.tooltip = null;
        this.legendContainer = null;
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

        // Get stepped color scale if available
        this.steppedScale = COLORS.choropleth[this.options.colorScale + 'Steps'] || null;
    }

    /**
     * Get stepped color for a value using the configured color scale
     * @param {number} value - The data value
     * @returns {string} Hex color code
     */
    getSteppedColor(value) {
        if (!value || value <= 0) {
            return this.colors.zero || '#f0f0f0';
        }

        if (!this.steppedScale) {
            // Fallback to simple low/high if no stepped scale defined
            return this.colors.high || '#037CC2';
        }

        for (const step of this.steppedScale) {
            if (value < step.threshold) {
                return step.color;
            }
        }
        return this.steppedScale[this.steppedScale.length - 1].color;
    }

    /**
     * Extract feature ID from a GeoJSON feature
     * @param {Object} d - GeoJSON feature
     * @returns {string} Feature ID
     */
    getFeatureId(d) {
        return d.properties?.GEOID || d.id;
    }

    /**
     * Initialize the map with GeoJSON or TopoJSON data
     * @param {string|Object} geojsonSource - URL or GeoJSON/TopoJSON object
     */
    async init(geojsonSource) {
        if (!this.container) {
            console.error('Map container not found');
            return;
        }

        // Load data if URL provided
        let rawData;
        if (typeof geojsonSource === 'string') {
            try {
                const response = await fetch(geojsonSource);
                rawData = await response.json();
            } catch (error) {
                console.error('Failed to load map data:', error);
                this.showError('Failed to load map data');
                return;
            }
        } else {
            rawData = geojsonSource;
        }

        // Handle TopoJSON format - convert to GeoJSON
        if (rawData.type === 'Topology') {
            const objectName = Object.keys(rawData.objects)[0];
            this.geojsonData = topojson.feature(rawData, rawData.objects[objectName]);
        } else {
            this.geojsonData = rawData;
        }

        this.setupDimensions();
        this.createSvg();
        this.createTooltip();
        this.setupProjection();
        this.render();
        this.setupResizeHandler();

        // Render legend for choropleth maps
        if (this.options.mapType === 'choropleth' && this.options.showLegend && this.steppedScale) {
            this.renderLegend();
        }
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
            .style('display', 'block')
            .style('background-color', '#fff');

        // Add explicit white background rect
        this.svg.append('rect')
            .attr('class', 'map-background')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('fill', '#ffffff')
            .attr('x', 0)
            .attr('y', 0);

        // Create groups for layering (base map behind bubbles)
        this.baseGroup = this.svg.append('g')
            .attr('class', 'base-map');

        this.bubbleGroup = this.svg.append('g')
            .attr('class', 'bubbles');
    }

    /**
     * Create or reuse the shared tooltip element
     */
    createTooltip() {
        // Reuse existing shared tooltip if it exists in the DOM
        if (sharedTooltip && document.body.contains(sharedTooltip.node())) {
            this.tooltip = sharedTooltip;
            return;
        }

        // Create new shared tooltip
        sharedTooltip = d3.select('body')
            .append('div')
            .attr('class', 'map-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('pointer-events', 'none');

        this.tooltip = sharedTooltip;
    }

    /**
     * Set up the D3 projection
     */
    setupProjection() {
        if (this.options.preProjected) {
            // Pre-projected data (like US Atlas TopoJSON) - use identity transform
            // Scale to fit the container
            const bounds = d3.geoPath().bounds(this.geojsonData);
            const dx = bounds[1][0] - bounds[0][0];
            const dy = bounds[1][1] - bounds[0][1];
            const scale = 0.95 / Math.max(dx / this.width, dy / this.height);
            const translate = [
                (this.width - scale * (bounds[0][0] + bounds[1][0])) / 2,
                (this.height - scale * (bounds[0][1] + bounds[1][1])) / 2
            ];

            this.projection = d3.geoIdentity()
                .scale(scale)
                .translate(translate);
            this.path = d3.geoPath().projection(this.projection);
        } else {
            // Use Albers USA projection for proper continental US + Alaska/Hawaii
            this.projection = d3.geoAlbersUsa()
                .fitSize([this.width, this.height], this.geojsonData);
            this.path = d3.geoPath().projection(this.projection);
        }
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
     * Render the map with base layer and optional bubbles or filled choropleth
     */
    render() {
        if (!this.geojsonData || !this.baseGroup) return;

        const self = this;

        if (this.options.mapType === 'choropleth') {
            // ===== CHOROPLETH MODE: Fill polygons with stepped colors =====
            this.baseGroup.selectAll('path.district')
                .data(this.geojsonData.features, d => this.getFeatureId(d))
                .join('path')
                .attr('class', 'district')
                .attr('d', this.path)
                .attr('fill', d => {
                    const geoid = this.getFeatureId(d);
                    const value = this.dataMap[geoid] || 0;
                    return this.getSteppedColor(value);
                })
                .attr('stroke', MAP_CONFIG.districtBorderColor)
                .attr('stroke-width', MAP_CONFIG.districtBorderWidth)
                .attr('fill-opacity', MAP_CONFIG.fillOpacity || 0.85)
                .style('cursor', d => {
                    const geoid = this.getFeatureId(d);
                    return this.hoverInfo[geoid] ? 'pointer' : 'default';
                })
                .on('mouseover', function(event, d) {
                    if (self.options.interactive) {
                        const geoid = self.getFeatureId(d);
                        if (self.hoverInfo[geoid]) {
                            self.handleChoroplethMouseOver(event, d, this);
                        }
                    }
                })
                .on('mousemove', function(event) {
                    if (self.options.interactive) {
                        self.handleMouseMove(event);
                    }
                })
                .on('mouseout', function(event, d) {
                    if (self.options.interactive) {
                        self.handleChoroplethMouseOut(event, d, this);
                    }
                });

            // Clear any bubbles in choropleth mode
            this.bubbleGroup.selectAll('circle.bubble').remove();

        } else {
            // ===== BUBBLE MODE: Base map + bubbles at centroids =====

            // Draw base map (district/state outlines)
            this.baseGroup.selectAll('path.district')
                .data(this.geojsonData.features, d => this.getFeatureId(d))
                .join('path')
                .attr('class', 'district')
                .attr('d', this.path)
                .attr('fill', this.colors.zero)
                .attr('stroke', MAP_CONFIG.districtBorderColor)
                .attr('stroke-width', MAP_CONFIG.districtBorderWidth)
                .attr('fill-opacity', 1);

            // Prepare bubble data
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

            // Draw bubbles
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
     * Handle mouse over event on choropleth polygon
     */
    handleChoroplethMouseOver(event, d, element) {
        const geoid = this.getFeatureId(d);
        const content = this.hoverInfo[geoid] || '';

        if (!content) return;

        // Highlight the polygon
        d3.select(element)
            .attr('stroke', '#333')
            .attr('stroke-width', 2);

        // Show tooltip
        this.tooltip
            .html(content)
            .style('opacity', 1);
    }

    /**
     * Handle mouse out event on choropleth polygon
     */
    handleChoroplethMouseOut(event, d, element) {
        // Reset polygon styling
        d3.select(element)
            .attr('stroke', MAP_CONFIG.districtBorderColor)
            .attr('stroke-width', MAP_CONFIG.districtBorderWidth);

        // Hide tooltip
        this.tooltip.style('opacity', 0);
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
     * Render the stepped color legend for choropleth maps
     */
    renderLegend() {
        if (!this.steppedScale || !this.container) return;

        // Remove existing legend
        const existingLegend = this.container.querySelector('.map-legend');
        if (existingLegend) {
            existingLegend.remove();
        }

        // Create legend container
        this.legendContainer = document.createElement('div');
        this.legendContainer.className = 'map-legend';

        const legendItems = this.steppedScale.map(step => `
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${step.color}"></span>
                <span class="legend-label">${step.label}</span>
            </div>
        `).join('');

        this.legendContainer.innerHTML = `
            <div class="legend-title">Average Annual Spending</div>
            <div class="legend-items">${legendItems}</div>
        `;

        this.container.appendChild(this.legendContainer);
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
        if (this.legendContainer) {
            this.legendContainer.remove();
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
