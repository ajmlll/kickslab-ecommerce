/**
 * Admin Profile Helper
 * Simplifies UI handling. Since we only use SuperAdmin, 
 * all UI restrictions are unblocked.
 */
// AdminAuth script loaded

window.AdminAuth = {
    profile: null,

    async getProfile() {
        if (this.profile) return this.profile;

        // Static Admin Profile
        this.profile = {
            id: 'admin',
            name: 'Admin',
            role: 'admin',
            isEnvAdmin: true
        };
        return this.profile;
    },

    async getLevel() {
        return 'admin';
    },

    async isSuperAdmin() {
        return true;
    },

    async isManager() {
        return true;
    },

    async isEditor() {
        return true;
    },

    async applyRestrictions() {
        // Find and enable all elements that were historically blocked or could be blocked.
        document.querySelectorAll('[data-rbac-blocked]').forEach(el => this.enableElement(el));

        // Find and ensure Add Button doesn't attempt to open a deleted admin page UI (if present from cached views).
        const addBtn = document.getElementById('openAddModal');
        const adminRolePage = 'admin-role.html';
        const currentPath = window.location.pathname.split('/').pop().toLowerCase();

        if (addBtn && currentPath.includes(adminRolePage)) {
            // we'll actually route them away anyway because admin-role.html is deleted,
            // but just display 'none' for safety just in case.
            addBtn.style.display = 'none';
        }

    },

    enableElement(el) {
        if (!el.hasAttribute('data-rbac-blocked')) return;
        el.removeAttribute('data-rbac-blocked');
        el.style.opacity = '';
        el.style.filter = '';
        el.style.cursor = '';
        el.removeAttribute('data-rbac-tooltip');
        el.title = '';
        if (el._rbacHandler) {
            el.removeEventListener('click', el._rbacHandler, true);
            el.removeEventListener('mousedown', el._rbacHandler, true);
        }
    }
};

// AdminAuth initialized successfully (SuperAdmin Only Mode).
window.AdminAuth.applyRestrictions();
