-- Schéma de la plateforme des stages (MySQL 8 / MariaDB 10.5+).
-- Création d'une base vide : npm run db:init
-- InnoDB est indispensable : l'import Excel repose sur les transactions
-- et la suppression d'un résident supprime ses fiches (clé étrangère).

CREATE TABLE IF NOT EXISTS administrateurs (
    id INT NOT NULL AUTO_INCREMENT,
    login VARCHAR(50) NOT NULL,
    nom VARCHAR(100) DEFAULT NULL,
    mot_de_passe VARCHAR(255) NOT NULL COMMENT 'hash bcrypt',
    role ENUM('admin', 'lecture') NOT NULL DEFAULT 'admin' COMMENT 'lecture : consultation seule',
    actif TINYINT(1) NOT NULL DEFAULT 1,
    cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_administrateurs_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS residents (
    id INT NOT NULL AUTO_INCREMENT,
    cin VARCHAR(50) NOT NULL,
    nom_prenom VARCHAR(100) NOT NULL,
    specialite VARCHAR(100) NOT NULL DEFAULT 'Médecine de famille',
    faculte_origine VARCHAR(150) DEFAULT NULL,
    promotion INT DEFAULT NULL COMMENT 'année d''entrée en 1re année de résidanat',
    niveau INT DEFAULT NULL COMMENT 'utilisé seulement si la promotion est inconnue',
    email VARCHAR(255) DEFAULT NULL COMMENT 'renseigné par l''administration, jamais par le résident',
    otp_hash CHAR(64) DEFAULT NULL COMMENT 'HMAC-SHA256 du code, jamais le code en clair',
    otp_expires_at DATETIME DEFAULT NULL,
    otp_sent_at DATETIME DEFAULT NULL,
    otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_residents_cin (cin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS formulaires_stage (
    id INT NOT NULL AUTO_INCREMENT,
    resident_id INT NOT NULL,
    periode VARCHAR(10) NOT NULL COMMENT 'S1, S2, T1 à T4, R1, R2',
    annee YEAR NOT NULL,
    service VARCHAR(150) DEFAULT NULL,
    hopital VARCHAR(150) DEFAULT NULL,
    url_pdf VARCHAR(255) DEFAULT NULL,
    import_id INT DEFAULT NULL COMMENT 'import Excel qui a créé la fiche',
    modifie_le DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
        COMMENT 'dernière modification ; NULL si la fiche est telle qu''importée',
    PRIMARY KEY (id),
    UNIQUE KEY uq_stage_par_resident (resident_id, periode, annee),
    KEY idx_formulaires_import (import_id),
    CONSTRAINT fk_formulaires_resident FOREIGN KEY (resident_id)
        REFERENCES residents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS historique_imports (
    id INT NOT NULL AUTO_INCREMENT,
    filename VARCHAR(255) NOT NULL,
    imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    admin_login VARCHAR(50) DEFAULT NULL,
    semestre VARCHAR(2) DEFAULT NULL COMMENT 'S1 ou S2, détecté dans le fichier',
    annee YEAR DEFAULT NULL,
    residents_created INT NOT NULL DEFAULT 0,
    fiches_created INT NOT NULL DEFAULT 0,
    residents_vus INT NOT NULL DEFAULT 0 COMMENT 'résidents présents dans le registre',
    undo_data TEXT NOT NULL COMMENT 'JSON : résidents créés et résidents présents dans le registre',
    undone TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Chaque fiche générée par un résident lui-même (POST /api/generate-pdf)
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

-- Erreurs signalées par un résident sur une de ses fiches (hôpital, service, période…),
-- à traiter par le service des stages.
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
