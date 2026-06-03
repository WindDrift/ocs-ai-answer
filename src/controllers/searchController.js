const { callAI } = require("../services/aiService");

async function handleSearch(req, res) {
  const title = (req.query.title || req.body.title || "").trim();
  const type = (req.query.type || req.body.type || "").trim();
  const options = (req.query.options || req.body.options || "").trim();

  if (!title) {
    return res.json({ code: 0, msg: "缺少题目参数 title" });
  }

  try {
    const answer = await callAI(title, type, options);
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

module.exports = {
  handleSearch,
};
