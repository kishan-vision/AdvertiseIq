const cron = require('node-cron');
const { cronListCampaignsFromAmazon, cronGenerateReport, cronCampaignGenerateReport } = require("../../api-server/controllers/campaign.controller");
const { write_logs } = require("../../winston/campaigns/logger");
const { report_write_logs } = require("../../winston/generateReports/logger");

cron.schedule("0 0 * * *", async () => {
  try {
    write_logs({
      message: `cronListCampaignsFromAmazon`,
      log_type: "info",
    });
    await cronListCampaignsFromAmazon();
  } catch (error) {
    return write_logs({
      message: `Main Catch Error: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
}, {
  timezone: 'Asia/Kolkata'
});

cron.schedule("30 1 * * *", async () => {
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

// cron.schedule("0 * * * *", async () => {
//   try {
//     report_write_logs({
//       message: `cronCampaignGenerateReport`,
//       log_type: "info",
//     });
//     await cronCampaignGenerateReport();
//   } catch (error) {
//     return report_write_logs({
//       message: `Main Catch Error: ${JSON.stringify(error)}`,
//       log_type: "error",
//     });
//   }
// });