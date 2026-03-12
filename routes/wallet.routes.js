const express = require("express");
const router = express.Router();
const walletController = require("../controllers/wallet.controller");
const { protect } = require("../middlewares/auth.middleware");

router.get("/", protect, walletController.getWalletData);
router.post("/add-fund", protect, walletController.createWalletOrder);
router.post("/verify-payment", protect, walletController.verifyWalletPayment);

module.exports = router;
