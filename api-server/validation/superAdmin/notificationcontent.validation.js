const Joi = require("joi");

const addNotificationcontentValidation = async (req, res, next) => {
  const schema = Joi.object({
    notificationContentName: Joi.string().required().trim().messages({
      "string.empty": "Notification content name should not be empty!",
    }),
    notificationContent: Joi.string().required().trim().messages({
      "string.empty": "Notification content should not be empty!",
    }),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({
      isSuccess: false,
      message: error.message,
    });
  } else {
    next();
  }
};

module.exports = { addNotificationcontentValidation };
