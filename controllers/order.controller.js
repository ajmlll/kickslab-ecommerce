const Order = require("../models/order.model");
const Cart = require("../models/cart.model");
const Product = require("../models/Product");
const User = require("../models/user.model");
const Return = require("../models/return.model");
const Coupon = require("../models/Coupon");
const Transaction = require("../models/Transaction");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// Place an order natively
exports.placeOrder = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const { shippingAddress, paymentMethod, totalAmount, couponCode } = req.body;

    if (!shippingAddress || !paymentMethod || totalAmount === undefined) {
        return next(new AppError("Missing required order details.", 400));
    }

    // 1. Fetch user's cart
    const cart = await Cart.findOne({ user: userId }).populate("items.product");

    if (!cart || cart.items.length === 0) {
        return next(new AppError("Your cart is empty.", 400));
    }

    // 2. Validate Coupon & Stackability logic
    let coupon = null;
    let couponDiscount = 0;
    if (couponCode) {
        coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: 'Active' });
        if (!coupon) {
            return next(new AppError("Invalid or inactive coupon code.", 400));
        }

        const now = new Date();
        if (now < coupon.startDate) {
            return next(new AppError(`Coupon will be active from ${coupon.startDate.toLocaleDateString()}`, 400));
        }
        if (now > coupon.expiryDate) {
            return next(new AppError("Coupon has expired.", 400));
        }
        if (coupon.usedCount >= coupon.usageLimit) {
            return next(new AppError("Coupon usage limit reached.", 400));
        }

        const userUsageCount = await Order.countDocuments({ userId, couponCode: couponCode.toUpperCase() });
        if (userUsageCount >= coupon.usageLimitPerUser) {
            return next(new AppError(`You have already used this coupon ${userUsageCount} time(s).`, 400));
        }
    }

    // 3. Build order items & calculate financials
    const orderItems = [];
    let totalMRP = 0;
    let sellingPriceSubtotal = 0;
    let eligibleForCouponTotal = 0;
    let allItemsDiscounted = true;

    for (let item of cart.items) {
        const product = item.product;
        if (!product) continue;

        const sizeData = product.sizes.find(s => s.size === item.size);
        const availableStock = sizeData ? sizeData.stock : product.stock;

        if (availableStock < item.quantity) {
            return next(new AppError(`Insufficient stock for ${product.name} (Size: ${item.size}).`, 400));
        }

        const mrp = product.price;
        const isOnSale = product.offerPrice && product.offerPrice < mrp;
        const priceToUse = isOnSale ? product.offerPrice : mrp;

        if (!isOnSale) allItemsDiscounted = false;

        orderItems.push({
            product: product._id,
            size: item.size,
            quantity: item.quantity,
            price: priceToUse,
            productName: product.name,
            productImage: product.image || (product.gallery && product.gallery[0]) || ""
        });

        totalMRP += mrp * item.quantity;
        sellingPriceSubtotal += priceToUse * item.quantity;

        if (coupon) {
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
                    eligibleForCouponTotal += priceToUse * item.quantity;
                }
            }
        }
    }

    const productDiscount = totalMRP - sellingPriceSubtotal;

    // 4. Final Coupon Validation & Calculation
    if (coupon) {
        if (allItemsDiscounted && !coupon.isStackable) {
            return next(new AppError("Coupons cannot be applied because all items already have active discounts.", 400));
        }

        if (sellingPriceSubtotal < coupon.minPurchaseAmount) {
            return next(new AppError(`Minimum purchase of ₹${coupon.minPurchaseAmount} required for this coupon.`, 400));
        }

        if (eligibleForCouponTotal === 0) {
            return next(new AppError("This coupon cannot be applied to discounted products.", 400));
        }

        if (coupon.discountType === 'percent') {
            couponDiscount = (eligibleForCouponTotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount > 0 && couponDiscount > coupon.maxDiscountAmount) {
                couponDiscount = coupon.maxDiscountAmount;
            }
        } else {
            couponDiscount = coupon.discountValue;
        }

        if (couponDiscount > sellingPriceSubtotal) couponDiscount = sellingPriceSubtotal;
    }

    const totalSaved = productDiscount + couponDiscount;
    const finalTotal = totalMRP - totalSaved;

    if (Math.abs(finalTotal - totalAmount) > 1) {
        return next(new AppError(`Total amount mismatch. Expected ${finalTotal.toFixed(2)}, got ${totalAmount}`, 400));
    }

    // 5. Handle Wallet Payment Deduction
    if (paymentMethod === 'wallet') {
        const user = await User.findById(userId);
        if (user.walletBalance < finalTotal) {
            return next(new AppError("Insufficient wallet balance.", 400));
        }
        user.walletBalance -= finalTotal;
        await user.save();

        await Transaction.create({
            userId,
            amount: finalTotal,
            type: "Debit",
            description: "Wallet Payment for Order Placement",
        });
    }

    // 6. Create Order
    const newOrder = new Order({
        userId,
        items: orderItems,
        shippingAddress,
        paymentMethod,
        totalMRP,
        productDiscount,
        couponCode: coupon ? coupon.code : undefined,
        couponTitle: coupon ? coupon.title : undefined,
        couponDiscount,
        totalSaved,
        totalAmount: finalTotal,
        paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
        orderStatus: "Pending"
    });

    await newOrder.save();

    if (paymentMethod === 'wallet') {
        await Transaction.findOneAndUpdate(
            { userId, description: "Wallet Payment for Order Placement", orderId: { $exists: false } },
            { orderId: newOrder._id },
            { sort: { createdAt: -1 } }
        );
    }

    if (coupon) {
        await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
    }

    for (let item of orderItems) {
        await Product.updateOne(
            { _id: item.product, "sizes.size": item.size },
            {
                $inc: {
                    "sizes.$.stock": -item.quantity,
                    "stock": -item.quantity
                }
            }
        );
    }

    await Cart.findOneAndDelete({ user: userId });

    res.status(201).json({ message: "Order placed successfully!", orderId: newOrder._id });
});


// Get User's Orders
exports.getUserOrders = catchAsync(async (req, res, next) => {
    const userId = req.user.id;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 }).lean();
    const returns = await Return.find({ userId });

    const ordersWithReturns = orders.map(order => {
        const orderReturns = returns.filter(r => r.orderId.toString() === order._id.toString() && r.status !== 'Cancelled');
        const returnReq = orderReturns.length > 0 ? orderReturns[0] : null;
        const returnedProductIds = orderReturns.flatMap(r => r.items.map(i => i.product.toString()));
        return {
            ...order,
            returnRequest: returnReq || null,
            returnedProductIds
        };
    });

    res.status(200).json(ordersWithReturns);
});

// Admin: Get All Orders (With Pagination & Search)
exports.getAllOrders = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const dateFilter = req.query.date || "All Dates";

    let query = {};

    if (dateFilter !== "All Dates") {
        const now = new Date();
        let startDate = new Date();

        if (dateFilter === "Today") {
            startDate.setHours(0, 0, 0, 0);
        } else if (dateFilter === "Last 7 Days") {
            startDate.setDate(now.getDate() - 7);
        } else if (dateFilter === "Last 1 Month") {
            startDate.setMonth(now.getMonth() - 1);
        } else if (dateFilter === "Last 6 Months") {
            startDate.setMonth(now.getMonth() - 6);
        } else if (dateFilter === "Last 1 Year") {
            startDate.setFullYear(now.getFullYear() - 1);
        }

        query.createdAt = { $gte: startDate };
    }

    if (search) {
        const regex = { $regex: search, $options: "i" };
        const users = await User.find({ $or: [{ name: regex }, { email: regex }] }).select('_id');
        const userIds = users.map(u => u._id);

        const searchConditions = [
            { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: search, options: "i" } } },
            { paymentMethod: regex },
            { orderStatus: regex },
            { paymentStatus: regex },
            { "shippingAddress.name": regex },
            { couponCode: regex }
        ];

        if (userIds.length > 0) {
            searchConditions.push({ userId: { $in: userIds } });
        }

        query.$or = searchConditions;
    }

    const data = await Order.find(query)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const totalRecords = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    res.status(200).json({
        success: true,
        data,
        orders: data,
        totalRecords,
        totalPages,
        currentPage: page
    });
});

// Admin: Update Order Status
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
    if (!validStatuses.includes(status)) {
        return next(new AppError("Invalid status.", 400));
    }

    const order = await Order.findById(orderId);
    if (!order) {
        return next(new AppError("Order not found.", 404));
    }

    if (order.orderStatus === "Delivered") {
        return next(new AppError("Delivered orders cannot be changed.", 400));
    }

    order.orderStatus = status;

    if (status === "Delivered") {
        order.paymentStatus = "Paid";
        if (!order.deliveredAt) {
            order.deliveredAt = new Date();
        }
    }

    await order.save();

    if (status === "Cancelled" && order.paymentMethod !== "cod" && order.paymentStatus === "Paid") {
        const user = await User.findById(order.userId);
        if (user) {
            user.walletBalance = (user.walletBalance || 0) + order.totalAmount;
            await user.save();

            await Transaction.create({
                userId: user._id,
                amount: order.totalAmount,
                type: "Credit",
                description: `Refunded from cancellation #${order._id.toString().substring(order._id.toString().length - 8).toUpperCase()}`,
                orderId: order._id
            });

            order.paymentStatus = "Refunded";
            await order.save();
        }
    }

    res.status(200).json({ success: true, message: "Order status updated.", order });
});

// User: Cancel Order
exports.userCancelOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
        return next(new AppError("Order not found.", 404));
    }

    if (order.orderStatus !== "Pending" && order.orderStatus !== "Processing") {
        return next(new AppError("Order cannot be cancelled at this stage.", 400));
    }

    order.orderStatus = "Cancelled";

    let refundMessage = "";
    if (order.paymentMethod !== "cod" && order.paymentStatus === "Paid") {
        const user = await User.findById(userId);
        if (user) {
            user.walletBalance = (user.walletBalance || 0) + order.totalAmount;
            await user.save();

            await Transaction.create({
                userId: user._id,
                amount: order.totalAmount,
                type: "Credit",
                description: `Refunded from cancellation #${order._id.toString().substring(order._id.toString().length - 8).toUpperCase()}`,
                orderId: order._id
            });

            order.paymentStatus = "Refunded";
            refundMessage = ` ₹${order.totalAmount.toFixed(2)} refunded to your wallet.`;
        }
    }

    await order.save();

    for (let item of order.items) {
        await Product.updateOne(
            { _id: item.product, "sizes.size": item.size },
            {
                $inc: {
                    "sizes.$.stock": item.quantity,
                    "stock": item.quantity
                }
            }
        );
    }

    res.status(200).json({ success: true, message: "Order cancelled successfully." + refundMessage });
});

// Get Single Order Details
exports.getOrderDetails = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = { _id: orderId };

    if (userRole !== "admin") {
        query.userId = userId;
    }

    const order = await Order.findOne(query).populate("userId", "name email").lean();

    if (!order) {
        return next(new AppError("Order not found.", 404));
    }

    const returnRequests = await Return.find({ orderId, status: { $ne: 'Cancelled' } }).lean();
    order.returnRequest = returnRequests.length > 0 ? returnRequests[0] : null;
    order.returnedProductIds = returnRequests.flatMap(r => r.items.map(item => item.product.toString()));

    res.status(200).json({ success: true, order });
});

// Admin: Refund to Wallet
exports.refundToWallet = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
        return next(new AppError("Order not found.", 404));
    }

    if (order.orderStatus !== "Cancelled") {
        return next(new AppError("Only cancelled orders can be refunded.", 400));
    }

    if (order.paymentMethod === "cod") {
        return next(new AppError("COD orders do not require a wallet refund.", 400));
    }

    if (order.paymentStatus !== "Paid") {
        return next(new AppError("Only paid orders can be refunded.", 400));
    }

    if (order.paymentStatus === "Refunded") {
        return next(new AppError("Order already refunded.", 400));
    }

    const user = await User.findById(order.userId);
    if (!user) {
        return next(new AppError("User not found.", 404));
    }

    user.walletBalance = (user.walletBalance || 0) + order.totalAmount;
    await user.save();

    order.paymentStatus = "Refunded";
    await order.save();

    await Transaction.create({
        userId: user._id,
        amount: order.totalAmount,
        type: "Credit",
        description: `Refunded from cancellation #${order._id.toString().substring(order._id.toString().length - 8).toUpperCase()}`,
        orderId: order._id
    });

    res.status(200).json({ success: true, message: `₹${order.totalAmount.toFixed(2)} refunded to user's wallet.` });
});
