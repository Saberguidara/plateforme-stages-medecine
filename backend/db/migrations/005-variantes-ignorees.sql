-- Variantes d'écriture que l'administration a choisi de ne pas fusionner (« Ne pas fusionner ») :
-- la paire n'est plus proposée dans les variantes probables des hôpitaux et des services.
-- Les valeurs sont stockées sous leur forme normalisée (majuscules, sans accents ni ponctuation),
-- valeur_a < valeur_b, pour qu'une même paire n'existe qu'une fois.

CREATE TABLE IF NOT EXISTS variantes_ignorees (
    type ENUM('hopital', 'service') NOT NULL,
    valeur_a VARCHAR(150) NOT NULL,
    valeur_b VARCHAR(150) NOT NULL,
    ignore_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ignore_par VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (type, valeur_a, valeur_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
