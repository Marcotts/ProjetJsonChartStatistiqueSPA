### Journal de bord (build-it, try-it, learn)

- 2026-02-08 10:05 — Initialisation du projet SPA statique. Création `index.html`, `src/logger.js`, `src/dataLoader.js`, `src/charts.js`, `src/main.js`.
- 2026-02-08 10:08 — Documentation `README.md`, `DECISIONS.md`, `DATA_MODEL.md`. Ajout de logs détaillés dans data loader et charts.
- 2026-02-08 10:10 — Heuristiques série: `POCHETTE`=header; parsing titres d’épisodes par regex. Agrégations: par année, disques, langues, top séries.
- 2026-02-08 10:12 — Filtres et recalculs dynamiques, KPI dynamiques. Instructions `python -m http.server`.
- 2026-02-08 15:15 — Ajout `CATEGORIES.json` (dictionnaire des genres). Normalisation films → `GENRES[]`. Agrégation et graphique « Genres/Catégories (Films vs Séries) ». Rendu + filtres intégrés. 
- TODO — Ajouter graphiques avancés (notes, durée), drill‑down au clic, export CSV.
- TODO — Décider inclusion des headers de séries dans stats année/disques/langues.
- TODO — Politique de dédoublonnage lorsque certaines parties de la clé forte sont nulles.

- 2026-02-08 15:40 — Multi‑catégories: ajout heatmap de co‑occurrence (Top N) et histogramme du nombre de catégories par titre. Drill‑down universel au clic (toutes les cartes) + export CSV. Docs mises à jour (README, DATA_MODEL, DECISIONS).
- 2026-02-08 16:02 — Ajustement histogramme « Nombre de catégories par titre »: bins 0..9 et 9+ (au lieu de 0..13 et 13+). Seuils de drill‑down alignés. Ajout d’un encart « Où en étions‑nous ? » dans README pour reprise rapide demain.
- 2026-02-08 16:17 — Amélioration co‑occurrence: agrégation enrichie (count, Jaccard, Lift, PMI), heatmap recolorée (palette perceptuelle), tooltips détaillées; ajout d’une vue « Points/Bulles » alternative; contrôles UI (vue, métrique, masquer diagonale, Exclure DRAME). Docs mises à jour (README, DATA_MODEL, DECISIONS).
- 2026-02-08 16:38 — Correctif UX co‑occurrence: si aucune cellule/aucun point n’est affichable, afficher un message explicite dans le graphe et journaliser des `INFO` prouvant la présence de données (tailles payload, cellules/points visibles, options actives) + `WARN` « chart … vide ». Pré‑rendu logué dans `main.js`.
- 2026-02-08 16:46 — Correctif co‑occurrence: ajout d’un fallback auto vers la vue « Points » quand la Heatmap n’a aucune cellule visible malgré des données (ex.: diagonale masquée + Top N trop petit). Journalisation pré‑rendu consolidée. README mis à jour. Rafraîchissement du navigateur suffisant si le serveur tourne.

- 2026-02-08 16:52 — Simplification UI co‑occurrence: retrait de tous les contrôles sauf « Exclure DRAME ». Valeurs par défaut: Heatmap + Jaccard, diagonale visible. Fallback automatique vers Points conservé. Docs mises à jour (README, DECISIONS).
- 2026-02-08 17:05 — Accompagnement: logs UI au démarrage, bouton « Ping Journal », diagnostics co‑occurrence (labels/cellules), fallback forcé vers Points+Compte+Diagonale si nécessaire. README mis à jour.
- 2026-02-08 17:25 — Ping Journal enrichi: ajout du calcul et log de l’intersection HOR ∩ SCFI (Horreur ∩ Science‑fiction) respectant les filtres actifs: |HOR|, |SCFI|, |HOR∩SCFI|, |HOR∪SCFI|, Jaccard, Lift, PMI, totalFilms, échantillon de titres.
- 2026-02-08 21:32 — Co‑occurrence: Tooltips enrichis (|A|, |B|, |A∩B|, |A∪B|, % du total), réduction des bordures (0.3px, sans flou d’emphase), splitLines allégés; correction des artefacts de bordure au survol.
- 2026-02-08 21:45 — Modale drill‑down: correction UX (focus, backdrop, Échap, scroll‑lock) + sélecteur « Tous/Films/Séries » visible si mélange de types; export CSV respecte le filtre. README/DECISIONS mis à jour.
