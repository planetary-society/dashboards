/**
 * Tabs Component
 * Handles page-level and card-level tab navigation
 */

export class TabNavigation {
    /**
     * Create a tab navigation controller
     * @param {string} tabsContainerId - ID of the tabs container
     * @param {Object} options - Configuration options
     * @param {string} options.tabClass - CSS class for tab buttons
     * @param {string} options.contentClass - CSS class for content panels
     * @param {string} options.activeClass - CSS class for active state
     * @param {Function} options.onTabChange - Callback when tab changes
     */
    constructor(tabsContainerId, options = {}) {
        this.tabsContainer = document.getElementById(tabsContainerId);
        this.options = {
            tabClass: options.tabClass || 'page-tab',
            contentClass: options.contentClass || 'tab-content',
            activeClass: options.activeClass || 'active',
            onTabChange: options.onTabChange || null
        };
        this.tabs = [];
        this.contents = [];
        this.currentTab = null;
    }

    /**
     * Initialize the tab navigation
     */
    init() {
        if (!this.tabsContainer) {
            console.error('Tabs container not found');
            return;
        }

        // Find all tab buttons and content panels
        this.tabs = Array.from(this.tabsContainer.querySelectorAll(`.${this.options.tabClass}`));

        // Content panels are identified by data-tab attribute on tabs
        this.tabs.forEach(tab => {
            const targetId = tab.dataset.tab;
            if (targetId) {
                const content = document.getElementById(targetId);
                if (content) {
                    this.contents.push({ tab, content, id: targetId });
                }
            }
        });

        // Set up click handlers
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.handleTabClick(e, tab));
        });

        // Activate first tab if none is active
        const activeTab = this.tabs.find(tab => tab.classList.contains(this.options.activeClass));
        if (!activeTab && this.tabs.length > 0) {
            this.activateTab(this.tabs[0].dataset.tab);
        } else if (activeTab) {
            this.currentTab = activeTab.dataset.tab;
        }
    }

    /**
     * Handle tab click event
     * @param {Event} e - Click event
     * @param {Element} tab - Tab element clicked
     */
    handleTabClick(e, tab) {
        e.preventDefault();
        const targetId = tab.dataset.tab;
        if (targetId && targetId !== this.currentTab) {
            this.activateTab(targetId);
        }
    }

    /**
     * Activate a specific tab
     * @param {string} tabId - ID of the tab to activate
     */
    activateTab(tabId) {
        const previousTab = this.currentTab;

        // Deactivate all tabs and content
        this.tabs.forEach(tab => tab.classList.remove(this.options.activeClass));
        this.contents.forEach(({ content }) => {
            content.classList.remove(this.options.activeClass);
        });

        // Activate the target tab and content
        const targetEntry = this.contents.find(({ id }) => id === tabId);
        if (targetEntry) {
            targetEntry.tab.classList.add(this.options.activeClass);
            targetEntry.content.classList.add(this.options.activeClass);
            this.currentTab = tabId;

            // Call callback if provided
            if (this.options.onTabChange) {
                this.options.onTabChange(tabId, previousTab);
            }
        }
    }

    /**
     * Get the currently active tab ID
     * @returns {string} Current tab ID
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * Destroy the tab navigation (remove event listeners)
     */
    destroy() {
        this.tabs.forEach(tab => {
            tab.removeEventListener('click', this.handleTabClick);
        });
        this.tabs = [];
        this.contents = [];
    }
}

/**
 * Card-level tabs (secondary navigation within cards)
 */
export class CardTabs extends TabNavigation {
    constructor(tabsContainerId, options = {}) {
        super(tabsContainerId, {
            tabClass: options.tabClass || 'card-tab',
            contentClass: options.contentClass || 'card-tab-content',
            activeClass: options.activeClass || 'active',
            onTabChange: options.onTabChange
        });
    }
}

/**
 * Create page-level tabs from configuration
 * @param {string} containerId - ID of the tabs container
 * @param {Array} tabConfigs - Array of tab configurations {id, label, active}
 * @returns {TabNavigation} Tab navigation instance
 */
export function createPageTabs(containerId, tabConfigs) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = tabConfigs.map(config => `
        <button class="page-tab ${config.active ? 'active' : ''}" data-tab="${config.id}">
            ${config.label}
        </button>
    `).join('');

    container.classList.add('page-tabs');

    const tabs = new TabNavigation(containerId);
    tabs.init();
    return tabs;
}

/**
 * Create card-level tabs from configuration
 * @param {string} containerId - ID of the tabs container
 * @param {Array} tabConfigs - Array of tab configurations {id, label, active}
 * @returns {CardTabs} Card tabs instance
 */
export function createCardTabs(containerId, tabConfigs) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = tabConfigs.map(config => `
        <button class="card-tab ${config.active ? 'active' : ''}" data-tab="${config.id}">
            ${config.label}
        </button>
    `).join('');

    container.classList.add('card-tabs');

    const tabs = new CardTabs(containerId);
    tabs.init();
    return tabs;
}
