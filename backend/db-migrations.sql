-- ============================================================
-- SCRIPT SQL D'AMÉLIORATIONS — PLATEFORME STAGES MÉDECINE
-- À exécuter UNE SEULE FOIS dans phpMyAdmin ou MySQL CLI
-- ============================================================

-- BUG-3 : Contrainte unique pour éviter les doublons de fiches lors des réimports Excel
-- (s'assure qu'un résident ne peut pas avoir deux fiches pour la même période/année)
ALTER TABLE formulaires_stage
    ADD UNIQUE KEY unique_stage_per_resident (resident_id, periode, annee);

-- PERF-4 : Index sur residents.cin pour accélérer les recherches (requête la plus fréquente)
ALTER TABLE residents
    ADD UNIQUE INDEX idx_cin (cin);

-- PERF-4 : Index sur formulaires_stage.resident_id (clé étrangère, used in JOIN/WHERE)
ALTER TABLE formulaires_stage
    ADD INDEX idx_resident_id (resident_id);

-- ============================================================
-- VÉRIFICATION : Afficher les index créés
-- ============================================================
SHOW INDEX FROM residents;
SHOW INDEX FROM formulaires_stage;
