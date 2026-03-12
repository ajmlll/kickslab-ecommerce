const Offer = require('../models/offer.model');
const mongoose = require('mongoose');

/**
 * Applies the best active offer (product, category, or brand level) 
 * to a list of products.
 * 
 * @param {Array|Object} products - A single product object or an array of product objects (Mongoose documents or lean objects).
 * @returns {Array|Object} The augmented product(s) with 'dynamicOfferPrice' and 'appliedOffer' fields.
 */
exports.applyOffersToProducts = async (products) => {
    try {
        const isArray = Array.isArray(products);
        const productList = isArray ? products : [products];

        if (!productList || productList.length === 0) return products;

        // Fetch all active offers
        const now = new Date();
        const activeOffers = await Offer.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        if (activeOffers.length === 0) {
            return products; // No active offers
        }

        // Process each product
        const processedProducts = productList.map(prod => {
            // Unpack Mongoose doc if necessary
            const p = prod.toObject ? prod.toObject() : { ...prod };

            let bestOfferDiscountPercentage = 0;
            let bestOfferPrice = p.price;
            let bestOfferLabel = '';

            // 1. Calculate best discount from Active Offers
            activeOffers.forEach(offer => {
                let isApplicable = false;

                // Check applicability based on offerType
                if (offer.offerType === 'product') {
                    if (p._id.toString() === offer.targetId.toString()) isApplicable = true;
                } else if (offer.offerType === 'category') {
                    if (p.category && (p.category._id || p.category).toString() === offer.targetId.toString()) isApplicable = true;
                } else if (offer.offerType === 'brand') {
                    if (p.brand && (p.brand._id || p.brand).toString() === offer.targetId.toString()) isApplicable = true;
                }

                if (isApplicable) {
                    let calculatedPrice = p.price;
                    let currentPercentage = 0;
                    let currentLabel = '';

                    if (offer.discountType === 'percentage') {
                        calculatedPrice = p.price - (p.price * (offer.discountValue / 100));
                        currentPercentage = offer.discountValue;
                        currentLabel = `-${offer.discountValue}%`;
                    } else if (offer.discountType === 'flat') {
                        calculatedPrice = p.price - offer.discountValue;
                        currentPercentage = Math.round((offer.discountValue / p.price) * 100);
                        currentLabel = `-₹${offer.discountValue}`;
                    }

                    // Prevent negative prices
                    if (calculatedPrice < 0) calculatedPrice = 0;

                    if (currentPercentage > bestOfferDiscountPercentage) {
                        bestOfferDiscountPercentage = currentPercentage;
                        bestOfferPrice = calculatedPrice;
                        bestOfferLabel = currentLabel;
                    }
                }
            });

            // 2. Calculate Product-Level static discount
            let productDiscountPercentage = 0;
            let productOfferPrice = p.price;
            let productLabel = '';

            if (p.offerPrice && p.offerPrice < p.price) {
                if (p.discountType === 'percent') {
                    productDiscountPercentage = p.discountValue;
                    productLabel = `-${p.discountValue}%`;
                } else if (p.discountType === 'fixed') {
                    productDiscountPercentage = Math.round((p.discountValue / p.price) * 100);
                    productLabel = `-₹${p.discountValue}`;
                } else {
                    // Fallback calculation if types are missing
                    productDiscountPercentage = Math.round(((p.price - p.offerPrice) / p.price) * 100);
                    productLabel = `-${productDiscountPercentage}%`;
                }
                productOfferPrice = p.offerPrice;
            }

            // 3. Compare and determine finalDiscount and discountSource
            let finalDiscount = 0;
            let discountSource = null;
            let dynamicOfferPrice = p.price;
            let discountLabel = '';

            // If product has its own discount and it's greater or equal to the offer discount
            if (productDiscountPercentage > 0 && productDiscountPercentage >= bestOfferDiscountPercentage) {
                finalDiscount = productDiscountPercentage;
                discountSource = "product";
                dynamicOfferPrice = productOfferPrice;
                discountLabel = productLabel;
            }
            // If active offer discount is strictly greater than product discount
            else if (bestOfferDiscountPercentage > 0 && bestOfferDiscountPercentage > productDiscountPercentage) {
                finalDiscount = bestOfferDiscountPercentage;
                discountSource = "offer";
                dynamicOfferPrice = bestOfferPrice;
                discountLabel = bestOfferLabel;
            }

            p.finalDiscount = finalDiscount;
            p.discountSource = discountSource;
            p.dynamicOfferPrice = dynamicOfferPrice;
            p.discountLabel = discountLabel;

            return p;
        });

        return isArray ? processedProducts : processedProducts[0];

    } catch (error) {
        console.error("Error applying offers to products:", error);
        return products;
    }
};
