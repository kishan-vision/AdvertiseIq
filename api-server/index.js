const express = require("express");
const http = require("http");
require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` });
const socketIO = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const cors = require("cors");
const { write_logs } = require("../winston/connection/logger");

app.set("view engine", "ejs");
app.use(cors());
app.use(express.static("template"));
//DataBase Configration
require("../shared/connection");

app.use("/api/amazon", require("./routes/campaign.route"));
app.use("/api/customer", require("./routes/customer.route"));
app.use("/api/configAds", require("./routes/configAds.route"));
app.use("/api/budgetRule", require("./routes/budgetRule.route"));
// app.use("/api/keywordRule", require("./routes/keywordRule.route"));
// app.use("/api/campaignSchedule", require("./routes/campaignSchedule.route"));
// app.use("/api/cronJob", require("./routes/cronJob.route"));
app.use("/api/placement", require("./routes/placement.route"));
app.use("/api/adGroup", require("./routes/adGroups.route"));
app.use("/api/keyword", require("./routes/keyword.route"));
// app.use("/api/product", require("./routes/productAds.route"));
// app.use("/api/theme", require("./routes/theme.route"));

//Super admin
// app.use("/api/superAdmin", require("./routes/superAdmin/superAdmin.route"));
app.use("/api/pages", require("./routes/superAdmin/pages.route"));
// app.use("/api/pageAction", require("./routes/superAdmin/pageAction.route.js"));
app.use("/api/permission", require("./routes/superAdmin/permission.route"));
app.use("/api/packages", require("./routes/superAdmin/packages.route"));
// app.use(
//   "/api/paymentHistory",
//   require("./routes/superAdmin/paymentHistory.route")
// );
// app.use("/api/utility", require("./routes/superAdmin/utility.route"));
// app.use("/api/module", require("./routes/superAdmin/module.route"));
// app.use("/api/extraAmount", require("./routes/superAdmin/extraAmount.route"));
// app.use(
//   "/api/supportCategory",
//   require("./routes/superAdmin/supportCategory.route")
// );
// app.use("/api/support", require("./routes/superAdmin/supportTickets.route"));
// app.use(
//   "/api/notification-content",
//   require("./routes/superAdmin/notificationContent.route")
// );
app.use("/api/notification", require("./routes/superAdmin/notification.route"));
// app.use("/api/setting", require("./routes/superAdmin/setting.route"));
// app.use("/api/mail-content", require("./routes/superAdmin/mailContent.route"));
// app.use("/api/send-mail", require("./routes/superAdmin/sendEmail.route"));

//Selling Partner
// app.use("/api/seller/orders", require("./routes/sellerPartner/orders.route"));
// app.use(
//   "/api/seller/configAds",
//   require("./routes/sellerPartner/configAds.route")
// );

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected: " + socket.id);

  // Listen for chat messages
  socket.on("message", (data) => {
    console.log("Message received:", data);

    // Broadcast the message to all connected clients
    io.emit("message", data);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
  });
});

// listening port
const PORT = process.env.PORT || 3000;
server.listen(PORT, (error) => {
  if (error) {
    write_logs({
      message: error.message,
      log_type: "error",
    });
  } else {
    write_logs({
      message: `Listerning server at port ${PORT}`,
      log_type: "info",
    });
  }
});
