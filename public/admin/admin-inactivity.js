/**
 * Admin Inactivity Logout System
 * Tracks mouse/keyboard/scroll activity.
 * Logs out admin after 15 minutes of inactivity.
 * Shows a warning modal at 14 minutes.
 */

(function () {
    // Only run on admin pages
    if (!window.location.pathname.startsWith('/admin') || window.location.pathname.includes('/user/login.html')) {
        return;
    }

    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
    const WARNING_LIMIT_MS = 14 * 60 * 1000;    // 14 minutes
    const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes between heartbeats (throttle)

    let lastActivityTime = Date.now();
    let lastHeartbeatTime = Date.now();
    let checkInterval;
    let warningModalOverlay = null;
    let isWarningActive = false;

    // Throttle for activity events to save CPU
    let ticking = false;

    function resetActivity() {
        lastActivityTime = Date.now();

        // If warning is active, user clicked 'Stay Logged In' or interacted, we should remove the warning
        if (isWarningActive) {
            closeWarningModal();
            // Force a heartbeat since they just proved they are active after a warning
            sendHeartbeat();
        }

        // Throttle heartbeat to backend to avoid spam
        if (Date.now() - lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
            sendHeartbeat();
        }
    }

    function handleActivityEvent() {
        if (!ticking) {
            requestAnimationFrame(() => {
                resetActivity();
                ticking = false;
            });
            ticking = true;
        }
    }

    // Bind events
    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    events.forEach(event => {
        window.addEventListener(event, handleActivityEvent, { passive: true });
    });

    async function sendHeartbeat() {
        try {
            lastHeartbeatTime = Date.now();
            await fetch('/api/users/admin/heartbeat', { method: 'POST', credentials: 'include' });
        } catch (e) {
            console.error("Heartbeat failed", e);
        }
    }

    async function executeLogout() {
        try {
            await fetch('/api/users/admin/logout-inactivity', { method: 'POST', credentials: 'include' });
        } catch (e) { }

        // Clear local storage data
        localStorage.removeItem('adminData');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userData');

        // Clear session storage notifications
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith('dismissed_')) sessionStorage.removeItem(key);
        });

        // Redirect with expired flag
        window.location.href = '/user/login.html?expired=true';
    }

    function validateState() {
        const now = Date.now();
        const timeSinceActivity = now - lastActivityTime;

        if (timeSinceActivity >= INACTIVITY_LIMIT_MS) {
            // FORCE LOGOUT
            clearInterval(checkInterval);
            executeLogout();
        } else if (timeSinceActivity >= WARNING_LIMIT_MS && !isWarningActive) {
            // SHOW WARNING
            showWarningModal();
        }
    }

    function showWarningModal() {
        if (isWarningActive) return;
        isWarningActive = true;

        if (typeof AdminModal !== 'undefined') {
            AdminModal.clearAll();
        }

        warningModalOverlay = document.createElement('div');
        warningModalOverlay.className = 'admin-modal-overlay active';
        warningModalOverlay.style.zIndex = '10000'; // above everything

        const timeLeftMatch = setInterval(() => {
            const tl = Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - (Date.now() - lastActivityTime)) / 1000));
            const timerEl = document.getElementById('inactivity-timer');
            if (timerEl) timerEl.textContent = tl;

            if (tl <= 0) {
                clearInterval(timeLeftMatch);
            }
        }, 1000);

        warningModalOverlay.innerHTML = `
            <div class="admin-modal-container">
                <div class="admin-modal-icon warning"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="admin-modal-title">Session Expiring Soon</div>
                <div class="admin-modal-message">
                    Your session will expire in <strong id="inactivity-timer">60</strong> seconds due to inactivity.
                </div>
                <div class="admin-modal-footer">
                    <button id="btn-logout-now" class="admin-modal-btn secondary">Logout</button>
                    <button id="btn-stay-logged-in" class="admin-modal-btn primary">Stay Logged In</button>
                </div>
            </div>
        `;

        document.body.appendChild(warningModalOverlay);

        document.getElementById('btn-stay-logged-in').addEventListener('click', () => {
            clearInterval(timeLeftMatch);
            resetActivity();
            sendHeartbeat(); // immediate heartbeat override
        });

        document.getElementById('btn-logout-now').addEventListener('click', () => {
            clearInterval(timeLeftMatch);
            executeLogout();
        });
    }

    function closeWarningModal() {
        isWarningActive = false;
        if (warningModalOverlay) {
            warningModalOverlay.remove();
            warningModalOverlay = null;
        }
    }

    // Start checking every second
    checkInterval = setInterval(validateState, 1000);

    // Initial heartbeat
    sendHeartbeat();

})();
