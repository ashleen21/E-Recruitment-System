const nodemailer = require('nodemailer');
const config = require('../config');

class EmailService {
    constructor() {
        // Check if email is configured
        this.isConfigured = !!(config.email.user && config.email.password);
        
        if (this.isConfigured) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',  // Use Gmail service for better compatibility
                host: config.email.host,
                port: config.email.port,
                secure: false,
                auth: {
                    user: config.email.user,
                    pass: config.email.password
                },
                tls: {
                    rejectUnauthorized: false  // Allow self-signed certificates
                }
            });
            
            // Verify transporter on startup
            this.transporter.verify((error, success) => {
                if (error) {
                    console.error('Email transporter verification failed:', error.message);
                    this.isConfigured = false;
                } else {
                    console.log('Email service is ready to send emails');
                }
            });
        } else {
            console.warn('Email service not configured - emails will be logged but not sent');
        }
    }

    async sendEmail(to, subject, html) {
        if (!this.isConfigured || !this.transporter) {
            console.log('========== EMAIL NOT SENT (not configured) ==========');
            console.log('To:', to);
            console.log('Subject:', subject);
            console.log('=====================================================');
            return { messageId: 'not-configured' };
        }
        
        try {
            console.log(`Attempting to send email to: ${to}`);
            const info = await this.transporter.sendMail({
                from: `"Recruitment System" <${config.email.from}>`,
                to,
                subject,
                html
            });
            console.log('Email sent successfully:', info.messageId, 'to:', to);
            return info;
        } catch (error) {
            console.error('Email send error to', to, ':', error.message);
            // Log full error for debugging
            console.error('Full error:', error);
            throw error;
        }
    }

    async sendVerificationEmail(email, name, token) {
        const verifyUrl = `${config.frontendUrl}/verify-email?token=${token}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Welcome to Recruitment System!</h2>
                <p>Hi ${name},</p>
                <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
                <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                    Verify Email
                </a>
                <p>Or copy and paste this link: ${verifyUrl}</p>
                <p>This link expires in 24 hours.</p>
                <p>Best regards,<br>The Recruitment Team</p>
            </div>
        `;
        return this.sendEmail(email, 'Verify Your Email Address', html);
    }

    async sendPasswordResetEmail(email, token) {
        const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Password Reset Request</h2>
                <p>We received a request to reset your password. Click the button below to create a new password:</p>
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                    Reset Password
                </a>
                <p>Or copy and paste this link: ${resetUrl}</p>
                <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
                <p>Best regards,<br>The Recruitment Team</p>
            </div>
        `;
        return this.sendEmail(email, 'Reset Your Password', html);
    }

    async sendApplicationConfirmation(email, jobTitle) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Application Received!</h2>
                <p>Thank you for applying for the <strong>${jobTitle}</strong> position.</p>
                <p>We have received your application and our team will review it shortly. You will be notified of any updates to your application status.</p>
                <p>You can check your application status anytime by logging into your account.</p>
                <a href="${config.frontendUrl}/my-applications" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                    View My Applications
                </a>
                <p>Best regards,<br>The Recruitment Team</p>
            </div>
        `;
        return this.sendEmail(email, `Application Received - ${jobTitle}`, html);
    }

    async sendStatusUpdateEmail(email, name, jobTitle, status) {
        const statusMessages = {
            'under_review': 'Your application is now under review by our hiring team.',
            'shortlisted': 'Congratulations! You have been shortlisted for the next round.',
            'interview_scheduled': 'An interview has been scheduled. Check your email for details.',
            'offer_extended': 'Great news! We would like to extend an offer to you.',
            'rejected': 'After careful consideration, we have decided to move forward with other candidates.',
            'hired': 'Congratulations! Welcome to the team!'
        };

        const message = statusMessages[status] || `Your application status has been updated to: ${status}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Application Status Update</h2>
                <p>Hi ${name},</p>
                <p>Your application for <strong>${jobTitle}</strong> has been updated.</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 16px;">${message}</p>
                </div>
                <a href="${config.frontendUrl}/my-applications" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                    View Application
                </a>
                <p>Best regards,<br>The Recruitment Team</p>
            </div>
        `;
        return this.sendEmail(email, `Application Update - ${jobTitle}`, html);
    }

    formatInterviewType(type) {
        const typeMap = {
            'video': 'Video Call',
            'in_person': 'In Person',
            'phone': 'Phone Call',
            'technical': 'Practical Assessment',
            'behavioral': 'Behavioral Interview'
        };
        return typeMap[type] || type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Interview';
    }

    async sendInterviewInvitation(email, name, jobTitle, interview) {
        const formattedType = this.formatInterviewType(interview.type);
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #2563eb; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">Interview Invitation</h2>
                </div>
                
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                    <p>We are pleased to invite you for an interview for the <strong>${jobTitle}</strong> position. Please review the details below:</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                        <h3 style="margin-top: 0; color: #1f2937;">📋 Interview Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280; width: 120px;">Type:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${formattedType}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${new Date(interview.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Time:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${interview.startTime} - ${interview.endTime}</td>
                            </tr>
                            ${interview.location ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Location:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${interview.location}</td>
                            </tr>` : ''}
                            ${interview.meetingLink ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Meeting Link:</td>
                                <td style="padding: 8px 0;"><a href="${interview.meetingLink}" style="color: #2563eb; text-decoration: underline;">${interview.meetingLink}</a></td>
                            </tr>` : ''}
                        </table>
                    </div>

                    ${interview.notes ? `
                    <div style="background-color: #fefce8; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #eab308;">
                        <h4 style="margin-top: 0; color: #854d0e;">📝 Preparation Notes</h4>
                        <p style="margin-bottom: 0; color: #713f12; white-space: pre-line;">${interview.notes}</p>
                    </div>` : ''}

                    <p>Please confirm your attendance by logging into your account.</p>
                    
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${config.frontendUrl}/my-interviews" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            View Interview Details
                        </a>
                    </div>

                    <p style="color: #6b7280; font-size: 14px;">If you need to reschedule, please contact us as soon as possible.</p>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="color: #9ca3af; font-size: 13px;">Best regards,<br>The Recruitment Team</p>
                </div>
            </div>
        `;
        return this.sendEmail(email, `Interview Invitation - ${jobTitle}`, html);
    }

    async sendInterviewReschedule(email, name, jobTitle, interview) {
        const formattedType = this.formatInterviewType(interview.type);
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #f59e0b; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">Interview Rescheduled</h2>
                </div>
                
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                    <p>Your interview for the <strong>${jobTitle}</strong> position has been rescheduled. Please see the updated details below:</p>
                    
                    <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                        <h3 style="margin-top: 0; color: #92400e;">📋 New Interview Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            ${formattedType ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280; width: 120px;">Type:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${formattedType}</td>
                            </tr>` : ''}
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${new Date(interview.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Time:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${interview.startTime} - ${interview.endTime}</td>
                            </tr>
                            ${interview.location ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Location:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${interview.location}</td>
                            </tr>` : ''}
                            ${interview.meetingLink ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Meeting Link:</td>
                                <td style="padding: 8px 0;"><a href="${interview.meetingLink}" style="color: #2563eb; text-decoration: underline;">${interview.meetingLink}</a></td>
                            </tr>` : ''}
                        </table>
                    </div>

                    ${interview.notes ? `
                    <div style="background-color: #fefce8; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #eab308;">
                        <h4 style="margin-top: 0; color: #854d0e;">📝 Preparation Notes</h4>
                        <p style="margin-bottom: 0; color: #713f12; white-space: pre-line;">${interview.notes}</p>
                    </div>` : ''}

                    <p>Please update your calendar accordingly.</p>
                    
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${config.frontendUrl}/my-interviews" style="display: inline-block; padding: 14px 32px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            View Updated Details
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="color: #9ca3af; font-size: 13px;">Best regards,<br>The Recruitment Team</p>
                </div>
            </div>
        `;
        return this.sendEmail(email, `Interview Rescheduled - ${jobTitle}`, html);
    }

    async sendInterviewCancellation(email, name, jobTitle, reason) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">Interview Cancelled</h2>
                <p>Hi ${name},</p>
                <p>Unfortunately, your interview for the <strong>${jobTitle}</strong> position has been cancelled.</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                <p>Our team will contact you if we need to reschedule.</p>
                <p>We apologize for any inconvenience.</p>
                <p>Best regards,<br>The Recruitment Team</p>
            </div>
        `;
        return this.sendEmail(email, `Interview Cancelled - ${jobTitle}`, html);
    }

    async sendInterviewReminder(email, name, jobTitle, interview) {
        const formattedType = this.formatInterviewType(interview.type);
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #2563eb; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="color: #ffffff; margin: 0;">⏰ Interview Reminder</h2>
                </div>
                
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                    <p>This is a reminder about your upcoming interview for the <strong>${jobTitle}</strong> position.</p>
                    
                    <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                        <h3 style="margin-top: 0; color: #1e40af;">📋 Interview Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            ${formattedType ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280; width: 120px;">Type:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${formattedType}</td>
                            </tr>` : ''}
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${new Date(interview.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Time:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${interview.startTime}</td>
                            </tr>
                            ${interview.location ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Location:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${interview.location}</td>
                            </tr>` : ''}
                            ${interview.meetingLink ? `
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">Meeting Link:</td>
                                <td style="padding: 8px 0;"><a href="${interview.meetingLink}" style="color: #2563eb; text-decoration: underline;">${interview.meetingLink}</a></td>
                            </tr>` : ''}
                        </table>
                    </div>

                    ${interview.notes ? `
                    <div style="background-color: #fefce8; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #eab308;">
                        <h4 style="margin-top: 0; color: #854d0e;">📝 Preparation Notes</h4>
                        <p style="margin-bottom: 0; color: #713f12; white-space: pre-line;">${interview.notes}</p>
                    </div>` : ''}

                    <p>Good luck with your interview!</p>
                    
                    <div style="text-align: center; margin: 24px 0;">
                        <a href="${config.frontendUrl}/my-interviews" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                            View Interview Details
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                    <p style="color: #9ca3af; font-size: 13px;">Best regards,<br>The Recruitment Team</p>
                </div>
            </div>
        `;
        return this.sendEmail(email, `Interview Reminder - ${jobTitle}`, html);
    }
}

module.exports = new EmailService();
