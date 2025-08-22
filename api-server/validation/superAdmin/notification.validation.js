const Joi = require("joi");

const createNotificationValidation = async (req, res, next) => {
  const schema = Joi.object({
    heading: Joi.string().required().trim().messages({
      "string.empty": "Notification heading should not be empty!",
    }),
    message: Joi.string().required().trim().messages({
      "string.empty": "Notification message should not be empty!",
    }),
    statusNotificationFor: Joi.string().required().trim().messages({
      "string.empty": "Status notification for should not be empty!",
    }),
    customerId: Joi.string().required().trim().messages({
      "string.empty": "Customer Id should not be empty!",
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

module.exports = { createNotificationValidation };
