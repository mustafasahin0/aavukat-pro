'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { apiFetch } from '../lib/api'; // Ensure this path is correct

// Define the structure of the User object within UserProfile
interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

// Define the structure of LawyerDetails within UserProfile
interface LawyerDetails {
  bar_admission_details?: string | null;
  areas_of_practice?: string | null;
  office_location_address?: string | null;
  bio?: string | null;
  profile_picture_url?: string | null;
  years_of_experience?: number | null;
  education?: string | null;
  consultation_fee?: string | null; // Ensure backend sends as string if DecimalField
  languages_spoken?: string | null;
  website_url?: string | null;
  is_lawyer_specific_profile_complete: boolean;
}

// Define the main UserProfile structure
export interface UserProfile {
  user: User;
  role: 'client' | 'lawyer' | 'admin';
  phone_number: string | null;
  date_of_birth: string | null; // Or Date | null, but string for ISO consistency
  nationality: string | null;
  home_address: string | null;
  spoken_language: string | null;
  preferred_communication_method: string | null;
  time_zone: string | null;
  is_initial_profile_complete: boolean;
  lawyer_details: LawyerDetails | null;
}

interface UserProfileContextType {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfileUpdateData>) => Promise<boolean>; // Returns true on success
}

// Define the structure for data used in profile updates
// Allows partial updates for either top-level UserProfile fields or nested LawyerDetails
export interface UserProfileUpdateData {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string | null;
  nationality?: string | null;
  home_address?: string | null;
  spoken_language?: string | null;
  preferred_communication_method?: string | null;
  time_zone?: string | null;
  is_initial_profile_complete?: boolean;
  lawyer_details?: Partial<LawyerDetails>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export const UserProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user: cognitoUser, route } = useAuthenticator((context) => [context.user, context.route]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (route !== 'authenticated' || !cognitoUser) {
      setProfile(null);
      // setIsLoading(false); // Don't set to false if not authenticated, let initial true remain or manage differently
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/users/profile/');
      setProfile(data as UserProfile);
    } catch (e: unknown) {
      console.error('Failed to fetch user profile:', e);
      let message = 'Failed to load profile.';
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === 'string') {
        message = e;
      }
      setError(message);
      setProfile(null); // Clear profile on error
    } finally {
      setIsLoading(false);
    }
  }, [cognitoUser, route]);

  useEffect(() => {
    // Only fetch if authenticated, to avoid an initial fetch attempt that will fail.
    if (route === 'authenticated' && cognitoUser) {
      fetchProfile();
    } else {
      // If not authenticated, ensure loading is false and profile is null.
      setIsLoading(false);
      setProfile(null);
    }
  }, [cognitoUser, route, fetchProfile]);

  const updateProfile = async (data: Partial<UserProfileUpdateData>): Promise<boolean> => {
    if (!profile) {
      setError('No profile loaded to update.');
      return false;
    }
    setIsLoading(true); // Consider a different loading state for updates, e.g., isUpdating
    try {
      const updatedProfileData = await apiFetch('/users/profile/', {
        method: 'PATCH', // Use PATCH for partial updates
        body: JSON.stringify(data),
      });
      setProfile(updatedProfileData as UserProfile);
      setError(null);
      return true;
    } catch (e: unknown) {
      console.error('Failed to update profile:', e);
      let message = 'Failed to update profile.';
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === 'string') {
        message = e;
      }
      setError(message);
      // Optionally re-fetch profile to revert optimistic updates or ensure consistency
      // await fetchProfile(); 
      return false;
    } finally {
      setIsLoading(false); // Or setIsUpdating(false)
    }
  };

  return (
    <UserProfileContext.Provider value={{ profile, isLoading, error, fetchProfile, updateProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
};

export const useUserProfile = (): UserProfileContextType => {
  const context = useContext(UserProfileContext);
  if (context === undefined) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}; 