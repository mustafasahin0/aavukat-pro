'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ScheduledTaskForm from '../../../../../components/admin/ScheduledTaskForm'; // Adjust path
import { apiFetch } from '../../../../../lib/api'; // Adjust path
import Link from 'next/link';

// Reuse the form data interface
interface TaskFormData {
    name: string;
    task: string;
    enabled: boolean;
    description: string;
    scheduleType: 'interval' | 'crontab';
    interval?: { id?: number; every: number | ''; period: string };
    crontab?: { id?: number; minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string };
}

// Interface for the data coming from the API (PeriodicTask detail)
interface PeriodicTaskDetail {
    id: number;
    name: string;
    task: string; // This is the task path (e.g., app.tasks.add)
    enabled: boolean;
    description: string;
    interval: { id: number; every: number; period: string; } | null;
    crontab: { id: number; minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string; } | null;
    // Include other fields if needed
    last_run_at: string | null;
    total_run_count: number;
    date_changed: string;
    expires: string | null;
    one_off: boolean;
    start_time: string | null;
    args: string; // JSON encoded list
    kwargs: string; // JSON encoded dict
    queue: string | null;
    exchange: string | null;
    routing_key: string | null;
    headers: string; // JSON encoded dict
    priority: number | null;
    expire_seconds: number | null;
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

// Define the expected payload structure for PUT requests
// Might differ slightly from POST (e.g., including schedule IDs)
interface PeriodicTaskUpdatePayload {
    name: string;
    task: string;
    enabled: boolean;
    description: string;
    interval?: { id?: number; every: number; period: string } | null;
    crontab?: { id?: number; minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string } | null;
}

// Helper function to transform API data to form data
const transformApiToFormData = (apiData: PeriodicTaskDetail): TaskFormData => {
    const formData: TaskFormData = {
        name: apiData.name,
        task: apiData.task,
        enabled: apiData.enabled,
        description: apiData.description,
        scheduleType: apiData.interval ? 'interval' : 'crontab',
        interval: apiData.interval ? { ...apiData.interval, every: apiData.interval.every } : { every: '', period: 'minutes' }, // Ensure defaults if switching type
        crontab: apiData.crontab ? { ...apiData.crontab } : { id: undefined, minute: '*', hour: '*', day_of_week: '*', day_of_month: '*', month_of_year: '*', timezone: 'UTC' }, // Ensure defaults if switching type
    };
    // Ensure interval/crontab objects exist even if null from API, providing defaults for the inactive type
    if (!formData.interval) {
        formData.interval = { id: undefined, every: '', period: 'minutes' };
    }
     if (!formData.crontab) {
        formData.crontab = { id: undefined, minute: '*', hour: '*', day_of_week: '*', day_of_month: '*', month_of_year: '*', timezone: 'UTC' };
    }
    return formData;
};

export default function EditScheduledTaskPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string; // Get task ID from dynamic route

    const [initialData, setInitialData] = useState<TaskFormData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        const fetchTask = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
                const data: PeriodicTaskDetail = await apiFetch(`/admin/tasks/periodic-tasks/${id}/`);
                setInitialData(transformApiToFormData(data));
            } catch (e: unknown) {
                console.error("Failed to fetch task data:", e);
                setLoadError("Could not load task data. It might have been deleted.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchTask();
    }, [id]);

    const handleSubmit = async (formData: TaskFormData) => {
        if (!id) return;
        setIsSubmitting(true);
        setSubmitError(null);

        // Use the specific payload type
        const payload: PeriodicTaskUpdatePayload = {
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
                // Include ID if it exists to update the existing interval schedule
                ...(formData.interval.id && { id: formData.interval.id }), 
                every: Number(formData.interval.every),
                period: formData.interval.period,
            };
            payload.crontab = null; // Explicitly nullify the other schedule type
        } else if (formData.scheduleType === 'crontab' && formData.crontab) {
            payload.crontab = {
                 // Include ID if it exists to update the existing crontab schedule
                ...(formData.crontab.id && { id: formData.crontab.id }),
                minute: formData.crontab.minute,
                hour: formData.crontab.hour,
                day_of_week: formData.crontab.day_of_week,
                day_of_month: formData.crontab.day_of_month,
                month_of_year: formData.crontab.month_of_year,
                timezone: formData.crontab.timezone,
            };
            payload.interval = null; // Explicitly nullify the other schedule type
        }

        try {
            await apiFetch(`/admin/tasks/periodic-tasks/${id}/`, {
                method: 'PUT', // Or PATCH if the backend supports partial updates
                body: JSON.stringify(payload),
            });
            // On success, redirect to the tasks list page
            router.push('/admin/scheduled-tasks');
        } catch (e: unknown) {
            console.error('Failed to update scheduled task:', e);
             let errorMsg = "An unexpected error occurred during update.";
             if (typeof e === 'object' && e !== null && 'response' in e) {
               const apiErr = e as ApiError;
               if (apiErr.response?.data) {
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

    if (isLoading) {
        return <div className="p-6 text-center">Loading task details...</div>;
    }

    if (loadError) {
        return (
            <div className="p-6 text-center text-red-600">
                <p>{loadError}</p>
                <Link href="/admin/scheduled-tasks" className="text-indigo-600 hover:text-indigo-800 mt-4 inline-block">
                    &larr; Back to Tasks
                 </Link>
            </div>
        );
    }

    if (!initialData) {
         return <div className="p-6 text-center">Task not found.</div>; // Should ideally be caught by loadError
    }

    return (
        <div className="p-6">
             <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-semibold">Edit Scheduled Task</h1>
                     <button 
                        onClick={() => router.back()}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                         &larr; Back
                    </button>
                 </div>
                <ScheduledTaskForm 
                    initialData={initialData}
                    onSubmit={handleSubmit} 
                    isSubmitting={isSubmitting} 
                    submitError={submitError} 
                />
            </div>
        </div>
    );
} 