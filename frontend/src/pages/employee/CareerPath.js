import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  LockClosedIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  ChartBarIcon,
  SparklesIcon,
  BookOpenIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI, skillsAPI } from '../../services/api';

const CareerPath = () => {
  const [selectedPath, setSelectedPath] = useState(null);

  const { data: careerData, isLoading } = useQuery({
    queryKey: ['career-path'],
    queryFn: () => employeesAPI.getCareerPath(),
  });

  const { data: skillGaps } = useQuery({
    queryKey: ['skill-gaps'],
    queryFn: () => skillsAPI.getGaps(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const pathData = careerData?.data || {};
  const gaps = skillGaps?.data || [];
  const paths = pathData.possiblePaths || [];
  const currentPosition = pathData.currentPosition || {};
  const milestones = pathData.milestones || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Career Path</h1>
        <p className="text-gray-600">Explore your growth opportunities and track your progress</p>
      </div>

      {/* Current Position */}
      <div className="card mb-6 bg-gradient-to-r from-primary-500 to-primary-600 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-primary-100 text-sm">Your Current Position</p>
            <h2 className="text-2xl font-bold mt-1">{currentPosition.title || 'N/A'}</h2>
            <p className="text-primary-200">{currentPosition.department} • Level {currentPosition.level}</p>
          </div>
          <div className="text-right">
            <p className="text-primary-100 text-sm">Time in Role</p>
            <p className="text-xl font-semibold">{currentPosition.tenure || '0'} months</p>
          </div>
        </div>
      </div>

      {/* Career Progress */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Progress Overview */}
        <div className="lg:col-span-2 card">
          <h3 className="text-lg font-semibold mb-4">Career Progression</h3>
          
          <div className="relative">
            {/* Progress Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
            
            <div className="space-y-6">
              {milestones.map((milestone, idx) => (
                <div key={idx} className="relative flex items-start gap-4">
                  <div className={`relative z-10 flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    milestone.completed 
                      ? 'bg-green-500 text-white' 
                      : milestone.current 
                        ? 'bg-primary-500 text-white ring-4 ring-primary-100' 
                        : 'bg-gray-200 text-gray-400'
                  }`}>
                    {milestone.completed ? (
                      <CheckCircleIcon className="h-6 w-6" />
                    ) : milestone.current ? (
                      <ArrowTrendingUpIcon className="h-6 w-6" />
                    ) : (
                      <LockClosedIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className={`flex-1 pb-6 ${!milestone.completed && !milestone.current ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">{milestone.title}</h4>
                      {milestone.date && (
                        <span className="text-sm text-gray-500">
                          {milestone.completed ? 'Achieved' : 'Target'}: {milestone.date}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                    {milestone.current && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">Progress</span>
                          <span className="text-xs font-medium">{milestone.progress || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary-500 h-2 rounded-full"
                            style={{ width: `${milestone.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Skills Gap */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Skills to Develop</h3>
          <div className="space-y-4">
            {gaps.length > 0 ? (
              gaps.map((skill, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{skill.name}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      skill.priority === 'high' ? 'bg-red-100 text-red-800' :
                      skill.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {skill.priority || 'Recommended'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full"
                        style={{ width: `${skill.currentLevel || 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{skill.currentLevel || 0}%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Target: {skill.targetLevel || 100}%</p>
                </div>
              ))
            ) : (
              <div className="text-center py-6">
                <CheckCircleIcon className="h-10 w-10 mx-auto text-green-500 mb-2" />
                <p className="text-gray-600">All skills on track!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Possible Career Paths */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold mb-4">Possible Career Paths</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {paths.map((path, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedPath(selectedPath?.id === path.id ? null : path)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedPath?.id === path.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${
                  path.type === 'management' ? 'bg-purple-100' :
                  path.type === 'technical' ? 'bg-blue-100' :
                  'bg-green-100'
                }`}>
                  {path.type === 'management' ? (
                    <BriefcaseIcon className="h-5 w-5 text-purple-600" />
                  ) : path.type === 'technical' ? (
                    <ChartBarIcon className="h-5 w-5 text-blue-600" />
                  ) : (
                    <SparklesIcon className="h-5 w-5 text-green-600" />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{path.name}</h4>
                  <p className="text-xs text-gray-500">{path.type} track</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{path.roles?.length || 0} positions</span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  {path.readiness || 0}% ready
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Path Details */}
      {selectedPath && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4">{selectedPath.name} Path</h3>
          
          <div className="flex items-center gap-4 overflow-x-auto pb-4">
            <div className="flex-shrink-0 p-4 bg-primary-100 border-2 border-primary-500 rounded-lg text-center min-w-[150px]">
              <p className="text-xs text-primary-600">Current</p>
              <p className="font-semibold text-gray-900">{currentPosition.title}</p>
            </div>
            
            {selectedPath.roles?.map((role, idx) => (
              <React.Fragment key={idx}>
                <ArrowRightIcon className="h-6 w-6 text-gray-400 flex-shrink-0" />
                <div className={`flex-shrink-0 p-4 border-2 rounded-lg text-center min-w-[150px] ${
                  role.achieved ? 'bg-green-50 border-green-500' : 'bg-gray-50 border-gray-200'
                }`}>
                  <p className="text-xs text-gray-500">{role.timeline || 'TBD'}</p>
                  <p className="font-semibold text-gray-900">{role.title}</p>
                  <p className="text-xs text-gray-500">Level {role.level}</p>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Required Skills for This Path</h4>
              <div className="space-y-2">
                {selectedPath.requiredSkills?.map((skill, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm text-gray-700">{skill.name}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      skill.acquired ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {skill.acquired ? 'Acquired' : 'Needed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Recommended Actions</h4>
              <div className="space-y-2">
                {selectedPath.actions?.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-blue-50 rounded">
                    <BookOpenIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-900">{action.title}</p>
                      <p className="text-xs text-gray-500">{action.type} • {action.duration}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Development Resources */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Development Resources</h3>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { title: 'Learning Portal', icon: AcademicCapIcon, description: 'Access courses and certifications', color: 'blue' },
            { title: 'Mentorship Program', icon: SparklesIcon, description: 'Connect with senior mentors', color: 'purple' },
            { title: 'Skills Assessment', icon: ChartBarIcon, description: 'Take skill evaluations', color: 'green' },
            { title: 'Career Coaching', icon: BriefcaseIcon, description: 'Book a session with HR', color: 'orange' },
          ].map((resource, idx) => (
            <button
              key={idx}
              className={`p-4 bg-${resource.color}-50 rounded-lg text-left hover:bg-${resource.color}-100 transition-colors`}
            >
              <resource.icon className={`h-8 w-8 text-${resource.color}-600 mb-2`} />
              <h4 className="font-medium text-gray-900">{resource.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{resource.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CareerPath;
