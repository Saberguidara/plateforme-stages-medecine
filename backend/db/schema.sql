-- Schéma de la plateforme des stages (MySQL 8 / MariaDB 10.5+).
-- Création d'une base vide : npm run db:init
-- InnoDB est indispensable : l'import Excel repose sur les transactions
-- et la suppression d'un résident supprime ses fiches (clé étrangère).

CREATE TABLE IF NOT EXISTS administrateurs (
    id INT NOT NULL AUTO_INCREMENT,
    login VARCHAR(50) NOT NULL,
    mot_de_passe VARCHAR(255) NOT NULL COMMENT 'hash bcrypt',
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
    residents_created INT NOT NULL DEFAULT 0,
    fiches_created INT NOT NULL DEFAULT 0,
    undo_data TEXT NOT NULL COMMENT 'JSON : identifiants des résidents créés par cet import',
    undone TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
