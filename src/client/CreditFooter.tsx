/**
 * The pool page's footer strip: remaining credit, one chip per channel.
 *
 * Placed under everything else on the account-pool page, because it answers a
 * question about the WHOLE page ("how much is left") rather than about one
 * card, and because a per-card number already exists on each channel card — the
 * footer is the single line a user can read without opening anything.
 *
 * WHAT IT DOES NOT DO
 *
 * It never invents a number. A channel is omitted unless at least one of its
 * accounts answered `credits.balances`; a vendor that reports percentage
 * windows rather than a total (Gemini) is labelled "quota" instead of being
 * added into a credit sum that would mean nothing.
 *
 * WHY IT FLOATS
 *
 * The strip is `position: sticky` at the bottom of the scroll container. The
 * pool page is long (two lanes, thirteen channel cards), and a footer that
 * scrolled away would never be seen — but it must not cover the "Reload" button
 * either, so it is sticky inside the flow rather than fixed to the viewport.
 *
 * @module dsh-xdpool/client/CreditFooter
 */
import type { ReactElement } from 'react'
import { creditFooterRows } from './credit-footer.ts'
import type { CreditFooterChannel } from './credit-footer.ts'
import type { XdPoolSettingsKey } from './locales.ts'

/** Translator the settings section injects; every word here goes through it. */
type Translate = (key: XdPoolSettingsKey, params?: Record<string, unknown>) => string

/** Props for {@link CreditFooter}. */
export interface CreditFooterProps {
  /** The channel roster the page already holds, in draw order. */
  readonly channels: readonly CreditFooterChannel[]
  /** provider id → one balance per account; `undefined` marks "did not answer". */
  readonly balances: Readonly<Record<string, readonly (number | undefined)[]>>
  readonly t?: Translate | undefined
  /** True while the first balance read is in flight, so the strip can say so. */
  readonly pending?: boolean | undefined
}

/** The vendor's own word for its unit. */
function unitLabel(unit: 'dollars' | 'tokens' | 'quota' | undefined, t: Translate | undefined): string {
  if (unit === 'dollars') return t?.('channelpool.creditsDollar') ?? 'USD'
  if (unit === 'tokens') return t?.('channelpool.creditsToken') ?? 'tokens'
  if (unit === 'quota') return t?.('channelpool.creditsQuota') ?? 'quota'
  return t?.('channelpool.creditsUnit') ?? 'credits'
}

/**
 * One line: "剩余积分 · CodeArts 1,234 · Qoder 780 · Cline 0.79 USD …".
 *
 * Returns `null` when no channel reported anything, so the page ends the way it
 * did before this strip existed rather than trailing an empty bar.
 */
export function CreditFooter({ channels, balances, t, pending }: CreditFooterProps): ReactElement | null {
  const rows = creditFooterRows(channels, balances)
  // Nothing to say and nothing still being read: the page should end the way it
  // did before this strip existed, not trail an empty "…" bar forever.
  if (rows.length === 0 && pending !== true) return null
  return (
    <div className="dsm-xdpool-credit-footer" role="status" aria-live="polite">
      <span className="dsm-xdpool-credit-footer-label">
        {t?.('channelpool.footerTitle') ?? 'Remaining credit'}
      </span>
      {rows.length === 0
        ? <span className="dsm-xdpool-credit-footer-pending">
            {t?.('channelpool.balanceLoading') ?? '…'}
          </span>
        : rows.map(row => (
          <span
            key={row.id}
            className="dsm-xdpool-credit-footer-chip"
            data-channel={row.id}
            data-zero={row.zero === true ? 'true' : undefined}
          >
            <span className="dsm-xdpool-credit-footer-name">
              {row.id}
            </span>
            <b className="dsm-xdpool-credit-footer-amount">{row.text}</b>
            <span className="dsm-xdpool-credit-footer-unit">{unitLabel(row.unit, t)}</span>
          </span>
        ))}
    </div>
  )
}
