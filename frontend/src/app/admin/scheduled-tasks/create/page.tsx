'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import ScheduledTaskForm from '../../../../components/admin/ScheduledTaskForm'; // Adjust path as needed
import { apiFetch } from '../../../../lib/api'; // Adjust path as needed

// Define the structure for task data, including schedule details
// This should match or be compatible with the one in ScheduledTaskForm.tsx
interface TaskFormData {
    name: string;
    task: string;
    enabled: boolean;
    description: string;
    scheduleType: 'interval' | 'crontab';
    interval?: { every: number | ''; period: string };
    crontab?: { minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string };
}

interface ApiError extends Error {
  response?: {
    data?: {
      detail?: string;
      error?: string;
      [key: string]: unknown;
    };
    status?: number;
  };
}

// Define the expected payload structure for POST requests
interface PeriodicTaskPayload {
    name: string;
    task: string;
    enabled: boolean;
    description: string;
    interval?: { every: number; period: string };
    crontab?: { minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string };
}

export default function CreateScheduledTaskPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleSubmit = async (formData: TaskFormData) => {
        setIsSubmitting(true);
        setSubmitError(null);

        // Use the specific payload type
        const payload: PeriodicTaskPayload = {
            name: formData.name,
            task: formData.task,
            enabled: formData.enabled,
            description: formData.description,
        };

        if (formData.scheduleType === 'interval' && formData.interval) {
            if (formData.interval.every === '' || isNaN(Number(formData.interval.every)) || Number(formData.interval.every) <= 0) {
                setSubmitError("Interval 'Every' field must be a positive number.");
                setIsSubmitting(false);
                return;
            }
            payload.interval = {
                every: Number(formData.interval.every),
                period: formData.interval.period,
            };
        } else if (formData.scheduleType === 'crontab' && formData.crontab) {
            payload.crontab = formData.crontab; // Assumes crontab fields are strings as required
        }

        try {
            await apiFetch('/admin/tasks/periodic-tasks/', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            // On success, redirect to the tasks list page
            router.push('/admin/scheduled-tasks');
        } catch (e: unknown) {
            console.error('Failed to create scheduled task:', e);
            let errorMsg = "An unexpected error occurred.";
            if (typeof e === 'object' && e !== null && 'response' in e) {
              const apiErr = e as ApiError;
              if (apiErr.response?.data) {
                // Try to get a more specific error message from the backend response
                errorMsg = Object.entries(apiErr.response.data)
                               .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                               .join('; ');
              } else {
                errorMsg = apiErr.message || errorMsg;
              }
            } else if (e instanceof Error) {
                errorMsg = e.message;
            }
            setSubmitError(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-semibold">Create New Scheduled Task</h1>
                    <button 
                        onClick={() => router.back()}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                        &larr; Back to Tasks
                    </button>
                </div>
                <ScheduledTaskForm 
                    onSubmit={handleSubmit} 
                    isSubmitting={isSubmitting} 
                    submitError={submitError} 
                />
            </div>
        </div>
    );
} 