/**
 * The pool page's footer: "how much credit is left, per channel".
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * The strip is a pure function of two things the page already holds — the
 * channel roster (`PoolWebChannel[]`, which says WHICH vendors publish a
 * balance) and the balances read for them — so it lives here, out of
 * {@link ./ChannelPoolSection}, where the component can call it and a test can
 * call it without a DOM.
 *
 * THE THREE STATES, NEVER COLLAPSED
 *
 *  - no accounts answered → the channel is dropped entirely (an em dash per
 *    channel would be a wall of dashes that reads as "everything is spent");
 *  - an answered zero → `0`, because that is a fact;
 *  - a number → formatted, with the vendor's own unit when it is not credits.
 *
 * One dead account must not blank a channel's total: only accounts that
 * actually answered are summed, which is the same best-effort rule
 * `creditLeftOf` already applies to the two pool lanes.
 *
 * @module dsh-xdpool/client/credit-footer
 */

/** The channel fields the strip reads. Structural, so `PoolWebChannel` fits. */
export interface CreditFooterChannel {
  readonly id: string
  readonly name?: string
  readonly credits?: {
    /** The vendor's own unit: `'dollars'` (Cline) or `'tokens'` (ZCode). */
    readonly unit?: 'dollars' | 'tokens' | undefined
    /** Percentages per quota bucket rather than a total (Gemini). */
    readonly quota?: boolean | undefined
  } | undefined
}

/** One channel's line in the strip. */
export interface CreditFooterRow {
  readonly id: string
  /** The already-formatted balance, e.g. `'1,234'`. Never an em dash. */
  readonly text: string
  /** The vendor's unit, or `undefined` for the default word "credits". */
  readonly unit?: 'dollars' | 'tokens' | 'quota' | undefined
  /** True when the vendor answered with zero — shown muted, not as unknown. */
  readonly zero?: boolean
}

/**
 * Format one balance the way the strip prints it.
 *
 * Rules, each of them a thing that could have looked wrong:
 *  - a non-finite or absent number is `undefined` — the strip omits the row
 *    rather than inventing a zero;
 *  - an integer is grouped with the locale's separators and no decimals;
 *  - a fraction keeps two decimals, because Cline reports dollars and `1`
 *    would overstate `0.79` by a quarter of its value.
 */
export function formatCreditAmount(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  if (Number.isInteger(value)) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  }
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

/**
 * Whether a channel publishes a balance at all.
 *
 * The `credits` key being present is the pack's own signal that
 * `credits.balances` has a branch for this vendor (see `channels.ts`), so an
 * absent key means "never asked" rather than "asked, and got nothing".
 */
function publishesBalance(channel: CreditFooterChannel): boolean {
  return channel.credits !== undefined
}

/**
 * Build the strip's rows.
 *
 * `balances` is keyed by provider id and holds one entry per account, in the
 * pack's order; `undefined` marks an account that did not answer. A channel
 * whose entries are all `undefined` — or that has no entry at all — is left out
 * of the result, so the strip only ever claims what some vendor actually said.
 *
 * The order follows `channels`, not the balances map, because the roster is the
 * order the pool page itself draws and a footer that reorders it would be a
 * second, quieter list.
 */
export function creditFooterRows(
  channels: readonly CreditFooterChannel[],
  balances: Readonly<Record<string, readonly (number | undefined)[]>>,
): readonly CreditFooterRow[] {
  const rows: CreditFooterRow[] = []
  for (const channel of channels) {
    if (!publishesBalance(channel)) continue
    const entries = balances[channel.id]
    if (entries === undefined) continue
    let total = 0
    let answered = 0
    for (const entry of entries) {
      if (entry === undefined || !Number.isFinite(entry)) continue
      total += entry
      answered += 1
    }
    if (answered === 0) continue
    const text = formatCreditAmount(total)
    if (text === undefined) continue
    const unit = channel.credits?.unit
    rows.push({
      id: channel.id,
      text,
      ...unit === undefined ? {} : { unit },
      // A quota channel reports percentage windows; printing them next to a
      // credit total would compare two different things, so the unit is kept
      // explicit rather than folded into "credits".
      ...channel.credits?.quota === true ? { unit: 'quota' as const } : {},
      // A genuine zero is still an answer, so it stays in the strip — muted,
      // so it cannot be mistaken for a channel that never reported anything.
      ...total === 0 ? { zero: true } : {},
    })
  }
  return rows
}
