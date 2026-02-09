### Projet JSON Chart Statistique SPA

Ce projet est une application web statique (SPA) servant des tableaux de bord interactifs sur vos données H2 exportées en JSON : `RESUMES.json`, `SERIE1.json`, `SERIE2.json`, `TOUSLESFILMS.json`, `CATEGORIES.json`.

#### Où en étions‑nous ?
- État au 2026-02-08 21:32: Tooltips de co‑occurrence enrichis + bordures affinées.
  - Carte « Co‑occurrence de Catégories (Top N) »: seul le bouton « Exclure DRAME » est visible. Vue par défaut Heatmap/Jaccard; fallback auto vers Points si nécessaire.
  - Colorimétrie: échelle maintenant « adaptive » — si la matrice est très dense ou la plage très étroite, on passe en `piecewise` (quantiles) pour créer des paliers de couleurs perceptibles; sinon, on garde une échelle continue. La diagonale est incluse visuellement mais exclue du calcul des seuils pour éviter d’écraser le contraste.
  - Tooltips (Heatmap & Points) affichent désormais clairement: |A|, |B|, |A∩B|, |A∪B| + % du total films pour |A| et |B|, puis Jaccard / Lift / PMI.
  - Bordures de cellules réduites (0.3px), couleur adoucie, suppression du flou d’emphase pour éviter les « résidus de bordure » visibles à distance lors du survol.
  - Bouton « Ping Journal »: stats générales + intersection « Horreur ∩ Science‑fiction » (HOR ∩ SCFI) selon filtres.
  - Journal d’accompagnement au démarrage toujours présent.
- La carte « Nombre de catégories par titre » (id `chart-genre-counts`) reste en classes 0..9 et `9+`.
- Après mise à jour, faites un rafraîchissement dur (Ctrl+F5). Si le serveur local est arrêté, relancez‑le (voir plus bas).

#### Stack
- HTML statique
- JavaScript Vanilla (ES modules)
- Tailwind CSS (CDN)
- Apache ECharts (CDN)
- JSON locaux
- Petit serveur HTTP local

#### Lancer en local (Windows PowerShell)
1. Ouvrez ce dossier dans IntelliJ Idea.
2. Servez le site depuis la racine du projet avec Python (nécessaire car `fetch` ne fonctionne pas en file://) :
   ```powershell
   cd C:\Users\sthev\ProjetJsonChartStatistiqueSPA
   python -m http.server 8080 --bind 127.0.0.1
   ```
3. Ouvrez http://127.0.0.1:8080 dans le navigateur.

Alternative via Node (si installé) :
```powershell
npx http-server -p 8080 -a 127.0.0.1 --cors
```

#### Fonctionnalités actuelles
- Chargement des 4 fichiers JSON via `fetch` (pas de cache) avec logs détaillés.
- Normalisation & fusion des jeux de données (clés fortes : `TITREFRANCAIS`, `TITREANGLAIS`, `ANNEE`, `DISQUEFRANCAIS`, `DISQUEANGLAIS`).
- Détection header/épisodes dans `SERIE1/2` via `POCHETTE` rempli (header) et titres d’épisodes (`- 01`, `- 02`, ...).
- Enrichissement des films avec `RESUMES.json` quand clé correspond.
- Tableaux de bord initiaux :
  - Comptes par année
  - Répartition par disques (FR/EN) — barres empilées Films/Séries; les séries sont comptées comme séries uniques par disque; `—` indique une valeur manquante
  - Disponibilité langues (FR/EN/Aucun)
  - Top séries par nombre d’épisodes
  - Genres / Catégories (Films vs Séries), basé sur les colonnes drapeaux de `TOUSLESFILMS.json` et mappé via `CATEGORIES.json`
- Filtres interactifs (année min/max, recherche texte, exigence FR/EN).
- KPIs en tête mis à jour dynamiquement.
- Journal UI + console riche en logs.

#### Structure
- `index.html` — mise en page, containers de graphiques.
- `src/logger.js` — logger unifié (console + UI).
- `src/dataLoader.js` — chargement, normalisation, fusion, agrégations.
- `src/charts.js` — configuration ECharts.
- `src/main.js` — orchestration, filtres et rendu.

#### Cartes du dashboard (IDs pour communication)
- Par année — id: `chart-by-year`
- Disques FR/EN (Films/Séries empilés) — id: `chart-discs`
- Langues (FR+EN / FR seul / EN seul / Aucun) — id: `chart-lang`
- Top séries par nombre d’épisodes — id: `chart-top-series`
- Genres / Catégories (Films vs Séries) — id: `chart-genres`
- Co‑occurrence de Catégories (Top N, heatmap) — id: `chart-genres-cooc`
- Nombre de catégories par titre (histogramme, bins 0..9 et 9+) — id: `chart-genre-counts`

#### Drill‑down universel (nouveau)
- Cliquez sur n’importe quelle barre/secteur/case de heatmap pour ouvrir une liste détaillée des titres correspondants.
- Détails affichés: Type, Titre FR/EN, Année, Disques FR/EN, Genres actifs.
- Bouton « Export CSV » pour enregistrer la sélection courante.

#### Prochaines étapes proposées
- Ajouter des graphiques supplémentaires (durée, note, genres dans `TOUSLESFILMS.json`).
- Ajouter un panneau de détails au clic sur un point/barre (liste des titres associés).
- Export CSV des données filtrées.
- Préserver filtres via querystring.
- Thème clair/sombre bascule.

#### Questions ouvertes
- Souhaitez‑vous appliquer des règles de dédoublonnage si la clé forte n’est pas entièrement renseignée (ex : `DISQUEANGLAIS` null) ?
- Faut‑il inclure les headers de série dans les stats « par année » ou seulement les épisodes ?
- Quelles priorités de KPIs souhaitez‑vous (top langue, top disques, couverture des résumés, etc.) ?



#### Mise à jour 2026-02-08 20:47 — Heatmap « jeu de dame » corrigée
- La carte « Co‑occurrence de Catégories (Top N) » affichait des bandes alternées par rangées/colonnes (effet « jeu de dame ») sans variation d’intensité.
- Correctif appliqué dans `src/charts.js`:
  - Suppression des `splitArea` sur les axes X/Y (qui dessinaient les bandes de fond).
  - Ajout de `splitLine` discrets pour le repère visuel.
  - Renforcement du `itemStyle` de la série heatmap (opacité, fin liseré) pour laisser s’exprimer l’échelle de couleurs (Viridis‑like).
- Résultat: la couleur varie maintenant par intensité (Jaccard par défaut), sans motif rayé parasite. Tooltips et drill‑down restent actifs.
- Pour voir la modification: rafraîchissement dur (Ctrl+F5). Si le serveur local a été arrêté, relancez‑le (voir plus haut).


#### Mise à jour 2026-02-08 21:09 — Heatmap toute noire corrigée
- Symptôme: la heatmap « Co‑occurrence de Catégories (Top N) » apparaissait toute noire, avec seulement quelques pixels très vifs.
- Cause racine: `visualMap` ne ciblait pas explicitement la dimension de valeur (3e position dans `[x,y,val]`), ce qui classait la plupart des cellules en dehors de l’échelle de couleurs.
- Correctif: `visualMap.dimension = 2` (valeur) sur les modes piecewise et continu + style `outOfRange` lisible (pas d’écran noir). Les calques d’état vide restent silencieux et nettoyés avant rendu.
- Validation: le Journal affiche désormais `Co‑occurrence — visualMap piecewise (quantiles) sélectionné` (ou continu) avec les seuils; visuellement, l’intensité est bien perceptible, tooltips et clic (drill‑down) fonctionnent.
