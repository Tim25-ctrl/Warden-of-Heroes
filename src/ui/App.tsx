// Structure de l'application (GDD 7.3) : barre du haut, navigation, écran, journal.
import { useEffect, useRef, useState } from 'preact/hooks';
import { dayOf, money } from '../sim/format';
import type { AbsenceReport } from '../sim/engine';
import type { GameState, LogEntry } from '../sim/types';
import { NavContext, NumField, RichText, type Nav, type Screen } from './components';
import { Journal } from './Journal';
import { compatible, INCOMPATIBLE, listSaves, slotLabel, type SaveEntry } from './saves';
import { Carte } from './screens/Carte';
import { Charte } from './screens/Charte';
import { Consultation } from './screens/Consultation';
import { LivreGuilde } from './screens/LivreGuilde';
import { DIFFICULTY_NAMES, epilogue } from '../sim/legend';
import type { DifficultyId } from '../sim/types';
import { getPrefs, notifCategory, notify } from './prefs';
import { Chroniques, DecisionCard } from './screens/Chroniques';
import { Aventuriers } from './screens/Aventuriers';
import { Comptoir } from './screens/Comptoir';
import { GrandLivre } from './screens/GrandLivre';
import { Options } from './screens/Options';
import { Personnel } from './screens/Personnel';
import { Siege } from './screens/Siege';
import { Tableau } from './screens/Tableau';
import { absenceReport, closeReport, game, useGame } from './store';
import { TopBar } from './TopBar';

/** Mode consultation (7.9) : les écrans essentiels sur téléphone. */
const NAV_CONSULTATION: [Screen, string, string][] = [
  ['resume', '🏠', 'Résumé'],
  ['chroniques', '📰', 'Chroniques'],
  ['journal', '📜', 'Journal'],
  ['aventuriers', '👤', 'Aventuriers'],
  ['tableau', '📋', 'Tableau'],
  ['options', '⚙', 'Options'],
];

const NAV: [Screen, string, string][] = [
  ['siege', '🏰', 'Siège'],
  ['aventuriers', '👤', 'Aventuriers'],
  ['personnel', '🧑‍🍳', 'Personnel'],
  ['tableau', '📜', 'Tableau'],
  ['comptoir', '⚖', 'Comptoir'],
  ['chroniques', '📰', 'Chroniques'],
  ['carte', '🗺', 'Carte'],
  ['charte', '🔱', 'Charte'],
  ['guilde', '📖', 'Livre de la guilde'],
  ['livre', '📒', 'Livre de comptes'],
  ['options', '⚙', 'Options'],
];

function StartScreen() {
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [mode, setMode] = useState<'classique' | 'chronique'>('classique');
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  useEffect(() => { listSaves().then(setSaves); }, []);
  const sorted = (saves ?? []).sort((a, b) => b.savedAt - a.savedAt);
  return (
    <div class="overlay">
      <div class="modal">
        <h1>Warden of Heroes</h1>
        <p class="subtitle">Le gardien de la guilde</p>
        <p class="soft">Tu ne diriges pas les héros. Tu diriges l'endroit où ils vivent.</p>
        <p>Dix aventuriers comptent sur toi pour les loger et les nourrir. Fixe tes prix, recrute ton personnel, agrandis le siège : eux décideront du reste.</p>
        {sorted.length > 0 && (
          <div class="panel flat">
            <h3>Reprendre une partie</h3>
            {sorted.map((e) => (
              <div class="row" style={{ marginBottom: 6 }}>
                <span>{slotLabel(e)} — jour {e.day}</span>
                <span class="spacer" />
                <small>{new Date(e.savedAt).toLocaleString('fr-FR')}</small>
                {compatible(e.state) ? <button class="btn small" onClick={() => game.load(e.state)}>Reprendre</button> : <small class="hint" title={INCOMPATIBLE}>ancienne version</small>}
              </div>
            ))}
          </div>
        )}
        <div class="panel flat">
          <h3>Nouvelle partie</h3>
          <h4>Mode de jeu</h4>
          <div class="mode-choice" role="radiogroup" aria-label="Mode de jeu">
            <label><input type="radio" name="mode" aria-label="Mode Classique" checked={mode === 'classique'} onChange={() => setMode('classique')} />
              <span><strong>Classique</strong> <small class="hint">1 jour = 5 minutes, pause et vitesses x1 à x8</small></span></label>
            <label><input type="radio" name="mode" aria-label="Mode Chronique" checked={mode === 'chronique'} onChange={() => setMode('chronique')} />
              <span><strong>Chronique</strong> <small class="hint">temps réel : la guilde vit même quand le jeu est fermé (7 jours au plus)</small></span></label>
          </div>
          <h4>Difficulté</h4>
          <div class="mode-choice" role="radiogroup" aria-label="Difficulté">
            {(Object.keys(DIFFICULTY_NAMES) as DifficultyId[]).map((id) => (
              <label><input type="radio" name="difficulty" aria-label={`Difficulté ${DIFFICULTY_NAMES[id]}`} checked={difficulty === id} onChange={() => setDifficulty(id)} />
                <span><strong>{DIFFICULTY_NAMES[id]}</strong> <small class="hint">{{ paisible: '450 po, monstres plus calmes, quêtes mieux payées, 14 jours avant la faillite', normal: "l'équilibre prévu", impitoyable: '200 po, monstres prolifiques, quêtes moins payées, 4 jours avant la faillite' }[id]}</small></span></label>
            ))}
          </div>
          <div class="row">
            <label class="field">Graine du monde
              <NumField min={0} value={seed} label="Graine du monde" live onCommit={setSeed} />
            </label>
            <span class="spacer" />
            <button class="btn seal" onClick={() => game.newGame(seed, mode, difficulty)}>Prendre la tête de la guilde</button>
          </div>
          <p class="hint" style={{ marginTop: 8 }}>{mode === 'chronique'
            ? "Le mode est choisi une fois pour toutes. Un intendant t'est offert : ses consignes font tourner la guilde pendant ton absence."
            : `Version ${__APP_VERSION__}. La difficulté reste modifiable en cours de partie (Options).`}</p>
        </div>
        {saves === null && <p class="hint">Recherche des sauvegardes…</p>}
      </div>
    </div>
  );
}

function DecisionModal({ s, onLater }: { s: GameState; onLater: (id: number) => void }) {
  const d = s.world.decisions[0];
  return (
    <div class="overlay">
      <div class="modal">
        <DecisionCard s={s} d={d} />
        <div class="row"><span class="spacer" /><button class="btn ghost small" onClick={() => onLater(d.id)}>Décider plus tard (Chroniques)</button></div>
      </div>
    </div>
  );
}

function ReportModal({ r }: { r: AbsenceReport }) {
  const days = Math.floor(r.hours / 24);
  const delta = r.treasuryAfter - r.treasuryBefore;
  return (
    <div class="overlay">
      <div class="modal">
        <h2>Pendant ton absence</h2>
        <p>{days > 0 ? `${days} jour${days > 1 ? 's' : ''} et ` : ''}{r.hours % 24} heure{r.hours % 24 > 1 ? 's' : ''} se sont écoulés à la guilde.</p>
        {r.slept > 0 && <p class="alert">Au-delà de 7 jours, la guilde s'est mise en sommeil : {Math.round(r.slept / 24)} jour(s) n'ont pas été joués.</p>}
        <p>Trésorerie : {money(r.treasuryBefore)} → <strong>{money(r.treasuryAfter)}</strong> ({delta >= 0 ? '+' : ''}{money(delta)}).
          Recrues : {r.recruits} · départs : {r.departures} · morts : {r.deaths}.</p>
        <div class="report-list">
          {r.entries.length === 0 ? <p class="empty">Rien de marquant.</p>
            : r.entries.map((e) => <p class={`news ${e.lvl}`}><small>J{dayOf(e.tick)} {String(e.tick % 24).padStart(2, '0')}h</small> <RichText text={e.text} /></p>)}
        </div>
        <button class="btn seal" onClick={closeReport}>Reprendre</button>
      </div>
    </div>
  );
}

function EpilogueModal({ s, onBook }: { s: GameState; onBook: () => void }) {
  const e = epilogue(s);
  return (
    <div class="overlay">
      <div class={`modal epilogue ${e.victory ? 'victory' : 'defeat'}`}>
        <h1>{e.title}</h1>
        {s.gameOver && <p>{s.gameOver.reason}</p>}
        {e.bilan.map((l) => <p>{l}</p>)}
        <h3>Destins</h3>
        {e.destins.map((l) => <p class="news">{l}</p>)}
        <h3>La ville et ses guildes</h3>
        {e.monde.map((l) => <p class="news">{l}</p>)}
        <div class="row">
          <button class="btn ghost" onClick={onBook}>Lire le Livre de la guilde</button>
          <span class="spacer" />
          {e.victory
            ? <button class="btn seal" onClick={() => game.command({ type: 'ackEpilogue' })}>Continuer en bac à sable</button>
            : <button class="btn seal" onClick={() => location.reload()}>Recommencer</button>}
        </div>
      </div>
    </div>
  );
}

function GaspardCard({ s, go }: { s: GameState; go: (sc: Screen) => void }) {
  const a = s.gaspard?.queue[0];
  if (!a) return null;
  return (
    <aside class={`gaspard ${a.alert ? 'alert' : ''}`} aria-live="polite" aria-label="Conseil du vieux Gaspard">
      <strong>Le vieux Gaspard</strong>
      <p>« {a.text} »</p>
      <div class="row">
        <button class="btn small" onClick={() => { go(a.screen as Screen); game.command({ type: 'gaspardAck', id: a.id }); }}>Montre-moi</button>
        <button class="btn ghost small" onClick={() => game.command({ type: 'gaspardAck', id: a.id })}>Compris</button>
      </div>
    </aside>
  );
}

export function App() {
  const { s, speed } = useGame();
  const [screen, setScreen] = useState<Screen>('siege');
  const [advId, setAdvId] = useState<number | null>(null);
  const [journalOpen, setJournalOpen] = useState(() => window.innerWidth > 1100);
  const [toasts, setToasts] = useState<LogEntry[]>([]);
  const lastSeen = useRef<number>(-1);
  const [later, setLater] = useState<number[]>([]);
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const consultation = phone || getPrefs().consultation;
  useEffect(() => {
    const list = consultation ? NAV_CONSULTATION : NAV;
    if (!list.some(([id]) => id === screen)) setScreen(consultation ? 'resume' : 'siege');
  }, [consultation]);

  const nav: Nav = {
    screen, advId,
    go: (sc) => setScreen(sc),
    openAdventurer: (id) => { setAdvId(id); setScreen('aventuriers'); },
  };

  // Messages éphémères pour les faits importants (7.7.1)
  useEffect(() => {
    if (!s) return;
    if (lastSeen.current < 0) { lastSeen.current = s.journal.length ? s.journal[s.journal.length - 1].id : 0; return; }
    const fresh = s.journal.filter((e) => e.id > lastSeen.current && (e.lvl === 'critique' || e.lvl === 'important'));
    if (s.journal.length) lastSeen.current = s.journal[s.journal.length - 1].id;
    if (!fresh.length) return;
    setToasts((t) => [...t, ...fresh].slice(-3));
    for (const e of fresh) { const c = notifCategory(e.text, e.lvl); if (c) void notify(c, e.text); }
    if (fresh.some((e) => e.lvl === 'critique') && speed > 0) game.setSpeed(0);
    const ids = fresh.map((e) => e.id);
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), 6000);
  }, [s?.journal.length, s?.tick]);

  // Raccourcis clavier (7.3)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); game.setSpeed(game.speed > 0 ? 0 : 1); }
      const map: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 };
      if (map[e.code] !== undefined) game.setSpeed(map[e.code]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s) return <StartScreen />;

  const badges: Partial<Record<Screen, number>> = { aventuriers: s.doorCandidates.length, chroniques: s.world.decisions.length };
  const report = absenceReport();
  const pending = s.world.decisions.filter((d) => !later.includes(d.id));
  return (
    <NavContext.Provider value={nav}>
      <div class={`app ${journalOpen && !consultation ? '' : 'journal-closed'} ${consultation ? 'consult' : ''} ${s.gaspard?.queue.length ? 'has-gaspard' : ''}`}>
        <TopBar s={s} speed={speed} />
        <nav class="nav" aria-label="Écrans">
          {(consultation ? NAV_CONSULTATION : NAV).map(([id, ico, label]) => (
            <button class={screen === id ? 'on' : ''} aria-current={screen === id ? 'page' : undefined} onClick={() => setScreen(id)} title={label}>
              <span class="ico" aria-hidden="true">{ico}</span><span class="label">{label}</span>
              {badges[id] ? <span class="badge">{badges[id]}</span> : null}
            </button>
          ))}
        </nav>
        <main class="main">
          {screen === 'siege' && <Siege s={s} />}
          {screen === 'aventuriers' && <Aventuriers s={s} />}
          {screen === 'personnel' && <Personnel s={s} />}
          {screen === 'tableau' && <Tableau s={s} />}
          {screen === 'comptoir' && <Comptoir s={s} />}
          {screen === 'chroniques' && <Chroniques s={s} />}
          {screen === 'charte' && <Charte s={s} />}
          {screen === 'guilde' && <LivreGuilde s={s} />}
          {screen === 'resume' && <Consultation s={s} />}
          {screen === 'journal' && <div class="journal-inline"><Journal s={s} onClose={() => setScreen('resume')} /></div>}
          {screen === 'carte' && <Carte s={s} />}
          {screen === 'livre' && <GrandLivre s={s} />}
          {screen === 'options' && <Options s={s} />}
        </main>
        {consultation ? null : journalOpen
          ? <Journal s={s} onClose={() => setJournalOpen(false)} />
          : <button class="collapsed-journal journal" onClick={() => setJournalOpen(true)} title="Ouvrir le journal">Journal «</button>}
      </div>
      <div class="toasts" aria-live="polite">
        {toasts.map((t) => <div class={`toast ${t.lvl}`}><RichText text={t.text} /></div>)}
      </div>
      {report && <ReportModal r={report} />}
      {!report && pending.length > 0 && !s.gameOver && <DecisionModal s={{ ...s, world: { ...s.world, decisions: pending } }} onLater={(id) => setLater([...later, id])} />}
      <GaspardCard s={s} go={setScreen} />
      {((s.gameOver && !s.legend?.defeatSeen) || (s.legend?.victoryTick != null && !s.legend.epilogueSeen)) && !report
        && <EpilogueModal s={s} onBook={() => { setScreen('guilde'); if (!s.gameOver) game.command({ type: 'ackEpilogue' }); }} />}
    </NavContext.Provider>
  );
}
