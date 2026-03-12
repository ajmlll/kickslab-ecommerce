const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order.controller");
const { protect, adminOnly, authorizeLevels } = require("../middlewares/auth.middleware");

// User Routes
router.post("/", protect, orderController.placeOrder);
router.get("/my-orders", protect, orderController.getUserOrders);
router.get("/:orderId", protect, orderController.getOrderDetails);
router.put("/user-cancel/:orderId", protect, orderController.userCancelOrder);

// Order Management
router.get("/admin/all", protect, adminOnly, orderController.getAllOrders);
// Only Editor or higher can update status
router.put("/admin/:orderId/status", protect, adminOnly, orderController.updateOrderStatus);
// Only Manager or higher can refund
router.put('/admin/:orderId/refund', protect, adminOnly, orderController.refundToWallet);

module.exports = router;
