# Padel Ragdoll 🎾

MVP d'un jeu de **padel 3D** jouable dans le navigateur, en **double (2v2)** :
toi + un partenaire IA contre deux adversaires IA. Les joueurs sont des
personnages **entièrement ragdoll** — aucune animation n'est jouée, chaque
membre est ramené vers une pose cible par un asservissement physique. Il suffit
de couper cet asservissement pour que le bonhomme s'écroule — ce qui arrive à
chaque point perdu.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
```

Build de production :

```bash
npm run build && npm run preview
```

## Contrôles

| Action | Clavier | Tactile |
|---|---|---|
| Se déplacer | `ZQSD` / `WASD` / flèches | joystick (moitié gauche) |
| Viser | direction tenue au moment de frapper | direction du joystick |
| Frapper | `Espace` (maintenir = puissance) | appui (moitié droite) |
| Lob | `Maj` | appui long |
| Smash | `E` (balle haute) | — |
| Servir / rejouer | `Espace` | appui |

La visée se lit dans le repère de l'écran : le fond du camp adverse est vers le
haut, donc tenir vers l'avant allonge la balle et tenir vers l'arrière la
raccourcit. Sans direction tenue, la balle part au centre. Comme la frappe
ne part qu'au relâchement, on peut charger, viser, puis lâcher.

## Règles implémentées

Comptage padel classique (0/15/30/40, égalité et avantage), premier à **3 jeux**.
Un point se perd sur : double rebond, balle au filet, balle sortie, rebond
dans son propre camp, **vitre touchée avant le rebond au sol**, ou **double
faute au service**. Le perdant du point s'effondre au sol.

**Le service** se joue en diagonale : la balle doit retomber dans le carré
opposé, en deçà de la ligne de service, et le carré change à chaque point. Une
première balle manquée donne droit à une seconde, jouée plus prudemment ; deux
fautes de suite et le point va au receveur.

**Le jeu au mur** est ce qui distingue le padel du tennis. Une balle frappée
doit toucher le sol adverse avant toute vitre : la volée de mur est faute, et
envoyer la balle dans sa propre vitre après avoir frappé l'est aussi. En
revanche, une fois ce rebond au sol effectué, les parois font partie du jeu —
la balle peut y rebondir autant de fois que nécessaire et le défenseur peut la
reprendre après.

## Architecture

```
src/
  core/
    constants.ts   dimensions du court, palette, groupes de collision
    physics.ts     initialisation Rapier, pas de temps fixe
    scene.ts       scène Three.js, court, filet, parois vitrées
    input.ts       clavier + joystick tactile
    audio.ts       sons synthétisés (aucun asset)
  game/
    ragdoll.ts     squelette articulé et pilotage de la pose
    character.ts   joueur : ragdoll + raquette + frappe
    ball.ts        balle et détection des rebonds (sol, filet, vitres, sortie)
    trajectory.ts  vol amorti : résolution des frappes et anticipation
    aim.ts         visée : direction tenue → point du camp adverse
    rules.ts       arbitrage, service et comptage
    effects.ts     repère d'atterrissage, éclat d'impact
    ai.ts          adversaire
    game.ts        boucle de jeu, caméra, enchaînement des points
  ui/hud.ts        score, bannières, jauge de puissance
```

Quatre points ont demandé une attention particulière :

- **Les membres d'un même ragdoll ne doivent pas se percuter.** Les capsules se
  chevauchent par construction ; sans groupes de collision dédiés (`GROUPS`),
  la simulation explose en quelques images.
- **La pose est pilotée en vitesse angulaire bornée**, pas en couple. Un
  asservissement en couple diverge dès que l'inertie des membres est faible.
- **Les frappes sont résolues vers un point du camp adverse**, sinon la
  quasi-totalité des échanges finissent au filet.
- **L'amortissement de la balle fait partie du calcul** (`trajectory.ts`). La
  distance parcourue n'est pas `v·t` mais `(v/d)(1 − e^(−d·t))` : résoudre sans
  ce terme faisait atterrir chaque frappe environ deux mètres avant sa cible.
  Le même modèle, intégré pas à pas avec les rebonds sur les vitres, sert à
  l'IA pour anticiper les balles qui reviennent du mur.

## Tests

```bash
npm run typecheck   # types
npm test            # arbitrage : comptage, égalité/avantage, fautes, fin de match
```

L'arbitrage (`src/game/rules.ts`) est de la logique pure, sans dépendance à
Three ni à Rapier : c'est la seule partie du jeu vérifiable sans navigateur, et
celle où une régression passe le plus facilement inaperçue.

## Simulateur d'équilibrage

```bash
npm run build
npm run preview &
npm run sim 100 1                    # 100 points, graine 1
npm run sim -- 100 1 --graines=3     # moyenne sur 3 graines
npm run sim -- 20 1 --determinisme   # la même graine rejoue la même partie
```

Deux IA s'affrontent sans rendu ni horloge murale, et la partie se résume en
chiffres : longueur des échanges, répartition des motifs de fin de point par
camp, taux de fautes au service. 100 points tournent en une poignée de
secondes, ce qui rend un réglage mesurable au lieu d'être deviné.

Tout l'aléatoire du jeu passe par [`src/core/random.ts`](src/core/random.ts), donc
une graine rejoue exactement la même partie — à condition de partir d'un monde
neuf, ce que fait le paramètre d'URL `?sim=1` en gelant la boucle de rendu.

Valeurs de référence actuelles (graines 1 à 4, 400 points) :

| Mesure | Observé |
|---|---|
| Échange moyen | 5,6 frappes |
| Points gagnés côté joueur | 56 % |
| Fautes de service | 28 % des points |

Une seule graine ne suffit pas à juger : le taux de fautes de service a un
écart-type de près de 10 points d'une partie à l'autre. D'où `--graines=N`, qui
moyenne avant d'appliquer les fourchettes — c'est la forme qu'utilise la CI.

### Niveaux de l'IA

`--niveau=N` fait varier le camp adverse, le camp joueur restant à 0.5 comme
étalon. La part des points gagnés par l'IA sur 300 points :

| Niveau | Vitesse de course | Points IA | Échange moyen | Distance ratée |
|---|---|---|---|---|
| 0 | 4,32 m/s | 18 % | 2,87 | — |
| 0,25 — facile | 4,86 m/s | 26 % | 3,81 | 1,57 m |
| 0,5 — moyen | 5,40 m/s | 42 % | 5,37 | 1,48 m |
| 0,75 — difficile | 5,94 m/s | 50 % | 9,07 | 1,19 m |
| 1 | 6,48 m/s | 43 % | 7,90 | 0,92 m |

La courbe monte jusqu'à 0,75 puis **redescend**, sans cause établie : ni un
plancher de dispersion de visée ni le déclenchement déterministe ne
l'expliquent, les deux ayant été mesurés — le premier dégrade même le
résultat. Les niveaux proposés s'arrêtent donc à 0,75.

La « distance ratée » est l'écart raquette-balle au moment où un point se perd
sur double rebond. C'est elle qui a orienté le travail sur l'IA : les points ne
se perdaient pas par mauvaise anticipation mais au dernier mètre, pour un rayon
de contact de 0,7 m.

## Test de fumée

```bash
npm run build
npm run preview &
npm run smoke    # joue des échanges au clavier, échoue sur toute erreur console
```

Le test de fumée et le simulateur attendent tous deux un Chromium ; sur un
environnement sans navigateur installé par Playwright, préciser
`CHROMIUM_PATH=/chemin/vers/chrome`.

## Réglages de jouabilité

Issus d'une session de jeu réelle :

- **Le geste de frappe doit être visible.** Les bras d'un ragdoll sont volontairement
  mous ; sans coup de fouet ponctuel sur leur raideur (`SWING_GAIN`) le bras
  n'atteignait jamais sa pose et le joueur brassait l'air.
- **La raquette accompagne la balle** dès qu'elle approche (`TRACK_RADIUS`), et le
  contact est mesuré au tamis, plus à la main : on voit la balle être frappée.
- **Un repère au sol** montre le point de rebond de la balle qui arrive, sans quoi
  jouer le rebond revient à courir à l'aveugle.
- **La gravité a été réduite** (1,35 g au lieu de 1,7) : au-delà, la balle retombait
  si vite après son rebond qu'elle en devenait injouable.

## Limites du MVP

Le service part automatiquement dans le bon carré : on choisit le moment, pas le
placement. Un service qui touche le filet est compté faute alors que la règle en
fait un « let » à rejouer. Enfin, l'anticipation de l'IA s'arrête à trois
secondes : au-delà de deux rebonds de vitre enchaînés, elle se replace au jugé.
