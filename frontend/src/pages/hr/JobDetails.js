import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PencilIcon,
  ShareIcon,
  XCircleIcon,
  MapPinIcon,
  BriefcaseIcon,
  ClockIcon,
  CalendarDaysIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { jobsAPI, applicationsAPI } from '../../services/api';

const JobDetails = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsAPI.getById(id),
  });

  const { data: applications } = useQuery({
    queryKey: ['job-applications', id],
    queryFn: () => applicationsAPI.getAll({ jobId: id }),
  });

  const publishMutation = useMutation({
    mutationFn: () => jobsAPI.publish(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['job', id]);
      toast.success('Job published successfully');
    },
    onError: () => toast.error('Failed to publish job'),
  });

  const closeMutation = useMutation({
    mutationFn: () => jobsAPI.close(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['job', id]);
      toast.success('Job closed successfully');
    },
    onError: () => toast.error('Failed to close job'),
  });

  const distributeMutation = useMutation({
    mutationFn: (platforms) => jobsAPI.distribute(id, platforms),
    onSuccess: (data) => {
      setShowDistributeModal(false);
      const results = data.data.results || [];
      results.forEach(result => {
        if (result.success) {
          const name = result.platform === 'twitter' ? 'X (Twitter)' : result.platform;
          if (result.requiresManualShare && result.shareUrl) {
            window.open(result.shareUrl, '_blank', 'width=600,height=400');
            toast.success(`${name}: Share link opened`);
          } else if (result.url) {
            toast.success(
              <div>
                <p className="font-medium">✅ Posted to {name}!</p>
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">View Post →</a>
              </div>,
              { duration: 8000 }
            );
          }
        }
      });
      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        toast.success(`Job distributed to ${successCount} platform(s)`);
      } else {
        toast.error('Failed to distribute job');
      }
      queryClient.invalidateQueries(['job', id]);
    },
    onError: () => toast.error('Failed to distribute job'),
  });

  const twitterQuickPostMutation = useMutation({
    mutationFn: () => jobsAPI.distribute(id, ['twitter']),
    onSuccess: (data) => {
      const result = data.data.results?.find(r => r.platform === 'twitter');
      if (result?.success) {
        if (result.requiresManualShare && result.shareUrl) {
          window.open(result.shareUrl, '_blank', 'width=600,height=400');
          toast.success('X (Twitter) share link opened');
        } else if (result.url) {
          toast.success(
            <div>
              <p className="font-medium">✅ Posted to X (Twitter)!</p>
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">View Tweet →</a>
            </div>,
            { duration: 8000 }
          );
        }
      } else {
        toast.error('Failed to post to X (Twitter)');
      }
      queryClient.invalidateQueries(['job', id]);
    },
    onError: () => toast.error('Failed to post to X (Twitter)'),
  });

  const platforms = [
    { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
    { id: 'twitter', name: 'X', icon: '𝕏' },
    { id: 'facebook', name: 'Facebook', icon: '📘' },
    { id: 'company_website', name: 'Company Website', icon: '🌐' },
  ];

  const handleDistribute = () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }
    distributeMutation.mutate(selectedPlatforms);
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      published: 'bg-green-100 text-green-800',
      closed: 'bg-red-100 text-red-800',
      paused: 'bg-yellow-100 text-yellow-800',
    };
    return styles[status] || styles.draft;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const jobData = job?.data;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">{jobData?.title}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(jobData?.status)}`}>
              {jobData?.status}
            </span>
          </div>
          <p className="text-gray-600">{jobData?.department} • Posted {new Date(jobData?.created_at || jobData?.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <Link to={`/hr/jobs/${id}/edit`} className="btn-secondary flex items-center">
            <PencilIcon className="h-5 w-5 mr-2" />
            Edit
          </Link>
          {jobData?.status === 'draft' && (
            <button onClick={() => publishMutation.mutate()} className="btn-primary flex items-center">
              <ShareIcon className="h-5 w-5 mr-2" />
              Publish
            </button>
          )}
          {jobData?.status === 'published' && (
            <>
              <button
                onClick={() => twitterQuickPostMutation.mutate()}
                disabled={twitterQuickPostMutation.isPending}
                className="flex items-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <span className="mr-2 text-lg">𝕏</span>
                {twitterQuickPostMutation.isPending ? 'Posting...' : 'Post to X'}
              </button>
              <button onClick={() => setShowDistributeModal(true)} className="btn-primary flex items-center">
                <ShareIcon className="h-5 w-5 mr-2" />
                Distribute
              </button>
              <button onClick={() => closeMutation.mutate()} className="btn-danger flex items-center">
                <XCircleIcon className="h-5 w-5 mr-2" />
                Close
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="card text-center">
              <MapPinIcon className="h-6 w-6 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Location</p>
              <p className="font-semibold">{jobData?.location}</p>
            </div>
            <div className="card text-center">
              <BriefcaseIcon className="h-6 w-6 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Contract Type</p>
              <p className="font-semibold capitalize">{(jobData?.job_type || jobData?.employmentType)?.replace('_', ' ')}</p>
            </div>
            <div className="card text-center">
              <ClockIcon className="h-6 w-6 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Experience</p>
              <p className="font-semibold capitalize">
                {(jobData?.experience_level || jobData?.experienceLevel)?.replace('_', ' ')}
                {(jobData?.min_experience_years || jobData?.max_experience_years) && (
                  <span className="block text-sm text-gray-500">
                    {jobData?.min_experience_years || 0} - {jobData?.max_experience_years || 'N/A'} years
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <CalendarDaysIcon className="h-6 w-6 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Posted Date</p>
              <p className="font-semibold">{new Date(jobData?.created_at || jobData?.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="card text-center">
              <CalendarDaysIcon className="h-6 w-6 mx-auto text-red-400 mb-2" />
              <p className="text-sm text-gray-600">Application Deadline</p>
              <p className="font-semibold">
                {jobData?.closes_at || jobData?.applicationDeadline
                  ? new Date(jobData?.closes_at || jobData?.applicationDeadline).toLocaleDateString()
                  : 'No deadline'}
              </p>
            </div>
          </div>

          {/* Description */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
            <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
              {jobData?.description}
            </div>
          </div>

          {/* Requirements */}
          {jobData?.requirements?.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h2>
              <ul className="space-y-2">
                {jobData.requirements.map((req, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="text-primary-600 mr-2">•</span>
                    <span className="text-gray-700">{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills */}
          {jobData?.skills?.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Required Skills</h2>
              <div className="flex flex-wrap gap-2">
                {jobData.skills.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
                    {typeof skill === 'object' ? skill.name : skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Applications Summary */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Applications</h2>
              <UserGroupIcon className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-primary-600 mb-4">{applications?.data?.pagination?.total ?? applications?.data?.applications?.length ?? 0}</p>
            <Link
              to={`/hr/applications?jobId=${id}`}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              View all applications →
            </Link>
          </div>

          {/* Application Deadline */}
          {jobData?.applicationDeadline && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Application Deadline</h2>
              <p className="text-gray-700">{new Date(jobData.applicationDeadline).toLocaleDateString()}</p>
            </div>
          )}

          {/* Distribution Status */}
          {jobData?.distributions?.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribution</h2>
              <div className="space-y-2">
                {jobData.distributions.map((dist, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-gray-700 capitalize">{dist.platform}</span>
                    <span className={`text-sm ${dist.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {dist.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Distribute Modal */}
      {showDistributeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-30" onClick={() => setShowDistributeModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribute Job</h3>
              <p className="text-gray-600 mb-4">Select platforms to distribute this job posting:</p>
              <div className="space-y-3">
                {platforms.map((platform) => (
                  <label key={platform.id} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(platform.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPlatforms([...selectedPlatforms, platform.id]);
                        } else {
                          setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform.id));
                        }
                      }}
                      className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="ml-3 text-xl">{platform.icon}</span>
                    <span className="ml-2 text-gray-900">{platform.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowDistributeModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleDistribute}
                  disabled={distributeMutation.isPending}
                  className="btn-primary disabled:opacity-50"
                >
                  {distributeMutation.isPending ? 'Distributing...' : 'Distribute'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetails;
