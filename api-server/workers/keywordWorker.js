const { workerData, parentPort, threadId } = require("worker_threads");
const moment = require("moment-timezone");
const { write_logs } = require("../../winston/keywords/logger");

const getData = async () => {
  const { profileData, reportDate, checkConfigAds, sleepTime } = workerData;
  const minutes = Math.floor(Math.random() * sleepTime) + 1;
  try {
    const profile = JSON.parse(profileData);
    const timezone = profile.timezone;
    const customerId = profile.customerId;
    const currencyCode = profile.currencyCode;
    const profileId = profile.profileId;

    write_logs({
      message: `${customerId} ${profileId} Thread ID: ${threadId} - Before sleep, Time: ${moment()
        .tz(timezone)
        .format("HH:mm")}, Minutes: ${minutes}`,
      log_type: "info",
    });
    await sleep(minutes * 60000);
    write_logs({
      message: `${customerId} ${profileId} Thread ID: ${threadId} - After sleep, Time: ${moment()
        .tz(timezone)
        .format("HH:mm")}, Minutes: ${minutes}`,
      log_type: "info",
    });
    parentPort.postMessage({
      threadId,
      response: {
        timezone: timezone,
        profileId: profileId,
        currencyCode: currencyCode,
        customerId: customerId,
        checkConfigAds: checkConfigAds,
        reportDate: reportDate,
      },
    });
  } catch (error) {
    write_logs({
      message: `Thread ID: ${threadId} - Error in Keyword: ${error}`,
      log_type: "error",
    });
    parentPort.postMessage({ error, threadId });
  }
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

getData();
