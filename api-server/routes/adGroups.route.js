const express = require("express");
const { verifyToken } = require("../middleware/customer.auth");
const {
    listAdGroups,
    listAdGroupNameBySortingAcos,
    listAdGroupName,
    createAdGroup,
    updateAdGroup,
    manualListAdGroupsFromAmazon,
    manualGenerateReport,
} = require('../controllers/adGroups.controller');
const router = express.Router();
const validation = require("../validation/adGroups.validation");

router.post("/listAdGroups", verifyToken, listAdGroups);

//manual run cron
router.post(
    "/manualListAdGroupsFromAmazon",
    verifyToken,
    manualListAdGroupsFromAmazon
);
router.post("/manualGenerateReport", verifyToken, manualGenerateReport);

router.post(
    "/listAdGroupNameBySortingAcos",
    verifyToken,
    listAdGroupNameBySortingAcos
);
router.post("/createAdGroup", verifyToken, validation.adGroup, createAdGroup);
router.post(
    "/updateAdGroup/:id",
    verifyToken,
    validation.adGroup,
    updateAdGroup
);
router.post("/listAdGroupName", verifyToken, listAdGroupName);

module.exports = router;
