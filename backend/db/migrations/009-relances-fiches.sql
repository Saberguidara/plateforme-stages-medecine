-- Rappels envoyés aux résidents qui n'ont pas téléchargé une fiche déjà annoncée par e-mail
-- (une ligne par fiche et par rappel). Sans cette table, la plateforme affiche les délais
-- mais ne propose pas d'envoyer de rappel.
CREATE TABLE IF NOT EXISTS relances_fiches (
    id INT NOT NULL AUTO_INCREMENT,
    fiche_id INT NOT NULL,
    resident_id INT NOT NULL,
    envoye_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_relances_fiche (fiche_id, envoye_le),
    CONSTRAINT fk_relances_fiche FOREIGN KEY (fiche_id)
        REFERENCES formulaires_stage (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
