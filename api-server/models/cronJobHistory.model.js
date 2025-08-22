const mongoose = require("mongoose");
const cronJobHistorySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    profileId: {
      type: Number,
      trim: true,
    },
    cronName: {
      type: String,
      trim: true,
    },
    status:{
      type: String,
      trim: true,
    },
    historyDate:{
      type: String,
      trim: true,
    }
  },
  { timestamps: true }
);
module.exports = new mongoose.model("cronJobHistory", cronJobHistorySchema);
