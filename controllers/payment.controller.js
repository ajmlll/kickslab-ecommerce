const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Order = require("../models/order.model");
const Cart = require("../models/cart.model");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

exports.getRazorpayKey = (req, res) => {
    res.status(200).json({ success: true, key: process.env.RAZORPAY_KEY_ID });
};

exports.createRazorpayOrder = catchAsync(async (req, res, next) => {
    const { amount } = req.body;
    if (!amount) {
        return next(new AppError("Amount is required.", 400));
    }

    const options = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: "INR",
        receipt: `receipt_order_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
    });
});

exports.verifyPayment = catchAsync(async (req, res, next) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        orderDetails
    } = req.body;

    const userId = req.user.id;

    // 1. Verify Signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex");

    if (razorpay_signature !== expectedSign) {
        return next(new AppError("Invalid payment signature.", 400));
    }

    // 2. Process Order
    const { shippingAddress, couponCode } = orderDetails;

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || cart.items.length === 0) {
        return next(new AppError("Your cart is empty.", 400));
    }

    const orderItems = [];
    let totalMRP = 0;
    let sellingPriceSubtotal = 0;

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
    }

    let couponDiscount = 0;
    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: 'Active' });
        if (coupon) {
            if (sellingPriceSubtotal >= coupon.minPurchaseAmount) {
                if (coupon.discountType === 'percent') {
                    couponDiscount = (sellingPriceSubtotal * coupon.discountValue) / 100;
                    if (coupon.maxDiscountAmount > 0 && couponDiscount > coupon.maxDiscountAmount) {
                        couponDiscount = coupon.maxDiscountAmount;
                    }
                } else {
                    couponDiscount = coupon.discountValue;
                }
            }
        }
    }

    const productDiscount = totalMRP - sellingPriceSubtotal;
    const totalSaved = productDiscount + couponDiscount;
    const finalCalculatedTotal = totalMRP - totalSaved;

    const newOrder = new Order({
        userId,
        items: orderItems,
        shippingAddress,
        paymentMethod: "Razorpay",
        paymentStatus: "Paid",
        orderStatus: "Pending",
        totalMRP,
        productDiscount,
        couponCode,
        couponDiscount,
        totalSaved,
        totalAmount: finalCalculatedTotal,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature
    });

    await newOrder.save();

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

    if (couponCode) {
        await Coupon.findOneAndUpdate({ code: couponCode.toUpperCase() }, { $inc: { usedCount: 1 } });
    }

    res.status(201).json({
        success: true,
        message: "Payment verified and order placed successfully!",
        orderId: newOrder._id
    });
});
