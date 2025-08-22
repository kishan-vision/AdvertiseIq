const configAdsSchema = require("../models/configAd.model");
const cronJobSchedularSchema = require("../models/cronJobSchedular.model");
const permissionSchema = require("../models/superAdmin/permission.model");
const profileSchema = require("../models/profiles.model");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const getAccessToken = async (customerId, res) => {
  const checkConfigAds = await configAdsSchema.findOne({ customerId });
  if (!checkConfigAds) {
    return res.status(401).send({ message: "Please required access token!" });
  }
  return checkConfigAds;
};

const getProfile = async (customerId, profileId) => {
  const checkAccount = await profileSchema.findOne({
    customerId: new ObjectId(customerId),
    profileId,
  });
  if (!checkAccount) {
    return console.log("Please connect your account!");
  }
  return checkAccount;
};


const cronGetAccessToken = async (customerId) => {
  const checkConfigAds = await configAdsSchema.findOne({ customerId });
  if (!checkConfigAds) {
    return console.log("Please required access token!");
  }
  return checkConfigAds;
};

const cronCheckCustomerPermission = async (customerId, profileId, cronName) => {
  const checkCustomerPermission = await cronJobSchedularSchema.findOne(
    {
      customerId,
      profileId,
      cronName,
    },
    { isActive: 1, _id: 0 }
  );
  if (checkCustomerPermission && checkCustomerPermission.isActive) {
    return true;
  } else {
    return false;
  }
};

const checkPermission = async (customerId, pageName, actionType, status) => {
  try {
    const permission = await permissionSchema
      .findOne({
        customerId,
      })
      .populate("pages.pageId", { pageName: 1 })
      .populate("pages.allocatedActions.actionId", { actionType: 1 });

    if (!permission) {
      return {
        isSuccess: false,
        message: "Permission not found for this customer.",
        hasPermission: false,
      };
    }
    let transformedData = {
      pages: permission.pages.map((page) => ({
        pageName: page.pageId.pageName,
        allocatedActions: page.allocatedActions.map((action) => ({
          actionId: action.actionId._id,
          actionType: action.actionId.actionType,
          status: action.status,
        })),
      })),
    };
    const matchingPage = transformedData.pages.find(
      (page) => page.pageName == pageName
    );
    if (!matchingPage) {
      return {
        isSuccess: false,
        message: `Permission not granted for the '${pageName}' page.`,
        hasPermission: false,
      };
    }
    const matchingAction = matchingPage.allocatedActions.find(
      (action) => action.actionType == actionType && action.status == status
    );
    if (!matchingAction) {
      return {
        isSuccess: false,
        message: `Permission not granted for the '${actionType}' action on the '${pageName}' page.`,
        hasPermission: false,
      };
    }
    return {
      isSuccess: true,
      message: "Permission granted.",
      hasPermission: true,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: "Something went wrong while checking permission.",
      error: error.message,
      hasPermission: false,
    };
  }
};

module.exports = {
  getAccessToken,
  cronGetAccessToken,
  cronCheckCustomerPermission,
  checkPermission,
  getProfile
};
