const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const transporter = require("../config/mailer");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");

// Helper to generate 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ================= SIGNUP ================= */
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });

  // Case 1: Already verified
  if (existingUser && existingUser.isVerified) {
    return next(new AppError("Email already registered. Please login.", 400));
  }

  // Case 2: Exists but not verified → resend OTP
  if (existingUser && !existingUser.isVerified) {
    const otp = generateOTP();

    existingUser.otp = otp;
    existingUser.otpExpiry = Date.now() + 10 * 60 * 1000;
    existingUser.otpPurpose = "signup";

    await existingUser.save();

    await transporter.sendMail({
      from: `"KICKSLAB" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify your email - OTP",
      html: `<h2>Your OTP is ${otp}</h2><p>It expires in 10 minutes.</p>`
    });

    return res.json({
      success: true,
      message: "Account not verified. OTP resent.",
      email
    });
  }

  // Case 3: New user
  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = generateOTP();

  const user = new User({
    name,
    email,
    password: hashedPassword,
    otp,
    otpExpiry: Date.now() + 10 * 60 * 1000,
    otpPurpose: "signup",
    isVerified: false
  });

  await user.save();

  await transporter.sendMail({
    from: `"KICKSLAB" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "OTP Verification",
    html: `<h2>Your OTP is ${otp}</h2><p>It expires in 10 minutes.</p>`
  });

  res.status(201).json({
    success: true,
    message: "Signup successful, OTP sent",
    email
  });
});
/* ================= LOGIN ================= */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  /* ===== ENV SUPERADMIN LOGIN ===== */
  if (
    email &&
    password &&
    email.trim() === (process.env.SUPERADMIN_EMAIL || "").trim() &&
    password === (process.env.SUPERADMIN_PASSWORD || "").trim()
  ) {
    const { rememberMe } = req.body;
    const expiresIn = rememberMe ? "30d" : "7d";

    const token = jwt.sign(
      {
        id: "env-admin",
        role: "admin",
        isEnvAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    };
    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
    }

    res.cookie("adminToken", token, cookieOptions);

    return res.json({
      success: true,
      role: "admin",
      token,
      user: {
        id: "env-admin",
        _id: "env-admin",
        name: "Admin",
        email: process.env.SUPERADMIN_EMAIL || "admin@kickslab.com",
        role: "admin",
        isEnvAdmin: true,
        
      }
    });
  }

  /* ===== NORMAL DB LOGIN ===== */
  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError("Invalid credentials", 401));
  }

  // Check if account uses Google login
  if (user.authProvider === "google" && !user.password) {
    return next(new AppError("This account uses Google login. Please sign in with Google.", 400));
  }

  const { rememberMe } = req.body;

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return next(new AppError("Invalid credentials", 401));
  }

  if (!user.isVerified) {
    return next(new AppError("Account not verified", 401));
  }

  if (user.isBlocked) {
    return next(new AppError("Your account has been blocked by admin", 403));
  }

  const expiresIn = rememberMe ? "30d" : "7d";

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  };
  if (rememberMe) {
    cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
  }

  // Set appropriate cookie based on role and clear the other to prevent session crossover
  if (user.role === "admin") {
    res.clearCookie("token", { path: "/" });
    res.cookie("adminToken", token, cookieOptions);
  } else {
    res.clearCookie("adminToken", { path: "/" });
    res.cookie("token", token, cookieOptions);
  }

  res.json({
    success: true,
    role: user.role,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

/* ================= LOGOUT ================= */
exports.logout = (req, res) => {
  res.clearCookie("token");
  res.clearCookie("adminToken");
  res.status(200).json({ success: true, message: "Logged out successfully" });
};


/* ================= VERIFY OTP ================= */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    console.log("REQ BODY:", req.body);

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log("DB OTP:", user.otp);
    console.log("DB PURPOSE:", user.otpPurpose);

    if (!user.otp || user.otp !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    if (user.otpPurpose !== purpose) {
      return res.status(400).json({ message: "OTP purpose mismatch" });
    }

    if (purpose === "signup") {
      user.isVerified = true;
    }

    if (purpose === "forgot_password") {
      user.canResetPassword = true;

      res.cookie("resetEmail", user.email, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000
      });
    }

    // 🔥 REMOVE OTP AFTER SUCCESS
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpPurpose = undefined;

    await user.save();

    console.log("AFTER SAVE canResetPassword:", user.canResetPassword);

    res.json({ success: true });

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ message: "OTP verification failed" });
  }
};

/* ================= RESEND OTP ================= */
exports.resendOtp = catchAsync(async (req, res, next) => {
  const { email, purpose } = req.body;

  const user = await User.findOne({ email });
  if (!user) return next(new AppError("User not found", 404));

  // Only block signup resend if already verified
  if (purpose === "signup" && user.isVerified) {
    return next(new AppError("User already verified", 400));
  }

  const otp = generateOTP();

  user.otp = otp;
  user.otpExpiry = Date.now() + 10 * 60 * 1000;
  user.otpPurpose = purpose;

  await user.save();

  await transporter.sendMail({
    from: `"KICKSLAB" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "OTP Verification",
    html: `<h2>Your OTP is ${otp}</h2><p>Valid for 10 minutes</p>`
  });

  res.json({ success: true, message: "OTP resent" });
});

/* ================= FORGOT PASSWORD ================= */
exports.forgotPasswordOtp = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) return next(new AppError("User not found", 404));

  if (!user.isVerified) {
    return next(new AppError("Account not verified", 400));
  }

  const otp = generateOTP();

  user.otp = otp;
  user.otpExpiry = Date.now() + 10 * 60 * 1000;
  user.otpPurpose = "forgot_password";
  user.canResetPassword = false;

  await user.save();

  await transporter.sendMail({
    from: `"KICKSLAB" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset Password OTP",
    html: `<h2>Your OTP is ${otp}</h2><p>Valid for 10 minutes</p>`
  });

  res.json({ success: true, message: "OTP sent for password reset" });
});

// CHECK RESET PERMISSION
exports.checkResetPermission = catchAsync(async (req, res, next) => {
  const { email } = req.query;

  const user = await User.findOne({ email });

  if (!user || !user.canResetPassword) {
    return res.json({ allowed: false });
  }

  res.json({ allowed: true });
});

// RESET PASSWORD
exports.resetPassword = catchAsync(async (req, res, next) => {
  const email = req.cookies.resetEmail;

  if (!email) {
    return next(new AppError("Unauthorized", 401));
  }

  const { newPassword } = req.body;

  const user = await User.findOne({ email });

  if (!user || !user.canResetPassword) {
    return next(new AppError("Unauthorized", 401));
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  user.password = hashed;
  user.canResetPassword = false;

  await user.save();

  res.clearCookie("resetEmail");

  res.json({ success: true, message: "Password reset successful" });
});

// Admin: Get all users with order stats
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";

  let matchStage = { role: "user" };

  if (search) {
    matchStage.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    ];
  }

  const totalRecords = await User.countDocuments(matchStage);
  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const users = await User.aggregate([
    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "userId",
        as: "userOrders"
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        createdAt: 1,
        isVerified: 1,
        isBlocked: 1,
        walletBalance: 1,
        orderCount: { $size: "$userOrders" },
        cancellationCount: {
          $size: {
            $filter: {
              input: "$userOrders",
              as: "order",
              cond: { $eq: ["$$order.orderStatus", "Cancelled"] }
            }
          }
        },
        refundedAmount: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: "$userOrders",
                  as: "order",
                  cond: { $eq: ["$$order.paymentStatus", "Refunded"] }
                }
              },
              as: "order",
              in: "$$order.totalAmount"
            }
          }
        },
        totalSpent: {
          $sum: {
            $map: {
              input: {
                $filter: {
                  input: "$userOrders",
                  as: "order",
                  cond: { $ne: ["$$order.orderStatus", "Cancelled"] }
                }
              },
              as: "order",
              in: "$$order.totalAmount"
            }
          }
        }
      }
    }
  ]);
  res.json({
    success: true,
    data: users,
    users, // fallback
    totalRecords,
    totalPages,
    currentPage: page
  });
});

// Admin: Toggle block/unblock user
exports.toggleBlockStatus = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return next(new AppError("User not found", 404));

  user.isBlocked = !user.isBlocked;
  await user.save();

  res.json({
    success: true,
    message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
    isBlocked: user.isBlocked
  });
});

// Admin: Delete user
exports.deleteUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findByIdAndDelete(userId);
  if (!user) return next(new AppError("User not found", 404));

  res.json({ success: true, message: "User deleted successfully" });
});

// --- Admin Inactivity Endpoints ---
exports.adminHeartbeat = (req, res) => {
  if (req.session) {
    req.session.cookie.maxAge = 15 * 60 * 1000;
  }
  return res.json({ success: true, message: "Session extended" });
};

exports.adminLogoutInactivity = (req, res) => {
  if (req.session) {
    req.session.destroy();
  }
  res.clearCookie("token", { path: "/" });
  res.clearCookie("adminToken", { path: "/" });

  return res.json({ success: true, message: "Logged out due to inactivity" });
};
