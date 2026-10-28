/**
 * The footer credit strip: what it may claim about how much credit is left.
 *
 * The strip sits under the whole pool page and answers one question — "how much
 * is left, per channel". Three things about it are easy to get wrong and hard
 * to notice, so they are pinned here:
 *
 * 1. A balance nobody read is NOT zero. `undefined` renders the em dash; `0`
 *    renders as `0`, because that is a fact the vendor answered with.
 * 2. Channels that never published a balance route (`credits` absent) are left
 *    out entirely rather than printed as "—", which would read as "spent".
 * 3. Summing is per channel, and one dead account does not blank the total —
 *    the same best-effort rule the region cards already use for the pool lanes.
 *
 * @module dsh-xdpool/tests/credit-footer
 */
import { describe, expect, it } from 'vitest'
import {
  creditFooterRows,
  formatCreditAmount,
} from '../src/client/credit-footer.ts'

describe('formatCreditAmount', () => {
  it('renders nothing for a balance nobody reported', () => {
    // Not "0": an unread balance is unknown, and printing zero would be a
    // number the vendor never said.
    expect(formatCreditAmount(undefined)).toBeUndefined()
  })

  it('keeps a genuine zero as zero', () => {
    expect(formatCreditAmount(0)).toBe('0')
  })

  it('groups thousands and drops a meaningless fraction on large numbers', () => {
    expect(formatCreditAmount(1234567)).toBe('1,234,567')
  })

  it('keeps cents when the vendor reports dollars', () => {
    // Cline pays in dollars; rounding 0.79 to 1 would overstate the balance by
    // a quarter of its value.
    expect(formatCreditAmount(0.79)).toBe('0.79')
  })

  it('refuses a NaN or infinite balance', () => {
    expect(formatCreditAmount(Number.NaN)).toBeUndefined()
    expect(formatCreditAmount(Number.POSITIVE_INFINITY)).toBeUndefined()
  })
})

describe('creditFooterRows', () => {
  const channel = (id: string, credits: unknown = { claim: true }) => ({ id, credits })

  it('sums the accounts that answered and skips the ones that did not', () => {
    const rows = creditFooterRows(
      [{ id: 'zcode', credits: { claim: true, unit: 'tokens' } }],
      { zcode: [1500, undefined, 500] },
    )
    expect(rows).toEqual([{ id: 'zcode', text: '2,000', unit: 'tokens' }])
  })

  it('reports an answered zero as zero, not as unknown', () => {
    const rows = creditFooterRows([channel('codearts')], { codearts: [0] })
    expect(rows[0]?.text).toBe('0')
  })

  it('drops a channel whose every account failed to answer', () => {
    const rows = creditFooterRows([channel('qoder')], { qoder: [undefined, undefined] })
    expect(rows).toEqual([])
  })

  it('drops a channel whose balance only reports percentage windows', () => {
    // Gemini reports quota windows, not a total. `balanceAmount` returns
    // undefined for those, so the channel must be absent rather than summed as
    // zero — the strip never invents a number a vendor did not give.
    const rows = creditFooterRows([channel('gemini')], { gemini: [undefined] })
    expect(rows).toEqual([])
  })

  it('drops a channel with no balance route at all', () => {
    const rows = creditFooterRows(
      [{ id: 'raccoon', credits: {} }, { id: 'cline', credits: undefined as unknown }],
      { raccoon: [10], cline: [20] },
    )
    // `credits: {}` declares a route (Raccoon has one, just no claim/status
    // flags), so raccoon stays. A channel with no `credits` key never claimed
    // to have a balance at all, so its 20 is dropped rather than printed.
    expect(rows.map(row => row.id)).toEqual(['raccoon'])
  })

  it('keeps a channel that declares dollars labelled in dollars', () => {
    const rows = creditFooterRows([{ id: 'cline', credits: { unit: 'dollars' } }], { cline: [0.79] })
    expect(rows).toEqual([{ id: 'cline', text: '0.79', unit: 'dollars' }])
  })

  it('orders rows the way the channel roster does', () => {
    const rows = creditFooterRows(
      [{ id: 'a', credits: { claim: true } }, { id: 'b', credits: { claim: true } }],
      { b: [2], a: [1] },
    )
    expect(rows.map(row => row.id)).toEqual(['a', 'b'])
  })
})

describe('the strip itself', () => {
  it('is not rendered when no channel reported a balance', () => {
    expect(creditFooterRows([], {})).toEqual([])
  })
})
