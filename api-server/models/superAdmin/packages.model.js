const mongoose = require("mongoose");
const packageSchema = new mongoose.Schema(
  {
    packageName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    campaignTypes: {
      type: Array,
      trim: true,
    },
    allowProfiles: {
      type: Number,
      trim: true,
    },
    allowPermission: [
      {
        moduleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "module",
        },
        name: {
          type: String,
          trim: true,
        },
        totalCount: {
          type: Number,
          trim: true,
        },
      },
    ],
    price: [
      {
        type: {
          type: String,
          trim: true,
        },
        priceINR: {
          type: Number,
          trim: true,
        },
        priceUSD: {
          type: Number,
          trim: true,
        },
      },
    ],
    packageType: {
      type: String,
      trim: true,
    },
    trialDays: {
      type: Number,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },

  { timestamps: true }
);
module.exports = new mongoose.model("package", packageSchema);
