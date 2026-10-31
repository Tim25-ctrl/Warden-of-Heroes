// Tâche de fond qui fait tourner la simulation (GDD 8.1). L'interface ne fait qu'afficher.
// Mode Classique : un tick toutes les 12,5 s ÷ vitesse. Mode Chronique : l'horloge suit l'heure réelle (0.5, 8.6).
import { P } from '../sim/data';
import { applyCommand, catchUp, createGame, migrateSave, MIN_SAVE_VERSION, SAVE_VERSION, step, type AbsenceReport } from '../sim/engine';
import { relinkRuns } from '../sim/quests';
import type { Command, DifficultyId, DifficultyValues, GameState, ScenarioId } from '../sim/types';

export type ToWorker =
  | { type: 'new'; seed: number; mode: 'classique' | 'chronique'; difficulty: DifficultyId; pantheonNames: string[]; difficultyValues?: DifficultyValues; scenario?: ScenarioId }
  | { type: 'load'; state: GameState }
  | { type: 'command'; cmd: Command }
  | { type: 'speed'; value: number }
  | { type: 'advance'; hours: number }
  | { type: 'forecast'; hours: number }
  | { type: 'away'; pauseTick: number | null }
  | { type: 'back' };

export type FromWorker =
  | { type: 'state'; state: GameState; speed: number }
  | { type: 'autosave'; state: GameState }
  | { type: 'report'; report: AbsenceReport }
  | { type: 'error'; message: string }
  | { type: 'forecast'; items: ForecastItem[]; base: number; baseAt: number; hours: number };

/** Un fait à venir de la pré-simulation (7.7.2) : son heure réelle prévue et son texte. */
export interface ForecastItem { at: number; tick: number; lvl: string; text: string }

const HOUR_MS = 3_600_000;
const CHRONICLE_CHECK_MS = 5_000;

let s: GameState | null = null;
let speed = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Pré-simulation des 48 h à venir (mode Chronique, notifications avec le jeu fermé), recalculée après chaque changement. */
let forecastHours = 0;        // 0 : pas d'alertes avec le jeu fermé, pas de pré-simulation
let forecastTimer: ReturnType<typeof setTimeout> | null = null;
let forecastMark = '';

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const publish = () => { if (s) post({ type: 'state', state: s, speed }); planForecast(); };

/** Recalcule la pré-simulation peu après le dernier changement (commande ou heure qui passe). */
function planForecast(): void {
  if (!forecastHours || !s || s.mode !== 'chronique' || !s.chronicle || s.gameOver) return;
  const mark = `${s.tick}:${s.journal.length ? s.journal[s.journal.length - 1].id : 0}:${s.nextId}`;
  if (mark === forecastMark) return;
  forecastMark = mark;
  if (forecastTimer) clearTimeout(forecastTimer);
  forecastTimer = setTimeout(runForecast, 1500);
}

/**
 * Le monde est déterministe tant que le joueur n'agit pas : on joue les 48 prochaines heures sur une copie
 * et on relève les faits importants et critiques, avec leur heure réelle (8.7).
 */
function runForecast(): void {
  forecastTimer = null;
  if (!s || !s.chronicle) return;
  const c = structuredClone(s);
  relinkRuns(c);
  const last = c.journal.length ? c.journal[c.journal.length - 1].id : 0;
  for (let i = 0; i < forecastHours && !c.gameOver; i++) step(c);
  const ch = s.chronicle;
  const items = c.journal
    .filter((e) => e.id > last && (e.lvl === 'critique' || e.lvl === 'important'))
    .map((e) => ({ at: ch.anchorReal + (e.tick - ch.anchorTick) * HOUR_MS, tick: e.tick, lvl: e.lvl, text: e.text }));
  post({ type: 'forecast', items, base: s.tick, baseAt: ch.anchorReal + (s.tick - ch.anchorTick) * HOUR_MS, hours: forecastHours });
}

/** Tick visé par l'horloge réelle en mode Chronique. */
function chronicleTarget(st: GameState): number {
  const c = st.chronicle!;
  return c.anchorTick + Math.floor((Date.now() - c.anchorReal) / HOUR_MS);
}

/** Tick visé, sans dépasser la pause programmée quand le joueur est parti (D-169). */
function chronicleLimit(st: GameState): number {
  const t = chronicleTarget(st);
  const p = st.chronicle?.pauseTick;
  return p !== undefined ? Math.min(t, Math.max(p, st.tick)) : t;
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
    const target = chronicleLimit(s);
    let moved = false;
    while (s.tick < target && !s.gameOver) { advanceOne(); moved = true; }
    if (moved) publish();
  }
  schedule();
}

/** À l'ouverture d'une partie Chronique : rattrapage du temps écoulé, puis rapport d'absence (8.6). */
function resumeChronicle(st: GameState, quiet = false): void {
  if (!st.chronicle) {
    st.chronicle = { anchorReal: Date.now(), anchorTick: st.tick };
    return;
  }
  const hours = chronicleTarget(st) - st.tick;
  // Pause programmée à la fermeture (plus d'alerte possible) : on ne joue pas au-delà (D-169).
  const pause = st.chronicle.pauseTick;
  st.chronicle.pauseTick = undefined;
  const cap = pause !== undefined ? Math.max(0, pause - st.tick) : undefined;
  if (hours <= 0) return;
  const report = catchUp(st, hours, cap);
  // Au-delà de 7 jours, ou après la pause, la guilde est restée en sommeil : on recale l'horloge pour ne pas rattraper ce temps perdu.
  if (report.slept > 0) st.chronicle.anchorReal += report.slept * HOUR_MS;
  post({ type: 'autosave', state: st });
  // Retour dans un onglet resté ouvert : on ne montre le rapport que si la guilde s'est arrêtée.
  if (quiet ? report.slept > 0 : report.hours > 0 || report.slept > 0) post({ type: 'report', report });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'new': {
      const now = new Date();
      s = createGame({ seed: m.seed, mode: m.mode, startHour: now.getHours(), difficulty: m.difficulty, pantheonNames: m.pantheonNames, difficultyValues: m.difficultyValues, scenario: m.scenario });
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
      if (!m.state || m.state.version < MIN_SAVE_VERSION || m.state.version > SAVE_VERSION) { post({ type: 'error', message: "Sauvegarde d'une version trop ancienne du jeu : elle ne peut plus être chargée." }); break; }
      s = migrateSave(m.state);
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
    case 'forecast':
      forecastHours = m.hours;
      forecastMark = '';
      break;
    case 'away':
      // Le joueur s'en va : la guilde s'arrêtera à l'heure de la dernière alerte possible (D-169).
      if (s?.chronicle) { s.chronicle.pauseTick = m.pauseTick ?? undefined; post({ type: 'autosave', state: s }); }
      break;
    case 'back':
      if (s?.chronicle && s.chronicle.pauseTick !== undefined) resumeChronicle(s, true);
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
