const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { protect } = require("../middlewares/auth.middleware");

router.get("/get-key", protect, paymentController.getRazorpayKey);
router.post("/create-order", protect, paymentController.createRazorpayOrder);
router.post("/verify", protect, paymentController.verifyPayment);

module.exports = router;
