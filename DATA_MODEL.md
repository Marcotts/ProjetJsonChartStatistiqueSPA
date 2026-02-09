### Modèle de Données (observé)

Cette page documente les schémas des 4 fichiers JSON et les champs utilisés par l’app.

#### 1) Champs communs (présents dans plusieurs fichiers)
- `TITREFRANCAIS` (string) — Titre FR, clé forte 1/5
- `TITREANGLAIS` (string) — Titre EN, clé forte 2/5
- `ANNEE` (string|number) — Année (normalisée en number), clé forte 3/5
- `DISQUEFRANCAIS` (string|null) — Lettre/identifiant disque FR (upper‑case), clé forte 4/5
- `DISQUEANGLAIS` (string|null) — Lettre/identifiant disque EN (upper‑case), clé forte 5/5
- `POCHETTE` (string|null) — Indice « header » pour les séries (si rempli)
- `AUDIOFRANCAIS` (string|null) — Lien VLC/local
- `AUDIOANGLAIS` (string|null) — Lien VLC/local
- `RESUME` (string|null) — Synopsis FR
- `ID` (number|null) — Identifiant source (non fiable comme clé globale)

Normalisation effectuée:
- `ANNEE` → number ou `null`
- `DISQUE*` → `A…Z` ou `null`
- Champs texte → `trim()`

Clé forte utilisée pour les jointures: `(TITREFRANCAIS, TITREANGLAIS, ANNEE, DISQUEFRANCAIS, DISQUEANGLAIS)`

#### 2) `RESUMES.json`
- But: Fournit des résumés textuels.
- Champs principaux: `TITREFRANCAIS`, `TITREANGLAIS`, `ANNEE`, `POCHETTE`, `DISQUEFRANCAIS`, `DISQUEANGLAIS`, `RESUME`
- Usage: indexé par clé forte pour enrichir `TOUSLESFILMS.json`.

#### 3) `TOUSLESFILMS.json`
- But: Catalogue films avec métadonnées.
- Champs additionnels observés (échantillon):
  - Genres/drapeaux: `ACT`, `ANIM`, `AVEN`, `DRAME`, `SCFI`, `DOC`, ... (valeur `"X"` si vrai, sinon null)
  - `NOTE` (string) — Note moyenne, à convertir en `number`
  - `NOMBREDEVOTEURS` (string) — Nb votes, convertir en `number`
  - `DUREE` (string) — Minutes, convertir en `number`
  - `PRODUCTEUR`, `ENVEDETTE` (string) — Crédits
  - `ADRESSERESUME` (string|number) — Pointeur vers un résumé (optionnel)
  - Nombreux tags additionnels (voir fichier complet)
- Usage: base des stats côté « films »; enrichi avec `RESUMES` si clé correspond.

#### 4) `SERIE1.json`, `SERIE2.json`
- But: Séries télé et documentaires.
- Convention:
  - Ligne « header de série »: `POCHETTE` rempli
  - Ligne « épisode »: `POCHETTE` vide et `TITREFRANCAIS`/`TITREANGLAIS` suffixés par `- 01 ...`, `- 02 ...`, etc.
- Champs additionnels: `ENDOUBLE`, `DERNIEREPISODEVISIONNE`, `ANNEESAISON`, `DERNIERESAISON`
- Usage: Comptage d’épisodes par série; inclusion des épisodes dans le `dataset` global (type `EPISODE`).

#### 5) Dataset global de l’app
- `dataset`: union de `TOUSLESFILMS` (type `FILM`) + épisodes `SERIE1/2` (type `EPISODE`).
- `series`:
  - `headers`: Map `baseSeriesTitle` → ligne header enrichie (`NBEPISODES`, `EPISODES[]`).
  - `episodes`: Map `baseSeriesTitle` → liste d’épisodes.

Notes:
- `baseSeriesTitle` retirant le suffixe ` - <num>` via regex: `^(.*?)(\s*-\s*\d{1,3}[^]*)$`
- Les headers ne sont pas comptés dans les agrégations volume (année, disques, langues) sauf demande contraire.


#### 6) `CATEGORIES.json`
- But: Dictionnaire des catégories/genres référencées par `TOUSLESFILMS.json`.
- Schéma par entrée:
  - `code` (string) — Code court, ex: `ACT`, `SCFI`, `EXTRATERRESTRE`.
  - `labelFR` (string) — Libellé affiché en français.
  - `descriptionFR` (string) — Brève description.
- Usage:
  - Lors de la normalisation des films, l’app construit pour chaque film une liste `GENRES` automatiquement en lisant les colonnes drapeaux actives (valeur non vide) dont le `code` est connu dans `CATEGORIES.json`.
  - Les agrégations « Genres / Catégories » s’appuient sur cette liste et comptent séparément Films vs Séries (selon `SERIE==='X'`).


#### 7) Agrégations dérivées pour la multi‑catégorisation (nouveau)
- `aggs.genreCounts` — Histogramme du nombre de catégories actives par titre (films uniquement).
  - Schéma: tableau d’objets `{ bucket: '0'|'1'|...|'9'|'9+', films: number, series: number, total: number }` (bins 0..9 et 9+).
  - Découpage « Films » vs « Séries » via le drapeau `SERIE==='X'` présent dans `TOUSLESFILMS.json`.
  - Usage: alimente la carte `chart-genre-counts` (barres empilées Films/Séries).
- `aggs.genreCooc` — Co‑occurrence de catégories (films uniquement) sur un Top N de catégories les plus fréquentes.
  - Schéma enrichi:
    - `labels`: `{ code: string, label: string }[]`
    - `counts`: `number[]` — fréquence simple par catégorie (alignée sur `labels`).
    - `totalFilms`: `number` — nombre total de films considérés dans le calcul.
    - `matrix`: `{ i: number, j: number, count: number, aCount: number, bCount: number, jaccard: number, lift: number, pmi: number }[]` — cellules; `i`/`j` sont des indices dans `labels`.
  - Notes:
    - `count` = |A ∩ B|; `aCount` = |A|; `bCount` = |B|.
    - `jaccard` = |A ∩ B| / |A ∪ B|; `lift` = (|A ∩ B| · N) / (|A| · |B|); `pmi` = log2(lift), avec gardes contre divisions par zéro.
  - Usage: alimente la heatmap `chart-genres-cooc` et la vue alternative « points/bulles ».

Notes:
- Les headers de séries (lignes `SERIE1/2` avec `POCHETTE` renseignée) ne sont pas utilisés ici; seules les lignes `__TYPE='FILM'` (issues de `TOUSLESFILMS.json`) sont considérées.
- La liste `GENRES[]` dérivée pour chaque film provient des colonnes drapeaux dont le `code` est défini dans `CATEGORIES.json`. Les codes sont en majuscules.
- Les résultats respectent les filtres globaux (année, texte, exigences FR/EN) appliqués dans l’UI.
