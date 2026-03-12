const Product = require("../models/Product");

/**
 * Generates a unique SKU for a product based on brand and category names.
 * Format: BRANDCODE-CATEGORYCODE-XXXX
 * @param {string} brandName - Name of the brand
 * @param {string} catName - Name of the category
 * @returns {Promise<string>} - Generated unique SKU
 */
exports.generateSKU = async (brandName, catName) => {
    try {
        // 1. Generate Prefix
        const brandCode = brandName.substring(0, 2).toUpperCase();
        const catCode = catName.substring(0, 3).toUpperCase();
        const prefix = `${brandCode}-${catCode}-`;

        // 2. Find the last product with this prefix
        // We use a regex to match the prefix followed by 4 digits
        const lastProduct = await Product.findOne({
            sku: new RegExp(`^${prefix}\\d{4}$`)
        }).sort({ sku: -1 });

        let nextNumber = 1;
        if (lastProduct && lastProduct.sku) {
            const parts = lastProduct.sku.split('-');
            const lastNum = parseInt(parts[parts.length - 1]);
            if (!isNaN(lastNum)) {
                nextNumber = lastNum + 1;
            }
        }

        // 3. Increment and pad with zeros
        let sku = `${prefix}${String(nextNumber).padStart(4, '0')}`;

        // 4. Safety check: ensure it's actually unique (edge cases)
        let unique = false;
        let attempts = 0;
        while (!unique && attempts < 10) {
            const existing = await Product.findOne({ sku });
            if (!existing) {
                unique = true;
            } else {
                nextNumber++;
                sku = `${prefix}${String(nextNumber).padStart(4, '0')}`;
                attempts++;
            }
        }

        return sku;
    } catch (error) {
        console.error("SKU Generation Error:", error);
        throw new Error("Failed to generate unique SKU");
    }
};
