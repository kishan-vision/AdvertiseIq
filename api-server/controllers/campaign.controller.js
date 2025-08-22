const {
  cronGetAccessToken,
  cronCheckCustomerPermission,
  checkPermission,
  getProfile,
  getAccessToken,
} = require("../helper/common");
const campaignsSchema = require("../models/campaign.model");
const moment = require("moment-timezone");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const profileSchema = require("../models/profiles.model");
const reportsSchema = require("../models/report.model");
const placementSchema = require("../models/placement.model");
const adGroupsSchema = require("../models/adGroups.model");
const fs = require("fs");
const zlib = require("node:zlib");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const path = require("path");
const axios = require("axios");
const { Worker } = require("worker_threads");
const { write_logs } = require("../../winston/campaigns/logger");
const cronJobSchema = require("../models/cronJob.model");
const budgetRulesSchema = require("../models/budgetRules.model");
const { report_write_logs } = require("../../winston/generateReports/logger");
const customerSchema = require("../models/customer.model");
const cronJobSchedularSchema = require("../models/cronJobSchedular.model");

exports.listProfiles = async (req, res) => {
  const customerId = req.customer._id;
  try {
    const checkConfigAds = await getAccessToken(customerId, res);
    if (!checkConfigAds) {
      return res
        .status(203)
        .send({ message: "Please connect your account", isSuccess: false });
    }
    if (checkConfigAds && checkConfigAds.adsAccessToken) {
      const getUsProfiles = await usProfiles(checkConfigAds, customerId);
      const getEuProfiles = await euProfiles(checkConfigAds, customerId);
      const getFeProfiles = await feProfiles(checkConfigAds, customerId);
      const profiles = getUsProfiles.concat(getEuProfiles, getFeProfiles);
      if (profiles.length > 0) {
        await Promise.all(
          profiles.map(async (profile) => {
            if (profile.profileId != 2371257842854194) {
              const getProfile = await profileSchema.findOne({
                customerId,
                profileId: profile.profileId,
              });
              if (!getProfile) {
                const item = {
                  customerId: customerId,
                  profileId: profile.profileId,
                  countryCode: profile.countryCode,
                  currencyCode: profile.currencyCode,
                  timezone: profile.timezone,
                  marketplaceStringId: profile.marketplaceStringId,
                  type: profile.type,
                  name: profile.name,
                  amazonUrl: profile.amazonUrl,
                };
                let createProfile = new profileSchema(item);
                await createProfile.save();
                const getCrons = await cronJobSchema.find();
                await Promise.all(
                  getCrons.map(async (cronData) => {
                    const createCron = await cronJobSchedularSchema({
                      customerId,
                      profileId: item.profileId,
                      cronId: cronData._id,
                      cronName: cronData.cronName,
                      timezone: item.timezone,
                      isActive: true,
                    });
                    createCron.save();
                  })
                );
              } else {
                await profileSchema.findByIdAndUpdate(
                  { _id: getProfile._id },
                  profile,
                  { new: true }
                );
              }
            }
          })
        );
      }
      const getProfiles = await profileSchema.find({
        customerId,
      });
      return res.status(200).send({
        isSuccess: true,
        message: "Profiles list successfully.",
        data: getProfiles,
      });
    }
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

async function usProfiles(checkConfigAds, customerId) {
  return new Promise((resolve, reject) => {
    const profiles = [];
    let profileOptions = {
      method: "GET",
      url: `${process.env.ROOT_LINK}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.clientId}`,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
    };

    axios(profileOptions).then((response) => {
      if (response.status == 200) {
        const body = response.data;
        if (body.code !== "UNAUTHORIZED") {
          body.map(async (item) => {
            let profile = {
              customerId,
              profileId: item.profileId,
              countryCode: item.countryCode,
              currencyCode: item.currencyCode,
              timezone: item.timezone,
              marketplaceStringId: item?.accountInfo?.marketplaceStringId,
              type: item?.accountInfo?.type,
              name: item?.accountInfo?.name,
              amazonUrl: process.env.ROOT_LINK,
            };
            profiles.push(profile);
          });
          resolve(profiles);
        }
      }
      else {
        resolve(profiles);
      }
    }).catch((error) => {
      resolve(profiles);
    })
  });
}

async function euProfiles(checkConfigAds, customerId) {
  return new Promise((resolve, reject) => {
    const profiles = [];
    let profileOptions = {
      method: "GET",
      url: `${process.env.EU_ROOT_LINK}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.clientId}`,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
    };

    axios(profileOptions).then((response) => {
      if (response.status == 200) {
        const body = response.data;
        if (body.code !== "UNAUTHORIZED") {
          body.map(async (item) => {
            let profile = {
              customerId,
              profileId: item.profileId,
              countryCode: item.countryCode,
              currencyCode: item.currencyCode,
              timezone: item.timezone,
              marketplaceStringId: item.accountInfo.marketplaceStringId,
              type: item.accountInfo.type,
              name: item.accountInfo.name,
              amazonUrl: process.env.EU_ROOT_LINK,
            };
            profiles.push(profile);
          });
          resolve(profiles);
        }
      }
      else {
        resolve(profiles);
      }
    }).catch((error) => {
      resolve(profiles);
    })
  });
}

async function feProfiles(checkConfigAds, customerId) {
  return new Promise((resolve, reject) => {
    const profiles = [];
    let profileOptions = {
      method: "GET",
      url: `${process.env.FE_ROOT_LINK}/v2/profiles`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.clientId}`,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
      },
    };

    axios(profileOptions).then((response) => {
      if (response.status == 200) {
        const body = response.data;
        if (body.code !== "UNAUTHORIZED") {
          body.map(async (item) => {
            let profile = {
              customerId,
              profileId: item.profileId,
              countryCode: item.countryCode,
              currencyCode: item.currencyCode,
              timezone: item.timezone,
              marketplaceStringId: item.accountInfo.marketplaceStringId,
              type: item.accountInfo.type,
              name: item.accountInfo.name,
              amazonUrl: process.env.FE_ROOT_LINK,
            };
            profiles.push(profile);
          });
          resolve(profiles);
        }
      }
      else {
        resolve(profiles);
      }
    }).catch((error) => {
      resolve(profiles);
    })
  });
}

RegExp.escape = function (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

exports.getCampaigns = async (req, res) => {
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Campaigns",
      "View Only",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    let {
      fromDate,
      toDate,
      profileId,
      pageNo = 1,
      perPage = 10,
      type,
      status,
      searchName,
      fieldName,
      fieldOperator,
      fieldValue,
      conditions,
      extraFieldOperator,
      extraFieldValue,
      sortType,
    } = req.body;

    if (!profileId) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Profile id required." });
    }

    const getProfile = await profileSchema.findOne({ customerId, profileId });
    const timezone = getProfile.timezone;
    const reportDate = {
      $gte: fromDate || moment().tz(timezone).format("YYYY-MM-DD"),
      $lte: toDate || moment().tz(timezone).format("YYYY-MM-DD"),
    };
    // Base match stage
    const matchStage = {
      $match: {
        customerId,
        profileId,
        reportDate,
        ...(type && { type }),
        ...(status && { status }),
        ...(searchName && { name: { $regex: new RegExp(RegExp.escape(searchName), "i") } }),
      }
    };

    const commonPipeline = [
      matchStage,
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
          spend: {
            $sum: "$spend",
          },
          sales: {
            $sum: "$sales",
          },
          impressions: {
            $sum: "$impressions",
          },
          cpc: {
            $sum: "$cpc",
          },
          clicks: {
            $sum: "$clicks",
          },
          orders: {
            $sum: "$orders",
          },
        },
      },
      {
        $project: {
          _id: 0,
          budgetType: "$campaign.budgetType",
          startDate: "$campaign.startDate",
          endDate: "$campaign.endDate",
          type: "$campaign.type",
          campaignId: "$_id.campaignId",
          targetingType: "$campaign.targetingType",
          costType: "$campaign.costType",
          clicks: 1,
          name: "$campaign.name",
          status: "$campaign.status",
          budget: "$campaign.budget",
          cpc: {
            $round: ["$cpc", 2],
          },
          impressions: 1,
          orders: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          acos: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$sales", 0],
                  },
                  then: {
                    $multiply: [
                      {
                        $divide: ["$spend", "$sales"],
                      },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          roas: {
            $round: [
              {
                $cond: {
                  if: {
                    $gt: ["$spend", 0],
                  },
                  then: {
                    $divide: ["$sales", "$spend"],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
      {
        $sort: { acos: -1, updatedAt: -1 },
      },
    ];

    // Add field filtering to the pipeline
    if (fieldName && fieldOperator && fieldValue !== undefined) {
      const fieldFilter = buildFieldFilter(fieldName, fieldOperator, fieldValue);

      if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
        const extraFieldFilter = buildFieldFilter(fieldName, extraFieldOperator, extraFieldValue);

        // Create proper MongoDB logical operator
        const logicalOperator = {
          [`$${conditions.toLowerCase()}`]: [
            fieldFilter,
            extraFieldFilter
          ]
        };

        commonPipeline.push({ $match: logicalOperator });
      } else {
        commonPipeline.push({ $match: fieldFilter });
      }
    }

    // Add sorting
    const sortStage = {};
    if (sortType === "ASC") {
      sortStage[fieldName] = 1;
    } else if (sortType === "DESC") {
      sortStage[fieldName] = -1;
    } else {
      sortStage.acos = -1;
      sortStage.updatedAt = -1;
    }

    // Main pipeline with facet
    const pipeline = [
      ...commonPipeline,
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: sortStage },
            { $skip: (pageNo - 1) * perPage },
            { $limit: perPage }
          ]
        }
      },
      {
        $project: {
          data: 1,
          totalRecords: { $arrayElemAt: ["$metadata.total", 0] }
        }
      }
    ];

    const result = await campaignsSchema.aggregate(pipeline);
    const campaignResult = result[0]?.data || [];
    const totalRecords = result[0]?.totalRecords || 0;

    return res.status(200).send({
      isSuccess: true,
      getCampaign: campaignResult,
      currentPageNo: pageNo,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
    });

  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

// Helper function to build field filters
function buildFieldFilter(fieldName, operator, value) {
  const operatorMap = {
    "GREATER_THAN": "$gt",
    "GREATER_THAN_OR_EQUAL_TO": "$gte",
    "LESS_THAN": "$lt",
    "LESS_THAN_OR_EQUAL_TO": "$lte",
    "EQUAL_TO": "$eq"
  };

  const mongoOperator = operatorMap[operator];
  if (!mongoOperator) return {};

  return {
    [fieldName]: { [mongoOperator]: value }
  };
};

exports.getCampaignDataTable = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const campaignId = Number(req.params.id);
    const { profileId, type, fromDate, toDate } = req.body;
    let dateFormatObj = {};
    if (type == "1" || type == 1) {
      dateFormatObj = splitIntoWeeks(fromDate, toDate);
    } else if (type == "2" || type == 2) {
      dateFormatObj = splitIntoMonths(fromDate, toDate);
    } else {
      dateFormatObj = splitIntoDays(fromDate, toDate);
    }
    const data = [];
    await Promise.all(
      Object.keys(dateFormatObj).map(async (dateFormat) => {
        const getCampaignData = [
          {
            $match: {
              customerId: new ObjectId(customerId),
              profileId: Number(profileId),
              campaignId: Number(campaignId),
              reportDate: {
                $gte: dateFormatObj[dateFormat].fromDate,
                $lte: dateFormatObj[dateFormat].toDate,
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
              placement: {
                $first: "$$ROOT",
              },
              spend: {
                $sum: "$spend",
              },
              sales: {
                $sum: "$sales",
              },
              impressions: {
                $sum: "$impressions",
              },
              clicks: {
                $sum: "$clicks",
              },
              orders: {
                $sum: "$orders",
              },
              units: {
                $sum: "$units",
              },
              conversion: {
                $sum: "$conversion",
              },
            },
          },
          {
            $project: {
              _id: 0,
              campaignId: "$_id.campaignId",
              campaignName: "$placement.campaignName",
              campaignStatus: "$placement.campaignStatus",
              clicks: 1,
              impressions: 1,
              sales: {
                $round: ["$sales", 2],
              },
              spend: {
                $round: ["$spend", 2],
              },
              orders: 1,
              units: 1,
              acos: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$sales", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$spend", "$sales"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              roas: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$spend", 0],
                      },
                      then: {
                        $divide: ["$sales", "$spend"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cvr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$orders", "$clicks"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              ctr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$impressions", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$clicks", "$impressions"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cpc: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $divide: ["$spend", "$clicks"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              conversion: {
                $round: ["$conversion", 2],
              },
            },
          },
          {
            $sort: {
              impressions: -1,
              updatedAt: -1,
            },
          },
        ];
        const campaignResult = await campaignsSchema.aggregate(getCampaignData);
        if (campaignResult.length > 0) {
          campaignResult[0].fromDate = dateFormatObj[dateFormat].fromDate;
          campaignResult[0].toDate = dateFormatObj[dateFormat].toDate;
          campaignResult[0].avgSalesPrice =
            campaignResult[0].orders > 0
              ? (campaignResult[0].sales / campaignResult[0].orders).toFixed(2)
              : 0;
          campaignResult[0].costPerOrder =
            campaignResult[0].orders > 0
              ? (campaignResult[0].spend / campaignResult[0].orders).toFixed(2)
              : 0;
          data.push(campaignResult[0]);
        }
      })
    );
    data.sort((a, b) => new Date(a.fromDate) - new Date(b.fromDate));
    return res.status(200).send({
      isSuccess: true,
      message: "Data table listing Successfully",
      dataTable: data,
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.getCampaignDetailsData = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customerId = req.customer._id;
    const permissionResult = await checkPermission(
      customerId,
      "Campaigns",
      "Details View Only",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    let { adGroupPageNo, adGroupPerPage, fromDate, toDate, profileId, status } =
      req.body;
    adGroupPageNo = adGroupPageNo ? adGroupPageNo : 1;
    adGroupPerPage = adGroupPerPage ? adGroupPerPage : 10;
    let filter = {
      campaignId: id,
      profileId: Number(profileId),
      customerId: new ObjectId(customerId),
    };
    if (fromDate && toDate) {
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    if (status) {
      filter.status = status;
    }
    if (!profileId) {
      return res
        .status(203)
        .send({ message: "Profile id required!", isSuccess: false });
    }
    const getCampaignData = await campaignsSchema.aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: null,
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalCpc: { $sum: "$cpc" },
          totalClicks: { $sum: "$clicks" },
          totalOrders: { $sum: "$orders" },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: { $round: ["$totalImpressions", 2] },
          totalCpc: { $round: ["$totalCpc", 2] },
          totalClicks: { $round: ["$totalClicks", 2] },
          totalAcos: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSales", 0] },
                  then: {
                    $multiply: [
                      { $divide: ["$totalSpend", "$totalSales"] },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSpend", 0] },
                  then: { $divide: ["$totalSales", "$totalSpend"] },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
    ]);
    const getData = [
      {
        $match: filter,
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
            placement: "$placement",
          },
          placement: {
            $first: "$$ROOT",
          },
          spend: {
            $sum: "$spend",
          },
          sales: {
            $sum: "$sales",
          },
          impressions: {
            $sum: "$impressions",
          },
          clicks: {
            $sum: "$clicks",
          },
          orders: {
            $sum: "$orders",
          },
          conversion: {
            $sum: "$conversion",
          },
          units: {
            $sum: "$units",
          },
        },
      },
      {
        $group: {
          _id: "$_id.campaignId",
          campaignName: {
            $last: "$placement.campaignName",
          },
          campaignStatus: {
            $last: "$placement.campaignStatus",
          },
          type: {
            $last: "$placement.type",
          },
          keywordBid: {
            $last: "$placement.keywordBid",
          },
          placementsData: {
            $push: {
              campaignId: "$_id.campaignId",
              placement: "$_id.placement",
              clicks: "$clicks",
              impressions: "$impressions",
              sales: {
                $round: ["$sales", 2],
              },
              spend: {
                $round: ["$spend", 2],
              },
              orders: "$orders",
              units: "$units",
              acos: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$sales", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$spend", "$sales"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              roas: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$spend", 0],
                      },
                      then: {
                        $divide: ["$sales", "$spend"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cvr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$orders", "$clicks"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              ctr: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$impressions", 0],
                      },
                      then: {
                        $multiply: [
                          {
                            $divide: ["$clicks", "$impressions"],
                          },
                          100,
                        ],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              cpc: {
                $round: [
                  {
                    $cond: {
                      if: {
                        $gt: ["$clicks", 0],
                      },
                      then: {
                        $divide: ["$spend", "$clicks"],
                      },
                      else: 0,
                    },
                  },
                  2,
                ],
              },
              conversion: {
                $round: ["$conversion", 2],
              },
              bidStrategy: "$placement.biddingStartegy",
              placementModifier: {
                $ifNull: ["$placement.placementModifier", 0],
              },
              targetAcos: {
                $ifNull: ["$placement.targetAcos", 0],
              },
              newKeywordBid: {
                $ifNull: ["$placement.newKeywordBid", 0],
              },
            },
          },
          totalImpressions: {
            $sum: "$impressions",
          },
          totalClicks: {
            $sum: "$clicks",
          },
          totalOrders: {
            $sum: "$orders",
          },
          totalUnits: {
            $sum: "$units",
          },
          totalSales: {
            $sum: "$sales",
          },
          totalSpend: {
            $sum: "$spend",
          },
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: "$_id",
          placementsData: 1,
        },
      },
    ];
    placementSubResult = await placementSchema.aggregate(getData);
    const allPlacements = ["Top of Search", "Product Pages", "Rest of Search"];
    placementSubResult = placementSubResult.map((campaign) => {
      const placementsData = allPlacements.map((placement) => {
        const placementData = campaign.placementsData.find((data) => {
          return (
            data.placement &&
            data.placement.toLowerCase() === placement.toLowerCase()
          );
        });
        return (
          placementData || {
            campaignId: campaign.campaignId,
            placement,
            clicks: 0,
            impressions: 0,
            sales: 0,
            spend: 0,
            orders: 0,
            units: 0,
            acos: 0,
            roas: 0,
            cvr: 0,
            ctr: 0,
            cpc: 0,
            conversion: 0,
          }
        );
      });
      return {
        campaignId: campaign.campaignId,
        placementsData,
      };
    });
    placementSubResult.sort((a, b) => {
      return (
        allPlacements.indexOf(a.placementsData[0].placement) -
        allPlacements.indexOf(b.placementsData[0].placement)
      );
    });
    const adGroupPipeline = [
      {
        $match: filter,
      },
      {
        $sort: {
          reportDate: -1,
        },
      },
      {
        $group: {
          _id: "$adGroupId",
          adGroup: {
            $first: "$$ROOT",
          },
          totalSpend: { $sum: "$spend" },
          totalSales: { $sum: "$sales" },
          totalImpressions: { $sum: "$impressions" },
          totalCpc: { $sum: "$cpc" },
          totalClicks: { $sum: "$clicks" },
        },
      },
      {
        $project: {
          _id: 0,
          adGroupName: "$adGroup.name",
          adGroupId: "$_id",
          status: "$adGroup.status",
          bid: "$adGroup.defaultBid",
          totalSpend: { $round: ["$totalSpend", 2] },
          totalSales: { $round: ["$totalSales", 2] },
          totalImpressions: { $round: ["$totalImpressions", 2] },
          totalCpc: { $round: ["$totalCpc", 2] },
          totalClicks: { $round: ["$totalClicks", 2] },
          totalAcos: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSales", 0] },
                  then: {
                    $multiply: [
                      { $divide: ["$totalSpend", "$totalSales"] },
                      100,
                    ],
                  },
                  else: 0,
                },
              },
              2,
            ],
          },
          totalRoas: {
            $round: [
              {
                $cond: {
                  if: { $gt: ["$totalSpend", 0] },
                  then: { $divide: ["$totalSales", "$totalSpend"] },
                  else: 0,
                },
              },
              2,
            ],
          },
        },
      },
      {
        $facet: {
          paginatedResults: [
            { $skip: adGroupPerPage * adGroupPageNo - adGroupPerPage },
            { $limit: adGroupPerPage },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ];
    const adGroupResult = await adGroupsSchema.aggregate(adGroupPipeline);
    const getAdGroupsData = adGroupResult[0].paginatedResults;

    const totalAdGroupData =
      adGroupResult[0].totalCount.length > 0
        ? adGroupResult[0].totalCount[0].count
        : 0;
    return res.status(200).send({
      getCampaignData,
      getPlacementData: placementSubResult,
      getAdGroupsData,
      totalAdGroupData,
      adGroupCurrentPageNo: adGroupPageNo,
      adGroupTotalPages: Math.ceil(totalAdGroupData / adGroupPerPage),
      message: "Get campaign details data successfully.",
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

// Helper Function
function formatDateProper(date) {
  return moment(date).format("YYYY-MM-DD");
}

function splitIntoDays(fromDate, toDate) {
  const days = {};
  let currentDate = moment(fromDate);
  let dayNumber = 1;
  while (
    currentDate.isBefore(toDate, "day") ||
    currentDate.isSame(toDate, "day")
  ) {
    const startOfWeek = currentDate.clone().startOf("day");
    const endOfWeek = currentDate.clone().endOf("day");
    const formattedFromDate = formatDateProper(
      startOfWeek.isBefore(fromDate) ? fromDate : startOfWeek
    );
    const formattedToDate = formatDateProper(
      endOfWeek.isAfter(toDate) ? toDate : endOfWeek
    );
    days[`day${dayNumber}`] = {
      fromDate: formattedFromDate,
      toDate: formattedToDate,
    };
    currentDate = currentDate.clone().endOf("day").add(1, "day");
    dayNumber++;
  }
  return days;
}

function splitIntoWeeks(fromDate, toDate) {
  const weeks = {};
  let currentDate = moment(fromDate);
  let weekNumber = 1;
  while (
    currentDate.isBefore(toDate, "day") ||
    currentDate.isSame(toDate, "day")
  ) {
    const startOfWeek = currentDate.clone().startOf("week");
    const endOfWeek = currentDate.clone().endOf("week");
    const formattedFromDate = formatDateProper(
      startOfWeek.isBefore(fromDate) ? fromDate : startOfWeek
    );
    const formattedToDate = formatDateProper(
      endOfWeek.isAfter(toDate) ? toDate : endOfWeek
    );
    weeks[`week${weekNumber}`] = {
      fromDate: formattedFromDate,
      toDate: formattedToDate,
    };
    currentDate = currentDate.clone().endOf("week").add(1, "day");
    weekNumber++;
  }
  return weeks;
}

function splitIntoMonths(fromDate, toDate) {
  const months = {};
  let currentDate = moment(fromDate);
  let monthNumber = 1;
  while (
    currentDate.isBefore(toDate, "day") ||
    currentDate.isSame(toDate, "day")
  ) {
    const startOfWeek = currentDate.clone().startOf("month");
    const endOfWeek = currentDate.clone().endOf("month");
    const formattedFromDate = formatDateProper(
      startOfWeek.isBefore(fromDate) ? fromDate : startOfWeek
    );
    const formattedToDate = formatDateProper(
      endOfWeek.isAfter(toDate) ? toDate : endOfWeek
    );
    months[`month${monthNumber}`] = {
      fromDate: formattedFromDate,
      toDate: formattedToDate,
    };
    currentDate = currentDate.clone().endOf("month").add(1, "day");
    monthNumber++;
  }
  return months;
}

exports.cronGenerateReport = async (req, res) => {
  write_logs({
    message: `US Time = ${moment()
      .tz("America/Los_Angeles")
      .format("HH:mm")} India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronGenerateReport`,
    log_type: "info",
  });
  try {
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Campaign Report",
      isActive: false,
    });
    if (getCronStatus) {
      return write_logs({
        message: `Your campaign report status is deactive.`,
        log_type: "info",
      });
    }
    const getProfileId = await profileSchema.find({ isActive: true });
    const workerPromises = await Promise.all(
      getProfileId.map(async (profile) => {
        const checkConfigAds = await cronGetAccessToken(profile.customerId);
        const checkCustomerPermission = await cronCheckCustomerPermission(
          profile.customerId,
          profile.profileId,
          "Campaign Report"
        );
        if (
          checkCustomerPermission &&
          checkConfigAds &&
          checkConfigAds.adsAccessToken
        ) {
          return new Promise((resolve, reject) => {
            const currentDate = moment
              .tz(profile.timezone)
              .format("YYYY-MM-DD");
            const startDate = moment(currentDate)
              .subtract(1, "day")
              .format("YYYY-MM-DD");
            const endDate = moment(currentDate)
              .subtract(1, "day")
              .format("YYYY-MM-DD");
            const sleepTime = 15;
            const worker = new Worker(path.resolve(__dirname, '../workers/campaignWorker.js'), {
              workerData: {
                sleepTime,
                profileData: JSON.stringify(profile),
                checkConfigAds,
                reportDate: startDate,
              },
            });
            worker.on("message", async (data) => {
              write_logs({
                message: `Thread ID: ${data.threadId} - Received data from worker Customer ID: ${data.response.customerId}, Profile ID: ${data.response.profileId}`,
                log_type: "info",
              });
              if (data.response) {
                let responseSPStatus = "PENDING";
                while (
                  responseSPStatus != "COMPLETED"
                ) {
                  if (
                    responseSPStatus != "COMPLETED" &&
                    responseSPStatus != "ERROR"
                  ) {
                    const reportSpResponse = await spGenerateReport(
                      profile.profileId,
                      startDate,
                      endDate,
                      checkConfigAds,
                      profile.customerId,
                      profile.timezone
                    );
                    write_logs({
                      message: `${profile.customerId} ${profile.profileId} ${startDate} SP ${reportSpResponse}`,
                      log_type: "info",
                    });
                    responseSPStatus = reportSpResponse;
                  }
                  if (
                    responseSPStatus != "COMPLETED"
                  ) {
                    const getCronData = await cronJobHistorySchema.findOne({
                      customerId: profile.customerId,
                      profileId: profile.profileId,
                      cronName: "Campaign Report",
                      status: "PENDING",
                      historyDate: currentDate,
                    });
                    if (
                      responseSPStatus == "ERROR"
                    ) {
                      if (getCronData) {
                        await cronJobHistorySchema.findByIdAndUpdate(
                          { _id: getCronData._id },
                          {
                            status: "FAILED",
                          },
                          { new: true }
                        );
                      }
                    } else {
                      if (!getCronData) {
                        const createCronHistory = new cronJobHistorySchema({
                          customerId: profile.customerId,
                          profileId: profile.profileId,
                          cronName: "Campaign Report",
                          status: "PENDING",
                          historyDate: currentDate,
                        });
                        await createCronHistory.save();
                      }
                      await new Promise((resolve) =>
                        setTimeout(resolve, 60000)
                      );
                    }
                  }

                  if (
                    responseSPStatus == "COMPLETED"
                  ) {
                    const getCronData = await cronJobHistorySchema.findOne({
                      customerId: profile.customerId,
                      profileId: profile.profileId,
                      cronName: "Campaign Report",
                      status: "PENDING",
                      historyDate: currentDate,
                    });
                    if (getCronData) {
                      await cronJobHistorySchema.findByIdAndUpdate(
                        { _id: getCronData._id },
                        {
                          status: "COMPLETED",
                        },
                        { new: true }
                      );
                    }
                  }
                }
              }
              resolve(data);
            });
            worker.on("error", (error) => {
              write_logs({
                message: `CustomerID: ${profile.customerId} ProfileID: ${profile.profileId
                  } Worker error in report => ${JSON.stringify(error)}`,
                log_type: "error",
              });
              resolve("ERROR");
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                write_logs({
                  message: `CustomerID: ${profile.customerId} ProfileID: ${profile.profileId} Worker stopped with exit code in report ${code}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            });
          });
        } else {
          return write_logs({
            message: `Account disconnected in report ${profile.customerId
              }, ${JSON.stringify(checkConfigAds)}`,
            log_type: "info",
          });
        }
      })
    );
    await Promise.all(workerPromises);
    return write_logs({
      message: "Campaign report generated successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Campaign report err: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

exports.cronListCampaignsFromAmazon = async (req, res) => {
  write_logs({
    message: `US Time = ${moment()
      .tz("America/Los_Angeles")
      .format("HH:mm")} India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronListCampaignsFromAmazon`,
    log_type: "info",
  });
  try {
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Campaign Listing",
      isActive: false,
    });

    if (getCronStatus) {
      return write_logs({
        message: `Your campaign listing status is deactive.`,
        log_type: "info",
      });
    }
    const getProfileId = await profileSchema.find({ isActive: true });

    const workerPromises = await Promise.all(
      getProfileId.map(async (profile) => {
        const checkConfigAds = await cronGetAccessToken(profile.customerId);
        const checkCustomerPermission = await cronCheckCustomerPermission(
          profile.customerId,
          profile.profileId,
          "Campaign Listing"
        );
        if (
          checkCustomerPermission &&
          checkConfigAds &&
          checkConfigAds.adsAccessToken
        ) {
          const currentDate = moment
            .tz(profile.timezone)
            .add(1, "days")
            .format("YYYY-MM-DD");
          return new Promise((resolve, reject) => {
            const sleepTime = 15;
            const worker = new Worker(path.resolve(__dirname, '../workers/campaignWorker.js'), {
              workerData: {
                sleepTime,
                profileData: JSON.stringify(profile),
                checkConfigAds,
                reportDate: currentDate,
              },
            });
            worker.on("message", async (data) => {
              write_logs({
                message: `Thread ID: ${data.threadId} - Received data from worker Customer ID: ${data.response.customerId}, Profile ID: ${data.response.profileId}`,
                log_type: "info",
              });
              if (data.response) {
                try {
                  const getCustomerPackage = await customerSchema
                    .findById(profile.customerId)
                    .populate("packageId");

                  let campaigns = [];
                  if (
                    getCustomerPackage.packageId.campaignTypes.includes(
                      "Sponsored Products"
                    )
                  ) {
                    const spCampaigns = await getSPCampaigns(
                      profile.customerId,
                      profile.profileId,
                      checkConfigAds,
                      profile.currencyCode,
                      profile.timezone,
                      currentDate
                    );
                    campaigns = campaigns.concat(spCampaigns);
                  }
                  if (campaigns.length > 0) {
                    await Promise.all(
                      campaigns.map(async (item) => {
                        const getCampaign = await campaignsSchema.findOne({
                          customerId: item.customerId,
                          profileId: item.profileId,
                          campaignId: item.campaignId,
                          reportDate: item.reportDate,
                        });
                        if (!getCampaign) {
                          let createCampaign = new campaignsSchema(item);
                          await createCampaign.save();
                        } else {
                          await campaignsSchema.findByIdAndUpdate(
                            { _id: getCampaign._id },
                            item,
                            { new: true }
                          );
                        }
                      })
                    );
                  }
                  const totalRecords = await campaignsSchema.count({
                    profileId: profile.profileId,
                    reportDate: currentDate,
                  });
                  const createCronHistory = new cronJobHistorySchema({
                    customerId: profile.customerId,
                    profileId: profile.profileId,
                    cronName: "Campaign Listing",
                    status: "COMPLETED",
                    historyDate: currentDate,
                  });
                  await createCronHistory.save();
                  write_logs({
                    message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId}, Total ${totalRecords} Campaigns listed successfully.`,
                    log_type: "info",
                  });
                } catch (error) {
                  write_logs({
                    message: `CustomerID: ${profile.customerId} ProfileID: ${profile.profileId
                      } Worker error in camapign listing => ${JSON.stringify(error)}`,
                    log_type: "error",
                  });
                  resolve("ERROR");
                }
              }
              resolve(data);
            });
            worker.on("error", (error) => {
              write_logs({
                message: `CustomerID: ${profile.customerId} ProfileID: ${profile.profileId
                  } Worker error in camapign listing => ${JSON.stringify(error)}`,
                log_type: "error",
              });
              resolve("ERROR");
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                write_logs({
                  message: `CustomerID: ${profile.customerId} ProfileID: ${profile.profileId} Worker stopped with exit code in campaign listing ${code}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            });
          });
        } else {
          return write_logs({
            message: `Account disconnected in campaign listing ${profile.customerId
              }, ${JSON.stringify(checkConfigAds)}`,
            log_type: "info",
          });
        }
      })
    );
    await Promise.all(workerPromises);
    return write_logs({
      message: "Campaigns listing successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Campaign listing err: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

async function getSPCampaigns(
  customerId,
  profileId,
  checkConfigAds,
  currencyCode,
  timezone,
  reportDate
) {
  return new Promise(async (resolve, reject) => {
    const getAccount = await getProfile(customerId, profileId);
    let bodyData = {
      maxResults: 1000,
    };
    const spOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/campaigns/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.clientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
      },
    };
    const campaigns = [];
    let nextToken = "";
    async function makeRequest() {
      if (nextToken) {
        bodyData.nextToken = nextToken;
      }
      spOptions.data = bodyData;
      try {
        const response = await axios(spOptions);
        if (response.status === 200) {
          const body = response.data;
          if (body.campaigns.length > 0) {
            body.campaigns.forEach((item) => {
              let obj = {
                customerId: customerId,
                profileId: profileId,
                campaignId: item.campaignId,
                type: "Sponsored Products",
                name: item.name,
                currencyCode: currencyCode,
                status: item.state.toUpperCase(),
                startDate: item.startDate ? item.startDate : "",
                endDate: item.endDate ? item.endDate : "",
                budget: item.budget ? item.budget.budget : "",
                budgetType: item.budget ? item.budget.budgetType : "",
                targetingType: item.targetingType,
                timezone,
                reportDate,
              };
              campaigns.push(obj);
            });
            const totalResults = body.totalResults;
            nextToken = body.nextToken;
            if (campaigns.length < totalResults && nextToken) {
              makeRequest();
            } else {
              resolve(campaigns);
            }
          } else {
            resolve(campaigns);
          }
        }
        else {
          write_logs({
            message: `CustomerID: ${customerId} ProfileID: ${profileId} SP campaign listing err : ${JSON.stringify(
              response.data
            )}`,
            log_type: "error",
          });
          resolve(campaigns);
        }
      } catch (error) {
        write_logs({
          message: `CustomerID: ${customerId} ProfileID: ${profileId} SP Campaign listing err: ${JSON.stringify(
            error
          )}`,
          log_type: "error",
        });
        resolve(campaigns);
      }
    }
    makeRequest();
  });
}

exports.cronCampaignGenerateReport = async (req, res) => {
  try {
    report_write_logs({
      message: `US Time = ${moment()
        .tz("America/Los_Angeles")
        .format("HH:mm")} India Time = ${moment()
          .tz("Asia/Kolkata")
          .format("HH:mm")} cronGenerateReport`,
      log_type: "info",
    });
    const getRules = await budgetRulesSchema.find({
      times: { $ne: [] },
      campaignIds: { $ne: [] },
      isActive: true,
    });
    if (getRules.length > 0) {
      const profileIds = [];
      await Promise.all(
        getRules.map(async (rule) => {
          const customerId = rule.customerId;
          const profileId = rule.profileId;
          const timezone = rule.timezone;
          const checkConfigAds = await cronGetAccessToken(customerId);
          if (checkConfigAds && checkConfigAds.adsAccessToken) {
            await Promise.all(
              rule.times.map(async (time) => {
                const currentTime = moment().tz(timezone).format("HH:mm");
                const beforeTimes = Array.from({ length: 30 }, (_, index) =>
                  moment
                    .tz(time, "HH:mm", timezone)
                    .subtract(index + 1, "minutes")
                    .format("HH:mm")
                ).reverse();
                if (
                  !profileIds.includes(profileId) &&
                  beforeTimes.length > 0 &&
                  beforeTimes.includes(currentTime)
                ) {
                  profileIds.push(profileId);
                  report_write_logs({
                    message: `Rule Time: ${time}, beforeTimes: ${beforeTimes} currentTime: ${currentTime}`,
                    log_type: "info",
                  });
                  const startDate = moment().tz(timezone).format("YYYY-MM-DD");
                  const endDate = moment().tz(timezone).format("YYYY-MM-DD");
                  const reportSpResponse = await spGenerateReport(
                    profileId,
                    startDate,
                    endDate,
                    checkConfigAds,
                    customerId,
                    timezone
                  );
                  report_write_logs({
                    message: `${customerId} ${profileId} ${startDate} SP ${reportSpResponse}`,
                    log_type: "info",
                  });
                }
              })
            );
          }
        })
      );
    }
  } catch (error) {

    return report_write_logs({
      message: `Report campaign report err: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

async function spGenerateReport(
  profileId,
  startDate,
  endDate,
  checkConfigAds,
  customerId,
  timezone
) {
  return new Promise(async (resolve, reject) => {
    const getAccount = await getProfile(customerId, profileId);
    const bodyData = {
      name: "",
      startDate,
      endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: [
          "campaignId",
          "campaignName",
          "campaignStatus",
          "campaignBudgetAmount",
          "impressions",
          "clicks",
          "cost",
          "spend",
          "purchases1d",
          "purchases7d",
          "unitsSoldClicks1d",
          "sales1d",
          "costPerClick",
          "clickThroughRate",
          "date",
          "sales7d",
        ],
        reportTypeId: "spCampaigns",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
      },
    };
    let reportPOSTOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/reporting/reports`,
      headers: {
        "Amazon-Advertising-API-ClientId": `${checkConfigAds.clientId}`,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
      },
      data: bodyData
    };
    try {
      const getReportData = await reportsSchema.findOne({
        startDate,
        endDate,
        profileId,
        customerId,
        reportTypeId: "spCampaigns",
        reportName: "CAMPAIGNS",
      });
      if (getReportData) {
        let lastUpdateTime = moment(getReportData.updatedAt)
          .tz(timezone)
          .format("HH:mm");
        const currentTime = moment().tz(timezone).format("HH:mm");
        const lastUpdateTimeObj = moment(lastUpdateTime, "HH:mm");
        const currentTimeObj = moment(currentTime, "HH:mm");
        const timeDifferenceMinutes = currentTimeObj.diff(
          lastUpdateTimeObj,
          "minutes"
        );
        if (
          getReportData.status == "COMPLETED" &&
          (timeDifferenceMinutes >= 30 || timeDifferenceMinutes < 0)
        ) {
          try {
            const response = await axios(reportPOSTOptions);
            if (response.status === 200) {
              const body = response.data;
              if (body.reportId && body.message != "Unauthorized") {
                await reportsSchema.findByIdAndUpdate(getReportData._id, {
                  $set: {
                    reportId: body.reportId,
                    status: body.status,
                  },
                });
                resolve(body.status);
              } else {
                report_write_logs({
                  message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err token expire: ${JSON.stringify(
                    body
                  )}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            }
            else {
              report_write_logs({
                message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report amazon error: ${JSON.stringify(
                  response.data
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          } catch (error) {
            report_write_logs({
              message: `CustomerID: ${customerId} ProfileID: ${profileId} SP Report err: ${JSON.stringify(
                error.response?.data || error.message
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          }
        } else if (getReportData.status == "COMPLETED") {
          resolve(getReportData.status);
        } else {
          let reportIdOptions = {
            method: "GET",
            url: `${getAccount.amazonUrl}/reporting/reports/${getReportData.reportId}`,
            headers: {
              "Amazon-Advertising-API-ClientId": `${checkConfigAds.clientId}`,
              "Amazon-Advertising-API-Scope": profileId,
              Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
              "Content-Type":
                "application/vnd.createasyncreportrequest.v3+json",
            },
          };
          const unzipReport = (zipFilePath, extractionPath, callback) => {
            const unzip = zlib.createUnzip();
            const output = fs.createWriteStream(extractionPath);
            output.on("finish", () => {
              callback(null);
            });
            output.on("error", (error) => {
              callback(error);
            });
            const input = fs.createReadStream(zipFilePath);
            input.pipe(unzip).pipe(output);
          };

          try {
            const response = await axios(reportIdOptions);
            if (response.status === 200) {
              const body = response.data;
              if (body.message != "Unauthorized") {
                if (body.status !== "COMPLETED") {
                  resolve(body.status);
                }
                else {
                  await reportsSchema.updateOne(
                    {
                      profileId,
                      reportId: getReportData.reportId,
                    },
                    {
                      $set: {
                        status: body.status,
                      },
                    }
                  );
                  const zipFilePath = path.resolve(__dirname, '../../uploads/campaigns/sp-report', `${getReportData.endDate}-${getReportData.reportId}.gz.json`);
                  const extractionPath = path.resolve(__dirname, '../../uploads/campaigns/sp-report', `${getReportData.endDate}-${getReportData.reportId}.json`);

                  const file = fs.createWriteStream(zipFilePath);
                  try {
                    const fileResponse = await axios({
                      method: 'get',
                      url: body.url,
                      responseType: 'stream'
                    });

                    fileResponse.data.pipe(file);

                    file.on("error", (error) => {
                      report_write_logs({
                        message: `CustomerID: ${customerId} ProfileID: ${profileId} SP Report File err: ${error}`,
                        log_type: "error",
                      });
                      resolve("ERROR");
                    });

                    file.on("finish", () => {
                      unzipReport(
                        zipFilePath,
                        extractionPath,
                        async (unzipError) => {
                          if (unzipError) {
                            report_write_logs({
                              message: `CustomerID: ${customerId} ProfileID: ${profileId} SP Report zip err: ${unzipError}`,
                              log_type: "error",
                            });
                            resolve("ERROR");
                          }
                          const data = require(extractionPath);

                          await Promise.all(
                            data.map(async (item) => {
                              const checkCampaignId =
                                await campaignsSchema.findOne({
                                  customerId,
                                  profileId,
                                  campaignId: item.campaignId,
                                  reportDate: startDate,
                                });
                              if (checkCampaignId) {
                                await campaignsSchema.updateOne(
                                  {
                                    profileId,
                                    customerId,
                                    campaignId: item.campaignId,
                                    reportDate: startDate,
                                  },
                                  {
                                    $set: {
                                      status: item.campaignStatus.toUpperCase(),
                                      budget: item.campaignBudgetAmount,
                                      spend: item.spend ? item.spend : 0,
                                      sales: item.sales7d ? item.sales7d : 0,
                                      impressions: item.impressions,
                                      clicks: item.clicks,
                                      cpc: item.costPerClick,
                                      orders: item.purchases7d,
                                      roas:
                                        item.sales7d != 0 && item.spend != 0
                                          ? (item.sales7d / item.spend).toFixed(2)
                                          : 0,
                                      acos:
                                        item.sales7d != 0 && item.spend != 0
                                          ? (
                                            (item.spend / item.sales7d) *
                                            100
                                          ).toFixed(2)
                                          : 0,
                                    },
                                  }
                                );
                              } else {
                                const checkCampaignName =
                                  await campaignsSchema.findOne({
                                    customerId,
                                    profileId,
                                    name: item.campaignName,
                                    reportDate: startDate,
                                  });
                                if (checkCampaignName) {
                                  await campaignsSchema.updateOne(
                                    {
                                      profileId,
                                      customerId,
                                      name: item.campaignName,
                                      reportDate: startDate,
                                    },
                                    {
                                      $set: {
                                        status: item.campaignStatus.toUpperCase(),
                                        budget: item.campaignBudgetAmount,
                                        spend: item.spend ? item.spend : 0,
                                        sales: item.sales7d ? item.sales7d : 0,
                                        impressions: item.impressions,
                                        clicks: item.clicks,
                                        cpc: item.costPerClick,
                                        orders: item.purchases7d,
                                        roas:
                                          item.sales7d != 0 && item.spend != 0
                                            ? (item.sales7d / item.spend).toFixed(
                                              2
                                            )
                                            : 0,
                                        acos:
                                          item.sales7d != 0 && item.spend != 0
                                            ? (
                                              (item.spend / item.sales7d) *
                                              100
                                            ).toFixed(2)
                                            : 0,
                                      },
                                    }
                                  );
                                } else {
                                  report_write_logs({
                                    message: `SP Report Extra Data : ${item.campaignId} = ${item.campaignName}`,
                                    log_type: "info",
                                  });
                                }
                              }
                            })
                          );
                          resolve(body.status);
                        }
                      );
                    });

                  } catch (error) {
                    report_write_logs({
                      message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err: ${JSON.stringify(
                        error.response?.data || error.message || error
                      )}`,
                      log_type: "error",
                    });
                    resolve("ERROR");
                  }
                }
              }
              else {
                report_write_logs({
                  message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err token expire: ${JSON.stringify(
                    body
                  )}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            }
            else {
              report_write_logs({
                message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report amazon error: ${JSON.stringify(
                  response.data
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          } catch (error) {
            report_write_logs({
              message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err: ${JSON.stringify(
                error.response?.data || error.message || error
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          }
        }
      } else {
        try {
          const response = await axios(reportPOSTOptions);
          if (response.status == 200) {
            const body = response.data;
            if (body.reportId && body.message != "Unauthorized") {
              let create = {
                adProduct: body.configuration.adProduct,
                reportTypeId: body.configuration.reportTypeId,
                startDate: body.startDate,
                endDate: body.endDate,
                reportId: body.reportId,
                status: body.status,
                profileId,
                customerId,
                reportName: "CAMPAIGNS",
              };
              const createReport = new reportsSchema(create);
              await createReport.save();
              resolve(body.status);
            }
            else {
              report_write_logs({
                message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err token expire: ${JSON.stringify(
                  body
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          }
          else {
            report_write_logs({
              message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report amazon error: ${JSON.stringify(
                response.data
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          }
        } catch (error) {
          report_write_logs({
            message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err: ${JSON.stringify(
              error.response?.data || error.message
            )}`,
            log_type: "error",
          });
          resolve("ERROR");
        }
      }
    } catch (error) {
      report_write_logs({
        message: `CustomerID: ${customerId} ProfileID: ${profileId} SP report err: ${JSON.stringify(
          error
        )}`,
        log_type: "error",
      });
      resolve("ERROR");
    }
  });
};

async function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${year}${month}${day}`;
}

exports.listCampaignName = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, type } = req.body;
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    if (!type) {
      return res.status(203).send({
        message: "Type is required!",
        isSuccess: false,
      });
    }
    const campaigns = await campaignsSchema.aggregate([
      {
        $match: {
          profileId,
          customerId: new ObjectId(customerId),
          type,
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
          name: 1,
          campaignId: 1,
          type: 1,
          _id: 0,
        },
      },
    ]);
    if (campaigns.length === 0) {
      return res.status(203).send({
        message: "Campaign not found!",
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: campaigns,
      totalRecords: campaigns.length,
      message: "Campaign list successfully.",
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