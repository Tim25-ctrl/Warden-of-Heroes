// Outil de diagnostic : joue N jours sur une graine et affiche le journal filtré et l'état des aventuriers.
// Usage : npm run inspect -- --seed 1 --days 10 [--cat quetes] [--lvl info]
import { pvMax } from '../src/sim/adventurers';
import { createGame, stepDays } from '../src/sim/engine';
import { money, stamp } from '../src/sim/format';

const args = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const s = createGame({ seed: Number(arg('seed', '1')) });
stepDays(s, Number(arg('days', '10')));
const cat = arg('cat', '');
const lvls = arg('lvl', 'critique,important,info').split(',');
const strip = (t: string) => t.replace(/\[\[a:\d+\|([^\]]+)\]\]/g, '$1');
for (const e of s.journal) {
  if (cat && e.cat !== cat) continue;
  if (!lvls.includes(e.lvl)) continue;
  console.log(`${stamp(e.tick).padEnd(10)} ${e.lvl.padEnd(9)} ${strip(e.text)}`);
}
console.log(`\nTrésorerie ${money(s.treasury)} — tableau : ${s.board.length} quêtes, ${s.runs.length} en cours`);
for (const a of s.adventurers) {
  console.log(`${a.name.padEnd(24)} ${a.classe.padEnd(8)} niv ${a.level} or ${money(a.gold).padEnd(14)} faim ${Math.round(a.hunger)} énergie ${Math.round(a.energy)} moral ${Math.round(a.morale)} pv ${Math.round((a.hp / pvMax(a)) * 100)}% ${a.activity.kind}${a.lookingForQuest ? ' (cherche)' : ''} ${a.status}`);
}
