import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { CONNECTORS } from '@/lib/connectors';
import { SOURCE_META } from '@/lib/connectors';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ConnectorKeys } from '@/components/connector-keys';
import { CostControl } from '@/components/cost-control';
import { claudeAvailable, costControl } from '@/lib/claude';
import { analystModel } from '@/lib/analyst';
import { PageHeader } from '@/components/ui';
import { ExternalLink } from 'lucide-react';

export const metadata = { title: 'Budget' };

// How each paid connector is billed — by the provider, not metered by Radar.
const PAID_NOTE: Record<string, string> = {
  x: 'X API — Basic plan, a flat ~$200/month subscription billed by X.',
  newsapi: 'NewsAPI — free developer tier, paid plans for production. Billed by newsapi.org.',
  instagram: 'Meta Graph API — free to call, but requires a Business account. No per-call fee.',
  facebook: 'Meta Graph API — free to call, tied to your Page/token. No per-call fee.',
  tiktok: 'TikTok Research API — free, approval-gated by TikTok. No per-call fee.',
  linkedin: 'LinkedIn — free, limited to your own organization page.',
};

export default async function BudgetPage() {
  await hydrateConnectorCredentials();
  const [cost, credStatuses, currentUser, dsModel] = await Promise.all([
    costControl(), getConnectorCredStatuses(), getCurrentUser(), analystModel(),
  ]);
  const isAdm = isAdmin(currentUser);
  const budget = cost.budget;
  const budgetPct = Math.min(100, (cost.current.cost / budget) * 100);

  const paidActive = CONNECTORS
    .filter((c) => c.tier === 'premium')
    .filter((c) => credStatuses[c.id]?.fields.some((f) => f.set));

  return (
    <>
      <PageHeader
        title="Budget & costs"
        subtitle="The AI key that powers analysis, its spend cap, and where your paid data-source costs come from."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colonna AI: chiave + spesa/budget */}
        <div className="flex flex-col gap-4">
          {isAdm && credStatuses.anthropic && (
            <section className="panel px-5 py-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">AI engine · Claude</h2>
              <p className="mb-2 text-[11px] text-slate-600">
                Enter your Anthropic API key to power sentiment, briefs, ratings and every AI feature. Stored encrypted; you can also set it as the <span className="text-slate-400">ANTHROPIC_API_KEY</span> environment variable instead.
              </p>
              <ConnectorKeys connectorId="anthropic" fields={credStatuses.anthropic.fields} />
            </section>
          )}

          <section className="panel h-fit px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">AI spend & budget</h2>
            {await claudeAvailable() ? (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">${cost.current.cost.toFixed(2)}</p>
                  <p className="text-sm text-slate-500">of ${budget.toFixed(2)} — since last reset</p>
                </div>
                <div className="mt-2 h-2 rounded bg-white/5">
                  <div
                    className={`h-2 rounded ${budgetPct > 85 ? 'bg-red-400' : budgetPct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {cost.current.calls.toLocaleString('en-US')} calls · {(cost.current.inTok / 1000).toFixed(0)}k input tokens · {(cost.current.outTok / 1000).toFixed(0)}k output.
                  Once the cap is reached, the app stops calling the AI (data collection keeps running).
                </p>
                {cost.byPurpose.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {cost.byPurpose.map((p) => (
                      <div key={p.purpose} className="flex justify-between text-xs">
                        <span className="text-slate-400">{p.purpose.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500">${p.cost.toFixed(3)} · {p.calls} calls</span>
                      </div>
                    ))}
                  </div>
                )}
                {isAdm && (
                  <CostControl
                    budget={cost.budget}
                    lifetimeCost={cost.lifetime.cost}
                    lifetimeCalls={cost.lifetime.calls}
                    resetAt={cost.resetAt}
                    analystModel={dsModel}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-amber-400/90">
                No AI key yet: add one above (or set ANTHROPIC_API_KEY). Data collection works, but sentiment, briefs and ratings stay pending.
              </p>
            )}
          </section>
        </div>

        {/* Colonna costi delle fonti a pagamento */}
        <section className="panel h-fit px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Paid data sources</h2>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
            The budget above meters only the <span className="text-slate-400">AI</span> spend, because Radar makes those calls itself and can count the tokens.
            Paid data sources are different: they are billed <span className="text-slate-400">directly by each provider</span> as a flat subscription or a request quota —
            Radar can’t meter that cost. You control it by entering or removing the key (in the <span className="text-slate-400">Sources</span> tab) and by managing limits on the provider’s own dashboard.
          </p>

          {paidActive.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">Active on your account</p>
              {paidActive.map((c) => (
                <div key={c.id} className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-slate-200">{SOURCE_META[c.id]?.label ?? c.id}</p>
                  <p className="text-[11px] leading-snug text-slate-500">{PAID_NOTE[c.id] ?? 'Billed directly by the provider.'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No paid source is active. All data currently comes from free sources — your only metered cost is the AI budget on the left.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Reference — how each paid source is billed</p>
            {(['x', 'newsapi', 'instagram', 'facebook', 'tiktok', 'linkedin'] as const).map((id) => (
              <p key={id} className="text-[11px] text-slate-500">
                <span className="text-slate-300">{SOURCE_META[id]?.label ?? id}:</span> {PAID_NOTE[id]}
              </p>
            ))}
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-600">
              Manage source keys in the <span className="text-sky-400">Sources</span> tab. <ExternalLink className="size-3" />
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
