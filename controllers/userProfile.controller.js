const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// GET PROFILE
exports.getProfile = catchAsync(async (req, res, next) => {
    let user;
    if (req.user.isEnvAdmin || req.user.id === 'env-admin') {
        user = {
            id: req.user.id,
            _id: req.user.id,
            role: 'admin',
            adminLevel: 'superadmin',
            isEnvAdmin: true,
            name: 'Admin',
            email: process.env.SUPERADMIN_EMAIL || 'admin@kickslab.com'
        };
    } else {
        user = await User.findById(req.user.id).select("-password -otp -otpExpiry -otpPurpose");
        if (!user) {
            return next(new AppError("User not found", 404));
        }
    }

    res.json({ success: true, user });
});

// UPDATE PROFILE
exports.updateProfile = catchAsync(async (req, res, next) => {
    const { name } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError("User not found", 404));
    }

    user.name = name;

    await user.save();

    res.json({ success: true, message: "Profile updated successfully", user });
});

// CHANGE PASSWORD
exports.changePassword = catchAsync(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError("User not found", 404));
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        return next(new AppError("Current password does not match", 400));
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
});
