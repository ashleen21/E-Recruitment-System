import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BriefcaseIcon,
  DocumentTextIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  StarIcon,
  MapPinIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { candidatesAPI, applicationsAPI, interviewsAPI, jobsAPI } from '../../services/api';

const CandidateDashboard = () => {
  const { data: profile } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: () => candidatesAPI.getProfile(),
  });

  const { data: applications } = useQuery({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const response = await applicationsAPI.getMyApplications();
      return response.data;
    },
  });

  const { data: interviews } = useQuery({
    queryKey: ['my-interviews'],
    queryFn: () => interviewsAPI.getAll(),
  });

  const { data: recommendationsData } = useQuery({
    queryKey: ['job-recommendations'],
    queryFn: async () => {
      const response = await jobsAPI.getRecommendations(6);
      return response.data;
    },
  });

  const profileCompletion = calculateProfileCompletion(profile?.data);
  const recentApplications = applications?.slice(0, 5) || [];
  const upcomingInterviews = interviews?.data?.filter(i => i.status === 'scheduled').slice(0, 3) || [];
  const recommendedJobs = recommendationsData?.recommendations || [];

  // Get user's display name
  const userName = profile?.data?.first_name || profile?.data?.firstName || 'there';

  const stats = {
    totalApplications: applications?.length || 0,
    pending: applications?.filter(a => a.status === 'pending' || a.status === 'submitted' || a.status === 'under_review').length || 0,
    shortlisted: applications?.filter(a => a.status === 'shortlisted').length || 0,
    interviews: upcomingInterviews.length,
  };

  function calculateProfileCompletion(profile) {
    if (!profile) return 0;
    let score = 0;
    if (profile.firstName && profile.lastName) score += 20;
    if (profile.email) score += 10;
    if (profile.phone) score += 10;
    if (profile.skills?.length > 0) score += 20;
    if (profile.experience?.length > 0) score += 20;
    if (profile.education?.length > 0) score += 10;
    if (profile.resume) score += 10;
    return score;
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-800',
      submitted: 'bg-gray-100 text-gray-800',
      under_review: 'bg-blue-100 text-blue-800',
      shortlisted: 'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-purple-100 text-purple-800',
      interviewed: 'bg-purple-100 text-purple-800',
      offer_extended: 'bg-green-100 text-green-800',
      offer_accepted: 'bg-green-200 text-green-900',
      offer_declined: 'bg-orange-100 text-orange-800',
      rejected: 'bg-red-100 text-red-800',
      hired: 'bg-green-200 text-green-900',
      withdrawn: 'bg-gray-200 text-gray-700',
    };
    return styles[status] || styles.pending;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getMatchScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-orange-600';
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {userName}!
        </h1>
      </div>

      {/* Profile Completion */}
      {profileCompletion < 100 && (
        <div className="card mb-6 bg-gradient-to-r from-primary-500 to-primary-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-1">Complete Your Profile</h2>
              <p className="text-primary-100">
                A complete profile increases your chances of getting hired
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{profileCompletion}%</p>
              <Link to="/candidate/profile" className="text-primary-100 hover:text-white text-sm">
                Complete now →
              </Link>
            </div>
          </div>
          <div className="mt-4 h-2 bg-primary-400 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: `${profileCompletion}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <DocumentTextIcon className="h-8 w-8 mx-auto text-primary-600 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.totalApplications}</p>
          <p className="text-sm text-gray-600">Total Applications</p>
        </div>
        <div className="card text-center">
          <ClockIcon className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
          <p className="text-sm text-gray-600">Pending</p>
        </div>
        <div className="card text-center">
          <CheckCircleIcon className="h-8 w-8 mx-auto text-green-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.shortlisted}</p>
          <p className="text-sm text-gray-600">Shortlisted</p>
        </div>
        <div className="card text-center">
          <CalendarIcon className="h-8 w-8 mx-auto text-purple-500 mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.interviews}</p>
          <p className="text-sm text-gray-600">Interviews</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Applications */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
            <Link to="/candidate/applications" className="text-primary-600 hover:text-primary-700 text-sm">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {recentApplications.map((app) => (
              <div key={app.id} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{app.job_title || app.jobTitle}</h3>
                    <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                      <span className="flex items-center">
                        <BuildingOfficeIcon className="h-4 w-4 mr-1" />
                        {app.department || 'No department'}
                      </span>
                      {app.job_location && (
                        <span className="flex items-center">
                          <MapPinIcon className="h-4 w-4 mr-1" />
                          {app.job_location}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-gray-500">
                        Applied: {formatDate(app.submitted_at)}
                      </span>
                      {app.ai_overall_score && (
                        <span className={`flex items-center font-medium ${getMatchScoreColor(parseFloat(app.ai_overall_score))}`}>
                          <StarIcon className="h-4 w-4 mr-1" />
                          {parseFloat(app.ai_overall_score).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-3 ${getStatusBadge(app.status)}`}>
                    {app.status?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
            {recentApplications.length === 0 && (
              <div className="text-center py-6">
                <BriefcaseIcon className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-500">No applications yet</p>
                <Link to="/candidate/jobs" className="text-primary-600 hover:text-primary-700 text-sm">
                  Browse jobs →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Interviews */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Interviews</h2>
            <Link to="/candidate/interviews" className="text-primary-600 hover:text-primary-700 text-sm">
              View all →
            </Link>
          </div>
          <div className="space-y-4">
            {upcomingInterviews.map((interview) => (
              <div key={interview.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{interview.jobTitle}</p>
                    <p className="text-sm text-primary-600">{interview.type} Interview</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {new Date(interview.scheduledDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">{interview.startTime}</p>
                  </div>
                </div>
                {interview.meetingLink && (
                  <a
                    href={interview.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm text-primary-600 hover:text-primary-700"
                  >
                    Join Meeting →
                  </a>
                )}
              </div>
            ))}
            {upcomingInterviews.length === 0 && (
              <div className="text-center py-6">
                <CalendarIcon className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-500">No upcoming interviews</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job Recommendations */}
      <div className="card mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recommended Jobs</h2>
          <Link to="/candidate/jobs" className="text-primary-600 hover:text-primary-700 text-sm">
            Browse all →
          </Link>
        </div>
        {recommendedJobs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedJobs.map((job) => (
              <div key={job.id} className="border rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all">
                <h3 className="font-medium text-gray-900 truncate">{job.title}</h3>
                <p className="text-sm text-primary-600">{job.department}</p>
                <div className="text-sm text-gray-600 mt-1 flex items-center">
                  <MapPinIcon className="h-4 w-4 mr-1" />
                  {job.location || 'Remote'} 
                  {job.is_remote && <span className="ml-1 text-green-600">(Remote available)</span>}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {job.job_type?.replace('_', ' ')} 
                  {job.experience_level && ` • ${job.experience_level}`}
                </div>
                {job.salary_min && job.salary_max && (
                  <p className="text-sm text-gray-600 mt-1">
                    {job.salary_currency || '$'}{job.salary_min.toLocaleString()} - {job.salary_currency || '$'}{job.salary_max.toLocaleString()}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className={`text-sm font-medium ${getMatchScoreColor(job.matchScore)}`}>
                    {job.matchScore}% match
                  </span>
                  <Link
                    to={`/candidate/jobs?jobId=${job.id}`}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    View →
                  </Link>
                </div>
                {job.matchedSkills?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {job.matchedSkills.slice(0, 3).map((skill, idx) => (
                      <span key={idx} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        {skill}
                      </span>
                    ))}
                    {job.matchedSkills.length > 3 && (
                      <span className="text-xs text-gray-500">+{job.matchedSkills.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <BriefcaseIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-500 mb-2">No job recommendations available</p>
            <p className="text-sm text-gray-400">Complete your profile and upload your resume to get personalized job recommendations</p>
            <Link to="/candidate/profile" className="mt-3 inline-block text-primary-600 hover:text-primary-700 text-sm font-medium">
              Complete Profile →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default CandidateDashboard;
