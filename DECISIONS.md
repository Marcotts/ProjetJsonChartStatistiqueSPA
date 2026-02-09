### Décisions d’Architecture & Démarche

Objectif: Construire un dashboard statique pour explorer des statistiques issues de 4 exports JSON H2: `RESUMES.json`, `SERIE1.json`, `SERIE2.json`, `TOUSLESFILMS.json`.

#### 1) Stack retenue
- HTML statique unique (`index.html`), pas de framework.
- ES6 Modules (fichiers JS en `src/`).
- Tailwind CSS en CDN (zéro build-tool).
- Apache ECharts en CDN pour graphiques.
- Petit serveur HTTP local (Python `http.server`).

Justification: Démarrage ultra‑rapide, aucune étape de build, facile à partager.

#### 2) Clé forte et normalisation
- Clé forte: `TITREFRANCAIS`, `TITREANGLAIS`, `ANNEE`, `DISQUEFRANCAIS`, `DISQUEANGLAIS`.
- Normalisation:
  - `TITREFRANCAIS`, `TITREANGLAIS` trim.
  - `ANNEE` → nombre ou `null`.
  - `DISQUE*` → upper‑case, string ou `null`.
  - Valeurs audiovisuelles (`AUDIO*`) conservées si non vides.
- Fusion: `TOUSLESFILMS` enrichi par `RESUMES` via clé forte si résumé disponible.

Raison: Alignement avec votre consigne de « clé forte » entre les fichiers.

#### 3) Séries: header vs épisodes
- Heuristique: ligne avec `POCHETTE` renseignée = header de série.
- Les épisodes ont des titres du type `Série - 01 ...`; on dérive un `baseSeriesTitle` en retirant le suffixe `- <num>`.
- Construction: map headers et liste d’épisodes par baseTitle; ajout `NBEPISODES`.

#### 4) Jeu de données global
- `dataset` = Films (`TOUSLESFILMS`) + Épisodes (`SERIE1` + `SERIE2`) avec `__TYPE` (`FILM`/`EPISODE`).
- Les headers de séries sont exclus des agrégations orientées « volumes d’éléments »; le graphique « Top séries » s’appuie sur `NBEPISODES`.

#### 5) Graphiques
- Par Année (barres)
- Répartition Disques FR/EN (barres empilées Films/Séries)
- Disponibilité Langues (camembert FR+EN / FR seul / EN seul / Aucun)
- Top Séries par nombre d’épisodes (barres horizontales)
- Genres / Catégories (barres horizontales empilées Films vs Séries) — basé sur `CATEGORIES.json` et les colonnes drapeaux de `TOUSLESFILMS.json`
- Co‑occurrence de Catégories (heatmap Top N) — visualise les couples de catégories fréquemment associés sur un même film
- Nombre de catégories par titre (histogramme empilé Films/Séries) — distribution 0..9 et 9+

#### 6) Filtres & KPIs
- Filtres: année min/max, recherche texte (FR/EN), exigences FR/EN (cases à cocher).
- KPIs: total éléments, titres uniques, % avec résumé, % avec audio (FR+EN moyens).
- Application des filtres recalculant agrégations (sauf Top Séries pour l’instant — global).

#### 7) Journalisation
- `src/logger.js`: logs niveau DEBUG/INFO/WARN/ERROR vers console + panneau « Journal ».
- Traçage des temps de chargement, volumes, agrégations et actions utilisateur (filtres).

#### 8) Ouvertures / Itérations prévues
- Dédoublonnage optionnel quand des champs de la clé forte sont nuls.
- Inclusion/exclusion des headers de séries selon besoin métier.
- Graphiques avancés: durée, note, genres (`TOUSLESFILMS`).
- Détails au clic (drill‑down) + export CSV.

#### 9) Hypothèses et risques
- L’heuristique `POCHETTE` = header est conforme à votre description de la donnée.
- `baseSeriesTitle` par regex peut rater certains cas exotiques; ajustable.
- `fetch` nécessite un serveur local (pas de `file://`).

#### 10) Visualisation de co‑occurrence (mise à jour 2026‑02‑08 16:17)
- Problème: la heatmap basée sur le compte brut n’offrait pas assez de contraste pour les faibles valeurs; la catégorie DRAME dominait fortement.
- Décision:
  - Conserver la Heatmap comme vue par défaut mais colorer par indice de similarité Jaccard (meilleure normalisation des co‑occurrences).
  - Ajouter une vue alternative « Points/Bulles » (scatter) avec taille ∝ √(compte) et couleur paramétrable (Jaccard/Compte/Lift/PMI).
  - Palette perceptuelle (type Viridis) pour distinguer finement les faibles valeurs.
  - Contrôles UI: bascule Heatmap|Points, sélecteur de métrique, « Masquer diagonale », bouton toggle « Exclure DRAME ».
- Impact: meilleure lisibilité des co‑occurrences rares; possibilité de neutraliser l’effet « catégorie dominante » sans perdre l’information.


#### 11) Simplification des contrôles co‑occurrence (2026-02-08 16:52)
- Pour alléger l’UI et éviter les confusions, tous les contrôles de la carte « Co‑occurrence de Catégories (Top N) » ont été retirés sauf « Exclure DRAME ».
- Valeurs par défaut conservées côté moteur: Vue=Heatmap, Couleur=Jaccard, Masquer diagonale=désactivé. Un fallback automatique bascule en Points si la Heatmap n’a aucune cellule visible; ce comportement reste actif sans bouton dédié.

#### 12) UX de la modale de drill‑down (2026-02-08 21:45)
- Problème: ouverture de la modale figeant l’écran, avec interactions passant encore en arrière‑plan (pas de focus/scroll lock) et absence de sélection « Films/Séries » dans la liste.
- Décisions:
  - Capturer le focus dans la modale; verrouiller le scroll de l’arrière‑plan; permettre fermeture via clic sur le backdrop et touche Échap.
  - Étendre la modale avec un sélecteur de type (pills « Tous / Films / Séries ») visible uniquement si les deux types sont présents dans la sélection.
  - L’export CSV utilise la vue filtrée courante.
- Justification: conventions UX modales (accessibilité et prévention des interactions fantômes) + besoin d’exploration rapide entre films et épisodes.

#### 13) Bascule du contenu du tooltip co‑occurrence (2026-02-08 22:01)
- Problème: l’info‑bulle de la Heatmap « Co‑occurrence » affiche des métriques utiles mais l’utilisateur veut basculer rapidement vers des nombres absolus (films/séries) et inversement.
- Décision:
  - Ajouter un mini‑sélecteur dans le tooltip: « Afficher: Nombres | Métriques ».
  - Par défaut, afficher « Nombres » (|A|, |B|, |A∩B|, |A∪B| + % du total). « Métriques » affiche Jaccard, Lift, PMI, avec rappel des comptes.
  - Implémentation via liens dans le tooltip (`data-cooc-tipmode`) + bridge DOM → événement `window('cooc-tooltip-mode')` → mise à jour d’un état global `state.cooc.tooltipMode` conservé pendant la session.
- Justification: répondre au besoin d’analyse tant volumétrique (comptes) que relative (métriques) sans alourdir l’UI principale; contrôle au plus près du geste (dans l’info‑bulle).
