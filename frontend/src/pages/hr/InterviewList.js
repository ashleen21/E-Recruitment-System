import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CalendarIcon,
  ClockIcon,
  VideoCameraIcon,
  MapPinIcon,
  PencilIcon,
  XMarkIcon,
  PlusIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  BellIcon,
  UserGroupIcon,
  StarIcon,
  ClipboardDocumentCheckIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  TrophyIcon,
  ChevronRightIcon,
  ArchiveBoxIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { interviewsAPI, applicationsAPI, jobsAPI } from '../../services/api';
import api from '../../services/api';

const InterviewList = () => {
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState({ show: false, interview: null });
  const [viewFeedbackModal, setViewFeedbackModal] = useState({ show: false, interview: null });
  const [evaluationModal, setEvaluationModal] = useState({ show: false, jobId: null });
  const [selectedWinners, setSelectedWinners] = useState([]);
  const [showEvaluationsHistory, setShowEvaluationsHistory] = useState(false);
  const [historyDetailModal, setHistoryDetailModal] = useState({ show: false, jobId: null });
  const [showOfferConfirmModal, setShowOfferConfirmModal] = useState(false);
  const [offerConfirmData, setOfferConfirmData] = useState({ winners: [], rejectCount: 0 });
  const [filters, setFilters] = useState({ status: '', date: '' });
  const queryClient = useQueryClient();

  // Feedback form state
  const [feedbackForm, setFeedbackForm] = useState({
    technical_skills_rating: 0,
    communication_rating: 0,
    problem_solving_rating: 0,
    cultural_fit_rating: 0,
    leadership_rating: 0,
    overall_rating: 0,
    strengths: '',
    weaknesses: '',
    detailed_feedback: '',
    recommendation: '',
    hire_recommendation: null,
  });

  // Schedule form state
  const [scheduleForm, setScheduleForm] = useState({
    jobId: '',
    interviewType: 'video',
    scheduledDate: '',
    startTime: '09:00',
    intervalMinutes: 30,
    location: '',
    meetingLink: '',
    notes: '',
  });

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['interviews', filters],
    queryFn: () => interviewsAPI.getAll(filters),
  });

  const { data: jobsList } = useQuery({
    queryKey: ['jobs-for-interviews'],
    queryFn: () => jobsAPI.getAll({ limit: 100 }),
  });

  const { data: shortlistedForJob } = useQuery({
    queryKey: ['shortlisted-for-job', scheduleForm.jobId],
    queryFn: () => applicationsAPI.getAll({ jobId: scheduleForm.jobId, status: 'shortlisted' }),
    enabled: !!scheduleForm.jobId,
  });

  const { data: feedbackData } = useQuery({
    queryKey: ['interview-feedback', viewFeedbackModal.interview?.id],
    queryFn: () => interviewsAPI.getFeedback(viewFeedbackModal.interview.id),
    enabled: !!viewFeedbackModal.interview?.id,
  });

  const { data: evaluationData, isLoading: evalLoading } = useQuery({
    queryKey: ['job-evaluation', evaluationModal.jobId || historyDetailModal.jobId],
    queryFn: () => interviewsAPI.getJobEvaluation(evaluationModal.jobId || historyDetailModal.jobId),
    enabled: !!(evaluationModal.jobId || historyDetailModal.jobId),
  });

  const { data: evaluationsHistory } = useQuery({
    queryKey: ['evaluations-history'],
    queryFn: () => interviewsAPI.getEvaluationsHistory(),
  });

  const scheduleMutation = useMutation({
    mutationFn: (data) => interviewsAPI.bulkSchedule(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['interviews']);
      queryClient.invalidateQueries(['applications']);
      const d = response.data;
      toast.success(`Scheduled ${d.total} interviews for ${d.date}!`);
      setShowScheduleModal(false);
      resetScheduleForm();
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to schedule interviews'),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, feedback }) => interviewsAPI.addFeedback(id, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries(['interviews']);
      toast.success('Feedback submitted! Interview marked as completed.');
      setFeedbackModal({ show: false, interview: null });
      resetFeedbackForm();
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to submit feedback'),
  });

  const finalizeMutation = useMutation({
    mutationFn: ({ jobId, data }) => interviewsAPI.finalizeHiring(jobId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['interviews']);
      queryClient.invalidateQueries(['applications']);
      queryClient.invalidateQueries(['job-evaluation']);
      queryClient.invalidateQueries(['evaluations-history']);
      const d = response.data;
      toast.success(d.message);
      setEvaluationModal({ show: false, jobId: null });
      setSelectedWinners([]);
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to finalize hiring'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => interviewsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['interviews']);
      toast.success('Interview updated successfully!');
      setSelectedInterview(null);
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to update interview'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => interviewsAPI.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries(['interviews']);
      toast.success('Interview cancelled. Notification sent.');
    },
    onError: () => toast.error('Failed to cancel interview'),
  });

  const sendReminderMutation = useMutation({
    mutationFn: (interviewId) => api.post(`/interviews/${interviewId}/send-reminder`),
    onSuccess: () => toast.success('Reminder sent to candidate!'),
    onError: () => toast.error('Failed to send reminder'),
  });

  const resetScheduleForm = () => {
    setScheduleForm({
      jobId: '', interviewType: 'video', scheduledDate: '', startTime: '09:00',
      intervalMinutes: 30, location: '', meetingLink: '', notes: '',
    });
  };

  const resetFeedbackForm = () => {
    setFeedbackForm({
      technical_skills_rating: 0, communication_rating: 0, problem_solving_rating: 0,
      cultural_fit_rating: 0, leadership_rating: 0, overall_rating: 0,
      strengths: '', weaknesses: '', detailed_feedback: '', recommendation: '', hire_recommendation: null,
    });
  };

  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    if (!scheduleForm.jobId || !scheduleForm.scheduledDate || !scheduleForm.startTime) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (shortlistedCandidates.length === 0) {
      toast.error('No shortlisted candidates for this job posting');
      return;
    }
    scheduleMutation.mutate(scheduleForm);
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    if (!feedbackForm.overall_rating) {
      toast.error('Please provide at least an overall rating');
      return;
    }
    if (!feedbackForm.recommendation) {
      toast.error('Please select a recommendation');
      return;
    }
    feedbackMutation.mutate({
      id: feedbackModal.interview.id,
      feedback: feedbackForm,
    });
  };

  const handleFinalize = () => {
    if (selectedWinners.length === 0) {
      toast.error('Please select at least one candidate to extend an offer to');
      return;
    }
    const winnerCandidates = evaluationCandidates
      .filter(c => selectedWinners.includes(c.application_id));
    const rejectCount = evaluationCandidates.filter(c =>
      !selectedWinners.includes(c.application_id) && c.application_status === 'interviewed'
    ).length;

    setOfferConfirmData({ winners: winnerCandidates, rejectCount });
    setShowOfferConfirmModal(true);
  };

  const confirmAndExtendOffer = () => {
    finalizeMutation.mutate({
      jobId: evaluationModal.jobId,
      data: { selectedApplicationIds: selectedWinners },
    });
    setShowOfferConfirmModal(false);
  };

  const openFeedbackModal = (interview) => {
    resetFeedbackForm();
    setFeedbackModal({ show: true, interview });
  };

  const openEvaluation = (jobId) => {
    setSelectedWinners([]);
    setEvaluationModal({ show: true, jobId });
  };

  const toggleWinner = (applicationId) => {
    setSelectedWinners(prev =>
      prev.includes(applicationId)
        ? prev.filter(id => id !== applicationId)
        : [...prev, applicationId]
    );
  };

  // Star rating component
  const StarRating = ({ value, onChange, label }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="focus:outline-none transition-transform hover:scale-110"
          >
            {star <= value ? (
              <StarSolidIcon className="h-7 w-7 text-amber-400" />
            ) : (
              <StarIcon className="h-7 w-7 text-gray-300 hover:text-amber-300" />
            )}
          </button>
        ))}
        {value > 0 && <span className="ml-2 text-sm text-gray-500 self-center">{value}/5</span>}
      </div>
    </div>
  );

  // Mini star display
  const MiniStars = ({ rating }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <StarSolidIcon key={s} className={`h-4 w-4 ${s <= (rating || 0) ? 'text-amber-400' : 'text-gray-200'}`} />
      ))}
    </div>
  );

  const getStatusBadge = (status) => {
    const styles = {
      scheduled: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      no_show: 'bg-yellow-100 text-yellow-800',
      rescheduled: 'bg-orange-100 text-orange-800',
    };
    return styles[status] || styles.scheduled;
  };

  const getTypeBadge = (type) => {
    const styles = {
      video: 'bg-blue-100 text-blue-800',
      in_person: 'bg-green-100 text-green-800',
      technical: 'bg-orange-100 text-orange-800',
      panel: 'bg-pink-100 text-pink-800',
      final: 'bg-indigo-100 text-indigo-800',
    };
    return styles[type] || styles.video;
  };

  const formatInterviewType = (type) => {
    const types = {
      video: 'Video Call', in_person: 'In-Person', technical: 'Practical Assessment',
      phone_screen: 'Phone Screen',
    };
    return types[type] || type;
  };

  const getRecommendationBadge = (rec) => {
    const styles = {
      strong_hire: 'bg-green-100 text-green-800 border-green-300',
      hire: 'bg-blue-100 text-blue-800 border-blue-300',
      no_hire: 'bg-orange-100 text-orange-800 border-orange-300',
      strong_no_hire: 'bg-red-100 text-red-800 border-red-300',
    };
    return styles[rec] || 'bg-gray-100 text-gray-800';
  };

  const formatRecommendation = (rec) => {
    const labels = {
      strong_hire: 'Strong Hire',
      hire: 'Hire',
      no_hire: 'No Hire',
      strong_no_hire: 'Strong No Hire',
    };
    return labels[rec] || rec || 'N/A';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const interviewsList = interviews?.data?.interviews || interviews?.data || [];
  const shortlistedCandidates = shortlistedForJob?.data?.applications || shortlistedForJob?.data || [];
  const allJobs = jobsList?.data?.jobs || jobsList?.data || [];
  const existingFeedback = feedbackData?.data || [];
  const evaluationCandidates = evaluationData?.data?.candidates || [];
  const evaluationJob = evaluationData?.data?.job || null;
  const pastEvaluations = evaluationsHistory?.data || [];

  const groupedInterviews = interviewsList.reduce((acc, interview) => {
    const date = new Date(interview.scheduled_date).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(interview);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedInterviews).sort((a, b) => new Date(b) - new Date(a));

  // Find jobs that have completed interviews where application is still 'interviewed' (no offer yet)
  const jobsWithInterviewedCandidates = new Map(); // job_title -> count of interviewed candidates
  const jobsWithDeclinedOffers = new Map(); // job_id -> count of declined offers
  const jobsWithPendingOffers = new Map(); // job_id -> has pending offer (offer_extended)
  const jobsWithHiredCandidates = new Map(); // job_id -> has hired candidate
  
  interviewsList.forEach(i => {
    if (i.status === 'completed' && i.application_status === 'interviewed') {
      jobsWithInterviewedCandidates.set(i.job_title, (jobsWithInterviewedCandidates.get(i.job_title) || 0) + 1);
    }
    // Track jobs with declined offers for re-evaluation
    if (i.application_status === 'offer_declined') {
      jobsWithDeclinedOffers.set(i.job_id, (jobsWithDeclinedOffers.get(i.job_id) || 0) + 1);
    }
    // Track jobs with pending offers (offer_extended) - these are waiting for response
    if (i.application_status === 'offer_extended') {
      jobsWithPendingOffers.set(i.job_id, true);
    }
    // Track jobs with hired candidates - these are completed
    if (i.application_status === 'hired') {
      jobsWithHiredCandidates.set(i.job_id, true);
    }
  });
  
  // Jobs ready for evaluation: have interviewed candidates OR have declined offers (but no pending offer and no hired)
  const jobsReadyForEvaluation = allJobs.filter(job =>
    !jobsWithHiredCandidates.has(job.id) && // NOT already hired
    !jobsWithPendingOffers.has(job.id) && // NOT waiting for offer response
    (jobsWithInterviewedCandidates.has(job.title) || jobsWithDeclinedOffers.has(job.id))
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Management</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowEvaluationsHistory(true)} className="btn-secondary flex items-center">
            <ArchiveBoxIcon className="h-5 w-5 mr-2" />
            Evaluations
            {pastEvaluations.length > 0 && (
              <span className="ml-2 bg-primary-100 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {pastEvaluations.length}
              </span>
            )}
          </button>
          <button onClick={() => setShowScheduleModal(true)} className="btn-primary flex items-center">
            <PlusIcon className="h-5 w-5 mr-2" />
            Schedule Interviews
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="card bg-blue-50">
          <div className="flex items-center">
            <CalendarIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-xs text-blue-600">Scheduled</p>
              <p className="text-2xl font-bold text-blue-700">
                {interviewsList.filter(i => i.status === 'scheduled').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-green-50">
          <div className="flex items-center">
            <CheckCircleIcon className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-xs text-green-600">Confirmed</p>
              <p className="text-2xl font-bold text-green-700">
                {interviewsList.filter(i => i.status === 'confirmed').length}
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-purple-50">
          <div className="flex items-center">
            <UserGroupIcon className="h-8 w-8 text-purple-600" />
            <div className="ml-3">
              <p className="text-xs text-purple-600">Today</p>
              <p className="text-2xl font-bold text-purple-700">
                {interviewsList.filter(i =>
                  new Date(i.scheduled_date).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-amber-50">
          <div className="flex items-center">
            <ClipboardDocumentCheckIcon className="h-8 w-8 text-amber-600" />
            <div className="ml-3">
              <p className="text-xs text-amber-600">Needs Feedback</p>
              <p className="text-2xl font-bold text-amber-700">
                {interviewsList.filter(i =>
                  (i.status === 'scheduled' || i.status === 'confirmed') &&
                  new Date(i.scheduled_date) < new Date()
                ).length}
              </p>
            </div>
          </div>
        </div>
        <div className="card bg-gray-50">
          <div className="flex items-center">
            <StarIcon className="h-8 w-8 text-gray-600" />
            <div className="ml-3">
              <p className="text-xs text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-700">
                {interviewsList.filter(i => i.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Evaluate Candidates Banner */}
      {jobsReadyForEvaluation.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold flex items-center">
                <TrophyIcon className="h-6 w-6 mr-2" />
                Ready for Evaluation
              </h3>
              <p className="text-indigo-100 text-sm mt-1">
                These job postings have completed interviews — review feedback and select the best candidate.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {jobsReadyForEvaluation.map(job => {
              const interviewedCount = jobsWithInterviewedCandidates.get(job.title) || 0;
              const declinedCount = jobsWithDeclinedOffers.get(job.id) || 0;
              const hasPendingOffer = jobsWithPendingOffers.has(job.id);
              // Only show "Offer Declined" if there are declined offers AND no pending offer extended
              const hasDeclined = declinedCount > 0 && !hasPendingOffer;
              
              return (
                <button
                  key={job.id}
                  onClick={() => openEvaluation(job.id)}
                  className={`flex items-center justify-between backdrop-blur rounded-lg px-4 py-3 text-left transition-all group ${
                    hasDeclined 
                      ? 'bg-orange-500/30 hover:bg-orange-500/40 ring-2 ring-orange-300' 
                      : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {job.title}
                      {hasDeclined && (
                        <span className="px-2 py-0.5 bg-orange-400 text-white text-xs rounded-full">
                          Offer Declined
                        </span>
                      )}
                      {hasPendingOffer && (
                        <span className="px-2 py-0.5 bg-blue-400 text-white text-xs rounded-full">
                          Offer Pending
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-indigo-200">
                      {interviewedCount > 0 && `${interviewedCount} candidate${interviewedCount !== 1 ? 's' : ''} awaiting decision`}
                      {interviewedCount > 0 && hasDeclined && ' • '}
                      {hasDeclined && `${declinedCount} declined offer${declinedCount !== 1 ? 's' : ''}`}
                      {hasPendingOffer && ' • Waiting for candidate response'}
                    </p>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-white/70 group-hover:text-white transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="input-field w-auto">
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className="input-field w-auto" />
          <select value={filters.type || ''} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="input-field w-auto">
            <option value="">All Types</option>
            <option value="video">Video Call</option>
            <option value="in_person">In-Person</option>
            <option value="technical">Practical Assessment</option>
          </select>
        </div>
      </div>

      {/* Interview List by Date */}
      <div className="space-y-6">
        {sortedDates.map((date) => {
          const isPast = new Date(date) < new Date(new Date().toDateString());
          return (
            <div key={date}>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2 text-primary-600" />
                {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {new Date(date).toDateString() === new Date().toDateString() && (
                  <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">Today</span>
                )}
                {isPast && (
                  <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">Past</span>
                )}
              </h3>
              <div className="grid gap-4">
                {groupedInterviews[date].map((interview) => {
                  const interviewPast = new Date(interview.scheduled_date) < new Date(new Date().toDateString());
                  const needsFeedback = (interview.status === 'scheduled' || interview.status === 'confirmed') && interviewPast;
                  const hasFeedback = interview.status === 'completed';

                  return (
                    <div
                      key={interview.id}
                      className={`card hover:shadow-lg transition-shadow border-l-4 ${
                        needsFeedback ? 'border-l-amber-500 bg-amber-50/30' :
                        hasFeedback ? 'border-l-green-500' :
                        'border-l-primary-500'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${needsFeedback ? 'bg-amber-100' : hasFeedback ? 'bg-green-100' : 'bg-primary-100'}`}>
                            {needsFeedback ? (
                              <ClipboardDocumentCheckIcon className="h-6 w-6 text-amber-600" />
                            ) : hasFeedback ? (
                              <CheckCircleIcon className="h-6 w-6 text-green-600" />
                            ) : (
                              <ClockIcon className="h-6 w-6 text-primary-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-gray-900">
                                {interview.start_time?.slice(0, 5)} - {interview.end_time?.slice(0, 5)}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(interview.interview_type)}`}>
                                {formatInterviewType(interview.interview_type)}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(interview.status)}`}>
                                {interview.status}
                              </span>
                              {needsFeedback && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 animate-pulse">
                                  Feedback Required
                                </span>
                              )}
                            </div>
                            <p className="text-gray-700 font-medium">
                              {interview.candidate_name || `${interview.candidate_first_name || ''} ${interview.candidate_last_name || ''}`.trim() || 'Unknown'}
                            </p>
                            <p className="text-sm text-gray-600">{interview.job_title}</p>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                              {interview.location && (
                                <span className="flex items-center"><MapPinIcon className="h-4 w-4 mr-1" />{interview.location}</span>
                              )}
                              {interview.meeting_link && (
                                <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center text-primary-600 hover:text-primary-700">
                                  <VideoCameraIcon className="h-4 w-4 mr-1" />Join Meeting
                                </a>
                              )}
                              {interview.invitation_sent && (
                                <span className="flex items-center text-green-600"><EnvelopeIcon className="h-4 w-4 mr-1" />Invite Sent</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {needsFeedback && (
                            <button onClick={() => openFeedbackModal(interview)}
                              className="btn-primary text-sm flex items-center animate-pulse">
                              <ClipboardDocumentCheckIcon className="h-4 w-4 mr-1" />Add Feedback
                            </button>
                          )}
                          {hasFeedback && (
                            <button onClick={() => setViewFeedbackModal({ show: true, interview })}
                              className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center">
                              <StarIcon className="h-4 w-4 mr-1" />View Feedback
                            </button>
                          )}
                          {(interview.status === 'scheduled' || interview.status === 'confirmed') && !interviewPast && (
                            <button onClick={() => sendReminderMutation.mutate(interview.id)}
                              disabled={sendReminderMutation.isPending}
                              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Send Reminder">
                              <BellIcon className="h-5 w-5" />
                            </button>
                          )}
                          <button onClick={() => setSelectedInterview(interview)}
                            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg" title="Edit">
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          {(interview.status === 'scheduled' || interview.status === 'confirmed') && (
                            <button onClick={() => {
                              if (window.confirm('Cancel this interview? The candidate will be notified.')) {
                                cancelMutation.mutate({ id: interview.id, reason: 'Cancelled by HR' });
                              }
                            }} className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Cancel">
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {sortedDates.length === 0 && (
          <div className="text-center py-12">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No interviews scheduled</h3>
            <p className="mt-1 text-sm text-gray-500">Schedule interviews with shortlisted candidates.</p>
            <button onClick={() => setShowScheduleModal(true)} className="mt-4 btn-primary">Schedule Interviews</button>
          </div>
        )}
      </div>

      {/* ==================== FEEDBACK MODAL ==================== */}
      {feedbackModal.show && feedbackModal.interview && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-40" onClick={() => setFeedbackModal({ show: false, interview: null })} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full p-0 max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 rounded-t-xl z-10">
                <h3 className="text-xl font-bold text-white">Interview Feedback</h3>
                <p className="text-amber-100 text-sm">
                  {feedbackModal.interview.candidate_first_name} {feedbackModal.interview.candidate_last_name} — {feedbackModal.interview.job_title}
                </p>
              </div>

              <form onSubmit={handleFeedbackSubmit} className="p-6 space-y-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Interview Details</p>
                  <p className="font-medium">
                    {formatInterviewType(feedbackModal.interview.interview_type)} — {' '}
                    {new Date(feedbackModal.interview.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' at '}{feedbackModal.interview.start_time?.slice(0, 5)}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <StarIcon className="h-5 w-5 mr-2 text-amber-500" />Performance Ratings
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StarRating label="Technical Skills" value={feedbackForm.technical_skills_rating}
                      onChange={(v) => setFeedbackForm({ ...feedbackForm, technical_skills_rating: v })} />
                    <StarRating label="Communication" value={feedbackForm.communication_rating}
                      onChange={(v) => setFeedbackForm({ ...feedbackForm, communication_rating: v })} />
                    <StarRating label="Problem Solving" value={feedbackForm.problem_solving_rating}
                      onChange={(v) => setFeedbackForm({ ...feedbackForm, problem_solving_rating: v })} />
                    <StarRating label="Cultural Fit" value={feedbackForm.cultural_fit_rating}
                      onChange={(v) => setFeedbackForm({ ...feedbackForm, cultural_fit_rating: v })} />
                    <StarRating label="Leadership Potential" value={feedbackForm.leadership_rating}
                      onChange={(v) => setFeedbackForm({ ...feedbackForm, leadership_rating: v })} />
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <StarRating label="Overall Rating *" value={feedbackForm.overall_rating}
                        onChange={(v) => setFeedbackForm({ ...feedbackForm, overall_rating: v })} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="flex items-center"><HandThumbUpIcon className="h-4 w-4 mr-1 text-green-600" /> Strengths</span>
                    </label>
                    <textarea value={feedbackForm.strengths}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })}
                      rows={3} className="input-field" placeholder="What did the candidate do well?" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="flex items-center"><HandThumbDownIcon className="h-4 w-4 mr-1 text-red-500" /> Areas for Improvement</span>
                    </label>
                    <textarea value={feedbackForm.weaknesses}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, weaknesses: e.target.value })}
                      rows={3} className="input-field" placeholder="What areas need improvement?" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Detailed Feedback</label>
                  <textarea value={feedbackForm.detailed_feedback}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, detailed_feedback: e.target.value })}
                    rows={4} className="input-field" placeholder="Provide detailed notes about the candidate's performance..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Hiring Recommendation *</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { value: 'strong_hire', label: 'Strong Hire', color: 'bg-green-100 border-green-400 text-green-800', activeColor: 'bg-green-500 text-white border-green-600' },
                      { value: 'hire', label: 'Hire', color: 'bg-blue-50 border-blue-300 text-blue-700', activeColor: 'bg-blue-500 text-white border-blue-600' },
                      { value: 'no_hire', label: 'No Hire', color: 'bg-orange-50 border-orange-300 text-orange-700', activeColor: 'bg-orange-500 text-white border-orange-600' },
                      { value: 'strong_no_hire', label: 'Strong No Hire', color: 'bg-red-50 border-red-300 text-red-700', activeColor: 'bg-red-500 text-white border-red-600' },
                    ].map((opt) => (
                      <button key={opt.value} type="button"
                        onClick={() => setFeedbackForm({
                          ...feedbackForm,
                          recommendation: opt.value,
                          hire_recommendation: opt.value === 'strong_hire' || opt.value === 'hire',
                        })}
                        className={`p-3 rounded-lg border-2 text-center font-medium text-sm transition-all ${
                          feedbackForm.recommendation === opt.value ? opt.activeColor : opt.color
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={() => setFeedbackModal({ show: false, interview: null })} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={feedbackMutation.isPending} className="btn-primary flex items-center">
                    {feedbackMutation.isPending ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Submitting...</>
                    ) : (
                      <><ClipboardDocumentCheckIcon className="h-5 w-5 mr-2" />Submit Feedback</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VIEW FEEDBACK MODAL ==================== */}
      {viewFeedbackModal.show && viewFeedbackModal.interview && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-40" onClick={() => setViewFeedbackModal({ show: false, interview: null })} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 rounded-t-xl flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xl font-bold text-white">Interview Feedback</h3>
                  <p className="text-green-100 text-sm">
                    {viewFeedbackModal.interview.candidate_first_name} {viewFeedbackModal.interview.candidate_last_name} — {viewFeedbackModal.interview.job_title}
                  </p>
                </div>
                <button onClick={() => setViewFeedbackModal({ show: false, interview: null })} className="text-white hover:text-green-200">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6">
                {existingFeedback.length > 0 ? (
                  existingFeedback.map((fb, idx) => (
                    <div key={idx} className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { label: 'Technical', value: fb.technical_skills_rating },
                          { label: 'Communication', value: fb.communication_rating },
                          { label: 'Problem Solving', value: fb.problem_solving_rating },
                          { label: 'Cultural Fit', value: fb.cultural_fit_rating },
                          { label: 'Leadership', value: fb.leadership_rating },
                          { label: 'Overall', value: fb.overall_rating, highlight: true },
                        ].map((r) => (
                          <div key={r.label} className={`p-3 rounded-lg text-center ${r.highlight ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                            <p className="text-xs text-gray-500 mb-1">{r.label}</p>
                            <div className="flex justify-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <StarSolidIcon key={s} className={`h-4 w-4 ${s <= (r.value || 0) ? 'text-amber-400' : 'text-gray-200'}`} />
                              ))}
                            </div>
                            <p className="text-lg font-bold mt-1">{r.value || '-'}/5</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-center">
                        <span className={`px-4 py-2 rounded-full text-sm font-bold border ${getRecommendationBadge(fb.recommendation)}`}>
                          {formatRecommendation(fb.recommendation)}
                        </span>
                      </div>

                      {fb.strengths && (
                        <div className="bg-green-50 p-4 rounded-lg">
                          <p className="text-sm font-medium text-green-800 mb-1 flex items-center">
                            <HandThumbUpIcon className="h-4 w-4 mr-1" /> Strengths
                          </p>
                          <p className="text-green-700 whitespace-pre-line">{fb.strengths}</p>
                        </div>
                      )}
                      {fb.weaknesses && (
                        <div className="bg-red-50 p-4 rounded-lg">
                          <p className="text-sm font-medium text-red-800 mb-1 flex items-center">
                            <HandThumbDownIcon className="h-4 w-4 mr-1" /> Areas for Improvement
                          </p>
                          <p className="text-red-700 whitespace-pre-line">{fb.weaknesses}</p>
                        </div>
                      )}
                      {fb.detailed_feedback && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <p className="text-sm font-medium text-gray-800 mb-1">Detailed Feedback</p>
                          <p className="text-gray-700 whitespace-pre-line">{fb.detailed_feedback}</p>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 text-right">
                        Submitted: {new Date(fb.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No feedback submitted yet.</p>
                )}
              </div>

              <div className="border-t px-6 py-4 flex justify-end">
                <button onClick={() => setViewFeedbackModal({ show: false, interview: null })} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EVALUATION MODAL ==================== */}
      {evaluationModal.show && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-40" onClick={() => setEvaluationModal({ show: false, jobId: null })} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-xl flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <TrophyIcon className="h-6 w-6 mr-2" />
                    Candidate Evaluation
                  </h3>
                  {evaluationJob && (
                    <p className="text-indigo-200 text-sm">{evaluationJob.title} — {evaluationJob.department}</p>
                  )}
                </div>
                <button onClick={() => setEvaluationModal({ show: false, jobId: null })} className="text-white hover:text-indigo-200">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6">
                {evalLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                  </div>
                ) : evaluationCandidates.length === 0 ? (
                  <div className="text-center py-12">
                    <UserGroupIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No evaluated candidates found for this position.</p>
                    <p className="text-sm text-gray-400 mt-1">Complete interviews and submit feedback first.</p>
                  </div>
                ) : (
                  <>
                    {/* Instructions */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                      <p className="text-sm text-indigo-800">
                        <strong>How it works:</strong> Select the best candidate(s) to extend an offer.
                        Other interviewed candidates will remain on hold. If the selected candidate <strong>accepts</strong>, the rest will be automatically rejected.
                        If declined, you can select a different candidate.
                      </p>
                    </div>

                    {/* Candidate Cards */}
                    <div className="space-y-4">
                      {evaluationCandidates.map((candidate, idx) => {
                        const isSelected = selectedWinners.includes(candidate.application_id);
                        const isDeclined = candidate.application_status === 'offer_declined';
                        const alreadyDecided = ['offer_extended', 'offer_accepted', 'hired', 'rejected'].includes(candidate.application_status);
                        // Can only select candidates who are 'interviewed' (not those who declined)
                        const canSelect = candidate.application_status === 'interviewed';
                        const hasFb = !!candidate.overall_rating;

                        return (
                          <div
                            key={candidate.application_id}
                            className={`border-2 rounded-xl p-5 transition-all ${
                              isDeclined
                                ? 'border-orange-300 bg-orange-50/50 opacity-70'
                                : alreadyDecided
                                  ? candidate.application_status === 'rejected'
                                    ? 'border-red-200 bg-red-50/50 opacity-60'
                                    : 'border-green-200 bg-green-50/50'
                                : isSelected
                                  ? 'border-green-500 bg-green-50 shadow-lg ring-2 ring-green-200'
                                  : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'
                            }`}
                          >
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              {/* Rank Number */}
                              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                                idx === 0 && hasFb ? 'bg-amber-400 text-white' :
                                idx === 1 && hasFb ? 'bg-gray-300 text-white' :
                                idx === 2 && hasFb ? 'bg-amber-600 text-white' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {idx + 1}
                              </div>

                              {/* Candidate Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-lg font-semibold text-gray-900">
                                    {candidate.first_name} {candidate.last_name}
                                  </h4>
                                  {(alreadyDecided || isDeclined) && (
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      candidate.application_status === 'offer_extended' ? 'bg-green-100 text-green-800' :
                                      candidate.application_status === 'hired' ? 'bg-emerald-100 text-emerald-800' :
                                      candidate.application_status === 'offer_declined' ? 'bg-orange-100 text-orange-800' :
                                      candidate.application_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {candidate.application_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    </span>
                                  )}
                                  {isDeclined && (
                                    <span className="text-xs text-orange-600 italic">Select another candidate below</span>
                                  )}
                                </div>

                                {/* Scores Row */}
                                <div className="flex flex-wrap gap-4 items-center">
                                  {/* Match Score */}
                                  {candidate.match_score && (
                                    <div className="text-center">
                                      <p className="text-xs text-gray-500">AI Match</p>
                                      <p className="text-lg font-bold text-primary-600">{parseFloat(candidate.match_score).toFixed(0)}%</p>
                                    </div>
                                  )}

                                  {/* Interview Rating */}
                                  {hasFb && (
                                    <>
                                      <div className="h-8 w-px bg-gray-200" />
                                      <div className="text-center">
                                        <p className="text-xs text-gray-500">Overall</p>
                                        <div className="flex items-center gap-1">
                                          <MiniStars rating={candidate.overall_rating} />
                                          <span className="font-bold text-gray-900">{candidate.overall_rating}/5</span>
                                        </div>
                                      </div>
                                      <div className="h-8 w-px bg-gray-200" />
                                      <div className="text-center">
                                        <p className="text-xs text-gray-500">Avg Rating</p>
                                        <p className="text-lg font-bold text-amber-600">{candidate.average_rating}/5</p>
                                      </div>
                                      <div className="h-8 w-px bg-gray-200" />
                                      <div className="text-center">
                                        <p className="text-xs text-gray-500">Recommendation</p>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getRecommendationBadge(candidate.recommendation)}`}>
                                          {formatRecommendation(candidate.recommendation)}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Detailed Ratings */}
                                {hasFb && (
                                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                                    {[
                                      { label: 'Technical', val: candidate.technical_skills_rating },
                                      { label: 'Communication', val: candidate.communication_rating },
                                      { label: 'Problem Solving', val: candidate.problem_solving_rating },
                                      { label: 'Cultural Fit', val: candidate.cultural_fit_rating },
                                      { label: 'Leadership', val: candidate.leadership_rating },
                                    ].map(r => r.val ? (
                                      <span key={r.label} className="bg-gray-100 px-2 py-1 rounded text-gray-700">
                                        {r.label}: <strong>{r.val}/5</strong>
                                      </span>
                                    ) : null)}
                                  </div>
                                )}

                                {/* Strengths/Weaknesses Summary */}
                                {hasFb && (candidate.strengths || candidate.weaknesses) && (
                                  <div className="mt-2 flex gap-4 text-xs">
                                    {candidate.strengths && (
                                      <p className="text-green-700"><strong>Strengths:</strong> {candidate.strengths.substring(0, 100)}{candidate.strengths.length > 100 ? '...' : ''}</p>
                                    )}
                                    {candidate.weaknesses && (
                                      <p className="text-red-700"><strong>Weaknesses:</strong> {candidate.weaknesses.substring(0, 100)}{candidate.weaknesses.length > 100 ? '...' : ''}</p>
                                    )}
                                  </div>
                                )}

                                {!hasFb && (
                                  <p className="text-sm text-amber-600 mt-1">No feedback submitted yet</p>
                                )}
                              </div>

                              {/* Select Button */}
                              {/* Select Button - only for interviewed candidates, not those who declined */}
                              {canSelect && (
                                <button
                                  onClick={() => toggleWinner(candidate.application_id)}
                                  className={`flex-shrink-0 px-4 py-3 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                                    isSelected
                                      ? 'bg-green-500 text-white shadow-lg'
                                      : 'bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700'
                                  }`}
                                >
                                  {isSelected ? (
                                    <><CheckCircleIcon className="h-5 w-5" />Selected</>
                                  ) : (
                                    <><TrophyIcon className="h-5 w-5" />Select</>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Action Bar */}
                    {(() => {
                      const selectableCandidates = evaluationCandidates.filter(c => c.application_status === 'interviewed');
                      const hasDeclinedOffers = evaluationCandidates.some(c => c.application_status === 'offer_declined');
                      const hasHiredCandidate = evaluationCandidates.some(c => c.application_status === 'hired');
                      const hasPendingOffer = evaluationCandidates.some(c => c.application_status === 'offer_extended');
                      const hasAnyCandidate = evaluationCandidates.length > 0;
                      
                      return (
                        <div className="mt-6 p-4 bg-gray-50 rounded-xl border">
                          {/* Declined Offers Alert - only show if NO hired candidate and NO pending offer */}
                          {hasDeclinedOffers && !hasHiredCandidate && !hasPendingOffer && (
                            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                              <p className="text-sm text-orange-800">
                                <strong>Offer Declined:</strong> A candidate has declined the offer. 
                                {selectableCandidates.length > 0 
                                  ? ' Please select a different candidate to extend the offer to.'
                                  : ' No other candidates with completed interviews are available. You may need to shortlist and interview additional candidates for this position.'}
                              </p>
                            </div>
                          )}
                          
                          {/* No selectable candidates warning */}
                          {hasAnyCandidate && selectableCandidates.length === 0 && !hasDeclinedOffers && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-sm text-yellow-800">
                                <strong>No candidates available:</strong> All candidates have already been processed (offer extended, hired, or rejected). 
                                To select new candidates, ensure they have completed their interviews.
                              </p>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-600">
                                <strong>{selectedWinners.length}</strong> candidate{selectedWinners.length !== 1 ? 's' : ''} selected for offer
                                {selectableCandidates.length > 0 && (
                                  <span className="text-gray-400 ml-2">({selectableCandidates.length} available)</span>
                                )}
                              </p>
                              {selectedWinners.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {evaluationCandidates.filter(c =>
                                    !selectedWinners.includes(c.application_id) && c.application_status === 'interviewed'
                                  ).length} candidate(s) will remain on hold until offer is accepted
                                </p>
                              )}
                            </div>
                            <div className="flex gap-3">
                              <button onClick={() => setSelectedWinners([])} className="btn-secondary text-sm" disabled={selectedWinners.length === 0}>
                                Clear Selection
                              </button>
                              <button
                                onClick={handleFinalize}
                                disabled={selectedWinners.length === 0 || finalizeMutation.isPending}
                                className="btn-primary flex items-center text-sm disabled:opacity-50"
                              >
                                {finalizeMutation.isPending ? (
                                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Processing...</>
                                ) : (
                                  <><TrophyIcon className="h-5 w-5 mr-2" />Extend Offer</>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SCHEDULE BULK INTERVIEWS MODAL ==================== */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-30" onClick={() => setShowScheduleModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Schedule Bulk Interviews</h3>

              <form onSubmit={handleScheduleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Job Posting *</label>
                  <select value={scheduleForm.jobId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, jobId: e.target.value })}
                    className="input-field" required>
                    <option value="">Choose a job posting...</option>
                    {allJobs.map((job) => (
                      <option key={job.id} value={job.id}>{job.title} — {job.department || 'No dept'}</option>
                    ))}
                  </select>
                </div>

                {scheduleForm.jobId && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Shortlisted Candidates ({shortlistedCandidates.length})</h4>
                    {shortlistedCandidates.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {shortlistedCandidates.map((app, idx) => (
                          <div key={app.id} className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="bg-primary-100 text-primary-700 font-bold rounded-full w-6 h-6 flex items-center justify-center text-xs">{idx + 1}</span>
                              <span className="font-medium text-gray-900">{app.first_name} {app.last_name}</span>
                            </div>
                            {app.resume_match_score && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                                {parseFloat(app.resume_match_score).toFixed(0)}% match
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-orange-600">No shortlisted candidates for this job posting</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Interview Type *</label>
                  <select value={scheduleForm.interviewType}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, interviewType: e.target.value })}
                    className="input-field">
                    <option value="video">Video Call</option>
                    <option value="in_person">In-Person</option>
                    <option value="technical">Practical Assessment</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                    <input type="date" value={scheduleForm.scheduledDate}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, scheduledDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]} className="input-field" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Starting Time *</label>
                    <input type="time" value={scheduleForm.startTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                      className="input-field" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Minutes Between Each *</label>
                    <select value={scheduleForm.intervalMinutes}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, intervalMinutes: parseInt(e.target.value) })}
                      className="input-field">
                      <option value={15}>15 minutes</option>
                      <option value={20}>20 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                    </select>
                  </div>
                </div>

                {scheduleForm.jobId && shortlistedCandidates.length > 0 && scheduleForm.startTime && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">Schedule Preview</h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {shortlistedCandidates.map((app, idx) => {
                        const [h, m] = scheduleForm.startTime.split(':').map(Number);
                        const startMin = h * 60 + m + idx * scheduleForm.intervalMinutes;
                        const endMin = startMin + scheduleForm.intervalMinutes;
                        const sH = String(Math.floor(startMin / 60)).padStart(2, '0');
                        const sM = String(startMin % 60).padStart(2, '0');
                        const eH = String(Math.floor(endMin / 60)).padStart(2, '0');
                        const eM = String(endMin % 60).padStart(2, '0');
                        const overflow = endMin >= 24 * 60;
                        return (
                          <div key={app.id} className={`flex justify-between text-sm ${overflow ? 'text-red-600' : 'text-blue-800'}`}>
                            <span>{app.first_name} {app.last_name}</span>
                            <span className="font-mono">{sH}:{sM} — {overflow ? 'OVERFLOW' : `${eH}:${eM}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                    <input type="text" value={scheduleForm.location}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })}
                      placeholder="e.g., Head Office, Room 201" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Meeting Link</label>
                    <input type="url" value={scheduleForm.meetingLink}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, meetingLink: e.target.value })}
                      placeholder="https://meet.google.com/..." className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes for Candidates</label>
                  <textarea value={scheduleForm.notes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                    placeholder="Any special instructions or preparation notes..." rows={3} className="input-field" />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={() => { setShowScheduleModal(false); resetScheduleForm(); }} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={scheduleMutation.isPending || shortlistedCandidates.length === 0}
                    className="btn-primary flex items-center disabled:opacity-50">
                    {scheduleMutation.isPending ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Scheduling...</>
                    ) : (
                      <><CalendarIcon className="h-5 w-5 mr-2" />Schedule {shortlistedCandidates.length} Interview{shortlistedCandidates.length !== 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT INTERVIEW MODAL ==================== */}
      {selectedInterview && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-30" onClick={() => setSelectedInterview(null)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Edit Interview</h3>

              <form onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({
                  id: selectedInterview.id,
                  data: {
                    scheduled_date: selectedInterview.scheduled_date?.split('T')[0],
                    start_time: selectedInterview.start_time,
                    end_time: selectedInterview.end_time,
                    interview_type: selectedInterview.interview_type,
                    location: selectedInterview.location,
                    meeting_link: selectedInterview.meeting_link,
                    status: selectedInterview.status,
                    notes: selectedInterview.notes,
                  }
                });
              }} className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Candidate</p>
                  <p className="font-medium text-lg">
                    {selectedInterview.candidate_name || `${selectedInterview.candidate_first_name || ''} ${selectedInterview.candidate_last_name || ''}`.trim()}
                  </p>
                  <p className="text-sm text-gray-600">{selectedInterview.job_title}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                    <input type="date" value={selectedInterview.scheduled_date?.split('T')[0] || ''}
                      onChange={(e) => setSelectedInterview({ ...selectedInterview, scheduled_date: e.target.value })}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Interview Type</label>
                    <select value={selectedInterview.interview_type || 'video'}
                      onChange={(e) => setSelectedInterview({ ...selectedInterview, interview_type: e.target.value })}
                      className="input-field">
                      <option value="video">Video Call</option>
                      <option value="in_person">In-Person</option>
                      <option value="technical">Practical Assessment</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                    <input type="time" value={selectedInterview.start_time?.slice(0, 5) || ''}
                      onChange={(e) => setSelectedInterview({ ...selectedInterview, start_time: e.target.value })}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                    <input type="time" value={selectedInterview.end_time?.slice(0, 5) || ''}
                      onChange={(e) => setSelectedInterview({ ...selectedInterview, end_time: e.target.value })}
                      className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select value={selectedInterview.status || 'scheduled'}
                    onChange={(e) => setSelectedInterview({ ...selectedInterview, status: e.target.value })}
                    className="input-field">
                    <option value="scheduled">Scheduled</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No Show</option>
                    <option value="rescheduled">Rescheduled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                  <input type="text" value={selectedInterview.location || ''}
                    onChange={(e) => setSelectedInterview({ ...selectedInterview, location: e.target.value })}
                    placeholder="Office address or room number" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Meeting Link</label>
                  <input type="url" value={selectedInterview.meeting_link || ''}
                    onChange={(e) => setSelectedInterview({ ...selectedInterview, meeting_link: e.target.value })}
                    placeholder="https://meet.google.com/..." className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea value={selectedInterview.notes || ''}
                    onChange={(e) => setSelectedInterview({ ...selectedInterview, notes: e.target.value })}
                    rows={3} className="input-field" placeholder="Additional notes..." />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={() => setSelectedInterview(null)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending} className="btn-primary">
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EVALUATIONS HISTORY MODAL ==================== */}
      {showEvaluationsHistory && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-40" onClick={() => setShowEvaluationsHistory(false)} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-gray-700 to-gray-900 px-6 py-4 rounded-t-xl flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <ArchiveBoxIcon className="h-6 w-6 mr-2" />
                    Evaluation History
                  </h3>
                  <p className="text-gray-300 text-sm mt-1">Past hiring evaluations and decisions</p>
                </div>
                <button onClick={() => setShowEvaluationsHistory(false)} className="text-white hover:text-gray-300">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6">
                {pastEvaluations.length === 0 ? (
                  <div className="text-center py-12">
                    <ArchiveBoxIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 font-medium">No completed evaluations yet</p>
                    <p className="text-sm text-gray-400 mt-1">Evaluations will appear here once you extend offers to candidates.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastEvaluations.map((evaluation) => (
                      <div
                        key={evaluation.job_id}
                        className="border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer hover:border-primary-300"
                        onClick={() => {
                          setHistoryDetailModal({ show: true, jobId: evaluation.job_id });
                          setShowEvaluationsHistory(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 text-lg">{evaluation.job_title}</h4>
                            <p className="text-sm text-gray-500">{evaluation.department}</p>
                            <div className="flex flex-wrap gap-3 mt-2">
                              <span className="inline-flex items-center text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                <CheckCircleIcon className="h-3.5 w-3.5 mr-1" />
                                {evaluation.offers_extended} offer{evaluation.offers_extended !== 1 ? 's' : ''} extended
                              </span>
                              <span className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                <UserGroupIcon className="h-3.5 w-3.5 mr-1" />
                                {evaluation.total_interviewed} interviewed
                              </span>
                              {evaluation.rejected_count > 0 && (
                                <span className="inline-flex items-center text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full">
                                  {evaluation.rejected_count} rejected
                                </span>
                              )}
                            </div>
                            {evaluation.evaluation_date && (
                              <p className="text-xs text-gray-400 mt-2">
                                Evaluated on {new Date(evaluation.evaluation_date).toLocaleDateString('en-US', {
                                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0 ml-4">
                            <EyeIcon className="h-5 w-5 text-gray-400" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EVALUATION HISTORY DETAIL MODAL ==================== */}
      {historyDetailModal.show && historyDetailModal.jobId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-40" onClick={() => setHistoryDetailModal({ show: false, jobId: null })} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-gray-700 to-gray-900 px-6 py-4 rounded-t-xl flex justify-between items-center z-10">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <ArchiveBoxIcon className="h-6 w-6 mr-2" />
                    Evaluation Details
                  </h3>
                  {evaluationJob && (
                    <p className="text-gray-300 text-sm">{evaluationJob.title} — {evaluationJob.department}</p>
                  )}
                </div>
                <button onClick={() => setHistoryDetailModal({ show: false, jobId: null })} className="text-white hover:text-gray-300">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6">
                {evalLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                  </div>
                ) : evaluationCandidates.length === 0 ? (
                  <div className="text-center py-12">
                    <UserGroupIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">No candidate data found for this evaluation.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {evaluationCandidates.map((candidate, idx) => {
                      const hasFb = !!candidate.overall_rating;
                      return (
                        <div
                          key={candidate.application_id}
                          className={`border rounded-xl p-5 ${
                            candidate.application_status === 'rejected'
                              ? 'border-red-200 bg-red-50/30'
                              : ['offer_extended', 'offer_accepted', 'hired'].includes(candidate.application_status)
                                ? 'border-green-200 bg-green-50/30'
                                : 'border-gray-200'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center gap-4">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                              idx === 0 && hasFb ? 'bg-amber-400 text-white' :
                              idx === 1 && hasFb ? 'bg-gray-300 text-white' :
                              idx === 2 && hasFb ? 'bg-amber-600 text-white' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-lg font-semibold text-gray-900">
                                  {candidate.first_name} {candidate.last_name}
                                </h4>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  candidate.application_status === 'offer_extended' ? 'bg-green-100 text-green-800' :
                                  candidate.application_status === 'hired' ? 'bg-emerald-100 text-emerald-800' :
                                  candidate.application_status === 'offer_accepted' ? 'bg-emerald-100 text-emerald-800' :
                                  candidate.application_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {candidate.application_status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-4 items-center">
                                {candidate.match_score && (
                                  <div className="text-center">
                                    <p className="text-xs text-gray-500">AI Match</p>
                                    <p className="text-lg font-bold text-primary-600">{parseFloat(candidate.match_score).toFixed(0)}%</p>
                                  </div>
                                )}
                                {hasFb && (
                                  <>
                                    <div className="h-8 w-px bg-gray-200" />
                                    <div className="text-center">
                                      <p className="text-xs text-gray-500">Overall</p>
                                      <div className="flex items-center gap-1">
                                        <MiniStars rating={candidate.overall_rating} />
                                        <span className="font-bold text-gray-900">{candidate.overall_rating}/5</span>
                                      </div>
                                    </div>
                                    <div className="h-8 w-px bg-gray-200" />
                                    <div className="text-center">
                                      <p className="text-xs text-gray-500">Avg Rating</p>
                                      <p className="text-lg font-bold text-amber-600">{candidate.average_rating}/5</p>
                                    </div>
                                    <div className="h-8 w-px bg-gray-200" />
                                    <div className="text-center">
                                      <p className="text-xs text-gray-500">Recommendation</p>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getRecommendationBadge(candidate.recommendation)}`}>
                                        {formatRecommendation(candidate.recommendation)}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>

                              {hasFb && (
                                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                                  {[
                                    { label: 'Technical', val: candidate.technical_skills_rating },
                                    { label: 'Communication', val: candidate.communication_rating },
                                    { label: 'Problem Solving', val: candidate.problem_solving_rating },
                                    { label: 'Cultural Fit', val: candidate.cultural_fit_rating },
                                    { label: 'Leadership', val: candidate.leadership_rating },
                                  ].map(r => r.val ? (
                                    <span key={r.label} className="bg-gray-100 px-2 py-1 rounded text-gray-700">
                                      {r.label}: <strong>{r.val}/5</strong>
                                    </span>
                                  ) : null)}
                                </div>
                              )}

                              {hasFb && (candidate.strengths || candidate.weaknesses) && (
                                <div className="mt-2 flex gap-4 text-xs">
                                  {candidate.strengths && (
                                    <p className="text-green-700"><strong>Strengths:</strong> {candidate.strengths.substring(0, 150)}{candidate.strengths.length > 150 ? '...' : ''}</p>
                                  )}
                                  {candidate.weaknesses && (
                                    <p className="text-red-700"><strong>Weaknesses:</strong> {candidate.weaknesses.substring(0, 150)}{candidate.weaknesses.length > 150 ? '...' : ''}</p>
                                  )}
                                </div>
                              )}

                              {candidate.feedback_submitted_at && (
                                <p className="text-xs text-gray-400 mt-2">
                                  Feedback submitted: {new Date(candidate.feedback_submitted_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t px-6 py-4 flex justify-between">
                <button
                  onClick={() => {
                    setHistoryDetailModal({ show: false, jobId: null });
                    setShowEvaluationsHistory(true);
                  }}
                  className="btn-secondary text-sm"
                >
                  Back to History
                </button>
                <button onClick={() => setHistoryDetailModal({ show: false, jobId: null })} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== OFFER CONFIRMATION MODAL ==================== */}
      {showOfferConfirmModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setShowOfferConfirmModal(false)} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <TrophyIcon className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Offer Extension</h3>
                <p className="text-gray-500 mt-2">Please review the selected candidate(s) before extending the offer.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Selected for Offer:</h4>
                <div className="space-y-2">
                  {offerConfirmData.winners.map((candidate) => (
                    <div key={candidate.application_id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                      <div className="flex items-center gap-3">
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                        <span className="font-medium text-gray-900">{candidate.first_name} {candidate.last_name}</span>
                      </div>
                      {candidate.match_score && (
                        <span className="text-sm text-primary-600 font-medium">{parseFloat(candidate.match_score).toFixed(0)}% match</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {offerConfirmData.rejectCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-800">
                    <strong>Note:</strong> {offerConfirmData.rejectCount} other interviewed candidate(s) will be automatically rejected.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                <p className="text-sm text-blue-800">
                  <EnvelopeIcon className="h-4 w-4 inline mr-1" />
                  Email notifications will be sent to all candidates automatically.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowOfferConfirmModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAndExtendOffer}
                  disabled={finalizeMutation.isPending}
                  className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {finalizeMutation.isPending ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Processing...</>
                  ) : (
                    <><CheckCircleIcon className="h-5 w-5" />Confirm &amp; Extend Offer</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewList;
