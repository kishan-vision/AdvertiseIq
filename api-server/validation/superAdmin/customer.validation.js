const Joi = require("joi");

const updateValidation = async (req, res, next) => {
  const Schema = Joi.object({
    fullName: Joi.string().required().trim().messages({
      "string.empty": "Name should not be empty!",
    }),
    phoneNumber: Joi.string()
      .required()
      .regex(/^[0-9]{10}$/)
      .messages({ "string.pattern.base": `Phone number must have 10 digits!` })
      .required(),
    platforms: Joi.array().items(Joi.string().min(24).max(24)).optional(),
    country: Joi.string().required().messages({
      "string.empty": "Country should not be empty!",
    }),
    email: Joi.string()
      .regex(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)
      .required()
      .messages({
        "string.empty": "Email should not be empty!",
        "string.pattern.base": "Email should be contain valid character!",
      }),
    packageId: Joi.string().min(24).max(24).required(),
    priceId: Joi.string().min(24).max(24).required(),
    clientId: Joi.string().empty("").optional(),
    adsRefreshToken: Joi.string().empty("").optional(),
    clientSecret: Joi.string().empty("").optional(),
    sellerClientId: Joi.string().empty("").optional(),
    sellerClientSecret: Joi.string().empty("").optional(),
    sellerRefreshToken: Joi.string().empty("").optional(),
    vendorClientId: Joi.string().empty("").optional(),
    vendorClientSecret: Joi.string().empty("").optional(),
    vendorRefreshToken: Joi.string().empty("").optional(),
    companyName: Joi.string().optional(),
    companyGstNumber: Joi.string()
      .optional()
      .regex(/^[0-9A-Z]{15}$/)
      .messages({ "string.pattern.base": `GST number must have 15 digits!` }),
    companyAddress: Joi.string().optional(),
    companyWebsite: Joi.string()
      .uri({
        scheme: ["http", "https"],
      })
      .allow(""),
    companyPhoneNumber: Joi.string()
      .optional()
      .regex(/^[0-9]{10}$/)
      .messages({ "string.pattern.base": `Phone number must have 10 digits!` }),
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

const updateStatusValidation = async (req, res, next) => {
  const Schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    isActive: Joi.boolean().required(),
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

module.exports = { updateValidation, updateStatusValidation };
