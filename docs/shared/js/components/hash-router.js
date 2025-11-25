/**
 * Hash Router Component
 * Simple hash-based routing for single-page navigation
 *
 * Enables deep-linking to specific pages via URL hashes (e.g., /page/#about)
 * and supports browser back/forward navigation.
 */
export class HashRouter {
    /**
     * Create a hash router
     * @param {Object} options - Configuration options
     * @param {string} options.defaultRoute - Route to use when hash is empty
     * @param {Function} options.onRouteChange - Callback when route changes: (route) => void
     */
    constructor(options = {}) {
        this.defaultRoute = options.defaultRoute || '';
        this.onRouteChange = options.onRouteChange || null;
        this._boundHandler = null;
        this._currentRoute = null;
    }

    /**
     * Initialize the router
     * Sets up hashchange listener and handles initial route
     */
    init() {
        this._boundHandler = () => this._handleHashChange();
        window.addEventListener('hashchange', this._boundHandler);
        // Handle initial route on page load
        this._handleHashChange();
    }

    /**
     * Navigate to a route programmatically
     * @param {string} route - Route to navigate to (without '#')
     * @param {boolean} triggerCallback - Whether to trigger onRouteChange callback (default: true)
     */
    navigate(route, triggerCallback = true) {
        if (route !== this._currentRoute) {
            this._currentRoute = route;
            HashRouter.setHash(route);
            if (triggerCallback && this.onRouteChange) {
                this.onRouteChange(route);
            }
        }
    }

    /**
     * Get the current route
     * @returns {string} Current route (without '#')
     */
    getCurrentRoute() {
        return this._currentRoute;
    }

    /**
     * Destroy the router (remove event listeners)
     */
    destroy() {
        if (this._boundHandler) {
            window.removeEventListener('hashchange', this._boundHandler);
            this._boundHandler = null;
        }
    }

    /**
     * Handle hash change events
     * @private
     */
    _handleHashChange() {
        const route = HashRouter.getHash() || this.defaultRoute;
        if (route !== this._currentRoute) {
            this._currentRoute = route;
            if (this.onRouteChange) {
                this.onRouteChange(route);
            }
        }
    }

    /**
     * Get the current hash from the URL
     * @returns {string} Hash value without '#', or empty string
     */
    static getHash() {
        return window.location.hash.slice(1);
    }

    /**
     * Set the URL hash
     * @param {string} route - Route to set (without '#')
     */
    static setHash(route) {
        window.location.hash = route;
    }
}
