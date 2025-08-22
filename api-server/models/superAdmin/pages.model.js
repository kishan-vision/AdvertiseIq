const mongoose = require("mongoose");
const pageSchema = new mongoose.Schema(
  {
    pageName: {
      type: String,
      trim: true,
    },
    pageUrl: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);
module.exports = new mongoose.model("page", pageSchema);
