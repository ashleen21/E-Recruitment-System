import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  DocumentTextIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  BriefcaseIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  BuildingOfficeIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  StarIcon,
  GiftIcon,
} from '@heroicons/react/24/outline';
import { applicationsAPI } from '../../services/api';

const MyApplications = () => {
  const [withdrawModal, setWithdrawModal] = useState({ show: false, applicationId: null, jobTitle: '' });
  const [detailsModal, setDetailsModal] = useState({ show: false, application: null });
  const [offerModal, setOfferModal] = useState({ show: false, type: null, applicationId: null, jobTitle: '' });
  const [withdrawReason, setWithdrawReason] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const queryClient = useQueryClient();

  const { data: applications, isLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const response = await applicationsAPI.getMyApplications();
      return response.data;
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ id, reason }) => applicationsAPI.withdraw(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-applications']);
      setWithdrawModal({ show: false, applicationId: null, jobTitle: '' });
      setWithdrawReason('');
      toast.success('Application withdrawn successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to withdraw application');
    },
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (id) => applicationsAPI.acceptOffer(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['my-applications']);
      setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' });
      toast.success(response.data?.message || 'Offer accepted! Congratulations!');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to accept offer');
    },
  });

  const declineOfferMutation = useMutation({
    mutationFn: ({ id, reason }) => applicationsAPI.declineOffer(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-applications']);
      setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' });
      setDeclineReason('');
      toast.success('Offer declined');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to decline offer');
    },
  });

  const handleWithdraw = () => {
    if (withdrawModal.applicationId) {
      withdrawMutation.mutate({ id: withdrawModal.applicationId, reason: withdrawReason });
    }
  };

  const handleAcceptOffer = () => {
    if (offerModal.applicationId) {
      acceptOfferMutation.mutate(offerModal.applicationId);
    }
  };

  const handleDeclineOffer = () => {
    if (offerModal.applicationId) {
      declineOfferMutation.mutate({ id: offerModal.applicationId, reason: declineReason });
    }
  };

  const openOfferModal = (app, type) => {
    setOfferModal({
      show: true,
      type,
      applicationId: app.id,
      jobTitle: app.job_title || app.jobTitle,
    });
    setDeclineReason('');
  };

  const openWithdrawModal = (app) => {
    setWithdrawModal({
      show: true,
      applicationId: app.id,
      jobTitle: app.job_title || app.jobTitle,
    });
  };

  const openDetailsModal = (app) => {
    setDetailsModal({ show: true, application: app });
  };

  // Helper to format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      submitted: { bg: 'bg-blue-100 text-blue-800', icon: ClockIcon },
      pending: { bg: 'bg-gray-100 text-gray-800', icon: ClockIcon },
      under_review: { bg: 'bg-blue-100 text-blue-800', icon: DocumentTextIcon },
      shortlisted: { bg: 'bg-yellow-100 text-yellow-800', icon: CheckCircleIcon },
      interview_scheduled: { bg: 'bg-purple-100 text-purple-800', icon: CalendarIcon },
      offer_extended: { bg: 'bg-emerald-100 text-emerald-800', icon: GiftIcon },
      offer_accepted: { bg: 'bg-green-200 text-green-900', icon: CheckCircleIcon },
      offer_declined: { bg: 'bg-orange-100 text-orange-800', icon: XCircleIcon },
      rejected: { bg: 'bg-red-100 text-red-800', icon: XCircleIcon },
      hired: { bg: 'bg-green-200 text-green-900', icon: CheckCircleIcon },
      withdrawn: { bg: 'bg-gray-200 text-gray-600', icon: XCircleIcon },
    };
    return styles[status] || styles.pending;
  };

  const getStatusDescription = (status) => {
    const descriptions = {
      submitted: 'Your application has been submitted successfully and is awaiting review.',
      pending: 'Your application has been received and is awaiting review.',
      under_review: 'Our team is currently reviewing your application.',
      shortlisted: 'Congratulations! You have been shortlisted for this position.',
      interview_scheduled: 'An interview has been scheduled. Check your email for details.',
      offer_extended: 'Great news! An offer has been extended to you. Please accept or decline the offer.',
      offer_accepted: 'You have accepted the offer. Congratulations!',
      offer_declined: 'You have declined the offer for this position.',
      rejected: 'Unfortunately, we have decided to move forward with other candidates.',
      hired: 'Congratulations! You have been hired!',
      withdrawn: 'You have withdrawn this application.',
    };
    return descriptions[status] || '';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const applicationsList = applications || [];

  // Separate offers for prominent display
  const offers = applicationsList.filter(a => a.status === 'offer_extended');

  // Group applications by status
  const groupedApplications = {
    active: applicationsList.filter(a => ['submitted', 'pending', 'under_review', 'shortlisted', 'interview_scheduled'].includes(a.status)),
    completed: applicationsList.filter(a => ['offer_accepted', 'offer_declined', 'hired', 'rejected', 'withdrawn'].includes(a.status)),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-900">{applicationsList.length}</p>
          <p className="text-sm text-gray-600">Total Applications</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-yellow-600">
            {applicationsList.filter(a => a.status === 'shortlisted').length}
          </p>
          <p className="text-sm text-gray-600">Shortlisted</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-purple-600">
            {applicationsList.filter(a => a.status === 'interview_scheduled').length}
          </p>
          <p className="text-sm text-gray-600">Interviews</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">
            {applicationsList.filter(a => ['offer_extended', 'hired'].includes(a.status)).length}
          </p>
          <p className="text-sm text-gray-600">Offers</p>
        </div>
      </div>

      {/* Pending Offers - Prominent Section */}
      {offers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <GiftIcon className="h-5 w-5 text-emerald-600" />
            Pending Offers ({offers.length})
          </h2>
          <div className="space-y-4">
            {offers.map((app) => (
              <div key={app.id} className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                      <StarIcon className="h-6 w-6 text-emerald-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                        Offer Extended
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{app.job_title || app.jobTitle}</h3>
                    <p className="text-emerald-700 font-medium">{app.department || 'Department'}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Applied on {formatDate(app.submitted_at || app.created_at)}
                    </p>
                    <p className="text-sm text-emerald-700 mt-2 bg-emerald-50 p-2 rounded">
                      Congratulations! You have received an offer for this position. Please review and respond.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 md:flex-col">
                    <button
                      onClick={() => openOfferModal(app, 'accept')}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm"
                    >
                      <HandThumbUpIcon className="h-5 w-5" />
                      Accept Offer
                    </button>
                    <button
                      onClick={() => openOfferModal(app, 'decline')}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium"
                    >
                      <HandThumbDownIcon className="h-5 w-5" />
                      Decline Offer
                    </button>
                    <button
                      onClick={() => openDetailsModal(app)}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                    >
                      <EyeIcon className="h-4 w-4" />
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Applications */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Applications ({groupedApplications.active.length})</h2>
        {groupedApplications.active.length > 0 ? (
          <div className="space-y-4">
            {groupedApplications.active.map((app) => {
              const statusStyle = getStatusBadge(app.status);
              const StatusIcon = statusStyle.icon;
              return (
                <div key={app.id} className="card">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{app.job_title || app.jobTitle}</h3>
                      <p className="text-primary-600">{app.department || 'Department'}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Applied on {formatDate(app.submitted_at || app.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bg}`}>
                        <StatusIcon className="h-4 w-4 mr-1" />
                        {app.status?.replace('_', ' ')}
                      </span>
                      <button
                        onClick={() => openDetailsModal(app)}
                        className="text-sm text-primary-600 hover:text-primary-700 transition-colors flex items-center"
                        title="View details"
                      >
                        <EyeIcon className="h-4 w-4 mr-1" />
                        View
                      </button>
                      <button
                        onClick={() => openWithdrawModal(app)}
                        className="text-sm text-gray-500 hover:text-red-600 transition-colors"
                        title="Withdraw application"
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                  
                  {/* Status Timeline */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600">{getStatusDescription(app.status)}</p>
                    {app.status === 'interview_scheduled' && app.interview && (
                      <div className="mt-3 p-3 bg-purple-50 rounded-lg">
                        <p className="font-medium text-purple-800">Interview Scheduled</p>
                        <p className="text-sm text-purple-700">
                          {new Date(app.interview.date).toLocaleDateString()} at {app.interview.time}
                        </p>
                        {app.interview.meetingLink && (
                          <a
                            href={app.interview.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-600 hover:text-purple-800 mt-1 inline-block"
                          >
                            Join Meeting →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card text-center py-8">
            <DocumentTextIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500">No active applications</p>
            <Link to="/candidate/jobs" className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block">
              Browse jobs →
            </Link>
          </div>
        )}
      </div>

      {/* Completed Applications */}
      {groupedApplications.completed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Applications ({groupedApplications.completed.length})</h2>
          <div className="space-y-4">
            {groupedApplications.completed.map((app) => {
              const statusStyle = getStatusBadge(app.status);
              const StatusIcon = statusStyle.icon;
              return (
                <div key={app.id} className="card opacity-75">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{app.job_title || app.jobTitle}</h3>
                      <p className="text-gray-600">{app.department || 'Department'}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Applied on {formatDate(app.submitted_at || app.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bg}`}>
                        <StatusIcon className="h-4 w-4 mr-1" />
                        {app.status?.replace('_', ' ')}
                      </span>
                      <button
                        onClick={() => openDetailsModal(app)}
                        className="text-gray-500 hover:text-gray-700"
                        title="View details"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Offer Accept/Decline Modal */}
      {offerModal.show && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              {offerModal.type === 'accept' ? (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Accept Offer</h3>
                    </div>
                    <button 
                      onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })} 
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                  
                  <div className="bg-emerald-50 p-4 rounded-lg mb-4">
                    <p className="text-emerald-800 font-medium">
                      You are about to accept the offer for:
                    </p>
                    <p className="text-emerald-900 font-bold text-lg mt-1">{offerModal.jobTitle}</p>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAcceptOffer}
                      disabled={acceptOfferMutation.isPending}
                      className="bg-emerald-600 text-white px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium"
                    >
                      {acceptOfferMutation.isPending ? 'Accepting...' : 'Accept Offer'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircleIcon className="h-6 w-6 text-red-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Decline Offer</h3>
                    </div>
                    <button 
                      onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })} 
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                  
                  <p className="text-gray-600 mb-4">
                    Are you sure you want to decline the offer for <span className="font-medium text-gray-900">{offerModal.jobTitle}</span>?
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    This action cannot be undone. The hiring team will be notified.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for declining (optional)
                    </label>
                    <select
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      className="input-field"
                    >
                      <option value="">Select a reason...</option>
                      <option value="accepted_other_offer">Accepted another offer</option>
                      <option value="salary_not_satisfactory">Compensation not satisfactory</option>
                      <option value="role_mismatch">Role not as expected</option>
                      <option value="location_issues">Location/commute concerns</option>
                      <option value="personal_reasons">Personal reasons</option>
                      <option value="staying_current">Decided to stay at current position</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeclineOffer}
                      disabled={declineOfferMutation.isPending}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {declineOfferMutation.isPending ? 'Declining...' : 'Decline Offer'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Confirmation Modal */}
      {withdrawModal.show && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setWithdrawModal({ show: false, applicationId: null, jobTitle: '' })}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Withdraw Application</h3>
                </div>
                <button 
                  onClick={() => setWithdrawModal({ show: false, applicationId: null, jobTitle: '' })} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <p className="text-gray-600 mb-4">
                Are you sure you want to withdraw your application for <span className="font-medium text-gray-900">{withdrawModal.jobTitle}</span>?
              </p>
              <p className="text-sm text-gray-500 mb-4">
                This action cannot be undone. You may need to reapply if you change your mind.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for withdrawing (optional)
                </label>
                <select
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a reason...</option>
                  <option value="accepted_other_offer">Accepted another job offer</option>
                  <option value="not_interested">No longer interested in the position</option>
                  <option value="salary_expectations">Salary expectations not met</option>
                  <option value="relocation">Unable to relocate</option>
                  <option value="personal_reasons">Personal reasons</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setWithdrawModal({ show: false, applicationId: null, jobTitle: '' })}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawMutation.isPending}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {withdrawMutation.isPending ? 'Withdrawing...' : 'Withdraw Application'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Application Details Modal */}
      {detailsModal.show && detailsModal.application && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setDetailsModal({ show: false, application: null })}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <BriefcaseIcon className="h-6 w-6 text-primary-600" />
                  <h3 className="text-xl font-semibold text-gray-900">Job Details</h3>
                </div>
                <button 
                  onClick={() => setDetailsModal({ show: false, application: null })} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Job Header */}
                <div className="bg-gradient-to-r from-primary-50 to-primary-100 p-5 rounded-lg">
                  <h4 className="font-bold text-xl text-gray-900 mb-3">
                    {detailsModal.application.job_title || detailsModal.application.jobTitle}
                  </h4>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {detailsModal.application.department && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <BuildingOfficeIcon className="h-4 w-4" />
                        <span>{detailsModal.application.department}</span>
                      </div>
                    )}
                    {(detailsModal.application.job_location || detailsModal.application.location) && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <MapPinIcon className="h-4 w-4" />
                        <span>{detailsModal.application.job_location || detailsModal.application.location}</span>
                      </div>
                    )}
                    {detailsModal.application.job_type && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <ClockIcon className="h-4 w-4" />
                        <span className="capitalize">{detailsModal.application.job_type?.replace('_', '-')}</span>
                      </div>
                    )}
                    {detailsModal.application.is_remote && (
                      <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-medium">
                        Remote Available
                      </span>
                    )}
                  </div>
                </div>

                {/* Application Status */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Your Application Status</label>
                    <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusBadge(detailsModal.application.status).bg}`}>
                      {detailsModal.application.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Applied On</label>
                    <p className="mt-1 text-gray-900">{formatDate(detailsModal.application.submitted_at || detailsModal.application.created_at)}</p>
                  </div>
                </div>

                {/* Status Description */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-800">
                    {getStatusDescription(detailsModal.application.status)}
                  </p>
                </div>

                {/* Experience & Education Level */}
                {(detailsModal.application.experience_level || detailsModal.application.education_requirement) && (
                  <div className="grid grid-cols-2 gap-4">
                    {detailsModal.application.experience_level && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Experience Level</label>
                        <p className="mt-1 text-gray-900 capitalize">{detailsModal.application.experience_level?.replace('_', ' ')}</p>
                      </div>
                    )}
                    {detailsModal.application.education_requirement && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500">Education Required</label>
                        <p className="mt-1 text-gray-900 capitalize">{detailsModal.application.education_requirement?.replace('_', ' ')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Job Description */}
                {detailsModal.application.job_description && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Job Description</label>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                      {detailsModal.application.job_description}
                    </div>
                  </div>
                )}

                {/* Requirements */}
                {detailsModal.application.job_requirements && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Requirements</label>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                      {detailsModal.application.job_requirements}
                    </div>
                  </div>
                )}

                {/* Responsibilities */}
                {detailsModal.application.job_responsibilities && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Responsibilities</label>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                      {detailsModal.application.job_responsibilities}
                    </div>
                  </div>
                )}

                {/* Required Skills */}
                {detailsModal.application.required_skills && detailsModal.application.required_skills.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Required Skills</label>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(detailsModal.application.required_skills) 
                        ? detailsModal.application.required_skills 
                        : typeof detailsModal.application.required_skills === 'string' 
                          ? detailsModal.application.required_skills.split(',')
                          : []
                      ).map((skill, index) => (
                        <span key={index} className="bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-sm">
                          {typeof skill === 'string' ? skill.trim() : (skill?.name || skill?.skill || JSON.stringify(skill))}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Benefits */}
                {detailsModal.application.benefits && detailsModal.application.benefits.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Benefits</label>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(detailsModal.application.benefits) 
                        ? detailsModal.application.benefits 
                        : typeof detailsModal.application.benefits === 'string'
                          ? detailsModal.application.benefits.split(',')
                          : []
                      ).map((benefit, index) => (
                        <span key={index} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                          {typeof benefit === 'string' ? benefit.trim() : (benefit?.name || benefit?.benefit || JSON.stringify(benefit))}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interview Info if scheduled */}
                {detailsModal.application.interviews && detailsModal.application.interviews.length > 0 && (
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-purple-800 mb-3">
                      <CalendarIcon className="h-4 w-4 inline mr-1" />
                      Interview(s) Scheduled
                    </label>
                    <div className="space-y-3">
                      {detailsModal.application.interviews.map((interview, idx) => (
                        <div key={idx} className="bg-white p-3 rounded border border-purple-200">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-purple-900 capitalize">
                                {interview.type?.replace('_', ' ')} Interview
                              </p>
                              <p className="text-sm text-purple-700">
                                {interview.date ? formatDate(interview.date) : 'Date TBD'}
                                {interview.time && ` at ${interview.time.slice(0, 5)}`}
                              </p>
                              {interview.location && (
                                <p className="text-sm text-purple-600 mt-1">
                                  <MapPinIcon className="h-3 w-3 inline mr-1" />
                                  {interview.location}
                                </p>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-1 rounded capitalize ${
                              interview.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              interview.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {interview.status}
                            </span>
                          </div>
                          {interview.meeting_link && (
                            <a
                              href={interview.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 hover:text-purple-800 text-sm mt-2 inline-flex items-center"
                            >
                              Join Meeting →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Your Cover Letter */}
                {detailsModal.application.cover_letter && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Your Cover Letter</label>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {detailsModal.application.cover_letter}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setDetailsModal({ show: false, application: null })}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                  {detailsModal.application.status === 'offer_extended' && (
                    <>
                      <button
                        onClick={() => {
                          setDetailsModal({ show: false, application: null });
                          openOfferModal(detailsModal.application, 'accept');
                        }}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium"
                      >
                        Accept Offer
                      </button>
                      <button
                        onClick={() => {
                          setDetailsModal({ show: false, application: null });
                          openOfferModal(detailsModal.application, 'decline');
                        }}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                      >
                        Decline Offer
                      </button>
                    </>
                  )}
                  {!['withdrawn', 'rejected', 'hired', 'offer_extended', 'offer_accepted', 'offer_declined'].includes(detailsModal.application.status) && (
                    <button
                      onClick={() => {
                        setDetailsModal({ show: false, application: null });
                        openWithdrawModal(detailsModal.application);
                      }}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    >
                      Withdraw Application
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

export default MyApplications;
