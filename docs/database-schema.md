# Schema de base de donnees

## Vue d'ensemble
- Base par defaut: `gestion_stages`
- Tables observees dans le code: `administrateurs`, `residents`, `formulaires_stage`
- Source: requetes SQL dans le backend

## Table `administrateurs`
Colonnes observees:
- `id`
- `login`
- `mot_de_passe`

Usage:
- authentification administrateur

## Table `residents`
Colonnes observees:
- `id`
- `cin`
- `nom_prenom`
- `specialite`
- `faculte_origine`
- `niveau`
- `promotion`
- `email`
- `otp_code`
- `otp_expires_at`

Usage:
- authentification OTP resident
- consultation dossier resident
- CRUD resident
- import Excel

## Table `formulaires_stage`
Colonnes observees:
- `id`
- `resident_id`
- `periode`
- `annee`
- `service`
- `hopital`
- `url_pdf`

Usage:
- import des affectations
- consultation admin/resident
- creation / modification / suppression de fiches
- generation PDF

## Relations logiques
- `formulaires_stage.resident_id` reference `residents.id`

## Contraintes recommandees
- index unique: `residents.cin`
- index: `formulaires_stage.resident_id`
- cle etrangere: `formulaires_stage.resident_id -> residents.id`

## Incertitudes
- Les types SQL exacts ne sont pas versionnes dans le depot.
- Les contraintes de nullabilite ne sont pas explicites.
- Aucun fichier de migration/schema SQL complet n'est present.
