const jwt = require("jsonwebtoken");
const path = require("path");
const User = require("../models/user.model");

const PUBLIC_PAGES = [
    "landingpage.html",
    "login.html",
    "signup.html",
    "aboutpage.html",
    "forgot-password.html",
    "otp-verification.html",
    "reset-password.html",
    "404.html",
    "productlisting.html",
    "productdetail.html",
    "contact.html"
];

/**
 * COMPREHENSIVE ROUTE PROTECTION MIDDLEWARE
 * - Handles: checkUserAuth, checkAdminAuth equivalent logic
 * - Prevents: Unauthorized direct URL access for /user/* and /admin/*
 * - Role Security: strictly bars normal users from admin pages
 * - Session Expiration: automatically redirects to login if JWT is expired/missing on any navigation
 */
exports.protectStatic = async (req, res, next) => {
    // 1. Force No-Cache for all requests handled by this middleware
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const urlPath = req.path.toLowerCase();
    const fileName = path.basename(urlPath);

    console.log(`[PROTECT_STATIC_TRACE] Path: ${req.path}, urlPath: ${urlPath}`);

    // Safety check for cookies
    const cookies = req.cookies || {};

    // 1.5. Skip static assets (JS, CSS, images, etc.)
    const ext = path.extname(urlPath);
    if (ext && ext !== '.html') {
        return next();
    }

    // Only intercept .html files (or directory-style access to protected folders)
    const isHtml = urlPath.endsWith(".html");

    // Robust checks for protected directories
    const isAdminPath = urlPath === "/admin" || urlPath.startsWith("/admin/");
    const isUserPath = urlPath === "/user" || urlPath.startsWith("/user/");

    console.log(`[PROTECT_STATIC] isHtml: ${isHtml}, isAdminPath: ${isAdminPath}, isUserPath: ${isUserPath}`);

    if (!isHtml && !isAdminPath && !isUserPath) {
        console.log(`[PROTECT_STATIC] Skipping: Not a protected path or HTML file.`);
        return next();
    }

    // 2. Whitelist (Public Pages - Check only filename)
    if (PUBLIC_PAGES.includes(fileName)) {
        console.log(`[PROTECT_STATIC] Allowed: Whitelisted public page -> ${fileName}`);
        return next();
    }

    const token = cookies.token;
    const adminToken = cookies.adminToken;

    // 2.5 Auto-Redirect Logged-in Users away from Login/Signup
    if (PUBLIC_PAGES.includes(fileName)) {
        // If they have an adminToken, they might be an admin
        if (adminToken) {
            try {
                const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
                if (decoded.role === "admin") {
                    console.log(`[AUTH] Auto-Redirect: Admin already logged in. Redirecting to /admin/dashboard.html`);
                    return res.redirect("/admin/dashboard.html");
                }
            } catch (e) { /* ignore and let show login */ }
        }
        // If they have a user token, they might be a user
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.role === "user") {
                    console.log(`[AUTH] Auto-Redirect: User already logged in. Redirecting to /user/Landingpage.html`);
                    return res.redirect("/user/Landingpage.html");
                }
            } catch (e) { /* ignore */ }
        }

        console.log(`[PROTECT_STATIC] Allowed: Whitelisted public page -> ${fileName}`);
        return next();
    }

    // 3. Admin Pages Protection (/admin)
    if (isAdminPath) {
        if (!adminToken) {
            console.log(`[AUTH_ADMIN_FAIL] No adminToken found. Path: ${req.path}. Redirecting to login.`);
            return res.redirect("/user/login.html?reason=no_token");
        }

        try {
            const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
            // Protect Admin Routes - Allow env-admin or database admins
            let user;
            if (decoded.id === "env-admin" || decoded.isEnvAdmin) {
                user = {
                    _id: "env-admin",
                    id: "env-admin",
                    role: "admin",
                    isEnvAdmin: true
                };
            } else {
                // Check if user exists and is an admin
                user = await User.findById(decoded.id);
                if (!user || user.role !== "admin" || user.isBlocked) {
                    console.log(`[AUTH_ADMIN_FAIL] Unauthorized admin access attempt. Denied.`);
                    res.clearCookie("adminToken", { path: "/" });
                    return res.redirect("/user/login.html?reason=unauthorized_admin");
                }
            }

            req.user = user;
            return next();
        } catch (err) {
            console.log(`[AUTH_ADMIN_ERROR] JWT Verification Error: ${err.message}. Path: ${req.path}`);
            // Clear invalid token
            res.clearCookie("adminToken", { path: "/" });
            return res.redirect("/user/login.html?reason=session_expired");
        }
    }

    // 4. User Protected Pages (/user)
    if (isUserPath) {
        let authorized = false;

        // Check ONLY for User Token (Admins should NOT access user pages)
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                // Check Block Status
                let user;
                if (decoded.id === "env-admin" || decoded.isEnvAdmin) {
                    // Even a SuperAdmin should use the Admin side, but if they are here, we verify role
                    if (decoded.role !== 'user' && !decoded.isEnvAdmin) authorized = false;
                    else user = { _id: "env-admin", role: "admin", isEnvAdmin: true };
                } else {
                    user = await User.findById(decoded.id);
                    if (user) {
                        if (user.isBlocked) {
                            res.clearCookie("token", { path: "/" });
                            authorized = false;
                            return res.redirect("/user/Landingpage.html?action=login&blocked=true");
                        }
                        // Strictly verify role is 'user'
                        if (user.role === 'user') {
                            authorized = true;
                        } else {
                            authorized = false;
                            console.log(`[AUTH] User Path Reject: User has role ${user.role}. Redirecting.`);
                        }
                    }
                }

                if (user && user.role === 'user') authorized = true;
            } catch (e) {
                res.clearCookie("token", { path: "/" });
            }
        }

        if (authorized) return next();

        // Unauthorized access to protected user pages -> Redirect to Landing
        console.log(`[AUTH] User Redirect: Unauthorized ${req.path}. Redirecting to /user/Landingpage.html`);
        return res.redirect("/user/Landingpage.html");
    }

    next();
};
