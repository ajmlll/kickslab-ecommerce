const Offer = require("../models/offer.model");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const fs = require("fs");
const path = require("path");

// Helper to delete image
const deleteImage = (imagePath) => {
    if (imagePath) {
        const fullPath = path.join(__dirname, "../public", imagePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    }
};

// Create Offer
exports.createOffer = catchAsync(async (req, res, next) => {
    const {
        title,
        description,
        offerType,
        targetId,
        discountType,
        discountValue,
        startDate,
        endDate,
        isActive
    } = req.body;

    if (!req.file) {
        return next(new AppError("Banner image is required", 400));
    }

    const bannerImage = `/uploads/offers/${req.file.filename}`;

    // Map offerType to offerTypeModel
    const offerTypeModelMap = {
        brand: "Brand",
        category: "Category",
        product: "Product"
    };

    const offer = await Offer.create({
        title,
        description,
        offerType,
        targetId,
        offerTypeModel: offerTypeModelMap[offerType],
        discountType,
        discountValue,
        bannerImage,
        startDate,
        endDate,
        isActive: isActive === 'true' || isActive === true
    });

    res.status(201).json({
        status: "success",
        data: { offer }
    });
});

// Get All Offers (Admin)
exports.getAllOffers = catchAsync(async (req, res, next) => {
    const offers = await Offer.find()
        .populate("targetId")
        .sort("-createdAt");

    res.status(200).json({
        status: "success",
        results: offers.length,
        data: { offers }
    });
});

// Update Offer
exports.updateOffer = catchAsync(async (req, res, next) => {
    const {
        title,
        description,
        offerType,
        targetId,
        discountType,
        discountValue,
        startDate,
        endDate,
        isActive
    } = req.body;

    let offer = await Offer.findById(req.params.id);
    if (!offer) {
        return next(new AppError("Offer not found", 404));
    }

    const updateData = {
        title,
        description,
        offerType,
        targetId,
        discountType,
        discountValue,
        startDate,
        endDate,
        isActive: isActive === 'true' || isActive === true
    };

    if (offerType) {
        const offerTypeModelMap = {
            brand: "Brand",
            category: "Category",
            product: "Product"
        };
        updateData.offerTypeModel = offerTypeModelMap[offerType];
    }

    if (req.file) {
        deleteImage(offer.bannerImage);
        updateData.bannerImage = `/uploads/offers/${req.file.filename}`;
    }

    offer = await Offer.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true
    });

    res.status(200).json({
        status: "success",
        data: { offer }
    });
});

// Delete Offer
exports.deleteOffer = catchAsync(async (req, res, next) => {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
        return next(new AppError("Offer not found", 404));
    }

    deleteImage(offer.bannerImage);
    await Offer.findByIdAndDelete(req.params.id);

    res.status(204).json({
        status: "success",
        data: null
    });
});

// Get Active Offers (Public)
exports.getActiveOffers = catchAsync(async (req, res, next) => {
    const now = new Date();
    // Add 24 hour buffer to now for start date check to handle timezone differences
    const futureLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const offers = await Offer.find({
        isActive: true,
        startDate: { $lte: futureLimit },
        endDate: { $gte: now }
    }).sort("startDate");

    const filteredOffers = offers.filter(o => o.status === 'Active');

    res.status(200).json({
        status: "success",
        results: filteredOffers.length,
        data: { offers: filteredOffers }
    });
});
