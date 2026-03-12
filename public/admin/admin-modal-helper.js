/**
 * Admin Modal Utility
 * Replaces browser alert() and confirm() with premium UI
 * Added safety to prevent "dim screen" (stale overlays)
 */

const AdminModal = {
    /**
     * Show an alert modal
     * @param {string} message - Message to display
     * @param {string} type - info, success, warning, error (default: info)
     * @returns {Promise}
     */
    alert(message, type = 'info') {
        return new Promise((resolve) => {
            const overlay = this._createBase(message, type);
            const footer = overlay.querySelector('.admin-modal-footer');

            const okBtn = document.createElement('button');
            okBtn.className = 'admin-modal-btn primary';
            okBtn.textContent = 'OK';
            okBtn.onclick = () => {
                this._close(overlay);
                resolve(true);
            };

            footer.appendChild(okBtn);
            this._show(overlay);
        });
    },

    /**
     * Show a confirmation modal
     * @param {string} message - Question to ask
     * @param {string} type - warning, info (default: warning)
     * @returns {Promise<boolean>}
     */
    confirm(message, type = 'warning') {
        return new Promise((resolve) => {
            const overlay = this._createBase(message, type);
            const footer = overlay.querySelector('.admin-modal-footer');

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'admin-modal-btn secondary';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => {
                this._close(overlay);
                resolve(false);
            };

            const confirmBtn = document.createElement('button');
            confirmBtn.className = type === 'error' ? 'admin-modal-btn danger' : 'admin-modal-btn primary';
            confirmBtn.textContent = 'Yes, Proceed';
            confirmBtn.onclick = () => {
                this._close(overlay);
                resolve(true);
            };

            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);
            this._show(overlay);
        });
    },

    /**
     * Remove all existing modal overlays from the DOM
     * Clears both new admin-modal-overlay and legacy modal-overlay
     */
    clearAll() {
        const adminOverlays = document.querySelectorAll('.admin-modal-overlay');
        adminOverlays.forEach(el => {
            if (!el.id || el.id === 'active-admin-modal') {
                el.remove();
            } else {
                el.classList.remove('active');
            }
        });

        const legacyOverlays = document.querySelectorAll('.modal-overlay');
        legacyOverlays.forEach(el => {
            if (!el.id || !el.id.includes('Modal')) { // dont remove hardcoded functional modals
                el.remove();
            } else {
                el.classList.remove('active');
                el.style.display = '';
            }
        });

        document.body.style.overflow = '';
    },

    _createBase(message, type) {
        // --- SAFETY: Remove any existing stale overlays before creating new one ---
        this.clearAll();

        const overlay = document.createElement('div');
        overlay.className = 'admin-modal-overlay';
        overlay.id = 'active-admin-modal';

        const icons = {
            info: '<i class="fas fa-info-circle"></i>',
            success: '<i class="fas fa-check-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            error: '<i class="fas fa-times-circle"></i>'
        };

        const titles = {
            info: 'Notice',
            success: 'Success',
            warning: 'Are you sure?',
            error: 'Alert'
        };

        overlay.innerHTML = `
            <div class="admin-modal-container">
                <div class="admin-modal-icon ${type}">${icons[type] || icons.info}</div>
                <div class="admin-modal-title">${titles[type] || titles.info}</div>
                <div class="admin-modal-message">${message}</div>
                <div class="admin-modal-footer"></div>
            </div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    },

    _show(overlay) {
        // Trigger reflow for animation
        overlay.offsetHeight;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    _close(overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
};

// Global safety: Clear any stale overlays on page load
if (typeof window !== 'undefined') {
    window.AdminModal = AdminModal; // Ensure global access

    // Clear on DOM Ready
    document.addEventListener('DOMContentLoaded', () => AdminModal.clearAll());

    // Clear on Full Page Load (including all assets)
    window.addEventListener('load', () => AdminModal.clearAll());

    // Backup: clear if readyState is already complete
    if (document.readyState === 'complete') {
        AdminModal.clearAll();
    }
}
