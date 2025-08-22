const Joi = require("joi");

const registerValidation = async (req, res, next) => {
  const Schema = Joi.object({
    fullName: Joi.string().required().trim().messages({
      "string.empty": "Name should not be empty!",
    }),
    email: Joi.string()
      .regex(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)
      .required()
      .messages({
        "string.empty": "Email should not be empty!",
        "string.pattern.base": "Email should be contain valid character!",
      }),
    password: Joi.string().required().trim().min(6).max(15).messages({
      "string.empty": "Password should not be empty!",
      "string.min": "Password should contain mininum 6 characters!",
      "string.max": "Password is too long!",
    }),
    phoneNumber: Joi.string()
      .required()
      .regex(/^[0-9]{10}$/)
      .messages({ "string.pattern.base": `Phone number must have 10 digits!` })
      .required(),
    country: Joi.string().required().messages({
      "string.empty": "Country should not be empty!",
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

const loginValidation = async (req, res, next) => {
  const Schema = Joi.object({
    email: Joi.string()
      .regex(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)
      .required()
      .messages({
        "any.required": "Email is required field!",
        "string.empty": "Email should not be empty!",
        "string.pattern.base": "Email should be contain valid character!",
      }),
    password: Joi.string().min(6).max(15).messages({
      "any.required": "Password is required field!",
      "string.empty": "Password should not be empty!",
      "string.min": "Password should contain mininum 6 characters!",
      "string.max": "Password is too long!",
    }),
    ip_address: Joi.string().optional(),
    location: Joi.object({
      country_name: Joi.string().optional(),
      country_code: Joi.string().optional(),
      state_name: Joi.string().optional(),
      state_code: Joi.string().optional(),
      city: Joi.string().optional(),
      postal_code: Joi.string().optional(),
      latitude: Joi.string().optional(),
      longitude: Joi.string().optional(),
    }),
    timeZone: Joi.object({
      name: Joi.string().optional(),
      abbreviation: Joi.string().optional(),
      current_time: Joi.string().optional(),
    }),
    currency: Joi.object({
      currency_name: Joi.string().optional(),
      currency_code: Joi.string().optional(),
    }),
    flag: Joi.string().optional(),
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

const changePasswordValidator = async (req, res, next) => {
  const schema = Joi.object({
    oldPassword: Joi.string().min(6).required(),
    newPassword: Joi.string().trim().min(6).required().messages({
      "string.empty": "New password should not be empty!",
    }),
    confirmPassword: Joi.any()
      .valid(Joi.ref("newPassword"))
      .required()
      .options({
        messages: {
          "any.only": "New password and Confirm password does not match!",
        },
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
  registerValidation,
  loginValidation,
  changePasswordValidator,
};
