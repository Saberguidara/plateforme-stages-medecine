-- Signalement d'erreur sur une fiche par le résident, visible dans le tableau de bord.
CREATE TABLE IF NOT EXISTS signalements (
    id INT NOT NULL AUTO_INCREMENT,
    fiche_id INT NOT NULL,
    resident_id INT NOT NULL,
    motif VARCHAR(20) NOT NULL COMMENT 'hopital, service, periode, autre',
    message VARCHAR(500) DEFAULT NULL,
    cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    traite_le DATETIME DEFAULT NULL COMMENT 'NULL tant que le signalement est ouvert',
    traite_par VARCHAR(50) DEFAULT NULL COMMENT 'login de l''administrateur',
    PRIMARY KEY (id),
    KEY idx_signalements_ouverts (traite_le, cree_le),
    KEY idx_signalements_fiche (fiche_id),
    CONSTRAINT fk_signalements_fiche FOREIGN KEY (fiche_id)
        REFERENCES formulaires_stage (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
