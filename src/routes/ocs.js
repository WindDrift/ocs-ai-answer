/**
 * OCS 配置路由模块
 *
 * 生成 OCS 网课助手的题库配置 JSON，用户可一键复制到 OCS 脚本中使用。
 * 自动根据当前请求的协议和主机名生成 URL。
 *
 *   GET /api/ocs-config - 获取 OCS 题库配置
 */

const express = require("express");

const router = express.Router();

/** GET /api/ocs-config - 生成 OCS 兼容的题库配置 */
router.get("/", (req, res) => {
  const host = req.headers.host;
  const protocol = req.protocol;
  const url = `${protocol}://${host}/search`;

  const ocsConfig = [
    {
      url,
      name: "AI智能答题",
      method: "get",
      contentType: "json",
      type: "GM_xmlhttpRequest",
      data: {
        title: "${title}",
        type: "${type}",
        options: "${options}",
      },
      handler: "return (res) => res.code === 1 ? [res.question, res.answer] : [res.msg, undefined]",
    },
  ];

  res.json({ code: 1, data: ocsConfig });
});

module.exports = router;
