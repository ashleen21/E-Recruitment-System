import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ShareIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  LinkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { jobsAPI } from '../../services/api';

const JobDistribution = () => {
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', 'published'],
    queryFn: () => jobsAPI.getAll({ status: 'published' }),
  });

  const { data: distributionSummary } = useQuery({
    queryKey: ['distributions-summary'],
    queryFn: () => jobsAPI.getDistributionsSummary(),
  });

  const { data: selectedJobDistributions, refetch: refetchDistributions } = useQuery({
    queryKey: ['job-distributions', selectedJob?.id],
    queryFn: () => jobsAPI.getDistributions(selectedJob?.id),
    enabled: !!selectedJob?.id,
  });

  const distributeMutation = useMutation({
    mutationFn: ({ jobId, platforms }) => jobsAPI.distribute(jobId, platforms),
    onSuccess: (data) => {
      const results = data.data.results || [];
      const successful = results.filter(r => r.success);
      
      // Handle results per platform
      results.forEach(result => {
        if (result.success) {
          if (result.requiresManualShare && result.shareUrl) {
            // Show flyer download link if available (for X/Twitter with flyer)
            if (result.flyerUrl) {
              toast((t) => (
                <div>
                  <p className="font-medium">{result.platform}: {result.message}</p>
                  <div className="mt-2 flex gap-2">
                    <a
                      href={result.flyerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 underline"
                    >
                      Download Flyer
                    </a>
                    <button
                      onClick={() => { window.open(result.shareUrl, '_blank', 'width=600,height=400'); toast.dismiss(t.id); }}
                      className="text-sm text-blue-600 underline"
                    >
                      Share on {result.platform === 'twitter' ? 'X' : result.platform}
                    </button>
                  </div>
                </div>
              ), { duration: 10000 });
            } else {
              // Open share link in new window for manual sharing platforms
              window.open(result.shareUrl, '_blank', 'width=600,height=400');
            }
          } else if (result.url) {
            // Direct post was successful - show the post URL with view link
            const platformName = result.platform === 'twitter' ? 'X (Twitter)' : result.platform;
            toast.success(
              <div>
                <p className="font-medium">✅ {platformName}: {result.message}</p>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 underline mt-1 block"
                >
                  View Post →
                </a>
              </div>,
              { duration: 8000 }
            );
          }
        } else {
          const platformName = result.platform === 'twitter' ? 'X (Twitter)' : result.platform;
          toast.error(`${platformName}: ${result.error || 'Failed to distribute'}`);
        }
      });
      
      const directPosts = successful.filter(r => !r.requiresManualShare && r.url);
      const manualShares = successful.filter(r => r.requiresManualShare);
      
      if (directPosts.length > 0 && manualShares.length > 0) {
        toast.success(`Posted directly to ${directPosts.length} platform(s) and generated ${manualShares.length} share link(s).`);
      } else if (directPosts.length > 0) {
        toast.success(`Successfully posted to ${directPosts.length} platform(s)!`);
      } else if (manualShares.length === 0 && successful.length === 0) {
        toast.error('Failed to distribute job');
      }
      
      setSelectedPlatforms([]);
      refetchDistributions();
      queryClient.invalidateQueries(['distributions-summary']);
    },
    onError: () => toast.error('Failed to distribute job'),
  });

  const platforms = [
    { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: 'bg-blue-700' },
    { id: 'facebook', name: 'Facebook', icon: '📘', color: 'bg-blue-600' },
    { id: 'twitter', name: 'X (Twitter)', icon: '𝕏', color: 'bg-black' },
    { id: 'company_website', name: 'Company Website', icon: '🌐', color: 'bg-gray-600' },
  ];

  const handleDistribute = () => {
    if (!selectedJob) {
      toast.error('Please select a job first');
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }
    distributeMutation.mutate({ jobId: selectedJob.id, platforms: selectedPlatforms });
  };

  const filteredJobs = jobs?.data?.jobs?.filter(job => 
    job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.department?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'published':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Distribution</h1>
        </div>
      </div>

      {/* Distribution Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {distributionSummary?.data?.summary?.slice(0, 4).map((stat, idx) => (
          <div key={idx} className="card flex items-center">
            <div className={`p-3 rounded-lg ${platforms.find(p => p.id === stat.platform)?.color || 'bg-gray-500'} text-white mr-4`}>
              <span className="text-2xl">{platforms.find(p => p.id === stat.platform)?.icon || '📢'}</span>
            </div>
            <div>
              <p className="text-sm text-gray-600 capitalize">{stat.platform?.replace('_', ' ')}</p>
              <p className="text-xl font-bold text-gray-900">{stat.published}/{stat.total}</p>
              <p className="text-xs text-gray-500">successful posts</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Selection Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Job to Distribute</h2>
          
          {/* Search */}
          <div className="relative mb-4">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Job List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {jobsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No published jobs found</p>
            ) : (
              filteredJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedJob?.id === job.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-gray-900">{job.title}</p>
                  <p className="text-sm text-gray-600">{job.department} • {job.location}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Distribution Actions Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {selectedJob ? `Distribute: ${selectedJob.title}` : 'Select a Job'}
          </h2>

          {selectedJob ? (
            <div className="space-y-4">
              {/* Platform Selection */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Select Platforms</p>
                <div className="space-y-2">
                  {platforms.map((platform) => {
                    const existingDist = selectedJobDistributions?.data?.find(d => d.platform === platform.id);
                    return (
                      <label
                        key={platform.id}
                        className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedPlatforms.includes(platform.id)
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
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
                        <span className="ml-2 text-gray-900 flex-1">{platform.name}</span>
                        {existingDist && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            existingDist.status === 'published' ? 'bg-green-100 text-green-800' :
                            existingDist.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {existingDist.status}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t">
                <button
                  onClick={handleDistribute}
                  disabled={selectedPlatforms.length === 0 || distributeMutation.isPending}
                  className="btn-primary w-full flex items-center justify-center disabled:opacity-50"
                >
                  {distributeMutation.isPending ? (
                    <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <ShareIcon className="h-5 w-5 mr-2" />
                  )}
                  {distributeMutation.isPending ? 'Distributing...' : 'Distribute to Selected'}
                </button>

              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <ShareIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Select a job from the list to start distributing</p>
            </div>
          )}
        </div>

        {/* Distribution History Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-primary-600" />
            Distribution History
          </h2>

          {selectedJob ? (
            selectedJobDistributions?.data?.length > 0 ? (
              <div className="space-y-3">
                {selectedJobDistributions.data.map((dist) => (
                  <div key={dist.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <span className="text-xl mr-3">
                        {platforms.find(p => p.id === dist.platform)?.icon || '📢'}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900 capitalize">
                          {dist.platform?.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {dist.published_at ? new Date(dist.published_at).toLocaleDateString() : 'Pending'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(dist.status)}
                      {dist.external_url && (
                        <a
                          href={dist.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700"
                        >
                          <LinkIcon className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No distribution history for this job</p>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">Recent Distributions</p>
              {distributionSummary?.data?.recent?.slice(0, 5).map((dist) => (
                <div key={dist.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{dist.job_title}</p>
                    <p className="text-xs text-gray-500 capitalize">{dist.platform?.replace('_', ' ')}</p>
                  </div>
                  {getStatusIcon(dist.status)}
                </div>
              )) || <p className="text-gray-500 text-center py-4">No recent distributions</p>}
            </div>
          )}
        </div>
      </div>



    </div>
  );
};

export default JobDistribution;
