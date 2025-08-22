const mongoose = require("mongoose");
const budgetRulesSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    ruleName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    campaignIds: {
      type: [String],
      trim: true,
    },
    conditions: [
      {
        conditionType: String,
        conditionOperator: String,
        conditionValue: Number,
        conditionValueType: String,
      },
    ],
    actionType: {
      actionName: String,
      actionValue: { type: Number, default: "" },
      actionValueType: { type: String, default: "" },
    },
    times: { type: [String], trim: true },
    countryCode: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("budgetRule", budgetRulesSchema);
