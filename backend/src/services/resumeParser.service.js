const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const OpenAI = require('openai');
const config = require('../config');

// Initialize OpenAI (if API key is provided)
let openai = null;
if (config.openai?.apiKey && config.openai.apiKey !== 'your-openai-api-key') {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
    console.log('OpenAI initialized for resume parsing');
}

class ResumeParserService {
    constructor() {
        // Supported languages for OCR (ISO 639-3 codes)
        this.supportedLanguages = ['eng', 'fra', 'deu', 'spa', 'por', 'ita', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'ara', 'hin', 'rus'];
        this.useOpenAI = !!openai;
    }

    async parseResume(filePath, options = {}) {
        const ext = path.extname(filePath).toLowerCase();
        let text = '';
        let formattedText = '';

        try {
            switch (ext) {
                case '.pdf':
                    const pdfResult = await this.parsePDF(filePath);
                    text = pdfResult.text;
                    formattedText = pdfResult.formattedText;
                    break;
                case '.doc':
                case '.docx':
                    const wordResult = await this.parseWord(filePath);
                    text = wordResult.text;
                    formattedText = wordResult.formattedText;
                    break;
                case '.txt':
                    text = fs.readFileSync(filePath, 'utf8');
                    formattedText = text;
                    break;
                case '.png':
                case '.jpg':
                case '.jpeg':
                case '.gif':
                case '.bmp':
                case '.tiff':
                case '.webp':
                    const imageResult = await this.parseImage(filePath, options.language);
                    text = imageResult.text;
                    formattedText = imageResult.formattedText;
                    break;
                default:
                    throw new Error(`Unsupported file format: ${ext}`);
            }

            return await this.extractResumeData(text, formattedText);
        } catch (error) {
            console.error('Resume parsing error:', error);
            throw error;
        }
    }

    async parsePDF(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        
        // Preserve formatting from PDF
        let formattedText = data.text
            .replace(/\n{3,}/g, '\n\n')  // Normalize multiple newlines
            .replace(/([.!?])\s*\n/g, '$1\n\n')  // Add paragraph breaks after sentences
            .trim();

        return {
            text: data.text,
            formattedText: formattedText,
            pageCount: data.numpages,
            info: data.info
        };
    }

    async parseWord(filePath) {
        const result = await mammoth.extractRawText({ path: filePath });
        
        // Also try to get HTML for better structure
        let htmlResult;
        try {
            htmlResult = await mammoth.convertToHtml({ path: filePath });
        } catch (e) {
            htmlResult = { value: '' };
        }

        // Create formatted version preserving structure
        let formattedText = result.value;
        
        if (htmlResult.value) {
            formattedText = htmlResult.value
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/h[1-6]>/gi, '\n\n')
                .replace(/<\/li>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
        }

        return {
            text: result.value,
            formattedText: formattedText
        };
    }

    async parseImage(filePath, preferredLanguage = null) {
        let bestResult = { text: '', confidence: 0, language: 'eng' };
        
        // Try preferred language first, then English
        const languagesToTry = preferredLanguage ? [preferredLanguage, 'eng'] : ['eng'];
        
        for (const lang of languagesToTry) {
            try {
                const result = await Tesseract.recognize(filePath, lang, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR Progress (${lang}): ${Math.round(m.progress * 100)}%`);
                        }
                    }
                });
                
                if (result.data.confidence > bestResult.confidence) {
                    bestResult = {
                        text: result.data.text,
                        confidence: result.data.confidence,
                        language: lang
                    };
                }
            } catch (e) {
                console.log(`Language ${lang} OCR failed:`, e.message);
            }
        }

        // If confidence is low, try other common languages
        if (bestResult.confidence < 60) {
            const additionalLanguages = ['fra', 'deu', 'spa', 'por'].filter(l => !languagesToTry.includes(l));
            
            for (const lang of additionalLanguages) {
                try {
                    const result = await Tesseract.recognize(filePath, lang);
                    if (result.data.confidence > bestResult.confidence) {
                        bestResult = {
                            text: result.data.text,
                            confidence: result.data.confidence,
                            language: lang
                        };
                    }
                } catch (e) {
                    // Language might not be available
                }
            }
        }

        return {
            text: bestResult.text,
            formattedText: bestResult.text,
            confidence: bestResult.confidence,
            detectedLanguage: bestResult.language
        };
    }

    async extractResumeData(text, formattedText = null) {
        const cleanText = text.replace(/\s+/g, ' ').trim();

        // Try OpenAI first if available
        if (this.useOpenAI && openai) {
            try {
                console.log('Using OpenAI for resume parsing...');
                const openAIResult = await this.extractWithOpenAI(cleanText);
                if (openAIResult) {
                    // Calculate confidence based on extracted data
                    const confidence = this.calculateOpenAIConfidence(openAIResult);
                    return {
                        ...openAIResult,
                        rawText: formattedText || cleanText,
                        confidence: confidence,
                        aiAnalysis: 'Parsed with OpenAI',
                        improvementSuggestions: openAIResult.improvementSuggestions || null
                    };
                }
            } catch (error) {
                console.error('OpenAI parsing failed, falling back to regex:', error.message);
            }
        }

        // Fallback to regex-based extraction
        console.log('Using regex-based resume parsing...');
        const contact = this.extractContact(text);
        const skills = this.extractSkills(cleanText);
        const education = this.extractEducation(text);
        const experience = this.extractExperience(text);
        const certifications = this.extractCertifications(cleanText);
        const summary = this.extractSummary(text);
        const languages = this.extractLanguages(cleanText);

        // Calculate confidence score based on extracted data quality
        const confidence = this.calculateConfidence({
            contact,
            skills,
            education,
            experience,
            certifications,
            summary,
            languages,
            rawText: cleanText
        });

        return {
            contact,
            skills,
            education,
            experience,
            certifications,
            summary,
            languages,
            rawText: formattedText || cleanText, // Use formatted text for display
            confidence,
            aiAnalysis: null,
            improvementSuggestions: null
        };
    }

    async extractWithOpenAI(text) {
        const prompt = `You are an expert resume parser. Analyze the ENTIRE resume text thoroughly and extract ALL structured information.

RESUME TEXT:
${text.substring(0, 12000)}

IMPORTANT INSTRUCTIONS:
1. For SKILLS: Do NOT only look at a "Skills" section. Parse the ENTIRE resume including:
   - Work experience descriptions (extract technologies/tools used)
   - Project descriptions (extract technologies/frameworks/tools mentioned)
   - Education section (extract relevant coursework/technical skills)
   - Certifications (extract related skills)
   - Summary/objective (extract mentioned skills)
   - Any bullet points describing duties or achievements
2. Include BOTH technical skills (programming languages, frameworks, tools, databases, cloud services) AND soft skills (leadership, communication, project management)
3. Extract ALL skills mentioned anywhere in the resume, not just explicitly listed ones

Return a JSON object with the following structure:
{
    "contact": {
        "name": "full name of the candidate",
        "email": "email address",
        "phone": "phone number with country code if available",
        "location": "city, state/province, country",
        "linkedin": "LinkedIn URL if present"
    },
    "summary": "A brief professional summary extracted or inferred from the resume (2-3 sentences)",
    "skills": [
        "skill1", "skill2", "skill3"
    ],
    "experience": [
        {
            "title": "Job Title",
            "company": "Company Name",
            "location": "City, Country",
            "startDate": "Month Year",
            "endDate": "Month Year or Present",
            "description": "Brief description of responsibilities and achievements",
            "highlights": ["achievement 1", "achievement 2"]
        }
    ],
    "education": [
        {
            "degree": "Degree Type (e.g., Bachelor's, Master's, PhD)",
            "field": "Field of Study",
            "institution": "University/College Name",
            "location": "City, Country",
            "year": "Graduation Year",
            "gpa": "GPA if mentioned"
        }
    ],
    "certifications": [
        {
            "name": "Certification Name",
            "issuer": "Issuing Organization",
            "date": "Date obtained",
            "expiryDate": "Expiry date if applicable"
        }
    ],
    "languages": [
        {
            "language": "Language Name",
            "proficiency": "Proficiency level (Native, Fluent, Intermediate, Basic)"
        }
    ],
    "improvementSuggestions": [
        "Suggestion for improving the resume"
    ]
}

Extract as much information as possible from EVERY section of the resume. For any field not found, return null or an empty array. The skills array should be comprehensive - include every skill mentioned or implied anywhere in the resume.`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a professional resume parser. Extract structured information from resumes accurately. Always respond with valid JSON.' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            });

            const parsed = JSON.parse(response.choices[0].message.content);
            console.log('OpenAI successfully parsed resume');

            return {
                contact: parsed.contact || {},
                skills: parsed.skills || [],
                education: parsed.education || [],
                experience: parsed.experience || [],
                certifications: parsed.certifications || [],
                summary: parsed.summary || '',
                languages: parsed.languages || [],
                improvementSuggestions: parsed.improvementSuggestions || []
            };
        } catch (error) {
            console.error('OpenAI extraction error:', error);
            throw error;
        }
    }

    calculateConfidence(data) {
        let score = 0;

        // Contact info (20 points max)
        if (data.contact?.email) score += 8;
        if (data.contact?.phone) score += 6;
        if (data.contact?.name && data.contact.name.length > 2) score += 6;

        // Skills (25 points max)
        const skillCount = data.skills?.length || 0;
        if (skillCount >= 10) score += 25;
        else if (skillCount >= 5) score += 18;
        else if (skillCount >= 2) score += 10;
        else if (skillCount >= 1) score += 5;

        // Education (15 points max)
        const eduCount = data.education?.length || 0;
        if (eduCount >= 2) score += 15;
        else if (eduCount >= 1) score += 10;

        // Experience (25 points max)
        const expPositions = data.experience?.positions?.length || 0;
        const expYears = data.experience?.totalYears || 0;
        if (expPositions >= 3) score += 15;
        else if (expPositions >= 1) score += 8;
        if (expYears > 0) score += 10;

        // Summary (10 points max)
        if (data.summary && data.summary.length > 50) score += 10;
        else if (data.summary && data.summary.length > 20) score += 5;

        // Certifications (5 points bonus)
        if (data.certifications?.length > 0) score += 5;

        // Languages bonus (up to 5 points)
        if (data.languages?.length > 0) score += Math.min(5, data.languages.length * 2);

        // Raw text quality check
        if (data.rawText && data.rawText.length < 100) {
            score = Math.max(10, score - 30);
        }

        return Math.min(100, Math.round(score));
    }

    calculateOpenAIConfidence(data) {
        let score = 0;

        // Contact info (20 points max)
        if (data.contact?.email) score += 8;
        if (data.contact?.phone) score += 6;
        if (data.contact?.name && data.contact.name.length > 2) score += 6;

        // Skills (25 points max)
        const skillCount = data.skills?.length || 0;
        if (skillCount >= 10) score += 25;
        else if (skillCount >= 5) score += 18;
        else if (skillCount >= 2) score += 10;
        else if (skillCount >= 1) score += 5;

        // Education (15 points max)
        const eduCount = data.education?.length || 0;
        if (eduCount >= 2) score += 15;
        else if (eduCount >= 1) score += 10;

        // Experience (25 points max) - OpenAI returns array directly
        const expCount = Array.isArray(data.experience) ? data.experience.length : 0;
        if (expCount >= 3) score += 25;
        else if (expCount >= 2) score += 18;
        else if (expCount >= 1) score += 12;

        // Summary (10 points max)
        if (data.summary && data.summary.length > 50) score += 10;
        else if (data.summary && data.summary.length > 20) score += 5;

        // Certifications (5 points bonus)
        if (data.certifications?.length > 0) score += 5;

        // Languages bonus (up to 5 points)
        if (data.languages?.length > 0) score += Math.min(5, data.languages.length * 2);

        // OpenAI bonus for successful parsing
        score += 5;

        return Math.min(100, Math.round(score));
    }

    extractContact(text) {
        // Enhanced email regex for international domains
        const emailRegex = /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/gi;
        
        // Enhanced phone regex for international formats
        const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{1,5}\)?[-.\s]?)?\d{1,5}[-.\s]?\d{1,5}[-.\s]?\d{1,5}/g;
        
        const linkedInRegex = /(?:linkedin\.com\/in\/|linkedin:?\s*)[\w-]+/gi;
        const githubRegex = /(?:github\.com\/|github:?\s*)[\w-]+/gi;
        const portfolioRegex = /(?:portfolio|website|web):?\s*(https?:\/\/[\w.-]+\.[a-zA-Z]{2,}[\w\/.-]*)/gi;

        const emails = text.match(emailRegex) || [];
        const phones = text.match(phoneRegex) || [];
        const linkedin = text.match(linkedInRegex) || [];
        const github = text.match(githubRegex) || [];
        const portfolio = text.match(portfolioRegex) || [];

        // Extract name from first few lines
        const lines = text.split(/[\n\r]+/).filter(l => l.trim() && l.trim().length > 1);
        let possibleName = '';
        
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const line = lines[i].trim();
            // Name is usually the first line that's not an email/phone/url
            if (!line.includes('@') && !line.match(/^\+?\d/) && !line.includes('http') && 
                line.length > 2 && line.length < 60) {
                if (/^[A-Za-zÀ-ÿ\s'-]+$/.test(line)) {
                    possibleName = line;
                    break;
                }
            }
        }

        // Extract location
        const locationPatterns = [
            /(?:location|address|city|based in|living in)[:\s]+([^,\n]+(?:,\s*[^,\n]+)?)/gi,
            /([A-Za-z\s]+,\s*[A-Za-z\s]+,?\s*(?:USA|UK|Canada|Australia|Germany|France|India|China)?)/g
        ];
        let location = null;
        for (const pattern of locationPatterns) {
            const match = text.match(pattern);
            if (match) {
                location = match[0].replace(/^(?:location|address|city|based in|living in)[:\s]+/i, '').trim();
                break;
            }
        }

        return {
            email: emails[0] || null,
            phone: phones.find(p => p.replace(/\D/g, '').length >= 7) || null,
            linkedin: linkedin[0] || null,
            github: github[0] || null,
            portfolio: portfolio[0] || null,
            name: possibleName || null,
            location: location
        };
    }

    extractSkills(text) {
        const skillKeywords = [
            // Programming Languages
            'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'golang', 'rust', 'scala', 'perl', 'r', 'matlab', 'shell', 'bash', 'powershell',
            // Frontend
            'react', 'react.js', 'reactjs', 'angular', 'vue', 'vue.js', 'vuejs', 'svelte', 'html', 'html5', 'css', 'css3', 'sass', 'scss', 'less', 'jquery', 'bootstrap', 'tailwind', 'tailwindcss', 'next.js', 'nextjs', 'nuxt', 'gatsby', 'webpack', 'vite', 'redux', 'mobx', 'graphql',
            // Backend
            'node.js', 'nodejs', 'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'asp.net', '.net', 'laravel', 'rails', 'ruby on rails', 'nest.js', 'nestjs', 'koa',
            // Databases
            'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch', 'oracle', 'sql server', 'mssql', 'sqlite', 'dynamodb', 'cassandra', 'neo4j', 'firebase', 'firestore', 'supabase', 'prisma', 'mongoose',
            // Cloud & DevOps
            'aws', 'amazon web services', 'azure', 'microsoft azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s', 'jenkins', 'ci/cd', 'terraform', 'ansible', 'puppet', 'chef', 'cloudformation', 'lambda', 'serverless', 'nginx', 'apache', 'linux', 'unix',
            // Data Science & AI/ML
            'machine learning', 'deep learning', 'artificial intelligence', 'ai', 'ml', 'tensorflow', 'pytorch', 'keras', 'pandas', 'numpy', 'scikit-learn', 'sklearn', 'nlp', 'natural language processing', 'computer vision', 'opencv', 'data science', 'data analysis', 'data analytics', 'big data', 'hadoop', 'spark', 'apache spark', 'tableau', 'power bi', 'looker',
            // Mobile
            'android', 'ios', 'react native', 'flutter', 'xamarin', 'ionic', 'cordova',
            // Tools & Others
            'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'trello', 'asana', 'slack', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator',
            // Testing
            'jest', 'mocha', 'chai', 'cypress', 'selenium', 'puppeteer', 'playwright', 'junit', 'pytest', 'testing', 'unit testing', 'tdd', 'bdd',
            // Methodologies
            'agile', 'scrum', 'kanban', 'devops', 'microservices', 'rest', 'restful', 'api', 'soap', 'grpc',
            // Soft Skills
            'leadership', 'communication', 'teamwork', 'team player', 'problem solving', 'analytical', 'critical thinking', 'project management', 'time management', 'presentation', 'negotiation', 'mentoring'
        ];

        const foundSkills = [];
        const lowerText = text.toLowerCase();

        skillKeywords.forEach(skill => {
            const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(lowerText)) {
                const normalizedSkill = this.normalizeSkillName(skill);
                if (!foundSkills.includes(normalizedSkill)) {
                    foundSkills.push(normalizedSkill);
                }
            }
        });

        return foundSkills;
    }

    normalizeSkillName(skill) {
        const normalizations = {
            'react.js': 'React', 'reactjs': 'React', 'react': 'React',
            'vue.js': 'Vue.js', 'vuejs': 'Vue.js',
            'node.js': 'Node.js', 'nodejs': 'Node.js',
            'next.js': 'Next.js', 'nextjs': 'Next.js',
            'nest.js': 'NestJS', 'nestjs': 'NestJS',
            'express.js': 'Express',
            'postgresql': 'PostgreSQL', 'postgres': 'PostgreSQL',
            'mongodb': 'MongoDB', 'mysql': 'MySQL',
            'javascript': 'JavaScript', 'typescript': 'TypeScript',
            'python': 'Python', 'golang': 'Go', 'go': 'Go',
            'kubernetes': 'Kubernetes', 'k8s': 'Kubernetes',
            'docker': 'Docker', 'aws': 'AWS',
            'amazon web services': 'AWS',
            'gcp': 'Google Cloud', 'google cloud': 'Google Cloud',
            'azure': 'Azure', 'microsoft azure': 'Azure',
            'tailwindcss': 'Tailwind CSS', 'tailwind': 'Tailwind CSS'
        };
        
        return normalizations[skill.toLowerCase()] || skill.charAt(0).toUpperCase() + skill.slice(1);
    }

    extractEducation(text) {
        const educationSection = this.extractSection(text, ['education', 'academic', 'qualification', 'degree']);
        const degrees = [];

        const degreePatterns = [
            { pattern: /(?:ph\.?d\.?|doctorate|doctoral|doctor of philosophy)/gi, level: 'PhD' },
            { pattern: /(?:master'?s?|m\.?s\.?c?\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?eng\.?|m\.?tech\.?|msc|mba)/gi, level: 'Master' },
            { pattern: /(?:bachelor'?s?|b\.?s\.?c?\.?|b\.?a\.?|b\.?eng\.?|b\.?tech\.?|bsc|ba|beng)/gi, level: 'Bachelor' },
            { pattern: /(?:associate'?s?|a\.?s\.?|a\.?a\.?|diploma|hnd)/gi, level: 'Associate' },
            { pattern: /(?:certificate|certification|professional cert)/gi, level: 'Certificate' }
        ];

        const institutionPatterns = [
            /(?:university|college|institute|school|academy)\s+(?:of\s+)?[\w\s]+/gi,
            /[\w\s]+(?:university|college|institute)/gi
        ];

        const yearPattern = /\b(19|20)\d{2}\b/g;
        const years = educationSection.match(yearPattern) || [];

        const fieldPatterns = [
            /(?:in|of)\s+(computer science|information technology|business|engineering|mathematics|physics|chemistry|biology|economics|psychology|marketing|finance|accounting|management|design|arts?|science)/gi
        ];

        degreePatterns.forEach(({ pattern, level }) => {
            const matches = educationSection.match(pattern);
            if (matches) {
                matches.forEach((match, idx) => {
                    const degree = {
                        degree: level,
                        rawDegree: match.trim(),
                        year: years[idx] || null,
                        institution: null,
                        field: null
                    };

                    // Try to find institution near this degree mention
                    institutionPatterns.forEach(instPattern => {
                        const instMatch = educationSection.match(instPattern);
                        if (instMatch && instMatch[0]) {
                            degree.institution = instMatch[0].trim();
                        }
                    });

                    // Try to find field of study
                    fieldPatterns.forEach(fieldPattern => {
                        const fieldMatch = educationSection.match(fieldPattern);
                        if (fieldMatch && fieldMatch[0]) {
                            degree.field = fieldMatch[0].replace(/^(?:in|of)\s+/i, '').trim();
                        }
                    });

                    degrees.push(degree);
                });
            }
        });

        // Remove duplicates based on level
        const uniqueDegrees = [];
        const seenLevels = new Set();
        degrees.forEach(d => {
            if (!seenLevels.has(d.degree)) {
                seenLevels.add(d.degree);
                uniqueDegrees.push(d);
            }
        });

        return uniqueDegrees;
    }

    extractExperience(text) {
        const experienceSection = this.extractSection(text, ['experience', 'work history', 'employment', 'professional background', 'career']);
        const experiences = [];

        const jobTitlePatterns = [
            /(?:senior|junior|lead|principal|staff|chief|head|director|vp|vice president)?\s*(?:software|frontend|backend|full[ -]?stack|mobile|web|devops|cloud|data|ml|ai)?\s*(?:developer|engineer|architect|programmer|specialist)/gi,
            /(?:project|product|program|engineering|technical|it|development|delivery)\s*(?:manager|lead|director)/gi,
            /(?:data|business|systems?|security|quality|financial)\s*(?:analyst|scientist|engineer)/gi,
            /(?:ux|ui|ux\/ui|product|graphic|visual|web)\s*designer/gi,
            /(?:scrum|agile)\s*master/gi,
            /(?:cto|ceo|cfo|coo|cio)/gi,
            /consultant/gi,
            /(?:team|tech)\s*lead/gi
        ];

        const dateRangePatterns = [
            /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.\s]*\d{4}\s*[-–—to]+\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|present|current|now|ongoing)[.\s]*\d{0,4}/gi,
            /\d{1,2}\/\d{4}\s*[-–—to]+\s*(?:\d{1,2}\/\d{4}|present|current|now)/gi,
            /\d{4}\s*[-–—to]+\s*(?:\d{4}|present|current|now)/gi
        ];

        let dateRanges = [];
        dateRangePatterns.forEach(pattern => {
            const matches = experienceSection.match(pattern);
            if (matches) {
                dateRanges = dateRanges.concat(matches);
            }
        });

        jobTitlePatterns.forEach(pattern => {
            const matches = experienceSection.match(pattern);
            if (matches) {
                matches.forEach((match, idx) => {
                    const exp = {
                        title: match.trim(),
                        company: null,
                        dateRange: dateRanges[idx] || null,
                        startDate: null,
                        endDate: null
                    };

                    if (exp.dateRange) {
                        const [start, end] = exp.dateRange.split(/[-–—to]+/i);
                        exp.startDate = start?.trim();
                        exp.endDate = end?.trim() || 'Present';
                    }

                    experiences.push(exp);
                });
            }
        });

        // Calculate years of experience
        let totalYears = 0;
        const yearMatches = experienceSection.match(/(\d+)\+?\s*(?:years?|yrs?)/gi);
        if (yearMatches) {
            yearMatches.forEach(match => {
                const num = parseInt(match);
                if (!isNaN(num) && num < 50) {
                    totalYears = Math.max(totalYears, num);
                }
            });
        }

        // Calculate from date ranges if no explicit years mentioned
        if (totalYears === 0 && dateRanges.length > 0) {
            const currentYear = new Date().getFullYear();
            const yearsFromDates = new Set();
            dateRanges.forEach(range => {
                const years = range.match(/\d{4}/g);
                if (years) {
                    years.forEach(y => yearsFromDates.add(parseInt(y)));
                }
            });
            if (yearsFromDates.size > 0) {
                const minYear = Math.min(...yearsFromDates);
                totalYears = currentYear - minYear;
            }
        }

        return {
            positions: experiences.slice(0, 10),
            totalYears: Math.min(totalYears, 50),
            dateRanges
        };
    }

    extractCertifications(text) {
        const certSection = this.extractSection(text, ['certification', 'certificate', 'credential', 'license', 'accreditation']);
        const certifications = [];

        const certPatterns = [
            // Cloud Certifications
            /aws\s+(?:certified\s+)?(?:solutions?\s+architect|developer|sysops|devops|cloud practitioner|machine learning|database|security|networking)(?:\s+-\s+(?:associate|professional|specialty))?/gi,
            /(?:google|gcp)\s+(?:cloud\s+)?(?:professional|associate)\s+(?:cloud\s+)?(?:architect|engineer|developer|data engineer|machine learning)/gi,
            /(?:microsoft|azure)\s+(?:certified:?\s+)?(?:azure\s+)?(?:administrator|developer|architect|data|ai|security|devops)(?:\s+(?:associate|expert|fundamentals))?/gi,
            // Project Management
            /(?:pmp|prince2|capm|csm|psm|pmi-acp|safe|pmbok)/gi,
            // IT & Security
            /(?:ccna|ccnp|ccie|mcse|mcsa|mcitp)/gi,
            /(?:cissp|cism|cisa|ceh|comptia\s+(?:security\+|network\+|a\+|linux\+|cloud\+)|oscp)/gi,
            // Data & Analytics
            /(?:google\s+)?(?:data\s+)?(?:analytics|engineer)\s+(?:professional\s+)?certificate/gi,
            /(?:tableau|power\s+bi|looker)\s+(?:desktop\s+)?(?:specialist|analyst|professional)/gi,
            // Development
            /(?:oracle\s+)?(?:java|javascript|python)\s+(?:se\s+)?(?:certified|developer|programmer)/gi,
            // Agile & Scrum
            /(?:certified\s+)?scrum\s+(?:master|product\s+owner|developer)/gi,
            /safe\s+(?:\d+\.?\d*)?\s*(?:agilist|practitioner|scrum\s+master|product\s+owner)/gi
        ];

        certPatterns.forEach(pattern => {
            const matches = certSection.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const cert = match.trim();
                    if (!certifications.some(c => c.toLowerCase() === cert.toLowerCase())) {
                        certifications.push(cert);
                    }
                });
            }
        });

        return certifications;
    }

    extractLanguages(text) {
        const languages = [];
        const languageSection = this.extractSection(text, ['language', 'languages']);
        
        const languagePatterns = [
            /(?:english|french|german|spanish|portuguese|italian|chinese|mandarin|cantonese|japanese|korean|arabic|hindi|russian|dutch|swedish|norwegian|danish|finnish|polish|turkish|greek|hebrew)\s*[-:–]?\s*(?:native|fluent|proficient|intermediate|basic|beginner|advanced|professional|conversational|working)?/gi,
            /(?:native|fluent|proficient|intermediate|basic|beginner|advanced|professional|conversational|working)\s*(?:in\s+)?(?:english|french|german|spanish|portuguese|italian|chinese|mandarin|cantonese|japanese|korean|arabic|hindi|russian|dutch|swedish|norwegian|danish|finnish|polish|turkish|greek|hebrew)/gi
        ];

        languagePatterns.forEach(pattern => {
            const matches = languageSection.match(pattern) || text.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const lang = match.trim();
                    if (!languages.some(l => l.toLowerCase().includes(lang.toLowerCase().split(/\s+/)[0]))) {
                        languages.push(lang);
                    }
                });
            }
        });

        return languages;
    }

    extractSummary(text) {
        const summarySection = this.extractSection(text, ['summary', 'objective', 'profile', 'about me', 'professional summary', 'career objective']);
        
        // Take first 800 characters, trying to end at a sentence
        let summary = summarySection.substring(0, 800);
        const lastPeriod = summary.lastIndexOf('.');
        if (lastPeriod > 200) {
            summary = summary.substring(0, lastPeriod + 1);
        }
        
        return summary.trim();
    }

    extractSection(text, keywords) {
        const lowerText = text.toLowerCase();
        let sectionStart = -1;
        let keyword = '';

        for (const kw of keywords) {
            const idx = lowerText.indexOf(kw);
            if (idx !== -1 && (sectionStart === -1 || idx < sectionStart)) {
                sectionStart = idx;
                keyword = kw;
            }
        }

        if (sectionStart === -1) return text;

        // Find next section
        const sectionHeaders = ['education', 'experience', 'skills', 'certification', 'project', 'reference', 'language', 'hobby', 'interest', 'achievement', 'award', 'publication', 'volunteer'];
        let sectionEnd = text.length;

        for (const header of sectionHeaders) {
            if (header === keyword || keywords.some(k => header.includes(k))) continue;
            const idx = lowerText.indexOf(header, sectionStart + keyword.length + 10);
            if (idx !== -1 && idx < sectionEnd) {
                sectionEnd = idx;
            }
        }

        return text.substring(sectionStart, sectionEnd);
    }

    // Calculate match score between resume and job requirements
    async calculateJobMatchScore(parsedResume, jobRequirements, resumeText = '') {
        // Try OpenAI first for more accurate matching
        if (this.useOpenAI && openai && resumeText) {
            try {
                console.log('Using OpenAI for job match scoring...');
                const aiResult = await this.calculateJobMatchScoreWithAI(parsedResume, jobRequirements, resumeText);
                if (aiResult) {
                    return aiResult;
                }
            } catch (error) {
                console.error('OpenAI job match failed, using fallback:', error.message);
            }
        }

        // Fallback to regex-based matching
        return this.calculateJobMatchScoreBasic(parsedResume, jobRequirements);
    }

    async calculateJobMatchScoreWithAI(parsedResume, jobRequirements, resumeText) {
        const requiredSkillsText = (jobRequirements.required_skills || [])
            .map(s => typeof s === 'string' ? s : s.name)
            .join(', ');

        const prompt = `You are an expert HR analyst. Analyze how well a candidate matches a job based on their resume.

JOB REQUIREMENTS:
- Required Skills: ${requiredSkillsText || 'Not specified'}
- Minimum Experience: ${jobRequirements.min_experience_years || 0} years
- Education Requirement: ${jobRequirements.education_level || 'Not specified'}

CANDIDATE RESUME TEXT:
${resumeText.substring(0, 8000)}

PARSED RESUME DATA:
- Skills Found: ${JSON.stringify(parsedResume.skills || []).substring(0, 1500)}
- Education: ${JSON.stringify(parsedResume.education || []).substring(0, 1000)}
- Experience: ${JSON.stringify(parsedResume.experience || []).substring(0, 1500)}

IMPORTANT EDUCATION SCORING RULES:
- Education levels hierarchy (lowest to highest): High School < Certificate < Diploma < Associate < Bachelor's/Degree < Master's/MBA < PhD/Doctorate
- If the job requires a "degree" or "bachelor's", candidates with ONLY high school should score 0-20% on education
- Diploma holders should score 40-60% if degree is required
- Only those with bachelor's degree or higher should score 70-100% when degree is required
- When candidate has multiple qualifications, USE THE HIGHEST ONE for scoring
- A candidate's education MUST meet or exceed the requirement to get a high score

Analyze the match and return a JSON object with this exact structure:
{
    "overallScore": <number 0-100>,
    "skillsMatch": {
        "score": <number 0-100>,
        "matched": ["skill1", "skill2"],
        "missing": ["skill3"],
        "transferable": ["related skill they have that could help"],
        "analysis": "Brief analysis of skills match"
    },
    "experienceMatch": {
        "score": <number 0-100>,
        "yearsRelevant": <number>,
        "details": "Analysis of experience relevance",
        "strengths": ["strength1", "strength2"],
        "gaps": ["gap1"]
    },
    "educationMatch": {
        "score": <number 0-100>,
        "details": "Analysis of education match",
        "meetsRequirement": <boolean>
    },
    "overallAnalysis": "2-3 sentence summary of candidate fit",
    "recommendation": "STRONG_MATCH | GOOD_MATCH | POTENTIAL_MATCH | WEAK_MATCH",
    "interviewFocus": ["area to probe in interview 1", "area 2"]
}

Be fair but thorough. Consider transferable skills and related experience.`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are an expert HR analyst who evaluates candidate-job fit. Provide accurate, fair assessments based on the data provided. Always respond with valid JSON.' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2,
                max_tokens: 2000,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(response.choices[0].message.content);
            console.log('OpenAI job match calculated successfully');

            // Calculate overall score using consistent weighted formula
            // Skills: 40%, Experience: 35%, Education: 25%
            const skillsScore = result.skillsMatch?.score || 0;
            const experienceScore = result.experienceMatch?.score || 0;
            const educationScore = result.educationMatch?.score || 0;
            const calculatedOverall = Math.round(
                skillsScore * 0.4 + experienceScore * 0.35 + educationScore * 0.25
            );

            // Ensure consistent structure
            return {
                overallScore: calculatedOverall,
                skillsMatch: {
                    score: result.skillsMatch?.score || 0,
                    matched: result.skillsMatch?.matched || [],
                    missing: result.skillsMatch?.missing || [],
                    transferable: result.skillsMatch?.transferable || [],
                    analysis: result.skillsMatch?.analysis || ''
                },
                experienceMatch: {
                    score: result.experienceMatch?.score || 0,
                    yearsRelevant: result.experienceMatch?.yearsRelevant || 0,
                    details: result.experienceMatch?.details || '',
                    strengths: result.experienceMatch?.strengths || [],
                    gaps: result.experienceMatch?.gaps || []
                },
                educationMatch: {
                    score: result.educationMatch?.score || 0,
                    details: result.educationMatch?.details || '',
                    meetsRequirement: result.educationMatch?.meetsRequirement || false
                },
                overallAnalysis: result.overallAnalysis || '',
                recommendation: result.recommendation || 'POTENTIAL_MATCH',
                interviewFocus: result.interviewFocus || [],
                aiPowered: true
            };
        } catch (error) {
            console.error('OpenAI job match error:', error);
            throw error;
        }
    }

    calculateJobMatchScoreBasic(parsedResume, jobRequirements) {
        let totalScore = 0;
        const matchDetails = {
            skillsMatch: { score: 0, matched: [], missing: [] },
            experienceMatch: { score: 0, details: '' },
            educationMatch: { score: 0, details: '' },
            overallScore: 0
        };

        // Skills matching (40% weight)
        const requiredSkills = jobRequirements.required_skills || [];
        const candidateSkills = (parsedResume.skills || []).map(s => 
            (typeof s === 'string' ? s : s.name || s.skill || '').toLowerCase()
        );
        
        let matchedSkills = 0;
        requiredSkills.forEach(reqSkill => {
            const skillName = (typeof reqSkill === 'string' ? reqSkill : reqSkill.name || '').toLowerCase();
            if (candidateSkills.some(cs => cs.includes(skillName) || skillName.includes(cs))) {
                matchedSkills++;
                matchDetails.skillsMatch.matched.push(typeof reqSkill === 'string' ? reqSkill : reqSkill.name);
            } else {
                matchDetails.skillsMatch.missing.push(typeof reqSkill === 'string' ? reqSkill : reqSkill.name);
            }
        });

        if (requiredSkills.length > 0) {
            matchDetails.skillsMatch.score = Math.round((matchedSkills / requiredSkills.length) * 100);
        } else {
            matchDetails.skillsMatch.score = 70;
        }
        totalScore += matchDetails.skillsMatch.score * 0.4;

        // Experience matching (35% weight)
        const requiredExp = jobRequirements.min_experience_years || 0;
        let candidateExp = 0;
        
        // Try to calculate experience from parsed experience array
        if (Array.isArray(parsedResume.experience)) {
            parsedResume.experience.forEach(exp => {
                if (exp.startDate && exp.endDate) {
                    const start = new Date(exp.startDate);
                    const end = exp.endDate === 'Present' ? new Date() : new Date(exp.endDate);
                    candidateExp += (end - start) / (1000 * 60 * 60 * 24 * 365);
                }
            });
            candidateExp = Math.round(candidateExp * 10) / 10;
        } else if (parsedResume.experience?.totalYears) {
            candidateExp = parsedResume.experience.totalYears;
        }
        
        if (candidateExp >= requiredExp) {
            matchDetails.experienceMatch.score = 100;
            matchDetails.experienceMatch.details = `${candidateExp.toFixed(1)} years (meets ${requiredExp}+ requirement)`;
        } else if (candidateExp >= requiredExp * 0.7) {
            matchDetails.experienceMatch.score = 70;
            matchDetails.experienceMatch.details = `${candidateExp.toFixed(1)} years (slightly below ${requiredExp} requirement)`;
        } else {
            matchDetails.experienceMatch.score = Math.max(30, Math.round((candidateExp / Math.max(requiredExp, 1)) * 100));
            matchDetails.experienceMatch.details = `${candidateExp.toFixed(1)} years (below ${requiredExp} requirement)`;
        }
        totalScore += matchDetails.experienceMatch.score * 0.35;

        // Education matching (25% weight)
        // Education hierarchy: high school(0) < certificate(1) < diploma(2) < associate(3) < bachelor/degree(4) < master/mba(5) < phd/doctorate(6)
        const requiredEducation = (jobRequirements.education_level || '').toLowerCase();
        const candidateEducation = parsedResume.education || [];
        
        // Map education levels to numeric values
        const getEducationLevel = (eduString) => {
            const edu = (eduString || '').toLowerCase();
            if (edu.includes('phd') || edu.includes('doctorate') || edu.includes('doctor')) return 6;
            if (edu.includes('master') || edu.includes('mba') || edu.includes('msc') || edu.includes('m.s')) return 5;
            if (edu.includes('bachelor') || edu.includes('degree') || edu.includes('bsc') || edu.includes('b.s') || edu.includes('b.a')) return 4;
            if (edu.includes('associate')) return 3;
            if (edu.includes('diploma') || edu.includes('hnd')) return 2;
            if (edu.includes('certificate') || edu.includes('cert')) return 1;
            if (edu.includes('high school') || edu.includes('secondary') || edu.includes('gcse') || edu.includes('a-level') || edu.includes('ged')) return 0;
            return -1; // Unknown
        };
        
        const reqEduLevel = getEducationLevel(requiredEducation);
        
        // Find the candidate's HIGHEST education level
        let highestCandEduLevel = -1;
        let highestDegree = '';
        candidateEducation.forEach(e => {
            const degreeText = e.degree || e.field || e.rawDegree || '';
            const level = getEducationLevel(degreeText);
            if (level > highestCandEduLevel) {
                highestCandEduLevel = level;
                highestDegree = degreeText;
            }
        });
        
        // Score based on how well candidate's highest education meets requirement
        if (reqEduLevel === -1) {
            // No specific requirement - give reasonable score if they have any education
            matchDetails.educationMatch.score = highestCandEduLevel >= 0 ? 80 : 60;
            matchDetails.educationMatch.details = highestDegree || 'No specific requirement';
        } else if (highestCandEduLevel >= reqEduLevel) {
            // Meets or exceeds requirement
            matchDetails.educationMatch.score = 100;
            matchDetails.educationMatch.details = `${highestDegree} (meets ${requiredEducation} requirement)`;
        } else if (highestCandEduLevel === reqEduLevel - 1) {
            // One level below (e.g., diploma when bachelor required)
            matchDetails.educationMatch.score = 50;
            matchDetails.educationMatch.details = `${highestDegree} (${requiredEducation} required - close but below)`;
        } else if (highestCandEduLevel === reqEduLevel - 2) {
            // Two levels below
            matchDetails.educationMatch.score = 30;
            matchDetails.educationMatch.details = `${highestDegree} (${requiredEducation} required - significantly below)`;
        } else if (highestCandEduLevel >= 0) {
            // More than two levels below (e.g., high school when degree required)
            matchDetails.educationMatch.score = 15;
            matchDetails.educationMatch.details = `${highestDegree} (${requiredEducation} required - does not meet requirement)`;
        } else {
            // No education found
            matchDetails.educationMatch.score = 10;
            matchDetails.educationMatch.details = `Education not found (${requiredEducation} required)`;
        }
        totalScore += matchDetails.educationMatch.score * 0.25;

        matchDetails.overallScore = Math.round(totalScore);
        matchDetails.aiPowered = false;
        return matchDetails;
    }
}

module.exports = new ResumeParserService();
