const mongoose = require("mongoose");

const extraCronSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    campaignId: {
      type: String,
      trim: true,
    },
    body: {
      type: String,
    },
    isRun: {
      type: Boolean,
      default: false,
    },
    runType: {
      type: String,
      trim: true,
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    runName: {
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
  },
  { timestamps: true }
);
module.exports = new mongoose.model("extraCron", extraCronSchema);
