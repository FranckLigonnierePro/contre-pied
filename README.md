# Padel Ragdoll 🎾

MVP d'un jeu de **padel 3D** jouable dans le navigateur, où les deux joueurs sont
des personnages **entièrement ragdoll** : aucune animation n'est jouée, chaque
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
| Frapper | `Espace` (maintenir = puissance) | appui (moitié droite) |
| Lob | `Maj` | appui long |
| Smash | `E` (balle haute) | — |
| Servir / rejouer | `Espace` | appui |

## Règles implémentées

Comptage padel classique (0/15/30/40, égalité et avantage), premier à **3 jeux**.
Un point se perd sur : double rebond, balle au filet, balle sortie, ou rebond
dans son propre camp. Le perdant du point s'effondre au sol.

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
    character.ts   joueur : ragdoll + raquette + frappe balistique
    ball.ts        balle et détection des rebonds
    rules.ts       arbitrage et comptage
    ai.ts          adversaire
    game.ts        boucle de jeu, caméra, enchaînement des points
  ui/hud.ts        score, bannières, jauge de puissance
```

Trois points ont demandé une attention particulière :

- **Les membres d'un même ragdoll ne doivent pas se percuter.** Les capsules se
  chevauchent par construction ; sans groupes de collision dédiés (`GROUPS`),
  la simulation explose en quelques images.
- **La pose est pilotée en vitesse angulaire bornée**, pas en couple. Un
  asservissement en couple diverge dès que l'inertie des membres est faible.
- **Les frappes sont résolues balistiquement** (`ballisticVelocity`) vers un
  point du camp adverse, sinon la quasi-totalité des échanges finissent au filet.

## Test de fumée

```bash
npm run build
npm run preview &
npm run smoke    # joue des échanges au clavier, échoue sur toute erreur console
```

Il attend un Chromium ; sur un environnement sans navigateur installé par
Playwright, préciser `CHROMIUM_PATH=/chemin/vers/chrome`.

## Limites du MVP

Match en 1v1 uniquement, pas de mode 2v2 ni de coéquipier. Le service est
automatique (pas de placement manuel), et les parois latérales ne sont pas
distinguées du fond dans le calcul des fautes.
