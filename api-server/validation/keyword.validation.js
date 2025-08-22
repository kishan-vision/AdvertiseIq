const Joi = require("joi");

const createKeyword = async (req, res, next) => {
  const type = req.body.type;
  let schema;
  if (type == "Sponsored Products") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      bid: Joi.number().optional(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      state: Joi.string().valid("ENABLED", "PAUSED").required(),
      campaignId: Joi.number().unsafe().required(),
      adGroupId: Joi.number().unsafe().required(),
      matchType: Joi.string().valid("EXACT", "PHRASE", "BROAD").required(),
      type: Joi.string().required(),
    });
  } else if (type == "Sponsored Brands") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      bid: Joi.number().optional(),
      name: Joi.string().required().trim().messages({
        "string.empty": "Name should not be empty!",
      }),
      campaignId: Joi.number().unsafe().required(),
      adGroupId: Joi.number().unsafe().required(),
      matchType: Joi.string().valid("EXACT", "PHRASE", "BROAD").required(),
      type: Joi.string().required(),
    });
  } else {
    return res.status(203).send({
      isSuccess: false,
      message: "Type is required.",
    });
  }
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

const updateKeyword = async (req, res, next) => {
  const type = req.body.type;
  let schema;
  if (type == "Sponsored Products") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      bid: Joi.number().required(),
      name: Joi.string().required(),
      state: Joi.string().valid("ENABLED", "PAUSED").required(),
      campaignId: Joi.number().unsafe().required(),
      adGroupId: Joi.number().unsafe().required(),
      matchType: Joi.string().valid("EXACT", "PHRASE", "BROAD").required(),
      type: Joi.string().required(),
    });
  } else if (type == "Sponsored Brands") {
    schema = Joi.object({
      profileId: Joi.number().required(),
      bid: Joi.number().required(),
      name: Joi.string().required(),
      campaignId: Joi.number().unsafe().required(),
      adGroupId: Joi.number().unsafe().required(),
      state: Joi.string()
        .valid("ENABLED", "PAUSED", "PENDING", "ARCHIVED", "DRAFT")
        .required(),
      matchType: Joi.string().valid("EXACT", "PHRASE", "BROAD").required(),
      type: Joi.string().required(),
    });
  } else {
    return res.status(203).send({
      isSuccess: false,
      message: "Type is required!",
    });
  }
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

module.exports = {
  createKeyword,
  updateKeyword,
};
