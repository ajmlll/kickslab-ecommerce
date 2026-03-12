const Category = require("../models/category.model");
const Product = require("../models/Product");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// Add Category
exports.addCategory = catchAsync(async (req, res, next) => {
    const { name, description, isActive } = req.body;
    let { slug } = req.body;

    if (!name) {
        return next(new AppError("Category name is required", 400));
    }

    // 1. Validate Name Format (Alphanumeric, single space between words)
    const nameRegex = /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/;
    if (!nameRegex.test(name)) {
        return next(new AppError("Category name must be alphanumeric and can contain single spaces", 400));
    }

    if (!slug) {
        slug = name.toLowerCase().replace(/ /g, "-");
    }

    // 2. Case-Insensitive Uniqueness Check
    const existingCategory = await Category.findOne({
        $or: [
            { name: { $regex: new RegExp(`^${name}$`, "i") } },
            { slug: { $regex: new RegExp(`^${slug}$`, "i") } }
        ]
    });

    if (existingCategory) {
        return next(new AppError("Category with this name or slug already exists", 400));
    }

    const newCategory = new Category({
        name,
        slug,
        description,
        isActive
    });

    await newCategory.save();
    res.status(201).json({ message: "Category added successfully", category: newCategory });
});

// Get All Categories
exports.getAllCategories = catchAsync(async (req, res, next) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";

    let query = {};
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } }
        ];
    }

    if (page) {
        // Paginated request
        const skip = (page - 1) * limit;
        const categories = await Category.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
        const totalRecords = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit) || 1;

        const categoriesWithCount = await Promise.all(categories.map(async (cat) => {
            const count = await Product.countDocuments({
                category: cat._id,
                status: { $ne: 'Draft' }
            });
            return { ...cat, productCount: count };
        }));

        return res.status(200).json({
            success: true,
            categories: categoriesWithCount,
            data: categoriesWithCount,
            totalRecords,
            totalPages,
            currentPage: page
        });
    } else {
        // Legacy unpaginated request (returns array directly)
        const categories = await Category.find(query).sort({ createdAt: -1 }).lean();
        const categoriesWithCount = await Promise.all(categories.map(async (cat) => {
            const count = await Product.countDocuments({
                category: cat._id,
                status: { $ne: 'Draft' }
            });
            return { ...cat, productCount: count };
        }));

        return res.status(200).json(categoriesWithCount);
    }
});

// Update Category
exports.updateCategory = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { name, slug, description, isActive } = req.body;

    const category = await Category.findById(id);
    if (!category) {
        return next(new AppError("Category not found", 404));
    }

    // 1. Validate Name Format if changing
    if (name) {
        const nameRegex = /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/;
        if (!nameRegex.test(name)) {
            return next(new AppError("Category name must be alphanumeric and can contain single spaces", 400));
        }

        // 2. Case-Insensitive Uniqueness Check (excluding current doc)
        const existingName = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, "i") },
            _id: { $ne: id }
        });

        if (existingName) {
            return next(new AppError("Category name already taken", 400));
        }
        category.name = name;
    }

    if (slug) {
        const existingSlug = await Category.findOne({
            slug: { $regex: new RegExp(`^${slug}$`, "i") },
            _id: { $ne: id }
        });
        if (existingSlug) {
            return next(new AppError("Slug already taken", 400));
        }
        category.slug = slug;
    }

    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.status(200).json({ message: "Category updated successfully", category });
});

// Delete Category
exports.deleteCategory = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);

    if (!category) {
        return next(new AppError("Category not found", 404));
    }

    res.status(200).json({ message: "Category deleted successfully" });
});
