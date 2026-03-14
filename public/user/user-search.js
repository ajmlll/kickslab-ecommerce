/**
 * user-search.js
 * Handles responsive search functionality, live autocomplete, 
 * and persistent recent searches.
 */

if (typeof SearchHandler === 'undefined') {
    window.SearchHandler = class SearchHandler {
        constructor() {
            if (SearchHandler.instance) return SearchHandler.instance;
            SearchHandler.instance = this;

            this.inputs = [];
            this.activeInput = null;
            this.panel = null;
            this.backdrop = null;
            this.debounceTimer = null;
            this.recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');

            this.init();
        }

        init() {
            this.inputs = document.querySelectorAll('.search-box input');
            if (this.inputs.length === 0) {
                console.log("SearchHandler: No inputs found yet");
            }
            this.createElements();
            this.attachListeners();
        }

        createElements() {
            if (document.getElementById('globalSearchPanel')) {
                this.panel = document.getElementById('globalSearchPanel');
                this.backdrop = document.getElementById('globalSearchBackdrop');
                return;
            }

            this.backdrop = document.createElement('div');
            this.backdrop.id = 'globalSearchBackdrop';
            this.backdrop.className = 'search-backdrop';
            
            this.panel = document.createElement('div');
            this.panel.id = 'globalSearchPanel';
            this.panel.className = 'search-dropdown-panel premium-search-panel';
            this.panel.style.display = 'none';

            document.body.appendChild(this.backdrop);
            document.body.appendChild(this.panel);
        }

        attachListeners() {
            this.inputs.forEach(input => {
                input.placeholder = "Search Shoes...";
                
                input.addEventListener('focus', (e) => {
                    this.activeInput = e.target;
                    this.handleOpen();
                });
                input.addEventListener('input', (e) => {
                    this.activeInput = e.target;
                    this.handleInput(e.target.value);
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.redirectToResults(e.target.value);
                    if (e.key === 'Escape') this.handleClose();
                });
            });

            if (this.backdrop) {
                this.backdrop.addEventListener('click', () => this.handleClose());
            }

            window.addEventListener('resize', () => {
                if (this.panel && this.panel.classList.contains('active')) this.updatePanelPosition();
            });
            window.addEventListener('scroll', () => {
                if (this.panel && this.panel.classList.contains('active')) this.updatePanelPosition();
            }, true);
            
            // Re-scan for inputs
            const observer = new MutationObserver(() => {
                const currentInputs = document.querySelectorAll('.search-box input');
                if (currentInputs.length !== this.inputs.length) {
                    this.inputs = currentInputs;
                    this.attachListeners();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        updatePanelPosition() {
            if (!this.activeInput || !this.panel) return;
            const rect = this.activeInput.getBoundingClientRect();
            
            // On mobile, force 95% width and centered
            if (window.innerWidth <= 768) {
                this.panel.style.top = `${rect.bottom + 10}px`;
                this.panel.style.left = '2.5%';
                this.panel.style.width = '95%';
            } else {
                this.panel.style.top = `${rect.bottom + 10}px`;
                this.panel.style.left = `${rect.left}px`;
                this.panel.style.width = `${Math.max(rect.width, 450)}px`;
            }
        }

        async handleOpen() {
            this.updatePanelPosition();
            if (this.activeInput && !this.activeInput.value) {
                this.showPanel();
                await this.renderDefaultPanel();
            } else if (this.activeInput && this.activeInput.value) {
                this.handleInput(this.activeInput.value);
            }
            if (this.backdrop) this.backdrop.classList.add('active');
        }

        showPanel() {
            if (this.panel) {
                this.panel.classList.add('active');
                this.panel.style.display = 'block';
            }
        }

        handleClose() {
            if (this.panel) {
                this.panel.classList.remove('active');
                this.panel.style.display = 'none';
            }
            if (this.backdrop) this.backdrop.classList.remove('active');
        }

        async handleInput(value) {
            const trimmed = value.trim();
            if (!trimmed || trimmed.length < 2) {
                await this.renderDefaultPanel();
                return;
            }

            this.updatePanelPosition();
            this.showPanel();
            this.panel.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Finding curated results...</div>';

            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/admin/products/suggestions?q=${encodeURIComponent(trimmed)}`);
                    const data = await res.json();
                    this.renderSuggestions(data, trimmed);
                } catch (err) {
                    console.error("Search fetch error:", err);
                }
            }, 300);
        }

        async renderDefaultPanel() {
            if (!this.panel) return;
            
            // Show skeleton or loading state for defaults
            this.panel.innerHTML = '<div class="search-loading">Loading suggestions...</div>';

            try {
                const res = await fetch('/api/admin/products/suggestions'); // Fetch defaults (q is empty)
                const data = await res.json();
                
                let html = '';
                
                // 1. Recent Searches (if any)
                if (this.recentSearches.length > 0) {
                    html += `
                        <div class="search-section">
                            <div class="search-section-header">
                                <span class="search-section-title">Recent Searches</span>
                                <button class="clear-recent" onclick="SearchHandler.instance.clearRecent()">Clear All</button>
                            </div>
                            <div class="search-tags-grid">
                                ${this.recentSearches.map(s => `<span class="search-tag recent" onclick="SearchHandler.instance.redirectToResults('${s.replace(/'/g, "\\'")}')"><i class="far fa-clock"></i> ${s}</span>`).join('')}
                            </div>
                        </div>`;
                }

                // 2. Popular Categories (Dynamic)
                if (data.categories && data.categories.length > 0) {
                    html += `
                        <div class="search-section">
                            <div class="search-section-title">Popular Categories</div>
                            <div class="search-tags-grid">
                                ${data.categories.map(c => `<span class="search-tag trending" onclick="SearchHandler.instance.redirectToResults('${c.name.replace(/'/g, "\\'")}')"><i class="fas fa-fire"></i> ${c.name}</span>`).join('')}
                            </div>
                        </div>`;
                }

                // 3. Featured Brands (Dynamic)
                if (data.brands && data.brands.length > 0) {
                    html += `
                        <div class="search-section">
                            <div class="search-section-title">Featured Brands</div>
                            <div class="search-tags-grid">
                                ${data.brands.map(b => `<span class="search-tag brand" onclick="SearchHandler.instance.redirectToResults('${b.name.replace(/'/g, "\\'")}')"><i class="fas fa-award"></i> ${b.name}</span>`).join('')}
                            </div>
                        </div>`;
                }

                this.panel.innerHTML = html || `<div class="search-empty">Start typing to find shoes...</div>`;
            } catch (err) {
                console.error("Error rendering default panel:", err);
            }
        }

        renderSuggestions(data, query) {
            if (!this.panel) return;
            const { products = [], categories = [], brands = [] } = data;

            if (products.length === 0 && categories.length === 0 && brands.length === 0) {
                this.panel.innerHTML = `
                    <div class="search-empty-state">
                        <img src="/images/no-results.png" style="width: 80px; opacity: 0.5; margin-bottom: 15px;" onerror="this.style.display='none'">
                        <p>No matches for <strong>"${query}"</strong></p>
                        <small>Try searching for a brand like "Nike" or "Adidas"</small>
                    </div>`;
                return;
            }

            let html = '';
            
            // Categorized Results
            if (categories.length > 0) {
                html += `
                    <div class="search-section">
                        <div class="search-section-title">In Categories</div>
                        <div class="search-tags-grid">
                            ${categories.map(c => `<span class="search-tag suggested" onclick="SearchHandler.instance.redirectToResults('${c.name.replace(/'/g, "\\'")}')">${c.name}</span>`).join('')}
                        </div>
                    </div>`;
            }

            if (brands.length > 0) {
                html += `
                    <div class="search-section">
                        <div class="search-section-title">In Brands</div>
                        <div class="search-tags-grid">
                            ${brands.map(b => `<span class="search-tag suggested" onclick="SearchHandler.instance.redirectToResults('${b.name.replace(/'/g, "\\'")}')">${b.name}</span>`).join('')}
                        </div>
                    </div>`;
            }

            if (products.length > 0) {
                html += `
                    <div class="search-section">
                        <div class="search-section-title">Top Products</div>
                        <div class="suggestions-list-premium">
                            ${products.map(p => `
                                <a href="ProductDetail.html?id=${p._id || p.id}" class="suggestion-item-v2">
                                    <div class="suggestion-img-wrapper">
                                        <img src="${p.image}" alt="${p.name}">
                                    </div>
                                    <div class="suggestion-content">
                                        <div class="suggestion-name-v2">${p.name}</div>
                                        <div class="suggestion-price-v2">₹${p.dynamicOfferPrice || p.offerPrice || p.price}</div>
                                    </div>
                                    <div class="suggestion-arrow"><i class="fas fa-chevron-right"></i></div>
                                </a>`).join('')}
                        </div>
                    </div>`;
            }

            html += `
                <div class="search-footer">
                    <button class="see-all-btn" onclick="SearchHandler.instance.redirectToResults('${query.replace(/'/g, "\\'")}')">
                        See all results for "${query}" <i class="fas fa-arrow-right"></i>
                    </button>
                </div>`;

            this.panel.innerHTML = html;
        }

        redirectToResults(query) {
            const q = query.trim();
            if (!q) return;
            this.saveRecentSearch(q);
            this.handleClose();
            window.location.href = `ProductListing.html?search=${encodeURIComponent(q)}`;
        }

        saveRecentSearch(query) {
            let recent = [query, ...this.recentSearches.filter(s => s !== query)].slice(0, 5);
            localStorage.setItem('recentSearches', JSON.stringify(recent));
            this.recentSearches = recent;
        }

        clearRecent() {
            localStorage.removeItem('recentSearches');
            this.recentSearches = [];
            this.renderDefaultPanel();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!SearchHandler.instance) new SearchHandler();
    });
}
