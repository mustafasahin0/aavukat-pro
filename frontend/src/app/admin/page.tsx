'use client';

import React, { useEffect, useState } from 'react';
import withRole from '../../components/withRole';
import { apiFetch } from '../../lib/api';

// Use the UserProfile interface from UserProfileContext if it's shareable
// For now, defining a similar one here for clarity based on what UserProfileSerializer provides.
interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
}

interface LawyerDetails {
  bar_admission_details?: string | null;
  areas_of_practice?: string | null;
  // ... other fields from users.serializers.LawyerProfileSerializer
  is_lawyer_specific_profile_complete: boolean;
}

// This should match the structure from users.serializers.UserProfileSerializer
interface UserProfile {
  id: number;
  user: User;
  role: 'client' | 'lawyer' | 'admin';
  phone_number: string | null;
  is_initial_profile_complete: boolean;
  lawyer_details: LawyerDetails | null;
}

function AdminDashboard() {
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUserProfiles = async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const allProfilesData = await apiFetch('/users/admin/user-profiles/');
      setUserProfiles(allProfilesData as UserProfile[]);
    } catch (e) {
      console.error('Failed to load user profiles', e);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfiles();
  }, []);

  const handleDeleteUser = async (profileId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user ${username} (Profile ID: ${profileId})? This action is permanent.`)) return;
    setActionError(null);
    try {
      await apiFetch(`/users/admin/user-profiles/${profileId}/`, { method: 'DELETE' });
      alert(`User ${username} deleted successfully.`);
      fetchUserProfiles();
    } catch (e: unknown) {
      console.error('Failed to delete user', e);
      const errorMessage = e instanceof Error ? e.message : 'Server error';
      setActionError(`Failed to delete user ${username}: ${errorMessage}`);
      alert(`Failed to delete user ${username}: ${errorMessage}`);
    }
  };

  const handleSetRole = async (profileId: number, username: string, newRole: 'client' | 'lawyer') => {
    const actionText = newRole === 'lawyer' ? 'promote' : 'demote';
    if (!confirm(`Are you sure you want to ${actionText} user ${username} to ${newRole}?`)) return;
    setActionError(null);
    try {
      await apiFetch(`/users/admin/user-profiles/${profileId}/set-role/`, {
        method: 'POST',
        body: JSON.stringify({ role: newRole }),
        headers: { 'Content-Type': 'application/json' },
      });
      alert(`User ${username} ${actionText}d to ${newRole} successfully.`);
      fetchUserProfiles();
    } catch (e: unknown) {
      console.error(`Failed to ${actionText} user`, e);
      const errorMessage = e instanceof Error ? e.message : 'Server error';
      setActionError(`Failed to ${actionText} user ${username}: ${errorMessage}`);
      alert(`Failed to ${actionText} user ${username}: ${errorMessage}`);
    }
  };

  const handleSetActiveStatus = async (profileId: number, username: string, isActive: boolean) => {
    const actionText = isActive ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${actionText} user ${username}?`)) return;
    setActionError(null);
    try {
      await apiFetch(`/users/admin/user-profiles/${profileId}/set-active-status/`, {
        method: 'POST',
        body: JSON.stringify({ is_active: isActive }),
        headers: { 'Content-Type': 'application/json' },
      });
      alert(`User ${username} ${actionText}d successfully.`);
      fetchUserProfiles();
    } catch (e: unknown) {
      console.error(`Failed to ${actionText} user`, e);
      const errorMessage = e instanceof Error ? e.message : 'Server error';
      setActionError(`Failed to ${actionText} user ${username}: ${errorMessage}`);
      alert(`Failed to ${actionText} user ${username}: ${errorMessage}`);
    }
  };

  if (loading && userProfiles.length === 0) return <div className="p-6">Loading user data...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;
  const ActionErrorMessage = actionError ? <div className="p-6 my-2 text-red-700 bg-red-100 border border-red-700 rounded">Action Error: {actionError}</div> : null;

  const renderUserTable = (profiles: UserProfile[], type: 'lawyer' | 'client') => {
    if (profiles.length === 0) {
      return <p>No {type}s found.</p>;
    }
    return (
      <table className="min-w-full bg-white border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-4 py-2 text-left text-xs text-gray-600 font-semibold border-b border-gray-300">ID</th>
            <th className="px-4 py-2 text-left text-xs text-gray-600 font-semibold border-b border-gray-300">Username</th>
            <th className="px-4 py-2 text-left text-xs text-gray-600 font-semibold border-b border-gray-300">Name</th>
            <th className="px-4 py-2 text-left text-xs text-gray-600 font-semibold border-b border-gray-300">Email</th>
            <th className="px-4 py-2 text-left text-xs text-gray-600 font-semibold border-b border-gray-300">Status</th>
            <th className="px-4 py-2 text-left text-xs text-gray-600 font-semibold border-b border-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody className="text-gray-900">
          {profiles.map((profile) => (
            <tr key={profile.id} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-2 text-sm">{profile.user.id} (P:{profile.id})</td>
              <td className="px-4 py-2 text-sm">{profile.user.username}</td>
              <td className="px-4 py-2 text-sm">{profile.user.first_name} {profile.user.last_name}</td>
              <td className="px-4 py-2 text-sm">{profile.user.email}</td>
              <td className="px-4 py-2 text-sm">{profile.user.is_active ? 
                <span className="text-green-600">Active</span> : 
                <span className="text-red-600">Disabled</span>}
              </td>
              <td className="space-x-1 whitespace-nowrap">
                {profile.user.is_active ? (
                  <button 
                    onClick={() => handleSetActiveStatus(profile.id, profile.user.username, false)}
                    className="bg-yellow-500 hover:bg-yellow-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Disable
                  </button>
                ) : (
                  <button 
                    onClick={() => handleSetActiveStatus(profile.id, profile.user.username, true)}
                    className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Enable
                  </button>
                )}
                {type === 'client' && (
                  <button 
                    onClick={() => handleSetRole(profile.id, profile.user.username, 'lawyer')}
                    className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Promote to Lawyer
                  </button>
                )}
                {type === 'lawyer' && (
                  <button 
                    onClick={() => handleSetRole(profile.id, profile.user.username, 'client')}
                    className="bg-purple-500 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Demote to Client
                  </button>
                )}
                <button 
                  onClick={() => handleDeleteUser(profile.id, profile.user.username)}
                  className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const lawyers = userProfiles.filter(p => p.role === 'lawyer');
  const clients = userProfiles.filter(p => p.role === 'client');
  // Optional: const admins = userProfiles.filter(p => p.role === 'admin');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin Dashboard - User Management</h1>
      {ActionErrorMessage}
      {loading && userProfiles.length > 0 && <div className="p-2 text-blue-500">Refreshing user data...</div>}      
      {/* Lawyers Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Lawyers ({lawyers.length})</h2>
        {renderUserTable(lawyers, 'lawyer')}
      </div>

      {/* Clients Section */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Clients ({clients.length})</h2>
        {renderUserTable(clients, 'client')}
      </div>
    </div>
  );
}

export default withRole(AdminDashboard, ['admins']); 