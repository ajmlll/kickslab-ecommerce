const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/category.controller");
const upload = require("../middlewares/upload");

const { protect, adminOnly, authorizeLevels } = require("../middlewares/auth.middleware");

router.post("/add-category", protect, adminOnly, upload.single('image'), categoryController.addCategory);
router.get("/categories", categoryController.getAllCategories);
router.put("/category/:id", protect, adminOnly, upload.single('image'), categoryController.updateCategory);
router.delete("/category/:id", protect, adminOnly, categoryController.deleteCategory);

module.exports = router;
