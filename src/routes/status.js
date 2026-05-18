/**
 * 服务状态路由模块
 *
 * 提供服务健康检查和基本信息接口：
 *   GET /api/status - 返回服务运行状态和可用端点列表
 */

const express = require("express");

const router = express.Router();

/** GET /api/status - 服务状态与健康检查 */
router.get("/", (req, res) => {
  res.json({
    service: "OCS AI 答题服务",
    status: "running",
    endpoints: {
      "GET /search": "查询答案（参数: title, type, options）",
      "POST /search": "查询答案（JSON body: title, type, options）",
    },
  });
});

module.exports = router;
