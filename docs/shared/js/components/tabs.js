/**
 * Tabs Component
 * Handles page-level and card-level tab navigation
 *
 * Accessibility model (WAI-ARIA APG "Tabs with Manual Activation")
 * ----------------------------------------------------------------
 * The container becomes a `tablist`, each button a `tab` carrying
 * `aria-selected`, and any content panel found via `data-tab` becomes a
 * `tabpanel` wired up with `aria-controls`/`aria-labelledby`.
 *
 * Keyboard: Left/Right move focus between tabs, Home/End jump to the first or
 * last, and focus wraps. Activation is MANUAL — arrowing only moves focus;
 * Enter or Space activates the focused tab, which buttons already do natively
 * by emitting a click. Manual activation is the right choice here because a tab
 * switch on these dashboards re-renders charts, maps and Grid.js tables, so
 * arrowing past a tab must not pay for rendering it.
 *
 * Roving tabindex: exactly one tab is in the page tab order at a time — the
 * selected tab normally, or the tab the user last arrowed to — so Tab moves out
 * of the tablist rather than through every tab in it.
 *
 * Every step is guarded on element existence: the "panel bar" style of usage,
 * where tabs drive a re-render and have no content panels at all, is supported
 * and simply skips the panel wiring.
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
        // Store bound handlers for proper cleanup
        this._clickHandlers = new Map();
        this._keydownHandler = null;
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

        // Apply tablist semantics before any activation runs
        this.setupAccessibility();

        // Set up click handlers with stored references for cleanup
        this.tabs.forEach(tab => {
            const handler = (e) => this.handleTabClick(e, tab);
            this._clickHandlers.set(tab, handler);
            tab.addEventListener('click', handler);
        });

        // One delegated keydown handler for roving focus
        if (this.tabs.length > 0) {
            this._keydownHandler = (e) => this.handleTabKeyDown(e);
            this.tabsContainer.addEventListener('keydown', this._keydownHandler);
        }

        // Activate first tab if none is active
        const activeTab = this.tabs.find(tab => tab.classList.contains(this.options.activeClass));
        if (!activeTab && this.tabs.length > 0) {
            this.activateTab(this.tabs[0].dataset.tab);
        } else if (activeTab) {
            this.currentTab = activeTab.dataset.tab;
            this.syncTabState();
        }
    }

    /**
     * Apply tablist/tab/tabpanel roles and relationships
     *
     * `role="tablist"` is valid on the elements these tabs actually use --
     * <div> (generic, no implicit role to conflict with) and <nav>, for which
     * ARIA in HTML explicitly permits tablist.
     */
    setupAccessibility() {
        if (!this.tabsContainer) return;

        this.tabsContainer.setAttribute('role', 'tablist');

        this.tabs.forEach(tab => {
            tab.setAttribute('role', 'tab');

            // Wire up the content panel where one exists. Panel-bar style
            // usages have none, and simply skip this.
            const targetId = tab.dataset.tab;
            const entry = targetId
                ? this.contents.find(({ id }) => id === targetId)
                : null;
            if (!entry) return;

            if (!tab.id) {
                tab.id = `${targetId}-tab`;
            }
            tab.setAttribute('aria-controls', targetId);
            entry.content.setAttribute('role', 'tabpanel');
            entry.content.setAttribute('aria-labelledby', tab.id);
        });
    }

    /**
     * Keep aria-selected and the roving tabindex in step with this.currentTab
     */
    syncTabState() {
        if (this.tabs.length === 0) return;

        let selectedIndex = this.tabs.findIndex(tab => tab.dataset.tab === this.currentTab);
        // A currentTab matching no button would otherwise leave every tab at
        // tabindex -1, making the tablist unreachable by keyboard.
        if (selectedIndex === -1) selectedIndex = 0;

        this.tabs.forEach((tab, i) => {
            const isSelected = tab.dataset.tab === this.currentTab;
            tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            tab.tabIndex = i === selectedIndex ? 0 : -1;
        });
    }

    /**
     * Handle arrow-key navigation within the tablist
     *
     * Focus only -- see the manual-activation note on the class.
     * @param {KeyboardEvent} e - Keydown event
     */
    handleTabKeyDown(e) {
        const currentIndex = this.tabs.indexOf(e.target);
        if (currentIndex === -1) return;

        const last = this.tabs.length - 1;
        let nextIndex;

        switch (e.key) {
            case 'ArrowRight':
                nextIndex = currentIndex === last ? 0 : currentIndex + 1;
                break;
            case 'ArrowLeft':
                nextIndex = currentIndex === 0 ? last : currentIndex - 1;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = last;
                break;
            default:
                return;
        }

        e.preventDefault();
        this.focusTab(nextIndex);
    }

    /**
     * Move focus to a tab by index, carrying the roving tabindex with it
     * @param {number} index - Index into this.tabs
     */
    focusTab(index) {
        const target = this.tabs[index];
        if (!target) return;

        this.tabs.forEach(tab => {
            tab.tabIndex = tab === target ? 0 : -1;
        });
        target.focus();
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

        // Find the tab button for this tabId
        const targetTab = this.tabs.find(tab => tab.dataset.tab === tabId);

        // Activate the target tab and content (if content exists)
        const targetEntry = this.contents.find(({ id }) => id === tabId);
        if (targetEntry) {
            targetEntry.tab.classList.add(this.options.activeClass);
            targetEntry.content.classList.add(this.options.activeClass);
        } else if (targetTab) {
            // Tab exists but no content panel - just activate the tab button
            targetTab.classList.add(this.options.activeClass);
        }

        this.currentTab = tabId;
        this.syncTabState();

        // Call callback if provided (regardless of whether content panel exists)
        if (this.options.onTabChange && (targetEntry || targetTab)) {
            this.options.onTabChange(tabId, previousTab);
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
            const handler = this._clickHandlers.get(tab);
            if (handler) {
                tab.removeEventListener('click', handler);
            }
        });
        this._clickHandlers.clear();

        if (this._keydownHandler && this.tabsContainer) {
            this.tabsContainer.removeEventListener('keydown', this._keydownHandler);
        }
        this._keydownHandler = null;

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
