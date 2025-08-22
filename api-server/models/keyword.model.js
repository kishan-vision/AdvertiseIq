const mongoose = require("mongoose");
const keywordSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    campaignId: {
      type: Number,
      trim: true,
    },
    adGroupId: {
      type: Number,
      trim: true,
    },
    keywordId: {
      type: Number,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    bid: {
      type: Number,
      trim: true,
    },
    matchType: {
      type: String,
      trim: true,
      default: null,
    },
    timezone: {
      type: String,
      trim: true,
    },
    reportDate: {
      type: String,
      trim: true,
    },
    clicks: {
      type: Number,
      trim: true,
      default: 0,
    },
    spend: {
      type: Number,
      trim: true,
      default: 0,
    },
    orders: {
      type: Number,
      trim: true,
      default: 0,
    },
    sales: {
      type: Number,
      trim: true,
      default: 0,
    },
    acos: {
      type: Number,
      trim: true,
      default: 0,
    },
    roas: {
      type: Number,
      trim: true,
      default: 0,
    },
    impressions: {
      type: Number,
      trim: true,
      default: 0,
    },
    type: {
      type: String,
      trim: true,
    },
    expressions: {
      type: [
        {
          type: { type: String, trim: true },
          value: { type: String, trim: true }
        }
      ],
      default: []
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("keyword", keywordSchema);
