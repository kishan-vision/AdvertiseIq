const express = require("express");
const { verifyToken } = require("../../middleware/customer.auth");
const {
  getNotifications,
} = require("../../controllers/superAdmin/notification.controller");
const router = express.Router();

router.get("/get-notifications", verifyToken, getNotifications);

module.exports = router;
