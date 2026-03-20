const OpenAI = require('openai');
const config = require('../config');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Initialize OpenAI (if API key is provided)
let openai = null;
if (config.openai.apiKey && config.openai.apiKey !== 'your-openai-api-key') {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
}

class AIService {
    // Parse resume using OpenAI
    async parseResume(filePath) {
        try {
            // Read and extract text from PDF
            const absolutePath = path.join(__dirname, '../../uploads', filePath.replace('/uploads/', ''));
            const dataBuffer = fs.readFileSync(absolutePath);
            const pdfData = await pdfParse(dataBuffer);
            const resumeText = pdfData.text;

            // If OpenAI is available, use it for parsing
            if (openai) {
                const prompt = `
                Parse this resume and extract information in JSON format:
                
                RESUME TEXT:
                ${resumeText.substring(0, 8000)}
                
                Extract and return a JSON object with:
                {
                    "contact": {
                        "name": "full name",
                        "email": "email address",
                        "phone": "phone number",
                        "location": "city, country"
                    },
                    "summary": "brief professional summary",
                    "skills": ["list of skills"],
                    "experience": [
                        {
                            "title": "job title",
                            "company": "company name",
                            "duration": "start - end dates",
                            "description": "key responsibilities"
                        }
                    ],
                    "education": [
                        {
                            "degree": "degree name",
                            "institution": "school name",
                            "year": "graduation year"
                        }
                    ],
                    "certifications": ["list of certifications"],
                    "languages": ["list of languages"]
                }
                `;

                try {
                    const response = await openai.chat.completions.create({
                        model: 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.2,
                        response_format: { type: 'json_object' }
                    });

                    const parsed = JSON.parse(response.choices[0].message.content);
                    return {
                        raw_text: resumeText,
                        parsed_data: parsed,
                        extracted_skills: parsed.skills || [],
                        extracted_experience: parsed.experience || [],
                        extracted_education: parsed.education || [],
                        extracted_contact: parsed.contact || {},
                        extracted_summary: parsed.summary || '',
                        extraction_confidence: 0.85
                    };
                } catch (aiError) {
                    console.error('OpenAI parsing error:', aiError);
                }
            }

            // Fallback to basic extraction
            return this.basicResumeExtraction(resumeText);
        } catch (error) {
            console.error('Resume parsing error:', error);
            return {
                raw_text: '',
                parsed_data: {},
                extracted_skills: [],
                extracted_experience: [],
                extracted_education: [],
                extraction_confidence: 0
            };
        }
    }

    basicResumeExtraction(text) {
        // Basic extraction without AI
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
        const phoneMatch = text.match(/[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{4,6}/);
        
        // Common skill keywords
        const skillKeywords = ['JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS', 'Docker', 
            'TypeScript', 'HTML', 'CSS', 'Git', 'MongoDB', 'PostgreSQL', 'Agile', 'Scrum',
            'Machine Learning', 'Data Analysis', 'Project Management', 'Communication', 'Leadership'];
        const foundSkills = skillKeywords.filter(skill => 
            text.toLowerCase().includes(skill.toLowerCase())
        );

        return {
            raw_text: text,
            parsed_data: {
                contact: {
                    email: emailMatch ? emailMatch[0] : null,
                    phone: phoneMatch ? phoneMatch[0] : null
                },
                skills: foundSkills
            },
            extracted_skills: foundSkills,
            extracted_experience: [],
            extracted_education: [],
            extracted_contact: {
                email: emailMatch ? emailMatch[0] : null,
                phone: phoneMatch ? phoneMatch[0] : null
            },
            extraction_confidence: 0.4
        };
    }

    // Screen an application against job requirements
    async screenApplication(application, job) {
        try {
            const candidateId = application.candidate_id;
            const employeeId = application.employee_id;

            // Get resume data (same source used by resume parser GPT-4o-mini scoring)
            const resumeResult = await db.query(`
                SELECT COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills,
                       COALESCE(rc.extracted_education, re.extracted_education) as parsed_education,
                       COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
                       COALESCE(rc.raw_text, re.raw_text) as resume_text,
                       COALESCE(rc.extraction_confidence, re.extraction_confidence) as extraction_confidence
                FROM applications a
                LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                LEFT JOIN resumes rc ON rc.candidate_id = cp.id
                LEFT JOIN resumes re ON re.employee_id = ep.id
                WHERE a.id = $1
                ORDER BY COALESCE(rc.is_primary, re.is_primary) DESC,
                         COALESCE(rc.created_at, re.created_at) DESC
                LIMIT 1
            `, [application.id]);

            if (resumeResult.rows.length === 0 || !resumeResult.rows[0].resume_text) {
                console.log(`No resume data found for application ${application.id}, using rule-based scoring`);
                return this._fallbackScreening(application, job);
            }

            const resumeData = resumeResult.rows[0];
            const parsedResume = {
                skills: resumeData.parsed_skills || [],
                education: resumeData.parsed_education || [],
                experience: resumeData.parsed_experience || []
            };
            const jobRequirements = {
                required_skills: job.required_skills || [],
                min_experience_years: job.min_experience_years || 0,
                education_level: job.education_requirement || ''
            };

            // Use the resume parser service (GPT-4o-mini) — single scoring engine
            const resumeParser = require('./resumeParser.service');
            const matchResult = await resumeParser.calculateJobMatchScore(
                parsedResume, jobRequirements, resumeData.resume_text || ''
            );

            // Map resume parser output to the screening result format
            const skills = matchResult.skillsMatch || {};
            const experience = matchResult.experienceMatch || {};
            const education = matchResult.educationMatch || {};

            // Build strengths list
            const strengths = [];
            if (experience.strengths) strengths.push(...experience.strengths);
            if (skills.matched && skills.matched.length > 0) strengths.push(`Matched skills: ${skills.matched.join(', ')}`);
            if (skills.transferable && skills.transferable.length > 0) strengths.push(`Transferable skills: ${skills.transferable.join(', ')}`);
            if (education.meetsRequirement) strengths.push('Meets education requirements');

            // Build concerns list
            const concerns = [];
            if (experience.gaps) concerns.push(...experience.gaps);
            if (skills.missing && skills.missing.length > 0) concerns.push(`Missing skills: ${skills.missing.join(', ')}`);
            if (education.meetsRequirement === false) concerns.push(education.details || 'Education may not meet requirements');

            // Build interview questions
            const interviewQuestions = matchResult.interviewFocus || [];
            if (interviewQuestions.length < 5) {
                const defaults = [
                    `Tell me about your experience relevant to the ${job.title} role.`,
                    'Describe a challenging project you worked on recently and the outcome.',
                    'How do you stay updated with industry trends and technologies?',
                    `Why are you interested in the ${job.title} position?`,
                    'Where do you see yourself in 5 years?'
                ];
                for (const q of defaults) {
                    if (interviewQuestions.length >= 5) break;
                    interviewQuestions.push(q);
                }
            }

            // Recommendation mapping
            let recommendation = matchResult.overallAnalysis || '';
            if (!recommendation) {
                const rec = matchResult.recommendation || '';
                if (rec === 'STRONG_MATCH') recommendation = 'Strong candidate - highly recommended for interview';
                else if (rec === 'GOOD_MATCH') recommendation = 'Good candidate - recommend for interview';
                else if (rec === 'POTENTIAL_MATCH') recommendation = 'Potential candidate - review further';
                else recommendation = 'May not be suitable - significant gaps';
            }

            return {
                overallScore: matchResult.overallScore || 0,
                skillMatchScore: skills.score || 0,
                experienceMatchScore: experience.score || 0,
                educationMatchScore: education.score || 0,
                culturalFitScore: Math.round((skills.score || 0) * 0.3 + (experience.score || 0) * 0.4 + (education.score || 0) * 0.3),
                skillGapAnalysis: skills.missing || [],
                strengths,
                concerns,
                interviewQuestions: interviewQuestions.slice(0, 5),
                successPrediction: Math.round((matchResult.overallScore || 0)) / 100,
                retentionPrediction: Math.round(Math.min(0.95, 0.5 + ((matchResult.overallScore || 0) / 200)) * 100) / 100,
                recommendation,
                // Also include the full resume match details for saving to resume_match_score
                _resumeMatchDetails: matchResult
            };
        } catch (error) {
            console.error('AI Screening error:', error);
            return this._fallbackScreening(application, job);
        }
    }

    // Fallback screening when no resume data is available
    async _fallbackScreening(application, job) {
        const candidateId = application.candidate_id;
        const employeeId = application.employee_id;

        let candidateSkills = [];
        let educationRecords = [];
        let workExperience = [];

        // Try to get skills from DB tables
        if (candidateId) {
            const r = await db.query(`SELECT s.name, cs.proficiency_level FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = $1`, [candidateId]);
            candidateSkills = r.rows;
        }
        if (employeeId && candidateSkills.length === 0) {
            const r = await db.query(`SELECT s.name, es.proficiency_level FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = $1`, [employeeId]);
            candidateSkills = r.rows;
        }

        // Get education
        if (candidateId) {
            const r = await db.query(`SELECT * FROM education_records WHERE candidate_id = $1`, [candidateId]);
            educationRecords = r.rows;
        }
        if (employeeId && educationRecords.length === 0) {
            const r = await db.query(`SELECT * FROM education_records WHERE employee_id = $1`, [employeeId]);
            educationRecords = r.rows;
        }

        // Get work experience
        if (candidateId) {
            const r = await db.query(`SELECT * FROM work_experience WHERE candidate_id = $1 ORDER BY start_date DESC`, [candidateId]);
            workExperience = r.rows;
        }
        if (employeeId && workExperience.length === 0) {
            const r = await db.query(`SELECT * FROM work_experience WHERE employee_id = $1 ORDER BY start_date DESC`, [employeeId]);
            workExperience = r.rows;
        }

        return this.ruleBasedScreening(application, job, candidateSkills, educationRecords, workExperience);
    }

    ruleBasedScreening(application, job, candidateSkills, educationRecords = [], workExperience = []) {
        // Education level hierarchy
        const educationHierarchy = {
            'high_school': 1, 'associate': 2, 'bachelor': 3, 'master': 4, 'doctorate': 5, 'professional': 5
        };

        let skillMatchScore = 0;
        let experienceMatchScore = 0;
        let educationMatchScore = 0;
        
        // Parse job required skills
        const requiredSkills = job.required_skills ? 
            (typeof job.required_skills === 'string' ? JSON.parse(job.required_skills) : job.required_skills) : [];
        
        // === 1. Calculate skill match ===
        if (requiredSkills.length > 0 && candidateSkills.length > 0) {
            const matchedSkills = candidateSkills.filter(cs => 
                requiredSkills.some(rs => {
                    const rsName = (rs.name || rs).toLowerCase().trim();
                    const csName = (cs.name || '').toLowerCase().trim();
                    return rsName === csName || rsName.includes(csName) || csName.includes(rsName);
                })
            );
            skillMatchScore = (matchedSkills.length / requiredSkills.length) * 100;
            
            // Bonus for having extra relevant skills beyond requirements
            if (candidateSkills.length > requiredSkills.length) {
                skillMatchScore = Math.min(100, skillMatchScore + 5);
            }
            // Bonus for advanced proficiency
            const advancedMatches = matchedSkills.filter(s => 
                s.proficiency_level === 'advanced' || s.proficiency_level === 'expert'
            );
            if (advancedMatches.length > 0) {
                skillMatchScore = Math.min(100, skillMatchScore + (advancedMatches.length / matchedSkills.length) * 10);
            }
        } else if (requiredSkills.length === 0) {
            skillMatchScore = 75; // No requirements specified, moderate score
        } else {
            skillMatchScore = 10; // Has no skills at all
        }

        // === 2. Calculate experience match ===
        // Calculate total years from work experience records
        let totalYearsExp = 0;
        if (workExperience.length > 0) {
            for (const exp of workExperience) {
                const start = exp.start_date ? new Date(exp.start_date) : null;
                const end = exp.is_current ? new Date() : (exp.end_date ? new Date(exp.end_date) : null);
                if (start && end) {
                    totalYearsExp += (end - start) / (365.25 * 24 * 60 * 60 * 1000);
                }
            }
        }
        // Fall back to profile years_of_experience
        if (totalYearsExp === 0) {
            totalYearsExp = parseFloat(application.years_of_experience) || 0;
        }

        const minExp = parseFloat(job.min_experience_years) || 0;
        const maxExp = parseFloat(job.max_experience_years) || 20;

        if (minExp === 0 && totalYearsExp === 0) {
            experienceMatchScore = 60; // Entry level, no experience - neutral
        } else if (totalYearsExp >= minExp && totalYearsExp <= maxExp) {
            experienceMatchScore = 100;
        } else if (totalYearsExp > maxExp) {
            experienceMatchScore = Math.max(70, 100 - (totalYearsExp - maxExp) * 5);
        } else if (totalYearsExp < minExp) {
            const deficit = minExp - totalYearsExp;
            experienceMatchScore = Math.max(0, 100 - deficit * 20);
        }

        // Bonus for relevant job titles in work experience
        const jobTitleLower = (job.title || '').toLowerCase();
        const hasRelevantTitle = workExperience.some(exp => {
            const title = (exp.job_title || '').toLowerCase();
            return title.includes(jobTitleLower) || jobTitleLower.includes(title) ||
                   title.split(/\s+/).some(w => w.length > 3 && jobTitleLower.includes(w));
        });
        if (hasRelevantTitle) experienceMatchScore = Math.min(100, experienceMatchScore + 10);

        // === 3. Calculate education match ===
        if (job.education_requirement && educationRecords.length > 0) {
            const requiredLevel = educationHierarchy[job.education_requirement] || 0;
            const employeeMaxLevel = Math.max(
                ...educationRecords.map(e => educationHierarchy[e.degree_type] || 0)
            );
            if (employeeMaxLevel >= requiredLevel) {
                educationMatchScore = 100;
            } else if (employeeMaxLevel === requiredLevel - 1) {
                educationMatchScore = 70;
            } else {
                educationMatchScore = Math.max(20, employeeMaxLevel / requiredLevel * 60);
            }
            // Bonus for relevant field of study
            const jobTitleWords = (job.title || '').toLowerCase().split(/\s+/);
            const jobDeptWords = (job.department || '').toLowerCase().split(/\s+/);
            const relevantField = educationRecords.some(ed => {
                const field = (ed.field_of_study || '').toLowerCase();
                return jobTitleWords.some(w => w.length > 3 && field.includes(w)) ||
                       jobDeptWords.some(w => w.length > 3 && field.includes(w));
            });
            if (relevantField) educationMatchScore = Math.min(100, educationMatchScore + 15);
        } else if (educationRecords.length > 0) {
            // No education requirement, having education is a plus
            const maxLevel = Math.max(...educationRecords.map(e => educationHierarchy[e.degree_type] || 0));
            educationMatchScore = Math.min(100, 50 + maxLevel * 10);
        } else if (!job.education_requirement) {
            educationMatchScore = 65; // No requirement, no records - neutral
        } else {
            educationMatchScore = 20; // Requirement exists but no records
        }

        // === 4. Cultural fit (heuristic) ===
        let culturalFitScore = 60;
        if (application.cover_letter && application.cover_letter.length > 100) {
            culturalFitScore += 10; // Effort in cover letter
        }
        if (hasRelevantTitle) culturalFitScore += 10; // Industry alignment
        if (candidateSkills.length >= 3) culturalFitScore += 5;
        culturalFitScore = Math.min(100, culturalFitScore);

        // === 5. Calculate overall score ===
        const overallScore = Math.round(
            skillMatchScore * 0.4 +
            experienceMatchScore * 0.3 +
            educationMatchScore * 0.2 +
            culturalFitScore * 0.1
        );

        // Identify skill gaps
        const skillGapAnalysis = [];
        if (requiredSkills.length > 0) {
            for (const rs of requiredSkills) {
                const skillName = (rs.name || rs).trim();
                const hasSkill = candidateSkills.some(cs => {
                    const csName = (cs.name || '').toLowerCase().trim();
                    const rsLower = skillName.toLowerCase();
                    return csName === rsLower || csName.includes(rsLower) || rsLower.includes(csName);
                });
                if (!hasSkill) {
                    skillGapAnalysis.push(skillName);
                }
            }
        }

        // Generate strengths
        const strengths = [];
        if (totalYearsExp >= minExp) strengths.push(`Meets experience requirements (${Math.round(totalYearsExp)} years)`);
        if (skillMatchScore >= 70) strengths.push(`Strong skill match (${Math.round(skillMatchScore)}%)`);
        if (skillMatchScore >= 40 && skillMatchScore < 70) strengths.push('Partial skill match');
        if (educationMatchScore >= 80) strengths.push('Education exceeds or meets requirements');
        if (hasRelevantTitle) strengths.push('Has relevant job title experience');
        if (candidateSkills.length >= 5) strengths.push(`Diverse skill set (${candidateSkills.length} skills)`);
        if (application.cover_letter) strengths.push('Submitted a cover letter');

        // Generate concerns
        const concerns = [];
        if (totalYearsExp < minExp && minExp > 0) concerns.push(`Below minimum experience (${Math.round(totalYearsExp)}/${minExp} years)`);
        if (skillGapAnalysis.length > 0) concerns.push(`Missing ${skillGapAnalysis.length} required skill(s): ${skillGapAnalysis.slice(0, 3).join(', ')}`);
        if (candidateSkills.length === 0) concerns.push('No skills data available for evaluation');
        if (educationRecords.length === 0 && job.education_requirement) concerns.push('No education records on file');
        if (totalYearsExp === 0 && workExperience.length === 0) concerns.push('No work experience records');

        // Generate interview questions
        const interviewQuestions = [];
        if (skillGapAnalysis.length > 0) {
            interviewQuestions.push(`How familiar are you with ${skillGapAnalysis[0]}? Describe any related experience.`);
        }
        interviewQuestions.push(
            `Tell me about your experience relevant to the ${job.title} role.`,
            'Describe a challenging project you worked on recently and the outcome.',
            'How do you stay updated with industry trends and technologies?',
            `Why are you interested in the ${job.title} position${job.department ? ' in ' + job.department : ''}?`
        );
        if (totalYearsExp < minExp) {
            interviewQuestions.push('How do you plan to bridge any experience gaps for this role?');
        }

        // Recommendation
        let recommendation = '';
        if (overallScore >= 80) {
            recommendation = 'Strong Hire - Excellent match across skills, experience and education';
        } else if (overallScore >= 65) {
            recommendation = 'Hire - Good candidate with minor gaps that can be addressed';
        } else if (overallScore >= 50) {
            recommendation = 'Consider - Has potential but notable gaps exist';
        } else if (overallScore >= 35) {
            recommendation = 'Weak - Significant gaps in key areas';
        } else {
            recommendation = 'Not Recommended - Does not meet core requirements';
        }

        return {
            overallScore,
            skillMatchScore: Math.round(skillMatchScore),
            experienceMatchScore: Math.round(experienceMatchScore),
            educationMatchScore: Math.round(educationMatchScore),
            culturalFitScore: Math.round(culturalFitScore),
            skillGapAnalysis,
            strengths,
            concerns,
            interviewQuestions: interviewQuestions.slice(0, 5),
            successPrediction: Math.round((overallScore / 100) * 100) / 100,
            retentionPrediction: Math.round(Math.min(0.95, 0.5 + (overallScore / 200)) * 100) / 100,
            recommendation
        };
    }

    // Analyze job posting
    async analyzeJob(job) {
        if (openai) {
            try {
                const prompt = `
                Analyze this job posting and provide insights:
                Title: ${job.title}
                Description: ${job.description}
                Requirements: ${JSON.stringify(job.requirements)}
                
                Provide JSON with:
                {
                    "jobAnalysis": {
                        "clarity_score": (1-10),
                        "completeness_score": (1-10),
                        "suggestions": ["improvement suggestions"]
                    },
                    "idealCandidate": {
                        "profile_summary": "ideal candidate description",
                        "must_have_skills": ["skills"],
                        "nice_to_have_skills": ["skills"],
                        "personality_traits": ["traits"],
                        "experience_profile": "experience description"
                    }
                }
                `;

                const response = await openai.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    response_format: { type: 'json_object' }
                });

                return JSON.parse(response.choices[0].message.content);
            } catch (error) {
                console.error('OpenAI job analysis error:', error);
            }
        }

        // Fallback
        return {
            jobAnalysis: {
                clarity_score: 7,
                completeness_score: 7,
                suggestions: ['Add specific responsibilities', 'Include salary range', 'Clarify growth opportunities']
            },
            idealCandidate: {
                profile_summary: `Experienced ${job.title} with strong technical skills`,
                must_have_skills: job.required_skills ? 
                    (typeof job.required_skills === 'string' ? JSON.parse(job.required_skills) : job.required_skills).slice(0, 5) : [],
                nice_to_have_skills: [],
                personality_traits: ['Team player', 'Problem solver', 'Self-motivated'],
                experience_profile: `${job.min_experience_years || 3}+ years of relevant experience`
            }
        };
    }

    // Match internal candidates
    async matchInternalCandidates(job, employees) {
        const matches = [];

        // Education level hierarchy for comparison
        const educationHierarchy = {
            'high_school': 1, 'associate': 2, 'bachelor': 3, 'master': 4, 'doctorate': 5, 'professional': 5
        };

        for (const employee of employees) {
            const skills = employee.skills || [];
            const requiredSkills = job.required_skills ? 
                (typeof job.required_skills === 'string' ? JSON.parse(job.required_skills) : job.required_skills) : [];

            // === 1. Calculate skill match ===
            let skillMatchScore = 0;
            if (requiredSkills.length > 0 && skills.length > 0) {
                const matchedSkills = skills.filter(es => 
                    requiredSkills.some(rs => {
                        const rsName = (rs.name || rs).toLowerCase();
                        const esName = es.name?.toLowerCase() || '';
                        return rsName === esName || rsName.includes(esName) || esName.includes(rsName);
                    })
                );
                skillMatchScore = (matchedSkills.length / requiredSkills.length) * 100;
            }

            // === 2. Calculate education match ===
            let educationScore = 50; // default neutral
            const educationRecords = employee.education || [];
            if (job.education_requirement && educationRecords.length > 0) {
                const requiredLevel = educationHierarchy[job.education_requirement] || 0;
                const employeeMaxLevel = Math.max(
                    ...educationRecords.map(e => educationHierarchy[e.degree_type] || 0)
                );
                if (employeeMaxLevel >= requiredLevel) {
                    educationScore = 100;
                } else if (employeeMaxLevel === requiredLevel - 1) {
                    educationScore = 70; // one level below
                } else {
                    educationScore = 30;
                }
                // Bonus for relevant field of study
                const jobTitleWords = (job.title || '').toLowerCase().split(/\s+/);
                const jobDeptWords = (job.department || '').toLowerCase().split(/\s+/);
                const relevantField = educationRecords.some(ed => {
                    const field = (ed.field_of_study || '').toLowerCase();
                    return jobTitleWords.some(w => w.length > 3 && field.includes(w)) ||
                           jobDeptWords.some(w => w.length > 3 && field.includes(w));
                });
                if (relevantField) educationScore = Math.min(100, educationScore + 15);
            } else if (educationRecords.length > 0) {
                // No education requirement on the job, give a moderate boost for having education
                educationScore = 60;
            }

            // === 3. Calculate experience match ===
            let experienceScore = 50; // default neutral
            const workExperience = employee.work_experience || [];
            // Calculate total years of experience from work history
            let totalYearsExp = 0;
            if (workExperience.length > 0) {
                for (const exp of workExperience) {
                    const start = exp.start_date ? new Date(exp.start_date) : null;
                    const end = exp.is_current ? new Date() : (exp.end_date ? new Date(exp.end_date) : null);
                    if (start && end) {
                        totalYearsExp += (end - start) / (365.25 * 24 * 60 * 60 * 1000);
                    }
                }
            }
            // Fall back to years_at_company if no work experience records
            if (totalYearsExp === 0 && employee.hire_date) {
                totalYearsExp = (new Date() - new Date(employee.hire_date)) / (365.25 * 24 * 60 * 60 * 1000);
            }

            const minExpRequired = parseFloat(job.min_experience_years) || 0;
            const maxExpRequired = parseFloat(job.max_experience_years) || 99;
            if (totalYearsExp >= minExpRequired && totalYearsExp <= maxExpRequired) {
                experienceScore = 100;
            } else if (totalYearsExp >= minExpRequired * 0.7) {
                experienceScore = 70;
            } else if (totalYearsExp > 0) {
                experienceScore = Math.min(60, (totalYearsExp / Math.max(minExpRequired, 1)) * 60);
            }

            // Bonus for relevant job titles in work experience
            const jobTitleLower = (job.title || '').toLowerCase();
            const hasRelevantTitle = workExperience.some(exp => {
                const title = (exp.job_title || '').toLowerCase();
                return title.includes(jobTitleLower) || jobTitleLower.includes(title) ||
                       title.split(/\s+/).some(w => w.length > 3 && jobTitleLower.includes(w));
            });
            if (hasRelevantTitle) experienceScore = Math.min(100, experienceScore + 15);

            // Career alignment score based on aspirations
            let careerAlignmentScore = 50;
            if (employee.career_aspirations) {
                const aspirations = employee.career_aspirations.toLowerCase();
                if (aspirations.includes(job.title.toLowerCase()) || 
                    aspirations.includes(job.department?.toLowerCase())) {
                    careerAlignmentScore = 90;
                }
            }
            if (employee.preferred_roles?.some(r => r.toLowerCase().includes(job.title.toLowerCase()))) {
                careerAlignmentScore = 95;
            }

            // === 4. Calculate readiness ===
            const readinessScore = (skillMatchScore * 0.4) + (experienceScore * 0.3) + (educationScore * 0.15) + (careerAlignmentScore * 0.15);

            // Skill gaps
            const skillGaps = requiredSkills
                .filter(rs => !skills.some(s => {
                    const rsName = (rs.name || rs).toLowerCase();
                    const sName = s.name?.toLowerCase() || '';
                    return rsName === sName || rsName.includes(sName) || sName.includes(rsName);
                }))
                .map(rs => rs.name || rs);

            // Overall score: weighted combination of skills, education, experience, career alignment
            const overallScore = Math.round(
                skillMatchScore * 0.35 + educationScore * 0.2 + experienceScore * 0.25 + careerAlignmentScore * 0.2
            );

            if (overallScore >= 40) {
                matches.push({
                    employeeId: employee.id,
                    employeeName: `${employee.first_name} ${employee.last_name}`,
                    currentRole: employee.job_title,
                    department: employee.department,
                    overallScore,
                    skillMatchScore: Math.round(skillMatchScore),
                    experienceScore: Math.round(experienceScore),
                    careerAlignmentScore: Math.round(careerAlignmentScore),
                    readinessScore: Math.round(readinessScore),
                    skillGaps,
                    recommendations: skillGaps.map(sg => ({ skill: sg, action: 'Training recommended' })),
                    transitionDifficulty: skillGaps.length > 5 ? 'High' : skillGaps.length > 2 ? 'Medium' : 'Low',
                    rampUpMonths: Math.ceil(skillGaps.length * 1.5)
                });
            }
        }

        return matches.sort((a, b) => b.overallScore - a.overallScore);
    }

    // Generate career paths
    async generateCareerPaths(employee) {
        const currentSkills = employee.skills || [];
        const currentRole = employee.job_title;
        const department = employee.department;

        // Define potential career paths
        const careerPaths = [
            {
                role: 'Senior ' + currentRole,
                department: department,
                timelineMonths: 12,
                requiredSkills: ['Leadership', 'Project Management', ...currentSkills.slice(0, 3).map(s => s.name)],
                readinessPercentage: 70,
                successProbability: 0.75,
                reasoning: 'Natural progression with existing skills'
            },
            {
                role: 'Team Lead',
                department: department,
                timelineMonths: 18,
                requiredSkills: ['Leadership', 'Team Management', 'Communication', 'Strategic Planning'],
                readinessPercentage: 50,
                successProbability: 0.6,
                reasoning: 'Requires developing leadership skills'
            },
            {
                role: 'Technical Specialist',
                department: department,
                timelineMonths: 12,
                requiredSkills: ['Deep Technical Expertise', 'Problem Solving', 'Documentation'],
                readinessPercentage: 65,
                successProbability: 0.7,
                reasoning: 'Focus on technical depth over management'
            }
        ];

        // Calculate skill gaps for each path
        return careerPaths.map(path => ({
            ...path,
            skillGaps: path.requiredSkills.filter(rs => 
                !currentSkills.some(cs => cs.name?.toLowerCase() === rs.toLowerCase())
            ),
            recommendedTraining: path.requiredSkills
                .filter(rs => !currentSkills.some(cs => cs.name?.toLowerCase() === rs.toLowerCase()))
                .map(skill => ({ skill, course: `${skill} Fundamentals`, provider: 'Internal Training' }))
        }));
    }

    // Predict hiring outcome
    async predictHiringOutcome(application) {
        // Simple prediction based on scores
        const overallScore = application.ai_overall_score || 70;
        
        // Success prediction factors
        const factors = {
            skillMatch: application.ai_skill_match_score || 70,
            experienceMatch: application.ai_experience_match_score || 70,
            interviewPerformance: 70, // Would come from feedback
        };

        const successProbability = (
            factors.skillMatch * 0.35 +
            factors.experienceMatch * 0.35 +
            factors.interviewPerformance * 0.30
        ) / 100;

        // Retention prediction
        const retentionFactors = {
            salaryMatch: 0.7, // Would calculate based on expectations
            careerGrowth: 0.75,
            culturalFit: application.ai_cultural_fit_score ? application.ai_cultural_fit_score / 100 : 0.7
        };

        const retentionProbability = (
            retentionFactors.salaryMatch * 0.3 +
            retentionFactors.careerGrowth * 0.4 +
            retentionFactors.culturalFit * 0.3
        );

        return {
            successProbability: Math.round(successProbability * 100) / 100,
            retentionProbability: Math.round(retentionProbability * 100) / 100,
            confidenceLevel: 'Medium',
            factors: {
                positive: application.ai_strengths || [],
                negative: application.ai_concerns || [],
                neutral: []
            },
            recommendation: successProbability >= 0.7 ? 
                'Strong hire recommendation' : 
                successProbability >= 0.5 ? 
                    'Proceed with caution - additional interviews recommended' :
                    'Not recommended at this time'
        };
    }

    // Generate interview questions
    async generateInterviewQuestions(application, focusAreas = []) {
        const defaultQuestions = {
            technical: [
                `Describe your experience with ${application.required_skills?.[0]?.name || 'relevant technologies'}`,
                'Walk me through a complex technical problem you solved recently',
                'How do you approach debugging and troubleshooting?'
            ],
            behavioral: [
                'Tell me about a time you faced a significant challenge at work',
                'Describe a situation where you had to work with a difficult team member',
                'How do you handle tight deadlines and pressure?'
            ],
            situational: [
                'How would you handle discovering a major bug right before a release?',
                'What would you do if you disagreed with your manager\'s decision?',
                'How would you approach learning a new technology quickly?'
            ],
            cultural: [
                'What type of work environment do you thrive in?',
                'How do you balance work and personal life?',
                'What motivates you in your career?'
            ],
            roleSpecific: [
                `Why are you interested in the ${application.title} position?`,
                'Where do you see yourself in this role in 2 years?',
                'What unique value would you bring to this team?'
            ]
        };

        // Add questions based on skill gaps
        if (application.ai_skill_gap_analysis) {
            const gaps = typeof application.ai_skill_gap_analysis === 'string' ? 
                JSON.parse(application.ai_skill_gap_analysis) : application.ai_skill_gap_analysis;
            
            if (gaps.length > 0) {
                defaultQuestions.gapAssessment = gaps.slice(0, 3).map(gap => 
                    `We noticed you may have less experience with ${gap}. How would you approach getting up to speed?`
                );
            }
        }

        // Add questions based on concerns
        if (application.ai_concerns) {
            const concerns = typeof application.ai_concerns === 'string' ? 
                JSON.parse(application.ai_concerns) : application.ai_concerns;
            
            if (concerns.length > 0) {
                defaultQuestions.concernsAddressed = concerns.slice(0, 2).map(concern =>
                    `Can you tell us more about ${concern.toLowerCase()}?`
                );
            }
        }

        return defaultQuestions;
    }

    // Find matching internal candidates for a job
    async findMatchingInternalCandidates(job) {
        const employees = await db.query(`
            SELECT ep.*,
                   (SELECT json_agg(json_build_object('name', s.name, 'proficiency', es.proficiency_level))
                    FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills
            FROM employee_profiles ep
            WHERE ep.employment_status = 'full_time' AND ep.internal_mobility_interest = true
        `);

        if (employees.rows.length === 0) return;

        const matches = await this.matchInternalCandidates(job, employees.rows);
        
        // Save top matches
        for (const match of matches.slice(0, 20)) {
            await db.query(`
                INSERT INTO internal_job_matches (job_id, employee_id, overall_match_score, skill_match_score, skill_gaps)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (job_id, employee_id) DO UPDATE SET
                    overall_match_score = $3, skill_match_score = $4, skill_gaps = $5
            `, [job.id, match.employeeId, match.overallScore, match.skillMatchScore, JSON.stringify(match.skillGaps)]);
        }
    }

    // Rank candidates
    async rankCandidates(job, applications) {
        const rankings = applications.map((app, index) => ({
            applicationId: app.id,
            candidateName: `${app.first_name} ${app.last_name}`,
            score: app.ai_overall_score || 50,
            rank: 0
        }));

        // Sort by score
        rankings.sort((a, b) => b.score - a.score);

        // Assign ranks
        rankings.forEach((r, i) => r.rank = i + 1);

        return rankings;
    }

    // Extract skills and info from a document (certification, training, or general doc)
    async extractFromDocument(text, documentType = 'general') {
        if (openai) {
            try {
                const prompt = `
                You are an expert HR data extractor. Analyze this ${documentType} document and extract structured information.

                DOCUMENT TEXT:
                ${text.substring(0, 6000)}

                Extract and return a JSON object with:
                {
                    "skills": ["list of skills, technologies, tools, methodologies mentioned"],
                    "certifications": [
                        {
                            "name": "certification name",
                            "issuer": "issuing organization",
                            "date": "issue date if found"
                        }
                    ],
                    "training": [
                        {
                            "name": "course or training name",
                            "provider": "training provider",
                            "date": "completion date if found"
                        }
                    ],
                    "personal_info": {
                        "name": "full name if found",
                        "email": "email if found",
                        "phone": "phone if found",
                        "location": "location if found",
                        "job_title": "current job title if found",
                        "years_of_experience": null
                    },
                    "education": [
                        {
                            "degree": "degree name",
                            "institution": "school name",
                            "year": "graduation year"
                        }
                    ],
                    "summary": "brief professional summary extracted from the document"
                }

                Extract as much relevant information as possible. For skills, include both technical and soft skills.
                If the document is a certification, focus on the certification details and related skills.
                If the document is training/course content, focus on skills gained.
                Return ONLY valid JSON.
                `;

                const response = await openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                });

                return JSON.parse(response.choices[0].message.content);
            } catch (error) {
                console.error('OpenAI document extraction error:', error);
            }
        }

        // Fallback: rule-based extraction
        return this.ruleBasedDocExtraction(text, documentType);
    }

    ruleBasedDocExtraction(text, documentType) {
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
        const phoneMatch = text.match(/[\+]?[(]?[0-9]{1,3}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{4,6}/);

        // Common skill keywords to look for
        const skillKeywords = [
            'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS', 'Docker',
            'TypeScript', 'HTML', 'CSS', 'Git', 'MongoDB', 'PostgreSQL', 'Agile', 'Scrum',
            'Machine Learning', 'Data Analysis', 'Project Management', 'Communication', 'Leadership',
            'Excel', 'Power BI', 'Tableau', 'Kubernetes', 'Azure', 'GCP', 'Linux', 'C++', 'C#',
            '.NET', 'Spring Boot', 'Django', 'Flask', 'Vue.js', 'Angular', 'GraphQL', 'REST API',
            'DevOps', 'CI/CD', 'Terraform', 'Jenkins', 'Redis', 'Elasticsearch', 'Kafka',
            'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Spark', 'Hadoop', 'Figma', 'Sketch',
            'Adobe', 'Photoshop', 'Illustrator', 'UX Design', 'UI Design', 'Product Management',
            'Business Analysis', 'Six Sigma', 'PMP', 'ITIL', 'PRINCE2', 'SAP', 'Salesforce',
            'Cyber Security', 'Penetration Testing', 'Network Security', 'Risk Management',
            'Financial Analysis', 'Accounting', 'Budgeting', 'Forecasting', 'Marketing',
            'SEO', 'SEM', 'Content Marketing', 'Social Media', 'Public Speaking',
            'Negotiation', 'Strategic Planning', 'Team Management', 'Mentoring',
            'Problem Solving', 'Critical Thinking', 'Decision Making', 'Time Management'
        ];

        const foundSkills = skillKeywords.filter(skill =>
            text.toLowerCase().includes(skill.toLowerCase())
        );

        // Try to extract certification info
        const certPatterns = [
            /(?:certified|certification|certificate)\s+(?:in\s+)?([^\n,]+)/gi,
            /([A-Z][A-Za-z\s]+)\s+(?:certification|certificate)/gi,
        ];
        const certifications = [];
        for (const pat of certPatterns) {
            let match;
            while ((match = pat.exec(text)) !== null) {
                certifications.push({ name: match[1].trim(), issuer: '', date: '' });
            }
        }

        return {
            skills: foundSkills,
            certifications: certifications.slice(0, 10),
            training: [],
            personal_info: {
                email: emailMatch ? emailMatch[0] : null,
                phone: phoneMatch ? phoneMatch[0] : null,
            },
            education: [],
            summary: ''
        };
    }

    // Match employees to a newly published job and return matches
    async matchEmployeesToJob(job) {
        try {
            // Get ALL employees with skills, education, work experience, and certifications
            const employees = await db.query(`
                SELECT ep.*,
                       u.id as user_id, u.email,
                       (SELECT json_agg(json_build_object('name', s.name, 'proficiency', es.proficiency_level))
                        FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills,
                       (SELECT json_agg(json_build_object('degree_type', er.degree_type, 'field_of_study', er.field_of_study, 'institution', er.institution_name))
                        FROM education_records er WHERE er.employee_id = ep.id) as education,
                       (SELECT json_agg(json_build_object('job_title', we.job_title, 'company', we.company_name, 'start_date', we.start_date, 'end_date', we.end_date, 'is_current', we.is_current, 'description', we.description))
                        FROM work_experience we WHERE we.employee_id = ep.id) as work_experience,
                       (SELECT json_agg(json_build_object('name', c.name, 'issuer', c.issuing_organization))
                        FROM certifications c WHERE c.employee_id = ep.id) as certifications
                FROM employee_profiles ep
                JOIN users u ON ep.user_id = u.id
                WHERE ep.employment_status IN ('full_time', 'part_time', 'contract')
            `);

            if (employees.rows.length === 0) return [];

            const matches = await this.matchInternalCandidates(job, employees.rows);

            // Save matches and return them with employee info
            const enrichedMatches = [];
            for (const match of matches.slice(0, 30)) {
                const emp = employees.rows.find(e => e.id === match.employeeId);
                if (!emp) continue;

                // Save to internal_job_matches
                await db.query(`
                    INSERT INTO internal_job_matches (job_id, employee_id, overall_match_score, skill_match_score, experience_match_score, career_alignment_score, readiness_score, skill_gaps, development_recommendations, transition_difficulty, estimated_ramp_up_months)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (job_id, employee_id) DO UPDATE SET
                        overall_match_score = $3, skill_match_score = $4, experience_match_score = $5, career_alignment_score = $6, readiness_score = $7, skill_gaps = $8, development_recommendations = $9, transition_difficulty = $10, estimated_ramp_up_months = $11, updated_at = CURRENT_TIMESTAMP
                `, [
                    job.id, match.employeeId, match.overallScore, match.skillMatchScore,
                    match.experienceScore || 50, match.careerAlignmentScore, match.readinessScore || 50,
                    JSON.stringify(match.skillGaps), JSON.stringify(match.recommendations),
                    match.transitionDifficulty, match.rampUpMonths
                ]);

                enrichedMatches.push({
                    ...match,
                    userId: emp.user_id,
                    email: emp.email,
                    firstName: emp.first_name,
                    lastName: emp.last_name,
                    department: emp.department,
                    jobTitle: emp.job_title,
                });
            }

            return enrichedMatches;
        } catch (error) {
            console.error('matchEmployeesToJob error:', error);
            return [];
        }
    }

    // Analyze skill gap
    async analyzeSkillGap(currentSkills, targetRole, targetSkills) {
        const currentSkillNames = currentSkills.map(s => s.name?.toLowerCase() || s.toLowerCase());
        const targetSkillNames = targetSkills.map(s => s.name?.toLowerCase() || s.toLowerCase());

        const gaps = targetSkillNames.filter(ts => !currentSkillNames.includes(ts));
        const matches = targetSkillNames.filter(ts => currentSkillNames.includes(ts));
        const additional = currentSkillNames.filter(cs => !targetSkillNames.includes(cs));

        const readiness = (matches.length / targetSkillNames.length) * 100;

        return {
            targetRole,
            readinessPercentage: Math.round(readiness),
            matchedSkills: matches,
            missingSkills: gaps,
            additionalSkills: additional,
            recommendations: gaps.map(gap => ({
                skill: gap,
                priority: 'High',
                suggestedAction: `Complete training in ${gap}`,
                estimatedTime: '2-4 weeks'
            })),
            estimatedTimeToReady: `${Math.ceil(gaps.length * 2)} weeks`
        };
    }

    // ============================================================================
    // PREDICTIVE MODELS FOR CANDIDATE SUCCESS AND RETENTION
    // ============================================================================

    /**
     * Calculate Candidate Success Prediction
     * Predicts the likelihood of a candidate succeeding in the role if hired
     * Uses multiple weighted factors based on historical hiring data patterns
     */
    calculateSuccessPrediction(applicationData, jobData, resumeData) {
        const factors = {
            skillsMatch: { weight: 0.25, score: 0, details: '' },
            experienceRelevance: { weight: 0.20, score: 0, details: '' },
            educationFit: { weight: 0.15, score: 0, details: '' },
            careerProgression: { weight: 0.15, score: 0, details: '' },
            jobStability: { weight: 0.10, score: 0, details: '' },
            culturalFit: { weight: 0.10, score: 0, details: '' },
            motivationIndicators: { weight: 0.05, score: 0, details: '' }
        };

        // 1. Skills Match (25%)
        const skillMatchScore = applicationData.ai_skill_match_score || 50;
        factors.skillsMatch.score = skillMatchScore;
        if (skillMatchScore >= 80) {
            factors.skillsMatch.details = 'Excellent skills alignment with job requirements';
        } else if (skillMatchScore >= 60) {
            factors.skillsMatch.details = 'Good skills match with minor gaps';
        } else if (skillMatchScore >= 40) {
            factors.skillsMatch.details = 'Moderate skills match - training may be needed';
        } else {
            factors.skillsMatch.details = 'Significant skills gap identified';
        }

        // 2. Experience Relevance (20%)
        const expMatchScore = applicationData.ai_experience_match_score || 50;
        factors.experienceRelevance.score = expMatchScore;
        if (expMatchScore >= 80) {
            factors.experienceRelevance.details = 'Highly relevant prior experience';
        } else if (expMatchScore >= 60) {
            factors.experienceRelevance.details = 'Relevant experience in similar roles';
        } else if (expMatchScore >= 40) {
            factors.experienceRelevance.details = 'Some transferable experience';
        } else {
            factors.experienceRelevance.details = 'Limited relevant experience';
        }

        // 3. Education Fit (15%)
        const eduMatchScore = applicationData.ai_education_match_score || 50;
        factors.educationFit.score = eduMatchScore;
        if (eduMatchScore >= 80) {
            factors.educationFit.details = 'Education exceeds requirements';
        } else if (eduMatchScore >= 60) {
            factors.educationFit.details = 'Education meets requirements';
        } else if (eduMatchScore >= 40) {
            factors.educationFit.details = 'Education partially meets requirements';
        } else {
            factors.educationFit.details = 'Education below requirements';
        }

        // 4. Career Progression (15%) - Analyze work history patterns
        let careerProgressionScore = 50;
        const workHistory = resumeData?.extracted_experience || [];
        if (workHistory.length >= 3) {
            // Check for upward career trajectory
            const hasProgression = this._analyzeCareerProgression(workHistory);
            careerProgressionScore = hasProgression ? 85 : 60;
            factors.careerProgression.details = hasProgression 
                ? 'Shows consistent career advancement'
                : 'Lateral career moves observed';
        } else if (workHistory.length >= 1) {
            careerProgressionScore = 65;
            factors.careerProgression.details = 'Limited work history to assess progression';
        } else {
            careerProgressionScore = 40;
            factors.careerProgression.details = 'No work history available';
        }
        factors.careerProgression.score = careerProgressionScore;

        // 5. Job Stability (10%) - Analyze tenure patterns
        let stabilityScore = 60;
        if (workHistory.length >= 2) {
            const avgTenure = this._calculateAverageTenure(workHistory);
            if (avgTenure >= 3) {
                stabilityScore = 90;
                factors.jobStability.details = `Strong stability (avg ${avgTenure.toFixed(1)} years per role)`;
            } else if (avgTenure >= 2) {
                stabilityScore = 75;
                factors.jobStability.details = `Good stability (avg ${avgTenure.toFixed(1)} years per role)`;
            } else if (avgTenure >= 1) {
                stabilityScore = 55;
                factors.jobStability.details = `Moderate tenure (avg ${avgTenure.toFixed(1)} years per role)`;
            } else {
                stabilityScore = 35;
                factors.jobStability.details = `Frequent job changes (avg ${avgTenure.toFixed(1)} years per role)`;
            }
        } else {
            factors.jobStability.details = 'Insufficient history to assess stability';
        }
        factors.jobStability.score = stabilityScore;

        // 6. Cultural Fit (10%)
        const culturalFitScore = applicationData.ai_cultural_fit_score || 50;
        factors.culturalFit.score = culturalFitScore;
        if (culturalFitScore >= 70) {
            factors.culturalFit.details = 'Strong cultural alignment indicators';
        } else if (culturalFitScore >= 50) {
            factors.culturalFit.details = 'Moderate cultural fit';
        } else {
            factors.culturalFit.details = 'Cultural fit requires assessment';
        }

        // 7. Motivation Indicators (5%)
        let motivationScore = 50;
        if (applicationData.cover_letter && applicationData.cover_letter.length > 200) {
            motivationScore += 25;
        }
        if (applicationData.employee_id) {
            motivationScore += 20; // Internal candidates show commitment
        }
        motivationScore = Math.min(100, motivationScore);
        factors.motivationIndicators.score = motivationScore;
        factors.motivationIndicators.details = motivationScore >= 70 
            ? 'Strong motivation indicators present'
            : 'Standard application effort';

        // Calculate weighted total
        let totalScore = 0;
        for (const [key, factor] of Object.entries(factors)) {
            totalScore += (factor.score / 100) * factor.weight * 100;
        }

        // Apply confidence adjustment based on data completeness
        const dataCompleteness = this._calculateDataCompleteness(applicationData, resumeData);
        const confidenceLevel = dataCompleteness >= 0.8 ? 'High' : dataCompleteness >= 0.5 ? 'Medium' : 'Low';

        // Generate risk factors
        const riskFactors = [];
        const positiveFactors = [];
        for (const [key, factor] of Object.entries(factors)) {
            if (factor.score < 50) {
                riskFactors.push({ factor: key, score: factor.score, detail: factor.details });
            } else if (factor.score >= 70) {
                positiveFactors.push({ factor: key, score: factor.score, detail: factor.details });
            }
        }

        return {
            successProbability: Math.round(totalScore) / 100,
            confidenceLevel,
            factors,
            riskFactors,
            positiveFactors,
            recommendation: this._generateSuccessRecommendation(totalScore, riskFactors)
        };
    }

    /**
     * Calculate Candidate Retention Prediction
     * Predicts the likelihood of a candidate staying with the company long-term (2+ years)
     * Based on behavioral patterns and alignment factors
     */
    calculateRetentionPrediction(applicationData, jobData, resumeData, isInternalCandidate = false) {
        const factors = {
            tenureHistory: { weight: 0.25, score: 0, details: '' },
            careerAlignment: { weight: 0.20, score: 0, details: '' },
            skillsGrowthPotential: { weight: 0.15, score: 0, details: '' },
            roleExpectationMatch: { weight: 0.15, score: 0, details: '' },
            companySizeFit: { weight: 0.10, score: 0, details: '' },
            internalMobility: { weight: 0.15, score: 0, details: '' }
        };

        const workHistory = resumeData?.extracted_experience || [];

        // 1. Tenure History (25%) - Most predictive factor
        if (workHistory.length >= 2) {
            const avgTenure = this._calculateAverageTenure(workHistory);
            const jobHoppingScore = this._calculateJobHoppingRisk(workHistory);
            
            if (avgTenure >= 4) {
                factors.tenureHistory.score = 95;
                factors.tenureHistory.details = 'Excellent retention history - long tenure pattern';
            } else if (avgTenure >= 2.5) {
                factors.tenureHistory.score = 80;
                factors.tenureHistory.details = 'Good retention history - stable employment';
            } else if (avgTenure >= 1.5) {
                factors.tenureHistory.score = 60;
                factors.tenureHistory.details = 'Moderate tenure - some job mobility';
            } else {
                factors.tenureHistory.score = 40 - (jobHoppingScore * 10);
                factors.tenureHistory.details = 'High mobility pattern - retention risk';
            }
        } else {
            factors.tenureHistory.score = 55;
            factors.tenureHistory.details = 'Limited history - new to workforce or career change';
        }

        // 2. Career Alignment (20%) - Does this role fit their trajectory?
        let careerAlignScore = 60;
        if (workHistory.length >= 1) {
            const recentRoles = workHistory.slice(0, 3);
            const rolesSimilar = recentRoles.filter(exp => {
                const title = (exp.title || '').toLowerCase();
                const jobTitle = (jobData.title || '').toLowerCase();
                return this._isSimilarRole(title, jobTitle);
            }).length;
            
            if (rolesSimilar >= 2) {
                careerAlignScore = 85;
                factors.careerAlignment.details = 'Strong career continuity - natural progression';
            } else if (rolesSimilar >= 1) {
                careerAlignScore = 70;
                factors.careerAlignment.details = 'Good alignment with career path';
            } else {
                careerAlignScore = 45;
                factors.careerAlignment.details = 'Career transition - may need adjustment period';
            }
        } else {
            factors.careerAlignment.details = 'First role in this field';
        }
        factors.careerAlignment.score = careerAlignScore;

        // 3. Skills Growth Potential (15%)
        const skillGaps = applicationData.ai_skill_gap_analysis || [];
        const currentSkillCount = (resumeData?.extracted_skills || []).length;
        
        if (skillGaps.length <= 1 && currentSkillCount >= 5) {
            factors.skillsGrowthPotential.score = 85;
            factors.skillsGrowthPotential.details = 'Well-matched skills with room for growth';
        } else if (skillGaps.length <= 3) {
            factors.skillsGrowthPotential.score = 70;
            factors.skillsGrowthPotential.details = 'Learnable skill gaps - good growth opportunity';
        } else {
            factors.skillsGrowthPotential.score = 50;
            factors.skillsGrowthPotential.details = 'Significant upskilling needed - may affect retention';
        }

        // 4. Role Expectation Match (15%)
        const overallMatch = applicationData.ai_overall_score || 50;
        factors.roleExpectationMatch.score = overallMatch >= 70 ? 85 : overallMatch >= 50 ? 65 : 45;
        factors.roleExpectationMatch.details = overallMatch >= 70 
            ? 'Strong match between expectations and role'
            : overallMatch >= 50 
                ? 'Reasonable expectation alignment'
                : 'Potential mismatch - may lead to early departure';

        // 5. Company Size Fit (10%) - Transitions affect retention
        let companySizeScore = 70;
        if (workHistory.length >= 1) {
            // Heuristic: Check if company names suggest size transitions
            const hasLargeCorpExp = workHistory.some(exp => 
                this._isLikelyLargeCorp(exp.company || '')
            );
            companySizeScore = hasLargeCorpExp ? 75 : 70;
            factors.companySizeFit.details = 'Company size transition considered';
        } else {
            factors.companySizeFit.details = 'First professional role';
        }
        factors.companySizeFit.score = companySizeScore;

        // 6. Internal Mobility Bonus (15%)
        if (isInternalCandidate || applicationData.employee_id) {
            factors.internalMobility.score = 90;
            factors.internalMobility.details = 'Internal candidate - high retention likelihood';
        } else {
            factors.internalMobility.score = 50;
            factors.internalMobility.details = 'External candidate - standard retention risk';
        }

        // Calculate weighted total
        let totalScore = 0;
        for (const [key, factor] of Object.entries(factors)) {
            totalScore += (factor.score / 100) * factor.weight * 100;
        }

        // Calculate retention risk level
        let retentionRisk = 'Low';
        let riskColor = 'green';
        if (totalScore < 50) {
            retentionRisk = 'High';
            riskColor = 'red';
        } else if (totalScore < 65) {
            retentionRisk = 'Medium';
            riskColor = 'yellow';
        }

        // Predicted tenure range
        let predictedTenure = '2+ years';
        if (totalScore >= 80) {
            predictedTenure = '3-5 years';
        } else if (totalScore >= 65) {
            predictedTenure = '2-3 years';
        } else if (totalScore >= 50) {
            predictedTenure = '1-2 years';
        } else {
            predictedTenure = 'Under 1 year';
        }

        // Risk factors for early departure
        const riskFactors = [];
        if (factors.tenureHistory.score < 50) {
            riskFactors.push('History of short tenures');
        }
        if (factors.careerAlignment.score < 50) {
            riskFactors.push('Career transition may lead to reconsideration');
        }
        if (factors.skillsGrowthPotential.score < 50) {
            riskFactors.push('Skill gaps may cause frustration');
        }
        if (factors.roleExpectationMatch.score < 50) {
            riskFactors.push('Role may not meet expectations');
        }

        return {
            retentionProbability: Math.round(totalScore) / 100,
            retentionRisk,
            riskColor,
            predictedTenure,
            factors,
            riskFactors,
            recommendation: this._generateRetentionRecommendation(totalScore, riskFactors)
        };
    }

    /**
     * Combined prediction analysis - returns both success and retention predictions
     * with overall hiring recommendation
     */
    async generatePredictiveAnalysis(applicationId) {
        try {
            // Fetch application data with all related information
            const appResult = await db.query(`
                SELECT 
                    a.*,
                    j.title as job_title, j.department, j.job_type,
                    j.min_experience_years, j.education_requirement,
                    r.extracted_skills, r.extracted_experience, r.extracted_education,
                    r.raw_text,
                    CASE 
                        WHEN a.employee_id IS NOT NULL THEN true 
                        ELSE false 
                    END as is_internal
                FROM applications a
                LEFT JOIN jobs j ON a.job_id = j.id
                LEFT JOIN resumes r ON (r.candidate_id = a.candidate_id OR r.employee_id = a.employee_id)
                WHERE a.id = $1
                ORDER BY r.created_at DESC
                LIMIT 1
            `, [applicationId]);

            if (appResult.rows.length === 0) {
                throw new Error('Application not found');
            }

            const app = appResult.rows[0];
            const resumeData = {
                extracted_skills: app.extracted_skills || [],
                extracted_experience: app.extracted_experience || [],
                extracted_education: app.extracted_education || []
            };

            const successPrediction = this.calculateSuccessPrediction(app, app, resumeData);
            const retentionPrediction = this.calculateRetentionPrediction(app, app, resumeData, app.is_internal);

            // Combined hiring score
            const hiringScore = (successPrediction.successProbability * 0.6 + retentionPrediction.retentionProbability * 0.4);
            
            let hiringRecommendation = 'Not Recommended';
            let hiringConfidence = 'Low';
            if (hiringScore >= 0.75) {
                hiringRecommendation = 'Strongly Recommended';
                hiringConfidence = 'High';
            } else if (hiringScore >= 0.60) {
                hiringRecommendation = 'Recommended';
                hiringConfidence = 'Medium-High';
            } else if (hiringScore >= 0.45) {
                hiringRecommendation = 'Consider with Caution';
                hiringConfidence = 'Medium';
            }

            // Update application with predictions
            await db.query(`
                UPDATE applications SET
                    ai_success_prediction = $1,
                    ai_retention_prediction = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [successPrediction.successProbability, retentionPrediction.retentionProbability, applicationId]);

            return {
                applicationId,
                candidateName: app.candidate_name || 'Unknown',
                jobTitle: app.job_title,
                isInternal: app.is_internal,
                predictions: {
                    success: successPrediction,
                    retention: retentionPrediction
                },
                overallAssessment: {
                    hiringScore: Math.round(hiringScore * 100) / 100,
                    recommendation: hiringRecommendation,
                    confidence: hiringConfidence
                },
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Predictive analysis error:', error);
            throw error;
        }
    }

    // ============================================================================
    // HELPER METHODS FOR PREDICTIVE MODELS
    // ============================================================================

    _analyzeCareerProgression(workHistory) {
        if (workHistory.length < 2) return false;
        
        const progressionKeywords = ['senior', 'lead', 'manager', 'director', 'head', 'principal', 'chief', 'vp', 'executive'];
        let progressionCount = 0;
        
        for (let i = 1; i < workHistory.length; i++) {
            const currentTitle = (workHistory[i-1].title || '').toLowerCase();
            const previousTitle = (workHistory[i].title || '').toLowerCase();
            
            const currentLevel = progressionKeywords.findIndex(kw => currentTitle.includes(kw));
            const previousLevel = progressionKeywords.findIndex(kw => previousTitle.includes(kw));
            
            if (currentLevel > previousLevel || (currentLevel === -1 && previousLevel === -1)) {
                progressionCount++;
            }
        }
        
        return progressionCount >= Math.floor(workHistory.length / 2);
    }

    _calculateAverageTenure(workHistory) {
        if (workHistory.length === 0) return 0;
        
        let totalYears = 0;
        let validEntries = 0;
        
        for (const exp of workHistory) {
            const duration = exp.duration || '';
            const years = this._parseDurationToYears(duration);
            if (years > 0) {
                totalYears += years;
                validEntries++;
            }
        }
        
        return validEntries > 0 ? totalYears / validEntries : 1.5; // Default assumption
    }

    _parseDurationToYears(duration) {
        if (!duration) return 0;
        
        const str = duration.toLowerCase();
        let years = 0;
        
        // Match patterns like "2018 - 2021", "Jan 2018 - Dec 2021"
        const yearMatch = str.match(/(\d{4})\s*[-–to]+\s*(present|\d{4})/i);
        if (yearMatch) {
            const startYear = parseInt(yearMatch[1]);
            const endYear = yearMatch[2].toLowerCase() === 'present' ? new Date().getFullYear() : parseInt(yearMatch[2]);
            return Math.max(0, endYear - startYear);
        }
        
        // Match "X years" pattern
        const yearsMatch = str.match(/(\d+(?:\.\d+)?)\s*years?/i);
        if (yearsMatch) {
            years = parseFloat(yearsMatch[1]);
        }
        
        // Match "X months" pattern
        const monthsMatch = str.match(/(\d+)\s*months?/i);
        if (monthsMatch) {
            years += parseInt(monthsMatch[1]) / 12;
        }
        
        return years;
    }

    _calculateJobHoppingRisk(workHistory) {
        if (workHistory.length < 3) return 0;
        
        let shortTenures = 0;
        for (const exp of workHistory) {
            const years = this._parseDurationToYears(exp.duration || '');
            if (years > 0 && years < 1) shortTenures++;
        }
        
        return shortTenures / workHistory.length;
    }

    _isSimilarRole(title1, title2) {
        const normalize = (t) => t.replace(/senior|junior|lead|principal|staff|sr\.|jr\./gi, '').trim();
        const t1 = normalize(title1);
        const t2 = normalize(title2);
        
        if (t1 === t2) return true;
        
        // Check for common role families
        const roleFamilies = [
            ['engineer', 'developer', 'programmer', 'coder'],
            ['analyst', 'data analyst', 'business analyst'],
            ['manager', 'supervisor', 'team lead'],
            ['designer', 'ux', 'ui', 'graphic'],
            ['sales', 'account', 'business development'],
            ['hr', 'human resources', 'people', 'talent'],
            ['marketing', 'growth', 'brand'],
            ['finance', 'accountant', 'accounting']
        ];
        
        for (const family of roleFamilies) {
            const t1InFamily = family.some(r => t1.includes(r));
            const t2InFamily = family.some(r => t2.includes(r));
            if (t1InFamily && t2InFamily) return true;
        }
        
        return false;
    }

    _isLikelyLargeCorp(companyName) {
        const largeCorp = ['google', 'microsoft', 'amazon', 'apple', 'meta', 'facebook', 'ibm', 'oracle', 
            'salesforce', 'deloitte', 'pwc', 'kpmg', 'ey', 'accenture', 'mckinsey', 'bcg', 'bain',
            'jpmorgan', 'goldman', 'morgan stanley', 'bank of america', 'citibank', 'wells fargo'];
        return largeCorp.some(corp => companyName.toLowerCase().includes(corp));
    }

    _calculateDataCompleteness(applicationData, resumeData) {
        let completeness = 0;
        let totalFields = 6;
        
        if (applicationData.ai_skill_match_score) completeness++;
        if (applicationData.ai_experience_match_score) completeness++;
        if (applicationData.ai_education_match_score) completeness++;
        if (resumeData?.extracted_skills?.length > 0) completeness++;
        if (resumeData?.extracted_experience?.length > 0) completeness++;
        if (resumeData?.extracted_education?.length > 0) completeness++;
        
        return completeness / totalFields;
    }

    _generateSuccessRecommendation(score, riskFactors) {
        if (score >= 75) {
            return 'High probability of success. Candidate shows strong alignment across key factors.';
        } else if (score >= 60) {
            return 'Good success potential with manageable risks. Consider targeted onboarding support.';
        } else if (score >= 45) {
            return `Moderate success likelihood. Key risks: ${riskFactors.map(r => r.factor).join(', ')}. Requires careful evaluation.`;
        } else {
            return `Lower success probability. Significant concerns: ${riskFactors.map(r => r.detail).join('; ')}`;
        }
    }

    _generateRetentionRecommendation(score, riskFactors) {
        if (score >= 75) {
            return 'Strong retention indicators. Candidate likely to stay 2+ years based on historical patterns.';
        } else if (score >= 60) {
            return 'Good retention outlook with some monitoring recommended for engagement.';
        } else if (score >= 45) {
            const risks = riskFactors.length > 0 ? ` Watch for: ${riskFactors.join(', ')}.` : '';
            return `Moderate retention risk.${risks} Consider retention strategies early.`;
        } else {
            return `High retention risk. ${riskFactors.join('. ')}. If hired, implement strong engagement plan.`;
        }
    }
}

module.exports = new AIService();
