'use client';

import React, { useState, useEffect } from 'react';
import { useUserProfile } from '../../context/UserProfileContext';
import InitialProfileModal from './InitialProfileModal';
import LawyerProfileModal from './LawyerProfileModal';

const ProfileCompletionModals: React.FC = () => {
  const { profile, isLoading } = useUserProfile();
  const [isInitialModalOpen, setIsInitialModalOpen] = useState(false);
  const [isLawyerModalOpen, setIsLawyerModalOpen] = useState(false);

  useEffect(() => {
    if (isLoading || !profile) {
      setIsInitialModalOpen(false);
      setIsLawyerModalOpen(false);
      return;
    }

    // If user is an admin, they don't need to complete these profiles
    if (profile.role === 'admin') {
      setIsInitialModalOpen(false);
      setIsLawyerModalOpen(false);
      return;
    }

    // Logic for Initial Profile Modal (for non-admins)
    if (!profile.is_initial_profile_complete) {
      setIsInitialModalOpen(true);
      setIsLawyerModalOpen(false); 
      return; 
    } else {
      setIsInitialModalOpen(false); 
    }

    // Logic for Lawyer Profile Modal (only if initial is complete and user is a lawyer)
    if (profile.role === 'lawyer' && !profile.lawyer_details?.is_lawyer_specific_profile_complete) {
      setIsLawyerModalOpen(true);
    } else {
      setIsLawyerModalOpen(false); 
    }

  }, [profile, isLoading]);

  if (isLoading && (!isInitialModalOpen && !isLawyerModalOpen)) {
    // Only return null if modals are not yet supposed to be open AND we are loading
    // This prevents modals from closing if profile re-fetches while a modal is open.
    return null; 
  }

  return (
    <>
      <InitialProfileModal 
        isOpen={isInitialModalOpen} 
        onClose={() => setIsInitialModalOpen(false)} 
      />
      <LawyerProfileModal 
        isOpen={isLawyerModalOpen} 
        onClose={() => setIsLawyerModalOpen(false)} 
      />
    </>
  );
};

export default ProfileCompletionModals; 