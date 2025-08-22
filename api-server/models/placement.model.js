const mongoose = require("mongoose");
const placementSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    type: {
      type: String,
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
    campaignName: {
      type: String,
      trim: true,
      default: null,
    },
    campaignStatus: {
      type: String,
      trim: true,
      default: null,
    },
    reportDate: {
      type: String,
      trim: true,
    },
    campaignBudget: {
      type: Number,
      trim: true,
      default: 0,
    },
    campaignBudgetType: {
      type: String,
      trim: true,
      default: null,
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
    cvr: {
      type: Number,
      trim: true,
      default: 0,
    },
    ctr: {
      type: Number,
      trim: true,
      default: 0,
    },
    cpc: {
      type: Number,
      trim: true,
      default: 0,
    },
    placement: {
      type: String,
      trim: true,
    },
    conversion: {
      type: Number,
      trim: true,
      default: 0,
    },
    biddingStartegy: {
      type: String,
      trim: true,
      default: "",
    },
    keywordBid: {
      type: Number,
      default: 0,
    },
    units: {
      type: Number,
      default: 0,
    },
    placementModifier: {
      type: Number,
      default: 0,
    },
    targetAcos: {
      type: Number,
      default: 0,
    },
    targetCpc: {
      type: Number,
      default: 0,
    },
    newKeywordBid: {
      type: Number,
      default: 0,
    },
    timezone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("placement", placementSchema);
