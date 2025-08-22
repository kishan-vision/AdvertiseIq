const {
  cronGetAccessToken,
  cronCheckCustomerPermission,
  getProfile,
} = require("../helper/common");
const profileSchema = require("../models/profiles.model");
const placementSchema = require("../models/placement.model");
const reportsSchema = require("../models/report.model");
const { write_logs } = require("../../winston/placement/logger");
const moment = require("moment-timezone");
const fs = require("fs");
const zlib = require("node:zlib");
const path = require("path");
const axios = require("axios");
const cronJobSchema = require("../models/cronJob.model");
const cronJobHistorySchema = require("../models/cronJobHistory.model");
const { Worker } = require("worker_threads");

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
      cronName: "Placement Report",
      isActive: false,
    });
    if (getCronStatus) {
      return write_logs({
        message: `Your placement report status is deactive.`,
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
          "Placement Report"
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
            const worker = new Worker(path.resolve(__dirname, "../workers/placementWorker.js"), {
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
                      profile.timezone,
                      profile.currencyCode
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
                      cronName: "Placement Report",
                      historyDate: currentDate,
                      status: "PENDING",
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
                          cronName: "Placement Report",
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
                      cronName: "Placement Report",
                      historyDate: currentDate,
                      status: "PENDING",
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
      message: "Placement report generated successfully.",
      log_type: "info",
    });
  } catch (error) {
    return write_logs({
      message: `Placement report err: ${JSON.stringify(error)}`,
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
  timezone,
  currencyCode
) {
  return new Promise(async (resolve, reject) => {
    const getAccount = await getProfile(customerId, profileId);
    const bodyData = {
      name: "",
      startDate: startDate,
      endDate: endDate,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign", "campaignPlacement"],
        columns: [
          "campaignId",
          "campaignName",
          "campaignStatus",
          "campaignBudgetAmount",
          "campaignBudgetType",
          "impressions",
          "clicks",
          "cost",
          "purchases7d",
          "unitsSoldClicks7d",
          "sales7d",
          "startDate",
          "endDate",
          "campaignBiddingStrategy",
          "costPerClick",
          "clickThroughRate",
          "spend",
          "placementClassification",
        ],
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON",
      },
    };
    let reportPOSTOptions = {
      method: "POST",
      url: `${getAccount.amazonUrl}/reporting/reports`,
      headers: {
        "Amazon-Advertising-API-ClientId": checkConfigAds.clientId,
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
        reportTypeId: "spPlacements",
        reportName: "PLACEMENTS",
      });
      if (getReportData) {
        let lastUpdateDate = moment(getReportData.updatedAt)
          .tz(timezone)
          .format("YYYY-MM-DD HH:mm:ss");
        const currentTime = moment().tz(timezone).format("YYYY-MM-DD HH:mm:ss");
        const lastUpdateTimeObj = moment(lastUpdateDate, "YYYY-MM-DD HH:mm:ss");
        const currentTimeObj = moment(currentTime, "YYYY-MM-DD HH:mm:ss");
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
              await reportsSchema.findByIdAndUpdate(getReportData._id, {
                $set: {
                  reportId: response.data.reportId,
                  status: response.data.status,
                },
              });
              resolve(response.data.status);
            } else {
              write_logs({
                message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP report err: ${JSON.stringify(
                  response.data
                )}`,
                log_type: "error",
              });
              resolve("ERROR");
            }
          } catch (error) {
            write_logs({
              message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP Report err: ${JSON.stringify(
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
            url: `${getAccount.amazonUrl}/reporting/reports/${getReportData.reportId}`,
            method: "GET",
            headers: {
              "Amazon-Advertising-API-ClientId": checkConfigAds.clientId,
              "Amazon-Advertising-API-Scope": profileId,
              Authorization: `Bearer ${checkConfigAds.adsAccessToken}`,
              "Content-Type":
                "application/vnd.createasyncreportrequest.v3+json",
            },
          };

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

              const zipFilePath = path.resolve(__dirname, '../../uploads/placements/sp-report', `${getReportData.startDate}-${getReportData.reportId}.zip`);
              const extractionPath = path.resolve(__dirname, '../../uploads/placements/sp-report', `${getReportData.startDate}-${getReportData.reportId}.json`);

              const file = fs.createWriteStream(zipFilePath);

              try {
                const downloadResponse = await axios({
                  url: body.url,
                  method: 'GET',
                  responseType: 'stream'
                });

                downloadResponse.data.pipe(file);

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
                          message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP Report err: ${unzipError}`,
                          log_type: "error",
                        });
                        resolve("ERROR");
                      }

                      const data = require(extractionPath);

                      await Promise.all(
                        data.map(async (item) => {
                          let placementName = "";
                          if (
                            item.placementClassification == "Other on-Amazon" ||
                            item.placementClassification == "Other Placements"
                          ) {
                            placementName = "Rest of Search";
                          } else if (
                            item.placementClassification ==
                            "Detail Page on-Amazon"
                          ) {
                            placementName = "Product pages";
                          } else if (
                            item.placementClassification ==
                            "Top of Search on-Amazon" ||
                            item.placementClassification == "Top of Search"
                          ) {
                            placementName = "Top of Search";
                          }
                          let campaignBiddingStrategy = "";
                          if (item.campaignBiddingStrategy == "legacy") {
                            campaignBiddingStrategy =
                              "Dynamic bids - down only";
                          } else if (
                            item.campaignBiddingStrategy == "optimizeForSales"
                          ) {
                            campaignBiddingStrategy =
                              "Dynamic bids - up and down";
                          } else if (item.campaignBiddingStrategy == "manual") {
                            campaignBiddingStrategy = "Fixed bid";
                          }
                          let placement = await placementSchema.findOne({
                            profileId,
                            customerId,
                            campaignId: item.campaignId,
                            placement: placementName,
                            reportDate: startDate,
                          });
                          if (placement) {
                            await placementSchema.updateOne(
                              {
                                profileId,
                                customerId,
                                campaignId: item.campaignId,
                                placement: placementName,
                                reportDate: startDate,
                              },
                              {
                                $set: {
                                  campaignName: item.campaignName,
                                  campaignStatus:
                                    item.campaignStatus.toUpperCase(),
                                  campaignBudget: item.campaignBudgetAmount,
                                  campaignBudgetType:
                                    item.campaignBudgetType.toUpperCase(),
                                  clicks: item.clicks,
                                  spend: item.cost ? item.cost : 0,
                                  sales: item.sales7d ? item.sales7d : 0,
                                  orders: item.purchases7d
                                    ? item.purchases7d
                                    : 0,
                                  acos:
                                    item.sales7d != 0 && item.cost != 0
                                      ? (
                                        (item.cost / item.sales7d) *
                                        100
                                      ).toFixed(2)
                                      : 0,
                                  roas:
                                    item.sales7d != 0 && item.cost != 0
                                      ? (item.sales7d / item.cost).toFixed(2)
                                      : 0,
                                  cvr:
                                    item.purchases7d != 0 && item.clicks != 0
                                      ? (
                                        (item.purchases7d / item.clicks) *
                                        100
                                      ).toFixed(2)
                                      : 0,
                                  ctr:
                                    item.clicks != 0 && item.impressions != 0
                                      ? (
                                        (item.clicks / item.impressions) *
                                        100
                                      ).toFixed(2)
                                      : 0,
                                  cpc:
                                    item.cost != 0 && item.clicks != 0
                                      ? (item.cost / item.clicks).toFixed(2)
                                      : 0,
                                  impressions: item.impressions,
                                  conversion: item.purchases7d
                                    ? item.purchases7d
                                    : 0,
                                  placement: placementName,
                                  units: item.unitsSoldClicks7d
                                    ? item.unitsSoldClicks7d
                                    : 0,
                                  biddingStartegy: campaignBiddingStrategy,
                                },
                              }
                            );
                          } else {
                            let placementReport = new placementSchema({
                              customerId,
                              profileId,
                              type: "Sponsored Products",
                              currencyCode,
                              campaignId: item.campaignId,
                              campaignName: item.campaignName,
                              campaignStatus: item.campaignStatus.toUpperCase(),
                              reportDate: startDate,
                              campaignBudget: item.campaignBudgetAmount,
                              campaignBudgetType:
                                item.campaignBudgetType.toUpperCase(),
                              clicks: item.clicks,
                              spend: item.cost ? item.cost : 0,
                              sales: item.sales7d ? item.sales7d : 0,
                              orders: item.purchases7d ? item.purchases7d : 0,
                              acos:
                                item.sales7d != 0 && item.cost != 0
                                  ? ((item.cost / item.sales7d) * 100).toFixed(
                                    2
                                  )
                                  : 0,
                              roas:
                                item.sales7d != 0 && item.cost != 0
                                  ? (item.sales7d / item.cost).toFixed(2)
                                  : 0,
                              cvr:
                                item.purchases7d != 0 && item.clicks != 0
                                  ? (
                                    (item.purchases7d / item.clicks) *
                                    100
                                  ).toFixed(2)
                                  : 0,
                              ctr:
                                item.clicks != 0 && item.impressions != 0
                                  ? (
                                    (item.clicks / item.impressions) *
                                    100
                                  ).toFixed(2)
                                  : 0,
                              cpc:
                                item.cost != 0 && item.clicks != 0
                                  ? (item.cost / item.clicks).toFixed(2)
                                  : 0,
                              impressions: item.impressions,
                              conversion: item.purchases7d
                                ? item.purchases7d
                                : 0,
                              timezone,
                              placement: placementName,
                              units: item.unitsSoldClicks7d
                                ? item.unitsSoldClicks7d
                                : 0,
                              biddingStartegy: campaignBiddingStrategy,
                            });
                            await placementReport.save();
                          }
                        })
                      );
                      resolve(body.status);
                    }
                  );
                });

              } catch (error) {
                write_logs({
                  message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP Report err: ${error}`,
                  log_type: "error",
                });
                resolve("ERROR");
              }
            }
          }
          else {
            write_logs({
              message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP report err: ${JSON.stringify(
                response.data
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          }
        }
      } else {
        try {
          const response = await axios(reportPOSTOptions);
          if (response.status === 200) {
            const responseData = response.data; // No need to parse, axios does this automatically
            const create = {
              adProduct: responseData.configuration.adProduct,
              reportTypeId: "spPlacements",
              startDate,
              endDate,
              reportId: responseData.reportId,
              status: responseData.status,
              profileId,
              customerId,
              reportName: "PLACEMENTS",
            };

            const createSpReport = new reportsSchema(create);
            await createSpReport.save();
            resolve(responseData.status);
          } else {
            write_logs({
              message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP report err: ${JSON.stringify(
                response.data
              )}`,
              log_type: "error",
            });
            resolve("ERROR");
          }

        } catch (error) {
          write_logs({
            message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP report err: ${JSON.stringify(
              error
            )}`,
            log_type: "error",
          });
          resolve("ERROR");
        }
      }
    } catch (error) {
      write_logs({
        message: `CustomerID: ${customerId} ProfileID: ${profileId} Placement SP report err: ${JSON.stringify(
          error
        )}`,
        log_type: "error",
      });
      resolve("ERROR");
    }
  });
};
