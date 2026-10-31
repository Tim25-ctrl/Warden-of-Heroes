// Compte joueur (v1.1, D-173) : connexion, création, mot de passe oublié, état de la synchronisation et conflits.
// Sur l'écran d'accueil et dans les Options.
import { IconCloud, IconCloudOff } from '@tabler/icons-preact';
import { useEffect, useState } from 'preact/hooks';
import {
  cloudReady, confirmReset, getConflicts, login, logout, onCloudChange, passwordProblem, register, requestReset, session,
  syncStatus, resolveConflict,
} from './cloud';
import type { Slot } from './saves';

type Mode = 'login' | 'register' | 'forgot' | 'code';

function useCloud(): void {
  const [, redraw] = useState(0);
  useEffect(() => onCloudChange(() => redraw((x) => x + 1)), []);
}

const when = (t: number) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Les parties qui ont avancé sur deux appareils : le joueur choisit laquelle garder. */
export function ConflictList({ onResolved }: { onResolved?: (slot: Slot, keep: 'local' | 'cloud') => void }) {
  useCloud();
  const list = getConflicts();
  if (!list.length) return null;
  return (
    <div class="conflicts">
      {list.map((c) => (
        <div class="conflict">
          <p><b>{c.cloud.label || `Emplacement ${c.slot}`}</b> a avancé sur deux appareils. Laquelle garder ? L'autre sera remplacée.</p>
          <div class="row">
            <button class="btn small" onClick={async () => { await resolveConflict(c.slot, 'local'); onResolved?.(c.slot, 'local'); }}>
              Celle de cet appareil (jour {c.local.day}, {when(c.local.savedAt)})</button>
            <button class="btn small" onClick={async () => { await resolveConflict(c.slot, 'cloud'); onResolved?.(c.slot, 'cloud'); }}>
              Celle en ligne (jour {c.cloud.day}, {when(c.cloud.savedAt)})</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccountPanel({ onSynced, onResolved }: { onSynced?: () => void; onResolved?: (slot: Slot, keep: 'local' | 'cloud') => void }) {
  useCloud();
  const [mode, setMode] = useState<Mode | null>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!cloudReady()) return null;
  const s = session();
  const st = syncStatus();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg('');
    try { await fn(); setMode(null); setPw(''); setPw2(''); setCode(''); onSynced?.(); } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const submit = (e: Event) => {
    e.preventDefault();
    if (mode === 'login') void run(() => login(email, pw));
    else if (mode === 'register') {
      const p = passwordProblem(pw) ?? (pw !== pw2 ? 'Les deux mots de passe ne sont pas identiques.' : null);
      if (p) { setMsg(p); return; }
      void run(() => register(email, pw));
    } else if (mode === 'forgot') {
      setBusy(true); setMsg('');
      requestReset(email)
        .then(() => { setMode('code'); setMsg(`Si un compte existe pour ${email}, un code vient d'y être envoyé (pense aux indésirables).`); })
        .catch((err: Error) => setMsg(err.message))
        .finally(() => setBusy(false));
    } else if (mode === 'code') {
      const p = passwordProblem(pw);
      if (p) { setMsg(p); return; }
      void run(() => confirmReset(email, code, pw));
    }
  };

  if (s) {
    return (
      <div class="panel flat account">
        <h3><IconCloud size={20} stroke={1.75} aria-hidden="true" /> Compte</h3>
        <p>Connecté : <b>{s.email}</b>. Tes parties te suivent sur tous tes appareils.</p>
        {st.text && <p class={`hint ${st.error ? 'bad' : ''}`}>{st.text}</p>}
        <ConflictList onResolved={onResolved} />
        <button class="btn ghost small" onClick={logout}>Se déconnecter</button>
      </div>
    );
  }

  return (
    <div class="panel flat account">
      <h3><IconCloudOff size={20} stroke={1.75} aria-hidden="true" /> Compte <small class="hint">facultatif</small></h3>
      {!mode && (
        <>
          <p class="soft">Avec un compte, une partie commencée sur ton téléphone se retrouve sur ton ordinateur, et inversement.</p>
          <div class="row">
            <button class="btn small" onClick={() => { setMode('login'); setMsg(''); }}>Se connecter</button>
            <button class="btn ghost small" onClick={() => { setMode('register'); setMsg(''); }}>Créer un compte</button>
          </div>
        </>
      )}
      {mode && (
        <form class="account-form" onSubmit={submit}>
          <h4>{{ login: 'Se connecter', register: 'Créer un compte', forgot: 'Mot de passe oublié', code: 'Nouveau mot de passe' }[mode]}</h4>
          <label class="field">E-mail
            <input type="email" autocomplete="email" required value={email} disabled={mode === 'code'} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
          </label>
          {mode === 'code' && (
            <label class="field">Code reçu par e-mail
              <input inputMode="numeric" autocomplete="one-time-code" maxLength={6} required value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label class="field">{mode === 'code' ? 'Nouveau mot de passe' : 'Mot de passe'}
              <input type="password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8}
                value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
            </label>
          )}
          {mode === 'register' && (
            <label class="field">Mot de passe, encore une fois
              <input type="password" autocomplete="new-password" required value={pw2} onInput={(e) => setPw2((e.target as HTMLInputElement).value)} />
            </label>
          )}
          {mode === 'register' && <p class="hint">8 caractères au moins. Il ne quitte jamais ton appareil : le service n'en reçoit qu'une empreinte.</p>}
          <div class="row">
            <button class="btn seal small" type="submit" disabled={busy}>{busy ? 'Un instant…' : { login: 'Se connecter', register: 'Créer le compte', forgot: 'Recevoir un code', code: 'Changer le mot de passe' }[mode]}</button>
            <button class="btn ghost small" type="button" onClick={() => { setMode(null); setMsg(''); }}>Annuler</button>
            <span class="spacer" />
            {mode === 'login' && <button class="link" type="button" onClick={() => { setMode('forgot'); setMsg(''); }}>Mot de passe oublié ?</button>}
            {mode === 'register' && <button class="link" type="button" onClick={() => { setMode('login'); setMsg(''); }}>J'ai déjà un compte</button>}
          </div>
          {msg && <p class="hint"><b>{msg}</b></p>}
        </form>
      )}
    </div>
  );
}
