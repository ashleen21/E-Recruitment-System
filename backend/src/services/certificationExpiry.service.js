const CERT_VALIDITY_YEARS = {
    aws: 3,
    amazon: 3,
    azure: 2,
    microsoft: 2,
    cisco: 3,
    pmp: 3,
    comptia: 3
};

const normalize = (value) => (value || '').toString().toLowerCase();

const parseYear = (value) => {
    if (!value) return null;
    const match = value.toString().match(/(19|20)\d{2}/);
    return match ? parseInt(match[0], 10) : null;
};

const addYears = (date, years) => {
    const next = new Date(date);
    next.setFullYear(next.getFullYear() + years);
    return next;
};

class CertificationExpiryService {
    evaluate(certifications = [], options = {}) {
        const now = options.now || new Date();
        const results = [];

        certifications.forEach((cert) => {
            if (!cert) return;
            const name = cert.name || cert.certification || cert.title || '';
            const issuer = cert.issuer || cert.issuing_organization || cert.organization || '';
            const issueDateValue = cert.issue_date || cert.issueDate || cert.date || cert.obtained_at || null;
            const expiryDateValue = cert.expiry_date || cert.expiryDate || null;

            const normalizedName = normalize(name);
            const normalizedIssuer = normalize(issuer);
            const key = Object.keys(CERT_VALIDITY_YEARS).find((k) => normalizedName.includes(k) || normalizedIssuer.includes(k));
            const validityYears = key ? CERT_VALIDITY_YEARS[key] : null;

            let issueDate = issueDateValue ? new Date(issueDateValue) : null;
            if ((!issueDate || Number.isNaN(issueDate.getTime())) && issueDateValue) {
                const yearOnly = parseYear(issueDateValue);
                issueDate = yearOnly ? new Date(yearOnly, 0, 1) : null;
            }

            let expiryDate = expiryDateValue ? new Date(expiryDateValue) : null;
            if ((!expiryDate || Number.isNaN(expiryDate.getTime())) && expiryDateValue) {
                const yearOnly = parseYear(expiryDateValue);
                expiryDate = yearOnly ? new Date(yearOnly, 11, 31) : null;
            }

            if ((!expiryDate || Number.isNaN(expiryDate.getTime())) && issueDate && validityYears) {
                expiryDate = addYears(issueDate, validityYears);
            }

            let status = 'Valid';
            if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
                status = 'Valid';
            } else if (expiryDate < now) {
                status = 'Expired';
            } else {
                const sixMonthsAhead = new Date(now);
                sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);
                if (expiryDate <= sixMonthsAhead) {
                    status = 'Expiring Soon';
                }
            }

            results.push({
                name,
                issuer,
                issueDate: issueDate ? issueDate.toISOString().slice(0, 10) : null,
                expiryDate: expiryDate ? expiryDate.toISOString().slice(0, 10) : null,
                status,
                validityYears
            });
        });

        return results;
    }
}

module.exports = new CertificationExpiryService();
