const User = require("../models/user.model");
const Transaction = require("../models/Transaction");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const razorpay = require("../config/razorpay");
const crypto = require("crypto");

exports.getWalletData = catchAsync(async (req, res, next) => {
    const userId = req.user.id;

    const user = await User.findById(userId).select("walletBalance");
    if (!user) {
        return next(new AppError("User not found", 404));
    }

    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        balance: user.walletBalance || 0,
        transactions
    });
});

exports.createWalletOrder = catchAsync(async (req, res, next) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        return next(new AppError("Please provide a valid amount.", 400));
    }

    const options = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: "INR",
        receipt: `wlt_${Date.now()}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
        });
    } catch (err) {
        console.error("Razorpay Order Creation Error:", err);
        return next(new AppError(err.message || "Failed to create Razorpay order", 500));
    }
});

exports.verifyWalletPayment = catchAsync(async (req, res, next) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount
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

    // 2. Update Wallet and Create Transaction
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: amount } },
        { new: true }
    );

    if (!user) {
        return next(new AppError("User not found", 404));
    }

    const newTransaction = new Transaction({
        userId,
        amount,
        type: "Credit",
        description: "Added funds to wallet",
    });

    await newTransaction.save();

    res.status(200).json({
        success: true,
        message: "Funds added to wallet successfully!",
        balance: user.walletBalance
    });
});
