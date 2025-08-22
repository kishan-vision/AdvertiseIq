const cron = require('node-cron');
const { cronGenerateReport } = require("../../api-server/controllers/placement.controller");
const { write_logs } = require("../../winston/placement/logger");

cron.schedule("30 4 * * *", async () => {
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