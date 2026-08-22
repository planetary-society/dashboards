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
     *
     * Neither form fires `hashchange` synchronously (assignment fires it on a
     * later task, replaceState never fires it at all), so this method always
     * does its own bookkeeping: it records the new route and invokes the
     * callback itself. The `hashchange` handler then no-ops because the route
     * already matches.
     *
     * @param {string} route - Route to navigate to (without '#')
     * @param {boolean|Object} [options=true] - Legacy boolean form is the
     *   triggerCallback flag; object form accepts:
     * @param {boolean} [options.replace=false] - Use history.replaceState instead
     *   of assigning the hash, so the navigation adds no history entry (Back
     *   leaves the page rather than returning to the route just left behind)
     * @param {boolean} [options.trigger=true] - Explicit form of the legacy flag
     */
    navigate(route, options = true) {
        const opts = typeof options === 'boolean' ? { trigger: options } : (options || {});
        const trigger = opts.trigger !== false;

        if (route === this._currentRoute) return;

        this._currentRoute = route;

        if (opts.replace === true) {
            HashRouter.replaceHash(route);
        } else {
            HashRouter.setHash(route);
        }

        if (trigger && this.onRouteChange) {
            this.onRouteChange(route);
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
     * Set the URL hash, pushing a history entry
     * @param {string} route - Route to set (without '#')
     */
    static setHash(route) {
        window.location.hash = route;
    }

    /**
     * Replace the URL hash in place, adding no history entry
     *
     * Used for redirects (legacy route → its replacement) so the Back button
     * doesn't bounce the user straight back onto the route that redirects.
     * Note: replaceState does NOT fire `hashchange` — callers are responsible
     * for their own route bookkeeping (navigate() does this).
     *
     * @param {string} route - Route to set (without '#')
     */
    static replaceHash(route) {
        window.history.replaceState(null, '', '#' + route);
    }
}
