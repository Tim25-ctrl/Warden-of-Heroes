// « Ce matin à la guilde » (refonte v1.1) : ce qui a changé depuis hier et ce qui attend une décision.
import {
  IconAlertTriangle, IconCaravan, IconCertificate, IconCoins, IconDoorExit, IconLeaf, IconRoadOff, IconSkull, IconSunrise, IconToolsKitchen2, IconUserPlus,
} from '@tabler/icons-preact';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { CITIES, CITY_IDS, DENREES } from '../sim/data';
import { routeOpen } from '../sim/cities';
import { money } from '../sim/format';
import { LEDGER_LABELS } from '../sim/journal';
import { examOf, isCandidate } from '../sim/ranks';
import type { GameState } from '../sim/types';
import { plain, useNav, type Screen } from './components';

interface Item { icon: ComponentChildren; title: string; text: string; go?: Screen; tone?: 'bad' | 'warn' | 'ok' }

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export function morningItems(s: GameState): Item[] {
  const items: Item[] = [];
  const I = { size: 22, stroke: 1.75 };
  const y = s.ledger[s.ledger.length - 1];
  if (y) {
    const net = sum(y.recettes) - sum(y.depenses);
    const top = Object.entries(y.recettes).sort((a, b) => b[1] - a[1])[0];
    items.push({ icon: <IconCoins {...I} class="pi gold" />, title: `${net >= 0 ? '+' : '−'}${money(Math.abs(net))} hier`,
      text: top ? `surtout : ${(LEDGER_LABELS[top[0]] ?? top[0]).toLowerCase()} (${money(top[1])})` : 'aucune recette', go: 'livre', tone: net < 0 ? 'bad' : undefined });
  }
  if (s.world.decisions.length) {
    items.push({ icon: <IconAlertTriangle {...I} class="pi amber" />, title: `${s.world.decisions.length} décision${s.world.decisions.length > 1 ? 's' : ''} en attente`, text: s.world.decisions[0].title, go: 'chroniques', tone: 'warn' });
  }
  const cands = s.adventurers.filter((a) => isCandidate(s, a) && !examOf(s, a));
  if (cands.length) {
    items.push({ icon: <IconCertificate {...I} class="pi gold" />, title: `${cands.length} épreuve${cands.length > 1 ? 's' : ''} à organiser`, text: cands.slice(0, 3).map((a) => a.name).join(', ') + (cands.length > 3 ? '…' : ''), go: 'aventuriers' });
  }
  const leaving = s.adventurers.filter((a) => a.status === 'depart');
  if (leaving.length) {
    items.push({ icon: <IconDoorExit {...I} class="pi" />, title: `${leaving.length} sur le départ`, text: leaving.slice(0, 3).map((a) => a.name).join(', '), go: 'aventuriers', tone: 'bad' });
  }
  const dead = s.departed.filter((d) => d.reason === 'mort' && d.tick > s.tick - 24);
  if (dead.length) items.push({ icon: <IconSkull {...I} class="pi" />, title: `${dead.length} mort${dead.length > 1 ? 's' : ''} depuis hier`, text: dead.map((d) => d.name).join(', '), go: 'aventuriers', tone: 'bad' });
  const out = s.refectoire.ranOutYesterday ?? [];
  if (out.length) {
    items.push({ icon: <IconToolsKitchen2 {...I} class="pi amber" />, title: 'Rupture au garde-manger', text: `${out.map((d) => DENREES[d].nom.toLowerCase()).join(', ')} : monte la commande automatique`, go: 'siege', tone: 'warn' });
  }
  if (s.doorCandidates.length) {
    items.push({ icon: <IconUserPlus {...I} class="pi sage" />, title: `${s.doorCandidates.length} candidat${s.doorCandidates.length > 1 ? 's' : ''} à la porte`, text: s.doorCandidates.slice(0, 3).map((c) => c.name).join(', '), go: 'aventuriers' });
  }
  // Villes voisines (v1.1) : routes coupées et caravanes arrivées.
  const cut = CITY_IDS.filter((id) => !routeOpen(s, id));
  if (cut.length) {
    items.push({ icon: <IconRoadOff {...I} class="pi seal" />, title: `Route de ${cut.map((id) => CITIES[id].court).join(', ')} coupée`, text: 'une quête au tableau permet de la rouvrir', go: 'carte', tone: 'warn' });
  }
  const sold = s.journal.filter((e) => e.tick > s.tick - 24 && /^La caravane de la guilde a tout vendu/.test(e.text));
  if (sold.length) items.push({ icon: <IconCaravan {...I} class="pi gold" />, title: 'Caravane arrivée', text: plain(sold[sold.length - 1].text).replace(/^La caravane de la guilde a tout vendu /, 'vendue '), go: 'carte' });
  const hunts = s.journal.filter((e) => e.tick > s.tick - 24 && /^La chasse aux/.test(e.text));
  if (hunts.length) items.push({ icon: <IconLeaf {...I} class="pi sage" />, title: 'Chasse', text: plain(hunts[hunts.length - 1].text).replace(/ : .*/, ''), go: 'carte' });
  return items;
}

export function MorningReport({ s }: { s: GameState }) {
  const nav = useNav();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('matin') !== 'ferme'; } catch { return true; } });
  const items = morningItems(s);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem('matin', v ? 'ouvert' : 'ferme'); } catch { /* stockage indisponible */ } };
  return (
    <section class="panel morning">
      <div class="row">
        <h3 style={{ margin: 0 }}><IconSunrise size={20} stroke={1.75} class="pi gold" /> Ce matin à la guilde</h3>
        <span class="spacer" />
        <button class="link" onClick={toggle}>{open ? 'Replier' : `Déplier (${items.length})`}</button>
      </div>
      {open && (items.length === 0 ? <p class="empty">Rien de particulier : la guilde tourne.</p> : (
        <div class="morning-grid">
          {items.map((it) => (
            <button class={`m ${it.tone ?? ''}`} onClick={() => it.go && nav.go(it.go)}>
              {it.icon}
              <span><b>{it.title}</b><small>{it.text}</small></span>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}
