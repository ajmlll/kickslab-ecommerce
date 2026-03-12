const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const analyticsController = require("../controllers/analytics.controller");
const userProfileController = require("../controllers/userProfile.controller");
const { protect, adminOnly } = require("../middlewares/auth.middleware");

router.get("/profile", protect, adminOnly, userProfileController.getProfile);

router.get("/dashboard-stats", protect, adminOnly, adminController.getDashboardStats);
router.get("/notifications", protect, adminOnly, adminController.getNotifications);
router.get("/analytics", protect, adminOnly, analyticsController.getAnalyticsData);
router.get("/analytics/report", protect, adminOnly, analyticsController.downloadReport);

// Transactions Report
router.get("/transactions", protect, adminOnly, adminController.getTransactions);

module.exports = router;
