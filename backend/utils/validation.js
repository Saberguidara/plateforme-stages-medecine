const { SPECIALITES, SPECIALITE_PAR_DEFAUT, specialiteDe } = require('../config/specialites');

// Périodes acceptées : celles de toutes les spécialités ouvertes sur la plateforme.
const VALID_PERIODES = [...new Set(Object.values(SPECIALITES).flatMap((s) => s.periodes))];

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function parseBoundedYear(value) {
    const year = parseInt(String(value), 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) return null;
    return year;
}

// CIN tunisien : 8 chiffres. Passeport (résidents étrangers) : 5 à 20 lettres ou chiffres.
function validateIdentifiant(value, typePiece) {
    const cin = normalizeString(value).replace(/\s/g, '').toUpperCase();
    if (!cin) return { valid: false, message: 'CIN ou numéro de passeport requis.' };
    if (typePiece === 'cin' && !/^\d{8}$/.test(cin)) {
        return { valid: false, message: 'Un CIN tunisien comporte exactement 8 chiffres.' };
    }
    if (!/^[A-Z0-9]{5,20}$/.test(cin)) {
        return { valid: false, message: 'Identifiant invalide : 8 chiffres pour un CIN, 5 à 20 lettres ou chiffres pour un passeport.' };
    }
    return { valid: true, value: cin };
}

function validateResidentPayload(payload = {}) {
    const nomPrenom = normalizeString(payload.nom_prenom);
    if (!normalizeString(payload.cin) || !nomPrenom) {
        return { valid: false, message: 'CIN et Nom/Prénom sont obligatoires.' };
    }
    const identifiant = validateIdentifiant(payload.cin, payload.type_piece);
    if (!identifiant.valid) return identifiant;

    const email = normalizeString(payload.email).toLowerCase();
    if (email && !validateEmail(email).valid) {
        return { valid: false, message: "Format d'email invalide." };
    }

    const specialite = specialiteDe(normalizeString(payload.specialite) || SPECIALITES[SPECIALITE_PAR_DEFAUT].libelle);
    if (!specialite) {
        return { valid: false, message: 'Spécialité non prise en charge par la plateforme.' };
    }

    // La promotion (année d'entrée en 1re année) détermine l'année imprimée sur les fiches ;
    // le niveau n'est conservé que pour les anciens dossiers sans promotion.
    const promotionSaisie = normalizeString(payload.promotion);
    const promotion = promotionSaisie ? parseBoundedYear(promotionSaisie) : null;
    if (promotionSaisie && promotion === null) {
        return { valid: false, message: 'Promotion invalide (année entre 2000 et 2100).' };
    }
    const niveau = parseInt(String(payload.niveau ?? ''), 10) || null;
    if (promotion === null && niveau === null) {
        return { valid: false, message: "La promotion (année d'entrée en 1re année) est obligatoire." };
    }

    return {
        valid: true,
        data: {
            cin: identifiant.value,
            nom_prenom: nomPrenom,
            email: email || null,
            specialite: specialite.libelle,
            faculte_origine: normalizeString(payload.faculte_origine) || 'FMSfax',
            niveau,
            promotion
        }
    };
}

function validateFichePayload(payload = {}, { requireResidentId = false } = {}) {
    const periode = normalizeString(payload.periode).toUpperCase();
    const annee = parseBoundedYear(payload.annee);
    const residentId = parseInt(String(payload.resident_id), 10);

    if (requireResidentId && (Number.isNaN(residentId) || residentId <= 0)) {
        return { valid: false, message: 'resident_id est obligatoire.' };
    }

    if (!VALID_PERIODES.includes(periode)) {
        return { valid: false, message: 'Période invalide.' };
    }

    if (annee === null) {
        return { valid: false, message: 'Année invalide (doit être entre 2000 et 2100).' };
    }

    return {
        valid: true,
        data: {
            resident_id: residentId,
            periode,
            annee,
            service: normalizeString(payload.service),
            hopital: normalizeString(payload.hopital),
            url_pdf: normalizeString(payload.url_pdf)
        }
    };
}

function validateCin(value) {
    const cin = normalizeString(value);
    if (!cin) return { valid: false, message: 'CIN requis.' };
    return { valid: true, value: cin };
}

function validateEmail(value) {
    const email = normalizeString(value);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, message: "Format d'email invalide." };
    }
    return { valid: true, value: email };
}

module.exports = {
    VALID_PERIODES,
    normalizeString,
    parseBoundedYear,
    validateResidentPayload,
    validateFichePayload,
    validateCin,
    validateIdentifiant,
    validateEmail
};
