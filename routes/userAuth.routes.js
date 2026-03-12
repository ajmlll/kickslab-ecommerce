const express = require("express");
const router = express.Router();

// ✅ IMPORT verifyOtp ALSO
const {
  signup,
  login,
  verifyOtp,
  resendOtp,
  forgotPasswordOtp,
  checkResetPermission,
  resetPassword,
  logout
} = require("../controllers/userAuth.controller");

const { protect, adminOnly, authorizeLevels } = require("../middlewares/auth.middleware");

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/forgot-password", forgotPasswordOtp);
router.get("/check-reset-permission", checkResetPermission);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);

// Admin Inactivity Routes
router.post("/admin/heartbeat", protect, adminOnly, require("../controllers/userAuth.controller").adminHeartbeat);
router.post("/admin/logout-inactivity", protect, adminOnly, require("../controllers/userAuth.controller").adminLogoutInactivity);

// Admin: User Management - Restricted to Manager level for CRUD
router.get("/admin/all", protect, adminOnly, require("../controllers/userAuth.controller").getAllUsers);
router.put("/admin/:userId/block", protect, adminOnly, require("../controllers/userAuth.controller").toggleBlockStatus);
router.delete("/admin/:userId", protect, adminOnly, require("../controllers/userAuth.controller").deleteUser);

module.exports = router;


