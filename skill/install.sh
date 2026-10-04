#!/bin/sh
# CAT API 安装包 —— install.sh
# ---------------------------------------------------------------------------
# 取说明书、取命令行实现、领养、复算、卸载全封在这里。
# 对外只剩一条命令：
#
#   curl -fsSL https://lijinhongucl-pixel.github.io/cat-api-spec/skill/install.sh \
#     | sh -s -- --adopter "你@这台机器"
#
# 这个脚本做的事：
#   1. 把 skill/cat-api.js 放到 ~/.cat-api/cat-api.js
#   2. 在 PATH 里铺一个 cat-api 软链（或 wrapper）
#   3. 写一份领养记录到 ~/.cat-api/adoption.json
#   4. 复算一次领养 KEY 并打印领养证
#
# 它不做的事：不装 npm 包，不联网（除下载自身），不写系统目录，不注册后台服务。
# 卸载就是删掉 ~/.cat-api 和那条软链 —— 因为卸载不撤销任何东西。

set -e

# 输出是中文，确保 locale 是 UTF-8，否则部分终端会显示乱码
LANG="${LANG:-en_US.UTF-8}"
export LANG
LC_ALL="${LC_ALL:-en_US.UTF-8}"
export LC_ALL

ADOPTER=""
COHORT=""
HABITAT=""
INTENT=""

PREFIX="$HOME/.cat-api"
BIN_DIR="$HOME/.local/bin"
BASE_URL="https://lijinhongucl-pixel.github.io/cat-api-spec"

while [ $# -gt 0 ]; do
  case "$1" in
    --adopter) ADOPTER="$2"; shift 2 ;;
    --adopter=*) ADOPTER="${1#*=}"; shift ;;
    --cohort) COHORT="$2"; shift 2 ;;
    --cohort=*) COHORT="${1#*=}"; shift ;;
    --habitat) HABITAT="$2"; shift 2 ;;
    --habitat=*) HABITAT="${1#*=}"; shift ;;
    --intent) INTENT="$2"; shift 2 ;;
    --intent=*) INTENT="${1#*=}"; shift ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help)
      cat <<'EOF'
  CAT API 安装包

  用法
    curl -fsSL https://lijinhongucl-pixel.github.io/cat-api-spec/skill/install.sh \
      | sh -s -- [选项]

  选项
    --adopter <名>    领养人。不给会在终端里问一句。
    --cohort  <时刻>  领养时刻，UTC 秒精度。默认用当前时刻。
    --habitat <目录>  栖息地，技能安装目录。默认 ~/.cat-api
    --intent  <用途>  声明用途。只进摘要，不进名字。
    --prefix  <目录>  同 --habitat。
    --uninstall       卸载（删掉安装目录和软链）。
    -h, --help        本页

  装完你会拿到
    一条 cat-api 命令，和一张登记来源的领养证。
    名字是派发的，不是挑的。

  卸载
    sh install.sh --uninstall
EOF
      exit 0 ;;
    *) echo "未知选项：$1（跑 --help）" >&2; exit 1 ;;
  esac
done

# ---------- 卸载 ----------
if [ "$UNINSTALL" = "1" ]; then
  echo "正在卸载 CAT API…"
  if [ -L "$BIN_DIR/cat-api" ]; then rm -f "$BIN_DIR/cat-api"; echo "  删掉软链 $BIN_DIR/cat-api"; fi
  if [ -f "$PREFIX/cat-api.js" ]; then rm -f "$PREFIX/cat-api.js"; echo "  删掉 $PREFIX/cat-api.js"; fi
  echo "  保留 $PREFIX/adoption.json —— 卸载不撤销任何东西。"
  echo "完成。领养记录还在，只是不再有人替你开门。"
  exit 0
fi

# ---------- 领养人 ----------
if [ -z "$ADOPTER" ]; then
  printf "  这台机器要叫什么？ [这台机器] " >&2
  read -r ADOPTER
  ADOPTER="${ADOPTER:-这台机器}"
fi

[ -z "$COHORT" ] && COHORT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[ -z "$HABITAT" ] && HABITAT="$PREFIX"
[ -z "$INTENT" ] && INTENT="给 AI 读"

# --habitat 同时作为安装前缀：领养地就是安装地
PREFIX="$HABITAT"

echo ""
echo "  CAT API 领养元组"
echo "    领养人    $ADOPTER"
echo "    领养时刻  $COHORT"
echo "    栖息地    $HABITAT"
echo "    声明用途  $INTENT"
echo ""

# ---------- 安装 ----------
echo "  正在安装到 $PREFIX …"
mkdir -p "$PREFIX"
mkdir -p "$BIN_DIR"

# 优先从同源下载，失败则用本地同目录（开发时）
SRC="unknown"
for u in "$BASE_URL/skill/cat-api.js" "$(dirname "$0")/cat-api.js"; do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsSL "$u" -o "$PREFIX/cat-api.js.tmp" 2>/dev/null; then
      SRC="同源下载"; mv "$PREFIX/cat-api.js.tmp" "$PREFIX/cat-api.js"; break
    fi
  fi
  if [ -f "$u" ]; then
    cp "$u" "$PREFIX/cat-api.js"; SRC="本地同目录"; break
  fi
  rm -f "$PREFIX/cat-api.js.tmp" 2>/dev/null || true
done

if [ ! -s "$PREFIX/cat-api.js" ]; then
  echo "  ✗ 没能取到 cat-api.js。检查网络，或从仓库 clone 后本地跑。" >&2
  exit 1
fi
# curl 不会保留执行位，软链过去就 permission denied
chmod +x "$PREFIX/cat-api.js" 2>/dev/null || true
echo "  ✓ cat-api.js  来源=$SRC"

# 铺软链；软链失败（Windows / 无权限）就退到 wrapper
if ln -sf "$PREFIX/cat-api.js" "$BIN_DIR/cat-api" 2>/dev/null; then
  echo "  ✓ 软链 $BIN_DIR/cat-api"
else
  cat > "$BIN_DIR/cat-api" <<EOF
#!/bin/sh
exec node "$PREFIX/cat-api.js" "\$@"
EOF
  chmod +x "$BIN_DIR/cat-api"
  echo "  ✓ wrapper $BIN_DIR/cat-api（软链不可用，退到 wrapper）"
fi

# ---------- 领养记录 ----------
node -e '
var fs = require("fs"), path = require("path"), crypto = require("crypto");
var adopter = process.argv[1], cohort = process.argv[2],
    habitat = process.argv[3], intent = process.argv[4], prefix = process.argv[5];

// 领养 KEY = 前 8 字节摘要（与网页端 adoption-key.js 同算法）
var payload = JSON.stringify([adopter, cohort, habitat, intent]);
var key = "CAT-" + crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16).toUpperCase();

// 领养名 = 同一份摘要派生的另一个切片（名字不进 KEY）
var h = crypto.createHash("sha256").update(payload).digest("hex");
var COATS = ["墨","雪","松","金","灰","栗","黛","绯"];
var COLORS = ["三花","玳瑁","银渐层","金渐层","奶牛","狸花","纯黑","橘"];
var a = parseInt(h.slice(0,2),16) % COATS.length;
var b = parseInt(h.slice(2,4),16) % COLORS.length;
var name = COATS[a] + "·" + COLORS[b];

var rec = {
  key: key, name: name,
  adopter: adopter, cohort: cohort, habitat: habitat, intent: intent,
  installed_at: new Date().toISOString(),
  note: "本页不写入任何文件。卸载技能不会删掉这张证——卸载不撤销任何东西。"
};
fs.mkdirSync(prefix, { recursive: true });
fs.writeFileSync(path.join(prefix, "adoption.json"), JSON.stringify(rec, null, 2));
console.log("  ✓ 领养证 " + path.join(prefix, "adoption.json"));
console.log("");
console.log("  领养证");
console.log("    KEY   " + key);
console.log("    名字  " + name + "（派发的，不是挑的）");
' "$ADOPTER" "$COHORT" "$HABITAT" "$INTENT" "$PREFIX"

echo ""
echo "  验证"
echo "    cat-api            列出 12 个端点"
echo "    cat-api state      查当前状态"
echo "    cat-api --help     完整说明"
echo ""
echo "  领养证在 $PREFIX/adoption.json"
echo "  卸载：sh install.sh --uninstall"
echo ""
echo "  没有 Owner 角色。你是 Staff。"
echo ""
