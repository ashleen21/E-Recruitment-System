import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// HR Pages
import HRDashboard from './pages/hr/Dashboard';
import JobList from './pages/hr/JobList';
import JobForm from './pages/hr/JobForm';
import JobDetails from './pages/hr/JobDetails';
import JobDistribution from './pages/hr/JobDistribution';
import ApplicationList from './pages/hr/ApplicationList';
import ApplicationDetails from './pages/hr/ApplicationDetails';
import InterviewList from './pages/hr/InterviewList';
import EmployeeList from './pages/hr/EmployeeList';
import EmployeeDetails from './pages/hr/EmployeeDetails';
import Analytics from './pages/hr/Analytics';
import Reports from './pages/hr/Reports';

// Candidate Pages
import CandidateDashboard from './pages/candidate/Dashboard';
import CandidateProfile from './pages/candidate/Profile';
import JobSearch from './pages/candidate/JobSearch';
import MyApplications from './pages/candidate/MyApplications';
import MyInterviews from './pages/candidate/MyInterviews';

// Employee Pages
import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeProfile from './pages/employee/Profile';
import InternalOpportunities from './pages/employee/InternalOpportunities';
import EmployeeMyApplications from './pages/employee/MyApplications';
import EmployeeMyInterviews from './pages/employee/MyInterviews';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Role-based redirect
const RoleRedirect = () => {
  const { user } = useAuthStore();
  
  switch (user?.role) {
    case 'admin':
    case 'hr_manager':
    case 'recruiter':
      return <Navigate to="/hr/dashboard" replace />;
    case 'candidate':
      return <Navigate to="/candidate/dashboard" replace />;
    case 'employee':
      return <Navigate to="/employee/dashboard" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      {/* Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <RoleRedirect />} />
        <Route path="/register" element={!isAuthenticated ? <Register /> : <RoleRedirect />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      {/* HR Routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['admin', 'hr_manager', 'recruiter']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/hr/dashboard" element={<HRDashboard />} />
        <Route path="/hr/jobs" element={<JobList />} />
        <Route path="/hr/jobs/new" element={<JobForm />} />
        <Route path="/hr/jobs/:id/edit" element={<JobForm />} />
        <Route path="/hr/jobs/:id" element={<JobDetails />} />
        <Route path="/hr/job-distribution" element={<JobDistribution />} />
        <Route path="/hr/applications" element={<ApplicationList />} />
        <Route path="/hr/applications/:id" element={<ApplicationDetails />} />
        <Route path="/hr/interviews" element={<InterviewList />} />
        <Route path="/hr/employees" element={<EmployeeList />} />
        <Route path="/hr/employees/:id" element={<EmployeeDetails />} />
        <Route path="/hr/analytics" element={<Analytics />} />
        <Route path="/hr/reports" element={<Reports />} />
      </Route>

      {/* Candidate Routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['candidate']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
        <Route path="/candidate/profile" element={<CandidateProfile />} />
        <Route path="/candidate/jobs" element={<JobSearch />} />
        <Route path="/candidate/applications" element={<MyApplications />} />
        <Route path="/candidate/interviews" element={<MyInterviews />} />
      </Route>

      {/* Employee Routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['employee']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
        <Route path="/employee/profile" element={<EmployeeProfile />} />
        <Route path="/employee/opportunities" element={<InternalOpportunities />} />
        <Route path="/employee/applications" element={<EmployeeMyApplications />} />
        <Route path="/employee/interviews" element={<EmployeeMyInterviews />} />
      </Route>

      {/* Root redirect - Always start at login */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      
      {/* 404 */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
