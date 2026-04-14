# 🏥 Plateforme de Gestion des Stages Médicaux

Une application web full-stack pour la gestion et le suivi des stages de résidence médicale, développée avec **Angular**, **Node.js/Express** et **MySQL**.

---

## 📋 Description

Cette plateforme permet de centraliser et simplifier la gestion des stages pour les résidents en médecine et les administrateurs. Elle offre une interface moderne, mobile-first, avec deux rôles distincts et une génération automatique de documents PDF.

---

## ✨ Fonctionnalités

### 👨‍⚕️ Résidents
- Consulter les stages disponibles
- Soumettre et suivre leurs demandes de stage
- Télécharger leurs attestations en PDF

### 🛠️ Administrateurs
- Gérer les stages et les affectations
- Suivre l'état des demandes
- Générer des rapports PDF
- Gérer les comptes résidents

---

## 🚀 Stack Technique

| Couche | Technologie |
|---|---|
| Frontend | Angular 17+ |
| Backend | Node.js + Express |
| Base de données | MySQL |
| Auth | JWT (JSON Web Token) |
| PDF | Génération côté serveur |
| Architecture | REST API + SPA Mobile-first |

---

## 📁 Structure du Projet

```
plateforme-stages/
├── frontend/          # Application Angular
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── guards/
│   └── ...
├── backend/           # API Node.js/Express
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   └── middleware/
└── README.md
```

---

## ⚙️ Installation

### Prérequis
- Node.js v18+
- MySQL 8+
- Angular CLI

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Remplir les variables dans .env
npm start
```

### Frontend

```bash
cd frontend
npm install
ng serve
```

### Base de données

```bash
# Importer le schéma SQL
mysql -u root -p < database/schema.sql
```

---

## 🔐 Variables d'environnement

Créer un fichier `.env` dans le dossier `backend/` :

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=plateforme_stages
JWT_SECRET=
PORT=3000
```

---

## 📸 Captures d'écran

> *(À ajouter — dashboard admin, liste des stages, fiche résident)*

---

## 👤 Auteur

**Saber** — Technicien à la Faculté de Médecine de Sfax | Étudiant DSI ISET Sfax

---

## 📄 Licence

Ce projet est sous licence MIT.
