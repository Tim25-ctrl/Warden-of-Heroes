// Meubles illustrés des salles (v1.1, D-162) : chaque planche et l'endroit approximatif de chaque objet
// (fraction de la largeur et de la hauteur de l'image). Le découpage prend l'objet le plus proche de ce point.
import courUrl from '../assets/cour.jpg';
import cuisineUrl from '../assets/cuisine.jpg';
import dortoirUrl from '../assets/dortoir.jpg';
import infirmerieUrl from '../assets/infirmerie.jpg';
import refectoireUrl from '../assets/refectoire.jpg';
import { loadPicks } from './sprites';

const at = (x: number, y: number, w = 1440, h = 736): [number, number] => [x / w, y / h];

/** Aménagements du dortoir. */
export const DORM_ITEMS = loadPicks(dortoirUrl, {
  rideaux: at(250, 365), coffre: at(630, 220), cheminee: at(755, 530), bains: at(1260, 240),
});

/** Tables du réfectoire, de la plus pauvre (niveau 1) à la plus riche (niveau 5), et le comptoir de casse-croûte. */
export const MESS_ITEMS = loadPicks(refectoireUrl, {
  table1: at(210, 200), table2: at(640, 200), table3: at(1160, 210), table4: at(210, 530), table5: at(775, 540), cassecroute: at(1265, 520),
});

/** Infirmerie : lit de paille (niveaux 1 et 2), lit à draps blancs (niveau 3 et plus), et ses aménagements. */
export const INF_ITEMS = loadPicks(infirmerieUrl, {
  litPaille: at(135, 230), litDraps: at(365, 230), jardin: at(585, 540), laboratoire: at(845, 515), quarantaine: at(1090, 520), convalescence: at(1315, 520),
});

/** Cuisine : ses aménagements, puis l'équipement qui vient avec son niveau. */
export const KITCHEN_ITEMS = loadPicks(cuisineUrl, {
  saloir: at(235, 300), cave: at(630, 300), glaciere: at(945, 240), etagere: at(1250, 230), plan: at(1150, 500),
});

/** Cour d'entraînement : mannequin et cible, puis ses aménagements. */
export const YARD_ITEMS = loadPicks(courUrl, {
  mannequin: at(165, 200), cible: at(470, 225), armurerie: at(820, 230), table_cartes: at(1215, 270), salle_etude: at(745, 575), bassins: at(1190, 600),
});
