import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DocumentTextIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  XMarkIcon,
  EyeIcon,
  BriefcaseIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  StarIcon,
  GiftIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI } from '../../services/api';

const MyApplications = () => {
  const queryClient = useQueryClient();
  const [detailsModal, setDetailsModal] = useState({ show: false, application: null });
  const [withdrawModal, setWithdrawModal] = useState({ show: false, applicationId: null, jobTitle: '' });
  const [offerModal, setOfferModal] = useState({ show: false, type: null, applicationId: null, jobTitle: '' });
  const [withdrawReason, setWithdrawReason] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  const { data: applications, isLoading } = useQuery({
    queryKey: ['employee-applications'],
    queryFn: async () => {
      const response = await employeesAPI.getMyApplications();
      return response.data;
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ id, reason }) => employeesAPI.withdrawApplication(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-applications']);
      setWithdrawModal({ show: false, applicationId: null, jobTitle: '' });
      setWithdrawReason('');
      toast.success('Application withdrawn successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to withdraw application');
    },
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (id) => employeesAPI.acceptOffer(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['employee-applications']);
      setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' });
      toast.success(response.data?.message || 'Offer accepted! Congratulations!');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to accept offer');
    },
  });

  const declineOfferMutation = useMutation({
    mutationFn: ({ id, reason }) => employeesAPI.declineOffer(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-applications']);
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
      jobTitle: app.job_title,
    });
    setDeclineReason('');
  };

  const canWithdraw = (status) => {
    return !['hired', 'rejected', 'withdrawn', 'offer_accepted', 'offer_declined'].includes(status);
  };

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
      interview_scheduled: 'An interview has been scheduled. Please check your interviews page.',
      offer_extended: 'Congratulations! An offer has been extended to you. Please accept or decline.',
      offer_accepted: 'You have accepted the offer. Congratulations on your new role!',
      offer_declined: 'You have declined the offer for this position.',
      rejected: 'Unfortunately, your application was not selected to move forward.',
      hired: 'Congratulations! You have been hired for this position.',
      withdrawn: 'You have withdrawn this application.',
    };
    return descriptions[status] || 'Application status is being processed.';
  };

  const renderSkill = (skill, idx) => {
    const skillName = typeof skill === 'string' ? skill : (skill?.name || skill?.skill || JSON.stringify(skill));
    return (
      <span key={idx} className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs">
        {skillName}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const applicationsList = applications || [];
  const offers = applicationsList.filter(a => a.status === 'offer_extended');
  const otherApplications = applicationsList.filter(a => a.status !== 'offer_extended');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
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
                    <h3 className="text-xl font-bold text-gray-900">{app.job_title}</h3>
                    <p className="text-emerald-700 font-medium">{app.department}</p>
                    {app.location && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <MapPinIcon className="h-3 w-3" /> {app.location}
                      </p>
                    )}
                    <p className="text-sm text-emerald-700 mt-2 bg-emerald-50 p-2 rounded">
                      Congratulations! You have received an offer for this internal position. Please review and respond.
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
                      onClick={() => setDetailsModal({ show: true, application: app })}
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

      {otherApplications.length > 0 ? (
        <div className="space-y-4">
          {otherApplications.map((app) => {
            const statusStyle = getStatusBadge(app.status);
            const StatusIcon = statusStyle.icon;
            
            return (
              <div key={app.id} className="card hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <BriefcaseIcon className="h-6 w-6 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{app.job_title}</h3>
                        <p className="text-sm text-gray-600">{app.department}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                          {app.location && (
                            <span className="flex items-center gap-1">
                              <MapPinIcon className="h-3 w-3" />
                              {app.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            Applied: {formatDate(app.submitted_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${statusStyle.bg}`}>
                      <StatusIcon className="h-4 w-4" />
                      {app.status?.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => setDetailsModal({ show: true, application: app })}
                      className="btn-secondary text-sm"
                    >
                      <EyeIcon className="h-4 w-4 mr-1" />
                      View
                    </button>
                    {canWithdraw(app.status) && app.status !== 'offer_extended' && (
                      <button
                        onClick={() => setWithdrawModal({ show: true, applicationId: app.id, jobTitle: app.job_title })}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        offers.length === 0 && (
          <div className="card text-center py-12">
            <BriefcaseIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No applications yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Check out the Internal Opportunities page to find positions
            </p>
          </div>
        )
      )}

      {/* Details Modal */}
      {detailsModal.show && detailsModal.application && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Application Details</h2>
              <button
                onClick={() => setDetailsModal({ show: false, application: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Job Header */}
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary-100 rounded-lg">
                  <BriefcaseIcon className="h-8 w-8 text-primary-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {detailsModal.application.job_title}
                  </h3>
                  <p className="text-primary-600">{detailsModal.application.department}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                    {detailsModal.application.location && (
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="h-4 w-4" />
                        {detailsModal.application.location}
                      </span>
                    )}
                    {detailsModal.application.job_type && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        {detailsModal.application.job_type?.replace('_', ' ')}
                      </span>
                    )}
                    {detailsModal.application.is_remote && (
                      <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">
                        Remote Available
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Application Status */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Application Status</label>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium capitalize ${getStatusBadge(detailsModal.application.status).bg}`}>
                    {detailsModal.application.status?.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Applied On</label>
                  <p className="mt-1 text-gray-900">{formatDate(detailsModal.application.submitted_at)}</p>
                </div>
              </div>

              {/* Status Description */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-800">
                  {getStatusDescription(detailsModal.application.status)}
                </p>
              </div>

              {/* Job Details */}
              {detailsModal.application.experience_level && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <ChartBarIcon className="h-5 w-5 text-gray-400" />
                    <div>
                      <label className="block text-xs text-gray-500">Experience Level</label>
                      <p className="text-sm text-gray-900 capitalize">{detailsModal.application.experience_level?.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {detailsModal.application.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Description</label>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{detailsModal.application.description}</p>
                </div>
              )}

              {/* Requirements */}
              {detailsModal.application.requirements && Array.isArray(detailsModal.application.requirements) && detailsModal.application.requirements.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Requirements</label>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    {detailsModal.application.requirements.map((req, idx) => (
                      <li key={idx}>{typeof req === 'string' ? req : (req?.name || JSON.stringify(req))}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Required Skills */}
              {detailsModal.application.required_skills && Array.isArray(detailsModal.application.required_skills) && detailsModal.application.required_skills.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Required Skills</label>
                  <div className="flex flex-wrap gap-2">
                    {detailsModal.application.required_skills.map((skill, idx) => renderSkill(skill, idx))}
                  </div>
                </div>
              )}

              {/* Deadline */}
              {detailsModal.application.deadline && (
                <div className="flex items-center gap-2 text-sm text-orange-600">
                  <CalendarIcon className="h-4 w-4" />
                  <span>Application Deadline: {formatDate(detailsModal.application.deadline)}</span>
                </div>
              )}
            </div>

            <div className="border-t px-6 py-4 flex gap-3">
              <button
                onClick={() => setDetailsModal({ show: false, application: null })}
                className="btn-secondary flex-1"
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
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
                  >
                    Accept Offer
                  </button>
                  <button
                    onClick={() => {
                      setDetailsModal({ show: false, application: null });
                      openOfferModal(detailsModal.application, 'decline');
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Offer Accept/Decline Modal */}
      {offerModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            {offerModal.type === 'accept' ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-emerald-100 rounded-full">
                    <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Accept Offer</h3>
                  <button 
                    onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })} 
                    className="ml-auto text-gray-400 hover:text-gray-600"
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
                
                <div className="flex gap-3">
                  <button
                    onClick={handleAcceptOffer}
                    disabled={acceptOfferMutation.isPending}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium"
                  >
                    {acceptOfferMutation.isPending ? 'Accepting...' : 'Accept Offer'}
                  </button>
                  <button
                    onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-full">
                    <XCircleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Decline Offer</h3>
                  <button 
                    onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })} 
                    className="ml-auto text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                
                <p className="text-gray-600 mb-4">
                  Are you sure you want to decline the offer for <strong>{offerModal.jobTitle}</strong>?
                  This action cannot be undone.
                </p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for declining (optional)
                  </label>
                  <select
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    className="input"
                  >
                    <option value="">Select a reason...</option>
                    <option value="staying_current_role">Prefer to stay in current role</option>
                    <option value="compensation_concerns">Compensation concerns</option>
                    <option value="role_not_fit">Role not the right fit</option>
                    <option value="timing_not_right">Timing is not right</option>
                    <option value="personal_reasons">Personal reasons</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleDeclineOffer}
                    disabled={declineOfferMutation.isPending}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {declineOfferMutation.isPending ? 'Declining...' : 'Decline Offer'}
                  </button>
                  <button
                    onClick={() => setOfferModal({ show: false, type: null, applicationId: null, jobTitle: '' })}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {withdrawModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Withdraw Application</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              Are you sure you want to withdraw your application for <strong>{withdrawModal.jobTitle}</strong>? 
              This action cannot be undone.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for withdrawing (optional)
              </label>
              <textarea
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                className="input"
                rows={3}
                placeholder="Please share why you're withdrawing..."
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleWithdraw}
                disabled={withdrawMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {withdrawMutation.isPending ? 'Withdrawing...' : 'Withdraw Application'}
              </button>
              <button
                onClick={() => {
                  setWithdrawModal({ show: false, applicationId: null, jobTitle: '' });
                  setWithdrawReason('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyApplications;
