const mongoose = require("mongoose");
const rulesHistorySchema = new mongoose.Schema(
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
    totalCount: {
      type: Number,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    time: {
      type: String,
      trim: true,
    },
    nextTime: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("rulesHistory", rulesHistorySchema);
