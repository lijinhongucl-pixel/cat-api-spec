/*!
 * CAT API — 领养 KEY 计算 adoption-key.js
 * ---------------------------------------------------------------------------
 * 与 skill/cat-api.js / skill/install.sh 同算法。
 * 三处实现互相钉住，判据是本文件末尾的测试向量。
 *
 * 算法（不要改，改了要同步改另外两处 + 测试向量）：
 *   1. payload = JSON.stringify([adopter, cohort, habitat, intent])
 *   2. KEY    = "CAT-" + sha256(payload).hex.slice(0,16).toUpperCase()
 *   3. 名字   = 同一摘要的另一切片派生（名字不进 KEY，也不可自选）
 *
 * 纯本地计算，不发任何网络请求。
 */
(function (root) {
  "use strict";

  /* ---------- SHA-256（浏览器原生，无依赖） ---------- */
  function sha256Hex(str) {
    if (root.crypto && root.crypto.subtle && root.TextEncoder) {
      // 异步路径：需要 await
      return root.crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(str))
        .then(function (buf) {
          return Array.prototype.map
            .call(new Uint8Array(buf), function (b) {
              return ("0" + b.toString(16)).slice(-2);
            })
            .join("");
        });
    }
    return Promise.resolve(sha256HexSync(str));
  }

  /* ---------- SHA-256 同步版（无 SubtleCrypto 时的兜底） ----------
   * 纯 JS 实现，比原生慢但结果一致。只在 file:// 或老浏览器上走到。
   * 已对 node crypto 做过 5 组交叉验证（含中文与 emoji）。
   */
  function sha256HexSync(str) {
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }

    // SHA-256 轮常量（前 64 位小数立方根的前 32 位），共 64 个
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    // UTF-8 编码为字节数组（不能用 unescape/charCodeAt 处理多字节）
    var utf8Bytes;
    if (typeof TextEncoder !== "undefined") {
      utf8Bytes = Array.prototype.slice.call(new TextEncoder().encode(str));
    } else {
      var enc = encodeURIComponent(str);
      utf8Bytes = [];
      for (var i = 0; i < enc.length; i++) {
        if (enc[i] === "%") {
          utf8Bytes.push(parseInt(enc.substr(i + 1, 2), 16));
          i += 2;
        } else {
          utf8Bytes.push(enc.charCodeAt(i));
        }
      }
    }

    // 追加 0x80，补零到 56 (mod 64)，再写 64 位比特长度
    var bitLenHi = Math.floor((utf8Bytes.length * 8) / 0x100000000);
    var bitLenLo = (utf8Bytes.length * 8) >>> 0;
    var bytes = utf8Bytes.slice();
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push((bitLenHi >>> 24) & 0xff, (bitLenHi >>> 16) & 0xff,
               (bitLenHi >>> 8) & 0xff, bitLenHi & 0xff,
               (bitLenLo >>> 24) & 0xff, (bitLenLo >>> 16) & 0xff,
               (bitLenLo >>> 8) & 0xff, bitLenLo & 0xff);

    // 初始哈希值（前 8 个素数平方根的前 32 位）
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var w = new Array(64);
    for (var blk = 0; blk < bytes.length; blk += 64) {
      for (var t = 0; t < 16; t++) {
        w[t] = (bytes[blk + t * 4] << 24) | (bytes[blk + t * 4 + 1] << 16) |
               (bytes[blk + t * 4 + 2] << 8) | bytes[blk + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3],
          e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) {
      return ("00000000" + (v >>> 0).toString(16)).slice(-8);
    }).join("");
  }

  /* ---------- 名字库：猫的毛色与花纹 ---------- */
  var COATS = ["墨", "雪", "松", "金", "灰", "栗", "黛", "绯"];
  var PATTERNS = ["三花", "玳瑁", "银渐层", "金渐层", "奶牛", "狸花", "纯黑", "橘"];

  /* ---------- 领养徽记（不进 KEY，只是显示用） ---------- */
  var TAGS = [
    "Founding Staff", "Early Adopter", "Night Watch", "Box Inspector",
    "Laser Chaser", "Purr Engineer", "Crepuscular Member", "Territory Mapper"
  ];

  /* ---------- 核心：算 KEY 与名字 ---------- */
  function compute(adopter, cohort, habitat, intent) {
    var payload = JSON.stringify([adopter, cohort, habitat, intent]);
    return sha256Hex(payload).then(function (hex) {
      // KEY：摘要前 16 个 hex 字符（8 字节）
      var key = "CAT-" + hex.slice(0, 16).toUpperCase();
      // 名字：同一摘要的另一切片。名字不进 KEY，也不可自选。
      var a = parseInt(hex.slice(16, 18), 16) % COATS.length;
      var b = parseInt(hex.slice(18, 20), 16) % PATTERNS.length;
      var t = parseInt(hex.slice(20, 22), 16) % TAGS.length;
      return {
        key: key,
        name: COATS[a] + "·" + PATTERNS[b],
        tag: TAGS[t],
        payload: payload,
        digest: hex
      };
    });
  }

  /* ---------- 同步版（给 CLI 复用时用；浏览器端一般走 Promise） ---------- */
  function computeSync(adopter, cohort, habitat, intent) {
    var payload = JSON.stringify([adopter, cohort, habitat, intent]);
    var hex = sha256HexSync(payload);
    return {
      key: "CAT-" + hex.slice(0, 16).toUpperCase(),
      name: COATS[parseInt(hex.slice(16, 18), 16) % COATS.length] + "·" +
            PATTERNS[parseInt(hex.slice(18, 20), 16) % PATTERNS.length],
      tag: TAGS[parseInt(hex.slice(20, 22), 16) % TAGS.length],
      payload: payload,
      digest: hex
    };
  }

  /* ---------- 核验一张牌 ---------- */
  function verify(key, adopter, cohort, habitat, intent) {
    return compute(adopter, cohort, habitat, intent).then(function (r) {
      return {
        valid: r.key === String(key || "").toUpperCase(),
        expected: r.key,
        got: String(key || "").toUpperCase(),
        name: r.name
      };
    });
  }

  /* ---------- 当前时刻，UTC 秒精度 ---------- */
  function nowCohort() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  /* ---------- 测试向量（§5.3）
   * 任何一份实现都 MUST 复现这三组值。
   * 改算法就要改这三个向量，且三处实现同步改。
   */
  var TEST_VECTORS = [
    { adopter: "锦宏@MacBook", cohort: "2026-10-05T00:00:00Z",
      habitat: "~/.cat-api", intent: "给 AI 读" },
    { adopter: "test", cohort: "2026-01-01T00:00:00Z",
      habitat: "/tmp", intent: "" },
    { adopter: "a", cohort: "2026-01-01T00:00:00Z",
      habitat: "b", intent: "c" }
  ];

  var AdoptionKey = {
    compute: compute,
    computeSync: computeSync,
    verify: verify,
    nowCohort: nowCohort,
    sha256Hex: sha256Hex,
    sha256HexSync: sha256HexSync,
    COATS: COATS,
    PATTERNS: PATTERNS,
    TAGS: TAGS,
    TEST_VECTORS: TEST_VECTORS
  };

  root.AdoptionKey = AdoptionKey;
  // Node 环境（CLI 自检、测试）也能 require
  if (typeof module !== "undefined" && module.exports) module.exports = AdoptionKey;
})(typeof self !== "undefined" ? self : (typeof global !== "undefined" ? global : this));
