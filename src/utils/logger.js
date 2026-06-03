const fs = require('fs');
const path = require('path');

const logsPath = path.join(__dirname, '../../logs.json');

class Logger {
  constructor() {
    this.logs = [];
    this.isWriting = false;
    this.pendingWrites = false;
    this.loadLogs();
  }

  loadLogs() {
    if (fs.existsSync(logsPath)) {
      try {
        this.logs = JSON.parse(fs.readFileSync(logsPath, "utf-8"));
      } catch (e) {
        console.error("读取 logs.json 失败:", e.message);
        this.logs = [];
      }
    }
  }

  addLog(log) {
    this.logs.unshift(log);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    this.scheduleWrite();
  }

  getLogs() {
    return this.logs;
  }

  scheduleWrite() {
    if (this.isWriting) {
      this.pendingWrites = true;
      return;
    }
    this.writeLogs();
  }

  async writeLogs() {
    this.isWriting = true;
    this.pendingWrites = false;
    try {
      await fs.promises.writeFile(logsPath, JSON.stringify(this.logs, null, 2), "utf-8");
    } catch (err) {
      console.error("日志持久化失败:", err.message);
    } finally {
      this.isWriting = false;
      if (this.pendingWrites) {
        this.scheduleWrite();
      }
    }
  }
}

const logger = new Logger();
module.exports = logger;
