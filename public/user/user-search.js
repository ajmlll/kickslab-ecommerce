/**
 * user-search.js
 * Handles responsive search functionality, live autocomplete, 
 * and persistent recent searches.
 */

class SearchHandler {
    constructor() {
        this.input = document.querySelector('.search-box input');
        this.searchBox = document.querySelector('.search-box');
        this.backdrop = null;
        this.panel = null;
        this.mobileModal = null;
        this.debounceTimer = null;
        this.recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');

        this.init();
    }

    async init() {
        if (!this.input) return;

        this.createElements();
        this.attachListeners();
        this.loadInitialData();
    }

    createElements() {
        // Create Desktop Panel
        this.panel = document.createElement('div');
        this.panel.className = 'search-dropdown-panel';
        this.searchBox.appendChild(this.panel);

        // Create Backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'search-backdrop';
        document.body.appendChild(this.backdrop);

        // Create Mobile Modal
        this.mobileModal = document.createElement('div');
        this.mobileModal.className = 'mobile-search-modal';
        this.mobileModal.innerHTML = `
            <div class="mobile-search-header">
                <i class="fas fa-arrow-left" id="closeMobileSearch"></i>
                <div class="mobile-search-input-wrapper">
                    <input type="text" placeholder="Search for products, brands..." id="mobileSearchInput">
                </div>
            </div>
            <div class="mobile-search-content" id="mobileSearchContent">
                <!-- Content injected here -->
            </div>
        `;
        document.body.appendChild(this.mobileModal);
    }

    attachListeners() {
        // Desktop Input
        this.input.addEventListener('focus', () => this.handleOpen());
        this.input.addEventListener('input', (e) => this.handleInput(e.target.value));
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.redirectToResults(e.target.value);
            if (e.key === 'Escape') this.handleClose();
        });

        // Backdrop / Outside Click
        this.backdrop.addEventListener('click', () => this.handleClose());

        // Mobile Logic
        const mobileSearchBtn = document.querySelector('.search-box i.fa-search');
        if (mobileSearchBtn) {
            mobileSearchBtn.addEventListener('click', (e) => {
                if (window.innerWidth <= 1024) {
                    this.openMobileSearch();
                }
            });
        }

        document.getElementById('closeMobileSearch').addEventListener('click', () => this.closeMobileSearch());
        const mobileInput = document.getElementById('mobileSearchInput');
        mobileInput.addEventListener('input', (e) => this.handleInput(e.target.value, true));
        mobileInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.redirectToResults(e.target.value);
        });
    }

    handleOpen() {
        if (window.innerWidth <= 1024) return;
        this.panel.classList.add('active');
        this.backdrop.classList.add('active');
        if (!this.input.value) {
            this.renderDefaultPanel();
        }
    }

    handleClose() {
        this.panel.classList.remove('active');
        this.backdrop.classList.remove('active');
    }

    openMobileSearch() {
        this.mobileModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        document.getElementById('mobileSearchInput').focus();
        this.renderDefaultPanel(true);
    }

    closeMobileSearch() {
        this.mobileModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    handleInput(value, isMobile = false) {
        clearTimeout(this.debounceTimer);
        const target = isMobile ? document.getElementById('mobileSearchContent') : this.panel;

        if (!value || value.length < 2) {
            this.renderDefaultPanel(isMobile);
            return;
        }

        this.debounceTimer = setTimeout(async () => {
            target.innerHTML = '<div class="search-loading">Searching...</div>';
            try {
                const res = await fetch(`/api/admin/products/suggestions?q=${encodeURIComponent(value)}`);
                const products = await res.json();
                this.renderSuggestions(products, isMobile, value);
            } catch (err) {
                target.innerHTML = '<div class="search-empty">Error fetching results.</div>';
            }
        }, 300);
    }

    renderDefaultPanel(isMobile = false) {
        const target = isMobile ? document.getElementById('mobileSearchContent') : this.panel;

        let html = '';

        // Recent Searches
        if (this.recentSearches.length > 0) {
            html += `
                <div class="search-section">
                    <div class="search-section-title">Recent Searches</div>
                    <div class="search-items-list">
                        ${this.recentSearches.map(s => `<span class="search-tag" onclick="searchHandler.redirectToResults('${s}')">${s}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // Trending & Categories (Mocked or partially fetched)
        html += `
            <div class="search-section">
                <div class="search-section-title">Trending Searches</div>
                <div class="search-items-list">
                    <span class="search-tag" onclick="searchHandler.redirectToResults('Jordan 4')">Jordan 4</span>
                    <span class="search-tag" onclick="searchHandler.redirectToResults('Nike Dunk')">Nike Dunk</span>
                    <span class="search-tag" onclick="searchHandler.redirectToResults('Yeezy')">Yeezy</span>
                    <span class="search-tag" onclick="searchHandler.redirectToResults('New Balance 550')">New Balance 550</span>
                </div>
            </div>
            <div class="search-section">
                <div class="search-section-title">Popular Categories</div>
                <div class="search-items-list" id="popularCatsList">
                    <span class="search-tag" onclick="searchHandler.redirectToResults('Sneakers')">Sneakers</span>
                    <span class="search-tag" onclick="searchHandler.redirectToResults('Running')">Running</span>
                    <span class="search-tag" onclick="searchHandler.redirectToResults('Basketball')">Basketball</span>
                </div>
            </div>
        `;

        target.innerHTML = html;
        this.fetchRealCategories(); // Update categories if possible
    }

    async fetchRealCategories() {
        try {
            const res = await fetch('/api/admin/categories');
            if (res.ok) {
                const cats = await res.json();
                const list = document.getElementById('popularCatsList');
                if (list) {
                    list.innerHTML = cats.slice(0, 6).map(c =>
                        `<span class="search-tag" onclick="searchHandler.redirectToResults('${c.name}')">${c.name}</span>`
                    ).join('');
                }
            }
        } catch (e) { }
    }

    renderSuggestions(products, isMobile, query) {
        const target = isMobile ? document.getElementById('mobileSearchContent') : this.panel;

        if (products.length === 0) {
            target.innerHTML = `
                <div class="search-empty">
                    <p>No products found for "${query}"</p>
                    <div style="margin-top: 15px;">
                        <div class="search-section-title">Try searching for:</div>
                        <div class="search-items-list">
                            <span class="search-tag" onclick="searchHandler.redirectToResults('Nike')">Nike</span>
                            <span class="search-tag" onclick="searchHandler.redirectToResults('Running')">Running</span>
                            <span class="search-tag" onclick="searchHandler.redirectToResults('Jordan')">Jordan</span>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        let html = `
            <div class="search-section">
                <div class="search-section-title">Product Suggestions</div>
                <div class="suggestions-list">
                    ${products.map(p => {
            const originalPrice = p.price;
            const displayPrice = p.dynamicOfferPrice || p.offerPrice || p.price;
            const hasDiscount = displayPrice < originalPrice;

            return `
                            <a href="ProductDetail.html?id=${p._id || p.id}" class="product-suggestion-item">
                                <img src="${p.image}" class="suggestion-img">
                                <div class="suggestion-info">
                                    <div class="suggestion-name">${p.name}</div>
                                    <div class="suggestion-price">
                                        ${hasDiscount ? `<span class="original-price">₹${originalPrice}</span>` : ''}
                                        <span class="current-price">₹${displayPrice}</span>
                                    </div>
                                </div>
                            </a>
                        `;
        }).join('')}
                </div>
            </div>
            <div style="text-align: center; margin-top: 15px;">
                <button class="search-tag" onclick="searchHandler.redirectToResults('${query}')" style="background: none; border: 1px solid #ddd;">See all results for "${query}"</button>
            </div>
        `;

        target.innerHTML = html;
    }

    redirectToResults(query) {
        if (!query || query.trim() === '') return;

        // Save to Recent
        this.saveRecentSearch(query);

        // Redirect
        window.location.href = `ProductListing.html?search=${encodeURIComponent(query.trim())}`;
    }

    saveRecentSearch(query) {
        let recent = this.recentSearches;
        recent = [query, ...recent.filter(s => s !== query)].slice(0, 5);
        localStorage.setItem('recentSearches', JSON.stringify(recent));
        this.recentSearches = recent;
    }

    loadInitialData() {
        // Fallback for global access from tags
        window.searchHandler = this;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SearchHandler();
});
