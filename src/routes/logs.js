/**
 * 日志路由模块
 *
 * 提供请求日志查询接口：
 *   GET /api/logs          - 获取近期请求日志列表
 *   GET /api/logs/today    - 获取今日数据统计聚合
 *   GET /api/logs/range    - 获取指定时间窗口（5m/30m/1h/3h/12h/24h）的趋势统计
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

/** GET /api/logs/range - 返回指定时间窗口的趋势统计 */
router.get("/range", (req, res) => {
  const window = (req.query && req.query.window) || "24h";
  const data = logger.getRangeStats(window);
  if (!data) {
    return res.json({ code: 0, msg: `不支持的时间窗口: ${window}` });
  }
  res.json({ code: 1, data });
});

module.exports = router;
