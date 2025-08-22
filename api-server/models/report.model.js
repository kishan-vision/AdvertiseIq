const mongoose = require("mongoose");
const reportsSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    reportName: {
      type: String,
      trim: true,
    },
    adProduct: {
      type: String,
      trim: true,
    },
    reportTypeId: {
      type: String,
      trim: true,
    },
    reportId: {
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
    },
    status: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("reports", reportsSchema);
