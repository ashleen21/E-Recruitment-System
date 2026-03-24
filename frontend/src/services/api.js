import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  verifyEmail: (token) => api.get(`/auth/verify-email?token=${token}`),
  changePassword: (currentPassword, newPassword) => api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Jobs API
export const jobsAPI = {
  getAll: (params) => api.get('/jobs', { params }),
  getById: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs', data),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  delete: (id) => api.delete(`/jobs/${id}`),
  publish: (id) => api.post(`/jobs/${id}/publish`),
  close: (id) => api.post(`/jobs/${id}/close`),
  distribute: (id, platforms) => api.post(`/jobs/${id}/distribute`, { platforms }),
  getDistributions: (id) => api.get(`/jobs/${id}/distributions`),
  shareEmail: (id, data) => api.post(`/jobs/${id}/share-email`, data),
  getShareLink: (id) => api.get(`/jobs/${id}/share-link`),
  getDistributionsSummary: () => api.get('/jobs/distributions/summary'),
  getRecommendations: (limit = 6) => api.get('/jobs/recommendations', { params: { limit } }),
};

// Applications API
export const applicationsAPI = {
  getAll: (params) => api.get('/applications', { params }),
  getMyApplications: () => api.get('/applications/my-applications'),
  getById: (id) => api.get(`/applications/${id}`),
  apply: (data) => api.post('/applications', data),
  updateStatus: (id, status) => api.patch(`/applications/${id}/status`, { status }),
  getAIRanking: (jobId) => api.get(`/applications/job/${jobId}/ranking`),
  shortlist: (applicationIds) => api.post('/applications/shortlist', { applicationIds }),
  bulkUpdateStatus: (applicationIds, status, reason = null) => 
    api.post('/applications/bulk-update-status', { applicationIds, status, reason }),
  topNShortlist: (jobId, topN) => api.post('/applications/top-n-shortlist', { jobId, topN }),
  withdraw: (id, reason) => api.post(`/applications/${id}/withdraw`, { reason }),
  acceptOffer: (id) => api.post(`/applications/${id}/accept-offer`),
  declineOffer: (id, reason) => api.post(`/applications/${id}/decline-offer`, { reason }),
  getMatchScore: (id, force = false) => api.get(`/applications/${id}/match-score${force ? '?force=true' : ''}`),
  updateMatchScore: (id, score, comment) => api.put(`/applications/${id}/match-score`, { score, comment }),
  bulkCalculateMatchScore: (applicationIds) => api.post('/applications/bulk-match-score', { applicationIds }),
  reparseResume: (id) => api.post(`/applications/${id}/reparse-resume`),
};

// Candidates API
export const candidatesAPI = {
  getProfile: () => api.get('/candidates/profile'),
  updateProfile: (data) => api.put('/candidates/profile', data),
  uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post('/candidates/profile/photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getSkills: () => api.get('/candidates/skills'),
  addSkill: (data) => api.post('/candidates/skills', data),
  removeSkill: (skillId) => api.delete(`/candidates/skills/${skillId}`),
  getEducation: () => api.get('/candidates/education'),
  addEducation: (data) => api.post('/candidates/education', data),
  updateEducation: (id, data) => api.put(`/candidates/education/${id}`, data),
  deleteEducation: (id) => api.delete(`/candidates/education/${id}`),
  getExperience: () => api.get('/candidates/experience'),
  addExperience: (data) => api.post('/candidates/experience', data),
  updateExperience: (id, data) => api.put(`/candidates/experience/${id}`, data),
  deleteExperience: (id) => api.delete(`/candidates/experience/${id}`),
};

// Employees API
export const employeesAPI = {
  getAll: (params) => api.get('/employees', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  updateById: (id, data) => api.put(`/employees/${id}`, data),
  getProfile: () => api.get('/employees/profile'),
  updateProfile: (data) => api.put('/employees/profile', data),
  uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post('/employees/profile/photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadResume: (file) => {
    const formData = new FormData();
    formData.append('resume', file);
    return api.post('/employees/profile/resume', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getResume: () => api.get('/employees/profile/resume'),
  getResumePreview: () => api.get('/employees/profile/resume/preview'),
  updateResumeParsedData: (data) => api.put('/employees/profile/resume/parsed-data', data),
  aiScreenResume: () => api.post('/employees/profile/resume/ai-screen'),
  getInternalOpportunities: () => api.get('/employees/opportunities'),
  getOpportunityDetails: (id) => api.get(`/employees/opportunities/${id}`),
  applyInternal: (jobId, coverLetter) => api.post('/employees/apply-internal', { jobId, coverLetter }),
  getMyApplications: () => api.get('/employees/my-applications'),
  withdrawApplication: (id, reason) => api.post(`/employees/applications/${id}/withdraw`, { reason }),
  acceptOffer: (id) => api.post(`/employees/applications/${id}/accept-offer`),
  declineOffer: (id, reason) => api.post(`/employees/applications/${id}/decline-offer`, { reason }),
  getMyInterviews: () => api.get('/employees/my-interviews'),
  confirmInterview: (id) => api.post(`/employees/interviews/${id}/confirm`),
  contactHR: (data) => api.post('/employees/contact-hr', data),
  saveJob: (jobId) => api.post('/employees/save-job', { jobId }),
  getSavedJobs: () => api.get('/employees/saved-jobs'),
  getCareerPaths: () => api.get('/employees/career-paths'),
  getSkillGap: (targetRole) => api.get(`/employees/skill-gap/${targetRole}`),
  // Skills
  addSkill: (data) => api.post('/employees/skills', data),
  deleteSkill: (skillId) => api.delete(`/employees/skills/${skillId}`),
  // Certifications
  addCertification: (data) => api.post('/employees/certifications', data),
  updateCertification: (id, data) => api.put(`/employees/certifications/${id}`, data),
  deleteCertification: (id) => api.delete(`/employees/certifications/${id}`),
  uploadCertificationFile: (file) => {
    const formData = new FormData();
    formData.append('documents', file);
    return api.post('/employees/certifications/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // Training/Courses
  addTraining: (data) => api.post('/employees/training', data),
  deleteTraining: (id) => api.delete(`/employees/training/${id}`),
  uploadTrainingFile: (file) => {
    const formData = new FormData();
    formData.append('documents', file);
    return api.post('/employees/training/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Resume API
export const resumeAPI = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('resume', file);
    return api.post('/resumes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  parse: (resumeId) => api.post(`/resumes/${resumeId}/parse`),
  reparse: (resumeId) => api.post(`/resumes/${resumeId}/reparse`),
  applyToProfile: (resumeId) => api.post(`/resumes/${resumeId}/apply-to-profile`),
  getAll: () => api.get('/resumes'),
  getById: (id) => api.get(`/resumes/${id}`),
  delete: (id) => api.delete(`/resumes/${id}`),
  updateParsedData: (id, data) => api.put(`/resumes/${id}/parsed-data`, data),
};

// Interviews API
export const interviewsAPI = {
  getAll: (params) => api.get('/interviews', { params }),
  getMyInterviews: () => api.get('/interviews/my-interviews'),
  getById: (id) => api.get(`/interviews/${id}`),
  schedule: (data) => api.post('/interviews', {
    application_id: data.applicationId,
    interview_type: data.interviewType,
    scheduled_date: data.scheduledDate,
    start_time: data.startTime,
    end_time: data.endTime,
    location: data.location,
    meeting_link: data.meetingLink,
    interviewers: data.interviewers,
    notes: data.notes,
    send_calendar_invite: data.sendCalendarInvite,
    send_email_notification: data.sendEmailNotification,
  }),
  bulkSchedule: (data) => api.post('/interviews/bulk-schedule', {
    job_id: data.jobId,
    interview_type: data.interviewType,
    scheduled_date: data.scheduledDate,
    start_time: data.startTime,
    interval_minutes: data.intervalMinutes,
    location: data.location,
    meeting_link: data.meetingLink,
    notes: data.notes,
  }),
  update: (id, data) => api.put(`/interviews/${id}`, data),
  cancel: (id, reason) => api.post(`/interviews/${id}/cancel`, { reason }),
  confirm: (id) => api.post(`/interviews/${id}/confirm`),
  addFeedback: (id, feedback) => api.post(`/interviews/${id}/feedback`, feedback),
  getFeedback: (id) => api.get(`/interviews/${id}/feedback`),
  getJobEvaluation: (jobId) => api.get(`/interviews/job/${jobId}/evaluation`),
  finalizeHiring: (jobId, data) => api.post(`/interviews/job/${jobId}/finalize`, data),
  getEvaluationsHistory: () => api.get('/interviews/evaluations/history'),
  getAvailability: (date) => api.get('/interviews/availability', { params: { date } }),
};

// Analytics API
export const analyticsAPI = {
  getDashboard: () => api.get('/analytics/dashboard'),
  getComprehensive: (params) => api.get('/analytics/comprehensive', { params }),
  getJobAnalytics: (jobId) => api.get(`/analytics/job/${jobId}`),
  getReports: (params) => api.get('/analytics/reports', { params }),
  getAIPredictions: () => api.get('/analytics/ai-predictions'),
  getInternalMobility: () => api.get('/analytics/internal-mobility'),
};

// Skills API
export const skillsAPI = {
  search: (query) => api.get('/skills/search', { params: { q: query } }),
  getCategories: () => api.get('/skills/categories'),
  getSuggestions: (jobTitle) => api.get('/skills/suggestions', { params: { jobTitle } }),
};

// AI API
export const aiAPI = {
  screenCandidate: (applicationId) => api.post(`/ai/screen/${applicationId}`),
  matchInternal: (employeeId) => api.get(`/ai/match-internal/${employeeId}`),
  generateCareerPath: (employeeId) => api.get(`/ai/career-path/${employeeId}`),
  predictOutcome: (applicationId) => api.get(`/ai/predict/${applicationId}`),
  generateQuestions: (jobId) => api.get(`/ai/interview-questions/${jobId}`),
  // Predictive Models
  getPredictions: (applicationId) => api.get(`/ai/predictions/${applicationId}`),
  getBulkPredictions: (data) => api.post('/ai/predictions/bulk', data),
  getPredictionInsights: (params) => api.get('/ai/predictions/insights', { params }),
};

// Notifications API
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
  clearRead: () => api.delete('/notifications/clear-read'),
};

export default api;
