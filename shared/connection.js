const mongoose = require("mongoose");
require("dotenv").config();
const { write_logs } = require("../winston/connection/logger");

mongoose.set("strictQuery", false);

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  autoIndex: true,
});

mongoose.connection.on("connected", () => {
  write_logs({
    message: "Connection established successfully",
    log_type: "info",
  });
});

mongoose.connection.on("error", () => {
  write_logs({
    message: "Mongoose connection default error",
    log_type: "error",
  });
});

mongoose.connection.on("disconnected", () => {
  write_logs({
    message: "Mongoose default connection disconnected",
    log_type: "info",
  });
});

process.on("SIGINT", () => {
  mongoose.connection.close(() => {
    write_logs({
      message: "Connection close successfully",
      log_type: "info",
    });
    process.exit(0);
  });
});
