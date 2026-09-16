import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anomalies, concentration, delta, formatDelta, formatKpi, meanSd, nss, periodsFor, ratio,
} from '../lib/kpi-standard';
import { extremesDriven, withinNoise } from '../lib/data-reliability';

// Le formule del glossario sono la parte che deve restare giusta: un report
// che scrive "NSS 40" deve poter essere rifatto a mano con la stessa formula.

test('NSS segue la formula di settore', () => {
  assert.equal(nss(60, 20), 50); // (60 − 20) / (60 + 20) × 100
  assert.equal(nss(10, 30), -50);
  assert.equal(nss(0, 5), -100);
});

test('senza positive né negative il NSS non esiste, non vale zero', () => {
  // Zero direbbe "equilibrio", che è un'affermazione: qui non c'è niente.
  assert.equal(nss(0, 0), null);
});

test('un rapporto senza denominatore è n.d., mai zero', () => {
  assert.equal(ratio(10, 0), null);
  assert.equal(ratio(null, 10), null);
  assert.equal(ratio(10, null), null);
  assert.equal(ratio(5, 20, 100), 25);
});

test('Δ% non esiste se il confronto era zero', () => {
  assert.deepEqual(delta(10, 0), { abs: 10, pct: null });
  assert.deepEqual(delta(150, 100), { abs: 50, pct: 50 });
  assert.deepEqual(delta(null, 100), { abs: null, pct: null });
});

test('un periodo piatto non ha anomalie', () => {
  // σ = 0: dividere per zero farebbe sembrare anomalo ogni giorno.
  assert.deepEqual(anomalies([{ value: 5 }, { value: 5 }, { value: 5 }]), []);
});

test('un picco oltre 2σ viene segnalato, il resto no', () => {
  const days = [3, 4, 3, 5, 4, 3, 4, 30].map((value, i) => ({ day: `d${i}`, value }));
  const out = anomalies(days);
  assert.equal(out.length, 1);
  assert.equal(out[0].day, 'd7');
});

test('la concentrazione conta solo i primi dieci autori', () => {
  assert.equal(concentration([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 50], 200), 50);
  assert.equal(concentration([], 0), null);
});

test('media e deviazione standard', () => {
  const { mean, sd } = meanSd([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(mean, 5);
  assert.equal(sd, 2);
});

test('il periodo di confronto ha la stessa durata e finisce dove comincia il corrente', () => {
  const now = new Date('2026-09-16T12:00:00Z');
  const { current, previous } = periodsFor(30, now);
  assert.equal(current.to.getTime(), now.getTime());
  assert.equal(previous.to.getTime(), current.from.getTime());
  assert.equal(current.to.getTime() - current.from.getTime(), previous.to.getTime() - previous.from.getTime());
});

test('numeri all\'italiana, n.d. dove manca il dato', () => {
  assert.equal(formatKpi(1234.5, 'pct', 'it'), '1.234,5%');
  assert.equal(formatKpi(1234567, 'count', 'it'), '1.234.567');
  assert.equal(formatKpi(null, 'count', 'it'), 'n.d.');
  assert.equal(formatKpi(null, 'count', 'en'), 'n/a');
});

test('le percentuali si confrontano in punti', () => {
  // "da 20% a 25%" è +5 punti, non +25%.
  assert.equal(formatDelta({ delta: 5, unit: 'pct' }, 'it'), '+5,0 pt');
  assert.equal(formatDelta({ delta: -120, unit: 'count' }, 'it'), '−120');
  assert.equal(formatDelta({ delta: null, unit: 'count' }, 'it'), '—');
});

// --- Affidabilità (L1) ---------------------------------------------------------

test('una variazione dentro l\'oscillazione abituale non è un cambiamento', () => {
  // Periodi che salgono e scendono di ~20: +15 è rumore.
  const history = [100, 120, 100, 118, 102, 121];
  assert.equal(withinNoise(15, history).noise, true);
  // +80 invece no.
  assert.equal(withinNoise(80, history).noise, false);
});

test('con meno di quattro periodi non si giudica', () => {
  // Tre numeri non fanno una distribuzione: meglio dire "non so".
  assert.equal(withinNoise(50, [100, 110, 105]).noise, null);
});

test('una variazione che cambia verso senza i post estremi è guidata da loro', () => {
  // Con i top 3: da 1.000 a 1.500 (+50%). Senza: da 900 a 700 (−22%).
  const r = extremesDriven({ cur: 1500, prev: 1000 }, { cur: 700, prev: 900 });
  assert.equal(r.driven, true);
});

test('una variazione che regge anche senza i post estremi non è segnalata', () => {
  const r = extremesDriven({ cur: 1500, prev: 1000 }, { cur: 1350, prev: 900 });
  assert.equal(r.driven, false);
});

test('una variazione che si dimezza senza i post estremi è guidata da loro', () => {
  // +50% con loro, +10% senza: la crescita è quasi tutta di tre post.
  assert.equal(extremesDriven({ cur: 1500, prev: 1000 }, { cur: 990, prev: 900 }).driven, true);
});

test('variazioni enormi nello stesso verso non sono "guidate dagli estremi"', () => {
  // Visto su dati veri: +6.439% con i top 3, +9.978% senza. La differenza in
  // punti è enorme, la storia è la stessa.
  assert.equal(extremesDriven({ cur: 4717, prev: 72 }, { cur: 4000, prev: 40 }).driven, false);
});
