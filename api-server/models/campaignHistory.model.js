const mongoose = require("mongoose");
const campaignHistorySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    runType: {
      type: String,
      default: "Budget Rule",
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    runName: {
      type: String,
      trim: true,
    },
    campaignId: {
      type: Number,
      trim: true,
    },
    isType: { type: String, trim: true, default: "CRON" },
    name: {
      type: String,
      trim: true,
    },
    fromStatus: {
      type: String,
      trim: true,
    },
    toStatus: {
      type: String,
      trim: true,
    },
    historyDate: {
      type: String,
      trim: true,
    },
    historyTime: {
      type: String,
      trim: true,
    },
    startDate: {
      type: String,
      trim: true,
    },
    endDate: {
      type: String,
      trim: true,
      default: null,
    },
    type: {
      type: String,
      trim: true,
    },
    currencyCode: {
      type: String,
      trim: true,
    },
    fromBudget: {
      type: Number,
      trim: true,
    },
    toBudget: {
      type: Number,
      trim: true,
    },
    budgetType: {
      type: String,
      trim: true,
    },
    costType: {
      type: String,
      trim: true,
      default: null,
    },
    targetingType: { type: String, trim: true, default: null },
    cpc: {
      type: Number,
      trim: true,
      default: 0,
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
    timezone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("campaignHistory", campaignHistorySchema);
