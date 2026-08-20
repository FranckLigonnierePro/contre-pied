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

## Tests

```bash
npm run typecheck   # types
npm test            # arbitrage : comptage, égalité/avantage, fautes, fin de match
```

L'arbitrage (`src/game/rules.ts`) est de la logique pure, sans dépendance à
Three ni à Rapier : c'est la seule partie du jeu vérifiable sans navigateur, et
celle où une régression passe le plus facilement inaperçue.

## Test de fumée

```bash
npm run build
npm run preview &
npm run smoke    # joue des échanges au clavier, échoue sur toute erreur console
```

Il attend un Chromium ; sur un environnement sans navigateur installé par
Playwright, préciser `CHROMIUM_PATH=/chemin/vers/chrome`.

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

Match en 1v1 uniquement, pas de mode 2v2 ni de coéquipier. Le service est
automatique (pas de placement manuel), et les parois latérales ne sont pas
distinguées du fond dans le calcul des fautes.
