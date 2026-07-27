# Template Obsidian Web Clipper — rencontres icbad

Ce template vit dans l'extension du navigateur, donc **nulle part sur disque**.
Il est consigné ici pour pouvoir être refait en quelques minutes en cas de
changement de poste ou de réinstallation.

Il s'applique aux pages `https://icbad.ffbad.org/rencontre/*`.
Raccourci de clip rapide : `Alt+Shift+O`.

## Champ « Content »

Uniquement ceci, rien d'autre :

```
{{selectorHtml:div.uk-hidden\@m.uk-width-1-1}}
```

## Propriété `cpph`

Champ séparé, **pas** dans Content :

```
{{selector:div[class*="uk-hidden"] .ic-match-clsmt?data-cote|join:", "}}
```

Plus les propriétés standard : `title`, `source`, `author`, `published`,
`created`, `description`, `tags`.

`source` et `title` ne sont pas décoratifs : l'import s'appuie sur `source` pour
reconnaître une note de rencontre et sur `title` pour la date.

## Pourquoi ces sélecteurs

La page rend **deux fois** les mêmes matchs — design responsive UIkit, une
version desktop (`uk-visible@m`) et une version mobile (`uk-hidden@m`), toutes
deux présentes dans le DOM. On ne garde que la version mobile, plus lisible et
plus simple à parser.

- Le `@` doit être échappé : `uk-hidden\@m`.
- `div[class*="uk-hidden"]` seul matche 3 éléments (dont le menu de langue et
  les icônes sociales), d'où la classe complète dans Content.
- Le CPPH n'existe que dans l'attribut `data-cote`, invisible dans le texte
  rendu : d'où la propriété séparée qui va le chercher par attribut.
- Syntaxe des filtres du clipper : `|filtre:"arg"`, jamais `filtre(arg)`.
