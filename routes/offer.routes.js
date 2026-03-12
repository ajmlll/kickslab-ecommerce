const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offer.controller");
const offerUpload = require("../middlewares/offerUpload");

const { protect, adminOnly, authorizeLevels } = require("../middlewares/auth.middleware");

// Public routes
router.get("/offers/active", offerController.getActiveOffers);

// Admin routes
router.get("/admin/offers", protect, adminOnly, offerController.getAllOffers);
router.post("/admin/offers", protect, adminOnly, offerUpload.single("bannerImage"), offerController.createOffer);
router.put("/admin/offers/:id", protect, adminOnly, offerUpload.single("bannerImage"), offerController.updateOffer);
router.delete("/admin/offers/:id", protect, adminOnly, offerController.deleteOffer);

module.exports = router;
