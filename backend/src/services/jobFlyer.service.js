const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

class JobFlyerService {
    constructor() {
        this.flyerWidth = 1080;
        this.uploadDir = path.join(__dirname, '../../uploads/flyers');
        
        // Ensure upload directory exists
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    /**
     * Generate a professional recruitment flyer matching the reference design:
     * Navy header -> White body with all job info -> Navy APPLY NOW footer
     */
    async generateFlyer(job, companyName = 'Our Company') {
        try {
            const W = this.flyerWidth;

            // Load all fonts upfront
            const font64W = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
            const font32W = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
            const font16W = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
            const font64B = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
            const font32B = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
            const font16B = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

            // Colors
            const NAVY    = 0x0d2240ff;
            const ACCENT  = 0x2563ebff;
            const GOLD    = 0xd4a843ff;
            const WHITE   = 0xffffffff;
            const LGRAY   = 0xf5f5f5ff;

            // ---- Collect all content sections and measure heights ----
            const pad = 60;       // left/right padding
            const textW = W - pad * 2; // usable text width

            // HEADER is fixed at 300px
            const headerH = 300;
            // FOOTER is fixed at 210px
            const footerH = 210;

            // Build body content lines to measure total height needed
            const bodyLines = []; // {type, text, font, extraH?, bg?}

            // -- Job title --
            const titleText = (job.title || 'Job Position').toUpperCase();
            const titleH = Jimp.measureTextHeight(font64B, titleText, textW);
            bodyLines.push({ type: 'text', text: titleText, font: font64B, h: titleH + 10 });

            // -- Department --
            if (job.department) {
                bodyLines.push({ type: 'text', text: job.department, font: font32B, h: 44 });
            }

            // -- Divider --
            bodyLines.push({ type: 'divider', h: 20 });

            // -- Key info items (location, type, experience, education, salary, remote, positions, deadline) --
            const infoItems = [];
            if (job.location) infoItems.push(`Location:  ${job.location}`);
            if (job.job_type) infoItems.push(`Type:  ${this.formatJobType(job.job_type)}`);
            if (job.is_remote) infoItems.push(`Remote:  Yes`);
            if (job.experience_level) infoItems.push(`Experience:  ${this.formatExperience(job.experience_level)}`);
            if (job.education_requirement) infoItems.push(`Education:  ${this.formatEducation(job.education_requirement)}`);
            if (job.salary_min || job.salary_max) {
                const sal = this.formatSalary(job.salary_min, job.salary_max, job.salary_currency);
                if (sal) infoItems.push(`Salary:  ${sal}`);
            }
            if (job.positions_available && job.positions_available > 1) {
                infoItems.push(`Positions Available:  ${job.positions_available}`);
            }
            if (job.closes_at) {
                const d = new Date(job.closes_at);
                infoItems.push(`Application Deadline:  ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
            }

            for (const item of infoItems) {
                bodyLines.push({ type: 'info', text: item, font: font16B, h: 30 });
            }

            bodyLines.push({ type: 'spacer', h: 15 });

            // -- Description / Job Responsibilities --
            if (job.description) {
                bodyLines.push({ type: 'section', text: 'JOB DESCRIPTION:', h: 48 });
                const descClean = this.cleanHtml(job.description);
                // Split numbered items or sentences
                const descItems = this.splitDescriptionItems(descClean);
                for (const item of descItems) {
                    const lineH = Jimp.measureTextHeight(font16B, item, textW - 30) + 8;
                    bodyLines.push({ type: 'bullet', text: item, font: font16B, h: Math.max(26, lineH) });
                }
                bodyLines.push({ type: 'spacer', h: 10 });
            }

            // -- Requirements / Qualifications --
            const reqs = this.getRequirements(job);
            if (reqs.length > 0) {
                bodyLines.push({ type: 'section', text: 'QUALIFICATIONS:', h: 48 });
                for (const req of reqs) {
                    const lineH = Jimp.measureTextHeight(font16B, req, textW - 30) + 8;
                    bodyLines.push({ type: 'bullet', text: req, font: font16B, h: Math.max(26, lineH) });
                }
                bodyLines.push({ type: 'spacer', h: 10 });
            }

            // -- Required Skills --
            const skills = this.getSkillNames(job);
            if (skills.length > 0) {
                bodyLines.push({ type: 'section', text: 'REQUIRED SKILLS:', h: 48 });
                const skillText = skills.join(',  ');
                const skillH = Jimp.measureTextHeight(font16B, skillText, textW - 30) + 8;
                bodyLines.push({ type: 'bullet', text: skillText, font: font16B, h: Math.max(26, skillH) });
                bodyLines.push({ type: 'spacer', h: 10 });
            }

            // -- Responsibilities (if separate from description) --
            if (Array.isArray(job.responsibilities) && job.responsibilities.length > 0) {
                bodyLines.push({ type: 'section', text: 'RESPONSIBILITIES:', h: 48 });
                for (const resp of job.responsibilities) {
                    const t = this.cleanHtml(resp);
                    if (!t) continue;
                    const lineH = Jimp.measureTextHeight(font16B, t, textW - 30) + 8;
                    bodyLines.push({ type: 'bullet', text: t, font: font16B, h: Math.max(26, lineH) });
                }
                bodyLines.push({ type: 'spacer', h: 10 });
            }

            // -- Benefits --
            if (Array.isArray(job.benefits) && job.benefits.filter(b => b).length > 0) {
                bodyLines.push({ type: 'section', text: 'BENEFITS:', h: 48 });
                for (const b of job.benefits) {
                    const t = this.cleanHtml(b);
                    if (!t) continue;
                    const lineH = Jimp.measureTextHeight(font16B, t, textW - 30) + 8;
                    bodyLines.push({ type: 'check', text: t, font: font16B, h: Math.max(26, lineH) });
                }
                bodyLines.push({ type: 'spacer', h: 10 });
            }

            // Calculate total body height
            let totalBodyH = 40; // top padding
            for (const line of bodyLines) {
                totalBodyH += line.h;
            }
            totalBodyH += 20; // bottom padding

            // Total flyer height = header + body + footer
            const H = headerH + totalBodyH + footerH;

            // Create image
            const image = new Jimp(W, H, WHITE);

            // =========================================================
            // HEADER — Navy blue with "WE ARE HIRING!" and decorations
            // =========================================================
            this.fillRect(image, 0, 0, W, headerH, NAVY, W, H);

            // Diagonal accent stripes in top-right area
            for (let y = 0; y < headerH; y++) {
                for (let x = 0; x < W; x++) {
                    const diag = x + y;
                    if (diag > W + 20 && diag < W + 80) {
                        this.setPixelSafe(image, x, y, ACCENT, W, H);
                    }
                    if (diag > W + 90 && diag < W + 120) {
                        this.setPixelSafe(image, x, y, 0x1e40afff, W, H);
                    }
                }
            }

            // "WE ARE" line
            image.print(font64W, pad, 30, { text: 'WE ARE', alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, textW, 80);
            // "HIRING!" line — bigger impact
            image.print(font64W, pad, 100, { text: 'HIRING!', alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, textW, 80);
            // "JOIN OUR TEAM" sub-heading
            image.print(font32W, pad, 190, { text: 'JOIN OUR TEAM', alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, textW, 40);
            // Gold underline
            this.fillRect(image, pad, 235, 300, 4, GOLD, W, H);

            // Blue accent bar
            this.fillRect(image, 0, headerH, W, 5, ACCENT, W, H);

            // =========================================================
            // BODY — White background, all job details
            // =========================================================
            let y = headerH + 5 + 25;

            for (const line of bodyLines) {
                switch (line.type) {
                    case 'text':
                        image.print(line.font, pad, y, { text: line.text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, textW, line.h);
                        y += line.h;
                        break;

                    case 'divider':
                        y += 8;
                        this.fillRect(image, pad, y, textW, 2, 0xd1d5dbff, W, H);
                        y += line.h - 8;
                        break;

                    case 'spacer':
                        y += line.h;
                        break;

                    case 'info':
                        // Alternating light background
                        const infoIdx = bodyLines.filter(l => l.type === 'info').indexOf(line);
                        if (infoIdx % 2 === 0) {
                            this.fillRect(image, pad, y - 2, textW, line.h + 2, LGRAY, W, H);
                        }
                        image.print(font16B, pad + 12, y + 5, line.text);
                        y += line.h;
                        break;

                    case 'section':
                        // Navy background section header
                        this.fillRect(image, pad, y, textW, 42, NAVY, W, H);
                        image.print(font32W, pad + 16, y + 5, line.text);
                        y += line.h;
                        break;

                    case 'bullet':
                        image.print(font16B, pad + 16, y + 2, { text: '•  ' + line.text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, textW - 30, line.h);
                        y += line.h;
                        break;

                    case 'check':
                        image.print(font16B, pad + 16, y + 2, { text: '✓  ' + line.text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, textW - 30, line.h);
                        y += line.h;
                        break;
                }
            }

            // =========================================================
            // SIDE ACCENT BARS
            // =========================================================
            const bodyTop = headerH + 5;
            const bodyBottom = H - footerH;
            this.fillRect(image, 0, bodyTop, 7, bodyBottom - bodyTop, NAVY, W, H);
            this.fillRect(image, W - 7, bodyTop, 7, bodyBottom - bodyTop, ACCENT, W, H);

            // =========================================================
            // FOOTER — Navy "APPLY NOW!" section
            // =========================================================
            const footerY = H - footerH;
            this.fillRect(image, 0, footerY, W, footerH, NAVY, W, H);
            // Gold line at top
            this.fillRect(image, 0, footerY, W, 5, GOLD, W, H);

            // "APPLY NOW!" centered
            image.print(font64W, 0, footerY + 25, { text: 'APPLY NOW!', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, W, 70);

            // Application link
            const applyUrl = `http://localhost:3000/jobs/${job.id}`;
            image.print(font16W, 0, footerY + 105, { text: 'Apply here:  ' + applyUrl, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, W, 24);

            // Hashtags
            image.print(font16W, 0, footerY + 135, { text: '#hiring #jobs #career #opportunity', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, W, 24);

            // Save
            const filename = `job-flyer-${job.id}-${Date.now()}.png`;
            const filePath = path.join(this.uploadDir, filename);
            await image.writeAsync(filePath);
            console.log('Job flyer generated:', filePath);
            return filePath;

        } catch (error) {
            console.error('Error generating job flyer:', error);
            throw error;
        }
    }

    // === Helpers ===

    setPixelSafe(image, x, y, color, W, H) {
        if (x >= 0 && x < W && y >= 0 && y < H) {
            image.setPixelColor(color, Math.floor(x), Math.floor(y));
        }
    }

    fillRect(image, x, y, w, h, color, W, H) {
        const maxW = W || this.flyerWidth;
        const maxH = H || 5000;
        const x2 = Math.min(Math.floor(x + w), maxW);
        const y2 = Math.min(Math.floor(y + h), maxH);
        for (let py = Math.max(0, Math.floor(y)); py < y2; py++) {
            for (let px = Math.max(0, Math.floor(x)); px < x2; px++) {
                image.setPixelColor(color, px, py);
            }
        }
    }

    cleanHtml(text) {
        if (!text) return '';
        return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    }

    /**
     * Split a description that may contain numbered items like "1 Something 2 Something else"
     * or newline-separated items, into an array of strings.
     */
    splitDescriptionItems(text) {
        // Try splitting on pattern like "1 Text 2 Text" (numbered without dots)
        const numberedPattern = /(?:^|\n)\s*\d+[\.\):\s]+/;
        if (numberedPattern.test(text)) {
            const items = text.split(/(?:^|\n)\s*\d+[\.\):\s]+/).filter(s => s.trim().length > 5);
            if (items.length > 1) return items.map(s => s.trim());
        }
        // Try splitting on newlines
        const lines = text.split(/\n/).filter(s => s.trim().length > 5);
        if (lines.length > 1) return lines.map(s => s.trim());
        // If single block, split on sentences (max 6)
        const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 8).map(s => s.trim());
    }

    getRequirements(job) {
        const reqs = [];
        if (Array.isArray(job.requirements)) {
            for (const r of job.requirements) {
                const t = this.cleanHtml(typeof r === 'string' ? r : '');
                if (t) reqs.push(t);
            }
        }
        if (job.education_requirement && !reqs.some(r => r.toLowerCase().includes('degree') || r.toLowerCase().includes('education'))) {
            reqs.push('Education: ' + this.formatEducation(job.education_requirement));
        }
        if (job.min_experience_years && !reqs.some(r => r.toLowerCase().includes('experience') || r.toLowerCase().includes('year'))) {
            reqs.push('Minimum ' + job.min_experience_years + ' year(s) of relevant experience');
        }
        return reqs;
    }

    getSkillNames(job) {
        const names = [];
        if (job.required_skills) {
            let skills = job.required_skills;
            if (typeof skills === 'string') { try { skills = JSON.parse(skills); } catch { skills = []; } }
            if (Array.isArray(skills)) {
                for (const s of skills) {
                    const name = typeof s === 'string' ? s : (s.name || s.skill || '');
                    if (name) names.push(name);
                }
            }
        }
        if (Array.isArray(job.skill_names)) {
            for (const s of job.skill_names) {
                if (s && !names.includes(s)) names.push(s);
            }
        }
        return names;
    }

    formatEducation(level) {
        const levels = {
            'high_school': 'High School Diploma', 'associate': "Associate's Degree",
            'bachelor': "Bachelor's Degree", 'master': "Master's Degree",
            'doctorate': 'Doctorate / PhD', 'professional': 'Professional Certification',
            'none': 'No formal requirement'
        };
        return levels[level?.toLowerCase()] || level || '';
    }

    formatJobType(type) {
        const types = {
            'full_time': 'Full-Time', 'full-time': 'Full-Time',
            'part_time': 'Part-Time', 'part-time': 'Part-Time',
            'contract': 'Contract', 'temporary': 'Temporary',
            'internship': 'Internship', 'remote': 'Remote'
        };
        return types[type?.toLowerCase()] || type || 'Full-Time';
    }

    formatSalary(min, max, currency = 'USD') {
        const fmt = (n) => { if (!n) return null; return n >= 1000 ? `${(n/1000).toFixed(0)}K` : n.toString(); };
        const a = fmt(min), b = fmt(max);
        if (a && b) return `${currency} ${a} - ${b}`;
        if (a) return `${currency} ${a}+`;
        if (b) return `Up to ${currency} ${b}`;
        return null;
    }

    formatExperience(level) {
        const levels = { 'entry': 'Entry Level', 'junior': 'Junior', 'mid': 'Mid-Level', 'senior': 'Senior', 'lead': 'Lead', 'executive': 'Executive' };
        return levels[level?.toLowerCase()] || level || 'All Levels';
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    async getFlyerBuffer(job, companyName = 'Our Company') {
        const filePath = await this.generateFlyer(job, companyName);
        const buffer = fs.readFileSync(filePath);
        return { buffer, filePath };
    }

    cleanupOldFlyers() {
        try {
            const files = fs.readdirSync(this.uploadDir);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000;
            files.forEach(file => {
                const fp = path.join(this.uploadDir, file);
                const stats = fs.statSync(fp);
                if (now - stats.mtimeMs > maxAge) { fs.unlinkSync(fp); }
            });
        } catch (error) {
            console.error('Error cleaning up flyers:', error);
        }
    }
}

module.exports = new JobFlyerService();
