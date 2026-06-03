/**
 * 配置管理路由模块
 *
 * 提供运行时配置的读取和更新接口：
 *   GET  /api/config  - 获取当前完整配置
 *   POST /api/config  - 更新配置（写入文件 + 热重载内存）
 */

const express = require("express");
const config = require("../config");

const router = express.Router();

/** GET /api/config - 返回当前配置 */
router.get("/", (req, res) => {
  res.json({ code: 1, data: config.raw });
});

/** POST /api/config - 更新配置并热重载 */
router.post("/", (req, res) => {
  try {
    const newConfig = req.body;
    config.reload(newConfig);
    res.json({ code: 1, msg: "配置更新成功" });
  } catch (e) {
    res.json({ code: 0, msg: "配置更新失败: " + e.message });
  }
});

module.exports = router;
