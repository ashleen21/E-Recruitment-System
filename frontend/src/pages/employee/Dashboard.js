import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BriefcaseIcon,
  AcademicCapIcon,
  ClockIcon,
  SparklesIcon,
  DocumentTextIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI, skillsAPI } from '../../services/api';

const EmployeeDashboard = () => {
  const { data: profile } = useQuery({
    queryKey: ['employee-profile'],
    queryFn: () => employeesAPI.getProfile(),
  });

  const { data: opportunities } = useQuery({
    queryKey: ['internal-opportunities'],
    queryFn: () => employeesAPI.getInternalOpportunities(),
  });

  const { data: myApplications } = useQuery({
    queryKey: ['employee-my-applications'],
    queryFn: () => employeesAPI.getMyApplications(),
  });

  const { data: skillGaps } = useQuery({
    queryKey: ['skill-gaps'],
    queryFn: () => skillsAPI.getGaps(),
  });

  const employeeData = profile?.data || {};
  const opportunitiesList = opportunities?.data || [];
  const applicationsList = myApplications?.data || [];
  const gaps = skillGaps?.data || [];

  // Calculate career progress based on real data
  const careerProgress = useMemo(() => {
    const skills = employeeData.skills || [];
    const certifications = employeeData.certifications || [];
    const training = employeeData.training || [];
    
    // Calculate tenure
    const hireDate = employeeData.hire_date ? new Date(employeeData.hire_date) : null;
    const tenureMonths = hireDate ? Math.floor((new Date() - hireDate) / (1000 * 60 * 60 * 24 * 30)) : 0;
    const tenureYears = Math.floor(tenureMonths / 12);
    const tenureStr = tenureYears > 0 
      ? `${tenureYears} year${tenureYears !== 1 ? 's' : ''} ${tenureMonths % 12} months`
      : `${tenureMonths} month${tenureMonths !== 1 ? 's' : ''}`;

    // Progress calculation: tenure (40%) + skills (30%) + certifications (20%) + training (10%)
    const tenureScore = Math.min(tenureMonths / 60, 1) * 40; // Max at 5 years
    const skillScore = Math.min(skills.length / 10, 1) * 30; // Max at 10 skills
    const certScore = Math.min(certifications.length / 3, 1) * 20; // Max at 3 certs
    const trainingScore = Math.min(training.length / 5, 1) * 10; // Max at 5 training
    const progressPercent = Math.round(tenureScore + skillScore + certScore + trainingScore);

    // Determine current level based on progress
    let currentLevel = 'Entry Level';
    let nextLevel = 'Junior';
    if (progressPercent >= 80) {
      currentLevel = 'Senior';
      nextLevel = 'Lead';
    } else if (progressPercent >= 60) {
      currentLevel = 'Mid-Level';
      nextLevel = 'Senior';
    } else if (progressPercent >= 30) {
      currentLevel = 'Junior';
      nextLevel = 'Mid-Level';
    }

    // Generate milestones
    const milestones = [
      { title: 'Complete profile setup', completed: !!(employeeData.first_name && employeeData.job_title && employeeData.department) },
      { title: 'Add 5+ skills to profile', completed: skills.length >= 5 },
      { title: 'Upload resume/CV', completed: !!employeeData.resume_url },
      { title: 'Obtain 1+ certification', completed: certifications.length >= 1 },
      { title: 'Complete 1+ training course', completed: training.length >= 1 },
      { title: 'Reach 1 year tenure', completed: tenureMonths >= 12 },
    ];

    return {
      progressPercent,
      currentLevel,
      nextLevel,
      tenure: tenureStr,
      tenureMonths,
      skillsCount: skills.length,
      certsCount: certifications.length,
      trainingCount: training.length,
      milestones,
    };
  }, [employeeData]);

  // Generate learning recommendations based on skill gaps
  const learningRecommendations = useMemo(() => {
    const currentSkills = (employeeData.skills || []).map(s => (typeof s === 'string' ? s : s.name || '').toLowerCase());
    const currentGaps = (gaps || []).map(g => (typeof g === 'string' ? g : g.name || '').toLowerCase());
    const department = (employeeData.department || '').toLowerCase();
    const jobTitle = (employeeData.job_title || '').toLowerCase();

    // Comprehensive skill-to-learning mapping with real external URLs
    const skillLearningMap = {
      // Programming & Development
      javascript: { title: 'JavaScript - The Complete Guide', platform: 'Udemy', url: 'https://www.udemy.com/course/javascript-the-complete-guide-2020-beginner-advanced/', color: 'yellow', duration: '52 hours' },
      typescript: { title: 'Understanding TypeScript', platform: 'Udemy', url: 'https://www.udemy.com/course/understanding-typescript/', color: 'blue', duration: '15 hours' },
      python: { title: 'Python for Everybody', platform: 'Coursera', url: 'https://www.coursera.org/specializations/python', color: 'green', duration: '8 months' },
      java: { title: 'Java Programming Masterclass', platform: 'Udemy', url: 'https://www.udemy.com/course/java-the-complete-java-developer-course/', color: 'red', duration: '80 hours' },
      react: { title: 'React - The Complete Guide', platform: 'Udemy', url: 'https://www.udemy.com/course/react-the-complete-guide-incl-redux/', color: 'blue', duration: '48 hours' },
      'node.js': { title: 'Node.js Developer Course', platform: 'Udemy', url: 'https://www.udemy.com/course/the-complete-nodejs-developer-course-2/', color: 'green', duration: '35 hours' },
      angular: { title: 'Angular - The Complete Guide', platform: 'Udemy', url: 'https://www.udemy.com/course/the-complete-guide-to-angular-2/', color: 'red', duration: '34 hours' },
      vue: { title: 'Vue.js 3 Complete Guide', platform: 'Udemy', url: 'https://www.udemy.com/course/vuejs-2-the-complete-guide/', color: 'green', duration: '32 hours' },
      
      // Databases
      sql: { title: 'The Complete SQL Bootcamp', platform: 'Udemy', url: 'https://www.udemy.com/course/the-complete-sql-bootcamp/', color: 'blue', duration: '9 hours' },
      postgresql: { title: 'PostgreSQL Tutorial', platform: 'PostgreSQL Docs', url: 'https://www.postgresql.org/docs/current/tutorial.html', color: 'blue', duration: 'Self-paced' },
      mongodb: { title: 'MongoDB University', platform: 'MongoDB', url: 'https://university.mongodb.com/', color: 'green', duration: 'Self-paced' },
      mysql: { title: 'MySQL for Developers', platform: 'PlanetScale', url: 'https://planetscale.com/courses/mysql-for-developers', color: 'blue', duration: '4 hours' },
      
      // Cloud & DevOps
      aws: { title: 'AWS Certified Solutions Architect', platform: 'AWS Training', url: 'https://aws.amazon.com/training/learn-about/architect/', color: 'yellow', duration: '40 hours' },
      azure: { title: 'Microsoft Azure Fundamentals', platform: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/training/paths/az-900-describe-cloud-concepts/', color: 'blue', duration: '10 hours' },
      docker: { title: 'Docker Mastery', platform: 'Udemy', url: 'https://www.udemy.com/course/docker-mastery/', color: 'blue', duration: '20 hours' },
      kubernetes: { title: 'Kubernetes for Beginners', platform: 'KodeKloud', url: 'https://kodekloud.com/courses/kubernetes-for-the-absolute-beginners/', color: 'blue', duration: '6 hours' },
      devops: { title: 'DevOps Engineering Course', platform: 'Coursera', url: 'https://www.coursera.org/professional-certificates/devops-engineer', color: 'purple', duration: '3 months' },
      linux: { title: 'Linux Administration', platform: 'Linux Foundation', url: 'https://training.linuxfoundation.org/training/introduction-to-linux/', color: 'yellow', duration: '40 hours' },
      
      // Data & Analytics
      'data analysis': { title: 'Google Data Analytics', platform: 'Coursera', url: 'https://www.coursera.org/professional-certificates/google-data-analytics', color: 'blue', duration: '6 months' },
      'machine learning': { title: 'Machine Learning by Andrew Ng', platform: 'Coursera', url: 'https://www.coursera.org/learn/machine-learning', color: 'blue', duration: '60 hours' },
      'data science': { title: 'IBM Data Science Professional', platform: 'Coursera', url: 'https://www.coursera.org/professional-certificates/ibm-data-science', color: 'blue', duration: '10 months' },
      excel: { title: 'Excel Skills for Business', platform: 'Coursera', url: 'https://www.coursera.org/specializations/excel', color: 'green', duration: '6 months' },
      
      // Soft Skills
      leadership: { title: 'Leadership & Management', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/paths/become-a-leader', color: 'blue', duration: '15 hours' },
      communication: { title: 'Communication Skills', platform: 'Coursera', url: 'https://www.coursera.org/learn/wharton-communication-skills', color: 'purple', duration: '4 weeks' },
      'project management': { title: 'Google Project Management', platform: 'Coursera', url: 'https://www.coursera.org/professional-certificates/google-project-management', color: 'green', duration: '6 months' },
      agile: { title: 'Agile with Atlassian Jira', platform: 'Coursera', url: 'https://www.coursera.org/learn/agile-atlassian-jira', color: 'blue', duration: '15 hours' },
      scrum: { title: 'Scrum Master Certification', platform: 'Scrum.org', url: 'https://www.scrum.org/professional-scrum-master-i-certification', color: 'yellow', duration: '2 days' },
      presentation: { title: 'Powerful Presentation Skills', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/presentation-skills-effective-presentation-delivery', color: 'purple', duration: '1 hour' },
      negotiation: { title: 'Negotiation Fundamentals', platform: 'Coursera', url: 'https://www.coursera.org/learn/negotiation', color: 'green', duration: '4 weeks' },
      
      // HR & Business
      'human resources': { title: 'HR Management & Analytics', platform: 'Coursera', url: 'https://www.coursera.org/specializations/human-resource-management', color: 'purple', duration: '5 months' },
      recruitment: { title: 'Talent Acquisition', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/topics/talent-acquisition', color: 'blue', duration: '10 hours' },
      analytics: { title: 'Business Analytics', platform: 'Coursera', url: 'https://www.coursera.org/specializations/business-analytics', color: 'blue', duration: '6 months' },
    };

    // Role-based default recommendations
    const roleRecommendations = {
      hr: [
        { title: 'HR Analytics & People Data', platform: 'Coursera', url: 'https://www.coursera.org/learn/people-analytics', color: 'purple', duration: '4 weeks', skill: 'HR Analytics' },
        { title: 'Recruiting, Hiring, and Onboarding', platform: 'Coursera', url: 'https://www.coursera.org/learn/recruiting-hiring-onboarding-employees', color: 'blue', duration: '4 weeks', skill: 'Talent Management' },
      ],
      manager: [
        { title: 'Leadership Principles', platform: 'Harvard Online', url: 'https://online.hbs.edu/courses/leadership-principles/', color: 'red', duration: '6 weeks', skill: 'Leadership' },
        { title: 'Managing People', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/paths/become-a-manager', color: 'blue', duration: '12 hours', skill: 'People Management' },
      ],
      developer: [
        { title: 'Clean Code & Best Practices', platform: 'Udemy', url: 'https://www.udemy.com/course/writing-clean-code/', color: 'green', duration: '6 hours', skill: 'Code Quality' },
        { title: 'System Design', platform: 'Udemy', url: 'https://www.udemy.com/course/system-design-interview-prep/', color: 'blue', duration: '8 hours', skill: 'Architecture' },
      ],
      admin: [
        { title: 'IT Support Professional', platform: 'Coursera', url: 'https://www.coursera.org/professional-certificates/google-it-support', color: 'blue', duration: '6 months', skill: 'IT Support' },
        { title: 'System Administration', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/paths/become-a-system-administrator', color: 'green', duration: '20 hours', skill: 'Sys Admin' },
      ],
    };

    const recommendations = [];

    // First: Add recommendations for skill gaps (highest priority)
    currentGaps.forEach(gap => {
      const normalizedGap = gap.toLowerCase().trim();
      // Try exact match first
      if (skillLearningMap[normalizedGap]) {
        recommendations.push({ ...skillLearningMap[normalizedGap], skill: gap, priority: 'gap' });
      } else {
        // Try partial match
        const partialMatch = Object.entries(skillLearningMap).find(([key]) => 
          normalizedGap.includes(key) || key.includes(normalizedGap)
        );
        if (partialMatch) {
          recommendations.push({ ...partialMatch[1], skill: gap, priority: 'gap' });
        }
      }
    });

    // Second: Add role-based recommendations if we don't have enough
    if (recommendations.length < 3) {
      let roleKey = null;
      if (jobTitle.includes('hr') || department.includes('hr') || department.includes('human')) roleKey = 'hr';
      else if (jobTitle.includes('manager') || jobTitle.includes('lead') || jobTitle.includes('director')) roleKey = 'manager';
      else if (jobTitle.includes('developer') || jobTitle.includes('engineer') || jobTitle.includes('programmer')) roleKey = 'developer';
      else if (jobTitle.includes('admin') || jobTitle.includes('support') || jobTitle.includes('it')) roleKey = 'admin';

      if (roleKey && roleRecommendations[roleKey]) {
        roleRecommendations[roleKey].forEach(rec => {
          if (recommendations.length < 6 && !recommendations.some(r => r.url === rec.url)) {
            recommendations.push({ ...rec, priority: 'role' });
          }
        });
      }
    }

    // Third: Add general professional development if still not enough
    const generalCourses = [
      { title: 'Learning How to Learn', platform: 'Coursera', url: 'https://www.coursera.org/learn/learning-how-to-learn', color: 'blue', duration: '15 hours', skill: 'Learning Skills' },
      { title: 'Communication in the Workplace', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/communication-foundations-2', color: 'green', duration: '2 hours', skill: 'Communication' },
      { title: 'Time Management Fundamentals', platform: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/time-management-fundamentals', color: 'purple', duration: '1.5 hours', skill: 'Productivity' },
    ];

    generalCourses.forEach(course => {
      if (recommendations.length < 3 && !recommendations.some(r => r.url === course.url)) {
        recommendations.push({ ...course, priority: 'general' });
      }
    });

    return recommendations.slice(0, 3);
  }, [employeeData, gaps]);

  // Get application stats
  const applicationStats = useMemo(() => {
    const pending = applicationsList.filter(a => ['applied', 'screening', 'under_review'].includes(a.status)).length;
    const interviewing = applicationsList.filter(a => ['interview_scheduled', 'interview_completed'].includes(a.status)).length;
    const offered = applicationsList.filter(a => a.status === 'offered').length;
    return { pending, interviewing, offered, total: applicationsList.length };
  }, [applicationsList]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {employeeData.first_name || 'Employee'}!
        </h1>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card bg-gradient-to-br from-primary-500 to-primary-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-100 text-sm">Current Role</p>
              <p className="text-xl font-bold mt-1">{employeeData.job_title || 'N/A'}</p>
            </div>
            <BriefcaseIcon className="h-10 w-10 text-primary-200" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Department</p>
              <p className="text-xl font-bold mt-1">{employeeData.department || 'N/A'}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-full">
              <AcademicCapIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Tenure</p>
              <p className="text-xl font-bold mt-1">{careerProgress.tenure || 'New'}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <ClockIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Internal Openings</p>
              <p className="text-xl font-bold mt-1">{opportunitiesList.length}</p>
            </div>
            <div className="bg-purple-100 p-3 rounded-full">
              <SparklesIcon className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Applications Summary */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">My Applications</h2>
            <Link to="/employee/applications" className="text-primary-600 hover:text-primary-700 text-sm">
              View All →
            </Link>
          </div>

          {applicationsList.length > 0 ? (
            <>
              {/* Application Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{applicationStats.pending}</p>
                  <p className="text-xs text-gray-600">Pending</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{applicationStats.interviewing}</p>
                  <p className="text-xs text-gray-600">Interviewing</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{applicationStats.offered}</p>
                  <p className="text-xs text-gray-600">Offers</p>
                </div>
              </div>

              {/* Recent Applications List */}
              <div className="space-y-3">
                {applicationsList.slice(0, 3).map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{app.job_title}</p>
                      <p className="text-sm text-gray-500">{app.department} • {new Date(app.submitted_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                      app.status === 'offered' ? 'bg-green-100 text-green-800' :
                      app.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      app.status === 'withdrawn' ? 'bg-gray-100 text-gray-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {app.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <DocumentTextIcon className="h-10 w-10 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-600">No applications yet</p>
              <Link to="/employee/opportunities" className="text-sm text-primary-600 hover:text-primary-700">
                Browse internal opportunities →
              </Link>
            </div>
          )}
        </div>

        {/* Career Progress */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Career Progress</h2>
            <Link to="/employee/career" className="text-primary-600 hover:text-primary-700 text-sm">
              View Full Path →
            </Link>
          </div>
          
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Level Progress</span>
              <span className="text-sm font-medium">{careerProgress.currentLevel} → {careerProgress.nextLevel}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${careerProgress.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{careerProgress.progressPercent}% career development score</p>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
            <div className="p-2 bg-blue-50 rounded">
              <p className="font-semibold text-blue-800">{careerProgress.skillsCount}</p>
              <p className="text-xs text-gray-600">Skills</p>
            </div>
            <div className="p-2 bg-green-50 rounded">
              <p className="font-semibold text-green-800">{careerProgress.certsCount}</p>
              <p className="text-xs text-gray-600">Certifications</p>
            </div>
            <div className="p-2 bg-purple-50 rounded">
              <p className="font-semibold text-purple-800">{careerProgress.trainingCount}</p>
              <p className="text-xs text-gray-600">Training</p>
            </div>
          </div>

          <div className="space-y-2">
            {careerProgress.milestones.slice(0, 4).map((milestone, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {milestone.completed ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
                <span className={milestone.completed ? 'text-gray-500 line-through' : 'text-gray-900'}>
                  {milestone.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Internal Opportunities */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recommended Internal Opportunities</h2>
            <Link to="/employee/opportunities" className="text-primary-600 hover:text-primary-700 text-sm">
              View All →
            </Link>
          </div>

          {opportunitiesList.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {opportunitiesList.slice(0, 4).map((opp) => (
                <div key={opp.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{opp.title}</h3>
                      <p className="text-sm text-gray-600">{opp.department}</p>
                    </div>
                    {opp.matchScore && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        {opp.matchScore}% match
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
                    <span>{opp.location}</span>
                    <span>•</span>
                    <span>{opp.type}</span>
                  </div>
                  <div className="mt-3">
                    <Link
                      to={`/employee/opportunities/${opp.id}`}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <BriefcaseIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-500">No internal opportunities available right now</p>
              <p className="text-sm text-gray-400 mt-1">Check back later for new openings</p>
            </div>
          )}
        </div>

        {/* Recommended Learning - Based on Skill Gaps */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recommended Learning</h2>
            <span className="text-xs text-gray-500">Based on skills you need to develop</span>
          </div>
          {learningRecommendations.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-4">
              {learningRecommendations.map((resource, idx) => (
                <div key={idx} className={`p-4 bg-${resource.color}-50 rounded-lg border border-${resource.color}-100 hover:shadow-md transition-shadow`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded bg-${resource.color}-100 text-${resource.color}-700`}>
                      {resource.platform}
                    </span>
                    {resource.priority === 'gap' && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Skill Gap</span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 mt-1 line-clamp-2">{resource.title}</h3>
                  {resource.skill && (
                    <p className="text-xs text-gray-500 mt-1">Learn: {resource.skill}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    <ClockIcon className="inline h-4 w-4 mr-1" />
                    {resource.duration}
                  </p>
                  <a 
                    href={resource.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`mt-3 inline-flex items-center text-${resource.color}-600 hover:text-${resource.color}-700 text-sm font-medium`}
                  >
                    Start Learning
                    <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircleIcon className="h-12 w-12 mx-auto text-green-500 mb-2" />
              <p className="text-gray-600">Great job! You're on track with your skills.</p>
              <p className="text-sm text-gray-500 mt-1">Keep building your expertise through continuous learning.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
