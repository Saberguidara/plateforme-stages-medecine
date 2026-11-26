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

### 0.3 Mettre le dossier principal à jour
Les scripts de la phase 1 et 3 se lancent depuis le dossier principal ; il doit contenir les migrations 008 à 010 et `db:etat` :
```powershell
cd C:\wamp64\www\plateforme-stages-medecine
git fetch origin
git checkout claude/admin-dashboard-redesign-298257
npm ci --prefix backend
```
(Après la phase 2, revenir sur `master` : `git checkout master` puis `git pull`.)

### 0.4 Préparer un terminal « production » **[manuel pour les valeurs]**
Les scripts lisent `backend/.env` (la base locale), **sauf** pour les variables déjà définies dans le terminal, qui priment. On ouvre donc un terminal dédié à la production :

1. Render → service web → **Environment** : copier `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`.
2. Ouvrir un **nouveau** terminal PowerShell, réservé à la production, et y coller :
```powershell
cd C:\wamp64\www\plateforme-stages-medecine\backend
$env:DB_HOST = "…"; $env:DB_PORT = "…"; $env:DB_USER = "…"; $env:DB_PASS = "…"; $env:DB_NAME = "…"; $env:DB_SSL = "true"
npm run db:etat
```
3. Vérifier que la première ligne affiche bien l'hôte de production, et que 005 à 010 sont marquées ⏳.

Les cinq variables doivent toutes être définies : une variable oubliée serait reprise du `.env` local.
Fermer ce terminal à la fin pour effacer les valeurs.

### 0.5 Sauvegarder la base de production
Dans le terminal « production » :
```powershell
& "C:\wamp64\bin\mysql\mysql8.4.7\bin\mysqldump.exe" --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password `
  --ssl-mode=REQUIRED --single-transaction --no-tablespaces --set-gtid-purged=OFF `
  --result-file="$HOME\Documents\sauvegarde-stages-prod-2026-11-26.sql" $env:DB_NAME
```
Le mot de passe est demandé (celui de `DB_PASS`). Vérifier que le fichier fait plus de quelques centaines de Ko.
Garder ce fichier hors du dépôt Git. Si l'hébergeur de la base propose aussi une sauvegarde (Aiven : *Backups*), en lancer une.

---

## Phase 1 · Base de données (fenêtre de maintenance, environ 5 minutes)

Ne pas lancer d'import ni de modification de fiche pendant cette phase : l'ancien code tourne encore sur le nouveau schéma.

Dans le terminal « production », une commande à la fois, en vérifiant le ✅ :
```powershell
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

Toujours dans le terminal « production », sauf mention **[manuel]**.

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
2. Fermer le terminal « production ».
3. Remettre le dossier principal sur `master` à jour : `git checkout master` puis `git pull`.

## Retour arrière

- **Code** : Render → **Events** → déploiement précédent → **Rollback**.
- **Base** : restaurer la sauvegarde de l'étape 0.5 (efface tout ce qui a été fait depuis) :
```powershell
& "C:\wamp64\bin\mysql\mysql8.4.7\bin\mysql.exe" --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --password `
  --ssl-mode=REQUIRED $env:DB_NAME -e "source $HOME\Documents\sauvegarde-stages-prod-2026-11-26.sql"
```
L'ancien code (`4e8db97`) ne fonctionne pas avec le registre rechargé (périodes T1A–T4B) : revenir en arrière sur le code impose de restaurer aussi la base.
