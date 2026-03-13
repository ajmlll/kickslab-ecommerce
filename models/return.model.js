const mongoose = require("mongoose");

const returnSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        items: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                },
                price: {
                    type: Number,
                    required: true,
                },
                productName: String,
                productImage: String,
                condition: String,
                resolution: String,
            },
        ],
        reason: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["Pending", "Approved", "Rejected", "Refunded", "Cancelled"],
            default: "Pending",
        },
        adminComment: {
            type: String,
        },
        evidencePhotos: [
            {
                type: String,
            },
        ],
        pickupAddress: {
            type: String,
        },
        refundAmount: {
            type: Number,
        },
        refundTransactionId: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Return", returnSchema);
