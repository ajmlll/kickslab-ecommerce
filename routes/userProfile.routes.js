const express = require("express");
const router = express.Router();
const { getProfile, updateProfile, changePassword } = require("../controllers/userProfile.controller");
const { protect } = require("../middlewares/auth.middleware");

router.get("/", protect, getProfile);
router.put("/update", protect, updateProfile);
router.put("/change-password", protect, changePassword);

module.exports = router;
