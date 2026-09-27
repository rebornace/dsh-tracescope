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

// client-src/visual/VisualDiffBoard.tsx
function isUnresolvedValue(v) {
  return !!v && typeof v === "object" && "unresolved" in v;
}
function ValueView({ value }) {
  if (isUnresolvedValue(value)) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
    "待确认：",
    value.raw
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: String(value) });
}
function flattenTree(root) {
  const map = /* @__PURE__ */ new Map();
  const walk = (n) => {
    map.set(n.id, n);
    n.children.forEach(walk);
  };
  if (root) walk(root);
  return map;
}
function useContainerWidth() {
  const ref = (0, import_react.useRef)(null);
  const [width, setWidth] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
function VisualDiffBoard({ data }) {
  const { result, frameBox, designImageUrl, designTree, codeTree } = data;
  const designNodes = (0, import_react.useMemo)(() => flattenTree(designTree), [designTree]);
  const codeNodes = (0, import_react.useMemo)(() => flattenTree(codeTree), [codeTree]);
  const diffsByDesign = (0, import_react.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const d of result.diffs) {
      const list = map.get(d.designNodeId) ?? [];
      list.push(d);
      map.set(d.designNodeId, list);
    }
    return map;
  }, [result.diffs]);
  const orderedNodeIds = (0, import_react.useMemo)(
    () => [...diffsByDesign.keys()],
    [diffsByDesign]
  );
  const rank = { high: 3, medium: 2, low: 1 };
  const topSeverity = (list) => list.reduce(
    (acc, d) => rank[d.severity] > rank[acc] ? d.severity : acc,
    "low"
  );
  const [selectedId, setSelectedId] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    setSelectedId(orderedNodeIds[0] ?? "");
  }, [orderedNodeIds]);
  const selectedDiffs = selectedId ? diffsByDesign.get(selectedId) ?? [] : [];
  const selectedCodeId = selectedDiffs.find((d) => d.codeNodeId)?.codeNodeId;
  const { ref: stageHostRef, width: hostWidth } = useContainerWidth();
  const frameW = frameBox?.width ?? 390;
  const frameH = frameBox?.height ?? 800;
  const fit = hostWidth ? Math.min(1, hostWidth / frameW) : 1;
  const sevCounts = { high: 0, medium: 0, low: 0 };
  for (const d of result.diffs) sevCounts[d.severity] += 1;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          fontSize: 12,
          color: "#5f584c",
          marginBottom: 8
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "对比节点对 ",
            result.comparedPairs
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: SEV_COLOR.high }, children: [
            "高 ",
            sevCounts.high
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: SEV_COLOR.medium }, children: [
            "中 ",
            sevCounts.medium
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: SEV_COLOR.low }, children: [
            "低 ",
            sevCounts.low
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "未匹配 ",
            result.unmatched.length
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColumnTitle, { children: "设计稿" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: stageHostRef, style: { width: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              position: "relative",
              width: frameW * fit,
              height: frameH * fit,
              background: "#f1ede4",
              borderRadius: 8,
              overflow: "hidden"
            },
            children: [
              designImageUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "img",
                {
                  src: designImageUrl,
                  alt: "design",
                  style: { width: frameW * fit, height: frameH * fit, display: "block" }
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 8, fontSize: 11, color: "#8a7f70" }, children: "设计图渲染失败，仅显示结构差异。" }),
              frameBox ? orderedNodeIds.map((id) => {
                const node = designNodes.get(id);
                if (!node) return null;
                const { x, y, width, height } = node.box;
                if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number")
                  return null;
                const sev = topSeverity(diffsByDesign.get(id) ?? []);
                const active = id === selectedId;
                return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => setSelectedId(id),
                    title: `${node.name} · ${diffsByDesign.get(id)?.length ?? 0} 项差异`,
                    style: {
                      position: "absolute",
                      left: (x - frameBox.x) * fit,
                      top: (y - frameBox.y) * fit,
                      width: width * fit,
                      height: height * fit,
                      border: `2px solid ${SEV_COLOR[sev]}`,
                      background: active ? SEV_COLOR[sev] + "22" : SEV_COLOR[sev] + "0d",
                      boxShadow: active ? `0 0 0 2px ${SEV_COLOR[sev]}55` : "none",
                      cursor: "pointer",
                      padding: 0
                    }
                  },
                  id
                );
              }) : null
            ]
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColumnTitle, { children: "代码实现" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            style: {
              border: "1px solid var(--dsh-border,#ddd4c5)",
              borderRadius: 8,
              padding: 6,
              height: frameH * fit,
              overflow: "auto",
              background: "#fff"
            },
            children: codeTree ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              CodeBlocks,
              {
                node: codeTree,
                selectedCodeId,
                onSelectCode: (codeId) => {
                  const entry = orderedNodeIds.find(
                    (id) => diffsByDesign.get(id)?.some((d) => d.codeNodeId === codeId)
                  );
                  if (entry) setSelectedId(entry);
                }
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, color: "#8a7f70" }, children: "无代码结构。" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          marginTop: 10,
          border: "1px solid var(--dsh-border,#ddd4c5)",
          borderRadius: 10,
          padding: 10,
          background: "#fff"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 13 }, children: selectedDiffs.length ? selectedDiffs[0].nodeName : "差异明细" }),
          selectedCodeId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { marginLeft: 8, fontSize: 12, color: "#6b645a" }, children: [
            "代码节点：",
            codeNodes.get(selectedCodeId)?.name ?? selectedCodeId
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }, children: selectedDiffs.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
                border: "1px solid #efe8da",
                borderLeft: "4px solid " + SEV_COLOR[d.severity],
                borderRadius: 8,
                padding: "5px 8px",
                fontSize: 12
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontWeight: 600 }, children: [
                  PROPERTY_LABELS[d.property] ?? d.property,
                  d.needsReview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: REVIEW_BADGE, children: "需确认" }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", gap: 6, alignItems: "center" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ValueView, { value: d.expected }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#9a917f" }, children: "→" }),
                  d.actual === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#d92d20", fontWeight: 700 }, children: "缺失" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ValueView, { value: d.actual })
                ] })
              ]
            },
            i
          )) })
        ]
      }
    ),
    result.unmatched.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "details",
      {
        style: {
          marginTop: 8,
          border: "1px dashed var(--dsh-border,#ddd4c5)",
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 12
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: { cursor: "pointer", color: "#0f6e56", fontWeight: 600 }, children: [
            "未匹配元素（",
            result.unmatched.length,
            "）"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: 18 }, children: result.unmatched.map((u, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: SIDE_TAG, children: u.side === "design" ? "仅设计稿" : "仅代码" }),
            u.name,
            u.text ? `（${u.text}）` : ""
          ] }, i)) })
        ]
      }
    ) : null
  ] });
}
function ColumnTitle({ children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color: "#5f584c",
        marginBottom: 4
      },
      children
    }
  );
}
function CodeBlocks({ node, depth = 0, selectedCodeId, onSelectCode }) {
  const active = selectedCodeId === node.id;
  const w = node.box.width;
  const h = node.box.height;
  const bg = node.style.backgroundColor;
  const isText = node.kind === "text";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      onClick: (e) => {
        e.stopPropagation();
        onSelectCode(node.id);
      },
      style: {
        border: "1px solid " + (active ? "#0f6e56" : "#d9d2c4"),
        outline: active ? "2px solid #0f6e5655" : "none",
        borderRadius: 6,
        padding: 4,
        margin: 2,
        minHeight: 18,
        width: typeof w === "number" ? `${Math.min(100, w / 414 * 100)}%` : "100%",
        maxHeight: h ? Math.min(160, h) : void 0,
        overflow: "hidden",
        background: bg && !isUnresolvedValue(bg) ? bg : isText ? "#faf7f0" : "#fcfaf6",
        cursor: "pointer"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 10, color: "#8a7f70", lineHeight: 1.2 }, children: isText ? node.text || node.name : node.name }),
        node.children.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexDirection: "column" }, children: node.children.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          CodeBlocks,
          {
            node: c,
            depth: depth + 1,
            selectedCodeId,
            onSelectCode
          },
          c.id
        )) }) : null
      ]
    }
  );
}
var import_react, import_jsx_runtime, SEV_COLOR, PROPERTY_LABELS, REVIEW_BADGE, SIDE_TAG;
var init_VisualDiffBoard = __esm({
  "client-src/visual/VisualDiffBoard.tsx"() {
    "use strict";
    import_react = require("react");
    import_jsx_runtime = require("react/jsx-runtime");
    SEV_COLOR = {
      high: "#d92d20",
      medium: "#dc8a05",
      low: "#1a9b6e"
    };
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
    REVIEW_BADGE = {
      fontSize: 10,
      color: "#9a6700",
      background: "#fef0c7",
      borderRadius: 999,
      padding: "1px 6px",
      marginLeft: 6,
      fontWeight: 400
    };
    SIDE_TAG = {
      display: "inline-block",
      fontSize: 10,
      borderRadius: 999,
      padding: "1px 6px",
      marginRight: 4,
      background: "#efe8da"
    };
  }
});

// client-src/visual/PageMappingOverview.tsx
function storageKey(repoInput, figmaUrl) {
  return "tracescope.map.selections:" + repoInput.trim() + ":" + figmaUrl.trim();
}
function loadSelections(repoInput, figmaUrl) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(repoInput, figmaUrl)) ?? "{}");
  } catch {
    return {};
  }
}
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
function PageMappingOverview({
  repoInput,
  figmaUrl,
  figmaToken,
  auth,
  busy,
  onScanStateChange,
  onCompare
}) {
  const [overview, setOverview] = (0, import_react2.useState)(null);
  const [selections, setSelections] = (0, import_react2.useState)(
    () => loadSelections(repoInput, figmaUrl)
  );
  const [confirmed, setConfirmed] = (0, import_react2.useState)({});
  const [openId, setOpenId] = (0, import_react2.useState)("");
  const [search, setSearch] = (0, import_react2.useState)("");
  const [localError, setLocalError] = (0, import_react2.useState)("");
  (0, import_react2.useEffect)(() => {
    setOverview(null);
    setSelections(loadSelections(repoInput, figmaUrl));
    setConfirmed({});
    setOpenId("");
  }, [repoInput, figmaUrl]);
  function persist(next) {
    setSelections(next);
    try {
      localStorage.setItem(storageKey(repoInput, figmaUrl), JSON.stringify(next));
    } catch {
    }
  }
  async function scan() {
    setLocalError("");
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setLocalError("请填写设计稿链接和访问 Token");
      return;
    }
    onScanStateChange(true);
    try {
      const res = await post("/tracescope/v1/match-all", {
        repoPath: repoInput,
        figmaUrl: figmaUrl.trim(),
        figmaToken: figmaToken.trim(),
        auth
      });
      setOverview(res);
      const next = { ...selections };
      for (const p of res.pages) {
        const top = p.mapping.candidates[0];
        if (!next[p.mapping.designId] && top) {
          next[p.mapping.designId] = {
            adapterId: top.adapterId,
            relativePath: top.relativePath
          };
        }
      }
      persist(next);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      onScanStateChange(false);
    }
  }
  const codeFileMap = (0, import_react2.useMemo)(() => {
    const m = /* @__PURE__ */ new Map();
    overview?.codeFiles.forEach((f) => m.set(f.adapterId + "::" + f.relativePath, f));
    return m;
  }, [overview]);
  function choose(designId, file, auto = false) {
    persist({ ...selections, [designId]: file });
    if (!auto) setConfirmed({ ...confirmed, [designId]: true });
    setOpenId("");
    setSearch("");
  }
  const groups = (0, import_react2.useMemo)(() => {
    if (!overview) return [];
    const byCanvas = /* @__PURE__ */ new Map();
    for (const p of overview.pages) {
      const g = byCanvas.get(p.canvasId) ?? { name: p.canvasName, items: [] };
      g.items.push(p);
      byCanvas.set(p.canvasId, g);
    }
    return [...byCanvas.entries()].map(([id, v]) => ({ id, ...v }));
  }, [overview]);
  const filteredCodeFiles = (0, import_react2.useMemo)(() => {
    const q = search.trim().toLowerCase();
    if (!q || !overview) return [];
    return overview.codeFiles.filter((f) => f.relativePath.toLowerCase().includes(q)).slice(0, 40);
  }, [search, overview]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: OV.scan, disabled: busy, onClick: scan, children: busy ? "扫描中…" : overview ? "重新扫描整个设计文件" : "扫描整个设计文件，自动映射页面" }),
    localError ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: OV.error, children: localError }) : null,
    overview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: OV.summary, children: [
        "共 ",
        overview.totals.pages,
        " 个页面 ·",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: STATUS_DOT.matched }, children: [
          " 高置信 ",
          overview.totals.matched
        ] }),
        " ·",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: STATUS_DOT.weak }, children: [
          " 待确认 ",
          overview.totals.weak
        ] }),
        " ·",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: STATUS_DOT.none }, children: [
          " 未匹配 ",
          overview.totals.none
        ] })
      ] }),
      groups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: OV.canvasCard, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: OV.canvasTitle, children: g.name }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", flexDirection: "column" }, children: g.items.map(({ mapping }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          PageRow,
          {
            mapping,
            selected: selections[mapping.designId],
            isConfirmed: !!confirmed[mapping.designId],
            open: openId === mapping.designId,
            search: openId === mapping.designId ? search : "",
            filteredCodeFiles: openId === mapping.designId ? filteredCodeFiles : [],
            onToggle: () => {
              setOpenId(openId === mapping.designId ? "" : mapping.designId);
              setSearch("");
            },
            onSearchChange: setSearch,
            onChoose: (file) => choose(mapping.designId, file),
            onCompare: () => {
              const file = selections[mapping.designId];
              if (file) onCompare(mapping.designId, file);
            },
            codeFileMap
          },
          mapping.designId
        )) })
      ] }, g.id))
    ] }) : null
  ] });
}
function PageRow({
  mapping,
  selected,
  isConfirmed,
  open,
  search,
  filteredCodeFiles,
  onToggle,
  onSearchChange,
  onChoose,
  onCompare,
  codeFileMap
}) {
  const selFile = selected ? codeFileMap.get(selected.adapterId + "::" + selected.relativePath) : void 0;
  const badge = KIND_BADGE[mapping.kind];
  const selCandidate = mapping.candidates.find(
    (c) => selected && c.adapterId === selected.adapterId && c.relativePath === selected.relativePath
  );
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: OV.row, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: 8, height: 8, borderRadius: 99, background: STATUS_DOT[mapping.status], display: "inline-block" } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...OV.kindBadge, background: badge.bg }, children: badge.label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { style: { fontSize: 12 }, children: mapping.designName })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: OV.selectedBox, onClick: onToggle, children: selFile ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { title: selFile.relativePath, children: [
      isConfirmed ? "✓ " : "",
      selFile.relativePath.split("/").pop(),
      selCandidate ? ` · ${Math.round(selCandidate.score * 100)}%` : ""
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "#b42318" }, children: "未选择，点此指定 →" }) }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: OV.picker, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: OV.pickerLabel, children: "自动建议" }),
      mapping.candidates.length ? mapping.candidates.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          style: OV.pickItem,
          onClick: () => onChoose({ adapterId: c.adapterId, relativePath: c.relativePath }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              Math.round(c.score * 100),
              "%"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: 1, textAlign: "left", color: "#3f3a30" }, children: c.relativePath })
          ]
        },
        c.adapterId + c.relativePath
      )) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: OV.pickerLabel, children: "无自动建议，请在下方搜索。" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          style: OV.searchInput,
          value: search,
          placeholder: "在全部布局文件中搜索…",
          onChange: (e) => onSearchChange(e.target.value)
        }
      ),
      filteredCodeFiles.map((f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          style: OV.pickItem,
          onClick: () => onChoose({ adapterId: f.adapterId, relativePath: f.relativePath }),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: 1, textAlign: "left", color: "#3f3a30" }, children: f.relativePath })
        },
        f.adapterId + f.relativePath
      ))
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: OV.compareBtn, disabled: !selected, onClick: onCompare, children: "对比" }) })
  ] });
}
var import_react2, import_jsx_runtime2, KIND_BADGE, STATUS_DOT, OV;
var init_PageMappingOverview = __esm({
  "client-src/visual/PageMappingOverview.tsx"() {
    "use strict";
    import_react2 = require("react");
    import_jsx_runtime2 = require("react/jsx-runtime");
    KIND_BADGE = {
      screen: { label: "整屏", bg: "#e7f0fb" },
      "list-item": { label: "列表项", bg: "#ece8fa" },
      dialog: { label: "弹窗", bg: "#fdeede" }
    };
    STATUS_DOT = {
      matched: "#1a9b6e",
      weak: "#dc8a05",
      none: "#d92d20"
    };
    OV = {
      scan: {
        width: "100%",
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #0f6e56",
        background: "#0f6e56",
        color: "#fff",
        fontWeight: 600,
        cursor: "pointer"
      },
      error: { color: "#b42318", fontSize: 12, marginTop: 6 },
      summary: { fontSize: 12, color: "#5f584c", marginBottom: 8 },
      canvasCard: {
        border: "1px solid var(--dsh-border,#ddd4c5)",
        borderRadius: 10,
        marginBottom: 8,
        overflow: "hidden",
        background: "#fff"
      },
      canvasTitle: {
        fontSize: 12,
        fontWeight: 600,
        padding: "6px 10px",
        background: "#f6f2e9",
        color: "#5f584c"
      },
      row: {
        borderTop: "1px solid #f0eadd",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6
      },
      kindBadge: {
        fontSize: 10,
        borderRadius: 999,
        padding: "1px 7px",
        color: "#3f3a30"
      },
      selectedBox: {
        textAlign: "left",
        fontSize: 12,
        border: "1px solid #d9d2c4",
        borderRadius: 8,
        padding: "5px 8px",
        background: "#fcfaf6",
        cursor: "pointer",
        color: "#3f3a30",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      picker: {
        display: "flex",
        flexDirection: "column",
        gap: 4,
        border: "1px solid #e6dfd0",
        borderRadius: 8,
        padding: 6,
        background: "#fdfbf7"
      },
      pickerLabel: { fontSize: 11, color: "#8a7f70" },
      pickItem: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        fontSize: 11,
        border: "1px solid #ece5d8",
        borderRadius: 6,
        padding: "4px 8px",
        background: "#fff",
        cursor: "pointer",
        color: "#0f6e56",
        fontWeight: 600
      },
      searchInput: {
        padding: "5px 8px",
        border: "1px solid #d9d2c4",
        borderRadius: 6,
        fontSize: 12
      },
      compareBtn: {
        fontSize: 12,
        padding: "4px 14px",
        borderRadius: 7,
        border: "1px solid #0f6e56",
        background: "#fff",
        color: "#0f6e56",
        fontWeight: 600,
        cursor: "pointer"
      }
    };
  }
});

// client-src/visual/HifiScreen.tsx
function gradientCss(g) {
  if (!g.startColor && !g.endColor) return void 0;
  const cssAngle = (g.angle + 90) % 360;
  const stops = [g.startColor, g.centerColor, g.endColor].filter(Boolean).join(", ");
  return `linear-gradient(${cssAngle}deg, ${stops})`;
}
function nodeBaseStyle(node) {
  const s = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    boxSizing: "border-box"
  };
  const st = node.style;
  if (st.backgroundColor) s.background = st.backgroundColor;
  if (st.gradient) {
    const g = gradientCss(st.gradient);
    if (g) s.background = g;
  }
  if (st.borderRadius) s.borderRadius = st.borderRadius;
  if (st.borderWidth) {
    s.borderStyle = "solid";
    s.borderWidth = st.borderWidth;
    s.borderColor = st.borderColor;
  }
  if (typeof st.opacity === "number") s.opacity = st.opacity;
  if (st.color) s.color = st.color;
  if (st.fontSize) s.fontSize = st.fontSize;
  if (st.fontWeight) s.fontWeight = st.fontWeight;
  if (st.textAlign) s.textAlign = st.textAlign === "right" ? "right" : "center";
  return s;
}
function diffsByNode(diffs, side) {
  const map = /* @__PURE__ */ new Map();
  for (const d of diffs) {
    const id = side === "design" ? d.designNodeId : d.codeNodeId;
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(d);
    map.set(id, list);
  }
  return map;
}
function HifiScreen({
  root,
  width,
  height,
  side,
  diffs,
  activeNodeId,
  onSelectNode
}) {
  const diffIndex = diffsByNode(diffs, side);
  function renderNode(node) {
    const nodeDiffs = diffIndex.get(node.id) ?? [];
    const worst = nodeDiffs.reduce(
      (acc, d) => {
        if (!acc) return d.severity;
        const rank = { high: 3, medium: 2, low: 1 };
        return rank[d.severity] > rank[acc] ? d.severity : acc;
      },
      null
    );
    const isActive = activeNodeId === node.id;
    const outline = worst ? `2px solid ${SEVERITY_COLOR[worst]}` : isActive ? "2px solid #0f6e56" : void 0;
    const base = nodeBaseStyle(node);
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        style: { ...base, outline, outlineOffset: -1 },
        onClick: (e) => {
          e.stopPropagation();
          onSelectNode(node.id);
        },
        title: node.name,
        children: [
          node.kind === "image" && node.imageUrl ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "img",
            {
              src: node.imageUrl,
              alt: node.name,
              style: { width: "100%", height: "100%", display: "block", objectFit: side === "design" ? "fill" : "cover" }
            }
          ) : null,
          node.kind === "text" && node.text ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { display: "inline-block", padding: "0 2px", lineHeight: 1.3 }, children: node.text }) : null,
          node.dynamic ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "div",
            {
              style: {
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px dashed #b9a98a",
                borderRadius: 4,
                background: "repeating-linear-gradient(45deg,#f3ede1,#f3ede1 8px,#efe7d6 8px,#efe7d6 16px)",
                color: "#8a7a5c",
                fontSize: 11
              },
              children: "运行时动态区域"
            }
          ) : null,
          node.aiInferred ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "div",
            {
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                background: "#6d4bd6",
                color: "#fff",
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: "0 0 6px 0",
                maxWidth: "100%"
              },
              title: node.aiNote,
              children: [
                "AI 推断",
                node.aiNote ? `：${node.aiNote}` : ""
              ]
            }
          ) : null,
          node.children.map(renderNode)
        ]
      },
      node.id
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      style: {
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background: "#fff"
      },
      children: renderNode(root)
    }
  );
}
var import_jsx_runtime3, SEVERITY_COLOR;
var init_HifiScreen = __esm({
  "client-src/visual/HifiScreen.tsx"() {
    "use strict";
    import_jsx_runtime3 = require("react/jsx-runtime");
    SEVERITY_COLOR = {
      high: "#e5484d",
      medium: "#f5a623",
      low: "#4c9aff"
    };
  }
});

// client-src/visual/HifiCompareBoard.tsx
function fmt(v) {
  if (v === void 0 || v === null) return "—";
  if (typeof v === "number") return String(Math.round(v * 10) / 10);
  return String(v);
}
function HifiCompareBoard({ data }) {
  const [activeId, setActiveId] = (0, import_react3.useState)("");
  const diffs = data.result.diffs;
  const sortedDiffs = (0, import_react3.useMemo)(
    () => [...diffs].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    ),
    [diffs]
  );
  const computedScale = (0, import_react3.useMemo)(() => {
    const available = 300;
    const s = Math.min(1, available / data.viewport.width);
    return s;
  }, [data.viewport.width]);
  const w = data.viewport.width * computedScale;
  const h = data.viewport.height * computedScale;
  function diffIds(d) {
    return { design: d.designNodeId ?? "", code: d.codeNodeId ?? "" };
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "wrap"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: COL.title, children: "设计稿" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { ...COL.frame, width: w, height: h }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { transform: `scale(${computedScale})`, transformOrigin: "top left" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              HifiScreen,
              {
                root: data.designHifiTree,
                width: data.viewport.width,
                height: data.viewport.height,
                side: "design",
                diffs,
                activeNodeId: activeId,
                onSelectNode: setActiveId
              }
            ) }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: COL.title, children: "代码高保真渲染" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { ...COL.frame, width: w, height: h }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { transform: `scale(${computedScale})`, transformOrigin: "top left" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              HifiScreen,
              {
                root: data.codeHifiTree,
                width: data.viewport.width,
                height: data.viewport.height,
                side: "code",
                diffs,
                activeNodeId: activeId,
                onSelectNode: setActiveId
              }
            ) }) })
          ] })
        ]
      }
    ),
    data.aiInferenceNote ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: COL.aiNote, children: data.aiInferenceNote }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("strong", { style: { fontSize: 12 }, children: [
        "差异清单（",
        sortedDiffs.length,
        "，点击可在界面上定位）"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }, children: sortedDiffs.slice(0, 60).map((d, i) => {
        const ids = diffIds(d);
        const isActive = activeId === ids.design || activeId === ids.code;
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => setActiveId(ids.design || ids.code),
            style: {
              textAlign: "left",
              fontSize: 12,
              border: "1px solid " + (isActive ? "#0f6e56" : "#e6dfd0"),
              background: isActive ? "#f2f8f5" : "#fff",
              borderRadius: 7,
              padding: "5px 8px",
              cursor: "pointer"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { color: SEVERITY_TEXT[d.severity], fontWeight: 700 }, children: [
                "[",
                SEVERITY_LABEL[d.severity],
                "]"
              ] }),
              " ",
              PROP_LABEL[d.property] ?? d.property,
              " · ",
              d.nodeName,
              "： 期望 ",
              fmt(d.expected),
              " / 实际 ",
              fmt(d.actual),
              d.needsReview ? "（需人工确认）" : ""
            ]
          },
          i
        );
      }) })
    ] })
  ] });
}
var import_react3, import_jsx_runtime4, SEVERITY_RANK, SEVERITY_LABEL, PROP_LABEL, SEVERITY_TEXT, COL;
var init_HifiCompareBoard = __esm({
  "client-src/visual/HifiCompareBoard.tsx"() {
    "use strict";
    import_react3 = require("react");
    init_HifiScreen();
    import_jsx_runtime4 = require("react/jsx-runtime");
    SEVERITY_RANK = { high: 3, medium: 2, low: 0 };
    SEVERITY_LABEL = { high: "高", medium: "中", low: "低" };
    PROP_LABEL = {
      width: "宽度",
      height: "高度",
      marginTop: "上间距",
      marginBottom: "下间距",
      marginLeft: "左间距",
      marginRight: "右间距",
      paddingTop: "上内边距",
      paddingBottom: "下内边距",
      paddingLeft: "左内边距",
      paddingRight: "右内边距",
      backgroundColor: "背景色",
      color: "文字颜色",
      fontSize: "字号",
      cornerRadius: "圆角",
      borderWidth: "边框粗细",
      borderColor: "边框颜色",
      fontWeight: "字重",
      opacity: "透明度"
    };
    SEVERITY_TEXT = {
      high: "#d92d20",
      medium: "#dc8a05",
      low: "#2f62b9"
    };
    COL = {
      title: { fontSize: 12, fontWeight: 600, color: "#5f584c", marginBottom: 4 },
      frame: {
        border: "1px solid var(--dsh-border,#ddd4c5)",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff"
      },
      aiNote: {
        marginTop: 8,
        fontSize: 12,
        color: "#5b3fb0",
        background: "#f1ecfb",
        border: "1px solid #ddd2f4",
        borderRadius: 8,
        padding: "6px 10px"
      }
    };
  }
});

// client-src/visual/VisualComparePanel.tsx
var VisualComparePanel_exports = {};
__export(VisualComparePanel_exports, {
  VisualComparePanel: () => VisualComparePanel
});
async function post2(path, body) {
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
function uiStorageKey(repoInput, field) {
  return UI_CONFIG_PREFIX + field + ":" + repoInput.trim();
}
function readUiConfig(repoInput, field) {
  try {
    return localStorage.getItem(uiStorageKey(repoInput, field)) ?? "";
  } catch {
    return "";
  }
}
function writeUiConfig(repoInput, field, value) {
  try {
    if (value) localStorage.setItem(uiStorageKey(repoInput, field), value);
    else localStorage.removeItem(uiStorageKey(repoInput, field));
  } catch {
  }
}
function VisualComparePanel({ repoInput, auth }) {
  const [figmaUrl, setFigmaUrlState] = (0, import_react4.useState)(() => readUiConfig(repoInput, UI_CONFIG_FIGMA_URL));
  const [figmaToken, setFigmaTokenState] = (0, import_react4.useState)(
    () => readUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN)
  );
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [phase, setPhase] = (0, import_react4.useState)("idle");
  const [candidates, setCandidates] = (0, import_react4.useState)([]);
  const [selectedKey, setSelectedKey] = (0, import_react4.useState)("");
  const [data, setData] = (0, import_react4.useState)(null);
  const [error, setError] = (0, import_react4.useState)("");
  const [designNodeName, setDesignNodeName] = (0, import_react4.useState)("");
  const [hifiData, setHifiData] = (0, import_react4.useState)(null);
  const [useAI, setUseAI] = (0, import_react4.useState)(false);
  const setFigmaUrl = (value) => {
    setFigmaUrlState(value);
    writeUiConfig(repoInput, UI_CONFIG_FIGMA_URL, value.trim());
  };
  const setFigmaToken = (value) => {
    setFigmaTokenState(value);
    writeUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN, value.trim());
  };
  (0, import_react4.useEffect)(() => {
    setFigmaUrlState(readUiConfig(repoInput, UI_CONFIG_FIGMA_URL));
    setFigmaTokenState(readUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN));
    setCandidates([]);
    setSelectedKey("");
    setData(null);
    setPhase("idle");
    setError("");
    setDesignNodeName("");
  }, [repoInput]);
  const basePayload = () => ({
    repoPath: repoInput,
    auth,
    figmaUrl: figmaUrl.trim(),
    figmaToken: figmaToken.trim()
  });
  async function locate() {
    setError("");
    setData(null);
    setDesignNodeName("");
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setError("请填写设计稿链接和访问 Token");
      return;
    }
    setBusy(true);
    try {
      const res = await post2("/tracescope/v1/match-page", basePayload());
      const list = res.candidates || [];
      setCandidates(list);
      setPhase("matched");
      setDesignNodeName(typeof res.designNodeName === "string" ? res.designNodeName : "");
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
  function nodeUrl(designId) {
    try {
      const u = new URL(figmaUrl);
      u.searchParams.set("node-id", designId.replace(/:/g, "-"));
      return u.toString();
    } catch {
      return figmaUrl;
    }
  }
  async function compareFromOverview(designId, codeFile) {
    setError("");
    setData(null);
    setHifiData(null);
    setBusy(true);
    try {
      const res = await post2("/tracescope/v1/hifi-compare", {
        repoPath: repoInput,
        auth,
        figmaUrl: nodeUrl(designId),
        figmaToken: figmaToken.trim(),
        adapterId: codeFile.adapterId,
        relativePath: codeFile.relativePath,
        useAI
      });
      setHifiData(res);
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
      const res = await post2("/tracescope/v1/visual-compare", {
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { style: S.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "UI 走查：设计稿 ↔ 代码" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: S.hint, children: "连接设计稿后，系统会在当前仓库中自动定位对应的页面（同一页面可能存在多种技术实现）， 再与所选实现进行确定性对比，自动列出尺寸、间距、颜色、字号等差异。无需运行应用，也不依赖模型。" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: S.label, children: [
      "设计稿链接",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: S.label, children: [
      "访问 Token",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { ...S.row, gap: 6, fontSize: 12, color: "#5f584c", margin: "2px 0 8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          type: "checkbox",
          checked: useAI,
          disabled: busy,
          onChange: (e) => setUseAI(e.target.checked)
        }
      ),
      "本次生成启用 AI 辅助（仅用于推断列表/分页等动态区域，会标注为「AI 推断」，不参与自动判定）"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 2 }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      PageMappingOverview,
      {
        repoInput,
        figmaUrl,
        figmaToken,
        auth,
        busy,
        onScanStateChange: setBusy,
        onCompare: compareFromOverview
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { style: { marginTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { style: { cursor: "pointer", fontSize: 12, color: "#6b645a" }, children: "高级：仅定位当前链接选中的单个节点" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", style: { ...S.primary, marginTop: 8 }, disabled: busy, onClick: locate, children: busy && phase === "idle" ? "定位中…" : "自动定位当前节点" }),
      phase === "matched" ? candidates.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.row, justifyContent: "space-between" }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontWeight: 600 }, children: "匹配的页面（默认最佳，可切换）" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }, children: candidates.map((c) => {
          const key = candidateKey(c);
          const checked = key === selectedKey;
          return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
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
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.row, justifyContent: "space-between" }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { display: "inline-flex", gap: 8, alignItems: "center" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                    "input",
                    {
                      type: "radio",
                      name: "visual-page",
                      checked,
                      onChange: () => setSelectedKey(key)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
                    c.kindLabel,
                    " · ",
                    Math.round(c.score * 100),
                    "%"
                  ] }),
                  !c.precise ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: S.badge, children: "暂不支持精确对比" }) : null
                ] }) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: "#6b645a", marginTop: 4 }, children: c.relativePath }),
                c.reasons.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: "#8a7f70", marginTop: 2 }, children: c.reasons.join("；") }) : null
              ]
            },
            key
          );
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            style: { ...S.primary, marginTop: 10 },
            disabled: busy,
            onClick: compare,
            children: busy ? "对比中…" : "开始对比所选页面"
          }
        )
      ] }) : designNodeName ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...S.hint, color: "#9a6700", marginTop: 10, lineHeight: 1.7 }, children: [
        "当前链接指向的节点「",
        designNodeName,
        "」是一个",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "空白图层（不含任何文案或控件）" }),
        "， 无法对应到代码页面。",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("br", {}),
        "请在 Figma 中点击真正的",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "画板 / 界面 Frame" }),
        "（通常包含整屏内容，而非某个矩形、图片等子元素）， 右键选择「Copy link to selection」后重新粘贴。"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...S.hint, color: "#9a6700", marginTop: 10, lineHeight: 1.7 }, children: [
        "未能在仓库中定位到与设计稿对应的页面。请确认：",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("br", {}),
        "1）所选代码文件夹根目录正确；",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("br", {}),
        "2）复制链接时选中的是完整画板，而不是画板内的某个分组 / 子元素；",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("br", {}),
        "3）设计稿中的文案与界面实际文案一致。"
      ] }) : null
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { color: "#b42318", margin: "8px 0 0", fontSize: 12 }, children: error }) : null,
    data && !data.precise ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
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
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: data.page.kindLabel }),
          " · ",
          data.page.relativePath,
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { marginTop: 4 }, children: data.reason || "该实现以代码方式构建界面，当前版本暂不支持属性级对比。" })
        ]
      }
    ) : null,
    data && data.precise && data.result ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(VisualDiffBoard, { data }) : null,
    hifiData ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(HifiCompareBoard, { data: hifiData }) : null
  ] });
}
function candidateKey(c) {
  return c.adapterId + "::" + c.relativePath;
}
var import_react4, import_jsx_runtime5, UI_CONFIG_PREFIX, UI_CONFIG_FIGMA_URL, UI_CONFIG_FIGMA_TOKEN, S;
var init_VisualComparePanel = __esm({
  "client-src/visual/VisualComparePanel.tsx"() {
    "use strict";
    import_react4 = require("react");
    init_VisualDiffBoard();
    init_PageMappingOverview();
    init_HifiCompareBoard();
    import_jsx_runtime5 = require("react/jsx-runtime");
    UI_CONFIG_PREFIX = "tracescope.ui.";
    UI_CONFIG_FIGMA_URL = "figmaUrl";
    UI_CONFIG_FIGMA_TOKEN = "figmaToken";
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
var __tracescopeExports = {};
var React = require("react");
var jsxRuntime = require("react/jsx-runtime");
var jsx6 = jsxRuntime.jsx;
var jsxs6 = jsxRuntime.jsxs;
var useState5 = React.useState;
var useEffect4 = React.useEffect;
var useCallback = React.useCallback;
var useRef2 = React.useRef;
var VisualComparePanel2 = (init_VisualComparePanel(), __toCommonJS(VisualComparePanel_exports)).VisualComparePanel;
var TAB_ID = "@rebornace/dsh-tracescope";
var AUTO_OPEN_KEY = "tracescope.autoOpen";
function isAutoOpenEnabled() {
  try {
    return localStorage.getItem(AUTO_OPEN_KEY) !== "off";
  } catch (_e) {
    return true;
  }
}
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
  miniBtn: {
    border: "1px solid var(--dsh-border, #ddd4c5)",
    borderRadius: 999,
    padding: "3px 10px",
    cursor: "pointer",
    background: "var(--dsh-card, #fffdf8)",
    color: "#6b645a",
    fontSize: 11,
    lineHeight: 1.4,
    whiteSpace: "nowrap"
  },
  miniBtnActive: {
    borderColor: "var(--dsh-accent, #0f6e56)",
    color: "var(--dsh-accent, #0f6e56)"
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
    "# TraceScope 验证报告",
    "",
    "- 仓库：`" + repo + "`",
    "- 稳定基线：`" + base + "`",
    "- 待测提交：`" + head + "`",
    "- 生成时间：" + (report.generatedAt || ""),
    "- AI 分析：" + (report.modelEnriched ? "是" : "否（规则分析）"),
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
      lines.push("- 建议验证：");
      (item.suggestedSteps || []).forEach(function(s, i) {
        lines.push("  " + (i + 1) + ". " + s);
      });
      lines.push("");
    });
  }
  renderSection("直接项", report.direct || []);
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
function resolveCurrentSessionId(sessions) {
  var list = sessions && sessions.list;
  if (!list || typeof list.getSnapshot !== "function") return null;
  var snap = list.getSnapshot();
  if (snap && snap.current) {
    var c = snap.current;
    if (typeof c === "string") return c;
    return c.id || c.key || null;
  }
  var byId = snap && snap.byId;
  var ids = Array.isArray(snap && snap.ids) ? snap.ids : null;
  if (byId && typeof byId === "object") {
    var ordered = ids || Object.keys(byId);
    for (var i = 0; i < ordered.length; i += 1) {
      var rec = byId[ordered[i]];
      var retained = rec && rec.retainedBy && rec.retainedBy.mainView;
      if ((retained || 0) > 0) return ordered[i];
    }
  }
  if (ids && ids.length) return ids[0];
  if (byId) {
    var keys = Object.keys(byId);
    if (keys.length) return keys[0];
  }
  return null;
}
function fillComposerDraft(prompt) {
  try {
    var sessions = hostCtx && (hostCtx.sessions || hostCtx.get && hostCtx.get("sessions"));
    var conversation = hostCtx && (hostCtx.conversation || hostCtx.get && hostCtx.get("conversation"));
    if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== "function") {
      throw new Error("找不到会话列表服务，请确认已打开会话页");
    }
    var sessionId = resolveCurrentSessionId(sessions);
    if (!sessionId) throw new Error("请先打开并选中一个会话，再点「AI 智能分析」");
    var input = conversation && conversation.input;
    if (!input || typeof input.shell !== "function") {
      throw new Error("找不到会话输入框服务");
    }
    var shell = input.shell(sessionId);
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
var PROFILES_KEY = "tracescope.profiles";
function readProfilesMap() {
  try {
    var raw = JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch (_e) {
    return {};
  }
}
function readRepoProfile(repo) {
  var key = String(repo || "").trim();
  if (!key) return null;
  var p = readProfilesMap()[key];
  return p && typeof p === "object" ? p : null;
}
function writeRepoProfile(repo, profile) {
  var key = String(repo || "").trim();
  if (!key) return;
  var map = readProfilesMap();
  map[key] = profile;
  var known = readRepoList();
  var order = [key].concat(known.filter(function(r) {
    return r !== key;
  }));
  var pruned = {};
  var count = 0;
  order.forEach(function(r) {
    if (map[r] && typeof map[r] === "object" && count < 30) {
      pruned[r] = map[r];
      count += 1;
    }
  });
  localStorage.setItem(PROFILES_KEY, JSON.stringify(pruned));
}
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
    return (prefix + "验证失败：" + (failed[0].displayName || "条目")).slice(0, 120);
  }
  return (prefix + "验证失败 " + failed.length + " 项").slice(0, 120);
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
  var units = ["KB", "MB", "GB", "TB"];
  var v = bytes / 1024;
  var i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return v.toFixed(v < 10 ? 1 : 0) + " " + units[i];
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
  return jsxs6("div", {
    style: Object.assign({}, styles.row, { gap: 6 }),
    children: ["pass", "fail", "skip", "pending"].map(function(s) {
      var label = s === "pass" ? "通过" : s === "fail" ? "失败" : s === "skip" ? "跳过" : "重置";
      var active = status === s;
      return jsx6(
        "button",
        {
          type: "button",
          disabled: locked,
          title: s === "pass" ? "标记为验证通过" : s === "fail" ? "标记为验证失败" : s === "skip" ? "本轮不测，标记跳过" : "清除结果，恢复为待测",
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
    var option = jsx6(
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
      jsx6(
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
    groups.push(jsx6("optgroup", { label: "分支", children: branchOpts }, "g-branch"));
  }
  if (tagOpts.length) {
    groups.push(jsx6("optgroup", { label: "标签", children: tagOpts }, "g-tag"));
  }
  if (commitOpts.length) {
    groups.push(
      jsx6(
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
    groups.push(jsx6("option", { value: "", children: emptyLabel }, "empty"));
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
  var fileRef = useRef2(null);
  return jsxs6("article", {
    style: Object.assign({}, styles.item, {
      borderLeft: "4px solid",
      borderLeftColor: st === "pass" ? "#0f6e56" : st === "fail" ? "#b42318" : st === "skip" ? "#b54708" : "#ddd4c5",
      opacity: locked ? 0.72 : 1
    }),
    children: [
      jsxs6("div", {
        style: { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
        children: [
          jsxs6("div", {
            children: [
              jsx6("div", { style: { fontWeight: 700 }, children: item.displayName }),
              jsxs6("div", {
                style: { marginTop: 4 },
                children: [
                  jsx6("span", {
                    style: Object.assign({}, styles.badge, statusBadgeStyle(st)),
                    children: statusLabel(st)
                  }),
                  jsx6("span", { style: styles.badge, children: "风险 " + item.risk }),
                  jsx6("span", {
                    style: styles.badge,
                    children: item.kind === "direct" ? "直接项" : "可能波及"
                  })
                ]
              })
            ]
          }),
          jsx6(StatusButtons, {
            status: st,
            disabled: locked,
            onChange: function(s) {
              if (locked) return;
              props.onStatus(listKind, itemIndex, item.id, s);
            }
          })
        ]
      }),
      jsx6("ol", {
        style: { margin: "8px 0 0", paddingLeft: 18, color: "#6b645a" },
        children: (item.suggestedSteps || []).map(function(step, idx) {
          return jsx6("li", { children: step }, idx);
        })
      }),
      st === "fail" ? jsxs6("div", {
        style: { marginTop: 10 },
        children: [
          jsx6("div", {
            style: { fontWeight: 600, marginBottom: 4, color: "#b42318" },
            children: "失败备注（给开发）"
          }),
          jsx6("textarea", {
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
          jsxs6("div", {
            style: Object.assign({}, styles.row, {
              marginTop: 8,
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8
            }),
            children: [
              jsx6("input", {
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
              jsx6("button", {
                type: "button",
                style: styles.btn,
                disabled: locked || shots.length >= MAX_SHOTS,
                onClick: function() {
                  if (locked) return;
                  if (fileRef.current) fileRef.current.click();
                },
                children: "添加截图"
              }),
              jsx6("span", {
                style: { fontSize: 12, color: "#6b645a" },
                children: "已附 " + shots.length + "/" + MAX_SHOTS + " · 支持粘贴或选文件（自动压缩）"
              })
            ]
          }),
          shots.length ? jsx6("div", {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8
            },
            children: shots.map(function(shot) {
              return jsxs6(
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
                    jsx6("img", {
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
                    jsx6("button", {
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
                    jsx6("div", {
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
      jsxs6("details", {
        style: { marginTop: 8 },
        children: [
          jsx6("summary", { children: "查看证据" }),
          jsx6("ul", {
            children: (item.files || []).map(function(f) {
              return jsx6("li", { children: jsx6("code", { children: f }) }, f);
            })
          }),
          jsx6("ul", {
            children: (item.evidence || []).map(function(e, idx) {
              return jsx6("li", { children: e.detail }, idx);
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
function isGitRemoteInput(value) {
  var s = String(value || "").trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^git@[^:\s]+:/.test(s)) return true;
  if (/^ssh:\/\//i.test(s)) return true;
  if (/^git:\/\//i.test(s)) return true;
  if (/^(github\.com|gitlab\.com|gitee\.com|coding\.net)\//i.test(s)) return true;
  return false;
}
function TraceScopePanelBody() {
  var initialRepo = localStorage.getItem(REPO_PATH_KEY) || "";
  var _repo = useState5(initialRepo);
  var repoPath = _repo[0];
  var setRepoPath = _repo[1];
  var _repoList = useState5(function() {
    var list = readRepoList();
    if (initialRepo && list.indexOf(initialRepo) === -1) list = writeRepoList([initialRepo].concat(list));
    return list;
  });
  var repoList = _repoList[0];
  var setRepoList = _repoList[1];
  var _settingsOpen = useState5(!initialRepo);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  var isRemote = isGitRemoteInput(repoPath);
  var _autoOpen = useState5(isAutoOpenEnabled());
  var autoOpen = _autoOpen[0];
  var setAutoOpen = _autoOpen[1];
  function toggleAutoOpen(next) {
    setAutoOpen(next);
    try {
      localStorage.setItem(AUTO_OPEN_KEY, next ? "on" : "off");
    } catch (_e) {
    }
  }
  var _dataDirOpen = useState5(false);
  var dataDirOpen = _dataDirOpen[0];
  var setDataDirOpen = _dataDirOpen[1];
  var _dataDir = useState5(null);
  var dataDirInfo = _dataDir[0];
  var setDataDirInfo = _dataDir[1];
  var _dataDirDraft = useState5("");
  var dataDirDraft = _dataDirDraft[0];
  var setDataDirDraft = _dataDirDraft[1];
  var _dataDirBusy = useState5(false);
  var dataDirBusy = _dataDirBusy[0];
  var setDataDirBusy = _dataDirBusy[1];
  var _pickerOpen = useState5(false);
  var pickerOpen = _pickerOpen[0];
  var setPickerOpen = _pickerOpen[1];
  var _pickerPurpose = useState5("data");
  var pickerPurpose = _pickerPurpose[0];
  var setPickerPurpose = _pickerPurpose[1];
  var _pickerBrowse = useState5(null);
  var pickerBrowse = _pickerBrowse[0];
  var setPickerBrowse = _pickerBrowse[1];
  var _pickerLoading = useState5(false);
  var pickerLoading = _pickerLoading[0];
  var setPickerLoading = _pickerLoading[1];
  var _pickerSelected = useState5("");
  var pickerSelected = _pickerSelected[0];
  var setPickerSelected = _pickerSelected[1];
  function browsePath(target) {
    setPickerLoading(true);
    var qs = target ? "?path=" + encodeURIComponent(target) : "";
    apiGet("/tracescope/v1/browse" + qs).then(function(data) {
      setPickerBrowse(data);
      setPickerSelected("");
    }).catch(function(err) {
      setChatHint("浏览目录失败：" + (err.message || String(err)));
    }).finally(function() {
      setPickerLoading(false);
    });
  }
  function openPicker() {
    setPickerPurpose("data");
    setPickerOpen(true);
    browsePath("");
  }
  function openRepoPicker() {
    setPickerPurpose("repo");
    setPickerOpen(true);
    browsePath("");
  }
  function closePicker() {
    setPickerOpen(false);
    setPickerBrowse(null);
    setPickerSelected("");
  }
  function effectivePickerPath() {
    var highlighted = String(pickerSelected || "").trim();
    if (highlighted) return highlighted;
    if (pickerBrowse && !pickerBrowse.isRoot) return pickerBrowse.path;
    return "";
  }
  function confirmPicker() {
    var chosen = effectivePickerPath();
    if (!chosen) {
      setChatHint("请先进入并选择一个文件夹");
      return;
    }
    if (pickerPurpose === "repo") {
      setRepoPath(chosen);
      rememberRepo(chosen);
      try {
        localStorage.setItem(REPO_PATH_KEY, chosen);
      } catch (_e) {
      }
      closePicker();
      return;
    }
    setDataDirDraft(chosen);
    closePicker();
  }
  function refreshDataDir() {
    return apiGet("/tracescope/v1/data-dir").then(function(data) {
      setDataDirInfo(data);
      setDataDirDraft(data.dataRoot || "");
    }).catch(function() {
    });
  }
  function toggleDataDir(next) {
    var opening = typeof next === "boolean" ? next : !dataDirOpen;
    setDataDirOpen(opening);
    if (opening && !dataDirInfo) refreshDataDir();
  }
  function applyDataDir() {
    if (dataDirBusy) return;
    var target = String(dataDirDraft || "").trim();
    if (!target) {
      setChatHint("数据目录不能为空");
      return;
    }
    if (dataDirInfo && target === dataDirInfo.dataRoot) {
      setDataDirOpen(false);
      return;
    }
    setDataDirBusy(true);
    setChatHint("正在迁移数据到新目录，数据较多时请耐心等待，请勿关闭…");
    apiPost("/tracescope/v1/data-dir-change", { dataRoot: target }).then(function(data) {
      setDataDirInfo(data);
      setDataDirDraft(data.dataRoot || target);
      setDataDirOpen(false);
      setChatHint(
        data.migrated ? "数据已迁移至「" + data.dataRoot + "」，历史记录与附件均保留。" : "数据目录已切换为「" + data.dataRoot + "」。"
      );
    }).catch(function(err) {
      setChatHint("更改数据目录失败：" + (err.message || String(err)));
    }).finally(function() {
      setDataDirBusy(false);
    });
  }
  var ACCESS_MODE_KEY = "tracescope.accessMode";
  var _accessMode = useState5(localStorage.getItem(ACCESS_MODE_KEY) === "codeup" ? "codeup" : "git");
  var accessMode = _accessMode[0];
  var setAccessMode = _accessMode[1];
  var _copyFlash = useState5("");
  var copyFlash = _copyFlash[0];
  var setCopyFlash = _copyFlash[1];
  var YX_AUTH_KEY = "tracescope.yunxiaoAuth";
  var savedYx = null;
  try {
    savedYx = JSON.parse(localStorage.getItem(YX_AUTH_KEY) || "null");
  } catch (_e) {
    savedYx = null;
  }
  var _yxEndpoint = useState5(
    savedYx && savedYx.endpoint || "https://openapi-rdc.aliyuncs.com"
  );
  var yxEndpoint = _yxEndpoint[0];
  var setYxEndpoint = _yxEndpoint[1];
  var _yxToken = useState5(savedYx && savedYx.token || "");
  var yxToken = _yxToken[0];
  var setYxToken = _yxToken[1];
  var _yxTokenSaved = useState5(Boolean(savedYx && savedYx.token));
  var yxTokenSaved = _yxTokenSaved[0];
  var setYxTokenSaved = _yxTokenSaved[1];
  var _yxHydrated = useState5(false);
  var yxHydrated = _yxHydrated[0];
  var setYxHydrated = _yxHydrated[1];
  var _yxOrg = useState5("");
  var yxOrg = _yxOrg[0];
  var setYxOrg = _yxOrg[1];
  var _yxSpace = useState5("");
  var yxSpace = _yxSpace[0];
  var setYxSpace = _yxSpace[1];
  var _yxType = useState5("");
  var yxType = _yxType[0];
  var setYxType = _yxType[1];
  var _yxAssignee = useState5("");
  var yxAssignee = _yxAssignee[0];
  var setYxAssignee = _yxAssignee[1];
  var _yxOrgs = useState5([]);
  var yxOrgs = _yxOrgs[0];
  var setYxOrgs = _yxOrgs[1];
  var _yxProjects = useState5([]);
  var yxProjects = _yxProjects[0];
  var setYxProjects = _yxProjects[1];
  var _yxTypes = useState5([]);
  var yxTypes = _yxTypes[0];
  var setYxTypes = _yxTypes[1];
  var _yxMembers = useState5([]);
  var yxMembers = _yxMembers[0];
  var setYxMembers = _yxMembers[1];
  var _yxCatalogHint = useState5("");
  var yxCatalogHint = _yxCatalogHint[0];
  var setYxCatalogHint = _yxCatalogHint[1];
  var _yxDebugLog = useState5(false);
  var yxDebugLog = _yxDebugLog[0];
  var setYxDebugLog = _yxDebugLog[1];
  var _yxRequestLog = useState5("");
  var yxRequestLog = _yxRequestLog[0];
  var setYxRequestLog = _yxRequestLog[1];
  var _trackerProvider = useState5("none");
  var trackerProvider = _trackerProvider[0];
  var setTrackerProvider = _trackerProvider[1];
  var _ghToken = useState5("");
  var ghToken = _ghToken[0];
  var setGhToken = _ghToken[1];
  var _ghOwner = useState5("");
  var ghOwner = _ghOwner[0];
  var setGhOwner = _ghOwner[1];
  var _ghRepo = useState5("");
  var ghRepo = _ghRepo[0];
  var setGhRepo = _ghRepo[1];
  var _ghLabels = useState5("bug");
  var ghLabels = _ghLabels[0];
  var setGhLabels = _ghLabels[1];
  var _glHost = useState5("https://gitlab.com");
  var glHost = _glHost[0];
  var setGlHost = _glHost[1];
  var _glToken = useState5("");
  var glToken = _glToken[0];
  var setGlToken = _glToken[1];
  var _glProject = useState5("");
  var glProject = _glProject[0];
  var setGlProject = _glProject[1];
  var _glLabels = useState5("bug");
  var glLabels = _glLabels[0];
  var setGlLabels = _glLabels[1];
  var _whUrl = useState5("");
  var whUrl = _whUrl[0];
  var setWhUrl = _whUrl[1];
  var _whAuth = useState5("");
  var whAuth = _whAuth[0];
  var setWhAuth = _whAuth[1];
  var _trackerReady = useState5(false);
  var trackerReady = _trackerReady[0];
  var setTrackerReady = _trackerReady[1];
  var _wiCats = useState5({ Req: true, Bug: true, Task: true, Risk: false, Topic: false });
  var wiCats = _wiCats[0];
  var setWiCats = _wiCats[1];
  var _wiItems = useState5([]);
  var wiItems = _wiItems[0];
  var setWiItems = _wiItems[1];
  var _wiSelected = useState5({});
  var wiSelected = _wiSelected[0];
  var setWiSelected = _wiSelected[1];
  var _wiHint = useState5("");
  var wiHint = _wiHint[0];
  var setWiHint = _wiHint[1];
  var _resolved = useState5(null);
  var resolved = _resolved[0];
  var setResolved = _resolved[1];
  var _commits = useState5([]);
  var commits = _commits[0];
  var setCommits = _commits[1];
  var _refs = useState5([]);
  var refs = _refs[0];
  var setRefs = _refs[1];
  var _base = useState5("");
  var baseCommit = _base[0];
  var setBaseCommit = _base[1];
  var _head = useState5("");
  var headCommit = _head[0];
  var setHeadCommit = _head[1];
  var _branchQuery = useState5("");
  var branchQuery = _branchQuery[0];
  var setBranchQuery = _branchQuery[1];
  var _branchPickerOpen = useState5(false);
  var branchPickerOpen = _branchPickerOpen[0];
  var setBranchPickerOpen = _branchPickerOpen[1];
  var _commitListRef = useState5("");
  var commitListRef = _commitListRef[0];
  var setCommitListRef = _commitListRef[1];
  var _report = useState5(null);
  var report = _report[0];
  var setReport = _report[1];
  var _tab = useState5("direct");
  var tab = _tab[0];
  var setTab = _tab[1];
  var MODE_KEY = "tracescope.mode";
  var _mode = useState5(
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
  var _error = useState5("");
  var error = _error[0];
  var setError = _error[1];
  var _busy = useState5(false);
  var busy = _busy[0];
  var setBusy = _busy[1];
  var _busyMessage = useState5("");
  var busyMessage = _busyMessage[0];
  var setBusyMessage = _busyMessage[1];
  var busyRef = useRef2(false);
  var busyMsgRef = useRef2("");
  var _health = useState5("检查中…");
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
  var _authMode = useState5(initialAuthMode);
  var authMode = _authMode[0];
  var setAuthMode = _authMode[1];
  var _authUser = useState5(savedAuth && savedAuth.username || "git");
  var authUser = _authUser[0];
  var setAuthUser = _authUser[1];
  var _authToken = useState5(savedAuth && savedAuth.token || "");
  var authToken = _authToken[0];
  var setAuthToken = _authToken[1];
  var _authKey = useState5(savedAuth && savedAuth.privateKeyPath || "");
  var authKey = _authKey[0];
  var setAuthKey = _authKey[1];
  var _rememberAuth = useState5(true);
  var rememberAuth = _rememberAuth[0];
  var setRememberAuth = _rememberAuth[1];
  var _chatHint = useState5("");
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
  var _jobId = useState5("");
  var jobId = _jobId[0];
  var setJobId = _jobId[1];
  var _jobStatus = useState5("");
  var jobStatus = _jobStatus[0];
  var setJobStatus = _jobStatus[1];
  var _history = useState5([]);
  var history = _history[0];
  var setHistory = _history[1];
  var _historyId = useState5("");
  var historyId = _historyId[0];
  var setHistoryId = _historyId[1];
  var _confirmDlg = useState5(null);
  var confirmDlg = _confirmDlg[0];
  var setConfirmDlg = _confirmDlg[1];
  var pollRef = useRef2(null);
  var skipPairLoadRef = useRef2(false);
  var skipAutoSyncRef = useRef2(false);
  var noteTimersRef = useRef2({});
  var viewingHistoryRef = useRef2(null);
  var reportRef = useRef2(null);
  reportRef.current = report;
  var taskAttachRef = useRef2(null);
  var _taskAttachPath = useState5("");
  var taskAttachPath = _taskAttachPath[0];
  var setTaskAttachPath = _taskAttachPath[1];
  var _authHydrated = useState5(false);
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
  var restoringProfileRef = useRef2(false);
  var pendingTrackerSyncRef = useRef2(false);
  function defaultYxEndpoint() {
    return "https://openapi-rdc.aliyuncs.com";
  }
  function applyRepoProfile(p) {
    restoringProfileRef.current = true;
    pendingTrackerSyncRef.current = true;
    setWiItems([]);
    setWiSelected({});
    setWiHint("");
    setYxCatalogHint("");
    setYxRequestLog("");
    if (!p) {
      setYxOrgs([]);
      setYxProjects([]);
      setYxTypes([]);
      setYxMembers([]);
      setAccessMode("git");
      setAuthMode("none");
      setAuthUser("git");
      setAuthToken("");
      setAuthKey("");
      setRememberAuth(true);
      setTrackerProvider("none");
      setTrackerReady(false);
      setYxEndpoint(defaultYxEndpoint());
      setYxToken("");
      setYxTokenSaved(false);
      setYxOrg("");
      setYxSpace("");
      setYxType("");
      setYxAssignee("");
      setGhToken("");
      setGhOwner("");
      setGhRepo("");
      setGhLabels("bug");
      setGlHost("https://gitlab.com");
      setGlToken("");
      setGlProject("");
      setGlLabels("bug");
      setWhUrl("");
      setWhAuth("");
      return;
    }
    setAccessMode(p.accessMode === "codeup" ? "codeup" : "git");
    var am = p.authMode === "token" || p.authMode === "https" || p.authMode === "ssh" || p.authMode === "none" ? p.authMode : "none";
    setAuthMode(am);
    setAuthUser(p.authUser || "git");
    setAuthToken(p.authToken || "");
    setAuthKey(p.authKey || "");
    setRememberAuth(p.rememberAuth !== false);
    setTrackerProvider(p.trackerProvider || "none");
    setTrackerReady(Boolean(p.trackerReady));
    setYxEndpoint(p.yxEndpoint || defaultYxEndpoint());
    setYxToken(p.yxToken || "");
    setYxTokenSaved(Boolean(p.yxTokenSaved));
    setYxOrg(p.yxOrg || "");
    setYxSpace(p.yxSpace || "");
    setYxType(p.yxType || "");
    setYxAssignee(p.yxAssignee || "");
    setYxOrgs(p.yxOrg ? [{ id: p.yxOrg, name: p.yxOrg }] : []);
    setYxProjects(p.yxSpace ? [{ id: p.yxSpace, name: p.yxSpace }] : []);
    setYxTypes(p.yxType ? [{ id: p.yxType, name: p.yxType }] : []);
    setYxMembers(p.yxAssignee ? [{ id: p.yxAssignee, name: p.yxAssignee }] : []);
    setGhToken(p.ghToken || "");
    setGhOwner(p.ghOwner || "");
    setGhRepo(p.ghRepo || "");
    setGhLabels(p.ghLabels || "bug");
    setGlHost(p.glHost || "https://gitlab.com");
    setGlToken(p.glToken || "");
    setGlProject(p.glProject || "");
    setGlLabels(p.glLabels || "bug");
    setWhUrl(p.whUrl || "");
    setWhAuth(p.whAuth || "");
  }
  function currentRepoProfile() {
    return {
      accessMode: accessMode === "codeup" ? "codeup" : "git",
      authMode,
      authUser,
      authToken,
      authKey,
      rememberAuth,
      trackerProvider,
      trackerReady,
      yxEndpoint,
      yxToken,
      yxTokenSaved,
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
    };
  }
  useEffect4(
    function() {
      var repo = repoPath.trim();
      if (!repo || restoringProfileRef.current) {
        restoringProfileRef.current = false;
        return;
      }
      writeRepoProfile(repo, currentRepoProfile());
    },
    [
      repoPath,
      accessMode,
      authMode,
      authUser,
      authToken,
      authKey,
      rememberAuth,
      trackerProvider,
      trackerReady,
      yxEndpoint,
      yxToken,
      yxTokenSaved,
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
  useEffect4(
    function() {
      if (!pendingTrackerSyncRef.current) return;
      var repo = repoPath.trim();
      if (!repo) {
        pendingTrackerSyncRef.current = false;
        return;
      }
      pendingTrackerSyncRef.current = false;
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
      apiPost("/tracescope/v1/tracker-config-save", payload).catch(function() {
      });
    },
    [
      repoPath,
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
  useEffect4(function() {
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
  useEffect4(function() {
    if (!(isCodeupHttps(repoPath) || accessMode === "codeup")) return;
    if (authMode === "none" || authMode === "https") setRemoteAuthMode("token");
  }, [repoPath, accessMode]);
  useEffect4(function() {
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
  useEffect4(function() {
    if (!authHydrated || !yxHydrated) return;
    if (!(isCodeupHttps(repoPath) || accessMode === "codeup")) return;
    if (authMode === "ssh") return;
    if (yxTokenSaved || usableSecret(yxToken)) return;
    setSettingsOpen(true);
  }, [authHydrated, yxHydrated, repoPath, accessMode, yxToken, yxTokenSaved, authMode]);
  useEffect4(function() {
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
      cleared.ok ? "已取消等待并清空会话输入框草稿，可重新点「AI 智能分析」。" : "已取消等待。清空草稿失败：" + (cleared.error || "未知错误") + "（可手动清空输入框）"
    );
  }
  function applyStoredReport(stored, opts) {
    if (!stored || !stored.report) return;
    setReport(uniquifyReportIds(stored.report));
    setTab("direct");
    setHistoryId(stored.id || "");
    var sourceLabel = stored.source === "model" ? "AI 分析" : "规则分析";
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
          setChatHint("当前版本对比尚无已存清单，请「生成验证清单」或「AI 智能分析」。");
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
      applyRepoProfile(readRepoProfile(next));
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
  useEffect4(function() {
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
        setChatHint("当前版本对比尚无已存清单，请「生成验证清单」或「AI 智能分析」。");
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
  useEffect4(function() {
    refreshHistory();
  }, [refreshHistory]);
  useEffect4(function() {
    return function() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);
  useEffect4(function() {
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
          setChatHint("清单已更新并持久化到本机（来自 AI 分析）");
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
      if (isRemote) {
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
      }
      var effectiveAccessMode = isRemote ? accessMode : "git";
      localStorage.setItem(REPO_PATH_KEY, repoPath.trim());
      localStorage.setItem(ACCESS_MODE_KEY, effectiveAccessMode);
      rememberRepo(repoPath.trim());
      persistAuth();
      if (!beginBusy(effectiveAccessMode === "codeup" ? "正在通过远端 API 读取版本…" : "正在同步仓库版本…")) return;
      apiPost("/tracescope/v1/commits", {
        repoPath: repoPath.trim(),
        limit: 80,
        fetch: forceFetch === false ? false : true,
        refName: opts && opts.refName ? opts.refName : void 0,
        auth: isRemote ? buildAuthPayload() : { mode: "none" },
        accessMode: effectiveAccessMode,
        codeup: effectiveAccessMode === "codeup" ? {
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
  useEffect4(
    function() {
      if (!authHydrated) return;
      if (!repoPath.trim()) return;
      if (mode !== "functional") return;
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
    // Sync when the repo, mode, access mode, or (for the Codeup fallback) token becomes available.
    [authHydrated, repoPath, mode, accessMode, yxToken, yxTokenSaved, authToken, authMode]
  );
  var initialCheckRef = useRef2(false);
  useEffect4(function() {
    if (initialCheckRef.current) return;
    initialCheckRef.current = true;
    var p = (localStorage.getItem(REPO_PATH_KEY) || "").trim();
    if (!p) return;
    if (isGitRemoteInput(p)) return;
    apiGet("/tracescope/v1/path-check", { path: p }).then(function(res) {
      if (res && res.exists && res.isDirectory) return;
      var kept = readRepoList().filter(function(r) {
        return r !== p;
      });
      writeRepoList(kept);
      setRepoList(kept);
      setRepoPath("");
      try {
        localStorage.removeItem(REPO_PATH_KEY);
      } catch (_e) {
      }
      setResolved(null);
      setSettingsOpen(true);
      setChatHint(
        "上次使用的代码文件夹已不存在（可能被移动或删除）：" + p + "。请点「浏览…」重新选择。"
      );
    }).catch(function() {
    });
  }, []);
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
        if (!beginBusy("正在生成验证清单…")) return;
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
            accessMode === "codeup" ? "已通过远端 API 生成直接项清单（无静态波及）。需要 AI 深度分析时点「AI 智能分析」。" : related.length ? "已生成清单（含 " + related.length + " 条关联敏捷任务种子），并保存到本机。" : "已按规则生成清单并保存到本机。需要 AI 深度分析时点「AI 智能分析」。"
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
          message: "当前版本对比已有验证清单。重新生成将覆盖现有清单与勾选进度，且同版本只保留最新一条历史。",
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
        if (!beginBusy("正在准备AI 智能分析…")) return;
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
          var warningPrefix = data.resolved && data.resolved.fetchWarning ? "⚠ " + data.resolved.fetchWarning + "\n" : "";
          var filled = fillComposerDraft(data.prompt || "");
          if (filled.ok) {
            setChatHint(
              warningPrefix + (related.length ? "已把 " + related.length + " 条敏捷任务写入提示。" : "") + "已填入当前会话输入框（任务 ID 见下方，可复制给模型确认）。请核对后发送；Agent publish 后清单会刷新。未发送可再点按钮取消并清空草稿。"
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
          title: "重新发起 AI 智能分析？",
          message: "当前版本对比已有 AI 分析清单。重新发起后，Agent publish 将覆盖现有清单与勾选进度。",
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
        setChatHint("请先生成验证清单，再上传任务附件");
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
        setChatHint("请先生成验证清单，再上传任务附件");
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
        setWiHint("已拉取 " + items2.length + " 条，可多选后生成验证清单");
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
  return jsxs6("div", {
    style: styles.root,
    children: [
      jsx6("style", {
        children: "@keyframes tracescope-spin{to{transform:rotate(360deg)}}"
      }),
      busy ? jsx6("div", {
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
        children: jsxs6("div", {
          style: styles.busyBanner,
          children: [
            jsx6("div", { style: styles.busySpinner, "aria-hidden": "true" }),
            jsx6("div", {
              style: { fontWeight: 700, marginBottom: 6 },
              children: "加载中，请稍候"
            }),
            jsx6("div", {
              style: { color: "#6b645a", fontSize: 12, lineHeight: 1.45 },
              children: busyMessage || "正在处理请求。网络较慢时请勿重复操作，完成前其它按钮已锁定。"
            })
          ]
        })
      }) : null,
      jsxs6("div", {
        style: Object.assign({}, styles.row, {
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8
        }),
        children: [
          jsxs6("div", {
            style: { display: "flex", flexDirection: "column", minWidth: 0, gap: 2 },
            children: [
              jsx6("strong", { children: "TraceScope 测试工作台" }),
              jsx6("span", {
                style: { color: busy ? "#0f6e56" : "#6b645a", fontSize: 12 },
                children: busy ? busyMessage || "处理中…" : health
              })
            ]
          }),
          // Global preferences — compact, independent of the repo/feature cards.
          jsxs6("div", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              flex: "0 0 auto"
            },
            children: [
              jsxs6("label", {
                title: "进入会话时自动展开 TraceScope。关闭后进入会话保持侧栏当前状态、不自动切换，需要时再从右侧栏手动打开。",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  margin: 0,
                  fontSize: 11,
                  color: "#6b645a",
                  cursor: busy ? "default" : "pointer",
                  userSelect: "none"
                },
                children: [
                  jsx6("input", {
                    type: "checkbox",
                    checked: autoOpen,
                    disabled: busy,
                    onChange: function(e) {
                      toggleAutoOpen(e.target.checked);
                    },
                    style: { margin: 0, cursor: busy ? "default" : "pointer" }
                  }),
                  "自动展开"
                ]
              }),
              jsx6("button", {
                type: "button",
                title: "自定义 TraceScope 数据（清单/附件/缓存仓库）的存放目录，可迁移到其他磁盘",
                disabled: busy,
                onClick: function() {
                  toggleDataDir();
                },
                style: dataDirInfo && !dataDirInfo.envLocked || !dataDirInfo ? Object.assign({}, styles.miniBtn, dataDirOpen ? styles.miniBtnActive : null) : Object.assign({}, styles.miniBtn, { opacity: 0.7 }),
                children: "数据目录" + (dataDirInfo ? " · " + formatBytes(dataDirInfo.sizeBytes) : "")
              })
            ]
          })
        ]
      }),
      // Compact data-directory editor (global preference), inline under header.
      dataDirOpen ? jsxs6("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 8,
          marginTop: 2,
          background: "var(--dsh-card, #fffdf8)",
          border: "1px solid var(--dsh-border, #ddd4c5)",
          borderRadius: 10
        },
        children: [
          jsx6("div", {
            style: { fontSize: 12, color: "#5d564c" },
            children: "数据存放目录（更改后会自动把现有清单、附件、缓存仓库迁移过去）"
          }),
          jsxs6("div", {
            style: Object.assign({}, styles.row, { gap: 6 }),
            children: [
              jsx6("div", {
                title: dataDirDraft,
                style: {
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--dsh-border, #ddd4c5)",
                  background: "#fff",
                  color: dataDirDraft ? "var(--dsh-fg, #1c1915)" : "#9b948a",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  direction: "rtl",
                  textAlign: "left"
                },
                children: dataDirDraft || (dataDirInfo ? dataDirInfo.defaultRoot : "点击右侧浏览选择目录")
              }),
              jsx6("button", {
                type: "button",
                style: Object.assign({}, styles.secondary, { flex: "0 0 auto" }),
                disabled: dataDirBusy,
                onClick: openPicker,
                children: "浏览…"
              })
            ]
          }),
          dataDirInfo && dataDirInfo.envLocked ? jsx6("p", {
            style: { margin: 0, color: "#9a6a1f", fontSize: 12 },
            children: "当前目录由环境变量 TRACESCOPE_HOME 指定（" + dataDirInfo.envRoot + "），请修改环境变量后重启，无法在此更改。"
          }) : jsxs6("div", {
            style: Object.assign({}, styles.row, { justifyContent: "flex-end" }),
            children: [
              jsx6("button", {
                type: "button",
                style: styles.secondary,
                disabled: dataDirBusy,
                onClick: function() {
                  setDataDirOpen(false);
                },
                children: "取消"
              }),
              jsx6("button", {
                type: "button",
                style: styles.primary,
                disabled: dataDirBusy,
                onClick: applyDataDir,
                children: dataDirBusy ? "迁移中…" : "更改并迁移"
              })
            ]
          })
        ]
      }) : null,
      // Visual folder picker modal.
      pickerOpen ? jsxs6("div", {
        style: styles.modalBackdrop,
        onClick: function(e) {
          if (e.target === e.currentTarget) closePicker();
        },
        children: jsxs6("div", {
          style: {
            width: "min(440px, 100%)",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            background: "var(--dsh-card, #fffdf8)",
            border: "1px solid var(--dsh-border, #ddd4c5)",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(28,25,21,0.25)",
            overflow: "hidden"
          },
          children: [
            jsxs6("div", {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: [
                jsx6("strong", {
                  style: { fontSize: 13 },
                  children: pickerPurpose === "repo" ? "选择代码文件夹" : "选择数据存放目录"
                }),
                jsx6("button", {
                  type: "button",
                  style: Object.assign({}, styles.miniBtn, { padding: "2px 8px" }),
                  onClick: closePicker,
                  children: "×"
                })
              ]
            }),
            // Quick places.
            pickerBrowse && Array.isArray(pickerBrowse.quick) ? jsx6("div", {
              style: {
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                padding: "8px 12px",
                borderBottom: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: pickerBrowse.quick.map(function(q) {
                return jsx6(
                  "button",
                  {
                    type: "button",
                    style: styles.miniBtn,
                    onClick: function() {
                      browsePath(q.path);
                    },
                    children: q.name
                  },
                  "q-" + q.path
                );
              })
            }) : null,
            // Current path + up navigation.
            jsxs6("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderBottom: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: [
                jsx6("button", {
                  type: "button",
                  style: Object.assign({}, styles.secondary, { padding: "4px 10px" }),
                  // Enabled anywhere except the synthetic volume list itself.
                  disabled: pickerLoading || !pickerBrowse || pickerBrowse.isRoot && pickerBrowse.parent === null,
                  onClick: function() {
                    if (!pickerBrowse) return;
                    if (pickerBrowse.parent !== null) {
                      browsePath(pickerBrowse.parent);
                    } else {
                      browsePath("");
                    }
                  },
                  children: "↑ 上级"
                }),
                jsx6("div", {
                  title: pickerBrowse ? pickerBrowse.path : "",
                  style: {
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    color: "#5d564c",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  children: pickerBrowse ? pickerBrowse.isRoot ? "此电脑 / 磁盘" : pickerBrowse.path : "加载中…"
                })
              ]
            }),
            // Folder list.
            jsx6("div", {
              style: { flex: 1, overflowY: "auto", padding: 6, minHeight: 180 },
              children: pickerLoading ? jsx6("div", {
                style: { padding: 16, textAlign: "center", color: "#8a8378", fontSize: 12 },
                children: "正在读取…"
              }) : pickerBrowse && !pickerBrowse.dirs.length ? jsx6("div", {
                style: { padding: 16, textAlign: "center", color: "#8a8378", fontSize: 12 },
                children: "该目录下没有子文件夹，可直接选择当前目录。"
              }) : (pickerBrowse ? pickerBrowse.dirs : []).map(function(d) {
                var active = pickerSelected === d.path;
                return jsx6(
                  "button",
                  {
                    type: "button",
                    title: active ? "已选中（双击进入）" : "单击选中，双击进入",
                    onClick: function() {
                      setPickerSelected(d.path);
                    },
                    onDoubleClick: function() {
                      browsePath(d.path);
                    },
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 8px",
                      marginBottom: 2,
                      borderRadius: 8,
                      border: "1px solid " + (active ? "var(--dsh-accent,#0f6e56)" : "transparent"),
                      background: active ? "var(--dsh-accent-soft,#efe8da)" : "transparent",
                      cursor: "pointer",
                      fontSize: 12
                    },
                    children: [
                      jsx6("span", {
                        style: { flex: "0 0 auto", color: "#b98f3f" },
                        children: "📁"
                      }),
                      jsx6("span", { style: { flex: 1, minWidth: 0 }, children: d.name })
                    ]
                  },
                  "d-" + d.path
                );
              })
            }),
            // Footer.
            jsxs6("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderTop: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: [
                jsx6("div", {
                  style: {
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    color: "#5d564c",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  title: effectivePickerPath(),
                  children: (function() {
                    var p = effectivePickerPath();
                    return p ? "将使用：" + p : "请进入并选择一个文件夹";
                  })()
                }),
                jsx6("button", {
                  type: "button",
                  style: styles.secondary,
                  disabled: pickerLoading || !pickerBrowse || pickerBrowse.isRoot,
                  onClick: function() {
                    if (pickerBrowse && !pickerBrowse.isRoot) {
                      setPickerSelected(pickerBrowse.path);
                    }
                  },
                  children: "选当前目录"
                }),
                jsx6("button", {
                  type: "button",
                  style: styles.secondary,
                  onClick: closePicker,
                  children: "取消"
                }),
                jsx6("button", {
                  type: "button",
                  style: styles.primary,
                  onClick: confirmPicker,
                  children: "确定"
                })
              ]
            })
          ]
        })
      }) : null,
      // Top-level mode switch — always reachable, before/after repo setup.
      jsxs6("div", {
        style: {
          display: "flex",
          gap: 6,
          background: "var(--dsh-card,#fffdf8)",
          border: "1px solid var(--dsh-border,#ddd4c5)",
          borderRadius: 999,
          padding: 4
        },
        children: [
          jsx6("button", {
            type: "button",
            style: mode === "functional" ? Object.assign({}, styles.primary, { flex: 1 }) : Object.assign({}, styles.secondary, { flex: 1 }),
            disabled: busy,
            onClick: function() {
              switchMode("functional");
            },
            children: "功能影响分析"
          }),
          jsx6("button", {
            type: "button",
            style: mode === "ui" ? Object.assign({}, styles.primary, { flex: 1 }) : Object.assign({}, styles.secondary, { flex: 1 }),
            disabled: busy,
            onClick: function() {
              switchMode("ui");
            },
            children: "UI 设计对比"
          })
        ]
      }),
      jsxs6("section", {
        style: styles.card,
        children: [
          jsxs6("div", {
            style: Object.assign({}, styles.row, { justifyContent: "space-between" }),
            children: [
              jsxs6("div", {
                style: Object.assign({}, styles.row, { flex: 1, minWidth: 0 }),
                children: [
                  jsx6("span", {
                    style: { fontWeight: 700, whiteSpace: "nowrap" },
                    children: "仓库"
                  }),
                  jsx6("select", {
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
                      jsx6(
                        "option",
                        {
                          value: "",
                          children: repoPath.trim() ? "当前：" + shortRepoLabel(repoPath) : "选择仓库 / 先在配置中添加"
                        },
                        "repo-empty"
                      )
                    ].concat(
                      (repoList || []).map(function(r) {
                        return jsx6(
                          "option",
                          { value: r, children: shortRepoLabel(r) + " — " + r },
                          r
                        );
                      })
                    )
                  })
                ]
              }),
              jsx6("button", {
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
          !settingsOpen && repoPath.trim() ? jsx6("p", {
            style: { margin: "6px 0 0", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
            children: shortRepoLabel(repoPath) + (resolved ? " · " + (resolved.source === "codeup" ? "远端 API" : resolved.source === "remote" ? "远端缓存" : "本地") + (resolved.authMode && resolved.authMode !== "none" ? " · 认证 " + (authMode === "token" ? "个人访问令牌" : resolved.authMode) : authMode === "token" ? " · 认证 个人访问令牌" : "") + (authMode === "token" && (yxTokenSaved || usableSecret(yxToken)) ? " · 令牌已保存" : authMode === "token" ? " · 请填写个人访问令牌" : "") : "")
          }) : null,
          settingsOpen ? jsxs6("div", {
            style: {
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid var(--dsh-border, #ddd4c5)"
            },
            children: [
              jsxs6("label", {
                style: styles.label,
                children: [
                  mode === "ui" ? "代码文件夹路径 / 远端代码库地址" : "本地文件夹路径 / 远端仓库地址",
                  jsxs6("div", {
                    style: Object.assign({}, styles.row, { alignItems: "stretch" }),
                    children: [
                      jsx6("input", {
                        style: Object.assign({}, styles.input, { flex: 1, marginBottom: 0 }),
                        value: repoPath,
                        disabled: busy,
                        placeholder: mode === "ui" ? "普通代码文件夹即可（无需 git），或 https://…" : "本地项目文件夹，或 https://github.com/org/repo.git",
                        onChange: function(e) {
                          setRepoPath(e.target.value);
                        },
                        onBlur: function() {
                          if (repoPath.trim()) rememberRepo(repoPath.trim());
                        }
                      }),
                      jsx6("button", {
                        type: "button",
                        style: styles.btn,
                        disabled: busy,
                        onClick: openRepoPicker,
                        children: "浏览…"
                      })
                    ]
                  }),
                  jsx6("span", {
                    style: { display: "block", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                    children: mode === "ui" ? "UI 对比直接读取本地代码，普通文件夹即可、无需是 git 仓库；只有填远端地址时才需要认证。" : "支持 Windows / macOS / Linux 路径，直接粘贴本机项目文件夹即可；填远端地址时才会出现认证选项。"
                  })
                ]
              }),
              mode === "functional" && isRemote ? jsxs6("label", {
                style: styles.label,
                children: [
                  "读取方式",
                  jsx6("select", {
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
                      jsx6("option", { value: "git", children: "本地 Git（推荐）" }, "mode-git"),
                      jsx6("option", {
                        value: "codeup",
                        children: "远端 API 兜底（无本机 Git）"
                      }, "mode-codeup")
                    ]
                  }),
                  jsx6("span", {
                    style: { display: "block", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                    children: accessMode === "codeup" ? "不克隆仓库，改用宿主提供的代码接口拉提交和 diff（当前支持云效 Codeup）。适合本机 Git 不可用时。静态波及仍需要本地 Git。" : "同步远端时只保存 git 对象，不再检出整棵源码。已有的工作区缓存仍可继续用。"
                  })
                ]
              }) : null,
              jsxs6("div", {
                style: Object.assign({}, styles.row, { marginBottom: 8 }),
                children: [
                  mode === "functional" ? jsx6("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy || !repoPath.trim(),
                    onClick: function() {
                      rememberRepo(repoPath.trim());
                      loadCommits(true);
                      setSettingsOpen(false);
                    },
                    children: "保存并加载版本"
                  }) : jsx6("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy || !repoPath.trim(),
                    onClick: function() {
                      if (!repoPath.trim()) return;
                      var chosen = repoPath.trim();
                      rememberRepo(chosen);
                      try {
                        localStorage.setItem(REPO_PATH_KEY, chosen);
                      } catch (_e) {
                      }
                      setSettingsOpen(false);
                    },
                    children: isRemote ? "使用此代码库" : "使用此文件夹"
                  }),
                  repoPath.trim() && repoList.indexOf(repoPath.trim()) !== -1 ? jsx6("button", {
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
              // Local folders need no credentials; show a compact, neutral note.
              !isRemote ? jsx6("p", {
                style: { margin: "0 0 4px", color: "#0f6e56", fontSize: 12, lineHeight: 1.45 },
                children: "本地文件夹：直接读取，无需填写认证。"
              }) : null,
              isRemote && jsxs6("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8
                },
                children: [
                  jsxs6("label", {
                    style: styles.label,
                    children: [
                      "远端认证",
                      jsx6("select", {
                        style: styles.input,
                        value: authMode,
                        onChange: function(e) {
                          setRemoteAuthMode(e.target.value);
                        },
                        children: [
                          jsx6("option", { value: "none", children: "无需认证" }),
                          jsx6("option", {
                            value: "token",
                            children: "个人访问令牌"
                          }),
                          jsx6("option", {
                            value: "https",
                            children: "HTTPS 用户名 + 密码/Token"
                          }),
                          jsx6("option", { value: "ssh", children: "SSH 私钥" })
                        ]
                      })
                    ]
                  }),
                  authMode === "https" ? jsxs6("label", {
                    style: styles.label,
                    children: [
                      "用户名",
                      jsx6("input", {
                        style: styles.input,
                        value: authUser,
                        onChange: function(e) {
                          setAuthUser(e.target.value);
                        }
                      })
                    ]
                  }) : jsx6("div", { children: null })
                ]
              }),
              isRemote && authMode === "token" ? jsxs6("label", {
                style: styles.label,
                children: [
                  "个人访问令牌",
                  jsx6("input", {
                    style: styles.input,
                    type: "password",
                    value: yxToken,
                    disabled: busy,
                    placeholder: yxTokenSaved ? "已保存在本机，留空则继续使用" : "粘贴 PAT / 个人访问令牌即可",
                    onChange: function(e) {
                      setYxToken(e.target.value);
                    }
                  }),
                  jsx6("span", {
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
              isRemote && authMode === "https" ? jsxs6("label", {
                style: styles.label,
                children: [
                  "密码 / Token",
                  jsx6("input", {
                    style: styles.input,
                    type: "password",
                    value: authToken,
                    placeholder: "与上方用户名配套的密码或 Token",
                    onChange: function(e) {
                      setAuthToken(e.target.value);
                    }
                  }),
                  jsx6("span", {
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
              isRemote && authMode === "ssh" ? jsxs6("label", {
                style: styles.label,
                children: [
                  "私钥绝对路径",
                  jsx6("input", {
                    style: styles.input,
                    value: authKey,
                    placeholder: "本机 SSH 私钥文件路径，如 ~/.ssh/id_ed25519",
                    onChange: function(e) {
                      setAuthKey(e.target.value);
                    }
                  })
                ]
              }) : null,
              isRemote && authMode !== "none" ? jsxs6("label", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 500,
                  marginTop: 4
                },
                children: [
                  jsx6("input", {
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
                return jsxs6(jsxRuntime.Fragment, {
                  children: [
                    jsx6("div", {
                      style: {
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px solid var(--dsh-border, #ddd4c5)",
                        fontWeight: 700
                      },
                      children: "协作平台"
                    }),
                    jsx6("p", {
                      style: { margin: "4px 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                      children: "关联工作项、提交失败反馈。可选云效 / GitHub / GitLab / Webhook。选云效时令牌可与上方「个人访问令牌」共用。"
                    }),
                    jsxs6("label", {
                      style: styles.label,
                      children: [
                        "平台",
                        jsx6("select", {
                          style: styles.input,
                          value: trackerProvider,
                          onChange: function(e) {
                            setTrackerProvider(e.target.value);
                          },
                          children: [
                            jsx6("option", { value: "none", children: "不启用" }),
                            jsx6("option", { value: "yunxiao", children: "阿里云效" }),
                            jsx6("option", { value: "github", children: "GitHub Issues" }),
                            jsx6("option", { value: "gitlab", children: "GitLab Issues" }),
                            jsx6("option", { value: "webhook", children: "通用 Webhook" })
                          ]
                        })
                      ]
                    }),
                    trackerProvider === "yunxiao" ? jsxs6("div", {
                      children: [
                        jsx6("p", {
                          style: {
                            margin: "0 0 8px",
                            color: "#6b645a",
                            fontSize: 12,
                            lineHeight: 1.4
                          },
                          children: "访问令牌与上方「个人访问令牌」共用。填好后点「拉取企业」，再依次选择企业 / 项目 / 缺陷类型 / 负责人。"
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "API Endpoint（一般不用改）",
                            jsx6("input", {
                              style: styles.input,
                              value: yxEndpoint,
                              onChange: function(e) {
                                setYxEndpoint(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs6("div", {
                          style: Object.assign({}, styles.row, { alignItems: "flex-end" }),
                          children: [
                            jsxs6("label", {
                              style: Object.assign({}, styles.label, {
                                flex: 1,
                                marginBottom: 0
                              }),
                              children: [
                                "访问令牌",
                                jsx6("input", {
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
                            jsx6("button", {
                              type: "button",
                              style: styles.primary,
                              disabled: busy || !usableSecret(yxToken) && !yxTokenSaved,
                              onClick: refreshYunxiaoOrgs,
                              children: "拉取企业"
                            })
                          ]
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "企业 organizationId",
                            jsx6("select", {
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
                                jsx6(
                                  "option",
                                  {
                                    value: "",
                                    children: yxOrgs.length ? "请选择企业" : "先点「拉取企业」"
                                  },
                                  "yx-org-empty"
                                )
                              ].concat(
                                (yxOrgs || []).map(function(o) {
                                  return jsx6(
                                    "option",
                                    { value: o.id, children: o.name + "（" + o.id + "）" },
                                    o.id
                                  );
                                })
                              )
                            })
                          ]
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "项目 spaceId",
                            jsx6("select", {
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
                                jsx6(
                                  "option",
                                  {
                                    value: "",
                                    children: yxProjects.length ? "请选择项目" : yxOrg ? "加载中或暂无项目" : "先选择企业"
                                  },
                                  "yx-space-empty"
                                )
                              ].concat(
                                (yxProjects || []).map(function(o) {
                                  return jsx6(
                                    "option",
                                    { value: o.id, children: o.name + "（" + o.id + "）" },
                                    o.id
                                  );
                                })
                              )
                            })
                          ]
                        }),
                        jsxs6("div", {
                          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                          children: [
                            jsxs6("label", {
                              style: styles.label,
                              children: [
                                "缺陷类型 workitemTypeId",
                                jsx6("select", {
                                  style: styles.input,
                                  value: yxType,
                                  disabled: busy || !yxSpace,
                                  onChange: function(e) {
                                    setYxType(e.target.value);
                                  },
                                  children: [
                                    jsx6(
                                      "option",
                                      {
                                        value: "",
                                        children: yxTypes.length ? "请选择缺陷类型" : yxSpace ? "加载中或暂无类型" : "先选择项目"
                                      },
                                      "yx-type-empty"
                                    )
                                  ].concat(
                                    (yxTypes || []).map(function(o) {
                                      return jsx6(
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
                            jsxs6("label", {
                              style: styles.label,
                              children: [
                                "负责人 assignedTo",
                                jsx6("select", {
                                  style: styles.input,
                                  value: yxAssignee,
                                  disabled: busy || !yxOrg,
                                  onChange: function(e) {
                                    setYxAssignee(e.target.value);
                                  },
                                  children: [
                                    jsx6(
                                      "option",
                                      {
                                        value: "",
                                        children: yxMembers.length ? "请选择负责人" : yxOrg ? "加载中或暂无成员" : "先选择企业"
                                      },
                                      "yx-member-empty"
                                    )
                                  ].concat(
                                    (yxMembers || []).map(function(o) {
                                      return jsx6(
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
                        yxCatalogHint ? jsx6("p", {
                          style: {
                            margin: "4px 0 0",
                            color: "#6b645a",
                            fontSize: 12
                          },
                          children: yxCatalogHint
                        }) : null,
                        jsxs6("div", {
                          style: {
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px dashed #ddd6cb"
                          },
                          children: [
                            jsxs6("label", {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                color: "#6b645a",
                                cursor: "pointer"
                              },
                              children: [
                                jsx6("input", {
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
                            yxDebugLog ? jsxs6("div", {
                              style: { marginTop: 6 },
                              children: [
                                jsxs6("div", {
                                  style: {
                                    display: "flex",
                                    gap: 6,
                                    marginBottom: 4
                                  },
                                  children: [
                                    jsx6("button", {
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
                                    jsx6("button", {
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
                                jsx6("textarea", {
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
                    trackerProvider === "github" ? jsxs6("div", {
                      children: [
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "GitHub Token",
                            jsx6("input", {
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
                        jsxs6("div", {
                          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                          children: [
                            jsxs6("label", {
                              style: styles.label,
                              children: [
                                "owner",
                                jsx6("input", {
                                  style: styles.input,
                                  value: ghOwner,
                                  onChange: function(e) {
                                    setGhOwner(e.target.value);
                                  }
                                })
                              ]
                            }),
                            jsxs6("label", {
                              style: styles.label,
                              children: [
                                "repo",
                                jsx6("input", {
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
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "labels（逗号分隔）",
                            jsx6("input", {
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
                    trackerProvider === "gitlab" ? jsxs6("div", {
                      children: [
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "GitLab Host",
                            jsx6("input", {
                              style: styles.input,
                              value: glHost,
                              onChange: function(e) {
                                setGlHost(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "Private Token",
                            jsx6("input", {
                              style: styles.input,
                              type: "password",
                              value: glToken,
                              onChange: function(e) {
                                setGlToken(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "projectId（数字或 group/project）",
                            jsx6("input", {
                              style: styles.input,
                              value: glProject,
                              onChange: function(e) {
                                setGlProject(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "labels（逗号分隔）",
                            jsx6("input", {
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
                    trackerProvider === "webhook" ? jsxs6("div", {
                      children: [
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "Webhook URL",
                            jsx6("input", {
                              style: styles.input,
                              value: whUrl,
                              placeholder: "https://… 可对接 Jira / 飞书 / 自建服务",
                              onChange: function(e) {
                                setWhUrl(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs6("label", {
                          style: styles.label,
                          children: [
                            "Authorization 头（可选）",
                            jsx6("input", {
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
                    trackerProvider !== "none" ? jsx6("button", {
                      type: "button",
                      style: Object.assign({}, styles.btn, { marginTop: 4 }),
                      disabled: busy,
                      onClick: saveTrackerSettings,
                      children: trackerReady ? "保存平台配置（已就绪）" : "保存平台配置"
                    }) : jsx6("button", {
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
            return jsxs6(jsxRuntime.Fragment, {
              children: [
                trackerProvider === "yunxiao" && yxOrg && yxSpace ? jsxs6("div", {
                  style: {
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "#f7f4ee",
                    borderRadius: 8,
                    border: "1px solid var(--dsh-border, #ddd4c5)"
                  },
                  children: [
                    jsx6("div", {
                      style: { fontWeight: 600, marginBottom: 6 },
                      children: "关联敏捷任务（可选，多选）"
                    }),
                    jsx6("p", {
                      style: { margin: "0 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                      children: "勾选工作项类型后拉取任务，再多选任务。生成验证清单 / AI 智能分析时会把它们写入清单与提示。"
                    }),
                    jsxs6("div", {
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
                        return jsxs6(
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
                              jsx6("input", {
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
                    jsxs6("div", {
                      style: Object.assign({}, styles.row, { marginBottom: 6 }),
                      children: [
                        jsx6("button", {
                          type: "button",
                          style: styles.primary,
                          disabled: busy,
                          onClick: refreshAgileWorkitems,
                          children: "拉取任务"
                        }),
                        jsx6("button", {
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
                        jsx6("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy || !Object.keys(wiSelected).length,
                          onClick: function() {
                            setWiSelected({});
                          },
                          children: "清空选择"
                        }),
                        jsx6("span", {
                          style: { color: "#6b645a", fontSize: 12 },
                          children: "已选 " + Object.keys(wiSelected).filter(function(k) {
                            return wiSelected[k];
                          }).length + " / " + (wiItems || []).length
                        })
                      ]
                    }),
                    wiHint ? jsx6("p", {
                      style: { margin: "0 0 6px", color: "#6b645a", fontSize: 12 },
                      children: wiHint
                    }) : null,
                    wiItems.length ? jsx6("div", {
                      style: {
                        maxHeight: 180,
                        overflow: "auto",
                        border: "1px solid var(--dsh-border, #e5ddd0)",
                        borderRadius: 6,
                        background: "#fff",
                        padding: "4px 0"
                      },
                      children: wiItems.map(function(it) {
                        return jsxs6(
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
                              jsx6("input", {
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
                              jsxs6("span", {
                                style: { flex: 1, minWidth: 0 },
                                children: [
                                  jsx6("span", {
                                    style: {
                                      display: "inline-block",
                                      fontSize: 11,
                                      color: "#8a7f70",
                                      marginRight: 6
                                    },
                                    children: it.category || "WorkItem"
                                  }),
                                  jsx6("span", { children: it.subject }),
                                  it.status ? jsx6("span", {
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
                jsxs6("div", {
                  style: Object.assign({}, styles.row, { marginTop: 10 }),
                  children: [
                    jsx6("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !repoPath.trim(),
                      onClick: function() {
                        loadCommits(true);
                      },
                      children: "同步版本"
                    }),
                    jsx6("button", {
                      type: "button",
                      style: styles.primary,
                      disabled: busy || !baseCommit || !headCommit,
                      onClick: analyze,
                      children: "生成验证清单"
                    }),
                    jsx6("button", {
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
                      children: jobId && jobStatus === "pending" ? "取消等待并清空草稿" : "AI 智能分析"
                    }),
                    jsx6("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !baseCommit || !headCommit,
                      onClick: refreshStoredReport,
                      children: "刷新清单"
                    })
                  ]
                }),
                jobId ? jsxs6("div", {
                  style: Object.assign({}, styles.row, {
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "#faf7f0",
                    borderRadius: 8,
                    border: "1px solid var(--dsh-border, #ddd4c5)"
                  }),
                  children: [
                    jsx6("span", {
                      style: { fontWeight: 600, whiteSpace: "nowrap" },
                      children: "对话任务 ID"
                    }),
                    jsx6("code", {
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
                    jsx6("button", {
                      type: "button",
                      style: styles.btn,
                      onClick: function() {
                        copyText(jobId, "任务 ID");
                      },
                      children: "复制"
                    }),
                    jsx6("span", {
                      style: { color: "#6b645a", fontSize: 12 },
                      children: jobStatus === "pending" ? "等待 publish" : jobStatus === "published" ? "已发布" : jobStatus || ""
                    })
                  ]
                }) : null,
                jsxs6("div", {
                  style: Object.assign({}, styles.row, { marginTop: 8, alignItems: "flex-end" }),
                  children: [
                    jsxs6("label", {
                      style: Object.assign({}, styles.label, { flex: 1, marginBottom: 0, minWidth: 180 }),
                      children: [
                        "历史任务（多仓库）",
                        jsx6("select", {
                          style: styles.input,
                          value: historyId,
                          disabled: busy || !history.length,
                          onChange: function(e) {
                            var id = e.target.value;
                            setHistoryId(id);
                            if (id) openHistoryEntry(id);
                          },
                          children: [
                            jsx6(
                              "option",
                              {
                                value: "",
                                children: history.length ? "选择历史（含各仓库；同版本仅最新）" : "暂无历史"
                              },
                              "hist-empty"
                            )
                          ].concat(
                            (history || []).map(function(h) {
                              var label = shortRepoLabel(h.repoInput) + " · " + (h.savedAt || "").replace("T", " ").slice(0, 16) + " · " + (h.source === "model" ? "AI" : "规则") + " · " + shortSha(h.baseCommit) + "→" + shortSha(h.headCommit);
                              return jsx6("option", { value: h.id, children: label }, h.id);
                            })
                          )
                        })
                      ]
                    }),
                    jsx6("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !historyId,
                      onClick: function() {
                        copyText(historyId, "历史 ID");
                      },
                      children: "复制历史 ID"
                    }),
                    jsx6("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !historyId,
                      onClick: deleteSelectedHistory,
                      children: "删除"
                    })
                  ]
                }),
                copyFlash ? jsx6("p", {
                  style: { color: "#0f6e56", margin: "6px 0 0", fontSize: 12 },
                  children: copyFlash
                }) : null,
                chatHint ? jsx6("p", {
                  style: { color: "#6b645a", margin: "8px 0 0", fontSize: 12, lineHeight: 1.45 },
                  children: chatHint
                }) : null,
                jsxs6("div", {
                  style: { marginTop: 8 },
                  children: [
                    jsxs6("div", {
                      style: Object.assign({}, styles.row, {
                        marginBottom: 0,
                        alignItems: "center",
                        gap: 8
                      }),
                      children: [
                        jsx6("button", {
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
                        !branchPickerOpen ? jsx6("span", {
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
                    branchPickerOpen ? jsxs6("div", {
                      style: { marginTop: 6 },
                      children: [
                        jsx6("input", {
                          style: styles.input,
                          value: branchQuery,
                          disabled: busy || !(refs && refs.length),
                          placeholder: refs && refs.length ? "输入分支名筛选；列表按最新提交时间排序" : "先同步版本",
                          onChange: function(e) {
                            setBranchQuery(e.target.value);
                          }
                        }),
                        jsx6("div", {
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
                              return jsx6("div", {
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
                              return jsxs6(
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
                                    jsxs6("div", {
                                      style: {
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: 12,
                                        lineHeight: 1.35
                                      },
                                      title: r.name + (r.subject ? "\n" + r.subject : "") + (r.date ? "\n" + r.date : ""),
                                      children: [
                                        jsxs6("div", {
                                          style: { wordBreak: "break-all" },
                                          children: [
                                            (r.kind === "remote" ? "远端 " : "") + r.name,
                                            r.short ? jsx6("span", {
                                              style: { color: "#8a7f70" },
                                              children: " · " + r.short
                                            }) : null,
                                            isNewest ? jsx6("span", {
                                              style: Object.assign({}, styles.badge, {
                                                marginLeft: 6,
                                                background: "#dbeafe",
                                                color: "#1d4ed8"
                                              }),
                                              children: "最新"
                                            }) : null
                                          ]
                                        }),
                                        r.date || r.subject ? jsx6("div", {
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
                                    jsx6("button", {
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
                                    jsx6("button", {
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
                        branchQuery && matchingBranches(refs, branchQuery).length > 40 ? jsx6("div", {
                          style: { color: "#6b645a", fontSize: 11, marginTop: 4 },
                          children: "匹配超过 40 个，请再输入几个字缩小范围"
                        }) : !branchQuery && matchingBranches(refs, "").length > 40 ? jsx6("div", {
                          style: { color: "#6b645a", fontSize: 11, marginTop: 4 },
                          children: "分支较多，输入名称筛选。列表先显示前 40 个"
                        }) : null
                      ]
                    }) : null
                  ]
                }),
                jsxs6("div", {
                  style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 },
                  children: [
                    jsxs6("label", {
                      style: styles.label,
                      children: [
                        "稳定版本",
                        jsx6(
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
                    jsxs6("label", {
                      style: styles.label,
                      children: [
                        "待测版本",
                        jsx6(
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
          error ? jsx6("p", { style: styles.error, children: error }) : null
        ]
      }),
      mode === "functional" && report ? jsxs6("section", {
        style: styles.card,
        children: [
          jsx6("div", {
            style: { marginBottom: 8, color: "#6b645a" },
            children: "变更文件 " + (report.changedFiles || []).length + " · 直接 " + (report.direct || []).length + " · 波及 " + (report.ripple || []).length + " · " + (report.modelEnriched ? "AI 分析" : "规则分析")
          }),
          jsx6("p", {
            style: { margin: "0 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.45 },
            children: "验证时点右侧按钮记录结果。标记「失败」后可填写备注，便于复制反馈给开发。结果会写入本机。"
          }),
          jsxs6("div", {
            style: Object.assign({}, styles.row, {
              marginBottom: 8,
              justifyContent: "space-between",
              alignItems: "center"
            }),
            children: [
              jsx6("div", {
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
              jsxs6("div", {
                style: {
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  flex: "0 0 auto"
                },
                children: [
                  jsx6("button", {
                    type: "button",
                    style: styles.btn,
                    onClick: copyFailFeedback,
                    children: "复制失败反馈"
                  }),
                  jsx6("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy,
                    onClick: submitTracker,
                    children: "提交缺陷"
                  }),
                  jsx6("button", {
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
          jsxs6("div", {
            style: {
              marginBottom: 10,
              padding: "10px 12px",
              background: "#f7f4ee",
              borderRadius: 8,
              border: "1px solid var(--dsh-border, #ddd4c5)"
            },
            children: [
              jsx6("div", {
                style: { fontWeight: 600, marginBottom: 4 },
                children: "任务附件（整份验证任务）"
              }),
              jsx6("p", {
                style: {
                  margin: "0 0 8px",
                  color: "#6b645a",
                  fontSize: 12,
                  lineHeight: 1.4
                },
                children: "可上传视频录像、文档等。附件属于当前版本对比任务，不绑定单条 checklist。小文件可直接选择；大视频建议填本机绝对路径。"
              }),
              jsxs6("div", {
                style: Object.assign({}, styles.row, {
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8
                }),
                children: [
                  jsx6("input", {
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
                  jsx6("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy,
                    onClick: function() {
                      if (taskAttachRef.current) taskAttachRef.current.click();
                    },
                    children: "选择文件"
                  }),
                  jsx6("input", {
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
                  jsx6("button", {
                    type: "button",
                    style: styles.btn,
                    disabled: busy || !taskAttachPath.trim(),
                    onClick: uploadTaskLocalPath,
                    children: "从路径添加"
                  }),
                  jsx6("span", {
                    style: { fontSize: 12, color: "#6b645a" },
                    children: "已附 " + (report.attachments && report.attachments.length || 0) + "/8"
                  })
                ]
              }),
              report.attachments && report.attachments.length ? jsx6("div", {
                style: { display: "flex", flexDirection: "column", gap: 6 },
                children: report.attachments.map(function(att) {
                  return jsxs6(
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
                        jsxs6("div", {
                          style: { flex: 1, minWidth: 0 },
                          children: [
                            jsx6("div", {
                              style: {
                                fontWeight: 600,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              },
                              title: att.name,
                              children: att.name
                            }),
                            jsx6("div", {
                              style: { fontSize: 11, color: "#8a7f70" },
                              children: (att.mime || "file") + " · " + formatBytes(att.size || 0)
                            })
                          ]
                        }),
                        jsx6("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy,
                          onClick: function() {
                            downloadTaskAttachment(att);
                          },
                          children: "下载"
                        }),
                        jsx6("button", {
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
              }) : jsx6("p", {
                style: { margin: 0, fontSize: 12, color: "#9a9185" },
                children: "暂无任务附件"
              })
            ]
          }),
          jsxs6("div", {
            style: styles.row,
            children: [
              jsx6("button", {
                type: "button",
                style: Object.assign({}, styles.btn, tab === "direct" ? { fontWeight: 700 } : null),
                disabled: busy,
                onClick: function() {
                  if (busy) return;
                  setTab("direct");
                },
                children: "直接项"
              }),
              jsx6("button", {
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
            return jsx6(
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
          }) : jsx6("p", { style: { color: "#6b645a" }, children: "这一类没有条目" })
        ]
      }) : null,
      mode === "ui" ? jsx6(VisualComparePanel2, {
        repoInput: repoPath.trim(),
        auth: buildAuthPayload()
      }) : null,
      confirmDlg ? jsxs6("div", {
        style: styles.modalBackdrop,
        role: "dialog",
        "aria-modal": "true",
        onClick: function() {
          setConfirmDlg(null);
        },
        children: [
          jsxs6("div", {
            style: Object.assign({}, styles.modalCard, { width: "min(480px, 100%)" }),
            onClick: function(e) {
              e.stopPropagation();
            },
            children: [
              jsx6("div", {
                style: { fontWeight: 700, fontSize: 15, marginBottom: 8 },
                children: confirmDlg.title || "请确认"
              }),
              jsx6("p", {
                style: { margin: "0 0 12px", lineHeight: 1.5, color: "#4a453e" },
                children: confirmDlg.message
              }),
              confirmDlg.inputLabel ? jsxs6("label", {
                style: Object.assign({}, styles.label, { marginBottom: 14 }),
                children: [
                  confirmDlg.inputLabel,
                  jsx6("input", {
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
              jsxs6("div", {
                style: Object.assign({}, styles.row, { justifyContent: "flex-end" }),
                children: [
                  jsx6("button", {
                    type: "button",
                    style: styles.btn,
                    onClick: function() {
                      setConfirmDlg(null);
                    },
                    children: "取消"
                  }),
                  jsx6("button", {
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
function getSidebarRight() {
  return hostCtx && (hostCtx.sidebarRight || hostCtx.get && hostCtx.get("sidebarRight"));
}
function openTraceScopeTabWhenReady(onStopped) {
  var cancelled = false;
  var timer = null;
  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function schedule(delay) {
    clearTimer();
    timer = setTimeout(run, delay);
  }
  function finish() {
    if (cancelled) return;
    cancelled = true;
    clearTimer();
    if (typeof onStopped === "function") onStopped();
  }
  function run() {
    if (cancelled) return;
    var side = getSidebarRight();
    if (!side || typeof side.openTab !== "function") {
      schedule(150);
      return;
    }
    try {
      side.openTab(KIND);
      finish();
    } catch (_err) {
      schedule(200);
    }
  }
  run();
  return function cancel() {
    finish();
  };
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
            return "对比版本、验证清单与 AI 智能分析（新建会话后也可从右侧栏打开）";
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
    var cancelCurrent = null;
    function reconcile() {
      try {
        if (!isAutoOpenEnabled()) {
          if (cancelCurrent) {
            cancelCurrent();
            cancelCurrent = null;
          }
          return;
        }
        var snap = sessions.list.getSnapshot();
        var ids = snap && snap.ids;
        var hasSessions = Array.isArray(ids) && ids.length > 0;
        if (hasSessions && !cancelCurrent) {
          cancelCurrent = openTraceScopeTabWhenReady(function onOpened() {
            cancelCurrent = null;
          });
        }
      } catch (_e) {
      }
    }
    reconcile();
    var unsubscribe = sessions.list.subscribe(reconcile);
    return function dispose() {
      unsubscribe();
      if (cancelCurrent) {
        cancelCurrent();
        cancelCurrent = null;
      }
    };
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
          return jsx6("span", { children: "TraceScope" });
        }
      );
    });
  }, "tracescope sidebar title");
}
__tracescopeExports.name = name;
__tracescopeExports.inject = inject;
__tracescopeExports.apply = apply;

    return __tracescopeExports
  },
})
