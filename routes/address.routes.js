const express = require("express");
const router = express.Router();
const addressController = require("../controllers/address.controller");
const { protect } = require("../middlewares/auth.middleware");

// Protect all address routes
router.use(protect);

router.post("/", addressController.addAddress);
router.get("/", addressController.getAllAddresses);
router.put("/:id", addressController.updateAddress);
router.delete("/:id", addressController.deleteAddress);
router.put("/:id/default", addressController.setDefaultAddress);

module.exports = router;
