/**
 * 日志路由模块
 *
 * 提供请求日志查询接口：
 *   GET /api/logs - 获取近期请求日志列表
 */

const express = require("express");
const logger = require("../logger");

const router = express.Router();

/** GET /api/logs - 返回全部日志（按时间倒序，最多 200 条） */
router.get("/", (req, res) => {
  res.json({ code: 1, data: logger.getAll() });
});

module.exports = router;
