// Use client component for interactivity
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
// import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import withRole from '../../components/withRole';

interface Availability {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

// Interface for Availability Overrides
interface AvailabilityOverrideData {
  id: number;
  date: string; // Storing date as string from API, will be Date object for DatePicker
  start_time?: string | null;
  end_time?: string | null;
  is_all_day: boolean;
  description?: string | null;
}

// Interface for the payload when adding an override
interface AvailabilityOverridePayload {
  date: string;
  is_all_day: boolean;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
}

// Helper function to generate time slots
const timeSlotOptions = (() => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      slots.push(`${hour}:${minute}`);
    }
  }
  return slots;
})();

function LawyerDashboard() {
  // const { user } = useAuth();
  const [slots, setSlots] = useState<Availability[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // State for Availability Overrides
  const [overrides, setOverrides] = useState<AvailabilityOverrideData[]>([]);
  const [overrideDate, setOverrideDate] = useState<Date | null>(new Date());
  const [overrideStartTime, setOverrideStartTime] = useState('');
  const [overrideEndTime, setOverrideEndTime] = useState('');
  const [overrideIsAllDay, setOverrideIsAllDay] = useState(false);
  const [overrideDescription, setOverrideDescription] = useState('');

  useEffect(() => {
    fetchSlots();
    fetchOverrides(); // Fetch overrides on component mount
  }, []);

  async function fetchSlots() {
    try {
      const data = await apiFetch('/availabilities/');
      // Sort slots by day of week, then by start time
      const sortedSlots = (data as Availability[]).sort((a: Availability, b: Availability) => {
        if (a.day_of_week !== b.day_of_week) {
          return a.day_of_week - b.day_of_week;
        }
        return a.start_time.localeCompare(b.start_time);
      });
      setSlots(sortedSlots);
    } catch (err) {
      console.error('Error fetching slots', err);
    }
  }

  async function fetchOverrides() {
    try {
      const data = await apiFetch('/availability-overrides/');
      // Sort overrides by date, then by start time for consistent display
      const sortedOverrides = (data as AvailabilityOverrideData[]).sort((a, b) => {
        if (a.date !== b.date) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (a.start_time && b.start_time) {
          return a.start_time.localeCompare(b.start_time);
        }
        return 0;
      });
      setOverrides(sortedOverrides);
    } catch (err) {
      console.error('Error fetching overrides', err);
      alert('Failed to fetch overrides. Check console for details.');
    }
  }

  async function addSlot() {
    try {
      // Basic frontend validation to prevent duplicate or non-sensical times
      if (!start || !end) {
        alert('Please select both start and end times.');
        return;
      }
      if (start >= end) {
        alert('Start time must be before end time.');
        return;
      }

      // Check for overlapping slots on the same day
      const existingSlotsOnDay = slots.filter(slot => slot.day_of_week === dayOfWeek);
      const newSlotStart = start;
      const newSlotEnd = end;

      for (const existingSlot of existingSlotsOnDay) {
        // Check if new slot is entirely within an existing slot
        if (newSlotStart >= existingSlot.start_time && newSlotEnd <= existingSlot.end_time) {
          alert('This time slot overlaps with an existing availability.');
          return;
        }
        // Check if existing slot is entirely within the new slot
        if (existingSlot.start_time >= newSlotStart && existingSlot.end_time <= newSlotEnd) {
          alert('This time slot overlaps with an existing availability.');
          return;
        }
        // Check for partial overlap (new slot starts before existing ends, and new slot ends after existing starts)
        if (newSlotStart < existingSlot.end_time && newSlotEnd > existingSlot.start_time) {
          alert('This time slot overlaps with an existing availability.');
          return;
        }
      }

      await apiFetch('/availabilities/', {
        method: 'POST',
        body: JSON.stringify({ day_of_week: dayOfWeek, start_time: start, end_time: end }),
      });
      setStart('');
      setEnd('');
      fetchSlots();
    } catch (err) {
      console.error('Error adding slot', err);
      alert('Failed to add slot. Check console for details.');
    }
  }

  async function deleteSlot(slotId: number) {
    if (!confirm('Are you sure you want to delete this availability slot?')) {
      return;
    }
    try {
      await apiFetch(`/availabilities/${slotId}/`, {
        method: 'DELETE',
      });
      fetchSlots(); // Refresh the list
    } catch (err) {
      console.error('Error deleting slot', err);
      alert('Failed to delete slot. Check console for details.');
    }
  }

  // Function to add an availability override
  async function addOverride() {
    if (!overrideDate) {
      alert('Please select a date for the override.');
      return;
    }

    const payload: AvailabilityOverridePayload = {
      date: overrideDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
      is_all_day: overrideIsAllDay,
      description: overrideDescription || null,
      start_time: null, // Initialize with null
      end_time: null,   // Initialize with null
    };

    if (!overrideIsAllDay) {
      if (!overrideStartTime || !overrideEndTime) {
        alert('Please provide start and end times for the override, or mark as all day.');
        return;
      }
      if (overrideStartTime >= overrideEndTime) {
        alert('Override start time must be before end time.');
        return;
      }
      payload.start_time = overrideStartTime;
      payload.end_time = overrideEndTime;
    }
    
    // Frontend validation for overlapping overrides (basic check, backend has unique_together)
    for (const ov of overrides) {
        if (ov.date === payload.date) {
            if (ov.is_all_day || payload.is_all_day) {
                alert('An all-day override already exists for this date or you are trying to add an all-day override for a date that already has one.');
                return;
            }
            if (ov.start_time && ov.end_time && payload.start_time && payload.end_time) {
                const existingStart = ov.start_time;
                const existingEnd = ov.end_time;
                const newStart = payload.start_time;
                const newEnd = payload.end_time;
                // Check for overlap: (StartA < EndB) and (EndA > StartB)
                if (newStart < existingEnd && newEnd > existingStart) {
                    alert('This override time slot overlaps with an existing override on the same day.');
                    return;
                }
            }
        }
    }

    try {
      await apiFetch('/availability-overrides/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      // Reset form
      setOverrideDate(new Date());
      setOverrideStartTime('');
      setOverrideEndTime('');
      setOverrideIsAllDay(false);
      setOverrideDescription('');
      fetchOverrides(); // Refresh the list
    } catch (err) {
      console.error('Error adding override:', err);
      alert('Failed to add override. Check console for details.');
    }
  }

  // Function to delete an availability override
  async function deleteOverride(overrideId: number) {
    if (!confirm('Are you sure you want to delete this override?')) {
      return;
    }
    try {
      await apiFetch(`/availability-overrides/${overrideId}/`, {
        method: 'DELETE',
      });
      fetchOverrides(); // Refresh the list
    } catch (err) {
      console.error('Error deleting override:', err);
      alert('Failed to delete override. Check console for details.');
    }
  }

  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  const groupedSlots = useMemo(() => {
    const groups: { [key: number]: Availability[] } = {};
    slots.forEach(slot => {
      if (!groups[slot.day_of_week]) {
        groups[slot.day_of_week] = [];
      }
      groups[slot.day_of_week].push(slot);
    });
    return groups;
  }, [slots]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Lawyer Dashboard</h1>

      {/* Add Weekly Availability Section */}
      <section className="mb-10 p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-6 text-gray-700">Add Weekly Availability</h2>
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={dayOfWeek}
            onChange={e => setDayOfWeek(parseInt(e.target.value))}
            className="border p-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          >
            {days.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
          <select
            value={start}
            onChange={e => setStart(e.target.value)}
            className="border p-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          >
            <option value="">Start time</option>
            {timeSlotOptions.map(slot => (
              <option key={`weekly-start-${slot}`} value={slot}>{slot}</option>
            ))}
          </select>
          <span className="text-gray-500">-</span>
          <select
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="border p-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          >
            <option value="">End time</option>
            {timeSlotOptions.map(slot => (
              <option key={`weekly-end-${slot}`} value={slot}>{slot}</option>
            ))}
          </select>
          <button
            onClick={addSlot}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md shadow-md transition-colors duration-150"
          >Add Weekly Slot</button>
        </div>
      </section>

      {/* Your Weekly Availabilities Section */}
      <section className="mb-10 p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-1 text-gray-700">Your Weekly Availabilities</h2>
        <p className="text-sm text-gray-500 mb-6">These are your general weekly recurring availabilities.</p>
        {slots.length === 0 ? (
          <p className="text-gray-600">You have no weekly availabilities set.</p>
        ) : (
          <div className="space-y-4">
            {days.map((day, index) => {
              const daySlots = groupedSlots[index];
              if (!daySlots || daySlots.length === 0) {
                return null; 
              }
              return (
                <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
                  <h3 className="text-xl font-medium mb-3 text-blue-600">{day}</h3>
                  <ul className="space-y-2">
                    {daySlots.map(slot => (
                      <li key={slot.id} className="flex justify-between items-center p-3 bg-white rounded-md border border-gray-100 shadow-xs">
                        <span className="text-gray-700 font-medium">
                          {slot.start_time} - {slot.end_time}
                        </span>
                        <button
                          onClick={() => deleteSlot(slot.id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm transition-colors duration-150 shadow-sm"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manage Date Overrides Section */}
      <section className="p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-6 text-gray-700">Manage Date Overrides / Block Times</h2>
        
        {/* Add Override Form */}
        <div className="mb-8 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-4">
          <h3 className="text-xl font-medium text-gray-600 mb-3">Add New Override</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div>
              <label htmlFor="overrideDate" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <DatePicker
                selected={overrideDate}
                onChange={(date: Date | null) => setOverrideDate(date)}
                dateFormat="yyyy-MM-dd"
                className="border p-2 rounded-md w-full shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                minDate={new Date()} // Prevent selecting past dates
              />
            </div>
            <div className="flex items-center pt-5">
              <input
                type="checkbox"
                id="overrideIsAllDay"
                checked={overrideIsAllDay}
                onChange={e => setOverrideIsAllDay(e.target.checked)}
                className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 shadow-sm"
              />
              <label htmlFor="overrideIsAllDay" className="ml-2 block text-sm text-gray-900">
                Block entire day
              </label>
            </div>
          </div>

          {!overrideIsAllDay && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label htmlFor="overrideStartTime" className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <select
                  id="overrideStartTime"
                  value={overrideStartTime}
                  onChange={e => setOverrideStartTime(e.target.value)}
                  className="border p-2 rounded-md w-full shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                >
                  <option value="">Start time</option>
                  {timeSlotOptions.map(slot => (
                    <option key={`override-start-${slot}`} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="overrideEndTime" className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <select
                  id="overrideEndTime"
                  value={overrideEndTime}
                  onChange={e => setOverrideEndTime(e.target.value)}
                  className="border p-2 rounded-md w-full shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                >
                  <option value="">End time</option>
                  {timeSlotOptions.map(slot => (
                    <option key={`override-end-${slot}`} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="overrideDescription" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <input
              type="text"
              id="overrideDescription"
              value={overrideDescription}
              onChange={e => setOverrideDescription(e.target.value)}
              placeholder="e.g., Holiday, Personal Appointment"
              className="border p-2 rounded-md w-full shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>
          <button
            onClick={addOverride}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow-md transition-colors duration-150"
          >
            Add Override
          </button>
        </div>

        {/* List of Current Overrides */}
        <div>
          <h3 className="text-xl font-medium text-gray-600 mb-3">Current Overrides</h3>
          {overrides.length === 0 ? (
            <p className="text-gray-500">You have no specific date overrides set.</p>
          ) : (
            <ul className="space-y-3">
              {overrides.map(override => (
                <li key={override.id} className="flex flex-wrap justify-between items-center p-4 bg-white rounded-md border border-gray-200 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-md font-semibold text-indigo-700">{new Date(override.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p className="text-sm text-gray-600">
                      {override.is_all_day 
                        ? 'All Day' 
                        : `${override.start_time || ''} - ${override.end_time || ''}`}
                    </p>
                    {override.description && <p className="text-xs text-gray-500 mt-1"><em>{override.description}</em></p>}
                  </div>
                  <button
                    onClick={() => deleteOverride(override.id)}
                    className="mt-2 md:mt-0 md:ml-4 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm transition-colors duration-150 shadow-sm"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default withRole(LawyerDashboard, ['lawyers']); 