/**
 * Global Admin Sidebar Logic
 * Handles active state, mobile toggle, and logout
 */

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
});

async function initSidebar() {
    const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
    // --- Role Display ---
    // Inject Role Badge below logo
    try {
        const logoLink = document.querySelector('.sidebar .logo');
        if (logoLink) {
            let badge = document.querySelector('.admin-role-badge');
            if (!badge) {
                badge = document.createElement('div');
                logoLink.insertAdjacentElement('afterend', badge);
            }

            badge.className = `admin-role-badge role-admin`;
            badge.innerHTML = `<i class="fas fa-crown"></i> ADMIN`;
        }
    } catch (e) {
        // Silent fail for badge injection
    }

    // Mapping of filename to menu text (or ID if we added IDs)
    // We can just rely on matching hrefs

    const navItems = document.querySelectorAll('.sidebar .nav-item');

    navItems.forEach(item => {
        // Remove active class initially (in case hardcoded)
        item.classList.remove('active');

        // Check if this item's href matches current page
        const href = item.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || item.getAttribute('href');

        // Simple logic: if href contains current filename
        if (href && (href === currentPath || href.endsWith('/' + currentPath))) {
            item.classList.add('active');
        }

        // Special case for root/dashboard
        if (!currentPath || currentPath === '' || currentPath === 'index.html') {
            if (href && href.includes('dashboard.html')) {
                item.classList.add('active');
            }
        }

        // Handle click if not using onclick in HTML (we will migrate to href)
        item.addEventListener('click', (e) => {
            // If it has an onclick with location.href, let it run.
            // If we change to <a> tags, this is needed.
            // For now, existing code uses onclick="window.location.href..." on div
            // We will respect that or change it.
        });
    });

    // Mobile Toggle Logic
    // We try to find hamburger by ID first (admin-role style), then class (legacy)
    const hamburger = document.getElementById('hamburger-btn') || document.querySelector('.hamburger-menu');
    const sidebar = document.getElementById('sidebar');

    // Create overlay if not exists
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');

            // If we use 'open' class in some files, toggle that too for compatibility
            sidebar.classList.toggle('open');
        });
    }

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });

    // Logout Logic
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (await AdminModal.confirm('Are you sure you want to logout?')) {
                try {
                    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' });
                } catch (e) { }

                // Clear notification dismissal state on logout
                Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith('dismissed_')) sessionStorage.removeItem(key);
                });

                localStorage.removeItem('adminData');
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('userData');
                // Redirect to user login page
                window.location.href = '/user/login.html';
            }
        });
    }

    // --- Notifications & Extra Links ---
    ensureContactLink();
    initNotifications();

    // --- Sidebar Scroll Persistence ---
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
        // Restore scroll position
        const savedScroll = sessionStorage.getItem('admin_sidebar_scroll');
        if (savedScroll) {
            sidebarEl.scrollTop = parseInt(savedScroll, 10);
        }

        // Save scroll position on scroll
        let scrollTimeout;
        sidebarEl.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                sessionStorage.setItem('admin_sidebar_scroll', sidebarEl.scrollTop);
            }, 100);
        });
    }
}

/**
 * Ensures "Contact Messages" exists in sidebar if missing
 */
function ensureContactLink() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const items = Array.from(sidebar.querySelectorAll('.nav-item'));
    const exists = items.some(i => i.textContent.includes('Contact Messages'));

    if (!exists) {
        const analyticsLink = items.find(i => i.textContent.includes('Analytics'));
        if (analyticsLink) {
            const contactItem = document.createElement('a');
            contactItem.href = 'contact.html';
            contactItem.className = 'nav-item';

            // Check if current page is contact.html to set active
            if (window.location.pathname.endsWith('contact.html')) {
                contactItem.classList.add('active');
            }

            contactItem.innerHTML = `
                <div class="nav-icon">
                    <svg class="icon" viewBox="0 0 24 24">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                </div>
                Contact Messages
            `;
            analyticsLink.insertAdjacentElement('afterend', contactItem);
        }
    }
}

/**
 * Fetch counts and update badges
 */
async function initNotifications() {
    try {
        const res = await fetch('/api/admin/notifications');
        const result = await res.json();

        if (result.success) {
            const n = result.data;
            const mapping = {
                'Order Management': { count: n.pendingOrders, key: 'orders', msg: 'pending orders' },
                'Product Returns': { count: n.pendingReturns, key: 'returns', msg: 'return requests' },
                'Product Reviews': { count: n.pendingReviews, key: 'reviews', msg: 'pending reviews' },
                'Customers': { count: n.newCustomers, key: 'customers', msg: 'new customers registered today' },
                'Product List': { count: n.lowStockProducts, key: 'products', msg: 'products with low stock' },
                'Transaction': { count: n.failedPayments, key: 'transactions', msg: 'failed payments' },
                'Contact Messages': { count: n.unreadMessages, key: 'contact', msg: 'unread messages' }
            };

            const currentPage = window.location.pathname.split('/').pop();
            const pageToKey = {
                'orders.html': 'orders',
                'returns.html': 'returns',
                'reviews.html': 'reviews',
                'customers.html': 'customers',
                'product-list.html': 'products',
                'transactions.html': 'transactions',
                'contact.html': 'contact'
            };

            const navItems = document.querySelectorAll('.sidebar .nav-item');
            navItems.forEach(item => {
                const text = item.textContent.trim();
                for (const [name, data] of Object.entries(mapping)) {
                    if (text.includes(name)) {
                        // Don't show badge if dismissed in this session
                        let isDismissed = sessionStorage.getItem(`dismissed_${data.key}`);

                        // Persistent dismissal for New Customers (lasts until tomorrow)
                        if (data.key === 'customers') {
                            if (localStorage.getItem('dismissed_customers_date') === new Date().toDateString()) {
                                isDismissed = true;
                            }
                        }

                        if (isDismissed) {
                            updateBadge(item, 0);
                        } else {
                            updateBadge(item, data.count);

                            // Show top alert if on the corresponding page
                            if (pageToKey[currentPage] === data.key && data.count > 0) {
                                showPageAlert(data.count, data.msg, data.key);
                            }
                        }
                        break;
                    }
                }
            });
        }
    } catch (e) {
        console.error('Notification error:', e);
    }
}

function updateBadge(item, count) {
    let badge = item.querySelector('.nav-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'nav-badge';
            item.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
        badge.remove();
    }
}

/**
 * Shows dismissible alert at the top of the content
 */
function showPageAlert(count, message, key) {
    const wrapper = document.querySelector('.content-wrapper');
    if (!wrapper || document.querySelector('.page-notification-alert')) return;

    const alert = document.createElement('div');
    alert.className = 'page-notification-alert';
    alert.innerHTML = `
        <div class="pna-content">
            <i class="fas fa-exclamation-circle pna-icon"></i>
            <span>You have <strong>${count}</strong> ${message} that require attention.</span>
        </div>
        <button class="pna-ok-btn">OK</button>
    `;

    alert.querySelector('.pna-ok-btn').onclick = () => {
        if (key === 'customers') {
            localStorage.setItem('dismissed_customers_date', new Date().toDateString());
        } else {
            sessionStorage.setItem(`dismissed_${key}`, 'true');
        }

        alert.style.opacity = '0';
        alert.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            alert.remove();
            // Also hide the sidebar badge immediately
            initNotifications();
        }, 300);
    };

    wrapper.prepend(alert);
}
