const express = require("express");
const router = express.Router();
const {
  getAdminPermission,
} = require("../../controllers/superAdmin/permission.controller");
const { verifyToken } = require("../../middleware/customer.auth");

router.get("/getAdminPermission", verifyToken, getAdminPermission);

module.exports = router;
