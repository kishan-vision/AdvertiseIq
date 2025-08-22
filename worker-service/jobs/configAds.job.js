const cron = require('node-cron');
const { cronUpdateToken } = require('../../api-server/controllers/configAds.controller');
const { write_logs } = require("../../winston/updateToken/logger");

cron.schedule("*/20 * * * *", async () => {
  try {
    write_logs({
      message: `cronUpdateToken`,
      log_type: "info",
    });

    await cronUpdateToken();
  } catch (error) {
    return write_logs({
      message: `Main Catch Error: ${JSON.stringify(error)}`,
      log_type: "error",
    });
  }
}, {
  timezone: 'Asia/Kolkata'
});

cron.schedule("*/2 * * * *", async () => {
  try {
    console.log('Cron Runing...')

  } catch (error) {
   console.log(error,"error")
  }
}, {
  timezone: 'Asia/Kolkata'
});