const express = require("express");
const router = express.Router();
const { verifyToken } = require("../../middleware/customer.auth");
const { listAllPage } = require("../../controllers/superAdmin/pages.controller");

router.post("/listAll", verifyToken, listAllPage);

module.exports = router;
