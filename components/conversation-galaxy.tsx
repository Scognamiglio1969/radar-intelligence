'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Star = { si: number; s: number; e: number; age: number };
type Source = { id: string; label: string; color: string; count: number };
type Topic = { topic: string; n: number };
type Trend = { topic: string; score: number };
type Props = {
  title: string; core: number; grade: string; total: number; avgSentiment: number;
  sources: Source[]; stars: Star[]; topics: Topic[]; trends: Trend[];
};

function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const bucketOf = (s: number): 'positive' | 'neutral' | 'negative' =>
  s > 0.15 ? 'positive' : s < -0.15 ? 'negative' : 'neutral';

// Texture fotografiche reali (Solar System Scope, CC BY 4.0) in /public/planets.
const PLANET_TEX = [
  '2k_jupiter', '2k_earth_daymap', '2k_mars', '2k_neptune',
  '2k_venus_atmosphere', '2k_saturn', '2k_mercury', '2k_uranus',
];
const MOON_TINT: Record<string, number> = {
  positive: 0x7fe0b0, neutral: 0x9fb6dd, negative: 0xe08878,
};

export function ConversationGalaxy({ title, core, grade, total, avgSentiment, sources, stars, topics, trends }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selSrc, setSelSrc] = useState<Set<number>>(new Set());
  const [selSent, setSelSent] = useState<Set<string>>(new Set());
  const [showTopics, setShowTopics] = useState(true);
  const [showTrends, setShowTrends] = useState(true);
  const selSrcRef = useRef(selSrc); selSrcRef.current = selSrc;
  const selSentRef = useRef(selSent); selSentRef.current = selSent;
  const showTopicsRef = useRef(showTopics); showTopicsRef.current = showTopics;
  const showTrendsRef = useRef(showTrends); showTrendsRef.current = showTrends;
  const [hatch, setHatch] = useState(false);
  const hatchRef = useRef(() => {}); hatchRef.current = () => setHatch(true);
  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, k: T) =>
    set((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Split sentiment per fonte → 3 lune in scala 1..10 ──
    const split = sources.map((_, i) => {
      let pos = 0, neu = 0, neg = 0;
      for (const st of stars) {
        if (st.si !== i) continue;
        const b = bucketOf(st.s);
        if (b === 'positive') pos++; else if (b === 'negative') neg++; else neu++;
      }
      const tot = Math.max(1, pos + neu + neg);
      const ten = (v: number) => v === 0 ? 0 : Math.max(1, Math.round((v / tot) * 10));
      return [['positive', ten(pos)], ['neutral', ten(neu)], ['negative', ten(neg)]] as ['positive' | 'neutral' | 'negative', number][];
    });
    const maxCount = Math.max(1, ...sources.map((s) => s.count));

    // ── Renderer / scena / camera ──
    const W = mount.clientWidth, H = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 6000);
    camera.position.set(0, 130, 380);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 55; controls.maxDistance = 1200;
    controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.35;

    const loader = new THREE.TextureLoader();
    const tex = (name: string) => {
      const t = loader.load(`/planets/${name}.jpg`);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const disposables: { dispose(): void }[] = [];

    // ── Cielo: sfera Via Lattea + campo stelle prospettico ──
    const skyGeo = new THREE.SphereGeometry(2500, 48, 32);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex('2k_stars_milky_way'), side: THREE.BackSide });
    skyMat.color.setScalar(0.55); // attenuata perché i corpi risaltino
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky); disposables.push(skyGeo, skyMat);

    const starN = 1600;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const r = 350 + rand(i * 1.7) * 1600;
      const th = rand(i * 3.1) * Math.PI * 2;
      const ph = Math.acos(2 * rand(i * 5.9) - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph);
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xdde6ff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    scene.add(new THREE.Points(starGeo, starMat));
    disposables.push(starGeo, starMat);

    // ── Luci: il sole domina; una fill light segue la camera così il lato
    // rivolto all'osservatore non è mai completamente nero ──
    scene.add(new THREE.AmbientLight(0x2a3140, 0.7));
    const sunLight = new THREE.PointLight(0xfff1d6, 3.2, 0, 0);
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0xcfd8ee, 0.85);
    scene.add(fillLight);

    // ── Sole: texture reale + glow additivo ──
    const sunR = 24;
    const sunGeo = new THREE.SphereGeometry(sunR, 48, 32);
    const sunMat = new THREE.MeshBasicMaterial({ map: tex('2k_sun') });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun); disposables.push(sunGeo, sunMat);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d')!;
    const gg = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gg.addColorStop(0, 'rgba(255,238,200,0.85)');
    gg.addColorStop(0.25, 'rgba(255,190,110,0.30)');
    gg.addColorStop(0.6, 'rgba(255,150,80,0.08)');
    gg.addColorStop(1, 'rgba(255,140,70,0)');
    gctx.fillStyle = gg; gctx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(sunR * 9);
    scene.add(glow); disposables.push(glowTex, glowMat);

    // ── Etichette sprite ──
    // Nome fonte: testo grande su pillola scura semi-trasparente (leggibile ovunque).
    const makeLabel = (text: string, w = 34, border = 'rgba(148,163,184,0.35)', fg = 'rgba(238,243,252,0.98)') => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 160;
      const cctx = c.getContext('2d')!;
      cctx.font = '700 64px system-ui, sans-serif';
      const tw = Math.min(600, cctx.measureText(text).width + 64);
      const x0 = (640 - tw) / 2;
      cctx.fillStyle = 'rgba(4,7,14,0.72)';
      cctx.beginPath();
      cctx.roundRect(x0, 28, tw, 104, 52);
      cctx.fill();
      cctx.strokeStyle = border; cctx.lineWidth = 3; cctx.stroke();
      cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
      cctx.fillStyle = fg;
      cctx.fillText(text, 320, 82);
      const t = new THREE.CanvasTexture(c);
      const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.scale.set(w, w / 4, 1);
      disposables.push(t, m);
      return s;
    };
    // Numero del valore di sentiment (1..10) accanto alla luna.
    const makeNumber = (n: number, color: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const cctx = c.getContext('2d')!;
      cctx.font = '800 84px system-ui, sans-serif';
      cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
      cctx.shadowColor = 'rgba(0,0,0,0.95)'; cctx.shadowBlur = 14;
      cctx.fillStyle = color;
      cctx.fillText(String(n), 64, 68);
      const t = new THREE.CanvasTexture(c);
      const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.scale.set(6, 6, 1);
      disposables.push(t, m);
      return s;
    };
    const MOON_NUM_COLOR: Record<string, string> = {
      positive: '#8df0c2', neutral: '#b8cdf0', negative: '#ff9d8a',
    };

    // ── Sistemi planetari: pianeta texture reale + 3 lune roccia tinta ──
    const N = Math.max(1, sources.length);
    const moonGeoBase = new THREE.SphereGeometry(1, 24, 16);
    const moonTexture = tex('2k_moon');
    disposables.push(moonGeoBase);

    type System = {
      group: THREE.Group; planet: THREE.Mesh; dist: number; theta: number; spd: number;
      moons: { mesh: THREE.Mesh; num: THREE.Sprite; mr: number; bucket: string; orbR: number; phase: number; spd: number; incl: number }[];
      idx: number;
    };
    const planetMeshes: THREE.Mesh[] = []; // per il raycast (easter egg sulla Terra)
    const systems: System[] = sources.map((src, i) => {
      const group = new THREE.Group();
      const r = 7.5 + Math.sqrt(src.count / maxCount) * 9;
      const texName = PLANET_TEX[i % PLANET_TEX.length];
      const pGeo = new THREE.SphereGeometry(r, 48, 32);
      const pMat = new THREE.MeshStandardMaterial({ map: tex(texName), roughness: 0.9, metalness: 0 });
      const planet = new THREE.Mesh(pGeo, pMat);
      planet.rotation.z = (rand(i * 8.8) - 0.5) * 0.5; // leggera inclinazione assiale
      planet.userData.isEarth = texName === '2k_earth_daymap';
      planetMeshes.push(planet);
      group.add(planet);
      disposables.push(pGeo, pMat);

      const label = makeLabel(src.label);
      label.position.set(0, -(r + 10), 0);
      group.add(label);

      const moons = split[i]
        .filter(([, ten]) => ten > 0)
        .map(([bucket, ten], k) => {
          const mMat = new THREE.MeshStandardMaterial({ map: moonTexture, roughness: 1, metalness: 0, color: MOON_TINT[bucket] });
          const mesh = new THREE.Mesh(moonGeoBase, mMat);
          const mr = 0.9 + ten * 0.34; // scala 1..10 → raggio, sempre << pianeta
          mesh.scale.setScalar(mr);
          group.add(mesh);
          const num = makeNumber(ten, MOON_NUM_COLOR[bucket]);
          group.add(num);
          disposables.push(mMat);
          return {
            mesh, num, mr, bucket,
            orbR: r + 5 + k * 4.2,
            phase: rand(i * 31 + k * 7) * Math.PI * 2,
            spd: (0.32 - k * 0.07) * (reduce ? 0 : 1),
            incl: (rand(i * 17 + k * 3) - 0.5) * 0.7,
          };
        });

      scene.add(group);
      return {
        group, planet, moons, idx: i,
        dist: 68 + (N === 1 ? 40 : (i / (N - 1)) * 165),
        theta: rand(i * 13.7) * Math.PI * 2,
        spd: (0.028 * (1 + (N - i) * 0.18)) * (reduce ? 0 : 1),
      };
    });

    // ── Orbite: anelli appena percettibili ──
    for (const sys of systems) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 128; k++) {
        const a = (k / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * sys.dist, 0, Math.sin(a) * sys.dist));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineBasicMaterial({ color: 0xaabbdd, transparent: true, opacity: 0.07 });
      scene.add(new THREE.Line(g, m));
      disposables.push(g, m);
    }

    // ── Cintura dei TEMI (contenuto): asteroidi esterni, uno per topic ──
    // Ring esterno oltre l'ultimo pianeta: i temi che circondano la conversazione.
    const topicGroup = new THREE.Group();
    const topicBeltR = 262;
    const maxTopicN = Math.max(1, ...topics.map((t) => t.n));
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    disposables.push(rockGeo);
    topics.forEach((tp, i) => {
      const ang = (i / Math.max(1, topics.length)) * Math.PI * 2;
      const rr = 2 + Math.sqrt(tp.n / maxTopicN) * 4.5;
      const mMat = new THREE.MeshStandardMaterial({ color: 0x9fb6dd, roughness: 0.75, metalness: 0.1 });
      const mesh = new THREE.Mesh(rockGeo, mMat);
      mesh.scale.setScalar(rr);
      const y = (rand(i * 4.4) - 0.5) * 16;
      mesh.position.set(Math.cos(ang) * topicBeltR, y, Math.sin(ang) * topicBeltR);
      topicGroup.add(mesh); disposables.push(mMat);
      const lab = makeLabel(tp.topic, 26, 'rgba(159,182,221,0.45)', 'rgba(219,229,247,0.98)');
      lab.position.set(mesh.position.x, y + rr + 6, mesh.position.z);
      topicGroup.add(lab);
    });
    scene.add(topicGroup);

    // ── TREND (temi emergenti): comete dorate pulsanti su un anello inclinato ──
    const trendGroup = new THREE.Group();
    trendGroup.rotation.x = 0.34;
    const trendR = 298;
    const trendMeshes: { mesh: THREE.Mesh; base: number; phase: number }[] = [];
    const maxScore = Math.max(1, ...trends.map((t) => t.score));
    trends.forEach((tr, i) => {
      const ang = (i / Math.max(1, trends.length)) * Math.PI * 2 + 0.4;
      const rr = 3 + Math.sqrt(tr.score / maxScore) * 4;
      const mMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.2 });
      const mesh = new THREE.Mesh(rockGeo, mMat);
      mesh.scale.setScalar(rr);
      mesh.position.set(Math.cos(ang) * trendR, 0, Math.sin(ang) * trendR);
      trendGroup.add(mesh); disposables.push(mMat);
      // aura additiva (coda cometa stilizzata)
      const auraMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf6a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
      const aura = new THREE.Sprite(auraMat);
      aura.scale.setScalar(rr * 7);
      aura.position.copy(mesh.position);
      trendGroup.add(aura); disposables.push(auraMat);
      const lab = makeLabel(`${tr.topic}  ×${tr.score.toFixed(0)}`, 30, 'rgba(251,191,36,0.55)', 'rgba(255,236,190,0.99)');
      lab.position.set(mesh.position.x, rr + 8, mesh.position.z);
      trendGroup.add(lab);
      trendMeshes.push({ mesh, base: rr, phase: rand(i * 9.1) * Math.PI * 2 });
    });
    scene.add(trendGroup);

    // ── Easter egg: click sulla Terra ──
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downPt: { x: number; y: number } | null = null;
    const onCanvasDown = (e: PointerEvent) => { downPt = { x: e.clientX, y: e.clientY }; };
    const onCanvasUp = (e: PointerEvent) => {
      if (!downPt) return;
      const moved = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
      downPt = null;
      if (moved > 6) return; // era un drag, non un click
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(planetMeshes, false)[0];
      if (hit && (hit.object as THREE.Mesh).userData.isEarth) hatchRef.current();
    };
    renderer.domElement.addEventListener('pointerdown', onCanvasDown);
    renderer.domElement.addEventListener('pointerup', onCanvasUp);

    // ── Loop ──
    const clockT = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      const t = clockT.getElapsedTime();
      const selS = selSrcRef.current, selX = selSentRef.current;

      sun.rotation.y = t * 0.02;
      for (const sys of systems) {
        const ang = sys.theta + t * sys.spd;
        sys.group.position.set(Math.cos(ang) * sys.dist, 0, Math.sin(ang) * sys.dist);
        sys.planet.rotation.y = t * 0.12 + sys.idx;
        sys.group.visible = selS.size === 0 || selS.has(sys.idx);
        for (const m of sys.moons) {
          const la = m.phase + t * m.spd;
          const mx = Math.cos(la) * m.orbR;
          const my = Math.sin(la) * m.orbR * Math.sin(m.incl);
          const mz = Math.sin(la) * m.orbR * Math.cos(m.incl);
          m.mesh.position.set(mx, my, mz);
          m.mesh.rotation.y = t * 0.3;
          // il numero segue la luna, appena sopra di essa
          m.num.position.set(mx, my + m.mr + 3, mz);
          const vis = selX.size === 0 || selX.has(m.bucket);
          m.mesh.visible = vis;
          m.num.visible = vis;
        }
      }
      // Layer contenuto/trend: rotazione lenta, pulsazione, on/off dai toggle.
      topicGroup.visible = showTopicsRef.current;
      trendGroup.visible = showTrendsRef.current;
      if (!reduce) {
        topicGroup.rotation.y = t * 0.012;
        trendGroup.rotation.y = -t * 0.018;
      }
      for (const tm of trendMeshes) {
        const pulse = 1 + 0.18 * Math.sin(t * 2 + tm.phase);
        tm.mesh.scale.setScalar(tm.base * pulse);
      }

      fillLight.position.copy(camera.position);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onCanvasDown);
      renderer.domElement.removeEventListener('pointerup', onCanvasUp);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [stars, sources, core, topics, trends]);

  const sentiments: { key: string; label: string; color: string }[] = [
    { key: 'positive', label: 'positive', color: '#7fe0b0' },
    { key: 'neutral', label: 'neutral', color: '#9fb6dd' },
    { key: 'negative', label: 'negative', color: '#e08878' },
  ];
  const anySel = selSrc.size > 0 || selSent.size > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-600">Sources:</span>
        {sources.map((s, i) => {
          const on = selSrc.has(i);
          return (
            <button key={s.id} onClick={() => toggle(setSelSrc, i)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
            </button>
          );
        })}
        <span className="ml-2 mr-1 text-[11px] uppercase tracking-wide text-slate-600">Sentiment:</span>
        {sentiments.map((s) => {
          const on = selSent.has(s.key);
          return (
            <button key={s.key} onClick={() => toggle(setSelSent, s.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
            </button>
          );
        })}
        {anySel && (
          <button onClick={() => { setSelSrc(new Set()); setSelSent(new Set()); }}
            className="ml-1 rounded-full px-2.5 py-1 text-xs text-sky-400 hover:text-sky-300">clear ✕</button>
        )}

        <span className="ml-2 mr-1 text-[11px] uppercase tracking-wide text-slate-600">Layers:</span>
        <button onClick={() => setShowTopics((v) => !v)}
          title="Show/hide the outer belt of dominant topics (what the conversation is about)"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${showTopics ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#9fb6dd' }} />Topics
        </button>
        <button onClick={() => setShowTrends((v) => !v)}
          title="Show/hide the emerging trends as pulsing golden comets"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${showTrends ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />Trends
        </button>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-black" style={{ height: 600 }}>
        <div ref={mountRef} className="size-full cursor-grab touch-none active:cursor-grabbing" />
        <div className="pointer-events-none absolute left-4 top-4 text-sm">
          <p className="text-xs uppercase tracking-widest text-slate-500">Conversation galaxy</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-100">{title}</p>
          <div className="mt-2 flex gap-4 text-xs text-slate-400">
            <span>health <span className="font-semibold text-slate-100">{core}</span> · {grade}</span>
            <span><span className="text-slate-200">{total.toLocaleString('en-US')}</span> mentions</span>
            <span>sentiment <span className={avgSentiment > 0.15 ? 'text-emerald-400' : avgSentiment < -0.15 ? 'text-red-400' : 'text-sky-300'}>{avgSentiment > 0 ? '+' : ''}{avgSentiment}</span></span>
          </div>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-4 max-w-[70%] text-[11px] text-slate-600">
drag to orbit · scroll to fly closer · planets = sources (size = volume) · 3 moons each, sized 1–10 by sentiment · outer belt = topics · golden comets = emerging trends
        </p>
        <p className="pointer-events-none absolute bottom-3 right-4 text-[10px] text-slate-700">
          Textures © Solar System Scope · CC BY 4.0
        </p>

        {hatch && <EggHatch onClose={() => setHatch(false)} />}
      </div>
    </div>
  );
}

// ── 🥚 Easter egg: clic sulla Terra → l'uovo si schiude in un pulcino ──
function EggHatch({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 9000);
    return () => clearTimeout(t);
  }, [onClose]);
  const shards = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    return { dx: `${Math.cos(a) * 180}px`, dy: `${Math.sin(a) * 140 - 40}px`, r: `${(i % 2 ? 1 : -1) * 220}deg`, d: `${1.5 + i * 0.02}s` };
  });
  return (
    <div onClick={onClose}
      className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
      <style>{`
        @keyframes eggWobble{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
        @keyframes eggOut{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.35) translateY(-10px)}}
        @keyframes chickIn{0%{opacity:0;transform:translateY(60px) scale(.25)}60%{opacity:1;transform:translateY(-14px) scale(1.1)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes eggTextIn{to{opacity:1;transform:translateY(0)}}
        @keyframes eggShard{0%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--r))}}
        .egg-mask{-webkit-mask:radial-gradient(circle at 50% 46%,#000 52%,transparent 70%);mask:radial-gradient(circle at 50% 46%,#000 52%,transparent 70%)}
      `}</style>
      <div className="relative" style={{ width: 340, height: 340 }}>
        <img src="/egg/chick.jpg" alt="chick" draggable={false}
          className="egg-mask absolute left-1/2 top-1/2 w-[320px] -translate-x-1/2 -translate-y-1/2 opacity-0"
          style={{ animation: 'chickIn .8s cubic-bezier(.2,1.5,.4,1) 1.7s forwards' }} />
        <img src="/egg/egg.jpg" alt="egg" draggable={false}
          className="egg-mask absolute left-1/2 top-1/2 w-[220px] -translate-x-1/2 -translate-y-1/2"
          style={{ animation: 'eggWobble .28s ease-in-out 0s 5, eggOut .5s ease-in 1.5s forwards', transformOrigin: '50% 80%' }} />
        {shards.map((s, i) => (
          <span key={i} className="absolute left-1/2 top-1/2 size-3 rounded-[2px] bg-[#f3efe6]"
            style={{ ['--dx' as string]: s.dx, ['--dy' as string]: s.dy, ['--r' as string]: s.r,
              animation: `eggShard .9s ease-out ${s.d} forwards`, opacity: 0 }} />
        ))}
      </div>
      <p className="mt-2 max-w-md px-6 text-center text-lg font-semibold text-slate-100 opacity-0"
        style={{ transform: 'translateY(14px)', animation: 'eggTextIn .7s ease 2.5s forwards' }}>
        Massimo Scognamiglio &amp; Anthropic Claude had a lot of fun together 🐣
      </p>
      <p className="mt-3 text-xs text-slate-500 opacity-0" style={{ animation: 'eggTextIn .6s ease 3.2s forwards' }}>
        (tap anywhere to close)
      </p>
    </div>
  );
}
