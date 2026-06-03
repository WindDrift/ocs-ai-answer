const logger = require("../utils/logger");

function getLogs(req, res) {
  res.json({ code: 1, data: logger.getLogs() });
}

module.exports = {
  getLogs
};
