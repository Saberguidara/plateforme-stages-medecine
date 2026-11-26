# Déploiement de novembre 2026

État vérifié le 26/11/2026. Cette liste se suit dans l'ordre : chaque phase suppose la précédente terminée.
Les étapes marquées **[manuel]** se font dans un navigateur (Render, GitHub, la plateforme) ; les autres sont des commandes.

## Ce qui part en production

| Branche | Commits | Sur GitHub | Contenu |
|---|---|---|---|
| `master` | jusqu'à `4e8db97` | oui | version en production aujourd'hui (à confirmer, étape 0.1) |
| `feat/registre-complet-refonte-admin` | +4 (`1409f77` … `9bede47`) | oui | registre complet, stages de 45 jours et en parallèle, refonte de l'administration, journal avec annulation |
| `claude/admin-dashboard-redesign-298257` | +5, puis ce document | **non** | tableau de bord, module Statistiques, Parcours, Diffusion et rappels, Qualité, palette Ctrl+K, vues enregistrées, rapport PDF, cloche |

La troisième branche contient la deuxième : fusionner la troisième dans `master` apporte tout (simple avance, sans conflit).

Aucune nouvelle variable d'environnement n'est nécessaire sur Render. `jszip` passe dans les dépendances de production (déjà géré par `npm run build`).

## Migrations

| Migration | Rôle | Base locale | Production | Obligatoire ? |
|---|---|---|---|---|
| 001 à 004 | historique | ✅ | ✅ (supposé) | — |
| 005-variantes-ignorees | bouton « Ne pas fusionner » | ✅ | ⏳ | oui |
| 006-stages-paralleles-45-jours | stages en parallèle, périodes T1A–T4B | ✅ | ⏳ | **oui, avant le nouveau code** |
| 007-journal-annulation | annulation depuis le journal | ✅ | ⏳ | **oui, avant le nouveau code** (sinon Historique et annulation d'import échouent) |
| 008-index-statistiques | index (vitesse des statistiques) | ⏳ | ⏳ | non, recommandée |
| 009-relances-fiches | rappels « fiche non téléchargée » | ⏳ | ⏳ | pour les rappels |
| 010-vues-enregistrees | vues enregistrées | ⏳ | ⏳ | pour les vues |

`npm run db:etat` (ajouté avec ce document) affiche la base visée et coche les migrations déjà appliquées. Il ne modifie rien.

---

## Phase 0 · Préparer (la veille)

### 0.1 Vérifier la branche que Render déploie **[manuel]**
1. Ouvrir <https://dashboard.render.com>, puis le service web de la plateforme.
2. **Settings** → section **Build & Deploy** : noter la valeur de **Branch** (normalement `master`) et si **Auto-Deploy** est sur *On Commit*.
3. Même page, **Build Command** doit être `npm run build` et **Start Command** `npm start`.

Si Auto-Deploy est actif, la fusion dans `master` (phase 2) déclenche le déploiement : il faut donc avoir fini la phase 1 avant.

### 0.2 Pousser la branche et ouvrir la demande de fusion
```powershell
cd C:\wamp64\www\plateforme-stages-medecine\.claude\worktrees\admin-dashboard-redesign-298257
git push -u origin claude/admin-dashboard-redesign-298257
```
Puis sur GitHub, **[manuel]** : *Compare & pull request*, base `master`, comparer `claude/admin-dashboard-redesign-298257`. Ne pas fusionner tout de suite.

### 0.3 Dossier de travail
Les commandes se lancent depuis le dossier de la branche, qui contient les migrations 008 à 010 et les scripts :
`C:\wamp64\www\plateforme-stages-medecine\.claude\worktrees\admin-dashboard-redesign-298257\backend`.
Le dossier principal ne peut pas ouvrir cette branche (Git refuse une branche ouverte dans deux dossiers) : il reste tel quel jusqu'à la phase 5.

### 0.4 Donner l'accès à la base de production **[manuel pour les valeurs]**
1. Ouvrir `backend\.env.production` (copie de `.env.production.example`, ignorée par Git).
2. Render → service web → **Environment** : recopier `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` dans ce fichier, puis l'enregistrer.
3. Vérifier :
```powershell
$env:FICHIER_ENV = ".env.production"; npm run db:etat
```
La première ligne doit afficher l'hôte de production. Si une valeur manque, le script s'arrête au lieu de viser la base locale.

### 0.5 Sauvegarder la base de production
```powershell
$env:FICHIER_ENV = ".env.production"; npm run db:sauvegarder
```
Le fichier `sauvegarde-<base>-<date>.sql` est écrit dans Documents ; le mot de passe ne passe jamais par la ligne de commande.
Si l'hébergeur de la base propose aussi une sauvegarde (Aiven : *Backups*), en lancer une.

---

## Phase 1 · Base de données (fenêtre de maintenance, environ 5 minutes)

Ne pas lancer d'import ni de modification de fiche pendant cette phase : l'ancien code tourne encore sur le nouveau schéma.

Une commande à la fois, en vérifiant le ✅ :
```powershell
$env:FICHIER_ENV = ".env.production"
npm run db:migrate -- 005-variantes-ignorees.sql
npm run db:migrate -- 006-stages-paralleles-45-jours.sql
npm run db:migrate -- 007-journal-annulation.sql
npm run db:migrate -- 008-index-statistiques.sql
npm run db:migrate -- 009-relances-fiches.sql
npm run db:migrate -- 010-vues-enregistrees.sql
npm run db:etat
```
Chaque commande affiche la base visée avant d'agir. Sauter une migration que `db:etat` montre déjà ✅ (la relancer échouerait).
À la fin, `db:etat` doit tout cocher ✅.
Si une migration échoue, s'arrêter et ne pas passer à la phase 2.

## Phase 2 · Code

1. **[manuel]** GitHub : fusionner la demande de la phase 0.2 dans `master`.
2. **[manuel]** Render → **Events** : suivre le déploiement (5 à 10 minutes). Il doit finir sur *Deploy live*.
   Si Auto-Deploy est désactivé : **Manual Deploy** → *Deploy latest commit*.
3. Contrôle rapide **[manuel]** : se connecter à l'administration, ouvrir Tableau de bord, Statistiques, Parcours, Historique.

## Phase 3 · Données

Avec `$env:FICHIER_ENV = ".env.production"` défini, sauf mention **[manuel]**.

### 3.1 Recharger les fiches depuis le registre complet
D'abord la simulation, qui n'écrit rien :
```powershell
node scripts/recharger-fiches.js "$HOME\Desktop\Base_Plateforme_Stages_MAJ_S2_2026_v3.xlsx"
```
Lire le bilan : fiches retouchées à la main qui seront remplacées, téléchargements, signalements et e-mails repris ou **perdus**, identifiants changés.
Si le bilan est acceptable :
```powershell
node scripts/recharger-fiches.js "$HOME\Desktop\Base_Plateforme_Stages_MAJ_S2_2026_v3.xlsx" --appliquer
```
En local, ce rechargement a donné 1033 fiches et changé 2 identifiants.

### 3.2 Reporter les e-mails des résidents **[manuel]**
Plateforme en production → **Imports** → importer `residents-2026-11-23_emails.xlsx` (le fichier importé en local le 23/11).

### 3.3 Refaire les suppressions et modifications de dossiers **[manuel]**
1. En local, ouvrir **Historique**, filtrer sur les résidents : 27 suppressions et 6 modifications du 23/11 au soir.
2. En production, refaire chacune depuis la liste **Résidents** (bouton Supprimer du dossier, ou Modifier), avec la confirmation demandée.

### 3.4 Hôpitaux et services **[manuel]**
En local, 14 fusions et 3 « Ne pas fusionner » ont été faites. En production, ouvrir **Hôpitaux et services** et refaire celles qui sont encore proposées.

### 3.5 Contrôle
```powershell
npm run db:etat
```
Comparer avec la base locale (213 résidents et 1031 fiches au 26/11). Puis **[manuel]** : Statistiques → Qualité doit donner un score proche de la base locale (98).

## Phase 4 · Vérifier

1. Tests automatiques des pages publiques, depuis le dossier principal (terminal normal) :
```powershell
$env:BASE_URL = "https://<adresse-render>"; npm run test:e2e
```
2. **[manuel]** Connexion résident (code reçu par e-mail), téléchargement d'une fiche, aperçu PDF.
3. **[manuel]** Statistiques → Rapport : le PDF du semestre se télécharge.

## Phase 5 · Après

1. **[manuel]** Annoncer les fiches du semestre : Tableau de bord → « Prévenir par e-mail ». Le forfait gratuit Brevo permet 300 e-mails par jour, codes de connexion compris : 185 résidents passent en une fois.
2. Vider ou supprimer `backend\.env.production` : il contient le mot de passe de la base.
3. Dossier principal : `git checkout master` puis `git pull`.

## Retour arrière

- **Code** : Render → **Events** → déploiement précédent → **Rollback**.
- **Base** : restaurer la sauvegarde de l'étape 0.5 (efface tout ce qui a été fait depuis), avec MySQL Workbench (*Server → Data Import*) ou en ligne de commande avec les valeurs de `.env.production`.
L'ancien code (`4e8db97`) ne fonctionne pas avec le registre rechargé (périodes T1A–T4B) : revenir en arrière sur le code impose de restaurer aussi la base.
