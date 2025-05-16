'use client';

import React, { useState } from 'react';

// Define the structure for task data, including schedule details
interface TaskFormData {
    name: string;
    task: string; // Registered task name (e.g., 'module.tasks.my_task')
    enabled: boolean;
    description: string;
    scheduleType: 'interval' | 'crontab';
    interval?: { every: number | ''; period: string };
    crontab?: { minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string };
}

interface ScheduledTaskFormProps {
    initialData?: Partial<TaskFormData>; // For editing existing tasks
    onSubmit: (data: TaskFormData) => Promise<void>; // Function to handle form submission
    isSubmitting: boolean;
    submitError: string | null;
}

const PERIOD_CHOICES = [
    { value: 'seconds', label: 'Seconds' },
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' },
    // Add microseconds if needed
];

export default function ScheduledTaskForm({ initialData, onSubmit, isSubmitting, submitError }: ScheduledTaskFormProps) {
    const [formData, setFormData] = useState<TaskFormData>(() => {
        const defaults: TaskFormData = {
            name: '',
            task: '', // Maybe default to the known cleanup task?
            enabled: true,
            description: '',
            scheduleType: 'interval',
            interval: { every: '', period: 'minutes' },
            crontab: { minute: '*', hour: '*', day_of_week: '*', day_of_month: '*', month_of_year: '*', timezone: 'UTC' },
        };
        if (initialData) {
            return { ...defaults, ...initialData };
        }
        return defaults;
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        if (name.startsWith('interval.')) {
            const key = name.split('.')[1] as keyof TaskFormData['interval'];
            setFormData(prev => ({
                ...prev,
                interval: {
                    ...prev.interval!,
                    [key]: type === 'number' ? (value === '' ? '' : parseInt(value, 10)) : value,
                }
            }));
        } else if (name.startsWith('crontab.')) {
            const key = name.split('.')[1] as keyof TaskFormData['crontab'];
            setFormData(prev => ({
                ...prev,
                crontab: {
                    ...prev.crontab!,
                    [key]: value,
                }
            }));
        } else if (type === 'checkbox') {
            setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleScheduleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, scheduleType: e.target.value as 'interval' | 'crontab' }));
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // Basic validation placeholder
        if (!formData.name || !formData.task) {
            alert("Name and Task cannot be empty.");
            return;
        }
        if (formData.scheduleType === 'interval' && (formData.interval?.every === '' || formData.interval?.every === undefined || isNaN(formData.interval.every) || formData.interval.every <= 0)) {
             alert("Interval 'Every' field must be a positive number.");
             return;
        }
        // Add more crontab validation if needed
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 p-4 border rounded-lg shadow-sm bg-white">
            {submitError && <p className="text-red-500 text-sm mb-4">Error: {submitError}</p>}

            {/* Task Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">Task Name (Friendly)</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                    />
                </div>
                <div>
                    <label htmlFor="task" className="block text-sm font-medium text-gray-700">Registered Task Path</label>
                    <input
                        type="text"
                        id="task"
                        name="task"
                        value={formData.task}
                        onChange={handleChange}
                        required
                        placeholder="e.g., appointments.tasks.cleanup_expired_reservations_task"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                    />
                     <p className="mt-1 text-xs text-gray-500">Exact Python path to the Celery task function.</p>
                </div>
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                />
            </div>

            <div className="flex items-center">
                <input
                    type="checkbox"
                    id="enabled"
                    name="enabled"
                    checked={formData.enabled}
                    onChange={handleChange}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="enabled" className="ml-2 block text-sm text-gray-900">Enabled</label>
            </div>

            {/* Schedule Type Selector */}
            <div>
                <label htmlFor="scheduleType" className="block text-sm font-medium text-gray-700">Schedule Type</label>
                <select
                    id="scheduleType"
                    name="scheduleType"
                    value={formData.scheduleType}
                    onChange={handleScheduleTypeChange}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-900"
                >
                    <option value="interval">Interval</option>
                    <option value="crontab">Crontab</option>
                </select>
            </div>

            {/* Interval Fields (Conditional) */}
            {formData.scheduleType === 'interval' && (
                <div className="p-4 border border-gray-200 rounded-md space-y-4 bg-gray-50">
                     <h3 className="text-lg font-medium text-gray-800">Interval Schedule</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                            <label htmlFor="interval.every" className="block text-sm font-medium text-gray-700">Every</label>
                            <input
                                type="number"
                                id="interval.every"
                                name="interval.every"
                                value={formData.interval?.every}
                                onChange={handleChange}
                                required={formData.scheduleType === 'interval'}
                                min="1"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                            />
                        </div>
                       <div>
                            <label htmlFor="interval.period" className="block text-sm font-medium text-gray-700">Period</label>
                            <select
                                id="interval.period"
                                name="interval.period"
                                value={formData.interval?.period}
                                onChange={handleChange}
                                required={formData.scheduleType === 'interval'}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-900"
                            >
                                {PERIOD_CHOICES.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Crontab Fields (Conditional) */}
            {formData.scheduleType === 'crontab' && (
                <div className="p-4 border border-gray-200 rounded-md space-y-4 bg-gray-50">
                    <h3 className="text-lg font-medium text-gray-800">Crontab Schedule</h3>
                     <p className="text-xs text-gray-600 mb-2">Use cron expressions. &apos;*&apos; means &apos;every&apos;. Example: &apos;0 5 * * *&apos; means 5 AM daily.</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[ 'minute', 'hour', 'day_of_week', 'day_of_month', 'month_of_year', 'timezone'].map(field => (
                            <div key={field}>
                                <label htmlFor={`crontab.${field}`} className="block text-sm font-medium text-gray-700 capitalize">{field.replace('_', ' ')}</label>
                                <input
                                    type={field === 'timezone' ? 'text' : 'text'} // Keep as text, could use specific inputs later
                                    id={`crontab.${field}`}
                                    name={`crontab.${field}`}
                                    value={formData.crontab?.[field as keyof TaskFormData['crontab']]}
                                    onChange={handleChange}
                                    required={formData.scheduleType === 'crontab'}
                                    placeholder={field === 'timezone' ? 'e.g., UTC, America/New_York' : 'e.g., *, 0, 1-5'}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${isSubmitting ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'}`}
                >
                    {isSubmitting ? 'Saving...' : (initialData ? 'Update Task' : 'Create Task')}
                </button>
            </div>
        </form>
    );
} 