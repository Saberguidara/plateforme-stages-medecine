-- Index des statistiques du tableau de bord (synthèse par semestre, téléchargements et e-mails par semaine).
-- Facultative pour le fonctionnement : sans elle, les mêmes requêtes sont seulement plus lentes.
ALTER TABLE formulaires_stage ADD KEY idx_formulaires_annee_periode (annee, periode);
ALTER TABLE telechargements ADD KEY idx_telechargements_date (telecharge_le);
ALTER TABLE notifications_fiches ADD KEY idx_notifications_date (envoye_le);
ALTER TABLE signalements ADD KEY idx_signalements_date (cree_le);
