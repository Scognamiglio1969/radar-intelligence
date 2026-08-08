import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ARCHETYPE_LABEL } from '@/lib/sheet-archetype';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import {
  availableDims, breakdownByDim, customFields, defaultAgg, metricCatalog, metricMix,
  performanceByCustom, projectArchetypes, rankEntities, seriesByMetric,
} from '@/lib/metrics-data';
import { CustomPerformance, MixChart, RankChart, TrendChart } from '@/components/metric-charts';

export const metadata = { title: 'Measures' };
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Le misure importate dai fogli di calcolo.
//
// Le viste non sono decise in anticipo: si guarda che cosa il progetto contiene
// davvero e si costruisce di conseguenza. Un file di canali social produce
// crescita follower e mix di pubblicazione; un file di manager produce una
// classifica per engagement e la composizione dell'audience. Lo stesso codice,
// perché il modello sottostante è lo stesso.
// ---------------------------------------------------------------------------

/** Le metriche che parlano di una stessa cosa, raccolte per famiglia. */
const FAMILIES: { test: RegExp; title: string; hint: string }[] = [
  {
    test: /(follower|fan|iscritti|subscriber|audience)/i,
    title: 'Crescita del pubblico',
    hint: 'Quanti seguono ciascun canale, mese per mese. Le variazioni contano più dei livelli.',
  },
  {
    test: /(impression|copertura|reach|visualizzazioni|views)/i,
    title: 'Copertura',
    hint: 'Quante volte i contenuti sono stati mostrati.',
  },
  {
    test: /(interazion|engagement|reaction|mi piace|like|commenti|condivisioni|shares)/i,
    title: 'Interazioni',
    hint: 'Quanto il pubblico ha risposto, non quanto è stato raggiunto.',
  },
];

export default async function MeasuresPage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="Measures are available to admins." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Select a project first." />;

  const catalog = await metricCatalog(project.id);
  if (!catalog.length) {
    return (
      <>
        <PageHeader
          title="Measures"
          subtitle="Series imported from spreadsheets: followers, publications, averages — everything that isn't a post."
        />
        <EmptyState message="Nessuna misura in questo progetto. Importa un foglio di aggregati dalla sezione Import: Radar riconosce da solo i fogli fatti di numeri invece che di contenuti." />
      </>
    );
  }

  const names = catalog.map((c) => c.metric);
  const pick = (re: RegExp) => names.filter((n) => re.test(n));

  // Il mix di pubblicazione conta CONTENUTI PUBBLICATI, e nient'altro.
  //
  // Due esclusioni che non sono dettagli: le misure di pubblico (follower,
  // reach, impression) sono uno STOCK, non un flusso — sommarle ai contenuti
  // dà un totale che non significa niente, e schiaccia le voci vere sotto lo
  // 0,1%. E un "Pubblicazioni" complessivo, se accanto ci sono i singoli
  // canali, è il totale delle righe che gli stanno sotto: contarlo di nuovo
  // raddoppierebbe.
  const NOT_PUBLISHING = /(follower|fan|iscritti|subscriber|reach|impression|copertur|visualizzaz|views|interazion|engagement|eng\.|like|mi piace|commenti|condivisioni|risposte|clic|rate|medi[oa]|avg)/i;
  const CHANNEL = /^(lk|fb|ig feed|ig story|ig stories|x|twitter|youtube|yt|tiktok|tt|linkedin|instagram|facebook)$/i;
  const channels = catalog.filter((c) => !NOT_PUBLISHING.test(c.metric) && CHANNEL.test(c.metric.trim()));
  const publishing = (channels.length >= 2 ? channels : catalog.filter((c) =>
    !NOT_PUBLISHING.test(c.metric) && /(pubblicazioni|post pubblicati|updates|contenuti|video pubblicati)/i.test(c.metric)))
    .map((c) => c.metric);

  // La classifica: si sceglie la metrica di engagement più ricca fra le entità.
  const rankable = catalog
    .filter((c) => c.entities >= 2 && /(engagement|eng\.|interazion|rate)/i.test(c.metric))
    .sort((a, b) => b.entities - a.entities)[0];
  const ranking = rankable ? await rankEntities(project.id, rankable.metric) : [];

  const dims = await availableDims(project.id);
  const fields = await customFields(project.id);

  const families = await Promise.all(FAMILIES.map(async (f) => {
    const metrics = pick(f.test).slice(0, 10);
    return { ...f, series: metrics.length ? await seriesByMetric(project.id, metrics) : [] };
  }));

  const mix = publishing.length ? await metricMix(project.id, publishing) : [];
  const breakdowns = await Promise.all(dims.slice(0, 3).map(async (d) => ({
    dim: d, rows: await breakdownByDim(project.id, d),
  })));
  const perf = await Promise.all(fields.slice(0, 4).map(async (f) => ({
    field: f, rows: await performanceByCustom(project.id, f),
  })));

  const archetypes = await projectArchetypes(project.id);
  const hasPeople = archetypes.some((a) => a.people);

  const totalPoints = catalog.reduce((s, c) => s + c.points, 0);

  return (
    <>
      <PageHeader
        title="Measures"
        subtitle="Series imported from spreadsheets: followers, publications, averages — everything that isn't a post."
        info="A metric point is chi · che cosa · quando · quanto · come. Any sheet of aggregates reduces to that shape, wide or long, which is why files with completely different layouts end up comparable here. Rankings never blindly sum: rates and averages are averaged, cumulative totals take the latest value — summing an engagement rate month by month produces a plausible, meaningless number."
      />

      {/* Che cosa contiene questo progetto: i tipi di foglio riconosciuti sono
          ciò che decide quali domande ha senso porgli, e vanno dichiarati. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        <span>
          {catalog.length} misure · {totalPoints.toLocaleString('it-IT')} punti ·
          {' '}dal {catalog.reduce((m, c) => (c.from < m ? c.from : m), catalog[0].from)}
          {' '}al {catalog.reduce((m, c) => (c.to > m ? c.to : m), catalog[0].to)}
        </span>
        {archetypes.map((a) => (
          <span key={a.archetype}
            className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
            {ARCHETYPE_LABEL[a.archetype as keyof typeof ARCHETYPE_LABEL] ?? a.archetype} × {a.sheets}
          </span>
        ))}
        {hasPeople && (
          <Link href="/people"
            className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/20">
            Questo progetto segue delle persone → vedi le schede
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {families.filter((f) => f.series.length > 0).map((f) => (
          <TrendChart key={f.title} series={f.series} title={f.title} hint={f.hint} />
        ))}

        {mix.length > 1 && (
          <MixChart rows={mix} title="Mix di pubblicazione"
            hint="Quanto pesa ciascun canale sul totale dei contenuti pubblicati." />
        )}

        {ranking.length > 1 && rankable && (
          <RankChart rows={ranking} title={`Classifica per ${rankable.metric}`}
            hint={defaultAgg(rankable.metric) === 'avg'
              ? 'Media del periodo: un tasso non si somma.'
              : defaultAgg(rankable.metric) === 'last'
                ? "Ultimo valore rilevato: un totale cumulato non si somma."
                : 'Totale del periodo.'} />
        )}

        {breakdowns.filter((b) => b.rows.length > 1).map((b) => (
          <MixChart key={b.dim} rows={b.rows} title={`Audience per ${b.dim}`}
            hint="Composizione media del pubblico sul periodo." />
        ))}

        {perf.filter((p) => p.rows.length > 0).map((p) => (
          <CustomPerformance key={p.field} rows={p.rows} field={`Performance per ${p.field}`} />
        ))}
      </div>
    </>
  );
}
