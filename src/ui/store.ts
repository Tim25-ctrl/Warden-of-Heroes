// Lien entre l'interface et la tâche de fond de simulation.
import { useEffect, useReducer } from 'preact/hooks';
import type { Command, GameState } from '../sim/types';
import type { FromWorker, ToWorker } from '../worker/sim.worker';
import type { AbsenceReport } from '../sim/engine';
import { autoSlot, loadMeta, saveSlot, syncMeta, type Meta } from './saves';
import type { DifficultyId } from '../sim/types';

const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });

let state: GameState | null = null;
let speed = 0;
let errorMsg: { text: string; at: number } | null = null;
let report: AbsenceReport | null = null;
let meta: Meta | null = null;
let metaMark = '';
void loadMeta().then((m) => { meta = m; emit(); });
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type === 'state') {
    state = m.state;
    speed = m.speed;
    // Hauts faits et héros gagnés : on les reporte dans la méta-progression (6.3, 6.7)
    const mark = state.legend ? `${Object.keys(state.legend.achievements).length}:${state.legend.legends.map((l) => l.level).join(',')}` : '';
    if (mark && mark !== metaMark) { metaMark = mark; void syncMeta(state).then((x) => { meta = x; emit(); }); }
    emit();
  } else if (m.type === 'error') {
    errorMsg = { text: m.message, at: Date.now() };
    emit();
  } else if (m.type === 'autosave') {
    void saveSlot(autoSlot(m.state), m.state);
  } else if (m.type === 'report') {
    report = m.report;
    emit();
  }
};

const send = (m: ToWorker) => worker.postMessage(m);

// Mode Chronique : on sauvegarde dès que la page passe en arrière-plan (8.5).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state && state.mode === 'chronique') void saveSlot(autoSlot(state), state);
});

/** Méta-progression (hauts faits de toutes les parties, Panthéon). */
export function getMeta(): Meta | null { return meta; }
export function setMeta(m: Meta): void { meta = m; emit(); }

/** Rapport d'absence du mode Chronique, jusqu'à ce que le joueur le ferme. */
export function absenceReport(): AbsenceReport | null { return report; }
export function closeReport(): void { report = null; emit(); }

/** Dernier message d'erreur d'une commande, pendant 8 secondes. */
export function lastError(): string | null {
  return errorMsg && Date.now() - errorMsg.at < 8000 ? errorMsg.text : null;
}

export const game = {
  newGame: (seed: number, mode: 'classique' | 'chronique' = 'classique', difficulty: DifficultyId = 'normal') =>
    send({ type: 'new', seed, mode, difficulty, pantheonNames: (meta?.pantheon ?? []).map((e) => e.name) }),
  load: (s: GameState) => send({ type: 'load', state: s }),
  command: (cmd: Command) => { errorMsg = null; send({ type: 'command', cmd }); },
  setSpeed: (value: number) => send({ type: 'speed', value }),
  advance: (hours: number) => send({ type: 'advance', hours }),
  get state() { return state; },
  get speed() { return speed; },
};

/** Abonne un composant à l'état de la partie. */
export function useGame(): { s: GameState | null; speed: number } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const l = () => force(0);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { s: state, speed };
}

// Outil de développement : avancer le temps depuis la console (window.__guilde.advance(24 * 7)).
if (import.meta.env.DEV) (window as unknown as { __guilde: typeof game }).__guilde = game;
