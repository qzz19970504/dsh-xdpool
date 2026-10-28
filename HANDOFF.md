# HANDOFF — XD Pool 账号池「扫码渠道卡片」不显示

> 最后更新：2026-10-28 21:40（Asia/Shanghai）
> 接手者请先读「1. 一句话现状」；**问题已在 2026-10-28 定位并修复**，§6 的「下一步」已作废，保留仅作诊断方法参考。

---

## 1. 一句话现状

**已修复（待目视复验）。** 真因是首屏 `Promise.all` 里混进了每个渠道的 `model.list`：cline 的 `model.list` 会拉远端模型目录（models.dev + 厂商端点，各 20s 超时），实测 24s 时仍在飞、整页 >60s 才出卡片。用户看到的「扫码登录通道正在加载…」不是死锁，而是**被一个慢渠道扣住的首屏**。

修复：`load()` 的 Phase 1 只 `await account.list`（本地内存 + `credentials.describe`），卡片先落地；`model.list` → 排序写入 → 拉宿主模型事实改到 Phase 2 按渠道独立执行。另加「重试耗尽后显示『还没有渠道账号』而不是永远『加载中』」。

**三条候选假设实测全部排除**（诊断值见 §5.1）：H1 信封解析（`statuses=11 withAccounts=10`）、H2 RPC 桥（`resolved/rpc/3ms`）、H3 StrictMode（`setups=1 cleanups=0`，且 app.asar 内是 react.production.min.js）。

---

## 2. 环境与代码事实（已验证）

| 项 | 值 |
|---|---|
| 插件 | `dsh-xdpool@2.4.6`（上游 `XDTrees/dsh-xdpool`） |
| 运行位置 | `C:\Users\44575\.dsh\profiles\desktop\node_modules\dsh-xdpool`（**不是 Git 仓库**，靠手工覆盖产物更新） |
| 工作仓库 | `projects/dsh-xdpool/`（Git，`origin`=`qzz19970504/dsh-xdpool`，`upstream`=`XDTrees/dsh-xdpool`） |
| 分支 | `fix/channel-pool-and-provider-registration` |
| HEAD（修复前） | `8bbb2c0 docs: add handoff for the unresolved channel-card loading issue` |
| 历史提交 | `8bbb2c0`（handoff） → `c8df444`（跨卸载缓存） → `d688b90`（撤销别名） → `5190b96`（初版修复） → 基于 `6e4854f`（上游 2.4.6） |
| 安装包一致性 | 修复前 `lib/client.js` = `f32f2dc1…`；修复后 = `78f9081e…`（仓库构建产物与安装目录相同）；`lib/index.js` 未变 `155babd9…` |
| 构建 | `pnpm run build` 在 `verify-deps-before-run` 阶段会先跑 `pnpm install` 并因 `@deepseek-ai/dsh-attachment` 镜像缺版而**直接失败（tsdown 根本没跑）**；用 `node_modules/.bin/tsdown` 直接构建 |
| 最近启动 | `2026-10-28T08:45:11Z` 健康：`providers registered … directory=mounted`，**无** `REJECTED` |

> ⚠️ **不要**在插件市场点更新、也不要跑 `pnpm install`，那会用 npm 官方版覆盖本地产物（源码 commit 不受影响，但运行环境会退回原版）。

---

## 3. 已确认的问题与已做修改（逐条）

### 3.1 RPC 桥不惰性解析（已修，`src/client/channel-rpc.ts`）
`callPack` 原本只在 `installPackRpc` 时解析一次桥；宿主 `connection` 服务未就绪时 `packRpcBridge` 恒 `undefined`，回落裸 `fetch('/api/channel-pack')` → 宿主 401。
**已改**：`callPack` 入口 `if (packRpcBridge === undefined) packRpcBridge = resolvePackRpcBridge()`，且 catch 中 `packRpcBridge = undefined`（断线后下次重新解析，不重放写操作）。

### 3.2 首屏被公网查询阻塞（已修，`src/client/ChannelPoolSection.tsx`）
`load()` 原本在 `setEntries` 之前 `await` 全部厂商的 `credits.balances` / `credits.status`。
**已改**：两阶段——Phase 1 `await` `account.list` + `model.list` 后立即 `setEntries`；Phase 2 逐 provider 后台补余额/签到/模型事实。

> ⚠️ **2026-10-28 修正**：这里的「`model.list` 在 pack 内是内存读」是**错的**。`model.list` 会走 `catalogFactsFor → adapter.resolveModel → ensureRemoteModels()`，cline 的实现拉 `models.dev` + 厂商端点（各 20s 超时），实测 24s 时仍在飞。把它留在首屏 → 整页 >60s 才出卡片，表现为「永久加载中」。现已移出 Phase 1，见 §3.8。

### 3.3 服务端模型事实无缓存（已修，`src/index.ts` `channelModels`）
原每次对上百个模型重新 `ctx.llm.resolveModelInfo`，实测单次 **25.8 秒**。
**已改**：`channelModelFactsCache`（`provider/modelId → facts`）进程级缓存。

### 3.4 组件卸载丢状态（已修，`ChannelPoolSection.tsx`）
**已改**：模块级 `channelEntriesMemoryCache`，`useState(() => channelEntriesMemoryCache)` 初始化，Phase 1/Phase 2 都回写。

### 3.5 昵称去重误删账号（已修）
`dedupeAccounts` 由按 `nickname` 分组改为按 `id`。

### 3.6 CodeBuddy 品牌名（已修，`vendor/channel-pack/pack.js`）
`CODEBUDDY.displayName` → `"WorkBuddy (国内版)"`，`attributionName` → `"WorkBuddy"`。

### 3.7 一次由我引入、已撤销的回归（务必别再犯）
曾把池适配器注册改成 `[cn, 'buddy']` / `[global, 'workbuddy']`，想借 channel-pack 的幂等注册跳过重复 provider。**实际后果**：宿主 `dsh-llm.prepareRoutes` 直接抛 `DUPLICATE_ADAPTER`，`src/index.ts` 的 catch 把四个适配器全部注销并 `return`，整个 XD Pool 不启动。
证据：`~/.xdpool/startup.log` 中 `2026-10-27T07:48:39.358Z adapters REJECTED: … "buddy" is already registered (DUPLICATE_ADAPTER)`。
**已由 `d688b90` 撤销。不要再尝试用注册别名去压制重复 provider。**

---

## 4. 症状的代码路径（为什么显示「加载中」）

`ChannelPoolSection.tsx` 当前尾部：

```tsx
if (entries.length === 0 && error === undefined) {
  return (<section className="dsm-xdpool-cpool">
    <p className="dsm-xdpool-note">{t?.('chan.pending') ?? '扫码渠道加载中…'}</p>
  </section>)
}
```

所以「显示加载中」的**充要条件**是：`entries` 为空 **且** `error` 未设置。

`load()` 中能把状态变成这样的出口只有几处，逐一排除即可定位：

| 出口 | 结果 | 与截图是否相符 |
|---|---|---|
| `fetchChannels()` 抛错 | `setError` | ❌ 无错误文案 |
| `callPack('provider.status')` 返回 `ok:false` | `setError` | ❌ 无错误文案 |
| `load()` 正常完成但 `next.length === 0`（`statusAnswer.ok === true`） | **静默 pending** | ✅ 相符 |
| `callPack` 的 Promise 永不 resolve（宿主 rpc 挂住） | **静默 pending** | ✅ 相符 |
| `mountedRef.current === false` 导致所有 `setEntries` 被跳过 | **静默 pending** | ✅ 相符 |

---

## 5. 三条候选假设（按可能性排序）

### H1（最可能）：`provider.status` 成功返回，但每个渠道的 `accountsTotal` 都是 0
`provider.status` 由 pack 的 `pool.listAccountsByProvider()` 回答（内存读）。若宿主 RPC 返回的信封形状与客户端预期不一致，`providerStatusesFrom()` 会解析出**空 Map** → `scanProviders` 为空 → `next` 为空 → 静默 pending。

注意 `src/client/channel-rpc.ts` 里有一句关键注释：*"connection layer hands back `result.value` with one shell already removed … Re-wrap it rather than unwrap again"*。**这层剥壳次数是历史踩坑点，值得直接测。**

旁证：`GET /plugins/dsh-xdpool/channels` 返回 `state: "ready"`（pack 已挂载）；`~/.dsh/channel-pack/state.json` 现有 **24 条账号 / 11 个 provider**（buddy 2、cline 3、codearts 2、lobsterai 1、loomy 2、minimax 2、qoder 3、qodercn 3、raccoon 2、trae 2、zcode 2）。磁盘上有号、页面却 0 家 → 强烈指向读取链而非数据。

### H2：`callPack` 的宿主 rpc 调用挂住不返回
`resolvePackRpcBridge` 里 `bound('/api','channel-pack',…)` 带 90s `AbortController`；若宿主忽略 signal，`load()` 会永远 await，表现为永久 pending。

### H3：`mountedRef` 在 StrictMode 双调用下永久为 false
当前源码（**这是遗漏，需要修**）：

```tsx
const mountedRef = useRef(true)
useEffect(() => () => { mountedRef.current = false }, [])   // ← 只在卸载时置 false，setup 时从不置 true
```

若宿主以 React StrictMode 挂载（setup → cleanup → setup），`mountedRef.current` 会停在 `false`，之后所有 `setEntries` 被 `if (!mountedRef.current) return` 拦掉 → 数据拿到了但永远不显示，且不报错。**这与症状完全一致。**

> 附注：`loadGenerationRef`（防止旧加载覆盖新加载）和 `settled`/`diagnostic`（空态诊断）在本分支的最近一次重写中**已被丢掉**，当前源码中 `grep loadGenerationRef` 与 `grep diagnostic` 均为 0 命中。早期独立补丁版（`projects/xdpool-patch/`）里曾有这两项并通过过对应测试，可作为参考实现。

### 5.1 实测结论（2026-10-28，决定性证据）

第 0 步加的临时诊断（`stage` / `withAccounts` / `inflight` / 每渠道 5s 限时探测）在运行中的插件上截到：

```
stage=phase1:9/10:minimax  age=24s  channels=11  ok=true  statuses=11  withAccounts=10
answer={ok,value} value={statuses}   rpc=resolved/rpc/3ms/{ok,value} value={statuses}
mount=true  setups=1  cleanups=0  entries=0
inflight=model.list/cline@24s
recent=model.list/raccoon:140ms, /loomy:252ms, /codearts:263ms, /minimax:342ms
probe=… cline:a=ok,m=T …       ← 10 家里只有 cline 的 model.list 超过 5s
```

- **H1 排除**：信封 `{ok,value} value={statuses}` 正是解析器要的形状，11 家全部解析出来、10 家有账号。
- **H2 排除（整体挂住）**：`provider.status` 3ms 返回；桥是 `resolved/rpc` 路径，不是裸 fetch。
- **H3 排除**：`setups=1 cleanups=0`；另从 `app.asar` 抽出真正在跑的 web bundle 确认是 `react.production.min.js` + react-dom 18.3.1，生产版不做 StrictMode 双调用。
- **真因**：`stage` 停在 Phase 1 的 `Promise.all` 上，唯一在飞的调用是 `model.list/cline`；用户实测等 60–90s 后卡片才出现 → 不是死锁，是**首屏被一个慢渠道的远端模型目录拉取扣住**。

### 5.2 `model.list` 不是内存读（推翻 §3.2 的前提）
`vendor/channel-pack/pack.js` 的 `model.list` 会 `catalogFactsFor() → adapter.resolveModel() → ensureRemoteModels()`。cline 的 `fetchRemoteModels` = `models.dev/api.json` + 厂商端点，各 `AbortSignal.timeout(20_000)`，失败后还有 30s 冷却与重试。所以「所有渠道的 model.list 都秒回」这个前提本身不成立。

---

## 6. 本次修复（2026-10-28，已完成）

> 下面 §6.1 保留「怎么把静默 pending 变成可读事实」的方法论，诊断代码本身已删除（不再留 `TEMPORARY` 痕迹）。

### 6.1 做法：把静默 pending 变成一行可读诊断
1. `diagnostic`：在 `providerStatusesFrom()` 之后立刻记录 `channels / ok / statuses / withAccounts`，**写在 `mountedRef` 提前返回之前**；
2. `stage`：`channels → provider.status → phase1:done/total:provider → rendered:n → done:n`，挂住时能指出卡在哪一步；
3. `inflight=` / `recent=`：每个 `callPack` 记录开始/结束时间，秒级刷新，能看出「哪个调用、等了多久」；
4. 每渠道 5s 限时复刻探测（`probe=provider:a=ok|err|T,m=…`），不再让「慢」与「死」混为一谈；
5. 空态区分「还在加载」与「加载完了确实没有账号」。

### 6.2 修法（最终提交内容）
- `ChannelPoolSection.tsx` `load()`：**Phase 1 只 `await account.list`**，卡片立即落地（`models: []`）；`model.list` → `sortChannelModels` → `fetchChannelModels`（宿主模型事实）整体移到 Phase 2，按渠道并发、互不阻塞。
- `model.list` 被拒时仍写 `modelError` 并在卡片上如实显示，不会被折叠成「没有发布模型」。
- `mountedRef`：effect setup 里置 `true`（cleanup 仍置 `false`）。
- 重试耗尽后空态改为 `channelpool.empty` 文案，不再永远「加载中」。
- 回归测试：`tests/channel-pool-mount.test.ts`（6 例）——先红后绿：
  - `mountedRef` setup 重新置 true / cleanup 置 false；
  - `load()` 中 `account.list` 在 `setEntries(next)` 之前，**任何** `model.list` 都在其后；
  - Phase 1 返回体带 `models: []`；
  - 空态文案区分「加载中」与「已加载且为空」。

### 6.3 验证
- 全量 `vitest run`：`1032 passed / 1 failed`（唯一失败是 §9 记录的 `billion-page` 环境断言）;
- `tsc -p tsconfig.client.json` 对改动文件无错误；`tsdown` 构建成功；
- 部署后安装目录 `lib/client.js` sha256 = `78f9081e…` = 仓库构建产物；`node --check` 通过；bundle 内已无临时诊断字符串；
- 用户实测：刷新后 11 张渠道卡片 1–2 秒内出现（修复前 60–90s）。

---

## 7. 构建 / 部署 / 验证

```bash
cd projects/dsh-xdpool
node_modules/.bin/vitest run                                  # 当前基线：80 文件 / 1033 例，1032 通过 + 1 例 §9 环境断言
node_modules/.bin/tsdown                                      # 产出 lib/（不要用 pnpm run build，理由见下）
# 覆盖到运行环境（三个文件缺一不可）：
cp lib/client.js lib/index.js ~/.dsh/profiles/desktop/node_modules/dsh-xdpool/lib/
cp vendor/channel-pack/pack.js ~/.dsh/profiles/desktop/node_modules/dsh-xdpool/vendor/channel-pack/
node --check ~/.dsh/profiles/desktop/node_modules/dsh-xdpool/lib/client.js
```

然后在 DSH 里 `Ctrl+R`（必要时托盘退出重开），看：
- `~/.xdpool/startup.log` 末尾应为 `providers registered … directory=mounted`，**不得**出现 `adapters REJECTED`；
- 账号池页应出现各厂商卡片。

> ⚠️ **`pnpm run build` 实际不可用**（2026-10-28 实测）：pnpm 的 `verify-deps-before-run` 会先自动执行 `pnpm install`，因 `@deepseek-ai/dsh-attachment` 在 npmmirror 上无匹配版本而**直接失败退出，tsdown 根本没跑**，`lib/` 保持旧产物。用 `node_modules/.bin/tsdown` 直接构建。
> 另：`lib/` 是**被 Git 跟踪的构建产物**，但仓库检出为 CRLF 而 tsdown 输出为 LF，`git status` 会一直显示 `lib/bin.js` / `lib/index.d.ts` 已修改（`git diff --stat` 为空）——用 `git add` 过滤后不会产生噪声 diff。

---

## 8. 禁止事项

1. **不要**给 `registerAdapter` 追加 `'buddy'` / `'workbuddy'` 别名（会 `DUPLICATE_ADAPTER` 并让整个插件不启动）。
2. **不要**向上游 `XDTrees/dsh-xdpool` 提 PR（用户明确要求只维护自己的 Fork；曾误提交过 PR #76，已关闭）。
3. 不要动 `~/.dsh/.credentials.yaml`、`~/.dsh/.xdpool/accounts.json`、`~/.dsh/channel-pack/state.json` 里的账号/凭据内容。
4. 不要用 `pnpm install` 或插件市场更新覆盖运行环境。

---

## 9. 遗留

- `projects/xdpool-patch/`：早前「独立补丁」方案（`deploy.cjs`、原始 bundle 备份、8 例 vm 测试）已被 Fork 方案取代，**未清理**，其中测试与诊断思路仍有参考价值。
- `tests/billion-page.test.ts` 有 1 例因本机 `DSH_HOME` 环境变量断言失败，与本次改动无关。
