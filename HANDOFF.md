# HANDOFF — XD Pool 账号池「扫码渠道卡片」不显示

> 最后更新：2026-10-28 19:10（Asia/Shanghai）
> 接手者请先读「1. 一句话现状」和「6. 下一步」，再看其余细节。

---

## 1. 一句话现状

**问题未解决。** 账号池第一页的 WorkBuddy 国内版/国际版两张卡正常，但下方「其他厂商（扫码渠道）」区块**永久停在**「扫码登录通道正在加载…」，既不出现卡片，也不报错。

已有若干修复已合并、已构建、已部署到本地运行环境，但**没有解决这个症状**。因此下一步**不要再盲改逻辑**，先用第 6 节的诊断把「到底卡在哪一步」变成可观测事实。

---

## 2. 环境与代码事实（已验证）

| 项 | 值 |
|---|---|
| 插件 | `dsh-xdpool@2.4.6`（上游 `XDTrees/dsh-xdpool`） |
| 运行位置 | `C:\Users\44575\.dsh\profiles\desktop\node_modules\dsh-xdpool`（**不是 Git 仓库**，靠手工覆盖产物更新） |
| 工作仓库 | `projects/dsh-xdpool/`（Git，`origin`=`qzz19970504/dsh-xdpool`，`upstream`=`XDTrees/dsh-xdpool`） |
| 分支 | `fix/channel-pool-and-provider-registration` |
| HEAD | `c8df444 perf(client): cache channel entries across unmounts and add server-side fact caching` |
| 历史提交 | `d688b90`（撤销别名） → `5190b96`（初版修复） → 基于 `6e4854f`（上游 2.4.6） |
| 安装包一致性 | `lib/client.js` 在仓库与安装目录 **sha256 完全相同**（`f32f2dc1…`）；`lib/index.js` 同样相同（`155babd9…`） |
| 最近启动 | `2026-10-28T08:45:11Z` 健康：`providers registered … directory=mounted`，**无** `REJECTED` |

> ⚠️ **不要**在插件市场点更新、也不要跑 `pnpm install`，那会用 npm 官方版覆盖本地产物（源码 commit 不受影响，但运行环境会退回原版）。

---

## 3. 已确认的问题与已做修改（逐条）

### 3.1 RPC 桥不惰性解析（已修，`src/client/channel-rpc.ts`）
`callPack` 原本只在 `installPackRpc` 时解析一次桥；宿主 `connection` 服务未就绪时 `packRpcBridge` 恒 `undefined`，回落裸 `fetch('/api/channel-pack')` → 宿主 401。
**已改**：`callPack` 入口 `if (packRpcBridge === undefined) packRpcBridge = resolvePackRpcBridge()`，且 catch 中 `packRpcBridge = undefined`（断线后下次重新解析，不重放写操作）。

### 3.2 首屏被公网查询阻塞（已修，`src/client/ChannelPoolSection.tsx`）
`load()` 原本在 `setEntries` 之前 `await` 全部厂商的 `credits.balances` / `credits.status`。
**已改**：两阶段——Phase 1 只 `await` `account.list` + `model.list`（pack 内为内存读）后立即 `setEntries`；Phase 2 逐 provider 后台补余额/签到/模型事实。

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

---

## 6. 下一步（按顺序执行，不要跳步）

### 第 0 步（必做，约 5 分钟）：把静默 pending 变成一行可读诊断

改 `src/client/ChannelPoolSection.tsx`：

1. 增加 `const [diagnostic, setDiagnostic] = useState<string | undefined>(undefined)`；
2. 在 `load()` 里 `providerStatusesFrom(statusAnswer)` 之后立刻记录：
   ```tsx
   setDiagnostic(
     `channels=${channels.length} ok=${String(statusAnswer.ok)} ` +
     `statuses=${statuses.size} withAccounts=${scanProviders.length}` +
     (statusAnswer.ok ? '' : ` err=${statusAnswer.error?.message ?? '?'}`)
   )
   ```
3. 空态渲染改成显示 `已加载 / 加载中` + diagnostic：
   ```tsx
   <p className="dsm-xdpool-note">
     {settled ? `无渠道账号 ${diagnostic ?? ''}` : `扫码渠道加载中… ${diagnostic ?? ''}`}
   </p>
   ```
   （`settled` 可在 `loadWithRetry` 达到 `LOAD_RETRIES` 或 `entriesRef.current.length > 0` 时置 `true`）
4. 顺手修 H3：把 effect 改成
   ```tsx
   useEffect(() => {
     mountedRef.current = true
     return () => { mountedRef.current = false }
   }, [])
   ```

构建 + 覆盖部署（见第 7 节），刷新界面后**截一张图**。

### 第 1 步：按诊断结果分流

| 诊断输出 | 结论 | 动作 |
|---|---|---|
| `ok=true statuses=0 withAccounts=0` | H1：信封/解析不匹配 | 在 `callPack` 里把 `result` 原样 `console.debug` 一次，确认真实形状；相应修正 `providerStatusesFrom` 的取值路径（`value.statuses` / `result.statuses` / 双层 `value.value.statuses`） |
| `ok=false err=…` | 桥仍未通 | 看 err 文案；确认 `installPackRpc(ctx)` 拿到的 `ctx.connection.rpc.call` 是否可用；必要时改走 `connection.fetch`（pack 自己用 `connection.fetch.register` 注册了 `/api/channel-pack`） |
| `channels=13 statuses=13 withAccounts=0` | pack 内存池确实为空 | 对比 `GET /plugins/dsh-xdpool/channels` 与 `~/.dsh/channel-pack/state.json`；怀疑不同 pack 实例/存储后端 |
| `channels=0` | `fetchChannels()` 返回空 | 检查 `/plugins/dsh-xdpool/channels` 的 `channels` 字段 |
| **完全没有诊断文字** | `load()` 从未进入/永远 await | H2：给 `callPack` 加超时日志，确认是否挂住 |

### 第 2 步：修好后补回归测试

现有测试都在 `tests/`（vitest）。可参考 `projects/xdpool-patch/tests/client-patch.test.cjs`（用 `vm` 从真实 bundle 抽函数）来写：
- 「连接晚到后 `callPack` 仍能解析桥」；
- 「余额慢不影响卡片先落地」；
- 「StrictMode setup-cleanup-setup 后 `mountedRef` 恢复为 true」；
- 「同名不同 id 的账号都保留」。

必须**先看测试失败**再改实现。

---

## 7. 构建 / 部署 / 验证

```bash
cd projects/dsh-xdpool
node_modules/.bin/vitest run                                  # 当前基线：78 文件 / 1027 例通过
pnpm run build                                                # tsdown 产出 lib/
# 覆盖到运行环境（三个文件缺一不可）：
cp lib/client.js lib/index.js ~/.dsh/profiles/desktop/node_modules/dsh-xdpool/lib/
cp vendor/channel-pack/pack.js ~/.dsh/profiles/desktop/node_modules/dsh-xdpool/vendor/channel-pack/
node --check ~/.dsh/profiles/desktop/node_modules/dsh-xdpool/lib/client.js
```

然后在 DSH 里 `Ctrl+R`（必要时托盘退出重开），看：
- `~/.xdpool/startup.log` 末尾应为 `providers registered … directory=mounted`，**不得**出现 `adapters REJECTED`；
- 账号池页应出现各厂商卡片。

> 构建时会打印 `ERR_PNPM_NO_MATCHING_VERSION`（`@deepseek-ai/dsh-*` 的 peer 在镜像源缺失），**可以忽略**，tsdown 仍会正常完成。

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
