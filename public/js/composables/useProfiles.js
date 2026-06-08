/**
 * useProfiles composable
 *
 * 封装配置档案相关状态与操作（拉取 / 切换 / 保存到档案 / 创建新档案）。
 */
(function (global) {
  "use strict";

  /**
   * @param {object} ctx
   * @param {import("vue").Ref[]} ctx.refs
   * @param {(ok: boolean, msg?: string) => void} [ctx.onAfterChange]  切换成功后的回调
   */
  function useProfiles({ profiles, activeProfileName, profileHistory, onAfterChange }) {
    async function fetchProfiles() {
      const res = await API.getProfiles();
      if (res.code === 1 && res.data) {
        profiles.value = res.data.profiles || [];
        activeProfileName.value = res.data.activeProfile || "default";
        profileHistory.value = res.data.history || [];
      }
    }

    async function switchProfile(name, cb) {
      const res = await API.switchProfile(name);
      if (res.code === 1) {
        if (typeof onAfterChange === "function") await onAfterChange();
        if (typeof cb === "function") cb(true, res.msg);
      } else {
        if (typeof cb === "function") cb(false, res.msg);
      }
    }

    async function saveToProfile(payload, cb) {
      const targetName = activeProfileName.value || "default";
      const res = await API.upsertProfile({ name: targetName, ai: payload.ai });
      if (res.code === 1) {
        await fetchProfiles();
        if (typeof cb === "function") cb(true, res.msg);
      } else {
        if (typeof cb === "function") cb(false, res.msg);
      }
    }

    async function createNewProfile(payload, cb) {
      const res = await API.upsertProfile({
        name: payload.name,
        ai: payload.ai,
        description: payload.description,
      });
      if (res.code !== 1) {
        if (typeof cb === "function") cb(false, res.msg);
        return;
      }
      const switchRes = await API.switchProfile(payload.name);
      if (switchRes.code !== 1) {
        if (typeof cb === "function") cb(false, switchRes.msg);
        return;
      }
      if (typeof onAfterChange === "function") await onAfterChange();
      if (typeof cb === "function") cb(true, switchRes.msg || res.msg);
    }

    return { fetchProfiles, switchProfile, saveToProfile, createNewProfile };
  }

  global.useProfiles = useProfiles;
})(window);
