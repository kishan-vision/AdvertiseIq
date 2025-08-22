const cron = require("node-cron");
const { write_logs } = require("../../winston/adGroups/logger");
const { cronListAdGroupsFromAmazon, cronGenerateReport } = require("../../api-server/controllers/adGroups.controller");

cron.schedule("30 2 * * *", async () => {
    try {
        write_logs({
            message: `cronListAdGroupsFromAmazon`,
            log_type: "info",
        });
        await cronListAdGroupsFromAmazon();
    } catch (error) {
        return write_logs({
            message: `Main Catch Error: ${JSON.stringify(error)}`,
            log_type: "error",
        });
    }
}, {
    timezone: 'Asia/Kolkata'
});

cron.schedule("5 3 * * *", async () => {
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