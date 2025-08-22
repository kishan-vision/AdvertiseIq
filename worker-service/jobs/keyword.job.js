const cron = require('node-cron');
const { write_logs } = require("../../winston/keywords/logger");
const { cronListKeywordsFromAmazon, cronGenerateReport } = require('../../api-server/controllers/keyword.controller');

cron.schedule("35 3 * * *", async () => {
  try {
    write_logs({
      message: `cronListKeywordsFromAmazon`,
      log_type: "info",
    });
    await cronListKeywordsFromAmazon();
  } catch (error) {
    return write_logs({
      message: `Main Catch Error: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
}, {
  timezone: 'Asia/Kolkata'
});

cron.schedule("0 4 * * *", async () => {
  try {
    write_logs({
      message: `cronGenerateReport`,
      log_type: "info",
    });
    await cronGenerateReport();
  } catch (error) {
    return write_logs({
      message: `Main Catch Error: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
}, {
  timezone: 'Asia/Kolkata'
});