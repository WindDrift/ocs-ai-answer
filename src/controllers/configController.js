const configManager = require("../config");

function getConfig(req, res) {
  res.json({ code: 1, data: configManager.getConfig() });
}

async function updateConfig(req, res) {
  try {
    const newConfig = req.body;
    await configManager.saveConfig(newConfig);
    res.json({ code: 1, msg: "配置更新成功" });
  } catch (e) {
    res.json({ code: 0, msg: "配置更新失败: " + e.message });
  }
}

function getOcsConfig(req, res) {
  const host = req.headers.host;
  const protocol = req.protocol;
  const url = `${protocol}://${host}/search`;
  
  const ocsConfig = [
    {
      "url": url,
      "name": "AI智能答题",
      "method": "get",
      "contentType": "json",
      "type": "GM_xmlhttpRequest",
      "data": {
        "title": "${title}",
        "type": "${type}",
        "options": "${options}"
      },
      "handler": "return (res) => res.code === 1 ? [res.question, res.answer] : [res.msg, undefined]"
    }
  ];
  res.json({ code: 1, data: ocsConfig });
}

module.exports = {
  getConfig,
  updateConfig,
  getOcsConfig
};
