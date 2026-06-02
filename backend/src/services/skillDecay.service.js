const FAST_MOVING_SKILLS = new Set([
    'react', 'reactjs', 'react.js', 'python', 'aws', 'amazon web services', 'node.js', 'nodejs', 'kubernetes',
    'docker', 'typescript', 'gcp', 'google cloud', 'azure', 'terraform', 'next.js', 'nextjs'
]);

const SLOW_MOVING_SKILLS = new Set([
    'sql', 'java', 'c', 'c++', 'c#', 'csharp', 'javascript', 'html', 'css', 'linux', 'git'
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeSkill = (skill) => (skill || '').toString().trim().toLowerCase();

const parseYearFromText = (value) => {
    if (!value) return null;
    const str = value.toString();
    const match = str.match(/(19|20)\d{2}/);
    if (match) return parseInt(match[0], 10);
    return null;
};

const getLatestExperienceYear = (experience = []) => {
    let latestYear = null;
    experience.forEach((exp) => {
        if (!exp) return;
        if (exp.isCurrent || exp.is_current) {
            latestYear = new Date().getFullYear();
            return;
        }
        const endYear = parseYearFromText(exp.endDate || exp.end_date || exp.end || exp.dateRange);
        const startYear = parseYearFromText(exp.startDate || exp.start_date || exp.start);
        const candidateYear = endYear || startYear;
        if (candidateYear && (!latestYear || candidateYear > latestYear)) {
            latestYear = candidateYear;
        }
    });
    return latestYear;
};

const experienceTextBlob = (exp) => {
    const techs = Array.isArray(exp?.technologies) ? exp.technologies.join(' ') : '';
    return [
        exp?.title,
        exp?.position,
        exp?.company,
        exp?.organization,
        exp?.description,
        techs
    ].filter(Boolean).join(' ').toLowerCase();
};

const inferSkillLastUsedYear = (skillName, experience = []) => {
    const normalized = normalizeSkill(skillName);
    if (!normalized) return null;
    const currentYear = new Date().getFullYear();
    let latestYear = null;

    experience.forEach((exp) => {
        if (!exp) return;
        const blob = experienceTextBlob(exp);
        const mentioned = blob.includes(normalized)
            || normalized.split(/[\s./+-]+/).filter((p) => p.length > 2).some((part) => blob.includes(part));
        if (!mentioned) return;

        const year = (exp.isCurrent || exp.is_current)
            ? currentYear
            : (parseYearFromText(exp.endDate || exp.end_date || exp.end || exp.dateRange)
                || parseYearFromText(exp.startDate || exp.start_date || exp.start));
        if (year && (!latestYear || year > latestYear)) {
            latestYear = year;
        }
    });

    return latestYear;
};

const buildSkillLastUsedMap = (skills = [], experience = []) => {
    const map = {};
    skills.forEach((skill) => {
        const name = typeof skill === 'string' ? skill : (skill?.name || skill?.skill || '');
        if (!name) return;
        const normalized = normalizeSkill(name);
        const year = inferSkillLastUsedYear(name, experience);
        if (year) map[normalized] = year;
    });
    return map;
};

const decayForYears = (yearsSinceUsed, isFastMoving) => {
    const years = clamp(Math.round(yearsSinceUsed || 0), 0, 50);
    if (isFastMoving) {
        if (years <= 1) return 1.0;
        if (years <= 3) return 0.85;
        if (years <= 5) return 0.7;
        if (years <= 7) return 0.55;
        return 0.4;
    }
    if (years <= 3) return 1.0;
    if (years <= 6) return 0.9;
    if (years <= 9) return 0.8;
    if (years <= 13) return 0.65;
    return 0.4;
};

const freshnessLabel = (multiplier) => {
    if (multiplier >= 0.85) return 'fresh';
    if (multiplier >= 0.65) return 'aging';
    return 'stale';
};

const skillLabel = (skill) => {
    if (!skill) return '';
    if (typeof skill === 'string') return skill.trim();
    return (skill.name || skill.skill || '').trim();
};

class SkillDecayService {
    /**
     * Merge resume-parse and profile skill/experience sources so decay is consistent
     * across HR application review and employee career path.
     */
    mergeSkillDecayInputs({
        resumeSkills = [],
        resumeExperience = [],
        profileSkills = [],
        profileExperience = []
    } = {}) {
        const skillMap = new Map();
        const addSkill = (skill) => {
            const name = skillLabel(skill);
            if (!name) return;
            const key = normalizeSkill(name);
            if (!skillMap.has(key)) skillMap.set(key, name);
        };

        (resumeSkills || []).forEach(addSkill);
        (profileSkills || []).forEach(addSkill);

        const normalizeExperience = (exp) => {
            if (!exp) return null;
            return {
                title: exp.title || exp.job_title || exp.position,
                company: exp.company || exp.company_name || exp.organization,
                description: exp.description,
                startDate: exp.startDate || exp.start_date || exp.start,
                endDate: exp.endDate || exp.end_date || exp.end,
                isCurrent: exp.isCurrent ?? exp.is_current ?? false,
                technologies: exp.technologies
            };
        };

        const experience = [
            ...(Array.isArray(resumeExperience) ? resumeExperience : []),
            ...(Array.isArray(profileExperience) ? profileExperience : [])
        ]
            .map(normalizeExperience)
            .filter(Boolean);

        return {
            skills: [...skillMap.values()],
            experience,
            primarySource: (resumeSkills?.length || resumeExperience?.length) ? 'resume' : 'profile'
        };
    }

    calculateSkillDecay(skills = [], experience = [], options = {}) {
        const now = options.now || new Date();
        const currentYear = now.getFullYear();
        const fallbackYear = getLatestExperienceYear(experience) || currentYear;
        const inferredLastUsed = options.skillLastUsed || buildSkillLastUsedMap(skills, experience);

        const items = skills
            .map((skill) => {
                const name = typeof skill === 'string' ? skill : (skill?.name || skill?.skill || '');
                if (!name) return null;
                const normalized = normalizeSkill(name);
                const lastUsedYear = inferredLastUsed[normalized] || fallbackYear;
                const yearsSinceUsed = clamp(currentYear - lastUsedYear, 0, 50);
                const isFast = FAST_MOVING_SKILLS.has(normalized);
                const isSlow = SLOW_MOVING_SKILLS.has(normalized);
                const multiplier = decayForYears(yearsSinceUsed, isFast && !isSlow);
                return {
                    name,
                    normalized,
                    yearsSinceUsed,
                    multiplier,
                    freshness: freshnessLabel(multiplier),
                    decayProfile: isFast ? 'fast' : 'slow'
                };
            })
            .filter(Boolean);

        const map = {};
        items.forEach((item) => {
            map[item.normalized] = item;
        });

        return {
            skills: items,
            skillMap: map
        };
    }

    summarizeDecay(items = []) {
        const summary = { fresh: 0, aging: 0, stale: 0 };
        items.forEach((item) => {
            summary[item.freshness] = (summary[item.freshness] || 0) + 1;
        });
        return summary;
    }
}

module.exports = new SkillDecayService();
