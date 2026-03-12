const Brand = require("../models/Brand");
const Product = require("../models/Product");

// @desc    Get all brands
// @route   GET /api/admin/brands
// @access  Public
exports.getAllBrands = async (req, res) => {
    try {
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
            const skip = (page - 1) * limit;
            const brands = await Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
            const totalRecords = await Brand.countDocuments(query);
            const totalPages = Math.ceil(totalRecords / limit) || 1;

            const brandsWithCount = await Promise.all(brands.map(async (brand) => {
                const count = await Product.countDocuments({
                    brand: brand._id,
                    status: { $ne: 'Draft' }
                });
                return { ...brand, productCount: count };
            }));

            return res.status(200).json({
                success: true,
                brands: brandsWithCount,
                data: brandsWithCount,
                totalRecords,
                totalPages,
                currentPage: page
            });
        } else {
            const brands = await Brand.find(query).sort({ createdAt: -1 }).lean();

            // Count products for each brand (excluding Drafts)
            const brandsWithCount = await Promise.all(brands.map(async (brand) => {
                const count = await Product.countDocuments({
                    brand: brand._id,
                    status: { $ne: 'Draft' }
                });
                return { ...brand, productCount: count };
            }));

            return res.status(200).json(brandsWithCount);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new brand
// @route   POST /api/admin/brands
// @access  Private/Admin
exports.createBrand = async (req, res) => {
    try {
        const { name, description, status } = req.body;
        let image = "";

        if (req.file) {
            image = `/uploads/${req.file.filename}`;
        }

        const brand = await Brand.create({
            name,
            description,
            status: status || "Active",
            image
        });

        res.status(201).json(brand);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update a brand
// @route   PUT /api/admin/brands/:id
// @access  Private/Admin
exports.updateBrand = async (req, res) => {
    try {
        const { name, description, status } = req.body;
        const brand = await Brand.findById(req.params.id);

        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }

        brand.name = name || brand.name;
        brand.description = description || brand.description;
        brand.status = status || brand.status;

        if (req.file) {
            brand.image = `/uploads/${req.file.filename}`;
        }

        const updatedBrand = await brand.save();
        res.status(200).json(updatedBrand);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a brand
// @route   DELETE /api/admin/brands/:id
// @access  Private/Admin
exports.deleteBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);

        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }

        await brand.deleteOne();
        res.status(200).json({ message: "Brand removed" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
