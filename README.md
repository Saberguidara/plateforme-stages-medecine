# Plateforme Stages Medecine

Application de gestion des stages de residanat (frontend Angular + backend Express + MySQL).

## Architecture
- `frontend-stages/` : application Angular SPA
- `backend/` : API Node.js / Express / MySQL

Le SSR Angular a ete retire. L'application frontend est maintenant une SPA classique.

## Demarrage local

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend-stages
npm install
npm start
```

## Variables d'environnement backend
Copier `backend/.env.example` vers `backend/.env`, puis renseigner:
- `PORT`
- `JWT_SECRET`
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `ALLOWED_ORIGINS`
- `BREVO_USER`
- `BREVO_PASS`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`

## Modules principaux
- authentification admin JWT
- authentification resident OTP
- import Excel des affectations
- CRUD residents
- CRUD fiches de stage
- generation PDF

## Validation

### Backend
```bash
cd backend
npm test
```

### Frontend
```bash
cd frontend-stages
npm run build
npm test -- --watch=false
```

## Documentation BDD
- voir `docs/database-schema.md`
