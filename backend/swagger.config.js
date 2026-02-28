/**
 * UX-7 : Documentation API Swagger/OpenAPI
 * Accessible sur http://localhost:3000/api/docs
 */
require('dotenv').config();
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Plateforme Stages Médecine — API',
            version: '1.0.0',
            description: 'API de gestion des stages de résidanat — Faculté de Médecine de Sfax',
            contact: {
                name: 'Administration',
                email: 'saber_guidara@medecinesfax.org'
            }
        },
        servers: [
            { url: `http://localhost:${process.env.PORT || 3000}`, description: 'Développement local' }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Token JWT obtenu via /api/auth/admin/login ou /api/auth/login/verify-otp'
                }
            },
            schemas: {
                Resident: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        cin: { type: 'string', example: '12345678' },
                        nom_prenom: { type: 'string', example: 'BEN ALI Mohamed' },
                        specialite: { type: 'string', example: 'Médecine Générale' },
                        faculte_origine: { type: 'string', example: 'Faculté de Médecine de Sfax' },
                        niveau: { type: 'integer', example: 2 },
                        fiches: { type: 'array', items: { $ref: '#/components/schemas/FicheStage' } }
                    }
                },
                FicheStage: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 10 },
                        periode: { type: 'string', example: 'S1', enum: ['S1', 'S2', 'T1', 'T2', 'T3', 'T4'] },
                        annee: { type: 'integer', example: 2025 },
                        service: { type: 'string', example: 'Cardiologie' },
                        hopital: { type: 'string', example: 'CHU Hédi Chaker' },
                        url_pdf: { type: 'string', example: '' }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        },
        paths: {
            '/api/auth/admin/login': {
                post: {
                    tags: ['Authentification'],
                    summary: 'Connexion administrateur',
                    description: 'Retourne un JWT valide 8h si les identifiants sont corrects. Le mot de passe est hashé en bcrypt.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['login', 'password'],
                                    properties: {
                                        login: { type: 'string', example: 'admin_sfax' },
                                        password: { type: 'string', example: 'votre_mot_de_passe' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Connexion réussie', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, token: { type: 'string' } } } } } },
                        401: { description: 'Identifiants incorrects', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        500: { description: 'Erreur serveur' }
                    }
                }
            },
            '/api/auth/login/request-otp': {
                post: {
                    tags: ['Authentification'],
                    summary: 'Demande de code OTP (résident)',
                    description: 'Génère et envoie un code OTP par email. Anti-spam : 1 demande toutes les 2 minutes.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['cin', 'email'],
                                    properties: {
                                        cin: { type: 'string', example: '12345678' },
                                        email: { type: 'string', format: 'email', example: 'resident@medecinesfax.org' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'OTP envoyé par email' },
                        400: { description: 'CIN ou email manquant / format invalide' },
                        404: { description: 'Résident introuvable' },
                        429: { description: 'Anti-spam : trop de demandes', content: { 'application/json': { schema: { type: 'object', properties: { waitTime: { type: 'integer', description: 'Secondes restantes avant prochaine tentative' } } } } } }
                    }
                }
            },
            '/api/auth/login/verify-otp': {
                post: {
                    tags: ['Authentification'],
                    summary: 'Vérification OTP et connexion résident',
                    description: 'Vérifie le code OTP. Retourne un JWT valide 8h. Le code est invalidé après usage.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['cin', 'otpCode'],
                                    properties: {
                                        cin: { type: 'string', example: '12345678' },
                                        otpCode: { type: 'string', example: '482931' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Connexion réussie, JWT retourné' },
                        401: { description: 'Code invalide ou expiré' },
                        404: { description: 'Résident introuvable' }
                    }
                }
            },
            '/api/residents/{cin}': {
                get: {
                    tags: ['Résidents'],
                    summary: 'Récupérer le dossier d\'un résident',
                    description: '**Protégé** — admin : accès à tout résident / résident : accès à son propre dossier uniquement (SEC-9).',
                    security: [{ bearerAuth: [] }],
                    parameters: [{ in: 'path', name: 'cin', required: true, schema: { type: 'string' }, example: '12345678' }],
                    responses: {
                        200: { description: 'Dossier résident avec fiches de stage', content: { 'application/json': { schema: { $ref: '#/components/schemas/Resident' } } } },
                        401: { description: 'Token manquant ou invalide' },
                        403: { description: 'Résident essayant d\'accéder au dossier d\'un autre', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Résident introuvable' }
                    }
                }
            },
            '/api/admin/fiches/{id}': {
                put: {
                    tags: ['Administration'],
                    summary: 'Modifier une fiche de stage',
                    security: [{ bearerAuth: [] }],
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        periode: { type: 'string', example: 'S1' },
                                        service: { type: 'string', example: 'Cardiologie' },
                                        hopital: { type: 'string', example: 'CHU Hédi Chaker' },
                                        url_pdf: { type: 'string', example: '' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Fiche mise à jour' },
                        401: { description: 'Non autorisé (token manquant ou non-admin)' },
                        500: { description: 'Erreur serveur' }
                    }
                }
            },
            '/api/admin/import': {
                post: {
                    tags: ['Administration'],
                    summary: 'Importer les affectations depuis un fichier Excel',
                    description: 'Supporte deux formats : Ministère (standard) et Médecine de famille. Limite : 10 Mo. Année requise entre 2000 et 2100.',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
                                    required: ['fichierExcel', 'annee', 'semestre', 'typeSpecialite'],
                                    properties: {
                                        fichierExcel: { type: 'string', format: 'binary' },
                                        annee: { type: 'integer', example: 2025, minimum: 2000, maximum: 2100 },
                                        semestre: { type: 'string', enum: ['S1', 'S2'] },
                                        typeSpecialite: { type: 'string', enum: ['standard', 'famille'] }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Import réussi avec statistiques', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Succès : 42 nouveaux résidents et 84 fiches générés.' } } } } } },
                        400: { description: 'Fichier manquant ou année invalide' },
                        401: { description: 'Non autorisé' },
                        500: { description: 'Erreur lors du traitement du fichier Excel' }
                    }
                }
            },
            '/api/generate-pdf': {
                post: {
                    tags: ['PDF'],
                    summary: 'Générer une fiche PDF de validation de stage',
                    description: '**Protégé (admin ou résident)** — Rate-limité à 10 req/min. Génère un PDF via Puppeteer à partir des données du résident.',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['resident', 'fiche'],
                                    properties: {
                                        resident: { type: 'object', properties: { nom_prenom: { type: 'string' }, specialite: { type: 'string' }, niveau: { type: 'string', example: '2' } } },
                                        fiche: { type: 'object', properties: { periode: { type: 'string', example: 'S1' }, annee: { type: 'integer', example: 2025 }, hopital: { type: 'string' }, service: { type: 'string' } } }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Fichier PDF binaire', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
                        401: { description: 'Non autorisé' },
                        429: { description: 'Trop de requêtes — attendre 1 minute' },
                        500: { description: 'Erreur Puppeteer' }
                    }
                }
            }
        }
    },
    apis: []
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
