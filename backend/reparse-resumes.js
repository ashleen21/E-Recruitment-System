/**
 * Re-parse all existing employee resumes using AI extraction
 * and update their skills, certifications, and profile info.
 * 
 * Run: node reparse-resumes.js
 */
const path = require('path');
const db = require('./src/config/database');
const aiService = require('./src/services/ai.service');
const resumeParser = require('./src/services/resumeParser.service');

async function addExtractedSkillsToEmployee(employeeId, skillNames) {
    const added = [];
    for (const skillName of skillNames) {
        if (!skillName || typeof skillName !== 'string' || skillName.trim().length < 2) continue;
        const cleanName = skillName.trim();
        const normalizedName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        try {
            let skillResult = await db.query('SELECT id FROM skills WHERE normalized_name = $1', [normalizedName]);
            let skillId;
            if (skillResult.rows.length === 0) {
                const newSkill = await db.query(
                    `INSERT INTO skills (name, normalized_name, category) VALUES ($1, $2, 'technical') RETURNING id`,
                    [cleanName, normalizedName]
                );
                skillId = newSkill.rows[0].id;
            } else {
                skillId = skillResult.rows[0].id;
            }
            await db.query(`
                INSERT INTO employee_skills (employee_id, skill_id, proficiency_level, years_of_experience)
                VALUES ($1, $2, 'intermediate', 1)
                ON CONFLICT (employee_id, skill_id) DO NOTHING
            `, [employeeId, skillId]);
            added.push(cleanName);
        } catch (err) {
            console.error(`  Skip skill "${cleanName}":`, err.message);
        }
    }
    return added;
}

async function main() {
    try {
        console.log('=== Re-parsing all employee resumes ===\n');

        // Get all employees who have a resume
        const employees = await db.query(`
            SELECT ep.id as employee_id, ep.user_id, ep.first_name, ep.last_name, ep.resume_url
            FROM employee_profiles ep
            JOIN users u ON ep.user_id = u.id
            WHERE ep.resume_url IS NOT NULL AND ep.resume_url != ''
        `);

        console.log(`Found ${employees.rows.length} employees with resumes.\n`);

        for (const emp of employees.rows) {
            console.log(`\n--- Processing: ${emp.first_name} ${emp.last_name} ---`);
            console.log(`  Resume: ${emp.resume_url}`);

            const filePath = path.join(__dirname, emp.resume_url);
            
            // Check file exists
            const fs = require('fs');
            if (!fs.existsSync(filePath)) {
                console.log('  ERROR: File not found on disk, skipping.');
                continue;
            }

            // Parse the resume
            let rawText = '';
            let parsedSkills = [];
            try {
                const parseResult = await resumeParser.parseResume(filePath);
                rawText = parseResult.rawText || parseResult.raw_text || '';
                parsedSkills = parseResult.skills || parseResult.extracted_skills || [];
                console.log(`  Parser extracted ${rawText.length} chars of text, ${parsedSkills.length} skills`);
            } catch (e) {
                console.log(`  Parser error: ${e.message}`);
            }

            // AI extraction
            let extractedInfo = null;
            let allSkills = [...parsedSkills];
            if (rawText) {
                try {
                    extractedInfo = await aiService.extractFromDocument(rawText, 'resume');
                    if (extractedInfo && extractedInfo.skills) {
                        allSkills = [...new Set([...allSkills, ...extractedInfo.skills])];
                    }
                    console.log(`  AI extracted: ${extractedInfo?.skills?.length || 0} skills, ${extractedInfo?.certifications?.length || 0} certs`);
                } catch (e) {
                    console.log(`  AI extraction error: ${e.message}`);
                }
            }

            console.log(`  Total unique skills found: ${allSkills.length}`);
            if (allSkills.length > 0) {
                console.log(`  Skills: ${allSkills.join(', ')}`);
            }

            // Add skills to employee
            if (allSkills.length > 0) {
                const added = await addExtractedSkillsToEmployee(emp.employee_id, allSkills);
                console.log(`  Added ${added.length} skills to profile: ${added.join(', ')}`);
            }

            // Add certifications
            if (extractedInfo?.certifications?.length > 0) {
                for (const cert of extractedInfo.certifications) {
                    if (!cert.name) continue;
                    try {
                        await db.query(`
                            INSERT INTO certifications (employee_id, name, issuing_organization, issue_date)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT DO NOTHING
                        `, [emp.employee_id, cert.name, cert.issuer || null, cert.date || null]);
                        console.log(`  Added cert: ${cert.name}`);
                    } catch (e) { /* skip */ }
                }
            }

            // Update ai_extracted_data on profile
            await db.query(`
                UPDATE employee_profiles SET
                    ai_extracted_data = $1,
                    last_document_parse = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [JSON.stringify(extractedInfo || { skills: allSkills }), emp.employee_id]);
            console.log(`  Profile updated with AI data.`);
        }

        console.log('\n=== Done! ===');
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();
