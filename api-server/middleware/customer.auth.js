const customerSchema = require("../models/customer.model");
const jwt = require("jsonwebtoken");

const verifyToken = async (req, res, next) => {
  const token =
    req.body.token ||
    req.query.token ||
    req.header["x-access-token"] ||
    req.header("authorization");
  if (!token) {
    return res
      .status(203)
      .send({ message: "Token is required", isSuccess: false });
  }
  const bearerToken = token.split(" ")[1];
  try {
    jwt.verify(
      bearerToken,
      process.env.CUSTOMER_TOKEN_KEY,
      async (error, authData) => {
        if (error) {
          return res.status(203).send({
            error: error.message,
            message: "Invalid token",
            isSuccess: false,
          });
        }
        let customer = await customerSchema.findOne({
          _id: authData.customer_id,
        });
        req.customer = customer;
        if (!req.customer) {
          return res.status(203).send({
            message: "Please pass token in header.",
            isSuccess: false,
          });
        }
        next();
      }
    );
  } catch (error) {
    return res.status(203).message({
      error: error.message,
      message: "Something went wrong, please try agian!",
      isSuccess: false,
    });
  }
};
module.exports = { verifyToken };
