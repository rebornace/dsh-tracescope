# TraceScope

**鐗堟湰: `0.1.1`**锛堝湪 0.1.0 鍔熻兘鍐荤粨鍩虹涓婄殑瀹夊叏鎵弿淇鐗堬級

[涓枃](./README.md) 路 [English](./README.en.md)

TraceScope锛堜粨搴撳悕 `dsh-tracescope`锛夊府鍔╂祴璇曞悓瀛︿粠銆岀ǔ瀹氱増鏈?鈫?寰呮祴鐗堟湰銆嶇殑浠ｇ爜宸紓锛屽揩閫熷緱鍒?*瑕佹祴鍝簺鍔熻兘**鐨勬竻鍗曪紝骞跺湪 DeepSeek Harness **Web / Desktop** 鍙充晶鏍忛噷瀹屾垚鍕鹃€夈€佸娉ㄣ€佹埅鍥俱€侀檮浠朵笌缂洪櫡鎻愪氦銆?
鑳藉姏閫氳繃涓ゅ眰鍒嗗彂锛堣瑙?[ARCHITECTURE.md](./ARCHITECTURE.md)锛夛細

| 琛ㄩ潰 | 浣滅敤 |
|------|------|
| `@rebornace/tracescope-core` | 纭畾鎬у奖鍝嶉潰鍒嗘瀽寮曟搸锛堜笌 Agent 鏃犲叧锛?|
| `@rebornace/tracescope-mcp` | MCP Server锛屼緵 Cursor / Claude 绛変换鎰?MCP 瀹㈡埛绔皟鐢?|
| `@rebornace/dsh-tracescope` | DSH 鎻掍欢锛欻ost API + 鍙充晶鏍忓祵鍏?UI锛堟湰鐗堟湰涓昏矾寰勶級 |

## 鐗堟湰 `0.1.0` 宸插寘鍚姛鑳?
- **鍙?Commit 褰卞搷闈?*锛氱洿鎺ュ彉鏇?+ 鍙嶅悜渚濊禆娉㈠強锛堥粯璁ゆ繁搴?2锛?- **浜鸿瘽鍔熻兘鍚?*锛歚tracescope.modules.yml` 鏄犲皠 鈫?闈欐€佹爣棰樻娊鍙?鈫?鍚彂寮忓懡鍚?- **DSH 鍙充晶鏍?*锛氬浠撳簱銆佽繙绔璇併€侀粯璁ゅ悓姝ャ€屽緟娴?/ 绋冲畾銆嶇増鏈?- **鐢熸垚鎵嬫祴娓呭崟**锛氱‘瀹氭€у垎鏋愬苟钀界洏锛涘悓鐗堟湰瀵规瘮鍙繚鐣欐渶鏂颁竴鏉″巻鍙?- **妯″瀷瀵硅瘽鍒嗘瀽**锛氬垱寤鸿亰澶╀换鍔°€佸啓鍏ヤ細璇濊崏绋裤€乣tracescope_publish_handtest` 鍥炲啓娓呭崟
- **鍕鹃€夌姸鎬?*锛氶€氳繃 / 澶辫触 / 璺宠繃 / 閲嶇疆锛涘け璐ュ彲濉娉?+ **姣忔潯鏈€澶?3 寮犳埅鍥?*
- **浠诲姟绾ч檮浠?*锛氳棰?/ 鏂囨。绛夋寕鍦ㄦ暣浠藉姣斾换鍔′笂锛堟渶澶?8 涓紝涓嶈窡鍗曟潯 checklist锛?- **鍏宠仈浜戞晥鏁忔嵎浠诲姟**锛氱被鍨嬪彲澶氶€夛紝浠诲姟鍙閫夛紝杈呭姪鐢熸垚娓呭崟绉嶅瓙 / 妯″瀷鎻愮ず
- **缂洪櫡骞冲彴**锛氫簯鏁?/ GitHub Issues / GitLab Issues / 閫氱敤 Webhook  
  - 鎻愪氦鏃跺彲**淇敼榛樿鏍囬**  
  - 浜戞晥锛氫换鍔￠檮浠剁湡瀹炰笂浼狅紱鎴浘宓屽叆缂洪櫡**璇︽儏**瀵瑰簲鏉＄洰锛坄![鏂囦欢鍚峕(embedUrl)`锛?- **瀵煎嚭**锛歁arkdown / CSV锛涘鍒跺け璐ュ弽棣?- **鏈満鏁版嵁**锛歚~/.tracescope/`锛堣璇併€佺己闄烽厤缃€佹姤鍛娿€侀檮浠讹級

## 鐜瑕佹眰

- Node.js `>= 20`
- pnpm `9.x`锛堜粨搴撳０鏄?`packageManager: pnpm@9.6.0`锛?- 浣跨敤 DSH 鎻掍欢鏃讹細宸插畨瑁?DeepSeek Harness锛?*Web** 鎴?**Desktop**锛夛紝骞惰兘鎵ц `dsh plugin`

## 瀹夎涓庢瀯寤?
```bash
pnpm install
pnpm build
pnpm test
```

甯哥敤鍛戒护锛?
```bash
# 浠呮瀯寤?/ 娴嬭瘯鏍稿績寮曟搸
pnpm --filter @rebornace/tracescope-core build
pnpm --filter @rebornace/tracescope-core test

# 鏋勫缓 DSH 鎻掍欢涓?MCP
pnpm --filter @rebornace/dsh-tracescope build
pnpm --filter @rebornace/tracescope-mcp build
```

## 瀹夎鍒?DSH锛圵eb / Desktop锛?
鎻掍欢鍖咃細[`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope)锛堝惈 `dsh.bundle` + 鍙充晶鏍?Client锛學eb / Desktop 鍚屼竴鍖咃級銆?
鎸?[DSH 瀹樻柟鍙戝竷璇存槑](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)锛屼紭鍏堢敤 **npm 棰勬瀯寤哄寘**锛堟棤闇€ `allowBuilds`锛夈€?
### 鏂瑰紡涓€锛歞sh-market 鎻掍欢甯傚満鎼滅储瀹夎锛堟帹鑽愶級

1. 鍦?DSH **Web** 鎴?**Desktop** 涓墦寮€ [dsh-market](https://github.com/dsh-market/dsh-market) 甯傚満闈㈡澘  
2. 鎼滅储鍏抽敭璇嶏細`tracescope`銆乣dsh-tracescope`銆乣鎵嬫祴` 鎴?`褰卞搷闈  
3. 閫夋嫨 **TraceScope** / `rebornace/dsh-tracescope#dsh-tracescope`锛屼竴閿畨瑁呭埌褰撳墠 profile  

鏀跺綍鏉＄洰瑙?[awesome-dsh-plugin PR #5388](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5388)锛堝悎骞跺悗甯傚満鍒楄〃浼氳嚜鍔ㄦ洿鏂帮級銆俷pm 鍖呭甫 `dsh-plugin` 绛夊叧閿瘝锛屼究浜庡競鍦轰笌 registry 妫€绱€?
### 鏂瑰紡浜岋細鍛戒护琛屽畨瑁咃紙Web 涓?Desktop锛?
```bash
# DSH Web
dsh plugin --profile web add @rebornace/dsh-tracescope

# DSH Desktop
dsh plugin --profile desktop add @rebornace/dsh-tracescope
```

鑻ユ湰鏈洪粯璁よ蛋 npmmirror 涓斿皻鏈悓姝ュ埌鏈€鏂颁緷璧栵紝鍙复鏃跺湪瀵瑰簲 profile 鐩綍鍐欏叆 `.npmrc`锛?
```ini
registry=https://registry.npmjs.org/
```

鍐嶆墽琛屼笂闈㈢殑 `dsh plugin add`銆?
### 鏂瑰紡涓夛細鏈湴璺緞 / GitHub

```bash
pnpm --filter @rebornace/dsh-tracescope build

# Web
dsh plugin --profile web add <repo>/packages/dsh-tracescope
# Desktop
dsh plugin --profile desktop add <repo>/packages/dsh-tracescope

# 鎴?GitHub锛堥渶涓?prepare 鏋勫缓鎺堟潈锛岃瀹樻柟鏂囨。锛?dsh plugin --profile web add github:rebornace/dsh-tracescope#path:packages/dsh-tracescope
dsh plugin --profile desktop add github:rebornace/dsh-tracescope#path:packages/dsh-tracescope
```

### 瀹夎鍚?
1. 閲嶅惎 / 鍒锋柊瀵瑰簲 profile锛圵eb 娴忚鍣ㄤ細璇濇垨 Desktop锛? 
2. 鎵撳紑鍙充晶鏍?**TraceScope** 鏍囩锛堟柊浼氳瘽鍙兘鑷姩鎵撳紑锛? 
3. 鎴栧湪浼氳瘽涓娇鐢?`/tracescope` 鐩稿叧鑳藉姏锛圚ost tools + 闈㈡澘锛?
### npm 鍖咃紙0.1.1锛?
| 鍖?| 鐢ㄩ€?|
|----|------|
| [`@rebornace/dsh-tracescope`](https://www.npmjs.com/package/@rebornace/dsh-tracescope) | DSH bundle锛堝惈 `dsh.bundle` + Client Slot锛夛紝Web / Desktop 閫氱敤 |
| [`@rebornace/tracescope-core`](https://www.npmjs.com/package/@rebornace/tracescope-core) | 鍒嗘瀽寮曟搸锛堟彃浠朵緷璧栵級 |
| [`@rebornace/tracescope-mcp`](https://www.npmjs.com/package/@rebornace/tracescope-mcp) | 鐙珛 MCP Server |

## 娴嬭瘯鍚屽鎿嶄綔娴佺▼锛?.1.0锛?
1. **閫変粨搴?*锛氭湰鍦拌矾寰勬垨杩滅 URL锛涢渶瑕佹椂閰嶇疆 HTTPS Token / SSH 绉侀挜锛堝彲璁颁綇鍒版湰鏈猴級
2. **鍚屾鐗堟湰**锛氶粯璁ゅ緟娴?= 鏈€鏂版彁浜わ紝绋冲畾 = 娆℃柊鎻愪氦锛涗篃鍙墜鍔ㄦ敼
3. **锛堝彲閫夛級缂洪櫡骞冲彴**锛氫粨搴撻厤缃噷閫変簯鏁?/ GitHub / GitLab / Webhook 骞朵繚瀛? 
   - 浜戞晥锛氬～ token 鈫?鎷夊彇浼佷笟 鈫?閫夐」鐩?/ 缂洪櫡绫诲瀷 / 璐熻矗浜?4. **锛堝彲閫夛級鍏宠仈鏁忔嵎浠诲姟**锛氬嬀閫夌被鍨?鈫?鎷夊彇浠诲姟 鈫?澶氶€夊悗锛屽啀鐐广€岀敓鎴愭墜娴嬫竻鍗曘€嶆垨銆屾ā鍨嬪璇濆垎鏋愩€?5. **鐢熸垚娓呭崟**鎴?*妯″瀷瀵硅瘽鍒嗘瀽**锛堟湁娓呭崟鏃朵細浜屾纭锛?6. **鎵嬫祴鍕鹃€?*锛氬け璐ユ潯鐩～鍐欏娉ㄣ€佹坊鍔犳埅鍥撅紙鍙€夋枃浠舵垨 Ctrl+V锛?7. **浠诲姟闄勪欢**锛氬湪娓呭崟鍖哄煙涓婁紶褰曞儚 / 鏂囨。锛堝皬鏂囦欢閫夋枃浠讹紱澶ц棰戝彲鐢ㄦ湰鏈虹粷瀵硅矾寰勶級
8. **澶嶅埗澶辫触鍙嶉** / **鎻愪氦缂洪櫡**锛堝彲鏀规爣棰橈級 / **瀵煎嚭鎶ュ憡**

## 鍙€夛細妯″潡鏄犲皠

绀轰緥瑙?[examples/tracescope.modules.yml](./examples/tracescope.modules.yml)銆傚垎鏋愭椂鍙寚瀹氳鏂囦欢锛屾妸璺緞瑙勫垯鏄犲皠鎴愪骇鍝佸姛鑳藉悕涓庨闄╃瓑绾с€?
## 鏈満鏁版嵁鐩綍

| 璺緞 | 鍐呭 |
|------|------|
| `~/.tracescope/auth.json`锛堝強璁よ瘉瀛樺偍锛?| Git 杩滅鍑嵁锛堝彲閫夎浣忥級 |
| `~/.tracescope/tracker.json` | 缂洪櫡骞冲彴閰嶇疆 |
| `~/.tracescope/reports/` | 鎵嬫祴娓呭崟鏈€鏂扮増 + 鍘嗗彶绱㈠紩 |
| `~/.tracescope/attachments/<reportKey>/` | 浠诲姟绾ч檮浠朵簩杩涘埗 |
| `~/.tracescope/repos/` | 杩滅浠撳簱鏈湴缂撳瓨锛堝閫傜敤锛?|

## MCP锛堜换鎰?Agent锛?
```bash
pnpm --filter @rebornace/dsh-tracescope build
pnpm --filter @rebornace/tracescope-mcp build
```

瀹㈡埛绔厤缃ず渚嬶紙璺緞鏀逛负鏈満缁濆璺緞锛夛細

```json
{
  "mcpServers": {
    "tracescope": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"]
    }
  }
}
```

MCP tools锛?.1.0锛夛細

| Tool | 璇存槑 |
|------|------|
| `tracescope_open_panel` | 鎵撳紑鏈満鍙鍖栭潰鏉?|
| `tracescope_list_commits` | 鍒楀嚭浠撳簱鎻愪氦 / 寮曠敤 |
| `tracescope_analyze_impact` | 纭畾鎬у奖鍝嶉潰鍒嗘瀽 |

DSH Host 鍐呰繕娉ㄥ唽浜嗕細璇濅晶宸ュ叿锛堜緥濡?`tracescope_get_diff`銆乣tracescope_publish_handtest`锛夛紝渚涖€屾ā鍨嬪璇濆垎鏋愩€嶄娇鐢ㄣ€?
## 鍖呬竴瑙?
| 鍖?| 鐗堟湰 | 璇存槑 |
|----|------|------|
| `@rebornace/tracescope-core` | 0.1.1 | 鍒嗘瀽銆佹姤鍛婂瓨鍌ㄣ€佷簯鏁?/ Tracker銆佸鍑?|
| `@rebornace/dsh-tracescope` | 0.1.1 | DSH Host + React Slot Client |
| `@rebornace/tracescope-mcp` | 0.1.1 | MCP Server |
| `adapters/*`銆乣browser-extension` | 鑴氭墜鏋?| **鏈撼鍏?0.1.0 浜や粯鑼冨洿** |

## 宸茬煡闄愬埗锛?.1.0锛?
- 浜戞晥鎴浘瑕佸湪璇︽儏閲屽祵鍥撅紝闇€缁忓伐浣滈」闄勪欢鎺ュ彛鎹㈠彇姘镐箙 `embedUrl`锛岄檮浠跺垪琛ㄩ噷浠嶅彲鑳藉嚭鐜板搴旀枃浠讹紙骞冲彴鑳藉姏闄愬埗锛?- GitHub / GitLab / Webhook锛?*涓嶄細**鍍忎簯鏁堜竴鏍蜂笂浼犺棰戜簩杩涘埗锛涘涓烘弿杩版枃鏈?/ Webhook JSON 鍏冩暟鎹?- 鍙嬬洘 Adapter銆丄ndroid USB銆佹祻瑙堝櫒鎵╁睍褰曞埗绛変粛涓哄悗缁矾绾垮浘

## 寮€鍙?
```bash
pnpm install
pnpm -r run typecheck
pnpm test
```

鏋舵瀯璇存槑锛歔ARCHITECTURE.md](./ARCHITECTURE.md)

## License

MIT
