-- Met à niveau une base créée avant db/schema.sql (base WAMP locale).
-- Une base neuve n'en a pas besoin : npm run db:init crée directement le bon schéma.

ALTER TABLE administrateurs ENGINE=InnoDB;
ALTER TABLE residents ENGINE=InnoDB;
ALTER TABLE formulaires_stage ENGINE=InnoDB;
ALTER TABLE historique_imports ENGINE=InnoDB;

-- Index en double sur les mêmes colonnes
ALTER TABLE residents DROP INDEX idx_cin, DROP INDEX idx_residents_cin;
ALTER TABLE residents RENAME INDEX cin TO uq_residents_cin;
ALTER TABLE formulaires_stage DROP INDEX idx_formulaires_resident_id, DROP INDEX idx_resident_id;
ALTER TABLE formulaires_stage RENAME INDEX unique_stage_per_resident TO uq_stage_par_resident;

-- OTP haché avec compteur d'essais ; colonnes de réinitialisation jamais utilisées
ALTER TABLE residents
    DROP COLUMN otp_code,
    DROP COLUMN reset_token,
    DROP COLUMN reset_expires,
    ADD COLUMN otp_hash CHAR(64) DEFAULT NULL AFTER email,
    ADD COLUMN otp_sent_at DATETIME DEFAULT NULL AFTER otp_expires_at,
    ADD COLUMN otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER otp_sent_at;

-- Fiches orphelines (résident supprimé sans transaction) avant d'ajouter la clé étrangère
DELETE f FROM formulaires_stage f LEFT JOIN residents r ON r.id = f.resident_id WHERE r.id IS NULL;

ALTER TABLE formulaires_stage
    ADD COLUMN import_id INT DEFAULT NULL AFTER url_pdf,
    ADD KEY idx_formulaires_import (import_id),
    ADD CONSTRAINT fk_formulaires_resident FOREIGN KEY (resident_id)
        REFERENCES residents (id) ON DELETE CASCADE;
