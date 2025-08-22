const {
  cronGetAccessToken,
  cronCheckCustomerPermission,
  getProfile,
  checkPermission,
  getAccessToken,
} = require("../helper/common");
const keywordSchema = require("../models/keyword.model");
const profileSchema = require("../models/profiles.model");
const reportsSchema = require("../models/report.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const axios = require("axios");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const moment = require("moment-timezone");
const { write_logs } = require("../../winston/keywords/logger");
const { Worker } = require("worker_threads");
const cronJobSchema = require("../models/cronJob.model");
const customerSchema = require("../models/customer.model");
const keywordSearchHistorySchema = require("../models/keywordSearchHistory.model");

exports.cronListKeywordsFromAmazon = async (req, res) => {
  write_logs({
    message: `US Time = ${moment()
      .tz("America/Los_Angeles")
      .format("HH:mm")} India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronListKeywordsFromAmazon`,
    log_type: "info",
  });
  try {
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Keywords Listing",
      isActive: false,
    });
    if (getCronStatus) {
      return write_logs({
        message: `Your keyword listing status is deactive.`,
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
          "Keywords Listing"
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
            const sleepTime = 15;
            const worker = new Worker(path.resolve(__dirname, '../workers/keywordWorker.js'), {
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
                let keywords = [];
                if (
                  getCustomerPackage.packageId.campaignTypes.includes(
                    "Sponsored Products"
                  )
                ) {
                  const spKeywords = await getSPkeywords(
                    profile.customerId,
                    profile.profileId,
                    checkConfigAds,
                    profile.currencyCode,
                    profile.timezone,
                    currentDate
                  );
                  const spTargets = await getSPtargets(
                    profile.customerId,
                    profile.profileId,
                    checkConfigAds,
                    profile.currencyCode,
                    profile.timezone,
                    currentDate
                  );
                  keywords = keywords.concat(spKeywords, spTargets);
                }
                if (keywords.length > 0) {
                  await Promise.all(
                    keywords.map(async (item) => {
                      const getkeyword = await keywordSchema.findOne({
                        customerId: item.customerId,
                        profileId: item.profileId,
                        keywordId: item.keywordId,
                        campaignId: item.campaignId,
                        adGroupId: item.adGroupId,
                        reportDate: item.reportDate,
                      });
                      if (!getkeyword) {
                        let createkeywords = new keywordSchema(item);
                        await createkeywords.save();
                      } else {
                        await keywordSchema.findByIdAndUpdate(
                          { _id: getkeyword._id },
                          item,
                          { new: true }
                        );
                      }
                    })
                  );
                }
                const totalRecords = await keywordSchema.count({
                  profileId: profile.profileId,
                  reportDate: currentDate,
                });
                const createCronHistory = new cronJobHistorySchema({
                  customerId: profile.customerId,
                  profileId: profile.profileId,
                  cronName: "Keywords Listing",
                  status: "COMPLETED",
                  historyDate: currentDate,
                });
                await createCronHistory.save();
                write_logs({
                  message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId}, Total ${totalRecords} Keywords listed successfully.`,
                  log_type: "info",
                });
              }
              resolve(data);
            });
            worker.on("error", (error) => {
              write_logs({
                message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId
                  } Worker error in keywords listing => ${JSON.stringify(error)}`,
                log_type: "error",
              });
              resolve("ERROR");
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                write_logs({
                  message: `Customer ID: ${profile.customerId}, Profile ID: ${profile.profileId} Worker stopped with exit code in keywords listing ${code}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            });
          });
        } else {
          return write_logs({
            message: `Account disconnected in keywords listing ${profile.customerId
              }, ${JSON.stringify(checkConfigAds)}`,
            log_type: "info",
          });
        }
      })
    );
    await Promise.all(workerPromises);
    return write_logs({
      message: "Keywords listing successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Keywords listing err: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

async function getSPkeywords(
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
      url: `${getAccount.amazonUrl}/sp/keywords/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.clientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.spKeyword.v3+json",
        "Content-Type": "application/vnd.spKeyword.v3+json",
      },
    };
    const keywords = [];
    let nextToken = "";
    function makeRequest() {
      if (nextToken) {
        bodyData.nextToken = nextToken;
      }
      spOptions.data = bodyData;

      axios(spOptions).then((response) => {
        const body = response.data;
        if (body.keywords && body.keywords.length > 0) {
          body.keywords.forEach((item) => {
            let obj = {
              customerId,
              profileId,
              adGroupId: item.adGroupId,
              campaignId: item.campaignId,
              keywordId: item.keywordId,
              name: item.keywordText,
              currencyCode,
              status: item.state.toUpperCase(),
              matchType: item.matchType,
              timezone,
              type: "Sponsored Products",
              bid: item.bid ? item.bid : 0,
              reportDate,
            };
            keywords.push(obj);
          });

          const totalResults = body.totalResults;
          nextToken = body.nextToken;
          if (keywords.length < totalResults && nextToken) {
            makeRequest();
          } else {
            resolve(keywords);
          }
        } else {
          resolve(keywords);
        }
      }).catch((error) => {
        write_logs({
          message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Keywords listing err: ${JSON.stringify(
            error
          )}`,
          log_type: "error",
        });
        resolve(keywords);
      })
    }
    makeRequest();
  });
}

// Map expression types to friendly names
const expressionNameMap = {
  QUERY_BROAD_REL_MATCHES: "loose match",
  QUERY_HIGH_REL_MATCHES: "close match",
  ASIN_ACCESSORY_RELATED: "complements",
  ASIN_SUBSTITUTE_RELATED: "substitutes"
};

const asinTypeMap = {
  ASIN_CATEGORY_SAME_AS: "ASIN category",
  ASIN_BRAND_SAME_AS: "ASIN brand",
  ASIN_PRICE_LESS_THAN: "ASIN price less than",
  ASIN_PRICE_BETWEEN: "ASIN price between",
  ASIN_PRICE_GREATER_THAN: "ASIN price greater than",
  ASIN_REVIEW_RATING_LESS_THAN: "ASIN review rating less than",
  ASIN_REVIEW_RATING_BETWEEN: "ASIN review rating between",
  ASIN_REVIEW_RATING_GREATER_THAN: "ASIN review rating greater than",
  ASIN_AGE_RANGE_SAME_AS: "ASIN age range",
  ASIN_GENRE_SAME_AS: "ASIN genre",
  ASIN_IS_PRIME_SHIPPING_ELIGIBLE: "ASIN is prime shipping eligible",
  ASIN_SAME_AS: "ASIN"
};

async function getSPtargets(
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
      url: `${getAccount.amazonUrl}/sp/targets/list`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.clientId,
        "Amazon-Advertising-API-Scope": profileId,
        Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
        Accept: "application/vnd.sptargetingClause.v3+json",
        "Content-Type": "application/vnd.sptargetingClause.v3+json",
      },
    };
    const targets = [];
    let nextToken = "";
    function makeRequest() {
      if (nextToken) {
        bodyData.nextToken = nextToken;
      }
      spOptions.data = bodyData;
      axios(spOptions).then((response) => {
        const body = response.data;
        if (response.status === 200) {
          if (body.targetingClauses && body.targetingClauses.length > 0) {
            body.targetingClauses.forEach((item) => {
              const name = item?.expression.map(exp => {
                if (expressionNameMap[exp.type]) {
                  return expressionNameMap[exp.type];
                } else if (asinTypeMap[exp.type]) {
                  return asinTypeMap[exp.type];
                } else {
                  return exp.type;
                }
              }).join(",") || null;

              let obj = {
                customerId,
                profileId,
                adGroupId: item.adGroupId,
                campaignId: item.campaignId,
                keywordId: item.targetId,
                name: name,
                currencyCode,
                expressions: item?.expression,
                status: item.state.toUpperCase(),
                matchType: item.expressionType,
                timezone,
                type: "Sponsored Products",
                bid: item.bid ? item.bid : 0,
                reportDate,
              };
              targets.push(obj);
            });

            const totalResults = body.totalResults;
            nextToken = body.nextToken;
            if (targets.length < totalResults && nextToken) {
              makeRequest();
            } else {
              resolve(targets);
            }
          } else {
            resolve(targets);
          }
        }
        else {
          write_logs({
            message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Targets listing err: ${JSON.stringify(
              body
            )}`,
            log_type: "error",
          });
          resolve(targets);
        }
      }).catch((error) => {
        write_logs({
          message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Tragets listing err: ${JSON.stringify(
            error
          )}`,
          log_type: "error",
        });
        resolve(targets);
      })
    }
    makeRequest();
  });
}

exports.generateReport = async (req, res) => {
  try {
    const getProfileId = await profileSchema.find({ isActive: true });
    await Promise.all(
      getProfileId.map(async (i) => {
        const startDate = moment().tz(i.timezone).format("YYYY-MM-DD");
        const endDate = moment().tz(i.timezone).format("YYYY-MM-DD");
        const checkConfigAds = await cronGetAccessToken(i.customerId);
        if (checkConfigAds && checkConfigAds.adsAccessToken) {
          const reportSpResponse = await spGenerateReport(
            i.profileId,
            i.timezone,
            startDate,
            endDate,
            checkConfigAds,
            i.customerId
          );
          console.log("SP", reportSpResponse);
        }
      })
    );
    return res.status(200).send({
      message: "Keywords Report updated successfully..",
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
      cronName: "Keyword Report",
      isActive: false,
    });
    if (getCronStatus) {
      return write_logs({
        message: `Your keyword report status is deactive.`,
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
          "Keyword Report"
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
            const worker = new Worker(path.resolve(__dirname, '../workers/keywordWorker.js'), {
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
                      cronName: "Keyword Report",
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
                          cronName: "Keyword Report",
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
                      cronName: "Keyword Report",
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
      message: "Keywords report generated successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Keywords report err: ${JSON.stringify(error)}`,
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
        groupBy: ["targeting"],
        columns: [
          "campaignId",
          "adGroupId",
          "keywordId",
          "keyword",
          "adKeywordStatus",
          "keywordBid",
          "targeting",
          "keywordType",
          "matchType",
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
        reportTypeId: "spTargeting",
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
        reportTypeId: "spTargeting",
        reportName: "KEYWORDS",
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
          try {
            const response = await axios(reportPOSTOptions);
            if (response.status === 200) {
              const body = response.data;
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
                message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
                  response.data
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          } catch (error) {
            write_logs({
              message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP Report err: ${JSON.stringify(
                error
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
                const zipFilePath = path.resolve(__dirname, '../../uploads/keywords/sp-report', `${getReportData.endDate}-${getReportData.reportId}.zip`);
                const extractionPath = path.resolve(__dirname, '../../uploads/keywords/sp-report', `${getReportData.endDate}-${getReportData.reportId}.json`);

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
                            await keywordSchema.updateOne(
                              {
                                customerId,
                                profileId,
                                campaignId: item.campaignId,
                                adGroupId: item.adGroupId,
                                keywordId: item.keywordId,
                                reportDate: startDate,
                              },
                              {
                                $set: {
                                  name: item.keyword,
                                  status: item.adKeywordStatus.toUpperCase(),
                                  bid: item.keywordBid,
                                  matchType: item.matchType,
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
              write_logs({
                message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
                  response.data
                )
                  }`,
                log_type: "error",
              });
              resolve("ERROR");
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
        }
      }
      else {
        try {
          const response = await axios(reportPOSTOptions);
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
              reportName: "KEYWORDS",
            };
            let createReport = new reportsSchema(create);
            await createReport.save();
            resolve(body.status);
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
        } catch (error) {
          console.log(error, "error")
          write_logs({
            message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
              error
            )}`,
            log_type: "error",
          });
          resolve("ERROR");
        }
      }
    } catch (error) {
      write_logs({
        message: `Customer ID: ${customerId}, Profile ID: ${profileId} SP report err: ${JSON.stringify(
          error
        )
          }`,
        log_type: "error",
      });
      resolve("ERROR");
    }
  });
}

exports.listKeywords = async (req, res) => {
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Keywords",
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
        .send({ isSuccess: false, message: "Profile id required." });
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
    if (searchName) {
      filter.name = { $regex: new RegExp(RegExp.escape(searchName), "i") };
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
    const getKeywords = [
      {
        $match: filter,
      },
      // {
      //   $sort: {
      //     reportDate: -1,
      //   },
      // },
      {
        $group: {
          _id: {
            campaignId: "$campaignId",
            adGroupId: "$adGroupId",
            keywordId: "$keywordId",
            matchType: "$matchType",
          },
          keyword: {
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
          from: "ad_groups",
          localField: "keyword.adGroupId",
          foreignField: "adGroupId",
          as: "adGroup",
        },
      },
      {
        $lookup: {
          from: "campaigns",
          localField: "keyword.campaignId",
          foreignField: "campaignId",
          as: "campaign",
        },
      },
      {
        $addFields: {
          adGroupName: {
            $arrayElemAt: [
              {
                $slice: ["$adGroup.name", -1],
              },
              0,
            ],
          },
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
          keywordId: "$_id.keywordId",
          type: "$keyword.type",
          createdAt: "$keyword.createdAt",
          updatedAt: "$keyword.updatedAt",
          campaignId: "$_id.campaignId",
          campaignName: 1,
          adGroupName: 1,
          matchType: "$keyword.matchType",
          bid: "$keyword.bid",
          status: "$keyword.status",
          clicks: 1,
          orders: 1,
          name: "$keyword.name",
          cpc: {
            $round: ["$cpc", 2],
          },
          impressions: 1,
          sales: {
            $round: ["$sales", 2],
          },
          spend: {
            $round: ["$spend", 2],
          },
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
      getKeywords.push({ $sort: { [fieldName]: 1 } });
    } else if (sortType === "DESC") {
      getKeywords.push({ $sort: { [fieldName]: -1 } });
    }
    const keywordsResult = await keywordSchema.aggregate(getKeywords);
    let getKeywordsData = keywordsResult;
    if (conditions && extraFieldOperator && extraFieldValue !== undefined) {
      getKeywordsData = getKeywordsData.filter((item) => {
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
      getKeywordsData = getKeywordsData.filter((item) => {
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
    const uniqueAdGroupIds = new Set(
      getKeywordsData.map((item) => item.adGroupId)
    );
    const adGroupCount = uniqueAdGroupIds.size;
    const uniqueCampaignIds = new Set(
      getKeywordsData.map((item) => item.campaignId)
    );
    const campaignCount = uniqueCampaignIds.size;
    const totalRecords = getKeywordsData.length;
    const startIndex = (pageNo - 1) * perPage;
    const endIndex = pageNo * perPage;
    const paginatedData = getKeywordsData.slice(startIndex, endIndex);

    return res.status(200).send({
      isSuccess: true,
      getKeywords: paginatedData,
      currentPageNo: pageNo,
      adGroupCount,
      campaignCount,
      totalRecords: totalRecords,
      totalPages: Math.ceil(totalRecords / perPage),
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.createKeyword = async (req, res) => {
  const type = req.body.type;
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Keywords",
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
      await createSPKeyword(req, res);
    } else if (type == "Sponsored Brands") {
      await createSBKeyword(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type is required!",
      });
    }
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function createSPKeyword(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, state, name, matchType, bid, adGroupId } =
      req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getKeyword = await keywordSchema.findOne({
      campaignId,
      profileId,
      adGroupId,
      matchType,
      customerId,
      name: nameRegex,
    });
    if (getKeyword) {
      return res.status(203).send({
        message: "Keyword name with the specified match type already exists.",
        isSuccess: false,
      });
    }
    const bodyData = {
      keywords: [
        {
          keywordText: name,
          state,
          campaignId,
          adGroupId,
          matchType,
        },
      ],
    };
    if (bid) {
      bodyData.keywords[0].bid = bid;
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(customerId, res);
    const getProfile = await profileSchema.findOne({ customerId, profileId });
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sp/keywords`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     "Content-Type": "application/vnd.spKeyword.v3+json",
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
    //     if (responseBody.keywords.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Keyword with the specified name already exists.",
    //         error: responseBody.keywords.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       customerId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       campaignId: responseBody.keywords.success[0].keyword.campaignId,
    //       adGroupId: responseBody.keywords.success[0].keyword.adGroupId,
    //       keywordId: responseBody.keywords.success[0].keywordId,
    //       name: responseBody.keywords.success[0].keyword.keywordText,
    //       bid: bid ? responseBody.keywords.success[0].keyword.bid : 0,
    //       matchType: responseBody.keywords.success[0].keyword.matchType,
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       status: responseBody.keywords.success[0].keyword.state,
    //       timezone: getProfile.timezone,
    //     };
    //     const createKeyword = new keywordSchema(create);
    //     await createKeyword.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored products keyword created successfully.",
    //       createKeyword,
    //     });
    //   }
    // });
    const create = {
      profileId,
      customerId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId,
      keywordId: Math.floor(100000 + Math.random() * 900000),
      name,
      bid: bid ? bid : 0,
      matchType,
      type: "Sponsored Products",
      reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
      status: state,
      timezone: getProfile.timezone,
    };
    const createKeyword = new keywordSchema(create);
    await createKeyword.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored products keyword created successfully.",
      createKeyword,
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function createSBKeyword(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, campaignId, name, matchType, bid, adGroupId } = req.body;
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const getKeyword = await keywordSchema.findOne({
      campaignId,
      adGroupId,
      profileId,
      customerId,
      matchType: matchType.toUpperCase(),
      name: nameRegex,
    });
    if (getKeyword) {
      return res.status(203).send({
        message: "Keyword name with the specified match type already exists.",
        isSuccess: false,
      });
    }
    const bodyData = [
      {
        keywordText: name,
        campaignId,
        adGroupId,
        matchType,
      },
    ];
    if (bid) {
      bodyData[0].bid = bid;
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.
    const checkConfigAds = await getAccessToken(customerId, res);
    const getProfile = await profileSchema.findOne({ customerId, profileId });
    // const reportPOSTOptions = {
    //   method: "POST",
    //   url: `${process.env.ROOT_LINK}/sb/keywords`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     "Content-Type": "application/vnd.sbkeywordresponse.v3+json",
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
    //     if (responseBody.keywords.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Keyword with the specified name already exists.",
    //         error: responseBody.keywords.error,
    //       });
    //     }
    //     const create = {
    //       profileId,
    //       customerId,
    //       type,
    //       currencyCode: getProfile.currencyCode,
    //       campaignId,
    //       adGroupId,
    //       keywordId: responseBody.keywordId,
    //       name,
    //       bid: bid ? bid : 0,
    //       matchType: matchType.toUpperCase(),
    //       reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
    //       status: state.toUpperCase(),
    //       timezone: getProfile.timezone,
    //     };
    //     const createKeyword = new keywordSchema(create);
    //     await createKeyword.save();
    //     return res.status(200).send({
    //       isSuccess: true,
    //       message: "Sponsored brands keyword created successfully.",
    //       createKeyword,
    //     });
    //   }
    // });
    const create = {
      profileId,
      customerId,
      currencyCode: getProfile.currencyCode,
      campaignId,
      adGroupId,
      keywordId: Math.floor(100000 + Math.random() * 900000),
      name,
      bid: bid ? bid : 0,
      type: "Sponsored Brands",
      matchType: matchType.toUpperCase(),
      reportDate: moment().tz(getProfile.timezone).format("YYYY-MM-DD"),
      status: "pending".toUpperCase(),
      timezone: getProfile.timezone,
    };
    const createKeyword = new keywordSchema(create);
    await createKeyword.save();
    return res.status(200).send({
      isSuccess: true,
      message: "Sponsored brands keyword created successfully.",
      createKeyword,
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.updateKeyword = async (req, res) => {
  const type = req.body.type;
  const customerId = req.customer._id;
  try {
    const permissionResult = await checkPermission(
      customerId,
      "Keywords",
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
      await updateSPKeyword(req, res);
    } else if (type == "Sponsored Brands") {
      await updateSBKeyword(req, res);
    } else {
      return res.status(203).send({
        isSuccess: false,
        message: "Type is required!",
      });
    }
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

async function updateSPKeyword(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, state, bid } = req.body;
    const bodyData = {
      keywords: [
        {
          state,
          keywordId: req.params.id,
        },
      ],
    };
    if (bid) {
      bodyData.keywords[0].bid = bid;
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(customerId, res);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sp/keywords`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Prefer: "return=representation",
    //     Accept: "application/vnd.spKeyword.v3+json",
    //     "Content-Type": "application/vnd.spKeyword.v3+json",
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
    //     if (responseBody.keywords.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Keyword with the specified name already exists.",
    //         error: responseBody.keywords.error,
    //       });
    //     }
    // const latestData = await keywordSchema
    // .findOne({ keywordId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await keywordSchema
    //       .findOneAndUpdate(
    //         { keywordId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           status: state,
    //           bid,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((keyword) => {
    //         return res.status(200).send({
    //           data: keyword,
    //           message: `Keyword data updated successfully.`,
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
      status: state,
      bid,
    };
    const latestData = await keywordSchema
      .findOne({ customerId, keywordId: req.params.id })
      .sort({ reportDate: -1 });
    await keywordSchema
      .findOneAndUpdate(
        {
          keywordId: req.params.id,
          customerId,
          reportDate: latestData.reportDate,
        },
        updateData,
        { new: true }
      )
      .then((keyword) => {
        if (!keyword) {
          return res.status(203).send({
            message: `Keyword not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: keyword,
          message: `Keyword data updated successfully.`,
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

async function updateSBKeyword(req, res) {
  try {
    const customerId = req.customer._id;
    let { profileId, state, bid } = req.body;
    const bodyData = [
      {
        state: state.toLowerCase(),
        keywordId: req.params.id,
      },
    ];
    if (bid) {
      bodyData[0].bid = bid;
    }
    //NOTE: Below commented code for live amazon entry, so don't uncomment without PM permission.

    // const checkConfigAds = await getAccessToken(customerId, res);
    // const reportPOSTOptions = {
    //   method: "PUT",
    //   url: `${process.env.ROOT_LINK}/sb/keywords`,
    //   headers: {
    //     "Amazon-Advertising-API-ClientId": process.env.CLIENT_ID,
    //     "Amazon-Advertising-API-Scope": profileId,
    //     Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
    //     Accept: "application/vnd.sbkeywordresponse.v3+json",
    //     "Content-Type": "application/vnd.sbkeywordresponse.v3+json",
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
    //     if (responseBody.keywords.error.length > 0) {
    //       return res.status(203).send({
    //         isSuccess: false,
    //         message: "Keyword with the specified name already exists.",
    //         error: responseBody.keywords.error,
    //       });
    //     }
    // const latestData = await keywordSchema
    // .findOne({ keywordId: req.params.id })
    // .sort({ reportDate: -1 });
    //     await keywordSchema
    //       .findOneAndUpdate(
    //         { keywordId: req.params.id, reportDate: latestData.reportDate },
    //         {
    //           status: state.toUpperCase(),
    //           bid,
    //         },
    //         {
    //           new: true,
    //         }
    //       )
    //       .then((keyword) => {
    //         return res.status(200).send({
    //           data: keyword,
    //           message: `Keyword data updated successfully.`,
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
      status: state.toUpperCase(),
      bid,
    };
    const latestData = await keywordSchema
      .findOne({ customerId, keywordId: req.params.id })
      .sort({ reportDate: -1 });
    await keywordSchema
      .findOneAndUpdate(
        {
          customerId,
          keywordId: req.params.id,
          reportDate: latestData.reportDate,
        },
        updateData,
        { new: true }
      )
      .then((keyword) => {
        if (!keyword) {
          return res.status(203).send({
            message: `Keyword not found!`,
            isSuccess: false,
          });
        }
        return res.status(200).send({
          data: keyword,
          message: `Keyword data updated successfully.`,
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

exports.listKeywordsNameBySortingAcos = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, type } = req.body;
    if (!profileId) {
      return res
        .status(203)
        .send({ message: "ProfileId is required!", isSuccess: false });
    }
    if (!type) {
      return res
        .status(203)
        .send({ message: "Type is required!", isSuccess: false });
    }
    const keywords = await keywordSchema.aggregate([
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
          keywordId: { $first: "$keywordId" },
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
          keywordId: 1,
          type: 1,
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
    if (keywords.length === 0) {
      return res.status(203).send({
        message: "Keyword not found!",
        isSuccess: false,
      });
    }
    return res.status(200).send({
      data: keywords,
      totalRecords: keywords.length,
      message: `Keywords list successfully.`,
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

RegExp.escape = function (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

exports.manualListKeywordsFromAmazon = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Keywords Listing",
      isActive: false,
    });
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your keyword listing status is deactive.`,
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
    if (!(getCron.cronName == "Keywords Listing")) {
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
            cronName: "Keywords Listing",
            status: "PENDING",
            historyDate: reportDate,
          });
          if (!getCronData) {
            const createCronHistory = new cronJobHistorySchema({
              customerId: i.customerId,
              profileId: i.profileId,
              cronName: "Keywords Listing",
              status: "PENDING",
              historyDate: reportDate,
            });
            await createCronHistory.save();
          }
          const getCustomerPackage = await customerSchema
            .findById(i.customerId)
            .populate("packageId");
          let keywords = [];
          if (
            getCustomerPackage.packageId.campaignTypes.includes(
              "Sponsored Products"
            )
          ) {
            const spKeywords = await getSPkeywords(
              i.customerId,
              i.profileId,
              checkConfigAds,
              i.currencyCode,
              i.timezone,
              reportDate
            );
            const spTargets = await getSPtargets(
              i.customerId,
              i.profileId,
              checkConfigAds,
              i.currencyCode,
              i.timezone,
              reportDate
            );
            keywords = keywords.concat(spKeywords, spTargets);
          }
          if (keywords.length > 0) {
            await Promise.all(
              keywords.map(async (item) => {
                const getkeyword = await keywordSchema.findOne({
                  customerId: item.customerId,
                  profileId: item.profileId,
                  keywordId: item.keywordId,
                  campaignId: item.campaignId,
                  adGroupId: item.adGroupId,
                  reportDate,
                });
                if (!getkeyword) {
                  let createkeywords = new keywordSchema(item);
                  await createkeywords.save();
                } else {
                  await keywordSchema.findByIdAndUpdate(
                    { _id: getkeyword._id },
                    item,
                    { new: true }
                  );
                }
              })
            );
          }
        } else {
          return res.status(203).send({
            message: `Account disconnected in keywords listing.`,
            isSuccess: false,
          });
        }
      })
    );
    const getUpdateCronData = await cronJobHistorySchema.findOne({
      customerId: customerId,
      profileId: profileId,
      cronName: "Keywords Listing",
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
      message: "Keyword listing successfully.",
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.manualGenerateReport = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const { profileId, cronId } = req.body;
    const getCronStatus = await cronJobSchema.findOne({
      cronName: "Keyword Report",
      isActive: false,
    });
    if (getCronStatus) {
      return res.status(203).send({
        message: `Your keyword report status is deactive.`,
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
    if (!(getCron.cronName == "Keyword Report")) {
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
        cronName: "Keyword Report",
        status: "PENDING",
        historyDate: startDate,
      });
      if (!getCronData) {
        const createCronHistory = new cronJobHistorySchema({
          customerId: getProfile.customerId,
          profileId: getProfile.profileId,
          cronName: "Keyword Report",
          status: "PENDING",
          historyDate: startDate,
        });
        await createCronHistory.save();
      }
      let responseSPStatus = "PENDING";
      while (responseSPStatus != "COMPLETED") {
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
        if (responseSPStatus != "COMPLETED") {
          if (responseSPStatus != "ERROR") {
            await new Promise((resolve) => setTimeout(resolve, 60000));
          }
        }
      }
      const getUpdateCronData = await cronJobHistorySchema.findOne({
        customerId: customerId,
        profileId: profileId,
        cronName: "Keyword Report",
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
        message: "keywords Report updated successfully..",
        isSuccess: true,
      });
    } else {
      return res.status(203).send({
        message: `Account disconnected in keyword report.`,
        isSuccess: false,
      });
    }
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getKeywordSuggestion = async (req, res) => {
  try {
    const customerId = req.customer._id;
    let {
      phrase,
      language,
      location,
      minCPC,
      maxCPC,
      minSearchVolume,
      maxSearchVolume,
    } = req.body;
    const customer = await customerSchema.findOne(customerId, {
      _id: 0,
      keywordResearchLimit: 1,
    });
    const countHistory = await keywordSearchHistorySchema.count({
      customerId,
      currentDate: moment().format("YYYY-MM-DD"),
    });
    if (customer.keywordResearchLimit <= countHistory) {
      return res.status(203).send({
        isSuccess: false,
        message: "Daily Limit Exceeded",
      });
    }
    const encodedParams = new URLSearchParams();
    encodedParams.set("phrase", phrase);
    encodedParams.set("exact", phrase);
    encodedParams.set("lang", language || "en");
    encodedParams.set("loc", location || "US");
    const options = {
      method: "POST",
      url: process.env.KEYWORD_SUGGESTION_URL,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "X-RapidAPI-Key": process.env.X_RAPID_API_KEY,
        "X-RapidAPI-Host": process.env.X_RAPID_API_HOST,
      },
      data: encodedParams,
    };
    const response = await axios.request(options);
    if (response.status == 200) {
      if (response.data.keywords == undefined) {
        return res
          .status(203)
          .send({ isSuccess: false, message: "Keyword not found" });
      }
      let filteredKeywordData = response.data.keywords;
      const sortedKeywords = sortKeywordsByCount(filteredKeywordData);
      let sortedKeywordData = {};
      sortedKeywords.forEach((keyword) => {
        sortedKeywordData[keyword] = filteredKeywordData[keyword];
      });
      if (minCPC && maxCPC > 0) {
        if (maxCPC < minCPC) {
          return res.status(203).send({
            isSuccess: false,
            warning: true,
            message: "maxcpc should not be less than mincpc",
          });
        }
        sortedKeywordData = filterByCPC(
          sortedKeywordData,
          parseFloat(minCPC),
          parseFloat(maxCPC)
        );
      } else if (minCPC > 0) {
        sortedKeywordData = filterByMinCPC(
          sortedKeywordData,
          parseFloat(minCPC)
        );
      } else if (maxCPC > 0) {
        sortedKeywordData = filterByMaxCPC(
          sortedKeywordData,
          parseFloat(maxCPC)
        );
      }
      if (minSearchVolume && maxSearchVolume > 0) {
        if (maxSearchVolume < minSearchVolume) {
          return res.status(203).send({
            isSuccess: false,
            warning: true,
            message:
              "max search volume should not be less than min search volume",
          });
        }
        sortedKeywordData = filterBySearchVolume(
          sortedKeywordData,
          parseFloat(minSearchVolume),
          parseFloat(maxSearchVolume)
        );
      } else if (minSearchVolume > 0) {
        sortedKeywordData = filterByMinSearchVolume(
          sortedKeywordData,
          parseFloat(minSearchVolume)
        );
      } else if (maxSearchVolume > 0) {
        sortedKeywordData = filterByMaxSearchVolume(
          sortedKeywordData,
          parseFloat(maxSearchVolume)
        );
      }
      const sortedKeywordArray = Object.entries(sortedKeywordData)
        .filter(([keyword, data]) => data.similarity > 0)
        .sort((a, b) => {
          return b[1]["search volume"] - a[1]["search volume"];
        });
      sortedKeywordData = Object.fromEntries(sortedKeywordArray);

      let createHistory = new keywordSearchHistorySchema({
        customerId,
        search: phrase,
        currentDate: moment().format("YYYY-MM-DD"),
      });
      await createHistory.save();
      const getCount = await keywordSearchHistorySchema.count({
        customerId,
        currentDate: moment().format("YYYY-MM-DD"),
      });
      return res.status(200).json({
        isSuccess: true,
        message: `keyword suggestions fetch successfully.`,
        data: { keywords: sortedKeywordData },
        totalRecords: Object?.keys(sortedKeywordData)?.length,
        dailyLimit: customer.keywordResearchLimit - getCount,
      });
    } else {
      return res
        .status(203)
        .send({ isSuccess: false, message: "Keyword not found" });
    }
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

function filterByMinCPC(keywords, minCPC) {
  return Object.keys(keywords)
    .filter((keyword) => {
      const cpc = parseFloat(keywords[keyword].cpc);
      return cpc >= minCPC;
    })
    .reduce((sortedKeywordData, keyword) => {
      sortedKeywordData[keyword] = keywords[keyword];
      return sortedKeywordData;
    }, {});
}

function filterByMaxCPC(keywords, maxCPC) {
  return Object.keys(keywords)
    .filter((keyword) => {
      const cpc = parseFloat(keywords[keyword].cpc);
      return cpc <= maxCPC;
    })
    .reduce((sortedKeywordData, keyword) => {
      sortedKeywordData[keyword] = keywords[keyword];
      return sortedKeywordData;
    }, {});
}

function filterByCPC(keywords, minCPC, maxCPC) {
  return Object?.keys(keywords)
    .filter((keyword) => {
      const cpc = parseFloat(keywords[keyword].cpc);
      return cpc >= minCPC && cpc <= maxCPC;
    })
    .reduce((sortedKeywordData, keyword) => {
      sortedKeywordData[keyword] = keywords[keyword];
      return sortedKeywordData;
    }, {});
}

function filterByMinSearchVolume(keywords, minSearchVolume) {
  return Object.keys(keywords)
    .filter((keyword) => {
      const searchVolume = parseFloat(keywords[keyword]["search volume"]);
      return searchVolume >= minSearchVolume;
    })
    .reduce((sortedKeywordData, keyword) => {
      sortedKeywordData[keyword] = keywords[keyword];
      return sortedKeywordData;
    }, {});
}

function filterByMaxSearchVolume(keywords, maxSearchVolume) {
  return Object.keys(keywords)
    .filter((keyword) => {
      const searchVolume = parseFloat(keywords[keyword]["search volume"]);
      return searchVolume <= maxSearchVolume;
    })
    .reduce((sortedKeywordData, keyword) => {
      sortedKeywordData[keyword] = keywords[keyword];
      return sortedKeywordData;
    }, {});
}

function filterBySearchVolume(keywords, minSearchVolume, maxSearchVolume) {
  return Object?.keys(keywords)
    .filter((keyword) => {
      const searchVolume = parseFloat(keywords[keyword]["search volume"]);
      return searchVolume >= minSearchVolume && searchVolume <= maxSearchVolume;
    })
    .reduce((sortedKeywordData, keyword) => {
      sortedKeywordData[keyword] = keywords[keyword];
      return sortedKeywordData;
    }, {});
}

function getWordCount(text) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function getSentenceCount(text) {
  return text.split(/[.!?]+/).filter((sentence) => sentence.length > 0).length;
}

function sortKeywordsByCount(keywords) {
  return Object.keys(keywords).sort((a, b) => {
    const wordCountA = getWordCount(a);
    const wordCountB = getWordCount(b);

    if (wordCountA === wordCountB) {
      const sentenceCountA = getSentenceCount(a);
      const sentenceCountB = getSentenceCount(b);
      return sentenceCountA - sentenceCountB;
    }
    return wordCountA - wordCountB;
  });
}
