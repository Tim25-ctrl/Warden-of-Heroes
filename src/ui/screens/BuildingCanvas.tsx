// Vue en coupe illustrée du siège (GDD 7.5.1, refonte graphique v1.1).
// Les personnages se déplacent selon ce que la simulation décide ; le dessin ne fait que le montrer.
import { useEffect, useRef, useState } from 'preact/hooks';
import { pvMax } from '../../sim/adventurers';
import { BEDS, CLASSES, PROFS, ROLES, ZONES } from '../../sim/data';
import { bedsAvailable, bedsUsed, infBeds, kitchenRate, seats } from '../../sim/economy';
import { hourOf } from '../../sim/format';
import { hospitalized } from '../../sim/infirmary';
import { type CleanRoom, propreteOf } from '../../sim/rooms';
import type { Adventurer, BedType, GameState, QuestRun, StaffRole } from '../../sim/types';
import { ACTIVITY_LABELS, plain } from '../components';
import guildeUrl from '../../assets/guilde.jpg';

/** Décor illustré du siège (v1.1, D-158) : le bâtiment vide ; le jeu y dessine lits, tables et personnages. */
const BG = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: guildeUrl }) : null;

export type RoomHit = 'dortoirs' | 'infirmerie' | 'refectoire' | 'comptoir' | 'cuisine' | 'terrain' | 'ville' | 'quete';

const W = 1000;
const H = 520;

interface Box { x: number; y: number; w: number; h: number }
/**
 * Salles calées sur le décor illustré (1440 × 736, ramené à 1000 × 520).
 * Étage : dortoirs et infirmerie. Rez-de-chaussée : comptoir, réfectoire, cuisine. Cour : terrain. À droite, sur la rue : la ville et les routes.
 */
const ROOMS: Record<RoomHit, Box> = {
  dortoirs: { x: 78, y: 70, w: 572, h: 156 },
  infirmerie: { x: 672, y: 70, w: 184, h: 156 },
  comptoir: { x: 78, y: 244, w: 228, h: 160 },
  refectoire: { x: 322, y: 244, w: 331, h: 160 },
  cuisine: { x: 669, y: 244, w: 187, h: 160 },
  terrain: { x: 8, y: 426, w: 858, h: 92 },
  ville: { x: 866, y: 12, w: 128, h: 196 },
  quete: { x: 866, y: 216, w: 128, h: 296 },
};
/** Planchers : la ligne où les personnages posent les pieds, à l'étage et au rez-de-chaussée. */
const FLOOR_UP = 214;
const FLOOR_DOWN = 392;
const DOOR = { x: 860, y: 470 };

interface Palette { [k: string]: string }
function palette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--panel-2'), panel: v('--panel'), panel2: v('--panel-2'), ink: v('--ink'), soft: v('--ink-soft'), faint: v('--ink-faint'),
    line: v('--line'), lineSoft: v('--line-soft'), accent: v('--accent'), seal: v('--seal'), sage: v('--sage'), sageSoft: v('--sage-soft'),
    amber: v('--amber'), blue: v('--blue'), blueSoft: v('--blue-soft'), bgDeep: v('--bg-deep'), wood: v('--wood'), wall: v('--wall'),
    floor: v('--floor'), skin: v('--skin'), gold: v('--gold'),
    guerrier: v('--c-guerrier'), rodeur: v('--c-rodeur'), voleur: v('--c-voleur'), mage: v('--c-mage'), clerc: v('--c-clerc'),
    title: v('--font-title'), text: v('--font-text'), dark: cs.colorScheme === 'dark' ? '1' : '',
  };
}

interface Slot { x: number; y: number }

function grid(box: Box, n: number, cols: number, padX: number, padY: number, dx: number, dy: number): Slot[] {
  return Array.from({ length: n }, (_, i) => ({ x: box.x + padX + (i % cols) * dx, y: box.y + padY + Math.floor(i / cols) * dy }));
}

interface Bed { type: BedType; x: number; y: number; w: number; h: number }

/** Lits du dortoir. Quand ils ne tiennent plus dans la salle (grands niveaux), on les dessine plus petits. */
function layoutBeds(s: GameState): Bed[] {
  const x0 = ROOMS.dortoirs.x + 14, x1 = ROOMS.dortoirs.x + ROOMS.dortoirs.w - 14;
  const order: BedType[] = ['suite', 'individuelle', 'commun', 'paillasse'];
  let beds: Bed[] = [];
  for (const k of [1, 0.85, 0.7, 0.6, 0.5, 0.42]) {
    beds = [];
    let x = x0;
    let row = 0;
    for (const t of order) {
      for (let i = 0; i < s.dortoirs.beds[t]; i++) {
        const w = (t === 'suite' ? 70 : t === 'individuelle' ? 46 : 30) * k;
        const h = (t === 'suite' ? 24 : t === 'individuelle' ? 20 : 16) * k;
        if (x + w > x1) { x = x0; row += 1; }
        beds.push({ type: t, x, y: FLOOR_UP + 8 - h - row * 28 * k, w, h });
        x += w + 6 * k;
      }
    }
    if (beds.every((b) => b.y >= 140)) break;   // pas plus haut que l'appui des fenêtres
  }
  return beds;
}

function seatSlots(n: number): Slot[] {
  const box = ROOMS.refectoire;
  const slots: Slot[] = [];
  const tables = Math.ceil(n / 4);
  for (let t = 0; t < tables; t++) {
    const tx = box.x + 14 + (t % 4) * 58;
    const ty = FLOOR_DOWN - 22 - Math.floor(t / 4) * 40;
    const pos = [[2, -12], [30, -12], [2, 24], [30, 24]];
    for (let k = 0; k < 4 && slots.length < n; k++) slots.push({ x: tx + pos[k][0], y: ty + pos[k][1] });
  }
  return slots;
}

function infBedBoxes(n: number): Box[] {
  return Array.from({ length: n }, (_, i) => ({
    x: ROOMS.infirmerie.x + 10 + (i % 4) * 32,
    y: FLOOR_UP - 6 - Math.floor(i / 4) * 18,
    w: 26, h: 14,
  }));
}

/** Pictogramme au-dessus d'un personnage : ce qu'il fait ou ce qui ne va pas. */
interface Target { x: number; y: number; bubble: string; label: string }

function computeTargets(s: GameState): Map<number, Target> {
  const t = new Map<number, Target>();
  const beds = layoutBeds(s);
  const used = new Set<number>();
  const seatsList = seatSlots(Math.max(seats(s), 1));
  let seatI = 0;
  const hall = Array.from({ length: 18 }, (_, i) => ({ x: ROOMS.comptoir.x + 24 + (i % 7) * 28, y: FLOOR_DOWN - Math.floor(i / 7) * 14 }));
  let hallI = 0;
  const villeSlots = grid(ROOMS.ville, 24, 4, 20, 58, 28, 24);
  let villeI = 0;
  const infSlots = infBedBoxes(20).map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));
  let infI = 0;
  const terrainSlots = grid(ROOMS.terrain, 40, 17, 250, 44, 28, 22);
  let terI = 0;
  const waiting = Array.from({ length: 15 }, (_, i) => ({ x: ROOMS.refectoire.x + 262 + (i % 3) * 20, y: FLOOR_DOWN - Math.floor(i / 3) * 14 }));
  let waitI = 0;

  for (const a of [...s.adventurers].sort((x, y) => x.id - y.id)) {
    const k = a.activity.kind;
    if (k === 'quete') continue;
    let slot: Slot = hall[0];
    if (k === 'dormir') {
      const i = beds.findIndex((b, idx) => b.type === a.activity.bed && !used.has(idx));
      if (i >= 0) { used.add(i); slot = { x: beds[i].x + beds[i].w / 2, y: beds[i].y + beds[i].h / 2 }; }
    } else if (k === 'manger' || k === 'boire') slot = seatsList[seatI++ % seatsList.length];
    else if (k === 'attendre') slot = waiting[waitI++ % waiting.length];
    else if (k === 'hospitalise' || k === 'consultation') slot = infSlots[infI++ % infSlots.length];
    else if (k === 'entrainement') slot = terrainSlots[terI++ % terrainSlots.length];
    else if (['auberge', 'taverne', 'soin', 'vendre', 'aide', 'dehors', 'forge'].includes(k)) slot = villeSlots[villeI++ % villeSlots.length];
    else slot = hall[hallI++ % hall.length];
    let bubble = '';
    if (k === 'dormir' || k === 'auberge' || k === 'dehors') bubble = 'z';
    else if (k === 'boire') bubble = '♪';
    else if (k === 'attendre') bubble = '…';
    else if (k === 'hospitalise' || k === 'consultation') bubble = '+';
    else if (k === 'entrainement') bubble = '⚔';
    if (a.status !== 'actif') bubble = '!';
    else if (a.hp < pvMax(a) * 0.5 || a.states.some((x) => x.gravite >= 1)) bubble = bubble || '+';
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

/** Petit cartouche en haut d'une salle : son nom et son occupation. */
function cartouche(ctx: CanvasRenderingContext2D, p: Palette, b: Box, title: string, info: string) {
  ctx.font = `700 15px ${p.title}`;
  const tw = ctx.measureText(title).width;
  ctx.font = `13px ${p.text}`;
  const iw = info ? ctx.measureText(info).width + 12 : 0;
  const box = { x: b.x + 8, y: b.y + 7, w: tw + iw + 22, h: 24 };
  roundRect(ctx, box, 12);
  ctx.fillStyle = p.panel;
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.font = `700 15px ${p.title}`;
  ctx.fillText(title, box.x + 11, box.y + 17);
  if (info) {
    ctx.fillStyle = p.soft;
    ctx.font = `13px ${p.text}`;
    ctx.fillText(info, box.x + 11 + tw + 12, box.y + 17);
  }
}

function hatch(ctx: CanvasRenderingContext2D, p: Palette, b: Box) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  ctx.strokeStyle = p.amber;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 7;
  for (let x = b.x - b.h; x < b.x + b.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + b.h, b.y); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = p.amber;
  ctx.font = `700 13px ${p.text}`;
  ctx.textAlign = 'right';
  ctx.fillText('Travaux en cours', b.x + b.w - 10, b.y + 24);
  ctx.textAlign = 'left';
}

/** Sol de chaque salle entretenue, où marchent les agents d'entretien. */
const CLEAN_FLOOR: Record<CleanRoom, { x0: number; x1: number; y: number }> = {
  dortoirs: { x0: ROOMS.dortoirs.x + 30, x1: ROOMS.dortoirs.x + ROOMS.dortoirs.w - 30, y: FLOOR_UP + 6 },
  infirmerie: { x0: ROOMS.infirmerie.x + 20, x1: ROOMS.infirmerie.x + ROOMS.infirmerie.w - 30, y: FLOOR_UP + 6 },
  refectoire: { x0: ROOMS.refectoire.x + 20, x1: ROOMS.refectoire.x + ROOMS.refectoire.w - 30, y: FLOOR_DOWN + 6 },
};
const STAIR_X = 600;   // l'escalier du décor, au fond du réfectoire
const CLEAN_STOP = 14;   // secondes passées dans chaque salle
const CLEAN_WALK = 3;    // dont secondes de marche

/** Où se trouve l'agent n° i : il fait le tour des salles, des plus sales aux plus propres, et balaie en va-et-vient. */
function cleanerPos(order: CleanRoom[], i: number, now: number): [number, number] {
  const t = now / 1000 + i * 5;
  const k = Math.floor(t / CLEAN_STOP);
  const into = t - k * CLEAN_STOP;
  const room = order[(k + i) % order.length];
  const prev = order[(k + i - 1 + order.length) % order.length];
  const f = CLEAN_FLOOR[room];
  const sweep = (r: CleanRoom, tt: number) => { const g = CLEAN_FLOOR[r]; return g.x0 + (0.5 + 0.5 * Math.sin(tt / 1.8 + i)) * (g.x1 - g.x0); };
  if (into >= CLEAN_WALK || order.length < 2) return [sweep(room, t), f.y];
  // Marche depuis la salle précédente, par l'escalier si l'étage change.
  const a = CLEAN_FLOOR[prev];
  const from: [number, number] = [sweep(prev, k * CLEAN_STOP), a.y];
  const to: [number, number] = [sweep(room, (k * CLEAN_STOP + CLEAN_WALK)), f.y];
  const u = into / CLEAN_WALK;
  const pts: [number, number][] = a.y === f.y ? [from, to] : [from, [STAIR_X, a.y], [STAIR_X, f.y], to];
  const seg = pts.slice(1).map((q, j) => Math.hypot(q[0] - pts[j][0], q[1] - pts[j][1]));
  let d = u * seg.reduce((x, y) => x + y, 0);
  for (let j = 0; j < seg.length; j++) {
    if (d <= seg[j] || j === seg.length - 1) {
      const v = seg[j] ? Math.min(1, d / seg[j]) : 0;
      return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * v, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * v];
    }
    d -= seg[j];
  }
  return to;
}

/** Le balai, qui va et vient. */
function broom(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, now: number) {
  const a = 0.5 + 0.35 * Math.sin(now / 220);
  ctx.save();
  ctx.translate(x + 5, y - 1);
  ctx.rotate(a);
  ctx.strokeStyle = p.wood;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 14); ctx.stroke();
  ctx.fillStyle = p.amber;
  ctx.beginPath(); ctx.moveTo(-3, 13); ctx.lineTo(3, 13); ctx.lineTo(5, 19); ctx.lineTo(-5, 19); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Un pion : corps à la couleur de sa classe, tête, et parfois un pictogramme. */
function pawn(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, color: string, highlight = false, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-7, 8);
  ctx.quadraticCurveTo(-8, -2, 0, -3);
  ctx.quadraticCurveTo(8, -2, 7, 8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -8, 5, 0, Math.PI * 2);
  ctx.fillStyle = p.skin;
  ctx.fill();
  ctx.lineWidth = highlight ? 2.5 : 1;
  ctx.strokeStyle = highlight ? p.ink : 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();
}

function glyphBubble(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, g: string) {
  const bx = x + 7;
  const by = y - 24;
  roundRect(ctx, { x: bx, y: by, w: 15, h: 13 }, 5);
  ctx.fillStyle = g === '!' ? p.seal : g === '+' && false ? p.seal : p.panel;
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = g === '!' ? '#fff' : g === '+' ? p.seal : p.ink;
  ctx.font = `700 11px ${p.text}`;
  ctx.textAlign = 'center';
  ctx.fillText(g, bx + 7.5, by + 10.5);
  ctx.textAlign = 'left';
}

function thoughtBubble(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, text: string) {
  ctx.font = `italic 13px ${p.text}`;
  const w = Math.min(260, ctx.measureText(text).width + 16);
  let bx = x - w / 2;
  bx = Math.max(6, Math.min(W - w - 6, bx));
  const by = y - 52;
  roundRect(ctx, { x: bx, y: by, w, h: 24 }, 10);
  ctx.fillStyle = p.panel;
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, by + 30, 3, 0, Math.PI * 2);
  ctx.arc(x + 2, by + 37, 2, 0, Math.PI * 2);
  ctx.fillStyle = p.panel;
  ctx.fill();
  ctx.fillStyle = p.ink;
  ctx.fillText(text, bx + 8, by + 16, w - 16);
}

interface StaffSpot { x: number; y: number; role: StaffRole; name: string; c: number }

export function BuildingCanvas({ s, selected, onSelect, onOpen, onStaff }: {
  s: GameState; selected: RoomHit | null; onSelect: (r: RoomHit) => void; onOpen: (id: number) => void; onStaff?: (role: StaffRole) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(s);
  const selRef = useRef(selected);
  const pos = useRef(new Map<number, { x: number; y: number }>());
  const targets = useRef(new Map<number, Target>());
  const staffSpots = useRef<StaffSpot[]>([]);
  const thought = useRef<{ id: number; text: string; until: number; next: number }>({ id: -1, text: '', until: 0, next: 0 });
  const [hover, setHover] = useState<{ id?: number; staff?: StaffSpot; x: number; y: number } | null>(null);
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
      const h = hourOf(st.tick);
      const night = h >= 21 || h < 6;
      const dusk = !night && (h >= 18 || h < 8);
      const sel = selRef.current;
      const spots: StaffSpot[] = [];

      // Le décor illustré : toit, murs, comptoir, âtre, cour et rue. Le soir et la nuit, il s'assombrit.
      if (BG && BG.complete && BG.naturalWidth) ctx.drawImage(BG, 0, 0, W, H);
      else { ctx.fillStyle = p.wall; ctx.fillRect(0, 0, W, H); }
      if (night || dusk || p.dark) {
        ctx.fillStyle = `rgba(14, 18, 42, ${(night ? 0.34 : dusk ? 0.14 : 0) + (p.dark ? 0.12 : 0)})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (night) {
        // Les chandelles éclairent l'intérieur.
        for (const [lx, ly, lr] of [[490, 140, 90], [140, 150, 70], [360, 150, 70], [600, 150, 70], [760, 140, 70], [130, 310, 70], [792, 346, 80]]) {
          const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, lr);
          g.addColorStop(0, 'rgba(255, 190, 110, 0.22)');
          g.addColorStop(1, 'rgba(255, 190, 110, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(lx - lr, ly - lr, 2 * lr, 2 * lr);
        }
      }
      ctx.font = `700 17px ${p.title}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(40, 20, 10, 0.75)';
      ctx.strokeText('Siège de la guilde', 470, 38);
      ctx.fillStyle = '#fff6e6';
      ctx.fillText('Siège de la guilde', 470, 38);
      ctx.textAlign = 'left';

      const d = st.dortoirs;
      const r = st.refectoire;
      const inf = st.infirmerie;
      const ter = st.terrain;
      const k = st.cuisine;

      // Dortoirs : de vrais lits
      for (const b of layoutBeds(st)) {
        ctx.fillStyle = p.wood;
        roundRect(ctx, { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 3 }, 3);
        ctx.fill();
        ctx.fillStyle = b.type === 'paillasse' ? '#c9ad6e' : b.type === 'commun' ? '#9b7a4e' : b.type === 'suite' ? p.gold : p.accent;
        roundRect(ctx, b, 3);
        ctx.fill();
        ctx.fillStyle = p.wall;
        roundRect(ctx, { x: b.x + 2, y: b.y + 2, w: Math.max(5, b.w * 0.22), h: b.h - 4 }, 2);
        ctx.fill();
      }
      const lits = (Object.keys(BEDS) as BedType[]).reduce((a, t) => a + bedsAvailable(st, t), 0);
      const dorment = (Object.keys(BEDS) as BedType[]).reduce((a, t) => a + bedsUsed(st, t), 0);
      cartouche(ctx, p, ROOMS.dortoirs, 'Dortoirs', `${dorment}/${lits} lits`);

      // Infirmerie
      if (inf.level > 0) {
        for (const b of infBedBoxes(infBeds(st))) {
          ctx.fillStyle = p.wood;
          roundRect(ctx, { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 3 }, 3);
          ctx.fill();
          ctx.fillStyle = '#ece6d8';
          roundRect(ctx, b, 3);
          ctx.fill();
          ctx.fillStyle = p.seal;
          ctx.fillRect(b.x + b.w * 0.45, b.y + 2, 3, b.h - 4);
        }
        cartouche(ctx, p, ROOMS.infirmerie, 'Infirmerie', `${hospitalized(st)}/${infBeds(st)} lits`);
      } else {
        cartouche(ctx, p, ROOMS.infirmerie, 'Infirmerie', inf.works ? '' : 'à construire');
        if (!inf.works) {
          ctx.fillStyle = p.faint;
          ctx.font = `14px ${p.text}`;
          ctx.fillText('Cliquer pour construire', ROOMS.infirmerie.x + 50, ROOMS.infirmerie.y + 80);
        }
      }
      st.staff.filter((m) => m.role === 'soigneur' || m.role === 'apothicaire').forEach((m, i) => {
        const x = ROOMS.infirmerie.x + ROOMS.infirmerie.w - 22 - i * 20;
        const y = FLOOR_UP;
        pawn(ctx, p, x, y, p.sage);
        spots.push({ x, y, role: m.role, name: m.name, c: m.c });
      });

      // Comptoir : le grand comptoir de bois et son registre
      const cb = ROOMS.comptoir;
      st.staff.filter((m) => ['intendant', 'inspecteur', 'courtier', 'greffier'].includes(m.role)).forEach((m, i) => {
        const x = cb.x + 30 + i * 28;
        const y = cb.y + 60;
        pawn(ctx, p, x, y, p.gold);
        spots.push({ x, y, role: m.role, name: m.name, c: m.c });
      });
      cartouche(ctx, p, cb, 'Comptoir', st.doorCandidates.length ? `${st.doorCandidates.length} à la porte` : '');

      // Réfectoire : tables, bancs et bougies
      const sl = seatSlots(Math.max(seats(st), 1));
      for (let t = 0; t < sl.length; t += 4) {
        const tx = sl[t].x - 6;
        const ty = sl[t].y + 6;
        ctx.fillStyle = p.wood;
        roundRect(ctx, { x: tx, y: ty, w: 42, h: 12 }, 3);
        ctx.fill();
        ctx.fillStyle = p.floor;
        ctx.fillRect(tx + 2, ty - 8, 38, 3);
        ctx.fillRect(tx + 2, ty + 17, 38, 3);
        ctx.fillStyle = p.amber;
        const flick = 1 + 0.25 * Math.sin(now / 180 + t);
        ctx.beginPath(); ctx.arc(tx + 21, ty + 2, 2.2 * flick, 0, Math.PI * 2); ctx.fill();
      }
      const mangent = st.adventurers.filter((a) => a.activity.kind === 'manger' || a.activity.kind === 'boire').length;
      cartouche(ctx, p, ROOMS.refectoire, 'Réfectoire', `${mangent}/${seats(st)} places`);

      // Cuisine : l'âtre et son feu
      const kb = ROOMS.cuisine;
      const hx = 779;
      const hy = 296;
      const fire = kitchenRate(st) > 0 ? 1 : 0.4;
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) {
        const fh = (10 + 5 * Math.sin(now / 120 + i * 2)) * fire;
        ctx.fillStyle = i === 1 ? p.gold : p.amber;
        ctx.beginPath();
        ctx.moveTo(hx + 4 + i * 8, hy + 62);
        ctx.quadraticCurveTo(hx + 8 + i * 8, hy + 62 - fh, hx + 12 + i * 8, hy + 62);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      st.staff.filter((m) => m.role === 'cuisinier' || m.role === 'commis').forEach((m, i) => {
        const x = kb.x + 20 + (i % 3) * 22;
        const y = FLOOR_DOWN - Math.floor(i / 3) * 16;
        pawn(ctx, p, x, y, m.role === 'cuisinier' ? '#f4efe4' : '#d9cfbd');
        if (m.role === 'cuisinier') { ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 18, 8, 5); }
        spots.push({ x, y, role: m.role, name: m.name, c: m.c });
      });
      cartouche(ctx, p, kb, 'Cuisine', `${kitchenRate(st)}/h`);

      // Cour : le terrain d'entraînement
      const tb = ROOMS.terrain;
      if (ter.level > 0) {
        for (const dx of [200, 700]) {
          ctx.strokeStyle = p.wood;
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(tb.x + dx, tb.y + 70); ctx.lineTo(tb.x + dx, tb.y + 26); ctx.moveTo(tb.x + dx - 14, tb.y + 40); ctx.lineTo(tb.x + dx + 14, tb.y + 40); ctx.stroke();
          ctx.fillStyle = '#c9ad6e';
          ctx.beginPath(); ctx.arc(tb.x + dx, tb.y + 22, 7, 0, Math.PI * 2); ctx.fill();
        }
        ter.profs.forEach((pr, i) => {
          const x = tb.x + 60 + i * 30;
          const y = tb.y + 56;
          pawn(ctx, p, x, y, p.gold, false, 1.15);
          ctx.fillStyle = p.ink;
          ctx.font = `700 11px ${p.text}`;
          ctx.textAlign = 'center';
          ctx.fillText(PROFS[pr.type].nom[0], x, y + 22);
          ctx.textAlign = 'left';
        });
      }
      const eleves = st.adventurers.filter((a) => a.activity.kind === 'entrainement').length;
      cartouche(ctx, p, tb, "Terrain d'entraînement", ter.level ? `${eleves} élève${eleves > 1 ? 's' : ''} · ${ter.profs.length} prof.` : ter.works ? '' : 'à construire');
      if (ter.level === 0 && !ter.works) {
        ctx.fillStyle = p.faint;
        ctx.font = `14px ${p.text}`;
        ctx.fillText('Cliquer pour construire', tb.x + 300, tb.y + 60);
      }

      // Travaux
      for (const [room, x] of [['dortoirs', d], ['refectoire', r], ['cuisine', k], ['infirmerie', inf], ['terrain', ter]] as const) {
        if (x.works) hatch(ctx, p, ROOMS[room]);
      }

      // En ville : silhouettes de maisons
      const vb = ROOMS.ville;
      roundRect(ctx, vb, 12);
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = p.panel;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sel === 'ville' ? p.accent : p.line;
      ctx.lineWidth = sel === 'ville' ? 3 : 1;
      ctx.stroke();
      const enVille = st.adventurers.filter((a) => ['auberge', 'taverne', 'soin', 'vendre', 'aide', 'dehors', 'forge'].includes(a.activity.kind)).length;
      cartouche(ctx, p, vb, 'En ville', enVille ? String(enVille) : '');

      // En quête : le panneau des routes
      const qb = ROOMS.quete;
      roundRect(ctx, qb, 12);
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = p.panel;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sel === 'quete' ? p.accent : p.line;
      ctx.lineWidth = sel === 'quete' ? 3 : 1;
      ctx.stroke();
      const active = st.runs.filter((x) => x.stage !== 'preparation');
      cartouche(ctx, p, qb, 'En quête', String(active.length));
      ctx.font = `12px ${p.text}`;
      active.slice(0, 10).forEach((run: QuestRun, i) => {
        const y = qb.y + 50 + i * 24;
        const members = run.members.map((id) => st.adventurers.find((a) => a.id === id)).filter(Boolean) as Adventurer[];
        members.slice(0, 3).forEach((m, j) => pawn(ctx, p, qb.x + 14 + j * 11, y + 2, p[m.classe], false, 0.7));
        ctx.fillStyle = p.soft;
        const stage = run.stage === 'aller' ? '→' : run.stage === 'retour' ? '←' : '⚔';
        const tx = qb.x + 18 + Math.min(3, members.length) * 11;
        ctx.fillText(`${stage} ${ZONES[run.quest.zone].court}`, tx, y + 5, qb.x + qb.w - tx - 6);
      });
      if (active.length === 0) { ctx.fillStyle = p.faint; ctx.fillText('Personne dehors.', qb.x + 12, qb.y + 56); }
      else if (active.length > 10) { ctx.fillStyle = p.faint; ctx.fillText(`et ${active.length - 10} de plus…`, qb.x + 12, qb.y + qb.h - 10); }

      // Salle choisie
      if (sel && sel !== 'ville' && sel !== 'quete') {
        const b = ROOMS[sel];
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 3;
        roundRect(ctx, { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 }, 6);
        ctx.stroke();
      }

      // Personnages
      const tg = targets.current;
      for (const id of [...pos.current.keys()]) if (!tg.has(id)) pos.current.delete(id);
      for (const a of st.adventurers) {
        const t = tg.get(a.id);
        if (!t) continue;
        let cur = pos.current.get(a.id);
        if (!cur) { cur = { ...DOOR }; pos.current.set(a.id, cur); }
        const kk = Math.min(1, dt * 3.5);
        cur.x += (t.x - cur.x) * kk;
        cur.y += (t.y - cur.y) * kk;
        pawn(ctx, p, cur.x, cur.y, p[a.classe], hoverRef.current === a.id);
        if (t.bubble) glyphBubble(ctx, p, cur.x, cur.y, t.bubble);
      }

      // Une pensée à voix haute de temps en temps
      const th = thought.current;
      if (now > th.next) {
        const candidates = st.adventurers.filter((a) => tg.has(a.id) && a.thoughts.length && a.thoughts[a.thoughts.length - 1].tick > st.tick - 24);
        if (candidates.length) {
          const a = candidates[Math.floor((now / 1000) % candidates.length)];
          const txt = plain(a.thoughts[a.thoughts.length - 1].text);
          th.id = a.id;
          th.text = txt.length > 46 ? `${txt.slice(0, 45)}…` : txt;
          th.until = now + 5000;
        }
        th.next = now + 7000;
      }
      if (now < th.until) {
        const c = pos.current.get(th.id);
        if (c) thoughtBubble(ctx, p, c.x, c.y, `« ${th.text} »`);
      }

      // Agents d'entretien (v1.1) : poussière dans les salles sales, et les agents qui passent avec leur balai.
      const cleanRooms = (['dortoirs', 'refectoire', 'infirmerie'] as CleanRoom[]).filter((r) => r !== 'infirmerie' || st.infirmerie.level > 0);
      for (const r of cleanRooms) {
        const dirt = Math.round((55 - propreteOf(st, r)) / 4);
        const f = CLEAN_FLOOR[r];
        ctx.fillStyle = p.faint;
        for (let j = 0; j < dirt; j++) {
          const dx = f.x0 + ((j * 97 + 31) % 100) / 100 * (f.x1 - f.x0);
          ctx.beginPath(); ctx.arc(dx, f.y + 6 - (j % 3), 1.6 + (j % 2), 0, Math.PI * 2); ctx.fill();
        }
      }
      const order = [...cleanRooms].sort((a, b) => propreteOf(st, a) - propreteOf(st, b));
      st.staff.filter((m) => m.role === 'valet').forEach((m, i) => {
        const [x, y] = cleanerPos(order, i, now);
        pawn(ctx, p, x, y, p.blue);
        broom(ctx, p, x, y, now + i * 700);
        spots.push({ x, y, role: m.role, name: m.name, c: m.c });
      });

      staffSpots.current = spots;
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
    let bd = 14 ** 2;
    for (const [id, c] of pos.current) {
      const d2 = (c.x - x) ** 2 + (c.y - 4 - y) ** 2;
      if (d2 < bd) { bd = d2; best = id; }
    }
    return best;
  };
  const staffAt = (x: number, y: number) => staffSpots.current.find((m) => (m.x - x) ** 2 + (m.y - 4 - y) ** 2 < 14 ** 2) ?? null;

  const hovered = hover?.id !== undefined ? s.adventurers.find((a) => a.id === hover.id) : null;
  const ht = hover?.id !== undefined ? targets.current.get(hover.id) : null;
  const lastThought = hovered?.thoughts[hovered.thoughts.length - 1];

  return (
    <div class="building">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Vue en coupe du siège : dortoirs et infirmerie à l'étage, comptoir, réfectoire et cuisine au rez-de-chaussée, terrain dans la cour"
        style={{ aspectRatio: `${W} / ${H}` }}
        onMouseMove={(e) => {
          const { x, y, rect } = toLogical(e);
          const id = charAt(x, y);
          const staff = id === null ? staffAt(x, y) : null;
          setHover(id !== null ? { id, x: e.clientX - rect.left, y: e.clientY - rect.top } : staff ? { staff, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const { x, y } = toLogical(e);
          const id = charAt(x, y);
          if (id !== null) { onOpen(id); return; }
          const staff = staffAt(x, y);
          if (staff && onStaff) { onStaff(staff.role); return; }
          const room = roomAt(x, y);
          if (room) onSelect(room);
        }}
      />
      {hover && (hovered || hover.staff) && (
        <div class="tooltip" style={{ left: Math.min(hover.x + 14, (canvasRef.current?.clientWidth ?? 600) - 270), top: hover.y + 14 }}>
          {hovered ? (
            <>
              <strong>{hovered.name}</strong> <small>{CLASSES[hovered.classe].nom}, rang {hovered.rang}, niv {hovered.level}</small>
              <div>{ht?.label}</div>
              {lastThought && <div class="thought">« {plain(lastThought.text)} »</div>}
            </>
          ) : (
            <>
              <strong>{hover.staff!.name}</strong> <small>{ROLES[hover.staff!.role].nom}, compétence {hover.staff!.c}</small>
              <div class="hint">Cliquer pour ouvrir le Personnel</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
