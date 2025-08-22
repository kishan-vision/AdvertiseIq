const mongoose = require("mongoose");
const ccronJobSchedularSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    cronId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "cronJob",
    },
    cronName: {
      type: String,
      trim: true,
    },
    profileId: {
      type: Number,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    lastRun: {
      type: String,
      default: "",
    },
    nextRun: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model(
  "cronJobSchedular",
  ccronJobSchedularSchema
);
