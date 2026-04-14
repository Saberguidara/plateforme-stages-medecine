const VALID_PERIODES = ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'];

function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function parseBoundedYear(value) {
    const year = parseInt(String(value), 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) return null;
    return year;
}

function validateResidentPayload(payload = {}) {
    const cin = normalizeString(payload.cin);
    const nomPrenom = normalizeString(payload.nom_prenom);

    if (!cin || !nomPrenom) {
        return { valid: false, message: 'CIN et Nom/Prénom sont obligatoires.' };
    }

    return {
        valid: true,
        data: {
            cin,
            nom_prenom: nomPrenom,
            specialite: normalizeString(payload.specialite),
            faculte_origine: normalizeString(payload.faculte_origine) || 'FMSfax',
            niveau: parseInt(String(payload.niveau || 1), 10) || 1,
            promotion: payload.promotion === '' || payload.promotion === undefined || payload.promotion === null
                ? null
                : parseInt(String(payload.promotion), 10) || null
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
    validateEmail
};
