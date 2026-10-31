// Structure de l'application (GDD 7.3) : barre du haut, navigation, écran, journal.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  IconBook, IconBuildingCastle, IconCertificate, IconChefHat, IconClipboardList, IconDots, IconHome, IconMap2, IconNews, IconNotebook,
  IconReportMoney, IconScale, IconSettings, IconUsers,
} from '@tabler/icons-preact';
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
import { DIFFICULTY_NAMES, epilogue, PRESETS, type PresetId } from '../sim/legend';
import { SCENARIO_IDS, SCENARIOS } from '../sim/scenarios';
import type { DifficultyId, DifficultyValues, ScenarioId } from '../sim/types';
import { DifficultyEditor, presetValues } from './DifficultyEditor';
import { getPrefs, notifCategory, notify } from './prefs';
import { alertsActive, firstLaunchAlerts } from './alerts';
import { AlertWarning } from './AlertWarning';
import { AccountPanel, ConflictList } from './AccountPanel';
import { getConflicts, onCloudChange, reconcile, session } from './cloud';
import { autoSlot, getSlot } from './saves';
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

type NavIcon = typeof IconHome;
/** Mode consultation (7.9) : les écrans essentiels sur téléphone. */
const NAV_CONSULTATION: [Screen, NavIcon, string, string?][] = [
  ['resume', IconHome, 'Résumé'],
  ['chroniques', IconNews, 'Chroniques'],
  ['journal', IconNotebook, 'Journal'],
  ['aventuriers', IconUsers, 'Aventuriers'],
  ['tableau', IconClipboardList, 'Tableau'],
  ['options', IconSettings, 'Options'],
];

/** Menu en trois groupes (v1.1, D-159) : ta guilde, le monde, les registres ; les options à part. */
const NAV: [Screen, NavIcon, string, string?][] = [
  ['siege', IconBuildingCastle, 'La Guilde', 'Ta guilde'],
  ['aventuriers', IconUsers, 'Aventuriers'],
  ['personnel', IconChefHat, 'Personnel'],
  ['comptoir', IconScale, 'Comptoir'],
  ['tableau', IconClipboardList, 'Tableau', 'Le monde'],
  ['carte', IconMap2, 'Carte'],
  ['chroniques', IconNews, 'Chroniques'],
  ['livre', IconReportMoney, 'Livre de comptes', 'Les registres'],
  ['charte', IconCertificate, 'Charte'],
  ['guilde', IconBook, 'Livre de la guilde'],
  ['options', IconSettings, 'Options', '—'],
];

/**
 * Téléphone (v1.1, D-167) : tout le jeu, avec une barre d'onglets en bas (Résumé, La Guilde, Aventuriers, Tableau)
 * et un menu « Plus » pour le reste, rangé dans les mêmes groupes que sur ordinateur.
 */
const PHONE_NAV: [Screen, NavIcon, string, string?][] = [
  ['resume', IconHome, 'Résumé', 'Accueil'],
  ...NAV.slice(0, 4),
  ['tableau', IconClipboardList, 'Tableau', 'Le monde'],
  ['chroniques', IconNews, 'Chroniques'],
  ['carte', IconMap2, 'Carte'],
  ['journal', IconNotebook, 'Journal'],
  ...NAV.slice(7),
];
const PHONE_TABS: Screen[] = ['resume', 'siege', 'aventuriers', 'tableau'];
const SHORT: Partial<Record<Screen, string>> = { siege: 'Guilde', aventuriers: 'Aventuriers' };

/** Replie en cartes les tableaux de 5 colonnes et plus, ou qui débordent de leur cadre (téléphone). */
function foldTables(): void {
  const room = (document.querySelector('.main')?.clientWidth ?? 9999) - 30;
  for (const t of document.querySelectorAll<HTMLTableElement>('.main table.data')) {
    const heads = [...(t.tHead?.rows[0]?.cells ?? [])].map((c) => c.textContent?.replace(/\?$/, '').trim() ?? '');
    if (heads.length < 5 && !t.classList.contains('fold') && t.getBoundingClientRect().width <= room) continue;
    t.classList.add('fold');
    for (const row of t.tBodies[0]?.rows ?? []) [...row.cells].forEach((c, i) => { if (c.dataset.label !== heads[i]) c.dataset.label = heads[i] ?? ''; });
  }
}

function StartScreen() {
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [mode, setMode] = useState<'classique' | 'chronique'>('classique');
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [custom, setCustom] = useState<DifficultyValues>(() => presetValues('normal'));
  const [scenario, setScenario] = useState<ScenarioId>('standard');
  // Connecté : on remet d'accord cet appareil et le compte avant d'afficher les parties (D-173).
  const relist = () => listSaves().then(setSaves);
  useEffect(() => { void (session() ? reconcile() : Promise.resolve()).then(relist); }, []);
  const pickPreset = (id: PresetId) => { setDifficulty(id); setCustom(presetValues(id)); };
  const sorted = (saves ?? []).sort((a, b) => b.savedAt - a.savedAt);
  return (
    <div class="overlay">
      <div class="modal">
        <h1>Warden of Heroes</h1>
        <p class="subtitle">Le gardien de la guilde</p>
        <p class="soft">Tu ne diriges pas les héros. Tu diriges l'endroit où ils vivent.</p>
        <p>Dix aventuriers comptent sur toi pour les loger et les nourrir. Fixe tes prix, recrute ton personnel, agrandis le siège : eux décideront du reste.</p>
        <AccountPanel onSynced={relist} onResolved={relist} />
        {sorted.length > 0 && (
          <div class="panel flat">
            <h3>Reprendre une partie</h3>
            {sorted.map((e) => (
              <div class="row" style={{ marginBottom: 6 }}>
                <span>{slotLabel(e)} — jour {e.day}</span>
                <span class="spacer" />
                <small>{new Date(e.savedAt).toLocaleString('fr-FR')}</small>
                {compatible(e.state) ? <button class="btn small" onClick={() => { firstLaunchAlerts(game.syncForecast); game.load(e.state); }}>Reprendre</button> : <small class="hint" title={INCOMPATIBLE}>ancienne version</small>}
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
          {mode === 'chronique' && <AlertWarning />}
          <h4>Scénario</h4>
          <div class="mode-choice" role="radiogroup" aria-label="Scénario">
            {SCENARIO_IDS.map((id) => (
              <label><input type="radio" name="scenario" aria-label={`Scénario ${SCENARIOS[id].nom}`} checked={scenario === id} onChange={() => setScenario(id)} />
                <span><strong>{SCENARIOS[id].nom}</strong> <small class="hint">{SCENARIOS[id].resume}</small></span></label>
            ))}
          </div>
          <h4>Difficulté</h4>
          <div class="mode-choice" role="radiogroup" aria-label="Difficulté">
            {PRESETS.map((id) => (
              <label><input type="radio" name="difficulty" aria-label={`Difficulté ${DIFFICULTY_NAMES[id]}`} checked={difficulty === id} onChange={() => pickPreset(id)} />
                <span><strong>{DIFFICULTY_NAMES[id]}</strong> <small class="hint">{{ paisible: '450 po, monstres plus calmes, quêtes mieux payées, 14 jours avant la faillite', normal: "l'équilibre prévu", impitoyable: '200 po, monstres prolifiques, quêtes moins payées, 4 jours avant la faillite' }[id]}</small></span></label>
            ))}
            <label><input type="radio" name="difficulty" aria-label="Difficulté personnalisée" checked={difficulty === 'personnalisee'} onChange={() => setDifficulty('personnalisee')} />
              <span><strong>Personnalisée</strong> <small class="hint">pars du niveau choisi et règle chaque curseur</small></span></label>
          </div>
          {difficulty === 'personnalisee' && <DifficultyEditor values={custom} onChange={setCustom} startOnly />}
          <div class="row">
            <label class="field">Graine du monde
              <NumField min={0} value={seed} label="Graine du monde" live onCommit={setSeed} />
            </label>
            <span class="spacer" />
            <button class="btn seal" onClick={() => { firstLaunchAlerts(game.syncForecast); game.newGame(seed, mode, difficulty, { scenario, difficultyValues: difficulty === 'personnalisee' ? custom : undefined }); }}>Prendre la tête de la guilde</button>
          </div>
          <p class="hint" style={{ marginTop: 8 }}>{mode === 'chronique'
            ? "Le mode est choisi une fois pour toutes. Un intendant t'est offert : ses consignes font tourner la guilde pendant ton absence."
            : `Version ${__APP_VERSION__} du ${__BUILD_DATE__}. La difficulté reste modifiable en cours de partie (Options).`}</p>
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
        {/* « Plus tard » ferme seulement la fenêtre : la question attend dans l'écran Chroniques, dans les deux modes (v1.1). */}
        <div class="row">
          <small class="hint" style={{ flex: 1 }}>{s.mode === 'classique'
            ? "Pas pressé ? La question t'attend dans l'écran Chroniques, et le temps reste en pause tant que tu ne le relances pas."
            : "Pas pressé ? La question t'attend dans l'écran Chroniques jusqu'à son échéance."}</small>
          <button class="btn ghost small" onClick={() => onLater(d.id)}>Répondre plus tard</button>
        </div>
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
        {r.slept > 0 && (r.paused
          ? <p class="alert">Il n'y avait plus d'alerte à t'envoyer : la guilde s'est mise en pause en t'attendant. {r.slept >= 24 ? `${Math.round(r.slept / 24)} jour(s)` : `${r.slept} heure(s)`} n'ont pas été joués.</p>
          : <p class="alert">Au-delà de 7 jours, la guilde s'est mise en sommeil : {Math.round(r.slept / 24)} jour(s) n'ont pas été joués.</p>)}
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

/** Barre d'onglets du téléphone et menu « Plus ». */
function PhoneNav({ list, screen, badges, more, setMore, go }: {
  list: [Screen, NavIcon, string, string?][]; screen: Screen; badges: Partial<Record<Screen, number>>;
  more: boolean; setMore: (v: boolean) => void; go: (sc: Screen) => void;
}) {
  const tabs = list.filter(([id]) => PHONE_TABS.includes(id)).slice(0, 4);
  const rest = list.filter(([id]) => !tabs.some(([t]) => t === id));
  const restBadge = rest.reduce((n, [id]) => n + (badges[id] ?? 0), 0);
  const inRest = rest.some(([id]) => id === screen);
  // Chaque écran du menu « Plus » garde le groupe de l'ordinateur (Ta guilde, Le monde, Les registres).
  let cur = '', shown = '';
  const groupOf = new Map<Screen, string>();
  for (const [id, , , g] of list) { if (g) cur = g; groupOf.set(id, cur); }
  return (
    <>
      <nav class="tabbar" aria-label="Écrans">
        {tabs.map(([id, Ico, label]) => (
          <button class={screen === id && !more ? 'on' : ''} aria-current={screen === id ? 'page' : undefined} onClick={() => go(id)}>
            <Ico size={22} stroke={1.75} aria-hidden="true" /><span>{SHORT[id] ?? label}</span>
            {badges[id] ? <span class="badge">{badges[id]}</span> : null}
          </button>
        ))}
        <button class={more || inRest ? 'on' : ''} aria-expanded={more} onClick={() => setMore(!more)}>
          <IconDots size={22} stroke={1.75} aria-hidden="true" /><span>{inRest && !more ? list.find(([id]) => id === screen)![2] : 'Plus'}</span>
          {restBadge ? <span class="badge">{restBadge}</span> : null}
        </button>
      </nav>
      {more && (
        <div class="sheet-backdrop" onClick={() => setMore(false)}>
          <div class="sheet" role="menu" aria-label="Autres écrans" onClick={(e) => e.stopPropagation()}>
            {rest.map(([id, Ico, label]) => {
              const g = groupOf.get(id) ?? '';
              const head = g !== shown ? (shown = g) : null;
              return (
                <>
                  {head && (head === '—' ? <hr class="sheet-sep" /> : <h4 class="sheet-group">{head}</h4>)}
                  <button role="menuitem" class={screen === id ? 'on' : ''} onClick={() => go(id)}>
                    <Ico size={20} stroke={1.75} aria-hidden="true" /><span>{label}</span>
                    {badges[id] ? <span class="badge">{badges[id]}</span> : null}
                  </button>
                </>
              );
            })}
          </div>
        </div>
      )}
    </>
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
  const [update, setUpdate] = useState(false);
  // Partie jouée ailleurs pendant qu'elle est ouverte ici (D-173).
  const [, redrawCloud] = useState(0);
  useEffect(() => onCloudChange(() => redrawCloud((x) => x + 1)), []);
  const inGameConflict = getConflicts().length > 0;
  useEffect(() => {
    const on = () => setUpdate(true);
    window.addEventListener('guilde-nouvelle-version', on);
    return () => window.removeEventListener('guilde-nouvelle-version', on);
  }, []);
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Le mode consultation n'est plus imposé sur téléphone (v1.1) : c'est un choix des Options.
  const consultation = getPrefs().consultation;
  const navList = consultation ? NAV_CONSULTATION : phone ? PHONE_NAV : NAV;
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!navList.some(([id]) => id === screen)) setScreen(consultation || phone ? 'resume' : 'siege');
  }, [consultation, phone]);
  useEffect(() => { if (phone) setScreen('resume'); }, []);
  const go = (sc: Screen) => { setScreen(sc); setMore(false); };
  // Chaque écran s'ouvre en haut (et la fiche d'un aventurier aussi).
  useEffect(() => { document.querySelector('.main')?.scrollTo(0, 0); }, [screen, advId]);

  const nav: Nav = {
    screen, advId,
    go: (sc) => go(sc),
    openAdventurer: (id) => { setAdvId(id); go('aventuriers'); },
    closeAdventurer: () => { setAdvId(null); document.querySelector('.main')?.scrollTo(0, 0); },
  };

  // Téléphone (v1.1) : les tableaux larges se replient en cartes ; chaque case reçoit le titre de sa colonne.
  // On surveille l'écran entier, car un onglet qui change à l'intérieur d'une salle ne redessine pas l'application.
  useEffect(() => {
    if (!phone) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => { timer = null; foldTables(); };
    const obs = new MutationObserver(() => { if (!timer) timer = setTimeout(run, 0); });
    const main = document.querySelector('.main');
    if (main) obs.observe(main, { childList: true, subtree: true });
    run();
    return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
  }, [phone, !!s]);

  // Messages éphémères pour les faits importants (7.7.1)
  useEffect(() => {
    if (!s) return;
    if (lastSeen.current < 0) { lastSeen.current = s.journal.length ? s.journal[s.journal.length - 1].id : 0; return; }
    const fresh = s.journal.filter((e) => e.id > lastSeen.current && (e.lvl === 'critique' || e.lvl === 'important'));
    if (s.journal.length) lastSeen.current = s.journal[s.journal.length - 1].id;
    if (!fresh.length) return;
    setToasts((t) => [...t, ...fresh].slice(-3));
    // En Chronique avec les alertes du jeu fermé, les faits ont déjà été programmés à la fermeture : pas de doublon local.
    if (!(s.mode === 'chronique' && alertsActive())) for (const e of fresh) { const c = notifCategory(e.text, e.lvl); if (c) void notify(c, e.text); }
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
      <div class={`app ${journalOpen && !consultation && !phone ? '' : 'journal-closed'} ${consultation ? 'consult' : ''} ${phone ? 'phone' : ''} ${s.gaspard?.queue.length ? 'has-gaspard' : ''}`}>
        <TopBar s={s} speed={speed} />
        {phone ? <PhoneNav list={navList} screen={screen} badges={badges} more={more} setMore={setMore} go={go} /> : <nav class="nav" aria-label="Écrans">
          {navList.map(([id, Ico, label, group]) => (
            <>
              {group && (group === '—' ? <span class="nav-sep" aria-hidden="true" /> : <span class="nav-group">{group}</span>)}
              <button class={screen === id ? 'on' : ''} aria-current={screen === id ? 'page' : undefined} onClick={() => setScreen(id)} title={label}>
                <Ico size={20} stroke={1.75} class="ico" aria-hidden="true" /><span class="label">{label}</span>
                {badges[id] ? <span class="badge">{badges[id]}</span> : null}
              </button>
            </>
          ))}
        </nav>}
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
        {consultation || phone ? null : journalOpen
          ? <Journal s={s} onClose={() => setJournalOpen(false)} />
          : <button class="collapsed-journal journal" onClick={() => setJournalOpen(true)} title="Ouvrir le journal">Journal «</button>}
      </div>
      <div class="toasts" aria-live="polite">
        {toasts.map((t) => <div class={`toast ${t.lvl}`}><RichText text={t.text} /></div>)}
      </div>
      {report && <ReportModal r={report} />}
      {!report && pending.length > 0 && !s.gameOver && <DecisionModal s={{ ...s, world: { ...s.world, decisions: pending } }} onLater={(id) => setLater([...later, id])} />}
      <GaspardCard s={s} go={go} />
      {inGameConflict && (
        <div class="update-banner conflict-banner" role="alert">
          <ConflictList onResolved={async (slot, keep) => {
            // On garde la version en ligne de la partie en cours : on la recharge.
            if (keep === 'cloud' && slot === autoSlot(s)) { const e = await getSlot(slot); if (e) game.load(e.state); }
          }} />
        </div>
      )}
      {update && (
        <div class="update-banner" role="status">
          Une nouvelle version du jeu est disponible.
          <button class="btn small seal" onClick={async () => { await game.saveNow(); location.reload(); }}>Sauvegarder et mettre à jour</button>
          <button class="btn ghost small" onClick={() => setUpdate(false)}>Plus tard</button>
        </div>
      )}
      {((s.gameOver && !s.legend?.defeatSeen) || (s.legend?.victoryTick != null && !s.legend.epilogueSeen)) && !report
        && <EpilogueModal s={s} onBook={() => { setScreen('guilde'); if (!s.gameOver) game.command({ type: 'ackEpilogue' }); }} />}
    </NavContext.Provider>
  );
}
