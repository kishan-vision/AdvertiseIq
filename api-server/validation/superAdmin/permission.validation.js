const Joi = require("joi");

const applyPermisssionValidator = async (req, res, next) => {
  const schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    pages: Joi.object({
      pageId: Joi.string().min(24).max(24).required(),
      allocatedActions: Joi.array().min(1).required(),
    }).required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

const updatePermissionValidator = async (req, res, next) => {
  const schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    pageId: Joi.string().min(24).max(24).required(),
    actionId: Joi.string().min(24).max(24).required(),
    status: Joi.boolean().required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

const removePermissionValidator = async (req, res, next) => {
  const schema = Joi.object({
    customerId: Joi.string().min(24).max(24).required(),
    pageId: Joi.string().min(24).max(24).required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(203).send({ message: error.message, isSuccess: false });
  } else {
    next();
  }
};

module.exports = {
  applyPermisssionValidator,
  updatePermissionValidator,
  removePermissionValidator,
};
