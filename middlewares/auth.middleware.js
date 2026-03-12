const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

exports.protect = async (req, res, next) => {
  let token;
  const urlPath = req.originalUrl ? req.originalUrl.split('?')[0] : '';
  const isAdminAPI = urlPath.startsWith("/api/admin");

  // Strictly use correct token based on API type
  if (isAdminAPI) {
    token = req.cookies.adminToken;
  } else {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 SuperAdmin Verification (Only for adminToken)
    if (isAdminAPI && (decoded.id === "env-admin" || decoded.isEnvAdmin)) {
      req.user = {
        _id: "env-admin",
        id: "env-admin",
        role: "admin",
        isEnvAdmin: true,
        name: "System SuperAdmin"
      };
      return next();
    }

    const user = await User.findById(decoded.id).select("isBlocked role");
    if (!user) {
      return res.status(401).json({ success: false, message: "User no longer exists" });
    }

    if (user.isBlocked) {
      res.clearCookie("token", { path: "/" });
      res.clearCookie("adminToken", { path: "/" });
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked",
        blocked: true
      });
    }

    // Role Enforcement
    if (isAdminAPI && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    
    // STRICTLY block Admins from User APIs if they are using their adminToken
    if (!isAdminAPI && user.role === 'admin' && isAdminAPI) { // Logic safety
        return res.status(403).json({ success: false, message: "User access required" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.isEnvAdmin)) return next();
  return res.status(403).json({ success: false, message: "Admin access required" });
};
