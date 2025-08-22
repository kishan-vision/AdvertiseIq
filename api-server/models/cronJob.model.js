const mongoose = require("mongoose");
const cronJobSchema = new mongoose.Schema(
  {
    cronName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("cronJob", cronJobSchema);
