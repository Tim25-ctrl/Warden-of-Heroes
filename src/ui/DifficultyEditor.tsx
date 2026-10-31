// Difficulté personnalisée (GDD 6.5, v1.1, D-164) : les huit curseurs, au lancement et dans les Options.
import { atLeastAsHard, DIFF_SETTINGS, PROG } from '../sim/legend';
import type { DifficultyValues } from '../sim/types';
import { Help } from './components';

export function DifficultyEditor({ values, onChange, startOnly }: {
  values: DifficultyValues; onChange: (v: DifficultyValues) => void; startOnly?: boolean;
}) {
  const hard = atLeastAsHard(values, PROG.difficultes.impitoyable);
  return (
    <div class="diff-editor">
      {DIFF_SETTINGS.map(({ key, label, min, max, step, fmt, help }) => {
        const locked = key === 'tresorerie' && startOnly === false;
        return (
          <div class={`diff-row ${locked ? 'locked' : ''}`}>
            <span class="diff-label">{label} <Help text={locked ? `${help} Déjà dépensée : on ne la change plus en cours de partie.` : help} /></span>
            <input type="range" min={min} max={max} step={step} value={values[key]} disabled={locked} aria-label={label}
              onInput={(e) => onChange({ ...values, [key]: Number((e.target as HTMLInputElement).value) })} />
            <b class="diff-val">{fmt(values[key])}</b>
          </div>
        );
      })}
      <p class="hint">{hard
        ? 'Tout est au moins aussi dur qu\'Impitoyable : les hauts faits « Défis » restent possibles.'
        : 'Une difficulté personnalisée plus douce qu\'Impitoyable désactive les hauts faits « Défis ».'}</p>
    </div>
  );
}

/** Les réglages d'un niveau prédéfini, pour partir de lui. */
export function presetValues(id: 'paisible' | 'normal' | 'impitoyable'): DifficultyValues {
  const d = PROG.difficultes[id];
  return { tresorerie: d.tresorerie, mort: d.mort, croissance: d.croissance, recompenses: d.recompenses, tolerance: d.tolerance, faillite: d.faillite, crises: d.crises, rumeurs: d.rumeurs };
}
