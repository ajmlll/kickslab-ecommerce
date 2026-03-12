const router = require("express").Router();
const { protect } = require("../middlewares/auth.middleware");
const {
  getCart,
  addToCart,
  removeItem
} = require("../controllers/cart.controller");

router.get("/", protect, getCart);
router.post("/add", protect, addToCart);
router.delete("/:productId", protect, removeItem);

module.exports = router;