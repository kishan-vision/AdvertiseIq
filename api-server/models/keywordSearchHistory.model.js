const mongoose = require("mongoose");
const keywordSearchHistorySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    search: {
      type: String,
      trim: true,
    },
    currentDate: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model(
  "keywordSearchHistory",
  keywordSearchHistorySchema
);
