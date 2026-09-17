/*!
 * CAT API 图表引擎 — charts.js
 * ---------------------------------------------------------------------------
 * 手绘 SVG 灰阶图表。零依赖，浏览器（window.CatCharts）与 Node（require）双用。
 * 数据取自 CatQuantify 与 CatExpression 的真实计算结果。
 *
 * 设计语言：纸灰底、炭黑墨、七级灰阶。
 * 明度即数据：柱状图不断轴，面积一律开方，不透明不发光不留阴影。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CatCharts = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var W = 600, H = 280;
  var PAD = { top: 24, right: 28, bottom: 44, left: 56 };

  // 七级灰阶
  var GRAY = {
    ink: "#1a1a1a",
    g1: "#3a3a3a",
    g2: "#5a5a5a",
    g3: "#7a7a7a",
    g4: "#9a9a9a",
    g5: "#bababa",
    g6: "#dadada",
    bg: "#f5f4f0"
  };

  function svg(attr, inner) {
    var a = Object.keys(attr).map(function (k) { return k + '="' + attr[k] + '"'; }).join(" ");
    return '<svg ' + a + '>' + inner + '</svg>';
  }

  function axisX(x0, x1, y, labels) {
    var ticks = labels.map(function (lab, i) {
      var x = x0 + (x1 - x0) * (i / Math.max(1, labels.length - 1));
      return '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + 4) + '" stroke="' + GRAY.g5 + '"/>' +
        '<text x="' + x + '" y="' + (y + 16) + '" font-size="11" fill="' + GRAY.g3 + '" text-anchor="middle">' + lab + '</text>';
    }).join("");
    return '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="' + GRAY.g4 + '"/>' + ticks;
  }

  function axisY(x, y0, y1, labels) {
    var ticks = labels.map(function (lab, i) {
      var y = y0 + (y1 - y0) * (i / Math.max(1, labels.length - 1));
      return '<line x1="' + (x - 4) + '" y1="' + y + '" x2="' + x + '" y2="' + y + '" stroke="' + GRAY.g5 + '"/>' +
        '<text x="' + (x - 8) + '" y="' + (y + 4) + '" font-size="11" fill="' + GRAY.g3 + '" text-anchor="end">' + lab + '</text>';
    }).join("");
    return '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + y1 + '" stroke="' + GRAY.g4 + '"/>' + ticks;
  }

  // 柱状图
  function barChart(data, title) {
    var inner = PAD.left ? W - PAD.left - PAD.right : W;
    var innerH = H - PAD.top - PAD.bottom;
    var max = Math.max.apply(null, data.map(function (d) { return d.v; }));
    var bw = inner / data.length * 0.65;
    var gap = inner / data.length;

    var bars = data.map(function (d, i) {
      var bh = (d.v / max) * innerH;
      var x = PAD.left + i * gap + (gap - bw) / 2;
      var y = PAD.top + innerH - bh;
      return '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh +
        '" fill="' + (d.color || GRAY.g3) + '">' +
        '<title>' + d.label + ': ' + d.v + '</title></rect>' +
        '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" font-size="10" fill="' + GRAY.g2 + '" text-anchor="middle">' + d.v + '</text>';
    }).join("");

    var labels = data.map(function (d) { return d.label; });
    var body = '<rect width="' + W + '" height="' + H + '" fill="' + GRAY.bg + '"/>' +
      '<text x="' + (W / 2) + '" y="16" font-size="13" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + (title || "") + '</text>' +
      axisY(PAD.left, PAD.top, PAD.top + innerH, [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]) +
      axisX(PAD.left, PAD.left + inner, PAD.top + innerH, labels) +
      bars;
    return svg({ width: W, height: H, viewBox: "0 0 " + W + " " + H, xmlns: "http://www.w3.org/2000/svg" }, body);
  }

  // 折线图
  function lineChart(data, title) {
    var inner = W - PAD.left - PAD.right;
    var innerH = H - PAD.top - PAD.bottom;
    var max = Math.max.apply(null, data.map(function (d) { return d.v; }));
    var min = Math.min.apply(null, data.map(function (d) { return d.v; }));
    var range = max - min || 1;

    var pts = data.map(function (d, i) {
      var x = PAD.left + (inner / Math.max(1, data.length - 1)) * i;
      var y = PAD.top + innerH - ((d.v - min) / range) * innerH;
      return { x: x, y: y, v: d.v, label: d.label };
    });

    var path = pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p.x + " " + p.y; }).join(" ");
    var dots = pts.map(function (p) {
      return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="' + GRAY.ink + '"><title>' + p.label + ': ' + p.v + '</title></circle>';
    }).join("");

    var labels = data.map(function (d) { return d.label; });
    var body = '<rect width="' + W + '" height="' + H + '" fill="' + GRAY.bg + '"/>' +
      '<text x="' + (W / 2) + '" y="16" font-size="13" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + (title || "") + '</text>' +
      axisY(PAD.left, PAD.top, PAD.top + innerH, [max, Math.round((max + min) / 2), min]) +
      axisX(PAD.left, PAD.left + inner, PAD.top + innerH, labels) +
      '<path d="' + path + '" fill="none" stroke="' + GRAY.g1 + '" stroke-width="2"/>' +
      dots;
    return svg({ width: W, height: H, viewBox: "0 0 " + W + " " + H, xmlns: "http://www.w3.org/2000/svg" }, body);
  }

  // 面积图
  function areaChart(data, title) {
    var inner = W - PAD.left - PAD.right;
    var innerH = H - PAD.top - PAD.bottom;
    var max = Math.max.apply(null, data.map(function (d) { return d.v; }));
    var pts = data.map(function (d, i) {
      var x = PAD.left + (inner / Math.max(1, data.length - 1)) * i;
      var y = PAD.top + innerH - (d.v / max) * innerH;
      return { x: x, y: y, v: d.v, label: d.label };
    });
    var path = pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p.x + " " + p.y; }).join(" ");
    var fillPath = path + " L" + (PAD.left + inner) + " " + (PAD.top + innerH) + " L" + PAD.left + " " + (PAD.top + innerH) + " Z";
    var labels = data.map(function (d) { return d.label; });
    var body = '<rect width="' + W + '" height="' + H + '" fill="' + GRAY.bg + '"/>' +
      '<text x="' + (W / 2) + '" y="16" font-size="13" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + (title || "") + '</text>' +
      axisY(PAD.left, PAD.top, PAD.top + innerH, [max, Math.round(max * 0.5), 0]) +
      axisX(PAD.left, PAD.left + inner, PAD.top + innerH, labels) +
      '<path d="' + fillPath + '" fill="' + GRAY.g6 + '"/>' +
      '<path d="' + path + '" fill="none" stroke="' + GRAY.g1 + '" stroke-width="2"/>';
    return svg({ width: W, height: H, viewBox: "0 0 " + W + " " + H, xmlns: "http://www.w3.org/2000/svg" }, body);
  }

  // 环形图
  function donutChart(data, title) {
    var cx = W / 2, cy = H / 2 + 8, r = 80, rIn = 48;
    var total = data.reduce(function (s, d) { return s + d.v; }, 0);
    var angle = -Math.PI / 2;
    var arcs = data.map(function (d) {
      var frac = d.v / total;
      var a2 = angle + frac * Math.PI * 2;
      var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      var xi1 = cx + rIn * Math.cos(a2), yi1 = cy + rIn * Math.sin(a2);
      var xi2 = cx + rIn * Math.cos(angle), yi2 = cy + rIn * Math.sin(angle);
      var large = frac > 0.5 ? 1 : 0;
      var p = "M" + x1 + " " + y1 + " A" + r + " " + r + " 0 " + large + " 1 " + x2 + " " + y2 +
        " L" + xi1 + " " + yi1 + " A" + rIn + " " + rIn + " 0 " + large + " 0 " + xi2 + " " + yi2 + " Z";
      angle = a2;
      return '<path d="' + p + '" fill="' + (d.color || GRAY.g3) + '"><title>' + d.label + ': ' + d.v + '%</title></path>';
    }).join("");

    var legend = data.map(function (d, i) {
      var ly = 40 + i * 18;
      return '<rect x="420" y="' + (ly - 10) + '" width="12" height="12" fill="' + (d.color || GRAY.g3) + '"/>' +
        '<text x="438" y="' + ly + '" font-size="12" fill="' + GRAY.ink + '">' + d.label + ' · ' + d.v + '%</text>';
    }).join("");

    var body = '<rect width="' + W + '" height="' + H + '" fill="' + GRAY.bg + '"/>' +
      '<text x="' + (W / 2) + '" y="16" font-size="13" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + (title || "") + '</text>' +
      arcs +
      '<text x="' + cx + '" y="' + (cy + 4) + '" font-size="14" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + total + '%</text>' +
      legend;
    return svg({ width: W, height: H, viewBox: "0 0 " + W + " " + H, xmlns: "http://www.w3.org/2000/svg" }, body);
  }

  // 热力图
  function heatmap(matrix, rowLabels, colLabels, title) {
    var cellW = (W - PAD.left - PAD.right) / colLabels.length;
    var cellH = (H - PAD.top - PAD.bottom) / rowLabels.length;
    var max = Math.max.apply(null, matrix.flat());

    var cells = "";
    matrix.forEach(function (row, ri) {
      row.forEach(function (v, ci) {
        var intensity = max > 0 ? v / max : 0;
        var grayLevel = Math.round(220 - intensity * 200);
        var fill = "rgb(" + grayLevel + "," + grayLevel + "," + grayLevel + ")";
        cells += '<rect x="' + (PAD.left + ci * cellW) + '" y="' + (PAD.top + ri * cellH) +
          '" width="' + cellW + '" height="' + cellH + '" fill="' + fill + '"/>' +
          '<text x="' + (PAD.left + ci * cellW + cellW / 2) + '" y="' + (PAD.top + ri * cellH + cellH / 2 + 4) +
          '" font-size="11" fill="' + (intensity > 0.5 ? "#fff" : GRAY.ink) + '" text-anchor="middle">' + v + '</text>';
      });
    });

    var colLabs = colLabels.map(function (l, i) {
      return '<text x="' + (PAD.left + i * cellW + cellW / 2) + '" y="' + (PAD.top - 6) +
        '" font-size="11" fill="' + GRAY.g3 + '" text-anchor="middle">' + l + '</text>';
    }).join("");
    var rowLabs = rowLabels.map(function (l, i) {
      return '<text x="' + (PAD.left - 8) + '" y="' + (PAD.top + i * cellH + cellH / 2 + 4) +
        '" font-size="11" fill="' + GRAY.g3 + '" text-anchor="end">' + l + '</text>';
    }).join("");

    var body = '<rect width="' + W + '" height="' + H + '" fill="' + GRAY.bg + '"/>' +
      '<text x="' + (W / 2) + '" y="16" font-size="13" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + (title || "") + '</text>' +
      colLabs + rowLabs + cells;
    return svg({ width: W, height: H, viewBox: "0 0 " + W + " " + H, xmlns: "http://www.w3.org/2000/svg" }, body);
  }

  // 进度条组（用于 DNS 五维）
  function barGroup(data, title) {
    var items = data.map(function (d, i) {
      var y = PAD.top + 10 + i * 36;
      var bw = (d.v / 10) * (W - PAD.left - PAD.right - 100);
      return '<text x="' + PAD.left + '" y="' + (y + 12) + '" font-size="13" fill="' + GRAY.ink + '">' + d.label + '</text>' +
        '<rect x="' + (PAD.left + 90) + '" y="' + y + '" width="' + (W - PAD.left - PAD.right - 100) + '" height="20" fill="' + GRAY.g6 + '"/>' +
        '<rect x="' + (PAD.left + 90) + '" y="' + y + '" width="' + bw + '" height="20" fill="' + (d.color || GRAY.g3) + '"/>' +
        '<text x="' + (PAD.left + 90 + bw + 6) + '" y="' + (y + 14) + '" font-size="12" fill="' + GRAY.ink + '">' + d.v + '</text>';
    }).join("");
    var body = '<rect width="' + W + '" height="' + H + '" fill="' + GRAY.bg + '"/>' +
      '<text x="' + (W / 2) + '" y="16" font-size="13" font-weight="700" fill="' + GRAY.ink + '" text-anchor="middle">' + (title || "") + '</text>' +
      items;
    return svg({ width: W, height: H, viewBox: "0 0 " + W + " " + H, xmlns: "http://www.w3.org/2000/svg" }, body);
  }

  return {
    GRAY: GRAY,
    barChart: barChart,
    lineChart: lineChart,
    areaChart: areaChart,
    donutChart: donutChart,
    heatmap: heatmap,
    barGroup: barGroup
  };
});
