// ============================================================================
// 1. Imports
// ============================================================================
const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("./config/passport.config");
const jwt = require("jsonwebtoken");

// Custom Middlewares & Error Handling
const AppError = require("./utils/AppError");
const globalErrorHandler = require("./controllers/error.controller");
const { protectStatic } = require("./middlewares/staticAuth.middleware");

// ============================================================================
// 2. App Initialization
// ============================================================================
const app = express();

// ============================================================================
// 3. Security Middlewares
// ============================================================================
// Content Security Policy (Must be early to apply to static files)
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://checkout.razorpay.com https://api.razorpay.com https://cdn.jsdelivr.net; " +
        "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://checkout.razorpay.com https://api.razorpay.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
        "img-src 'self' data: https: blob:; " +
        "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com; " +
        "connect-src 'self' https:;"
    );
    next();
});

// CORS Configuration
app.use(cors({
    origin: true,
    credentials: true
}));

// ============================================================================
// 4. Body Parsers & Cookies
// ============================================================================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// ============================================================================
// 5. Session & Passport Setup
// ============================================================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'kickslab-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// ============================================================================
// 6. Static Files & Protection
// ============================================================================
// Static Files Protection (After cookieParser, before static)
app.use(protectStatic);

// Serve Static Files
app.use(express.static(path.join(__dirname, "public")));

// ============================================================================
// 7. Development Tools
// ============================================================================
// Request Logging (Development Only)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
        next();
    });
}

// ============================================================================
// 8. Routes
// ============================================================================

// --- UI Redirects (Legacy support) ---
app.get("/", (req, res) => res.redirect("/user/Landingpage.html"));
app.get("/verify-email", (req, res) => res.sendFile(path.join(__dirname, "public/user/otp-verification.html")));
app.get("/user", (req, res) => res.sendFile(path.join(__dirname, "public/user/Landingpage.html")));
app.get("/default", (req, res) => res.redirect("/user/Landingpage.html"));

// --- User API Routes ---
app.use("/api/users", require("./routes/userAuth.routes"));
app.use("/api/users/profile", require("./routes/userProfile.routes"));

// --- Admin API Routes ---
app.use("/api/admin", require("./routes/category.routes"));
app.use("/api/admin", require("./routes/brand.routes"));
app.use("/api/admin", require("./routes/product.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

// --- E-Commerce API Routes ---
app.use("/api/cart", require("./routes/cart.routes"));
app.use("/api/wishlist", require("./routes/wishlist.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/payment", require("./routes/payment.routes"));
app.use("/api/addresses", require("./routes/address.routes"));
app.use("/api/reviews", require("./routes/review.routes"));
app.use("/api/returns", require("./routes/return.routes"));
app.use("/api/coupons", require("./routes/coupon.routes"));
app.use("/api/wallet", require("./routes/wallet.routes"));
app.use("/api", require("./routes/offer.routes"));
app.use("/api/contact", require("./routes/contact.routes"));

// ============================================================================
// 9. OAuth Routes (Google)
// ============================================================================
app.get("/auth/google", (req, res, next) => {
    if (req.query.remember) {
        req.session.googleRememberMe = req.query.remember === 'true';
    }
    next();
}, passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/user/login.html?error=google_failed" }),
    (req, res) => {
        const user = req.user;
        const rememberMe = req.session.googleRememberMe;
        
        // Generate JWT (same as normal login)
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        const cookieName = user.role === "admin" ? "adminToken" : "token";
        const cookieOptions = {
            httpOnly: true,
            sameSite: "lax",
            path: "/"
        };

        if (rememberMe) {
            cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
        }

        res.cookie(cookieName, token, cookieOptions);

        // Redirect based on role
        if (user.role === "admin") {
            res.redirect("/admin/dashboard.html");
        } else {
            res.redirect("/user/Landingpage.html");
        }
    }
);

// ============================================================================
// 10. 404 Handlers
// ============================================================================
// Handle undefined API routes (Forward to global error handler)
app.all('/api/*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Handle undefined Frontend routes (Show custom 404 page)
app.all('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
});

// ============================================================================
// 11. Global Error Handler
// ============================================================================
app.use(globalErrorHandler);

module.exports = app;
