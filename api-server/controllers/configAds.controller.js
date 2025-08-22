const configAdsSchema = require("../models/configAd.model");
const axios = require("axios");
const moment = require("moment-timezone");
const { write_logs } = require("../../winston/updateToken/logger");

exports.cronUpdateToken = async () => {
  write_logs({
    message: `US Time = ${moment()
      .tz("America/Los_Angeles")
      .format("HH:mm")} India Time = ${moment()
        .tz("Asia/Kolkata")
        .format("HH:mm")} cronUpdateToken`,
    log_type: "info",
  });
  try {
    const checkConfigAds = await configAdsSchema.find();
    await Promise.all(
      checkConfigAds.map(async (customer) => {
        try {
          const { data } = await axios.post(
            process.env.AUTH_LINK,
            new URLSearchParams({
              grant_type: "refresh_token",
              client_id: customer.clientId,
              refresh_token: customer.adsRefreshToken,
              client_secret: customer.clientSecret,
            }),
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
            }
          );

          await configAdsSchema.findByIdAndUpdate(
            { _id: customer._id },
            {
              adsAccessToken: data.access_token,
              adsRefreshToken: data.refresh_token,
            },
            { new: true }
          );

          return write_logs({
            message: `${customer._id} Access token updated successfully`,
            log_type: "info",
          });

        } catch (error) {
          return write_logs({
            message: `Token not updated ${JSON.stringify(error.response?.data || error.message)}`,
            log_type: "error",
          });
        }
      })
    );
  } catch (error) {
    return write_logs({
      message: `Main Try Catch ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
};

exports.checkConnectAccount = async (req, res) => {
  const customerId = req.customer._id;
  if (!customerId) {
    return res
      .status(203)
      .send({ message: "Customer id required.", isSuccess: false });
  }
  try {
    const checkConfigAds = await configAdsSchema.findOne({ customerId });
    if (!checkConfigAds) {
      return res.status(200).send({
        connect: false,
        isSuccess: true,
        message: "Account Disconnected",
      });
    }
    return res
      .status(200)
      .send({ connect: true, isSuccess: true, message: "Account connected" });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};