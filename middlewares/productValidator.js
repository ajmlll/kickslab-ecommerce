const Product = require("../models/Product");

/**
 * Middleware to validate product data before creation or update
 */
exports.validateProduct = async (req, res, next) => {
    try {
        const {
            name,
            brand,
            category,
            price,
            offerPrice,
            stock,
            description,
            existingGallery,
            galleryUpdate
        } = req.body;

        const errors = {};

        // 1. Product Name Validation
        if (!name || name.trim().length === 0) {
            errors.name = "Product name is required";
        } else {
            const trimmedName = name.trim();
            if (trimmedName.length < 3) errors.name = "Product name must be at least 3 characters";
            if (trimmedName.length > 100) errors.name = "Product name cannot exceed 100 characters";
            if (!/^[a-zA-Z0-9\s\-&()\/+.,' ]+$/.test(trimmedName)) {
                errors.name = "Product name contains invalid special characters";
            }
        }

        // 2. Brand Validation
        if (!brand || brand.trim() === "") {
            errors.brand = "Brand is required";
        }

        // 3. Category Validation
        if (!category || category.trim() === "") {
            errors.category = "Category is required";
        }

        // 4. Price Validation
        const numPrice = Number(price);
        if (!price || isNaN(numPrice)) {
            errors.price = "Valid price is required";
        } else if (numPrice <= 0) {
            errors.price = "Price must be greater than 0";
        } else if (numPrice > 100000) {
            errors.price = "Price cannot exceed 1,00,000";
        }

        // 5. Offer Price Validation
        if (offerPrice) {
            const numOffer = Number(offerPrice);
            if (isNaN(numOffer)) {
                errors.offerPrice = "Offer price must be a number";
            } else if (numOffer < 0) {
                errors.offerPrice = "Offer price cannot be negative";
            } else if (numOffer > numPrice) {
                errors.offerPrice = "Sale price cannot be higher than product price";
            }
        }

        // 6. Stock Validation
        const numStock = Number(stock);
        if (stock === undefined || isNaN(numStock)) {
            errors.stock = "Stock quantity is required";
        } else if (!Number.isInteger(numStock)) {
            errors.stock = "Stock must be an integer";
        } else if (numStock < 0) {
            errors.stock = "Stock cannot be negative";
        } else if (numStock > 10000) {
            errors.stock = "Stock cannot exceed 10,000";
        }

        // 7. Description Validation
        if (!description || description.trim().length === 0) {
            errors.description = "Product description is required";
        } else {
            const trimmedDesc = description.trim();
            if (trimmedDesc.length < 20) errors.description = "Description must be at least 20 characters";
            if (trimmedDesc.length > 2000) errors.description = "Description cannot exceed 2000 characters";
        }

        // 8. Image Validation
        // Image fields are transformed into objects by uploadHandler: req.files['image'], req.files['gallery']
        const newMainImage = req.files && req.files['image'] ? 1 : 0;
        const newGalleryImages = req.files && req.files['gallery'] ? req.files['gallery'].length : 0;

        // Count existing images if updating
        let existingCount = 0;
        if (req.method === 'PUT') {
            const product = await Product.findById(req.params.id);
            if (product) {
                // If main image is not being replaced, count the existing one
                if (!newMainImage && product.image) existingCount += 1;

                // If gallery is being updated, use the provided existingGallery list
                if (galleryUpdate === 'true') {
                    if (existingGallery) {
                        existingCount += Array.isArray(existingGallery) ? existingGallery.length : 1;
                    }
                } else {
                    // If no explicit gallery update, assume all current gallery images are kept
                    existingCount += product.gallery ? product.gallery.length : 0;
                }
            }
        }

        const totalImages = newMainImage + newGalleryImages + existingCount;

        if (totalImages === 0) {
            errors.images = "Please upload at least one product image";
        } else if (totalImages > 5) {
            errors.images = "Maximum 5 images allowed per product";
        }

        // 9. Duplicate Product Check (Name + Brand)
        if (!errors.name && !errors.brand) {
            const query = {
                name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
                brand: brand
            };
            // If updating, exclude current product
            if (req.method === 'PUT') {
                query._id = { $ne: req.params.id };
            }

            const duplicate = await Product.findOne(query);
            if (duplicate) {
                errors.name = "A product with this name already exists for the selected brand";
            }
        }

        // If errors exist, return them
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: "fail",
                message: "Validation failed",
                errors
            });
        }

        next();
    } catch (error) {
        console.error("Validation Middleware Error:", error);
        res.status(500).json({ message: "Internal server error during validation" });
    }
};
