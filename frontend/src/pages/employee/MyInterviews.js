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
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI } from '../../services/api';

const MyInterviews = () => {
  const queryClient = useQueryClient();
  const [detailsModal, setDetailsModal] = useState({ show: false, interview: null });

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['employee-interviews'],
    queryFn: async () => {
      const response = await employeesAPI.getMyInterviews();
      return response.data || response;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id) => employeesAPI.confirmInterview(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-interviews']);
      toast.success('Interview confirmed! HR has been notified.');
      setDetailsModal({ show: false, interview: null });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to confirm interview');
    },
  });

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

  const formatTime = (timeStr) => {
    if (!timeStr) return 'Time TBD';
    try {
      if (timeStr.includes(':')) {
        const [hours, minutes] = timeStr.split(':');
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
      return timeStr;
    } catch {
      return 'Time TBD';
    }
  };

  const getInterviewTypeIcon = (type) => {
    switch (type) {
      case 'video':
        return <VideoCameraIcon className="h-5 w-5 text-purple-500" />;
      case 'in_person':
        return <MapPinIcon className="h-5 w-5 text-green-500" />;
      case 'technical':
        return <BuildingOfficeIcon className="h-5 w-5 text-orange-500" />;
      case 'panel':
        return <UserGroupIcon className="h-5 w-5 text-blue-500" />;
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
      phone: 'Phone Screening',
      hr: 'HR Interview',
    };
    return types[type] || type || 'Interview';
  };

  const isUpcoming = (dateStr, timeStr) => {
    if (!dateStr) return false;
    try {
      const interviewDate = new Date(dateStr);
      if (timeStr && timeStr.includes(':')) {
        const [hours, minutes] = timeStr.split(':');
        interviewDate.setHours(parseInt(hours), parseInt(minutes));
      }
      return interviewDate > new Date();
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

  const interviewsList = interviews || [];
  const upcomingInterviews = interviewsList.filter(i => isUpcoming(i.scheduled_date, i.start_time) && i.status !== 'cancelled');
  const pastInterviews = interviewsList.filter(i => !isUpcoming(i.scheduled_date, i.start_time) || i.status === 'cancelled');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Interviews</h1>
      </div>

      {/* Upcoming Interviews */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Interviews</h2>
        {upcomingInterviews.length > 0 ? (
          <div className="space-y-4">
            {upcomingInterviews.map((interview) => (
              <div key={interview.id} className="card border-l-4 border-l-primary-500 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary-50 rounded-lg">
                      {getInterviewTypeIcon(interview.interview_type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{interview.job_title}</h3>
                      <p className="text-sm text-primary-600">{formatInterviewType(interview.interview_type)}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-4 w-4" />
                          {formatDate(interview.scheduled_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-4 w-4" />
                          {formatTime(interview.start_time)} - {formatTime(interview.end_time)}
                        </span>
                      </div>
                      {interview.location && (
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                          <MapPinIcon className="h-4 w-4" />
                          {interview.location}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusBadge(interview.status)}`}>
                      {interview.status}
                    </span>
                    <button
                      onClick={() => setDetailsModal({ show: true, interview })}
                      className="btn-secondary text-sm"
                    >
                      <EyeIcon className="h-4 w-4 mr-1" />
                      Details
                    </button>
                    {interview.status === 'scheduled' && (
                      <button
                        onClick={() => confirmMutation.mutate(interview.id)}
                        disabled={confirmMutation.isPending}
                        className="btn-primary text-sm"
                      >
                        <CheckCircleIcon className="h-4 w-4 mr-1" />
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center py-8 text-gray-500">
            <CalendarIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p>No upcoming interviews</p>
          </div>
        )}
      </div>

      {/* Past Interviews */}
      {pastInterviews.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Interviews</h2>
          <div className="space-y-4">
            {pastInterviews.map((interview) => (
              <div key={interview.id} className="card bg-gray-50 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-gray-100 rounded-lg">
                      {getInterviewTypeIcon(interview.interview_type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-700">{interview.job_title}</h3>
                      <p className="text-sm text-gray-500">{formatInterviewType(interview.interview_type)}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-4 w-4" />
                          {formatDate(interview.scheduled_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-4 w-4" />
                          {formatTime(interview.start_time)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusBadge(interview.status)}`}>
                      {interview.status}
                    </span>
                    <button
                      onClick={() => setDetailsModal({ show: true, interview })}
                      className="btn-secondary text-sm"
                    >
                      <EyeIcon className="h-4 w-4 mr-1" />
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {interviewsList.length === 0 && (
        <div className="card text-center py-12">
          <CalendarIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">No interviews scheduled</p>
          <p className="text-sm text-gray-400 mt-1">
            Apply for positions and you'll see interviews here when scheduled
          </p>
        </div>
      )}

      {/* Details Modal */}
      {detailsModal.show && detailsModal.interview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Interview Details</h2>
              <button
                onClick={() => setDetailsModal({ show: false, interview: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Interview Header */}
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary-100 rounded-lg">
                  {getInterviewTypeIcon(detailsModal.interview.interview_type)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{detailsModal.interview.job_title}</h3>
                  <p className="text-primary-600">{formatInterviewType(detailsModal.interview.interview_type)}</p>
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusBadge(detailsModal.interview.status)}`}>
                    {detailsModal.interview.status}
                  </span>
                </div>
              </div>

              {/* Date & Time */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium">{formatDate(detailsModal.interview.scheduled_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ClockIcon className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-medium">
                      {formatTime(detailsModal.interview.start_time)} - {formatTime(detailsModal.interview.end_time)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Location */}
              {detailsModal.interview.location && (
                <div className="flex items-start gap-3">
                  <MapPinIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="font-medium">{detailsModal.interview.location}</p>
                  </div>
                </div>
              )}

              {/* Meeting Link */}
              {detailsModal.interview.meeting_link && (
                <div className="flex items-start gap-3">
                  <VideoCameraIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Meeting Link</p>
                    <a
                      href={detailsModal.interview.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline break-all"
                    >
                      {detailsModal.interview.meeting_link}
                    </a>
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailsModal.interview.notes && (
                <div className="flex items-start gap-3">
                  <InformationCircleIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Notes</p>
                    <p className="text-gray-700 whitespace-pre-line">{detailsModal.interview.notes}</p>
                  </div>
                </div>
              )}

              {/* Confirmation Status */}
              {detailsModal.interview.confirmed_at && (
                <div className="bg-green-50 p-3 rounded-lg flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm text-green-800">
                    Confirmed on {formatDate(detailsModal.interview.confirmed_at)}
                  </span>
                </div>
              )}
            </div>

            <div className="border-t px-6 py-4 flex gap-3">
              {detailsModal.interview.status === 'scheduled' && isUpcoming(detailsModal.interview.scheduled_date, detailsModal.interview.start_time) && (
                <button
                  onClick={() => confirmMutation.mutate(detailsModal.interview.id)}
                  disabled={confirmMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {confirmMutation.isPending ? 'Confirming...' : 'Confirm Attendance'}
                </button>
              )}
              <button
                onClick={() => setDetailsModal({ show: false, interview: null })}
                className="btn-secondary flex-1"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyInterviews;
