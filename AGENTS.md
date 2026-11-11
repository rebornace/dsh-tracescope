# TraceScope — agent notes

## Product direction (keep in sync with `.cursor/rules/product-direction.mdc`)

**Stable pillars:** 功能影响分析 · 设计差异分析 · 崩溃分析（本机 USB 采集 + 友盟 + Crashlytics；主按钮「输出复现方式」、次按钮「定位并修复」）。

**User parked / do not push next:**

- 网页崩溃 / 网页专项崩溃页签  
- 浏览器扩展录制  
- 崩溃符号化（mapping / dSYM）— 有 AI 时优先级低  
- 友盟 OpenAPI（付费，等真实需求）  
- 粘贴堆栈入口（已删除）  
- Windows iOS USB 实时采集  

**Design enrichment:** 用户会自行重新设计方案后再做；在此之前不要继续堆各栈 enrichment。

**Platform adapters**（Sentry / Bugly / Jira / 飞书 / MasterGo 等）：有明确用户需求再接。

When planning “下一步做什么”, surface this list first.
