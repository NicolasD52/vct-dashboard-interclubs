<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dashboard interclubs — Volant Club Toulousain

Bilan de saison des équipes du club en championnat interclubs. Une page,
trois onglets (vue d'ensemble, joueur·ses, équipes). Pas de base de données,
pas d'authentification, pas d'import automatique : les données sont des JSON
versionnés dans `data/`.

Le propriétaire est le trésorier du club, pas un développeur : privilégier une
étape manuelle simple à une automatisation fragile.

## Chaîne de données

```
Page icbad.ffbad.org/rencontre/{id}
  → clip Obsidian (coffre ../VCT_obsi)      ← template dans l'extension, pas dans le dépôt
  → npm run import                          ← scripts/parse-clippings.mjs
  → data/saison-AAAA-AAAA/rencontre-{id}.json
  → lib/loadData.ts (validation zod + agrégation)
  → app/api/season/route.ts
  → app/page.tsx
```

`npm run import` **régénère intégralement** `data/` depuis le coffre : les
sorties précédentes sont effacées d'abord, pour qu'un clip supprimé ne laisse
pas de rencontre fantôme. Ne jamais éditer un JSON de `data/` à la main, il
serait écrasé au prochain import.

Le parser balaie tout le coffre et retient les notes dont le frontmatter porte
une `source:` icbad — l'arborescence Obsidian peut donc être réorganisée
librement.

## Pièges déjà rencontrés — ne pas les réintroduire

Chacun a produit des données **silencieusement fausses**, pas une erreur.
Le détail et les chiffres sont dans les messages de commit (`git log`).

- **Identité d'une équipe = son code (`31-VCT-4`), jamais l'id icbad.** icbad
  crée une entrée `/equipe/{id}` par phase (poule, barrages, petite finale) :
  s'y fier dédoublait les équipes. L'id icbad est conservé dans `icbadId`.
- **Le camp du club se déduit du code, jamais du nom.** icbad suffixe parfois
  le nom du club du numéro d'équipe (« Volant Club Toulousain - 4 »), parfois
  non. Comparer au nom nu attribuait une rencontre sur trois à l'adversaire.
  Le parser lève une erreur explicite s'il ne trouve aucune équipe du club.
- **En double, on compare paire contre paire.** `sideCpph` est la moyenne de la
  paire, pas le CPPH du joueur seul.
- **Classement et CPPH sont snapshotés par match**, jamais au niveau du joueur :
  ils varient selon la discipline et au fil de la saison.
- **Rattachement d'un joueur à une équipe = celle où il a le plus joué**, pas sa
  dernière rencontre (voir `mainTeamId`).
- **Matchs exclus des statistiques** : ceux sans vainqueur ni score (barrage
  arrêté dès qu'il est acquis) et les forfaits (un camp n'aligne personne — sans
  adversaire il n'y a pas de CPPH de référence). Ils restent comptés dans le
  score de la rencontre. L'import les liste en fin d'exécution.
- **`next.config.ts` : `outputFileTracingIncludes` doit inclure `./data/**/*`.**
  Sans cela le build Vercel passe mais les routes servent des données vides.

## Calcul

Toute la logique ajustable est isolée dans
`lib/calculations/performanceVsRanking.ts` — ni les routes ni l'affichage ne
doivent recalculer quoi que ce soit.

L'indicateur central est **la performance rapportée au classement** :
victoires réelles / victoires attendues × 100. **100 % = a gagné exactement ce
que son classement laissait attendre.** Ce n'est pas un taux de victoire : on
peut gagner beaucoup et rester sous 100 % si on était favori partout. Ne pas
présenter les deux comme interchangeables dans l'interface.

Les victoires attendues viennent d'un modèle logistique de type Elo sur l'écart
de CPPH. `npm run calibrate` réestime `SIGMA_CPPH` par maximum de vraisemblance
et vérifie la calibration ; à rejouer en fin de saison.

Le podium classe sur la performance **atténuée** (`computeAdjustedPerformance`),
qui ajoute des matchs fictifs au niveau attendu pour qu'une saison complète pèse
plus qu'une poignée de matchs réussis. Le tableau, lui, affiche la valeur brute.

## Commandes

```bash
npm run dev        # serveur local
npm run import     # coffre Obsidian -> data/*.json
npm run calibrate  # réestime SIGMA_CPPH sur data/
npm run build      # à passer avant tout push (Vercel déploie sur push)
```

Sur le poste de l'utilisateur, `npm` échoue dans PowerShell (stratégie
d'exécution) : utiliser `npm.cmd`. Ne pas lancer `Set-ExecutionPolicy` à sa
place, c'est un réglage de sécurité qui lui appartient.

## Déploiement

Push sur `main` → déploiement Vercel automatique.
Dépôt : https://github.com/NicolasD52/vct-dashboard-interclubs
Prod : https://vct-dashboard-interclubs.vercel.app

Le plan Hobby impose un dépôt sur compte personnel (pas d'organisation GitHub)
et un usage non commercial. L'identité git est configurée **localement au
dépôt**, avec l'adresse noreply GitHub — ne pas la passer en `--global`.
