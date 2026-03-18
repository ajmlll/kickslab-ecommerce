/**
 * KICKSLAB - Centralized User Authentication Helper
 * Handles login state, UI updates, and logout with confirmation modal.
 */

const AuthSystem = {
    init: function () {
        this.injectAuthModal();
        this.injectLogoutModal();
        this.injectBadges(); // NEW: Create badge elements
        this.setupAccountDropdown();
        this.updateUI(); // updateUI already calls refreshBadges()
        this.attachListeners();
        this.syncAuthState();
        this.initMobileMenu();
        this.initAccountDrawer(); // NEW: Injects Premium Account Drawer on responsive
        this.forceDesignParity(); // Universal design enforcement

        // Auto-open login modal if redirected from a protected page
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'login' && !this.isLoggedIn()) {
            setTimeout(() => this.showAuthModal(), 500);
        }

        if (urlParams.get('blocked') === 'true') {
            this.showToast('Your account has been blocked. Please contact support.', 'error');
        }
    },

    syncAuthState: async function () {
        try {
            const res = await fetch('/api/users/profile', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userData', JSON.stringify(data.user));
                    this.updateUI();

                    // Refresh badges if just logged in
                    if (!wasLoggedIn) this.refreshBadges();
                }
            } else if (res.status === 401 || res.status === 403) {
                const data = await res.json().catch(() => ({}));
                localStorage.setItem('isLoggedIn', 'false');
                localStorage.removeItem('userData');
                this.updateUI();
                this.refreshBadges(); // Hide badges

                if (data.blocked || res.status === 403) {
                    window.location.href = '/user/Landingpage.html?action=login&blocked=true';
                }
            }
        } catch (e) { }
    },

    isLoggedIn: function () {
        return localStorage.getItem('isLoggedIn') === 'true';
    },

    getUserData: function () {
        try {
            return JSON.parse(localStorage.getItem('userData')) || {};
        } catch (e) { return {}; }
    },

    // --- BADGE SYSTEM ---

    injectBadges: function () {
        // Target wishlist and cart links
        const wishlistLink = document.querySelector('a[href*="Wishlist.html"]');
        const cartLink = document.querySelector('a[href*="Cart.html"]');

        if (wishlistLink && !wishlistLink.querySelector('.badge-count')) {
            wishlistLink.insertAdjacentHTML('beforeend', '<span class="badge-count" id="wishlist-badge">0</span>');
        }
        if (cartLink && !cartLink.querySelector('.badge-count')) {
            cartLink.insertAdjacentHTML('beforeend', '<span class="badge-count" id="cart-badge">0</span>');
        }
    },

    refreshBadges: async function () {
        if (!this.isLoggedIn()) {
            document.querySelectorAll('.badge-count').forEach(b => b.classList.remove('visible'));
            return;
        }

        try {
            // Fetch Wishlist Count
            const wishRes = await fetch('/api/wishlist', { credentials: 'include' });
            if (wishRes.ok) {
                const wishData = await wishRes.json();
                const count = (wishData.items || []).length;
                this.updateBadge('wishlist-badge', count);
            }

            // Fetch Cart Count
            const cartRes = await fetch('/api/cart', { credentials: 'include' });
            if (cartRes.ok) {
                const cartData = await cartRes.json();
                const count = (cartData.items || []).length;
                this.updateBadge('cart-badge', count);
            }
        } catch (err) {
            console.error("Error refreshing badges:", err);
        }
    },

    updateBadge: function (id, count) {
        const badge = document.getElementById(id);
        if (!badge) return;

        if (count > 0) {
            badge.innerText = count > 99 ? '99+' : count;
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    },

    // --- MODAL INJECTION ---

    injectAuthModal: function () {
        if (document.getElementById('authModalOverlay')) return;
        const modalHTML = `
        <div class="auth-modal-overlay" id="authModalOverlay">
            <div class="auth-modal">
                <button class="auth-close-btn" id="authCloseBtn">&times;</button>
                <h2>Login Required</h2>
                <p>Please log in or sign up to access this feature.</p>
                <div class="auth-actions">
                    <button class="auth-btn auth-btn-primary" onclick="window.location.href='login.html'">Log In</button>
                    <button class="auth-btn auth-btn-secondary" onclick="window.location.href='signup.html'">Sign Up</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.authModal = document.getElementById('authModalOverlay');
        document.getElementById('authCloseBtn').onclick = () => this.hideAuthModal();
        this.authModal.onclick = (e) => { if (e.target === this.authModal) this.hideAuthModal(); };
    },

    injectLogoutModal: function () {
        if (document.getElementById('logoutModalOverlay')) return;
        const modalHTML = `
        <div class="auth-modal-overlay" id="logoutModalOverlay">
            <div class="auth-modal">
                <div style="font-size: 40px; color: #ef4444; margin-bottom: 15px;"><i class="fas fa-sign-out-alt"></i></div>
                <h2>Logout Confirmation</h2>
                <p>Are you sure you want to log out of your KICKSLAB account?</p>
                <div class="auth-actions">
                    <button class="auth-btn auth-btn-primary" style="background-color: #ef4444;" id="confirmLogoutBtn">Yes, Logout</button>
                    <button class="auth-btn auth-btn-secondary" id="cancelLogoutBtn">Cancel</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.logoutModal = document.getElementById('logoutModalOverlay');

        document.getElementById('confirmLogoutBtn').onclick = () => this.executeLogout();
        document.getElementById('cancelLogoutBtn').onclick = () => this.hideLogoutModal();
        this.logoutModal.onclick = (e) => { if (e.target === this.logoutModal) this.hideLogoutModal(); };
    },

    // --- UI UPDATES ---

    setupAccountDropdown: function () {
        const userIcons = document.querySelectorAll('.fa-user, .fa-user-circle');
        userIcons.forEach(icon => {
            const link = icon.closest('a');
            if (!link || link.dataset.dropdownInited) return;

            link.dataset.dropdownInited = "true";

            if (!link.parentNode.classList.contains('account-dropdown-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'account-dropdown-wrapper';
                link.parentNode.insertBefore(wrapper, link);
                wrapper.appendChild(link);

                const dropdownHTML = `
                <div class="account-dropdown" id="accountDropdown">
                    <ul>
                        <li><a href="Account.html"><i class="fas fa-user-cog"></i> My Profile</a></li>
                        <li><a href="AddressBook.html"><i class="fas fa-map-marker-alt"></i> Address Book</a></li>
                        <li><a href="PaymentOptions.html"><i class="fas fa-wallet"></i> Payment Options</a></li>
                        <li><a href="MyCoupons.html"><i class="fas fa-ticket-alt"></i> My Coupons</a></li>
                        <li><a href="MyOrders.html"><i class="fas fa-box"></i> My Orders</a></li>
                        <li><a href="#" class="logout-btn" onclick="AuthSystem.showLogoutModal(event)"><i class="fas fa-sign-out-alt"></i> Logout</a></li>
                    </ul>
                </div>`;
                wrapper.insertAdjacentHTML('beforeend', dropdownHTML);
            }

            link.onclick = (e) => {
                e.preventDefault();
                if (this.isLoggedIn()) {
                    // Redirect directly to Profile on mobile, show drop down on desktop
                    if (window.innerWidth <= 1023) {
                        window.location.href = "Account.html";
                    } else {
                        this.toggleDropdown(link.parentNode.querySelector('.account-dropdown'));
                    }
                } else {
                    this.showAuthModal();
                }
            };
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.account-dropdown-wrapper')) {
                document.querySelectorAll('.account-dropdown.active').forEach(d => d.classList.remove('active'));
            }
        });
    },

    updateUI: function () {
        const loggedIn = this.isLoggedIn();

        // Update account icon color
        document.querySelectorAll('.fa-user, .fa-user-circle').forEach(icon => {
            icon.style.color = loggedIn ? '#ef4444' : '';
        });

        // Toggle sign up visibility if elements exist
        document.querySelectorAll('#nav-signup-item, #mobile-nav-signup-item').forEach(el => {
            el.style.display = loggedIn ? 'none' : 'block';
        });

        // Update welcome message if element exists
        const welcomeEl = document.getElementById('user-name-display');
        if (welcomeEl) {
            const userData = this.getUserData();
            welcomeEl.innerText = (userData.name || 'User').toUpperCase();
        }

        // Trigger badge refresh
        this.refreshBadges();
    },


    toggleDropdown: function (dropdown) {
        document.querySelectorAll('.account-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('active');
        });
        if (dropdown) dropdown.classList.toggle('active');
    },

    // --- CORE ACTIONS ---

    showAuthModal: function (e) {
        if (e) e.preventDefault();
        if (this.authModal) {
            this.authModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    showModal: function (e) {
        this.showAuthModal(e);
    },
    hideAuthModal: function () {
        if (this.authModal) this.authModal.classList.remove('active');
        document.body.style.overflow = '';
    },

    showLogoutModal: function (e) {
        if (e) e.preventDefault();
        if (this.logoutModal) this.logoutModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    logout: function (e) {
        this.showLogoutModal(e);
    },

    hideLogoutModal: function () {
        if (this.logoutModal) this.logoutModal.classList.remove('active');
        document.body.style.overflow = '';
    },

    executeLogout: async function () {
        try {
            // 1. Call backend to clear cookies
            await fetch('/api/users/logout', { method: 'POST', credentials: 'include' });

            // 2. Clear local session
            localStorage.setItem('isLoggedIn', 'false');
            localStorage.removeItem('userData');

            // 3. UI Cleanup
            this.hideLogoutModal();
            this.updateUI();
            this.refreshBadges(); // Clear badges

            // 4. Redirect to Landing Page
            window.location.href = 'Landingpage.html';
        } catch (err) {
            console.error("Logout failed:", err);
            // Fallback
            window.location.href = 'Landingpage.html';
        }
    },

    showToast: function (message, type = 'success') {
        const toastContainer = document.querySelector('.toast-container') || this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast-msg active ${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 400);
        }, 5000);
    },

    createToastContainer: function () {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    },

    attachListeners: function () {
        // Intercept restricted links for non-logged in users
        document.addEventListener('click', (e) => {
            const target = e.target.closest('a, button, .protected-link');
            if (!target) return;

            if (this.isLoggedIn()) return;

            // Whitelist auth buttons and basic UI
            if (target.classList.contains('auth-btn') ||
                target.classList.contains('mobile-menu-btn') ||
                target.closest('.auth-modal')) return;

            let restricted = false;
            const href = target.getAttribute('href') || '';
            const protectedFiles = [
                'Cart.html', 'Wishlist.html', 'Checkout.html', 'Account.html',
                'MyOrders.html', 'AddressBook.html', 'PaymentOptions.html',
                'MyCoupons.html', 'return-details.html', 'my-cancellations.html'
            ];

            if (target.classList.contains('protected-link')) restricted = true;
            if (protectedFiles.some(file => href.includes(file))) restricted = true;

            if (restricted) {
                e.preventDefault();
                e.stopPropagation();
                this.showAuthModal();
            }
        }, true);
    },

    // --- MOBILE MENU LOGIC (Shared) ---
    initMobileMenu: function () {
        let menuBtn = document.querySelector('.mobile-menu-btn');
        let menu = document.querySelector('.mobile-menu');
        let overlay = document.querySelector('.mobile-menu-overlay');
        const navbar = document.querySelector('.navbar');
        const navLeft = document.querySelector('.nav-left');

        // 1. Programmatic Injection of missing core elements
        if (!menuBtn && navLeft) {
            navLeft.insertAdjacentHTML('afterbegin', `
                <button class="mobile-menu-btn" aria-label="Toggle menu">
                    <i class="fas fa-bars"></i>
                </button>
            `);
            menuBtn = document.querySelector('.mobile-menu-btn');
        }

        if (!overlay) {
            document.body.insertAdjacentHTML('beforeend', '<div class="mobile-menu-overlay"></div>');
            overlay = document.querySelector('.mobile-menu-overlay');
        }

        if (!menu) {
            document.body.insertAdjacentHTML('beforeend', `
                <div class="mobile-menu">
                    <ul class="mobile-nav-links"></ul>
                </div>
            `);
            menu = document.querySelector('.mobile-menu');
        }

        if (!menuBtn || !menu || !overlay) return;

        // Ensure menu is inside navbar for correct top-down positioning (absolute top:100%)
        if (navbar && !navbar.contains(menu)) {
            navbar.appendChild(menu);
        }

        // AUTO-CLEANUP: Remove redundant local menu instances that might exist on pages
        document.querySelectorAll('nav .mobile-menu-btn, .mobile-menu, .mobile-menu-overlay').forEach(el => {
            if (el !== menuBtn && el !== menu && el !== overlay && !el.closest('.mobile-menu')) {
                // Only remove if it's not the one we just injected or found
                // And not part of the current menu
                if (!el.dataset.centralized) el.remove();
            }
        });

        // Mark our elements
        menuBtn.dataset.centralized = "true";
        menu.dataset.centralized = "true";
        overlay.dataset.centralized = "true";

        const toggleMenu = (show) => {
            menu.classList.toggle('active', show);
            overlay.classList.toggle('active', show);
            document.body.style.overflow = show ? 'hidden' : '';
            
            // Toggle Icon: ALWAYS Bars (removed times toggle)
            const icon = menuBtn.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-bars';
            }
        };

        menuBtn.onclick = (e) => {
            e.stopPropagation();
            const isActive = menu.classList.contains('active');
            toggleMenu(!isActive);
        };

        // Hide redundant logo & close button
        const menuHeader = menu.querySelector('.mobile-menu-header');
        if (menuHeader) menuHeader.style.display = 'none';
        
        // --- DYNAMIC REORDER & ENRICHMENT ---
        const linksList = menu.querySelector('.mobile-nav-links');
        if (linksList) {
            // 1. Get existing links
            const items = Array.from(linksList.querySelectorAll('li')).filter(li => !li.classList.contains('account-enriched'));
            
            // 2. Build explicit list to match reference image (Home, Shop, Contact, About)
            const curPage = window.location.pathname.split('/').pop() || 'Landingpage.html';
            linksList.innerHTML = `
                <li><a href="Landingpage.html" class="${curPage === 'Landingpage.html' ? 'active' : ''}">Home</a></li>
                <li><a href="ProductListing.html" class="protected-link ${curPage === 'ProductListing.html' ? 'active' : ''}">Shop</a></li>
                <li><a href="Contact.html" class="protected-link ${curPage === 'Contact.html' ? 'active' : ''}">Contact</a></li>
                <li><a href="AboutPage.html" class="${curPage === 'AboutPage.html' ? 'active' : ''}">About</a></li>
            `;

            // Account enrichment removed as per user request for simplified menu
        }

        // Close on link click
        menu.querySelectorAll('a').forEach(link => {
            link.onclick = () => toggleMenu(false);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (menu.classList.contains('active') && !menu.contains(e.target) && !menuBtn.contains(e.target)) {
                toggleMenu(false);
            }
        });
    },

    // --- PREMIUM ACCOUNT DRAWER (Mobile/Tablet) ---
    initAccountDrawer: function () {
        const sidebar = document.querySelector('.account-sidebar');
        if (!sidebar) return; // Only run on account-related pages

        // 1. Identify Target for Toggle (Above "Hello User")
        const pageTitle = document.querySelector('.page-title') || document.querySelector('.account-page-wrapper h1');
        if (!pageTitle) return;

        // 2. Inject Toggle Button (Light bar style)
        if (!document.querySelector('.account-drawer-toggle-wrapper')) {
            const toggleWrapper = document.createElement('div');
            toggleWrapper.className = 'account-drawer-toggle-wrapper';
            toggleWrapper.innerHTML = `
                <button class="account-drawer-toggle" id="accountDrawerToggle">
                    <i class="fas fa-bars"></i>
                    <span>Account Menu</span>
                </button>
            `;
            pageTitle.parentNode.insertBefore(toggleWrapper, pageTitle);
        }

        // 3. Inject Drawer Structure (Premium design)
        if (!document.querySelector('.account-side-drawer')) {
            const drawerHTML = `
                <div class="account-drawer-overlay" id="accountDrawerOverlay"></div>
                <div class="account-side-drawer" id="accountSideDrawer">
                    <div class="drawer-header-premium">
                        <h3>Account</h3>
                        <button class="drawer-close-premium" id="accountDrawerClose"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="drawer-scroll-content">
                        <div class="drawer-nav-section">
                            <span class="drawer-nav-label">MANAGE ACCOUNT</span>
                            <div class="drawer-nav-links">
                                <a href="Account.html" data-page="Account.html"><i class="far fa-user"></i> My Profile</a>
                                <a href="AddressBook.html" data-page="AddressBook.html"><i class="fas fa-map-marker-alt"></i> Address Book</a>
                                <a href="PaymentOptions.html" data-page="PaymentOptions.html"><i class="far fa-credit-card"></i> Payment Options</a>
                                <a href="MyCoupons.html" data-page="MyCoupons.html"><i class="fas fa-ticket-alt"></i> My Coupons</a>
                            </div>
                        </div>
                        <div class="drawer-nav-section">
                            <span class="drawer-nav-label">ORDERS HISTORY</span>
                            <div class="drawer-nav-links">
                                <a href="MyOrders.html" data-page="MyOrders.html"><i class="fas fa-shopping-bag"></i> My Orders</a>
                                <a href="return-details.html" data-page="return-details.html"><i class="fas fa-undo"></i> My Returns</a>
                                <a href="my-cancellations.html" data-page="my-cancellations.html"><i class="fas fa-times-circle"></i> My Cancellations</a>
                            </div>
                        </div>
                        <div class="drawer-footer-premium">
                            <a href="#" onclick="AuthSystem.logout(event)" class="logout-link-premium"><i class="fas fa-sign-out-alt"></i> LOG OUT</a>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', drawerHTML);
        }

        const toggleBtn = document.getElementById('accountDrawerToggle');
        const overlay = document.getElementById('accountDrawerOverlay');
        const drawer = document.getElementById('accountSideDrawer');
        const closeBtn = document.getElementById('accountDrawerClose');

        if (!toggleBtn || !overlay || !drawer || !closeBtn) return;

        const openDrawer = () => {
            drawer.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        const closeDrawer = () => {
            drawer.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        };

        toggleBtn.onclick = openDrawer;
        overlay.onclick = closeDrawer;
        closeBtn.onclick = closeDrawer;

        // Sync Active State
        const curPage = window.location.pathname.split('/').pop() || 'Account.html';
        drawer.querySelectorAll('.drawer-nav-links a').forEach(link => {
            const page = link.getAttribute('data-page');
            if (curPage.includes(page) || (curPage === '' && page === 'Account.html')) {
                link.classList.add('active');
            }
        });
    },

    // --- UNIVERSAL DESIGN ENFORCEMENT ---
    forceDesignParity: function () {
        const searchBox = document.querySelector('.search-box');
        const navContainer = document.querySelector('.navbar-container');
        const navLeft = document.querySelector('.nav-left');

        if (!navContainer || !searchBox || !navLeft) return;

        const handleResize = () => {
            const width = window.innerWidth;
            const isTablet = width > 767 && width <= 1024;
            const isMobile = width <= 767;
            const isResponsive = isTablet || isMobile;

            if (isResponsive) {
                // Move search box to bottom of container for 2nd row wrapping
                if (searchBox.parentElement !== navContainer) {
                    navContainer.appendChild(searchBox);
                }
            } else {
                // RESTORE Desktop: Move search box back inside nav-left
                if (searchBox.parentElement !== navLeft) {
                    navLeft.appendChild(searchBox);
                }
            }
        };

        // Run once on init and on resize
        handleResize();
        window.addEventListener('resize', handleResize);

        // 2. Global Style Injection (Optimized for Mobile & Tablet)
        if (!document.getElementById('kickslab-design-override')) {
            const style = document.createElement('style');
            style.id = 'kickslab-design-override';
            style.innerHTML = `
                @media (max-width: 1024px) {
                    .navbar {
                        height: auto !important;
                        min-height: 100px !important;
                        padding: 10px 0 !important;
                        position: sticky !important;
                        top: 0 !important;
                        background: #fff !important;
                        z-index: 3500 !important;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.05) !important;
                    }
                    .navbar-container {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: space-between !important;
                        width: 100% !important;
                        padding: 0 15px !important;
                        gap: 0 !important; /* We use margins/flex for spacing */
                    }

                    /* 
                       SYMBOL ALIGNMENT (FINAL):
                       Toggle (Left), Logo (Center), Icons (Right)
                    */
                    .nav-left, .nav-center, .nav-right {
                        flex: auto !important;
                        height: 50px !important;
                        display: flex !important;
                        align-items: center !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }

                    /* TOGGLE (HAMBURGER) -> FAR LEFT */
                    .nav-left { 
                        order: 1 !important; 
                        flex: 1 !important;
                        justify-content: flex-start !important;
                    }
                    .mobile-menu-btn {
                        display: flex !important;
                        font-size: 22px !important;
                        color: #000 !important;
                        padding: 5px !important;
                        background: none !important;
                        border: none !important;
                    }

                    /* LOGO -> CENTER */
                    .nav-center { 
                        order: 2 !important; 
                        flex: 0 0 auto !important;
                        justify-content: center !important; 
                        min-width: 0 !important;
                    }
                    .logo {
                        font-size: 28px !important; /* Increased from 22px */
                        margin: 0 !important;
                        text-align: center !important;
                        display: block !important;
                        white-space: nowrap !important;
                        font-weight: 800 !important;
                        letter-spacing: -1px !important;
                    }

                    /* Tablet specific logo size */
                    @media (min-width: 768px) and (max-width: 1024px) {
                        .logo {
                            font-size: 32px !important;
                        }
                    }

                    /* ICONS -> FAR RIGHT */
                    .nav-right { 
                        order: 3 !important; 
                        flex: 1 !important;
                        justify-content: flex-end !important;
                    }
                    .nav-icons {
                        display: flex !important;
                        gap: 12px !important;
                        align-items: center !important;
                        flex-shrink: 0 !important;
                    }
                    
                    /* Hide Desktop Stuff */
                    .nav-links, .nav-center .nav-links { display: none !important; }

                    /* SECOND ROW: SEARCH BAR (FULL WIDTH) */
                    .search-box {
                        width: 100% !important;
                        flex: 0 0 100% !important; /* Force to new line */
                        order: 10 !important;
                        margin: 10px 0 5px 0 !important;
                        display: flex !important;
                        position: relative !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        z-index: 10 !important;
                    }

                    .search-box input {
                        display: block !important;
                        width: 100% !important;
                        background: #f8f8f8 !important; /* Clean light grey from image */
                        border: none !important;
                        border-radius: 50px !important;
                        padding: 0 45px 0 20px !important;
                        height: 45px !important;
                        font-size: 14px !important;
                        color: #333 !important;
                        outline: none !important;
                    }

                    .search-box .fa-search {
                        position: absolute !important;
                        right: 18px !important;
                        top: 50% !important;
                        transform: translateY(-50%) !important;
                        display: block !important;
                        color: #999 !important;
                        pointer-events: none !important;
                    }

                     .mobile-nav-links li {
                        margin-bottom: 5px !important; /* Reduced spacing */
                    }
                    .mobile-nav-links a {
                        font-size: 16px !important;
                        font-weight: 500 !important;
                        color: #000 !important;
                        display: block !important;
                        padding: 8px 0 !important;
                        border: none !important;
                    }

                    .navbar {
                        z-index: 9999 !important; /* Ensure it's above EVERYTHING */
                        overflow: visible !important;
                    }

                    /* Premium Dropdown with higher priority and clean interaction */
                    .mobile-menu {
                        position: absolute !important;
                        top: 100% !important;
                        left: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                        background: #ffffff !important;
                        padding: 15px 25px !important;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.1) !important;
                        border-top: 1px solid #f0f0f0 !important;
                        border-bottom: 1px solid #eee !important;
                        z-index: 10 !important;
                        display: none !important;
                        flex-direction: column !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        height: auto !important;
                        animation: slideDown 0.3s ease-out;
                    }

                    @keyframes slideDown {
                        from { transform: translateY(-10px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }

                    .mobile-nav-links a.active {
                        color: #000 !important;
                        font-weight: 700 !important;
                        border-left: 3px solid #000;
                        padding-left: 10px;
                    }

                    .mobile-menu.active {
                        display: flex !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
};

// Global expose for legacy/direct calls in HTML
window.initMobileMenu = () => AuthSystem.initMobileMenu();


// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    AuthSystem.init();

    // Elegant Fetch Interceptor to auto-refresh badges on cart/wishlist actions
    const originalFetch = window.fetch;
    window.fetch = async function () {
        const response = await originalFetch.apply(this, arguments);
        const input = arguments[0];
        const init = arguments[1];

        const url = (typeof input === 'string') ? input : (input instanceof URL ? input.href : (input.url || ''));
        const method = (init && init.method) ? init.method.toUpperCase() : 'GET';

        // ONLY refresh if:
        // 1. Success
        // 2. User is logged in
        // 3. It's a mutation (POST, DELETE, PUT) - NOT a GET
        // 4. It's a cart or wishlist API
        if (response.ok &&
            AuthSystem.isLoggedIn() &&
            method !== 'GET' &&
            (url.includes('/api/cart') || url.includes('/api/wishlist'))) {

            setTimeout(() => AuthSystem.refreshBadges(), 500);
        }

        // ================= GLOBAL BLOCKED/AUTH INTERCEPTOR =================
        if (response.status === 401 || response.status === 403) {
            try {
                const clone = response.clone();
                const data = await clone.json();

                if (data.blocked || response.status === 403) {
                    console.warn("User has been blocked. Logging out...");
                    localStorage.setItem('isLoggedIn', 'false');
                    localStorage.removeItem('userData');
                    
                    // Force redirect to login page with blocked param
                    window.location.href = '/user/Landingpage.html?action=login&blocked=true';
                }
            } catch (e) {
                // Ignore parse errors on empty bodies
            }
        }
        // ====================================================================
        return response;
    };
});
