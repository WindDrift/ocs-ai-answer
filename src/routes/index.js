const express = require("express");
const { handleSearch } = require("../controllers/searchController");
const { getConfig, updateConfig, getOcsConfig } = require("../controllers/configController");
const { getLogs } = require("../controllers/logController");
const { getStatus } = require("../controllers/systemController");

const router = express.Router();

// Search routes
router.get("/search", handleSearch);
router.post("/search", handleSearch);

// System routes
router.get("/api/status", getStatus);

// Config routes
router.get("/api/config", getConfig);
router.post("/api/config", updateConfig);
router.get("/api/ocs-config", getOcsConfig);

// Log routes
router.get("/api/logs", getLogs);

module.exports = router;
