-- E-mails « nouvelle fiche disponible » envoyés aux résidents, et réponse de l'administration
-- à un signalement d'erreur.
-- Les envois sont dans une table à part : écrire dans formulaires_stage changerait modifie_le
-- et bloquerait l'annulation de l'import.

CREATE TABLE IF NOT EXISTS notifications_fiches (
    fiche_id INT NOT NULL,
    resident_id INT NOT NULL,
    envoye_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fiche_id),
    KEY idx_notifications_resident (resident_id),
    CONSTRAINT fk_notifications_fiche FOREIGN KEY (fiche_id)
        REFERENCES formulaires_stage (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE signalements
    ADD COLUMN reponse VARCHAR(500) DEFAULT NULL COMMENT 'réponse de l''administration, visible par le résident' AFTER traite_par;
