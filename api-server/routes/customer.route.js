const express = require("express");
const router = express.Router();
const {
  login,
  getProfile,
} = require("../controllers/customer.controller");
const { verifyToken } = require("../middleware/customer.auth");

router.post("/login", login);
router.get("/getProfile", verifyToken, getProfile);

module.exports = router;
