-- Refonte de l'espace administration :
-- comptes nominatifs avec rôle, journal des actions, suivi des téléchargements,
-- date de modification des fiches (contrôle de l'annulation d'un import)
-- et informations détectées à l'import (semestre, résidents présents dans le registre).

ALTER TABLE administrateurs
    ADD COLUMN nom VARCHAR(100) DEFAULT NULL AFTER login,
    ADD COLUMN role ENUM('admin', 'lecture') NOT NULL DEFAULT 'admin' AFTER mot_de_passe,
    ADD COLUMN actif TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
    ADD COLUMN cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER actif,
    ADD COLUMN derniere_connexion DATETIME DEFAULT NULL AFTER cree_le;

ALTER TABLE formulaires_stage
    ADD COLUMN modifie_le DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
        COMMENT 'dernière modification ; NULL si la fiche est telle qu''importée'
        AFTER import_id;

ALTER TABLE historique_imports
    ADD COLUMN admin_login VARCHAR(50) DEFAULT NULL AFTER imported_at,
    ADD COLUMN semestre VARCHAR(2) DEFAULT NULL COMMENT 'S1 ou S2, détecté dans le fichier' AFTER admin_login,
    ADD COLUMN annee YEAR DEFAULT NULL AFTER semestre,
    ADD COLUMN residents_vus INT NOT NULL DEFAULT 0 COMMENT 'résidents présents dans le registre' AFTER fiches_created;

CREATE TABLE IF NOT EXISTS journal_actions (
    id INT NOT NULL AUTO_INCREMENT,
    cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    admin_id INT DEFAULT NULL,
    admin_login VARCHAR(50) DEFAULT NULL COMMENT 'conservé si le compte est supprimé',
    action VARCHAR(30) NOT NULL COMMENT 'creation, modification, suppression, import, annulation, fusion',
    entite VARCHAR(30) NOT NULL COMMENT 'resident, fiche, import, administrateur, referentiel',
    entite_id INT DEFAULT NULL,
    resident_id INT DEFAULT NULL COMMENT 'dossier concerné, pour l''afficher dans le dossier résident',
    avant JSON DEFAULT NULL,
    apres JSON DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_journal_resident (resident_id, cree_le),
    KEY idx_journal_date (cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telechargements (
    id INT NOT NULL AUTO_INCREMENT,
    fiche_id INT NOT NULL,
    resident_id INT NOT NULL,
    telecharge_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_telechargements_resident (resident_id),
    KEY idx_telechargements_fiche (fiche_id),
    CONSTRAINT fk_telechargements_fiche FOREIGN KEY (fiche_id)
        REFERENCES formulaires_stage (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
