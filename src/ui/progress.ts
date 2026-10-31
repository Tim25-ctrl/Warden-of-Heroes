// Méta-progression (hauts faits, Panthéon) : fusion de deux versions, pour la synchroniser entre appareils (D-174).
// Rien ne se perd : les hauts faits s'additionnent (on garde la date la plus ancienne), les héros aussi (on garde
// la fiche la plus avancée). Un héros retiré du Panthéon sur un appareil laisse une trace (removed) qui le retire
// partout, et qui empêche la partie en cours de l'y remettre.

export interface PantheonEntry {
  key: string; name: string; classe: string; level: number; reason: string; guild: string; date: number; chosen?: boolean;
}
export interface Meta {
  key: 'meta';
  achievements: Record<string, { date: number; game: string }>;
  pantheon: PantheonEntry[];
  removed?: string[];          // clés des héros retirés du Panthéon
}
export const PANTHEON_MAX = 50;
const REMOVED_MAX = 1000;

export const emptyMeta = (): Meta => ({ key: 'meta', achievements: {}, pantheon: [], removed: [] });

/** Réunit deux versions de la méta-progression. Le résultat est trié : deux fusions égales s'écrivent pareil. */
export function mergeMeta(a: Meta, b: Meta): Meta {
  const achievements: Meta['achievements'] = {};
  for (const src of [a.achievements ?? {}, b.achievements ?? {}]) {
    for (const [id, v] of Object.entries(src)) {
      const cur = achievements[id];
      if (!cur || v.date < cur.date) achievements[id] = v;
    }
  }
  const removed = [...new Set([...(a.removed ?? []), ...(b.removed ?? [])])].sort().slice(-REMOVED_MAX);
  const gone = new Set(removed);
  const byKey = new Map<string, PantheonEntry>();
  for (const e of [...(a.pantheon ?? []), ...(b.pantheon ?? [])]) {
    if (gone.has(e.key)) continue;
    const cur = byKey.get(e.key);
    if (!cur) { byKey.set(e.key, { ...e, chosen: e.chosen || undefined }); continue; }
    const best = e.level > cur.level ? e : cur;
    byKey.set(e.key, { ...best, date: Math.min(cur.date, e.date), chosen: cur.chosen || e.chosen || undefined });
  }
  const pantheon = [...byKey.values()].sort((x, y) => x.date - y.date || x.key.localeCompare(y.key));
  const sortedAch = Object.fromEntries(Object.entries(achievements).sort(([x], [y]) => x.localeCompare(y)));
  return { key: 'meta', achievements: sortedAch, pantheon, removed };
}

/** Deux versions disent-elles la même chose ? */
export const sameMeta = (a: Meta, b: Meta) => JSON.stringify(mergeMeta(a, emptyMeta())) === JSON.stringify(mergeMeta(b, emptyMeta()));
