/**
 * 纯 SVG 图表工具
 *
 * 不引入任何图表库，使用原生 SVG 绘制柱状图和折线图。
 * 仅用于"今日数据"板块的趋势展示，体积小、零依赖、可直接 v-html 渲染。
 *
 * 暴露：
 *   - window.SvgChart.bar(data, options)   柱状图 HTML
 *   - window.SvgChart.line(data, options)  折线图 HTML
 *   - window.SvgChart.combo(data, options) 双轴折线图 HTML
 *
 * 参数：
 *   data    Array<{label, value, secondary?}>
 *   options { width=600, height=160, padding=24, color='#3b82f6', bg='#f8fafc' }
 */
(function (global) {
  "use strict";

  const DEFAULTS = {
    width: 600,
    height: 180,
    padding: 28,
    color: "#3b82f6",
    colorSecondary: "#10b981",
    bg: "transparent",
    gridColor: "rgba(148,163,184,0.25)",
    textColor: "#64748b",
    showLabels: true,
  };

  /**
   * 简单 HTML 转义，避免 label 含 < > & 破坏 SVG
   * @param {string} s
   * @returns {string}
   */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 计算刻度最大值（向上取整到合适的"整"数）
   * @param {number} max
   * @returns {number}
   */
  function niceMax(max) {
    if (!max || max <= 0) return 1;
    const exp = Math.floor(Math.log10(max));
    const base = Math.pow(10, exp);
    const ratio = max / base;
    let nice;
    if (ratio <= 1) nice = 1;
    else if (ratio <= 2) nice = 2;
    else if (ratio <= 5) nice = 5;
    else nice = 10;
    return nice * base;
  }

  /**
   * 绘制坐标网格
   * @returns {string}
   */
  function gridLines(opts, plotW, plotH) {
    const lines = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = opts.padding + (plotH * i) / steps;
      lines.push(
        `<line x1="${opts.padding}" y1="${y}" x2="${opts.padding + plotW}" y2="${y}" stroke="${opts.gridColor}" stroke-dasharray="2,3" />`
      );
    }
    return lines.join("");
  }

  /**
   * Y 轴刻度文字
   * @returns {string}
   */
  function yAxisLabels(maxValue, opts, plotH) {
    const steps = 4;
    const labels = [];
    for (let i = 0; i <= steps; i++) {
      const v = (maxValue * (steps - i)) / steps;
      const y = opts.padding + (plotH * i) / steps + 4;
      labels.push(
        `<text x="${opts.padding - 6}" y="${y}" text-anchor="end" font-size="10" fill="${opts.textColor}">${formatTick(v)}</text>`
      );
    }
    return labels.join("");
  }

  function formatTick(v) {
    if (v >= 10000) return (v / 1000).toFixed(0) + "k";
    if (v >= 1000) return (v / 1000).toFixed(1) + "k";
    return String(Math.round(v));
  }

  /**
   * X 轴标签（按数据量均匀分布）
   * @returns {string}
   */
  function xAxisLabels(data, opts, plotW) {
    if (!opts.showLabels) return "";
    const n = data.length;
    if (n === 0) return "";
    // 只显示部分标签，避免重叠
    const maxShow = Math.min(n, 8);
    const step = Math.max(1, Math.floor(n / maxShow));
    const out = [];
    for (let i = 0; i < n; i += step) {
      const x = opts.padding + (plotW * (i + 0.5)) / n;
      out.push(
        `<text x="${x}" y="${opts.height - 8}" text-anchor="middle" font-size="10" fill="${opts.textColor}">${esc(data[i].label)}</text>`
      );
    }
    return out.join("");
  }

  /**
   * 柱状图
   * @param {Array<{label:string, value:number}>} data
   * @param {object} options
   * @returns {string} SVG HTML
   */
  function bar(data, options = {}) {
    const opts = Object.assign({}, DEFAULTS, options);
    const list = Array.isArray(data) ? data : [];
    const plotW = opts.width - opts.padding * 2;
    const plotH = opts.height - opts.padding * 2 - 18;
    const max = niceMax(Math.max(1, ...list.map((d) => d.value || 0)));
    const n = list.length || 1;
    const barW = (plotW / n) * 0.6;
    const gap = (plotW / n) * 0.4;

    let bars = "";
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const v = d.value || 0;
      const h = (v / max) * plotH;
      const x = opts.padding + (plotW * i) / n + gap / 2;
      const y = opts.padding + plotH - h;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${opts.color}" rx="3" opacity="0.85">
        <title>${esc(d.label)}: ${esc(d.value)}</title>
      </rect>`;
    }

    return `<svg viewBox="0 0 ${opts.width} ${opts.height}" preserveAspectRatio="xMidYMid meet" class="svg-chart">
      <rect width="${opts.width}" height="${opts.height}" fill="${opts.bg}" />
      ${gridLines(opts, plotW, plotH)}
      ${yAxisLabels(max, opts, plotH)}
      ${bars}
      ${xAxisLabels(list, opts, plotW)}
    </svg>`;
  }

  /**
   * 折线图
   * @param {Array<{label:string, value:number}>} data
   * @param {object} options
   * @returns {string} SVG HTML
   */
  function line(data, options = {}) {
    const opts = Object.assign({}, DEFAULTS, options);
    const list = Array.isArray(data) ? data : [];
    const plotW = opts.width - opts.padding * 2;
    const plotH = opts.height - opts.padding * 2 - 18;
    const max = niceMax(Math.max(1, ...list.map((d) => d.value || 0)));
    const n = list.length || 1;

    let pts = "";
    let dots = "";
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const v = d.value || 0;
      const x = opts.padding + (plotW * i) / Math.max(1, n - 1);
      const y = opts.padding + plotH - (v / max) * plotH;
      pts += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${opts.color}">
        <title>${esc(d.label)}: ${esc(d.value)}</title>
      </circle>`;
    }
    // 闭合到 x 轴的填充
    const lastX = opts.padding + plotW;
    const firstX = opts.padding;
    const baselineY = opts.padding + plotH;
    const fillPath = list.length > 0
      ? `${pts} L${lastX.toFixed(1)} ${baselineY} L${firstX.toFixed(1)} ${baselineY} Z`
      : "";

    return `<svg viewBox="0 0 ${opts.width} ${opts.height}" preserveAspectRatio="xMidYMid meet" class="svg-chart">
      <rect width="${opts.width}" height="${opts.height}" fill="${opts.bg}" />
      ${gridLines(opts, plotW, plotH)}
      ${yAxisLabels(max, opts, plotH)}
      ${list.length > 0 ? `<path d="${fillPath}" fill="${opts.color}" opacity="0.12" />` : ""}
      ${list.length > 0 ? `<path d="${pts}" fill="none" stroke="${opts.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />` : ""}
      ${dots}
      ${xAxisLabels(list, opts, plotW)}
    </svg>`;
  }

  global.SvgChart = { bar, line };
})(window);
