// Tâche de fond qui fait tourner la simulation (GDD 8.1). L'interface ne fait qu'afficher.
// Mode Classique : un tick toutes les 12,5 s ÷ vitesse. Mode Chronique : l'horloge suit l'heure réelle (0.5, 8.6).
import { P } from '../sim/data';
import { applyCommand, catchUp, createGame, SAVE_VERSION, step, type AbsenceReport } from '../sim/engine';
import { relinkRuns } from '../sim/quests';
import type { Command, DifficultyId, GameState } from '../sim/types';

export type ToWorker =
  | { type: 'new'; seed: number; mode: 'classique' | 'chronique'; difficulty: DifficultyId; pantheonNames: string[] }
  | { type: 'load'; state: GameState }
  | { type: 'command'; cmd: Command }
  | { type: 'speed'; value: number }
  | { type: 'advance'; hours: number };

export type FromWorker =
  | { type: 'state'; state: GameState; speed: number }
  | { type: 'autosave'; state: GameState }
  | { type: 'report'; report: AbsenceReport }
  | { type: 'error'; message: string };

const HOUR_MS = 3_600_000;
const CHRONICLE_CHECK_MS = 5_000;

let s: GameState | null = null;
let speed = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const publish = () => { if (s) post({ type: 'state', state: s, speed }); };

/** Tick visé par l'horloge réelle en mode Chronique. */
function chronicleTarget(st: GameState): number {
  const c = st.chronicle!;
  return c.anchorTick + Math.floor((Date.now() - c.anchorReal) / HOUR_MS);
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!s || s.gameOver) return;
  if (s.mode === 'chronique') { timer = setTimeout(chronicleTick, CHRONICLE_CHECK_MS); return; }
  if (speed <= 0) return;
  timer = setTimeout(tick, (P.temps.secondesParTickX1 * 1000) / speed);
}

function advanceOne(): void {
  if (!s) return;
  const decisions = s.world.decisions.length;
  step(s);
  // Chronique : sauvegarde à chaque heure de jeu. Classique : chaque jour à minuit (8.5).
  if (s.mode === 'chronique' || s.tick % 24 === 0) post({ type: 'autosave', state: s });
  // Classique : une fenêtre de décision met le jeu en pause (7.7.1).
  if (s.mode === 'classique' && s.world.decisions.length > decisions) speed = 0;
}

function tick(): void {
  advanceOne();
  publish();
  schedule();
}

function chronicleTick(): void {
  if (s && s.chronicle) {
    const target = chronicleTarget(s);
    let moved = false;
    while (s.tick < target && !s.gameOver) { advanceOne(); moved = true; }
    if (moved) publish();
  }
  schedule();
}

/** À l'ouverture d'une partie Chronique : rattrapage du temps écoulé, puis rapport d'absence (8.6). */
function resumeChronicle(st: GameState): void {
  if (!st.chronicle) {
    st.chronicle = { anchorReal: Date.now(), anchorTick: st.tick };
    return;
  }
  const hours = chronicleTarget(st) - st.tick;
  if (hours <= 0) return;
  const report = catchUp(st, hours);
  // Au-delà de 7 jours, la guilde est restée en sommeil : on recale l'horloge pour ne pas rattraper ce temps perdu.
  if (report.slept > 0) st.chronicle.anchorReal += report.slept * HOUR_MS;
  post({ type: 'autosave', state: st });
  post({ type: 'report', report });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'new': {
      const now = new Date();
      s = createGame({ seed: m.seed, mode: m.mode, startHour: now.getHours(), difficulty: m.difficulty, pantheonNames: m.pantheonNames });
      if (m.mode === 'chronique') {
        // L'heure en cours a commencé il y a quelques minutes : le prochain tick tombera à l'heure pile.
        const sinceHour = (now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
        s.chronicle = { anchorReal: now.getTime() - sinceHour, anchorTick: s.tick };
        post({ type: 'autosave', state: s });
      }
      speed = 1;
      break;
    }
    case 'load':
      if (m.state?.version !== SAVE_VERSION) { post({ type: 'error', message: "Sauvegarde d'une version précédente du jeu : elle ne peut plus être chargée." }); break; }
      s = m.state;
      relinkRuns(s);
      speed = s.mode === 'chronique' ? 1 : 0;
      if (s.mode === 'chronique') resumeChronicle(s);
      break;
    case 'command': {
      const err = s ? applyCommand(s, m.cmd) : null;
      if (err) post({ type: 'error', message: err });
      break;
    }
    case 'speed':
      if (s?.mode !== 'chronique') speed = m.value;   // pas de pause en mode Chronique
      break;
    case 'advance':
      if (s?.mode === 'chronique') break;
      // L'avance rapide s'arrête, comme l'horloge, dès qu'une décision attend le joueur.
      for (let i = 0; i < m.hours && s && !s.gameOver; i++) {
        const before = s.world.decisions.length;
        advanceOne();
        if (s.world.decisions.length > before) break;
      }
      break;
  }
  publish();
  schedule();
};
