import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapOf, newsTerms, phaseLabel, phaseRank, toTrialRow } from '../lib/trials';

test('la fase più avanzata vince', () => {
  assert.equal(phaseRank(['PHASE2', 'PHASE3']), 3);
  assert.equal(phaseRank(['EARLY_PHASE1']), 0.5);
  assert.equal(phaseRank(['NA']), 0);
  assert.equal(phaseRank([]), 0);
});

test('le fasi si leggono in italiano', () => {
  assert.equal(phaseLabel(['PHASE2', 'PHASE3']), 'fase 2 / fase 3');
  assert.equal(phaseLabel(['NA']), 'senza fase');
  assert.equal(phaseLabel(['EARLY_PHASE1']), 'fase 1 precoce');
});

test('un trattamento generico non identifica uno studio nelle notizie', () => {
  const t = newsTerms({ nctId: 'NCT07639021', interventions: [
    { name: 'NNC0662-0419' }, { name: 'Semaglutide' }, { name: 'Placebo' }, { name: 'Matching placebo' },
    { name: 'Diet' }, { name: 'Tirzepatide (LY3298176)' }, { name: 'IV' },
  ] });
  assert.deepEqual(t, ['NCT07639021', 'NNC0662-0419', 'Semaglutide', 'Tirzepatide']);
});

test('rumore contro evidenza', () => {
  // Se ne parla molto, studi precoci senza risultati: le notizie corrono.
  assert.equal(gapOf(40, 2, false), 'hype');
  // Fase 3, quasi nessuno ne parla: evidenza non raccontata.
  assert.equal(gapOf(1, 3, false), 'untold');
  assert.equal(gapOf(0, 1, true), 'untold');
  assert.equal(gapOf(0, 1, false), 'quiet');
  assert.equal(gapOf(40, 3, true), 'aligned');
  assert.equal(gapOf(4, 2, false), 'aligned');
});

test('uno studio senza identificativo o titolo si scarta', () => {
  assert.equal(toTrialRow({}, 'x'), null);
  const r = toTrialRow({
    hasResults: true,
    protocolSection: {
      identificationModule: { nctId: 'NCT1', briefTitle: 'Studio' },
      statusModule: { overallStatus: 'RECRUITING', primaryCompletionDateStruct: { date: '2027-06' } },
      designModule: { phases: ['PHASE3'], enrollmentInfo: { count: 300 } },
      contactsLocationsModule: { locations: [{ country: 'Italy' }, { country: 'Italy' }, { country: 'Spain' }] },
    },
  }, 'obesity');
  assert.ok(r);
  assert.equal(r.hasResults, 1);
  assert.deepEqual(r.countries, ['Italy', 'Spain']);
  assert.equal(r.completionDate, '2027-06');
});

test('le procedure generiche non sono un nome da cercare nelle notizie', () => {
  const t = newsTerms({ nctId: 'NCT9', interventions: [
    { type: 'PROCEDURE', name: 'Computed Tomography' },
    { type: 'OTHER', name: 'Biospecimen Collection' },
    { type: 'DRUG', name: 'Active Control' },
    { type: 'DEVICE', name: 'MatchMiner-AI Artificial Intelligence Tool' },
    { type: 'BEHAVIORAL', name: 'Mindfulness Programme' },
    { type: 'BIOLOGICAL', name: 'Pembrolizumab' },
  ] });
  assert.deepEqual(t, ['NCT9', 'MatchMiner-AI Artificial Intelligence Tool', 'Pembrolizumab']);
});
