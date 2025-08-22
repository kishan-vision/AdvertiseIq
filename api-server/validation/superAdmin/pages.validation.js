const Joi = require("joi");

const createPageValidator = async (req, res, next) => {
  const schema = Joi.object({
    pageName: Joi.string().required().trim().messages({
      "string.empty": "Page name should not be empty!",
    }),
    pageUrl: Joi.string().required().trim().messages({
      "string.empty": "Page url should not be empty!",
    }),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

module.exports = {
  createPageValidator,
};
