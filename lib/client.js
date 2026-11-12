/**
 * dsh-wallpaper 浏览器半。
 *
 * 目标：在不改动 DSH 安装包的前提下，把一张壁纸铺到 Web GUI 的最底层，
 * 并把应用外壳的实色面板替换成半透明“玻璃”，让壁纸透出来。
 *
 * 实现要点：
 * 1. 层：body 里插一个 fixed、z-index:-1 的 #dsh-wallpaper-layer，壁纸与遮罩都在这里；
 *    同时把 html/body/#root 以及 --dsw-alias-bg-base 置为透明，壁纸才能透出来。
 *    注意 DSH 的主题变量定义在 body 上（body / body[data-ds-dark-theme]），
 *    覆盖必须落在 body 上，只写 html 会被 body 的声明遮蔽。
 * 2. 玻璃：用 !important 覆盖 --dsw-alias-bg-layer-1/2/3、bg-overlay、specific-sidebar-fill，
 *    透明度由面板不透明度滑块控制，亮暗模式各用一套底色。
 * 3. 设置：注册一个 settings.section（设置 → 壁纸），改完即时生效并写入 localStorage。
 * 4. 图片只在浏览器里压缩（canvas → webp，最长边 2560）后存 IndexedDB，不上传。
 */
window.__ModuleLoader__.load({
  id: "dsh-wallpaper",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var react = require("react");
    var h = react.createElement;
    var useState = react.useState;
    var useEffect = react.useEffect;

    var NS = "dsh-wallpaper";
    var name = "dsh-wallpaper";
    var inject = ["slots", "locale"];

    var SETTINGS_KEY = "dsh-wallpaper:settings:v1";
    var IMAGE_KEY = "dsh-wallpaper:image:v1";
    var STYLE_ID = "dsh-wallpaper-style";
    var LAYER_ID = "dsh-wallpaper-layer";

    var DEFAULTS = {
      enabled: true,
      source: "preset",
      preset: "aurora",
      scrim: 0.45,
      blur: 0,
      glass: true,
      pane: 0.82,
      themeMode: "auto"
    };

    var PRESETS = [
      {
        id: "aurora",
        zh: "极光",
        en: "Aurora",
        css:
          "radial-gradient(1100px 620px at 12% -10%, #38bdf8 0%, rgba(56,189,248,0) 62%)," +
          "radial-gradient(900px 640px at 92% 4%, #a78bfa 0%, rgba(167,139,250,0) 58%)," +
          "linear-gradient(158deg, #0b1220 0%, #17233a 48%, #334155 100%)"
      },
      {
        id: "dusk",
        zh: "暮色",
        en: "Dusk",
        css:
          "radial-gradient(900px 520px at 18% 0%, #fde2e4 0%, rgba(253,226,228,0) 60%)," +
          "radial-gradient(800px 600px at 88% 12%, #c5dedd 0%, rgba(197,222,221,0) 62%)," +
          "linear-gradient(160deg, #fad2e1 0%, #efe7dd 55%, #dbe7e4 100%)"
      },
      {
        id: "forest",
        zh: "森林",
        en: "Forest",
        css:
          "radial-gradient(1000px 620px at 8% 0%, #d8f3dc 0%, rgba(216,243,220,0) 58%)," +
          "linear-gradient(158deg, #b7e4c7 0%, #74c69d 52%, #2d6a4f 100%)"
      },
      {
        id: "paper",
        zh: "米纸",
        en: "Paper",
        css: "linear-gradient(180deg, #fbf8f3 0%, #f3ede2 60%, #e9e1d3 100%)"
      },
      {
        id: "midnight",
        zh: "午夜",
        en: "Midnight",
        css:
          "radial-gradient(820px 480px at 82% -6%, #312e81 0%, rgba(49,46,129,0) 60%)," +
          "radial-gradient(700px 500px at 8% 90%, #0f766e 0%, rgba(15,118,110,0) 55%)," +
          "linear-gradient(160deg, #020617 0%, #0b1120 58%, #111827 100%)"
      }
    ];

    var DICT = {
      zh: {
        nav: "壁纸",
        title: "壁纸",
        desc: "把图片或内置渐变铺在界面最底层，并让面板变成半透明玻璃。设置只保存在本机浏览器里。",
        enable: "启用壁纸",
        mode: "遮罩配色",
        auto: "跟随主题",
        light: "浅色",
        dark: "深色",
        imageTitle: "本地图片",
        choose: "选择图片…",
        remove: "移除图片",
        noImage: "还没有图片。点击“选择图片”，或把图片拖到这里；会自动压缩到最长边 2560 像素再保存。",
        imageSet: "已选择本地图片",
        imageUnused: "已选择本地图片，当前显示的是内置渐变。",
        drop: "也可以把图片直接拖进来",
        presets: "内置渐变",
        tuning: "外观调节",
        scrim: "遮罩浓度",
        scrimHint: "遮罩越浓，文字越清晰，壁纸越淡。",
        blur: "模糊",
        glass: "玻璃面板",
        glassHint: "关闭后只保留背景壁纸，面板恢复原来的实色。",
        pane: "面板不透明度",
        paneHint: "数值越小越通透；文字发灰时可以调高。",
        reset: "恢复默认",
        tooBig: "图片太大，浏览器存储放不下。请换小一点的图片（建议 4MB 以内）。",
        storageWarn: "壁纸已更新，但浏览器没能保存这张图，刷新后可能需要重新选择。",
        failed: "处理图片失败：",
        saving: "正在处理图片…",
        saved: "已保存，壁纸已即时更新。",
        hint: "壁纸是浏览器本地设置：换浏览器或清理站点数据后会丢失，重新选一次即可。"
      },
      en: {
        nav: "Wallpaper",
        title: "Wallpaper",
        desc: "Paints an image or a built-in gradient behind the whole UI and turns panels into translucent glass. Settings stay in this browser.",
        enable: "Enable wallpaper",
        mode: "Veil color",
        auto: "Follow theme",
        light: "Light",
        dark: "Dark",
        imageTitle: "Local image",
        choose: "Choose image…",
        remove: "Remove image",
        noImage: "No image yet. Click “Choose image…” or drop a file here; it is downscaled to 2560px on the long edge before it is stored.",
        imageSet: "Local image selected",
        imageUnused: "A local image is selected, but the built-in gradient is showing.",
        drop: "You can also drop an image right here",
        presets: "Built-in gradients",
        tuning: "Appearance",
        scrim: "Veil strength",
        scrimHint: "Stronger veil keeps text crisp and fades the wallpaper.",
        blur: "Blur",
        glass: "Glass panels",
        glassHint: "Off keeps the wallpaper but restores opaque panels.",
        pane: "Panel opacity",
        paneHint: "Lower is more transparent; raise it if text feels washed out.",
        reset: "Reset",
        tooBig: "The image is too large for browser storage. Try a smaller file (about 4MB or less).",
        storageWarn: "The wallpaper updated, but the browser could not store the image; you may need to pick it again after a reload.",
        failed: "Could not process the image: ",
        saving: "Processing image…",
        saved: "Saved — the wallpaper updated immediately.",
        hint: "This is a local browser setting: another browser or cleared site data loses it; just pick the image again."
      }
    };

    /* ------------------------------------------------------------------ */
    /* 状态与持久化                                                        */
    /* ------------------------------------------------------------------ */

    function clamp(value, min, max, fallback) {
      var n = Number(value);
      if (!isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }

    function normalize(raw) {
      var src = raw && typeof raw === "object" ? raw : {};
      var presetId = PRESETS.some(function (p) {
        return p.id === src.preset;
      })
        ? src.preset
        : DEFAULTS.preset;
      return {
        enabled: src.enabled !== false,
        source: src.source === "image" ? "image" : "preset",
        preset: presetId,
        scrim: clamp(src.scrim, 0, 0.95, DEFAULTS.scrim),
        blur: clamp(src.blur, 0, 24, DEFAULTS.blur),
        glass: src.glass !== false,
        pane: clamp(src.pane, 0.45, 1, DEFAULTS.pane),
        themeMode: src.themeMode === "light" || src.themeMode === "dark" ? src.themeMode : "auto"
      };
    }

    function readStorage(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    }

    function writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    }

    function dropStorage(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        /* ignore */
      }
    }

    /* 图片走 IndexedDB：localStorage 只有 ~5MB，照片压缩后仍常常超限，
       那正是“选了图却提示没有图片、壁纸也没换”的原因。 */

    var IDB_NAME = "dsh-wallpaper";
    var IDB_STORE = "kv";

    function openDb() {
      return new Promise(function (resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error("indexedDB unavailable"));
          return;
        }
        var request = window.indexedDB.open(IDB_NAME, 1);
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        request.onsuccess = function () {
          var db = request.result;
          db.onversionchange = function () {
            db.close();
          };
          resolve(db);
        };
        request.onerror = function () {
          reject(request.error || new Error("indexedDB open failed"));
        };
        request.onblocked = function () {
          reject(new Error("indexedDB blocked"));
        };
      });
    }

    function dbRead(key) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var request = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
          request.onsuccess = function () {
            resolve(request.result || "");
          };
          request.onerror = function () {
            reject(request.error || new Error("indexedDB read failed"));
          };
        });
      });
    }

    function dbWrite(key, value) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(value, key);
          tx.oncomplete = function () {
            resolve(true);
          };
          tx.onerror = function () {
            reject(tx.error || new Error("indexedDB write failed"));
          };
          tx.onabort = function () {
            reject(tx.error || new Error("indexedDB write aborted"));
          };
        });
      });
    }

    function dbDelete(key) {
      return openDb()
        .then(function (db) {
          return new Promise(function (resolve) {
            var tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = function () {
              resolve(true);
            };
            tx.onerror = function () {
              resolve(false);
            };
            tx.onabort = function () {
              resolve(false);
            };
          });
        })
        .catch(function () {
          return false;
        });
    }

    var state = normalize(readStorage(SETTINGS_KEY) ? JSON.parse(readStorage(SETTINGS_KEY) || "{}") : {});
    var imageData = readStorage(IMAGE_KEY) || "";

    /* 上次用 localStorage 存的图迁到 IndexedDB，成功后再删旧键 */
    function loadStoredImage() {
      var legacy = readStorage(IMAGE_KEY) || "";
      dbRead(IMAGE_KEY).then(
        function (stored) {
          if (stored) {
            if (legacy) dropStorage(IMAGE_KEY);
            return stored;
          }
          if (legacy) {
            dbWrite(IMAGE_KEY, legacy).then(function () {
              dropStorage(IMAGE_KEY);
            }, function () {});
            return legacy;
          }
          return "";
        },
        function () {
          return legacy;
        }
      ).then(applyLoadedImage);
    }

    function applyLoadedImage(data) {
      imageData = data || "";
      if (imageData) {
        if (state.source === "image") render();
        emit();
        return;
      }
      if (state.source === "image") update({ source: "preset" });
      else emit();
    }

    /* "" = 已保存；"warn" = 只应用到当前页面，没存下来 */
    function persistImage(data, done) {
      dbWrite(IMAGE_KEY, data).then(
        function () {
          dropStorage(IMAGE_KEY);
          done("");
        },
        function (error) {
          console.warn("[dsh-wallpaper] indexedDB write failed, trying localStorage", error);
          done(writeStorage(IMAGE_KEY, data) ? "" : "warn");
        }
      );
    }

    var listeners = [];
    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        var index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      };
    }
    function snapshot() {
      return state;
    }
    function emit() {
      listeners.slice().forEach(function (fn) {
        try {
          fn();
        } catch (error) {
          /* ignore */
        }
      });
    }

    function update(patch) {
      state = normalize(Object.assign({}, state, patch));
      writeStorage(SETTINGS_KEY, JSON.stringify(state));
      emit();
      render();
    }

    function useImage() {
      return state.source === "image" && !!imageData;
    }

    /* ------------------------------------------------------------------ */
    /* 样式与底层渲染                                                      */
    /* ------------------------------------------------------------------ */

    // 注意：DSH 的主题变量（--dsw-alias-bg-base / bg-layer-* / specific-sidebar-fill）
    // 定义在 body 上（见 @deepseek-ai/dsh-client-ui-theme 的 design CSS：
    // body{...} 与 body[data-ds-dark-theme]{...}）。只写在 html 上会被 body 的声明遮蔽，
    // 应用外壳 .frame/.centerCol 依旧取到不透明的底色，看起来就是“壁纸没生效”。
    // 因此透明与玻璃覆盖必须同时落到 html 和 body（含暗色 body 选择器）上。
    var GLASS_TOKENS = [
      "--dsw-alias-bg-layer-1: rgba(var(--wp-pane-rgb), var(--wp-pane-a, 0.82)) !important;",
      "--dsw-alias-bg-layer-2: rgba(var(--wp-pane-rgb), calc(var(--wp-pane-a, 0.82) + 0.05)) !important;",
      "--dsw-alias-bg-layer-3: rgba(var(--wp-pane-rgb), calc(var(--wp-pane-a, 0.82) + 0.1)) !important;",
      "--dsw-alias-bg-overlay: rgba(var(--wp-pane-rgb), 0.94) !important;",
      "--dsw-specific-input-major: rgba(var(--wp-pane-rgb), calc(var(--wp-pane-a, 0.82) + 0.1)) !important;",
      "--dsw-specific-sidebar-fill: rgba(var(--wp-pane-rgb), var(--wp-pane-a, 0.82)) !important;"
    ].join(" ");
    var STYLE_TEXT = [
      "#dsh-wallpaper-layer { position: fixed; inset: 0; z-index: -1; pointer-events: none;",
      "  background-size: cover; background-position: center; background-repeat: no-repeat; }",
      "#dsh-wallpaper-layer::after { content: ''; position: absolute; inset: 0; background: var(--wp-scrim, rgba(255,255,255,0.45)); }",
      "html.wp-on, html.wp-on body, html.wp-on body[data-ds-dark-theme] { background: transparent !important; }",
      "html.wp-on #root { background: transparent !important; }",
      "html.wp-on, html.wp-on body, html.wp-on body[data-ds-dark-theme] {",
      "  --dsw-alias-bg-base: transparent !important;",
      "  --dsw-specific-sidebar-fill: transparent !important;",
      "}",
      // Windows 壳会让外框 .frame 用 --dsw-specific-sidebar-fill 铺满整窗，
      // 玻璃模式又要把该变量换成半透明面板色，两者叠加会把壁纸整片盖住。
      // 因此直接让外框透明；侧栏/标题栏仍各自用面板色，玻璃效果保留。
      "html.wp-on [class*=\"q_frame\"] { background: transparent !important; }",
      "html.wp-glass:not(.wp-dark) body, html.wp-glass:not(.wp-dark) body[data-ds-dark-theme] {",
      "  --wp-pane-rgb: 255,255,255; " + GLASS_TOKENS,
      "}",
      "html.wp-glass.wp-dark body, html.wp-glass.wp-dark body[data-ds-dark-theme] {",
      "  --wp-pane-rgb: 17,17,21; " + GLASS_TOKENS,
      "}"
    ].join("\n");

    function isDark() {
      if (state.themeMode === "dark") return true;
      if (state.themeMode === "light") return false;
      try {
        var scheme = document.documentElement.style.colorScheme;
        if (scheme === "dark") return true;
        if (scheme === "light") return false;
        var media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
        if (media && media.matches) return true;
        var bg = getComputedStyle(document.body).backgroundColor;
        var match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(bg || "");
        if (match) return 0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3]) < 128;
      } catch (error) {
        /* ignore */
      }
      return false;
    }

    function presetCss(id) {
      for (var i = 0; i < PRESETS.length; i += 1) {
        if (PRESETS[i].id === id) return PRESETS[i].css;
      }
      return PRESETS[0].css;
    }

    function backgroundImage() {
      if (useImage()) return 'url("' + imageData + '")';
      return presetCss(state.preset);
    }

    function render() {
      var root = document.documentElement;
      var dark = isDark();
      root.classList.toggle("wp-on", !!state.enabled);
      root.classList.toggle("wp-glass", !!(state.enabled && state.glass));
      root.classList.toggle("wp-dark", !!dark);
      root.style.setProperty(
        "--wp-scrim",
        (dark ? "rgba(8,10,16," : "rgba(252,252,255,") + state.scrim.toFixed(3) + ")"
      );
      root.style.setProperty("--wp-pane-a", state.pane.toFixed(3));

      var layer = document.getElementById(LAYER_ID);
      if (!layer) return;
      layer.style.display = state.enabled ? "block" : "none";
      layer.style.backgroundImage = state.enabled ? backgroundImage() : "none";
      layer.style.filter = state.blur > 0 ? "blur(" + state.blur + "px)" : "none";
      layer.style.transform = state.blur > 0 ? "scale(1.06)" : "none";
    }

    function installDom() {
      var style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = STYLE_TEXT;
        document.head.appendChild(style);
      }
      var layer = document.getElementById(LAYER_ID);
      if (!layer) {
        layer = document.createElement("div");
        layer.id = LAYER_ID;
        layer.setAttribute("aria-hidden", "true");
        document.body.appendChild(layer);
      }
      render();

      var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      var onMedia = function () {
        if (state.themeMode === "auto") render();
      };
      if (media && media.addEventListener) media.addEventListener("change", onMedia);

      return function () {
        if (media && media.removeEventListener) media.removeEventListener("change", onMedia);
        var root = document.documentElement;
        root.classList.remove("wp-on", "wp-glass", "wp-dark");
        root.style.removeProperty("--wp-scrim");
        root.style.removeProperty("--wp-pane-a");
        var el = document.getElementById(LAYER_ID);
        if (el) el.remove();
        var st = document.getElementById(STYLE_ID);
        if (st) st.remove();
      };
    }

    /* ------------------------------------------------------------------ */
    /* 图片处理                                                            */
    /* ------------------------------------------------------------------ */

    function dataSizeLabel(data) {
      if (!data) return "";
      var comma = data.indexOf(",");
      var bytes = Math.max(0, Math.round(((comma >= 0 ? data.length - comma - 1 : data.length) * 3) / 4));
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
      return Math.max(1, Math.round(bytes / 1024)) + " KB";
    }

    function shrinkImage(file, done) {
      var reader = new FileReader();
      reader.onerror = function () {
        done(new Error("read failed"));
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          done(new Error("decode failed"));
        };
        img.onload = function () {
          try {
            var maxEdge = 2560;
            var scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
            var canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            var context = canvas.getContext("2d");
            context.drawImage(img, 0, 0, canvas.width, canvas.height);
            var data = canvas.toDataURL("image/webp", 0.86);
            if (!/^data:image\/webp/i.test(data)) data = canvas.toDataURL("image/jpeg", 0.86);
            done(null, data);
          } catch (error) {
            done(error);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }

    /* ------------------------------------------------------------------ */
    /* 设置面板                                                            */
    /* ------------------------------------------------------------------ */

    function rowStyle() {
      return {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "12px 0",
        borderTop: "1px solid var(--dsw-alias-border-l2)"
      };
    }

    function labelStyle() {
      return {
        fontSize: "13px",
        fontWeight: 600,
        color: "var(--dsw-alias-label-primary)"
      };
    }

    function hintStyle() {
      return {
        fontSize: "12px",
        lineHeight: 1.5,
        color: "var(--dsw-alias-label-secondary)"
      };
    }

    function buttonStyle(active, quiet) {
      return {
        appearance: "none",
        border: "1px solid var(--dsw-alias-border-l2)",
        background: active ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-bg-layer-2)",
        color: active ? "#fff" : "var(--dsw-alias-label-primary)",
        borderRadius: "8px",
        padding: "6px 12px",
        fontSize: "12px",
        cursor: "pointer",
        opacity: quiet ? 0.75 : 1
      };
    }

    function Row(props) {
      return h(
        "div",
        { style: rowStyle() },
        props.title ? h("div", { style: labelStyle() }, props.title) : null,
        props.children,
        props.hint ? h("div", { style: hintStyle() }, props.hint) : null
      );
    }

    function zhLocale() {
      var lang = String(document.documentElement.lang || (navigator && navigator.language) || "").toLowerCase();
      return lang.indexOf("zh") === 0;
    }

    function Slider(props) {
      return h("input", {
        type: "range",
        min: props.min,
        max: props.max,
        step: props.step,
        value: props.value,
        onChange: function (event) {
          props.onChange(Number(event.target.value));
        },
        style: { width: "100%", accentColor: "var(--dsw-alias-brand-primary)" }
      });
    }

    function Panel(props) {
      var t = props.t;
      var pair = useState(snapshot());
      var current = pair[0];
      var setCurrent = pair[1];
      var notice = useState("");
      var message = notice[0];
      var setMessage = notice[1];
      var busy = useState(false);
      var working = busy[0];
      var setWorking = busy[1];

      useEffect(function () {
        return subscribe(function () {
          setCurrent(snapshot());
        });
      }, []);

      function acceptFile(file) {
        if (!file) return;
        if (file.type && file.type.indexOf("image/") !== 0) {
          setMessage(t("failed") + (file.type || file.name));
          return;
        }
        setWorking(true);
        setMessage(t("saving"));
        shrinkImage(file, function (error, data) {
          if (error) {
            setWorking(false);
            setMessage(t("failed") + String(error && error.message ? error.message : error));
            return;
          }
          persistImage(data, function (warn) {
            imageData = data;
            update({ source: "image" });
            setWorking(false);
            setMessage(warn === "warn" ? t("storageWarn") : t("saved"));
          });
        });
      }

      function pick(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = "";
        acceptFile(file);
      }

      function removeImage() {
        imageData = "";
        dbDelete(IMAGE_KEY);
        dropStorage(IMAGE_KEY);
        update({ source: "preset" });
        setMessage("");
      }

      var imageHint = imageData
        ? (current.source === "image" ? t("imageSet") : t("imageUnused")) + " · " + dataSizeLabel(imageData)
        : t("noImage");

      var presetButtons = PRESETS.map(function (preset) {
        var active = !useImage() && current.preset === preset.id;
        return h(
          "button",
          {
            key: preset.id,
            type: "button",
            title: preset.id,
            onClick: function () {
              update({ preset: preset.id, source: "preset" });
            },
            style: {
              position: "relative",
              height: "54px",
              borderRadius: "8px",
              border: active ? "2px solid var(--dsw-alias-brand-primary)" : "1px solid var(--dsw-alias-border-l2)",
              // 选中态：外圈再加 3px 品牌色光环 + 内圈 1px 白线，深浅壁纸上都能一眼看出
              boxShadow: active
                ? "0 0 0 3px var(--dsw-alias-brand-primary), inset 0 0 0 1px rgba(255,255,255,0.55)"
                : "none",
              backgroundImage: preset.css,
              backgroundSize: "cover",
              cursor: "pointer",
              overflow: "hidden"
            }
          },
          h(
            "span",
            {
              style: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "2px 4px",
                fontSize: "11px",
                background: "rgba(0,0,0,0.42)",
                color: "#fff"
              }
            },
            zhLocale() ? preset.zh : preset.en
          )
        );
      });

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "0", padding: "4px 0 24px" } },
        h("div", { style: { fontSize: "16px", fontWeight: 700, color: "var(--dsw-alias-label-primary)" } }, t("title")),
        h("div", { style: Object.assign({}, hintStyle(), { marginTop: "6px" }) }, t("desc")),

        h(
          Row,
          null,
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" } },
            h("input", {
              type: "checkbox",
              checked: current.enabled,
              onChange: function (event) {
                update({ enabled: event.target.checked });
              }
            }),
            h("span", null, t("enable"))
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" } },
            ["auto", "light", "dark"].map(function (mode) {
              return h(
                "button",
                {
                  key: mode,
                  type: "button",
                  onClick: function () {
                    update({ themeMode: mode });
                  },
                  style: buttonStyle(current.themeMode === mode)
                },
                t(mode)
              );
            })
          ),
          h("div", { style: Object.assign({}, hintStyle(), { marginTop: "4px" }) }, t("mode"))
        ),

        h(
          Row,
          { title: t("imageTitle"), hint: imageHint },
          h(
            "div",
            {
              style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
              onDragOver: function (event) {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
              },
              onDrop: function (event) {
                event.preventDefault();
                var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
                acceptFile(file);
              }
            },
            imageData
              ? h("div", {
                  style: {
                    width: "96px",
                    height: "54px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l2)",
                    backgroundImage: 'url("' + imageData + '")',
                    backgroundSize: "cover",
                    backgroundPosition: "center"
                  }
                })
              : null,
            h(
              "label",
              { style: Object.assign(buttonStyle(false), { display: "inline-block" }) },
              t("choose"),
              h("input", {
                type: "file",
                accept: "image/*",
                disabled: working,
                onChange: pick,
                style: { display: "none" }
              })
            ),
            imageData
              ? h(
                  "button",
                  {
                    type: "button",
                    onClick: removeImage,
                    style: buttonStyle(false, true)
                  },
                  t("remove")
                )
              : null
          )
        ),

        h(
          Row,
          { title: t("presets") },
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "8px" } }, presetButtons)
        ),

        h(Row, { title: t("scrim"), hint: t("scrimHint") }, h(Slider, {
          min: 0,
          max: 0.9,
          step: 0.05,
          value: current.scrim,
          onChange: function (value) {
            update({ scrim: value });
          }
        })),
        h(Row, { title: t("blur") }, h(Slider, {
          min: 0,
          max: 24,
          step: 1,
          value: current.blur,
          onChange: function (value) {
            update({ blur: value });
          }
        })),

        h(
          Row,
          { title: t("glass"), hint: t("glassHint") },
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--dsw-alias-label-primary)" } },
            h("input", {
              type: "checkbox",
              checked: current.glass,
              onChange: function (event) {
                update({ glass: event.target.checked });
              }
            }),
            h("span", null, t("glass"))
          )
        ),
        current.glass
          ? h(Row, { title: t("pane"), hint: t("paneHint") }, h(Slider, {
              min: 0.45,
              max: 1,
              step: 0.01,
              value: current.pane,
              onChange: function (value) {
                update({ pane: value });
              }
            }))
          : null,

        h(
          "div",
          { style: { display: "flex", gap: "8px", alignItems: "center", paddingTop: "14px", borderTop: "1px solid var(--dsw-alias-border-l2)" } },
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                update(DEFAULTS);
                setMessage("");
              },
              style: buttonStyle(false, true)
            },
            t("reset")
          ),
          message ? h("span", { style: hintStyle() }, message) : null
        ),
        h("div", { style: Object.assign({}, hintStyle(), { marginTop: "10px" }) }, t("hint"))
      );
    }

    /* ------------------------------------------------------------------ */
    /* 装配                                                                */
    /* ------------------------------------------------------------------ */

    function mount(ctx) {
      ctx.effect(function () {
        ctx.locale.register(NS, DICT);
      }, "dsh-wallpaper: dictionaries");
      var t = ctx.locale.bind(NS);

      ctx.effect(function () {
        return installDom();
      }, "dsh-wallpaper: background layer");

      loadStoredImage();

      if (typeof ctx.on === "function") {
        ctx.effect(function () {
          return ctx.on("theme/change", function () {
            if (state.themeMode === "auto") render();
          });
        }, "dsh-wallpaper: theme change");
      }

      ctx.slots.inject("settings.section", function () {
        ctx.effect(function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "wallpaper",
              order: 60,
              label: function () {
                return t("nav");
              },
              locale: NS,
              inject: function () {
                return { t: t };
              }
            },
            function () {
              return h(Panel, { t: t });
            }
          );
        }, "dsh-wallpaper: settings section");
      });
    }

    function apply(ctx) {
      try {
        mount(ctx);
      } catch (error) {
        console.error("[dsh-wallpaper] mount failed", error);
      }
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
