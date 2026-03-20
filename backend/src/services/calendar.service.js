const { google } = require('googleapis');
const config = require('../config');

class CalendarService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.redirectUri
        );
        
        if (config.google.refreshToken) {
            this.oauth2Client.setCredentials({
                refresh_token: config.google.refreshToken
            });
        }
        
        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    getAuthUrl() {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar.events']
        });
    }

    async getTokens(code) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        return tokens;
    }

    async createCalendarEvent(interview) {
        try {
            const event = {
                summary: `Interview: ${interview.jobTitle}`,
                description: `
Interview Type: ${interview.type}
Candidate: ${interview.candidateName}
Job Position: ${interview.jobTitle}

${interview.notes || ''}

${interview.meetingLink ? `Meeting Link: ${interview.meetingLink}` : ''}
                `.trim(),
                location: interview.location || interview.meetingLink || '',
                start: {
                    dateTime: this.combineDateTime(interview.date, interview.startTime),
                    timeZone: interview.timezone || 'America/New_York'
                },
                end: {
                    dateTime: this.combineDateTime(interview.date, interview.endTime),
                    timeZone: interview.timezone || 'America/New_York'
                },
                attendees: [
                    { email: interview.candidateEmail },
                    ...(interview.interviewerEmails || []).map(email => ({ email }))
                ],
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 1 day before
                        { method: 'popup', minutes: 30 }       // 30 minutes before
                    ]
                },
                conferenceData: interview.createMeet ? {
                    createRequest: {
                        requestId: `interview-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                } : undefined
            };

            const response = await this.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                sendUpdates: 'all',
                conferenceDataVersion: interview.createMeet ? 1 : 0
            });

            return {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink,
                meetingLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null
            };
        } catch (error) {
            console.error('Calendar event creation error:', error);
            throw error;
        }
    }

    async updateCalendarEvent(eventId, interview) {
        try {
            const event = {
                summary: `Interview: ${interview.jobTitle}`,
                description: `
Interview Type: ${interview.type}
Candidate: ${interview.candidateName}
Job Position: ${interview.jobTitle}

${interview.notes || ''}

${interview.meetingLink ? `Meeting Link: ${interview.meetingLink}` : ''}
                `.trim(),
                location: interview.location || interview.meetingLink || '',
                start: {
                    dateTime: this.combineDateTime(interview.date, interview.startTime),
                    timeZone: interview.timezone || 'America/New_York'
                },
                end: {
                    dateTime: this.combineDateTime(interview.date, interview.endTime),
                    timeZone: interview.timezone || 'America/New_York'
                }
            };

            const response = await this.calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                resource: event,
                sendUpdates: 'all'
            });

            return {
                eventId: response.data.id,
                htmlLink: response.data.htmlLink
            };
        } catch (error) {
            console.error('Calendar event update error:', error);
            throw error;
        }
    }

    async deleteCalendarEvent(eventId) {
        try {
            await this.calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId,
                sendUpdates: 'all'
            });
            return true;
        } catch (error) {
            console.error('Calendar event deletion error:', error);
            throw error;
        }
    }

    async getAvailableSlots(date, duration = 60) {
        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(9, 0, 0, 0);
            
            const endOfDay = new Date(date);
            endOfDay.setHours(18, 0, 0, 0);

            const response = await this.calendar.freebusy.query({
                resource: {
                    timeMin: startOfDay.toISOString(),
                    timeMax: endOfDay.toISOString(),
                    items: [{ id: 'primary' }]
                }
            });

            const busySlots = response.data.calendars.primary.busy;
            const availableSlots = [];
            
            let currentTime = new Date(startOfDay);
            
            while (currentTime < endOfDay) {
                const slotEnd = new Date(currentTime.getTime() + duration * 60000);
                
                const isAvailable = !busySlots.some(busy => {
                    const busyStart = new Date(busy.start);
                    const busyEnd = new Date(busy.end);
                    return currentTime < busyEnd && slotEnd > busyStart;
                });
                
                if (isAvailable && slotEnd <= endOfDay) {
                    availableSlots.push({
                        start: currentTime.toISOString(),
                        end: slotEnd.toISOString(),
                        startTime: currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                        endTime: slotEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                    });
                }
                
                currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-minute intervals
            }
            
            return availableSlots;
        } catch (error) {
            console.error('Get available slots error:', error);
            throw error;
        }
    }

    combineDateTime(date, time) {
        const [hours, minutes] = time.split(':').map(Number);
        const dateObj = new Date(date);
        dateObj.setHours(hours, minutes, 0, 0);
        return dateObj.toISOString();
    }
}

module.exports = new CalendarService();
