# Plateforme des stages · Faculté de Médecine de Sfax

Application web qui produit les **fiches de validation de stage** des résidents de médecine de famille, fidèles au modèle Word officiel, à partir des registres de choix de stages.

Une seule application : le serveur **Express** sert l'API (`/api`) et l'application **Angular** compilée, à la même adresse.

---

## Fonctionnalités

### Résidents
- Connexion par CIN et code à usage unique envoyé à l'adresse e-mail enregistrée par le service des stages
- « Mon parcours » : frise des stages par année de résidanat
- Fiche de validation du semestre en PDF (aperçu et téléchargement)
- Signalement d'une erreur sur une fiche, et suivi de la réponse
- Page d'aide et coordonnées du service des stages

### Administration
- Tableau de bord, liste des résidents et dossier détaillé
- Import automatique des registres Excel de choix de stages, avec annulation
- Référentiels : fusion des variantes d'hôpitaux et de services
- Historique des actions, exports, comptes administrateurs nominatifs
- Traitement des signalements des résidents

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Angular 21, Bootstrap 5 |
| Backend | Node.js, Express 5 |
| Base de données | MySQL 8 (ou compatible : Aiven, TiDB Cloud) |
| Authentification | JWT ; code à usage unique par e-mail (Brevo SMTP) pour les résidents |
| PDF | `pdf-lib`, sur un fond tiré du modèle Word |
| Excel | `exceljs` |

---

## Structure

```
plateforme-stages-medecine/
├── package.json          # build et démarrage de l'application complète
├── backend/              # API Express + service du frontend compilé
│   ├── controllers/  routes/  middlewares/  services/
│   ├── db/schema.sql     # schéma complet d'une base vide
│   ├── db/migrations/    # évolutions d'une base existante
│   ├── templates/        # modèle de fiche (PDF de fond, champs, polices)
│   └── __tests__/        # tests Jest
├── frontend-stages/      # application Angular
└── docs/                 # audit, schéma de la base
```

---

## Développement local

Prérequis : Node.js 20.19 ou plus récent, MySQL 8.

```bash
cd backend
npm install
cp .env.example .env      # puis remplir les variables
npm run db:init           # crée les tables dans une base vide
npm run admin:create      # avec ADMIN_LOGIN et ADMIN_PASSWORD dans .env
npm start                 # API sur http://localhost:3000
```

Dans un second terminal :

```bash
cd frontend-stages
npm install
npm start                 # http://localhost:4200, avec rechargement automatique
```

Pour tester l'application complète comme en production (une seule adresse) :

```bash
npm run build             # à la racine : installe et compile tout
npm start                 # http://localhost:3000
```

### Tests

```bash
npm test --prefix backend
npm test --prefix frontend-stages -- --watch=false
```

---

## Déploiement

L'hébergeur (par exemple un Web Service Render) n'a besoin que de deux commandes, à la racine du dépôt :

- **Build** : `npm run build`
- **Démarrage** : `npm start`

Variables d'environnement à définir (voir [`backend/.env.example`](backend/.env.example)) :

- `JWT_SECRET`, `OTP_SECRET` : longues chaînes aléatoires différentes
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_SSL=true`, `DB_POOL_SIZE` (5 à 10 sur une base gratuite)
- `TRUST_PROXY=1` : indispensable derrière l'hébergeur, sinon tous les visiteurs partagent les mêmes limites de requêtes
- `NODE_ENV=production`, `APP_URL` (adresse publique, utilisée dans les e-mails)
- `BREVO_API_KEY` (clé API Brevo : Render gratuit bloque les ports SMTP), `EMAIL_FROM` (expéditeur validé dans Brevo), `EMAIL_FROM_NAME`
- `CONTACT_EMAIL`, `CONTACT_TELEPHONE`, `CONTACT_ADRESSE`, `CONTACT_HORAIRES` (page d'aide)

La base distante s'initialise une fois avec `npm run db:init` (depuis un poste dont le `.env` pointe vers elle).

Sur une offre gratuite, le serveur s'endort après une période sans visite ; l'application affiche « Démarrage du serveur… » pendant le réveil.

---

## Auteur

**Saber GUIDARA** — Technicien à la Faculté de Médecine de Sfax, étudiant DSI à l'ISET Sfax

## Licence

Ce projet est sous licence MIT.
