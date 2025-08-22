const Joi = require("joi");

const addMailContentValidation = async (req, res, next) => {
  const schema = Joi.object({
    mailContentName: Joi.string().required().trim().messages({
      "string.empty": "Mail content name should not be empty!",
    }),
    mailContent: Joi.string().required().trim().messages({
      "string.empty": "Mail content should not be empty!",
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

module.exports = { addMailContentValidation };
