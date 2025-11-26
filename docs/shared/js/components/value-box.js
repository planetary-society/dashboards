/**
 * Value Box Component
 * Displays summary statistics in styled boxes with accent borders
 * Updated with modern design patterns
 */

import { ICONS } from '../constants.js';

export class ValueBox {
    /**
     * Render value boxes into a container
     * @param {string} containerId - ID of the container element
     * @param {Array} boxes - Array of box configurations
     * @param {string} boxes[].title - Box title
     * @param {string|number} boxes[].value - Box value to display
     * @param {string} boxes[].icon - Bootstrap Icon name (optional)
     * @param {string} boxes[].type - Box type for accent color (contracts, value, recipients, districts)
     */
    static render(containerId, boxes) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Value box container not found:', containerId);
            return;
        }

        container.innerHTML = boxes.map((box, index) => ValueBox.createBox(box, index)).join('');
        container.classList.add('value-boxes-row');
    }

    /**
     * Create HTML for a single value box
     * @param {Object} box - Box configuration
     * @param {number} index - Index for animation delay
     * @returns {string} HTML string
     */
    static createBox(box, index = 0) {
        const iconHtml = box.icon ? `
            <div class="value-box-icon">
                <i class="bi bi-${box.icon}"></i>
            </div>
        ` : '';

        // Determine the accent class based on type
        const typeClass = box.type ? `value-box--${box.type}` : '';

        return `
            <div class="value-box ${typeClass}" data-index="${index}">
                ${iconHtml}
                <div class="value-box-content">
                    <div class="value-box-value">${box.value}</div>
                    <div class="value-box-title">${box.title}</div>
                </div>
            </div>
        `;
    }

    /**
     * Update a specific value box
     * @param {string} containerId - ID of the container element
     * @param {number} index - Index of the box to update
     * @param {string|number} value - New value
     */
    static updateValue(containerId, index, value) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const boxes = container.querySelectorAll('.value-box');
        if (boxes[index]) {
            const valueEl = boxes[index].querySelector('.value-box-value');
            if (valueEl) {
                valueEl.textContent = value;
            }
        }
    }

    /**
     * Animate value boxes appearing (CSS handles the stagger, this triggers visibility)
     * @param {string} containerId - ID of the container element
     */
    static animateIn(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // CSS handles the animation via fadeInUp keyframes
        // This method exists for backwards compatibility and future enhancements
        const boxes = container.querySelectorAll('.value-box');
        boxes.forEach((box) => {
            box.style.animationPlayState = 'running';
        });
    }

    /**
     * Animate a value counting up
     * @param {HTMLElement} element - Element containing the value
     * @param {number} start - Starting value
     * @param {number} end - Ending value
     * @param {number} duration - Animation duration in ms
     * @param {string} prefix - Prefix string (e.g., '$')
     * @param {string} suffix - Suffix string (e.g., 'M')
     */
    static animateValue(element, start, end, duration = 1000, prefix = '', suffix = '') {
        const range = end - start;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (range * easeOut));
            element.textContent = prefix + current.toLocaleString() + suffix;
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }
}

/**
 * Create common value box configurations for cancellations dashboard
 * @param {Object} stats - Statistics object
 * @param {number} stats.totalContracts - Total number of contracts
 * @param {string} stats.totalObligations - Formatted total obligations
 * @param {number} stats.uniqueRecipients - Number of unique recipients
 * @param {number} stats.uniqueDistricts - Number of unique districts
 * @returns {Array} Array of value box configurations
 */
export function createCancellationsValueBoxes(stats) {
    return [
        {
            title: 'Awards terminated since Jan 2025',
            value: stats.totalContracts.toLocaleString(),
            icon: ICONS.contracts,
            type: 'contracts'
        },
        {
            title: 'Value of terminated awards',
            value: stats.totalObligations,
            icon: ICONS.value,
            type: 'value'
        },
        {
            title: 'Organizations Affected',
            value: stats.uniqueRecipients.toLocaleString(),
            icon: ICONS.recipients,
            type: 'recipients'
        },
        {
            title: 'Congressional Districts Affected',
            value: stats.uniqueDistricts.toLocaleString(),
            icon: ICONS.districts,
            type: 'districts'
        }
    ];
}

/**
 * Create common value box configurations for spending dashboard
 * @param {Object} stats - Statistics object
 * @param {number} stats.percentDistricts - Percentage of districts with spending
 * @param {number} stats.districtCount - Number of districts
 * @param {string} stats.totalSpending - Formatted total spending
 * @param {number} stats.stateCount - Number of states
 * @returns {Array} Array of value box configurations
 */
export function createSpendingValueBoxes(stats) {
    return [
        {
            title: 'Districts with Spending',
            value: `${stats.percentDistricts}% (${stats.districtCount})`,
            icon: ICONS.districts,
            type: 'districts'
        },
        {
            title: 'States with Spending',
            value: `${stats.stateCount} of 50`,
            icon: 'map',
            type: 'recipients'
        },
        {
            title: 'Total Obligations',
            value: stats.totalSpending,
            icon: ICONS.value,
            type: 'value'
        }
    ];
}

/**
 * Create value box configurations for NASA Science dashboard
 * @param {Object} stats - Statistics object
 * @param {string} stats.totalSpending - Formatted total spending amount
 * @param {number} stats.districtsReached - Number of congressional districts with spending
 * @param {number} stats.statesCount - Number of states with spending
 * @param {string} stats.recentFYSpending - Formatted spending for most recent fiscal year
 * @param {number} stats.recentFY - Most recent fiscal year
 * @returns {Array} Array of value box configurations
 */
export function createScienceValueBoxes(stats) {
    return [
        {
            title: `Spent in FY ${stats.recentFY}`,
            value: stats.recentFYSpending,
            icon: 'cash-stack',
            type: 'value'
        },
        {
            title: 'Congressional Districts Reached',
            value: stats.districtsReached.toLocaleString(),
            icon: 'geo-alt',
            type: 'districts'
        },
        {
            title: 'Share of All Districts',
            value: `${stats.percentDistricts}%`,
            icon: 'pie-chart',
            type: 'contracts'
        },
        {
            title: 'States with NASA Science',
            value: `${stats.statesCount} of 50`,
            icon: 'flag',
            type: 'recipients'
        }
    ];
}
