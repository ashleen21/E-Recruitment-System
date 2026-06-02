import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AcademicCapIcon,
  ChartBarIcon,
  SparklesIcon,
  BriefcaseIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI } from '../../services/api';
import toast from 'react-hot-toast';

const CareerPath = () => {
  const queryClient = useQueryClient();
  const { data: careerData, isLoading } = useQuery({
    queryKey: ['career-path'],
    queryFn: () => employeesAPI.getCareerPaths(),
  });

  const generateMutation = useMutation({
    mutationFn: () => employeesAPI.generateCareerPaths(),
    onSuccess: (response) => {
      queryClient.setQueryData(['career-path'], response);
      queryClient.invalidateQueries({ queryKey: ['career-path'] });
      toast.success('Career paths generated');
    },
    onError: () => toast.error('Failed to generate career paths'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const recommendations = careerData?.data?.recommendations || [];
  const skillContext = careerData?.data?.skill_context;

  const freshnessStyle = (freshness) => {
    if (freshness === 'fresh') return 'bg-emerald-100 text-emerald-700';
    if (freshness === 'aging') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Career Path</h1>
          <p className="text-gray-600">Explore your growth opportunities and track your progress</p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
        >
          <SparklesIcon className="h-4 w-4" />
          {generateMutation.isPending ? 'Generating...' : 'Generate Career Paths'}
        </button>
      </div>

      {skillContext?.skills?.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-3">Skill Freshness</h3>
          <p className="text-sm text-gray-600 mb-3">
            Freshness uses the same resume and profile data HR sees on your applications.
            {skillContext.source && (
              <span className="ml-1 text-gray-500">(primary: {skillContext.source})</span>
            )}
            {skillContext.summary && (
              <span className="ml-1">
                — {skillContext.summary.fresh || 0} fresh, {skillContext.summary.aging || 0} aging, {skillContext.summary.stale || 0} stale
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {skillContext.skills.map((skill, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-800">
                {skill.name}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${freshnessStyle(skill.freshness)}`}>
                  {skill.freshness === 'fresh' ? 'Fresh' : skill.freshness === 'aging' ? 'Aging' : 'Stale'}
                </span>
              </span>
            ))}
          </div>
          {skillContext.certifications?.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Certifications</p>
              <div className="space-y-1">
                {skillContext.certifications.map((cert, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-800">{cert.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      cert.status === 'Expired' ? 'bg-red-100 text-red-700' :
                      cert.status === 'Expiring Soon' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {cert.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Career Path Recommendations */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold mb-4">Recommended Next Roles</h3>
        {recommendations.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <SparklesIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p>No recommendations yet. Use Generate Career Paths to create new suggestions.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {recommendations.slice(0, 3).map((rec, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <ChartBarIcon className="h-5 w-5 text-primary-600" />
                  <h4 className="font-semibold text-gray-900">{rec.role}</h4>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-gray-500">Match</p>
                    <p className="font-semibold text-gray-900">{rec.match_percentage}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Readiness</p>
                    <p className="font-semibold text-gray-900">{rec.readiness_score}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Success</p>
                    <p className="font-semibold text-gray-900">{Math.round((rec.success_probability || 0) * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Time</p>
                    <p className="font-semibold text-gray-900">{rec.estimated_time_months} mo</p>
                  </div>
                </div>
                {rec.skill_gaps?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-600 mb-1">Skill Gaps</p>
                    <div className="flex flex-wrap gap-1">
                      {rec.skill_gaps.map((skill, sIdx) => (
                        <span key={sIdx} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {rec.training_recommendations?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-600 mb-1">Training</p>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {rec.training_recommendations.map((training, tIdx) => (
                        <li key={tIdx} className="flex items-start gap-2">
                          <BookOpenIcon className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                          <span>{training}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {rec.explanation && (
                  <p className="text-xs text-gray-600">{rec.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default CareerPath;
