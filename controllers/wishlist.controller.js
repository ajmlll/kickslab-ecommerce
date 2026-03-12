const Wishlist = require("../models/wishlist.model");
const Product = require("../models/Product");
const { applyOffersToProducts } = require("../utils/offerHelper");

// GET USER WISHLIST
exports.getWishlist = async (req, res) => {
    try {
        if (req.user.id === "env-admin" || req.user.role === "admin") {
            return res.json({ items: [] });
        }

        const wishlistDoc = await Wishlist.findOne({ user: req.user.id })
            .populate("items.product");

        if (!wishlistDoc) {
            return res.json({ items: [] });
        }

        const wishlist = wishlistDoc.toObject();

        // Apply Offers to product data
        if (wishlist.items && wishlist.items.length > 0) {
            const productDocs = wishlist.items.map(item => item.product).filter(Boolean);
            const appliedProducts = await applyOffersToProducts(productDocs);

            let productIdx = 0;
            wishlist.items.forEach(item => {
                if (item.product) {
                    item.product = appliedProducts[productIdx++];
                }
            });
        }

        res.json(wishlist);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// TOGGLE WISHLIST ITEM (ADD/REMOVE)
exports.toggleWishlist = async (req, res) => {
    try {
        if (req.user.id === "env-admin" || req.user.role === "admin") {
            return res.status(403).json({ message: "Admin accounts cannot use wishlist" });
        }

        const { productId } = req.body;

        // Check if the product even exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        let wishlist = await Wishlist.findOne({ user: req.user.id });

        // Create a wishlist document if one doesn't exist
        if (!wishlist) {
            wishlist = new Wishlist({
                user: req.user.id,
                items: []
            });
        }

        const itemIndex = wishlist.items.findIndex(
            item => item.product && item.product.toString() === productId
        );

        let isAdded = false;

        if (itemIndex > -1) {
            // It exists -> Remove it
            wishlist.items.splice(itemIndex, 1);
            isAdded = false;
        } else {
            // Doesn't exist -> Add it
            wishlist.items.push({ product: productId });
            isAdded = true;
        }

        await wishlist.save();

        res.json({ success: true, isAdded, wishlist });
    } catch (error) {
        console.error("TOGGLE WISHLIST ERROR:", error);
        res.status(500).json({ message: error.message });
    }
};
