const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const Cart = require('../models/cart.model');
const Product = require('../models/Product');
const Order = require('../models/order.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Get all coupons (Admin)
// @route   GET /api/admin/coupons
exports.getCoupons = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    let query = {};
    if (search) {
        query.$or = [
            { code: { $regex: search, $options: "i" } },
            { discountType: { $regex: search, $options: "i" } },
            { status: { $regex: search, $options: "i" } }
        ];
    }

    const data = await Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const totalRecords = await Coupon.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    res.status(200).json({
        success: true,
        data,
        coupons: data,
        totalRecords,
        totalPages,
        currentPage: page
    });
});

// @desc    Create a coupon (Admin)
// @route   POST /api/admin/coupons
exports.createCoupon = catchAsync(async (req, res, next) => {
    const { code, discountType, discountValue, minPurchaseAmount, minProductsRequired, usageLimit, usageLimitPerUser } = req.body;
    let { startDate, expiryDate } = req.body;

    if (!startDate) startDate = undefined;
    if (!expiryDate) expiryDate = undefined;

    const exists = await Coupon.findOne({ code: code.toUpperCase() });
    if (exists) {
        return next(new AppError('Coupon code already exists', 400));
    }

    // Validations
    if (discountType === 'percent' && discountValue > 80) {
        return next(new AppError('Percentage discount cannot exceed 80%', 400));
    }
    if (discountType === 'fixed' && minPurchaseAmount > 0 && discountValue > minPurchaseAmount) {
        return next(new AppError('Flat discount cannot exceed minimum purchase amount', 400));
    }
    if (new Date(startDate) >= new Date(expiryDate)) {
        return next(new AppError('Start date must be before expiry date', 400));
    }
    if (usageLimit < 0 || usageLimitPerUser < 0) {
        return next(new AppError('Usage limits cannot be negative', 400));
    }

    const couponData = { ...req.body };
    if (!startDate) delete couponData.startDate;
    if (!expiryDate) delete couponData.expiryDate;

    const coupon = await Coupon.create(couponData);
    res.status(201).json({ success: true, coupon });
});

// @desc    Update a coupon (Admin)
// @route   PUT /api/admin/coupons/:id
exports.updateCoupon = catchAsync(async (req, res, next) => {
    const { discountType, discountValue, minPurchaseAmount, minProductsRequired, usageLimit, usageLimitPerUser } = req.body;
    let { startDate, expiryDate } = req.body;

    if (!startDate) startDate = undefined;
    if (!expiryDate) expiryDate = undefined;

    let coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
        return next(new AppError('Coupon not found', 404));
    }

    // Validations
    if (discountType === 'percent' && discountValue > 80) {
        return next(new AppError('Percentage discount cannot exceed 80%', 400));
    }
    const reqMinPurchase = minPurchaseAmount !== undefined ? minPurchaseAmount : coupon.minPurchaseAmount;
    if (discountType === 'fixed' && reqMinPurchase > 0 && discountValue > reqMinPurchase) {
        return next(new AppError('Flat discount cannot exceed minimum purchase amount', 400));
    }
    if (startDate && expiryDate && new Date(startDate) >= new Date(expiryDate)) {
        return next(new AppError('Start date must be before expiry date', 400));
    }

    const updateData = { ...req.body };
    if (!startDate) delete updateData.startDate;
    if (!expiryDate) delete updateData.expiryDate;

    coupon = await Coupon.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true
    });

    res.status(200).json({ success: true, coupon });
});

// @desc    Delete a coupon (Admin)
// @route   DELETE /api/admin/coupons/:id
exports.deleteCoupon = catchAsync(async (req, res, next) => {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
        return next(new AppError('Coupon not found', 404));
    }

    await coupon.deleteOne();
    res.status(200).json({ success: true, message: 'Coupon deleted' });
});

// @desc    Apply coupon (User)
// @route   POST /api/coupons/apply
exports.applyCoupon = catchAsync(async (req, res, next) => {
    const { code } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), status: 'Active' });

    if (!coupon) {
        return next(new AppError('Invalid or inactive coupon code', 404));
    }

    const now = new Date();
    if (now < coupon.startDate) {
        return next(new AppError(`Coupon will be active from ${coupon.startDate.toLocaleDateString()}`, 400));
    }
    if (now > coupon.expiryDate) {
        return next(new AppError('Coupon has expired', 400));
    }

    if (coupon.usedCount >= coupon.usageLimit) {
        return next(new AppError('Coupon usage limit reached', 400));
    }

    // Check per-user usage limit
    const userUsageCount = await Order.countDocuments({ userId: req.user.id, couponCode: code.toUpperCase() });
    if (userUsageCount >= coupon.usageLimitPerUser) {
        return next(new AppError('You have already used this coupon code.', 400));
    }

    // Fetch User Cart
    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
    if (!cart || cart.items.length === 0) {
        return next(new AppError('Your cart is empty', 400));
    }

    let cartTotal = 0;
    let applicableTotal = 0;
    let totalQuantity = 0;
    let allItemsDiscounted = true;

    cart.items.forEach(item => {
        const product = item.product;
        const price = product.offerPrice || product.price;
        const itemTotal = price * item.quantity;
        cartTotal += itemTotal;
        totalQuantity += item.quantity;

        const isOnSale = product.offerPrice && product.offerPrice < product.price;
        if (!isOnSale) allItemsDiscounted = false;

        // Check targeting (Category/Brand)
        let isEligibleProduct = false;
        if (coupon.applicableOn === 'all') {
            isEligibleProduct = true;
        } else if (coupon.applicableOn === 'category') {
            isEligibleProduct = product.category && product.category.toString() === coupon.applicableId.toString();
        } else if (coupon.applicableOn === 'brand') {
            isEligibleProduct = product.brand && product.brand.toString() === coupon.applicableId.toString();
        }

        if (isEligibleProduct) {
            if (coupon.isStackable || !isOnSale) {
                applicableTotal += itemTotal;
            }
        }
    });

    if (allItemsDiscounted && !coupon.isStackable) {
        return res.status(400).json({
            success: false,
            message: 'Coupons cannot be applied because all items already have active discounts.',
            allDiscounted: true
        });
    }

    if (coupon.minProductsRequired > 0 && totalQuantity < coupon.minProductsRequired) {
        return next(new AppError(`Add ${coupon.minProductsRequired - totalQuantity} more item(s) to use this coupon`, 400));
    }

    if (cartTotal < coupon.minPurchaseAmount) {
        return next(new AppError(`Add ₹${(coupon.minPurchaseAmount - cartTotal).toFixed(2)} more to use this coupon`, 400));
    }

    if (applicableTotal <= 0) {
        return next(new AppError('No eligible product found for this coupon.', 400));
    }

    const isPartial = applicableTotal < cartTotal;

    // Calculate discount
    let discount = 0;
    let maxDiscountApplied = false;

    if (coupon.discountType === 'percent') {
        discount = (applicableTotal * coupon.discountValue) / 100;
        if (coupon.maxDiscountAmount > 0 && discount > coupon.maxDiscountAmount) {
            discount = coupon.maxDiscountAmount;
            maxDiscountApplied = true;
        }
    } else {
        discount = coupon.discountValue;
    }

    if (discount > cartTotal) discount = cartTotal;

    res.status(200).json({
        success: true,
        discount,
        maxDiscountApplied,
        isPartial,
        code: coupon.code,
        title: coupon.title,
        message: isPartial
            ? 'Coupon applied only to eligible items in your cart.'
            : (maxDiscountApplied
                ? `Coupon applied! You saved ₹${discount.toFixed(2)} (max discount)`
                : `Coupon applied! You saved ₹${discount.toFixed(2)}`)
    });
});

// @desc    Get active coupons (User)
// @route   GET /api/coupons/active
exports.getActiveCoupons = catchAsync(async (req, res, next) => {
    const now = new Date();
    const coupons = await Coupon.find({
        status: 'Active',
        isVisibleToUsers: { $ne: false },
        startDate: { $lte: now },
        expiryDate: { $gt: now }
    }).sort({ expiryDate: 1 });

    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
    const cartItems = cart ? cart.items : [];

    let cartTotal = 0;
    let totalQuantity = 0;
    let allItemsDiscounted = cartItems.length > 0;

    cartItems.forEach(item => {
        const product = item.product;
        if (!product) return;
        const price = product.offerPrice || product.price;
        cartTotal += price * item.quantity;
        totalQuantity += item.quantity;
        if (!(product.offerPrice && product.offerPrice < product.price)) {
            allItemsDiscounted = false;
        }
    });

    const couponsWithUsageMeta = await Promise.all(coupons.map(async (c) => {
        const usageCount = await Order.countDocuments({ userId: req.user.id, couponCode: c.code });
        const isUsed = usageCount >= (c.usageLimitPerUser || 1);

        let isEligible = true;
        let ineligibilityReason = '';

        if (isUsed) {
            isEligible = false;
            ineligibilityReason = 'Already used';
        } else if (c.usedCount >= c.usageLimit) {
            isEligible = false;
            ineligibilityReason = 'Usage limit reached';
        } else if (allItemsDiscounted && !c.isStackable) {
            isEligible = false;
            ineligibilityReason = 'Not eligible for discounted items';
        } else if (c.minProductsRequired > 0 && totalQuantity < c.minProductsRequired) {
            isEligible = false;
            ineligibilityReason = `Add ${c.minProductsRequired - totalQuantity} more item(s)`;
        } else if (c.minPurchaseAmount > 0 && cartTotal < c.minPurchaseAmount) {
            isEligible = false;
            ineligibilityReason = `Add ₹${(c.minPurchaseAmount - cartTotal).toFixed(0)} more`;
        } else {
            // Check targeting
            let hasTargetMatch = false;
            if (c.applicableOn === 'all') {
                hasTargetMatch = true;
            } else {
                hasTargetMatch = cartItems.some(item => {
                    const product = item.product;
                    if (!product) return false;
                    if (c.applicableOn === 'category') {
                        return product.category && product.category.toString() === c.applicableId.toString();
                    } else if (c.applicableOn === 'brand') {
                        return product.brand && product.brand.toString() === c.applicableId.toString();
                    }
                    return false;
                });
            }
            if (!hasTargetMatch) {
                isEligible = false;
                ineligibilityReason = `Valid for specific ${c.applicableOn} only`;
            } else {
                const hasApplicableItem = cartItems.some(item => {
                    const product = item.product;
                    if (!product) return false;
                    const isOnSale = product.offerPrice && product.offerPrice < product.price;

                    let targetOk = false;
                    if (c.applicableOn === 'all') targetOk = true;
                    else if (c.applicableOn === 'category') targetOk = product.category && product.category.toString() === c.applicableId.toString();
                    else if (c.applicableOn === 'brand') targetOk = product.brand && product.brand.toString() === c.applicableId.toString();

                    return targetOk && (c.isStackable || !isOnSale);
                });
                if (!hasApplicableItem) {
                    isEligible = false;
                    ineligibilityReason = 'Not applicable to discounted products';
                }
            }
        }

        return {
            ...c.toObject(),
            isUsed,
            isEligible,
            ineligibilityReason
        };
    }));

    res.status(200).json({
        success: true,
        coupons: couponsWithUsageMeta,
        allItemsDiscounted
    });
});

// @desc    Get available coupons for User Account page
// @route   GET /api/user/available-coupons
exports.getAvailableCoupons = catchAsync(async (req, res, next) => {
    const now = new Date();
    const coupons = await Coupon.find({
        status: 'Active',
        isVisibleToUsers: { $ne: false },
        expiryDate: { $gt: now }
    }).sort({ createdAt: -1, expiryDate: 1 });

    const filteredCoupons = coupons.filter(c => c.usedCount < c.usageLimit);

    const couponsWithUsageMeta = await Promise.all(filteredCoupons.map(async (c) => {
        const usageCount = await Order.countDocuments({ userId: req.user.id, couponCode: c.code });
        return {
            ...c.toObject(),
            isUsed: usageCount >= (c.usageLimitPerUser || 1)
        };
    }));

    res.status(200).json({
        success: true,
        count: couponsWithUsageMeta.length,
        coupons: couponsWithUsageMeta
    });
});
