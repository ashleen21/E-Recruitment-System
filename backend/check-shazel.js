const db = require('./src/config/database');
const emailService = require('./src/services/email.service');

async function check() {
    // Test sending an email to Shazel
    console.log('Testing email service...');
    console.log('Email configured:', emailService.isConfigured);
    
    try {
        const result = await emailService.sendEmail(
            'shazelrevell@gmail.com',
            'Test - Congratulations! Offer Extended - receptionist',
            `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #059669; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">🎉 Congratulations!</h2>
                </div>
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px;">Dear <strong>Shazel</strong>,</p>
                    <p>We are thrilled to inform you that after careful evaluation, you have been selected for the <strong>receptionist</strong> position!</p>
                    <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
                        <p style="margin: 0; font-size: 16px; color: #065f46;">
                            <strong>We would like to extend a formal offer to you.</strong>
                        </p>
                        <p style="margin-top: 8px; color: #047857;">Our HR team will be in touch shortly with the detailed offer letter and next steps.</p>
                    </div>
                    <p>Please log in to your account to view your application status.</p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="color: #9ca3af; font-size: 13px;">Best regards,<br>The Recruitment Team</p>
                </div>
            </div>
            `
        );
        console.log('Email send result:', result);
    } catch (e) {
        console.error('Email failed:', e);
    }
    
    process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
