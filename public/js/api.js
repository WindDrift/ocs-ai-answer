/**
 * 后端 API 调用封装
 *
 * 统一管理 fetch 调用、错误处理与 JSON 解析。
 *
 * 暴露：
 *   - window.API.getConfig            GET  /api/config
 *   - window.API.saveConfig           POST /api/config
 *   - window.API.getLogs              GET  /api/logs
 *   - window.API.getTodayStats        GET  /api/logs/today
 *   - window.API.getRangeStats        GET  /api/logs/range?window=...
 *   - window.API.getOcsConfig         GET  /api/ocs-config
 *   - window.API.getStatus            GET  /api/status
 *   - window.API.getProfiles          GET  /api/config/profiles
 *   - window.API.switchProfile        POST /api/config/profiles/switch
 *   - window.API.getProfileHistory    GET  /api/config/profiles/history
 *   - window.API.upsertProfile        POST /api/config/profiles/upsert
 */
(function (global) {
  "use strict";

  /**
   * 统一 fetch 封装
   * @param {string} url
   * @param {object} [options]
   * @returns {Promise<{code:number, data?:any, msg?:string}>}
   */
  async function request(url, options = {}) {
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      if (!res.ok) {
        return { code: 0, msg: `HTTP ${res.status} ${res.statusText}` };
      }
      return await res.json();
    } catch (e) {
      return { code: 0, msg: e.message || "网络请求失败" };
    }
  }

  const API = {
    getConfig() {
      return request("/api/config");
    },
    saveConfig(payload) {
      return request("/api/config", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    getLogs() {
      return request("/api/logs");
    },
    getTodayStats(date) {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      return request("/api/logs/today" + qs);
    },
    getRangeStats(window) {
      const key = window || "24h";
      return request(`/api/logs/range?window=${encodeURIComponent(key)}`);
    },
    getOcsConfig() {
      return request("/api/ocs-config");
    },
    getStatus() {
      return request("/api/status");
    },
    getProfiles() {
      return request("/api/config/profiles");
    },
    switchProfile(name) {
      return request("/api/config/profiles/switch", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    getProfileHistory() {
      return request("/api/config/profiles/history");
    },
    upsertProfile(payload) {
      return request("/api/config/profiles/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };

  global.API = API;
})(window);
