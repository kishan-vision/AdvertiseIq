const Joi = require("joi");

const makePaymentValidator = async (req, res, next) => {
  const schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    transactionId: Joi.string().required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

module.exports = {
  makePaymentValidator,
};
