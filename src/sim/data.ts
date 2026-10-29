// Accès typé aux fichiers de données (GDD 8.4).
import parametres from './data/parametres.json';
import especes from './data/especes.json';
import ressources from './data/ressources.json';
import zones from './data/zones.json';
import cuisine from './data/cuisine.json';
import salles from './data/salles.json';
import classes from './data/classes.json';
import traits from './data/traits.json';
import noms from './data/noms.json';
import evenements from './data/evenements.json';
import infirmerie from './data/infirmerie.json';
import terrain from './data/terrain.json';
import equipement from './data/equipement.json';
import type {
  AttrId, BedType, BuyerId, ClassId, DenreeId, DishId, EtatId, ProfType, Rang, RemedeId, RoomId, SkillId, SlotId, StaffRole,
} from './types';

export const P = parametres;

export interface Species {
  id: string; nom: string; pluriel: string; rang: Rang; menace: number;
  pv: number; attaque: number; defense: number; groupe: [number, number];
  special: string; etats: { etat: EtatId; chance: number; gravite?: number }[];
  butin: string[]; or?: [number, number]; r: number; k: number; mortVivant: boolean;
}
export const SPECIES: Record<string, Species> =
  Object.fromEntries((especes as unknown as Species[]).map((s) => [s.id, s]));

export interface Resource {
  nom: string; categorie: string; acheteurs: BuyerId[]; poids: number; prix: number;
  conservation: number; rare: boolean; demande: number; buff?: string;
}
export const RESOURCES = ressources as unknown as Record<string, Resource>;
export const isPlant = (id: string) => RESOURCES[id]?.categorie === 'plante';

export interface Zone {
  id: string; nom: string; court: string; lieu: string; trajet: number; danger: number; poidsQuetes: number; poidsDanger: number;
  especes: Record<string, number>; plantes: Record<string, number>; village: string;
}
export const ZONES: Record<string, Zone> = Object.fromEntries((zones as unknown as Zone[]).map((z) => [z.id, z]));
export const ZONE_IDS = (zones as unknown as Zone[]).map((z) => z.id);

export interface Denree { nom: string; prix: number; conservation: number; interne?: boolean }
export const DENREES = cuisine.denrees as Record<DenreeId, Denree>;

export interface Dish {
  nom: string; type: 'repas' | 'boisson' | 'provision';
  ingredients: Partial<Record<DenreeId, number>>;
  faim: number; moral: number; prix: number; niveau: number; cMin: number; module?: string;
}
export const DISHES = cuisine.plats as Record<DishId, Dish>;
export const SERVICES = cuisine.services;
export const BUFFS = cuisine.buffs as Record<string, { nom: string; effet: string }>;

export interface BedDef { nom: string; places: number; energie: number; moral: number; prix: number }
export const BEDS = salles.lits as Record<BedType, BedDef>;
export interface DormLevel { niveau: number; places: number; lits: BedType[]; cout: number; valeur?: number }
export const DORM_LEVELS = salles.dortoirs as DormLevel[];
export interface MessLevel { niveau: number; places: number; plats: number; garde: number; cout: number; valeur?: number }
export const MESS_LEVELS = salles.refectoire as MessLevel[];
export interface RoleDef { nom: string; salaire: number; salle: string; niveauSalle?: number; unique?: boolean }
export const ROLES = salles.roles as Record<StaffRole, RoleDef>;
export interface ModuleDef { nom: string; salle: RoomId | 'siege'; cout: number; niveau: number; effet: string; requiert?: string }
export const MODULES = salles.modules as Record<string, ModuleDef>;

export interface EtatDef { nom: string; remede: RemedeId; niveau: number; prix: number[]; hospitalisation: number[] }
export const ETATS = infirmerie.etats as Record<EtatId, EtatDef>;
export const GRAVITES = infirmerie.gravites;
export interface RemedeDef { nom: string; prix: number; vente?: number }
export const REMEDES = infirmerie.remedes as Record<RemedeId, RemedeDef>;
export interface Recipe { id: string; produit: RemedeId; qte: number; ingredients: Record<string, number>; achat?: number }
export const RECIPES = infirmerie.recettes as unknown as Recipe[];
export const INF_LEVELS = infirmerie.niveaux;
export const HOSPITAL_BED_PRICE = infirmerie.lit;

export interface ProfDef { nom: string; pleine: ClassId[]; partielle: ClassId[]; competences: SkillId[] }
export const PROFS = terrain.profs as Record<ProfType, ProfDef>;
export const TERRAIN_LEVELS = terrain.niveaux as { niveau: number; profs: number; cout: number; debloque: ProfType[] }[];
export const SLOTS = terrain.creneaux as { id: SlotId; nom: string; heure: number }[];
export const TRAINING = terrain;

export interface TierDef { palier: number; nom: string; niveau: number; arme: number; armure: number; bonus: number; materiau: string | null }
export const TIERS = equipement.paliers as TierDef[];
export const GEAR = equipement;
export const BUYERS = equipement.acheteurs as Record<BuyerId, { nom: string; description: string; palier?: string }>;

export interface ClassDef { nom: string; principaux: AttrId[]; attaque: AttrId; competences: SkillId[]; arme: SkillId; role: 'tank' | 'degats' | 'soin' }
export const CLASSES = classes as Record<ClassId, ClassDef>;
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export interface TraitDef { nom: string; oppose: string | null; description: string }
export const TRAITS: Record<string, TraitDef> = traits;
export const TRAIT_IDS = Object.keys(TRAITS);

export const NAMES = noms;

export const RANGS: Rang[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
export const SKILL_NAMES: Record<SkillId, string> = {
  connaissance: 'Connaissance des monstres', survie: 'Survie', cohesion: 'Cohésion', negoce: 'Négoce',
  maniement: "Maniement d'armes", protection: 'Protection', tir: 'Tir', pistage: 'Pistage',
  fouille: 'Fouille', discretion: 'Discrétion', arcanes: 'Arcanes', savoir: 'Savoir ancien',
  soins: 'Soins', exorcisme: 'Exorcisme',
};
export const ATTR_NAMES: Record<AttrId, string> = {
  FOR: 'Force', AGI: 'Agilité', INT: 'Intelligence', VOL: 'Volonté', CON: 'Constitution',
};

// ---------- Le monde vivant (chapitre 5) ----------

export interface EventEffect { key: string; mult?: number; add?: number }
export interface EventDef {
  nom: string;
  categorie: 'petit' | 'majeur' | 'crise';
  theme: 'economie' | 'monstres' | 'societe' | 'sante';
  poids: number;
  duree: number;
  conditions?: {
    saison?: number[]; pasSaison?: number[]; prosperiteMax?: number; prosperiteMin?: number;
    refectoireMin?: number; chaine?: boolean; jourMin?: number; bagarreur?: boolean;
  };
  rumeur?: string;
  effets?: EventEffect[];
  action?: string;
  valeur?: number;
  choix?: { id: string; label: string; cost?: number }[];
  defaut?: string;
  texte: string;
  suite?: { evenement: string; prosperiteMax?: number; chance: number };
}
export const EVENTS = evenements as unknown as Record<string, EventDef>;
