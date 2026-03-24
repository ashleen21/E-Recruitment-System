import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  SparklesIcon,
  CalendarIcon,
  EyeIcon,
  XMarkIcon,
  ArrowPathIcon,
  UserCircleIcon,
  CheckBadgeIcon,
  ChartBarIcon,
  LightBulbIcon,
  ShieldCheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  IdentificationIcon,
  HomeIcon,
  HeartIcon,
  UserIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import { applicationsAPI, aiAPI } from '../../services/api';

const ApplicationDetails = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showResumeModal, setShowResumeModal] = useState(false);

  const { data: application, isLoading } = useQuery({
    queryKey: ['application', id],
    queryFn: () => applicationsAPI.getById(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status) => applicationsAPI.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries(['application', id]);
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const matchScoreMutation = useMutation({
    mutationFn: () => applicationsAPI.getMatchScore(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['application', id]);
      toast.success('Match score calculated');
    },
    onError: () => toast.error('Failed to calculate match score'),
  });

  const [editingScore, setEditingScore] = useState(false);
  const [editedScore, setEditedScore] = useState('');
  const [hrComment, setHrComment] = useState('');

  const updateScoreMutation = useMutation({
    mutationFn: ({ score, comment }) => applicationsAPI.updateMatchScore(id, score, comment),
    onSuccess: () => {
      queryClient.invalidateQueries(['application', id]);
      toast.success('Match score updated');
      setEditingScore(false);
    },
    onError: () => toast.error('Failed to update match score'),
  });

  const reparseMutation = useMutation({
    mutationFn: () => applicationsAPI.reparseResume(id),
    onSuccess: () => {
      toast.success('Resume reparsing started. Refresh in a few seconds.');
      setTimeout(() => {
        queryClient.invalidateQueries(['application', id]);
      }, 3000);
    },
    onError: () => toast.error('Failed to reparse resume'),
  });

  // Predictions query
  const { data: predictions, isLoading: predictionsLoading, refetch: refetchPredictions } = useQuery({
    queryKey: ['predictions', id],
    queryFn: () => aiAPI.getPredictions(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const predictionMutation = useMutation({
    mutationFn: () => aiAPI.getPredictions(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['predictions', id], data);
      toast.success('Predictive analysis generated');
    },
    onError: () => toast.error('Failed to generate predictions'),
  });

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-800',
      under_review: 'bg-blue-100 text-blue-800',
      shortlisted: 'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-purple-100 text-purple-800',
      offer_extended: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      hired: 'bg-green-200 text-green-900',
    };
    return styles[status] || styles.pending;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Handle both axios response wrapper and direct data
  const app = application?.data || application;
  const parsedResume = app?.parsed_resume;
  
  // Get resume URL from application or from parsed resume
  const resumeUrl = app?.resume_url || parsedResume?.resume_file_path;
  const resumeFilename = app?.resume_filename || parsedResume?.resume_filename || 'Resume';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">{app?.first_name} {app?.last_name}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(app?.status)}`}>
              {app?.status?.replace('_', ' ')}
            </span>
          </div>
          <p className="text-gray-600">Applied for <span className="font-medium">{app?.job_title}</span></p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <Link to={`/hr/interviews/schedule?applicationId=${id}`} className="btn-secondary flex items-center">
            <CalendarIcon className="h-5 w-5 mr-2" />
            Schedule Interview
          </Link>
          {app?.status === 'withdrawn' ? (
            <span className="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium">
              Withdrawn
            </span>
          ) : (
            <select
              value={app?.status}
              onChange={(e) => statusMutation.mutate(e.target.value)}
              className="btn-primary cursor-pointer"
            >
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview_scheduled">Interview Scheduled</option>
              <option value="offer_extended">Offer Extended</option>
              <option value="rejected">Rejected</option>
              <option value="hired">Hired</option>
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Match Score Card */}
          <div className="card border-l-4 border-emerald-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ChartBarIcon className="h-6 w-6 text-emerald-600" />
                <h2 className="text-lg font-semibold text-gray-900">Job Match Score</h2>
              </div>
              <button
                onClick={() => matchScoreMutation.mutate()}
                disabled={matchScoreMutation.isPending}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center"
              >
                <ArrowPathIcon className={`h-4 w-4 mr-2 ${matchScoreMutation.isPending ? 'animate-spin' : ''}`} />
                {matchScoreMutation.isPending ? 'Calculating...' : app?.resume_match_score ? 'Recalculate' : 'Calculate Match'}
              </button>
            </div>

            {app?.resume_match_score ? (
              <div className="space-y-4">
                {/* Overall Score */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Overall Match</p>
                    {editingScore ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editedScore}
                            onChange={(e) => setEditedScore(e.target.value)}
                            className="w-20 px-2 py-1 text-xl font-bold border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            autoFocus
                          />
                          <span className="text-xl font-bold text-emerald-700">%</span>
                        </div>
                        <textarea
                          value={hrComment}
                          onChange={(e) => setHrComment(e.target.value)}
                          placeholder="Add your analysis or comment (optional)..."
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const val = parseFloat(editedScore);
                              if (isNaN(val) || val < 0 || val > 100) {
                                toast.error('Score must be between 0 and 100');
                                return;
                              }
                              updateScoreMutation.mutate({ score: val, comment: hrComment });
                            }}
                            disabled={updateScoreMutation.isPending}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <CheckBadgeIcon className="h-4 w-4" />
                            {updateScoreMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingScore(false)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 flex items-center gap-1"
                          >
                            <XMarkIcon className="h-4 w-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-3xl font-bold text-emerald-700">{parseFloat(app.resume_match_score).toFixed(0)}%</p>
                        <button
                          onClick={() => {
                            setEditedScore(parseFloat(app.resume_match_score).toFixed(0));
                            setHrComment(app.hr_score_comment || '');
                            setEditingScore(true);
                          }}
                          className="p-1 text-gray-400 hover:text-emerald-600 transition-colors"
                          title="Edit score"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {app?.resume_match_details?.recommendation && (
                      <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium ${
                        app.resume_match_details.recommendation === 'STRONG_MATCH' ? 'bg-green-100 text-green-800' :
                        app.resume_match_details.recommendation === 'GOOD_MATCH' ? 'bg-blue-100 text-blue-800' :
                        app.resume_match_details.recommendation === 'POTENTIAL_MATCH' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {app.resume_match_details.recommendation?.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <div className="w-24 h-24 relative">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                      <circle
                        cx="48" cy="48" r="40"
                        stroke={parseFloat(app.resume_match_score) >= 70 ? '#10b981' : parseFloat(app.resume_match_score) >= 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${(parseFloat(app.resume_match_score) / 100) * 251.2} 251.2`}
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* AI Analysis */}
                {app?.resume_match_details?.overallAnalysis && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 mb-1">AI Analysis</p>
                    <p className="text-sm text-blue-700">{app.resume_match_details.overallAnalysis}</p>
                  </div>
                )}

                {/* HR Comment */}
                {app?.hr_score_comment && !editingScore && (
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 mb-1">HR Analysis</p>
                    <p className="text-sm text-amber-700">{app.hr_score_comment}</p>
                  </div>
                )}

                {/* Score Breakdown */}
                {app?.resume_match_details && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-sm text-gray-600">Skills</p>
                      <p className="text-2xl font-bold text-gray-900">{app.resume_match_details.skillsMatch?.score || 0}%</p>
                      {app.resume_match_details.skillsMatch?.matched?.length > 0 && (
                        <p className="text-xs text-green-600 mt-1">{app.resume_match_details.skillsMatch.matched.length} matched</p>
                      )}
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-sm text-gray-600">Experience</p>
                      <p className="text-2xl font-bold text-gray-900">{app.resume_match_details.experienceMatch?.score || 0}%</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">{app.resume_match_details.experienceMatch?.details?.substring(0, 30) || ''}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-sm text-gray-600">Education</p>
                      <p className="text-2xl font-bold text-gray-900">{app.resume_match_details.educationMatch?.score || 0}%</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">{app.resume_match_details.educationMatch?.details?.substring(0, 30) || ''}</p>
                    </div>
                  </div>
                )}

                {/* Matched Skills */}
                {app?.resume_match_details?.skillsMatch?.matched?.length > 0 && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-sm font-medium text-green-800 mb-2">Matched Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {app.resume_match_details.skillsMatch.matched.map((skill, idx) => (
                        <span key={idx} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Skills */}
                {app?.resume_match_details?.skillsMatch?.missing?.length > 0 && (
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 mb-2">Missing Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {app.resume_match_details.skillsMatch.missing.map((skill, idx) => (
                        <span key={idx} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transferable Skills */}
                {app?.resume_match_details?.skillsMatch?.transferable?.length > 0 && (
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-medium text-purple-800 mb-2">Transferable Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {app.resume_match_details.skillsMatch.transferable.map((skill, idx) => (
                        <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Experience Strengths & Gaps */}
                {(app?.resume_match_details?.experienceMatch?.strengths?.length > 0 || app?.resume_match_details?.experienceMatch?.gaps?.length > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    {app.resume_match_details.experienceMatch.strengths?.length > 0 && (
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-sm font-medium text-green-800 mb-2">Experience Strengths</p>
                        <ul className="text-xs text-green-700 space-y-1">
                          {app.resume_match_details.experienceMatch.strengths.map((s, idx) => (
                            <li key={idx}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {app.resume_match_details.experienceMatch.gaps?.length > 0 && (
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-sm font-medium text-red-800 mb-2">Experience Gaps</p>
                        <ul className="text-xs text-red-700 space-y-1">
                          {app.resume_match_details.experienceMatch.gaps.map((g, idx) => (
                            <li key={idx}>• {g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}



                {/* AI Powered Badge */}
                {app?.resume_match_details?.aiPowered && (
                  <div className="text-center">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <SparklesIcon className="h-3 w-3" />
                      AI-Powered Analysis
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ChartBarIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>Click "Calculate Match" to see how well this candidate matches the job requirements</p>
              </div>
            )}
          </div>

          {/* Predictive Analysis Card */}
          <div className="card border-l-4 border-indigo-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LightBulbIcon className="h-6 w-6 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">Predictive Analysis</h2>
              </div>
              <button
                onClick={() => predictionMutation.mutate()}
                disabled={predictionMutation.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center"
              >
                <ArrowPathIcon className={`h-4 w-4 mr-2 ${predictionMutation.isPending ? 'animate-spin' : ''}`} />
                {predictionMutation.isPending ? 'Analyzing...' : predictions?.data ? 'Refresh' : 'Generate Predictions'}
              </button>
            </div>

            {predictions?.data ? (
              <div className="space-y-6">
                {/* Overall Assessment */}
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Hiring Recommendation</p>
                      <p className={`text-xl font-bold ${
                        predictions.data.overallAssessment?.recommendation === 'Strongly Recommended' ? 'text-green-700' :
                        predictions.data.overallAssessment?.recommendation === 'Recommended' ? 'text-blue-700' :
                        predictions.data.overallAssessment?.recommendation === 'Consider with Caution' ? 'text-yellow-700' :
                        'text-red-700'
                      }`}>
                        {predictions.data.overallAssessment?.recommendation || 'Pending Analysis'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-indigo-700">
                        {Math.round((predictions.data.overallAssessment?.hiringScore || 0) * 100)}%
                      </p>
                      <p className="text-xs text-gray-500">Hiring Score</p>
                    </div>
                  </div>
                  {predictions.data.overallAssessment?.confidence && (
                    <p className="mt-2 text-xs text-gray-500">
                      Confidence: {predictions.data.overallAssessment.confidence}
                    </p>
                  )}
                </div>

                {/* Success & Retention Predictions - Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Success Prediction */}
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheckIcon className="h-5 w-5 text-green-600" />
                      <h3 className="font-medium text-green-800">Success Prediction</h3>
                    </div>
                    <div className="flex items-center justify-center mb-3">
                      <div className="relative w-20 h-20">
                        <svg className="w-20 h-20 transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="#dcfce7" strokeWidth="6" fill="none" />
                          <circle
                            cx="40" cy="40" r="32"
                            stroke="#22c55e"
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray={`${(predictions.data.predictions?.success?.successProbability || 0) * 201} 201`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-green-700">
                          {Math.round((predictions.data.predictions?.success?.successProbability || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-green-700 text-center">
                      {predictions.data.predictions?.success?.confidenceLevel || 'Medium'} confidence
                    </p>
                  </div>

                  {/* Retention Prediction */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center gap-2 mb-3">
                      <ClockIcon className="h-5 w-5 text-blue-600" />
                      <h3 className="font-medium text-blue-800">Retention Prediction</h3>
                    </div>
                    <div className="flex items-center justify-center mb-3">
                      <div className="relative w-20 h-20">
                        <svg className="w-20 h-20 transform -rotate-90">
                          <circle cx="40" cy="40" r="32" stroke="#dbeafe" strokeWidth="6" fill="none" />
                          <circle
                            cx="40" cy="40" r="32"
                            stroke={
                              predictions.data.predictions?.retention?.retentionRisk === 'Low' ? '#3b82f6' :
                              predictions.data.predictions?.retention?.retentionRisk === 'Medium' ? '#f59e0b' : '#ef4444'
                            }
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray={`${(predictions.data.predictions?.retention?.retentionProbability || 0) * 201} 201`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-blue-700">
                          {Math.round((predictions.data.predictions?.retention?.retentionProbability || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-center">
                      <span className={`font-medium ${
                        predictions.data.predictions?.retention?.retentionRisk === 'Low' ? 'text-green-600' :
                        predictions.data.predictions?.retention?.retentionRisk === 'Medium' ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {predictions.data.predictions?.retention?.retentionRisk || 'Medium'} Risk
                      </span>
                      <span className="text-gray-500"> • {predictions.data.predictions?.retention?.predictedTenure || '1-2 years'}</span>
                    </p>
                  </div>
                </div>

                {/* Success Factors Breakdown */}
                {predictions.data.predictions?.success?.factors && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Success Factors</h4>
                    <div className="space-y-2">
                      {Object.entries(predictions.data.predictions.success.factors).map(([key, factor]) => (
                        <div key={key} className="flex items-center gap-3">
                          <div className="w-28 text-xs text-gray-600 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                factor.score >= 70 ? 'bg-green-500' :
                                factor.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${factor.score}%` }}
                            />
                          </div>
                          <span className="w-10 text-xs text-gray-700 text-right">{factor.score}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risk Factors */}
                {(predictions.data.predictions?.success?.riskFactors?.length > 0 || 
                  predictions.data.predictions?.retention?.riskFactors?.length > 0) && (
                  <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                    <div className="flex items-center gap-2 mb-3">
                      <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                      <h4 className="font-medium text-red-800">Risk Factors</h4>
                    </div>
                    <ul className="text-sm text-red-700 space-y-1">
                      {predictions.data.predictions?.success?.riskFactors?.map((risk, idx) => (
                        <li key={`s-${idx}`}>• {risk.detail || risk}</li>
                      ))}
                      {predictions.data.predictions?.retention?.riskFactors?.map((risk, idx) => (
                        <li key={`r-${idx}`}>• {risk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {(predictions.data.predictions?.success?.recommendation || 
                  predictions.data.predictions?.retention?.recommendation) && (
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <h4 className="font-medium text-indigo-800 mb-2">AI Recommendations</h4>
                    {predictions.data.predictions?.success?.recommendation && (
                      <p className="text-sm text-indigo-700 mb-2">
                        <strong>Success:</strong> {predictions.data.predictions.success.recommendation}
                      </p>
                    )}
                    {predictions.data.predictions?.retention?.recommendation && (
                      <p className="text-sm text-indigo-700">
                        <strong>Retention:</strong> {predictions.data.predictions.retention.recommendation}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-400 text-center">
                  Generated: {predictions.data.generatedAt ? new Date(predictions.data.generatedAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            ) : predictionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <LightBulbIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="mb-2">Generate AI predictions for candidate success and retention</p>
                <p className="text-xs text-gray-400">Uses skills, experience, job stability, and career trajectory analysis</p>
              </div>
            )}
          </div>

          {/* Parsed Resume Information */}
          <div className="card border-l-4 border-purple-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-6 w-6 text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-900">Parsed Resume Information</h2>
              </div>
              <button
                onClick={() => reparseMutation.mutate()}
                disabled={reparseMutation.isPending}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center"
              >
                <ArrowPathIcon className={`h-4 w-4 mr-2 ${reparseMutation.isPending ? 'animate-spin' : ''}`} />
                {reparseMutation.isPending ? 'Parsing...' : 'Re-parse Resume'}
              </button>
            </div>

            {parsedResume?.resume_status === 'parsed' ? (
              <div className="space-y-4">
                {/* Parsing Confidence */}
                {parsedResume?.extraction_confidence && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Parsing Confidence:</span>
                    <span className={`font-medium ${
                      parsedResume.extraction_confidence >= 0.8 ? 'text-green-600' :
                      parsedResume.extraction_confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {Math.round(parsedResume.extraction_confidence * 100)}%
                    </span>
                  </div>
                )}

                {/* Extracted Summary */}
                {parsedResume?.extracted_summary && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Professional Summary</h4>
                    <p className="text-gray-700 text-sm">{parsedResume.extracted_summary}</p>
                  </div>
                )}

                {/* Extracted Skills */}
                {parsedResume?.extracted_skills?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <SparklesIcon className="h-5 w-5 mr-2 text-purple-600" />
                      Extracted Skills
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {parsedResume.extracted_skills.map((skill, idx) => {
                        const skillName = typeof skill === 'string' ? skill : skill?.name || '';
                        const isMatched = app?.required_skills?.some(rs => {
                          const rsName = typeof rs === 'string' ? rs : rs?.name || '';
                          return skillName.toLowerCase().includes(rsName.toLowerCase());
                        });
                        return (
                          <span
                            key={idx}
                            className={`px-3 py-1 rounded-full text-sm ${
                              isMatched
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {skillName}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Extracted Experience */}
                {parsedResume?.extracted_experience?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <BriefcaseIcon className="h-5 w-5 mr-2 text-purple-600" />
                      Work Experience
                    </h4>
                    <div className="space-y-3">
                      {parsedResume.extracted_experience.map((exp, idx) => (
                        <div key={idx} className="border-l-2 border-purple-200 pl-4">
                          <p className="font-medium text-gray-900">{exp.title || exp.position}</p>
                          <p className="text-purple-600">{exp.company || exp.organization}</p>
                          <p className="text-sm text-gray-500">
                            {exp.startDate || exp.start_date || ''} - {exp.endDate || exp.end_date || (exp.isCurrent ? 'Present' : '')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Education */}
                {parsedResume?.extracted_education?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <AcademicCapIcon className="h-5 w-5 mr-2 text-purple-600" />
                      Education
                    </h4>
                    <div className="space-y-3">
                      {parsedResume.extracted_education.map((edu, idx) => (
                        <div key={idx} className="border-l-2 border-purple-200 pl-4">
                          <p className="font-medium text-gray-900">
                            {edu.degree || edu.qualification} {edu.fieldOfStudy || edu.field_of_study ? `in ${edu.fieldOfStudy || edu.field_of_study}` : ''}
                          </p>
                          <p className="text-purple-600">{edu.institution || edu.school || edu.university}</p>
                          {edu.year || edu.endDate ? <p className="text-sm text-gray-500">{edu.year || edu.endDate}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Certifications */}
                {parsedResume?.extracted_certifications?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <CheckBadgeIcon className="h-5 w-5 mr-2 text-purple-600" />
                      Certifications
                    </h4>
                    <div className="space-y-2">
                      {parsedResume.extracted_certifications.map((cert, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckBadgeIcon className="h-4 w-4 text-green-600" />
                          <span className="text-gray-900">{typeof cert === 'string' ? cert : cert.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* References */}
                {parsedResume?.extracted_references?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <UserCircleIcon className="h-5 w-5 mr-2 text-purple-600" />
                      References
                    </h4>
                    {parsedResume.extracted_references[0]?.note ? (
                      <p className="text-sm text-gray-600 italic">{parsedResume.extracted_references[0].note}</p>
                    ) : (
                      <div className="space-y-3">
                        {parsedResume.extracted_references.map((ref, idx) => (
                          <div key={idx} className="border-l-2 border-purple-200 pl-4">
                            <p className="font-medium text-gray-900">{ref.name}</p>
                            {ref.title && <p className="text-sm text-gray-600">{ref.title}</p>}
                            {ref.company && <p className="text-sm text-purple-600">{ref.company}</p>}
                            {ref.relationship && (
                              <p className="text-xs text-gray-500">({ref.relationship})</p>
                            )}
                            <div className="flex gap-4 mt-1 text-sm">
                              {ref.email && (
                                <span className="flex items-center text-gray-600">
                                  <EnvelopeIcon className="h-3 w-3 mr-1" />
                                  {ref.email}
                                </span>
                              )}
                              {ref.phone && (
                                <span className="flex items-center text-gray-600">
                                  <PhoneIcon className="h-3 w-3 mr-1" />
                                  {ref.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <SparklesIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>
                  {parsedResume?.resume_status === 'processing' 
                    ? 'Resume is being parsed...' 
                    : parsedResume?.resume_status === 'failed'
                    ? 'Parsing failed. Click "Re-parse Resume" to try again.'
                    : 'Click "Re-parse Resume" to extract information from the CV'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Personal Information */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <UserCircleIcon className="h-5 w-5 mr-2 text-primary-600" />
              Personal Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="font-medium text-gray-900">{app?.first_name} {app?.last_name}</p>
              </div>
              {app?.candidate_email && (
                <div className="flex items-center gap-3">
                  <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                  <a href={`mailto:${app.candidate_email}`} className="text-primary-600 hover:text-primary-700">
                    {app.candidate_email}
                  </a>
                </div>
              )}
              {app?.phone && (
                <div className="flex items-center gap-3">
                  <PhoneIcon className="h-5 w-5 text-gray-400" />
                  <a href={`tel:${app.phone}`} className="text-gray-700">{app.phone}</a>
                </div>
              )}
              {app?.candidate_location && (
                <div className="flex items-center gap-3">
                  <MapPinIcon className="h-5 w-5 text-gray-400" />
                  <span className="text-gray-700">{app.candidate_location}</span>
                </div>
              )}
              {app?.current_job_title && (
                <div>
                  <p className="text-sm text-gray-500">Current Position</p>
                  <p className="font-medium text-gray-900">{app.current_job_title}</p>
                </div>
              )}
              {app?.years_of_experience && (
                <div>
                  <p className="text-sm text-gray-500">Experience</p>
                  <p className="font-medium text-gray-900">{app.years_of_experience} years</p>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.dateOfBirth && (
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Date of Birth</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.dateOfBirth}</p>
                  </div>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.nationality && (
                <div className="flex items-center gap-3">
                  <FlagIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Nationality</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.nationality}</p>
                  </div>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.gender && (
                <div className="flex items-center gap-3">
                  <UserIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Gender</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.gender}</p>
                  </div>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.maritalStatus && (
                <div className="flex items-center gap-3">
                  <HeartIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Marital Status</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.maritalStatus}</p>
                  </div>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.address && (
                <div className="flex items-center gap-3">
                  <HomeIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Address</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.address}</p>
                  </div>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.visaStatus && (
                <div className="flex items-center gap-3">
                  <IdentificationIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Visa/Work Authorization</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.visaStatus}</p>
                  </div>
                </div>
              )}
              {parsedResume?.extracted_personal_info?.drivingLicense && (
                <div className="flex items-center gap-3">
                  <IdentificationIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Driving License</p>
                    <p className="font-medium text-gray-900">{parsedResume.extracted_personal_info.drivingLicense}</p>
                  </div>
                </div>
              )}
              {app?.linkedin_url && (
                <div>
                  <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer" 
                     className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-2">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                    </svg>
                    LinkedIn Profile
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded CV */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-2 text-primary-600" />
              Uploaded CV
            </h2>
            {resumeUrl ? (
              <div className="space-y-3">
                <a
                  href={`http://localhost:5000${resumeUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                >
                  <DocumentTextIcon className="h-10 w-10 text-primary-600" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{resumeFilename}</p>
                    <p className="text-sm text-gray-600">Click to view</p>
                  </div>
                  <EyeIcon className="h-5 w-5 text-gray-400" />
                </a>
                <a
                  href={`http://localhost:5000${resumeUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary w-full text-center text-sm block"
                >
                  Download
                </a>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No CV uploaded</p>
            )}
          </div>

          {/* Application Timeline */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-primary-600" />
                <div>
                  <p className="font-medium text-gray-900">Application Submitted</p>
                  <p className="text-sm text-gray-600">
                    {app?.submitted_at 
                      ? new Date(app.submitted_at).toLocaleDateString('en-US', { 
                          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })
                      : app?.created_at 
                        ? new Date(app.created_at).toLocaleDateString('en-US', { 
                            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })
                        : 'Date not available'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resume Preview Modal */}
      {showResumeModal && resumeUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">{resumeFilename}</h3>
              <button
                onClick={() => setShowResumeModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <iframe
                src={`http://localhost:5000${resumeUrl}`}
                className="w-full h-full border-0 rounded"
                title="Resume Preview"
              />
            </div>

            <div className="p-4 border-t flex justify-end space-x-3">
              <a
                href={`http://localhost:5000${resumeUrl}`}
                download
                className="btn-secondary"
              >
                Download
              </a>
              <button
                onClick={() => setShowResumeModal(false)}
                className="btn-primary"
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

export default ApplicationDetails;
