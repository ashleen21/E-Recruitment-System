import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CalendarIcon,
  ClockIcon,
  VideoCameraIcon,
  MapPinIcon,
  CheckCircleIcon,
  BuildingOfficeIcon,
  XMarkIcon,
  BriefcaseIcon,
  InformationCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { interviewsAPI } from '../../services/api';

const MyInterviews = () => {
  const queryClient = useQueryClient();
  const [detailsModal, setDetailsModal] = useState({ show: false, interview: null });

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['my-interviews'],
    queryFn: async () => {
      const response = await interviewsAPI.getMyInterviews();
      return response.data || response;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id) => interviewsAPI.confirm(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-interviews']);
      toast.success('Interview confirmed! The HR team has been notified.');
      setDetailsModal({ show: false, interview: null });
    },
    onError: (error) => {
      console.error('Confirm error:', error);
      toast.error(error.response?.data?.error || 'Failed to confirm interview');
    },
  });

  const getInterviewTypeIcon = (type) => {
    switch (type) {
      case 'video':
        return <VideoCameraIcon className="h-5 w-5 text-purple-500" />;
      case 'in_person':
        return <MapPinIcon className="h-5 w-5 text-green-500" />;
      case 'technical':
        return <BuildingOfficeIcon className="h-5 w-5 text-orange-500" />;
      case 'panel':
        return <BriefcaseIcon className="h-5 w-5 text-blue-500" />;
      case 'final':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      default:
        return <CalendarIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      scheduled: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      rescheduled: 'bg-yellow-100 text-yellow-800',
    };
    return styles[status] || styles.scheduled;
  };

  const formatInterviewType = (type) => {
    const types = {
      video: 'Video Call',
      in_person: 'In-Person',
      technical: 'Practical Assessment',
    };
    return types[type] || type || 'Interview';
  };

  // Helper to format date safely
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Date TBD';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Date TBD';
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'Date TBD';
    }
  };

  // Helper to format time safely
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      // Handle time strings like "14:00:00" or "14:00"
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        const hours = parseInt(parts[0], 10);
        const mins = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${mins} ${ampm}`;
      }
      return timeStr;
    } catch {
      return timeStr;
    }
  };

  // Helper to get job title from interview
  const getJobTitle = (interview) => {
    return interview.job_title || interview.jobTitle || 'Interview';
  };

  // Check if date is today
  const isToday = (dateStr) => {
    if (!dateStr) return false;
    try {
      const today = new Date();
      const interviewDate = new Date(dateStr);
      return interviewDate.toDateString() === today.toDateString();
    } catch {
      return false;
    }
  };

  // Check if date is tomorrow
  const isTomorrow = (dateStr) => {
    if (!dateStr) return false;
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const interviewDate = new Date(dateStr);
      return interviewDate.toDateString() === tomorrow.toDateString();
    } catch {
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const interviewList = Array.isArray(interviews) ? interviews : [];

  const upcomingInterviews = interviewList.filter((i) => {
    if (!['scheduled', 'confirmed', 'rescheduled'].includes(i.status)) return false;
    if (!i.scheduled_date) return true; // Include if no date (will show as TBD)
    try {
      return new Date(i.scheduled_date) >= new Date(new Date().toDateString());
    } catch {
      return true;
    }
  }).sort((a, b) => {
    if (!a.scheduled_date) return 1;
    if (!b.scheduled_date) return -1;
    return new Date(a.scheduled_date) - new Date(b.scheduled_date);
  });

  const pastInterviews = interviewList.filter((i) => {
    if (i.status === 'completed' || i.status === 'cancelled') return true;
    if (!i.scheduled_date) return false;
    try {
      return new Date(i.scheduled_date) < new Date(new Date().toDateString());
    } catch {
      return false;
    }
  }).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));

  const openDetailsModal = (interview) => {
    setDetailsModal({ show: true, interview });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Interviews</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-2xl font-bold text-blue-600">{upcomingInterviews.length}</p>
          <p className="text-sm text-gray-600">Upcoming</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-orange-600">
            {upcomingInterviews.filter((i) => isToday(i.scheduled_date)).length}
          </p>
          <p className="text-sm text-gray-600">Today</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-purple-600">
            {upcomingInterviews.filter((i) => isTomorrow(i.scheduled_date)).length}
          </p>
          <p className="text-sm text-gray-600">Tomorrow</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{pastInterviews.length}</p>
          <p className="text-sm text-gray-600">Completed</p>
        </div>
      </div>

      {/* Upcoming Interviews */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Interviews</h2>
        {upcomingInterviews.length > 0 ? (
          <div className="space-y-4">
            {upcomingInterviews.map((interview) => {
              const today = isToday(interview.scheduled_date);
              const tomorrow = isTomorrow(interview.scheduled_date);
              const interviewType = interview.interview_type || interview.type;

              return (
                <div
                  key={interview.id}
                  className={`card ${today ? 'ring-2 ring-orange-500' : ''}`}
                >
                  {today && (
                    <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-t text-sm font-medium -mx-4 -mt-4 mb-4 text-center">
                      Today!
                    </div>
                  )}
                  {tomorrow && !today && (
                    <div className="bg-purple-100 text-purple-800 px-3 py-1 rounded-t text-sm font-medium -mx-4 -mt-4 mb-4 text-center">
                      Tomorrow
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getInterviewTypeIcon(interviewType)}
                        <h3 className="font-semibold text-gray-900">{getJobTitle(interview)}</h3>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {formatInterviewType(interviewType)}
                        </span>
                      </div>

                      {interview.department && (
                        <p className="text-sm text-gray-600 mb-2">{interview.department}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="h-4 w-4" />
                          <span>{formatDate(interview.scheduled_date)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ClockIcon className="h-4 w-4" />
                          <span>
                            {formatTime(interview.start_time) || 'Time TBD'}
                            {interview.end_time && ` - ${formatTime(interview.end_time)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadge(
                          interview.status
                        )}`}
                      >
                        {interview.status}
                      </span>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openDetailsModal(interview)}
                          className="btn-secondary text-sm flex items-center"
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          View Details
                        </button>

                        {interview.status === 'scheduled' && (
                          <button
                            onClick={() => confirmMutation.mutate(interview.id)}
                            disabled={confirmMutation.isPending}
                            className="btn-primary text-sm flex items-center"
                          >
                            <CheckCircleIcon className="h-4 w-4 mr-1" />
                            {confirmMutation.isPending ? 'Confirming...' : 'Confirm'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick info */}
                  {(interview.meeting_link || interview.location) && (
                    <div className="mt-4 pt-4 border-t">
                      {interviewType === 'video' && interview.meeting_link && (
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <p className="text-sm font-medium text-purple-800">Video Interview</p>
                          <a
                            href={interview.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 text-sm mt-1 inline-flex items-center"
                          >
                            <VideoCameraIcon className="h-4 w-4 mr-1" />
                            Join Meeting Link →
                          </a>
                        </div>
                      )}

                      {interviewType === 'in_person' && interview.location && (
                        <div className="bg-green-50 p-3 rounded-lg">
                          <p className="text-sm font-medium text-green-800">In-Person Interview</p>
                          <p className="text-green-700 text-sm">
                            <MapPinIcon className="h-4 w-4 inline mr-1" />
                            {interview.location}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card text-center py-8">
            <CalendarIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500">No upcoming interviews</p>
            <p className="text-sm text-gray-400 mt-1">Keep applying to get interview invitations</p>
          </div>
        )}
      </div>

      {/* Past Interviews */}
      {pastInterviews.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Interviews</h2>
          <div className="space-y-3">
            {pastInterviews.map((interview) => (
              <div key={interview.id} className="card opacity-75">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{getJobTitle(interview)}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(interview.scheduled_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadge(
                        interview.status
                      )}`}
                    >
                      {interview.status}
                    </span>
                    <button
                      onClick={() => openDetailsModal(interview)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interview Details Modal */}
      {detailsModal.show && detailsModal.interview && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-black bg-opacity-50"
              onClick={() => setDetailsModal({ show: false, interview: null })}
            ></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  {getInterviewTypeIcon(detailsModal.interview.interview_type || detailsModal.interview.type)}
                  <h3 className="text-xl font-semibold text-gray-900">Interview Details</h3>
                </div>
                <button
                  onClick={() => setDetailsModal({ show: false, interview: null })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Job Info */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {getJobTitle(detailsModal.interview)}
                  </h4>
                  {detailsModal.interview.department && (
                    <p className="text-sm text-gray-600">Department: {detailsModal.interview.department}</p>
                  )}
                  {detailsModal.interview.job_location && (
                    <p className="text-sm text-gray-600">Location: {detailsModal.interview.job_location}</p>
                  )}
                </div>

                {/* Interview Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Interview Type</label>
                    <p className="mt-1 text-gray-900">
                      {formatInterviewType(detailsModal.interview.interview_type || detailsModal.interview.type)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Status</label>
                    <span
                      className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadge(
                        detailsModal.interview.status
                      )}`}
                    >
                      {detailsModal.interview.status}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Date</label>
                    <p className="mt-1 text-gray-900">{formatDate(detailsModal.interview.scheduled_date)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Time</label>
                    <p className="mt-1 text-gray-900">
                      {formatTime(detailsModal.interview.start_time) || 'TBD'}
                      {detailsModal.interview.end_time && ` - ${formatTime(detailsModal.interview.end_time)}`}
                    </p>
                  </div>
                </div>

                {/* Meeting Link */}
                {detailsModal.interview.meeting_link && (
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-purple-800 mb-2">
                      <VideoCameraIcon className="h-4 w-4 inline mr-1" />
                      Video Meeting Link
                    </label>
                    <a
                      href={detailsModal.interview.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 break-all"
                    >
                      {detailsModal.interview.meeting_link}
                    </a>
                  </div>
                )}

                {/* Location */}
                {detailsModal.interview.location && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-green-800 mb-2">
                      <MapPinIcon className="h-4 w-4 inline mr-1" />
                      Location
                    </label>
                    <p className="text-green-700">{detailsModal.interview.location}</p>
                  </div>
                )}

                {/* Notes */}
                {detailsModal.interview.notes && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">
                      <InformationCircleIcon className="h-4 w-4 inline mr-1" />
                      Notes & Instructions
                    </label>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      {detailsModal.interview.notes}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setDetailsModal({ show: false, interview: null })}
                    className="btn-secondary"
                  >
                    Close
                  </button>

                  {detailsModal.interview.meeting_link && (
                    <a
                      href={detailsModal.interview.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary flex items-center"
                    >
                      <VideoCameraIcon className="h-4 w-4 mr-1" />
                      Join Meeting
                    </a>
                  )}

                  {detailsModal.interview.status === 'scheduled' && (
                    <button
                      onClick={() => confirmMutation.mutate(detailsModal.interview.id)}
                      disabled={confirmMutation.isPending}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center"
                    >
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      {confirmMutation.isPending ? 'Confirming...' : 'Confirm Attendance'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyInterviews;
