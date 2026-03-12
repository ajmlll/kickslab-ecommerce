const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a product name'],
        trim: true
    },
    sku: {
        type: String,
        required: [true, 'Please add a SKU'],
        unique: true,
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: false
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        required: false
    },
    price: {
        type: Number,
        required: [true, 'Please add a base price']
    },
    offerPrice: {
        type: Number,
        required: false
    },
    discountType: {
        type: String,
        enum: ['percent', 'fixed', 'none', ''],
        default: 'none'
    },
    discountValue: {
        type: Number,
        default: 0
    },
    stock: {
        type: Number,
        default: 0
    },
    initialStock: {
        type: Number,
        default: 0
    },
    sizes: [{
        size: {
            type: String,
            required: true
        },
        stock: {
            type: Number,
            required: true,
            default: 0
        }
    }],
    description: {
        type: String,
        required: false
    },
    image: {
        type: String,
        required: false
    },
    gallery: [{
        type: String,
        required: false
    }],
    status: {
        type: String,
        enum: ['Active', 'Draft'],
        default: 'Active'
    },
    tags: [{
        type: String,
        trim: true
    }]
}, { timestamps: true });

productSchema.index({ name: 1, brand: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
