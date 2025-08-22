const Joi = require("joi");

const createPackageValidator = async (req, res, next) => {
  const schema = Joi.object({
    packageName: Joi.string().required().messages({
      "string.empty": "package name should not be empty!",
    }),
    campaignTypes: Joi.array().items(Joi.string()).min(1).required(),
    allowProfiles: Joi.number().min(1).required(),
    allowPermission: Joi.array()
      .items(
        Joi.object({
          moduleId: Joi.string().min(24).max(24).required(),
          name: Joi.string().required(),
          totalCount: Joi.number().required(),
        })
      )
      .min(1)
      .required(),
    price: Joi.array()
      .items(
        Joi.object({
          type: Joi.string().valid("Monthly", "Yearly").required(),
          priceINR: Joi.number().required(),
          priceUSD: Joi.number().required(),
        })
      )
      .min(1)
      .required(),
    trialDays: Joi.when("packageType", {
      is: "Trial",
      then: Joi.number().min(1).required(),
      otherwise: Joi.number().optional(),
    }),
    packageType: Joi.string().allow("").required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

const assignPackageValidator = async (req, res, next) => {
  const schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    packageId: Joi.string().min(24).max(24).required(),
    priceId: Joi.string().min(24).max(24).required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

const reNewPackageValidator = async (req, res, next) => {
  const schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    packageId: Joi.string().min(24).max(24).required(),
    priceId: Joi.string().min(24).max(24).required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

module.exports = {
  createPackageValidator,
  assignPackageValidator,
  reNewPackageValidator
};
