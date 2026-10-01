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

// client-src/visual/thumb-queue.ts
function pump() {
  while (active < MAX_CONCURRENCY) {
    const next = pending.shift();
    if (!next) return;
    active += 1;
    next();
  }
}
function release() {
  active -= 1;
  pump();
}
function enqueue(task) {
  return new Promise((resolve, reject) => {
    pending.push(() => {
      task().then(
        (value) => {
          release();
          resolve(value);
        },
        (err) => {
          release();
          reject(err);
        }
      );
    });
    pump();
  });
}
async function queueThumbnail(task) {
  let lastError;
  for (let tryIndex = 0; tryIndex < MAX_TRIES; tryIndex += 1) {
    try {
      return await enqueue(task);
    } catch (err) {
      lastError = err;
      if (tryIndex < MAX_TRIES - 1) {
        await sleep(400 * 2 ** tryIndex + Math.floor(Math.random() * 200));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
function isLanhuDesignUrl(url) {
  return /lanhuapp\.com|lanhu\.woa\.com/i.test(url);
}
function normalizeNodeId(designUrl, nodeId) {
  if (isLanhuDesignUrl(designUrl)) return nodeId.trim();
  return nodeId.trim().replace(/-/g, ":");
}
function cacheKey(figmaUrl, figmaToken, nodeId) {
  return `${figmaToken.slice(0, 12)}|${figmaUrl}|${normalizeNodeId(figmaUrl, nodeId)}`;
}
async function postThumbnails(figmaUrl, figmaToken, nodeIds) {
  const r = await fetch("/tracescope/v1/page-thumbnails", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ figmaUrl, figmaToken, nodeIds })
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(data.error || "缩略图批量请求失败");
  return data.urls || {};
}
function flushBucket(bucket) {
  if (openBucket === bucket) openBucket = null;
  if (bucket.timer) {
    clearTimeout(bucket.timer);
    bucket.timer = null;
  }
  const waiters = bucket.waiters.splice(0);
  if (!waiters.length) return;
  const nodeIds = [...new Set(waiters.map((w) => normalizeNodeId(bucket.figmaUrl, w.nodeId)))];
  void queueThumbnail(() => postThumbnails(bucket.figmaUrl, bucket.figmaToken, nodeIds)).then((urls) => {
    for (const w of waiters) {
      const normalized = normalizeNodeId(bucket.figmaUrl, w.nodeId);
      const url = urls[normalized] || urls[w.nodeId];
      if (url) urlCache.set(w.cacheKey, url);
      w.resolve(url);
    }
  }).catch((err) => {
    for (const w of waiters) w.reject(err);
  });
}
function requestPageThumbnail(opts) {
  const key = cacheKey(opts.figmaUrl, opts.figmaToken, opts.nodeId);
  const cached = urlCache.get(key);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    if (openBucket && (openBucket.figmaUrl !== opts.figmaUrl || openBucket.figmaToken !== opts.figmaToken)) {
      flushBucket(openBucket);
    }
    if (!openBucket) {
      openBucket = {
        figmaUrl: opts.figmaUrl,
        figmaToken: opts.figmaToken,
        waiters: [],
        timer: null
      };
    }
    openBucket.waiters.push({
      nodeId: opts.nodeId,
      resolve,
      reject,
      cacheKey: key
    });
    if (!openBucket.timer) {
      const bucket = openBucket;
      openBucket.timer = setTimeout(() => flushBucket(bucket), BATCH_WINDOW_MS);
    }
  });
}
var MAX_CONCURRENCY, MAX_TRIES, BATCH_WINDOW_MS, active, pending, sleep, urlCache, openBucket;
var init_thumb_queue = __esm({
  "client-src/visual/thumb-queue.ts"() {
    "use strict";
    MAX_CONCURRENCY = 2;
    MAX_TRIES = 3;
    BATCH_WINDOW_MS = 80;
    active = 0;
    pending = [];
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    urlCache = /* @__PURE__ */ new Map();
    openBucket = null;
  }
});

// client-src/visual/PageMappingOverview.tsx
function storageKey(repoInput, figmaUrl) {
  return "tracescope.map.selections:" + repoInput.trim() + ":" + figmaUrl.trim();
}
function formatSavedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function loadSelections(repoInput, figmaUrl) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(repoInput, figmaUrl)) ?? "{}");
  } catch {
    return {};
  }
}
function parseNodeIdFromFigmaUrl(url) {
  try {
    if (/lanhuapp\.com|lanhu\.woa\.com/i.test(url)) {
      const u2 = new URL(url);
      const q = u2.hash.includes("?") ? u2.hash.slice(u2.hash.indexOf("?") + 1) : u2.search.slice(1);
      const params = new URLSearchParams(q);
      return (params.get("image_id") || params.get("imageId") || "").trim();
    }
    const u = new URL(url);
    const raw = u.searchParams.get("node-id") || "";
    return raw ? raw.replace(/-/g, ":") : "";
  } catch {
    return "";
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
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      text ? `服务器返回非 JSON（HTTP ${r.status}）：${text.slice(0, 120)}` : `请求失败（HTTP ${r.status}）`
    );
  }
  if (!r.ok) {
    const detail = String(data.error || "").trim();
    if (r.status === 405) {
      throw new Error(
        detail || "请求失败（HTTP 405）：插件路由未加载或方法不匹配，请完全退出并重启 DeepSeek Harness 后再试"
      );
    }
    throw new Error(detail || `请求失败（HTTP ${r.status}）`);
  }
  return data;
}
function PageMappingOverview({
  repoInput,
  figmaUrl,
  figmaToken,
  auth,
  busy,
  activeDesignId,
  onScanStateChange,
  onDesignLinkUsed,
  onCompare,
  onAiAnalyze,
  onAiRematch,
  rematchApply
}) {
  const [overview, setOverview] = (0, import_react.useState)(null);
  const [selections, setSelections] = (0, import_react.useState)(
    () => loadSelections(repoInput, figmaUrl)
  );
  const [confirmed, setConfirmed] = (0, import_react.useState)({});
  const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
  const [query, setQuery] = (0, import_react.useState)("");
  const [collapsed, setCollapsed] = (0, import_react.useState)({});
  const [localError, setLocalError] = (0, import_react.useState)("");
  const [scanning, setScanning] = (0, import_react.useState)(false);
  const [elapsed, setElapsed] = (0, import_react.useState)(0);
  const [rematchingId, setRematchingId] = (0, import_react.useState)("");
  const [preview, setPreview] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (!preview) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);
  (0, import_react.useEffect)(() => {
    if (!scanning) return;
    const started = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1e3)), 1e3);
    return () => clearInterval(id);
  }, [scanning]);
  async function requestRematchPrompt(designId) {
    setLocalError("");
    setRematchingId(designId);
    try {
      await onAiRematch(designId, selections[designId]);
    } catch (err) {
      setLocalError(err.message || "准备推荐提示词失败");
    } finally {
      setRematchingId("");
    }
  }
  (0, import_react.useEffect)(() => {
    setOverview(null);
    setSelections(loadSelections(repoInput, figmaUrl));
    setConfirmed({});
    setStatusFilter("all");
    setQuery("");
  }, [repoInput, figmaUrl]);
  function persist(next) {
    setSelections(next);
    try {
      localStorage.setItem(storageKey(repoInput, figmaUrl), JSON.stringify(next));
    } catch {
    }
  }
  async function scan(force, scope = "auto") {
    setLocalError("");
    if (!figmaUrl.trim() || !figmaToken.trim()) {
      setLocalError("请填写设计稿链接和访问 Token");
      return;
    }
    const linkNodeId = parseNodeIdFromFigmaUrl(figmaUrl);
    const effectiveScope = scope === "file" ? "file" : linkNodeId ? "node" : "file";
    const busyMsg = effectiveScope === "node" ? "正在定位链接中的设计页并匹配代码…" : "正在扫描整个设计文件、建立页面映射…";
    onScanStateChange(true, busyMsg);
    setScanning(true);
    try {
      const res = await post("/tracescope/v1/match-all", {
        repoPath: repoInput,
        figmaUrl: figmaUrl.trim(),
        figmaToken: figmaToken.trim(),
        auth,
        force,
        scope: effectiveScope
      });
      setOverview(res);
      onDesignLinkUsed?.(figmaUrl.trim());
      const warmIds = res.pages.slice(0, 24).map((p) => p.mapping.designId);
      if (warmIds.length) {
        void Promise.allSettled(
          warmIds.map(
            (nodeId) => requestPageThumbnail({
              figmaUrl: figmaUrl.trim(),
              figmaToken: figmaToken.trim(),
              nodeId
            })
          )
        );
      }
      const next = { ...selections };
      for (const p of res.pages) {
        const top = p.mapping.candidates[0];
        if (!next[p.mapping.designId] && top) {
          next[p.mapping.designId] = { adapterId: top.adapterId, relativePath: top.relativePath };
        }
      }
      persist(next);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setScanning(false);
      onScanStateChange(false);
    }
  }
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    async function tryLoadCache() {
      if (!figmaUrl.trim() || !figmaToken.trim() || !repoInput.trim()) return;
      setLocalError("");
      setScanning(true);
      try {
        const res = await post("/tracescope/v1/match-all", {
          repoPath: repoInput,
          figmaUrl: figmaUrl.trim(),
          figmaToken: figmaToken.trim(),
          auth,
          force: false
        });
        if (cancelled) return;
        if (res.fromCache) {
          setOverview(res);
          const next = { ...selections };
          for (const p of res.pages) {
            const top = p.mapping.candidates[0];
            if (!next[p.mapping.designId] && top) {
              next[p.mapping.designId] = { adapterId: top.adapterId, relativePath: top.relativePath };
            }
          }
          persist(next);
        }
      } catch {
      } finally {
        if (!cancelled) setScanning(false);
      }
    }
    void tryLoadCache();
    return () => {
      cancelled = true;
    };
  }, [repoInput, figmaUrl, figmaToken]);
  const codeFileMap = (0, import_react.useMemo)(() => {
    const m = /* @__PURE__ */ new Map();
    overview?.codeFiles.forEach((f) => m.set(f.adapterId + "::" + f.relativePath, f));
    return m;
  }, [overview]);
  function choose(designId, file, auto = false) {
    persist({ ...selections, [designId]: file });
    if (!auto) setConfirmed({ ...confirmed, [designId]: true });
  }
  (0, import_react.useEffect)(() => {
    if (!rematchApply || !overview) return;
    const { designId, candidates, note } = rematchApply;
    if (!designId || !candidates.length) return;
    const mapped = candidates.map((c) => {
      const known = codeFileMap.get(c.adapterId + "::" + c.relativePath);
      return {
        adapterId: c.adapterId,
        relativePath: c.relativePath,
        kindLabel: c.kindLabel || known?.kindLabel || c.adapterId,
        precise: c.precise ?? known?.precise ?? false,
        score: typeof c.score === "number" ? c.score : 0.8,
        reasons: c.reason ? [`AI：${c.reason}`] : ["AI 推荐"]
      };
    });
    setOverview((prev) => {
      if (!prev) return prev;
      const knownKeys = new Set(prev.codeFiles.map((f) => f.adapterId + "::" + f.relativePath));
      const extraFiles = [];
      for (const m of mapped) {
        const key = m.adapterId + "::" + m.relativePath;
        if (knownKeys.has(key)) continue;
        knownKeys.add(key);
        extraFiles.push({
          adapterId: m.adapterId,
          relativePath: m.relativePath,
          kindLabel: m.kindLabel,
          precise: m.precise
        });
      }
      return {
        ...prev,
        codeFiles: extraFiles.length ? [...prev.codeFiles, ...extraFiles] : prev.codeFiles,
        pages: prev.pages.map((p) => {
          if (p.mapping.designId !== designId) return p;
          const topScore = mapped[0]?.score ?? 0;
          const status = mapped.length === 0 ? "none" : topScore >= 0.45 ? "matched" : "weak";
          return {
            ...p,
            mapping: {
              ...p.mapping,
              status,
              candidates: mapped
            }
          };
        })
      };
    });
    const top = mapped[0];
    if (top) {
      choose(designId, { adapterId: top.adapterId, relativePath: top.relativePath });
    }
    setLocalError(
      (note ? `✓ ${note}` : "✓ 已写回 AI 文件推荐并选中 Top1") + "。若仍不对，可在会话继续纠正后再次写回。"
    );
  }, [rematchApply?.token]);
  const groups = (0, import_react.useMemo)(() => {
    if (!overview) return [];
    const q = query.trim().toLowerCase();
    const byCanvas = /* @__PURE__ */ new Map();
    for (const p of overview.pages) {
      if (statusFilter !== "all" && p.mapping.status !== statusFilter) continue;
      const selectedFile = selections[p.mapping.designId];
      const selPath = codeFileMap.get(
        (selectedFile?.adapterId ?? "") + "::" + (selectedFile?.relativePath ?? "")
      )?.relativePath;
      if (q) {
        const hit = p.mapping.designName.toLowerCase().includes(q) || (selPath ?? "").toLowerCase().includes(q);
        if (!hit) continue;
      }
      const g = byCanvas.get(p.canvasId) ?? { name: p.canvasName, items: [] };
      g.items.push(p);
      byCanvas.set(p.canvasId, g);
    }
    return [...byCanvas.entries()].map(([id, v]) => ({ id, ...v }));
  }, [overview, statusFilter, query, selections, codeFileMap]);
  const linkHasNodeId = !!parseNodeIdFromFigmaUrl(figmaUrl);
  const scanScope = overview?.scope;
  const isNodeScope = scanScope === "node" || !overview && linkHasNodeId;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: "0 0 8px", fontSize: 12, color: "#6b645a", lineHeight: 1.55 }, children: linkHasNodeId ? "链接含 node-id：扫描会优先定位当前页（较快）。若要一次处理文件内全部页面，可用下方「扫描整个设计文件」。" : "链接未指定页面：扫描会读取设计文件/项目内全部页面并自动映射。若只想对某一页，请复制带 node-id（Figma）或 image_id（蓝湖）的链接。" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        style: OV.scan,
        disabled: busy || scanning,
        onClick: () => void scan(!!overview, "auto"),
        children: scanning ? isNodeScope ? `定位中… ${elapsed}s` : `扫描中… ${elapsed}s（页面较多时约需 20–40 秒，请勿关闭）` : overview ? linkHasNodeId ? "重新扫描（当前链接页面）" : "重新扫描设计稿" : linkHasNodeId ? "扫描当前链接页面" : "扫描设计稿，自动映射页面"
      }
    ),
    linkHasNodeId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        style: { ...OV.scanSecondary, marginTop: 6 },
        disabled: busy || scanning,
        onClick: () => void scan(true, "file"),
        children: scanning && overview?.scope === "file" ? `全文件扫描中… ${elapsed}s` : "扫描整个设计文件"
      }
    ) : null,
    localError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "p",
      {
        style: {
          ...OV.error,
          color: localError.startsWith("✓") || localError.startsWith("ℹ") ? "#0f6e56" : "#b42318"
        },
        children: localError
      }
    ) : null,
    overview ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.summary, children: [
        overview.scope === "node" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "单页模式（链接 node-id）· ",
          overview.pages[0]?.mapping.designName || "当前节点",
          " ·"
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "全文件 · " }),
        "共 ",
        overview.totals.pages,
        " 个页面 ·",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: STATUS_META.matched.dot }, children: [
          " 已匹配 ",
          overview.totals.matched
        ] }),
        " ·",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: STATUS_META.weak.dot }, children: [
          " 待确认 ",
          overview.totals.weak
        ] }),
        " ·",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: STATUS_META.none.dot }, children: [
          " 未匹配 ",
          overview.totals.none
        ] }),
        overview.fromCache && overview.savedAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { marginLeft: 6, color: "#8a7a5c" }, children: [
          "· 读取自缓存（",
          formatSavedAt(overview.savedAt),
          "），点上方按钮可重新扫描"
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.chipRow, children: FILTERS.map((f) => {
        const count = f.id === "all" ? overview.totals.pages : overview.totals[f.id];
        const on = statusFilter === f.id;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => setStatusFilter(f.id),
            style: {
              ...OV.chip,
              background: on ? "#0f6e56" : "#fff",
              color: on ? "#fff" : "#5f584c",
              borderColor: on ? "#0f6e56" : "#d9d2c4"
            },
            children: [
              f.label,
              " ",
              count
            ]
          },
          f.id
        );
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: OV.search,
          value: query,
          placeholder: "搜索页面名称或已选代码文件…",
          onChange: (e) => setQuery(e.target.value)
        }
      ),
      groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.emptyHint, children: "没有符合条件的页面。" }) : null,
      groups.map((g) => {
        const isCollapsed = !!collapsed[g.id];
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.canvasCard, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              style: OV.canvasHeader,
              onClick: () => setCollapsed({ ...collapsed, [g.id]: !isCollapsed }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: isCollapsed ? "▸" : "▾" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: g.name || "未命名画布" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.canvasCount, children: g.items.length })
              ]
            }
          ),
          isCollapsed ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.grid, children: g.items.map(({ mapping, thumbnailUrl, aspect }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            PageCard,
            {
              mapping,
              aspect,
              figmaUrl,
              figmaToken,
              selected: selections[mapping.designId],
              isActive: activeDesignId === mapping.designId,
              isConfirmed: !!confirmed[mapping.designId],
              allCodeFiles: overview.codeFiles,
              codeFileMap,
              onChoose: (file) => choose(mapping.designId, file),
              onCompare: () => {
                const file = selections[mapping.designId];
                if (!file) {
                  setLocalError(
                    `「${mapping.designName || mapping.designId}」还没有指定代码文件。请先点卡片上的红色「点此指定代码文件」，选好后再点「界面对比」。`
                  );
                  return;
                }
                setLocalError("");
                onCompare(mapping.designId, file);
              },
              onAiAnalyze: () => {
                const file = selections[mapping.designId];
                if (!file) {
                  setLocalError(
                    `「${mapping.designName || mapping.designId}」还没有指定代码文件。请先指定代码文件后再「AI 协助分析」。`
                  );
                  return;
                }
                setLocalError("");
                onAiAnalyze(mapping.designId, file);
              },
              onAiRematch: () => {
                void requestRematchPrompt(mapping.designId);
              },
              rematching: rematchingId === mapping.designId,
              busy: busy || scanning || !!rematchingId,
              onOpenPreview: (url) => setPreview({ url, name: mapping.designName || mapping.designId })
            },
            mapping.designId
          )) })
        ] }, g.id);
      })
    ] }) : null,
    preview ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "设计稿原图",
        style: OV.previewOverlay,
        onClick: () => setPreview(null),
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.previewPanel, onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.previewHeader, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "strong",
              {
                style: {
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                },
                children: preview.name || "设计稿原图"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: OV.previewClose, onClick: () => setPreview(null), children: "关闭" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.previewBody, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: preview.url, alt: preview.name || "设计稿原图", style: OV.previewImg }) })
        ] })
      }
    ) : null
  ] });
}
function PageCard({
  mapping,
  aspect,
  figmaUrl,
  figmaToken,
  selected,
  isActive,
  isConfirmed,
  allCodeFiles,
  codeFileMap,
  onChoose,
  onCompare,
  onAiAnalyze,
  onAiRematch,
  rematching,
  busy: cardBusy,
  onOpenPreview
}) {
  const [pickerOpen, setPickerOpen] = (0, import_react.useState)(false);
  const [thumbState, setThumbState] = (0, import_react.useState)("idle");
  const [thumbUrl, setThumbUrl] = (0, import_react.useState)("");
  const [thumbNonce, setThumbNonce] = (0, import_react.useState)(0);
  const status = STATUS_META[mapping.status];
  const badge = KIND_BADGE[mapping.kind];
  const selCandidate = mapping.candidates.find(
    (c) => selected && c.adapterId === selected.adapterId && c.relativePath === selected.relativePath
  );
  const selFile = selected ? codeFileMap.get(selected.adapterId + "::" + selected.relativePath) || (selCandidate ? {
    adapterId: selCandidate.adapterId,
    relativePath: selCandidate.relativePath,
    kindLabel: selCandidate.kindLabel,
    precise: selCandidate.precise
  } : {
    adapterId: selected.adapterId,
    relativePath: selected.relativePath,
    kindLabel: selected.adapterId,
    precise: false
  }) : void 0;
  const [thumbEl, setThumbEl] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (!thumbEl || thumbState !== "idle") return;
    if (typeof IntersectionObserver === "undefined") {
      setThumbState("loading");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setThumbState("loading");
            io.disconnect();
          }
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(thumbEl);
    return () => io.disconnect();
  }, [thumbEl, thumbState]);
  (0, import_react.useEffect)(() => {
    if (thumbState !== "loading" || thumbUrl) return;
    let cancelled = false;
    requestPageThumbnail({
      figmaUrl,
      figmaToken,
      nodeId: mapping.designId
    }).then((url) => {
      if (cancelled) return;
      if (url) {
        setThumbUrl(url);
        setThumbState("done");
      } else {
        setThumbState("error");
      }
    }).catch(() => {
      if (!cancelled) setThumbState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [thumbState, thumbUrl, thumbNonce, figmaUrl, figmaToken, mapping.designId]);
  function retryThumb(auto = false) {
    if (auto && thumbNonce >= 1) {
      setThumbState("error");
      return;
    }
    setThumbUrl("");
    setThumbState("loading");
    setThumbNonce((n) => n + 1);
  }
  const thumbHeight = 150 / aspect;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        ...OV.card,
        ...isActive ? {
          borderColor: "#0f6e56",
          boxShadow: "0 0 0 2px rgba(15,110,86,0.35)"
        } : null
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: setThumbEl, style: { ...OV.thumbWrap, height: Math.min(thumbHeight, 230) }, children: [
          thumbState === "done" && thumbUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              style: OV.thumbOpenBtn,
              title: "点击查看原图",
              onClick: () => onOpenPreview?.(thumbUrl),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "img",
                  {
                    src: thumbUrl,
                    alt: mapping.designName,
                    style: OV.thumbImg,
                    onError: () => retryThumb(true)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.thumbOpenHint, children: "查看原图" })
              ]
            }
          ) : thumbState === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.thumbFallback, children: "缩略图加载中…" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: OV.thumbRetry, onClick: retryThumb, children: "缩略图加载失败，点此重试" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...OV.statusTag, color: status.dot }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...OV.statusDot, background: status.dot } }),
            status.label
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...OV.kindTag, background: badge.bg, color: badge.fg }, children: badge.label }),
          isActive ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              style: {
                position: "absolute",
                right: 6,
                bottom: 6,
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                background: "#0f6e56",
                borderRadius: 99,
                padding: "2px 8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
              },
              children: "正在查看"
            }
          ) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.cardName, title: mapping.designName, children: mapping.designName }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: OV.fileBox,
            onClick: () => setPickerOpen(true),
            title: selFile?.relativePath || "指定代码文件",
            children: selFile ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { title: selFile.relativePath, children: [
              isConfirmed ? "✓ " : "",
              selFile.relativePath.split("/").pop(),
              selCandidate ? ` · ${Math.round(selCandidate.score * 100)}%` : ""
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#b42318" }, children: "点此指定代码文件 →" })
          }
        ),
        selFile ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.filePathHint, title: selFile.relativePath, children: selFile.relativePath }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: OV.rematchLink,
            disabled: cardBusy,
            onClick: onAiRematch,
            title: "生成推荐提示词并填入当前会话；可核对后发送，也可继续对话纠正错误推荐",
            children: rematching ? "准备中…" : "AI 推荐文件"
          }
        ),
        pickerOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          CodeFilePickerModal,
          {
            designName: mapping.designName || mapping.designId,
            candidates: mapping.candidates,
            allCodeFiles,
            selected,
            onChoose: (file) => {
              onChoose(file);
              setPickerOpen(false);
            },
            onClose: () => setPickerOpen(false)
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.actionRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: {
                ...OV.compareBtn,
                ...!selected ? { opacity: 0.85, background: "#667085", borderColor: "#667085" } : null
              },
              disabled: cardBusy,
              title: selected ? "对比设计稿与已选代码文件" : "请先点上方「点此指定代码文件」再对比",
              onClick: () => {
                if (!selected) setPickerOpen(true);
                onCompare();
              },
              children: selected ? "界面对比" : "先选代码文件"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              style: {
                ...OV.aiBtn,
                ...!selected ? { opacity: 0.7 } : null
              },
              disabled: cardBusy,
              title: selected ? "先对比再生成 AI 分析提示词" : "请先点上方「点此指定代码文件」再分析",
              onClick: () => {
                if (!selected) setPickerOpen(true);
                onAiAnalyze();
              },
              children: "AI 协助分析"
            }
          )
        ] })
      ]
    }
  );
}
function fileDir(rel) {
  const i = rel.lastIndexOf("/");
  return i <= 0 ? "." : rel.slice(0, i);
}
function fileName(rel) {
  const i = rel.lastIndexOf("/");
  return i < 0 ? rel : rel.slice(i + 1);
}
function CodeFilePickerModal({
  designName,
  candidates,
  allCodeFiles,
  selected,
  onChoose,
  onClose
}) {
  const [query, setQuery] = (0, import_react.useState)("");
  const [collapsedDirs, setCollapsedDirs] = (0, import_react.useState)({});
  (0, import_react.useEffect)(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const filtered = (0, import_react.useMemo)(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCodeFiles;
    return allCodeFiles.filter((f) => {
      const path = f.relativePath.toLowerCase();
      const name2 = fileName(f.relativePath).toLowerCase();
      const kind = (f.kindLabel || "").toLowerCase();
      return path.includes(q) || name2.includes(q) || kind.includes(q);
    });
  }, [query, allCodeFiles]);
  const groups = (0, import_react.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const f of filtered) {
      const dir = fileDir(f.relativePath);
      const list = map.get(dir) || [];
      list.push(f);
      map.set(dir, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, files]) => ({
      dir,
      files: files.slice().sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    }));
  }, [filtered]);
  const visibleCandidates = (0, import_react.useMemo)(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const path = c.relativePath.toLowerCase();
      const name2 = fileName(c.relativePath).toLowerCase();
      return path.includes(q) || name2.includes(q);
    });
  }, [query, candidates]);
  function isActive(adapterId, relativePath) {
    return !!selected && selected.adapterId === adapterId && selected.relativePath === relativePath;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "指定代码文件",
      style: OV.pickerOverlay,
      onClick: onClose,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerPanel, onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.pickerTitle, children: "指定代码文件" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.pickerSubtitle, title: designName, children: designName })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: OV.pickerClose, onClick: onClose, children: "关闭" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerSearchRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              autoFocus: true,
              style: OV.pickerSearchInput,
              value: query,
              placeholder: "搜索文件名、路径或类型…（支持部分匹配）",
              onChange: (e) => setQuery(e.target.value)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: OV.pickerCount, children: [
            filtered.length,
            "/",
            allCodeFiles.length
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerBody, children: [
          visibleCandidates.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.pickerSectionTitle, children: "自动建议" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.pickerSuggestList, children: visibleCandidates.slice(0, 12).map((c) => {
              const active2 = isActive(c.adapterId, c.relativePath);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  style: {
                    ...OV.pickerFileRow,
                    ...active2 ? OV.pickerFileRowActive : null
                  },
                  onClick: () => onChoose({ adapterId: c.adapterId, relativePath: c.relativePath }),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: OV.pickerScore, children: [
                      Math.round(c.score * 100),
                      "%"
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: OV.pickerFileMeta, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerFileName, children: fileName(c.relativePath) }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerFileDir, children: fileDir(c.relativePath) })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerKind, children: c.kindLabel }),
                    active2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerCheck, children: "✓" }) : null
                  ]
                },
                "sug-" + c.adapterId + c.relativePath
              );
            }) })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerSection, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerSectionTitle, children: [
              "全部布局文件",
              query.trim() ? ` · 匹配 ${filtered.length}` : ""
            ] }),
            groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: OV.pickerEmpty, children: "没有匹配的文件，试试更短的关键词。" }) : groups.map(({ dir, files }) => {
              const collapsed = !!collapsedDirs[dir];
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: OV.pickerDirBlock, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    type: "button",
                    style: OV.pickerDirHeader,
                    onClick: () => setCollapsedDirs({ ...collapsedDirs, [dir]: !collapsed }),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: collapsed ? "▸" : "▾" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerDirPath, title: dir, children: dir }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerDirCount, children: files.length })
                    ]
                  }
                ),
                collapsed ? null : files.map((f) => {
                  const active2 = isActive(f.adapterId, f.relativePath);
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "button",
                    {
                      type: "button",
                      style: {
                        ...OV.pickerFileRow,
                        ...active2 ? OV.pickerFileRowActive : null
                      },
                      onClick: () => onChoose({
                        adapterId: f.adapterId,
                        relativePath: f.relativePath
                      }),
                      title: f.relativePath,
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: OV.pickerFileMeta, children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerFileName, children: fileName(f.relativePath) }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerFileDir, children: f.relativePath })
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerKind, children: f.kindLabel }),
                        active2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: OV.pickerCheck, children: "✓" }) : null
                      ]
                    },
                    f.adapterId + f.relativePath
                  );
                })
              ] }, dir);
            })
          ] })
        ] })
      ] })
    }
  );
}
var import_react, import_jsx_runtime, KIND_BADGE, STATUS_META, FILTERS, OV;
var init_PageMappingOverview = __esm({
  "client-src/visual/PageMappingOverview.tsx"() {
    "use strict";
    import_react = require("react");
    init_thumb_queue();
    import_jsx_runtime = require("react/jsx-runtime");
    KIND_BADGE = {
      screen: { label: "整屏", bg: "#e7f0fb", fg: "#1d4e89" },
      "list-item": { label: "列表项", bg: "#ece8fa", fg: "#4a3aa0" },
      dialog: { label: "弹窗", bg: "#fdeede", fg: "#9a5b06" }
    };
    STATUS_META = {
      matched: { dot: "#1a9b6e", label: "已匹配" },
      weak: { dot: "#dc8a05", label: "待确认" },
      none: { dot: "#d92d20", label: "未匹配" }
    };
    FILTERS = [
      { id: "all", label: "全部" },
      { id: "matched", label: "已匹配" },
      { id: "weak", label: "待确认" },
      { id: "none", label: "未匹配" }
    ];
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
      scanSecondary: {
        width: "100%",
        padding: "7px 12px",
        borderRadius: 8,
        border: "1px solid #0f6e56",
        background: "#fff",
        color: "#0f6e56",
        fontWeight: 600,
        cursor: "pointer",
        fontSize: 12
      },
      error: { color: "#b42318", fontSize: 12, marginTop: 6 },
      summary: { fontSize: 12, color: "#5f584c", marginBottom: 8, lineHeight: 1.6 },
      chipRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 },
      chip: {
        fontSize: 11,
        borderRadius: 99,
        padding: "3px 10px",
        border: "1px solid #d9d2c4",
        cursor: "pointer",
        fontWeight: 600
      },
      search: {
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 9px",
        border: "1px solid #d9d2c4",
        borderRadius: 8,
        fontSize: 12,
        marginBottom: 8
      },
      emptyHint: { fontSize: 12, color: "#8a7f70", padding: "8px 0" },
      canvasCard: {
        border: "1px solid #e3dccc",
        borderRadius: 10,
        marginBottom: 10,
        overflow: "hidden",
        background: "#fff"
      },
      canvasHeader: {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        fontWeight: 600,
        padding: "7px 10px",
        background: "#f6f2e9",
        color: "#5f584c",
        border: "none",
        cursor: "pointer",
        textAlign: "left"
      },
      canvasCount: {
        marginLeft: "auto",
        fontSize: 11,
        background: "#e7e0d0",
        color: "#5f584c",
        borderRadius: 99,
        padding: "0 8px"
      },
      grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 10,
        padding: 10
      },
      card: {
        border: "1px solid #e8e1d3",
        borderRadius: 10,
        padding: 7,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "#fff"
      },
      thumbWrap: {
        position: "relative",
        borderRadius: 7,
        overflow: "hidden",
        background: "#f4f1ea",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center"
      },
      thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
      thumbOpenBtn: {
        position: "relative",
        width: "100%",
        height: "100%",
        padding: 0,
        margin: 0,
        border: "none",
        background: "transparent",
        cursor: "zoom-in",
        display: "block"
      },
      thumbOpenHint: {
        position: "absolute",
        left: 6,
        bottom: 6,
        fontSize: 10,
        fontWeight: 600,
        color: "#fff",
        background: "rgba(0,0,0,0.55)",
        borderRadius: 99,
        padding: "2px 8px",
        pointerEvents: "none"
      },
      thumbFallback: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "#8a7f70",
        padding: 6,
        textAlign: "center"
      },
      thumbRetry: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "#b42318",
        background: "transparent",
        border: "none",
        padding: 6,
        cursor: "pointer",
        textAlign: "center"
      },
      statusTag: {
        position: "absolute",
        top: 4,
        left: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 99,
        padding: "1px 6px"
      },
      statusDot: { width: 6, height: 6, borderRadius: 99, display: "inline-block" },
      kindTag: {
        position: "absolute",
        top: 4,
        right: 4,
        fontSize: 10,
        fontWeight: 600,
        borderRadius: 99,
        padding: "1px 6px"
      },
      cardName: {
        fontSize: 12,
        fontWeight: 600,
        color: "#33302a",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      fileBox: {
        textAlign: "left",
        fontSize: 11,
        border: "1px solid #d9d2c4",
        borderRadius: 7,
        padding: "5px 7px",
        background: "#fcfaf6",
        cursor: "pointer",
        color: "#3f3a30",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      rematchLink: {
        alignSelf: "flex-start",
        border: "none",
        background: "transparent",
        color: "#0f6e56",
        fontSize: 11,
        padding: "0 2px",
        cursor: "pointer",
        textDecoration: "underline",
        fontWeight: 600
      },
      filePathHint: {
        fontSize: 10,
        color: "#8a7f70",
        lineHeight: 1.35,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        padding: "0 2px"
      },
      pickerOverlay: {
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        background: "rgba(20, 18, 14, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      },
      pickerPanel: {
        width: "min(640px, 96vw)",
        maxHeight: "88vh",
        background: "#fff",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 18px 48px rgba(0,0,0,0.35)"
      },
      pickerHeader: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderBottom: "1px solid #ece5d8",
        background: "#faf7f1"
      },
      pickerTitle: { fontSize: 14, fontWeight: 700, color: "#3f3a30" },
      pickerSubtitle: {
        fontSize: 11,
        color: "#8a7f70",
        marginTop: 2,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      pickerClose: {
        border: "1px solid #d9d2c4",
        background: "#fff",
        color: "#5f584c",
        borderRadius: 7,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        flexShrink: 0
      },
      pickerSearchRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid #ece5d8"
      },
      pickerSearchInput: {
        flex: 1,
        boxSizing: "border-box",
        padding: "8px 10px",
        border: "1px solid #d9d2c4",
        borderRadius: 8,
        fontSize: 13
      },
      pickerCount: {
        fontSize: 11,
        color: "#8a7f70",
        whiteSpace: "nowrap",
        flexShrink: 0
      },
      pickerBody: {
        flex: 1,
        overflow: "auto",
        padding: "8px 12px 14px"
      },
      pickerSection: { marginBottom: 12 },
      pickerSectionTitle: {
        fontSize: 11,
        fontWeight: 700,
        color: "#8a7f70",
        marginBottom: 6,
        letterSpacing: 0.2
      },
      pickerSuggestList: { display: "flex", flexDirection: "column", gap: 4 },
      pickerEmpty: { fontSize: 12, color: "#8a7f70", padding: "12px 4px" },
      pickerDirBlock: {
        border: "1px solid #ece5d8",
        borderRadius: 8,
        marginBottom: 6,
        overflow: "hidden",
        background: "#fdfbf7"
      },
      pickerDirHeader: {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        border: "none",
        background: "#f3eee4",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        color: "#5f584c",
        textAlign: "left"
      },
      pickerDirPath: {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      },
      pickerDirCount: {
        fontSize: 10,
        background: "#e7e0d0",
        borderRadius: 99,
        padding: "0 7px",
        flexShrink: 0
      },
      pickerFileRow: {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        border: "none",
        borderBottom: "1px solid #f0ebe1",
        background: "#fff",
        cursor: "pointer",
        textAlign: "left"
      },
      pickerFileRowActive: {
        background: "#f2f8f5",
        boxShadow: "inset 3px 0 0 #0f6e56"
      },
      pickerScore: {
        fontSize: 11,
        fontWeight: 700,
        color: "#0f6e56",
        width: 36,
        flexShrink: 0
      },
      pickerFileMeta: {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1
      },
      pickerFileName: {
        fontSize: 13,
        fontWeight: 600,
        color: "#3f3a30",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      pickerFileDir: {
        fontSize: 10,
        color: "#8a7f70",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      },
      pickerKind: {
        fontSize: 10,
        color: "#5f584c",
        background: "#f3eee4",
        borderRadius: 99,
        padding: "2px 7px",
        flexShrink: 0,
        maxWidth: 90,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      pickerCheck: {
        color: "#0f6e56",
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0
      },
      actionRow: {
        display: "flex",
        gap: 6,
        marginTop: 2
      },
      compareBtn: {
        flex: 1,
        fontSize: 12,
        padding: "6px 4px",
        borderRadius: 7,
        border: "1px solid #0f6e56",
        background: "#0f6e56",
        color: "#fff",
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap"
      },
      aiBtn: {
        flex: 1,
        fontSize: 12,
        padding: "6px 4px",
        borderRadius: 7,
        border: "1px solid #0f6e56",
        background: "#fff",
        color: "#0f6e56",
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap"
      },
      previewOverlay: {
        position: "fixed",
        inset: 0,
        zIndex: 1e4,
        background: "rgba(20, 18, 14, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      },
      previewPanel: {
        width: "min(920px, 96vw)",
        maxHeight: "92vh",
        background: "#1c1915",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 18px 48px rgba(0,0,0,0.45)"
      },
      previewHeader: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        color: "#f4f1ea",
        fontSize: 13,
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      },
      previewClose: {
        border: "1px solid rgba(255,255,255,0.25)",
        background: "transparent",
        color: "#f4f1ea",
        borderRadius: 7,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        flexShrink: 0
      },
      previewBody: {
        flex: 1,
        overflow: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        background: "#11100e"
      },
      previewImg: {
        maxWidth: "100%",
        maxHeight: "78vh",
        objectFit: "contain",
        display: "block"
      }
    };
  }
});

// client-src/visual/resolve-finding-node.ts
function normalize(s) {
  return s.trim().toLowerCase().replace(/[\s\u3000]+/g, "").replace(/[“”"']/g, "");
}
function extractCandidateNodeIds(...parts) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (id) => {
    const t = id.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
    const alt = t.includes("-") ? t.replace(/-/g, ":") : t.replace(/:/g, "-");
    if (alt !== t && !seen.has(alt)) {
      seen.add(alt);
      out.push(alt);
    }
  };
  for (const part of parts) {
    if (!part) continue;
    for (const m of part.matchAll(/\b\d+:\d+\b/g)) push(m[0]);
    for (const m of part.matchAll(/\b\d+-\d+\b/g)) push(m[0]);
    const trimmed = part.trim();
    if (/^\d+:\d+$/.test(trimmed) || /^\d+-\d+$/.test(trimmed)) push(trimmed);
    if (/^[A-Za-z0-9_.-]{6,80}$/.test(trimmed) && !/\s/.test(trimmed)) push(trimmed);
  }
  return out;
}
function compactId(id) {
  return id.replace(/[^0-9]/g, "");
}
function buildIdIndexes(nodes) {
  const byId = /* @__PURE__ */ new Map();
  const byCompact = /* @__PURE__ */ new Map();
  const byNorm = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    const id = String(n.id ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, n);
    const c = compactId(id);
    if (c && !byCompact.has(c)) byCompact.set(c, n);
    const norm = id.replace(/-/g, ":");
    if (!byNorm.has(norm)) byNorm.set(norm, n);
  }
  return { byId, byCompact, byNorm };
}
function lookupId(indexes, raw) {
  const id = raw.trim();
  if (!id) return void 0;
  return indexes.byId.get(id) || indexes.byNorm.get(id.replace(/-/g, ":")) || indexes.byCompact.get(compactId(id));
}
function scoreNode(node, hints) {
  const name2 = normalize(node.name || "");
  const text = normalize(node.text || "");
  const loc = normalize(hints.location || "");
  const title = normalize(hints.title || "");
  const expected = normalize(hints.expected || "");
  let score = 0;
  if (expected && text) {
    if (text === expected) score += 100;
    else if (expected.length >= 2 && (text.includes(expected) || expected.includes(text))) {
      score += 70;
    }
  }
  if (loc && name2) {
    if (name2 === loc) score += 90;
    else if (loc.length >= 2 && (name2.includes(loc) || loc.includes(name2))) score += 50;
  }
  if (title && name2 && name2.length >= 2 && title.includes(name2)) score += 35;
  if (title && text && text.length >= 2 && title.includes(text)) score += 40;
  if (loc && text && text.length >= 2 && (loc.includes(text) || text.includes(loc))) score += 25;
  const w = Math.max(1, Number(node.width) || 1);
  const h = Math.max(1, Number(node.height) || 1);
  const area = w * h;
  score += Math.max(0, 8 - Math.log10(area));
  return score;
}
function resolveFindingNodeId(hints, nodes, options) {
  if (!nodes.length) return void 0;
  const minScore = options?.minScore ?? 40;
  const indexes = buildIdIndexes(nodes);
  const directCandidates = extractCandidateNodeIds(
    hints.nodeId,
    hints.location,
    hints.title,
    hints.expected,
    hints.suggestion
  );
  for (const cand of directCandidates) {
    const hit = lookupId(indexes, cand);
    if (hit) return hit.id;
  }
  if (hints.nodeId) {
    const hit = lookupId(indexes, hints.nodeId);
    if (hit) return hit.id;
  }
  let best;
  let bestScore = 0;
  for (const n of nodes) {
    const s = scoreNode(n, hints);
    if (s > bestScore) {
      bestScore = s;
      best = n;
    }
  }
  if (best && bestScore >= minScore) return best.id;
  return void 0;
}
var init_resolve_finding_node = __esm({
  "client-src/visual/resolve-finding-node.ts"() {
    "use strict";
  }
});

// client-src/visual/diff-actions.ts
function itemNote(item) {
  const lines = [];
  if (item.location) lines.push(`位置：${item.location}`);
  if (item.expected) lines.push(`设计期望：${item.expected}`);
  if (item.actual) lines.push(`实际：${item.actual}`);
  if (item.codeSource) lines.push(`代码来源：${item.codeSource}`);
  if (item.suggestion) lines.push(`建议：${item.suggestion}`);
  if (item.note) lines.push(`备注：${item.note}`);
  lines.push(`来源：${item.source === "ai" ? "AI 协助" : "静态规则"}`);
  return lines.join("\n");
}
function unifiedItemsToFailReport(items, meta) {
  const codePath = (meta.codePath || "").trim();
  const direct = items.map((item, index) => ({
    id: `ui-diff-${item.key || index}`,
    displayName: item.headline || `UI 差异 ${index + 1}`,
    kind: "direct",
    risk: item.severity,
    files: codePath ? [codePath] : [],
    evidence: codePath ? [{ path: codePath, reason: item.headline || "UI 差异" }] : [],
    suggestedSteps: item.suggestion ? [item.suggestion] : [],
    status: "fail",
    testerNote: itemNote(item)
  }));
  return {
    repoPath: meta.repoPath,
    baseCommit: "design",
    headCommit: "code",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    modelEnriched: false,
    direct,
    ripple: [],
    changedFiles: codePath ? [codePath] : []
  };
}
function defaultVisualDefectSubject(items, meta) {
  const name2 = meta.designName || "设计稿";
  const code = meta.codePath ? ` ↔ ${meta.codePath}` : "";
  return `[UI 走查] ${name2}${code}（${items.length} 条差异）`;
}
function formatVisualDiffCopyText(items, meta) {
  const lines = [
    "【TraceScope UI 差异反馈】",
    `仓库：${meta.repoPath || ""}`,
    meta.designName ? `设计稿：${meta.designName}` : "",
    meta.designUrl ? `链接：${meta.designUrl}` : "",
    meta.codePath ? `代码：${meta.codePath}` : "",
    meta.platformLabel ? `平台：${meta.platformLabel}` : "",
    ""
  ].filter(Boolean);
  items.forEach((item, i) => {
    lines.push(
      `${i + 1}. [${item.severity}] ${item.headline}（${item.source === "ai" ? "AI" : "规则"}）`
    );
    const note = itemNote(item);
    for (const line of note.split("\n")) {
      lines.push(`   ${line}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}
function formatVisualDiffExportMarkdown(items, meta) {
  const lines = [
    "# TraceScope UI 走查差异报告",
    "",
    `- 仓库：\`${meta.repoPath || ""}\``,
    meta.designName ? `- 设计稿：${meta.designName}` : "",
    meta.designUrl ? `- 链接：${meta.designUrl}` : "",
    meta.codePath ? `- 代码：\`${meta.codePath}\`` : "",
    meta.platformLabel ? `- 平台：${meta.platformLabel}` : "",
    `- 生成时间：${(/* @__PURE__ */ new Date()).toISOString()}`,
    `- 差异数：${items.length}`,
    "",
    "## 差异清单",
    ""
  ].filter(Boolean);
  items.forEach((item, i) => {
    lines.push(`### ${i + 1}. ${item.headline}`);
    lines.push("");
    lines.push(`- 严重程度：${item.severity}`);
    lines.push(`- 来源：${item.source === "ai" ? "AI 协助" : "静态规则"}`);
    if (item.location) lines.push(`- 位置：${item.location}`);
    if (item.expected) lines.push(`- 设计期望：${item.expected}`);
    if (item.actual) lines.push(`- 实际：${item.actual}`);
    if (item.codeSource) lines.push(`- 代码来源：${item.codeSource}`);
    if (item.suggestion) lines.push(`- 建议：${item.suggestion}`);
    if (item.note) lines.push(`- 备注：${item.note}`);
    lines.push("");
  });
  return lines.join("\n");
}
async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
function downloadTextFile(filename, text, mime = "text/markdown") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
var init_diff_actions = __esm({
  "client-src/visual/diff-actions.ts"() {
    "use strict";
  }
});

// client-src/visual/HifiCompareBoard.tsx
function relatedRoleLabel(role) {
  switch (role) {
    case "sibling":
      return "同目录";
    case "import":
      return "引用";
    case "include":
      return "include";
    case "style":
      return "样式";
    case "resource":
      return "资源";
    case "entry":
      return "入口";
    default:
      return role || "关联";
  }
}
function formatHifiSavedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function diffStoreKey(data) {
  return `tracescope.diff.edits:${data.page.adapterId}:${data.page.relativePath}:${data.designHifiTree?.id || data.designName || ""}`;
}
function loadDiffOverrides(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function loadHiddenLayers(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key + ":hidden") || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}
function HifiCompareBoard({
  data,
  findings,
  onAiAnalyze,
  onRegenerate,
  openConfirmDialog,
  repoInput,
  designUrl,
  trackerReady,
  trackerProvider,
  onOpenTrackerSettings,
  onActionHint
}) {
  const [selectedKeys, setSelectedKeys] = (0, import_react2.useState)(() => /* @__PURE__ */ new Set());
  const [chatNote, setChatNote] = (0, import_react2.useState)("");
  const [sourceFilter, setSourceFilter] = (0, import_react2.useState)("all");
  const storeKey = (0, import_react2.useMemo)(() => diffStoreKey(data), [data]);
  const [overrides, setOverrides] = (0, import_react2.useState)(
    () => loadDiffOverrides(storeKey)
  );
  const [hiddenLayerIds, setHiddenLayerIds] = (0, import_react2.useState)(() => loadHiddenLayers(storeKey));
  const [pickHint, setPickHint] = (0, import_react2.useState)("");
  const userEraseRef = (0, import_react2.useRef)(false);
  const eraseDoneHintRef = (0, import_react2.useRef)("已删除图层（可点「恢复已删除图层」撤销）。");
  (0, import_react2.useEffect)(() => {
    setOverrides(loadDiffOverrides(storeKey));
    setHiddenLayerIds(loadHiddenLayers(storeKey));
    setSelectedKeys(/* @__PURE__ */ new Set());
  }, [storeKey]);
  (0, import_react2.useEffect)(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(overrides));
    } catch {
    }
  }, [storeKey, overrides]);
  (0, import_react2.useEffect)(() => {
    try {
      localStorage.setItem(storeKey + ":hidden", JSON.stringify(hiddenLayerIds));
    } catch {
    }
  }, [storeKey, hiddenLayerIds]);
  const diffs = data.result.diffs;
  const designBoxById = (0, import_react2.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    const put = (idRaw, box) => {
      const id = String(idRaw ?? "").trim();
      if (!id || map.has(id)) return;
      map.set(id, {
        x: Number(box.x) || 0,
        y: Number(box.y) || 0,
        width: Number(box.width) || 0,
        height: Number(box.height) || 0,
        name: box.name || id,
        kind: box.kind || "frame",
        text: box.text
      });
    };
    for (const b of data.designNodeBoxes ?? []) put(b.id, b);
    const walk = (n) => {
      put(n.id, {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        name: n.name,
        kind: n.kind,
        text: n.text
      });
      for (const c of n.inferredChildren ?? []) walk(c);
      for (const c of n.children ?? []) walk(c);
    };
    walk(data.designHifiTree);
    for (const m of data.designNoteMasks ?? []) {
      put(String(m.nodeId ?? ""), {
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        name: m.text,
        kind: "text",
        text: m.text
      });
    }
    return map;
  }, [data.designHifiTree, data.designNodeBoxes, data.designNoteMasks]);
  const resolveDesignBox = (0, import_react2.useMemo)(() => {
    const compactIndex = /* @__PURE__ */ new Map();
    const normalizeIndex = /* @__PURE__ */ new Map();
    for (const id of designBoxById.keys()) {
      const compact = id.replace(/[^0-9]/g, "");
      if (compact && !compactIndex.has(compact)) compactIndex.set(compact, id);
      const norm = id.replace(/-/g, ":");
      if (!normalizeIndex.has(norm)) normalizeIndex.set(norm, id);
    }
    return (rawId) => {
      const id = String(rawId ?? "").trim();
      if (!id) return void 0;
      const direct = designBoxById.get(id);
      if (direct) return direct;
      const norm = id.replace(/-/g, ":");
      const viaNorm = normalizeIndex.get(norm);
      if (viaNorm) return designBoxById.get(viaNorm);
      const compact = id.replace(/[^0-9]/g, "");
      if (compact) {
        const viaCompact = compactIndex.get(compact);
        if (viaCompact) return designBoxById.get(viaCompact);
      }
      return void 0;
    };
  }, [designBoxById]);
  const aiFindings = findings?.findings ?? [];
  const findingLocators = (0, import_react2.useMemo)(
    () => [...designBoxById.entries()].map(([id, box]) => ({
      id,
      name: box.name,
      text: box.text,
      width: box.width,
      height: box.height
    })),
    [designBoxById]
  );
  const unifiedItems = (0, import_react2.useMemo)(() => {
    const compact = (id) => id.replace(/[^0-9]/g, "");
    const absorbed = /* @__PURE__ */ new Set();
    const items = [];
    for (const f of aiFindings) {
      const rawNodeId = (f.nodeId ?? "").trim();
      const haystack = `${f.title} ${f.location ?? ""} ${f.expected ?? ""} ${f.actual ?? ""} ${f.suggestion ?? ""}`.toLowerCase();
      let codeId = "";
      let linkedDesignId = "";
      diffs.forEach((d, idx) => {
        if (!d.designNodeId) return;
        const sameId = rawNodeId && compact(d.designNodeId) === compact(rawNodeId);
        const nameInFinding = d.nodeName && (haystack.includes(String(d.nodeName).toLowerCase()) || (f.location || "").toLowerCase().includes(String(d.nodeName).toLowerCase()));
        if (!sameId && !nameInFinding) return;
        if (sameId && propertyCovered(d.property, haystack)) {
          absorbed.add(idx);
        }
        if (!linkedDesignId) linkedDesignId = String(d.designNodeId);
        if (!codeId && d.codeNodeId) codeId = String(d.codeNodeId);
      });
      const resolved = resolveFindingNodeId(
        {
          title: f.title,
          nodeId: rawNodeId || linkedDesignId || void 0,
          location: f.location,
          expected: f.expected,
          actual: f.actual,
          suggestion: f.suggestion
        },
        findingLocators
      ) || linkedDesignId || rawNodeId;
      items.push({
        key: "ai-" + items.length,
        source: "ai",
        severity: f.severity,
        headline: f.title,
        location: f.location,
        expected: f.expected,
        actual: f.actual,
        codeSource: f.codeSource,
        suggestion: f.suggestion,
        designId: String(resolved || ""),
        codeId
      });
    }
    diffs.forEach((d, idx) => {
      if (absorbed.has(idx)) return;
      items.push({
        key: "rule-" + idx,
        source: "rule",
        severity: d.severity,
        headline: `${PROP_LABEL[d.property] ?? d.property} · ${d.nodeName}`,
        expected: d.expected === void 0 ? void 0 : String(d.expected),
        actual: d.actual === void 0 ? void 0 : String(d.actual),
        designId: String(d.designNodeId ?? ""),
        codeId: String(d.codeNodeId ?? ""),
        needsReview: d.needsReview
      });
    });
    items.sort((a, b) => {
      const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (rank !== 0) return rank;
      if (a.source !== b.source) return a.source === "ai" ? -1 : 1;
      return 0;
    });
    return items;
  }, [aiFindings, diffs, findingLocators]);
  const displayItems = (0, import_react2.useMemo)(() => {
    return unifiedItems.map((item) => {
      const o = overrides[item.key];
      if (!o) return item;
      return {
        ...item,
        headline: o.headline ?? item.headline,
        expected: o.expected ?? item.expected,
        actual: o.actual ?? item.actual,
        note: o.note,
        deleted: !!o.deleted
      };
    }).filter((item) => !item.deleted);
  }, [unifiedItems, overrides]);
  const deletedItems = (0, import_react2.useMemo)(() => {
    return unifiedItems.map((item) => {
      const o = overrides[item.key];
      if (!o?.deleted) return null;
      return {
        ...item,
        headline: o.headline ?? item.headline,
        expected: o.expected ?? item.expected,
        actual: o.actual ?? item.actual,
        note: o.note,
        deleted: true
      };
    }).filter((item) => item != null);
  }, [unifiedItems, overrides]);
  const aiCount = displayItems.filter((i) => i.source === "ai").length;
  const ruleCount = displayItems.filter((i) => i.source === "rule").length;
  const visibleItems = displayItems.filter(
    (i) => sourceFilter === "all" || i.source === sourceFilter
  );
  const actionMeta = {
    repoPath: (repoInput || "").trim(),
    designName: data.designName || data.designHifiTree?.name || "",
    designUrl: (designUrl || "").trim(),
    codePath: data.page.relativePath,
    platformLabel: data.page.kindLabel || data.page.adapterId
  };
  const hint = (message) => {
    setChatNote(message);
    onActionHint?.(message);
  };
  const copyDiffs = async () => {
    const targets = selectedKeys.size ? visibleItems.filter((i) => selectedKeys.has(i.key)) : visibleItems;
    if (!targets.length) {
      hint(selectedKeys.size ? "当前选中项无可复制差异" : "当前没有可复制的差异");
      return;
    }
    try {
      await copyTextToClipboard(formatVisualDiffCopyText(targets, actionMeta));
      hint(`已复制 ${targets.length} 条差异`);
    } catch (err) {
      hint(`复制失败：${err.message}`);
    }
  };
  const exportDiffs = () => {
    const targets = selectedKeys.size ? visibleItems.filter((i) => selectedKeys.has(i.key)) : visibleItems;
    if (!targets.length) {
      hint(selectedKeys.size ? "当前选中项无可导出差异" : "当前没有可导出的差异");
      return;
    }
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `tracescope-ui-diff-${stamp}.md`;
    downloadTextFile(filename, formatVisualDiffExportMarkdown(targets, actionMeta));
    hint(`已导出：${filename}`);
  };
  const submitDiffs = () => {
    const targets = selectedKeys.size ? visibleItems.filter((i) => selectedKeys.has(i.key)) : visibleItems;
    if (!targets.length) {
      hint(selectedKeys.size ? "当前选中项无可提交差异" : "当前没有可提交的差异");
      return;
    }
    if (!trackerReady) {
      if (typeof openConfirmDialog === "function") {
        openConfirmDialog({
          title: "先配置协作平台？",
          message: "尚未配置完整的协作平台。请打开「仓库配置」选择云效 / GitHub / GitLab / Webhook 并保存。",
          confirmLabel: "打开配置",
          onConfirm: () => {
            onOpenTrackerSettings?.();
          }
        });
      } else {
        hint("请先在「仓库配置 → 协作平台」完成配置");
      }
      return;
    }
    if (typeof openConfirmDialog !== "function") {
      hint("当前宿主不支持弹窗输入，无法提交缺陷");
      return;
    }
    openConfirmDialog({
      title: "提交缺陷？",
      message: `将把 ${targets.length} 条 UI 差异提交到协作平台（${trackerProvider || "已配置"}）。可修改下方标题后再提交。`,
      inputLabel: "缺陷标题",
      inputValue: defaultVisualDefectSubject(targets, actionMeta),
      confirmLabel: "提交",
      onConfirm: (subject) => {
        const report = unifiedItemsToFailReport(targets, actionMeta);
        void fetch("/tracescope/v1/tracker-submit", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repoPath: actionMeta.repoPath,
            baseCommit: report.baseCommit,
            headCommit: report.headCommit,
            report,
            subject: String(subject || "").trim()
          })
        }).then(async (r) => {
          const text = await r.text();
          const data2 = text ? JSON.parse(text) : {};
          if (!r.ok) throw new Error(data2.error || "提交失败");
          let tip = `已提交到 ${data2.provider || trackerProvider || "协作平台"}`;
          if (data2.id) tip += `（ID ${data2.id}）`;
          tip += `，共 ${data2.count || targets.length} 条。`;
          if (data2.url) tip += ` 链接：${data2.url}`;
          hint(tip);
        }).catch((err) => {
          hint(`提交失败：${err.message}`);
        });
      }
    });
  };
  const visibleNoteMasks = (0, import_react2.useMemo)(() => {
    const hidden = new Set(hiddenLayerIds);
    const auto = (data.designNoteMasks ?? []).filter((m) => !m.nodeId || !hidden.has(m.nodeId));
    const manual = [];
    for (const id of hiddenLayerIds) {
      const box = resolveDesignBox(id);
      if (!box || box.width <= 0 || box.height <= 0) continue;
      if (id === data.designHifiTree.id) continue;
      const autoHit = (data.designNoteMasks ?? []).find((m) => m.nodeId === id);
      manual.push({
        text: box.text || box.name || id,
        nodeId: id,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        maskColor: autoHit?.maskColor || "transparent"
      });
    }
    const byId = /* @__PURE__ */ new Map();
    for (const m of auto) {
      const key = m.nodeId || `${m.x},${m.y},${m.width},${m.height}`;
      byId.set(key, m);
    }
    for (const m of manual) {
      const key = m.nodeId || `${m.x},${m.y},${m.width},${m.height}`;
      byId.set(key, m);
    }
    return [...byId.values()];
  }, [data.designNoteMasks, hiddenLayerIds, resolveDesignBox, data.designHifiTree.id]);
  const pickBoxes = (0, import_react2.useMemo)(() => {
    const map = new Map(designBoxById);
    for (const m of data.designNoteMasks ?? []) {
      const id = String(m.nodeId ?? "");
      if (!id || map.has(id)) continue;
      map.set(id, {
        x: Number(m.x) || 0,
        y: Number(m.y) || 0,
        width: Number(m.width) || 0,
        height: Number(m.height) || 0,
        name: m.text,
        kind: "text",
        text: m.text
      });
    }
    return map;
  }, [designBoxById, data.designNoteMasks]);
  const computedScale = (0, import_react2.useMemo)(() => {
    const available = 360;
    return Math.min(1, available / data.viewport.width);
  }, [data.viewport.width]);
  const w = data.viewport.width * computedScale;
  const h = data.viewport.height * computedScale;
  const selectedHotspots = (0, import_react2.useMemo)(() => {
    const out = [];
    const seenBoxes = /* @__PURE__ */ new Set();
    for (const item of visibleItems) {
      if (!selectedKeys.has(item.key) || !item.designId) continue;
      const box = resolveDesignBox(item.designId);
      if (!box || box.width <= 0 || box.height <= 0) continue;
      const boxKey = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`;
      const existingIdx = out.findIndex((h2) => {
        const k = `${Math.round(h2.box.x)},${Math.round(h2.box.y)},${Math.round(h2.box.width)},${Math.round(h2.box.height)}`;
        return k === boxKey;
      });
      const color = SEVERITY_TEXT[item.severity];
      if (existingIdx >= 0) {
        const prev = out[existingIdx];
        const prevRank = prev.color === SEVERITY_TEXT.high ? 3 : prev.color === SEVERITY_TEXT.medium ? 2 : 1;
        const nextRank = item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 1;
        if (nextRank > prevRank) out[existingIdx] = { key: item.key, color, box };
        continue;
      }
      if (seenBoxes.has(boxKey)) continue;
      seenBoxes.add(boxKey);
      out.push({ key: item.key, color, box });
    }
    return out;
  }, [visibleItems, selectedKeys, resolveDesignBox]);
  const designFrameRef = (0, import_react2.useRef)(null);
  function toggleItem(item) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
    const willSelect = !selectedKeys.has(item.key);
    if (willSelect) {
      if (item.designId && !resolveDesignBox(item.designId)) {
        setPickHint("该差异缺少可定位的设计节点坐标，无法在对照图上高亮。");
      } else {
        setPickHint("");
        requestAnimationFrame(() => {
          designFrameRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    } else {
      setPickHint("");
    }
  }
  function clearMarkers() {
    setSelectedKeys(/* @__PURE__ */ new Set());
    setPickHint("");
  }
  function patchOverride(key, patch) {
    setOverrides((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      if (patch.deleted === false && !patch.note && !patch.headline && !patch.expected && !patch.actual) {
      }
      return next;
    });
  }
  function hideLayer(nodeId) {
    if (!nodeId) return;
    userEraseRef.current = true;
    eraseDoneHintRef.current = "已删除图层（可点「恢复已删除图层」撤销）。";
    setPickHint("正在清理图层…");
    setHiddenLayerIds((prev) => prev.includes(nodeId) ? prev : [...prev, nodeId]);
  }
  function findLayerAt(x, y) {
    let bestId = "";
    let bestArea = Number.POSITIVE_INFINITY;
    for (const [id, box] of pickBoxes) {
      if (hiddenLayerIds.includes(id)) continue;
      if (id === data.designHifiTree.id) continue;
      if (x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height) continue;
      const area = Math.max(1, box.width * box.height);
      if (area < bestArea) {
        bestArea = area;
        bestId = id;
      }
    }
    return bestId;
  }
  function sendToChat() {
    if (typeof onAiAnalyze !== "function") {
      setChatNote("当前客户端不支持 AI 协助分析，请手动把布局源码与设计稿链接发给会话。");
      return;
    }
    onAiAnalyze({
      adapterId: data.page.adapterId,
      relativePath: data.page.relativePath
    });
    setChatNote("正在读取代码源码、把分析提示填入当前会话输入框…");
  }
  const modeLabel = data.compareMode === "heuristic" ? "启发式静态" : data.compareMode === "exact" ? "属性级" : null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 12 }, children: [
    data.fromCache && data.savedAt ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 11,
          color: "#8a7a5c",
          background: "#f7f2e9",
          border: "1px solid #e6ddcb",
          borderRadius: 6,
          padding: "4px 8px",
          marginBottom: 8
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            "读取自缓存（",
            formatHifiSavedAt(data.savedAt),
            "），可直接查看；如需最新结果请重新生成。"
          ] }),
          onRegenerate ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: COL.clearBtn, onClick: onRegenerate, children: "重新生成" }) : null
        ]
      }
    ) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: 6, fontSize: 12, color: "#5f584c" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "设计稿对照" }),
      modeLabel ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "span",
        {
          style: {
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 700,
            color: "#0f6e56",
            background: "#e3f1ea",
            borderRadius: 4,
            padding: "1px 6px"
          },
          children: modeLabel
        }
      ) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { marginLeft: 8, color: "#8a7f70" }, children: [
        data.page.kindLabel ?? data.page.adapterId,
        " · ",
        data.page.relativePath
      ] })
    ] }),
    (data.relatedFiles?.length ?? 0) > 1 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { style: { marginBottom: 8, fontSize: 11, color: "#5f584c" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { style: { cursor: "pointer", userSelect: "none" }, children: [
        "关联文件 ",
        data.relatedFiles.length - 1,
        " 个（入口仍为上方单文件）"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "ul",
        {
          style: {
            margin: "6px 0 0",
            paddingLeft: 18,
            maxHeight: 120,
            overflow: "auto",
            lineHeight: 1.5
          },
          children: data.relatedFiles.filter((f) => f.role !== "entry").map((f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { title: f.reason || f.role, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: "#8a7f70" }, children: [
              "[",
              relatedRoleLabel(f.role),
              "]"
            ] }),
            " ",
            f.relativePath
          ] }, f.relativePath))
        }
      )
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: 11, color: "#8a7f70", marginBottom: 6 }, children: [
      "自动删除识别到的设计师备注；也可点击图上图层继续删除（从渲染图中擦除该区域像素，不是盖白块）。",
      hiddenLayerIds.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          style: { ...COL.clearBtn, marginLeft: 8, padding: "1px 8px" },
          onClick: () => {
            userEraseRef.current = true;
            eraseDoneHintRef.current = "已恢复图层。";
            setPickHint("正在恢复图层…");
            setHiddenLayerIds([]);
          },
          children: [
            "恢复已删除图层（",
            hiddenLayerIds.length,
            "）"
          ]
        }
      ) : null
    ] }),
    pickHint ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 11, color: "#0f6e56", marginBottom: 6 }, children: pickHint }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { ref: designFrameRef, style: { ...COL.frame, width: w, height: h, position: "relative" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { transform: `scale(${computedScale})`, transformOrigin: "top left" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        RasterDesignView,
        {
          imageUrl: data.designImageUrl,
          viewport: data.viewport,
          eraseRegions: visibleNoteMasks,
          onBusyChange: (busy) => {
            if (!busy && userEraseRef.current) {
              userEraseRef.current = false;
              setPickHint(eraseDoneHintRef.current);
            }
          },
          onPick: (x, y) => {
            const id = findLayerAt(x, y);
            if (!id) {
              setPickHint("未点中可删除图层，请点文字/标注区域。");
              return;
            }
            const box = pickBoxes.get(id);
            const label = box?.text || box?.name || id;
            if (window.confirm(`从对照图中删除图层「${label}」？
（擦除该区域像素；可随时恢复）`)) {
              hideLayer(id);
            }
          }
        }
      ) }),
      selectedHotspots.map((spot) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          "aria-hidden": true,
          style: {
            position: "absolute",
            left: spot.box.x * computedScale,
            top: spot.box.y * computedScale,
            width: Math.max(4, spot.box.width * computedScale),
            height: Math.max(4, spot.box.height * computedScale),
            border: `2px solid ${spot.color}`,
            background: `${spot.color}33`,
            boxShadow: `0 0 0 1px #fff, 0 0 0 3px ${spot.color}`,
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 6,
            borderRadius: 2
          }
        },
        spot.key + ":" + Math.round(spot.box.x) + "," + Math.round(spot.box.y)
      ))
    ] }),
    data.aiInferenceNote ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: COL.aiNote, children: data.aiInferenceNote }) : null,
    chatNote ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: COL.chatNote, children: chatNote }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { style: { fontSize: 12 }, children: [
              "差异清单（",
              visibleItems.length,
              selectedKeys.size ? `，已选 ${selectedKeys.size}` : "",
              "，点击多选 / 再点取消）"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: COL.aiBtn, onClick: sendToChat, children: "AI 协助分析" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: COL.clearBtn, onClick: () => void copyDiffs(), children: selectedKeys.size ? `复制选中(${selectedKeys.size})` : "复制差异" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: COL.clearBtn, onClick: submitDiffs, children: selectedKeys.size ? `提交选中(${selectedKeys.size})` : "提交缺陷" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: COL.clearBtn, onClick: exportDiffs, children: selectedKeys.size ? `导出选中(${selectedKeys.size})` : "导出报告" }),
              onRegenerate ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: COL.clearBtn, onClick: onRegenerate, children: "重新生成" }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  style: COL.clearBtn,
                  onClick: clearMarkers,
                  disabled: !selectedKeys.size,
                  title: "清除清单选中与对照图高亮",
                  children: "清除选中"
                }
              )
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        FilterTabs,
        {
          filter: sourceFilter,
          onChange: setSourceFilter,
          aiCount,
          ruleCount
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }, children: [
        visibleItems.slice(0, 80).map((item) => {
          const isActive = selectedKeys.has(item.key);
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            UnifiedCard,
            {
              item,
              active: isActive,
              onSelect: () => toggleItem(item),
              onDelete: () => patchOverride(item.key, { deleted: true }),
              onOpenEditor: (mode) => {
                if (typeof openConfirmDialog !== "function") {
                  setChatNote(
                    "当前宿主不支持弹窗输入。请更新插件后重试，或在 DeepSeek Harness 桌面端使用。"
                  );
                  return;
                }
                if (mode === "note") {
                  openConfirmDialog({
                    title: "添加备注",
                    message: item.headline,
                    inputLabel: "备注",
                    inputValue: item.note || "",
                    multiline: true,
                    confirmLabel: "保存备注",
                    onConfirm: (value) => {
                      patchOverride(item.key, { note: String(value ?? "").trim() });
                    }
                  });
                  return;
                }
                openConfirmDialog({
                  title: "编辑差异",
                  message: item.headline,
                  fields: [
                    { key: "headline", label: "标题", value: item.headline },
                    { key: "expected", label: "设计稿期望", value: item.expected || "" },
                    { key: "actual", label: "实际值", value: item.actual || "" }
                  ],
                  confirmLabel: "保存",
                  onConfirm: (value) => {
                    const map = value && typeof value === "object" ? value : {};
                    patchOverride(item.key, {
                      headline: map.headline ?? item.headline,
                      expected: map.expected ?? item.expected,
                      actual: map.actual ?? item.actual
                    });
                  }
                });
              }
            },
            item.key
          );
        }),
        visibleItems.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12, color: "#8a7f70", padding: "6px 2px" }, children: "当前筛选下没有差异项。" }) : null
      ] }),
      deletedItems.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginTop: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 6
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { style: { fontSize: 12, color: "#8a7f70" }, children: [
                "已删除（误报）· ",
                deletedItems.length
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  style: COL.clearBtn,
                  onClick: () => {
                    setOverrides((prev) => {
                      const next = { ...prev };
                      for (const item of deletedItems) {
                        const cur = next[item.key];
                        if (!cur) continue;
                        const { deleted: _d, ...rest } = cur;
                        if (rest.note || rest.headline || rest.expected || rest.actual) {
                          next[item.key] = rest;
                        } else {
                          delete next[item.key];
                        }
                      }
                      return next;
                    });
                  },
                  children: "全部恢复"
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 5 }, children: deletedItems.slice(0, 40).map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            style: {
              fontSize: 12,
              lineHeight: 1.5,
              border: "1px dashed #d9d2c4",
              background: "#faf8f4",
              borderRadius: 8,
              padding: "6px 8px",
              color: "#8a7f70",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { minWidth: 0 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { textDecoration: "line-through" }, children: item.headline }),
                item.note ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: 11, marginTop: 2 }, children: [
                  "备注：",
                  item.note
                ] }) : null
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  style: COL.miniBtn,
                  onClick: () => {
                    setOverrides((prev) => {
                      const cur = prev[item.key];
                      if (!cur) return prev;
                      const { deleted: _d, ...rest } = cur;
                      const next = { ...prev };
                      if (rest.note || rest.headline || rest.expected || rest.actual) {
                        next[item.key] = rest;
                      } else {
                        delete next[item.key];
                      }
                      return next;
                    });
                  },
                  children: "恢复"
                }
              )
            ]
          },
          `del-${item.key}`
        )) })
      ] }) : null
    ] })
  ] });
}
function propertyCovered(property, aiText) {
  const tokens = {
    width: ["宽度", "宽", "width"],
    height: ["高度", "高", "height"],
    marginTop: ["上间距", "上边距", "顶部间距", "margin-top"],
    marginBottom: ["下间距", "下边距", "底部间距", "margin-bottom"],
    marginLeft: ["左间距", "左边距", "margin-left"],
    marginRight: ["右间距", "右边距", "margin-right"],
    paddingTop: ["上内边距", "padding-top"],
    paddingBottom: ["下内边距", "padding-bottom"],
    paddingLeft: ["左内边距", "padding-left"],
    paddingRight: ["右内边距", "padding-right"],
    backgroundColor: ["背景色", "背景", "background"],
    color: ["文字颜色", "字色", "颜色", "color"],
    fontSize: ["字号", "字体大小", "font-size"],
    cornerRadius: ["圆角", "圆弧", "弧度", "corner", "radius"],
    borderWidth: ["边框粗细", "描边粗细", "border"],
    borderColor: ["边框颜色", "描边颜色", "border"],
    fontWeight: ["字重", "粗细", "font-weight"],
    opacity: ["透明度", "opacity"],
    text: ["文案", "文字", "文本", "text"],
    controlCount: ["控件", "组件", "control"]
  };
  const keys = tokens[property];
  if (!keys) return false;
  return keys.some((k) => aiText.includes(k.toLowerCase()));
}
function FilterTabs({
  filter,
  onChange,
  aiCount,
  ruleCount
}) {
  const tabs = [
    ["all", `全部 ${aiCount + ruleCount}`],
    ["ai", `AI 确权 ${aiCount}`],
    ["rule", `规则比对 ${ruleCount}`]
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: tabs.map(([id, label]) => {
    const active2 = filter === id;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        onClick: () => onChange(id),
        style: {
          fontSize: 11,
          borderRadius: 999,
          padding: "2px 10px",
          cursor: "pointer",
          border: "1px solid " + (active2 ? "#0f6e56" : "#d9d2c4"),
          background: active2 ? "#0f6e56" : "#fff",
          color: active2 ? "#fff" : "#5f584c"
        },
        children: label
      },
      id
    );
  }) });
}
function UnifiedCard({
  item,
  active: active2,
  onSelect,
  onDelete,
  onOpenEditor
}) {
  const isAi = item.source === "ai";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      style: {
        textAlign: "left",
        fontSize: 12,
        lineHeight: 1.6,
        border: "1px solid " + (active2 ? "#0f6e56" : isAi ? "#cfe0d8" : "#e6dfd0"),
        background: active2 ? "#f2f8f5" : isAi ? "#f7fbf9" : "#fff",
        borderRadius: 8,
        padding: "6px 8px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            role: "button",
            tabIndex: 0,
            "aria-pressed": active2,
            onClick: onSelect,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            },
            style: {
              display: "block",
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              color: "inherit"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    "aria-hidden": true,
                    style: {
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      marginRight: 6,
                      borderRadius: 3,
                      border: "1px solid " + (active2 ? "#0f6e56" : "#c4bba8"),
                      background: active2 ? "#0f6e56" : "#fff",
                      color: "#fff",
                      fontSize: 10,
                      lineHeight: "12px",
                      textAlign: "center",
                      verticalAlign: "middle",
                      fontWeight: 700
                    },
                    children: active2 ? "✓" : ""
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: SEVERITY_TEXT[item.severity], fontWeight: 700 }, children: [
                  "[",
                  SEVERITY_LABEL[item.severity],
                  "]"
                ] }),
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    style: {
                      fontSize: 10,
                      fontWeight: 700,
                      color: isAi ? "#0f6e56" : "#8a7f70",
                      background: isAi ? "#e3f1ea" : "#f1ede3",
                      borderRadius: 4,
                      padding: "0 5px",
                      marginRight: 4
                    },
                    children: isAi ? "AI 确权" : "规则比对"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: item.headline }),
                item.location ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: "#7a8a82", fontWeight: 400 }, children: [
                  " · ",
                  item.location
                ] }) : null,
                item.needsReview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "#9a6700" }, children: "（需人工确认）" }) : null
              ] }),
              item.expected ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "#335047" }, children: [
                "设计稿：",
                item.expected
              ] }) : null,
              item.actual ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "#8a4b33" }, children: [
                "实际：",
                item.actual
              ] }) : null,
              item.codeSource ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "#8a7f60", wordBreak: "break-all" }, children: [
                "代码来源：",
                item.codeSource
              ] }) : null,
              item.suggestion ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "#0f6e56" }, children: [
                "修改建议：",
                item.suggestion
              ] }) : null,
              item.note ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { color: "#5f584c" }, children: [
                "备注：",
                item.note
              ] }) : null
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              style: COL.miniBtn,
              onClick: (e) => {
                e.stopPropagation();
                if (window.confirm("确认删除这条差异？删除后视为误报，仅本机记住，可在下方恢复。"))
                  onDelete();
              },
              children: "删除"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              style: COL.miniBtn,
              onClick: (e) => {
                e.stopPropagation();
                onOpenEditor("note");
              },
              children: "备注"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              style: COL.miniBtn,
              onClick: (e) => {
                e.stopPropagation();
                onOpenEditor("edit");
              },
              children: "编辑"
            }
          )
        ] })
      ]
    }
  );
}
function isOpaqueCssColor(color) {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (!c || c === "transparent" || c === "rgba(0,0,0,0)" || c === "#00000000") return false;
  return true;
}
function sampleRingColor(ctx, x, y, w, h, imgW, imgH) {
  const pad = 3;
  const left = Math.max(0, Math.floor(x - pad));
  const top = Math.max(0, Math.floor(y - pad));
  const right = Math.min(imgW, Math.ceil(x + w + pad));
  const bottom = Math.min(imgH, Math.ceil(y + h + pad));
  const rw = Math.max(1, right - left);
  const rh = Math.max(1, bottom - top);
  let data;
  try {
    data = ctx.getImageData(left, top, rw, rh);
  } catch {
    return "#f5f5f5";
  }
  const innerL = Math.max(0, Math.floor(x) - left);
  const innerT = Math.max(0, Math.floor(y) - top);
  const innerR = Math.min(rw, Math.ceil(x + w) - left);
  const innerB = Math.min(rh, Math.ceil(y + h) - top);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const px = data.data;
  for (let row = 0; row < rh; row += 2) {
    for (let col = 0; col < rw; col += 2) {
      const inside = row >= innerT && row < innerB && col >= innerL && col < innerR;
      if (inside) continue;
      const i = (row * rw + col) * 4;
      r += px[i] ?? 0;
      g += px[i + 1] ?? 0;
      b += px[i + 2] ?? 0;
      n += 1;
    }
  }
  if (!n) return "#f5f5f5";
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}
function regionKey(r) {
  return `${r.nodeId || ""}|${Math.round(r.x)}|${Math.round(r.y)}|${Math.round(r.width)}|${Math.round(r.height)}`;
}
function loadProxiedDesignImage(imageUrl) {
  if (!imageUrl) return Promise.resolve("");
  if (imageUrl.startsWith("data:")) return Promise.resolve(imageUrl);
  const hit = proxyImageCache.get(imageUrl);
  if (hit) return hit;
  const pending2 = fetch(`/tracescope/v1/proxy-image?url=${encodeURIComponent(imageUrl)}`, {
    credentials: "same-origin"
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok || !data.dataUrl) throw new Error(data.error || "图片代理失败");
    return data.dataUrl;
  }).catch((err) => {
    proxyImageCache.delete(imageUrl);
    throw err;
  });
  proxyImageCache.set(imageUrl, pending2);
  return pending2;
}
function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    if (!src.startsWith("data:")) el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("设计稿图片加载失败"));
    el.src = src;
  });
}
function paintRegionsOnCanvas(ctx, canvas, regions, logicalSize) {
  const sx = canvas.width / Math.max(1, logicalSize.width);
  const sy = canvas.height / Math.max(1, logicalSize.height);
  for (const region of regions) {
    const x = Math.max(0, Math.floor(region.x * sx));
    const y = Math.max(0, Math.floor(region.y * sy));
    const w = Math.max(1, Math.ceil(region.width * sx));
    const h = Math.max(1, Math.ceil(region.height * sy));
    const fill = isOpaqueCssColor(region.maskColor) ? region.maskColor : sampleRingColor(ctx, x, y, w, h, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
}
async function eraseRegionsFromImage(imageUrl, regions, logicalSize) {
  if (!regions.length) {
    eraseSession = null;
    return imageUrl;
  }
  const source = await loadProxiedDesignImage(imageUrl);
  const keys = regions.map(regionKey);
  const keySet = new Set(keys);
  if (eraseSession && eraseSession.imageUrl === imageUrl && eraseSession.keys.every((k) => keySet.has(k)) && keys.length >= eraseSession.keys.length) {
    const prevSet = new Set(eraseSession.keys);
    const added = regions.filter((r) => !prevSet.has(regionKey(r)));
    if (added.length === 0 && keys.length === eraseSession.keys.length) {
      return eraseSession.resultUrl;
    }
    const canvas2 = eraseSession.canvas;
    const ctx2 = canvas2.getContext("2d");
    if (ctx2 && added.length) {
      paintRegionsOnCanvas(ctx2, canvas2, added, logicalSize);
      const resultUrl2 = canvas2.toDataURL("image/jpeg", 0.82);
      eraseSession = { imageUrl, keys, canvas: canvas2, resultUrl: resultUrl2 };
      return resultUrl2;
    }
  }
  const img = await loadHtmlImage(source);
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const maxEdge = Math.max(960, Math.round(Math.max(logicalSize.width, logicalSize.height) * 2));
  const scale = Math.min(1, maxEdge / Math.max(natW, natH, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(natW * scale));
  canvas.height = Math.max(1, Math.round(natH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  paintRegionsOnCanvas(ctx, canvas, regions, logicalSize);
  let resultUrl;
  try {
    resultUrl = canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return imageUrl;
  }
  eraseSession = { imageUrl, keys, canvas, resultUrl };
  return resultUrl;
}
function RasterDesignView({
  imageUrl,
  viewport,
  eraseRegions,
  onPick,
  onBusyChange
}) {
  const [displayUrl, setDisplayUrl] = (0, import_react2.useState)(imageUrl || "");
  const [cleaning, setCleaning] = (0, import_react2.useState)(false);
  const regionsSig = JSON.stringify(
    (eraseRegions ?? []).map((r) => [r.nodeId, r.x, r.y, r.width, r.height, r.maskColor])
  );
  (0, import_react2.useEffect)(() => {
    let cancelled = false;
    if (!imageUrl) {
      setDisplayUrl("");
      setCleaning(false);
      return;
    }
    const regions = eraseRegions ?? [];
    setDisplayUrl(imageUrl);
    const needsProxy = /^https?:\/\//i.test(imageUrl);
    if (!regions.length && !needsProxy) {
      setCleaning(false);
      return;
    }
    setCleaning(true);
    (async () => {
      try {
        if (!regions.length) {
          const url2 = needsProxy ? await loadProxiedDesignImage(imageUrl) : imageUrl;
          if (!cancelled) setDisplayUrl(url2);
          return;
        }
        const url = await eraseRegionsFromImage(imageUrl, regions, viewport);
        if (!cancelled) setDisplayUrl(url);
      } catch {
        if (!cancelled) setDisplayUrl(imageUrl);
      } finally {
        if (!cancelled) {
          setCleaning(false);
          onBusyChange?.(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, viewport.width, viewport.height, regionsSig]);
  if (!imageUrl) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        style: {
          width: viewport.width,
          height: viewport.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8a7f70",
          fontSize: 12
        },
        children: "官方渲染图加载失败，请重新生成或检查 Figma 链接"
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      style: {
        position: "relative",
        width: viewport.width,
        height: viewport.height,
        overflow: "hidden",
        cursor: onPick ? "crosshair" : "default"
      },
      onClick: (e) => {
        if (!onPick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * viewport.width;
        const y = (e.clientY - rect.top) / rect.height * viewport.height;
        onPick(x, y);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "img",
          {
            src: displayUrl || imageUrl,
            alt: "",
            style: {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "fill",
              display: "block",
              pointerEvents: "none"
            }
          }
        ),
        cleaning ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            style: {
              position: "absolute",
              left: 8,
              bottom: 8,
              zIndex: 2,
              pointerEvents: "none",
              background: "rgba(16,24,40,0.72)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              padding: "4px 8px"
            },
            children: "正在清理备注…"
          }
        ) : null
      ]
    }
  );
}
var import_react2, import_jsx_runtime2, SEVERITY_RANK, SEVERITY_LABEL, SEVERITY_TEXT, PROP_LABEL, proxyImageCache, eraseSession, COL;
var init_HifiCompareBoard = __esm({
  "client-src/visual/HifiCompareBoard.tsx"() {
    "use strict";
    import_react2 = require("react");
    init_resolve_finding_node();
    init_diff_actions();
    import_jsx_runtime2 = require("react/jsx-runtime");
    SEVERITY_RANK = { high: 3, medium: 2, low: 0 };
    SEVERITY_LABEL = { high: "高", medium: "中", low: "低" };
    SEVERITY_TEXT = {
      high: "#d92d20",
      medium: "#dc8a05",
      low: "#2f62b9"
    };
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
      cornerRadii: "四角圆角",
      borderWidth: "边框粗细",
      borderColor: "边框颜色",
      borderTopWidth: "上边框宽",
      borderRightWidth: "右边框宽",
      borderBottomWidth: "下边框宽",
      borderLeftWidth: "左边框宽",
      borderTopColor: "上边框色",
      borderRightColor: "右边框色",
      borderBottomColor: "下边框色",
      borderLeftColor: "左边框色",
      fontWeight: "字重",
      opacity: "透明度",
      elevation: "阴影/海拔",
      shadow: "外阴影",
      innerShadow: "内阴影",
      insetShadow: "内阴影参数",
      shadows: "阴影叠层",
      blur: "模糊",
      blendMode: "混合模式",
      rotation: "旋转",
      scaleX: "缩放X",
      scaleY: "缩放Y",
      skewX: "倾斜X",
      skewY: "倾斜Y",
      zIndex: "层叠顺序",
      fills: "填充叠层",
      strokeAlign: "描边对齐",
      textAlign: "对齐",
      textDecoration: "文字装饰",
      textTransform: "文字大小写",
      overflow: "溢出裁剪",
      clipPath: "裁剪路径",
      aspectRatio: "宽高比",
      maxLines: "最大行数",
      textOverflow: "文本溢出",
      minWidth: "最小宽度",
      maxWidth: "最大宽度",
      minHeight: "最小高度",
      maxHeight: "最大高度",
      textAdvanceWidth: "文本固有宽",
      textBlockHeight: "文本块高",
      flexDirection: "主轴方向",
      alignItems: "交叉轴对齐",
      justifyContent: "主轴分布",
      fontStyle: "字体样式",
      textAlignVertical: "垂直对齐",
      borderStyle: "描边样式",
      strokeDashArray: "虚线间隔",
      strokeCap: "线帽",
      strokeJoin: "线连接",
      paragraphSpacing: "段间距",
      sizingHorizontal: "横向尺寸模式",
      sizingVertical: "纵向尺寸模式",
      backdropBlur: "背景模糊",
      position: "定位",
      rowGap: "行间距",
      columnGap: "列间距",
      flexWrap: "换行",
      alignContent: "多行对齐",
      order: "排列顺序",
      gridTemplate: "网格轨道",
      alignSelf: "自身对齐",
      flexGrow: "弹性放大",
      flexShrink: "弹性缩小",
      transformOrigin: "变换原点",
      visibility: "可见性",
      display: "显示",
      whiteSpace: "空白处理",
      wordBreak: "断词",
      wordSpacing: "词间距",
      textIndent: "首行缩进",
      perspective: "透视",
      rotateX: "X轴旋转",
      rotateY: "Y轴旋转",
      textShadow: "文字阴影",
      direction: "书写方向",
      writingMode: "书写模式",
      filter: "滤镜",
      outline: "轮廓",
      imageFit: "图片适配",
      imagePosition: "图片锚点",
      gradient: "渐变",
      text: "文案",
      controlCount: "控件规模"
    };
    proxyImageCache = /* @__PURE__ */ new Map();
    eraseSession = null;
    COL = {
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
      },
      chatNote: {
        marginTop: 8,
        fontSize: 12,
        color: "#0f6e56",
        background: "#eef7f2",
        border: "1px solid #cfe6da",
        borderRadius: 8,
        padding: "6px 10px"
      },
      aiBtn: {
        fontSize: 11,
        borderRadius: 7,
        border: "1px solid #0f6e56",
        background: "#0f6e56",
        color: "#fff",
        padding: "3px 10px",
        cursor: "pointer",
        flexShrink: 0
      },
      clearBtn: {
        fontSize: 11,
        borderRadius: 7,
        border: "1px solid #d9d2c4",
        background: "#fff",
        color: "#5f584c",
        padding: "3px 10px",
        cursor: "pointer",
        flexShrink: 0
      },
      editInput: {
        width: "100%",
        boxSizing: "border-box",
        fontSize: 12,
        padding: "6px 8px",
        borderRadius: 6,
        border: "1px solid #d9d2c4",
        fontFamily: "inherit",
        marginTop: 4
      },
      miniBtn: {
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        border: "1px solid #d9d2c4",
        background: "#fff",
        cursor: "pointer",
        color: "#5f584c"
      },
      modalBackdrop: {
        position: "fixed",
        inset: 0,
        background: "rgba(16, 24, 40, 0.45)",
        zIndex: 1e5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      },
      modalPanel: {
        width: "min(420px, 100%)",
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #d9d2c4",
        padding: 14,
        boxShadow: "0 12px 40px rgba(16,24,40,0.18)"
      },
      modalLabel: {
        display: "flex",
        flexDirection: "column",
        fontSize: 12,
        color: "#5f584c"
      }
    };
  }
});

// client-src/visual/LoadingOverlay.tsx
function LoadingOverlay({ message, elapsedSeconds }) {
  const spinnerCss = "@keyframes tracescope-loading-spin{to{transform:rotate(360deg)}}";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("style", { children: spinnerCss }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        role: "status",
        "aria-live": "polite",
        "aria-busy": "true",
        style: O.backdrop,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onMouseDown: (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: O.banner, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "svg",
            {
              style: O.spinner,
              viewBox: "0 0 28 28",
              width: "28",
              height: "28",
              "aria-hidden": "true",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "circle",
                  {
                    cx: "14",
                    cy: "14",
                    r: "11",
                    fill: "none",
                    stroke: "#e4ddd0",
                    strokeWidth: "3"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "circle",
                  {
                    cx: "14",
                    cy: "14",
                    r: "11",
                    fill: "none",
                    stroke: "#0f6e56",
                    strokeWidth: "3",
                    strokeLinecap: "round",
                    strokeDasharray: "52 100",
                    style: O.spinnerArc
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: O.title, children: "加载中，请稍候" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: O.message, children: message || "正在处理请求，网络较慢时请勿重复操作。" }),
          typeof elapsedSeconds === "number" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: O.elapsed, children: [
            "已用时 ",
            elapsedSeconds,
            " 秒"
          ] }) : null
        ] })
      }
    )
  ] });
}
var import_jsx_runtime3, O;
var init_LoadingOverlay = __esm({
  "client-src/visual/LoadingOverlay.tsx"() {
    "use strict";
    import_jsx_runtime3 = require("react/jsx-runtime");
    O = {
      backdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 1e4,
        background: "rgba(28, 25, 21, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        cursor: "wait"
      },
      banner: {
        maxWidth: 380,
        width: "100%",
        borderRadius: 12,
        padding: "16px 18px",
        background: "var(--dsh-card, #fffdf8)",
        border: "1px solid var(--dsh-border, #ddd4c5)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
        textAlign: "center"
      },
      spinner: {
        display: "block",
        margin: "0 auto 10px"
      },
      spinnerArc: {
        // Rotate the arc around the circle's own center so it stays a perfect ring.
        transformOrigin: "14px 14px",
        animation: "tracescope-loading-spin 0.8s linear infinite"
      },
      title: { fontWeight: 700, marginBottom: 6, fontSize: 14 },
      message: { color: "#6b645a", fontSize: 12, lineHeight: 1.5 },
      elapsed: { marginTop: 8, fontSize: 11, color: "#8a7f70" }
    };
  }
});

// client-src/visual/VisualComparePanel.tsx
var VisualComparePanel_exports = {};
__export(VisualComparePanel_exports, {
  VisualComparePanel: () => VisualComparePanel
});
function collectDynamicRegionsFromHifi(root) {
  if (!root) return [];
  const out = [];
  const walk = (n) => {
    if (n.dynamic || n.kind === "dynamic") {
      out.push({
        id: n.id,
        name: n.name,
        width: Math.round(n.width),
        height: Math.round(n.height),
        filled: Boolean(n.inferredChildren?.length),
        itemRendered: Boolean(n.itemRendered)
      });
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out;
}
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
function uiRepoKey(repoInput, field) {
  return UI_CONFIG_PREFIX + field + ":" + repoInput.trim();
}
function uiGlobalKey(field) {
  return UI_CONFIG_GLOBAL_PREFIX + field;
}
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
  }
}
function hasRepoUiConfig(repoInput) {
  return readStorage(uiRepoKey(repoInput, UI_CONFIG_FIGMA_URL)) != null || readStorage(uiRepoKey(repoInput, UI_CONFIG_FIGMA_TOKEN)) != null || readStorage(uiRepoKey(repoInput, UI_CONFIG_LANHU_COOKIE)) != null;
}
function readRepoUiConfig(repoInput, field) {
  return readStorage(uiRepoKey(repoInput, field)) ?? "";
}
function readGlobalUiConfig(field) {
  return readStorage(uiGlobalKey(field)) ?? "";
}
function resolveUiConfig(repoInput, field) {
  if (hasRepoUiConfig(repoInput)) return readRepoUiConfig(repoInput, field);
  return readGlobalUiConfig(field);
}
function writeUiConfig(repoInput, field, value) {
  const trimmed = value.trim();
  writeStorage(uiRepoKey(repoInput, field), trimmed);
  writeStorage(uiGlobalKey(field), trimmed);
}
function clearUiConfigField(repoInput, field) {
  writeStorage(uiRepoKey(repoInput, field), "");
  writeStorage(uiGlobalKey(field), "");
}
function labelForDesignUrl(url) {
  try {
    if (/lanhuapp\.com|lanhu\.woa\.com/i.test(url)) {
      const hashQ = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      const params = new URLSearchParams(hashQ.includes("#") ? hashQ.slice(hashQ.indexOf("?") + 1) : hashQ);
      const fromHash = (() => {
        try {
          const u2 = new URL(url);
          const q = u2.hash.includes("?") ? u2.hash.slice(u2.hash.indexOf("?") + 1) : u2.search.slice(1);
          return new URLSearchParams(q);
        } catch {
          return params;
        }
      })();
      const imageId = fromHash.get("image_id") || fromHash.get("imageId") || "";
      const projectId = fromHash.get("project_id") || fromHash.get("pid") || "";
      if (imageId) return `蓝湖 · ${imageId.slice(0, 8)}`;
      if (projectId) return `蓝湖项目 · ${projectId.slice(0, 8)}`;
      return "蓝湖设计稿";
    }
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const name2 = parts.length >= 3 ? decodeURIComponent(parts[2].replace(/-/g, " ")) : "";
    const node = u.searchParams.get("node-id") || "";
    if (name2 && node) return `${name2} · node ${node}`;
    if (name2) return name2;
    if (node) return `node ${node}`;
    return u.hostname + u.pathname;
  } catch {
    return url.slice(0, 48);
  }
}
function isLikelyFigmaUrl(url) {
  try {
    const u = new URL(url.trim());
    return u.hostname.includes("figma.com") && /\/(design|file|proto)\//.test(u.pathname);
  } catch {
    return false;
  }
}
function isLikelyLanhuUrl(url) {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host.includes("lanhuapp.com") || host.includes("lanhu.woa.com");
  } catch {
    return /lanhuapp\.com|lanhu\.woa\.com/i.test(url);
  }
}
function isLikelyDesignUrl(url) {
  return isLikelyFigmaUrl(url) || isLikelyLanhuUrl(url);
}
function credentialFieldForUrl(url) {
  return isLikelyLanhuUrl(url) ? UI_CONFIG_LANHU_COOKIE : UI_CONFIG_FIGMA_TOKEN;
}
function looksLikeFigmaToken(value) {
  return /^figd_/i.test(value.trim());
}
function looksLikeLanhuCookie(value) {
  const v = value.trim();
  if (!v || looksLikeFigmaToken(v)) return false;
  return /[;=]/.test(v) || v.length >= 64;
}
function resolveDesignCredential(repoInput, url) {
  const lanhu = isLikelyLanhuUrl(url);
  const field = lanhu ? UI_CONFIG_LANHU_COOKIE : UI_CONFIG_FIGMA_TOKEN;
  const dedicated = hasRepoUiConfig(repoInput) ? readRepoUiConfig(repoInput, field) : readGlobalUiConfig(field);
  if (lanhu) {
    if (dedicated.trim()) return dedicated;
    const legacy = hasRepoUiConfig(repoInput) ? readRepoUiConfig(repoInput, UI_CONFIG_FIGMA_TOKEN) : readGlobalUiConfig(UI_CONFIG_FIGMA_TOKEN);
    if (legacy.trim() && looksLikeLanhuCookie(legacy)) {
      writeUiConfig(repoInput, UI_CONFIG_LANHU_COOKIE, legacy);
      return legacy;
    }
    return "";
  }
  if (dedicated.trim() && !looksLikeLanhuCookie(dedicated)) return dedicated;
  if (dedicated.trim() && looksLikeLanhuCookie(dedicated)) {
    const existingLanhu = hasRepoUiConfig(repoInput) ? readRepoUiConfig(repoInput, UI_CONFIG_LANHU_COOKIE) : readGlobalUiConfig(UI_CONFIG_LANHU_COOKIE);
    if (!existingLanhu.trim()) writeUiConfig(repoInput, UI_CONFIG_LANHU_COOKIE, dedicated);
    return "";
  }
  return "";
}
function readSavedLinks() {
  try {
    const raw = localStorage.getItem(SAVED_LINKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.url === "string" && x.url.trim());
  } catch {
    return [];
  }
}
function writeSavedLinks(list) {
  try {
    localStorage.setItem(SAVED_LINKS_KEY, JSON.stringify(list.slice(0, MAX_SAVED_LINKS)));
  } catch {
  }
}
function rememberSavedLink(url) {
  const trimmed = url.trim();
  if (!isLikelyDesignUrl(trimmed)) return readSavedLinks();
  const next = [
    { url: trimmed, label: labelForDesignUrl(trimmed), savedAt: (/* @__PURE__ */ new Date()).toISOString() },
    ...readSavedLinks().filter((x) => x.url !== trimmed)
  ].slice(0, MAX_SAVED_LINKS);
  writeSavedLinks(next);
  return next;
}
function removeSavedLink(url) {
  const next = readSavedLinks().filter((x) => x.url !== url);
  writeSavedLinks(next);
  return next;
}
function VisualComparePanel({
  repoInput,
  auth,
  onSendToChat,
  openConfirmDialog,
  trackerReady,
  trackerProvider,
  onOpenTrackerSettings
}) {
  const [figmaUrl, setFigmaUrlState] = (0, import_react3.useState)(() => resolveUiConfig(repoInput, UI_CONFIG_FIGMA_URL));
  const [figmaToken, setFigmaTokenState] = (0, import_react3.useState)(
    () => resolveDesignCredential(repoInput, resolveUiConfig(repoInput, UI_CONFIG_FIGMA_URL))
  );
  const [savedLinks, setSavedLinks] = (0, import_react3.useState)(() => readSavedLinks());
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [busyMessage, setBusyMessage] = (0, import_react3.useState)("");
  const [busyStartedAt, setBusyStartedAt] = (0, import_react3.useState)(0);
  const [elapsed, setElapsed] = (0, import_react3.useState)(0);
  function beginBusy(message) {
    setBusyMessage(message);
    setBusyStartedAt(Date.now());
    setElapsed(0);
    setBusy(true);
  }
  function endBusy() {
    setBusy(false);
    setBusyMessage("");
    setBusyStartedAt(0);
    setElapsed(0);
  }
  (0, import_react3.useEffect)(() => {
    if (!busy || !busyStartedAt) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - busyStartedAt) / 1e3)), 1e3);
    return () => clearInterval(id);
  }, [busy, busyStartedAt]);
  const [error, setError] = (0, import_react3.useState)("");
  const [hifiData, setHifiData] = (0, import_react3.useState)(null);
  const [activeDesignId, setActiveDesignId] = (0, import_react3.useState)("");
  const [activeCodeFile, setActiveCodeFile] = (0, import_react3.useState)(null);
  const [findingsMap, setFindingsMap] = (0, import_react3.useState)({});
  const [pendingJob, setPendingJob] = (0, import_react3.useState)(null);
  const [rematchApply, setRematchApply] = (0, import_react3.useState)(null);
  const rematchTokenRef = (0, import_react3.useRef)(0);
  const setFigmaUrl = (value) => {
    const next = value.trim();
    const prevLanhu = isLikelyLanhuUrl(figmaUrl);
    const nextLanhu = isLikelyLanhuUrl(next);
    setFigmaUrlState(value);
    writeUiConfig(repoInput, UI_CONFIG_FIGMA_URL, next);
    if (prevLanhu !== nextLanhu) {
      setFigmaTokenState(resolveDesignCredential(repoInput, next));
    }
  };
  const setFigmaToken = (value) => {
    setFigmaTokenState(value);
    writeUiConfig(repoInput, credentialFieldForUrl(figmaUrl), value.trim());
  };
  const clearFigmaUrl = () => {
    setFigmaUrlState("");
    clearUiConfigField(repoInput, UI_CONFIG_FIGMA_URL);
  };
  const clearFigmaToken = () => {
    setFigmaTokenState("");
    clearUiConfigField(repoInput, credentialFieldForUrl(figmaUrl));
  };
  const saveCurrentLink = () => {
    if (!figmaUrl.trim()) return;
    setSavedLinks(rememberSavedLink(figmaUrl));
  };
  const applySavedLink = (url) => {
    setFigmaUrl(url);
  };
  const deleteSavedLink = (url) => {
    const next = removeSavedLink(url);
    setSavedLinks(next);
    if (figmaUrl.trim() === url.trim()) clearFigmaUrl();
  };
  const onDesignLinkUsed = (url) => {
    setSavedLinks(rememberSavedLink(url));
  };
  (0, import_react3.useEffect)(() => {
    if (hasRepoUiConfig(repoInput)) {
      const url = readRepoUiConfig(repoInput, UI_CONFIG_FIGMA_URL);
      setFigmaUrlState(url);
      setFigmaTokenState(resolveDesignCredential(repoInput, url));
    } else {
      const url = readGlobalUiConfig(UI_CONFIG_FIGMA_URL);
      setFigmaUrlState((prev) => prev || url);
      setFigmaTokenState((prev) => {
        if (prev) return prev;
        return resolveDesignCredential(repoInput, url || prev);
      });
    }
    setError("");
    setHifiData(null);
    setActiveDesignId("");
    setActiveCodeFile(null);
    setFindingsMap({});
    setPendingJob(null);
    setRematchApply(null);
  }, [repoInput]);
  (0, import_react3.useEffect)(() => {
    if (!pendingJob) return;
    let timer = null;
    let cancelled = false;
    const startedAt = Date.now();
    const MAX_WAIT_MS = 18e4;
    const tick = async () => {
      try {
        const res = await post2("/tracescope/v1/visual-job", { id: pendingJob.jobId });
        if (cancelled) return;
        const status = res.status;
        if (status === "published") {
          if (pendingJob.kind === "rematch") {
            const rematch = res.rematch;
            const picks = (rematch?.picks ?? []).filter((p) => p && p.relativePath).map((p) => ({
              adapterId: String(p.adapterId || "android-xml"),
              relativePath: String(p.relativePath),
              kindLabel: p.kindLabel,
              score: p.score,
              reason: p.reason
            }));
            if (picks.length) {
              rematchTokenRef.current += 1;
              setRematchApply({
                designId: pendingJob.designId,
                candidates: picks,
                note: rematch?.note,
                token: rematchTokenRef.current
              });
              setError(
                `✓ AI 已写回文件推荐（${picks[0].relativePath}）。可在会话继续纠正后再次写回。`
              );
            }
          } else {
            const findings = res.findings;
            if (findings) {
              setFindingsMap((prev) => ({
                ...prev,
                [pendingJob.designId]: {
                  findings: findings.findings ?? [],
                  renderPatch: findings.renderPatch,
                  summary: findings.summary,
                  savedAt: findings.savedAt || (/* @__PURE__ */ new Date()).toISOString()
                }
              }));
            }
          }
          setPendingJob(null);
          return;
        }
        if (status === "error") {
          setPendingJob(null);
          return;
        }
      } catch {
      }
      if (cancelled) return;
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        setPendingJob(null);
        return;
      }
      timer = setTimeout(tick, 2e3);
    };
    timer = setTimeout(tick, 2500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingJob]);
  function nodeUrl(designId) {
    const id = designId.trim();
    if (!id) return figmaUrl;
    if (isLikelyLanhuUrl(figmaUrl)) {
      try {
        const u = new URL(figmaUrl.trim());
        const host = u.hostname.toLowerCase().includes("woa") ? "lanhu.woa.com" : "lanhuapp.com";
        const hashQ = u.hash.includes("?") ? u.hash.slice(u.hash.indexOf("?") + 1) : u.search.slice(1);
        const params = new URLSearchParams(hashQ);
        const projectId = params.get("project_id") || params.get("pid") || "";
        const tid = params.get("tid") || params.get("team_id") || "0";
        if (!projectId) return figmaUrl;
        const q = new URLSearchParams({
          tid,
          pid: projectId,
          project_id: projectId,
          image_id: id
        });
        return `https://${host}/web/#/item/project/detailDetach?${q.toString()}`;
      } catch {
        return figmaUrl;
      }
    }
    try {
      const u = new URL(figmaUrl);
      u.searchParams.set("node-id", id.replace(/:/g, "-"));
      return u.toString();
    } catch {
      return figmaUrl;
    }
  }
  async function runHifiCompare(designId, codeFile, force = false) {
    try {
      const res = await post2("/tracescope/v1/hifi-compare", {
        repoPath: repoInput,
        auth,
        figmaUrl: nodeUrl(designId),
        figmaToken: figmaToken.trim(),
        designId,
        adapterId: codeFile.adapterId,
        relativePath: codeFile.relativePath,
        useAI: false,
        force
      });
      setHifiData(res);
      setActiveDesignId(designId);
      setActiveCodeFile(codeFile);
      try {
        const f = await post2("/tracescope/v1/visual-findings-load", {
          repoPath: repoInput,
          figmaUrl: nodeUrl(designId),
          designId,
          adapterId: codeFile.adapterId,
          relativePath: codeFile.relativePath
        });
        const report = f.report;
        if (f.found && report) {
          setFindingsMap((prev) => ({
            ...prev,
            [designId]: {
              findings: report.findings ?? [],
              renderPatch: report.renderPatch,
              summary: report.summary,
              savedAt: report.savedAt || (/* @__PURE__ */ new Date()).toISOString()
            }
          }));
        }
      } catch {
      }
      return {
        ok: true,
        designImageUrl: res.designImageUrl
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  async function compareFromOverview(designId, codeFile, force = false) {
    setError("");
    setHifiData(null);
    setActiveDesignId("");
    setActiveCodeFile(null);
    beginBusy(force ? "正在重新生成界面对比…" : "正在对比设计稿与代码，并生成标注…");
    try {
      const result = await runHifiCompare(designId, codeFile, force);
      if (!result.ok) setError(result.error);
      else if (!result.designImageUrl) {
        setError(
          "界面对比已完成，但设计稿官方渲染图加载失败。后续「AI 协助分析」缺少设计图会明显影响效果，请检查设计稿链接/凭证后重试「界面对比」。"
        );
      }
    } finally {
      endBusy();
    }
  }
  async function aiAnalyzeFromOverview(designId, codeFile) {
    setError("");
    const boardReady = !!hifiData && activeDesignId === designId && activeCodeFile?.adapterId === codeFile.adapterId && activeCodeFile?.relativePath === codeFile.relativePath;
    if (!boardReady) {
      const proceed = window.confirm(
        "尚未对该页完成「界面对比」。\n\n继续将先生成界面对比（可能需要几十秒到数分钟），再准备 AI 分析提示词；整体耗时与 token 消耗都会更高。\n\n若设计稿渲染图加载失败，分析质量会明显下降。\n\n是否仍要继续？"
      );
      if (!proceed) {
        setError("已取消 AI 协助分析。建议先点「界面对比」，确认设计稿渲染成功后再分析。");
        return;
      }
    }
    beginBusy(boardReady ? "正在准备 AI 协助分析…" : "正在生成界面对比，随后准备 AI 协助分析…");
    try {
      let designImageUrl = boardReady ? hifiData?.designImageUrl : void 0;
      if (!boardReady) {
        const compared = await runHifiCompare(designId, codeFile, false);
        if (!compared.ok) {
          setError(
            `界面对比失败，已中止 AI 协助分析，避免无效 token 消耗。
原因：${compared.error}`
          );
          return;
        }
        designImageUrl = compared.designImageUrl;
        setBusyMessage("正在准备 AI 协助分析…");
      }
      if (!designImageUrl) {
        const proceedWithoutRaster = window.confirm(
          "设计稿官方渲染图加载失败（或尚未可用）。\n\n没有渲染图时，AI 只能依赖结构/文案差异，结论容易不准，但仍会消耗 token。\n\n建议先检查设计稿链接与凭证，重新「界面对比」成功后再分析。\n\n是否仍要继续？"
        );
        if (!proceedWithoutRaster) {
          setError(
            "已取消：请先确认设计稿渲染图可加载（界面对比左侧出现设计图），再使用「AI 协助分析」。"
          );
          return;
        }
      }
      const res = await post2("/tracescope/v1/code-visual-prompt", {
        repoPath: repoInput,
        auth,
        figmaUrl: nodeUrl(designId),
        figmaToken: figmaToken.trim(),
        designId,
        adapterId: codeFile.adapterId,
        relativePath: codeFile.relativePath,
        dynamicRegions: collectDynamicRegionsFromHifi(
          hifiData?.codeHifiTree
        )
      });
      const prompt = res.prompt;
      const jobId = res.jobId;
      const promptDesignImage = res.designImageUrl;
      const designRasterInPanel = Boolean(
        res.designRasterInPanel || designImageUrl || promptDesignImage
      );
      if (!designRasterInPanel) {
        const proceed = window.confirm(
          "准备提示词时仍未拿到设计稿渲染图。继续发送可能导致效果差且浪费 token。\n\n是否仍要填入会话？"
        );
        if (!proceed) {
          setError("已取消填入提示词。请修复设计稿渲染后再试。");
          return;
        }
      }
      if (typeof onSendToChat !== "function" || !prompt) {
        setError("无法准备 AI 协助分析，请重试。");
        return;
      }
      const sent = onSendToChat(prompt);
      if (!sent.ok) {
        setError(
          (sent.error || "无法写入会话输入框") + "；请确认已打开并选中一个会话，或重新点击「AI 协助分析」。"
        );
        return;
      }
      if (jobId) setPendingJob({ jobId, designId, kind: "findings" });
      setError(
        designRasterInPanel ? "✓ 已打开界面对比，并把「AI 协助分析」提示词填入当前会话。请核对后发送；写回后结论会出现在下方差异区。" : "✓ 提示词已填入会话（注意：当前无设计稿渲染图，分析结果可能不准）。请核对后再发送。"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      endBusy();
    }
  }
  async function aiRematchFromOverview(designId, codeFile) {
    setError("");
    beginBusy("正在准备「AI 推荐文件」提示词…");
    try {
      if (!figmaUrl.trim() || !figmaToken.trim()) {
        setError("请先填写设计稿链接与访问凭证（Figma Token 或蓝湖 Cookie）");
        return;
      }
      const res = await post2("/tracescope/v1/match-page", {
        repoPath: repoInput,
        auth,
        figmaUrl: figmaUrl.trim(),
        figmaToken: figmaToken.trim(),
        designId,
        rematchPrompt: true,
        adapterId: codeFile?.adapterId,
        relativePath: codeFile?.relativePath
      });
      const prompt = res.prompt;
      const jobId = res.jobId;
      if (typeof onSendToChat !== "function" || !prompt) {
        setError("无法准备推荐提示词，请重试。");
        return;
      }
      const sent = onSendToChat(prompt);
      if (!sent.ok) {
        setError(
          (sent.error || "无法写入会话输入框") + "；请确认已打开并选中一个会话，核对提示词后再发送。写回后侧栏会自动更新选中文件。"
        );
        return;
      }
      if (jobId) setPendingJob({ jobId, designId, kind: "rematch" });
      setError(
        "✓ 已将「AI 推荐文件」提示词填入当前会话。请核对后发送；模型调用 tracescope_publish_page_rematch 后，侧栏会自动选中推荐文件。可继续对话纠正并再次写回。"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      endBusy();
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: S.card, children: [
    busy ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(LoadingOverlay, { message: busyMessage, elapsedSeconds: elapsed }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("strong", { children: [
      "设计差异分析",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "span",
        {
          style: {
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 700,
            color: "#8a5a00",
            background: "#fff4d6",
            border: "1px solid #f0d48a",
            borderRadius: 4,
            padding: "1px 6px",
            verticalAlign: "middle"
          },
          children: "试验"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: S.hint, children: [
      "对照设计稿与代码实现，列出布局 / 样式 / 文案等差异（试验功能，结果请人工复核）。 支持 ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "Figma" }),
      " 与 ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "蓝湖" }),
      "：粘贴设计稿链接与访问凭证后扫描。 Figma 填 Personal Access Token；蓝湖填浏览器 Cookie（登录 lanhuapp.com 后从 DevTools 复制）。 链接带页面定位（Figma ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: "node-id" }),
      " / 蓝湖 ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: "image_id" }),
      "）时优先该页；否则扫描整个文件/项目。 链接与凭证会自动记住；常用链接可点选或删除。再对卡片做「界面对比」或「AI 协助分析」。"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: S.label, children: [
      "设计稿链接",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            style: { ...S.input, flex: 1, marginTop: 0 },
            value: figmaUrl,
            disabled: busy,
            placeholder: "Figma 或蓝湖链接，如 https://lanhuapp.com/web/#/item/project/detailDetach?...",
            onChange: (e) => setFigmaUrl(e.target.value),
            onBlur: () => {
              if (isLikelyDesignUrl(figmaUrl)) setSavedLinks(rememberSavedLink(figmaUrl));
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            style: S.miniBtn,
            disabled: busy || !figmaUrl.trim(),
            title: "保存到常用链接",
            onClick: saveCurrentLink,
            children: "保存"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            style: S.miniBtn,
            disabled: busy || !figmaUrl.trim(),
            title: "清空当前链接",
            onClick: clearFigmaUrl,
            children: "删除"
          }
        )
      ] })
    ] }),
    savedLinks.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { margin: "0 0 8px", fontSize: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: "#667085", marginBottom: 4 }, children: "常用设计稿链接" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { style: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }, children: savedLinks.map((item) => {
        const active2 = item.url.trim() === figmaUrl.trim();
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "li",
          {
            style: {
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: "4px 6px",
              borderRadius: 6,
              background: active2 ? "#eef6ff" : "#f8fafc",
              border: `1px solid ${active2 ? "#b2d4ff" : "#e4e7ec"}`
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  disabled: busy,
                  onClick: () => applySavedLink(item.url),
                  title: item.url,
                  style: {
                    flex: 1,
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    cursor: busy ? "default" : "pointer",
                    padding: 0,
                    fontSize: 12,
                    color: "#101828",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  },
                  children: item.label || item.url
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  style: S.miniBtn,
                  disabled: busy,
                  title: "从常用列表删除",
                  onClick: () => deleteSavedLink(item.url),
                  children: "×"
                }
              )
            ]
          },
          item.url
        );
      }) })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: S.label, children: [
      isLikelyLanhuUrl(figmaUrl) ? "蓝湖 Cookie" : "Figma Token",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            style: { ...S.input, flex: 1, marginTop: 0 },
            type: "password",
            value: figmaToken,
            disabled: busy,
            placeholder: isLikelyLanhuUrl(figmaUrl) ? "从浏览器 DevTools → Network 请求头复制 Cookie" : "figd_…（与蓝湖 Cookie 分开保存）",
            onChange: (e) => setFigmaToken(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            style: S.miniBtn,
            disabled: busy || !figmaToken.trim(),
            title: isLikelyLanhuUrl(figmaUrl) ? "清除已保存的蓝湖 Cookie" : "清除已保存的 Figma Token",
            onClick: clearFigmaToken,
            children: "清除"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...S.hint, margin: "2px 0 8px" }, children: "「界面对比」生成设计对照图与静态差异清单；「AI 协助分析」补充/纠正差异项并写回下方清单（不做代码 UI 还原预览）。 蓝湖若自动匹配为空，需先在卡片上「指定代码文件」再点对比。" }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "p",
      {
        style: {
          color: error.startsWith("✓") ? "#0f6e56" : "#b42318",
          margin: "0 0 8px",
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap"
        },
        children: error
      }
    ) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: 2 }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      PageMappingOverview,
      {
        repoInput,
        figmaUrl,
        figmaToken,
        auth,
        busy,
        activeDesignId,
        onScanStateChange: (next, message) => next ? beginBusy(message || "正在扫描设计稿…") : endBusy(),
        onDesignLinkUsed,
        onCompare: compareFromOverview,
        onAiAnalyze: aiAnalyzeFromOverview,
        onAiRematch: aiRematchFromOverview,
        rematchApply
      }
    ) }),
    hifiData ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        style: {
          marginTop: 14,
          padding: "10px 12px",
          border: "1px solid #0f6e56",
          borderRadius: 10,
          background: "#f2f8f5",
          fontSize: 12,
          color: "#0d4a3a",
          lineHeight: 1.6
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { fontWeight: 700, fontSize: 13 }, children: [
            "当前对比：",
            String(
              hifiData?.designHifiTree?.name ?? ""
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: 2, color: "#3f6b5c", wordBreak: "break-all" }, children: [
            "设计稿 ↔ 代码文件：",
            activeCodeFile?.relativePath ?? hifiData?.page?.relativePath ?? ""
          ] })
        ]
      }
    ) : null,
    hifiData ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      HifiCompareBoard,
      {
        data: hifiData,
        findings: activeDesignId ? findingsMap[activeDesignId] : void 0,
        onSendToChat,
        openConfirmDialog,
        repoInput,
        designUrl: figmaUrl,
        trackerReady,
        trackerProvider,
        onOpenTrackerSettings,
        onActionHint: (message) => setError(message),
        onAiAnalyze: (file) => {
          const designId = String(
            hifiData?.designHifiTree?.id ?? ""
          );
          if (designId) aiAnalyzeFromOverview(designId, file);
          else setError("无法确定当前设计节点，请重新进行界面对比。");
        },
        onRegenerate: () => {
          const tree = hifiData;
          const designId = String(tree?.designHifiTree?.id ?? "");
          const adapterId = String(tree?.page?.adapterId ?? "");
          const relativePath = String(tree?.page?.relativePath ?? "");
          if (designId && adapterId && relativePath) {
            void compareFromOverview(designId, { adapterId, relativePath }, true);
          } else {
            setError("无法确定当前页面，请重新进行界面对比。");
          }
        }
      }
    ) : null
  ] });
}
var import_react3, import_jsx_runtime4, UI_CONFIG_PREFIX, UI_CONFIG_GLOBAL_PREFIX, UI_CONFIG_FIGMA_URL, UI_CONFIG_FIGMA_TOKEN, UI_CONFIG_LANHU_COOKIE, SAVED_LINKS_KEY, MAX_SAVED_LINKS, S;
var init_VisualComparePanel = __esm({
  "client-src/visual/VisualComparePanel.tsx"() {
    "use strict";
    import_react3 = require("react");
    init_PageMappingOverview();
    init_HifiCompareBoard();
    init_LoadingOverlay();
    import_jsx_runtime4 = require("react/jsx-runtime");
    UI_CONFIG_PREFIX = "tracescope.ui.";
    UI_CONFIG_GLOBAL_PREFIX = "tracescope.ui.global.";
    UI_CONFIG_FIGMA_URL = "figmaUrl";
    UI_CONFIG_FIGMA_TOKEN = "figmaToken";
    UI_CONFIG_LANHU_COOKIE = "lanhuCookie";
    SAVED_LINKS_KEY = "tracescope.ui.savedFigmaLinks";
    MAX_SAVED_LINKS = 12;
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
      miniBtn: {
        flexShrink: 0,
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #d0d5dd",
        background: "#fff",
        color: "#344054",
        fontSize: 12,
        cursor: "pointer",
        whiteSpace: "nowrap"
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
var jsx5 = jsxRuntime.jsx;
var jsxs5 = jsxRuntime.jsxs;
var useState4 = React.useState;
var useEffect4 = React.useEffect;
var useCallback = React.useCallback;
var useRef3 = React.useRef;
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
var activeBusyAbort = null;
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
  busySpinnerSvg: {
    display: "block",
    width: 28,
    height: 28,
    margin: "0 auto 10px",
    overflow: "visible"
  },
  busyCancel: {
    marginTop: 12,
    border: "1px solid var(--dsh-border, #ddd4c5)",
    borderRadius: 999,
    padding: "6px 14px",
    cursor: "pointer",
    background: "#fff",
    color: "#5f584c",
    fontSize: 12
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
function statusBtnStyle(kind, active2) {
  if (!active2) return styles.statusBtn;
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
function isAbortError(err) {
  if (!err) return false;
  if (err.name === "AbortError") return true;
  var msg = String(err.message || err || "");
  return /aborted|AbortError|The user aborted/i.test(msg);
}
function apiPost(path, body) {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: activeBusyAbort ? activeBusyAbort.signal : void 0
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
function downloadTextFile2(filename, text, mime) {
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
  return jsxs5("div", {
    style: Object.assign({}, styles.row, { gap: 6 }),
    children: ["pass", "fail", "skip", "pending"].map(function(s) {
      var label = s === "pass" ? "通过" : s === "fail" ? "失败" : s === "skip" ? "跳过" : "重置";
      var active2 = status === s;
      return jsx5(
        "button",
        {
          type: "button",
          disabled: locked,
          title: s === "pass" ? "标记为验证通过" : s === "fail" ? "标记为验证失败" : s === "skip" ? "本轮不测，标记跳过" : "清除结果，恢复为待测",
          style: Object.assign(
            {},
            statusBtnStyle(s, active2),
            locked ? { opacity: 0.55, cursor: "not-allowed" } : null
          ),
          "aria-pressed": active2 ? "true" : "false",
          onClick: function() {
            if (locked) return;
            props.onChange(s);
          },
          children: active2 && s !== "pending" ? "✓ " + label : label
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
    var option = jsx5(
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
      jsx5(
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
    groups.push(jsx5("optgroup", { label: "分支", children: branchOpts }, "g-branch"));
  }
  if (tagOpts.length) {
    groups.push(jsx5("optgroup", { label: "标签", children: tagOpts }, "g-tag"));
  }
  if (commitOpts.length) {
    groups.push(
      jsx5(
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
    groups.push(jsx5("option", { value: "", children: emptyLabel }, "empty"));
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
  var fileRef = useRef3(null);
  return jsxs5("article", {
    style: Object.assign({}, styles.item, {
      borderLeft: "4px solid",
      borderLeftColor: st === "pass" ? "#0f6e56" : st === "fail" ? "#b42318" : st === "skip" ? "#b54708" : "#ddd4c5",
      opacity: locked ? 0.72 : 1
    }),
    children: [
      jsxs5("div", {
        style: { display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
        children: [
          jsxs5("div", {
            children: [
              jsx5("div", { style: { fontWeight: 700 }, children: item.displayName }),
              jsxs5("div", {
                style: { marginTop: 4 },
                children: [
                  jsx5("span", {
                    style: Object.assign({}, styles.badge, statusBadgeStyle(st)),
                    children: statusLabel(st)
                  }),
                  jsx5("span", { style: styles.badge, children: "风险 " + item.risk }),
                  jsx5("span", {
                    style: styles.badge,
                    children: item.kind === "direct" ? "直接项" : "可能波及"
                  })
                ]
              })
            ]
          }),
          jsx5(StatusButtons, {
            status: st,
            disabled: locked,
            onChange: function(s) {
              if (locked) return;
              props.onStatus(listKind, itemIndex, item.id, s);
            }
          })
        ]
      }),
      jsx5("ol", {
        style: { margin: "8px 0 0", paddingLeft: 18, color: "#6b645a" },
        children: (item.suggestedSteps || []).map(function(step, idx) {
          return jsx5("li", { children: step }, idx);
        })
      }),
      st === "fail" ? jsxs5("div", {
        style: { marginTop: 10 },
        children: [
          jsx5("div", {
            style: { fontWeight: 600, marginBottom: 4, color: "#b42318" },
            children: "失败备注（给开发）"
          }),
          jsx5("textarea", {
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
          jsxs5("div", {
            style: Object.assign({}, styles.row, {
              marginTop: 8,
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8
            }),
            children: [
              jsx5("input", {
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
                  var pending2 = picked.length;
                  picked.forEach(function(file) {
                    compressImageToShot(
                      file,
                      file.name,
                      function(shot) {
                        next.push(shot);
                        pending2 -= 1;
                        if (pending2 <= 0) {
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
                        pending2 -= 1;
                        props.onShotHint && props.onShotHint(msg);
                        if (pending2 <= 0 && next.length > shots.length) {
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
              jsx5("button", {
                type: "button",
                style: styles.btn,
                disabled: locked || shots.length >= MAX_SHOTS,
                onClick: function() {
                  if (locked) return;
                  if (fileRef.current) fileRef.current.click();
                },
                children: "添加截图"
              }),
              jsx5("span", {
                style: { fontSize: 12, color: "#6b645a" },
                children: "已附 " + shots.length + "/" + MAX_SHOTS + " · 支持粘贴或选文件（自动压缩）"
              })
            ]
          }),
          shots.length ? jsx5("div", {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8
            },
            children: shots.map(function(shot) {
              return jsxs5(
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
                    jsx5("img", {
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
                    jsx5("button", {
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
                    jsx5("div", {
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
      jsxs5("details", {
        style: { marginTop: 8 },
        children: [
          jsx5("summary", { children: "查看证据" }),
          jsx5("ul", {
            children: (item.files || []).map(function(f) {
              return jsx5("li", { children: jsx5("code", { children: f }) }, f);
            })
          }),
          jsx5("ul", {
            children: (item.evidence || []).map(function(e, idx) {
              return jsx5("li", { children: e.detail }, idx);
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
  var _repo = useState4(initialRepo);
  var repoPath = _repo[0];
  var setRepoPath = _repo[1];
  var _repoList = useState4(function() {
    var list = readRepoList();
    if (initialRepo && list.indexOf(initialRepo) === -1) list = writeRepoList([initialRepo].concat(list));
    return list;
  });
  var repoList = _repoList[0];
  var setRepoList = _repoList[1];
  var _settingsOpen = useState4(!initialRepo);
  var settingsOpen = _settingsOpen[0];
  var setSettingsOpen = _settingsOpen[1];
  var isRemote = isGitRemoteInput(repoPath);
  var _autoOpen = useState4(isAutoOpenEnabled());
  var autoOpen = _autoOpen[0];
  var setAutoOpen = _autoOpen[1];
  function toggleAutoOpen(next) {
    setAutoOpen(next);
    try {
      localStorage.setItem(AUTO_OPEN_KEY, next ? "on" : "off");
    } catch (_e) {
    }
  }
  var _dataDirOpen = useState4(false);
  var dataDirOpen = _dataDirOpen[0];
  var setDataDirOpen = _dataDirOpen[1];
  var _dataDir = useState4(null);
  var dataDirInfo = _dataDir[0];
  var setDataDirInfo = _dataDir[1];
  var _dataDirDraft = useState4("");
  var dataDirDraft = _dataDirDraft[0];
  var setDataDirDraft = _dataDirDraft[1];
  var _dataDirBusy = useState4(false);
  var dataDirBusy = _dataDirBusy[0];
  var setDataDirBusy = _dataDirBusy[1];
  var _pickerOpen = useState4(false);
  var pickerOpen = _pickerOpen[0];
  var setPickerOpen = _pickerOpen[1];
  var _pickerPurpose = useState4("data");
  var pickerPurpose = _pickerPurpose[0];
  var setPickerPurpose = _pickerPurpose[1];
  var _pickerBrowse = useState4(null);
  var pickerBrowse = _pickerBrowse[0];
  var setPickerBrowse = _pickerBrowse[1];
  var _pickerLoading = useState4(false);
  var pickerLoading = _pickerLoading[0];
  var setPickerLoading = _pickerLoading[1];
  var _pickerSelected = useState4("");
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
  var _accessMode = useState4(localStorage.getItem(ACCESS_MODE_KEY) === "codeup" ? "codeup" : "git");
  var accessMode = _accessMode[0];
  var setAccessMode = _accessMode[1];
  var _copyFlash = useState4("");
  var copyFlash = _copyFlash[0];
  var setCopyFlash = _copyFlash[1];
  var YX_AUTH_KEY = "tracescope.yunxiaoAuth";
  var savedYx = null;
  try {
    savedYx = JSON.parse(localStorage.getItem(YX_AUTH_KEY) || "null");
  } catch (_e) {
    savedYx = null;
  }
  var _yxEndpoint = useState4(
    savedYx && savedYx.endpoint || "https://openapi-rdc.aliyuncs.com"
  );
  var yxEndpoint = _yxEndpoint[0];
  var setYxEndpoint = _yxEndpoint[1];
  var _yxToken = useState4(savedYx && savedYx.token || "");
  var yxToken = _yxToken[0];
  var setYxToken = _yxToken[1];
  var _yxTokenSaved = useState4(Boolean(savedYx && savedYx.token));
  var yxTokenSaved = _yxTokenSaved[0];
  var setYxTokenSaved = _yxTokenSaved[1];
  var _yxHydrated = useState4(false);
  var yxHydrated = _yxHydrated[0];
  var setYxHydrated = _yxHydrated[1];
  var _yxOrg = useState4("");
  var yxOrg = _yxOrg[0];
  var setYxOrg = _yxOrg[1];
  var _yxSpace = useState4("");
  var yxSpace = _yxSpace[0];
  var setYxSpace = _yxSpace[1];
  var _yxType = useState4("");
  var yxType = _yxType[0];
  var setYxType = _yxType[1];
  var _yxAssignee = useState4("");
  var yxAssignee = _yxAssignee[0];
  var setYxAssignee = _yxAssignee[1];
  var _yxOrgs = useState4([]);
  var yxOrgs = _yxOrgs[0];
  var setYxOrgs = _yxOrgs[1];
  var _yxProjects = useState4([]);
  var yxProjects = _yxProjects[0];
  var setYxProjects = _yxProjects[1];
  var _yxTypes = useState4([]);
  var yxTypes = _yxTypes[0];
  var setYxTypes = _yxTypes[1];
  var _yxMembers = useState4([]);
  var yxMembers = _yxMembers[0];
  var setYxMembers = _yxMembers[1];
  var _yxCatalogHint = useState4("");
  var yxCatalogHint = _yxCatalogHint[0];
  var setYxCatalogHint = _yxCatalogHint[1];
  var _yxDebugLog = useState4(false);
  var yxDebugLog = _yxDebugLog[0];
  var setYxDebugLog = _yxDebugLog[1];
  var _yxRequestLog = useState4("");
  var yxRequestLog = _yxRequestLog[0];
  var setYxRequestLog = _yxRequestLog[1];
  var _trackerProvider = useState4("none");
  var trackerProvider = _trackerProvider[0];
  var setTrackerProvider = _trackerProvider[1];
  var _ghToken = useState4("");
  var ghToken = _ghToken[0];
  var setGhToken = _ghToken[1];
  var _ghOwner = useState4("");
  var ghOwner = _ghOwner[0];
  var setGhOwner = _ghOwner[1];
  var _ghRepo = useState4("");
  var ghRepo = _ghRepo[0];
  var setGhRepo = _ghRepo[1];
  var _ghLabels = useState4("bug");
  var ghLabels = _ghLabels[0];
  var setGhLabels = _ghLabels[1];
  var _glHost = useState4("https://gitlab.com");
  var glHost = _glHost[0];
  var setGlHost = _glHost[1];
  var _glToken = useState4("");
  var glToken = _glToken[0];
  var setGlToken = _glToken[1];
  var _glProject = useState4("");
  var glProject = _glProject[0];
  var setGlProject = _glProject[1];
  var _glLabels = useState4("bug");
  var glLabels = _glLabels[0];
  var setGlLabels = _glLabels[1];
  var _whUrl = useState4("");
  var whUrl = _whUrl[0];
  var setWhUrl = _whUrl[1];
  var _whAuth = useState4("");
  var whAuth = _whAuth[0];
  var setWhAuth = _whAuth[1];
  var _trackerReady = useState4(false);
  var trackerReady = _trackerReady[0];
  var setTrackerReady = _trackerReady[1];
  var _wiCats = useState4({ Req: true, Bug: true, Task: true, Risk: false, Topic: false });
  var wiCats = _wiCats[0];
  var setWiCats = _wiCats[1];
  var _wiItems = useState4([]);
  var wiItems = _wiItems[0];
  var setWiItems = _wiItems[1];
  var _wiSelected = useState4({});
  var wiSelected = _wiSelected[0];
  var setWiSelected = _wiSelected[1];
  var _wiHint = useState4("");
  var wiHint = _wiHint[0];
  var setWiHint = _wiHint[1];
  var _resolved = useState4(null);
  var resolved = _resolved[0];
  var setResolved = _resolved[1];
  var _commits = useState4([]);
  var commits = _commits[0];
  var setCommits = _commits[1];
  var _refs = useState4([]);
  var refs = _refs[0];
  var setRefs = _refs[1];
  var _base = useState4("");
  var baseCommit = _base[0];
  var setBaseCommit = _base[1];
  var _head = useState4("");
  var headCommit = _head[0];
  var setHeadCommit = _head[1];
  var _branchQuery = useState4("");
  var branchQuery = _branchQuery[0];
  var setBranchQuery = _branchQuery[1];
  var _branchPickerOpen = useState4(false);
  var branchPickerOpen = _branchPickerOpen[0];
  var setBranchPickerOpen = _branchPickerOpen[1];
  var _commitListRef = useState4("");
  var commitListRef = _commitListRef[0];
  var setCommitListRef = _commitListRef[1];
  var _report = useState4(null);
  var report = _report[0];
  var setReport = _report[1];
  var _tab = useState4("direct");
  var tab = _tab[0];
  var setTab = _tab[1];
  var MODE_KEY = "tracescope.mode";
  var _savedMode = localStorage.getItem(MODE_KEY);
  var _mode = useState4(
    _savedMode === "ui" ? _savedMode : "functional"
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
  var _error = useState4("");
  var error = _error[0];
  var setError = _error[1];
  var _busy = useState4(false);
  var busy = _busy[0];
  var setBusy = _busy[1];
  var _busyMessage = useState4("");
  var busyMessage = _busyMessage[0];
  var setBusyMessage = _busyMessage[1];
  var _busyElapsed = useState4(0);
  var busyElapsed = _busyElapsed[0];
  var setBusyElapsed = _busyElapsed[1];
  var busyRef = useRef3(false);
  var busyMsgRef = useRef3("");
  var busyBaseMsgRef = useRef3("");
  var _health = useState4("检查中…");
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
  var _authMode = useState4(initialAuthMode);
  var authMode = _authMode[0];
  var setAuthMode = _authMode[1];
  var _authUser = useState4(savedAuth && savedAuth.username || "git");
  var authUser = _authUser[0];
  var setAuthUser = _authUser[1];
  var _authToken = useState4(savedAuth && savedAuth.token || "");
  var authToken = _authToken[0];
  var setAuthToken = _authToken[1];
  var _authKey = useState4(savedAuth && savedAuth.privateKeyPath || "");
  var authKey = _authKey[0];
  var setAuthKey = _authKey[1];
  var _rememberAuth = useState4(true);
  var rememberAuth = _rememberAuth[0];
  var setRememberAuth = _rememberAuth[1];
  var _chatHint = useState4("");
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
    busyBaseMsgRef.current = text;
    setBusyElapsed(0);
    setBusy(true);
    setBusyMessage(text);
    try {
      activeBusyAbort = new AbortController();
    } catch (_abort) {
      activeBusyAbort = null;
    }
    return true;
  }
  function endBusy() {
    busyRef.current = false;
    busyMsgRef.current = "";
    busyBaseMsgRef.current = "";
    activeBusyAbort = null;
    setBusy(false);
    setBusyMessage("");
    setBusyElapsed(0);
  }
  function cancelBusy() {
    var ctrl = activeBusyAbort;
    if (ctrl) {
      try {
        ctrl.abort();
      } catch (_e) {
      }
    }
    endBusy();
    setChatHint("已取消当前操作。可调整版本后重试「生成验证清单」。");
  }
  function updateBusyMessage(message) {
    if (!busyRef.current) return;
    var text = message || "处理中，请稍候…";
    busyMsgRef.current = text;
    setBusyMessage(text);
  }
  useEffect4(
    function() {
      if (!busy) {
        setBusyElapsed(0);
        return void 0;
      }
      var started = Date.now();
      var tick = setInterval(function() {
        if (!busyRef.current) return;
        var sec = Math.floor((Date.now() - started) / 1e3);
        setBusyElapsed(sec);
        var base = busyBaseMsgRef.current || "";
        if (sec === 20) {
          if (/生成验证清单/.test(base)) {
            updateBusyMessage(
              "正在分析版本差异与波及范围…（已用时 20 秒；大仓库或首次同步可能需要 1–3 分钟）"
            );
          } else if (/同步仓库|远端 API 读取/.test(base)) {
            updateBusyMessage("仍在同步版本信息…（已用时 20 秒；网络较慢时请稍候）");
          } else if (/AI 智能分析/.test(base)) {
            updateBusyMessage("仍在准备 AI 分析提示…（已用时 20 秒）");
          }
        } else if (sec === 60) {
          updateBusyMessage(
            (base.replace(/…$/, "") || "仍在处理中") + "（已用时 60 秒）。若确认网络/仓库无响应，可点「取消」后重试。"
          );
        } else if (sec === 180) {
          updateBusyMessage(
            "已等待超过 3 分钟，可能卡住了。建议取消后检查仓库路径、鉴权或网络再试。"
          );
        }
      }, 1e3);
      return function() {
        clearInterval(tick);
      };
    },
    [busy]
  );
  var _jobId = useState4("");
  var jobId = _jobId[0];
  var setJobId = _jobId[1];
  var _jobStatus = useState4("");
  var jobStatus = _jobStatus[0];
  var setJobStatus = _jobStatus[1];
  var _history = useState4([]);
  var history = _history[0];
  var setHistory = _history[1];
  var _historyId = useState4("");
  var historyId = _historyId[0];
  var setHistoryId = _historyId[1];
  var _confirmDlg = useState4(null);
  var confirmDlg = _confirmDlg[0];
  var setConfirmDlg = _confirmDlg[1];
  var pollRef = useRef3(null);
  var skipPairLoadRef = useRef3(false);
  var skipAutoSyncRef = useRef3(false);
  var noteTimersRef = useRef3({});
  var viewingHistoryRef = useRef3(null);
  var reportRef = useRef3(null);
  reportRef.current = report;
  var taskAttachRef = useRef3(null);
  var _taskAttachPath = useState4("");
  var taskAttachPath = _taskAttachPath[0];
  var setTaskAttachPath = _taskAttachPath[1];
  var _authHydrated = useState4(false);
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
  var restoringProfileRef = useRef3(false);
  var pendingTrackerSyncRef = useRef3(false);
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
        if (isAbortError(err)) return;
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
        if (isAbortError(err)) return;
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
        if (isAbortError(err)) return;
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
  var initialCheckRef = useRef3(false);
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
          if (isAbortError(err)) return;
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
          if (isAbortError(err)) return;
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
            if (isAbortError(err)) return;
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
            if (isAbortError(err)) return;
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
          if (isAbortError(err)) return;
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
        if (isAbortError(err)) return;
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
        if (isAbortError(err)) return;
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
        if (isAbortError(err)) return;
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
        downloadTextFile2(name2, text, "text/markdown");
        setChatHint("已导出：" + name2);
      }).catch(function() {
        var text = buildLocalExportMarkdown(report, {
          repoPath: repoPath.trim() || report.repoPath || "",
          baseCommit: base,
          headCommit: head
        });
        downloadTextFile2(filename, text, "text/markdown");
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
        if (isAbortError(err)) return;
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
            if (isAbortError(err)) return;
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
  return jsxs5("div", {
    style: styles.root,
    children: [
      jsx5("style", {
        children: "@keyframes tracescope-spin{to{transform:rotate(360deg)}}"
      }),
      busy ? jsx5("div", {
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
        children: jsxs5("div", {
          style: styles.busyBanner,
          children: [
            jsxs5("svg", {
              style: styles.busySpinnerSvg,
              viewBox: "0 0 28 28",
              width: 28,
              height: 28,
              "aria-hidden": "true",
              children: [
                jsx5("circle", {
                  cx: 14,
                  cy: 14,
                  r: 11,
                  fill: "none",
                  stroke: "#e4ddd0",
                  strokeWidth: 3
                }),
                jsx5("circle", {
                  cx: 14,
                  cy: 14,
                  r: 11,
                  fill: "none",
                  stroke: "#0f6e56",
                  strokeWidth: 3,
                  strokeLinecap: "round",
                  strokeDasharray: "52 100",
                  style: {
                    transformOrigin: "14px 14px",
                    animation: "tracescope-spin 0.8s linear infinite"
                  }
                })
              ]
            }),
            jsx5("div", {
              style: { fontWeight: 700, marginBottom: 6 },
              children: "加载中，请稍候"
            }),
            jsx5("div", {
              style: { color: "#6b645a", fontSize: 12, lineHeight: 1.45 },
              children: busyMessage || "正在处理请求。网络较慢时请勿重复操作，完成前其它按钮已锁定。"
            }),
            jsx5("div", {
              style: { marginTop: 8, fontSize: 11, color: "#8a7f70" },
              children: "已用时 " + busyElapsed + " 秒"
            }),
            jsx5("button", {
              type: "button",
              style: styles.busyCancel,
              onClick: function(e) {
                e.preventDefault();
                e.stopPropagation();
                cancelBusy();
              },
              children: "取消"
            })
          ]
        })
      }) : null,
      jsxs5("div", {
        style: Object.assign({}, styles.row, {
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8
        }),
        children: [
          jsxs5("div", {
            style: { display: "flex", flexDirection: "column", minWidth: 0, gap: 2 },
            children: [
              jsx5("strong", { children: "TraceScope 测试工作台" }),
              jsx5("span", {
                style: { color: busy ? "#0f6e56" : "#6b645a", fontSize: 12 },
                children: busy ? busyMessage || "处理中…" : health
              })
            ]
          }),
          // Global preferences — compact, independent of the repo/feature cards.
          jsxs5("div", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              flex: "0 0 auto"
            },
            children: [
              jsxs5("label", {
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
                  jsx5("input", {
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
              jsx5("button", {
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
      dataDirOpen ? jsxs5("div", {
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
          jsx5("div", {
            style: { fontSize: 12, color: "#5d564c" },
            children: "数据存放目录（更改后会自动把现有清单、附件、缓存仓库迁移过去）"
          }),
          jsxs5("div", {
            style: Object.assign({}, styles.row, { gap: 6 }),
            children: [
              jsx5("div", {
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
              jsx5("button", {
                type: "button",
                style: Object.assign({}, styles.secondary, { flex: "0 0 auto" }),
                disabled: dataDirBusy,
                onClick: openPicker,
                children: "浏览…"
              })
            ]
          }),
          dataDirInfo && dataDirInfo.envLocked ? jsx5("p", {
            style: { margin: 0, color: "#9a6a1f", fontSize: 12 },
            children: "当前目录由环境变量 TRACESCOPE_HOME 指定（" + dataDirInfo.envRoot + "），请修改环境变量后重启，无法在此更改。"
          }) : jsxs5("div", {
            style: Object.assign({}, styles.row, { justifyContent: "flex-end" }),
            children: [
              jsx5("button", {
                type: "button",
                style: styles.secondary,
                disabled: dataDirBusy,
                onClick: function() {
                  setDataDirOpen(false);
                },
                children: "取消"
              }),
              jsx5("button", {
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
      pickerOpen ? jsxs5("div", {
        style: styles.modalBackdrop,
        onClick: function(e) {
          if (e.target === e.currentTarget) closePicker();
        },
        children: jsxs5("div", {
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
            jsxs5("div", {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: [
                jsx5("strong", {
                  style: { fontSize: 13 },
                  children: pickerPurpose === "repo" ? "选择代码文件夹" : "选择数据存放目录"
                }),
                jsx5("button", {
                  type: "button",
                  style: Object.assign({}, styles.miniBtn, { padding: "2px 8px" }),
                  onClick: closePicker,
                  children: "×"
                })
              ]
            }),
            // Quick places.
            pickerBrowse && Array.isArray(pickerBrowse.quick) ? jsx5("div", {
              style: {
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                padding: "8px 12px",
                borderBottom: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: pickerBrowse.quick.map(function(q) {
                return jsx5(
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
            jsxs5("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderBottom: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: [
                jsx5("button", {
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
                jsx5("div", {
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
            jsx5("div", {
              style: { flex: 1, overflowY: "auto", padding: 6, minHeight: 180 },
              children: pickerLoading ? jsx5("div", {
                style: { padding: 16, textAlign: "center", color: "#8a8378", fontSize: 12 },
                children: "正在读取…"
              }) : pickerBrowse && !pickerBrowse.dirs.length ? jsx5("div", {
                style: { padding: 16, textAlign: "center", color: "#8a8378", fontSize: 12 },
                children: "该目录下没有子文件夹，可直接选择当前目录。"
              }) : (pickerBrowse ? pickerBrowse.dirs : []).map(function(d) {
                var active2 = pickerSelected === d.path;
                return jsx5(
                  "button",
                  {
                    type: "button",
                    title: active2 ? "已选中（双击进入）" : "单击选中，双击进入",
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
                      border: "1px solid " + (active2 ? "var(--dsh-accent,#0f6e56)" : "transparent"),
                      background: active2 ? "var(--dsh-accent-soft,#efe8da)" : "transparent",
                      cursor: "pointer",
                      fontSize: 12
                    },
                    children: [
                      jsx5("span", {
                        style: { flex: "0 0 auto", color: "#b98f3f" },
                        children: "📁"
                      }),
                      jsx5("span", { style: { flex: 1, minWidth: 0 }, children: d.name })
                    ]
                  },
                  "d-" + d.path
                );
              })
            }),
            // Footer.
            jsxs5("div", {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderTop: "1px solid var(--dsh-border, #ddd4c5)"
              },
              children: [
                jsx5("div", {
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
                jsx5("button", {
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
                jsx5("button", {
                  type: "button",
                  style: styles.secondary,
                  onClick: closePicker,
                  children: "取消"
                }),
                jsx5("button", {
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
      jsxs5("div", {
        style: {
          display: "flex",
          gap: 6,
          background: "var(--dsh-card,#fffdf8)",
          border: "1px solid var(--dsh-border,#ddd4c5)",
          borderRadius: 999,
          padding: 4
        },
        children: [
          jsx5("button", {
            type: "button",
            style: mode === "functional" ? Object.assign({}, styles.primary, { flex: 1 }) : Object.assign({}, styles.secondary, { flex: 1 }),
            disabled: busy,
            onClick: function() {
              switchMode("functional");
            },
            children: "功能影响分析"
          }),
          jsxs5("button", {
            type: "button",
            style: mode === "ui" ? Object.assign({}, styles.primary, { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }) : Object.assign({}, styles.secondary, { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }),
            disabled: busy,
            onClick: function() {
              switchMode("ui");
            },
            children: [
              "设计差异分析",
              jsx5("span", {
                style: {
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: "2px 5px",
                  borderRadius: 4,
                  background: mode === "ui" ? "rgba(255,255,255,0.22)" : "#f1ede3",
                  color: mode === "ui" ? "#fff" : "#8a7f70"
                },
                children: "试验"
              })
            ]
          })
        ]
      }),
      jsxs5("section", {
        style: Object.assign(
          {},
          styles.card
        ),
        children: [
          jsxs5("div", {
            style: Object.assign({}, styles.row, { justifyContent: "space-between" }),
            children: [
              jsxs5("div", {
                style: Object.assign({}, styles.row, { flex: 1, minWidth: 0 }),
                children: [
                  jsx5("span", {
                    style: { fontWeight: 700, whiteSpace: "nowrap" },
                    children: "仓库"
                  }),
                  jsx5("select", {
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
                      jsx5(
                        "option",
                        {
                          value: "",
                          children: repoPath.trim() ? "当前：" + shortRepoLabel(repoPath) : "选择仓库 / 先在配置中添加"
                        },
                        "repo-empty"
                      )
                    ].concat(
                      (repoList || []).map(function(r) {
                        return jsx5(
                          "option",
                          { value: r, children: shortRepoLabel(r) + " — " + r },
                          r
                        );
                      })
                    )
                  })
                ]
              }),
              jsx5("button", {
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
          !settingsOpen && repoPath.trim() ? jsx5("p", {
            style: { margin: "6px 0 0", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
            children: shortRepoLabel(repoPath) + (resolved ? " · " + (resolved.source === "codeup" ? "远端 API" : resolved.source === "remote" ? "远端缓存" : "本地") + (resolved.authMode && resolved.authMode !== "none" ? " · 认证 " + (authMode === "token" ? "个人访问令牌" : resolved.authMode) : authMode === "token" ? " · 认证 个人访问令牌" : "") + (authMode === "token" && (yxTokenSaved || usableSecret(yxToken)) ? " · 令牌已保存" : authMode === "token" ? " · 请填写个人访问令牌" : "") : "")
          }) : null,
          settingsOpen ? jsxs5("div", {
            style: {
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid var(--dsh-border, #ddd4c5)"
            },
            children: [
              jsxs5("label", {
                style: styles.label,
                children: [
                  mode === "ui" ? "代码文件夹路径 / 远端代码库地址" : "本地文件夹路径 / 远端仓库地址",
                  jsxs5("div", {
                    style: Object.assign({}, styles.row, { alignItems: "stretch" }),
                    children: [
                      jsx5("input", {
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
                      jsx5("button", {
                        type: "button",
                        style: styles.btn,
                        disabled: busy,
                        onClick: openRepoPicker,
                        children: "浏览…"
                      })
                    ]
                  }),
                  jsx5("span", {
                    style: { display: "block", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                    children: mode === "ui" ? "UI 对比直接读取本地代码，普通文件夹即可、无需是 git 仓库；只有填远端地址时才需要认证。" : "支持 Windows / macOS / Linux 路径，直接粘贴本机项目文件夹即可；填远端地址时才会出现认证选项。"
                  })
                ]
              }),
              mode === "functional" && isRemote ? jsxs5("label", {
                style: styles.label,
                children: [
                  "读取方式",
                  jsx5("select", {
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
                      jsx5("option", { value: "git", children: "本地 Git（推荐）" }, "mode-git"),
                      jsx5("option", {
                        value: "codeup",
                        children: "远端 API 兜底（无本机 Git）"
                      }, "mode-codeup")
                    ]
                  }),
                  jsx5("span", {
                    style: { display: "block", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                    children: accessMode === "codeup" ? "不克隆仓库，改用宿主提供的代码接口拉提交和 diff（当前支持云效 Codeup）。适合本机 Git 不可用时。静态波及仍需要本地 Git。" : "同步远端时只保存 git 对象，不再检出整棵源码。已有的工作区缓存仍可继续用。"
                  })
                ]
              }) : null,
              jsxs5("div", {
                style: Object.assign({}, styles.row, { marginBottom: 8 }),
                children: [
                  mode === "functional" ? jsx5("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy || !repoPath.trim(),
                    onClick: function() {
                      rememberRepo(repoPath.trim());
                      loadCommits(true);
                      setSettingsOpen(false);
                    },
                    children: "保存并加载版本"
                  }) : jsx5("button", {
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
                  repoPath.trim() && repoList.indexOf(repoPath.trim()) !== -1 ? jsx5("button", {
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
              !isRemote ? jsx5("p", {
                style: { margin: "0 0 4px", color: "#0f6e56", fontSize: 12, lineHeight: 1.45 },
                children: "本地文件夹：直接读取，无需填写认证。"
              }) : null,
              isRemote && jsxs5("div", {
                style: {
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8
                },
                children: [
                  jsxs5("label", {
                    style: styles.label,
                    children: [
                      "远端认证",
                      jsx5("select", {
                        style: styles.input,
                        value: authMode,
                        onChange: function(e) {
                          setRemoteAuthMode(e.target.value);
                        },
                        children: [
                          jsx5("option", { value: "none", children: "无需认证" }),
                          jsx5("option", {
                            value: "token",
                            children: "个人访问令牌"
                          }),
                          jsx5("option", {
                            value: "https",
                            children: "HTTPS 用户名 + 密码/Token"
                          }),
                          jsx5("option", { value: "ssh", children: "SSH 私钥" })
                        ]
                      })
                    ]
                  }),
                  authMode === "https" ? jsxs5("label", {
                    style: styles.label,
                    children: [
                      "用户名",
                      jsx5("input", {
                        style: styles.input,
                        value: authUser,
                        onChange: function(e) {
                          setAuthUser(e.target.value);
                        }
                      })
                    ]
                  }) : jsx5("div", { children: null })
                ]
              }),
              isRemote && authMode === "token" ? jsxs5("label", {
                style: styles.label,
                children: [
                  "个人访问令牌",
                  jsx5("input", {
                    style: styles.input,
                    type: "password",
                    value: yxToken,
                    disabled: busy,
                    placeholder: yxTokenSaved ? "已保存在本机，留空则继续使用" : "粘贴 PAT / 个人访问令牌即可",
                    onChange: function(e) {
                      setYxToken(e.target.value);
                    }
                  }),
                  jsx5("span", {
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
              isRemote && authMode === "https" ? jsxs5("label", {
                style: styles.label,
                children: [
                  "密码 / Token",
                  jsx5("input", {
                    style: styles.input,
                    type: "password",
                    value: authToken,
                    placeholder: "与上方用户名配套的密码或 Token",
                    onChange: function(e) {
                      setAuthToken(e.target.value);
                    }
                  }),
                  jsx5("span", {
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
              isRemote && authMode === "ssh" ? jsxs5("label", {
                style: styles.label,
                children: [
                  "私钥绝对路径",
                  jsx5("input", {
                    style: styles.input,
                    value: authKey,
                    placeholder: "本机 SSH 私钥文件路径，如 ~/.ssh/id_ed25519",
                    onChange: function(e) {
                      setAuthKey(e.target.value);
                    }
                  })
                ]
              }) : null,
              isRemote && authMode !== "none" ? jsxs5("label", {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 500,
                  marginTop: 4
                },
                children: [
                  jsx5("input", {
                    type: "checkbox",
                    checked: rememberAuth,
                    onChange: function(e) {
                      setRememberAuth(e.target.checked);
                    }
                  }),
                  "记住认证到本机"
                ]
              }) : null,
              (function() {
                return jsxs5(jsxRuntime.Fragment, {
                  children: [
                    jsx5("div", {
                      style: {
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px solid var(--dsh-border, #ddd4c5)",
                        fontWeight: 700
                      },
                      children: "协作平台"
                    }),
                    jsx5("p", {
                      style: { margin: "4px 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                      children: "关联工作项、提交失败反馈 / UI 差异缺陷。可选云效 / GitHub / GitLab / Webhook。选云效时令牌可与上方「个人访问令牌」共用。功能影响分析与「设计差异分析」共用同一套平台配置。"
                    }),
                    jsxs5("label", {
                      style: styles.label,
                      children: [
                        "平台",
                        jsx5("select", {
                          style: styles.input,
                          value: trackerProvider,
                          onChange: function(e) {
                            setTrackerProvider(e.target.value);
                          },
                          children: [
                            jsx5("option", { value: "none", children: "不启用" }),
                            jsx5("option", { value: "yunxiao", children: "阿里云效" }),
                            jsx5("option", { value: "github", children: "GitHub Issues" }),
                            jsx5("option", { value: "gitlab", children: "GitLab Issues" }),
                            jsx5("option", { value: "webhook", children: "通用 Webhook" })
                          ]
                        })
                      ]
                    }),
                    trackerProvider === "yunxiao" ? jsxs5("div", {
                      children: [
                        jsx5("p", {
                          style: {
                            margin: "0 0 8px",
                            color: "#6b645a",
                            fontSize: 12,
                            lineHeight: 1.4
                          },
                          children: "访问令牌与上方「个人访问令牌」共用。填好后点「拉取企业」，再依次选择企业 / 项目 / 缺陷类型 / 负责人。"
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "API Endpoint（一般不用改）",
                            jsx5("input", {
                              style: styles.input,
                              value: yxEndpoint,
                              onChange: function(e) {
                                setYxEndpoint(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs5("div", {
                          style: Object.assign({}, styles.row, { alignItems: "flex-end" }),
                          children: [
                            jsxs5("label", {
                              style: Object.assign({}, styles.label, {
                                flex: 1,
                                marginBottom: 0
                              }),
                              children: [
                                "访问令牌",
                                jsx5("input", {
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
                            jsx5("button", {
                              type: "button",
                              style: styles.primary,
                              disabled: busy || !usableSecret(yxToken) && !yxTokenSaved,
                              onClick: refreshYunxiaoOrgs,
                              children: "拉取企业"
                            })
                          ]
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "企业 organizationId",
                            jsx5("select", {
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
                                jsx5(
                                  "option",
                                  {
                                    value: "",
                                    children: yxOrgs.length ? "请选择企业" : "先点「拉取企业」"
                                  },
                                  "yx-org-empty"
                                )
                              ].concat(
                                (yxOrgs || []).map(function(o) {
                                  return jsx5(
                                    "option",
                                    { value: o.id, children: o.name + "（" + o.id + "）" },
                                    o.id
                                  );
                                })
                              )
                            })
                          ]
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "项目 spaceId",
                            jsx5("select", {
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
                                jsx5(
                                  "option",
                                  {
                                    value: "",
                                    children: yxProjects.length ? "请选择项目" : yxOrg ? "加载中或暂无项目" : "先选择企业"
                                  },
                                  "yx-space-empty"
                                )
                              ].concat(
                                (yxProjects || []).map(function(o) {
                                  return jsx5(
                                    "option",
                                    { value: o.id, children: o.name + "（" + o.id + "）" },
                                    o.id
                                  );
                                })
                              )
                            })
                          ]
                        }),
                        jsxs5("div", {
                          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                          children: [
                            jsxs5("label", {
                              style: styles.label,
                              children: [
                                "缺陷类型 workitemTypeId",
                                jsx5("select", {
                                  style: styles.input,
                                  value: yxType,
                                  disabled: busy || !yxSpace,
                                  onChange: function(e) {
                                    setYxType(e.target.value);
                                  },
                                  children: [
                                    jsx5(
                                      "option",
                                      {
                                        value: "",
                                        children: yxTypes.length ? "请选择缺陷类型" : yxSpace ? "加载中或暂无类型" : "先选择项目"
                                      },
                                      "yx-type-empty"
                                    )
                                  ].concat(
                                    (yxTypes || []).map(function(o) {
                                      return jsx5(
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
                            jsxs5("label", {
                              style: styles.label,
                              children: [
                                "负责人 assignedTo",
                                jsx5("select", {
                                  style: styles.input,
                                  value: yxAssignee,
                                  disabled: busy || !yxOrg,
                                  onChange: function(e) {
                                    setYxAssignee(e.target.value);
                                  },
                                  children: [
                                    jsx5(
                                      "option",
                                      {
                                        value: "",
                                        children: yxMembers.length ? "请选择负责人" : yxOrg ? "加载中或暂无成员" : "先选择企业"
                                      },
                                      "yx-member-empty"
                                    )
                                  ].concat(
                                    (yxMembers || []).map(function(o) {
                                      return jsx5(
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
                        yxCatalogHint ? jsx5("p", {
                          style: {
                            margin: "4px 0 0",
                            color: "#6b645a",
                            fontSize: 12
                          },
                          children: yxCatalogHint
                        }) : null,
                        jsxs5("div", {
                          style: {
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px dashed #ddd6cb"
                          },
                          children: [
                            jsxs5("label", {
                              style: {
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                color: "#6b645a",
                                cursor: "pointer"
                              },
                              children: [
                                jsx5("input", {
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
                            yxDebugLog ? jsxs5("div", {
                              style: { marginTop: 6 },
                              children: [
                                jsxs5("div", {
                                  style: {
                                    display: "flex",
                                    gap: 6,
                                    marginBottom: 4
                                  },
                                  children: [
                                    jsx5("button", {
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
                                    jsx5("button", {
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
                                jsx5("textarea", {
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
                    trackerProvider === "github" ? jsxs5("div", {
                      children: [
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "GitHub Token",
                            jsx5("input", {
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
                        jsxs5("div", {
                          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                          children: [
                            jsxs5("label", {
                              style: styles.label,
                              children: [
                                "owner",
                                jsx5("input", {
                                  style: styles.input,
                                  value: ghOwner,
                                  onChange: function(e) {
                                    setGhOwner(e.target.value);
                                  }
                                })
                              ]
                            }),
                            jsxs5("label", {
                              style: styles.label,
                              children: [
                                "repo",
                                jsx5("input", {
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
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "labels（逗号分隔）",
                            jsx5("input", {
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
                    trackerProvider === "gitlab" ? jsxs5("div", {
                      children: [
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "GitLab Host",
                            jsx5("input", {
                              style: styles.input,
                              value: glHost,
                              onChange: function(e) {
                                setGlHost(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "Private Token",
                            jsx5("input", {
                              style: styles.input,
                              type: "password",
                              value: glToken,
                              onChange: function(e) {
                                setGlToken(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "projectId（数字或 group/project）",
                            jsx5("input", {
                              style: styles.input,
                              value: glProject,
                              onChange: function(e) {
                                setGlProject(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "labels（逗号分隔）",
                            jsx5("input", {
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
                    trackerProvider === "webhook" ? jsxs5("div", {
                      children: [
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "Webhook URL",
                            jsx5("input", {
                              style: styles.input,
                              value: whUrl,
                              placeholder: "https://… 可对接 Jira / 飞书 / 自建服务",
                              onChange: function(e) {
                                setWhUrl(e.target.value);
                              }
                            })
                          ]
                        }),
                        jsxs5("label", {
                          style: styles.label,
                          children: [
                            "Authorization 头（可选）",
                            jsx5("input", {
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
                    trackerProvider !== "none" ? jsx5("button", {
                      type: "button",
                      style: Object.assign({}, styles.btn, { marginTop: 4 }),
                      disabled: busy,
                      onClick: saveTrackerSettings,
                      children: trackerReady ? "保存平台配置（已就绪）" : "保存平台配置"
                    }) : jsx5("button", {
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
            return jsxs5(jsxRuntime.Fragment, {
              children: [
                trackerProvider === "yunxiao" && yxOrg && yxSpace ? jsxs5("div", {
                  style: {
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "#f7f4ee",
                    borderRadius: 8,
                    border: "1px solid var(--dsh-border, #ddd4c5)"
                  },
                  children: [
                    jsx5("div", {
                      style: { fontWeight: 600, marginBottom: 6 },
                      children: "关联敏捷任务（可选，多选）"
                    }),
                    jsx5("p", {
                      style: { margin: "0 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.4 },
                      children: "勾选工作项类型后拉取任务，再多选任务。生成验证清单 / AI 智能分析时会把它们写入清单与提示。"
                    }),
                    jsxs5("div", {
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
                        return jsxs5(
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
                              jsx5("input", {
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
                    jsxs5("div", {
                      style: Object.assign({}, styles.row, { marginBottom: 6 }),
                      children: [
                        jsx5("button", {
                          type: "button",
                          style: styles.primary,
                          disabled: busy,
                          onClick: refreshAgileWorkitems,
                          children: "拉取任务"
                        }),
                        jsx5("button", {
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
                        jsx5("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy || !Object.keys(wiSelected).length,
                          onClick: function() {
                            setWiSelected({});
                          },
                          children: "清空选择"
                        }),
                        jsx5("span", {
                          style: { color: "#6b645a", fontSize: 12 },
                          children: "已选 " + Object.keys(wiSelected).filter(function(k) {
                            return wiSelected[k];
                          }).length + " / " + (wiItems || []).length
                        })
                      ]
                    }),
                    wiHint ? jsx5("p", {
                      style: { margin: "0 0 6px", color: "#6b645a", fontSize: 12 },
                      children: wiHint
                    }) : null,
                    wiItems.length ? jsx5("div", {
                      style: {
                        maxHeight: 180,
                        overflow: "auto",
                        border: "1px solid var(--dsh-border, #e5ddd0)",
                        borderRadius: 6,
                        background: "#fff",
                        padding: "4px 0"
                      },
                      children: wiItems.map(function(it) {
                        return jsxs5(
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
                              jsx5("input", {
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
                              jsxs5("span", {
                                style: { flex: 1, minWidth: 0 },
                                children: [
                                  jsx5("span", {
                                    style: {
                                      display: "inline-block",
                                      fontSize: 11,
                                      color: "#8a7f70",
                                      marginRight: 6
                                    },
                                    children: it.category || "WorkItem"
                                  }),
                                  jsx5("span", { children: it.subject }),
                                  it.status ? jsx5("span", {
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
                jsxs5("div", {
                  style: Object.assign({}, styles.row, { marginTop: 10 }),
                  children: [
                    jsx5("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !repoPath.trim(),
                      onClick: function() {
                        loadCommits(true);
                      },
                      children: "同步版本"
                    }),
                    jsx5("button", {
                      type: "button",
                      style: styles.primary,
                      disabled: busy || !baseCommit || !headCommit,
                      onClick: analyze,
                      children: "生成验证清单"
                    }),
                    jsx5("button", {
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
                    jsx5("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !baseCommit || !headCommit,
                      onClick: refreshStoredReport,
                      children: "刷新清单"
                    })
                  ]
                }),
                jobId ? jsxs5("div", {
                  style: Object.assign({}, styles.row, {
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "#faf7f0",
                    borderRadius: 8,
                    border: "1px solid var(--dsh-border, #ddd4c5)"
                  }),
                  children: [
                    jsx5("span", {
                      style: { fontWeight: 600, whiteSpace: "nowrap" },
                      children: "对话任务 ID"
                    }),
                    jsx5("code", {
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
                    jsx5("button", {
                      type: "button",
                      style: styles.btn,
                      onClick: function() {
                        copyText(jobId, "任务 ID");
                      },
                      children: "复制"
                    }),
                    jsx5("span", {
                      style: { color: "#6b645a", fontSize: 12 },
                      children: jobStatus === "pending" ? "等待 publish" : jobStatus === "published" ? "已发布" : jobStatus || ""
                    })
                  ]
                }) : null,
                jsxs5("div", {
                  style: Object.assign({}, styles.row, { marginTop: 8, alignItems: "flex-end" }),
                  children: [
                    jsxs5("label", {
                      style: Object.assign({}, styles.label, { flex: 1, marginBottom: 0, minWidth: 180 }),
                      children: [
                        "历史任务（多仓库）",
                        jsx5("select", {
                          style: styles.input,
                          value: historyId,
                          disabled: busy || !history.length,
                          onChange: function(e) {
                            var id = e.target.value;
                            setHistoryId(id);
                            if (id) openHistoryEntry(id);
                          },
                          children: [
                            jsx5(
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
                              return jsx5("option", { value: h.id, children: label }, h.id);
                            })
                          )
                        })
                      ]
                    }),
                    jsx5("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !historyId,
                      onClick: function() {
                        copyText(historyId, "历史 ID");
                      },
                      children: "复制历史 ID"
                    }),
                    jsx5("button", {
                      type: "button",
                      style: styles.btn,
                      disabled: busy || !historyId,
                      onClick: deleteSelectedHistory,
                      children: "删除"
                    })
                  ]
                }),
                copyFlash ? jsx5("p", {
                  style: { color: "#0f6e56", margin: "6px 0 0", fontSize: 12 },
                  children: copyFlash
                }) : null,
                chatHint ? jsx5("p", {
                  style: { color: "#6b645a", margin: "8px 0 0", fontSize: 12, lineHeight: 1.45 },
                  children: chatHint
                }) : null,
                jsxs5("div", {
                  style: { marginTop: 8 },
                  children: [
                    jsxs5("div", {
                      style: Object.assign({}, styles.row, {
                        marginBottom: 0,
                        alignItems: "center",
                        gap: 8
                      }),
                      children: [
                        jsx5("button", {
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
                        !branchPickerOpen ? jsx5("span", {
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
                    branchPickerOpen ? jsxs5("div", {
                      style: { marginTop: 6 },
                      children: [
                        jsx5("input", {
                          style: styles.input,
                          value: branchQuery,
                          disabled: busy || !(refs && refs.length),
                          placeholder: refs && refs.length ? "输入分支名筛选；列表按最新提交时间排序" : "先同步版本",
                          onChange: function(e) {
                            setBranchQuery(e.target.value);
                          }
                        }),
                        jsx5("div", {
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
                              return jsx5("div", {
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
                              return jsxs5(
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
                                    jsxs5("div", {
                                      style: {
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: 12,
                                        lineHeight: 1.35
                                      },
                                      title: r.name + (r.subject ? "\n" + r.subject : "") + (r.date ? "\n" + r.date : ""),
                                      children: [
                                        jsxs5("div", {
                                          style: { wordBreak: "break-all" },
                                          children: [
                                            (r.kind === "remote" ? "远端 " : "") + r.name,
                                            r.short ? jsx5("span", {
                                              style: { color: "#8a7f70" },
                                              children: " · " + r.short
                                            }) : null,
                                            isNewest ? jsx5("span", {
                                              style: Object.assign({}, styles.badge, {
                                                marginLeft: 6,
                                                background: "#dbeafe",
                                                color: "#1d4ed8"
                                              }),
                                              children: "最新"
                                            }) : null
                                          ]
                                        }),
                                        r.date || r.subject ? jsx5("div", {
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
                                    jsx5("button", {
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
                                    jsx5("button", {
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
                        branchQuery && matchingBranches(refs, branchQuery).length > 40 ? jsx5("div", {
                          style: { color: "#6b645a", fontSize: 11, marginTop: 4 },
                          children: "匹配超过 40 个，请再输入几个字缩小范围"
                        }) : !branchQuery && matchingBranches(refs, "").length > 40 ? jsx5("div", {
                          style: { color: "#6b645a", fontSize: 11, marginTop: 4 },
                          children: "分支较多，输入名称筛选。列表先显示前 40 个"
                        }) : null
                      ]
                    }) : null
                  ]
                }),
                jsxs5("div", {
                  style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 },
                  children: [
                    jsxs5("label", {
                      style: styles.label,
                      children: [
                        "稳定版本",
                        jsx5(
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
                    jsxs5("label", {
                      style: styles.label,
                      children: [
                        "待测版本",
                        jsx5(
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
          error ? jsx5("p", { style: styles.error, children: error }) : null
        ]
      }),
      mode === "functional" && report ? jsxs5("section", {
        style: styles.card,
        children: [
          jsx5("div", {
            style: { marginBottom: 8, color: "#6b645a" },
            children: "变更文件 " + (report.changedFiles || []).length + " · 直接 " + (report.direct || []).length + " · 波及 " + (report.ripple || []).length + " · " + (report.modelEnriched ? "AI 分析" : "规则分析")
          }),
          jsx5("p", {
            style: { margin: "0 0 8px", color: "#6b645a", fontSize: 12, lineHeight: 1.45 },
            children: "验证时点右侧按钮记录结果。标记「失败」后可填写备注，便于复制反馈给开发。结果会写入本机。"
          }),
          jsxs5("div", {
            style: Object.assign({}, styles.row, {
              marginBottom: 8,
              justifyContent: "space-between",
              alignItems: "center"
            }),
            children: [
              jsx5("div", {
                style: { fontSize: 12, color: "#3d3a34", flex: "1 1 auto", minWidth: 0 },
                children: (function() {
                  var all = [].concat(report.direct || [], report.ripple || []);
                  var pass = 0;
                  var fail = 0;
                  var skip = 0;
                  var pending2 = 0;
                  all.forEach(function(it) {
                    var s = it.status || "pending";
                    if (s === "pass") pass += 1;
                    else if (s === "fail") fail += 1;
                    else if (s === "skip") skip += 1;
                    else pending2 += 1;
                  });
                  return "进度：通过 " + pass + " · 失败 " + fail + " · 跳过 " + skip + " · 待测 " + pending2;
                })()
              }),
              jsxs5("div", {
                style: {
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  flex: "0 0 auto"
                },
                children: [
                  jsx5("button", {
                    type: "button",
                    style: styles.btn,
                    onClick: copyFailFeedback,
                    children: "复制失败反馈"
                  }),
                  jsx5("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy,
                    onClick: submitTracker,
                    children: "提交缺陷"
                  }),
                  jsx5("button", {
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
          jsxs5("div", {
            style: {
              marginBottom: 10,
              padding: "10px 12px",
              background: "#f7f4ee",
              borderRadius: 8,
              border: "1px solid var(--dsh-border, #ddd4c5)"
            },
            children: [
              jsx5("div", {
                style: { fontWeight: 600, marginBottom: 4 },
                children: "任务附件（整份验证任务）"
              }),
              jsx5("p", {
                style: {
                  margin: "0 0 8px",
                  color: "#6b645a",
                  fontSize: 12,
                  lineHeight: 1.4
                },
                children: "可上传视频录像、文档等。附件属于当前版本对比任务，不绑定单条 checklist。小文件可直接选择；大视频建议填本机绝对路径。"
              }),
              jsxs5("div", {
                style: Object.assign({}, styles.row, {
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 8
                }),
                children: [
                  jsx5("input", {
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
                  jsx5("button", {
                    type: "button",
                    style: styles.primary,
                    disabled: busy,
                    onClick: function() {
                      if (taskAttachRef.current) taskAttachRef.current.click();
                    },
                    children: "选择文件"
                  }),
                  jsx5("input", {
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
                  jsx5("button", {
                    type: "button",
                    style: styles.btn,
                    disabled: busy || !taskAttachPath.trim(),
                    onClick: uploadTaskLocalPath,
                    children: "从路径添加"
                  }),
                  jsx5("span", {
                    style: { fontSize: 12, color: "#6b645a" },
                    children: "已附 " + (report.attachments && report.attachments.length || 0) + "/8"
                  })
                ]
              }),
              report.attachments && report.attachments.length ? jsx5("div", {
                style: { display: "flex", flexDirection: "column", gap: 6 },
                children: report.attachments.map(function(att) {
                  return jsxs5(
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
                        jsxs5("div", {
                          style: { flex: 1, minWidth: 0 },
                          children: [
                            jsx5("div", {
                              style: {
                                fontWeight: 600,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              },
                              title: att.name,
                              children: att.name
                            }),
                            jsx5("div", {
                              style: { fontSize: 11, color: "#8a7f70" },
                              children: (att.mime || "file") + " · " + formatBytes(att.size || 0)
                            })
                          ]
                        }),
                        jsx5("button", {
                          type: "button",
                          style: styles.btn,
                          disabled: busy,
                          onClick: function() {
                            downloadTaskAttachment(att);
                          },
                          children: "下载"
                        }),
                        jsx5("button", {
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
              }) : jsx5("p", {
                style: { margin: 0, fontSize: 12, color: "#9a9185" },
                children: "暂无任务附件"
              })
            ]
          }),
          jsxs5("div", {
            style: styles.row,
            children: [
              jsx5("button", {
                type: "button",
                style: Object.assign({}, styles.btn, tab === "direct" ? { fontWeight: 700 } : null),
                disabled: busy,
                onClick: function() {
                  if (busy) return;
                  setTab("direct");
                },
                children: "直接项"
              }),
              jsx5("button", {
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
            return jsx5(
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
          }) : jsx5("p", { style: { color: "#6b645a" }, children: "这一类没有条目" })
        ]
      }) : null,
      mode === "ui" ? jsx5(VisualComparePanel2, {
        repoInput: repoPath.trim(),
        auth: buildAuthPayload(),
        onSendToChat: fillComposerDraft,
        trackerReady,
        trackerProvider,
        onOpenTrackerSettings: function() {
          setSettingsOpen(true);
        },
        openConfirmDialog: function(opts) {
          setConfirmDlg({
            title: opts.title,
            message: opts.message || "",
            inputLabel: opts.inputLabel,
            inputValue: opts.inputValue || "",
            multiline: !!opts.multiline,
            fields: opts.fields || null,
            confirmLabel: opts.confirmLabel || "保存",
            danger: false,
            onConfirm: opts.onConfirm
          });
        }
      }) : null,
      confirmDlg ? jsxs5("div", {
        style: styles.modalBackdrop,
        role: "dialog",
        "aria-modal": "true",
        onClick: function() {
          setConfirmDlg(null);
        },
        children: [
          jsxs5("div", {
            style: Object.assign({}, styles.modalCard, { width: "min(480px, 100%)" }),
            onClick: function(e) {
              e.stopPropagation();
            },
            children: [
              jsx5("div", {
                style: { fontWeight: 700, fontSize: 15, marginBottom: 8 },
                children: confirmDlg.title || "请确认"
              }),
              confirmDlg.message ? jsx5("p", {
                style: { margin: "0 0 12px", lineHeight: 1.5, color: "#4a453e" },
                children: confirmDlg.message
              }) : null,
              confirmDlg.fields && confirmDlg.fields.length ? jsx5("div", {
                style: { display: "grid", gap: 10, marginBottom: 14 },
                children: confirmDlg.fields.map(function(field, idx) {
                  return jsxs5(
                    "label",
                    {
                      style: styles.label,
                      children: [
                        field.label,
                        jsx5("input", {
                          style: styles.input,
                          value: field.value || "",
                          autoFocus: idx === 0,
                          onChange: function(e) {
                            var nextVal = e.target.value;
                            var key = field.key;
                            setConfirmDlg(function(prev) {
                              if (!prev || !prev.fields) return prev;
                              return Object.assign({}, prev, {
                                fields: prev.fields.map(function(f) {
                                  return f.key === key ? Object.assign({}, f, { value: nextVal }) : f;
                                })
                              });
                            });
                          }
                        })
                      ]
                    },
                    field.key
                  );
                })
              }) : confirmDlg.inputLabel ? jsxs5("label", {
                style: Object.assign({}, styles.label, { marginBottom: 14 }),
                children: [
                  confirmDlg.inputLabel,
                  confirmDlg.multiline ? jsx5("textarea", {
                    style: Object.assign({}, styles.input, {
                      minHeight: 88,
                      resize: "vertical"
                    }),
                    value: confirmDlg.inputValue || "",
                    autoFocus: true,
                    onChange: function(e) {
                      var next = e.target.value;
                      setConfirmDlg(function(prev) {
                        if (!prev) return prev;
                        return Object.assign({}, prev, { inputValue: next });
                      });
                    }
                  }) : jsx5("input", {
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
              jsxs5("div", {
                style: Object.assign({}, styles.row, { justifyContent: "flex-end" }),
                children: [
                  jsx5("button", {
                    type: "button",
                    style: styles.btn,
                    onClick: function() {
                      setConfirmDlg(null);
                    },
                    children: "取消"
                  }),
                  jsx5("button", {
                    type: "button",
                    style: confirmDlg.danger ? styles.danger : styles.primary,
                    onClick: function() {
                      var action = confirmDlg.onConfirm;
                      setConfirmDlg(null);
                      if (typeof action !== "function") return;
                      if (confirmDlg.fields && confirmDlg.fields.length) {
                        var map = {};
                        confirmDlg.fields.forEach(function(f) {
                          map[f.key] = f.value || "";
                        });
                        action(map);
                      } else if (confirmDlg.inputLabel) {
                        action(confirmDlg.inputValue);
                      } else {
                        action();
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
          return jsx5("span", { children: "TraceScope" });
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
