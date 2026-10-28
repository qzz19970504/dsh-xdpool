/**
 * The account-pool section's first paint: what it waits for, and what an empty
 * page is allowed to claim.
 *
 * Two failures are pinned here, both measured on the running plugin:
 *
 * 1. `mountedRef` was created `true` and only ever cleared in the effect
 *    cleanup, while every state write from a finished load is guarded by it. A
 *    setup → cleanup → setup mount (StrictMode) would leave it false for the
 *    rest of the session: the data arrives and is dropped, so the page renders
 *    "loading" with no error. The effect therefore re-arms on setup.
 *
 * 2. Phase 1 awaited `model.list` for every channel. Nine channels answered in
 *    140–342 ms, but cline's resolves a remote catalogue (models.dev plus the
 *    vendor endpoint, 20 s timeout each) and was still in flight at 24 s — no
 *    card rendered for over a minute, which is indistinguishable from "this
 *    page never loads". Cards must land on the account rows alone; model
 *    catalogues, balances and host facts are enrichment after `setEntries`.
 *
 * The section's React tree is not rendered here (the same approach
 * `card-shell.test.ts` takes): the browser bundle is CommonJS consumed by a
 * host dialog that has no DOM in this process, so the contract is asserted on
 * the source.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const section = readFileSync(new URL('../src/client/ChannelPoolSection.tsx', import.meta.url), 'utf8')

/** The effect that maintains `mountedRef`, from `useEffect(` to its `}, [])`. */
function mountEffect(): string {
  const start = section.indexOf('useEffect(() => {')
  if (start === -1) return ''
  const end = section.indexOf('}, [])', start)
  return end === -1 ? '' : section.slice(start, end + '}, [])'.length)
}

/** `load()`'s body only. */
function loadBody(): string {
  const start = section.indexOf('const load = async (): Promise<void> => {')
  const end = section.indexOf('const loadWithRetry', start)
  return start === -1 || end === -1 ? '' : section.slice(start, end)
}

describe('mount flag', () => {
  it('re-arms mountedRef during effect setup, not only clears it in cleanup', () => {
    const effect = mountEffect()
    expect(effect, 'the mount effect must exist').not.toBe('')
    const setupHalf = effect.slice(0, effect.indexOf('return () =>'))
    // This is the regression: setup used to leave the ref untouched, so a
    // setup → cleanup → setup cycle left it false forever.
    expect(setupHalf).toContain('mountedRef.current = true')
  })

  it('still drops the flag in the cleanup, so a real unmount stops state writes', () => {
    const effect = mountEffect()
    const cleanupHalf = effect.slice(effect.indexOf('return () =>'))
    expect(cleanupHalf).toContain('mountedRef.current = false')
  })
})

describe('empty first page', () => {
  it('stops claiming to load once the retries are spent', () => {
    // "Loaded and empty" and "still loading" are different sentences; the page
    // saying the second one forever is what made a slow first paint read as a
    // hung plugin.
    expect(section).toContain('setSettled(true)')
    expect(section).toMatch(/settled\s*\?\s*\(t\?\.\('channelpool\.empty'\)/)
  })

  it('keeps the loading line for the window before the retries are spent', () => {
    expect(section).toContain("t?.('chan.pending')")
  })
})

describe('first paint does not wait for a slow model catalogue', () => {
  it('awaits account rows before the cards land, and no model catalogue', () => {
    const body = loadBody()
    expect(body, 'load() must exist').not.toBe('')
    const setEntriesAt = body.indexOf('setEntries(next)')
    expect(setEntriesAt, 'load() must call setEntries(next)').toBeGreaterThan(-1)

    const accountListAt = body.indexOf("callPack('account.list'")
    expect(accountListAt, 'cards still need their account rows').toBeGreaterThan(-1)
    expect(accountListAt).toBeLessThan(setEntriesAt)

    for (const match of body.matchAll(/callPack\('model\.list'/gu)) {
      expect(match.index, 'model.list must be fetched after the cards land').toBeGreaterThan(setEntriesAt)
    }
    expect(body.match(/callPack\('model\.list'/gu)?.length, 'model.list must still be fetched').toBeGreaterThan(0)
  })

  it('lands the card with an empty model list that the enrichment phase fills', () => {
    const body = loadBody()
    const phaseOneReturn = body.slice(body.indexOf('return ['), body.indexOf('setEntries(next)'))
    expect(phaseOneReturn).toContain('models: []')
  })
})
