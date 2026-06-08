/**
 * 配置管理路由模块
 *
 * 提供运行时配置的读取和更新接口：
 *   GET  /api/config                       - 获取当前完整配置
 *   POST /api/config                       - 更新配置（写入文件 + 热重载内存）
 *   GET  /api/config/profiles              - 获取档案列表 + 当前激活档案 + 切换历史
 *   POST /api/config/profiles/switch       - 切换到指定档案
 *   GET  /api/config/profiles/history      - 获取切换历史
 *   POST /api/config/profiles/upsert       - 创建或更新档案（不动激活档案）
 */

const express = require("express");
const config = require("../config");
const profiles = require("../profiles");

const router = express.Router();

/** GET /api/config - 返回当前配置 */
router.get("/", (req, res) => {
  res.json({ code: 1, data: config.raw });
});

/** POST /api/config - 更新配置并热重载 */
router.post("/", async (req, res, next) => {
  try {
    const newConfig = req.body;
    await config.reload(newConfig);
    res.json({ code: 1, msg: "配置更新成功" });
  } catch (e) {
    res.json({ code: 0, msg: "配置更新失败: " + e.message });
  }
});

/**
 * GET /api/config/profiles
 * 返回所有档案 + 当前激活档案 + 最近切换历史
 */
router.get("/profiles", (req, res) => {
  res.json({
    code: 1,
    data: {
      profiles: config.profiles,
      activeProfile: config.activeProfile,
      history: profiles.getHistory(),
    },
  });
});

/**
 * POST /api/config/profiles/switch
 * 请求体: { "name": "<档案名>" }
 * 成功: { code: 1, msg: "已切换到 <name>" }
 * 失败: { code: 0, msg: "<原因>" } （400 表示参数错）
 */
router.post("/profiles/switch", async (req, res, next) => {
  const name = req.body && req.body.name;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ code: 0, msg: "缺少 name 参数" });
  }
  let result;
  try {
    result = await config.switchTo(name.trim());
  } catch (e) {
    return res.json({ code: 0, msg: "切换失败: " + e.message });
  }
  if (result.ok) {
    profiles.addHistory({ from: result.from, to: result.to, success: true });
    return res.json({ code: 1, msg: result.msg, data: { activeProfile: config.activeProfile } });
  }
  // 当前已是该档案：不写入失败历史（视为幂等成功）
  if (result.msg.startsWith("当前已是该档案")) {
    return res.json({ code: 1, msg: result.msg, data: { activeProfile: config.activeProfile } });
  }
  // 真正失败：不写入历史
  return res.json({ code: 0, msg: result.msg });
});

/**
 * GET /api/config/profiles/history - 返回倒序历史 */
router.get("/profiles/history", (req, res) => {
  res.json({ code: 1, data: profiles.getHistory() });
});

/**
 * POST /api/config/profiles/upsert
 * 请求体: { "name": "<档案名>", "ai": { ... }, "description"?: "<描述>" }
 * 成功: { code: 1, msg: "已创建/已更新档案 <name>", data: { profile, created } }
 * 失败: { code: 0, msg: "<原因>" } （400 表示参数错）
 */
router.post("/profiles/upsert", async (req, res, next) => {
  const body = req.body || {};
  const name = body.name;
  const ai = body.ai;
  const description = body.description;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ code: 0, msg: "缺少 name 参数" });
  }
  if (!ai || typeof ai !== "object" || Array.isArray(ai)) {
    return res.status(400).json({ code: 0, msg: "缺少 ai 配置" });
  }
  let result;
  try {
    result = await config.upsertProfile(name, ai, description);
  } catch (e) {
    return res.status(400).json({ code: 0, msg: "保存失败: " + e.message });
  }
  if (!result.ok) {
    return res.status(400).json({ code: 0, msg: result.msg });
  }
  res.json({
    code: 1,
    msg: result.msg,
    data: { profile: result.profile, created: result.created },
  });
});

module.exports = router;
