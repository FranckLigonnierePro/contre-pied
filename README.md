# CONTRE-PIED

> Un deckbuilder où tu joues **la carrière d'un footballeur**, pas un club.
> L'adversaire n'est pas l'équipe d'en face : c'est le match lui-même.

MVP jouable de la **Phase 0** du brief, joué dans le navigateur, **conçu pour un
téléphone tenu à une main**.

---

## Ce qui est dans le MVP

| | |
|---|---|
| **Le match** | 12 temps de jeu, 90 minutes, souffle qui ne se recharge jamais entièrement, placement qui fuit, danger à convertir |
| **Le télégraphe** | L'adversaire annonce ce qu'il prépare 1 à 3 temps de jeu à l'avance, avec la parade exacte pour l'empêcher |
| **Les occasions** | Le miroir positif du télégraphe : un gain si tu remplis la condition |
| **Le gardien** | Son seuil est affiché en permanence. Tirer est une décision, jamais un jet de dés |
| **29 cartes** | 26 jouables, 3 tares. Pas 150 |
| **3 postes** | Trois decks de départ, trois consignes de coach, trois façons de jouer |
| **Mini-saison** | 3 matchs, une carte gagnée après chacun, un choix hors terrain entre chacun |
| **Fin de saison** | Note, palmarès, deck final, texte partageable |

### Ce qui est volontairement dehors

Comptes, ligues, tick asynchrone, Stripe, cosmétiques, mercato, carrière
complète sur 5-6 saisons, vieillissement, retraite.

Le brief est explicite (R3) : *aucune feature n'a le droit de partager le temps
de dev tant que le match n'est pas validé*. Tout ce qui précède est planification
conditionnelle et n'a aucune valeur tant que le gate de la Phase 0 n'est pas
franchi.

**Une seule entorse assumée : la mini-saison de 3 matchs.** Elle existe parce
qu'elle porte le seul vrai argument de supériorité du concept (brief 3.2) — chez
New Star Soccer et Destiny Eleven, les dilemmes extra-sportifs ne bougent que des
statistiques invisibles ; ici la soirée arrosée ajoute physiquement une carte
« Jambes lourdes » à ton paquet. Trois matchs suffisent à le démontrer, et ça ne
retire rien au match.

---

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173 (--host : accessible depuis ton téléphone)
```

| Commande | Ce qu'elle fait |
|---|---|
| `npm run dev` | Serveur de développement, exposé sur le réseau local pour tester au doigt |
| `npm run build` | Vérification de types + build de production (~60 ko gzip au total) |
| `npm test` | 21 tests du moteur : déterminisme, règles, cohérence des données |
| `npm run sim` | Bot d'équilibrage — `npm run sim 5000` pour 5000 matchs par poste |
| `npm run verif:mobile` | Contrôle de mise en page sur 3 écrans réels (nécessite `npx playwright install chromium`, et `npm run preview` dans un autre terminal) |

---

## Les trois décisions structurantes

### 1. Le télégraphe — le risque de design n°1

Un match n'a pas d'intention. Sans intention annoncée, il n'y a pas de décision,
juste de l'optimisation à l'aveugle. La réponse tient en trois points :

1. L'adversaire **annonce** ce qu'il prépare, en clair, avec son effet exact.
2. Chaque annonce a une **parade** affichée — une condition atteignable ce
   temps de jeu (*« gagne deux duels »*, *« termine à 4 de placement »*,
   *« dépense au moins 6 souffles »*).
3. **La parade coûte toujours ce que la consigne du coach réclame par ailleurs.**

C'est le point 3 qui fabrique la décision. Parer, c'est ne pas marquer. Marquer,
c'est encaisser. Si les deux étaient compatibles, il n'y aurait pas de jeu.

Le seuil du gardien obéit à la même règle : il est **affiché avant que tu tires**,
et le bouton d'action indique le résultat projeté (*« Tirer — 14 contre 12 »*).
Un but est mérité, un arrêt est assumé. Aucun des deux n'est subi.

Un test empêche qu'un poste se retrouve avec un télégraphe impossible à parer —
une menace imparable n'est pas une décision, c'est une punition.

### 2. Le déterminisme — non rattrapable après coup

Aucun `Math.random()` n'existe dans le moteur ; un test casse la CI le jour où
quelqu'un l'oublie. Tout l'aléatoire passe par une RNG seedée sérialisable, et
l'état de match complet est du JSON pur.

Ça n'a l'air de rien aujourd'hui, et ça donne d'un coup, plus tard, sans une
ligne de réécriture : le défi du jour à seed partagée, les fantômes, la
simulation serveur (donc l'anti-triche gratuit), et le bot d'équilibrage.

Deux personnes qui entrent le même tirage jouent exactement la même saison :
mêmes adversaires, mêmes annonces, même gardien.

### 3. Mobile first, littéralement

Le modèle repose entièrement sur l'invitation : le commissaire envoie un lien,
sept personnes cliquent. Chaque étape entre le lien et la première partie coûte
la moitié du groupe. Donc :

- **Aucun défilement de page.** L'écran de match tient dans `100dvh`, encoche et
  barre de geste comprises.
- **Aucune cible tactile sous 44 px**, et tout ce qui se touche est dans le tiers
  bas de l'écran.
- **Aucune information au survol** — le survol n'existe pas sur un téléphone.
- **Deux temps pour jouer une carte** : le premier la montre, le second la joue.
  Une carte jouée par erreur est perdue.
- Les seules media queries **élargissent** la mise en page. Rien n'est conçu
  d'abord pour la souris puis retassé. Sur un écran de 320 px de haut de moins,
  la bande du gardien s'efface au profit de la jauge Danger qui portait déjà la
  même information.

`npm run verif:mobile` vérifie ces règles automatiquement sur 320×568, 393×851
et 1280×800.

---

## Équilibrage

`npm run sim` remplace les 300 itérations de « feeling » par une mesure. Le bot
n'a accès qu'à ce que l'interface montre au joueur, et il rejoue le vrai moteur
sur des copies jetables — ce qu'il mesure est donc exactement ce que le joueur
vivra.

Ce qu'on regarde n'est pas « est-ce que le bot gagne » mais **la consigne du
coach est-elle tenue entre 35 % et 65 % du temps**. En dessous c'est punitif,
au-dessus il n'y a pas de décision.

État actuel, sur 800 matchs par poste :

| Poste | Consigne tenue | Buts / match | Note moyenne |
|---|---|---|---|
| 9 — Le renard | 41,9 % | 2,85 | 7,3 |
| 10 — Le meneur | 49,3 % | 2,50 | 7,1 |
| 6 — Le patron | 36,6 % | 0,40 | 5,4 |

Le bot est glouton et myope : il joue moins bien qu'un humain motivé. Une
consigne qu'il tient à 60 % sera trop facile pour un vrai joueur.

Toutes les constantes d'équilibrage sont regroupées dans `REGLES`
(`src/engine/match.ts`) et nulle part ailleurs.

---

## Architecture

```
src/
  engine/     TypeScript pur — zéro dépendance, zéro DOM, zéro React
    rng.ts        RNG seedée (mulberry32). Le SEUL endroit avec de l'aléatoire
    types.ts      Vocabulaire du jeu
    cartes.ts     Les 29 cartes
    menaces.ts    Le télégraphe : annonces, parades, occasions
    profils.ts    Postes, decks de départ, consignes, adversaires fictifs
    match.ts      Machine à états du match + REGLES (équilibrage)
    saison.ts     Mini-saison, événements hors terrain, bilan
  ui/         React + CSS. Ne contient aucune règle de jeu
  sim/        Bot d'équilibrage
test/         21 tests du moteur
scripts/      Contrôle de mise en page mobile
```

Règle tenue : `src/engine/` n'importe rien hors de `src/engine/`, et l'interface
ne recalcule jamais une règle — même l'aperçu de tir est le vrai coup joué sur
une copie.

---

## Risque juridique

**Aucun nom de club ni de joueur réel**, nulle part, dès la v1. Championnats et
clubs fictifs mais évocateurs (*Sporting de Valmorin*, *US Châteaubel*…). Un test
échoue si un nom réel apparaît dans les sources. On ne « régularisera » pas plus
tard : le jour où ça monétise, c'est une cible.

---

## Le gate de la Phase 0

> 20 personnes qui ne te connaissent pas y jouent.
> **Au moins 12 relancent une deuxième partie sans qu'on le leur demande.**

C'est la seule chose qui compte maintenant. Le reste du document de projet est
de la planification conditionnelle.

Pour mettre en ligne : `npm run build` produit un `dist/` statique, déployable
tel quel sur n'importe quel hébergeur (Vercel, Netlify, Cloudflare Pages). Aucun
serveur, aucune base, aucun compte — le lien suffit.

**Ce qu'il faut mesurer**, et que ce MVP ne mesure pas encore : le taux de
relance. Une ligne d'analytics sur l'écran de fin de saison suffit, et c'est le
premier ajout à faire avant de faire tester.
