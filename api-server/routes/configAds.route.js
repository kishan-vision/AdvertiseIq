const {
  checkConnectAccount,
} = require("../controllers/configAds.controller");
const express = require("express");
const { verifyToken } = require("../middleware/customer.auth");
const router = express.Router();

router.post("/checkConnectAccount", verifyToken, checkConnectAccount);

module.exports = router;
