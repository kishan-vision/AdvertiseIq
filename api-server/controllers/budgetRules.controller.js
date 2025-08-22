const budgetRulesSchema = require("../models/budgetRules.model");
const campaignsSchema = require("../models/campaign.model");
const rulesHistorySchema = require("../models/ruleHistory.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const budgetRulesHistorySchema = require("../models/budgetRuleHistory.model");
const campaignHistorySchema = require("../models/campaignHistory.model");
const extraCronSchema = require("../models/extraCron.model");
const {
  cronGetAccessToken,
  getProfile,
  getAccessToken,
  checkPermission,
} = require("../helper/common");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const moment = require("moment-timezone");
const axios = require('axios');
const path = require('path');
const { Worker } = require("worker_threads");
const { write_logs } = require("../../winston/budgetRules/logger");
const { extra_write_logs } = require("../../winston/checkCronRule/logger");

exports.getCampaignsName = async (req, res) => {
  const profileId = req.body.profileId;
  const customerId = req.customer._id;
  try {
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required.",
        isSuccess: false,
      });
    }
    const getCampaigns = await campaignsSchema.aggregate([
      {
        $match: {
          profileId: Number(profileId),
          customerId: new ObjectId(customerId),
          status: {
            $in: ["ENABLED", "PAUSED"],
          },
        },
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
          },
          campaign: {
            $first: "$$ROOT",
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: "$campaign",
        },
      },
      {
        $project: {
          campaignId: 1,
          name: 1,
          type: 1,
          status: 1,
          _id: 0,
        },
      },
    ]);
    return res.status(200).send({
      message: "Campaigns Name listing successfully",
      data: getCampaigns,
      isSuccess: true,
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.createRule = async (req, res) => {
  const customerId = req.customer._id;
  const permissionResult = await checkPermission(
    customerId,
    "Budget Rules",
    "Create",
    true
  );
  if (!permissionResult.hasPermission) {
    return res.status(203).send({
      isSuccess: false,
      message: permissionResult.message,
    });
  }
  const { profileId, ruleName, conditions, actionType, times } = req.body;
  try {
    const getAccount = await getProfile(customerId, profileId);
    if (!getAccount) {
      return res
        .status(203)
        .send({ message: "Please select valid account!", isSuccess: false });
    }
    let timesArray = [];
    let start = new Date(`1970-01-01T00:00:00Z`);
    let end = new Date(`1970-01-01T01:00:00Z`);
    while (start <= end) {
      const timeString = start.toISOString().slice(11, 16);
      timesArray.push(timeString);
      start.setMinutes(start.getMinutes() + 1);
    }
    if (times && times.length > 0) {
      for (let i = 0; i <= times.length - 1; i++) {
        // if (timesArray.includes(times[i])) {
        //   return res.status(203).send({
        //     isSuccess: false,
        //     message:
        //       "Budget rule can not be asssigned between 12:00 AM to 01:00 AM.",
        //   });
        // }
        let exitsTime = await budgetRulesSchema.findOne({
          times: { $in: [times[i]] },
          customerId,
          profileId,
        });
        if (exitsTime) {
          return res.status(203).send({
            isSuccess: false,
            message: "This time is already applied for another rule!",
          });
        }
      }
    }
    const createRule = await budgetRulesSchema({
      customerId,
      profileId,
      ruleName,
      conditions,
      actionType,
      times,
      countryCode: getAccount.countryCode,
      timezone: getAccount.timezone,
    });
    createRule
      .save()
      .then(async (rule) => {
        return res.status(200).send({
          isSuccess: true,
          message: "Budget Rule created successfully.",
          data: rule,
        });
      })
      .catch((error) => {
        return res.status(203).send({
          message: "Something went wrong, please try again!",
          isSuccess: false,
          error: error.message,
        });
      });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.updateRule = async (req, res) => {
  const ruleId = req.params.ruleId;
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Budget Rules",
      "Update",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    const { times } = req.body;
    if (times && times.length > 0) {
      let exitsRule = await budgetRulesSchema.findOne({
        _id: ruleId,
      });
      let timesArray = [];
      let start = new Date(`1970-01-01T00:00:00Z`);
      let end = new Date(`1970-01-01T01:00:00Z`);
      while (start <= end) {
        const timeString = start.toISOString().slice(11, 16);
        timesArray.push(timeString);
        start.setMinutes(start.getMinutes() + 1);
      }
      for (let i = 0; i <= times.length - 1; i++) {
        // if (timesArray.includes(times[i])) {
        //   return res.status(203).send({
        //     isSuccess: false,
        //     message:
        //       "Budget rule can not be asssigned between 12:00 AM to 01:00 AM.",
        //   });
        // }
        let exitsTime = await budgetRulesSchema.findOne({
          _id: { $ne: ruleId },
          times: { $in: [times[i]] },
          customerId: exitsRule.customerId,
          profileId: exitsRule.profileId,
        });
        if (exitsTime) {
          return res.status(203).send({
            message: "This time is already applied for another rule!",
            isSuccess: false,
          });
        }
        // const currentTime = new Date(`2000-01-01T${times[i]}:00`);
        // const nextTime = new Date(`2000-01-01T${times[i + 1]}:00`);
        // const timeDifference = Math.abs(currentTime - nextTime) / 1000 / 60; // Difference in minutes
        // if (timeDifference < 5) {
        //   return res.status(203).send({
        //     message: "Minimum 5 minute difference is valid for all times",
        //     isSuccess: false,
        //   });
        // }
      }
    }
    await budgetRulesSchema
      .findByIdAndUpdate(ruleId, req.body, { new: true })
      .then((rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
        }
        return res.status(200).send({
          message: "Rule updated successfully.",
          isSuccess: true,
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

exports.changeStatus = async (req, res) => {
  try {
    const ruleId = req.params.ruleId;
    await budgetRulesSchema
      .findByIdAndUpdate(ruleId, { isActive: req.body.isActive }, { new: true })
      .then((rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
        }
        return res.status(200).send({
          message: "Status updated successfully.",
          isSuccess: true,
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
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    const ruleId = req.params.ruleId;
    const customerId = req.customer._id;
    const permissionResult = await checkPermission(
      customerId,
      "Budget Rules",
      "Remove",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    await budgetRulesSchema
      .findByIdAndDelete(ruleId)
      .then((rule) => {
        if (!rule) {
          return res
            .status(203)
            .send({ message: "Rule not found!", isSuccess: false });
        }
        return res
          .status(200)
          .send({ message: "Rule deleted successfully.", isSuccess: true });
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
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.getBudgetRules = async (req, res) => {
  const customerId = req.customer._id;
  const profileId = req.body.profileId;
  const pageNo = req.body.pageNo ? req.body.pageNo : 1;
  const perPage = req.body.perPage ? req.body.perPage : 10;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Budget Rules",
      "View Only",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    const filter = {
      customerId,
      profileId,
    };
    const getRules = await budgetRulesSchema
      .find(filter)
      .skip(perPage * pageNo - perPage)
      .limit(perPage);
    const totalRecords = await budgetRulesSchema.count(filter);
    return res.status(200).send({
      isSuccess: true,
      message: "Budget Rules listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getRules,
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getRule = async (req, res) => {
  const _id = req.params.ruleId;
  try {
    const getRule = await budgetRulesSchema.findById(_id);
    return res.status(200).send({
      message: "Get Rule successfully",
      data: getRule,
      isSuccess: true,
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.ruleHistory = async (req, res) => {
  const customerId = req.customer._id;
  const permissionResult = await checkPermission(
    customerId,
    "Budget Rule History",
    "View Only",
    true
  );
  if (!permissionResult.hasPermission) {
    return res.status(203).send({
      isSuccess: false,
      message: permissionResult.message,
    });
  }
  let { profileId, pageNo, perPage, search, fromDate, toDate } = req.body;
  try {
    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;
    const filter = {
      customerId,
      profileId: Number(profileId),
    };
    if (search) {
      filter.ruleName = { $regex: new RegExp(search, "i") };
    }
    if (fromDate && toDate) {
      filter.ruleDate = { $gte: fromDate, $lte: toDate };
    }
    const getRules = await budgetRulesHistorySchema
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(perPage * pageNo - perPage)
      .limit(perPage);
    const totalRecords = await budgetRulesHistorySchema.count(filter);
    return res.status(200).send({
      isSuccess: true,
      message: "Budget Rules History listing successfully",
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
      data: getRules,
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.manualRun = async (req, res) => {
  const ruleId = req.params.ruleId;
  try {
    const getRule = await budgetRulesSchema.findById(ruleId);
    if (!getRule) {
      return res.status(203).send({
        message: "Rule not found!",
        isSuccess: false,
      });
    }
    const campaignIds = getRule.campaignIds;
    const customerId = getRule.customerId;
    if (campaignIds.length == 0) {
      return res.status(203).send({
        message: "Rule assign campaigns not found",
        isSuccess: false,
      });
    }
    const checkConfigAds = await getAccessToken(customerId, res);
    if (
      checkConfigAds &&
      checkConfigAds.adsAccessToken &&
      checkConfigAds.baseUrl
    ) {
      const profileId = getRule.profileId;
      const currentDate = moment().tz(getRule.timezone).format("YYYY-MM-DD");
      const campaigns = await campaignsSchema.find({
        customerId: customerId,
        profileId: profileId,
        campaignId: { $in: campaignIds },
        reportDate: currentDate,
      });
      if (campaigns.length > 0) {
        const runSchedule = await Promise.all(
          campaigns.map(async (campaign) => {
            if (getRule.conditions.length > 0) {
              let budgetConditions = "";
              let spendConditions = "";
              let salesConditions = "";
              let acosConditions = "";
              let roasConditions = "";
              let ordersConditions = "";
              let impressionsConditions = "";
              let cpcConditions = "";
              let clicksConditions = "";
              await Promise.all(
                getRule.conditions.map(async (condition) => {
                  let conditionValue = condition.conditionValue;
                  if (condition.conditionValueType == "Percentage") {
                    conditionValue = (campaign.budget * conditionValue) / 100;
                  }
                  if (
                    condition.conditionType == "Budget" &&
                    budgetConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      budgetConditions = campaign.budget > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      budgetConditions = campaign.budget >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      budgetConditions = campaign.budget < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      budgetConditions = campaign.budget <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      budgetConditions = campaign.budget == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "Spend" &&
                    spendConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      spendConditions = campaign.spend > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      spendConditions = campaign.spend >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      spendConditions = campaign.spend < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      spendConditions = campaign.spend <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      spendConditions = campaign.spend == conditionValue;
                    }
                  }

                  if (
                    condition.conditionType == "Sales" &&
                    salesConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      salesConditions = campaign.sales > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      salesConditions = campaign.sales >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      salesConditions = campaign.sales < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      salesConditions = campaign.sales <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      salesConditions = campaign.sales == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "ACOS" &&
                    acosConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      acosConditions = campaign.acos > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      acosConditions = campaign.acos >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      acosConditions = campaign.acos < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      acosConditions = campaign.acos <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      acosConditions = campaign.acos == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "ROAS" &&
                    roasConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      roasConditions = campaign.roas > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      roasConditions = campaign.roas >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      roasConditions = campaign.roas < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      roasConditions = campaign.roas <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      roasConditions = campaign.roas == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "Orders" &&
                    ordersConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      ordersConditions = campaign.orders > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      ordersConditions = campaign.orders >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      ordersConditions = campaign.orders < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      ordersConditions = campaign.orders <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      ordersConditions = campaign.orders == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "Impressions" &&
                    impressionsConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      impressionsConditions =
                        campaign.impressions > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      impressionsConditions =
                        campaign.impressions >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      impressionsConditions =
                        campaign.impressions < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      impressionsConditions =
                        campaign.impressions <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      impressionsConditions =
                        campaign.impressions == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "CPC" &&
                    cpcConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      cpcConditions = campaign.cpc > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      cpcConditions = campaign.cpc >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      cpcConditions = campaign.cpc < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      cpcConditions = campaign.cpc <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      cpcConditions = campaign.cpc == conditionValue;
                    }
                  }
                  if (
                    condition.conditionType == "Clicks" &&
                    clicksConditions !== false
                  ) {
                    if (condition.conditionOperator == "GREATER_THAN") {
                      clicksConditions = campaign.clicks > conditionValue;
                    } else if (
                      condition.conditionOperator == "GREATER_THAN_OR_EQUAL_TO"
                    ) {
                      clicksConditions = campaign.clicks >= conditionValue;
                    } else if (condition.conditionOperator == "LESS_THAN") {
                      clicksConditions = campaign.clicks < conditionValue;
                    } else if (
                      condition.conditionOperator == "LESS_THAN_OR_EQUAL_TO"
                    ) {
                      clicksConditions = campaign.clicks <= conditionValue;
                    } else if (condition.conditionOperator == "EQUAL_TO") {
                      clicksConditions = campaign.clicks == conditionValue;
                    }
                  }
                })
              );
              console.log(
                `${getRule._id}, ${getRule.ruleName}, ${campaign.campaignId}, ordersConditions: ${ordersConditions}, clicksConditions: ${clicksConditions}, salesConditions: ${salesConditions}, spendConditions: ${spendConditions}, roasConditions: ${roasConditions}, acosConditions: ${acosConditions}, budgetConditions: ${budgetConditions}, impressionsConditions: ${impressionsConditions}, cpcConditions: ${cpcConditions}`
              );
              const conditionsArray = [
                budgetConditions,
                spendConditions,
                roasConditions,
                salesConditions,
                clicksConditions,
                ordersConditions,
                acosConditions,
                impressionsConditions,
                cpcConditions,
              ];
              const conditions = conditionsArray.filter(
                (value) => value !== ""
              );
              let result = false;
              if (conditions.length > 0) {
                result = conditions.every((condition) => condition == true);
              }
              console.log(
                `${getRule._id}, ${getRule.ruleName}, ${campaign.campaignId}, Main Result: ${result}`
              );
              if (result) {
                let options = "";
                if (campaign.type == "Sponsored Products") {
                  options = {
                    method: "PUT",
                    url: `${checkConfigAds.baseUrl}/sp/campaigns`,
                    headers: {
                      "Amazon-Advertising-API-ClientId":
                        checkConfigAds.clientId,
                      "Amazon-Advertising-API-Scope": profileId,
                      Prefer: "return=representation",
                      Accept: "application/vnd.spCampaign.v3+json",
                      "Content-Type": "application/vnd.spCampaign.v3+json",
                      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    },
                  };
                } else if (campaign.type == "Sponsored Brands") {
                  options = {
                    method: "PUT",
                    url: `${checkConfigAds.baseUrl}/sb/v4/campaigns`,
                    headers: {
                      "Amazon-Advertising-API-ClientId":
                        checkConfigAds.clientId,
                      "Amazon-Advertising-API-Scope": profileId,
                      Accept: "application/vnd.updatecampaignsresponse.v4+json",
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    },
                  };
                } else if (campaign.type == "Sponsored Display") {
                  options = {
                    method: "PUT",
                    url: `${checkConfigAds.baseUrl}/sd/campaigns`,
                    headers: {
                      "Amazon-Advertising-API-ClientId":
                        checkConfigAds.clientId,
                      "Amazon-Advertising-API-Scope": profileId,
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                    },
                  };
                }
                const actionType = getRule.actionType;
                if (
                  actionType.actionName === "Enabled" ||
                  actionType.actionName === "Paused"
                ) {
                  let status = "";
                  if (actionType.actionName === "Enabled") {
                    status = "ENABLED";
                  }
                  if (actionType.actionName === "Paused") {
                    status = "PAUSED";
                  }
                  if (status) {
                    if (
                      campaign.type == "Sponsored Products" ||
                      campaign.type == "Sponsored Brands"
                    ) {
                      options.data = {
                        campaigns: [
                          {
                            campaignId: campaign.campaignId,
                            state: status,
                          },
                        ],
                      };
                    } else if (campaign.type == "Sponsored Display") {
                      options.data = [
                        {
                          state: status.toLowerCase(),
                          campaignId: campaign.campaignId,
                        },
                      ];
                    }
                  }
                }
                if (
                  actionType.actionName === "Increase" ||
                  actionType.actionName === "Decrease" ||
                  actionType.actionName == "setBudget"
                ) {
                  let actionValue = actionType.actionValue;
                  if (actionType.actionValueType == "Percentage") {
                    actionValue = (campaign.budget * actionValue) / 100;
                  }
                  if (actionType.actionName === "Increase") {
                    actionValue =
                      parseFloat(campaign.budget) + parseFloat(actionValue);
                  }
                  if (actionType.actionName === "Decrease") {
                    actionValue =
                      parseFloat(campaign.budget) - parseFloat(actionValue);
                  }
                  if (actionType.actionName == "setBudget") {
                    actionValue = parseFloat(actionValue);
                  }
                  if (actionValue) {
                    if (campaign.type == "Sponsored Products") {
                      options.data = {
                        campaigns: [
                          {
                            budget: {
                              budget: actionValue,
                              budgetType: campaign.budgetType,
                            },
                            campaignId: campaign.campaignId,
                          },
                        ],
                      };
                    } else if (campaign.type == "Sponsored Brands") {
                      options.data = {
                        campaigns: [
                          {
                            budget: actionValue,
                            campaignId: campaign.campaignId,
                          },
                        ],
                      };
                    } else if (campaign.type == "Sponsored Display") {
                      options.data = [
                        {
                          budget: actionValue,
                          campaignId: campaign.campaignId,
                        },
                      ];
                    }
                  }
                }
                if (options.data) {
                  try {
                    const response = await axios(axiosOptions);

                    if (response.status == 207) {
                      const body = response.data;
                      if (campaign.type == "Sponsored Display") {
                        let SdResponse = options.data;
                        if (body[0].code == "SUCCESS" && SdResponse) {
                          if (body[0].campaignId == SdResponse[0].campaignId) {
                            let sdObj = {};
                            let sdStatus = "";
                            let sdObjHistory = {
                              runType: "Budget Rule",
                              runId: getRule._id,
                              runName: getRule.ruleName,
                              isType: "MANUAL",
                              campaignId: campaign.campaignId,
                              customerId: campaign.customerId,
                              profileId: campaign.profileId,
                              name: campaign.name,
                              fromStatus: campaign.status,
                              type: campaign.type,
                              currencyCode: campaign.currencyCode,
                              startDate: campaign.startDate,
                              endDate: campaign.endDate,
                              fromBudget: campaign.budget,
                              budgetType: campaign.budgetType,
                              costType: campaign.costType,
                              targetingType: campaign.targetingType,
                              cpc: campaign.cpc,
                              clicks: campaign.clicks,
                              spend: campaign.spend,
                              orders: campaign.orders,
                              sales: campaign.sales,
                              acos: campaign.acos,
                              roas: campaign.roas,
                              impressions: campaign.impressions,
                              timezone: campaign.timezone,
                            };
                            if (SdResponse[0].state) {
                              sdStatus = SdResponse[0].state.toUpperCase();
                              if (campaign.status != sdStatus) {
                                sdObj.status = sdStatus;
                                sdObjHistory.toStatus = sdStatus;
                              }
                            }
                            if (
                              SdResponse[0].budget &&
                              campaign.budget != SdResponse[0].budget
                            ) {
                              sdObj.budget = SdResponse[0].budget;
                              sdObjHistory.toBudget = SdResponse[0].budget;
                            }
                            await campaignsSchema
                              .updateOne(
                                {
                                  customerId: campaign.customerId,
                                  profileId: campaign.profileId,
                                  campaignId: body[0].campaignId,
                                  reportDate: currentDate,
                                },
                                {
                                  $set: sdObj,
                                }
                              )
                              .then((result) => {
                                console.log(
                                  campaign.campaignId,
                                  "updatedResult",
                                  result
                                );
                              })
                              .catch((error) => {
                                console.error(error);
                              });
                            let createCampaignHistory =
                              new campaignHistorySchema(sdObjHistory);
                            return await createCampaignHistory.save();
                          }
                        }
                      }
                      if (
                        campaign.type == "Sponsored Products" ||
                        campaign.type == "Sponsored Brands"
                      ) {
                        if (
                          body.campaigns &&
                          body.campaigns.success.length > 0
                        ) {
                          let campaignDetails = body.campaigns.success;
                          campaignDetails = campaignDetails[0];
                          let budget = 0;
                          let status = campaignDetails.campaign.state;
                          status = status.toUpperCase();
                          if (campaign.type == "Sponsored Products") {
                            budget = campaignDetails.campaign.budget
                              ? campaignDetails.campaign.budget.budget
                              : "";
                          }
                          if (campaign.type == "Sponsored Brands") {
                            budget = campaignDetails.campaign.budget
                              ? campaignDetails.campaign.budget
                              : "";
                          }
                          let obj = {
                            status: status,
                            budget: budget,
                          };
                          await campaignsSchema
                            .updateOne(
                              {
                                customerId: campaign.customerId,
                                profileId: campaign.profileId,
                                campaignId: campaign.campaignId,
                                reportDate: currentDate,
                              },
                              {
                                $set: obj,
                              }
                            )
                            .then((result) => {
                              console.log(
                                campaign.campaignId,
                                "updatedResult",
                                result
                              );
                            })
                            .catch((error) => {
                              console.error(error);
                            });
                          let objHistory = {
                            runType: "Budget Rule",
                            runId: getRule._id,
                            runName: getRule.ruleName,
                            isType: "MANUAL",
                            campaignId: campaign.campaignId,
                            customerId: campaign.customerId,
                            profileId: campaign.profileId,
                            name: campaign.name,
                            fromStatus: campaign.status,
                            type: campaign.type,
                            currencyCode: campaign.currencyCode,
                            startDate: campaign.startDate,
                            endDate: campaign.endDate,
                            fromBudget: campaign.budget,
                            budgetType: campaign.budgetType,
                            costType: campaign.costType,
                            targetingType: campaign.targetingType,
                            cpc: campaign.cpc,
                            clicks: campaign.clicks,
                            spend: campaign.spend,
                            orders: campaign.orders,
                            sales: campaign.sales,
                            acos: campaign.acos,
                            roas: campaign.roas,
                            impressions: campaign.impressions,
                            timezone: campaign.timezone,
                          };
                          if (campaign.status.toUpperCase() != status) {
                            objHistory.toStatus = status;
                          }
                          if (campaign.budget != budget) {
                            objHistory.toBudget = budget;
                          }
                          let createCampaignHistory = new campaignHistorySchema(
                            objHistory
                          );
                          await createCampaignHistory.save();
                        }
                      }
                    }
                    else {
                      return res.status(203).send({
                        error: response.data,
                        message: "Something went wrong, please try again!",
                        isSuccess: false,
                      });
                    }
                  } catch (error) {
                    return res.status(203).send({
                      isSuccess: false,
                      error: error.message,
                      message: "Something went wrong, please try again!",
                    });
                  }
                }
              }
            }
          })
        );
        await Promise.all(runSchedule);
        return res.status(200).send({
          isSuccess: true,
          message: "Budget rules run successfully",
        });
      } else {
        return res.status(203).send({
          message: "Campaigns data not found!",
          isSuccess: false,
        });
      }
    }
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.cronJobRulesSchedules = async () => {
  try {
    write_logs({
      message: `US Time = ${moment()
        .tz("America/Los_Angeles")
        .format("HH:mm")} India Time = ${moment()
          .tz("Asia/Kolkata")
          .format("HH:mm")} cronJobRulesSchedules`,
      log_type: "info",
    });

    if (mongoose.connection.readyState !== 1) {
      // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
      return write_logs({
        message: `MongoDB not connected : ${mongoose.connection.readyState}`,
        log_type: "error",
      });
    }

    const getRules = await budgetRulesSchema.find({
      times: { $ne: [] },
      campaignIds: { $ne: [] },
      isActive: true,
    });

    write_logs({
      message: `BudgetRules : ${getRules.length}`,
      log_type: "info",
    });

    if (getRules.length > 0) {
      write_logs({
        message: `IF BudgetRules: ${getRules.length}`,
        log_type: "info",
      });
      await Promise.all(
        getRules.map(async (rule) => {
          const checkConfigAds = await cronGetAccessToken(rule.customerId);
          const getAccount = await getProfile(rule.customerId, rule.profileId);
          if (checkConfigAds && checkConfigAds.adsAccessToken && getAccount) {
            const currentTime = moment().tz(rule.timezone).format("HH:mm");
            if (rule.times.includes(currentTime)) {
              write_logs({
                message: `Current time is included ${currentTime} ${JSON.stringify(
                  rule
                )}`,
                log_type: "info",
              });
              const currentDate = moment()
                .tz(rule.timezone)
                .format("YYYY-MM-DD");
              const campaigns = await campaignsSchema.find({
                customerId: rule.customerId,
                profileId: rule.profileId,
                campaignId: { $in: rule.campaignIds },
                reportDate: currentDate,
              });
              if (campaigns.length > 0) {
                const workerPromises = await Promise.all(
                  campaigns.map(async (campaign) => {
                    const checkEntry = await campaignHistorySchema.findOne({
                      customerId: rule.customerId,
                      profileId: rule.profileId,
                      campaignId: campaign.campaignId,
                      runType: "Budget Rule",
                      runId: rule._id,
                      historyDate: currentDate,
                      historyTime: currentTime,
                    });
                    if (!checkEntry) {
                      return new Promise((resolve, reject) => {
                        const sleepTime = 2;

                        const worker = new Worker(
                          path.resolve(__dirname, '../workers/budgetRulesWorker.js'),
                          {
                            workerData: {
                              serializeRule: JSON.stringify(rule),
                              serializeCampaign: JSON.stringify(campaign),
                              sleepTime,
                            },
                          }
                        );
                        worker.on("message", (data) => {
                          write_logs({
                            message: `Received data from worker - CustomerId: ${rule.customerId}, ProfileId: ${rule.profileId}, Thread ID: ${data.threadId}, RuleId: ${data.response.rule._id}, CampaignId: ${data.response.campaign.campaignId}, Main Result: ${data.response.result}`,
                            log_type: "info",
                          });
                          if (data.response.result) {
                            let options = "";
                            if (campaign.type == "Sponsored Products") {
                              options = {
                                method: "PUT",
                                url: `${getAccount.amazonUrl}/sp/campaigns`,
                                headers: {
                                  "Amazon-Advertising-API-ClientId":
                                    checkConfigAds.clientId,
                                  "Amazon-Advertising-API-Scope":
                                    campaign.profileId,
                                  Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                                  Prefer: "return=representation",
                                  Accept: "application/vnd.spCampaign.v3+json",
                                  "Content-Type":
                                    "application/vnd.spCampaign.v3+json",
                                },
                              };
                            } else if (campaign.type == "Sponsored Brands") {
                              options = {
                                method: "PUT",
                                url: `${getAccount.amazonUrl}/sb/v4/campaigns`,
                                headers: {
                                  "Amazon-Advertising-API-ClientId":
                                    checkConfigAds.clientId,
                                  Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                                  "Amazon-Advertising-API-Scope":
                                    campaign.profileId,
                                  Accept:
                                    "application/vnd.updatecampaignsresponse.v4+json",
                                  "Content-Type": "application/json",
                                },
                              };
                            } else if (campaign.type == "Sponsored Display") {
                              options = {
                                method: "PUT",
                                url: `${getAccount.amazonUrl}/sd/campaigns`,
                                headers: {
                                  "Amazon-Advertising-API-ClientId":
                                    checkConfigAds.clientId,
                                  "Amazon-Advertising-API-Scope":
                                    campaign.profileId,
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                                },
                              };
                            }
                            const actionType = rule.actionType;
                            if (
                              actionType.actionName === "Enabled" ||
                              actionType.actionName === "Paused"
                            ) {
                              let status = "";
                              if (actionType.actionName === "Enabled") {
                                status = "ENABLED";
                              }
                              if (actionType.actionName === "Paused") {
                                status = "PAUSED";
                              }
                              if (status) {
                                if (
                                  campaign.type == "Sponsored Products" ||
                                  campaign.type == "Sponsored Brands"
                                ) {
                                  options.data = {
                                    campaigns: [
                                      {
                                        campaignId:
                                          campaign.campaignId.toString(),
                                        state: status,
                                      },
                                    ],
                                  };
                                } else if (
                                  campaign.type == "Sponsored Display"
                                ) {
                                  options.data = [
                                    {
                                      state: status.toLowerCase(),
                                      campaignId:
                                        campaign.campaignId.toString(),
                                    },
                                  ];
                                }
                              }
                            } else if (
                              actionType.actionName === "Increase" ||
                              actionType.actionName === "Decrease" ||
                              actionType.actionName == "setBudget"
                            ) {
                              let actionValue = actionType.actionValue;
                              if (actionType.actionValueType == "Percentage") {
                                actionValue =
                                  (campaign.budget * actionValue) / 100;
                              }
                              if (actionType.actionName === "Increase") {
                                actionValue =
                                  parseFloat(campaign.budget) +
                                  parseFloat(actionValue);
                              }
                              if (actionType.actionName === "Decrease") {
                                actionValue =
                                  parseFloat(campaign.budget) -
                                  parseFloat(actionValue);
                              }
                              if (actionType.actionName == "setBudget") {
                                actionValue = parseFloat(actionValue);
                              }
                              if (actionValue) {
                                if (campaign.type == "Sponsored Products") {
                                  options.data = {
                                    campaigns: [
                                      {
                                        budget: {
                                          budget: actionValue,
                                          budgetType: campaign.budgetType,
                                        },
                                        campaignId:
                                          campaign.campaignId.toString(),
                                      },
                                    ],
                                  };
                                } else if (
                                  campaign.type == "Sponsored Brands"
                                ) {
                                  options.data = {
                                    campaigns: [
                                      {
                                        budget: actionValue,
                                        campaignId:
                                          campaign.campaignId.toString(),
                                      },
                                    ],
                                  };
                                } else if (
                                  campaign.type == "Sponsored Display"
                                ) {
                                  options.data = [
                                    {
                                      budget: actionValue,
                                      campaignId:
                                        campaign.campaignId.toString(),
                                    },
                                  ];
                                }
                              }
                            }
                            if (options) {
                              write_logs({
                                message: `Amazon Request ${rule._id} ${rule.ruleName
                                  } ${campaign.campaignId} ${JSON.stringify(
                                    options
                                  )}`,
                                log_type: "info",
                              });
                              axios(options).then(async (response) => {
                                if (response.status == 207) {
                                  const body = response.data;
                                  write_logs({
                                    message: `Amazon Response ${JSON.stringify(
                                      body
                                    )}`,
                                    log_type: "info",
                                  });
                                  if (campaign.type == "Sponsored Display") {
                                    let SdResponse = options.data;
                                    if (
                                      body[0].code === "SUCCESS" &&
                                      SdResponse
                                    ) {
                                      if (
                                        body[0].campaignId ==
                                        SdResponse[0].campaignId
                                      ) {
                                        let sdObj = {};
                                        let sdStatus = "";
                                        let sdObjHistory = {
                                          historyDate: currentDate,
                                          historyTime: currentTime,
                                          runType: "Budget Rule",
                                          runId: rule._id,
                                          runName: rule.ruleName,
                                          isType: "CRON",
                                          campaignId: campaign.campaignId,
                                          customerId: campaign.customerId,
                                          profileId: campaign.profileId,
                                          name: campaign.name,
                                          fromStatus: campaign.status,
                                          type: campaign.type,
                                          currencyCode: campaign.currencyCode,
                                          startDate: campaign.startDate,
                                          endDate: campaign.endDate,
                                          fromBudget: campaign.budget,
                                          budgetType: campaign.budgetType,
                                          costType: campaign.costType,
                                          targetingType:
                                            campaign.targetingType,
                                          cpc: campaign.cpc,
                                          clicks: campaign.clicks,
                                          spend: campaign.spend,
                                          orders: campaign.orders,
                                          sales: campaign.sales,
                                          acos: campaign.acos,
                                          roas: campaign.roas,
                                          impressions: campaign.impressions,
                                          timezone: campaign.timezone,
                                        };
                                        if (SdResponse[0].state) {
                                          sdStatus =
                                            SdResponse[0].state.toUpperCase();
                                          if (campaign.status != sdStatus) {
                                            sdObj.status = sdStatus;
                                            sdObjHistory.toStatus = sdStatus;
                                          }
                                        }
                                        if (
                                          SdResponse[0].budget &&
                                          campaign.budget !=
                                          SdResponse[0].budget
                                        ) {
                                          sdObj.budget = SdResponse[0].budget;
                                          sdObjHistory.toBudget =
                                            SdResponse[0].budget;
                                        }
                                        await campaignsSchema
                                          .updateOne(
                                            {
                                              customerId: campaign.customerId,
                                              profileId: campaign.profileId,
                                              campaignId: body[0].campaignId,
                                              reportDate: currentDate,
                                            },
                                            {
                                              $set: sdObj,
                                            }
                                          )
                                          .then((result) => {
                                            write_logs({
                                              message: `${rule.customerId} ${rule.profileId
                                                } ${campaign.campaignId
                                                } Updated Result ${JSON.stringify(
                                                  result
                                                )}`,
                                              log_type: "info",
                                            });
                                          })
                                          .catch((error) => {
                                            write_logs({
                                              message: `${rule.customerId} ${rule.profileId
                                                } ${campaign.campaignId
                                                } Query Error: ${JSON.stringify(
                                                  error
                                                )}`,
                                              log_type: "error",
                                            });
                                          });
                                        if (
                                          sdObjHistory.toStatus ||
                                          sdObjHistory.toBudget
                                        ) {
                                          const checkSDEntry =
                                            await campaignHistorySchema.findOne(
                                              {
                                                customerId: rule.customerId,
                                                profileId: rule.profileId,
                                                campaignId:
                                                  campaign.campaignId,
                                                runType: "Budget Rule",
                                                runId: rule._id,
                                                historyDate: currentDate,
                                                historyTime: currentTime,
                                              }
                                            );
                                          if (!checkSDEntry) {
                                            let createCampaignHistory =
                                              new campaignHistorySchema(
                                                sdObjHistory
                                              );
                                            await createCampaignHistory.save();
                                          } else {
                                            write_logs({
                                              message: `checkSDEntry Duplicate Call : ${rule.customerId} ${rule.profileId} ${campaign.campaignId} ${rule._id} ${currentDate} ${currentTime}`,
                                              log_type: "info",
                                            });
                                          }
                                        }
                                      }
                                    }
                                  }
                                  if (
                                    campaign.type == "Sponsored Products" ||
                                    campaign.type == "Sponsored Brands"
                                  ) {
                                    if (
                                      body.campaigns &&
                                      body.campaigns.success.length > 0
                                    ) {
                                      let campaignDetails =
                                        body.campaigns.success;
                                      campaignDetails = campaignDetails[0];
                                      let budget = 0;
                                      let status =
                                        campaignDetails.campaign.state;
                                      status = status.toUpperCase();
                                      if (
                                        campaign.type == "Sponsored Products"
                                      ) {
                                        budget = campaignDetails.campaign
                                          .budget
                                          ? campaignDetails.campaign.budget
                                            .budget
                                          : "";
                                      }
                                      if (
                                        campaign.type == "Sponsored Brands"
                                      ) {
                                        budget = campaignDetails.campaign
                                          .budget
                                          ? campaignDetails.campaign.budget
                                          : "";
                                      }
                                      let obj = {
                                        status: status,
                                        budget: budget,
                                      };
                                      await campaignsSchema
                                        .updateOne(
                                          {
                                            customerId: campaign.customerId,
                                            profileId: campaign.profileId,
                                            campaignId: campaign.campaignId,
                                            reportDate: currentDate,
                                          },
                                          {
                                            $set: obj,
                                          }
                                        )
                                        .then((result) => {
                                          write_logs({
                                            message: `${rule.customerId} ${rule.profileId
                                              } ${campaign.campaignId
                                              } Updated Result ${JSON.stringify(
                                                result
                                              )}`,
                                            log_type: "info",
                                          });
                                        })
                                        .catch((error) => {
                                          write_logs({
                                            message: `${rule.customerId} ${rule.profileId
                                              } ${campaign.campaignId
                                              } Query Error: ${JSON.stringify(
                                                error
                                              )}`,
                                            log_type: "error",
                                          });
                                        });
                                      let objHistory = {
                                        historyDate: currentDate,
                                        historyTime: currentTime,
                                        runType: "Budget Rule",
                                        runId: rule._id,
                                        runName: rule.ruleName,
                                        isType: "CRON",
                                        campaignId: campaign.campaignId,
                                        customerId: campaign.customerId,
                                        profileId: campaign.profileId,
                                        name: campaign.name,
                                        fromStatus: campaign.status,
                                        type: campaign.type,
                                        currencyCode: campaign.currencyCode,
                                        startDate: campaign.startDate,
                                        endDate: campaign.endDate,
                                        fromBudget: campaign.budget,
                                        budgetType: campaign.budgetType,
                                        costType: campaign.costType,
                                        targetingType: campaign.targetingType,
                                        cpc: campaign.cpc,
                                        clicks: campaign.clicks,
                                        spend: campaign.spend,
                                        orders: campaign.orders,
                                        sales: campaign.sales,
                                        acos: campaign.acos,
                                        roas: campaign.roas,
                                        impressions: campaign.impressions,
                                        timezone: campaign.timezone,
                                      };
                                      if (
                                        campaign.status.toUpperCase() !=
                                        status
                                      ) {
                                        objHistory.toStatus = status;
                                      }
                                      if (campaign.budget != budget) {
                                        objHistory.toBudget = budget;
                                      }
                                      if (
                                        objHistory.toStatus ||
                                        objHistory.toBudget
                                      ) {
                                        const checkSPSBEntry =
                                          await campaignHistorySchema.findOne(
                                            {
                                              customerId: rule.customerId,
                                              profileId: rule.profileId,
                                              campaignId: campaign.campaignId,
                                              runType: "Budget Rule",
                                              runId: rule._id,
                                              historyDate: currentDate,
                                              historyTime: currentTime,
                                            }
                                          );
                                        if (!checkSPSBEntry) {
                                          let createCampaignHistory =
                                            new campaignHistorySchema(
                                              objHistory
                                            );
                                          await createCampaignHistory.save();
                                        } else {
                                          write_logs({
                                            message: `checkSPSBEntry Duplicate Call : ${rule.customerId} ${rule.profileId} ${campaign.campaignId} ${rule._id} ${currentDate} ${currentTime}`,
                                            log_type: "info",
                                          });
                                        }
                                      }
                                    }
                                  }
                                }
                                else {
                                  let extraCronObj = {
                                    customerId: campaign.customerId,
                                    profileId: campaign.profileId,
                                    campaignId: campaign.campaignId,
                                    body: options.data,
                                    isRun: false,
                                    historyDate: currentDate,
                                    historyTime: currentTime,
                                    runType: "Budget Rule",
                                    runId: rule._id,
                                    runName: rule.ruleName,
                                  };
                                  let extraCron = new extraCronSchema(
                                    extraCronObj
                                  );
                                  await extraCron.save();

                                  return write_logs({
                                    message: `${rule.customerId} ${rule.profileId
                                      } ${campaign.campaignId
                                      } Amazon Response ${JSON.stringify(
                                        response.data
                                      )} ExtraCron : ${JSON.stringify(
                                        extraCron
                                      )}`,
                                    log_type: "error",
                                  });
                                }
                              }).catch(async (error) => {
                                let extraCronObj = {
                                  customerId: campaign.customerId,
                                  profileId: campaign.profileId,
                                  campaignId: campaign.campaignId,
                                  body: options.data,
                                  isRun: false,
                                  historyDate: currentDate,
                                  historyTime: currentTime,
                                  runType: "Budget Rule",
                                  runId: rule._id,
                                  runName: rule.ruleName,
                                };
                                let extraCron = new extraCronSchema(
                                  extraCronObj
                                );
                                await extraCron.save();
                                return write_logs({
                                  message: `${campaign.campaignId
                                    } ${JSON.stringify(
                                      error
                                    )} ExtraCron : ${JSON.stringify(
                                      extraCron
                                    )}`,
                                  log_type: "info",
                                });
                              })
                            }
                          }
                          resolve(data);
                        });
                        worker.on("error", (error) => {
                          write_logs({
                            message: `Worker Error ${JSON.stringify(error)}`,
                            log_type: "error",
                          });
                          resolve("ERROR");
                        });
                        worker.on("exit", (code) => {
                          if (code !== 0) {
                            write_logs({
                              message: `Worker stopped with exit code ${JSON.stringify(
                                code
                              )}`,
                              log_type: "error",
                            });
                            resolve("ERROR");
                          }
                        });
                      });
                    } else {
                      write_logs({
                        message: `Duplicate Call : ${rule.customerId} ${rule.profileId} ${campaign.campaignId} ${rule._id} ${currentDate} ${currentTime}`,
                        log_type: "info",
                      });
                    }
                  })
                );
                await Promise.all(workerPromises);
                const nextTime = getNextTime(rule.times, currentTime);
                const createRuleHistory = new rulesHistorySchema({
                  ruleDate: currentDate,
                  ruleId: rule._id,
                  customerId: rule.customerId,
                  profileId: rule.profileId,
                  ruleName: rule.ruleName,
                  status: "COMPLETED",
                  totalCount: rule.times.length,
                  time: currentTime,
                  nextTime: nextTime,
                });
                await createRuleHistory.save();
                const getHistory = await budgetRulesHistorySchema.findOne({
                  customerId: rule.customerId,
                  profileId: rule.profileId,
                  ruleDate: currentDate,
                  ruleId: rule._id,
                });
                const countRule = await rulesHistorySchema.count({
                  customerId: rule.customerId,
                  profileId: rule.profileId,
                  ruleDate: currentDate,
                  ruleId: rule._id,
                });
                if (getHistory) {
                  await budgetRulesHistorySchema
                    .updateOne(
                      {
                        customerId: rule.customerId,
                        profileId: rule.profileId,
                        ruleDate: currentDate,
                        ruleId: rule._id,
                      },
                      {
                        $set: {
                          excutedCount: countRule,
                          status:
                            rule.times.length == countRule
                              ? "COMPLETED"
                              : "PENDING",
                          lastRun: currentTime,
                          nextRun: nextTime,
                        },
                      }
                    )
                    .then((result) => {
                      write_logs({
                        message: `${rule._id
                          } Updated Budget History, ${JSON.stringify(result)}`,
                        log_type: "info",
                      });
                    })
                    .catch((error) => {
                      write_logs({
                        message: `${rule._id
                          } History Query Error, ${JSON.stringify(error)}`,
                        log_type: "error",
                      });
                    });
                } else {
                  let createHistory = new budgetRulesHistorySchema({
                    ruleDate: currentDate,
                    ruleId: rule._id,
                    customerId: rule.customerId,
                    profileId: rule.profileId,
                    ruleName: rule.ruleName,
                    dailyCount: rule.times.length,
                    excutedCount: countRule,
                    status:
                      rule.times.length == countRule ? "COMPLETED" : "PENDING",
                    lastRun: currentTime,
                    nextRun: rule.times.length == countRule ? "-" : nextTime,
                  });
                  await createHistory.save();
                }
                const createCronHistory = new cronJobHistorySchema({
                  customerId: rule.customerId,
                  profileId: rule.profileId,
                  cronName: "Budget Rule Schedulers",
                  status: "COMPLETED",
                  historyDate: currentDate,
                });
                await createCronHistory.save();
                return write_logs({
                  message: `${rule._id}, ${rule.ruleName}, ${createRuleHistory._id}, Rule History Created..`,
                  log_type: "info",
                });
              } else {
                return write_logs({
                  message: `Else Campaign Length ${rule.customerId} ${rule.profileId} ${rule.campaignIds} ${campaigns.length}`,
                  log_type: "info",
                });
              }
            }
          } else {
            return write_logs({
              message: `Account disconnected ${rule.customerId
                } ${JSON.stringify(checkConfigAds)} ${JSON.stringify(
                  getAccount
                )}`,
              log_type: "info",
            });
          }
        })
      );
    } else {
      return write_logs({
        message: `Else BudgetRules: ${getRules.length}`,
        log_type: "info",
      });
    }
  } catch (error) {
    return write_logs({
      message: `Catch Error: ${JSON.stringify(error)}`,
      log_type: "info",
    });
  }
};

exports.cronJobCheckRun = async () => {
  try {
    extra_write_logs({
      message: `US Time = ${moment()
        .tz("America/Los_Angeles")
        .format("HH:mm")} India Time = ${moment()
          .tz("Asia/Kolkata")
          .format("HH:mm")} cronJobCheckRun`,
      log_type: "info",
    });
    if (mongoose.connection.readyState !== 1) {
      // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
      return extra_write_logs({
        message: `MongoDB not connected : ${mongoose.connection.readyState}`,
        log_type: "error",
      });
    }
    const getRules = await budgetRulesSchema.find({
      times: { $ne: [] },
      campaignIds: { $ne: [] },
      isActive: true,
    });
    extra_write_logs({
      message: `BudgetRules : ${getRules.length}`,
      log_type: "info",
    });
    if (getRules.length > 0) {
      extra_write_logs({
        message: `IF BudgetRules: ${getRules.length}`,
        log_type: "info",
      });
      await Promise.all(
        getRules.map(async (rule) => {
          rule.times.map(async (time) => {
            const currentTime = moment()
              .tz(rule.timezone)
              .subtract(5, "minutes")
              .format("HH:mm");
            if (time < currentTime) {
              const currentDate = moment()
                .tz(rule.timezone)
                .format("YYYY-MM-DD");
              const countHistory = await rulesHistorySchema.count({
                ruleId: rule._id,
                ruleDate: currentDate,
                time: time,
              });
              if (countHistory == 0) {
                const checkConfigAds = await cronGetAccessToken(
                  rule.customerId
                );
                const getAccount = await getProfile(
                  rule.customerId,
                  rule.profileId
                );
                if (
                  checkConfigAds &&
                  checkConfigAds.adsAccessToken &&
                  getAccount
                ) {
                  extra_write_logs({
                    message: `Excuted Manual ${currentDate} ${time} ${JSON.stringify(
                      rule
                    )}`,
                    log_type: "info",
                  });
                  const campaigns = await campaignsSchema.find({
                    customerId: rule.customerId,
                    profileId: rule.profileId,
                    campaignId: { $in: rule.campaignIds },
                    reportDate: currentDate,
                  });
                  if (campaigns.length > 0) {
                    const workerPromises = await Promise.all(
                      campaigns.map(async (campaign) => {
                        const checkEntry = await campaignHistorySchema.findOne({
                          customerId: rule.customerId,
                          profileId: rule.profileId,
                          campaignId: campaign.campaignId,
                          runType: "Budget Rule",
                          runId: rule._id,
                          historyDate: currentDate,
                          historyTime: time,
                        });
                        if (!checkEntry) {
                          if (rule.conditions.length > 0) {
                            extra_write_logs({
                              message: `Campaign data ${rule._id}, ${rule.ruleName
                                }, ${JSON.stringify(campaign)}`,
                              log_type: "info",
                            });
                            let spendConditions = "";
                            let roasConditions = "";
                            let salesConditions = "";
                            let budgetConditions = "";
                            let clicksConditions = "";
                            let ordersConditions = "";
                            let acosConditions = "";
                            let impressionsConditions = "";
                            let cpcConditions = "";
                            await Promise.all(
                              rule.conditions.map(async (condition) => {
                                let conditionValue = condition.conditionValue;
                                if (
                                  condition.conditionValueType == "Percentage"
                                ) {
                                  conditionValue =
                                    (campaign.budget * conditionValue) / 100;
                                }
                                if (
                                  condition.conditionType == "Budget" &&
                                  budgetConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    budgetConditions =
                                      campaign.budget > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    budgetConditions =
                                      campaign.budget >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    budgetConditions =
                                      campaign.budget < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    budgetConditions =
                                      campaign.budget <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    budgetConditions =
                                      campaign.budget == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "Spend" &&
                                  spendConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    spendConditions =
                                      campaign.spend > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    spendConditions =
                                      campaign.spend >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    spendConditions =
                                      campaign.spend < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    spendConditions =
                                      campaign.spend <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    spendConditions =
                                      campaign.spend == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "ROAS" &&
                                  roasConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    roasConditions =
                                      campaign.roas > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    roasConditions =
                                      campaign.roas >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    roasConditions =
                                      campaign.roas < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    roasConditions =
                                      campaign.roas <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    roasConditions =
                                      campaign.roas == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "Sales" &&
                                  salesConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    salesConditions =
                                      campaign.sales > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    salesConditions =
                                      campaign.sales >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    salesConditions =
                                      campaign.sales < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    salesConditions =
                                      campaign.sales <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    salesConditions =
                                      campaign.sales == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "ACOS" &&
                                  acosConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    acosConditions =
                                      campaign.acos > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    acosConditions =
                                      campaign.acos >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    acosConditions =
                                      campaign.acos < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    acosConditions =
                                      campaign.acos <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    acosConditions =
                                      campaign.acos == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "Clicks" &&
                                  clicksConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    clicksConditions =
                                      campaign.clicks > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    clicksConditions =
                                      campaign.clicks >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    clicksConditions =
                                      campaign.clicks < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    clicksConditions =
                                      campaign.clicks <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    clicksConditions =
                                      campaign.clicks == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "Orders" &&
                                  ordersConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    ordersConditions =
                                      campaign.orders > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    ordersConditions =
                                      campaign.orders >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    ordersConditions =
                                      campaign.orders < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    ordersConditions =
                                      campaign.orders <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    ordersConditions =
                                      campaign.orders == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "Impressions" &&
                                  impressionsConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    impressionsConditions =
                                      campaign.impressions > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    impressionsConditions =
                                      campaign.impressions >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    impressionsConditions =
                                      campaign.impressions < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    impressionsConditions =
                                      campaign.impressions <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    impressionsConditions =
                                      campaign.impressions == conditionValue;
                                  }
                                }
                                if (
                                  condition.conditionType == "CPC" &&
                                  cpcConditions !== false
                                ) {
                                  if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN"
                                  ) {
                                    cpcConditions =
                                      campaign.cpc > conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "GREATER_THAN_OR_EQUAL_TO"
                                  ) {
                                    cpcConditions =
                                      campaign.cpc >= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "LESS_THAN"
                                  ) {
                                    cpcConditions =
                                      campaign.cpc < conditionValue;
                                  } else if (
                                    condition.conditionOperator ==
                                    "LESS_THAN_OR_EQUAL_TO"
                                  ) {
                                    cpcConditions =
                                      campaign.cpc <= conditionValue;
                                  } else if (
                                    condition.conditionOperator == "EQUAL_TO"
                                  ) {
                                    cpcConditions =
                                      campaign.cpc == conditionValue;
                                  }
                                }
                              })
                            );
                            extra_write_logs({
                              message: `${rule._id}, ${rule.ruleName}, ${campaign.campaignId}, ordersConditions: ${ordersConditions}, clicksConditions: ${clicksConditions}, salesConditions: ${salesConditions}, spendConditions: ${spendConditions}, roasConditions: ${roasConditions}, acosConditions: ${acosConditions}, budgetConditions: ${budgetConditions}, impressionsConditions: ${impressionsConditions}, cpcConditions: ${cpcConditions}`,
                              log_type: "info",
                            });
                            const conditionsArray = [
                              budgetConditions,
                              spendConditions,
                              roasConditions,
                              salesConditions,
                              ordersConditions,
                              clicksConditions,
                              acosConditions,
                              impressionsConditions,
                              cpcConditions,
                            ];
                            const conditions = conditionsArray.filter(
                              (value) => value !== ""
                            );
                            let result = false;
                            if (conditions.length > 0) {
                              result = conditions.every(
                                (condition) => condition == true
                              );
                            }
                            extra_write_logs({
                              message: `${rule._id}, ${rule.ruleName}, ${campaign.campaignId}, Main Result: ${result}`,
                              log_type: "info",
                            });
                            if (result) {
                              let options = "";
                              if (campaign.type == "Sponsored Products") {
                                options = {
                                  method: "PUT",
                                  url: `${getAccount.amazonUrl}/sp/campaigns`,
                                  headers: {
                                    "Amazon-Advertising-API-ClientId":
                                      checkConfigAds.clientId,
                                    "Amazon-Advertising-API-Scope":
                                      campaign.profileId,
                                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                                    Prefer: "return=representation",
                                    Accept:
                                      "application/vnd.spCampaign.v3+json",
                                    "Content-Type":
                                      "application/vnd.spCampaign.v3+json",
                                  },
                                };
                              } else if (campaign.type == "Sponsored Brands") {
                                options = {
                                  method: "PUT",
                                  url: `${getAccount.amazonUrl}/sb/v4/campaigns`,
                                  headers: {
                                    "Amazon-Advertising-API-ClientId":
                                      checkConfigAds.clientId,
                                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                                    "Amazon-Advertising-API-Scope":
                                      campaign.profileId,
                                    Accept:
                                      "application/vnd.updatecampaignsresponse.v4+json",
                                    "Content-Type": "application/json",
                                  },
                                };
                              } else if (campaign.type == "Sponsored Display") {
                                options = {
                                  method: "PUT",
                                  url: `${getAccount.amazonUrl}/sd/campaigns`,
                                  headers: {
                                    "Amazon-Advertising-API-ClientId":
                                      checkConfigAds.clientId,
                                    "Amazon-Advertising-API-Scope":
                                      campaign.profileId,
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
                                  },
                                };
                              }
                              const actionType = rule.actionType;
                              if (
                                actionType.actionName === "Enabled" ||
                                actionType.actionName === "Paused"
                              ) {
                                let status = "";
                                if (actionType.actionName === "Enabled") {
                                  status = "ENABLED";
                                }
                                if (actionType.actionName === "Paused") {
                                  status = "PAUSED";
                                }
                                if (status) {
                                  if (
                                    campaign.type == "Sponsored Products" ||
                                    campaign.type == "Sponsored Brands"
                                  ) {
                                    options.data = {
                                      campaigns: [
                                        {
                                          campaignId:
                                            campaign.campaignId.toString(),
                                          state: status,
                                        },
                                      ],
                                    };
                                  } else if (
                                    campaign.type == "Sponsored Display"
                                  ) {
                                    options.data = [
                                      {
                                        state: status.toLowerCase(),
                                        campaignId:
                                          campaign.campaignId.toString(),
                                      },
                                    ];
                                  }
                                }
                              } else if (
                                actionType.actionName === "Increase" ||
                                actionType.actionName === "Decrease" ||
                                actionType.actionName == "setBudget"
                              ) {
                                let actionValue = actionType.actionValue;
                                if (
                                  actionType.actionValueType == "Percentage"
                                ) {
                                  actionValue =
                                    (campaign.budget * actionValue) / 100;
                                }
                                if (actionType.actionName === "Increase") {
                                  actionValue =
                                    parseFloat(campaign.budget) +
                                    parseFloat(actionValue);
                                }
                                if (actionType.actionName === "Decrease") {
                                  actionValue =
                                    parseFloat(campaign.budget) -
                                    parseFloat(actionValue);
                                }
                                if (actionType.actionName == "setBudget") {
                                  actionValue = parseFloat(actionValue);
                                }
                                if (actionValue) {
                                  if (campaign.type == "Sponsored Products") {
                                    options.data = {
                                      campaigns: [
                                        {
                                          budget: {
                                            budget: actionValue,
                                            budgetType: campaign.budgetType,
                                          },
                                          campaignId:
                                            campaign.campaignId.toString(),
                                        },
                                      ],
                                    };
                                  } else if (
                                    campaign.type == "Sponsored Brands"
                                  ) {
                                    options.data = {
                                      campaigns: [
                                        {
                                          budget: actionValue,
                                          campaignId:
                                            campaign.campaignId.toString(),
                                        },
                                      ],
                                    };
                                  } else if (
                                    campaign.type == "Sponsored Display"
                                  ) {
                                    options.data = [
                                      {
                                        budget: actionValue,
                                        campaignId:
                                          campaign.campaignId.toString(),
                                      },
                                    ];
                                  }
                                }
                              }
                              if (options) {
                                extra_write_logs({
                                  message: `Amazon Request ${rule._id} ${rule.ruleName
                                    } ${campaign.campaignId} ${JSON.stringify(
                                      options
                                    )}`,
                                  log_type: "info",
                                });
                                axios(options).then(async (response) => {
                                  if (response.status == 207) {
                                    const body = response.data;
                                    extra_write_logs({
                                      message: `Amazon Response ${JSON.stringify(
                                        body
                                      )}`,
                                      log_type: "info",
                                    });
                                    if (
                                      campaign.type == "Sponsored Display"
                                    ) {
                                      let SdResponse = options.data;
                                      if (
                                        body[0].code === "SUCCESS" &&
                                        SdResponse
                                      ) {
                                        if (
                                          body[0].campaignId ==
                                          SdResponse[0].campaignId
                                        ) {
                                          let sdObj = {};
                                          let sdStatus = "";
                                          let sdObjHistory = {
                                            historyDate: currentDate,
                                            historyTime: time,
                                            runType: "Budget Rule",
                                            runId: rule._id,
                                            runName: rule.ruleName,
                                            isType: "CRON",
                                            campaignId: campaign.campaignId,
                                            customerId: campaign.customerId,
                                            profileId: campaign.profileId,
                                            name: campaign.name,
                                            fromStatus: campaign.status,
                                            type: campaign.type,
                                            currencyCode:
                                              campaign.currencyCode,
                                            startDate: campaign.startDate,
                                            endDate: campaign.endDate,
                                            fromBudget: campaign.budget,
                                            budgetType: campaign.budgetType,
                                            costType: campaign.costType,
                                            targetingType:
                                              campaign.targetingType,
                                            cpc: campaign.cpc,
                                            clicks: campaign.clicks,
                                            spend: campaign.spend,
                                            orders: campaign.orders,
                                            sales: campaign.sales,
                                            acos: campaign.acos,
                                            roas: campaign.roas,
                                            impressions: campaign.impressions,
                                            timezone: campaign.timezone,
                                          };
                                          if (SdResponse[0].state) {
                                            sdStatus =
                                              SdResponse[0].state.toUpperCase();
                                            if (campaign.status != sdStatus) {
                                              sdObj.status = sdStatus;
                                              sdObjHistory.toStatus =
                                                sdStatus;
                                            }
                                          }
                                          if (
                                            SdResponse[0].budget &&
                                            campaign.budget !=
                                            SdResponse[0].budget
                                          ) {
                                            sdObj.budget =
                                              SdResponse[0].budget;
                                            sdObjHistory.toBudget =
                                              SdResponse[0].budget;
                                          }
                                          await campaignsSchema
                                            .updateOne(
                                              {
                                                customerId:
                                                  campaign.customerId,
                                                profileId: campaign.profileId,
                                                campaignId:
                                                  body[0].campaignId,
                                                reportDate: currentDate,
                                              },
                                              {
                                                $set: sdObj,
                                              }
                                            )
                                            .then((result) => {
                                              extra_write_logs({
                                                message: `${rule.customerId
                                                  } ${rule.profileId} ${campaign.campaignId
                                                  } Updated Result ${JSON.stringify(
                                                    result
                                                  )}`,
                                                log_type: "info",
                                              });
                                            })
                                            .catch((error) => {
                                              extra_write_logs({
                                                message: `${rule.customerId
                                                  } ${rule.profileId} ${campaign.campaignId
                                                  } Query Error: ${JSON.stringify(
                                                    error
                                                  )}`,
                                                log_type: "error",
                                              });
                                            });
                                          if (
                                            sdObjHistory.toStatus ||
                                            sdObjHistory.toBudget
                                          ) {
                                            let createCampaignHistory =
                                              new campaignHistorySchema(
                                                sdObjHistory
                                              );
                                            return await createCampaignHistory.save();
                                          }
                                        }
                                      }
                                    }
                                    if (
                                      campaign.type == "Sponsored Products" ||
                                      campaign.type == "Sponsored Brands"
                                    ) {
                                      if (
                                        body.campaigns &&
                                        body.campaigns.success.length > 0
                                      ) {
                                        let campaignDetails =
                                          body.campaigns.success;
                                        campaignDetails = campaignDetails[0];
                                        let budget = 0;
                                        let status =
                                          campaignDetails.campaign.state;
                                        status = status.toUpperCase();
                                        if (
                                          campaign.type ==
                                          "Sponsored Products"
                                        ) {
                                          budget = campaignDetails.campaign
                                            .budget
                                            ? campaignDetails.campaign.budget
                                              .budget
                                            : "";
                                        }
                                        if (
                                          campaign.type == "Sponsored Brands"
                                        ) {
                                          budget = campaignDetails.campaign
                                            .budget
                                            ? campaignDetails.campaign.budget
                                            : "";
                                        }
                                        let obj = {
                                          status: status,
                                          budget: budget,
                                        };
                                        await campaignsSchema
                                          .updateOne(
                                            {
                                              customerId: campaign.customerId,
                                              profileId: campaign.profileId,
                                              campaignId: campaign.campaignId,
                                              reportDate: currentDate,
                                            },
                                            {
                                              $set: obj,
                                            }
                                          )
                                          .then((result) => {
                                            extra_write_logs({
                                              message: `${rule.customerId} ${rule.profileId
                                                } ${campaign.campaignId
                                                } Updated Result ${JSON.stringify(
                                                  result
                                                )}`,
                                              log_type: "info",
                                            });
                                          })
                                          .catch((error) => {
                                            extra_write_logs({
                                              message: `${rule.customerId} ${rule.profileId
                                                } ${campaign.campaignId
                                                } Query Error: ${JSON.stringify(
                                                  error
                                                )}`,
                                              log_type: "error",
                                            });
                                          });
                                        let objHistory = {
                                          historyDate: currentDate,
                                          historyTime: time,
                                          runType: "Budget Rule",
                                          runId: rule._id,
                                          runName: rule.ruleName,
                                          isType: "CRON",
                                          campaignId: campaign.campaignId,
                                          customerId: campaign.customerId,
                                          profileId: campaign.profileId,
                                          name: campaign.name,
                                          fromStatus: campaign.status,
                                          type: campaign.type,
                                          currencyCode: campaign.currencyCode,
                                          startDate: campaign.startDate,
                                          endDate: campaign.endDate,
                                          fromBudget: campaign.budget,
                                          budgetType: campaign.budgetType,
                                          costType: campaign.costType,
                                          targetingType:
                                            campaign.targetingType,
                                          cpc: campaign.cpc,
                                          clicks: campaign.clicks,
                                          spend: campaign.spend,
                                          orders: campaign.orders,
                                          sales: campaign.sales,
                                          acos: campaign.acos,
                                          roas: campaign.roas,
                                          impressions: campaign.impressions,
                                          timezone: campaign.timezone,
                                        };
                                        if (
                                          campaign.status.toUpperCase() !=
                                          status
                                        ) {
                                          objHistory.toStatus = status;
                                        }
                                        if (campaign.budget != budget) {
                                          objHistory.toBudget = budget;
                                        }
                                        if (
                                          objHistory.toStatus ||
                                          objHistory.toBudget
                                        ) {
                                          let createCampaignHistory =
                                            new campaignHistorySchema(
                                              objHistory
                                            );
                                          return await createCampaignHistory.save();
                                        }
                                      }
                                    }
                                  }
                                  else {
                                    let extraCronObj = {
                                      customerId: campaign.customerId,
                                      profileId: campaign.profileId,
                                      campaignId: campaign.campaignId,
                                      body: options.data,
                                      isRun: false,
                                      historyDate: currentDate,
                                      historyTime: time,
                                      runType: "Budget Rule",
                                      runId: rule._id,
                                      runName: rule.ruleName,
                                    };
                                    let extraCron = new extraCronSchema(
                                      extraCronObj
                                    );
                                    await extraCron.save();
                                    return extra_write_logs({
                                      message: `${rule.customerId} ${rule.profileId
                                        } ${campaign.campaignId
                                        } Amazon Response ${JSON.stringify(
                                          response.data
                                        )} ExtraCron : ${JSON.stringify(
                                          extraCron
                                        )}`,
                                      log_type: "error",
                                    });
                                  }
                                }).catch(async (error) => {
                                  let extraCronObj = {
                                    customerId: campaign.customerId,
                                    profileId: campaign.profileId,
                                    campaignId: campaign.campaignId,
                                    body: options.data,
                                    isRun: false,
                                    historyDate: currentDate,
                                    historyTime: time,
                                    runType: "Budget Rule",
                                    runId: rule._id,
                                    runName: rule.ruleName,
                                  };
                                  let extraCron = new extraCronSchema(
                                    extraCronObj
                                  );
                                  await extraCron.save();
                                  return extra_write_logs({
                                    message: `${campaign.campaignId
                                      } ${JSON.stringify(
                                        error
                                      )} ExtraCron : ${JSON.stringify(
                                        extraCron
                                      )}`,
                                    log_type: "info",
                                  });
                                })
                              }
                            }
                          }
                        } else {
                          extra_write_logs({
                            message: `Duplicate Call : ${rule.customerId} ${rule.profileId} ${campaign.campaignId} ${rule._id} ${currentDate} ${time}`,
                            log_type: "info",
                          });
                        }
                      })
                    );
                    await Promise.all(workerPromises);
                    const nextTime = getNextTime(rule.times, time);
                    const createRuleHistory = new rulesHistorySchema({
                      ruleDate: currentDate,
                      ruleId: rule._id,
                      customerId: rule.customerId,
                      profileId: rule.profileId,
                      ruleName: rule.ruleName,
                      status: "COMPLETED",
                      totalCount: rule.times.length,
                      time: time,
                      nextTime: nextTime,
                    });
                    await createRuleHistory.save();
                    const getHistory = await budgetRulesHistorySchema.findOne({
                      customerId: rule.customerId,
                      profileId: rule.profileId,
                      ruleDate: currentDate,
                      ruleId: rule._id,
                    });
                    const countRule = await rulesHistorySchema.count({
                      customerId: rule.customerId,
                      profileId: rule.profileId,
                      ruleDate: currentDate,
                      ruleId: rule._id,
                    });
                    if (getHistory) {
                      await budgetRulesHistorySchema
                        .updateOne(
                          {
                            customerId: rule.customerId,
                            profileId: rule.profileId,
                            ruleDate: currentDate,
                            ruleId: rule._id,
                          },
                          {
                            $set: {
                              excutedCount: countRule,
                              status:
                                rule.times.length == countRule
                                  ? "COMPLETED"
                                  : "PENDING",
                              lastRun: time,
                              nextRun: nextTime,
                            },
                          }
                        )
                        .then((result) => {
                          extra_write_logs({
                            message: `${rule._id
                              } Updated Budget History, ${JSON.stringify(
                                result
                              )}`,
                            log_type: "info",
                          });
                        })
                        .catch((error) => {
                          extra_write_logs({
                            message: `${rule._id
                              } History Query Error, ${JSON.stringify(error)}`,
                            log_type: "error",
                          });
                        });
                    } else {
                      let createHistory = new budgetRulesHistorySchema({
                        ruleDate: currentDate,
                        ruleId: rule._id,
                        customerId: rule.customerId,
                        profileId: rule.profileId,
                        ruleName: rule.ruleName,
                        dailyCount: rule.times.length,
                        excutedCount: countRule,
                        status:
                          rule.times.length == countRule
                            ? "COMPLETED"
                            : "PENDING",
                        lastRun: time,
                        nextRun:
                          rule.times.length == countRule ? "-" : nextTime,
                      });
                      await createHistory.save();
                    }
                    const createCronHistory = new cronJobHistorySchema({
                      customerId: rule.customerId,
                      profileId: rule.profileId,
                      cronName: "Budget Rule Schedulers",
                      status: "COMPLETED",
                      historyDate: currentDate,
                    });
                    await createCronHistory.save();
                    return extra_write_logs({
                      message: `${rule._id}, ${rule.ruleName}, ${createRuleHistory._id}, Rule History Created..`,
                      log_type: "info",
                    });
                  } else {
                    return extra_write_logs({
                      message: `Else Campaign Length ${rule.customerId} ${rule.profileId} ${rule.campaignIds} ${campaigns.length}`,
                      log_type: "info",
                    });
                  }
                } else {
                  return extra_write_logs({
                    message: `Account disconnected ${rule.customerId
                      } ${JSON.stringify(checkConfigAds)} ${JSON.stringify(
                        getAccount
                      )}`,
                    log_type: "info",
                  });
                }
              }
            }
          });
        })
      );
    }
  } catch (error) {
    return extra_write_logs({
      message: `Catch Error: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

function getNextTime(times, afterTime) {
  times.sort(); // Ensure the times are sorted in ascending order
  const index = times.findIndex((time) => time > afterTime);
  return index !== -1 ? times[index] : "-";
}
