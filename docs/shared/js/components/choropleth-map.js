/**
 * Choropleth/Bubble Map Component
 * D3.js-based US map supporting both filled choropleth and bubble visualization modes
 */

import { COLORS, MAP_CONFIG, STATE_FIPS_MAP, FIPS_STATE_MAP } from '../constants.js';
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
            preProjected: options.preProjected || false,
            showStateBoundaries: options.showStateBoundaries || false
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

        // Zoom-related properties
        this.zoom = null;
        this.currentZoomState = null;
        this.districtLabelsGroup = null;
        this.stateOutlineGroup = null; // Group for state boundary outline when zoomed
        this.stateBoundaryGroup = null; // Group for permanent state boundaries
        this.onDistrictClick = null; // Callback for bidirectional selection
        this.onStateClick = null; // Callback for state click (zoom to state)

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
     * Set callback for state click (triggers zoom to state)
     * @param {Function} callback - Function to call with stateAbbr
     */
    setStateClickHandler(callback) {
        this.onStateClick = callback;
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
        this.setupZoom();
        this.render();
        this.setupResizeHandler();

        // Render legend for choropleth maps
        if (this.options.mapType === 'choropleth' && this.options.showLegend && this.steppedScale) {
            this.renderLegend();
        }

        // Load and render state boundaries if enabled
        if (this.options.showStateBoundaries) {
            await this.loadAndRenderStateBoundaries();
        }
    }

    /**
     * Load state boundaries GeoJSON and render them
     */
    async loadAndRenderStateBoundaries() {
        try {
            // Determine the base path from the current page
            const basePath = window.location.pathname.includes('/nasa-science/')
                ? '../data/us_states.geojson'
                : './data/us_states.geojson';

            const response = await fetch(basePath);
            const stateGeoJSON = await response.json();
            this.renderStateBoundaries(stateGeoJSON);
        } catch (error) {
            console.warn('Failed to load state boundaries:', error);
        }
    }

    /**
     * Render state boundary outlines
     * @param {Object} stateGeoJSON - GeoJSON FeatureCollection of state boundaries
     */
    renderStateBoundaries(stateGeoJSON) {
        if (!this.stateBoundaryGroup || !stateGeoJSON) return;

        const self = this;

        this.stateBoundaryGroup.selectAll('path')
            .data(stateGeoJSON.features)
            .join('path')
            .attr('d', this.path)
            .attr('fill', 'none')
            .attr('stroke', MAP_CONFIG.stateBorderColor)
            .attr('stroke-width', MAP_CONFIG.stateBorderWidth)
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none'); // Don't capture mouse events
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

        // Create groups for layering (base map behind bubbles, state boundaries on top)
        this.baseGroup = this.svg.append('g')
            .attr('class', 'base-map');

        this.bubbleGroup = this.svg.append('g')
            .attr('class', 'bubbles');

        // State boundary layer (rendered on top of districts)
        this.stateBoundaryGroup = this.svg.append('g')
            .attr('class', 'state-boundaries');
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
                .style('cursor', 'pointer')
                .on('mouseover', function(event, d) {
                    if (self.options.interactive) {
                        self.handleChoroplethMouseOver(event, d, this);
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
                })
                .on('click', function(event, d) {
                    if (!self.options.interactive) return;

                    // Get state from feature for state click handler
                    const stateFips = d.properties?.STATEFP;
                    const stateAbbr = FIPS_STATE_MAP[stateFips];

                    // If we have a state click handler and we're at national view, trigger state zoom
                    if (self.onStateClick && stateAbbr && !self.currentZoomState) {
                        self.onStateClick(stateAbbr);
                    }
                    // If we're already zoomed to a state, trigger district click
                    else if (self.onDistrictClick) {
                        const districtCode = self.getDistrictCode(d);
                        if (districtCode) {
                            self.onDistrictClick(districtCode);
                        }
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

        // Get current zoom scale to adjust stroke width
        const transform = this.svg ? d3.zoomTransform(this.svg.node()) : { k: 1 };
        const hoverStrokeWidth = 0.75 / transform.k;

        // Highlight the polygon
        d3.select(element)
            .attr('stroke', '#333')
            .attr('stroke-width', hoverStrokeWidth);

        // Show tooltip
        this.tooltip
            .html(content)
            .style('opacity', 1);
    }

    /**
     * Handle mouse out event on choropleth polygon
     */
    handleChoroplethMouseOut(event, d, element) {
        // Get current zoom scale to adjust stroke width
        const transform = this.svg ? d3.zoomTransform(this.svg.node()) : { k: 1 };
        const baseStrokeWidth = MAP_CONFIG.districtBorderWidth / transform.k;

        // Reset polygon styling
        d3.select(element)
            .attr('stroke', MAP_CONFIG.districtBorderColor)
            .attr('stroke-width', baseStrokeWidth);

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
     * Set up D3 zoom behavior
     */
    setupZoom() {
        const self = this;

        this.zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on('zoom', (event) => {
                const { transform } = event;
                self.baseGroup.attr('transform', transform);
                self.bubbleGroup.attr('transform', transform);
                if (self.stateBoundaryGroup) {
                    self.stateBoundaryGroup.attr('transform', transform);
                }
                if (self.districtLabelsGroup) {
                    self.districtLabelsGroup.attr('transform', transform);
                }
                // Keep stroke widths constant during zoom
                self.baseGroup.selectAll('path.district')
                    .attr('stroke-width', MAP_CONFIG.districtBorderWidth / transform.k);
                // State boundaries
                if (self.stateBoundaryGroup) {
                    self.stateBoundaryGroup.selectAll('path')
                        .attr('stroke-width', MAP_CONFIG.stateBorderWidth / transform.k);
                }
                // State outline when zoomed (inside baseGroup)
                self.baseGroup.selectAll('.state-outline path')
                    .attr('stroke-width', 2 / transform.k);
            });

        this.svg.call(this.zoom);
    }

    /**
     * Zoom to a specific state showing its congressional districts
     * @param {string} stateAbbr - Two-letter state abbreviation (e.g., 'CA')
     * @param {number} duration - Animation duration in ms (default: 750)
     */
    zoomToState(stateAbbr, duration = 750) {
        const stateFips = STATE_FIPS_MAP[stateAbbr];
        if (!stateFips || !this.geojsonData || !this.zoom) return;

        // Filter features for this state
        const stateFeatures = this.geojsonData.features.filter(
            f => f.properties.STATEFP === stateFips
        );

        if (stateFeatures.length === 0) return;

        this.currentZoomState = stateAbbr;

        // Calculate bounding box of state's districts
        const stateGeoJSON = { type: 'FeatureCollection', features: stateFeatures };
        const [[x0, y0], [x1, y1]] = this.path.bounds(stateGeoJSON);

        // Calculate zoom transform
        const padding = 0.9; // 10% padding
        const scale = Math.min(
            8, // Max zoom from scaleExtent
            padding / Math.max((x1 - x0) / this.width, (y1 - y0) / this.height)
        );

        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(scale)
            .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);

        // Animate the zoom
        this.svg.transition()
            .duration(duration)
            .call(this.zoom.transform, transform);

        // Render state outline after a short delay to let zoom start
        setTimeout(() => {
            this.renderStateOutline(stateFeatures);
        }, 100);
    }

    /**
     * Render an outline around the state boundary
     * @param {Array} features - GeoJSON features for the state's districts
     */
    renderStateOutline(features) {
        // Skip outline for Alaska and Hawaii - geoAlbersUsa inset projection causes offset issues
        // These are single at-large districts, so the filled shape is sufficient
        if (features.length > 0) {
            const stateFips = features[0].properties.STATEFP;
            if (stateFips === '02' || stateFips === '15') {
                // Remove any existing outline and return early
                if (this.stateOutlineGroup) {
                    this.stateOutlineGroup.remove();
                    this.stateOutlineGroup = null;
                }
                return;
            }
        }

        // Remove existing outline
        if (this.stateOutlineGroup) {
            this.stateOutlineGroup.remove();
        }

        // Create outline group inside baseGroup so it inherits the same transform
        this.stateOutlineGroup = this.baseGroup.insert('g', ':first-child')
            .attr('class', 'state-outline');

        // Get current zoom scale for stroke width
        const currentTransform = d3.zoomTransform(this.svg.node());

        // Draw all district paths as outline (overlapping internal edges form state boundary)
        this.stateOutlineGroup.selectAll('path')
            .data(features)
            .join('path')
            .attr('d', this.path)
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 2 / currentTransform.k) // Scale-adjusted
            .attr('stroke-linejoin', 'round')
            .attr('pointer-events', 'none')
            .attr('opacity', 0)
            .transition()
            .duration(300)
            .attr('opacity', 0.8);
    }

    /**
     * Render numerical labels on each district
     * @param {Array} features - GeoJSON features to label
     */
    renderDistrictLabels(features) {
        // Remove existing labels
        if (this.districtLabelsGroup) {
            this.districtLabelsGroup.remove();
        }

        // Create labels group - add to SVG directly so it transforms with zoom
        this.districtLabelsGroup = this.svg.append('g')
            .attr('class', 'district-labels');

        // Apply current transform if zoomed
        const currentTransform = d3.zoomTransform(this.svg.node());
        this.districtLabelsGroup.attr('transform', currentTransform);

        // Calculate appropriate font size based on district count
        const fontSize = this.calculateLabelFontSize(features.length);

        const self = this;

        this.districtLabelsGroup.selectAll('text')
            .data(features)
            .join('text')
            .attr('class', 'district-label')
            .attr('x', d => this.path.centroid(d)[0])
            .attr('y', d => this.path.centroid(d)[1])
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', fontSize)
            .attr('font-weight', 500)
            .attr('fill', d => this.getLabelColor(d))
            .attr('pointer-events', 'none')
            .attr('opacity', 0)
            .text(d => {
                const districtNum = d.properties.CD118FP || d.properties.CDTYP || '00';
                return districtNum === '00' ? 'AL' : parseInt(districtNum, 10);
            })
            .transition()
            .duration(300)
            .attr('opacity', 1);
    }

    /**
     * Calculate appropriate font size based on number of districts
     * @param {number} districtCount - Number of districts
     * @returns {string} Font size with unit
     */
    calculateLabelFontSize(districtCount) {
        if (districtCount <= 3) return '16px';
        if (districtCount <= 10) return '14px';
        if (districtCount <= 20) return '12px';
        if (districtCount <= 40) return '10px';
        return '9px'; // Large states like CA with 52 districts
    }

    /**
     * Get contrasting label color based on fill color
     * @param {Object} feature - GeoJSON feature
     * @returns {string} Color for label text
     */
    getLabelColor(feature) {
        const geoid = this.getFeatureId(feature);
        const value = this.dataMap[geoid] || 0;
        const fillColor = this.getSteppedColor(value);

        // Simple luminance check - light fills get dark labels, dark fills get white labels
        const hex = fillColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        return luminance > 0.5 ? '#333' : '#fff';
    }

    /**
     * Highlight a specific district
     * @param {string} districtCode - District code (e.g., 'CA-37')
     */
    highlightDistrict(districtCode) {
        if (!districtCode) return;

        // Parse district code to get GEOID
        const parts = districtCode.split('-');
        if (parts.length !== 2) return;

        const stateAbbr = parts[0];
        const districtNum = parts[1].padStart(2, '0');
        const stateFips = STATE_FIPS_MAP[stateAbbr];
        if (!stateFips) return;

        const geoid = stateFips + districtNum;

        // Reset all districts
        this.baseGroup.selectAll('path.district')
            .classed('highlighted', false)
            .attr('stroke', MAP_CONFIG.districtBorderColor);

        // Find and highlight the selected district
        this.baseGroup.selectAll('path.district')
            .filter(d => this.getFeatureId(d) === geoid)
            .raise() // Bring to front
            .classed('highlighted', true)
            .attr('stroke', '#000');
    }

    /**
     * Clear district highlight
     */
    clearHighlight() {
        this.baseGroup.selectAll('path.district')
            .classed('highlighted', false)
            .attr('stroke', MAP_CONFIG.districtBorderColor);
    }

    /**
     * Reset zoom to national view
     * @param {number} duration - Animation duration in ms (default: 750)
     */
    resetZoom(duration = 750) {
        if (!this.zoom) return;

        this.currentZoomState = null;

        // Remove district labels
        if (this.districtLabelsGroup) {
            this.districtLabelsGroup
                .transition()
                .duration(duration / 2)
                .attr('opacity', 0)
                .remove();
            this.districtLabelsGroup = null;
        }

        // Remove state outline
        if (this.stateOutlineGroup) {
            this.stateOutlineGroup
                .transition()
                .duration(duration / 2)
                .attr('opacity', 0)
                .remove();
            this.stateOutlineGroup = null;
        }

        // Clear any highlight
        this.clearHighlight();

        // Reset zoom transform
        this.svg.transition()
            .duration(duration)
            .call(this.zoom.transform, d3.zoomIdentity);
    }

    /**
     * Set callback for district clicks (for bidirectional selection)
     * @param {Function} callback - Function to call with district code when clicked
     */
    setDistrictClickHandler(callback) {
        this.onDistrictClick = callback;
    }

    /**
     * Get state abbreviation from a district GEOID
     * @param {string} geoid - District GEOID (e.g., '0637')
     * @returns {string} State abbreviation (e.g., 'CA')
     */
    getStateFromGeoid(geoid) {
        const stateFips = geoid.substring(0, 2);
        return FIPS_STATE_MAP[stateFips] || null;
    }

    /**
     * Get district code from a feature
     * @param {Object} feature - GeoJSON feature
     * @returns {string} District code (e.g., 'CA-37')
     */
    getDistrictCode(feature) {
        const geoid = this.getFeatureId(feature);
        if (!geoid) return null;

        const stateFips = geoid.substring(0, 2);
        const districtNum = geoid.substring(2);
        const stateAbbr = FIPS_STATE_MAP[stateFips];

        if (!stateAbbr) return null;
        return `${stateAbbr}-${districtNum}`;
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
