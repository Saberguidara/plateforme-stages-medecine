-- Annulation des actions depuis le journal : une action annulée garde sa ligne, marquée avec la date
-- et l'auteur de l'annulation ; l'annulation elle-même est une nouvelle ligne qui renvoie à l'action annulée.
ALTER TABLE journal_actions
    ADD COLUMN annule_le DATETIME DEFAULT NULL COMMENT 'NULL tant que l''action n''a pas été annulée',
    ADD COLUMN annule_par VARCHAR(50) DEFAULT NULL COMMENT 'login de l''administrateur qui a annulé',
    ADD COLUMN annulation_de INT DEFAULT NULL COMMENT 'pour une annulation : id de l''action annulée',
    ADD KEY idx_journal_entite (entite, entite_id);
