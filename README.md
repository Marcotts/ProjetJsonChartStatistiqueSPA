### Projet JSON Chart Statistique SPA

Ce projet est une application web statique (SPA) servant des tableaux de bord interactifs sur vos données H2 exportées en JSON : `RESUMES.json`, `SERIE1.json`, `SERIE2.json`, `TOUSLESFILMS.json`, `CATEGORIES.json`.

#### Où en étions‑nous ?
- État au 2026-02-08 20:23: correctif clic/drill‑down co‑occurrence.
  - Carte « Co‑occurrence de Catégories (Top N) »: seul le bouton « Exclure DRAME » est visible. Vue par défaut Heatmap/Jaccard; fallback auto vers Points si nécessaire. Nouveau: un « driver de clic manuel » convertit le clic pixel → cellule (i,j) et ouvre toujours le drill‑down même si l’événement série ECharts ne se déclenche pas.
  - Tooltips durcies (trigger item, triggerOn mousemove|click) + « manual hover driver » déjà actif.
  - Bouton « Ping Journal »: affiche les stats générales et le détail de l’intersection « Horreur ∩ Science‑fiction » (HOR ∩ SCFI) selon filtres.
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
