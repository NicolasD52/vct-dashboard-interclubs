# Bilan de saison — interclubs VCT

Tableau de bord des équipes du Volant Club Toulousain en championnat interclubs.

**En ligne : https://vct-dashboard-interclubs.vercel.app**

Trois onglets : vue d'ensemble du club, tableau des joueuses et joueurs, fiche
par équipe. L'indicateur central compare les victoires réelles de chacun·e à
celles que son classement CPPH laissait attendre — battre plus fort rapporte
plus, perdre contre plus faible coûte plus. 100 % signifie « a gagné exactement
ce que son classement laissait attendre » : ce n'est pas un taux de victoire.

## Ajouter les résultats d'une rencontre

1. Ouvrir la page de la rencontre sur `icbad.ffbad.org`.
2. La clipper dans Obsidian avec le template « rencontre icbad » (`Alt+Shift+O`).
   La note peut aller n'importe où dans le coffre `VCT_obsi`.
3. Dans ce dossier :

```bash
npm run import
```

Le script relit tout le coffre et régénère `data/`. Il affiche un récapitulatif
par équipe en fin d'exécution — **c'est le moment de vérifier** : si une équipe
adverse apparaît dans la liste, ou si un compte de rencontres ne correspond pas,
quelque chose n'a pas été lu correctement.

4. Vérifier le rendu, puis publier :

```bash
npm run dev      # http://localhost:3000
npm run build    # doit passer avant de publier
git add -A && git commit -m "Ajouter les rencontres du <date>"
git push         # Vercel déploie automatiquement
```

> Si `npm` refuse de démarrer dans PowerShell (« l'exécution de scripts est
> désactivée sur ce système »), utiliser `npm.cmd` à la place de `npm`.

## Fin de saison

```bash
npm run calibrate
```

Réestime l'échelle CPPH (`SIGMA_CPPH`) sur les résultats réellement observés et
vérifie que le modèle prédit juste. Reporter la valeur obtenue dans
`lib/calculations/performanceVsRanking.ts` si elle a bougé.

Pour une nouvelle saison, rien de particulier à faire : le script range les
rencontres dans un dossier par saison, déduit de leur date.

## Réglages

Tout ce qui se règle est dans `lib/calculations/performanceVsRanking.ts`, avec
le raisonnement en commentaire :

| Constante | Rôle |
| --- | --- |
| `SIGMA_CPPH` | Écart de CPPH donnant 90 % de chances au favori |
| `SEUIL_FIABILITE` | Nombre de matchs minimum pour être classé |
| `MATCHS_DE_REFERENCE` | Force de l'atténuation des petits échantillons, au podium |

## Sous le capot

Next.js (App Router, TypeScript), déployé sur Vercel. Pas de base de données ni
d'import automatique : les rencontres sont des fichiers JSON versionnés dans
`data/`, validés par zod au chargement. Les notes d'implémentation et les pièges
connus sont dans `AGENTS.md` ; le raisonnement derrière chaque décision de
calcul est dans l'historique git.
