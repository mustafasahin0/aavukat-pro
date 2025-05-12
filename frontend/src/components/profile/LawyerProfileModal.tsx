'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import Modal from '../ui/Modal';
import { useUserProfile, UserProfileUpdateData, UserProfile } from '../../context/UserProfileContext';

interface LawyerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to safely access lawyer details
function getLawyerDetail<K extends keyof NonNullable<UserProfile['lawyer_details']>>(
  profile: UserProfile | null,
  key: K
): NonNullable<UserProfile['lawyer_details']>[K] | '' {
  return profile?.lawyer_details?.[key] ?? '';
}

const LawyerProfileModal: React.FC<LawyerProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile, isLoading: isProfileUpdating } = useUserProfile();

  // Form state
  const [barDetails, setBarDetails] = useState('');
  const [practiceAreas, setPracticeAreas] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [experience, setExperience] = useState<string>(''); // string to handle empty input
  const [education, setEducation] = useState('');
  const [consultationFee, setConsultationFee] = useState<string>(''); // string for input
  const [languages, setLanguages] = useState('');
  const [website, setWebsite] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.lawyer_details) {
      setBarDetails(getLawyerDetail(profile, 'bar_admission_details') as string);
      setPracticeAreas(getLawyerDetail(profile, 'areas_of_practice') as string);
      setOfficeAddress(getLawyerDetail(profile, 'office_location_address') as string);
      setBio(getLawyerDetail(profile, 'bio') as string);
      setProfilePicUrl(getLawyerDetail(profile, 'profile_picture_url') as string);
      setExperience(String(getLawyerDetail(profile, 'years_of_experience') || ''));
      setEducation(getLawyerDetail(profile, 'education') as string);
      setConsultationFee(String(getLawyerDetail(profile, 'consultation_fee') || ''));
      setLanguages(getLawyerDetail(profile, 'languages_spoken') as string);
      setWebsite(getLawyerDetail(profile, 'website_url') as string);
    } else {
      // Optionally reset fields if profile changes or has no lawyer_details
    }
  }, [profile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const parsedExperience = experience ? parseInt(experience, 10) : null;
    if (experience && Number.isNaN(parsedExperience)) {
      setError('Years of experience must be a number.');
      setIsSubmitting(false);
      return;
    }
    const parsedFee = consultationFee ? parseFloat(consultationFee) : null;
    if (consultationFee && Number.isNaN(parsedFee)) {
      setError('Consultation fee must be a valid number.');
      setIsSubmitting(false);
      return;
    }


    const lawyerData: UserProfileUpdateData['lawyer_details'] = {
      bar_admission_details: barDetails,
      areas_of_practice: practiceAreas,
      office_location_address: officeAddress,
      bio: bio,
      profile_picture_url: profilePicUrl,
      years_of_experience: parsedExperience,
      education: education,
      consultation_fee: parsedFee ? String(parsedFee) : null, // Send as string if backend expects string for Decimal
      languages_spoken: languages,
      website_url: website,
      is_lawyer_specific_profile_complete: true,
    };

    const success = await updateProfile({ lawyer_details: lawyerData });

    if (success) {
      onClose();
    } else {
      setError('Failed to update lawyer profile. Please try again.');
    }
    setIsSubmitting(false);
  };
  
  // Do not render if not a lawyer, or profile already complete, or profile not loaded
  if (!isOpen || !profile || profile.role !== 'lawyer' || profile.lawyer_details?.is_lawyer_specific_profile_complete) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Your Lawyer Profile" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        {/* Bar Admission Details */}
        <div>
          <label htmlFor="barDetails" className="block text-sm font-medium text-gray-700">Bar Admission Details (e.g., State: NY, Bar Number: 12345)</label>
          <textarea id="barDetails" value={barDetails} onChange={(e) => setBarDetails(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Areas of Practice */}
        <div>
          <label htmlFor="practiceAreas" className="block text-sm font-medium text-gray-700">Areas of Practice (comma-separated)</label>
          <input type="text" id="practiceAreas" value={practiceAreas} onChange={(e) => setPracticeAreas(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Office Location Address */}
        <div>
          <label htmlFor="officeAddress" className="block text-sm font-medium text-gray-700">Office Location Address</label>
          <textarea id="officeAddress" value={officeAddress} onChange={(e) => setOfficeAddress(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Bio */}
        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700">Professional Bio</label>
          <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>
        
        {/* Profile Picture URL */}
        <div>
          <label htmlFor="profilePicUrl" className="block text-sm font-medium text-gray-700">Profile Picture URL</label>
          <input type="url" id="profilePicUrl" value={profilePicUrl} onChange={(e) => setProfilePicUrl(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Years of Experience */}
        <div>
          <label htmlFor="experience" className="block text-sm font-medium text-gray-700">Years of Experience</label>
          <input type="number" id="experience" value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="e.g., 5" className="mt-1 block w-full md:w-1/2 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Education */}
        <div>
          <label htmlFor="education" className="block text-sm font-medium text-gray-700">Education (e.g., Law School, Graduation Year)</label>
          <input type="text" id="education" value={education} onChange={(e) => setEducation(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>
        
        {/* Consultation Fee */}
        <div>
          <label htmlFor="consultationFee" className="block text-sm font-medium text-gray-700">Consultation Fee (USD)</label>
          <input type="number" step="0.01" id="consultationFee" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value)} placeholder="e.g., 150.00" className="mt-1 block w-full md:w-1/2 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Languages Spoken */}
        <div>
          <label htmlFor="languages" className="block text-sm font-medium text-gray-700">Languages Spoken (comma-separated)</label>
          <input type="text" id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {/* Website URL */}
        <div>
          <label htmlFor="website" className="block text-sm font-medium text-gray-700">Website URL</label>
          <input type="url" id="website" value={website} onChange={(e) => setWebsite(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 text-gray-900" />
        </div>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="flex justify-end pt-4 sticky bottom-0 bg-white py-3">
          <button type="button" onClick={onClose} disabled={isSubmitting || isProfileUpdating} className="px-4 py-2 mr-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || isProfileUpdating} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:opacity-50">
            {isSubmitting || isProfileUpdating ? 'Saving...' : 'Save Lawyer Profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default LawyerProfileModal; 