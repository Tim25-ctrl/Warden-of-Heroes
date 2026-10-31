// Fusion des hauts faits et du Panthéon entre appareils (D-174).
import { describe, expect, it } from 'vitest';
import { emptyMeta, mergeMeta, sameMeta, type Meta, type PantheonEntry } from '../src/ui/progress';

const hero = (key: string, level: number, date: number, extra: Partial<PantheonEntry> = {}): PantheonEntry =>
  ({ key, name: key, classe: 'guerrier', level, reason: `niv. ${level}`, guild: 'Graine 1', date, ...extra });

describe('fusion de la méta-progression', () => {
  it('additionne les hauts faits et garde la date la plus ancienne', () => {
    const a: Meta = { ...emptyMeta(), achievements: { phenix: { date: 5, game: 'Graine 1' }, nom_lave: { date: 9, game: 'Graine 1' } } };
    const b: Meta = { ...emptyMeta(), achievements: { phenix: { date: 3, game: 'Graine 2' }, dernier_bastion: { date: 7, game: 'Graine 2' } } };
    const m = mergeMeta(a, b);
    expect(Object.keys(m.achievements).sort()).toEqual(['dernier_bastion', 'nom_lave', 'phenix']);
    expect(m.achievements.phenix).toEqual({ date: 3, game: 'Graine 2' });
  });

  it('réunit les héros et garde la fiche la plus avancée', () => {
    const a: Meta = { ...emptyMeta(), pantheon: [hero('1:4', 25, 10), hero('1:7', 30, 20, { chosen: true })] };
    const b: Meta = { ...emptyMeta(), pantheon: [hero('1:4', 28, 12), hero('2:1', 26, 15)] };
    const m = mergeMeta(a, b);
    expect(m.pantheon.map((e) => e.key)).toEqual(['1:4', '2:1', '1:7']);
    expect(m.pantheon[0]).toMatchObject({ level: 28, date: 10 });
    expect(m.pantheon[2].chosen).toBe(true);
  });

  it('un héros retiré sur un appareil disparaît partout', () => {
    const a: Meta = { ...emptyMeta(), pantheon: [hero('2:1', 26, 15)], removed: ['1:4'] };
    const b: Meta = { ...emptyMeta(), pantheon: [hero('1:4', 28, 12), hero('2:1', 26, 15)] };
    const m = mergeMeta(a, b);
    expect(m.pantheon.map((e) => e.key)).toEqual(['2:1']);
    expect(m.removed).toEqual(['1:4']);
  });

  it('fusionner est stable : même résultat dans les deux sens, et une seconde fois', () => {
    const a: Meta = { ...emptyMeta(), achievements: { phenix: { date: 5, game: 'G' } }, pantheon: [hero('1:4', 25, 10, { chosen: false })] };
    const b: Meta = { ...emptyMeta(), pantheon: [hero('1:4', 25, 10), hero('2:1', 26, 15)], removed: ['3:3'] };
    const ab = mergeMeta(a, b);
    expect(JSON.stringify(ab)).toBe(JSON.stringify(mergeMeta(b, a)));
    expect(sameMeta(mergeMeta(ab, a), ab)).toBe(true);
    expect(sameMeta(a, b)).toBe(false);
  });

  it('accepte une ancienne méta sans liste des retraits', () => {
    const old = { key: 'meta', achievements: {}, pantheon: [hero('1:1', 25, 1)] } as Meta;
    expect(mergeMeta(old, emptyMeta()).pantheon).toHaveLength(1);
  });
});
