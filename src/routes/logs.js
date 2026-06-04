/**
 * 日志路由模块
 *
 * 提供请求日志查询接口：
 *   GET /api/logs          - 获取近期请求日志列表
 *   GET /api/logs/today    - 获取今日数据统计聚合
 */

const express = require("express");
const logger = require("../logger");

const router = express.Router();

/** GET /api/logs - 返回全部日志（按时间倒序，最多 200 条） */
router.get("/", (req, res) => {
  res.json({ code: 1, data: logger.getAll() });
});

/** GET /api/logs/today - 返回今日数据统计 */
router.get("/today", (req, res) => {
  const dateStr = (req.query && req.query.date) || undefined;
  res.json({ code: 1, data: logger.getTodayStats(dateStr) });
});

module.exports = router;
