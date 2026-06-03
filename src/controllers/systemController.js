function getStatus(req, res) {
  res.json({
    service: "OCS AI 答题服务",
    status: "running",
    endpoints: {
      "GET /search": "查询答案（参数: title, type, options）",
      "POST /search": "查询答案（JSON body: title, type, options）",
    },
  });
}

module.exports = {
  getStatus
};
