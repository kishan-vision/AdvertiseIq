const {
  cronGetAccessToken,
  cronCheckCustomerPermission,
  getProfile,
  checkPermission,
  getAccessToken
} = require("../helper/common");
const adGroupsSchema = require("../models/adGroups.model");
const profileSchema = require("../models/profiles.model");
const moment = require("moment-timezone");
const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const axios = require("axios");
const { write_logs } = require("../../winston/adGroups/logger");
const { Worker } = require("worker_threads");
const cronJobSchema = require("../models/cronJob.model");
const customerSchema = require("../models/customer.model");

exports.cronListAdGroupsFromAmazon = async (req, res) => {
  write_logs({
    message: `US Time = ${moment()
      .tz("America/Los_Angeles")
      .format("HH:mm")} India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronListAdGroupsFromAmazon`,
    log_type: "info",
  });
  try {
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "AdGroups Listing",
      isActive: false,
    });
    if (getCronStatus) {
      return write_logs({
        message: `Your adGroup listing status is deactive.`,
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
          "AdGroups Listing"
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
            const sleepTime = 2;
            const worker = new Worker(path.resolve(__dirname, '../workers/adGroupWorker.js'), {
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
                const getCustomerPackage = await customerSchema
                  .findById(profile.customerId)
                  .populate("packageId");
                let adGroups = [];
                if (
                  getCustomerPackage.packageId.campaignTypes.includes(
                    "Sponsored Products"
                  )
                ) {
                  const spAdGroups = await getSPAdGroups(
                    profile.customerId,
                    profile.profileId,
                    checkConfigAds,
                    profile.currencyCode,
                    profile.timezone,
                    currentDate
                  );
                  adGroups = adGroups.concat(spAdGroups);
                }
                if (adGroups.length > 0) {
                  await Promise.all(
                    adGroups.map(async (item) => {
                      const getAdGroups = await adGroupsSchema.findOne({
                        customerId: item.customerId,
                        profileId: item.profileId,
                        campaignId: item.campaignId,
                        adGroupId: item.adGroupId,
                        reportDate: item.reportDate,
                      });
                      if (!getAdGroups) {
                        let createAdGroups = new adGroupsSchema(item);
                        await createAdGroups.save();
                      } else {
                        await adGroupsSchema.findByIdAndUpdate(
                          { _id: getAdGroups._id },
                          item,
                          { new: true }
                        );
                      }
                    })
                  );
                }
                const totalRecords = await adGroupsSchema.count({
                  profileId: profile.profileId,
                  reportDate: currentDate,
                });
                const createCronHistory = new cronJobHistorySchema({
                  customerId: profile.customerId,
                  profileId: profile.profileId,
                  cronName: "AdGroups Listing",
                  status: "COMPLETED",
                  historyDate: currentDate,
                });
                await createCronHistory.save();
                write_logs({
                  message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId}, Total ${totalRecords} Adgroup listed successfully.`,
                  log_type: "info",
                });
              }
              resolve(data);
            });
            worker.on("error", (error) => {
              write_logs({
                message: `Customer ID: ${profile.customerId} Profile ID: ${profile.profileId
                  } Worker error in adgroup listing => ${JSON.stringify(error)}`,
                log_type: "error",
              });
              resolve("ERROR");
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                write_logs({
                  message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId} Worker stopped with exit code in adgroup listing ${code}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            });
          });
        } else {
          return write_logs({
            message: `Account disconnected in adgroup listing ${profile.customerId
              }, ${JSON.stringify(checkConfigAds)}`,
            log_type: "info",
          });
        }
      })
    );
    await Promise.all(workerPromises);
    return write_logs({
      message: "AdGroups listing successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Main try catch error: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

async function getSPAdGroups(
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
      includeExtendedDataFields: true,
    };
    const spOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/sp/adGroups/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.clientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spAdGroup.v3+json",
        "Content-Type": "application/vnd.spAdGroup.v3+json",
      },
    };
    const adGroups = [];
    let nextToken = "";
    function makeRequest() {
      if (nextToken) {
        bodyData.nextToken = nextToken;
      }
      spOptions.data = bodyData;
      axios(spOptions).then((response) => {
        if (response.status === 200) {
          const body = response.data;
          if (body.adGroups.length > 0) {
            body.adGroups.forEach((item) => {
              let obj = {
                customerId,
                profileId,
                adGroupId: item.adGroupId,
                campaignId: item.campaignId,
                name: item.name,
                currencyCode,
                status: item.state.toUpperCase(),
                timezone,
                defaultBid: item.defaultBid,
                type: "Sponsored Products",
                reportDate,
              };
              adGroups.push(obj);
            });
            const totalResults = body.totalResults;
            nextToken = body.nextToken;
            if (adGroups.length < totalResults && nextToken) {
              makeRequest();
            } else {
              resolve(adGroups);
            }
          }
          else {
            resolve(adGroups);
          }
        }
        else {
          write_logs({
            message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Adgroup listing err: ${JSON.stringify(
              response.data
            )}`,
            log_type: "error",
          });
          resolve(adGroups);
        }
      }).catch((error) => {
        write_logs({
          message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Adgroup listing err: ${JSON.stringify(
            error
          )}`,
          log_type: "error",
        });
        resolve(adGroups);
      })
    }
    makeRequest();
  });
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
      cronName: "AdGroup Report",
      isActive: false,
    });
    if (getCronStatus) {
      return write_logs({
        message: `Your adGroup report status is deactive.`,
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
          "AdGroup Report"
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
            const worker = new Worker(path.resolve(__dirname, '../workers/adGroupWorker.js'), {
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
                      profile.timezone,
                      startDate,
                      endDate,
                      checkConfigAds,
                      profile.customerId
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
                      cronName: "AdGroup Report",
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
                          cronName: "AdGroup Report",
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
                      cronName: "AdGroup Report",
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
                message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId
                  } Worker error in report => ${JSON.stringify(error)}`,
                log_type: "error",
              });
              resolve("ERROR");
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                write_logs({
                  message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId} Worker stopped with exit code in report ${code}`,
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
      message: "Adgroup report generated successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Adgroup report err: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

async function spGenerateReport(
  profileId,
  timezone,
  startDate,
  endDate,
  checkConfigAds,
  customerId
) {
  return new Promise(async (resolve, reject) => {
    const getAccount = await getProfile(customerId, profileId);
    const bodyData = {
      name: "",
      startDate,
      endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign", "adGroup"],
        columns: [
          "campaignId",
          "adGroupId",
          "adGroupName",
          "adStatus",
          "impressions",
          "clicks",
          "cost",
          "purchases1d",
          "purchases7d",
          "purchases14d",
          "purchases30d",
          "date",
          "sales1d",
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
      data: bodyData,
    };
    try {
      const getReportData = await reportsSchema.findOne({
        startDate,
        endDate,
        profileId,
        customerId,
        reportTypeId: "spCampaigns",
        reportName: "AD_GROUPS",
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
          (timeDifferenceMinutes >= 10 || timeDifferenceMinutes < 0)
        ) {
          axios(reportPOSTOptions).then(async (response) => {
            if (response.status == 200) {
              const body = response.data;
              if (body.reportId && body.message != "Unauthorized") {
                await reportsSchema.findByIdAndUpdate(getReportData._id, {
                  $set: {
                    reportId: body.reportId,
                    status: body.status,
                  },
                });
                resolve(body.status);
              }
              else {
                write_logs({
                  message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err token expire: ${JSON.stringify(
                    body
                  )}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            }
            else {
              write_logs({
                message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report amazon err: ${JSON.stringify(
                  response.data
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          }).catch((error) => {
            write_logs({
              message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Report err: ${JSON.stringify(
                error
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          });
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

          axios(reportIdOptions).then(async (response) => {
            if (response.status === 200) {
              const body = response.data;
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
                const zipFilePath = path.resolve(__dirname, '../../uploads/ad-groups/sp-report', `${getReportData.endDate}-${getReportData.reportId}.zip`);
                const extractionPath = path.resolve(__dirname, '../../uploads/ad-groups/sp-report', `${getReportData.endDate}-${getReportData.reportId}.json`);

                const file = fs.createWriteStream(zipFilePath);
                try {
                  const fileResponse = await axios({
                    method: 'get',
                    url: body.url,
                    responseType: 'stream'
                  });

                  fileResponse.data.pipe(file);

                  file.on("error", (error) => {
                    write_logs({
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
                          write_logs({
                            message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Report zip err: ${unzipError}`,
                            log_type: "error",
                          });
                          resolve("ERROR");
                        }
                        const data = require(extractionPath);
                        await Promise.all(
                          data.map(async (item) => {
                            await adGroupsSchema.updateOne(
                              {
                                customerId,
                                profileId,
                                campaignId: item.campaignId,
                                adGroupId: item.adGroupId,
                                reportDate: startDate,
                              },
                              {
                                $set: {
                                  status: item.adStatus.toUpperCase(),
                                  spend: item.cost ? item.cost : 0,
                                  sales: item.sales7d ? item.sales7d : 0,
                                  impressions: item.impressions,
                                  clicks: item.clicks,
                                  orders: item.purchases7d,
                                  roas:
                                    item.sales7d != 0 && item.cost != 0
                                      ? (item.sales7d / item.cost).toFixed(2)
                                      : 0,
                                  acos:
                                    !isNaN(item.sales7d) &&
                                      !isNaN(item.cost) &&
                                      item.sales7d != 0 &&
                                      item.cost != 0
                                      ? (
                                        (item.cost / item.sales7d) *
                                        100
                                      ).toFixed(2)
                                      : 0,
                                },
                              }
                            );
                          })
                        );
                        resolve(body.status);
                      }
                    );
                  });
                } catch (error) {
                  write_logs({
                    message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Report err: ${JSON.stringify(
                      error
                    )}`,
                    log_type: "error",
                  });
                  resolve("ERROR");
                }
              }
            }
            else {
              write_logs({
                message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
                  response.data
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          }).catch((error) => {
            write_logs({
              message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
                error
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          })
        }
      } else {
        axios(reportPOSTOptions).then(async (response) => {
          if (response.status == 200) {
            const body = response.data;
            let create = {
              adProduct: body.configuration.adProduct,
              reportTypeId: body.configuration.reportTypeId,
              startDate: body.startDate,
              endDate: body.endDate,
              reportId: body.reportId,
              status: body.status,
              profileId,
              customerId,
              reportName: "AD_GROUPS",
            };
            let createReport = new reportsSchema(create);
            await createReport.save();
            resolve(body.status);
          }
          else {
            write_logs({
              message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
                body
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          }
        }).catch((error) => {
          write_logs({
            message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
              error
            )}`,
            log_type: "error",
          });
          resolve("ERROR");
        })
      }
    } catch (error) {
      write_logs({
        message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
          error
        )}`,
        log_type: "error",
      });
      resolve("ERROR");
    }
  });
};

exports.createAdGroup = async (req, res) => {
  const type = req.body.type;
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Ad Groups",
      "Create",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    if (type == "Sponsored Products") {
      await createSPAdGroup(req, res);
    } else if (type == "Sponsored Brands") {
      await createSBAdGroup(req, res);
    } else if (type == "Sponsored Display") {
      await createSDAdGroup(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type is required!",
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

async function createSPAdGroup(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, defaultBid, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getCampaign = await adGroupsSchema.findOne({
      campaignId,
      profileId,
      customerId,
      name: nameRegex,
    });
    if (getCampaign) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          defaultBid,
          campaignId,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(customerId, res);
    const getProfile = await profileSchema.findOne({ customerId, profileId });
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sp/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spAdGroup.v3+json",
    //     "Content-Type": "application/vnd.spAdGroup.v3+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: error.message, error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       customerId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       adGroupId: responseBody.adGroup.success[0].adGroupId,
    //       campaignId: responseBody.adGroup.success[0].adGroup.campaignId,
    //       name: responseBody.adGroup.success[0].adGroup.name,
    //       status: responseBody.adGroup.success[0].adGroup.state,
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       defaultBid: responseBody.adGroup.success[0].adGroup.defaultBid,
    //       timezone: getProfile.timezone,
    //     };
    //     const createAdGroup = new adGroupsSchema(create);
    //     await createAdGroup.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored products adgroup created successfully.",
    //       createAdGroup,
    //     });
    //   }
    // });
    const create = {
      profileId,
      customerId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId: Math.floor(100000 + Math.random() * 900000),
      name,
      defaultBid,
      type: "Sponsored Products",
      reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
      status: state,
      timezone: getProfile.timezone,
    };
    const createAdGroup = new adGroupsSchema(create);
    await createAdGroup.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored products adgroup created successfully.",
      createAdGroup,
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

async function createSBAdGroup(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getCampaign = await adGroupsSchema.findOne({
      campaignId,
      customerId,
      profileId,
      name: nameRegex,
    });
    if (getCampaign) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          campaignId,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const getProfile = await profileSchema.findOne({ customerId, profileId });
    const checkConfigAds = await getAccessToken(customerId, res);
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sb/v4/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.sbadgroupresource.v4+json",
    //     "Content-Type": "application/vnd.sbadgroupresource.v4+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: error.message, error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       customerId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       adGroupId: responseBody.adGroup.success[0].adGroupId,
    //       campaignId: responseBody.adGroup.success[0].adGroup.campaignId,
    //       name: responseBody.adGroup.success[0].adGroup.name,
    //       status: responseBody.adGroup.success[0].adGroup.state,
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       defaultBid: "",
    //       timezone: getProfile.timezone,
    //     };
    //     const createAdGroup = new adGroupsSchema(create);
    //     await createAdGroup.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored brands adgroup created successfully.",
    //       createAdGroup,
    //     });
    //   }
    // });
    const create = {
      profileId,
      customerId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId: Math.floor(100000 + Math.random() * 900000),
      name,
      defaultBid: "",
      type: "Sponsored Brands",
      reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
      status: state,
      timezone: getProfile.timezone,
    };
    const createAdGroup = new adGroupsSchema(create);
    await createAdGroup.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored brands adgroup created successfully.",
      createAdGroup,
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

async function createSDAdGroup(req, res) {
  try {
    const customerId = req.customer._id;
    let {
      profileId,
      campaignId,
      defaultBid,
      state,
      name,
      bidOptimization,
      creativeType,
    } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getCampaign = await adGroupsSchema.findOne({
      campaignId,
      customerId,
      profileId,
      name: nameRegex,
    });
    if (getCampaign) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = [
      {
        name,
        state: state.toLowerCase(),
        defaultBid,
        campaignId,
        bidOptimization,
        creativeType,
      },
    ];
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const getProfile = await profileSchema.findOne({ customerId, profileId });
    const checkConfigAds = await getAccessToken(customerId, res);
    const costType = bidOptimization == "reach" ? "vcpm" : "cpc";
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sd/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: error.message, error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    //     const costType = bidOptimization == "reach" ? "vcpm" : "cpc";
    //     const create = {
    //       profileId,
    //       customerId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       adGroupId: responseBody[0].adGroupId,
    //       campaignId,
    //       name,
    //       status: state.toUpperCase(),
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       defaultBid,
    //       costType: costType ? costType : "cpc",
    //       bidOptimization: bidOptimization ? bidOptimization : "clicks",
    //       creativeType: creativeType ? creativeType : null,
    //       timezone: getProfile.timezone,
    //     };
    //     const createAdGroup = new adGroupsSchema(create);
    //     await createAdGroup.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored display adgroup created successfully.",
    //       createAdGroup,
    //     });
    //   }
    // });
    const create = {
      profileId,
      customerId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId: Math.floor(100000 + Math.random() * 900000),
      name,
      defaultBid,
      type: "Sponsored Display",
      status: state,
      costType: costType ? costType : "cpc",
      bidOptimization: bidOptimization ? bidOptimization : "clicks",
      creativeType: creativeType ? creativeType : null,
      timezone: getProfile.timezone,
    };
    const createAdGroup = new adGroupsSchema(create);
    await createAdGroup.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored display adgroup created successfully.",
      createAdGroup,
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.updateAdGroup = async (req, res) => {
  const type = req.body.type;
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Ad Groups",
      "Update",
      true
    );
    if (!permissionResult.hasPermission) {
      return res.status(203).send({
        isSuccess: false,
        message: permissionResult.message,
      });
    }
    if (type == "Sponsored Products") {
      await updateSPAdGroup(req, res);
    } else if (type == "Sponsored Brands") {
      await updateSBAdGroup(req, res);
    } else if (type == "Sponsored Display") {
      await updateSDAdGroup(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type is required!",
      });
    }
  } catch (error) {
    return res
      .status(203)
      .send({ isSuccess: false, message: error.message, error });
  }
};

async function updateSPAdGroup(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, defaultBid, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({
      adGroupId: { $ne: req.params.id },
      name: nameRegex,
      customerId,
      profileId,
      campaignId,
    });
    if (getAdGroup) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          adGroupId: req.params.id,
          defaultBid,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(customerId, res);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sp/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spAdGroup.v3+json",
    //     "Content-Type": "application/vnd.spAdGroup.v3+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: error.message, error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    // const latestData = await adGroupsSchema
    // .findOne({ adGroupId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await adGroupsSchema
    //       .findOneAndUpdate(
    //         { adGroupId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           name,
    //           status: state,
    //           defaultBid,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((adGroup) => {
    //         return res.status(200).send({
    //           data: adGroup,
    //           message: `AdGroups data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
    //         return res.status(203).send({
    //           error: error.message,
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      name,
      status: state,
      defaultBid,
    };
    const latestData = await adGroupsSchema
      .findOne({ customerId, adGroupId: req.params.id })
      .sort({ reportDate: -1 });
    await adGroupsSchema
      .findOneAndUpdate(
        {
          customerId,
          adGroupId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        {
          new: true,
        }
      )
      .then((adGroup) => {
        if (!adGroup) {
          return res.status(203).send({
            message: `Adgroup not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: adGroup,
          message: `Adgroup data updated successfully.`,
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

async function updateSBAdGroup(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({
      adGroupId: { $ne: req.params.id },
      name: nameRegex,
      customerId,
      profileId,
      campaignId,
    });
    if (getAdGroup) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = {
      adGroups: [
        {
          name,
          state,
          adGroupId: req.params.id,
        },
      ],
    };
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(customerId, res);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sb/v4/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.sbadgroupresource.v4+json",
    //     "Content-Type": "application/vnd.sbadgroupresource.v4+json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: error.message, error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    // const latestData = await adGroupsSchema
    // .findOne({ adGroupId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await adGroupsSchema
    //       .findOneAndUpdate(
    //         { adGroupId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           name,
    //           status: state,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((adGroup) => {
    //         return res.status(200).send({
    //           data: adGroup,
    //           message: `AdGroups data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
    //         return res.status(203).send({
    //           error: error.message,
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      name,
      status: state,
    };
    const latestData = await adGroupsSchema
      .findOne({ customerId, adGroupId: req.params.id })
      .sort({ reportDate: -1 });
    await adGroupsSchema
      .findOneAndUpdate(
        {
          customerId,
          adGroupId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        { new: true }
      )
      .then((adGroup) => {
        if (!adGroup) {
          return res.status(203).send({
            message: `Adgroup not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: adGroup,
          message: `Adgroup data updated successfully.`,
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

async function updateSDAdGroup(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, defaultBid, state, name } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getAdGroup = await adGroupsSchema.findOne({
      adGroupId: { $ne: req.params.id },
      name: nameRegex,
      customerId,
      profileId,
      campaignId,
    });
    if (getAdGroup) {
      return res.status(203).send({
        message: "Adgroup name with the specified campaign already exists!",
        isSuccess: false,
      });
    }
    const bodyData = [
      {
        name,
        state: state.toLowerCase(),
        adGroupId: req.params.id,
        defaultBid,
      },
    ];
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(customerId, res);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sd/adGroups`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(bodyData),
    // };
    // request(reportPOSTOptions, async (error, response, responseBody) => {
    //   if (error) {
    //     return res
    //       .status(203)
    //       .send({ isSuccess: false, message: error.message, error });
    //   }
    //   responseBody = JSON.parse(responseBody);
    //   if (responseBody.message) {
    //     return res.status(203).send({ isSuccess: false, error: responseBody });
    //   } else {
    //     if (responseBody.adGroups.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Adgroup with the specified name already exists.",
    //         error: responseBody.adGroups.error,
    //       });
    //     }
    // const latestData = await adGroupsSchema
    // .findOne({ adGroupId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await adGroupsSchema
    //       .findOneAndUpdate(
    //         { adGroupId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           name,
    //           status: state.toUpperCase(),
    //           defaultBid,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((adGroup) => {
    //         return res.status(200).send({
    //           data: adGroup,
    //           message: `AdGroups data updated successfully.`,
    //           isSuccess: true,
    //         });
    //       })
    //       .catch((error) => {
    //         return res.status(203).send({
    //           error: error.message,
    //           message: "Something went wrong, please try again!",
    //           isSuccess: false,
    //         });
    //       });
    //   }
    // });
    const updateData = {
      name,
      status: state,
      defaultBid,
    };
    const latestData = await adGroupsSchema
      .findOne({ customerId, adGroupId: req.params.id })
      .sort({ reportDate: -1 });
    await adGroupsSchema
      .findOneAndUpdate(
        {
          customerId,
          adGroupId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        { new: true }
      )
      .then((adGroup) => {
        if (!adGroup) {
          return res.status(203).send({
            message: `Adgroup not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: adGroup,
          message: `Adgroup data updated successfully.`,
          isSuccess: true,
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

exports.listAdGroups = async (req, res) => {
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Ad Groups",
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
      pageNo,
      perPage,
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
        .send({ isSuccess: false, message: "Profile id required!" });
    }
    pageNo = pageNo ? pageNo : 1;
    perPage = perPage ? perPage : 10;
    const getProfile = await profileSchema.findOne({ profileId });
    let filter = {
      customerId,
      profileId: Number(profileId),
    };
    if (type) {
      filter.type = type;
    }
    if (status) {
      filter.status = status;
    }
    if (fromDate && toDate) {
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    } else {
      fromDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
      toDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
      filter.reportDate = { $gte: fromDate, $lte: toDate };
    }
    if (searchName) {
      filter.name = { $regex: new RegExp(RegExp.escape(searchName), "i") };
    }
    const getAdGroups = [
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
            adGroupId: "$adGroupId",
          },
          adGroup: {
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
        $lookup: {
          from: "campaigns",
          localField: "adGroup.campaignId",
          foreignField: "campaignId",
          as: "campaign",
        },
      },
      {
        $addFields: {
          campaignName: {
            $arrayElemAt: [
              {
                $slice: ["$campaign.name", -1],
              },
              0,
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          adGroupId: "$_id.adGroupId",
          type: "$adGroup.type",
          campaignId: "$adGroup.campaignId",
          campaignName: 1,
          name: "$adGroup.name",
          createdAt: "$adGroup.createdAt",
          updatedAt: "$adGroup.updatedAt",
          defaultBid: "$adGroup.defaultBid",
          status: "$adGroup.status",
          bidOptimization: "$adGroup.bidOptimization",
          creativeType: "$adGroup.creativeType",
          costType: "$adGroup.costType",
          clicks: 1,
          cpc: {
            $round: ["$cpc", 2],
          },
          impressions: 1,
          sales: { $round: ["$sales", 2] },
          spend: { $round: ["$spend", 2] },
          orders: 1,
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
    if (sortType === "ASC") {
      getAdGroups.push({ $sort: { [fieldName]: 1 } });
    } else if (sortType === "DESC") {
      getAdGroups.push({ $sort: { [fieldName]: -1 } });
    }
    const adGroupsResult = await adGroupsSchema.aggregate(getAdGroups);
    let getAdGroupsData = adGroupsResult;

    if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
      getAdGroupsData = getAdGroupsData.filter((item) => {
        let fieldConditionMet = false;
        let extraFieldConditionMet = false;

        switch (fieldOperator) {
          case "GREATER_THAN":
            fieldConditionMet = item[fieldName] > fieldValue;
            break;
          case "GREATER_THAN_OR_EQUAL_TO":
            fieldConditionMet = item[fieldName] >= fieldValue;
            break;
          case "LESS_THAN":
            fieldConditionMet = item[fieldName] < fieldValue;
            break;
          case "LESS_THAN_OR_EQUAL_TO":
            fieldConditionMet = item[fieldName] <= fieldValue;
            break;
          case "EQUAL_TO":
            fieldConditionMet = item[fieldName] === fieldValue;
            break;
          default:
            fieldConditionMet = true;
            break;
        }

        switch (extraFieldOperator) {
          case "GREATER_THAN":
            extraFieldConditionMet = item[fieldName] > extraFieldValue;
            break;
          case "GREATER_THAN_OR_EQUAL_TO":
            extraFieldConditionMet = item[fieldName] >= extraFieldValue;
            break;
          case "LESS_THAN":
            extraFieldConditionMet = item[fieldName] < extraFieldValue;
            break;
          case "LESS_THAN_OR_EQUAL_TO":
            extraFieldConditionMet = item[fieldName] <= extraFieldValue;
            break;
          case "EQUAL_TO":
            extraFieldConditionMet = item[fieldName] === extraFieldValue;
            break;
          default:
            extraFieldConditionMet = true;
            break;
        }

        if (conditions === "AND") {
          return fieldConditionMet && extraFieldConditionMet;
        } else if (conditions === "OR") {
          return fieldConditionMet || extraFieldConditionMet;
        } else {
          return true;
        }
      });
    } else if (fieldOperator !== undefined && fieldValue !== undefined) {
      // Handle single condition
      getAdGroupsData = getAdGroupsData.filter((item) => {
        let fieldConditionMet = false;

        switch (fieldOperator) {
          case "GREATER_THAN":
            fieldConditionMet = item[fieldName] > fieldValue;
            break;
          case "GREATER_THAN_OR_EQUAL_TO":
            fieldConditionMet = item[fieldName] >= fieldValue;
            break;
          case "LESS_THAN":
            fieldConditionMet = item[fieldName] < fieldValue;
            break;
          case "LESS_THAN_OR_EQUAL_TO":
            fieldConditionMet = item[fieldName] <= fieldValue;
            break;
          case "EQUAL_TO":
            fieldConditionMet = item[fieldName] === fieldValue;
            break;
          default:
            fieldConditionMet = true;
            break;
        }

        return fieldConditionMet;
      });
    }
    const totalRecords = getAdGroupsData.length;
    const startIndex = (pageNo - 1) * perPage;
    const endIndex = pageNo * perPage;
    const paginatedData = getAdGroupsData.slice(startIndex, endIndex);
    return res.status(200).send({
      isSuccess: true,
      getAdGroups: paginatedData,
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

exports.listAdGroupNameBySortingAcos = async (req, res) => {
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
      return res
        .status(203)
        .send({ message: "Type is required!", isSuccess: false });
    }
    const adGroups = await adGroupsSchema.aggregate([
      {
        $match: {
          profileId,
          customerId: new ObjectId(customerId),
          type,
          status: {
            $in: ["ENABLED", "PAUSED", "ARCHIVED"],
          },
        },
      },
      {
        $group: {
          _id: "$name",
          name: { $first: "$name" },
          adGroupId: { $first: "$adGroupId" },
          type: { $first: "$type" },
          acos: { $first: "$acos" },
          spend: { $sum: "$spend" },
          sales: { $sum: "$sales" },
          impressions: { $sum: "$impressions" },
          cpc: { $sum: "$cpc" },
          clicks: { $sum: "$clicks" },
        },
      },
      {
        $project: {
          name: 1,
          adGroupId: 1,
          type: 1,
          acos: 1,
          _id: 0,
          clicks: 1,
          cpc: { $round: ["$cpc", 2] },
          impressions: 1,
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
        $sort: { acos: -1 },
      },
    ]);
    if (adGroups.length === 0) {
      return res.status(203).send({
        message: `AdGroup not found!`,
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: adGroups,
      totalRecords: adGroups.length,
      message: `AdGroup list successfully.`,
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

exports.listAdGroupName = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, campaignId } = req.body;
    if (!profileId) {
      return res.status(203).send({
        message: "ProfileId is required!",
        isSuccess: false,
      });
    }
    if (!campaignId) {
      return res
        .status(203)
        .send({ message: "CampaignId is required!", isSuccess: false });
    }
    const adGroups = await adGroupsSchema.aggregate([
      {
        $match: {
          profileId,
          customerId: new ObjectId(customerId),
          campaignId,
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
          _id: "$name",
          name: { $first: "$name" },
          campaignId: { $first: "$campaignId" },
          adGroupId: { $first: "$adGroupId" },
          type: { $first: "$type" },
        },
      },
      {
        $project: {
          name: 1,
          campaignId: 1,
          adGroupId: 1,
          type: 1,
          acos: 1,
          _id: 0,
        },
      },
    ]);
    if (adGroups.length === 0) {
      return res.status(203).send({
        message: `AdGroup not found!`,
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: adGroups,
      totalRecords: adGroups.length,
      message: `AdGroup list successfully.`,
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

RegExp.escape = function (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

exports.manualListAdGroupsFromAmazon = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "AdGroups Listing",
      isActive: false,
    });
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your adGroup listing status is deactive.`,
        isSuccess: false,
      });
    }
    if (!profileId || !cronId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile id and cron id required!",
      });
    }
    const getCron = await cronJobSchema.findById(cronId);
    if (!getCron) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Cron id not found!" });
    }
    if (!(getCron.cronName == "AdGroups Listing")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfileId = await profileSchema.find({
      profileId,
      customerId,
      isActive: true,
    });
    let reportDate = "";
    await Promise.all(
      getProfileId.map(async (i) => {
        const checkConfigAds = await cronGetAccessToken(i.customerId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          reportDate = moment().tz(i.timezone).format("YYYY-MM-DD");
          const getCronData = await cronJobHistorySchema.findOne({
            customerId: i.customerId,
            profileId: i.profileId,
            cronName: "AdGroups Listing",
            status: "PENDING",
            historyDate: reportDate,
          });
          if (!getCronData) {
            const createCronHistory = new cronJobHistorySchema({
              customerId: i.customerId,
              profileId: i.profileId,
              cronName: "AdGroups Listing",
              status: "PENDING",
              historyDate: reportDate,
            });
            await createCronHistory.save();
          }
          const getCustomerPackage = await customerSchema
            .findById(i.customerId)
            .populate("packageId");
          let adGroups = [];
          if (
            getCustomerPackage.packageId.campaignTypes.includes(
              "Sponsored Products"
            )
          ) {
            const spAdGroups = await getSPAdGroups(
              i.customerId,
              i.profileId,
              checkConfigAds,
              i.currencyCode,
              i.timezone,
              reportDate
            );
            adGroups = adGroups.concat(spAdGroups);
          }
          if (adGroups.length > 0) {
            await Promise.all(
              adGroups.map(async (item) => {
                const getAdGroups = await adGroupsSchema.findOne({
                  customerId: item.customerId,
                  profileId: item.profileId,
                  campaignId: item.campaignId,
                  adGroupId: item.adGroupId,
                  reportDate,
                });
                if (!getAdGroups) {
                  let createAdGroups = new adGroupsSchema(item);
                  await createAdGroups.save();
                } else {
                  await adGroupsSchema.findByIdAndUpdate(
                    { _id: getAdGroups._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        } else {
          return res.status(203).send({
            isSuccess: false,
            message: `Account disconnected in adgroup listing.`,
          });
        }
      })
    );
    const getUpdateCronData = await cronJobHistorySchema.findOne({
      customerId: customerId,
      profileId: profileId,
      cronName: "AdGroups Listing",
      status: "PENDING",
      historyDate: reportDate,
    });
    if (getUpdateCronData) {
      await cronJobHistorySchema.findByIdAndUpdate(
        { _id: getUpdateCronData._id },
        {
          status: "COMPLETED",
        },
        { new: true }
      );
    }
    return res.status(200).send({
      isSuccess: true,
      message: "AdGroups listing successfully.",
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.manualGenerateReport = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "AdGroup Report",
      isActive: false,
    });
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your adGroup report status is deactive.`,
        isSuccess: false,
      });
    }
    if (!profileId || !cronId) {
      return res.status(203).send({
        isSuccess: false,
        message: "Profile id and cron id required!",
      });
    }
    const getCron = await cronJobSchema.findById(cronId);
    if (!getCron) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Cron id not found!" });
    }
    if (!(getCron.cronName == "AdGroup Report")) {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Enter correct cron id." });
    }
    const getProfile = await profileSchema.findOne({
      profileId,
      customerId,
      isActive: true,
    });
    const startDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    const endDate = moment().tz(getProfile.timezone).format("YYYY-MM-DD");
    const checkConfigAds = await cronGetAccessToken(getProfile.customerId);
    if (checkConfigAds && checkConfigAds.adsAccessToken) {
      const getCronData = await cronJobHistorySchema.findOne({
        customerId: getProfile.customerId,
        profileId: getProfile.profileId,
        cronName: "AdGroup Report",
        status: "PENDING",
        historyDate: startDate,
      });
      if (!getCronData) {
        const createCronHistory = new cronJobHistorySchema({
          customerId: getProfile.customerId,
          profileId: getProfile.profileId,
          cronName: "AdGroup Report",
          status: "PENDING",
          historyDate: startDate,
        });
        await createCronHistory.save();
      }
      let responseSPStatus = "PENDING";
      while (
        responseSPStatus != "COMPLETED"
      ) {
        if (responseSPStatus != "COMPLETED" && responseSPStatus != "ERROR") {
          const reportSpResponse = await spGenerateReport(
            getProfile.profileId,
            getProfile.timezone,
            startDate,
            endDate,
            checkConfigAds,
            getProfile.customerId
          );
          console.log("SP", reportSpResponse);
          responseSPStatus = reportSpResponse;
        }
        if (
          responseSPStatus != "COMPLETED"
        ) {
          if (
            responseSPStatus != "ERROR"
          ) {
            await new Promise((resolve) => setTimeout(resolve, 60000));
          }
        }
      }
      const getUpdateCronData = await cronJobHistorySchema.findOne({
        customerId: customerId,
        profileId: profileId,
        cronName: "AdGroup Report",
        status: "PENDING",
        historyDate: startDate,
      });
      if (getUpdateCronData) {
        await cronJobHistorySchema.findByIdAndUpdate(
          { _id: getUpdateCronData._id },
          {
            status: "COMPLETED",
          },
          { new: true }
        );
      }
      return res.status(200).send({
        message: "Ad Group Report updated successfully..",
        isSuccess: true,
      });
    } else {
      return res.status(203).send({
        message: `Account disconnected in adgroup report.`,
        isSuccess: false,
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