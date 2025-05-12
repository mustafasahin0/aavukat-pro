// Use client component for interactivity
'use client';

import React, { useEffect, useState, useMemo } from 'react';
// import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';

interface Lawyer {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    username: string;
    email: string;
  };
}

interface Slot {
  start: string;
  end: string;
}

interface GroupedSlots {
  [dateKey: string]: Slot[];
}

// Define a type for potential API errors
interface ApiError extends Error {
  response?: {
    data?: {
      detail?: string;
      [key: string]: unknown; // Allow other properties in data
    };
    [key: string]: unknown; // Allow other properties in response
  };
}

export default function ClientBooking() {
  // const { user } = useAuth();
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [selectedLawyer, setSelectedLawyer] = useState<number | ''>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookingMessage, setBookingMessage] = useState('');
  const [isLoadingLawyers, setIsLoadingLawyers] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  useEffect(() => {
    async function loadLawyers() {
      setIsLoadingLawyers(true);
      try {
        const data = await apiFetch('/client/lawyers/');
        setLawyers(data as Lawyer[]);
      } catch (e) {
        console.error('Failed to load lawyers', e);
        setBookingMessage('Error: Could not load lawyers.');
      } finally {
        setIsLoadingLawyers(false);
      }
    }
    loadLawyers();
  }, []);

  const onLawyerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? parseInt(e.target.value) : '';
    setSelectedLawyer(id);
    setSlots([]);
    setBookingMessage('');
    if (id) {
      setIsLoadingSlots(true);
      try {
        const data = await apiFetch(`/appointments/available_slots?lawyer_id=${id}`);
        // Ensure slots are sorted by start time before grouping
        const sortedSlots = (data as Slot[]).sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        setSlots(sortedSlots);
      } catch (e) {
        console.error('Failed to load slots', e);
        setBookingMessage('Error: Could not load available slots.');
      } finally {
        setIsLoadingSlots(false);
      }
    }
  };

  const bookSlot = async (slot: Slot) => {
    if (!selectedLawyer) return;
    setBookingMessage('Processing your booking...'); // Optimistic booking message
    try {
      await apiFetch('/appointments/', {
        method: 'POST',
        body: JSON.stringify({
          lawyer: selectedLawyer,
          start: slot.start,
          end: slot.end,
        }),
      });
      setBookingMessage(`Successfully Booked: ${new Date(slot.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} to ${new Date(slot.end).toLocaleTimeString([], { timeStyle: 'short' })}`);
      // Refresh slots for the current lawyer to remove the booked one
      if (selectedLawyer) {
        setIsLoadingSlots(true);
        try {
          const data = await apiFetch(`/appointments/available_slots?lawyer_id=${selectedLawyer}`);
          const sortedSlots = (data as Slot[]).sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
          setSlots(sortedSlots);
        } catch (e) {
          console.error('Failed to reload slots after booking', e);
          // Keep existing slots, but maybe show a subtle error or log it
        } finally {
          setIsLoadingSlots(false);
        }
      }
    } catch (e: unknown) {
      console.error('Booking failed', e);
      let errorMsg = 'Booking failed. The slot may have been taken or an unknown error occurred.';
      if (typeof e === 'object' && e !== null && 'response' in e) {
        const apiErr = e as ApiError; // Type assertion
        if (apiErr.response?.data?.detail) {
          errorMsg = apiErr.response.data.detail;
        }
      }
      setBookingMessage(`Error: ${errorMsg}`);
    }
  };

  const groupedSlots = useMemo(() => {
    return slots.reduce((acc, slot) => {
      const dateKey = new Date(slot.start).toLocaleDateString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(slot);
      return acc;
    }, {} as GroupedSlots);
  }, [slots]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Book an Appointment</h1>
      
      {/* Select Lawyer Section */}
      <section className="mb-8 p-6 bg-white rounded-lg shadow-lg">
        <label htmlFor="lawyerSelect" className="block mb-2 text-xl font-semibold text-gray-700">Select Lawyer</label>
        {isLoadingLawyers ? (
          <p className="text-gray-600">Loading lawyers...</p>
        ) : lawyers.length === 0 ? (
          <p className="text-gray-600">No lawyers available at the moment.</p>
        ) : (
          <select
            id="lawyerSelect"
            value={selectedLawyer}
            onChange={onLawyerChange}
            className="border p-3 rounded-md w-full shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 text-lg"
          >
            <option value="">-- Choose a Lawyer --</option>
            {lawyers.map(l => (
              <option key={l.id} value={l.id}>
                {l.user.first_name || l.user.username} {l.user.last_name}
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Available Slots Section */}
      {selectedLawyer && (
        <section className="p-6 bg-white rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-6 text-gray-700">Available Slots</h2>
          {isLoadingSlots ? (
            <p className="text-gray-600">Loading available slots...</p>
          ) : Object.keys(groupedSlots).length === 0 ? (
            <p className="text-gray-600">No available slots for this lawyer in the upcoming week. Please try another lawyer or check back later.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedSlots).map(([dateKey, daySlots]) => (
                <div key={dateKey} className="p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
                  <h3 className="text-xl font-medium mb-4 text-indigo-600">{dateKey}</h3>
                  <ul className="space-y-3">
                    {daySlots.map((s, i) => (
                      <li key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-md border border-gray-100 shadow-xs">
                        <div className="mb-2 sm:mb-0">
                          <span className="text-gray-700 font-medium">
                            {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} - {new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                        </div>
                        <button
                          onClick={() => bookSlot(s)}
                          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm transition-colors duration-150 shadow-md"
                        >
                          Book This Slot
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Booking Message Area */}
      {bookingMessage && (
        <div className={`mt-6 p-4 rounded-md shadow-md text-center font-medium 
                        ${bookingMessage.startsWith('Error:') ? 'bg-red-100 text-red-700' : 
                         bookingMessage.startsWith('Successfully Booked:') ? 'bg-green-100 text-green-700' : 
                         'bg-blue-100 text-blue-700'}` // Default for processing message
                      }>
          {bookingMessage}
        </div>
      )}
    </div>
  );
} 