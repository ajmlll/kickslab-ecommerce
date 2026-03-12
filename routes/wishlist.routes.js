const router = require("express").Router();
const { protect } = require("../middlewares/auth.middleware");
const { getWishlist, toggleWishlist } = require("../controllers/wishlist.controller");

router.get("/", protect, getWishlist);
router.post("/toggle", protect, toggleWishlist);

module.exports = router;
