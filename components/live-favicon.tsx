'use client';

import { useEffect } from 'react';

/**
 * The browser tab IS a radar. The favicon is drawn on a canvas ~12 times a
 * second: a real rotating sweep on a dark dial, a blip that pings with the
 * project's 24h pulse, and a ring colored by live sentiment — green when the
 * conversation is positive, amber when neutral, red when it turns negative
 * (or when alerts are firing). Glance at your tabs and you already know.
 */
export function LiveFavicon({ sentiment, mentions24h, alerts }: {
  sentiment: number | null;
  mentions24h: number;
  alerts: number;
}) {
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mood = alerts > 0 || (sentiment !== null && sentiment < -0.15)
      ? '#f87171' : sentiment !== null && sentiment > 0.15 ? '#34d399' : '#fbbf24';

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    // Il blip pinga più spesso quando le ultime 24h sono più dense.
    const pingEvery = mentions24h > 200 ? 1600 : mentions24h > 50 ? 2600 : 4200;
    let angle = -Math.PI / 2;
    let lastPing = 0;

    const draw = (now: number) => {
      ctx.clearRect(0, 0, 64, 64);
      // Quadrante
      ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1120'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = mood; ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 32, 17, 0, Math.PI * 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(148,163,184,.35)'; ctx.stroke();
      // Sweep
      const grad = ctx.createConicGradient ? ctx.createConicGradient(angle, 32, 32) : null;
      if (grad) {
        grad.addColorStop(0, 'rgba(56,189,248,.85)');
        grad.addColorStop(0.16, 'rgba(56,189,248,0)');
        grad.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.beginPath(); ctx.moveTo(32, 32); ctx.arc(32, 32, 27, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(32, 32);
      ctx.lineTo(32 + 27 * Math.cos(angle), 32 + 27 * Math.sin(angle));
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#7dd3fc'; ctx.stroke();
      // Blip: eco che si espande dopo ogni ping
      const sincePing = now - lastPing;
      if (sincePing < 1200) {
        const t = sincePing / 1200;
        ctx.beginPath(); ctx.arc(45, 22, 3 + t * 12, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = mood;
        ctx.globalAlpha = 1 - t; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(45, 22, 3, 0, Math.PI * 2);
        ctx.fillStyle = mood; ctx.fill();
      }
      // Centro
      ctx.beginPath(); ctx.arc(32, 32, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#7dd3fc'; ctx.fill();
      link!.href = canvas.toDataURL('image/png');
    };

    if (reduce) {
      draw(600); // un fotogramma statico, senza animazione
      return;
    }

    const id = setInterval(() => {
      const now = performance.now();
      angle += 0.22;
      if (now - lastPing > pingEvery) lastPing = now;
      draw(now);
    }, 90);
    return () => clearInterval(id);
  }, [sentiment, mentions24h, alerts]);

  return null;
}
