/*!
 * CAT API · astrolabe.js (L4 · 峰值层)
 * ---------------------------------------------------------------------------
 * three.js 黄铜日晷 —— hero 主角
 *
 * 概念：古老天文仪器 × 数字生命
 *   - 外环（meridian ring）：深森林绿，垂直直立
 *   - 黄道环（ecliptic ring）：古铜金，倾斜 23.5°，上挂 6 个状态刻度
 *   - 中央粒子球：猫的本体，呼吸般膨胀收缩
 *   - 当前态：刻度球发光 + 光柱连到中心
 *
 * 交互：
 *   - 持续自转（Y 轴 0.08 rad/s）
 *   - 鼠标移动 → 相机视差跟随（不影响自转）
 *   - 滚动 → 整个日晷缓慢 scale 缩小（配合 GSAP ScrollTrigger）
 *
 * 降级：无 WebGL / 无 three.js → 隐藏自己，保留原 SVG 状态机作为 fallback
 * 性能：仅当 hero 在视口内时渲染（IntersectionObserver）
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ① 降级检查
  if (typeof THREE === "undefined") return;
  var testCanvas = document.createElement("canvas");
  var gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
  if (!gl) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ② 老钱色板（three.js 用 0x 十六进制）
  var COLORS = {
    forest: 0x1b3a2e,
    gold: 0xc8a35e,
    goldBright: 0xe8c785,
    ivory: 0xfaf8f5,
    charcoal: 0x2c2c2a
  };

  // ③ 状态配置：6 个刻度，对应 CAT RUNTIME 的 6 状态
  var STATES = [
    { name: "疯跑", time: "02:00", key: "ZOOMIES" },
    { name: "进食", time: "06:00", key: "EAT" },
    { name: "理毛", time: "09:00", key: "GROOM" },
    { name: "睡觉", time: "13:00", key: "SLEEP" },
    { name: "巡视", time: "17:00", key: "PATROL" },
    { name: "玩耍", time: "20:00", key: "PLAY" }
  ];

  // ④ 启动
  function start() {
    var container = document.querySelector(".hero-machine");
    if (!container) return;

    // 找到现有 SVG 状态机作为尺寸参考和 fallback
    var svgFallback = container.querySelector(".machine-svg");
    var width = Math.min(container.clientWidth - 56, 760);
    var height = Math.round(width * 0.55);

    // 创建 canvas 容器
    var canvasWrap = document.createElement("div");
    canvasWrap.className = "astrolabe-canvas-wrap";
    canvasWrap.style.cssText =
      "position:relative;width:100%;max-width:" + width + "px;height:" + height + "px;" +
      "margin:0 auto;display:block;";

    // 状态标签（HTML overlay，跟随当前激活态）
    var caption = document.createElement("div");
    caption.className = "astrolabe-caption";
    caption.style.cssText =
      "position:absolute;bottom:14px;left:0;right:0;text-align:center;" +
      "font-family:Georgia,serif;font-size:13px;color:#5F5E5A;letter-spacing:0.08em;";
    caption.innerHTML =
      '<span style="color:#C8A35E;font-size:11px;letter-spacing:0.18em;">CURRENT · </span>' +
      '<span class="astrolabe-state-name" style="color:#1B3A2E;font-weight:600;"></span>' +
      '<span class="astrolabe-state-time" style="color:#888780;margin-left:8px;"></span>';
    canvasWrap.appendChild(caption);

    // 隐藏原 SVG（保留 DOM 作为降级）
    if (svgFallback) svgFallback.style.display = "none";
    container.querySelector(".machine-frame").appendChild(canvasWrap);

    // ====== three.js 场景 ======
    var scene = new THREE.Scene();
    // 不要背景色，让 CSS 的渐变透出来
    var camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.8, 6.5);
    camera.lookAt(0, 0, 0);

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasWrap.appendChild(renderer.domElement);

    // ====== 灯光 ======
    var ambient = new THREE.AmbientLight(COLORS.ivory, 0.6);
    scene.add(ambient);

    var keyLight = new THREE.DirectionalLight(COLORS.goldBright, 0.9);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(COLORS.forest, 0.4);
    fillLight.position.set(-3, -2, 3);
    scene.add(fillLight);

    // ====== 主组（自转 + 视差）======
    var astrolabe = new THREE.Group();
    scene.add(astrolabe);

    // ====== 外环（垂直，深绿）======
    var meridianGeo = new THREE.TorusGeometry(2.4, 0.025, 16, 120);
    var meridianMat = new THREE.MeshStandardMaterial({
      color: COLORS.forest,
      metalness: 0.6,
      roughness: 0.35,
      emissive: COLORS.forest,
      emissiveIntensity: 0.08
    });
    var meridian = new THREE.Mesh(meridianGeo, meridianMat);
    meridian.rotation.y = Math.PI / 2; // 垂直面向相机
    astrolabe.add(meridian);

    // ====== 黄道环（倾斜 23.5°，金色）======
    var eclipticGeo = new THREE.TorusGeometry(2.0, 0.02, 16, 120);
    var eclipticMat = new THREE.MeshStandardMaterial({
      color: COLORS.gold,
      metalness: 0.85,
      roughness: 0.25,
      emissive: COLORS.gold,
      emissiveIntensity: 0.15
    });
    var ecliptic = new THREE.Mesh(eclipticGeo, eclipticMat);
    ecliptic.rotation.x = Math.PI / 2 + (23.5 * Math.PI) / 180; // 黄道倾角
    astrolabe.add(ecliptic);

    // ====== 6 个状态刻度球（沿黄道环均布）======
    var markerGeo = new THREE.SphereGeometry(0.09, 20, 20);
    var markers = [];
    STATES.forEach(function (state, i) {
      var angle = (i / STATES.length) * Math.PI * 2;
      // 在黄道环局部坐标系里
      var localX = Math.cos(angle) * 2.0;
      var localY = Math.sin(angle) * 2.0;
      var localZ = 0;

      // 把黄道环的 tilt 应用上
      var tilt = (23.5 * Math.PI) / 180;
      var worldY = localY * Math.cos(tilt);
      var worldZ = localY * Math.sin(tilt);

      var mat = new THREE.MeshStandardMaterial({
        color: COLORS.gold,
        metalness: 0.9,
        roughness: 0.2,
        emissive: COLORS.gold,
        emissiveIntensity: 0.3
      });
      var marker = new THREE.Mesh(markerGeo, mat);
      marker.position.set(localX, worldY, worldZ);
      marker.userData.stateIndex = i;
      marker.userData.state = state;
      astrolabe.add(marker);
      markers.push(marker);
    });

    // ====== 中央粒子球（猫的本体）======
    var particleCount = 1800;
    var particleGeo = new THREE.BufferGeometry();
    var positions = new Float32Array(particleCount * 3);
    var colors = new Float32Array(particleCount * 3);
    var ivoryColor = new THREE.Color(COLORS.ivory);
    var goldColor = new THREE.Color(COLORS.gold);
    var forestColor = new THREE.Color(COLORS.forest);

    for (var i = 0; i < particleCount; i++) {
      // 球体内均匀分布，但偏向表面
      var r = 0.7 + Math.random() * 0.25;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // 颜色：70% 暖象牙，20% 古铜金，10% 深森林绿
      var t = Math.random();
      var c;
      if (t < 0.7) c = ivoryColor;
      else if (t < 0.9) c = goldColor;
      else c = forestColor;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    var particleMat = new THREE.PointsMaterial({
      size: 0.022,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false
    });
    var particles = new THREE.Points(particleGeo, particleMat);
    astrolabe.add(particles);

    // ====== 光柱（连接当前态与中心）======
    var beamGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 8);
    var beamMat = new THREE.MeshBasicMaterial({
      color: COLORS.goldBright,
      transparent: true,
      opacity: 0.6
    });
    var beam = new THREE.Mesh(beamGeo, beamMat);
    beam.visible = false;
    astrolabe.add(beam);

    // ====== 状态轮转：每 6 秒切到下一个状态 ======
    var currentStateIdx = 0;
    var stateNameEl = caption.querySelector(".astrolabe-state-name");
    var stateTimeEl = caption.querySelector(".astrolabe-state-time");

    function setActiveState(idx) {
      currentStateIdx = idx;
      var state = STATES[idx];
      stateNameEl.textContent = state.name;
      stateTimeEl.textContent = state.time;
      markers.forEach(function (m, i) {
        if (i === idx) {
          m.material.emissiveIntensity = 1.2;
          m.scale.setScalar(1.5);
        } else {
          m.material.emissiveIntensity = 0.3;
          m.scale.setScalar(1.0);
        }
      });
      // 光柱指向当前态
      var m = markers[idx];
      var mid = m.position.clone().multiplyScalar(0.5);
      beam.position.copy(mid);
      beam.scale.y = m.position.length();
      beam.lookAt(m.position.clone().add(astrolabe.position));
      beam.rotateX(Math.PI / 2);
      beam.visible = true;
    }
    setActiveState(0);
    setInterval(function () {
      setActiveState((currentStateIdx + 1) % STATES.length);
    }, 6000);

    // ====== 鼠标视差 ======
    var mouseX = 0, mouseY = 0;
    document.addEventListener("mousemove", function (e) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // ====== 滚动缩放（供 GSAP 调用）======
    var scrollScale = 1.0;
    window.__astrolabeSetScale = function (s) { scrollScale = s; };

    // ====== 视口内才渲染 ======
    var isVisible = true;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        isVisible = entries[0].isIntersecting;
      }, { threshold: 0 });
      io.observe(canvasWrap);
    }

    // ====== 渲染循环 ======
    var clock = new THREE.Clock();
    function tick() {
      requestAnimationFrame(tick);
      if (!isVisible) return;

      var t = clock.getElapsedTime();

      // 自转
      astrolabe.rotation.y = t * 0.08;

      // 呼吸（粒子球 scale）
      var breathe = 1 + Math.sin(t * 0.6) * 0.04;
      particles.scale.setScalar(breathe);

      // 鼠标视差
      camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.04;
      camera.position.y += (0.8 - mouseY * 0.3 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      // 滚动缩放
      astrolabe.scale.setScalar(scrollScale);

      renderer.render(scene, camera);
    }
    tick();

    // ====== resize ======
    window.addEventListener("resize", function () {
      var w = Math.min(container.clientWidth - 56, 760);
      var h = Math.round(w * 0.55);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      canvasWrap.style.maxWidth = w + "px";
      canvasWrap.style.height = h + "px";
    });

    // 暴露给 ScrollTrigger 用
    window.__astrolabe = astrolabe;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
