const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a coupon title'],
        trim: true
    },
    code: {
        type: String,
        required: [true, 'Please add a coupon code'],
        unique: true,
        uppercase: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['fixed', 'percent'],
        required: [true, 'Please specify discount type']
    },
    discountValue: {
        type: Number,
        required: [true, 'Please add discount value']
    },
    minPurchaseAmount: {
        type: Number,
        default: 0
    },
    minProductsRequired: {
        type: Number,
        default: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: 0
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: {
        type: Date,
        required: [true, 'Please add expiry date']
    },
    usageLimit: {
        type: Number,
        default: 100
    },
    usageLimitPerUser: {
        type: Number,
        default: 1
    },
    usedCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    isStackable: {
        type: Boolean,
        default: false
    },
    applicableOn: {
        type: String,
        enum: ['all', 'category', 'brand'],
        default: 'all'
    },
    applicableId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    isVisibleToUsers: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
