const express = require("express");
const router = express.Router();
const brandController = require("../controllers/brand.controller");
const upload = require("../middlewares/upload");

const { protect, adminOnly, authorizeLevels } = require("../middlewares/auth.middleware");

router.get("/brands", brandController.getAllBrands);
router.post("/brands", protect, adminOnly, upload.single('image'), brandController.createBrand);
router.put("/brands/:id", protect, adminOnly, upload.single('image'), brandController.updateBrand);
router.delete("/brands/:id", protect, adminOnly, brandController.deleteBrand);

module.exports = router;
