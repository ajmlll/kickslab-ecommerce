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
                        <li><a href="Account.html"><i class="fas fa-user-cog"></i> Manage Account</a></li>
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
                    this.toggleDropdown(link.parentNode.querySelector('.account-dropdown'));
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
    }
};


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

            // Delay slightly to ensure DB completed state change
            setTimeout(() => AuthSystem.refreshBadges(), 500);
        }
        return response;
    };
});
