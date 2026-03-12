const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    offerType: {
        type: String,
        enum: ["brand", "category", "product"],
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "offerTypeModel"
    },
    offerTypeModel: {
        type: String,
        required: true,
        enum: ["Brand", "Category", "Product"]
    },
    discountType: {
        type: String,
        enum: ["percentage", "flat"],
        required: true
    },
    discountValue: {
        type: Number,
        required: true
    },
    bannerImage: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Virtual for status calculation
offerSchema.virtual('status').get(function () {
    const now = new Date();
    // Normalize now to UTC for comparison
    const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Dates are already normalized in pre-save hook to 00:00:00 and 23:59:59 UTC
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    if (!this.isActive) return 'Disabled';
    if (now < start) {
        // Double check if it's actually today but just a few hours early in UTC
        const startTime = start.getTime();
        const nowTime = now.getTime();
        if (startTime - nowTime < 24 * 60 * 60 * 1000 && now.getUTCDate() === start.getUTCDate()) {
            return 'Active';
        }
        return 'Scheduled';
    }
    if (now > end) return 'Expired';
    return 'Active';
});

// Pre-save hook to normalize dates to full days
offerSchema.pre('save', function (next) {
    if (this.startDate) {
        this.startDate = new Date(new Date(this.startDate).setUTCHours(0, 0, 0, 0));
    }
    if (this.endDate) {
        this.endDate = new Date(new Date(this.endDate).setUTCHours(23, 59, 59, 999));
    }
    next();
});

offerSchema.set('toJSON', { virtuals: true });
offerSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("Offer", offerSchema);
