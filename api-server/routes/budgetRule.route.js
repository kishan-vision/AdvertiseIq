const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/customer.auth");
const {
  createRule,
  updateRule,
  getRule,
  changeStatus,
  deleteRule,
  getBudgetRules,
  getCampaignsName,
  ruleHistory,
  manualRun,
  cronJobRulesSchedules,
  cronJobCheckRun,
} = require("../controllers/budgetRules.controller");

router.post("/createRule", verifyToken, createRule);
router.post("/updateRule/:ruleId", verifyToken, updateRule);
router.get("/getRule/:ruleId", verifyToken, getRule);
router.post("/changeStatus/:ruleId", verifyToken, changeStatus);
router.delete("/deleteRule/:ruleId", verifyToken, deleteRule);
router.post("/getBudgetRules", verifyToken, getBudgetRules);
router.post("/getCampaignsName", verifyToken, getCampaignsName);
router.post("/ruleHistory", verifyToken, ruleHistory);

router.get("/manualRun/:ruleId", verifyToken, manualRun);

router.get("/cronJobRulesSchedules", cronJobRulesSchedules);
router.get("/cronJobCheckRun", cronJobCheckRun);

module.exports = router;
