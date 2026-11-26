-- Registre complet du résidanat (promotions 2024 à 2026) :
-- - stages de 45 jours (ORL et dermatologie à Tunis) : périodes T1A à T4B, une fiche par moitié de trimestre ;
-- - stages en parallèle (deux CSB sur le même semestre, psychiatrie de 6 mois en même temps qu'un trimestre) :
--   un résident peut avoir plusieurs fiches sur une même période, pourvu que le service ou l'hôpital diffère.
-- La nouvelle clé est créée avant la suppression de l'ancienne : la clé étrangère sur resident_id
-- garde toujours un index utilisable.
ALTER TABLE formulaires_stage
    ADD UNIQUE KEY uq_stage_par_resident_service (resident_id, annee, periode, service, hopital);

ALTER TABLE formulaires_stage
    DROP INDEX uq_stage_par_resident,
    MODIFY periode VARCHAR(10) NOT NULL COMMENT 'S1, S2, T1 à T4, T1A à T4B (45 jours), R1, R2';
