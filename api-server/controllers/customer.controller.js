const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const customerSchema = require("../models/customer.model");
const configAdsSchema = require("../models/configAd.model");
const themeSchema = require("../models/theme.model");
const moment = require("moment-timezone");
const permissionSchema = require("../models/superAdmin/permission.model");
const loginHistorySchema = require("../models/superAdmin/loginHistory.model");
const { checkPermission } = require("../helper/common");

exports.login = async (req, res) => {
  try {
    const { email, password, ip_address, location, timeZone, currency, flag } =
      req.body;
    const findEmail = await customerSchema.findOne({ email });
    if (!findEmail) {
      return res
        .status(203)
        .json({ message: "Email not found!", isSuccess: false });
    }
    if (findEmail.role === 2 && !findEmail.isActive) {
      return res.status(203).json({
        message: "Your status is deactivated by the super admin.",
        isSuccess: false,
      });
    }
    const currentDate = moment().format("YYYY-MM-DD");
    if (findEmail.packageEndDate && findEmail.packageEndDate < currentDate) {
      return res
        .status(203)
        .json({ message: "Your package has expired.", isSuccess: false });
    }
    const isMatch = await bcrypt.compare(password, findEmail.password);
    const themeData = await themeSchema.find({ customerId: findEmail._id });
    if (isMatch) {
      let getCustomerPermission;
      let transformedData;
      if (findEmail.role === 2) {
        getCustomerPermission = await permissionSchema
          .findOne({ customerId: findEmail._id })
          .populate("pages.pageId", { pageName: 1 })
          .populate("pages.allocatedActions.actionId", { actionType: 1 });

        if (getCustomerPermission) {
          transformedData = {
            customerId: getCustomerPermission.customerId,
            _id: getCustomerPermission._id,
            pages: getCustomerPermission.pages.map((page) => ({
              pageId: page.pageId._id,
              pageName: page.pageId.pageName,
              allocatedActions: page.allocatedActions.map((action) => ({
                actionId: action.actionId._id,
                actionType: action.actionId.actionType,
                status: action.status,
              })),
            })),
          };
        }
      }
      const authToken = jwt.sign(
        {
          customer_id: findEmail._id,
          email,
          role: findEmail.role,
        },
        process.env.CUSTOMER_TOKEN_KEY,
        { expiresIn: process.env.TOKEN_EXPIRE_TIME }
      );
      const loginHistory = new loginHistorySchema({
        customerId: findEmail._id,
        ipAddress: ip_address ? ip_address : "",
        location: location ? location : "",
        timezone: timeZone,
      });
      await loginHistory.save();
      return res.status(200).json({
        message: "Login successfully.",
        authToken,
        customerId: findEmail._id,
        themeData: [themeData],
        role: findEmail.role,
        getCustomerPermission: transformedData ? transformedData : [],
        isSuccess: true,
      });
    } else {
      return res
        .status(203)
        .json({ message: "Invalid password!", isSuccess: false });
    }
  } catch (error) {
    return res.status(203).json({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getProfile = async (req, res) => {
  const customerId = req.customer._id;
  try {
    await customerSchema
      .findById(customerId)
      .then(async (profile) => {
        if (!profile) {
          return res
            .status(203)
            .send({ message: "Customer not found!", isSuccess: false });
        }
        const configAdsData = await configAdsSchema.findOne({ customerId });
        const permissionResult = await checkPermission(
          customerId,
          "Settings",
          "Link Your Account",
          true
        );
        if (!permissionResult.hasPermission) {
          return res.status(200).send({
            profile,
            configAdsData: {},
            isSuccess: true,
            message: "Get customer data successfully.",
          });
        }
        return res.status(200).send({
          profile,
          configAdsData,
          isSuccess: true,
          message: "Get customer data successfully.",
        });
      })

      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};
