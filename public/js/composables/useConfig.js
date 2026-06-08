/**
 * useConfig composable
 *
 * 封装配置拉取 / 保存相关状态与副作用。
 * 返回 { config, editConfig, fetchConfig, saveConfig }
 *
 * 依赖：window.API（后端 fetch 封装）
 */
(function (global) {
  "use strict";

  /**
   * @param {object} ctx
   * @param {import("vue").Ref} ctx.config       配置响应式 ref
   * @param {object} ctx.editConfig             配置编辑响应式对象
   * @param {(msg: string, type?: string) => void} ctx.showToast
   */
  function useConfig({ config, editConfig, showToast }) {
    /**
     * 拉取配置并深拷贝到 editConfig
     */
    async function fetchConfig() {
      const res = await API.getConfig();
      if (res.code === 1) {
        config.value = res.data;
        const copy = JSON.parse(JSON.stringify(res.data));
        Object.assign(editConfig, copy);
        if (!editConfig.ai) editConfig.ai = {};
        if (!("temperature" in editConfig.ai)) editConfig.ai.temperature = null;
        if (!("topP" in editConfig.ai)) editConfig.ai.topP = null;
      } else {
        showToast("获取配置失败: " + (res.msg || ""), "error");
      }
    }

    /**
     * 保存当前 editConfig 到后端
     */
    async function saveConfig(payload) {
      if (config.value && !config.value.ai) {
        showToast("当前为档案模式，请使用上方档案保存按钮", "error");
        return false;
      }
      const res = await API.saveConfig(payload);
      if (res.code === 1) {
        showToast("配置保存成功");
        await fetchConfig();
        return true;
      }
      showToast(res.msg || "保存失败", "error");
      return false;
    }

    return { fetchConfig, saveConfig };
  }

  global.useConfig = useConfig;
})(window);
