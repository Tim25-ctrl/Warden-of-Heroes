// Options (GDD 7.5.11) : sauvegardes, export, thème, mode développeur.
import { useEffect, useState } from 'preact/hooks';
import { dayOf } from '../../sim/format';
import type { GameState } from '../../sim/types';
import { autoSlot, compatible, exportFile, importFile, INCOMPATIBLE, listSaves, saveSlot, type SaveEntry, type Slot } from '../saves';
import { DIFFICULTY_NAMES } from '../../sim/legend';
import type { DifficultyId } from '../../sim/types';
import { askNotificationPermission, getPrefs, NOTIF_LABELS, setPrefs, type NotifCat } from '../prefs';
import { game } from '../store';

export function Options({ s }: { s: GameState }) {
  const [saves, setSaves] = useState<SaveEntry[]>([]);
  const [msg, setMsg] = useState('');
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') ?? 'auto'; } catch { return 'auto'; } });
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => { refresh(); }, []);

  const applyTheme = (t: string) => {
    setTheme(t);
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch { /* stockage indisponible */ }
  };
  const save = async (slot: Slot) => { await saveSlot(slot, s); setMsg(`Partie sauvegardée (emplacement ${slot}).`); refresh(); };
  const bySlot = (slot: Slot) => saves.find((e) => e.slot === slot);
  const [prefs, setP] = useState(getPrefs());
  const upd = (p: Parameters<typeof setPrefs>[0]) => { setPrefs(p); setP(getPrefs()); };
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'indisponible'));

  return (
    <div>
      <div class="screen-head"><h2>Options</h2></div>
      <div class="grid2">
        <div class="panel">
          <h3>Sauvegardes</h3>
          <p class="hint">Sauvegarde automatique chaque jour à minuit. Les sauvegardes restent dans ce navigateur : exporte un fichier pour changer d'appareil.</p>
          {(['1', '2', '3'] as Slot[]).map((slot) => {
            const e = bySlot(slot);
            return (
              <div class="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <strong>Emplacement {slot}</strong>
                <small>{e ? `jour ${e.day} · ${new Date(e.savedAt).toLocaleString('fr-FR')}` : 'vide'}</small>
                <span class="spacer" />
                <button class="btn small" onClick={() => save(slot)}>Sauvegarder ici</button>
                <button class="btn ghost small" disabled={!e || !compatible(e.state)} title={e && !compatible(e.state) ? INCOMPATIBLE : ''} onClick={() => e && game.load(e.state)}>Charger</button>
              </div>
            );
          })}
          {bySlot(autoSlot(s)) && (
            <div class="row" style={{ padding: '6px 0' }}>
              <strong>Automatique</strong><small>jour {bySlot(autoSlot(s))!.day}</small><span class="spacer" />
              <button class="btn ghost small" disabled={!compatible(bySlot(autoSlot(s))!.state)} title={compatible(bySlot(autoSlot(s))!.state) ? '' : INCOMPATIBLE} onClick={() => game.load(bySlot(autoSlot(s))!.state)}>Charger</button>
            </div>
          )}
          <div class="row" style={{ marginTop: 10 }}>
            <button class="btn ghost" onClick={() => exportFile(s)}>Exporter un fichier</button>
            <label class="btn ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
              Importer un fichier
              <input type="file" accept=".guilde,application/json" style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (!f) return;
                  try { game.load(await importFile(f)); setMsg('Partie importée.'); } catch (err) { setMsg(String((err as Error).message)); }
                }} />
            </label>
          </div>
          {msg && <p class="hint" style={{ marginTop: 8 }}>{msg}</p>}
        </div>
        <div class="panel">
          <h3>Notifications</h3>
          <p class="hint">Quand le jeu est ouvert ou en arrière-plan. Installe le jeu (menu du navigateur, « Installer » ou « Ajouter à l'écran d'accueil ») pour les recevoir sur ton téléphone.</p>
          {perm !== 'granted'
            ? <button class="btn" disabled={perm === 'denied' || perm === 'indisponible'} onClick={() => askNotificationPermission().then((p) => setPerm(p))}>
                {perm === 'denied' ? 'Notifications bloquées par le navigateur' : perm === 'indisponible' ? 'Notifications indisponibles ici' : 'Activer les notifications'}</button>
            : <p class="hint">Notifications autorisées.</p>}
          {(Object.keys(NOTIF_LABELS) as NotifCat[]).map((c) => (
            <label class="row"><input type="checkbox" checked={prefs.notif[c]} onChange={() => upd({ notif: { ...prefs.notif, [c]: !prefs.notif[c] } })} />{NOTIF_LABELS[c]}</label>
          ))}
        </div>
        <div class="panel">
          <h3>Affichage</h3>
          <div class="row">
            {[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([id, label]) => (
              <button class={`btn ${theme === id ? '' : 'ghost'} small`} onClick={() => applyTheme(id)}>{label}</button>
            ))}
          </div>
          <h4 style={{ marginTop: 12 }}>Taille du texte</h4>
          <div class="row">
            {[90, 100, 115, 130].map((v) => <button class={`btn ${prefs.textSize === v ? '' : 'ghost'} small`} onClick={() => upd({ textSize: v })}>{v} %</button>)}
          </div>
          <label class="row" style={{ marginTop: 12 }}><input type="checkbox" checked={prefs.consultation} onChange={() => upd({ consultation: !prefs.consultation })} />
            Mode consultation : écrans essentiels et actions rapides seulement (activé d'office sur téléphone)</label>
          <h3 style={{ marginTop: 16 }}>Partie</h3>
          <p>Graine du monde : <strong>{s.seed}</strong> · jour {dayOf(s.tick)} · mode {s.mode === 'chronique' ? 'Chronique' : 'Classique'}</p>
          <label class="field">Difficulté
            <select value={s.difficulty.id} onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value as DifficultyId;
              if (confirm('Changer la difficulté en cours de partie désactive les hauts faits « Défis » pour cette partie. Continuer ?')) game.command({ type: 'setDifficulty', id });
            }}>{(Object.keys(DIFFICULTY_NAMES) as DifficultyId[]).map((id) => <option value={id}>{DIFFICULTY_NAMES[id]}</option>)}</select>
          </label>
          {s.difficulty.changed && <p class="hint">Difficulté modifiée en cours de partie : les Défis sont désactivés.</p>}
          <label class="field" style={{ marginTop: 8 }}>Conseils du vieux Gaspard
            <select value={s.gaspard.mode} onChange={(e) => game.command({ type: 'setGaspard', mode: (e.target as HTMLSelectElement).value as 'frequent' | 'alertes' | 'off' })}>
              <option value="frequent">Conseils fréquents</option><option value="alertes">Seulement les alertes</option><option value="off">Désactivé</option>
            </select>
          </label>
          <p class="hint">Raccourcis : Espace = pause, 1 à 4 = vitesses.</p>
          <button class="btn ghost" onClick={() => { if (confirm('Abandonner cette partie et en commencer une nouvelle ?')) location.reload(); }}>Nouvelle partie</button>
          <details style={{ marginTop: 16 }}>
            <summary class="hint">Mode développeur</summary>
            <div class="row" style={{ marginTop: 8 }}>
              <button class="btn ghost small" onClick={() => game.advance(1)}>+1 heure</button>
              <button class="btn ghost small" onClick={() => game.advance(24)}>+1 jour</button>
              <button class="btn ghost small" onClick={() => game.advance(24 * 7)}>+7 jours</button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
