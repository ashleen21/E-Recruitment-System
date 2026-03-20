import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { notificationsAPI } from '../services/api';
import {
  HomeIcon,
  BriefcaseIcon,
  UsersIcon,
  CalendarIcon,
  ChartBarIcon,
  DocumentTextIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  ShareIcon,
  BellIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications (poll every 30 seconds)
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsAPI.getAll({ limit: 10 }).then(res => res.data),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifData?.unreadCount || 0;

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsAPI.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id) => notificationsAPI.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleNotifClick = (notif) => {
    // Navigate first, then delete the notification
    if (notif.link) {
      navigate(notif.link);
      setNotifOpen(false);
    }
    // Delete the notification after clicking (auto-clear)
    deleteNotificationMutation.mutate(notif.id);
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'job_match': return '💼';
      case 'job_match_hr': return '👥';
      case 'skill_update': return '🎯';
      case 'document_parsed': return '📄';
      case 'employee_update': return '👤';
      case 'application_shortlist': return '⭐';
      case 'application_interview': return '📅';
      case 'application_offer': return '🎉';
      case 'application_hired': return '🎊';
      case 'application_rejected': return '❌';
      case 'application_review': return '🔍';
      default: 
        if (type?.startsWith('application_')) return '📋';
        return '🔔';
    }
  };

  const formatTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getNavigation = () => {
    const role = user?.role;

    if (['admin', 'hr_manager', 'recruiter'].includes(role)) {
      return [
        { name: 'Dashboard', href: '/hr/dashboard', icon: HomeIcon },
        { name: 'Job Postings', href: '/hr/jobs', icon: BriefcaseIcon },
        { name: 'Job Distribution', href: '/hr/job-distribution', icon: ShareIcon },
        { name: 'Applications', href: '/hr/applications', icon: DocumentTextIcon },
        { name: 'Interviews', href: '/hr/interviews', icon: CalendarIcon },
        { name: 'Employees', href: '/hr/employees', icon: UsersIcon },
        { name: 'Analytics', href: '/hr/analytics', icon: ChartBarIcon },
        { name: 'Reports', href: '/hr/reports', icon: DocumentTextIcon },
      ];
    }

    if (role === 'candidate') {
      return [
        { name: 'Dashboard', href: '/candidate/dashboard', icon: HomeIcon },
        { name: 'My Profile', href: '/candidate/profile', icon: UserCircleIcon },
        { name: 'Job Search', href: '/candidate/jobs', icon: MagnifyingGlassIcon },
        { name: 'My Applications', href: '/candidate/applications', icon: DocumentTextIcon },
        { name: 'My Interviews', href: '/candidate/interviews', icon: CalendarIcon },
      ];
    }

    if (role === 'employee') {
      return [
        { name: 'Dashboard', href: '/employee/dashboard', icon: HomeIcon },
        { name: 'My Profile', href: '/employee/profile', icon: UserCircleIcon },
        { name: 'Internal Opportunities', href: '/employee/opportunities', icon: BuildingOfficeIcon },
        { name: 'My Applications', href: '/employee/applications', icon: DocumentTextIcon },
        { name: 'My Interviews', href: '/employee/interviews', icon: CalendarIcon },
      ];
    }

    return [];
  };

  const navigation = getNavigation();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <span className="text-xl font-bold text-primary-600">E Recruitement</span>
            <button onClick={() => setSidebarOpen(false)}>
              <XMarkIcon className="h-6 w-6 text-gray-500" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-4 py-3 mb-1 rounded-lg transition-colors ${
                  location.pathname === item.href
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-5 w-5 mr-3" />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex h-16 items-center px-6 border-b">
            <span className="text-xl font-bold text-primary-600">E Recruitement</span>
          </div>
          <nav className="flex-1 overflow-y-auto p-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-4 py-3 mb-1 rounded-lg transition-colors ${
                  location.pathname === item.href
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="h-5 w-5 mr-3" />
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t">
            <div className="flex items-center mb-4">
              <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-primary-700 font-medium">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-8">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6 text-gray-500" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            {/* Notifications Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
              >
                <BellIcon className="h-6 w-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-500 text-white text-xs font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllReadMutation.mutate()}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-500">
                        <BellIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                            !notif.is_read ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <div className="flex gap-3">
                            <span className="text-lg flex-shrink-0 mt-0.5">{getNotifIcon(notif.type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${!notif.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                {notif.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(notif.created_at)}</p>
                            </div>
                            {!notif.is_read && (
                              <span className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-2" />
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <span className="text-sm text-gray-600">
              Welcome, {user?.firstName}!
            </span>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
