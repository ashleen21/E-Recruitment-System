import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
  FunnelIcon,
  XMarkIcon,
  ArrowPathIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { applicationsAPI, aiAPI, jobsAPI } from '../../services/api';

const ApplicationList = () => {
  const [searchParams] = useSearchParams();
  const jobIdFilter = searchParams.get('jobId');
  const [filters, setFilters] = useState({ status: '', jobId: jobIdFilter || '', search: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showTopNModal, setShowTopNModal] = useState(false);
  const [topNCount, setTopNCount] = useState(5);
  const queryClient = useQueryClient();

  const { data: jobsList } = useQuery({
    queryKey: ['jobs-list'],
    queryFn: () => jobsAPI.getAll({ limit: 100 }),
  });

  const { data: applications, isLoading } = useQuery({
    queryKey: ['applications', filters],
    queryFn: () => applicationsAPI.getAll(filters),
    // Auto-refetch to pick up background match score calculations
    refetchInterval: (data) => {
      const apps = data?.data?.applications || data?.data || [];
      const hasPending = apps.some(a => !a.resume_match_score);
      return hasPending ? 8000 : false; // refetch every 8s if any app missing score
    },
  });

  const { data: aiRanking, isLoading: rankingLoading } = useQuery({
    queryKey: ['ai-ranking', filters.jobId],
    queryFn: () => applicationsAPI.getAIRanking(filters.jobId),
    enabled: !!filters.jobId,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => applicationsAPI.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries(['applications']);
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const shortlistMutation = useMutation({
    mutationFn: (ids) => applicationsAPI.bulkUpdateStatus(ids, 'shortlisted'),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['applications']);
      setSelectedIds([]);
      toast.success(`${data.data.updated} candidates shortlisted`);
    },
    onError: () => toast.error('Failed to shortlist'),
  });

  const bulkRejectMutation = useMutation({
    mutationFn: ({ ids, reason }) => applicationsAPI.bulkUpdateStatus(ids, 'rejected', reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['applications']);
      setSelectedIds([]);
      setShowRejectModal(false);
      setRejectReason('');
      toast.success(`${data.data.updated} applications rejected`);
    },
    onError: () => toast.error('Failed to reject applications'),
  });

  const handleBulkReject = () => {
    if (selectedIds.length === 0) return;
    bulkRejectMutation.mutate({ ids: selectedIds, reason: rejectReason });
  };

  const screenMutation = useMutation({
    mutationFn: (id) => aiAPI.screenCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['applications']);
      toast.success('AI screening completed');
    },
    onError: () => toast.error('AI screening failed'),
  });

  const topNShortlistMutation = useMutation({
    mutationFn: ({ jobId, topN }) => applicationsAPI.topNShortlist(jobId, topN),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['applications']);
      setShowTopNModal(false);
      const d = data.data;
      toast.success(`Shortlisted top ${d.shortlisted} applicant(s) and rejected ${d.rejected} applicant(s)`);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to shortlist'),
  });

  const handleTopNShortlist = () => {
    if (!filters.jobId) {
      toast.error('Please filter by a specific job posting first');
      return;
    }
    if (topNCount < 1) {
      toast.error('Please enter a valid number');
      return;
    }
    topNShortlistMutation.mutate({ jobId: filters.jobId, topN: topNCount });
  };

  const getStatusBadge = (status) => {
    const styles = {
      submitted: 'bg-blue-100 text-blue-800',
      pending: 'bg-gray-100 text-gray-800',
      under_review: 'bg-blue-100 text-blue-800',
      shortlisted: 'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-purple-100 text-purple-800',
      offer_extended: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      hired: 'bg-green-200 text-green-900',
      withdrawn: 'bg-gray-200 text-gray-600',
    };
    return styles[status] || styles.pending;
  };

  const getAIScoreBadge = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getMatchScoreBadge = (score) => {
    if (score >= 75) return 'bg-green-100 text-green-800';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === applications?.data?.applications?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(applications?.data?.applications?.map(a => a.id) || []);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="text-gray-600">Review and manage job applications</p>
        </div>
        <div className="flex items-center space-x-3">
          {filters.jobId && (
            <button
              onClick={() => setShowTopNModal(true)}
              className="btn-primary flex items-center"
            >
              <TrophyIcon className="h-5 w-5 mr-2" />
              Shortlist Top Candidates
            </button>
          )}
          {selectedIds.length > 0 && (
            <>
              <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
              <button
                onClick={() => shortlistMutation.mutate(selectedIds)}
                disabled={shortlistMutation.isPending}
                className="btn-primary flex items-center"
              >
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                Shortlist
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="btn-secondary flex items-center text-red-600 border-red-300 hover:bg-red-50"
              >
                <XCircleIcon className="h-5 w-5 mr-2" />
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bulk Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowRejectModal(false)}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Reject {selectedIds.length} Application(s)</h3>
                <button onClick={() => setShowRejectModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason (Optional)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="input-field"
                  placeholder="Enter reason for rejection..."
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkReject}
                  disabled={bulkRejectMutation.isPending}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkRejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top N Shortlist Modal */}
      {showTopNModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowTopNModal(false)}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <TrophyIcon className="h-6 w-6 text-yellow-500 mr-2" />
                  Shortlist Top Candidates
                </h3>
                <button onClick={() => setShowTopNModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of top candidates to shortlist
                </label>
                <input
                  type="number"
                  min="1"
                  value={topNCount}
                  onChange={(e) => setTopNCount(parseInt(e.target.value) || 1)}
                  className="input-field w-full"
                  placeholder="e.g. 5"
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> This will shortlist the top {topNCount} candidate(s)
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setShowTopNModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleTopNShortlist}
                  disabled={topNShortlistMutation.isPending}
                  className="btn-primary disabled:opacity-50"
                >
                  {topNShortlistMutation.isPending ? 'Processing...' : `Shortlist Top ${topNCount}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <select
            value={filters.jobId}
            onChange={(e) => setFilters({ ...filters, jobId: e.target.value })}
            className="input-field w-auto max-w-xs"
          >
            <option value="">All Job Postings</option>
            {(jobsList?.data?.jobs || jobsList?.data || []).map((job) => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input-field w-auto"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="interview_scheduled">Interview Scheduled</option>
            <option value="offer_extended">Offer Extended</option>
            <option value="rejected">Rejected</option>
            <option value="hired">Hired</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          <input
            type="text"
            placeholder="Search by job or candidate..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="input-field w-64"
          />
        </div>
      </div>

      {/* AI Ranking Card */}
      {filters.jobId && aiRanking?.data && (
        <div className="card mb-6 border-l-4 border-primary-500">
          <div className="flex items-center gap-2 mb-3">
            <SparklesIcon className="h-5 w-5 text-primary-600" />
            <h3 className="font-semibold text-gray-900">AI Candidate Ranking</h3>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Based on skills match, experience, and job requirements analysis
          </p>
          <div className="flex flex-wrap gap-2">
            {aiRanking.data.slice(0, 5).map((candidate, idx) => (
              <div key={candidate.id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                <span className="font-bold text-primary-600">#{idx + 1}</span>
                <span className="text-gray-700">{candidate.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAIScoreBadge(candidate.score)}`}>
                  {candidate.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applications Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === applications?.data?.applications?.length && applications?.data?.applications?.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 text-primary-600 rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Candidate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job Position</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applied</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(applications?.data?.applications || []).map((app) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(app.id)}
                      onChange={() => toggleSelect(app.id)}
                      className="h-4 w-4 text-primary-600 rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{app.first_name} {app.last_name}</p>
                      <p className="text-sm text-gray-600">{app.candidate_email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{app.job_title}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      {app.resume_match_score ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getMatchScoreBadge(parseFloat(app.resume_match_score))}`}>
                          {parseFloat(app.resume_match_score).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="flex items-center text-xs text-gray-500">
                          <ArrowPathIcon className="h-4 w-4 animate-spin mr-1 text-primary-500" />
                          Calculating...
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {app.status === 'withdrawn' ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge('withdrawn')}`}>
                        Withdrawn
                      </span>
                    ) : (
                      <select
                        value={app.status}
                        onChange={(e) => statusMutation.mutate({ id: app.id, status: e.target.value })}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${getStatusBadge(app.status)}`}
                      >
                        <option value="submitted">Submitted</option>
                        <option value="pending">Pending</option>
                        <option value="under_review">Under Review</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="interview_scheduled">Interview Scheduled</option>
                        <option value="offer_extended">Offer Extended</option>
                        <option value="rejected">Rejected</option>
                        <option value="hired">Hired</option>
                      </select>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(app.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <Link to={`/hr/applications/${app.id}`} className="text-gray-600 hover:text-primary-600">
                        <EyeIcon className="h-5 w-5" />
                      </Link>
                      {app.status !== 'withdrawn' && (
                        <>
                          <button
                            onClick={() => statusMutation.mutate({ id: app.id, status: 'shortlisted' })}
                            className="text-gray-600 hover:text-green-600"
                            title="Shortlist"
                          >
                            <CheckCircleIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => statusMutation.mutate({ id: app.id, status: 'rejected' })}
                            className="text-gray-600 hover:text-red-600"
                            title="Reject"
                          >
                            <XCircleIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!applications?.data?.applications || applications.data.applications.length === 0) && (
            <div className="text-center py-12">
              <p className="text-gray-500">No applications found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationList;
