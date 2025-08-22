const mongoose = require("mongoose");

const notificationSchema = mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer",
    },
    heading: {
      type: String,
    },
    message: {
      type: String,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    statusNotificationFor: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("notification", notificationSchema);
