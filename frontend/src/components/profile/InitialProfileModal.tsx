'use client';

import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal'; // Adjust path if Modal.tsx is elsewhere
import { useUserProfile, UserProfileUpdateData } from '../../context/UserProfileContext'; // Adjust path
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Helper function to format Date to YYYY-MM-DD string
const formatDateForAPI = (date: Date | null): string => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to parse YYYY-MM-DD string to Date object
const parseDateFromAPI = (dateString: string | null | undefined): Date | null => {
  if (!dateString) return null;
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in JS Date
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  return null; // Return null if parsing fails
};

interface InitialProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InitialProfileModal: React.FC<InitialProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile, isLoading: isProfileUpdating } = useUserProfile();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [nationality, setNationality] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [spokenLanguage, setSpokenLanguage] = useState('');
  const [preferredCommunicationMethod, setPreferredCommunicationMethod] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile) {
      setPhoneNumber(profile.phone_number || '');
      setFirstName(profile.user?.first_name || '');
      setLastName(profile.user?.last_name || '');
      setDateOfBirth(parseDateFromAPI(profile.date_of_birth));
      setNationality(profile.nationality || '');
      setHomeAddress(profile.home_address || '');
      setSpokenLanguage(profile.spoken_language || '');
      setPreferredCommunicationMethod(profile.preferred_communication_method || '');
      setTimeZone(profile.time_zone || '');
    } else {
      setPhoneNumber('');
      setFirstName('');
      setLastName('');
      setDateOfBirth(null);
      setNationality('');
      setHomeAddress('');
      setSpokenLanguage('');
      setPreferredCommunicationMethod('');
      setTimeZone('');
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!phoneNumber.trim()) {
      setError('Phone number is required.');
      setIsSubmitting(false);
      return;
    }
    if (!firstName.trim()) {
      setError('First name is required.');
      setIsSubmitting(false);
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required.');
      setIsSubmitting(false);
      return;
    }

    const updateData: UserProfileUpdateData = {
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      date_of_birth: formatDateForAPI(dateOfBirth),
      nationality: nationality,
      home_address: homeAddress,
      spoken_language: spokenLanguage,
      preferred_communication_method: preferredCommunicationMethod,
      time_zone: timeZone,
      is_initial_profile_complete: true,
    };

    const success = await updateProfile(updateData);
    if (success) {
      onClose(); // Close modal on successful update
    } else {
      setError('Failed to update profile. Please try again.');
    }
    setIsSubmitting(false);
  };

  // Do not render the modal if the profile is already initially complete
  // or if the profile is not yet loaded (to avoid flicker)
  if (!isOpen || !profile || profile.is_initial_profile_complete) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Complete Your Profile">
      <form 
        onSubmit={handleSubmit} 
        className="space-y-6 p-1 max-h-[70vh] overflow-y-auto"
      >
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="firstName"
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="Enter your first name"
            required
          />
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="lastName"
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="Enter your last name"
            required
          />
        </div>

        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            name="phoneNumber"
            id="phoneNumber"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="Enter your phone number"
            required
          />
        </div>

        <div>
          <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
            Date of Birth
          </label>
          <DatePicker
            selected={dateOfBirth}
            onChange={(date: Date | null) => setDateOfBirth(date)}
            dateFormat="MM/dd/yyyy"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholderText="MM/DD/YYYY"
            showYearDropdown
            showMonthDropdown
            dropdownMode="select"
            peekNextMonth
            showPreviousMonths
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="nationality" className="block text-sm font-medium text-gray-700 mb-1">
            Nationality
          </label>
          <input
            type="text"
            name="nationality"
            id="nationality"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="Enter your nationality"
          />
        </div>

        <div>
          <label htmlFor="homeAddress" className="block text-sm font-medium text-gray-700 mb-1">
            Home Address
          </label>
          <textarea
            name="homeAddress"
            id="homeAddress"
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            rows={3}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="Enter your full home address"
          />
        </div>

        <div>
          <label htmlFor="spokenLanguage" className="block text-sm font-medium text-gray-700 mb-1">
            Spoken Language(s)
          </label>
          <input
            type="text"
            name="spokenLanguage"
            id="spokenLanguage"
            value={spokenLanguage}
            onChange={(e) => setSpokenLanguage(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="e.g., English, Spanish, French"
          />
        </div>

        <div>
          <label htmlFor="preferredCommunicationMethod" className="block text-sm font-medium text-gray-700 mb-1">
            Preferred Communication Method
          </label>
          <input
            type="text"
            name="preferredCommunicationMethod"
            id="preferredCommunicationMethod"
            value={preferredCommunicationMethod}
            onChange={(e) => setPreferredCommunicationMethod(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="e.g., Email, Phone call, Video call"
          />
        </div>

        <div>
          <label htmlFor="timeZone" className="block text-sm font-medium text-gray-700 mb-1">
            Time Zone
          </label>
          <input
            type="text"
            name="timeZone"
            id="timeZone"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            placeholder="e.g., America/New_York, Europe/London, UTC"
          />
        </div>

        {error && <p className="text-sm text-red-600 text-center py-2">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isProfileUpdating}
            className="px-4 py-2 mr-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isProfileUpdating}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isSubmitting || isProfileUpdating ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default InitialProfileModal; 