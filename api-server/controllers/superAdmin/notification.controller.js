const notificationSchema = require("../../models/superAdmin/notification.model");

exports.getNotifications = async (req, res) => {
  try {
    const customerId = req.customer._id;
    await notificationSchema
      .find({ customerId: customerId })
      .sort({ createdAt: -1 })
      .then(async (data) => {
        return res.status(200).send({
          data,
          isSuccess: true,
          message: "Notifications listing successfully.",
        });
      })
      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};
