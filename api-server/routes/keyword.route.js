const express = require("express");
const { verifyToken } = require("../middleware/customer.auth");
const {
    listKeywords,
    createKeyword,
    updateKeyword,
    listKeywordsNameBySortingAcos,
    manualListKeywordsFromAmazon,
    manualGenerateReport,
    getKeywordSuggestion,
} = require("../controllers/keyword.controller");
const router = express.Router();
const validation = require("../validation/keyword.validation");

router.post("/listKeywords", verifyToken, listKeywords);

//manual run cron
router.post(
  "/manualListKeywordsFromAmazon",
  verifyToken,
  manualListKeywordsFromAmazon
);
router.post("/manualGenerateReport", verifyToken, manualGenerateReport);

router.post(
    "/createKeyword",
    verifyToken,
    validation.createKeyword,
    createKeyword
);
router.post(
  "/updateKeyword/:id",
  verifyToken,
  validation.updateKeyword,
  updateKeyword
);
router.post(
  "/listKeywordsNameBySortingAcos",
  verifyToken,
  listKeywordsNameBySortingAcos
);

router.post("/keywordSuggestion", verifyToken, getKeywordSuggestion);

module.exports = router;
