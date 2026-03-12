const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,

    role: {
      type: String,
      enum: ["user"],
      default: "user"
    },

    isBlocked: { type: Boolean, default: false },

    // Social Auth
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    profileImage: String,

    otp: String,
    otpExpiry: Date,
    otpPurpose: { type: String, enum: ["signup", "forgot_password"] },
    isVerified: { type: Boolean, default: false },

    canResetPassword: { type: Boolean, default: false },
    walletBalance: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
