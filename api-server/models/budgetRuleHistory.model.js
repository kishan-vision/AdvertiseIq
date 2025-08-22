const mongoose = require("mongoose");
const budgetRulesHistorySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    ruleDate: {
      type: String,
      trim: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "budgetRule",
    },
    ruleName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    dailyCount: {
      type: Number,
      trim: true,
    },
    excutedCount: {
      type: Number,
      trim: true,
    },
    lastRun: {
      type: String,
      trim: true,
    },
    nextRun: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model(
  "budgetRulesHistory",
  budgetRulesHistorySchema
);
