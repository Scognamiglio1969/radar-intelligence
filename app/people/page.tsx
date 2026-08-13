import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { detectPeople, personCard, peopleRanking, personSeries } from '@/lib/people-insights';
import { PersonCards, PeopleLeaderboard } from '@/components/people-charts';
import { SectionTabs } from '@/components/section-tabs';

export const metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Personal branding.
//
// Quando i dati seguono delle PERSONE invece che dei canali, le domande
// cambiano: non "quanto pesa Instagram sul mix", ma se quella persona sta
// crescendo, se pubblica abbastanza, che formato le rende, chi la segue.
// Questa pagina compare da sola quando nel progetto ci sono persone, e resta
// invisibile quando non ce ne sono.
// ---------------------------------------------------------------------------

export default async function PeoplePage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="Available to admins." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Select a project first." />;

  const names = await detectPeople(project.id);
  if (!names.length) {
    return (
      <>
        <SectionTabs group="data" />
        <PageHeader title="People"
          subtitle="Personal branding: how each person is growing, publishing and being followed." />
        <EmptyState message="Nessuna persona rilevata in questo progetto. Compare da sola quando importi fogli che seguono manager o portavoce — Radar li riconosce dalla forma del file." />
      </>
    );
  }

  const cards = await Promise.all(names.map((n) => personCard(project.id, n)));
  const ranking = await peopleRanking(project.id, names, cards);
  // Chi non ha nessun dato utile non merita una scheda vuota.
  const useful = cards.filter((c) => c.followers || c.rhythm || c.averages.length || c.audience.length);
  // Le serie nel tempo, una per persona: alimentano il confronto e il focus.
  // Chi ha meno di due rilevazioni non fa una curva e resta fuori dal grafico.
  const series = (await Promise.all(useful.map(async (c) => ({
    name: c.name, ...(await personSeries(project.id, c.name)),
  })))).filter((s) => s.followers.length >= 2)
    .sort((a, b) => (b.followers.at(-1)?.value ?? 0) - (a.followers.at(-1)?.value ?? 0));

  return (
    <>
      <SectionTabs group="data" />
      <PageHeader
        title="People"
        subtitle="Personal branding: how each person is growing, publishing and being followed."
        info="People are recognised from the SHAPE of the imported sheets — a sheet per person, a column per person, or an entity column of names — not from a list you have to maintain. The same person written three ways (Acquaviva, RICCARDO ACQUAVIVA, ACQUAVIVA) is one card, merged on the surname. Averages are averaged and cumulative totals take their latest value: summing an engagement rate across months would produce a plausible, meaningless number."
      />

      <div className="mb-4">
        <PeopleLeaderboard rows={ranking} />
      </div>

      <PersonCards cards={useful} series={series} />
    </>
  );
}
