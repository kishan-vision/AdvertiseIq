const express = require("express");
const router = express.Router();

const {
  getCampaigns,
  listProfiles,
  getCampaignDataTable,
  getCampaignDetailsData,
  cronListCampaignsFromAmazon,
  listCampaignName,
} = require("../controllers/campaign.controller");
const { verifyToken } = require("../middleware/customer.auth");

router.post("/getCampaignDataTable/:id", verifyToken, getCampaignDataTable);
router.post("/getCampaignIdData/:id", verifyToken, getCampaignDetailsData);
router.get("/listProfiles", verifyToken, listProfiles);
router.post("/getCampaigns", verifyToken, getCampaigns);
router.post("/cronListCampaignsFromAmazon", cronListCampaignsFromAmazon);
router.post("/listCampaignName", verifyToken, listCampaignName);

module.exports = router;
