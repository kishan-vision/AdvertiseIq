const mongoose = require("mongoose");
const configAdsSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    adsAccessToken: {
      type: String,
      trim: true,
    },
    adsRefreshToken: {
      type: String,
      trim: true,
    },
    adsTokenExpire: {
      type: Number,
      trim: true,
    },
    baseUrl: {
      type: String,
      trim: true,
    },
    clientId: {
      type: String,
      trim: true,
    },
    clientSecret: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("configAds", configAdsSchema);
