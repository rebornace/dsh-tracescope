//! DSH lazy-CJS client entry (React Slot). Bundled from client-src/ by scripts/build-client.mjs.
//! Factory arity must be `(require) => exports`.
//! Same-origin Host APIs: /tracescope/v1/*
window.__ModuleLoader__.load({
  id: '@rebornace/dsh-tracescope',
  factory: (require) => {
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client-src/visual/VisualComparePanel.tsx
var VisualComparePanel_exports = {};
__export(VisualComparePanel_exports, {
  PROPERTY_LABELS: () => PROPERTY_LABELS,
  VisualComparePanel: () => VisualComparePanel,
  VisualValue: () => VisualValue
});
async function post(path, body) {
  const r = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
function VisualValue({ value }) {
  if (value && typeof value === "object" && "unresolved" in value) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: "#9a6700" }, children: [
      "待确认：",
      String(value.raw)
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: String(value) });
}
function VisualComparePanel({ repoInput, auth }) {
  const [figmaUrl, setFigmaUrl] = (0, import_react.useState)("");
  const [figmaToken, setFigmaToken] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [phase, setPhase] = (0, import_react.useState)("idle");
  const [candidates, setCandidates] = (0, import_react.useState)([]);
  const [selectedKey, setSelectedKey] = (0, import_react.useState)("");
  const [data, setData] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const basePayload = () => ({
    repoPath: repoInput,
    auth,
    figmaUrl: figmaUrl.trim(),
    figmaToken: figmaToken.trim()
  });
  async function locate() {
    setError("");
    setData(null);
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setError("请填写设计稿链接和访问 Token");
      return;
    }
    setBusy(true);
    try {
      const res = await post("/tracescope/v1/match-page", basePayload());
      const list = res.candidates || [];
      setCandidates(list);
      setPhase("matched");
      if (list.length) {
        const first = list[0];
        setSelectedKey(candidateKey(first));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function compare() {
    setError("");
    const c = candidates.find((x) => candidateKey(x) === selectedKey);
    if (!c) {
      setError("请选择要对比的页面");
      return;
    }
    setBusy(true);
    try {
      const res = await post("/tracescope/v1/visual-compare", {
        ...basePayload(),
        adapterId: c.adapterId,
        relativePath: c.relativePath
      });
      setData(res);
    } catch (err) {
      setData(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: S.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "UI 走查：设计稿 ↔ 代码" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: S.hint, children: "连接设计稿后，系统会在当前仓库中自动定位对应的页面（同一页面可能存在多种技术实现）， 再与所选实现进行确定性对比，自动列出尺寸、间距、颜色、字号等差异。无需运行应用，也不依赖模型。" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
      "设计稿链接",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: S.input,
          value: figmaUrl,
          disabled: busy,
          placeholder: "https://www.figma.com/design/...?node-id=0-3046",
          onChange: (e) => setFigmaUrl(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: S.label, children: [
      "访问 Token",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: S.input,
          type: "password",
          value: figmaToken,
          disabled: busy,
          placeholder: "figd_...",
          onChange: (e) => setFigmaToken(e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: S.primary, disabled: busy, onClick: locate, children: busy && phase === "idle" ? "定位中…" : "自动定位页面" }),
    phase === "matched" ? candidates.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...S.row, justifyContent: "space-between" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600 }, children: "匹配的页面（默认最佳，可切换）" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }, children: candidates.map((c) => {
        const key = candidateKey(c);
        const checked = key === selectedKey;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "label",
          {
            style: {
              border: "1px solid " + (checked ? "#0f6e56" : "var(--dsh-border,#ddd4c5)"),
              borderRadius: 8,
              padding: "8px 10px",
              cursor: "pointer",
              background: checked ? "#f2f8f5" : "#fff",
              fontSize: 12
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...S.row, justifyContent: "space-between" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", gap: 8, alignItems: "center" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    type: "radio",
                    name: "visual-page",
                    checked,
                    onChange: () => setSelectedKey(key)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
                  c.kindLabel,
                  " · ",
                  Math.round(c.score * 100),
                  "%"
                ] }),
                !c.precise ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.badge, children: "暂不支持精确对比" }) : null
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#6b645a", marginTop: 4 }, children: c.relativePath }),
              c.reasons.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#8a7f70", marginTop: 2 }, children: c.reasons.join("；") }) : null
            ]
          },
          key
        );
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: { ...S.primary, marginTop: 10 },
          disabled: busy,
          onClick: compare,
          children: busy ? "对比中…" : "开始对比所选页面"
        }
      )
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...S.hint, color: "#9a6700", marginTop: 10 }, children: "未能在仓库中定位到与设计稿对应的页面。请确认所选仓库根目录正确，或检查设计稿中的文案是否与界面一致。" }) : null,
    error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { color: "#b42318", margin: "8px 0 0", fontSize: 12 }, children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompareView, { data })
  ] });
}
function candidateKey(c) {
  return c.adapterId + "::" + c.relativePath;
}
function CompareView({ data }) {
  if (!data) return null;
  if (!data.precise) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          marginTop: 12,
          border: "1px solid var(--dsh-border,#ddd4c5)",
          borderRadius: 10,
          padding: 10,
          background: "#faf7f0",
          fontSize: 12,
          color: "#7a5b13",
          lineHeight: 1.5
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: data.page.kindLabel }),
          " · ",
          data.page.relativePath,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4 }, children: data.reason || "该实现以代码方式构建界面，当前版本暂不支持属性级对比。" })
        ]
      }
    );
  }
  const result = data.result;
  if (!result) return null;
  const sevCounts = { high: 0, medium: 0, low: 0 };
  const byNode = {};
  const groups = [];
  for (const d of result.diffs) {
    const key = String(d.designNodeId);
    if (!byNode[key]) {
      byNode[key] = { name: String(d.nodeName), rows: [] };
      groups.push(byNode[key]);
    }
    byNode[key].rows.push(d);
    const sev = String(d.severity);
    sevCounts[sev] = (sevCounts[sev] || 0) + 1;
  }
  const sevColor = {
    high: "#b42318",
    medium: "#9a6700",
    low: "#0f6e56"
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { color: "#6b645a", fontSize: 12, lineHeight: 1.5 }, children: [
      data.page.kindLabel,
      " · 对比节点对 ",
      result.comparedPairs,
      " · 差异",
      " ",
      result.diffs.length,
      "（高 ",
      sevCounts.high,
      " / 中 ",
      sevCounts.medium,
      " / 低",
      " ",
      sevCounts.low,
      "）· 未匹配 ",
      result.unmatched.length
    ] }),
    groups.length === 0 && result.unmatched.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { color: "#0f6e56" }, children: "没有发现差异。" }) : null,
    groups.map((g, gi) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          border: "1px solid var(--dsh-border,#ddd4c5)",
          borderRadius: 10,
          padding: 10,
          marginBottom: 8,
          background: "#fff"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 6
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: g.name }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: 12, color: "#6b645a" }, children: [
                  g.rows.length,
                  " 项差异"
                ] })
              ]
            }
          ),
          g.rows.map((d, ri) => {
            const property = String(d.property);
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 6,
                  border: "1px solid #ece5d8",
                  borderLeft: "4px solid " + sevColor[String(d.severity)],
                  borderRadius: 8,
                  padding: "4px 8px",
                  marginBottom: 4,
                  fontSize: 12
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600 }, children: PROPERTY_LABELS[property] || property }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "span",
                    {
                      style: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VisualValue, { value: d.expected }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#0f6e56" }, children: "→" }),
                        d.actual === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#b42318", fontWeight: 700 }, children: d.needsReview ? "需确认" : "缺失" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VisualValue, { value: d.actual })
                      ]
                    }
                  )
                ]
              },
              ri
            );
          })
        ]
      },
      gi
    )),
    result.unmatched.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "details",
      {
        style: {
          border: "1px dashed var(--dsh-border,#ddd4c5)",
          borderRadius: 10,
          padding: "8px 10px"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: { cursor: "pointer", color: "#0f6e56", fontWeight: 600 }, children: [
            "未匹配元素（",
            result.unmatched.length,
            "）"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }, children: result.unmatched.map((u, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "span",
              {
                style: {
                  display: "inline-block",
                  fontSize: 11,
                  borderRadius: 999,
                  padding: "1px 7px",
                  marginRight: 4,
                  background: "#efe8da"
                },
                children: u.side === "design" ? "仅设计稿" : "仅代码"
              }
            ),
            String(u.name),
            u.text ? "（" + String(u.text) + "）" : ""
          ] }, i)) })
        ]
      }
    ) : null
  ] });
}
var import_react, import_jsx_runtime, PROPERTY_LABELS, S;
var init_VisualComparePanel = __esm({
  "client-src/visual/VisualComparePanel.tsx"() {
    "use strict";
    import_react = require("react");
    import_jsx_runtime = require("react/jsx-runtime");
    PROPERTY_LABELS = {
      width: "宽度",
      height: "高度",
      marginTop: "上外边距",
      marginRight: "右外边距",
      marginBottom: "下外边距",
      marginLeft: "左外边距",
      paddingTop: "上内边距",
      paddingRight: "右内边距",
      paddingBottom: "下内边距",
      paddingLeft: "左内边距",
      backgroundColor: "背景色",
      borderWidth: "边框宽",
      borderColor: "边框色",
      cornerRadius: "圆角",
      opacity: "不透明度",
      fontFamily: "字体",
      fontSize: "字号",
      fontWeight: "字重",
      lineHeight: "行高",
      letterSpacing: "字间距",
      color: "文字颜色"
    };
    S = {
      card: {
        border: "1px solid var(--dsh-border,#ddd4c5)",
        borderRadius: 12,
        background: "#fff",
        padding: 12,
        display: "flex",
        flexDirection: "column"
      },
      hint: { margin: "4px 0 10px", color: "#6b645a", fontSize: 12, lineHeight: 1.5 },
      label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 10 },
      input: {
        width: "100%",
        padding: "6px 8px",
        border: "1px solid var(--dsh-border,#d8d0c2)",
        borderRadius: 8,
        fontSize: 13,
        boxSizing: "border-box"
      },
      primary: {
        padding: "7px 12px",
        borderRadius: 8,
        border: "1px solid #0f6e56",
        background: "#0f6e56",
        color: "#fff",
        fontWeight: 600,
        cursor: "pointer"
      },
      row: { display: "flex", alignItems: "center", gap: 8 },
      badge: {
        fontSize: 11,
        color: "#9a6700",
        background: "#fef0c7",
        borderRadius: 999,
        padding: "1px 7px"
      }
    };
  }
});

// client-src/entry.js
var module2 = { exports: {} };
var exports = module2.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var React = require("react");
var jsxRuntime = require("react/jsx-runtime");
var jsx2 = jsxRuntime.jsx;
var jsxs2 = jsxRuntime.jsxs;
var useState2 = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useRef = React.useRef;
var VisualComparePanel2 = (init_VisualComparePanel(), __toCommonJS(VisualComparePanel_exports)).VisualComparePanel;
var TAB_ID = "@rebornace/dsh-tracescope";
var hostCtx = null;
var styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    padding: 12,
    gap: 10,
    overflow: "auto",
    background: "var(--dsh-bg, #f7f2e8)",
    color: "var(--dsh-fg, #1c1915)",
    fontSize: 13,
    position: "relative"
  },
  card: {
    border: "1px solid var(--dsh-border, #ddd4c5)",
    borderRadius: 12,
    padding: 12,
    background: "var(--dsh-card, #fffdf8)"
  },
  label: { display: "grid", gap: 4, marginBottom: 8, fontWeight: 600 },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--dsh-border, #ddd4c5)",
    boxSizing: "border-box"
  },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  btn: {
    border: 0,
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    background: "var(--dsh-accent-soft, #efe8da)"
  },
  primary: {
    border: 0,
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    background: "var(--dsh-accent, #0f6e56)",
    color: "#fff",
    fontWeight: 700
  },
  secondary: {
    border: "1px solid var(--dsh-border, #ddd4c5)",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    background: "var(--dsh-card, #fffdf8)",
    color: "var(--dsh-fg, #1c1915)",
    fontSize: 12
  },
  error: { color: "#b42318", margin: 0 },
  item: {
    border: "1px solid var(--dsh-border, #ddd4c5)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    background: "#fff"
  },
  badge: {
    display: "inline-block",
    fontSize: 11,
    borderRadius: 999,
    padding: "2px 8px",
    marginRight: 4,
    background: "#efe8da"
  },
  statusBtn: {
    border: "1px solid var(--dsh-border, #ddd4c5)",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    background: "#fff",
    color: "#3d3a34",
    fontWeight: 500,
    fontSize: 12
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(28, 25, 21, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1e4,
    padding: 16
  },
  busyOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 9e3,
    background: "rgba(247, 242, 232, 0.78)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "56px 16px 16px",
    cursor: "wait",
    backdropFilter: "blur(1px)"
  },
  busyBanner: {
    maxWidth: 420,
    width: "100%",
    borderRadius: 12,
    padding: "14px 16px",
    background: "var(--dsh-card, #fffdf8)",
    border: "1px solid var(--dsh-border, #ddd4c5)",
    boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
    textAlign: "center"
  },
  busySpinner: {
    width: 22,
    height: 22,
    margin: "0 auto 10px",
    borderRadius: "50%",
    border: "3px solid #efe8da",
    borderTopColor: "#0f6e56",
    animation: "tracescope-spin 0.8s linear infinite"
  },
  modalCard: {
    width: "min(420px, 100%)",
    borderRadius: 12,
    padding: 16,
    background: "var(--dsh-card, #fffdf8)",
    border: "1px solid var(--dsh-border, #ddd4c5)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
    color: "var(--dsh-fg, #1c1915)"
  },
  danger: {
    border: 0,
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    background: "#b42318",
    color: "#fff",
    fontWeight: 700
  }
};
function statusBtnStyle(kind, active) {
  if (!active) return styles.statusBtn;
  if (kind === "pass") {
    return Object.assign({}, styles.statusBtn, {
      background: "#0f6e56",
      borderColor: "#0f6e56",
      color: "#fff",
      fontWeight: 700
    });
  }
  if (kind === "fail") {
    return Object.assign({}, styles.statusBtn, {
      background: "#b42318",
      borderColor: "#b42318",
      color: "#fff",
      fontWeight: 700
    });
  }
  if (kind === "skip") {
    return Object.assign({}, styles.statusBtn, {
      background: "#b54708",
      borderColor: "#b54708",
      color: "#fff",
      fontWeight: 700
    });
  }
  return Object.assign({}, styles.statusBtn, {
    background: "#efe8da",
    borderColor: "#c4b8a5",
    color: "#1c1915",
    fontWeight: 700
  });
}
function statusLabel(status) {
  if (status === "pass") return "已通过";
  if (status === "fail") return "未通过";
  if (status === "skip") return "已跳过";
  return "待测";
}
function statusBadgeStyle(status) {
  if (status === "pass") return { background: "#d8f3e7", color: "#0f6e56" };
  if (status === "fail") return { background: "#fce8e6", color: "#b42318" };
  if (status === "skip") return { background: "#fef0c7", color: "#b54708" };
  return { background: "#efe8da", color: "#6b645a" };
}
function apiGet(path, params) {
  var qs = new URLSearchParams(params || {}).toString();
  return fetch(path + (qs ? "?" + qs : ""), { credentials: "same-origin" }).then(function(r) {
    return r.text().then(function(text) {
      var data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_e) {
        throw new Error(text ? text.slice(0, 200) : "服务器返回空响应");
      }
      if (!r.ok) throw new Error(data.error || "请求失败");
      return data;
    });
  });
}
function apiPost(path, body) {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(r) {
    return r.text().then(function(text) {
      var data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_e) {
        throw new Error(text ? text.slice(0, 200) : "服务器返回空响应");
      }
      if (!r.ok) throw new Error(data.error || "请求失败");
      return data;
    });
  });
}
function downloadTextFile(filename, text, mime) {
  var blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() {
    URL.revokeObjectURL(url);
  }, 1e3);
}
function buildLocalExportMarkdown(report, meta) {
  var repo = meta && meta.repoPath || report.repoPath || "";
  var base = meta && meta.baseCommit || report.baseCommit || "";
  var head = meta && meta.headCommit || report.headCommit || "";
  var lines = [
    "# TraceScope 手测范围报告",
    "",
    "- 仓库：`" + repo + "`",
    "- 稳定基线：`" + base + "`",
    "- 待测提交：`" + head + "`",
    "- 生成时间：" + (report.generatedAt || ""),
    "- 模型对比：" + (report.modelEnriched ? "是" : "否（确定性分析）"),
    "- 变更文件数：" + (report.changedFiles || []).length,
    ""
  ];
  function renderSection(title, items) {
    lines.push("## " + title, "");
    if (!items || !items.length) {
      lines.push("_无_", "");
      return;
    }
    items.forEach(function(item, idx) {
      lines.push("### " + (idx + 1) + ". " + item.displayName, "");
      lines.push("- 状态：`" + (item.status || "pending") + "`");
      lines.push("- 类型：`" + item.kind + "`");
      lines.push("- 风险：`" + item.risk + "`");
      if (item.status === "fail" && item.testerNote) {
        lines.push("- 测试备注（给开发）：");
        lines.push("  " + item.testerNote);
      }
      if (item.status === "fail" && item.testerScreenshots && item.testerScreenshots.length) {
        lines.push("- 截图（" + item.testerScreenshots.length + "）：");
        item.testerScreenshots.forEach(function(s, i) {
          lines.push("  " + (i + 1) + ". " + s.name);
          lines.push("  ![" + s.name + "](" + s.dataUrl + ")");
        });
      }
      lines.push("- 相关文件：");
      (item.files || []).forEach(function(f) {
        lines.push("  - `" + f + "`");
      });
      if (!(item.files || []).length) lines.push("  - （无）");
      lines.push("- 建议手测：");
      (item.suggestedSteps || []).forEach(function(s, i) {
        lines.push("  " + (i + 1) + ". " + s);
      });
      lines.push("");
    });
  }
  renderSection("直接变更", report.direct || []);
  renderSection("可能波及（依赖扩散）", report.ripple || []);
  if (report.attachments && report.attachments.length) {
    lines.push("## 任务附件", "");
    report.attachments.forEach(function(a, i) {
      lines.push(
        i + 1 + ". **" + a.name + "**（" + (a.mime || "file") + " · " + formatBytes(a.size || 0) + "）"
      );
    });
    lines.push("");
  }
  var failed = [].concat(report.direct || [], report.ripple || []).filter(function(it) {
    return (it.status || "") === "fail";
  });
  if (failed.length) {
    lines.push("## 失败反馈（给开发）", "");
    failed.forEach(function(item, i) {
      lines.push(
        i + 1 + ". **" + item.displayName + "**（" + item.kind + " / 风险 " + item.risk + "）"
      );
      lines.push("   - 备注：" + (item.testerNote && item.testerNote.trim() || "（测试未填写备注）"));
      if (item.testerScreenshots && item.testerScreenshots.length) {
        lines.push(
          "   - 截图：" + item.testerScreenshots.map(function(s) {
            return s.name;
          }).join("、")
        );
        item.testerScreenshots.forEach(function(s) {
          lines.push("     ![" + s.name + "](" + s.dataUrl + ")");
        });
      }
      lines.push("");
    });
  }
  lines.push("## 变更文件清单", "");
  (report.changedFiles || []).forEach(function(f) {
    lines.push("- `" + f + "`");
  });
  lines.push("");
  return lines.join("\n");
}
function fillComposerDraft(prompt) {
  try {
    var sessions = hostCtx && (hostCtx.sessions || hostCtx.get && hostCtx.get("sessions"));
    var conversation = hostCtx && (hostCtx.conversation || hostCtx.get && hostCtx.get("conversation"));
    if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== "function") {
      throw new Error("找不到会话列表服务，请确认已打开会话页");
    }
    var current = sessions.list.getSnapshot().current;
    if (!current) throw new Error("请先打开并选中一个会话，再点「模型对话分析」");
    var input = conversation && conversation.input;
    if (!input || typeof input.shell !== "function") {
      throw new Error("找不到会话输入框服务");
    }
    var shell = input.shell(current);
    if (!shell || typeof shell.setDraft !== "function") {
      throw new Error("无法写入当前会话输入框");
    }
    shell.setDraft(prompt);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message || String(err) };
  }
}
function clearComposerDraft() {
  return fillComposerDraft("");
}
var REPOS_KEY = "tracescope.repos";
var REPO_PATH_KEY = "tracescope.repoPath";
function readRepoList() {
  try {
    var raw = JSON.parse(localStorage.getItem(REPOS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(function(x) {
      return String(x || "").trim();
    }).filter(Boolean);
  } catch (_e) {
    return [];
  }
}
function writeRepoList(list) {
  var uniq = [];
  (list || []).forEach(function(item) {
    var v = String(item || "").trim();
    if (!v) return;
    if (uniq.indexOf(v) === -1) uniq.push(v);
  });
  localStorage.setItem(REPOS_KEY, JSON.stringify(uniq.slice(0, 30)));
  return uniq.slice(0, 30);
}
function shortRepoLabel(value) {
  var s = String(value || "").trim().replace(/\\/g, "/");
  if (!s) return "（未选仓库）";
  s = s.replace(/\/+$/, "");
  var parts = s.split("/");
  var name2 = parts[parts.length - 1] || s;
  name2 = name2.replace(/\.git$/i, "");
  if (parts.length >= 2 && (s.indexOf("://") !== -1 || s.indexOf("@") !== -1)) {
    return parts[parts.length - 2] + "/" + name2;
  }
  return name2 || s;
}
function uniquifyReportIds(report) {
  if (!report) return report;
  var seen = {};
  function fixList(list, kind) {
    return (list || []).map(function(item, index) {
      var id = item && item.id != null ? String(item.id).trim() : "";
      if (!id) id = kind + "-" + index;
      if (seen[id]) {
        var n = 2;
        while (seen[id + "~" + n]) n += 1;
        id = id + "~" + n;
      }
      seen[id] = true;
      if (id === item.id) return item;
      return Object.assign({}, item, { id });
    });
  }
  return Object.assign({}, report, {
    direct: fixList(report.direct, "direct"),
    ripple: fixList(report.ripple, "ripple")
  });
}
function defaultFailSubject(failed, repoPath) {
  var label = shortRepoLabel(repoPath || "");
  var prefix = label && label !== "（未选仓库）" ? "[TraceScope][" + label + "] " : "[TraceScope] ";
  if (failed.length === 1) {
    return (prefix + "手测失败：" + (failed[0].displayName || "条目")).slice(0, 120);
  }
  return (prefix + "手测失败 " + failed.length + " 项").slice(0, 120);
}
var MAX_SHOTS = 3;
function compressImageToShot(fileOrBlob, nameHint, done, fail) {
  var name2 = nameHint || fileOrBlob && fileOrBlob.name || "screenshot.jpg";
  var reader = new FileReader();
  reader.onerror = function() {
    if (fail) fail("读取图片失败");
  };
  reader.onload = function() {
    var img = new Image();
    img.onerror = function() {
      if (fail) fail("图片无法解码");
    };
    img.onload = function() {
      try {
        var maxW = 1280;
        var scale = Math.min(1, maxW / (img.width || maxW));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
        canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        if (!dataUrl || dataUrl.length > 48e4) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.55);
        }
        if (!dataUrl || dataUrl.length > 48e4) {
          if (fail) fail("截图过大，请换更小的图");
          return;
        }
        done({
          id: "shot-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
          name: String(name2).replace(/\.[^.]+$/, "") + ".jpg",
          mime: "image/jpeg",
          dataUrl
        });
      } catch (err) {
        if (fail) fail(err.message || "压缩截图失败");
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(fileOrBlob);
}
function formatBytes(n) {
  var bytes = Number(n) || 0;
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function() {
      reject(new Error("读取文件失败"));
    };
    reader.onload = function() {
      var result = String(reader.result || "");
      var comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
function StatusButtons(props) {
  var status = props.status || "pending";
  var locked = Boolean(props.disabled);
  return jsxs2("div", {
    style: Object.assign({}, styles.row, { gap: 6 }),
    children: ["pass", "fail", "skip", "pending"].map(function(s) {
      var label = s === "pass" ? "通过" : s === "fail" ? "失败" : s === "skip" ? "跳过" : "重置";
      var active = status === s;
      return jsx2(
        "button",
        {
          type: "button",
          disabled: locked,
          title: s === "pass" ? "标记为手测通过" : s === "fail" ? "标记为手测失败" : s === "skip" ? "本轮不测，标记跳过" : "清除结果，恢复为待测",
          style: Object.assign(
            {},
            statusBtnStyle(s, active),
            locked ? { opacity: 0.55, cursor: "not-allowed" } : null
          ),
          "aria-pressed": active ? "true" : "false",
          onClick: function() {
            if (locked) return;
            props.onChange(s);
          },
          children: active && s !== "pending" ? "✓ " + label : label
        },
        s
      );
    })
  });
}
function looksLikeCommitSha(value) {
  return /^[0-9a-f]{7,40}$/i.test(String(value || "").trim());
}
function branchOwnsVersion(r, selected, commitListRef, commits) {
  if (!r || !selected) return false;
  var sel = String(selected);
  if (sel === r.name || r.sha && sel === r.sha) return true;
  if (!looksLikeCommitSha(sel)) return false;
  if (String(commitListRef || "") !== String(r.name || "")) return false;
  return (commits || []).some(function(c) {
    return c && (c.sha === sel || c.short && sel.indexOf(c.short) === 0);
  });
}
function buildVersionOptions(refs, commits, emptyLabel, commitRefLabel) {
  var branchOpts = [];
  var tagOpts = [];
  var commitOpts = [];
  (refs || []).forEach(function(r) {
    if (!r || !r.name) return;
    var prefix = r.kind === "remote" ? "远端 " : r.kind === "tag" ? "标签 " : "";
    var option = jsx2(
      "option",
      {
        value: r.name,
        children: prefix + r.name + (r.short ? " · " + r.short : "")
      },
      "ref-" + (r.kind || "ref") + "-" + r.name
    );
    if (r.kind === "tag") tagOpts.push(option);
    else branchOpts.push(option);
  });
  (commits || []).forEach(function(c) {
    commitOpts.push(
      jsx2(
        "option",
        {
          value: c.sha,
          children: c.short + " · " + c.subject
        },
        "c-" + c.sha
      )
    );
  });
  var groups = [];
  if (branchOpts.length) {
    groups.push(jsx2("optgroup", { label: "分支", children: branchOpts }, "g-branch"));
  }
  if (tagOpts.length) {
    groups.push(jsx2("optgroup", { label: "标签", children: tagOpts }, "g-tag"));
  }
  if (commitOpts.length) {
    groups.push(
      jsx2(
        "optgroup",
        {
          label: commitRefLabel ? "近期提交 · " + commitRefLabel : "近期提交",
          children: commitOpts
        },
        "g-commit"
      )
    );
  }
  if (!groups.length) {
    groups.push(jsx2("option", { value: "", children: emptyLabel }, "empty"));
  }
  return groups;
}
function parseActivityTime(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && isFinite(value)) {
    return value > 0 && value < 1e12 ? Math.round(value * 1e3) : Math.round(value);
  }
  var s = String(value).trim();
  if (!s) return 0;
  if (/^\d{10,13}$/.test(s)) {
    var n = Number(s);
    return n < 1e12 ? n * 1e3 : n;
  }
  var normalized = s.indexOf("T") !== -1 ? s : s.replace(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}:\d{2})/, "$1T$2");
  var parsed = Date.parse(normalized);
  if (!isNaN(parsed)) return parsed;
  var fallback = Date.parse(s);
  return isNaN(fallback) ? 0 : fallback;
}
function branchActivityScore(r) {
  if (!r) return 0;
  if (typeof r.rank === "number" && isFinite(r.rank)) {
    return 1e15 - r.rank;
  }
  if (typeof r.activityTime === "number" && r.activityTime > 0) return r.activityTime;
  return parseActivityTime(r.date);
}
function matchingBranches(refs, query) {
  var branches = (refs || []).filter(function(r) {
    return r && r.name && r.kind !== "tag";
  });
  var q = String(query || "").trim().toLowerCase();
  if (q) {
    branches = branches.filter(function(r) {
      return r.name.toLowerCase().indexOf(q) !== -1;
    });
  }
  return branches.slice().sort(function(a, b) {
    var sb = branchActivityScore(b);
    var sa = branchActivityScore(a);
    if (sb !== sa) return sb - sa;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}
function newestBranchTip(refs) {
  var list = matchingBranches(refs, "");
  if (!list.length) return null;
  if (branchActivityScore(list[0]) <= 0) return null;
  return list[0];
}
function formatRefWhen(dateStr) {
  if (!dateStr) return "";
  var ms = parseActivityTime(dateStr);
  if (!ms) return String(dateStr).slice(0, 16);
  var d = new Date(ms);
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 16);
  var diff = Date.now() - d.getTime();
  if (diff >= 0 && diff < 60 * 1e3) return "刚刚";
  if (diff >= 0 && diff < 60 * 60 * 1e3) return Math.floor(diff / 6e4) + " 分钟前";
  if (diff >= 0 && diff < 24 * 60 * 60 * 1e3) return Math.floor(diff / 36e5) + " 小时前";
  if (diff >= 0 && diff < 7 * 24 * 60 * 60 * 1e3) return Math.floor(diff / 864e5) + " 天前";
  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }
  return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function ItemCard(props) {
  var item = props.item;
  var listKind = props.listKind;
  var itemIndex = props.itemIndex;
  var locked = Boolean(props.disabled);
  var st = item.status || "pending";
  var note = item.testerNote || "";
  var shots = item.testerScreenshots || [];
  var fileRef = useRef(null);
  return jsxs2("article", {
    style: Object.assign({}, styles.item, {
      borderLeft: "4px solid",
      borderLeftColor: st === "pass" ? "#0f6e56" : st === "fail" ? "#b42318" : st === "skip" ? "#b54708" : "#ddd4c5",
      opacity: locked ? 0.72 : 1
    }),
    children: [
      jsxs2("div", {
        style: { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
        children: [
          jsxs2("div", {
            children: [
              jsx2("div", { style: { fontWeight: 700 }, children: item.displayName }),
              jsxs2("div", {
                style: { marginTop: 4 },
                children: [
                  jsx2("span", {
                    style: Object.assign({}, styles.badge, statusBadgeStyle(st)),
                    children: statusLabel(st)
                  }),
                  jsx2("span", { style: styles.badge, children: "风险 " + item.risk }),
                  jsx2("span", {
                    style: styles.badge,
                    children: item.kind === "direct" ? "直接变更" : "可能波及"
                  })
                ]
              })
            ]
          }),
          jsx2(StatusButtons, {
            status: st,
            disabled: locked,
            onChange: function(s) {
              if (locked) return;
              props.onStatus(listKind, itemIndex, item.id, s);
            }
          })
        ]
      }),
      jsx2("ol", {
        style: { margin: "8px 0 0", paddingLeft: 18, color: "#6b645a" },
        children: (item.suggestedSteps || []).map(function(step, idx) {
          return jsx2("li", { children: step }, idx);
        })
      }),
      st === "fail" ? jsxs2("div", {
        style: { marginTop: 10 },
        children: [
          jsx2("div", {
            style: { fontWeight: 600, marginBottom: 4, color: "#b42318" },
            children: "失败备注（给开发）"
          }),
          jsx2("textarea", {
            style: Object.assign({}, styles.input, {
              minHeight: 72,
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.45
            }),
            value: note,
            disabled: locked,
            placeholder: "复现步骤、期望/实际结果、相关账号…（可 Ctrl+V 粘贴截图）",
            onChange: function(e) {
              if (locked) return;
              props.onNote(listKind, itemIndex, item.id, e.target.value);
            },
            onBlur: function(e) {
              if (locked) return;
              props.onNote(listKind, itemIndex, item.id, e.target.value, true);
            },
            onPaste: function(e) {
              if (locked) return;
              var items = e.clipboardData && e.clipboardData.items;
              if (!items || !items.length) return;
              var imageItem = null;
              for (var i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf("image/") === 0) {
                  imageItem = items[i];
                  break;
                }
              }
              if (!imageItem) return;
              e.preventDefault();
              if (shots.length >= MAX_SHOTS) {
                props.onShotHint && props.onShotHint("每条最多 " + MAX_SHOTS + " 张截图");
                return;
              }
              var blob = imageItem.getAsFile();
              if (!blob) return;
              compressImageToShot(
                blob,
                "paste-" + (shots.length + 1) + ".jpg",
                function(shot) {
                  props.onScreenshots(
                    listKind,
                    itemIndex,
                    item.id,
                    shots.concat([shot]).slice(0, MAX_SHOTS),
                    true
                  );
                },
                function(msg) {
                  props.onShotHint && props.onShotHint(msg);
                }
              );
            }
          }),
          jsxs2("div", {
            style: Object.assign({}, styles.row, {
              marginTop: 8,
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8
            }),
            children: [
              jsx2("input", {
                ref: fileRef,
                type: "file",
                accept: "image/*",
                multiple: true,
                disabled: locked,
                style: { display: "none" },
                onChange: function(e) {
                  if (locked) return;
                  var files = Array.prototype.slice.call(e.target.files && e.target.files || []);
                  e.target.value = "";
                  if (!files.length) return;
                  var room = MAX_SHOTS - shots.length;
                  if (room <= 0) {
                    props.onShotHint && props.onShotHint("每条最多 " + MAX_SHOTS + " 张截图");
                    return;
                  }
                  var picked = files.filter(function(f) {
                    return f && f.type && f.type.indexOf("image/") === 0;
                  }).slice(0, room);
                  if (!picked.length) {
                    props.onShotHint && props.onShotHint("请选择图片文件");
                    return;
                  }
                  var next = shots.slice();
                  var pending = picked.length;
                  picked.forEach(function(file) {
                    compressImageToShot(
                      file,
                      file.name,
                      function(shot) {
                        next.push(shot);
                        pending -= 1;
                        if (pending <= 0) {
                          props.onScreenshots(
                            listKind,
                            itemIndex,
                            item.id,
                            next.slice(0, MAX_SHOTS),
                            true
                          );
                        }
                      },
                      function(msg) {
                        pending -= 1;
                        props.onShotHint && props.onShotHint(msg);
                        if (pending <= 0 && next.length > shots.length) {
                          props.onScreenshots(
                            listKind,
                            itemIndex,
                            item.id,
                            next.slice(0, MAX_SHOTS),
                            true
                          );
                        }
                      }
                    );
                  });
                }
              }),
              jsx2("button", {
                type: "button",
                style: styles.btn,
                disabled: locked || shots.length >= MAX_SHOTS,
                onClick: function() {
                  if (locked) return;
                  if (fileRef.current) fileRef.current.click();
                },
                children: "添加截图"
              }),
              jsx2("span", {
                style: { fontSize: 12, color: "#6b645a" },
                children: "已附 " + shots.length + "/" + MAX_SHOTS + " · 支持粘贴或选文件（自动压缩）"
              })
            ]
          }),
          shots.length ? jsx2("div", {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8
            },
            children: shots.map(function(shot) {
              return jsxs2(
                "div",
                {
                  style: {
                    position: "relative",
                    width: 96,
                    border: "1px solid var(--dsh-border, #ddd4c5)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#fff"
                  },
                  children: [
                    jsx2("img", {
                      src: shot.dataUrl,
                      alt: shot.name,
                      title: shot.name,
                      style: {
                        display: "block",
                        width: "100%",
                        height: 72,
                        objectFit: "cover"
                      }
                    }),
                    jsx2("button", {
                      type: "button",
                      style: Object.assign({}, styles.btn, {
                        position: "absolute",
                        top: 2,
                        right: 2,
                        padding: "2px 6px",
                        fontSize: 11,
                        background: "rgba(28,25,21,0.75)",
                        color: "#fff",
                        border: 0
                      }),
                      title: "移除截图",
                      disabled: locked,
                      onClick: function() {
                        if (locked) return;
                        props.onScreenshots(
                          listKind,
                          itemIndex,
                          item.id,
                          shots.filter(function(s) {
                            return s.id !== shot.id;
                          }),
                          true
                        );
                      },
                      children: "×"
                    }),
                    jsx2("div", {
                      style: {
                        fontSize: 10,
                        padding: "2px 4px",
                        color: "#6b645a",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      },
                      title: shot.name,
                      children: shot.name
                    })
                  ]
                },
                shot.id
              );
            })
          }) : null
        ]
      }) : null,
      jsxs2("details", {
        style: { marginTop: 8 },
        children: [
          jsx2("summary", { children: "查看证据" }),
          jsx2("ul", {
            children: (item.files || []).map(function(f) {
              return jsx2("li", { children: jsx2("code", { children: f }) }, f);
            })
          }),
          jsx2("ul", {
            children: (item.evidence || []).map(function(e, idx) {
              return jsx2("li", { children: e.detail }, idx);
            })
          })
        ]
      })
    ]
  });
}
function usableSecret(value) {
  var token = String(value || "").trim();
  if (!token || token === "••••••••") return "";
  return token;
}
function isCodeupHttps(value) {
  return /^https:\/\/codeup\.aliyun\.com\//i.test(String(value || "").trim());
}
function TraceScopePanelBody() {
  var initialRepo = localStorage.getItem(REPO_PATH_KEY) || "";
  var _repo = useState2(initialRepo);
  var repoPath = _repo[0];
  var setRepoPath = _repo[1];
  var _repoList = useState2(function() {
    var list = readRepoList();
    if (initialRepo && list.indexOf(initialRepo) === -1) list = writeRepoList([initialRepo].concat(list));
    return list;
  });
  var repoList = _repoList[0];
  var setRepoList = _repoList[1];
  var _settingsOpen = useState2(!initialRepo);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  var ACCESS_MODE_KEY = "tracescope.accessMode";
  var _accessMode = useState2(localStorage.getItem(ACCESS_MODE_KEY) === "codeup" ? "codeup" : "git");
  var accessMode = _accessMode[0];
  var setAccessMode = _accessMode[1];
  var _copyFlash = useState2("");
  var copyFlash = _copyFlash[0];
  var setCopyFlash = _copyFlash[1];
  var YX_AUTH_KEY = "tracescope.yunxiaoAuth";
  var savedYx = null;
  try {
    savedYx = JSON.parse(localStorage.getItem(YX_AUTH_KEY) || "null");
  } catch (_e) {
    savedYx = null;
  }
  var _yxEndpoint = useState2(
    savedYx && savedYx.endpoint || "https://openapi-rdc.aliyuncs.com"
  );
  var yxEndpoint = _yxEndpoint[0];
  var setYxEndpoint = _yxEndpoint[1];
  var _yxToken = useState2(savedYx && savedYx.token || "");
  var yxToken = _yxToken[0];
  var setYxToken = _yxToken[1];
  var _yxTokenSaved = useState2(Boolean(savedYx && savedYx.token));
  var yxTokenSaved = _yxTokenSaved[0];
  var setYxTokenSaved = _yxTokenSaved[1];
  var _yxHydrated = useState2(false);
  var yxHydrated = _yxHydrated[0];
  var setYxHydrated = _yxHydrated[1];
  var _yxOrg = useState2("");
  var yxOrg = _yxOrg[0];
  var setYxOrg = _yxOrg[1];
  var _yxSpace = useState2("");
  var yxSpace = _yxSpace[0];
  var setYxSpace = _yxSpace[1];
  var _yxType = useState2("");
  var yxType = _yxType[0];
  var setYxType = _yxType[1];
  var _yxAssignee = useState2("");
  var yxAssignee = _yxAssignee[0];
  var setYxAssignee = _yxAssignee[1];
  var _yxOrgs = useState2([]);
  var yxOrgs = _yxOrgs[0];
  var setYxOrgs = _yxOrgs[1];
  var _yxProjects = useState2([]);
  var yxProjects = _yxProjects[0];
  var setYxProjects = _yxProjects[1];
  var _yxTypes = useState2([]);
  var yxTypes = _yxTypes[0];
  var setYxTypes = _yxTypes[1];
  var _yxMembers = useState2([]);
  var yxMembers = _yxMembers[0];
  var setYxMembers = _yxMembers[1];
  var _yxCatalogHint = useState2("");
  var yxCatalogHint = _yxCatalogHint[0];
  var setYxCatalogHint = _yxCatalogHint[1];
  var _yxDebugLog = useState2(false);
  var yxDebugLog = _yxDebugLog[0];
  var setYxDebugLog = _yxDebugLog[1];
  var _yxRequestLog = useState2("");
  var yxRequestLog = _yxRequestLog[0];
  var setYxRequestLog = _yxRequestLog[1];
  var _trackerProvider = useState2("none");
  var trackerProvider = _trackerProvider[0];
  var setTrackerProvider = _trackerProvider[1];
  var _ghToken = useState2("");
  var ghToken = _ghToken[0];
  var setGhToken = _ghToken[1];
  var _ghOwner = useState2("");
  var ghOwner = _ghOwner[0];
  var setGhOwner = _ghOwner[1];
  var _ghRepo = useState2("");
  var ghRepo = _ghRepo[0];
  var setGhRepo = _ghRepo[1];
  var _ghLabels = useState2("bug");
  var ghLabels = _ghLabels[0];
  var setGhLabels = _ghLabels[1];
  var _glHost = useState2("https://gitlab.com");
  var glHost = _glHost[0];
  var setGlHost = _glHost[1];
  var _glToken = useState2("");
  var glToken = _glToken[0];
  var setGlToken = _glToken[1];
  var _glProject = useState2("");
  var glProject = _glProject[0];
  var setGlProject = _glProject[1];
  var _glLabels = useState2("bug");
  var glLabels = _glLabels[0];
  var setGlLabels = _glLabels[1];
  var _whUrl = useState2("");
  var whUrl = _whUrl[0];
  var setWhUrl = _whUrl[1];
  var _whAuth = useState2("");
  var whAuth = _whAuth[0];
  var setWhAuth = _whAuth[1];
  var _trackerReady = useState2(false);
  var trackerReady = _trackerReady[0];
  var setTrackerReady = _trackerReady[1];
  var _wiCats = useState2({ Req: true, Bug: true, Task: true, Risk: false, Topic: false });
  var wiCats = _wiCats[0];
  var setWiCats = _wiCats[1];
  var _wiItems = useState2([]);
  var wiItems = _wiItems[0];
  var setWiItems = _wiItems[1];
  var _wiSelected = useState2({});
  var wiSelected = _wiSelected[0];
  var setWiSelected = _wiSelected[1];
  var _wiHint = useState2("");
  var wiHint = _wiHint[0];
  var setWiHint = _wiHint[1];
  var _resolved = useState2(null);
  var resolved = _resolved[0];
  var setResolved = _resolved[1];
  var _commits = useState2([]);
  var commits = _commits[0];
  var setCommits = _commits[1];
  var _refs = useState2([]);
  var refs = _refs[0];
  var setRefs = _refs[1];
  var _base = useState2("");
  var baseCommit = _base[0];
  var setBaseCommit = _base[1];
  var _head = useState2("");
  var headCommit = _head[0];
  var setHeadCommit = _head[1];
  var _branchQuery = useState2("");
  var branchQuery = _branchQuery[0];
  var setBranchQuery = _branchQuery[1];
  var _branchPickerOpen = useState2(false);
  var branchPickerOpen = _branchPickerOpen[0];
  var setBranchPickerOpen = _branchPickerOpen[1];
  var _commitListRef = useState2("");
  var commitListRef = _commitListRef[0];
  var setCommitListRef = _commitListRef[1];
  var _report = useState2(null);
  var report = _report[0];
  var setReport = _report[1];
  var _tab = useState2("direct");
  var tab = _tab[0];
  var setTab = _tab[1];
  var MODE_KEY = "tracescope.mode";
  var _mode = useState2(
    localStorage.getItem(MODE_KEY) === "ui" ? "ui" : "functional"
  );
  var mode = _mode[0];
  var setMode = _mode[1];
  function switchMode(next) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch (_e) {
    }
  }
  var _error = useState2("");
  var error = _error[0];
  var setError = _error[1];
  var _busy = useState2(false);
  var busy = _busy[0];
  var setBusy = _busy[1];
  var _busyMessage = useState2("");
  var busyMessage = _busyMessage[0];
  var setBusyMessage = _busyMessage[1];
  var busyRef = useRef(false);
  var busyMsgRef = useRef("");
  var _health = useState2("检查中…");
  var health = _health[0];
  var setHealth = _health[1];
  var AUTH_KEY = "tracescope.auth";
  var AUTH_UI_MODE_KEY = "tracescope.authUiMode";
  var savedAuth = null;
  try {
    savedAuth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    if (!savedAuth) {
      savedAuth = JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null");
      if (savedAuth) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(savedAuth));
        sessionStorage.removeItem(AUTH_KEY);
      }
    }
  } catch (_e) {
    savedAuth = null;
  }
  var savedAuthUiMode = "";
  try {
    savedAuthUiMode = localStorage.getItem(AUTH_UI_MODE_KEY) || "";
  } catch (_e) {
    savedAuthUiMode = "";
  }
  var initialAuthMode = savedAuthUiMode === "token" || savedAuthUiMode === "yunxiao" || savedAuthUiMode === "https" || savedAuthUiMode === "ssh" || savedAuthUiMode === "none" ? savedAuthUiMode === "yunxiao" ? "token" : savedAuthUiMode : savedAuth && savedAuth.mode || "none";
  if ((initialAuthMode === "https" || initialAuthMode === "none") && (/^https:\/\/codeup\.aliyun\.com\//i.test(String(initialRepo || "").trim()) || localStorage.getItem(ACCESS_MODE_KEY) === "codeup")) {
    initialAuthMode = "token";
  }
  var _authMode = useState2(initialAuthMode);
  var authMode = _authMode[0];
  var setAuthMode = _authMode[1];
  var _authUser = useState2(savedAuth && savedAuth.username || "git");
  var authUser = _authUser[0];
  var setAuthUser = _authUser[1];
  var _authToken = useState2(savedAuth && savedAuth.token || "");
  var authToken = _authToken[0];
  var setAuthToken = _authToken[1];
  var _authKey = useState2(savedAuth && savedAuth.privateKeyPath || "");
  var authKey = _authKey[0];
  var setAuthKey = _authKey[1];
  var _rememberAuth = useState2(true);
  var rememberAuth = _rememberAuth[0];
  var setRememberAuth = _rememberAuth[1];
  var _chatHint = useState2("");
  var chatHint = _chatHint[0];
  var setChatHint = _chatHint[1];
  function beginBusy(message) {
    if (busyRef.current) {
      setChatHint(
        "请等待当前操作完成后再试" + (busyMsgRef.current ? "（" + busyMsgRef.current + "）" : "") + "。网络较慢时请勿重复点击。"
      );
      return false;
    }
    var text = message || "处理中，请稍候…";
    busyRef.current = true;
    busyMsgRef.current = text;
    setBusy(true);
    setBusyMessage(text);
    return true;
  }
  function endBusy() {
    busyRef.current = false;
    busyMsgRef.current = "";
    setBusy(false);
    setBusyMessage("");
  }
  function updateBusyMessage(message) {
    if (!busyRef.current) return;
    var text = message || "处理中，请稍候…";
    busyMsgRef.current = text;
    setBusyMessage(text);
  }
  var _jobId = useState2("");
  var jobId = _jobId[0];
  var setJobId = _jobId[1];
  var _jobStatus = useState2("");
  var jobStatus = _jobStatus[0];
  var setJobStatus = _jobStatus[1];
  var _history = useState2([]);
  var history = _history[0];
  var setHistory = _history[1];
  var _historyId = useState2("");
  var historyId = _historyId[0];
  var setHistoryId = _historyId[1];
  var _confirmDlg = useState2(null);
  var confirmDlg = _confirmDlg[0];
  var setConfirmDlg = _confirmDlg[1];
  var pollRef = useRef(null);
  var skipPairLoadRef = useRef(false);
  var skipAutoSyncRef = useRef(false);
  var noteTimersRef = useRef({});
  var viewingHistoryRef = useRef(null);
  var reportRef = useRef(null);
  reportRef.current = report;
  var taskAttachRef = useRef(null);
  var _taskAttachPath = useState2("");
  var taskAttachPath = _taskAttachPath[0];
  var setTaskAttachPath = _taskAttachPath[1];
  var _authHydrated = useState2(false);
  var authHydrated = _authHydrated[0];
  var setAuthHydrated = _authHydrated[1];
  function buildAuthPayload() {
    if (authMode === "ssh") {
      return { mode: "ssh", privateKeyPath: authKey };
    }
    if (authMode === "token") {
      return {
        mode: "https",
        username: "git",
        token: usableSecret(yxToken)
      };
    }
    if (authMode === "https") {
      return {
        mode: "https",
        username: authUser || "git",
        token: usableSecret(authToken)
      };
    }
    return { mode: "none" };
  }
  function codeupRequestToken() {
    return authMode === "token" ? usableSecret(yxToken) : authMode === "https" ? usableSecret(authToken) : usableSecret(yxToken);
  }
  function setRemoteAuthMode(next) {
    var mode2 = next === "yunxiao" ? "token" : next;
    setAuthMode(mode2);
    try {
      localStorage.setItem(AUTH_UI_MODE_KEY, mode2);
    } catch (_e) {
    }
  }
  function shouldMirrorPatToYunxiao() {
    return isCodeupHttps(repoPath) || accessMode === "codeup" || trackerProvider === "yunxiao";
  }
  function persistAuth() {
    sessionStorage.removeItem(AUTH_KEY);
    if (rememberAuth && authMode === "token") {
      var tokenPayload = buildAuthPayload();
      if (!tokenPayload.token) return;
      localStorage.setItem(AUTH_KEY, JSON.stringify(tokenPayload));
      apiPost("/tracescope/v1/auth-save", { remember: true, auth: tokenPayload }).catch(
        function() {
        }
      );
      return;
    }
    if (rememberAuth && authMode !== "none") {
      var payload = buildAuthPayload();
      if (payload.mode === "https" && !payload.token) return;
      localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
      apiPost("/tracescope/v1/auth-save", { remember: true, auth: payload }).catch(function() {
      });
    } else if (authMode !== "token") {
      localStorage.removeItem(AUTH_KEY);
      apiPost("/tracescope/v1/auth-save", { remember: false, auth: { mode: "none" } }).catch(
        function() {
        }
      );
    }
  }
  useEffect(function() {
    apiGet("/tracescope/v1/health").then(function() {
      setHealth("已连接");
    }).catch(function() {
      setHealth("Host API 未就绪");
    });
    apiGet("/tracescope/v1/auth").then(function(data) {
      var auth = data && data.auth;
      if (auth && auth.mode && auth.mode !== "none") {
        if (auth.mode === "ssh") {
          setRemoteAuthMode("ssh");
          setAuthKey(auth.privateKeyPath || "");
        } else if (auth.mode === "https") {
          var preferToken = isCodeupHttps(repoPath) || accessMode === "codeup" || savedAuthUiMode === "token" || savedAuthUiMode === "yunxiao";
          if (preferToken) {
            setRemoteAuthMode("token");
            if (usableSecret(auth.token)) setYxToken(auth.token);
          } else {
            setRemoteAuthMode("https");
            setAuthUser(auth.username || "git");
            setAuthToken(auth.token || "");
          }
        }
        setRememberAuth(true);
        try {
          localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
        } catch (_e) {
        }
      }
    }).catch(function() {
    }).finally(function() {
      setAuthHydrated(true);
    });
    apiGet("/tracescope/v1/tracker-config").then(function(data) {
      var c = data && data.config;
      if (!c) return;
      setTrackerProvider(c.provider || "none");
      setTrackerReady(Boolean(c.ready));
      if (c.yunxiao) {
        if (c.yunxiao.endpoint) setYxEndpoint(c.yunxiao.endpoint);
        if (usableSecret(c.yunxiao.token)) setYxToken(c.yunxiao.token);
        if (c.yunxiao.hasToken || usableSecret(c.yunxiao.token)) setYxTokenSaved(true);
        if (c.yunxiao.organizationId) setYxOrg(c.yunxiao.organizationId);
        if (c.yunxiao.spaceId) setYxSpace(c.yunxiao.spaceId);
        if (c.yunxiao.workitemTypeId) setYxType(c.yunxiao.workitemTypeId);
        if (c.yunxiao.assignedTo) setYxAssignee(c.yunxiao.assignedTo);
        if (c.yunxiao.organizationId) {
          setYxOrgs([{ id: c.yunxiao.organizationId, name: c.yunxiao.organizationId }]);
        }
        if (c.yunxiao.spaceId) {
          setYxProjects([{ id: c.yunxiao.spaceId, name: c.yunxiao.spaceId }]);
        }
        if (c.yunxiao.workitemTypeId) {
          setYxTypes([{ id: c.yunxiao.workitemTypeId, name: c.yunxiao.workitemTypeId }]);
        }
        if (c.yunxiao.assignedTo) {
          setYxMembers([{ id: c.yunxiao.assignedTo, name: c.yunxiao.assignedTo }]);
        }
      }
      if (c.github) {
        if (c.github.token) setGhToken(c.github.token);
        if (c.github.owner) setGhOwner(c.github.owner);
        if (c.github.repo) setGhRepo(c.github.repo);
        if (c.github.labels) setGhLabels((c.github.labels || []).join(","));
      }
      if (c.gitlab) {
        if (c.gitlab.host) setGlHost(c.gitlab.host);
        if (c.gitlab.token) setGlToken(c.gitlab.token);
        if (c.gitlab.projectId) setGlProject(c.gitlab.projectId);
        if (c.gitlab.labels) setGlLabels((c.gitlab.labels || []).join(","));
      }
      if (c.webhook) {
        if (c.webhook.url) setWhUrl(c.webhook.url);
      }
    }).catch(function() {
    });
    apiGet("/tracescope/v1/yunxiao-token").then(function(data) {
      if (!data) return;
      if (usableSecret(data.token)) {
        setYxToken(data.token);
        setYxTokenSaved(true);
        try {
          localStorage.setItem(
            YX_AUTH_KEY,
            JSON.stringify({
              token: data.token,
              endpoint: data.endpoint || ""
            })
          );
        } catch (_e) {
        }
      } else if (data.hasToken) {
        setYxTokenSaved(true);
      }
      if (data.endpoint) setYxEndpoint(data.endpoint);
      if (data.organizationId) setYxOrg(data.organizationId);
    }).catch(function() {
    }).finally(function() {
      setYxHydrated(true);
    });
  }, []);
  useEffect(function() {
    if (!(isCodeupHttps(repoPath) || accessMode === "codeup")) return;
    if (authMode === "none" || authMode === "https") setRemoteAuthMode("token");
  }, [repoPath, accessMode]);
  useEffect(function() {
    if (!yxHydrated) return;
    if (authMode === "token" && !rememberAuth) return;
    var token = usableSecret(yxToken);
    if (!token) return;
    var handle = setTimeout(function() {
      try {
        localStorage.setItem(
          YX_AUTH_KEY,
          JSON.stringify({ token, endpoint: yxEndpoint || "" })
        );
        if (rememberAuth) setYxTokenSaved(true);
      } catch (_e) {
      }
      if (!shouldMirrorPatToYunxiao()) return;
      apiPost("/tracescope/v1/yunxiao-token-save", {
        token,
        endpoint: yxEndpoint,
        organizationId: yxOrg
      }).then(function() {
        setYxTokenSaved(true);
      }).catch(function() {
      });
    }, 400);
    return function() {
      clearTimeout(handle);
    };
  }, [yxHydrated, yxToken, yxEndpoint, yxOrg, authMode, rememberAuth, repoPath, accessMode, trackerProvider]);
  useEffect(function() {
    if (!authHydrated || !yxHydrated) return;
    if (!(isCodeupHttps(repoPath) || accessMode === "codeup")) return;
    if (authMode === "ssh") return;
    if (yxTokenSaved || usableSecret(yxToken)) return;
    setSettingsOpen(true);
  }, [authHydrated, yxHydrated, repoPath, accessMode, yxToken, yxTokenSaved, authMode]);
  useEffect(function() {
    if (!authHydrated) return;
    persistAuth();
  }, [authHydrated, rememberAuth, authMode, authUser, authToken, authKey, yxToken, repoPath]);
  function shortSha(value) {
    var s = String(value || "");
    return s.length > 12 ? s.slice(0, 10) + "…" : s;
  }
  function rememberRepo(path) {
    var next = String(path || "").trim();
    if (!next) return;
    localStorage.setItem(REPO_PATH_KEY, next);
    setRepoList(writeRepoList([next].concat(readRepoList())));
  }
  function copyText(text, label) {
    var value = String(text || "");
    if (!value) return;
    function done() {
      setCopyFlash((label || "ID") + " 已复制");
      setTimeout(function() {
        setCopyFlash("");
      }, 1600);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(function() {
          setChatHint("复制失败，请手动选中：" + value);
        });
        return;
      }
    } catch (_e) {
    }
    setChatHint("请手动复制：" + value);
  }
  function stopJobPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  function cancelPendingAnalysis() {
    stopJobPolling();
    setJobId("");
    setJobStatus("");
    var cleared = clearComposerDraft();
    setChatHint(
      cleared.ok ? "已取消等待并清空会话输入框草稿，可重新点「模型对话分析」。" : "已取消等待。清空草稿失败：" + (cleared.error || "未知错误") + "（可手动清空输入框）"
    );
  }
  function applyStoredReport(stored, opts) {
    if (!stored || !stored.report) return;
    setReport(uniquifyReportIds(stored.report));
    setTab("direct");
    setHistoryId(stored.id || "");
    var sourceLabel = stored.source === "model" ? "模型分析" : "确定性";
    var prefix = opts && opts.fromHistory ? "已打开历史任务" : "已加载该版本对比的清单";
    setChatHint(
      prefix + "（" + sourceLabel + " · " + (stored.savedAt || "") + "）。切换版本会自动换清单；点「刷新已存清单」可手动重载。"
    );
  }
  var refreshStoredReport = useCallback(
    function() {
      if (!repoPath.trim() || !baseCommit || !headCommit) {
        setError("请先选择仓库和两个版本");
        return;
      }
      viewingHistoryRef.current = null;
      setError("");
      if (!beginBusy("正在加载已存清单…")) return;
      apiPost("/tracescope/v1/report-load", {
        repoPath: repoPath.trim(),
        baseCommit,
        headCommit
      }).then(function(data) {
        if (data && data.found && data.stored && data.stored.report) {
          applyStoredReport(data.stored, {});
        } else {
          setReport(null);
          setHistoryId("");
          setChatHint("当前版本对比尚无已存清单，请「生成手测清单」或「模型对话分析」。");
        }
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [repoPath, baseCommit, headCommit]
  );
  var refreshHistory = useCallback(
    function() {
      apiPost("/tracescope/v1/report-history", {
        limit: 80
      }).then(function(data) {
        setHistory(data && data.entries || []);
      }).catch(function() {
        setHistory([]);
      });
    },
    []
  );
  var openHistoryEntry = useCallback(
    function(id) {
      if (!id) return;
      if (!beginBusy("正在打开历史任务…")) return;
      setError("");
      apiPost("/tracescope/v1/report-history-get", { id }).then(function(data) {
        if (data && data.stored) {
          var nextRepo = (data.stored.repoInput || "").trim();
          var nextBase = data.stored.baseCommit || "";
          var nextHead = data.stored.headCommit || "";
          viewingHistoryRef.current = {
            id: data.stored.id || id,
            repo: nextRepo || repoPath.trim(),
            base: nextBase,
            head: nextHead
          };
          skipPairLoadRef.current = true;
          if (nextRepo && nextRepo !== repoPath.trim()) {
            skipAutoSyncRef.current = true;
            setRepoPath(nextRepo);
            rememberRepo(nextRepo);
          }
          if (nextBase) setBaseCommit(nextBase);
          if (nextHead) setHeadCommit(nextHead);
          applyStoredReport(data.stored, { fromHistory: true });
        }
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [repoPath]
  );
  var switchRepo = useCallback(
    function(nextPath) {
      if (busyRef.current) {
        setChatHint(
          "请等待当前操作完成后再切换仓库" + (busyMsgRef.current ? "（" + busyMsgRef.current + "）" : "")
        );
        return;
      }
      var next = String(nextPath || "").trim();
      if (!next || next === repoPath.trim()) return;
      skipAutoSyncRef.current = false;
      stopJobPolling();
      setJobId("");
      setJobStatus("");
      setRepoPath(next);
      rememberRepo(next);
      setResolved(null);
      setCommits([]);
      setRefs([]);
      setBaseCommit("");
      setHeadCommit("");
      setReport(null);
      setHistoryId("");
      setBranchQuery("");
      setBranchPickerOpen(false);
      setCommitListRef("");
      viewingHistoryRef.current = null;
      setChatHint("已切换仓库「" + shortRepoLabel(next) + "」，正在默认同步版本…");
      setSettingsOpen(false);
    },
    [repoPath]
  );
  useEffect(function() {
    if (!repoPath.trim() || !baseCommit || !headCommit) {
      if (!viewingHistoryRef.current) {
        setReport(null);
        setHistoryId("");
      }
      return;
    }
    var pinned = viewingHistoryRef.current;
    if (pinned && pinned.repo === repoPath.trim() && pinned.base === baseCommit && pinned.head === headCommit) {
      return;
    }
    if (skipPairLoadRef.current) {
      skipPairLoadRef.current = false;
      return;
    }
    viewingHistoryRef.current = null;
    var cancelled = false;
    setReport(null);
    setHistoryId("");
    setChatHint("正在加载该版本对比的已存清单…");
    apiPost("/tracescope/v1/report-load", {
      repoPath: repoPath.trim(),
      baseCommit,
      headCommit
    }).then(function(data) {
      if (cancelled) return;
      if (data && data.found && data.stored && data.stored.report) {
        applyStoredReport(data.stored, {});
      } else {
        setReport(null);
        setHistoryId("");
        setChatHint("当前版本对比尚无已存清单，请「生成手测清单」或「模型对话分析」。");
      }
    }).catch(function() {
      if (cancelled) return;
      setReport(null);
      setChatHint("加载已存清单失败；可点「刷新清单」重试，或重新生成。");
    });
    return function() {
      cancelled = true;
    };
  }, [repoPath, baseCommit, headCommit]);
  useEffect(function() {
    refreshHistory();
  }, [refreshHistory]);
  useEffect(function() {
    return function() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);
  useEffect(function() {
    if (!jobId || jobStatus === "published" || jobStatus === "error") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    function tick() {
      apiGet("/tracescope/v1/job", { id: jobId }).then(function(data) {
        setJobStatus(data.status || "");
        if (data.status === "published" && data.report) {
          setReport(uniquifyReportIds(data.report));
          setTab("direct");
          setChatHint("清单已更新并持久化到本机（来自会话模型分析）");
          refreshHistory();
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } else if (data.status === "error") {
          setChatHint(data.error || "任务失败");
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }).catch(function() {
      });
    }
    tick();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(tick, 2e3);
    return function() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, jobStatus, refreshHistory]);
  var loadCommits = useCallback(
    function(forceFetch, opts) {
      setError("");
      if (!repoPath.trim()) {
        setError("请填写本地路径或远端仓库地址");
        return;
      }
      var codeupToken = codeupRequestToken();
      if (authMode === "token" || accessMode === "codeup") {
        if (!codeupToken && !yxTokenSaved) {
          setError("请选择「个人访问令牌」并填写令牌。填一次会记在本机。");
          setSettingsOpen(true);
          setRemoteAuthMode("token");
          return;
        }
      } else if (authMode === "https") {
        if (!usableSecret(authToken)) {
          setError("私有仓请填写 HTTPS 用户名和密码 / Token");
          setSettingsOpen(true);
          return;
        }
      } else if (authMode === "ssh") {
        if (!authKey.trim()) {
          setError("请填写 SSH 私钥文件的本机绝对路径");
          return;
        }
      } else if (isCodeupHttps(repoPath) && !codeupToken && !yxTokenSaved) {
        setError("私有仓库请使用「个人访问令牌」");
        setSettingsOpen(true);
        setRemoteAuthMode("token");
        return;
      }
      localStorage.setItem(REPO_PATH_KEY, repoPath.trim());
      localStorage.setItem(ACCESS_MODE_KEY, accessMode);
      rememberRepo(repoPath.trim());
      persistAuth();
      if (!beginBusy(accessMode === "codeup" ? "正在通过远端 API 读取版本…" : "正在同步仓库版本…")) return;
      apiPost("/tracescope/v1/commits", {
        repoPath: repoPath.trim(),
        limit: 80,
        fetch: forceFetch === false ? false : true,
        refName: opts && opts.refName ? opts.refName : void 0,
        auth: buildAuthPayload(),
        accessMode,
        codeup: accessMode === "codeup" ? {
          endpoint: yxEndpoint,
          token: codeupRequestToken(),
          organizationId: yxOrg.trim()
        } : void 0
      }).then(function(data) {
        setResolved(data.resolved || null);
        var list = data.commits || [];
        setCommits(list);
        setRefs(data.refs || []);
        var shownRef = data.commitRef && String(data.commitRef) || opts && opts.refName || "";
        setCommitListRef(shownRef);
        if (list.length && !(opts && opts.preserveSelection)) {
          var newest = matchingBranches(data.refs || [], "")[0] || null;
          var currentRef = String(
            data.commitRef && String(data.commitRef) || opts && opts.refName || ""
          );
          if (newest && newest.name && !(opts && opts.refName) && currentRef !== newest.name) {
            setTimeout(function() {
              loadCommits(forceFetch === false ? false : true, {
                refName: newest.name
              });
            }, 0);
            return;
          }
          setHeadCommit(list[0].sha);
          setBaseCommit(list[Math.min(1, list.length - 1)].sha);
          setChatHint(
            "已同步" + (currentRef || newest && newest.name ? "分支「" + (currentRef || newest.name) + "」" : "版本") + "：待测 " + (list[0].short || list[0].sha.slice(0, 7)) + "（最新），稳定 " + (list[1] && (list[1].short || list[1].sha.slice(0, 7)) || list[0].short || list[0].sha.slice(0, 7)) + (list[1] ? "（倒数第二）" : "")
          );
        } else if (list.length && opts && opts.refName) {
          setChatHint(
            "已加载分支「" + opts.refName + "」近期提交 " + list.length + " 条，可在下方下拉里选具体 commit"
          );
        }
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [repoPath, authMode, authUser, authToken, authKey, rememberAuth, accessMode, yxToken, yxTokenSaved, yxEndpoint, yxOrg]
  );
  useEffect(
    function() {
      if (!authHydrated) return;
      if (!repoPath.trim()) return;
      if ((authMode === "token" || accessMode === "codeup") && !codeupRequestToken() && !yxTokenSaved) {
        return;
      }
      if (accessMode !== "codeup" && authMode !== "token" && isCodeupHttps(repoPath) && authMode !== "ssh" && !codeupRequestToken() && !yxTokenSaved) {
        return;
      }
      if (skipAutoSyncRef.current) {
        skipAutoSyncRef.current = false;
        loadCommits(true, { preserveSelection: true });
        return;
      }
      loadCommits(true);
    },
    // Sync when the repo, access mode, or (for the Codeup fallback) token becomes available.
    [authHydrated, repoPath, accessMode, yxToken, yxTokenSaved, authToken, authMode]
  );
  var selectedRelatedWorkItems = useCallback(
    function() {
      return (wiItems || []).filter(function(it) {
        return it && it.id && wiSelected[it.id];
      });
    },
    [wiItems, wiSelected]
  );
  var analyze = useCallback(
    function() {
      setError("");
      setChatHint("");
      if (!repoPath.trim() || !baseCommit || !headCommit) {
        setError("请选择项目路径和两个版本");
        return;
      }
      function runAnalyze() {
        persistAuth();
        if (!beginBusy("正在生成手测清单…")) return;
        var related = selectedRelatedWorkItems();
        apiPost("/tracescope/v1/analyze", {
          repoPath: repoPath.trim(),
          baseCommit,
          headCommit,
          rippleDepth: 2,
          auth: buildAuthPayload(),
          accessMode,
          codeup: accessMode === "codeup" ? {
            endpoint: yxEndpoint,
            token: codeupRequestToken(),
            organizationId: yxOrg.trim()
          } : void 0,
          relatedWorkItems: related
        }).then(function(data) {
          setReport(uniquifyReportIds(data.report));
          setTab("direct");
          viewingHistoryRef.current = null;
          setChatHint(
            accessMode === "codeup" ? "已通过远端 API 生成直接变更清单（无静态波及）。需要模型看 diff 时点「模型对话分析」。" : related.length ? "已生成清单（含 " + related.length + " 条关联敏捷任务种子），并保存到本机。" : "已生成确定性清单并保存到本机。需要模型互动分析时点「模型对话分析」。"
          );
          refreshHistory();
        }).catch(function(err) {
          setError(err.message || String(err));
        }).finally(function() {
          endBusy();
        });
      }
      if (report) {
        setConfirmDlg({
          title: "重新生成清单？",
          message: "当前版本对比已有手测清单。重新生成将覆盖现有清单与勾选进度，且同版本只保留最新一条历史。",
          confirmLabel: "重新生成",
          danger: false,
          onConfirm: runAnalyze
        });
        return;
      }
      runAnalyze();
    },
    [
      repoPath,
      baseCommit,
      headCommit,
      authMode,
      authUser,
      authToken,
      authKey,
      accessMode,
      yxToken,
      yxEndpoint,
      yxOrg,
      rememberAuth,
      refreshHistory,
      report,
      selectedRelatedWorkItems
    ]
  );
  var startChatAnalysis = useCallback(
    function() {
      setError("");
      setChatHint("");
      if (!repoPath.trim() || !baseCommit || !headCommit) {
        setError("请选择项目路径和两个版本");
        return;
      }
      function runChat() {
        persistAuth();
        if (!beginBusy("正在准备模型对话分析…")) return;
        var related = selectedRelatedWorkItems();
        apiPost("/tracescope/v1/jobs", {
          repoPath: repoPath.trim(),
          baseCommit,
          headCommit,
          fetch: true,
          auth: buildAuthPayload(),
          accessMode,
          codeup: accessMode === "codeup" ? {
            endpoint: yxEndpoint,
            token: codeupRequestToken(),
            organizationId: yxOrg.trim()
          } : void 0,
          relatedWorkItems: related
        }).then(function(data) {
          setJobId(data.jobId);
          setJobStatus(data.status || "pending");
          var filled = fillComposerDraft(data.prompt || "");
          if (filled.ok) {
            setChatHint(
              (related.length ? "已把 " + related.length + " 条敏捷任务写入提示。" : "") + "已填入当前会话输入框（任务 ID 见下方，可复制给模型确认）。请核对后发送；Agent publish 后清单会刷新。未发送可再点按钮取消并清空草稿。"
            );
          } else {
            setChatHint(
              (filled.error || "无法写入输入框") + "。请手动复制下方提示到会话发送。任务 ID：" + data.jobId
            );
            try {
              if (navigator.clipboard && data.prompt) {
                navigator.clipboard.writeText(data.prompt);
                setChatHint(function(prev) {
                  return prev + "（提示已尝试复制到剪贴板）";
                });
              }
            } catch (_clip) {
            }
          }
        }).catch(function(err) {
          setError(err.message || String(err));
        }).finally(function() {
          endBusy();
        });
      }
      if (report && report.modelEnriched) {
        setConfirmDlg({
          title: "重新发起模型分析？",
          message: "当前版本对比已有模型分析清单。重新发起后，Agent publish 将覆盖现有清单与勾选进度。",
          confirmLabel: "继续分析",
          danger: false,
          onConfirm: runChat
        });
        return;
      }
      runChat();
    },
    [
      repoPath,
      baseCommit,
      headCommit,
      authMode,
      authUser,
      authToken,
      authKey,
      accessMode,
      yxToken,
      yxEndpoint,
      yxOrg,
      rememberAuth,
      report,
      selectedRelatedWorkItems
    ]
  );
  var deleteSelectedHistory = useCallback(
    function() {
      if (!historyId) {
        setError("请先在历史任务中选择一条记录");
        return;
      }
      var target = (history || []).find(function(h) {
        return h.id === historyId;
      });
      var desc = target ? shortSha(target.baseCommit) + "→" + shortSha(target.headCommit) : historyId;
      setConfirmDlg({
        title: "删除历史任务？",
        message: "将永久删除该版本对比的清单与历史记录（" + desc + "），此操作不可恢复。",
        confirmLabel: "删除",
        danger: true,
        onConfirm: function() {
          if (!beginBusy("正在删除历史任务…")) return;
          setError("");
          apiPost("/tracescope/v1/report-history-delete", { id: historyId }).then(function() {
            setHistoryId("");
            setReport(null);
            setChatHint("已删除该历史任务。");
            refreshHistory();
          }).catch(function(err) {
            setError(err.message || String(err));
          }).finally(function() {
            endBusy();
          });
        }
      });
    },
    [historyId, history, refreshHistory]
  );
  var onStatus = useCallback(function(listKind, itemIndex, itemId, status) {
    setReport(function(prev) {
      if (!prev) return prev;
      var base2 = uniquifyReportIds(prev);
      var kind = listKind === "ripple" ? "ripple" : "direct";
      var list = (base2[kind] || []).slice();
      if (typeof itemIndex !== "number" || itemIndex < 0 || itemIndex >= list.length) {
        return base2;
      }
      var item = list[itemIndex];
      var next = Object.assign({}, item, { status });
      if (status !== "fail") {
        delete next.testerNote;
        delete next.testerScreenshots;
      }
      list[itemIndex] = next;
      var updated = Object.assign({}, base2);
      updated[kind] = list;
      return updated;
    });
    var current = reportRef.current;
    var repo = (repoPath.trim() || current && current.repoPath || "").trim();
    var base = baseCommit || current && current.baseCommit || "";
    var head = headCommit || current && current.headCommit || "";
    if (repo && base && head && itemId) {
      apiPost("/tracescope/v1/report-status", {
        repoPath: repo,
        baseCommit: base,
        headCommit: head,
        itemId,
        listKind: listKind === "ripple" ? "ripple" : "direct",
        itemIndex,
        status,
        testerScreenshots: status === "fail" ? void 0 : []
      }).catch(function() {
      });
    }
  }, [repoPath, baseCommit, headCommit]);
  var onNote = useCallback(
    function(listKind, itemIndex, itemId, note, persistNow) {
      var value = String(note || "");
      var kind = listKind === "ripple" ? "ripple" : "direct";
      setReport(function(prev) {
        if (!prev) return prev;
        var base = uniquifyReportIds(prev);
        var list = (base[kind] || []).slice();
        if (typeof itemIndex !== "number" || itemIndex < 0 || itemIndex >= list.length) {
          return base;
        }
        var next = Object.assign({}, list[itemIndex], { status: "fail" });
        if (value.trim()) next.testerNote = value;
        else delete next.testerNote;
        list[itemIndex] = next;
        var updated = Object.assign({}, base);
        updated[kind] = list;
        return updated;
      });
      function persist() {
        var current = reportRef.current;
        var repo = (repoPath.trim() || current && current.repoPath || "").trim();
        var base = baseCommit || current && current.baseCommit || "";
        var head = headCommit || current && current.headCommit || "";
        if (!(repo && base && head && itemId)) return;
        apiPost("/tracescope/v1/report-status", {
          repoPath: repo,
          baseCommit: base,
          headCommit: head,
          itemId,
          listKind: kind,
          itemIndex,
          status: "fail",
          testerNote: value
        }).catch(function() {
        });
      }
      var timerKey = kind + ":" + itemIndex + ":" + itemId;
      if (noteTimersRef.current[timerKey]) {
        clearTimeout(noteTimersRef.current[timerKey]);
        noteTimersRef.current[timerKey] = null;
      }
      if (persistNow) {
        persist();
      } else {
        noteTimersRef.current[timerKey] = setTimeout(persist, 450);
      }
    },
    [repoPath, baseCommit, headCommit]
  );
  var onScreenshots = useCallback(
    function(listKind, itemIndex, itemId, shots, persistNow) {
      var kind = listKind === "ripple" ? "ripple" : "direct";
      var nextShots = (shots || []).slice(0, MAX_SHOTS);
      setReport(function(prev) {
        if (!prev) return prev;
        var base2 = uniquifyReportIds(prev);
        var list = (base2[kind] || []).slice();
        if (typeof itemIndex !== "number" || itemIndex < 0 || itemIndex >= list.length) {
          return base2;
        }
        var next = Object.assign({}, list[itemIndex], { status: "fail" });
        if (nextShots.length) next.testerScreenshots = nextShots;
        else delete next.testerScreenshots;
        list[itemIndex] = next;
        var updated = Object.assign({}, base2);
        updated[kind] = list;
        return updated;
      });
      if (!persistNow) return;
      var current = reportRef.current;
      var repo = (repoPath.trim() || current && current.repoPath || "").trim();
      var base = baseCommit || current && current.baseCommit || "";
      var head = headCommit || current && current.headCommit || "";
      if (!(repo && base && head && itemId)) return;
      apiPost("/tracescope/v1/report-status", {
        repoPath: repo,
        baseCommit: base,
        headCommit: head,
        itemId,
        listKind: kind,
        itemIndex,
        status: "fail",
        testerScreenshots: nextShots
      }).catch(function(err) {
        setChatHint(err.message || "保存截图失败（可能体积过大）");
      });
    },
    [repoPath, baseCommit, headCommit]
  );
  var onShotHint = useCallback(function(msg) {
    if (msg) setChatHint(msg);
  }, []);
  var uploadTaskFiles = useCallback(
    function(files) {
      if (!report) {
        setChatHint("请先生成手测清单，再上传任务附件");
        return;
      }
      var list = (files || []).filter(Boolean);
      if (!list.length) return;
      var currentCount = report.attachments && report.attachments.length || 0;
      if (currentCount >= 8) {
        setChatHint("任务附件最多 8 个");
        return;
      }
      var room = 8 - currentCount;
      var queue = list.slice(0, room);
      if (!beginBusy("正在上传任务附件…")) return;
      var idx = 0;
      function next() {
        if (idx >= queue.length) {
          endBusy();
          return;
        }
        var file = queue[idx++];
        var electronPath = file && file.path ? String(file.path) : "";
        if (electronPath && file.size > 35 * 1024 * 1024) {
          updateBusyMessage("正在从本机路径添加「" + file.name + "」…");
          setChatHint("正在从本机路径添加「" + file.name + "」…");
          apiPost("/tracescope/v1/report-attachments", {
            action: "upload",
            repoPath: repoPath.trim(),
            baseCommit: baseCommit || report.baseCommit,
            headCommit: headCommit || report.headCommit,
            localPath: electronPath,
            name: file.name,
            mime: file.type || void 0
          }).then(function(data) {
            if (data && data.attachments) {
              setReport(function(prev) {
                if (!prev) return prev;
                return Object.assign({}, prev, { attachments: data.attachments });
              });
            }
            setChatHint("已添加附件「" + file.name + "」");
            next();
          }).catch(function(err) {
            endBusy();
            setError(err.message || String(err));
          });
          return;
        }
        if (file.size > 40 * 1024 * 1024) {
          setChatHint(
            "「" + file.name + "」过大（>40MB）。请在下方填写本机绝对路径后点「从路径添加」。"
          );
          next();
          return;
        }
        updateBusyMessage("正在上传「" + file.name + "」…");
        setChatHint("正在上传「" + file.name + "」…");
        fileToBase64(file).then(function(b64) {
          return apiPost("/tracescope/v1/report-attachments", {
            action: "upload",
            repoPath: repoPath.trim(),
            baseCommit: baseCommit || report.baseCommit,
            headCommit: headCommit || report.headCommit,
            name: file.name,
            mime: file.type || void 0,
            dataBase64: b64
          });
        }).then(function(data) {
          if (data && data.attachments) {
            setReport(function(prev) {
              if (!prev) return prev;
              return Object.assign({}, prev, { attachments: data.attachments });
            });
          }
          setChatHint("已添加附件「" + file.name + "」");
          next();
        }).catch(function(err) {
          endBusy();
          setError(err.message || String(err));
        });
      }
      next();
    },
    [report, repoPath, baseCommit, headCommit]
  );
  var uploadTaskLocalPath = useCallback(
    function() {
      if (!report) {
        setChatHint("请先生成手测清单，再上传任务附件");
        return;
      }
      var localPath = taskAttachPath.trim();
      if (!localPath) return;
      if (!beginBusy("正在从路径添加附件…")) return;
      setError("");
      apiPost("/tracescope/v1/report-attachments", {
        action: "upload",
        repoPath: repoPath.trim(),
        baseCommit: baseCommit || report.baseCommit,
        headCommit: headCommit || report.headCommit,
        localPath
      }).then(function(data) {
        if (data && data.attachments) {
          setReport(function(prev) {
            if (!prev) return prev;
            return Object.assign({}, prev, { attachments: data.attachments });
          });
        }
        setTaskAttachPath("");
        setChatHint("已从本机路径添加附件");
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [report, repoPath, baseCommit, headCommit, taskAttachPath]
  );
  var removeTaskAttachment = useCallback(
    function(id) {
      if (!report || !id) return;
      if (!beginBusy("正在删除附件…")) return;
      apiPost("/tracescope/v1/report-attachments", {
        action: "delete",
        repoPath: repoPath.trim(),
        baseCommit: baseCommit || report.baseCommit,
        headCommit: headCommit || report.headCommit,
        id
      }).then(function(data) {
        setReport(function(prev) {
          if (!prev) return prev;
          return Object.assign({}, prev, {
            attachments: data && data.attachments || []
          });
        });
        setChatHint("已移除任务附件");
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [report, repoPath, baseCommit, headCommit]
  );
  var downloadTaskAttachment = useCallback(
    function(att) {
      if (!report || !att) return;
      if (!beginBusy("正在下载附件…")) return;
      apiPost("/tracescope/v1/report-attachments", {
        action: "download",
        repoPath: repoPath.trim(),
        baseCommit: baseCommit || report.baseCommit,
        headCommit: headCommit || report.headCommit,
        id: att.id
      }).then(function(data) {
        if (data && data.tooLarge && data.localPath) {
          copyText(data.localPath, "本机路径");
          setChatHint(
            "附件较大，已复制本机路径：" + data.localPath + "（可在资源管理器中打开）"
          );
          return;
        }
        if (!data || !data.dataBase64) throw new Error("下载失败");
        var bin = atob(data.dataBase64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var blob = new Blob([bytes], { type: att.mime || "application/octet-stream" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = att.name || "attachment";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function() {
          URL.revokeObjectURL(url);
        }, 1500);
        setChatHint("已开始下载「" + att.name + "」");
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [report, repoPath, baseCommit, headCommit]
  );
  var copyFailFeedback = useCallback(
    function() {
      if (!report) return;
      var failed = [].concat(report.direct || [], report.ripple || []).filter(function(it) {
        return (it.status || "pending") === "fail";
      });
      if (!failed.length) {
        setChatHint("当前没有标记为失败的条目");
        return;
      }
      var lines = [
        "【TraceScope 失败反馈】",
        "仓库：" + (repoPath || report.repoPath || ""),
        "稳定：" + (baseCommit || report.baseCommit || ""),
        "待测：" + (headCommit || report.headCommit || ""),
        ""
      ];
      failed.forEach(function(it, i) {
        lines.push(
          i + 1 + ". " + it.displayName + "（" + (it.kind === "direct" ? "直接" : "波及") + " / 风险 " + it.risk + "）"
        );
        if (it.files && it.files.length) {
          lines.push("   文件：" + it.files.join(", "));
        }
        lines.push("   备注：" + (it.testerNote && it.testerNote.trim() || "（未填写）"));
        var shotNames = (it.testerScreenshots || []).map(function(s) {
          return s.name;
        }).filter(Boolean);
        if (shotNames.length) {
          lines.push("   截图：" + shotNames.join("、") + "（共 " + shotNames.length + " 张，详见本机清单）");
        }
        lines.push("");
      });
      copyText(lines.join("\n"), "失败反馈");
    },
    [report, repoPath, baseCommit, headCommit]
  );
  var exportReportFile = useCallback(
    function() {
      if (!report) {
        setChatHint("当前没有可导出的清单");
        return;
      }
      var base = baseCommit || report.baseCommit || "";
      var head = headCommit || report.headCommit || "";
      var stamp = String(report.generatedAt || (/* @__PURE__ */ new Date()).toISOString()).replace(/[:.]/g, "-").slice(0, 19);
      var filename = "tracescope-" + String(base).slice(0, 7) + "-" + String(head).slice(0, 7) + "-" + stamp + ".md";
      if (!beginBusy("正在导出清单…")) return;
      setError("");
      apiPost("/tracescope/v1/report-export", {
        repoPath: repoPath.trim() || report.repoPath || "",
        baseCommit: base,
        headCommit: head
      }).then(function(data) {
        var text = data && data.markdown || "";
        var name2 = data && data.filename || filename;
        downloadTextFile(name2, text, "text/markdown");
        setChatHint("已导出：" + name2);
      }).catch(function() {
        var text = buildLocalExportMarkdown(report, {
          repoPath: repoPath.trim() || report.repoPath || "",
          baseCommit: base,
          headCommit: head
        });
        downloadTextFile(filename, text, "text/markdown");
        setChatHint("已导出（本地面板数据）：" + filename);
      }).finally(function() {
        endBusy();
      });
    },
    [report, repoPath, baseCommit, headCommit]
  );
  var saveTrackerSettings = useCallback(
    function() {
      if (!beginBusy("正在保存协作平台配置…")) return;
      var payload = { provider: trackerProvider };
      if (trackerProvider === "yunxiao") {
        payload.yunxiao = {
          endpoint: yxEndpoint,
          token: yxToken,
          organizationId: yxOrg,
          spaceId: yxSpace,
          workitemTypeId: yxType,
          assignedTo: yxAssignee
        };
      } else if (trackerProvider === "github") {
        payload.github = {
          token: ghToken,
          owner: ghOwner,
          repo: ghRepo,
          labels: ghLabels
        };
      } else if (trackerProvider === "gitlab") {
        payload.gitlab = {
          host: glHost,
          token: glToken,
          projectId: glProject,
          labels: glLabels
        };
      } else if (trackerProvider === "webhook") {
        payload.webhook = { url: whUrl, authHeader: whAuth };
      }
      apiPost("/tracescope/v1/tracker-config-save", payload).then(function(data) {
        setTrackerReady(Boolean(data && data.ready));
        setChatHint(
          data && data.ready ? "协作平台配置已保存，可将失败反馈一键提交。" : trackerProvider === "none" ? "已清除协作平台配置。" : "配置已写入，但仍不完整，请检查必填项。"
        );
      }).catch(function(err) {
        setError(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [
      trackerProvider,
      yxEndpoint,
      yxToken,
      yxOrg,
      yxSpace,
      yxType,
      yxAssignee,
      ghToken,
      ghOwner,
      ghRepo,
      ghLabels,
      glHost,
      glToken,
      glProject,
      glLabels,
      whUrl,
      whAuth
    ]
  );
  var appendYunxiaoDebug = useCallback(function(action, data) {
    if (!data || !data.debug) return;
    var d = data.debug;
    var lines = [
      "── " + action + " @ " + (d.at || "") + " ──",
      (d.method || "?") + " " + (d.path || ""),
      "status: " + (d.status != null ? d.status : "?") + (d.optionCount != null ? "  options: " + d.optionCount : "")
    ];
    if (d.requestBody) lines.push("request: " + d.requestBody);
    if (d.error) lines.push("error: " + d.error);
    if (data.warning) lines.push("warning: " + data.warning);
    if (data.error) lines.push("apiError: " + data.error);
    if (d.responsePreview) lines.push("response:\n" + d.responsePreview);
    lines.push("");
    setYxRequestLog(function(prev) {
      var next = (prev ? prev + "\n" : "") + lines.join("\n");
      return next.length > 12e3 ? next.slice(next.length - 12e3) : next;
    });
  }, []);
  var loadYunxiaoCatalog = useCallback(
    function(action, extra) {
      setYxCatalogHint("正在从云效拉取…");
      return apiPost(
        "/tracescope/v1/yunxiao-catalog",
        Object.assign(
          {
            action,
            endpoint: yxEndpoint,
            token: yxToken,
            organizationId: yxOrg,
            spaceId: yxSpace,
            debug: yxDebugLog
          },
          extra || {}
        )
      ).then(function(data) {
        appendYunxiaoDebug(action, data);
        if (data && data.error && !(data.options && data.options.length)) {
          var errMsg = data.error;
          setYxCatalogHint(errMsg);
          throw new Error(errMsg);
        }
        var options = data && data.options || [];
        if (data && data.warning && !options.length) {
          setYxCatalogHint(data.warning);
        } else {
          setYxCatalogHint("已拉取 " + options.length + " 项");
        }
        return options;
      }).catch(function(err) {
        setYxCatalogHint(err.message || String(err));
        throw err;
      });
    },
    [yxEndpoint, yxToken, yxOrg, yxSpace, yxDebugLog, appendYunxiaoDebug]
  );
  var refreshYunxiaoOrgs = useCallback(
    function() {
      if (!beginBusy("正在拉取云效企业列表…")) return;
      setYxCatalogHint("正在拉取云效企业…");
      loadYunxiaoCatalog("organizations").then(function(options) {
        setYxOrgs(options);
        if (options.length === 1 && !yxOrg) {
          setYxOrg(options[0].id);
        }
      }).catch(function() {
      }).finally(function() {
        endBusy();
      });
    },
    [loadYunxiaoCatalog, yxOrg]
  );
  var refreshYunxiaoProjectsAndMembers = useCallback(
    function(orgId) {
      var org = orgId || yxOrg;
      if (!org) {
        setYxCatalogHint("请先选择企业");
        return;
      }
      if (!beginBusy("正在拉取云效项目与成员…")) return;
      setYxCatalogHint("正在拉取项目与成员…");
      Promise.all([
        loadYunxiaoCatalog("projects", { organizationId: org }),
        loadYunxiaoCatalog("members", { organizationId: org })
      ]).then(function(results) {
        var projects = results[0] || [];
        var members = results[1] || [];
        setYxProjects(projects);
        if (projects.length === 1) setYxSpace(projects[0].id);
        setYxMembers(members);
        if (members.length === 1) setYxAssignee(members[0].id);
        if (!projects.length) {
          setYxCatalogHint(
            "企业已选中，但项目列表为空（请检查 PAT 项目权限，或手动填写 spaceId）"
          );
        } else {
          setYxCatalogHint("已拉取项目 " + projects.length + " 个、成员 " + members.length + " 人");
        }
      }).catch(function(err) {
        setYxCatalogHint(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [loadYunxiaoCatalog, yxOrg]
  );
  var refreshYunxiaoTypes = useCallback(
    function(orgId, spaceId) {
      var org = orgId || yxOrg;
      var space = spaceId || yxSpace;
      if (!org || !space) {
        setYxCatalogHint("请先选择企业和项目");
        return;
      }
      if (!beginBusy("正在拉取云效缺陷类型…")) return;
      loadYunxiaoCatalog("workitemTypes", {
        organizationId: org,
        spaceId: space,
        category: "Bug"
      }).then(function(options) {
        setYxTypes(options);
        if (options.length === 1) setYxType(options[0].id);
      }).catch(function() {
      }).finally(function() {
        endBusy();
      });
    },
    [loadYunxiaoCatalog, yxOrg, yxSpace]
  );
  var refreshAgileWorkitems = useCallback(
    function() {
      if (!yxOrg || !yxSpace) {
        setWiHint("请先在协作平台里选择企业和项目");
        return;
      }
      var categories = Object.keys(wiCats || {}).filter(function(k) {
        return wiCats[k];
      });
      if (!categories.length) {
        setWiHint("请至少勾选一种工作项类型");
        return;
      }
      if (!beginBusy("正在拉取敏捷任务…")) return;
      setWiHint("正在拉取敏捷任务…");
      apiPost("/tracescope/v1/yunxiao-catalog", {
        action: "workitems",
        endpoint: yxEndpoint,
        token: yxToken,
        organizationId: yxOrg,
        spaceId: yxSpace,
        categories
      }).then(function(data) {
        var items2 = data && data.items || [];
        setWiItems(items2);
        setWiSelected({});
        setWiHint("已拉取 " + items2.length + " 条，可多选后生成手测清单");
      }).catch(function(err) {
        setWiHint(err.message || String(err));
      }).finally(function() {
        endBusy();
      });
    },
    [yxEndpoint, yxToken, yxOrg, yxSpace, wiCats]
  );
  var submitTracker = useCallback(
    function() {
      if (!report) return;
      var failed = [].concat(report.direct || [], report.ripple || []).filter(function(it) {
        return (it.status || "pending") === "fail";
      });
      if (!failed.length) {
        setChatHint("当前没有标记为失败的条目");
        return;
      }
      if (!trackerReady) {
        setConfirmDlg({
          title: "先配置协作平台？",
          message: "尚未配置完整的协作平台。请打开「仓库配置」选择云效 / GitHub / GitLab / Webhook 并保存。",
          confirmLabel: "打开配置",
          danger: false,
          onConfirm: function() {
            setSettingsOpen(true);
          }
        });
        return;
      }
      setConfirmDlg({
        title: "提交失败反馈？",
        message: "将把 " + failed.length + " 条失败反馈提交到已配置的协作平台（" + trackerProvider + "）。可修改下方标题后再提交。",
        inputLabel: "缺陷标题",
        inputValue: defaultFailSubject(failed, repoPath.trim() || report.repoPath || ""),
        confirmLabel: "提交",
        danger: false,
        onConfirm: function(subject) {
          if (!beginBusy("正在提交失败反馈到协作平台…")) return;
          setError("");
          apiPost("/tracescope/v1/tracker-submit", {
            repoPath: repoPath.trim(),
            baseCommit,
            headCommit,
            report,
            subject: String(subject || "").trim()
          }).then(function(data) {
            var tip = "已提交到 " + (data.provider || trackerProvider) + (data.id ? "（ID " + data.id + "）" : "") + "，共 " + (data.count || failed.length) + " 条失败。";
            if (data.url) tip += " 链接：" + data.url;
            var uploaded = Number(data.uploadedAttachments || 0);
            var failedUp = Number(data.failedAttachments || 0);
            if (uploaded || failedUp) {
              tip += " 附件上传成功 " + uploaded + " 个";
              if (failedUp) tip += "，失败 " + failedUp + " 个";
              tip += "。";
            }
            if (data.attachmentErrors && data.attachmentErrors.length) {
              tip += "（" + data.attachmentErrors[0] + "）";
            }
            setChatHint(tip);
          }).catch(function(err) {
            setError(err.message || String(err));
          }).finally(function() {
            endBusy();
          });
        }
      });
    },
    [report, repoPath, baseCommit, headCommit, trackerReady, trackerProvider]
  );
  var items = report ? (tab === "direct" ? report.direct : report.ripple) || [] : [];
  return jsxs2("div", {
    style: styles.root,
    children: [
      jsx2("style", {
        children: "@keyframes tracescope-spin{to{transform:rotate(360deg)}}"
      }),
      busy ? jsx2("div", {
        style: styles.busyOverlay,
        role: "status",
        "aria-live": "polite",
        "aria-busy": "true",
        onClick: function(e) {
          e.preventDefault();
          e.stopPropagation();
        },
        onMouseDown: function(e) {
          e.preventDefault();
          e.stopPropagation();
        },
        children: jsxs2("div", {
          style: styles.busyBanner,
          children: [
            jsx2("div", { style: styles.busySpinner, "aria-hidden": "true" }),
            jsx2("div", {
              style: { fontWeight: 700, marginBottom: 6 },
              children: "加载中，请稍候"
            }),
            jsx2("div", {
              style: { color: "#6b645a", fontSize: 12, lineHeight: 1.45 },
              children: busyMessage || "正在处理请求。网络较慢时请勿重复操作，完成前其它按钮已锁定。"
            })
          ]
        })
      }) : null,
      jsxs2("div", {
        style: styles.row,
        children: [
          jsx2("strong", { children: "TraceScope 测试工作台" }),
          jsx2("span", {
            style: { color: busy ? "#0f6e56" : "#6b645a" },
            children: busy ? busyMessage || "处理中…" : health
          })
        ]
      }),
      jsxs2("section", {
        style: styles.card,
        children: [
          jsxs2("div", {
            style: Object.assign({}, styles.row, { justifyContent: "space-between" }),
            children: [
              jsxs2("div", {
                style: Object.assign({}, styles.row, { flex: 1, minWidth: 0 }),
                children: [
                  jsx2("span", {
                    style: { fontWeight: 700, whiteSpace: "nowrap" },
                    children: "仓库"
                  }),
                  jsx2("select", {
                    style: Object.assign({}, styles.input, {
                      flex: 1,
                      minWidth: 120,
                      marginBottom: 0
                    }),
                    value: repoList.indexOf(repoPath.trim()) !== -1 ? repoPath.trim() : "",
                    disabled: busy || !repoList.length && !repoPath.trim(),
                    title: repoPath || "选择已保存的仓库",
                    onChange: function(e) {
                      var v = e.target.value;
                      if (v) switchRepo(v);
                    },
                    children: [
                      jsx2(
                        "option",
                        {
                          value: "",
                          children: repoPath.trim() ? "当前：" + shortRepoLabel(repoPath) : "选择仓库 / 先在配置中添加"
                        },
                        "repo-empty"
                      )
                    ].concat(
                      (repoList || []).map(function(r) {
                        return jsx2(
                          "option",
                          { value: r, children: shortRepoLabel(r) + " — " + r },
                          r
                        );
                      })
                    )
                  })
                ]
              }),
              jsx2("button", {
                type: "button",
                style: styles.btn,
                disabled: busy,
                onClick: function() {
                  if (busy) return;
                  setSettingsOpen(!settingsOpen);
                },
                children: settingsOpen ? "收起配置" : "仓库配置"
              })
            ]
          }),
          !settingsOpen && repoPath.trim() ? jsx2("p", {
            style: { margin: "6px 0 0", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
            children: shortRepoLabel(repoPath) + (resolved ? " · " + (resolved.source === "codeup" ? "远端 API" : resolved.source === "remote" ? "远端缓存" : "本地") + (resolved.authMode && resolved.authMode !== "none" ? " · 认证 " + (authMode === "token" ? "个人访问令牌" : resolved.authMode) : authMode === "token" ? " · 认证 个人访问令牌" : "") + (authMode === "token" && (yxTokenSaved || usableSecret(yxToken)) ? " · 令牌已保存" : authMode === "token" ? " · 请填写个人访问令牌" : "") : "")
          }) : null,
          settingsOpen ? jsxs2("div", {
            style: {
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid var(--dsh-border, #ddd4c5)"
            },
            children: [
              jsxs2("label", {
                style: styles.label,
                children: [
                  "仓库路径 / 远端地址",
                  jsx2("input", {
                    style: styles.input,
                    value: repoPath,
                    disabled: busy,
                    placeholder: "C:\\work\\app 或 https://github.com/org/repo.git",
                    onChange: function(e) {
                      setRepoPath(e.target.value);
                    },
                    onBlur: function() {
                      if (repoPath.trim()) rememberRepo(repoPath.trim());
                    }
                  })
                ]
              }),
              jsxs2("label", {
                style: styles.label,
                children: [
                  "读取方式",
                  jsx2("select", {
                    style: styles.input,
                    value: accessMode,
                    disabled: busy,
                    onChange: function(e) {
                      var next = e.target.value === "codeup" ? "codeup" : "git";
                      setAccessMode(next);
                      try {
                        localStorage.setItem(ACCESS_MODE_KEY, next);
                      } catch (_e) {
                      }
                    },
                    children: [
                      jsx2("option", { value: "git", children: "本地 Git（推荐）" }, "mode-git"),
                      jsx2("option", {
                        value: "codeup",
                        children: "远端 API 兜底（无本机 Git）"
                      }, "mode-codeup")
                    ]
                  }),
                  jsx2("span", {
                    style: { display: "block", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                    children: accessMode === "codeup" ? "不克隆仓库，改用宿主提供的代码接口拉提交和 diff（当前支持云效 Codeup）。适合本机 Git 不可用时。静态波及仍需要本地 Git。" : "同步远端时只保存 git 对象，不再检出整棵源码。已有的工作区缓存仍可继续用。"
                  })
                ]
              }),
              jsxs2("div", {
                style: Object.assign({}, styles.row, { marginBottom: 8 }),
                children: [
                  jsx2("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy || !repoPath.trim(),
                    onClick: function() {
                      rememberRepo(repoPath.trim());
                      loadCommits(true);
                      setSettingsOpen(false);
                    },
                    children: "保存并加载版本"
                  }),
                  repoPath.trim() && repoList.indexOf(repoPath.trim()) !== -1 ? jsx2("button", {
                    type: "button",
                    style: styles.btn,
                    disabled: busy,
                    onClick: function() {
                      var cur = repoPath.trim();
                      var next = writeRepoList(
                        readRepoList().filter(function(r) {
                          return r !== cur;
                        })
                      );
                      setRepoList(next);
                      if (next.length) {
                        switchRepo(next[0]);
                      } else {
                        setRepoPath("");
                        localStorage.removeItem(REPO_PATH_KEY);
                        setResolved(null);
                        setCommits([]);
                        setRefs([]);
                        setBaseCommit("");
                        setHeadCommit("");
                        setReport(null);
                      }
                    },
                    children: "从列表移除"
                  }) : null
                ]
              }),
              jsxs2("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8
                },
                children: [
                  jsxs2("label", {
                    style: styles.label,
                    children: [
                      "远端认证",
                      jsx2("select", {
                        style: styles.input,
                        value: authMode,
                        onChange: function(e) {
                          setRemoteAuthMode(e.target.value);
                        },
                        children: [
                          jsx2("option", { value: "none", children: "无需认证" }),
                          jsx2("option", {
                            value: "token",
                            children: "个人访问令牌"
                          }),
                          jsx2("option", {
                            value: "https",
                            children: "HTTPS 用户名 + 密码/Token"
                          }),
                          jsx2("option", { value: "ssh", children: "SSH 私钥" })
                        ]
                      })
                    ]
                  }),
                  authMode === "https" ? jsxs2("label", {
                    style: styles.label,
                    children: [
                      "用户名",
                      jsx2("input", {
                        style: styles.input,
                        value: authUser,
                        onChange: function(e) {
                          setAuthUser(e.target.value);
                        }
                      })
                    ]
                  }) : jsx2("div", { children: null })
                ]
              }),
              authMode === "token" ? jsxs2("label", {
                style: styles.label,
                children: [
                  "个人访问令牌",
                  jsx2("input", {
                    style: styles.input,
                    type: "password",
                    value: yxToken,
                    disabled: busy,
                    placeholder: yxTokenSaved ? "已保存在本机，留空则继续使用" : "粘贴 PAT / 个人访问令牌即可",
                    onChange: function(e) {
                      setYxToken(e.target.value);
                    }
                  }),
                  jsx2("span", {
                    style: {
                      display: "block",
                      color: "#6b645a",
                      fontSize: 12,
                      lineHeight: 1.4
                    },
                    children: "适用于云效 Codeup、GitHub、GitLab 等。只需令牌，用户名固定为 git。云效仓库下同一份也可用于远端 API 与协作平台。"
                  })
                ]
              }) : null,
              authMode === "https" ? jsxs2("label", {
                style: styles.label,
                children: [
                  "密码 / Token",
                  jsx2("input", {
                    style: styles.input,
                    type: "password",
                    value: authToken,
                    placeholder: "与上方用户名配套的密码或 Token",
                    onChange: function(e) {
                      setAuthToken(e.target.value);
                    }
                  }),
                  jsx2("span", {
                    style: {
                      display: "block",
                      color: "#6b645a",
                      fontSize: 12,
                      lineHeight: 1.4
                    },
                    children: "标准 HTTPS 认证，需同时填写用户名。若只有个人访问令牌，请改用「个人访问令牌」模式。"
                  })
                ]
              }) : null,
              authMode === "ssh" ? jsxs2("label", {
                style: styles.label,
                children: [
                  "私钥绝对路径",
                  jsx2("input", {
                    style: styles.input,
                    value: authKey,
                    placeholder: "例如 C:\\Users\\you\\.ssh\\id_ed25519",
                    onChange: function(e) {
                      setAuthKey(e.target.value);
                    }
                  })
                ]
              }) : null,
              authMode !== "none" ? jsxs2("label", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 500,
                  marginTop: 4
                },
                children: [
                  jsx2("input", {
                    type: "checkbox",
                    checked: rememberAuth,
                    onChange: function(e) {
                      setRememberAuth(e.target.checked);
                    }
                  }),
                  "记住认证到本机"
                ]
              }) : null,
              mode === "functional" && (function() {
                return jsxs2(jsxRuntime.Fragment, {
                  children: [
                    jsx2("div", {
                      style: {
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px solid var(--dsh-border, #ddd4c5)",
                        fontWeight: 700
                      },
                      children: "协作平台"
                    }),
                    jsx2("p", {
                      style: { margin: "4px 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                      children: "关联工作项、提交失败反馈。可选云效 / GitHub / GitLab / Webhook。选云效时令牌可与上方「个人访问令牌」共用。"
                    }),
                    jsxs2("label", {
                      style: styles.label,
                      children: [
                        "平台",
                        jsx2("select", {
                          style: styles.input,
                          value: trackerProvider,
                          onChange: function(e) {
                            setTrackerProvider(e.target.value);
                          },
                          children: [
                            jsx2("option", { value: "none", children: "不启用" }),
                            jsx2("option", { value: "yunxiao", children: "阿里云效" }),
                            jsx2("option", { value: "github", children: "GitHub Issues" }),
                            jsx2("option", { value: "gitlab", children: "GitLab Issues" }),
                            jsx2("option", { value: "webhook", children: "通用 Webhook" })
                          ]
                        })
                      ]
                    }),
                    trackerProvider === "yunxiao" ? jsxs2("div", {
                      children: [
                        jsx2("p", {
                          style: {
                            margin: "0 0 8px",
                            color: "#6b645a",
                            fontSize: 12,
                            lineHeight: 1.4
                          },
                          children: "访问令牌与上方「个人访问令牌」共用。填好后点「拉取企业」，再依次选择企业 / 项目 / 缺陷类型 / 负责人。"
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "API Endpoint（一般不用改）",
                            jsx2("input", {
                              style: styles.input,
                              value: yxEndpoint,
                              onChange: function(e) {
                                setYxEndpoint(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs2("div", {
                          style: Object.assign({}, styles.row, { alignItems: "flex-end" }),
                          children: [
                            jsxs2("label", {
                              style: Object.assign({}, styles.label, {
                                flex: 1,
                                marginBottom: 0
                              }),
                              children: [
                                "访问令牌",
                                jsx2("input", {
                                  style: styles.input,
                                  type: "password",
                                  value: yxToken,
                                  placeholder: yxTokenSaved ? "已保存在本机" : "个人访问令牌",
                                  onChange: function(e) {
                                    setYxToken(e.target.value);
                                  }
                                })
                              ]
                            }),
                            jsx2("button", {
                              type: "button",
                              style: styles.primary,
                              disabled: busy || !usableSecret(yxToken) && !yxTokenSaved,
                              onClick: refreshYunxiaoOrgs,
                              children: "拉取企业"
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "企业 organizationId",
                            jsx2("select", {
                              style: styles.input,
                              value: yxOrg,
                              disabled: busy,
                              onChange: function(e) {
                                if (busy) return;
                                var id = e.target.value;
                                setYxOrg(id);
                                setYxSpace("");
                                setYxType("");
                                setYxAssignee("");
                                setYxProjects([]);
                                setYxTypes([]);
                                setYxMembers([]);
                                setWiItems([]);
                                setWiSelected({});
                                setWiHint("");
                                if (id) refreshYunxiaoProjectsAndMembers(id);
                              },
                              children: [
                                jsx2(
                                  "option",
                                  {
                                    value: "",
                                    children: yxOrgs.length ? "请选择企业" : "先点「拉取企业」"
                                  },
                                  "yx-org-empty"
                                )
                              ].concat(
                                (yxOrgs || []).map(function(o) {
                                  return jsx2(
                                    "option",
                                    { value: o.id, children: o.name + "（" + o.id + "）" },
                                    o.id
                                  );
                                })
                              )
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "项目 spaceId",
                            jsx2("select", {
                              style: styles.input,
                              value: yxSpace,
                              disabled: busy || !yxOrg,
                              onChange: function(e) {
                                if (busy) return;
                                var id = e.target.value;
                                setYxSpace(id);
                                setYxType("");
                                setYxTypes([]);
                                setWiItems([]);
                                setWiSelected({});
                                setWiHint("");
                                if (id) refreshYunxiaoTypes(yxOrg, id);
                              },
                              children: [
                                jsx2(
                                  "option",
                                  {
                                    value: "",
                                    children: yxProjects.length ? "请选择项目" : yxOrg ? "加载中或暂无项目" : "先选择企业"
                                  },
                                  "yx-space-empty"
                                )
                              ].concat(
                                (yxProjects || []).map(function(o) {
                                  return jsx2(
                                    "option",
                                    { value: o.id, children: o.name + "（" + o.id + "）" },
                                    o.id
                                  );
                                })
                              )
                            })
                          ]
                        }),
                        jsxs2("div", {
                          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                          children: [
                            jsxs2("label", {
                              style: styles.label,
                              children: [
                                "缺陷类型 workitemTypeId",
                                jsx2("select", {
                                  style: styles.input,
                                  value: yxType,
                                  disabled: busy || !yxSpace,
                                  onChange: function(e) {
                                    setYxType(e.target.value);
                                  },
                                  children: [
                                    jsx2(
                                      "option",
                                      {
                                        value: "",
                                        children: yxTypes.length ? "请选择缺陷类型" : yxSpace ? "加载中或暂无类型" : "先选择项目"
                                      },
                                      "yx-type-empty"
                                    )
                                  ].concat(
                                    (yxTypes || []).map(function(o) {
                                      return jsx2(
                                        "option",
                                        {
                                          value: o.id,
                                          children: o.name + "（" + o.id + "）"
                                        },
                                        o.id
                                      );
                                    })
                                  )
                                })
                              ]
                            }),
                            jsxs2("label", {
                              style: styles.label,
                              children: [
                                "负责人 assignedTo",
                                jsx2("select", {
                                  style: styles.input,
                                  value: yxAssignee,
                                  disabled: busy || !yxOrg,
                                  onChange: function(e) {
                                    setYxAssignee(e.target.value);
                                  },
                                  children: [
                                    jsx2(
                                      "option",
                                      {
                                        value: "",
                                        children: yxMembers.length ? "请选择负责人" : yxOrg ? "加载中或暂无成员" : "先选择企业"
                                      },
                                      "yx-member-empty"
                                    )
                                  ].concat(
                                    (yxMembers || []).map(function(o) {
                                      return jsx2(
                                        "option",
                                        {
                                          value: o.id,
                                          children: o.name + "（" + o.id + "）"
                                        },
                                        o.id
                                      );
                                    })
                                  )
                                })
                              ]
                            })
                          ]
                        }),
                        yxCatalogHint ? jsx2("p", {
                          style: {
                            margin: "4px 0 0",
                            color: "#6b645a",
                            fontSize: 12
                          },
                          children: yxCatalogHint
                        }) : null,
                        jsxs2("div", {
                          style: {
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px dashed #ddd6cb"
                          },
                          children: [
                            jsxs2("label", {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                color: "#6b645a",
                                cursor: "pointer"
                              },
                              children: [
                                jsx2("input", {
                                  type: "checkbox",
                                  checked: yxDebugLog,
                                  onChange: function(e) {
                                    setYxDebugLog(e.target.checked);
                                    if (!e.target.checked) setYxRequestLog("");
                                  }
                                }),
                                "请求日志（排查用，不含 token）"
                              ]
                            }),
                            yxDebugLog ? jsxs2("div", {
                              style: { marginTop: 6 },
                              children: [
                                jsxs2("div", {
                                  style: {
                                    display: "flex",
                                    gap: 6,
                                    marginBottom: 4
                                  },
                                  children: [
                                    jsx2("button", {
                                      type: "button",
                                      style: styles.secondary,
                                      disabled: !yxRequestLog,
                                      onClick: function() {
                                        if (navigator.clipboard && navigator.clipboard.writeText) {
                                          navigator.clipboard.writeText(yxRequestLog).then(function() {
                                            setYxCatalogHint("请求日志已复制");
                                          }).catch(function() {
                                            setYxCatalogHint("复制失败，请手动全选复制");
                                          });
                                        } else {
                                          setYxCatalogHint("请手动全选下方日志复制");
                                        }
                                      },
                                      children: "复制日志"
                                    }),
                                    jsx2("button", {
                                      type: "button",
                                      style: styles.secondary,
                                      disabled: !yxRequestLog,
                                      onClick: function() {
                                        setYxRequestLog("");
                                      },
                                      children: "清空"
                                    })
                                  ]
                                }),
                                jsx2("textarea", {
                                  readOnly: true,
                                  value: yxRequestLog || "开启后执行「拉取企业 / 选企业」即可在此看到云效请求与响应摘要。",
                                  style: Object.assign({}, styles.input, {
                                    minHeight: 140,
                                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                    fontSize: 11,
                                    lineHeight: 1.35,
                                    resize: "vertical",
                                    whiteSpace: "pre"
                                  })
                                })
                              ]
                            }) : null
                          ]
                        })
                      ]
                    }) : null,
                    trackerProvider === "github" ? jsxs2("div", {
                      children: [
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "GitHub Token",
                            jsx2("input", {
                              style: styles.input,
                              type: "password",
                              value: ghToken,
                              placeholder: "ghp_… 需要 issues:write",
                              onChange: function(e) {
                                setGhToken(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs2("div", {
                          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                          children: [
                            jsxs2("label", {
                              style: styles.label,
                              children: [
                                "owner",
                                jsx2("input", {
                                  style: styles.input,
                                  value: ghOwner,
                                  onChange: function(e) {
                                    setGhOwner(e.target.value);
                                  }
                                })
                              ]
                            }),
                            jsxs2("label", {
                              style: styles.label,
                              children: [
                                "repo",
                                jsx2("input", {
                                  style: styles.input,
                                  value: ghRepo,
                                  onChange: function(e) {
                                    setGhRepo(e.target.value);
                                  }
                                })
                              ]
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "labels（逗号分隔）",
                            jsx2("input", {
                              style: styles.input,
                              value: ghLabels,
                              onChange: function(e) {
                                setGhLabels(e.target.value);
                              }
                            })
                          ]
                        })
                      ]
                    }) : null,
                    trackerProvider === "gitlab" ? jsxs2("div", {
                      children: [
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "GitLab Host",
                            jsx2("input", {
                              style: styles.input,
                              value: glHost,
                              onChange: function(e) {
                                setGlHost(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "Private Token",
                            jsx2("input", {
                              style: styles.input,
                              type: "password",
                              value: glToken,
                              onChange: function(e) {
                                setGlToken(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "projectId（数字或 group/project）",
                            jsx2("input", {
                              style: styles.input,
                              value: glProject,
                              onChange: function(e) {
                                setGlProject(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "labels（逗号分隔）",
                            jsx2("input", {
                              style: styles.input,
                              value: glLabels,
                              onChange: function(e) {
                                setGlLabels(e.target.value);
                              }
                            })
                          ]
                        })
                      ]
                    }) : null,
                    trackerProvider === "webhook" ? jsxs2("div", {
                      children: [
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "Webhook URL",
                            jsx2("input", {
                              style: styles.input,
                              value: whUrl,
                              placeholder: "https://… 可对接 Jira / 飞书 / 自建服务",
                              onChange: function(e) {
                                setWhUrl(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs2("label", {
                          style: styles.label,
                          children: [
                            "Authorization 头（可选）",
                            jsx2("input", {
                              style: styles.input,
                              type: "password",
                              value: whAuth,
                              placeholder: "Bearer …",
                              onChange: function(e) {
                                setWhAuth(e.target.value);
                              }
                            })
                          ]
                        })
                      ]
                    }) : null,
                    trackerProvider !== "none" ? jsx2("button", {
                      type: "button",
                      style: Object.assign({}, styles.btn, { marginTop: 4 }),
                      disabled: busy,
                      onClick: saveTrackerSettings,
                      children: trackerReady ? "保存平台配置（已就绪）" : "保存平台配置"
                    }) : jsx2("button", {
                      type: "button",
                      style: Object.assign({}, styles.btn, { marginTop: 4 }),
                      disabled: busy,
                      onClick: saveTrackerSettings,
                      children: "清除平台配置"
                    })
                  ]
                });
              })()
            ]
          }) : null,
          mode === "functional" && (function() {
            return jsxs2(jsxRuntime.Fragment, {
              children: [
                trackerProvider === "yunxiao" && yxOrg && yxSpace ? jsxs2("div", {
                  style: {
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "#f7f4ee",
                    borderRadius: 8,
                    border: "1px solid var(--dsh-border, #ddd4c5)"
                  },
                  children: [
                    jsx2("div", {
                      style: { fontWeight: 600, marginBottom: 6 },
                      children: "关联敏捷任务（可选，多选）"
                    }),
                    jsx2("p", {
                      style: { margin: "0 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                      children: "勾选工作项类型后拉取任务，再多选任务。生成手测清单 / 模型对话分析时会把它们写入清单与提示。"
                    }),
                    jsxs2("div", {
                      style: Object.assign({}, styles.row, {
                        flexWrap: "wrap",
                        gap: 10,
                        marginBottom: 8
                      }),
                      children: ["Req", "Bug", "Task", "Risk", "Topic"].map(function(cat) {
                        var labels = {
                          Req: "需求",
                          Bug: "缺陷",
                          Task: "任务",
                          Risk: "风险",
                          Topic: "专题"
                        };
                        return jsxs2(
                          "label",
                          {
                            style: {
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: "pointer"
                            },
                            children: [
                              jsx2("input", {
                                type: "checkbox",
                                checked: Boolean(wiCats[cat]),
                                onChange: function(e) {
                                  var checked = e.target.checked;
                                  setWiCats(function(prev) {
                                    var next = Object.assign({}, prev);
                                    next[cat] = checked;
                                    return next;
                                  });
                                }
                              }),
                              (labels[cat] || cat) + "（" + cat + "）"
                            ]
                          },
                          "wi-cat-" + cat
                        );
                      })
                    }),
                    jsxs2("div", {
                      style: Object.assign({}, styles.row, { marginBottom: 6 }),
                      children: [
                        jsx2("button", {
                          type: "button",
                          style: styles.primary,
                          disabled: busy,
                          onClick: refreshAgileWorkitems,
                          children: "拉取任务"
                        }),
                        jsx2("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy || !wiItems.length,
                          onClick: function() {
                            var next = {};
                            (wiItems || []).forEach(function(it) {
                              if (it && it.id) next[it.id] = true;
                            });
                            setWiSelected(next);
                          },
                          children: "全选"
                        }),
                        jsx2("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy || !Object.keys(wiSelected).length,
                          onClick: function() {
                            setWiSelected({});
                          },
                          children: "清空选择"
                        }),
                        jsx2("span", {
                          style: { color: "#6b645a", fontSize: 12 },
                          children: "已选 " + Object.keys(wiSelected).filter(function(k) {
                            return wiSelected[k];
                          }).length + " / " + (wiItems || []).length
                        })
                      ]
                    }),
                    wiHint ? jsx2("p", {
                      style: { margin: "0 0 6px", color: "#6b645a", fontSize: 12 },
                      children: wiHint
                    }) : null,
                    wiItems.length ? jsx2("div", {
                      style: {
                        maxHeight: 180,
                        overflow: "auto",
                        border: "1px solid var(--dsh-border, #e5ddd0)",
                        borderRadius: 6,
                        background: "#fff",
                        padding: "4px 0"
                      },
                      children: wiItems.map(function(it) {
                        return jsxs2(
                          "label",
                          {
                            style: {
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 8,
                              padding: "6px 10px",
                              fontSize: 13,
                              lineHeight: 1.35,
                              cursor: "pointer",
                              borderBottom: "1px solid #f0ebe3"
                            },
                            children: [
                              jsx2("input", {
                                type: "checkbox",
                                style: { marginTop: 2 },
                                checked: Boolean(wiSelected[it.id]),
                                onChange: function(e) {
                                  var checked = e.target.checked;
                                  setWiSelected(function(prev) {
                                    var next = Object.assign({}, prev);
                                    if (checked) next[it.id] = true;
                                    else delete next[it.id];
                                    return next;
                                  });
                                }
                              }),
                              jsxs2("span", {
                                style: { flex: 1, minWidth: 0 },
                                children: [
                                  jsx2("span", {
                                    style: {
                                      display: "inline-block",
                                      fontSize: 11,
                                      color: "#8a7f70",
                                      marginRight: 6
                                    },
                                    children: it.category || "WorkItem"
                                  }),
                                  jsx2("span", { children: it.subject }),
                                  it.status ? jsx2("span", {
                                    style: {
                                      display: "block",
                                      fontSize: 11,
                                      color: "#9a9185"
                                    },
                                    children: it.status
                                  }) : null
                                ]
                              })
                            ]
                          },
                          it.id
                        );
                      })
                    }) : null
                  ]
                }) : null,
                jsxs2("div", {
                  style: Object.assign({}, styles.row, { marginTop: 10 }),
                  children: [
                    jsx2("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !repoPath.trim(),
                      onClick: function() {
                        loadCommits(true);
                      },
                      children: "同步版本"
                    }),
                    jsx2("button", {
                      type: "button",
                      style: styles.primary,
                      disabled: busy || !baseCommit || !headCommit,
                      onClick: analyze,
                      children: "生成手测清单"
                    }),
                    jsx2("button", {
                      type: "button",
                      style: jobId && jobStatus === "pending" ? styles.danger : styles.btn,
                      disabled: busy || !(jobId && jobStatus === "pending") && (!baseCommit || !headCommit),
                      onClick: function() {
                        if (jobId && jobStatus === "pending") {
                          cancelPendingAnalysis();
                        } else {
                          startChatAnalysis();
                        }
                      },
                      children: jobId && jobStatus === "pending" ? "取消等待并清空草稿" : "模型对话分析"
                    }),
                    jsx2("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !baseCommit || !headCommit,
                      onClick: refreshStoredReport,
                      children: "刷新清单"
                    })
                  ]
                }),
                jobId ? jsxs2("div", {
                  style: Object.assign({}, styles.row, {
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "#faf7f0",
                    borderRadius: 8,
                    border: "1px solid var(--dsh-border, #ddd4c5)"
                  }),
                  children: [
                    jsx2("span", {
                      style: { fontWeight: 600, whiteSpace: "nowrap" },
                      children: "对话任务 ID"
                    }),
                    jsx2("code", {
                      style: {
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontSize: 12
                      },
                      title: jobId,
                      children: jobId
                    }),
                    jsx2("button", {
                      type: "button",
                      style: styles.btn,
                      onClick: function() {
                        copyText(jobId, "任务 ID");
                      },
                      children: "复制"
                    }),
                    jsx2("span", {
                      style: { color: "#6b645a", fontSize: 12 },
                      children: jobStatus === "pending" ? "等待 publish" : jobStatus === "published" ? "已发布" : jobStatus || ""
                    })
                  ]
                }) : null,
                jsxs2("div", {
                  style: Object.assign({}, styles.row, { marginTop: 8, alignItems: "flex-end" }),
                  children: [
                    jsxs2("label", {
                      style: Object.assign({}, styles.label, { flex: 1, marginBottom: 0, minWidth: 180 }),
                      children: [
                        "历史任务（多仓库）",
                        jsx2("select", {
                          style: styles.input,
                          value: historyId,
                          disabled: busy || !history.length,
                          onChange: function(e) {
                            var id = e.target.value;
                            setHistoryId(id);
                            if (id) openHistoryEntry(id);
                          },
                          children: [
                            jsx2(
                              "option",
                              {
                                value: "",
                                children: history.length ? "选择历史（含各仓库；同版本仅最新）" : "暂无历史"
                              },
                              "hist-empty"
                            )
                          ].concat(
                            (history || []).map(function(h) {
                              var label = shortRepoLabel(h.repoInput) + " · " + (h.savedAt || "").replace("T", " ").slice(0, 16) + " · " + (h.source === "model" ? "模型" : "确定性") + " · " + shortSha(h.baseCommit) + "→" + shortSha(h.headCommit);
                              return jsx2("option", { value: h.id, children: label }, h.id);
                            })
                          )
                        })
                      ]
                    }),
                    jsx2("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !historyId,
                      onClick: function() {
                        copyText(historyId, "历史 ID");
                      },
                      children: "复制历史 ID"
                    }),
                    jsx2("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !historyId,
                      onClick: deleteSelectedHistory,
                      children: "删除"
                    })
                  ]
                }),
                copyFlash ? jsx2("p", {
                  style: { color: "#0f6e56", margin: "6px 0 0", fontSize: 12 },
                  children: copyFlash
                }) : null,
                chatHint ? jsx2("p", {
                  style: { color: "#6b645a", margin: "8px 0 0", fontSize: 12, lineHeight: 1.45 },
                  children: chatHint
                }) : null,
                jsxs2("div", {
                  style: { marginTop: 8 },
                  children: [
                    jsxs2("div", {
                      style: Object.assign({}, styles.row, {
                        marginBottom: 0,
                        alignItems: "center",
                        gap: 8
                      }),
                      children: [
                        jsx2("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy || !(refs && refs.length),
                          onClick: function() {
                            if (busy) return;
                            setBranchPickerOpen(!branchPickerOpen);
                            if (branchPickerOpen) setBranchQuery("");
                          },
                          children: branchPickerOpen ? "收起分支" : "切换分支"
                        }),
                        !branchPickerOpen ? jsx2("span", {
                          style: { color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                          children: (function() {
                            var tip = newestBranchTip(refs);
                            if (tip && tip.name) {
                              return "同步后默认用最新分支 " + tip.name + "：待测=最新提交，稳定=倒数第二" + (tip.date ? " · " + formatRefWhen(tip.date) : "");
                            }
                            return refs && refs.length ? "按名称筛选；点稳定 / 待测后自动收起" : "先同步版本";
                          })()
                        }) : null
                      ]
                    }),
                    branchPickerOpen ? jsxs2("div", {
                      style: { marginTop: 6 },
                      children: [
                        jsx2("input", {
                          style: styles.input,
                          value: branchQuery,
                          disabled: busy || !(refs && refs.length),
                          placeholder: refs && refs.length ? "输入分支名筛选；列表按最新提交时间排序" : "先同步版本",
                          onChange: function(e) {
                            setBranchQuery(e.target.value);
                          }
                        }),
                        jsx2("div", {
                          style: {
                            maxHeight: 168,
                            overflow: "auto",
                            border: "1px solid var(--dsh-border, #ddd4c5)",
                            borderRadius: 8,
                            background: "#fff"
                          },
                          children: (function() {
                            var matched = matchingBranches(refs, branchQuery);
                            var shown = matched.slice(0, 40);
                            var newest = matched[0] || null;
                            var newestScore = newest ? branchActivityScore(newest) : 0;
                            if (!shown.length) {
                              return jsx2("div", {
                                style: { padding: "8px 10px", color: "#6b645a", fontSize: 12 },
                                children: refs && refs.length ? "没有匹配的分支" : "同步后在这里选分支"
                              });
                            }
                            return shown.map(function(r, idx) {
                              var onHead = branchOwnsVersion(
                                r,
                                headCommit,
                                commitListRef,
                                commits
                              );
                              var onBase = branchOwnsVersion(
                                r,
                                baseCommit,
                                commitListRef,
                                commits
                              );
                              var isNewest = idx === 0 && newestScore > 0 && newest && r.name === newest.name;
                              function pickBranch(target) {
                                if (busy) return;
                                viewingHistoryRef.current = null;
                                if (target === "base") {
                                  setBaseCommit(r.name);
                                  setChatHint("稳定版本已切到分支 " + r.name + "，正在加载该分支近期提交…");
                                } else {
                                  setHeadCommit(r.name);
                                  setChatHint("待测版本已切到分支 " + r.name + "，正在加载该分支近期提交…");
                                }
                                setBranchQuery("");
                                setBranchPickerOpen(false);
                                loadCommits(true, { preserveSelection: true, refName: r.name });
                              }
                              return jsxs2(
                                "div",
                                {
                                  style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 8px",
                                    borderBottom: "1px solid #efe8da",
                                    background: isNewest ? "#eef6ff" : onHead || onBase ? "#f3faf6" : "transparent"
                                  },
                                  children: [
                                    jsxs2("div", {
                                      style: {
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: 12,
                                        lineHeight: 1.35
                                      },
                                      title: r.name + (r.subject ? "\n" + r.subject : "") + (r.date ? "\n" + r.date : ""),
                                      children: [
                                        jsxs2("div", {
                                          style: { wordBreak: "break-all" },
                                          children: [
                                            (r.kind === "remote" ? "远端 " : "") + r.name,
                                            r.short ? jsx2("span", {
                                              style: { color: "#8a7f70" },
                                              children: " · " + r.short
                                            }) : null,
                                            isNewest ? jsx2("span", {
                                              style: Object.assign({}, styles.badge, {
                                                marginLeft: 6,
                                                background: "#dbeafe",
                                                color: "#1d4ed8"
                                              }),
                                              children: "最新"
                                            }) : null
                                          ]
                                        }),
                                        r.date || r.subject ? jsx2("div", {
                                          style: {
                                            color: "#6b645a",
                                            fontSize: 11,
                                            marginTop: 2,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap"
                                          },
                                          children: (r.date ? formatRefWhen(r.date) : "") + (r.date && r.subject ? " · " : "") + (r.subject || "")
                                        }) : null
                                      ]
                                    }),
                                    jsx2("button", {
                                      type: "button",
                                      style: Object.assign({}, styles.btn, {
                                        padding: "4px 8px",
                                        fontWeight: onBase ? 700 : 500
                                      }),
                                      disabled: busy,
                                      onClick: function() {
                                        pickBranch("base");
                                      },
                                      children: onBase ? "稳定 ✓" : "稳定"
                                    }),
                                    jsx2("button", {
                                      type: "button",
                                      style: Object.assign({}, styles.btn, {
                                        padding: "4px 8px",
                                        fontWeight: onHead ? 700 : 500
                                      }),
                                      disabled: busy,
                                      onClick: function() {
                                        pickBranch("head");
                                      },
                                      children: onHead ? "待测 ✓" : "待测"
                                    })
                                  ]
                                },
                                "branch-" + (r.kind || "ref") + "-" + r.name
                              );
                            });
                          })()
                        }),
                        branchQuery && matchingBranches(refs, branchQuery).length > 40 ? jsx2("div", {
                          style: { color: "#6b645a", fontSize: 11, marginTop: 4 },
                          children: "匹配超过 40 个，请再输入几个字缩小范围"
                        }) : !branchQuery && matchingBranches(refs, "").length > 40 ? jsx2("div", {
                          style: { color: "#6b645a", fontSize: 11, marginTop: 4 },
                          children: "分支较多，输入名称筛选。列表先显示前 40 个"
                        }) : null
                      ]
                    }) : null
                  ]
                }),
                jsxs2("div", {
                  style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 },
                  children: [
                    jsxs2("label", {
                      style: styles.label,
                      children: [
                        "稳定版本",
                        jsx2(
                          "select",
                          {
                            style: styles.input,
                            value: baseCommit,
                            disabled: busy || !commits.length && !(refs && refs.length),
                            onChange: function(e) {
                              if (busy) return;
                              viewingHistoryRef.current = null;
                              var next = e.target.value;
                              setBaseCommit(next);
                              if (next && !looksLikeCommitSha(next)) {
                                loadCommits(true, { preserveSelection: true, refName: next });
                              }
                            },
                            children: buildVersionOptions(refs, commits, "先同步版本", commitListRef)
                          }
                        )
                      ]
                    }),
                    jsxs2("label", {
                      style: styles.label,
                      children: [
                        "待测版本",
                        jsx2(
                          "select",
                          {
                            style: styles.input,
                            value: headCommit,
                            disabled: busy || !commits.length && !(refs && refs.length),
                            onChange: function(e) {
                              if (busy) return;
                              viewingHistoryRef.current = null;
                              var next = e.target.value;
                              setHeadCommit(next);
                              if (next && !looksLikeCommitSha(next)) {
                                loadCommits(true, { preserveSelection: true, refName: next });
                              }
                            },
                            children: buildVersionOptions(refs, commits, "先同步版本", commitListRef)
                          }
                        )
                      ]
                    })
                  ]
                })
              ]
            });
          })(),
          error ? jsx2("p", { style: styles.error, children: error }) : null
        ]
      }),
      jsxs2("div", {
        style: {
          display: "flex",
          gap: 6,
          background: "var(--dsh-card,#fffdf8)",
          border: "1px solid var(--dsh-border,#ddd4c5)",
          borderRadius: 999,
          padding: 4
        },
        children: [
          jsx2("button", {
            type: "button",
            style: mode === "functional" ? Object.assign({}, styles.primary, { flex: 1 }) : Object.assign({}, styles.secondary, { flex: 1 }),
            disabled: busy,
            onClick: function() {
              switchMode("functional");
            },
            children: "功能测试"
          }),
          jsx2("button", {
            type: "button",
            style: mode === "ui" ? Object.assign({}, styles.primary, { flex: 1 }) : Object.assign({}, styles.secondary, { flex: 1 }),
            disabled: busy,
            onClick: function() {
              switchMode("ui");
            },
            children: "UI 测试"
          })
        ]
      }),
      mode === "functional" && report ? jsxs2("section", {
        style: styles.card,
        children: [
          jsx2("div", {
            style: { marginBottom: 8, color: "#6b645a" },
            children: "变更文件 " + (report.changedFiles || []).length + " · 直接 " + (report.direct || []).length + " · 波及 " + (report.ripple || []).length + " · " + (report.modelEnriched ? "会话模型分析" : "确定性分析")
          }),
          jsx2("p", {
            style: { margin: "0 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.45 },
            children: "手测时点右侧按钮记录结果。标记「失败」后可填写备注，便于复制反馈给开发。结果会写入本机。"
          }),
          jsxs2("div", {
            style: Object.assign({}, styles.row, {
              marginBottom: 8,
              justifyContent: "space-between",
              alignItems: "center"
            }),
            children: [
              jsx2("div", {
                style: { fontSize: 12, color: "#3d3a34", flex: "1 1 auto", minWidth: 0 },
                children: (function() {
                  var all = [].concat(report.direct || [], report.ripple || []);
                  var pass = 0;
                  var fail = 0;
                  var skip = 0;
                  var pending = 0;
                  all.forEach(function(it) {
                    var s = it.status || "pending";
                    if (s === "pass") pass += 1;
                    else if (s === "fail") fail += 1;
                    else if (s === "skip") skip += 1;
                    else pending += 1;
                  });
                  return "进度：通过 " + pass + " · 失败 " + fail + " · 跳过 " + skip + " · 待测 " + pending;
                })()
              }),
              jsxs2("div", {
                style: {
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  flex: "0 0 auto"
                },
                children: [
                  jsx2("button", {
                    type: "button",
                    style: styles.btn,
                    onClick: copyFailFeedback,
                    children: "复制失败反馈"
                  }),
                  jsx2("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy,
                    onClick: submitTracker,
                    children: "提交缺陷"
                  }),
                  jsx2("button", {
                    type: "button",
                    style: styles.btn,
                    disabled: busy,
                    onClick: exportReportFile,
                    children: "导出报告"
                  })
                ]
              })
            ]
          }),
          jsxs2("div", {
            style: {
              marginBottom: 10,
              padding: "10px 12px",
              background: "#f7f4ee",
              borderRadius: 8,
              border: "1px solid var(--dsh-border, #ddd4c5)"
            },
            children: [
              jsx2("div", {
                style: { fontWeight: 600, marginBottom: 4 },
                children: "任务附件（整份手测任务）"
              }),
              jsx2("p", {
                style: {
                  margin: "0 0 8px",
                  color: "#6b645a",
                  fontSize: 12,
                  lineHeight: 1.4
                },
                children: "可上传视频录像、文档等。附件属于当前版本对比任务，不绑定单条 checklist。小文件可直接选择；大视频建议填本机绝对路径。"
              }),
              jsxs2("div", {
                style: Object.assign({}, styles.row, {
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8
                }),
                children: [
                  jsx2("input", {
                    ref: taskAttachRef,
                    type: "file",
                    multiple: true,
                    style: { display: "none" },
                    onChange: function(e) {
                      var files = Array.prototype.slice.call(
                        e.target.files && e.target.files || []
                      );
                      e.target.value = "";
                      uploadTaskFiles(files);
                    }
                  }),
                  jsx2("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy,
                    onClick: function() {
                      if (taskAttachRef.current) taskAttachRef.current.click();
                    },
                    children: "选择文件"
                  }),
                  jsx2("input", {
                    style: Object.assign({}, styles.input, {
                      flex: "1 1 180px",
                      minWidth: 140,
                      marginBottom: 0
                    }),
                    value: taskAttachPath,
                    placeholder: "或填本机绝对路径（大视频）",
                    onChange: function(e) {
                      setTaskAttachPath(e.target.value);
                    }
                  }),
                  jsx2("button", {
                    type: "button",
                    style: styles.btn,
                    disabled: busy || !taskAttachPath.trim(),
                    onClick: uploadTaskLocalPath,
                    children: "从路径添加"
                  }),
                  jsx2("span", {
                    style: { fontSize: 12, color: "#6b645a" },
                    children: "已附 " + (report.attachments && report.attachments.length || 0) + "/8"
                  })
                ]
              }),
              report.attachments && report.attachments.length ? jsx2("div", {
                style: { display: "flex", flexDirection: "column", gap: 6 },
                children: report.attachments.map(function(att) {
                  return jsxs2(
                    "div",
                    {
                      style: Object.assign({}, styles.row, {
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 8px",
                        background: "#fff",
                        borderRadius: 6,
                        border: "1px solid #ebe4d8"
                      }),
                      children: [
                        jsxs2("div", {
                          style: { flex: 1, minWidth: 0 },
                          children: [
                            jsx2("div", {
                              style: {
                                fontWeight: 600,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              },
                              title: att.name,
                              children: att.name
                            }),
                            jsx2("div", {
                              style: { fontSize: 11, color: "#8a7f70" },
                              children: (att.mime || "file") + " · " + formatBytes(att.size || 0)
                            })
                          ]
                        }),
                        jsx2("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy,
                          onClick: function() {
                            downloadTaskAttachment(att);
                          },
                          children: "下载"
                        }),
                        jsx2("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy,
                          onClick: function() {
                            removeTaskAttachment(att.id);
                          },
                          children: "移除"
                        })
                      ]
                    },
                    att.id
                  );
                })
              }) : jsx2("p", {
                style: { margin: 0, fontSize: 12, color: "#9a9185" },
                children: "暂无任务附件"
              })
            ]
          }),
          jsxs2("div", {
            style: styles.row,
            children: [
              jsx2("button", {
                type: "button",
                style: Object.assign({}, styles.btn, tab === "direct" ? { fontWeight: 700 } : null),
                disabled: busy,
                onClick: function() {
                  if (busy) return;
                  setTab("direct");
                },
                children: "直接变更"
              }),
              jsx2("button", {
                type: "button",
                style: Object.assign({}, styles.btn, tab === "ripple" ? { fontWeight: 700 } : null),
                disabled: busy,
                onClick: function() {
                  if (busy) return;
                  setTab("ripple");
                },
                children: "可能波及"
              })
            ]
          }),
          items.length ? items.map(function(item, index) {
            return jsx2(
              ItemCard,
              {
                item,
                listKind: tab === "ripple" ? "ripple" : "direct",
                itemIndex: index,
                disabled: busy,
                onStatus,
                onNote,
                onScreenshots,
                onShotHint
              },
              (tab === "ripple" ? "ripple" : "direct") + "-" + index + "-" + (item.id || "")
            );
          }) : jsx2("p", { style: { color: "#6b645a" }, children: "这一类没有条目" })
        ]
      }) : null,
      mode === "ui" ? jsx2(VisualComparePanel2, {
        repoInput: repoPath.trim(),
        auth: buildAuthPayload()
      }) : null,
      confirmDlg ? jsxs2("div", {
        style: styles.modalBackdrop,
        role: "dialog",
        "aria-modal": "true",
        onClick: function() {
          setConfirmDlg(null);
        },
        children: [
          jsxs2("div", {
            style: Object.assign({}, styles.modalCard, { width: "min(480px, 100%)" }),
            onClick: function(e) {
              e.stopPropagation();
            },
            children: [
              jsx2("div", {
                style: { fontWeight: 700, fontSize: 15, marginBottom: 8 },
                children: confirmDlg.title || "请确认"
              }),
              jsx2("p", {
                style: { margin: "0 0 12px", lineHeight: 1.5, color: "#4a453e" },
                children: confirmDlg.message
              }),
              confirmDlg.inputLabel ? jsxs2("label", {
                style: Object.assign({}, styles.label, { marginBottom: 14 }),
                children: [
                  confirmDlg.inputLabel,
                  jsx2("input", {
                    style: styles.input,
                    value: confirmDlg.inputValue || "",
                    autoFocus: true,
                    onChange: function(e) {
                      var next = e.target.value;
                      setConfirmDlg(function(prev) {
                        if (!prev) return prev;
                        return Object.assign({}, prev, { inputValue: next });
                      });
                    },
                    onKeyDown: function(e) {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        var action = confirmDlg.onConfirm;
                        var value = confirmDlg.inputValue;
                        setConfirmDlg(null);
                        if (typeof action === "function") action(value);
                      }
                    }
                  })
                ]
              }) : null,
              jsxs2("div", {
                style: Object.assign({}, styles.row, { justifyContent: "flex-end" }),
                children: [
                  jsx2("button", {
                    type: "button",
                    style: styles.btn,
                    onClick: function() {
                      setConfirmDlg(null);
                    },
                    children: "取消"
                  }),
                  jsx2("button", {
                    type: "button",
                    style: confirmDlg.danger ? styles.danger : styles.primary,
                    onClick: function() {
                      var action = confirmDlg.onConfirm;
                      var value = confirmDlg.inputValue;
                      setConfirmDlg(null);
                      if (typeof action === "function") {
                        if (confirmDlg.inputLabel) action(value);
                        else action();
                      }
                    },
                    children: confirmDlg.confirmLabel || "确定"
                  })
                ]
              })
            ]
          })
        ]
      }) : null
    ]
  });
}
var name = "tracescope-client";
var inject = ["slots", "sidebarRightTabs", "sidebarRight", "conversation", "sessions"];
var KIND = "tracescope";
function tryOpenTraceScopeTab() {
  try {
    var side = hostCtx && (hostCtx.sidebarRight || hostCtx.get && hostCtx.get("sidebarRight"));
    if (side && typeof side.openTab === "function") {
      side.openTab(KIND);
      return { ok: true };
    }
    return { ok: false, error: "sidebarRight.openTab 不可用" };
  } catch (err) {
    return { ok: false, error: err && err.message || String(err) };
  }
}
function apply(ctx) {
  hostCtx = ctx;
  ctx.effect(function() {
    return ctx.sidebarRightTabs.register({
      id: TAB_ID,
      kind: KIND,
      priority: "extension",
      title: function() {
        return "TraceScope";
      },
      guide: [
        {
          order: 1,
          title: function() {
            return "TraceScope";
          },
          description: function() {
            return "对比版本、手测清单与模型分析（新建会话后也可从右侧栏打开）";
          }
        }
      ]
    });
  }, "tracescope sidebar tab");
  ctx.effect(function() {
    var sessions = ctx.sessions || ctx.get && ctx.get("sessions");
    if (!sessions || !sessions.list || typeof sessions.list.subscribe !== "function") {
      return function() {
      };
    }
    var lastOpened = "";
    function maybeOpen() {
      try {
        var snap = sessions.list.getSnapshot();
        var current = snap && snap.current;
        if (!current || current === lastOpened) return;
        lastOpened = current;
        setTimeout(function() {
          tryOpenTraceScopeTab();
        }, 120);
      } catch (_e) {
      }
    }
    maybeOpen();
    return sessions.list.subscribe(maybeOpen);
  }, "tracescope auto-open");
  ctx.effect(function() {
    return ctx.slots.inject("sidebar.right.pane.tab", function() {
      return ctx.slots.register(
        {
          name: "sidebar.right.pane.tab",
          key: TAB_ID
        },
        TraceScopePanelBody
      );
    });
  }, "tracescope sidebar body");
  ctx.effect(function() {
    return ctx.slots.inject("sidebar.right.pane.tab.title", function() {
      return ctx.slots.register(
        {
          name: "sidebar.right.pane.tab.title",
          key: TAB_ID
        },
        function TraceScopeTitle() {
          return jsx2("span", { children: "TraceScope" });
        }
      );
    });
  }, "tracescope sidebar title");
}
exports.name = name;
exports.inject = inject;
exports.apply = apply;

    return module.exports
  },
})
