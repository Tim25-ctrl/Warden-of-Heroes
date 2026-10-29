// Types de l'état du jeu. Tout l'état est sérialisable en JSON (sauvegarde, envoi à l'interface).

export type Money = number; // en pièces de cuivre, toujours un entier

export type ClassId = 'guerrier' | 'rodeur' | 'voleur' | 'mage' | 'clerc';
export type AttrId = 'FOR' | 'AGI' | 'INT' | 'VOL' | 'CON';
export type SkillId =
  | 'connaissance' | 'survie' | 'cohesion' | 'negoce'
  | 'maniement' | 'protection' | 'tir' | 'pistage' | 'fouille' | 'discretion'
  | 'arcanes' | 'savoir' | 'soins' | 'exorcisme';
export type Rang = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type BedType = 'paillasse' | 'commun' | 'individuelle' | 'suite';
export type DishId = 'gruau' | 'ragout' | 'roti' | 'festin' | 'biere' | 'vin' | 'panier';
export type DenreeId = 'cereales' | 'legumes' | 'viande' | 'biere' | 'epices' | 'vin' | 'monstre';
export type RoomId = 'dortoirs' | 'refectoire' | 'infirmerie' | 'terrain';
export type StaffRole = 'cuisinier' | 'commis' | 'valet' | 'soigneur' | 'apothicaire' | 'intendant' | 'inspecteur';
export type Quality = 'intacte' | 'abimee' | 'ruinee';
export type Profile = 'temeraire' | 'normal' | 'prudent';
export type EtatId = 'plaie' | 'fracture' | 'poison' | 'brulure' | 'maladie' | 'malediction';
export type RemedeId = 'bandages' | 'attelle' | 'antidote' | 'baume' | 'tisane' | 'elixir' | 'eau_benite' | 'potion' | 'potion_sup';
export type ConsumableId = 'potion' | 'antidote' | 'bandages' | 'panier';
export type BuyerId = 'tanneur' | 'alchimiste' | 'forgeron' | 'halle' | 'collectionneur';
export type ProfType = 'maitre_armes' | 'archimage' | 'stratege' | 'chasseur' | 'aumonier';
export type SlotId = 'matin' | 'apresmidi' | 'soir';
export type QuestType = 'aide' | 'chasse' | 'extermination' | 'cueillette' | 'escorte' | 'exploration' | 'protection';
export type ClientType = 'villageois' | 'marchands' | 'temple' | 'nobles' | 'couronne' | 'guilde';
export type Sanction = 'avertissement' | 'amende' | 'exclusion';

export type Place = 'hall' | 'dortoirs' | 'refectoire' | 'comptoir' | 'infirmerie' | 'terrain' | 'ville' | 'quete' | 'dehors';

export type ActivityKind =
  | 'flaner'        // temps libre au siège
  | 'dormir'        // dans un lit de la guilde
  | 'manger'        // au réfectoire
  | 'boire'         // à la taverne du réfectoire
  | 'attendre'      // file d'attente du réfectoire
  | 'auberge'       // dort chez le concurrent
  | 'taverne'       // mange chez le concurrent
  | 'dehors'        // dort à la belle étoile
  | 'soin'          // au Temple ou chez le rebouteux
  | 'consultation'  // soigné à l'infirmerie
  | 'hospitalise'   // lit d'infirmerie
  | 'entrainement'  // séance au terrain
  | 'forge'         // achats ou réparations chez le Forgeron
  | 'vendre'        // vend son butin en ville
  | 'aide'          // petit boulot en ville
  | 'prison'        // arrêté en ville (événement Rixe)
  | 'quete';        // en quête (géré par la QuestRun)

export interface Activity {
  kind: ActivityKind;
  until: number;       // tick de fin
  place: Place;
  bed?: BedType;
  dish?: DishId;
  prof?: number;       // id du professeur (0 : entraînement libre)
}

export interface Thought { tick: number; text: string }

export interface Ailment { etat: EtatId; gravite: number; since: number; bandaged?: boolean }
export interface Gear { tier: number; dur: number }

export interface Adventurer {
  id: number;
  name: string;
  age: number;
  classe: ClassId;
  level: number;
  xp: number;
  attrs: Record<AttrId, number>;
  skills: Partial<Record<SkillId, number>>;
  traits: string[];
  traitRevealTick: number;
  hp: number;
  energy: number;
  hunger: number;              // 100 = repu
  morale: number;
  fierte: number;
  respect: number;
  loyalty: number;
  griefPrix: number;
  griefFiscal: number;
  gold: Money;
  debt: Money;                 // soins à crédit
  creditCap: Money | null;     // plafond propre (sinon celui de la politique)
  fortuneGoal: Money;
  weapon: Gear;
  armor: Gear;
  sac: Record<ConsumableId, number>;
  states: Ailment[];
  buffs: string[];             // bonus de repas pour la prochaine quête
  activity: Activity;
  lookingForQuest: boolean;
  runId: number | null;
  teamId: number | null;
  job: Quest | null;
  joinedTick: number;
  lastQuestTick: number;
  drinksToday: number;
  mealsToday: number;
  trainedToday: number;
  mourningUntil: number;
  exemptUntil: number;         // exonération fiscale (offre de rétention)
  poachedBy?: string;          // nom de la guilde rivale qui l'a débauché
  status: 'actif' | 'mecontent' | 'depart';
  leaveTick: number | null;
  thoughts: Thought[];
  history: { questsOk: number; questsFail: number; kills: number; notable: string[]; fraudsCaught: number };
}

export interface StaffMember {
  id: number;
  name: string;
  role: StaffRole;
  c: number;
  potentiel: number;
  trait: string | null;
  loyalty: number;
  daysWorked: number;
  unpaidDays: number;
  hiredTick: number;
  absentUntil?: number;        // malade pendant une épidémie
}

export interface Professor {
  id: number;
  name: string;
  type: ProfType;
  level: number;
  pedagogie: number;
  eleves: number;
  ego: number;                         // niveau minimum du terrain exigé
  slots: Record<SlotId, boolean>;
  curseur: number;
  loyalty: number;
  unpaidDays: number;
  hiredTick: number;
  offerUntil: number;
  ancien?: boolean;                    // ancien aventurier de la guilde
}

export interface FoodLot { denree: DenreeId; qty: number; fresh: number; species?: string }
export interface ResLot { res: string; qty: number; quality: Quality; fresh: number }

export interface Quest {
  id: number;
  type: QuestType;
  rang: Rang;
  zone: string;
  clientType: ClientType;
  client: string;
  title: string;
  target?: string;     // espèce (chasse, extermination) ou plante (cueillette)
  count?: number;
  attr?: AttrId;
  hours?: number;
  nights?: number;     // protection
  rooms?: number;      // exploration
  reward: Money;       // récompense du client
  perHead?: Money;     // extermination
  bonus: Money;        // ajouté par la guilde (non taxé)
  minMembers: number;
  maxMembers: number;
  difficulty: number;  // force de combat de l'adversaire attendu
  dangerEst: number;   // la même, estimée par le greffier (±15 %)
  foe: string | null;  // espèce de référence pour estimer le risque
  foeCount: number;
  encounters: number;
  createdTick: number;
  expires: number;
  reservedBy: number | null;
  teams: number[];     // extermination : plusieurs équipes
  legend?: string;     // bête légendaire : son nom (PV ×5, attaque ×2, trophée)
}

export type RunStage = 'preparation' | 'aller' | 'objectif' | 'retour';

export interface QuestRun {
  id: number;
  quest: Quest;
  members: number[];
  leader: number;
  teamId: number | null;
  stage: RunStage;
  departTick: number;
  stageHours: number;
  travelSinceEncounter: number;
  kills: number;
  gathered: number;
  roomsDone: number;
  nightsDone: number;
  convoyHp: number;
  losses: number;
  objectiveHours: number;
  combats: number;
  gold: Money;              // or trouvé (gobelins, trésors)
  loot: ResLot[];
  outcome: 'succes' | 'echec' | null;
  log: { tick: number; text: string }[];
  startedTick: number;
  saved: [number, number][]; // [sauveteur, sauvé] pour les relations
}

export interface Team {
  id: number;
  name: string;
  members: number[];
  exp: number;          // expérience commune, jusqu'à 50
  fails: number;
  questsOk: number;
  createdTick: number;
}

export interface Contract {
  id: number;
  buyer: BuyerId;
  res: string;
  qty: number;
  delivered: number;
  minQuality: Quality;
  premium: number;
  deadline: number;
  offerUntil: number;
}

export type LogCat = 'economie' | 'aventuriers' | 'quetes' | 'monde' | 'guilde';
export type LogLvl = 'critique' | 'important' | 'info' | 'detail';
export interface LogEntry { id: number; tick: number; cat: LogCat; lvl: LogLvl; text: string }

export interface DayLedger {
  day: number;
  recettes: Record<string, Money>;
  depenses: Record<string, Money>;
  tresorerieFin: Money;
}

export interface RoomWorks { targetLevel: number; endTick: number }

export interface Dortoirs {
  level: number;
  works: RoomWorks | null;
  beds: Record<BedType, number>;
  pendingBeds: Record<BedType, number> | null;
  proprete: number;
  curseurs: Record<BedType, number>;
}

export interface Refectoire {
  level: number;
  works: RoomWorks | null;
  menu: DishId[];
  curseurs: Record<DishId, number>;
  pantry: FoodLot[];
  portionsReady: number;
  queue: number[];
  damage: number;                         // mobilier cassé (bagarres)
}

export interface Infirmerie {
  level: number;                          // 0 : non construite
  works: RoomWorks | null;
  remedes: Record<RemedeId, number>;
  curseurSoins: number;
  curseurVente: number;
  queue: string[];                        // recettes à fabriquer
  craftedToday: number;
  autoCraft: Partial<Record<RemedeId, number>>;  // stock minimum à maintenir par fabrication
  restock: Partial<Record<RemedeId, RestockRule>>;
  treatedThisHour: number;
}

export interface Terrain {
  level: number;                          // 0 : non construit
  works: RoomWorks | null;
  profs: Professor[];
  libreCurseur: number;
}

export interface RestockRule { enabled: boolean; seuil: number; qty: number }
export interface RachatRule { res: string; maxStock: number }

export interface MarketEntry { S: number; D: number; cours: Money }

export interface ServiceStats { served: number; revenue: Money; refusals: number; toCompetitor: number }

export interface Policy {
  credit: boolean;
  creditCap: Money;
  sanction: Sanction;
  rachatCurseur: number;
  rachatRules: RachatRule[];
  autoSell: 'off' | 'sans_usage' | 'tout';
  autoAccept: { enabled: boolean; minLevel: number; refuseMalhonnete: boolean };
  reserve: Money;
}

export interface GameState {
  version: 4;
  seed: number;
  rng: Record<string, number>;
  tick: number;
  nextId: number;
  mode: 'classique' | 'chronique';
  treasury: Money;
  debtDays: number;
  gameOver: { tick: number; reason: string } | null;
  prosperity: number;
  danger: number;
  rank: number;
  taxRate: number;
  exemptBeginners: boolean;
  exemptAide: boolean;
  cotisationCurseur: number;
  dortoirs: Dortoirs;
  refectoire: Refectoire;
  infirmerie: Infirmerie;
  terrain: Terrain;
  modules: string[];
  memorial: string[];
  restock: Record<DenreeId, RestockRule>;
  orders: { denree: DenreeId; qty: number; deliverTick: number; cost: Money }[];
  staff: StaffMember[];
  staffCandidates: StaffMember[];
  profCandidates: Professor[];
  adventurers: Adventurer[];
  departed: { id: number; name: string; classe: ClassId; level: number; reason: string; tick: number }[];
  doorCandidates: (Adventurer & { doorUntil: number })[];
  board: Quest[];
  runs: QuestRun[];
  teams: Team[];
  relations: Record<string, number>;
  resserre: ResLot[];
  market: Record<string, MarketEntry>;
  buyers: Record<BuyerId, number>;         // réputation 0–100
  contracts: Contract[];                   // acceptés
  contractOffers: Contract[];
  populations: Record<string, Record<string, number>>;
  policy: Policy;
  fraud: { detected: number; fines: Money; reductionUntil: number; reduction: number };
  renown: number;                          // Renommée en points (6.1)
  world: WorldState;
  chronicle: { anchorReal: number; anchorTick: number } | null;   // mode Chronique : horloge réelle
  difficulty: Difficulty;
  legend: LegendState;
  gaspard: GaspardState;
  loans: Loans;
  book: GuildBook;
  pantheonNames: string[];                 // héros du Panthéon (méta), pour les recrues « descendantes »
  competitorFluct: number;
  ledger: DayLedger[];
  today: DayLedger;
  weekRevenue: Money;
  journal: LogEntry[];
  stats: {
    deaths: number;
    departures: number;
    recruits: number;
    questsOk: number;
    questsFail: number;
    services: Record<string, ServiceStats>;
    window: { served: number; revenue: Money; waited: number };
    priceRatios: number[];
  };
}

export type Command =
  | { type: 'setBedCurseur'; bed: BedType; value: number }
  | { type: 'setDishCurseur'; dish: DishId; value: number }
  | { type: 'setMenu'; menu: DishId[] }
  | { type: 'setBeds'; beds: Record<BedType, number> }
  | { type: 'upgradeRoom'; room: RoomId }
  | { type: 'buyModule'; id: string }
  | { type: 'orderFood'; denree: DenreeId; qty: number }
  | { type: 'setRestock'; denree: DenreeId; rule: RestockRule }
  | { type: 'hireStaff'; id: number }
  | { type: 'fireStaff'; id: number }
  | { type: 'hireProf'; id: number }
  | { type: 'fireProf'; id: number }
  | { type: 'setProfSlot'; id: number; slot: SlotId; open: boolean }
  | { type: 'setProfCurseur'; id: number; value: number }
  | { type: 'setLibreCurseur'; value: number }
  | { type: 'acceptCandidate'; id: number }
  | { type: 'refuseCandidate'; id: number }
  | { type: 'excludeAdventurer'; id: number }
  | { type: 'retain'; id: number; kind: 'prime' | 'exoneration'; amount?: Money }
  | { type: 'setCreditCap'; id: number; cap: Money | null }
  | { type: 'setTaxRate'; value: number }
  | { type: 'setExemptions'; beginners: boolean; aide: boolean }
  | { type: 'setCotisation'; value: number }
  | { type: 'sellLoot'; index: number | 'all' }
  | { type: 'setAutoSell'; mode: Policy['autoSell'] }
  | { type: 'setRachat'; curseur: number; rules: RachatRule[] }
  | { type: 'setSanction'; value: Sanction }
  | { type: 'setCredit'; enabled: boolean; cap: Money }
  | { type: 'setAutoAccept'; rule: Policy['autoAccept'] }
  | { type: 'setReserve'; value: Money }
  | { type: 'buyRemede'; remede: RemedeId; qty: number }
  | { type: 'setRemedeRestock'; remede: RemedeId; rule: RestockRule }
  | { type: 'setInfirmerieCurseur'; kind: 'soins' | 'vente'; value: number }
  | { type: 'queueRecipe'; recipe: string; times: number }
  | { type: 'setAutoCraft'; remede: RemedeId; min: number }
  | { type: 'createPrime'; questType: 'chasse' | 'extermination' | 'cueillette'; zone: string; target: string; count: number; reward: Money; days: number }
  | { type: 'addBonus'; questId: number; amount: Money }
  | { type: 'acceptContract'; id: number }
  | { type: 'deliverContract'; id: number }
  | { type: 'repairFurniture' }
  | { type: 'decide'; id: number; option: string }
  | { type: 'repairRoom'; room: RoomId }
  | { type: 'borrow'; lender: 'banque' | 'usurier'; amount: Money }
  | { type: 'repay'; lender: 'banque' | 'usurier'; amount: Money }
  | { type: 'setDifficulty'; id: DifficultyId }
  | { type: 'setGaspard'; mode: GaspardState['mode'] }
  | { type: 'gaspardAck'; id: number }
  | { type: 'pantheonPick'; id: number }
  | { type: 'ackEpilogue' };


// ---------- Le monde vivant (GDD chapitre 5) ----------

export type Palier = 'bourg' | 'ville' | 'cite';

/** Modificateur temporaire posé par un événement, une saison ou une rivale. */
export interface WorldMod { key: string; mult?: number; add?: number; until: number; source: string }

export interface ActiveEvent { id: string; nom: string; until: number; startTick: number; text?: string; data?: Record<string, string | number> }

export interface Rumor { id: number; text: string; tick: number; fireTick: number; eventId: string | null; real: boolean; data?: Record<string, string | number> }

export interface DecisionOption { id: string; label: string; cost?: Money }
export interface Decision {
  id: number; kind: string; title: string; text: string; options: DecisionOption[]; defaut: string;
  tick: number; deadline: number; data?: Record<string, string | number>;
}

export interface Rival {
  id: string; nom: string; profil: 'prestige' | 'mercenaires'; renown: number; size: number;
  tarifs: number; taux: number; nextAction: number; bankruptSince: number | null;
}

export interface NewsItem { tick: number; rubrique: 'une' | 'marche' | 'guildes' | 'exploits'; text: string }

export interface Assault {
  species: string; zone: string; startTick: number; wave: number; wins: number;
  barricade: boolean; mercenaires: boolean; infirmerieGratuite: boolean;
}

export interface WorldState {
  palier: Palier;
  palierStreak: number;
  mods: WorldMod[];
  events: ActiveEvent[];
  scheduled: { eventId: string; tick: number; data?: Record<string, string | number>; real: boolean }[];
  rumors: Rumor[];
  decisions: Decision[];
  rivals: Rival[];
  news: NewsItem[];
  assault: Assault | null;
  lastAssault: number;
  epidemic: { until: number; source: string; calmDays: number } | null;
  lastEpidemic: number;
  counters: Record<string, number>;          // chaînes : jours consécutifs au-dessus d'un seuil
  escortes: { tick: number; ok: boolean }[];
  townSpend: number[];                       // dépenses des aventuriers en ville, par jour (7 jours)
  history: { day: number; danger: number; prosperity: number; renown: number }[];
  popHistory: { day: number; pops: Record<string, Record<string, number>> }[];
  conscripts: { adv: Adventurer; returnTick: number }[];
  damaged: Partial<Record<RoomId, boolean>>;  // salles endommagées par un assaut (capacité −50 %)
}


// ---------- La légende (GDD chapitre 6) ----------

export type DifficultyId = 'paisible' | 'normal' | 'impitoyable';
export interface Difficulty {
  id: DifficultyId; tresorerie: Money; mort: number; croissance: number; recompenses: number;
  tolerance: number; faillite: number; crises: number; rumeurs: number;
  changed: boolean;                         // modifiée en cours de partie : les Défis sont désactivés
}

export interface LegendEntry { id: number; name: string; classe: ClassId; level: number; reason: string; tick: number; chosen?: boolean }

export interface LegendState {
  heraldTick: number | null;               // le héraut viendra apposer le sceau ce matin-là
  victoryTick: number | null;
  defeatSeen: boolean;
  epilogueSeen: boolean;
  achievements: Record<string, number>;    // haut fait → tick d'obtention
  counters: Record<string, number>;        // compteurs des hauts faits et des conditions de sceau
  week: Record<string, number>;            // ventilation de la renommée de la dernière semaine
  legends: LegendEntry[];                  // entrées au Panthéon gagnées dans cette partie
  pantheonPick: number | null;
}

export interface Advice { id: number; key: string; text: string; screen: string; tick: number; alert: boolean }
export interface GaspardState { mode: 'frequent' | 'alertes' | 'off'; said: string[]; last: number; queue: Advice[]; cooldown: Record<string, number> }

export interface Loan { principal: Money; since: number; due: number; late: boolean }
export interface Loans { banque: Loan | null; usurier: Loan | null; lastLoanTick: number; lastDebtTick: number }

export interface WeeklyPoint { day: number; treasury: Money; renown: number; prosperity: number; danger: number; adventurers: number }
export interface GuildBook {
  chapters: { title: string; lines: string[] }[];
  current: string[];
  weekly: WeeklyPoint[];
  records: { bestQuest: { title: string; reward: Money; who: string } | null; richest: { name: string; gold: Money } | null };
}
