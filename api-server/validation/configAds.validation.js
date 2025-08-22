const Joi = require("joi");

const keyValidation = async (req, res, next) => {
  const Schema = Joi.object({
    clientId: Joi.string().required(),
    clientSecret: Joi.string().required(),
    refreshToken: Joi.string().required(),
  });
  const { error } = Schema.validate(req.body);
  if (error) {
    return res.status(203).send({
      isSuccess: false,
      message: error.message,
    });
  } else {
    next();
  }
};

module.exports = {
  keyValidation,
};
