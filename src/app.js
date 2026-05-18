/**
 * Express 应用组装模块
 *
 * 负责创建和配置 Express 应用实例：
 *   - 注册中间件（JSON 解析、URL 编码、静态文件服务）
 *   - 挂载各功能路由模块
 *   - 导出 app 实例供 server.js 使用
 */

const express = require("express");
const path = require("path");

/* 路由模块 */
const searchRouter = require("./routes/search");
const configRouter = require("./routes/config");
const logsRouter = require("./routes/logs");
const ocsRouter = require("./routes/ocs");
const statusRouter = require("./routes/status");

const app = express();

/* ========== 中间件 ========== */

/** JSON 请求体解析 */
app.use(express.json());

/** URL 编码请求体解析 */
app.use(express.urlencoded({ extended: true }));

/** 静态文件服务（控制面板前端） */
app.use(express.static(path.join(__dirname, "..", "public")));

/* ========== 路由挂载 ========== */

/** 答题查询接口 */
app.use("/search", searchRouter);

/** 服务状态接口 */
app.use("/api/status", statusRouter);

/** 配置管理接口 */
app.use("/api/config", configRouter);

/** 日志查询接口 */
app.use("/api/logs", logsRouter);

/** OCS 题库配置生成接口 */
app.use("/api/ocs-config", ocsRouter);

module.exports = app;
