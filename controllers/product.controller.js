const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const Product = require("../models/Product");
const Brand = require("../models/Brand");
const Category = require("../models/category.model");
const { generateSKU } = require("../utils/skuGenerator");
const { applyOffersToProducts } = require("../utils/offerHelper");


// @desc    Create a new product
// @route   POST /api/admin/products
// @access  Protected
exports.createProduct = catchAsync(async (req, res, next) => {
    const {
        name,
        description,
        price,
        offerPrice,
        discountType, // 'percent', 'fixed', 'none'
        discountValue,
        category,
        brand,
        stock, // Total stock
        sizes,
        status,
        tags
    } = req.body;

    // Fetch Brand and Category for SKU generation
    const brandObj = await Brand.findById(brand);
    const catObj = await Category.findById(category);

    if (!brandObj || !catObj) {
        return next(new AppError("Invalid Brand or Category", 400));
    }

    // Generate SKU automatically
    const sku = await generateSKU(brandObj.name, catObj.name);

    // Simple validation
    if (!name || !sku || !price) {
        return next(new AppError("Name, SKU, and Price are required", 400));
    }

    // Handle Image Uploads
    let image = '';
    if (req.files && req.files['image']) {
        image = `/uploads/products/${req.files['image'][0].filename}`;
    } else if (req.body.image) {
        image = req.body.image; // Fallback to URL if provided
    }

    let gallery = [];
    if (req.files && req.files['gallery']) {
        gallery = req.files['gallery'].map(file => `/uploads/products/${file.filename}`);
    }

    let parsedSizes = [];
    if (req.body.sizes) {
        try {
            parsedSizes = JSON.parse(req.body.sizes);
        } catch (err) {
            // Keep empty array
        }
    }

    let parsedTags = [];
    if (req.body.tags) {
        try {
            parsedTags = Array.isArray(req.body.tags) ? req.body.tags : JSON.parse(req.body.tags);
        } catch (err) {
            parsedTags = req.body.tags.split(',').map(t => t.trim());
        }
    }

    const product = new Product({
        name,
        sku,
        description,
        price,
        offerPrice: offerPrice || price,
        discountType: discountType || 'none',
        discountValue: discountValue || 0,
        category: category || undefined,
        brand: brand || undefined,
        stock: stock || 0,
        initialStock: stock || 0,
        sizes: parsedSizes,
        status: status || 'Active',
        image,
        gallery,
        tags: parsedTags
    });

    const savedProduct = await product.save();
    res.status(201).json(savedProduct);
});

// @desc    Get all products
// @route   GET /api/admin/products
// @access  Public
exports.getAllProducts = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const statusFilter = req.query.status;
    const stockFilter = req.query.stock;

    let query = {};

    // Status Filter
    if (statusFilter === 'Draft') {
        query.status = 'Draft';
    } else if (statusFilter === 'Active') {
        query.status = { $ne: 'Draft' };
    }

    // Stock Filter using $expr
    if (stockFilter === 'out_of_stock') {
        query.stock = { $lte: 0 };
    } else if (stockFilter === 'in_stock') {
        query.$expr = {
            $gte: [
                "$stock",
                { $multiply: [{ $ifNull: ["$initialStock", "$stock"] }, 0.8] }
            ]
        };
    } else if (stockFilter === 'low_stock') {
        query.$expr = {
            $and: [
                { $gt: ["$stock", 0] },
                { $lt: ["$stock", { $multiply: [{ $ifNull: ["$initialStock", "$stock"] }, 0.8] }] }
            ]
        };
    }

    if (search) {
        const matchingCategories = await Category.find({ name: { $regex: search, $options: "i" } }).select('_id').lean();
        const matchingBrands = await Brand.find({ name: { $regex: search, $options: "i" } }).select('_id').lean();
        const categoryIds = matchingCategories.map(c => c._id);
        const brandIds = matchingBrands.map(b => b._id);

        let searchConditions = [
            { name: { $regex: search, $options: "i" } },
            { sku: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
            { tags: { $in: [new RegExp(search, "i")] } }
        ];

        if (categoryIds.length > 0) {
            searchConditions.push({ category: { $in: categoryIds } });
        }
        if (brandIds.length > 0) {
            searchConditions.push({ brand: { $in: brandIds } });
        }

        query.$or = searchConditions;
    }

    if (page) {
        const skip = (page - 1) * limit;
        const products = await Product.find(query)
            .populate('category', 'name')
            .populate('brand', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalRecords = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        const productsWithOffers = await applyOffersToProducts(products);

        return res.status(200).json({
            success: true,
            products: productsWithOffers,
            data: productsWithOffers,
            totalRecords,
            totalPages,
            currentPage: page
        });
    } else {
        const products = await Product.find(query)
            .populate('category', 'name')
            .populate('brand', 'name')
            .sort({ createdAt: -1 })
            .lean();
        const productsWithOffers = await applyOffersToProducts(products);
        return res.status(200).json(productsWithOffers);
    }
});

// @desc    Get single product
// @route   GET /api/admin/products/:id
// @access  Public
exports.getProduct = catchAsync(async (req, res, next) => {
    const product = await Product.findById(req.params.id)
        .populate('category', 'name')
        .populate('brand', 'name');

    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    const productWithOffer = await applyOffersToProducts(product);
    res.status(200).json(productWithOffer);
});

// @desc    Update product
// @route   PUT /api/admin/products/:id
// @access  Protected
exports.updateProduct = catchAsync(async (req, res, next) => {
    const {
        name,
        sku,
        description,
        price,
        offerPrice,
        discountType,
        discountValue,
        category,
        brand,
        stock,
        status,
        tags,
        existingGallery // Array of strings (URLs) of images to keep
    } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    // Update basic fields
    if (name) product.name = name;
    if (sku) product.sku = sku;
    if (description) product.description = description;
    if (price) product.price = price;
    if (offerPrice) product.offerPrice = offerPrice;
    if (discountType) product.discountType = discountType;
    if (discountValue !== undefined) product.discountValue = discountValue;

    if (stock) {
        if (product.stock != stock) {
            product.initialStock = stock;
        }
        product.stock = stock;
    }

    if (req.body.sizes) {
        try {
            product.sizes = JSON.parse(req.body.sizes);
        } catch (error) {
            // Keep existing sizes
        }
    }

    if (status) product.status = status;
    if (category) product.category = category;
    if (brand) product.brand = brand;

    if (tags) {
        try {
            product.tags = Array.isArray(tags) ? tags : JSON.parse(tags);
        } catch (e) {
            product.tags = tags.split(',').map(t => t.trim());
        }
    }

    // Handle Main Image Update
    if (req.files && req.files['image']) {
        product.image = `/uploads/products/${req.files['image'][0].filename}`;
    }

    // Handle Gallery Update
    if (req.body.galleryUpdate === 'true') {
        let updatedGallery = [];
        
        // Add existing images to keep
        if (existingGallery) {
            if (Array.isArray(existingGallery)) {
                updatedGallery = existingGallery;
            } else if (typeof existingGallery === 'string') {
                try {
                    updatedGallery = JSON.parse(existingGallery);
                } catch (e) {
                    updatedGallery = [existingGallery];
                }
            }
        }

        // Add new uploaded files
        if (req.files && req.files['gallery']) {
            const newFiles = req.files['gallery'].map(file => `/uploads/products/${file.filename}`);
            updatedGallery = [...updatedGallery, ...newFiles];
        }

        product.gallery = updatedGallery;
    } else if (req.files && req.files['gallery']) {
        // Fallback or simple append if not a full gallery update
        const newFiles = req.files['gallery'].map(f => `/uploads/products/${f.filename}`);
        product.gallery = [...product.gallery, ...newFiles];
    }

    const updatedProduct = await product.save();
    res.status(200).json(updatedProduct);
});

// @desc    Get search suggestions
// @route   GET /api/admin/products/suggestions
// @access  Public
exports.getSearchSuggestions = catchAsync(async (req, res, next) => {
    const query = req.query.q || "";

    // If query is empty, return "Trending" / "Popular" defaults
    if (!query || query.trim().length === 0) {
        const popularCategories = await Category.find({ isActive: true }).select('name').limit(4).lean();
        const trendingBrands = await Brand.find({}).select('name').limit(4).lean();
        
        return res.status(200).json({
            products: [],
            categories: popularCategories,
            brands: trendingBrands,
            isDefault: true
        });
    }

    if (query.length < 2) {
        return res.status(200).json({ products: [], categories: [], brands: [] });
    }

    const matchingCategories = await Category.find({ name: { $regex: query, $options: "i" } }).select('name').limit(3).lean();
    const matchingBrands = await Brand.find({ name: { $regex: query, $options: "i" } }).select('name').limit(3).lean();
    
    // For products, we still need IDs to match
    const categoryIds = matchingCategories.map(c => c._id);
    const brandIds = matchingBrands.map(b => b._id);

    let searchConditions = [
        { name: { $regex: query, $options: "i" } },
        { tags: { $in: [new RegExp(query, "i")] } }
    ];

    if (categoryIds.length > 0) {
        searchConditions.push({ category: { $in: categoryIds } });
    }
    if (brandIds.length > 0) {
        searchConditions.push({ brand: { $in: brandIds } });
    }

    const products = await Product.find({
        status: 'Active',
        $or: searchConditions
    })
        .select('name image price offerPrice discountType discountValue')
        .limit(5)
        .lean();

    const productsWithOffers = await applyOffersToProducts(products);
    
    res.status(200).json({
        products: productsWithOffers,
        categories: matchingCategories,
        brands: matchingBrands
    });
});

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
// @access  Protected
exports.deleteProduct = catchAsync(async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    await product.deleteOne();
    res.status(200).json({ message: 'Product removed' });
});
