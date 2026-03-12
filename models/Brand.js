const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide a brand name"],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    required: false
  },
  
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Brand", brandSchema);
