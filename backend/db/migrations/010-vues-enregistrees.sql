-- Vues enregistrées : un écran de l'administration avec ses filtres, nommé et partagé dans l'équipe
-- (liste des résidents, statistiques, parcours). Sans cette table, le bouton « Enregistrer la vue »
-- indique que la fonction n'est pas encore activée.
CREATE TABLE IF NOT EXISTS vues_enregistrees (
    id INT NOT NULL AUTO_INCREMENT,
    nom VARCHAR(80) NOT NULL,
    ecran VARCHAR(30) NOT NULL COMMENT 'residents, statistiques, parcours',
    parametres TEXT NOT NULL COMMENT 'JSON : paramètres de l''adresse',
    cree_par VARCHAR(50) DEFAULT NULL COMMENT 'login de l''administrateur',
    cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_vues_ecran (ecran, nom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
