/**
 * Navbar Component
 * Reusable navigation bar for all dashboards
 */

import { CONTACT } from '../constants.js';

export class Navbar {
    /**
     * Create a navbar component
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {string} options.title - Dashboard title
     * @param {string} options.logoUrl - Path to logo image
     * @param {string} options.logoLink - URL for logo click
     * @param {Array} options.navItems - Array of nav items {label, href, active}
     * @param {string} options.contactEmail - Contact email address
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            title: options.title || 'Dashboard',
            logoUrl: options.logoUrl || '../shared/img/TPS_Logo_3Stack-White.png',
            logoLink: options.logoLink || CONTACT.website,
            titleLink: options.titleLink || '#summary',
            navItems: options.navItems || [],
            contactEmail: options.contactEmail || CONTACT.email,
            showContact: options.showContact !== false
        };
    }

    /**
     * Render the navbar
     */
    render() {
        if (!this.container) {
            console.error('Navbar container not found');
            return;
        }

        const navItemsHtml = this.options.navItems.map(item => `
            <a href="${item.href}" class="${item.active ? 'active' : ''}">${item.label}</a>
        `).join('');

        const contactHtml = this.options.showContact ? `
            <a href="mailto:${this.options.contactEmail}" class="navbar-contact">
                Contact
            </a>
        ` : '';

        this.container.innerHTML = `
            <div class="navbar-brand">
                <a href="${this.options.logoLink}" target="_blank" class="navbar-logo-link" title="The Planetary Society">
                    <img src="${this.options.logoUrl}" alt="The Planetary Society" class="navbar-logo">
                </a>
                <a href="${this.options.titleLink}" class="navbar-title-link">
                    <span class="navbar-title">${this.options.title}</span>
                </a>
            </div>
            <nav class="navbar-nav">
                ${navItemsHtml}
                ${contactHtml}
            </nav>
        `;

        this.container.classList.add('navbar');
    }

    /**
     * Update the active nav item
     * @param {string} activeHref - Href of the active item
     */
    setActive(activeHref) {
        const links = this.container.querySelectorAll('.navbar-nav a:not(.navbar-contact)');
        links.forEach(link => {
            if (link.getAttribute('href') === activeHref) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    /**
     * Update the title
     * @param {string} title - New title
     */
    setTitle(title) {
        const titleEl = this.container.querySelector('.navbar-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
    }
}

/**
 * Create a navbar with default settings
 * @param {string} containerId - ID of the container element
 * @param {string} title - Dashboard title
 * @returns {Navbar} Navbar instance
 */
export function createNavbar(containerId, title) {
    const navbar = new Navbar(containerId, { title });
    navbar.render();
    return navbar;
}
