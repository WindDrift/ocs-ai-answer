/**
 * 搜索路由模块
 *
 * 提供 OCS 答题查询接口，支持 GET 和 POST 两种请求方式。
 * 接收题目标题、类型、选项、课程上下文、sessionId，调用 AI 获取答案后返回标准化 JSON 响应。
 *
 * 响应格式：
 *   成功: { code: 1, question: "...", answer: "..." }
 *   失败: { code: 0, msg: "错误信息" }
 */

const express = require("express");
const { callAI } = require("../ai");
const SessionManager = require("../session");

const router = express.Router();

/**
 * 从请求中提取题目参数
 * 兼容 GET (query) 和 POST (body) 两种方式
 * @param {import('express').Request} req
 * @returns {{ title: string, type: string, options: string, course: string, session: string }}
 */
function extractParams(req) {
  const b = req.body || {};
  const q = req.query || {};
  return {
    title:   b.title   || q.title   || "",
    type:    b.type    || q.type    || "",
    options: b.options || q.options || "",
    course:  b.course  || q.course  || "",
    // 优先级：OCS 显式传入 > 兜底 IP 维度
    session: b.session || q.session || SessionManager.fallbackId(req),
  };
}

/**
 * 统一的搜索处理逻辑
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleSearch(req, res) {
  const { title, type, options, course, session } = extractParams(req);

  if (!title) {
    return res.json({ code: 0, msg: "缺少题目参数 title" });
  }

  try {
    const answer = await callAI({
      question: title,
      type,
      options,
      course,
      sessionId: session,
    });
    if (answer) {
      res.json({ code: 1, question: title, answer });
    } else {
      res.json({ code: 0, msg: "AI 未返回有效答案" });
    }
  } catch (err) {
    console.error("AI API 调用失败:", err.message);
    res.json({ code: 0, msg: `AI API 调用失败: ${err.message}` });
  }
}

/** GET /search - 通过查询参数查询答案 */
router.get("/", handleSearch);

/** POST /search - 通过请求体查询答案 */
router.post("/", handleSearch);

/** DELETE /search - 清空指定 session（切换章节时调用） */
router.delete("/", (req, res) => {
  const sid = ((req.body && req.body.session) || (req.query && req.query.session) || "").toString();
  if (!sid) return res.json({ code: 0, msg: "缺少 session 参数" });
  const { sessions } = require("../ai");
  const ok = sessions.clear(sid);
  res.json({ code: 1, msg: ok ? "会话已清空" : "会话不存在" });
});

module.exports = router;
