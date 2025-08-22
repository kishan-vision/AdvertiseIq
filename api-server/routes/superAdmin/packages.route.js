const express = require("express");
const { verifyToken } = require("../../middleware/customer.auth");
const { requireSuperAdmin } = require("../../middleware/superAdmin.auth");
const {
  getAllPackages,
} = require("../../controllers/superAdmin/packages.controller");
const router = express.Router();

router.get("/getAllPackages", getAllPackages);

module.exports = router;
