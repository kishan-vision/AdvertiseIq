const mongoose = require("mongoose");
const profileSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    amazonUrl: {
      type: String,
      trim: true,
    },
    countryCode: {
      type: String,
      trim: true,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    marketplaceStringId: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },

  { timestamps: true }
);
module.exports = new mongoose.model("profile", profileSchema);
