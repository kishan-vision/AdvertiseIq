const Joi = require("joi");

const createModuleValidator = async (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().required().messages({
      "string.empty": "Name should not be empty!",
    }),
    estimatedPriceINR: Joi.number().required(),
    estimatedPriceUSD: Joi.number().required(),
    description: Joi.string().required(),
    module: Joi.array().optional(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

module.exports = {
  createModuleValidator,
};
