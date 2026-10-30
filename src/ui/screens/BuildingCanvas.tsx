// Vue en coupe du siège (GDD 7.5.1). Les personnages se déplacent selon ce que la simulation décide.
import { useEffect, useRef, useState } from 'preact/hooks';
import { pvMax } from '../../sim/adventurers';
import { BEDS, CLASSES, ZONES } from '../../sim/data';
import { infBeds, seats } from '../../sim/economy';
import { PROFS } from '../../sim/data';
import type { Adventurer, BedType, GameState, QuestRun } from '../../sim/types';
import { ACTIVITY_LABELS, plain } from '../components';

export type RoomHit = 'dortoirs' | 'infirmerie' | 'refectoire' | 'comptoir' | 'cuisine' | 'terrain' | 'ville' | 'quete';

const W = 1000;
const H = 500;
const R = 9;

interface Box { x: number; y: number; w: number; h: number }
const ROOMS: Record<RoomHit, Box> = {
  dortoirs: { x: 30, y: 58, w: 470, h: 142 },
  infirmerie: { x: 510, y: 58, w: 240, h: 142 },
  comptoir: { x: 30, y: 212, w: 200, h: 160 },
  refectoire: { x: 240, y: 212, w: 350, h: 160 },
  cuisine: { x: 600, y: 212, w: 150, h: 160 },
  ville: { x: 780, y: 58, w: 200, h: 142 },
  terrain: { x: 30, y: 388, w: 720, h: 100 },
  quete: { x: 780, y: 212, w: 200, h: 276 },
};
const DOOR = { x: 755, y: 345 };

interface Palette { [k: string]: string }
function palette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--panel-2'), panel: v('--panel'), ink: v('--ink'), soft: v('--ink-soft'), faint: v('--ink-faint'),
    line: v('--line'), lineSoft: v('--line-soft'), seal: v('--seal'), sage: v('--sage'), amber: v('--amber'),
    wood: v('--bg-deep'), guerrier: v('--c-guerrier'), rodeur: v('--c-rodeur'), voleur: v('--c-voleur'),
    mage: v('--c-mage'), clerc: v('--c-clerc'), gold: v('--gold'), title: v('--font-title'), text: v('--font-text'),
  };
}

interface Slot { x: number; y: number }

function grid(box: Box, n: number, cols: number, padX = 22, padY = 40, dx = 30, dy = 28): Slot[] {
  return Array.from({ length: n }, (_, i) => ({
    x: box.x + padX + (i % cols) * dx,
    y: box.y + padY + Math.floor(i / cols) * dy,
  }));
}

interface Bed { type: BedType; x: number; y: number; w: number; h: number }

/** Lits du dortoir. Quand ils ne tiennent plus dans la salle (grands niveaux), on les dessine plus petits. */
function layoutBeds(s: GameState): Bed[] {
  const box = ROOMS.dortoirs;
  const order: BedType[] = ['suite', 'individuelle', 'commun', 'paillasse'];
  const bottom = box.y + box.h - 20;   // sous cette ligne : le décompte des lits
  let beds: Bed[] = [];
  for (const k of [1, 0.85, 0.7, 0.6, 0.5]) {
    beds = [];
    let x = box.x + 16;
    let y = box.y + 32;
    for (const t of order) {
      for (let i = 0; i < s.dortoirs.beds[t]; i++) {
        const w = (t === 'suite' ? 70 : t === 'individuelle' ? 44 : 26) * k;
        if (x + w > box.x + box.w - 10) { x = box.x + 16; y += 30 * k; }
        beds.push({ type: t, x, y, w, h: (t === 'suite' ? 26 : t === 'individuelle' ? 22 : 14) * k });
        x += w + 6 * k;
      }
    }
    if (beds.every((b) => b.y + b.h <= bottom)) break;
  }
  return beds;
}

function seatSlots(n: number): Slot[] {
  const box = ROOMS.refectoire;
  const slots: Slot[] = [];
  const tables = Math.ceil(n / 4);
  // 5 tables par rangée : les 40 places du niveau 5 tiennent sur deux rangées.
  for (let t = 0; t < tables; t++) {
    const tx = box.x + 24 + (t % 5) * 64;
    const ty = box.y + 46 + Math.floor(t / 5) * 54;
    const pos = [[0, -12], [28, -12], [0, 26], [28, 26]];
    for (let k = 0; k < 4 && slots.length < n; k++) slots.push({ x: tx + pos[k][0], y: ty + pos[k][1] });
  }
  return slots;
}

function infBedBoxes(n: number): Box[] {
  return Array.from({ length: n }, (_, i) => ({
    x: ROOMS.infirmerie.x + 12 + (i % 7) * 32,
    y: ROOMS.infirmerie.y + 32 + Math.floor(i / 7) * 30,
    w: 26, h: 14,
  }));
}

/** Petit carré du personnel, avec une lettre. */
function staffBadge(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, color: string, letter: string) {
  ctx.fillStyle = color;
  roundRect(ctx, { x: x - 8, y: y - 8, w: 16, h: 16 }, 4);
  ctx.fill();
  ctx.fillStyle = p.panel;
  ctx.font = `700 10px ${p.text}`;
  ctx.textAlign = 'center';
  ctx.fillText(letter, x, y + 4);
  ctx.textAlign = 'left';
}

interface Target { x: number; y: number; bubble: string; label: string }

function computeTargets(s: GameState): Map<number, Target> {
  const t = new Map<number, Target>();
  const beds = layoutBeds(s);
  const used = new Set<number>();
  const seatsList = seatSlots(Math.max(seats(s), 1));
  let seatI = 0;
  const hall = grid(ROOMS.comptoir, 30, 6);
  let hallI = 0;
  const villeSlots = grid(ROOMS.ville, 30, 6, 22, 44, 28, 24);
  let villeI = 0;
  // Patients couchés sur les lits de l'infirmerie (mêmes positions que le dessin des lits)
  const infSlots = infBedBoxes(20).map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));
  let infI = 0;
  // Les élèves se tiennent à droite des professeurs
  const terrainSlots = grid(ROOMS.terrain, 40, 17, 230, 40, 28, 26);
  let terI = 0;
  // File d'attente le long du bas du réfectoire
  const waiting = grid({ x: ROOMS.refectoire.x, y: ROOMS.refectoire.y + ROOMS.refectoire.h - 46, w: 0, h: 0 }, 15, 15, 14, 34, 22, 20);
  let waitI = 0;

  const advs = [...s.adventurers].sort((a, b) => a.id - b.id);
  for (const a of advs) {
    const k = a.activity.kind;
    let slot: Slot = { x: hall[0].x, y: hall[0].y };
    if (k === 'quete') continue;
    if (k === 'dormir') {
      const i = beds.findIndex((b, idx) => b.type === a.activity.bed && !used.has(idx));
      if (i >= 0) { used.add(i); slot = { x: beds[i].x + beds[i].w / 2, y: beds[i].y + beds[i].h / 2 }; }
    } else if (k === 'manger' || k === 'boire') {
      slot = seatsList[seatI++ % seatsList.length];
    } else if (k === 'attendre') {
      slot = waiting[waitI++ % waiting.length];
    } else if (k === 'hospitalise' || k === 'consultation') {
      slot = infSlots[infI++ % infSlots.length];
    } else if (k === 'entrainement') {
      slot = terrainSlots[terI++ % terrainSlots.length];
    } else if (['auberge', 'taverne', 'soin', 'vendre', 'aide', 'dehors', 'forge'].includes(k)) {
      slot = villeSlots[villeI++ % villeSlots.length];
    } else {
      slot = hall[hallI++ % hall.length];
    }
    let bubble = '';
    if (k === 'dormir' || k === 'auberge' || k === 'dehors') bubble = '💤';
    else if (k === 'manger' || k === 'taverne') bubble = '🍲';
    else if (k === 'boire') bubble = '🍺';
    else if (k === 'attendre') bubble = '⏳';
    else if (k === 'hospitalise' || k === 'consultation') bubble = '✚';
    else if (k === 'entrainement') bubble = '⚔';
    if (a.status !== 'actif') bubble = '❗';
    else if (a.hp < pvMax(a) * 0.5 || a.states.some((x) => x.gravite >= 1)) bubble = bubble || '🩸';
    t.set(a.id, { ...slot, bubble, label: ACTIVITY_LABELS[k] });
  }
  return t;
}

function roomAt(x: number, y: number): RoomHit | null {
  for (const [k, b] of Object.entries(ROOMS) as [RoomHit, Box][]) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
  }
  return null;
}

function roundRect(ctx: CanvasRenderingContext2D, b: Box, r = 8) {
  ctx.beginPath();
  ctx.moveTo(b.x + r, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
  ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
  ctx.closePath();
}

function drawRoom(ctx: CanvasRenderingContext2D, p: Palette, b: Box, title: string, sub: string, selected: boolean, works: boolean) {
  roundRect(ctx, b);
  ctx.fillStyle = p.panel;
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 : 1;
  ctx.strokeStyle = selected ? p.seal : p.line;
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.font = `600 14px ${p.title}`;
  ctx.fillText(title, b.x + 10, b.y + 18);
  const titleW = ctx.measureText(title).width;
  ctx.fillStyle = p.faint;
  ctx.font = `11px ${p.text}`;
  ctx.fillText(sub, b.x + 10 + titleW + 8, b.y + 18);
  if (works) {
    ctx.save();
    roundRect(ctx, b);
    ctx.clip();
    ctx.strokeStyle = p.amber;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 6;
    for (let x = b.x - b.h; x < b.x + b.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.h, b.y); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = p.amber;
    ctx.font = `600 12px ${p.text}`;
    ctx.fillText('Travaux en cours', b.x + b.w - 112, b.y + 18);
  }
}

function drawRuns(ctx: CanvasRenderingContext2D, p: Palette, s: GameState) {
  const b = ROOMS.quete;
  const active = s.runs.filter((r) => r.stage !== 'preparation');
  ctx.font = `11px ${p.text}`;
  active.slice(0, 9).forEach((run: QuestRun, i) => {
    const y = b.y + 42 + i * 28;
    const members = run.members.map((id) => s.adventurers.find((a) => a.id === id)).filter(Boolean) as Adventurer[];
    members.slice(0, 4).forEach((m, j) => {
      ctx.beginPath();
      ctx.arc(b.x + 16 + j * 14, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = p[m.classe];
      ctx.fill();
    });
    ctx.fillStyle = p.soft;
    const stage = run.stage === 'aller' ? '→' : run.stage === 'retour' ? '←' : '⚔';
    const zone = ZONES[run.quest.zone].court;
    ctx.fillText(`${stage} ${zone} · ${run.quest.target ? run.kills + '/' + run.quest.count : ''}`, b.x + 16 + Math.min(4, members.length) * 14 + 4, y + 4);
  });
  if (active.length === 0) {
    ctx.fillStyle = p.faint;
    ctx.fillText('Personne en quête.', b.x + 12, b.y + 44);
  } else if (active.length > 9) {
    ctx.fillStyle = p.faint;
    ctx.fillText(`et ${active.length - 9} autre(s)…`, b.x + 12, b.y + b.h - 10);
  }
}

export function BuildingCanvas({ s, selected, onSelect, onOpen }: {
  s: GameState; selected: RoomHit | null; onSelect: (r: RoomHit) => void; onOpen: (id: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(s);
  const selRef = useRef(selected);
  const pos = useRef(new Map<number, { x: number; y: number }>());
  const targets = useRef(new Map<number, Target>());
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const hoverRef = useRef<number | null>(null);
  hoverRef.current = hover?.id ?? null;
  stateRef.current = s;
  selRef.current = selected;

  useEffect(() => { targets.current = computeTargets(s); }, [s.tick, s]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let p = palette();
    let paletteAt = 0;

    const frame = (now: number) => {
      const st = stateRef.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - paletteAt > 1000) { p = palette(); paletteAt = now; }
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssW * dpr * (H / W));
      }
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, W, H);

      // Toit et sol
      ctx.fillStyle = p.wood;
      ctx.beginPath();
      ctx.moveTo(14, 54); ctx.lineTo(390, 8); ctx.lineTo(766, 54); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.seal;
      ctx.font = `700 15px ${p.title}`;
      ctx.textAlign = 'center';
      ctx.fillText('Siège de la Guilde', 390, 44);
      ctx.textAlign = 'left';
      ctx.fillStyle = p.lineSoft;
      ctx.fillRect(0, 376, 770, 4);

      const d = st.dortoirs;
      const r = st.refectoire;
      const sel = selRef.current;
      drawRoom(ctx, p, ROOMS.dortoirs, 'Dortoirs', `niveau ${d.level} · propreté ${Math.round(d.proprete)}`, sel === 'dortoirs', !!d.works);
      drawRoom(ctx, p, ROOMS.comptoir, 'Comptoir', 'et grand hall', sel === 'comptoir', false);
      drawRoom(ctx, p, ROOMS.refectoire, 'Réfectoire', `niveau ${r.level} · ${seats(st)} places`, sel === 'refectoire', !!r.works);
      drawRoom(ctx, p, ROOMS.cuisine, 'Cuisine', `niveau ${st.cuisine.level}`, sel === 'cuisine', !!st.cuisine.works);
      drawRoom(ctx, p, ROOMS.ville, 'En ville', '', sel === 'ville', false);
      const inf = st.infirmerie;
      const ter = st.terrain;
      drawRoom(ctx, p, ROOMS.infirmerie, 'Infirmerie', inf.level ? `niveau ${inf.level} · ${infBeds(st)} lits` : inf.works ? '' : 'à construire', sel === 'infirmerie', !!inf.works);
      drawRoom(ctx, p, ROOMS.terrain, "Terrain d'entraînement", ter.level ? `niveau ${ter.level} · ${ter.profs.length} professeur(s)` : ter.works ? '' : 'à construire', sel === 'terrain', !!ter.works);
      for (const [room, lvl] of [['infirmerie', inf.level], ['terrain', ter.level]] as const) {
        if (lvl > 0 || st[room].works) continue;
        const b = ROOMS[room];
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = p.faint;
        roundRect(ctx, { x: b.x + 6, y: b.y + 26, w: b.w - 12, h: b.h - 32 }, 6);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = p.faint;
        ctx.font = `12px ${p.text}`;
        ctx.fillText('Cliquer pour construire', b.x + 14, b.y + b.h / 2 + 8);
      }
      // Lits de l'infirmerie et soigneurs
      for (const b of infBedBoxes(infBeds(st))) {
        ctx.fillStyle = '#d9d4c7';
        ctx.globalAlpha = 0.6;
        roundRect(ctx, b, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      st.staff.filter((m) => m.role === 'soigneur' || m.role === 'apothicaire').forEach((m, i) => {
        staffBadge(ctx, p, ROOMS.infirmerie.x + ROOMS.infirmerie.w - 20 - i * 22, ROOMS.infirmerie.y + ROOMS.infirmerie.h - 18,
          p.sage, m.role === 'soigneur' ? '✚' : 'A');
      });
      // Intendant et inspecteur du butin : derrière le comptoir
      st.staff.filter((m) => m.role === 'intendant' || m.role === 'inspecteur').forEach((m, i) => {
        staffBadge(ctx, p, ROOMS.comptoir.x + ROOMS.comptoir.w - 20 - i * 22, ROOMS.comptoir.y + 12, p.amber, m.role === 'intendant' ? 'I' : 'B');
      });
      // Professeurs sur le terrain
      ter.profs.forEach((pr, i) => {
        const x = ROOMS.terrain.x + 30 + i * 40;
        const y = ROOMS.terrain.y + 58;
        ctx.fillStyle = p.gold ?? p.amber;
        roundRect(ctx, { x: x - 10, y: y - 10, w: 20, h: 20 }, 5);
        ctx.fill();
        ctx.fillStyle = p.panel;
        ctx.font = `700 10px ${p.text}`;
        ctx.textAlign = 'center';
        ctx.fillText(PROFS[pr.type].nom[0], x, y + 4);
        ctx.textAlign = 'left';
      });
      drawRoom(ctx, p, ROOMS.quete, 'En quête', `${st.runs.filter((x) => x.stage !== 'preparation').length} équipe(s)`, sel === 'quete', false);

      // Lits
      for (const b of layoutBeds(st)) {
        ctx.fillStyle = b.type === 'paillasse' ? '#b79a62' : b.type === 'commun' ? '#8c6d46' : b.type === 'suite' ? '#a8801f' : '#7a3b2e';
        ctx.globalAlpha = 0.55;
        roundRect(ctx, { x: b.x, y: b.y, w: b.w, h: b.h }, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = p.faint;
      ctx.font = `11px ${p.text}`;
      const counts = (['paillasse', 'commun', 'individuelle', 'suite'] as BedType[]).filter((t) => d.beds[t] > 0)
        .map((t) => `${d.beds[t]} ${BEDS[t].nom.toLowerCase()}`).join(' · ');
      ctx.fillText(counts, ROOMS.dortoirs.x + 10, ROOMS.dortoirs.y + ROOMS.dortoirs.h - 8);

      // Tables du réfectoire
      const sl = seatSlots(Math.max(seats(st), 1));
      ctx.fillStyle = '#8c6d46';
      ctx.globalAlpha = 0.55;
      for (let t = 0; t < sl.length; t += 4) {
        roundRect(ctx, { x: sl[t].x - 4, y: sl[t].y + 6, w: 36, h: 14 }, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Cuisine : cuisiniers et commis seulement (les autres employés ont leur place ailleurs)
      st.staff.filter((m) => m.role === 'cuisinier' || m.role === 'commis').forEach((m, i) => {
        staffBadge(ctx, p, ROOMS.cuisine.x + 22 + (i % 4) * 30, ROOMS.cuisine.y + 56 + Math.floor(i / 4) * 34,
          m.role === 'cuisinier' ? p.ink : p.soft, m.role === 'cuisinier' ? 'C' : 'c');
      });
      ctx.fillStyle = p.faint;
      ctx.font = `11px ${p.text}`;
      ctx.fillText(`${r.portionsReady} portions prêtes`, ROOMS.cuisine.x + 10, ROOMS.cuisine.y + ROOMS.cuisine.h - 10);

      drawRuns(ctx, p, st);

      // Personnages
      const tg = targets.current;
      for (const id of [...pos.current.keys()]) if (!tg.has(id)) pos.current.delete(id);
      for (const a of st.adventurers) {
        const t = tg.get(a.id);
        if (!t) continue;
        let cur = pos.current.get(a.id);
        if (!cur) { cur = { ...DOOR }; pos.current.set(a.id, cur); }
        const k = Math.min(1, dt * 3.5);
        cur.x += (t.x - cur.x) * k;
        cur.y += (t.y - cur.y) * k;
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, R, 0, Math.PI * 2);
        ctx.fillStyle = p[a.classe];
        ctx.fill();
        if (hoverRef.current === a.id) { ctx.lineWidth = 2.5; ctx.strokeStyle = p.ink; ctx.stroke(); }
        ctx.fillStyle = '#fff';
        ctx.font = `700 10px ${p.text}`;
        ctx.textAlign = 'center';
        ctx.fillText(a.name[0], cur.x, cur.y + 3.5);
        if (t.bubble) {
          ctx.font = `12px ${p.text}`;
          ctx.fillText(t.bubble, cur.x + 9, cur.y - 9);
        }
        ctx.textAlign = 'left';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);


  const toLogical = (e: MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H, rect };
  };
  const charAt = (x: number, y: number) => {
    let best: number | null = null;
    let bd = (R + 4) ** 2;
    for (const [id, c] of pos.current) {
      const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d2 < bd) { bd = d2; best = id; }
    }
    return best;
  };

  const hovered = hover ? s.adventurers.find((a) => a.id === hover.id) : null;
  const ht = hover ? targets.current.get(hover.id) : null;
  const lastThought = hovered?.thoughts[hovered.thoughts.length - 1];

  return (
    <div class="building">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Vue en coupe du siège : dortoirs à l'étage, comptoir, réfectoire et cuisine au rez-de-chaussée"
        style={{ aspectRatio: `${W} / ${H}` }}
        onMouseMove={(e) => {
          const { x, y, rect } = toLogical(e);
          const id = charAt(x, y);
          setHover(id === null ? null : { id, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const { x, y } = toLogical(e);
          const id = charAt(x, y);
          if (id !== null) { onOpen(id); return; }
          const room = roomAt(x, y);
          if (room) onSelect(room);
        }}
      />
      {hovered && hover && (
        <div class="tooltip" style={{ left: Math.min(hover.x + 14, (canvasRef.current?.clientWidth ?? 600) - 270), top: hover.y + 14 }}>
          <strong>{hovered.name}</strong> <small>{CLASSES[hovered.classe].nom} niv {hovered.level}</small>
          <div>{ht?.label}</div>
          {lastThought && <div class="thought">« {plain(lastThought.text)} »</div>}
        </div>
      )}
    </div>
  );
}
