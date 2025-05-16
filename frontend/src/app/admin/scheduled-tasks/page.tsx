'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../lib/api'; // Adjust path as needed
import { useRouter } from 'next/navigation'; // Added import

// Define interface for the PeriodicTask data coming from the API
interface PeriodicTask {
    id: number;
    name: string;
    task_display: string; // The registered task name (e.g., appointments.cleanup_expired_reservations_task)
    enabled: boolean;
    schedule_display: string;
    last_run_at: string | null;
    total_run_count: number;
    description: string;
    // Add other fields from the serializer if needed for display
    interval_details?: { id: number; every: number; period: string; };
    crontab_details?: { id: number; minute: string; hour: string; day_of_week: string; day_of_month: string; month_of_year: string; timezone: string; };
}

// Define a type for potential API errors (reuse if you have a central definition)
interface ApiError extends Error {
  response?: {
    data?: {
      detail?: string;
      error?: string;
      [key: string]: unknown;
    };
    status?: number;
    [key: string]: unknown;
  };
}

export default function ScheduledTasksPage() {
    const [tasks, setTasks] = useState<PeriodicTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [runStatus, setRunStatus] = useState<Record<string, string>>({}); // { [taskId]: 'running' | 'success' | 'error' | 'message' }
    const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null); // State for delete operation
    const router = useRouter(); // Added useRouter hook

    const fetchTasks = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/admin/tasks/periodic-tasks/'); // Use the correct endpoint
            setTasks(data as PeriodicTask[]);
        } catch (e) {
            console.error("Failed to fetch scheduled tasks:", e);
            setError("Could not load scheduled tasks. Make sure you are logged in as an admin.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleRunNow = async (task: PeriodicTask) => {
        setRunStatus(prev => ({ ...prev, [task.id]: 'running' }));
        try {
            // Extract args/kwargs from the task object if needed, otherwise send empty/defaults
            // Note: The trigger API doesn't strictly *need* the saved args/kwargs,
            // but you might want to pass them if the 'run now' should use them.
            // For the cleanup task, it takes an optional grace_period_minutes kwarg.
            // We can default to sending no args/kwargs for simplicity, 
            // or allow specifying them via UI later.
            let taskKwargs = {};
            if (task.task_display === 'appointments.cleanup_expired_reservations_task') {
                // Example: Extract grace period if stored in description or default?
                // For now, let the task use its default grace period.
                taskKwargs = {}; 
            }

            const response = await apiFetch('/admin/tasks/trigger-task/', {
                method: 'POST',
                body: JSON.stringify({
                    task_name: task.task_display, // Use the registered task name
                    args: [], // Assuming no positional args for now
                    kwargs: taskKwargs, // Send specific kwargs if needed
                }),
            });
            setRunStatus(prev => ({ ...prev, [task.id]: response.message || 'Task queued successfully!' }));
            // Clear the message after a few seconds
            setTimeout(() => setRunStatus(prev => ({...prev, [task.id]: ''})), 5000);
        } catch (e: unknown) {
            console.error(`Failed to trigger task ${task.name}:`, e);
            let errorMsg = 'Failed to trigger task.';
             if (typeof e === 'object' && e !== null && 'response' in e) {
               const apiErr = e as ApiError;
               errorMsg = apiErr.response?.data?.error || apiErr.response?.data?.detail || errorMsg;
             }
            setRunStatus(prev => ({ ...prev, [task.id]: `Error: ${errorMsg}` }));
        } 
    };
    
    // Add function stubs for edit/delete/create if needed later
    const handleEdit = (taskId: number) => {
        router.push(`/admin/scheduled-tasks/${taskId}/edit`);
    };
    const handleDelete = async (taskId: number) => {
        // Use window.confirm for simple confirmation
        if (window.confirm('Are you sure you want to delete this scheduled task?')) {
            setDeletingTaskId(taskId); // Set deleting state
            setError(null); // Clear previous errors
            try {
                await apiFetch(`/admin/tasks/periodic-tasks/${taskId}/`, { 
                    method: 'DELETE' 
                });
                // Refresh the list after successful deletion
                await fetchTasks(); 
            } catch (e: unknown) {
                console.error(`Failed to delete task ${taskId}:`, e);
                let errorMsg = 'Failed to delete task.';
                 if (typeof e === 'object' && e !== null && 'response' in e) {
                   const apiErr = e as ApiError;
                   errorMsg = apiErr.response?.data?.detail || apiErr.response?.data?.error || errorMsg;
                 }
                 // Set a general error message for the page
                 setError(errorMsg); 
            } finally {
                setDeletingTaskId(null); // Clear deleting state regardless of outcome
            }
        }
    };
    const handleCreate = () => {
        router.push('/admin/scheduled-tasks/create');
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-6">Scheduled Tasks</h1>

            {error && <p className="text-red-500 mb-4">Error: {error}</p>}

            <div className="mb-4">
                <button 
                    onClick={handleCreate}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                    Create New Task
                </button>
                <span className="ml-4 text-sm text-gray-600">
                    (Use Django Admin (/admin/) for full schedule creation/editing)
                </span>
            </div>

            {isLoading ? (
                <p>Loading tasks...</p>
            ) : (
                <div className="overflow-x-auto shadow-md rounded-lg">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Run</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {tasks.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-4">No scheduled tasks found. Use Django Admin (/admin/) to create schedules.</td></tr>
                            ) : tasks.map((task) => (
                                <tr key={task.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{task.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{task.task_display}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.schedule_display}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${task.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {task.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {task.last_run_at ? new Date(task.last_run_at).toLocaleString() : 'Never'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => handleRunNow(task)}
                                            disabled={runStatus[task.id] === 'running'}
                                            className={`px-3 py-1 rounded text-xs ${runStatus[task.id] === 'running' ? 'bg-gray-300 text-gray-600 cursor-wait' : 'bg-indigo-500 hover:bg-indigo-700 text-white'}`}
                                        >
                                            {runStatus[task.id] === 'running' ? 'Running...' : 'Run Now'}
                                        </button>
                                        {/* Basic Edit/Delete stubs - Functionality TBD */}
                                        <button onClick={() => handleEdit(task.id)} className="text-yellow-600 hover:text-yellow-900 text-xs">Edit</button>
                                        <button 
                                            onClick={() => handleDelete(task.id)} 
                                            disabled={deletingTaskId === task.id} // Disable button while deleting this specific task
                                            className={`text-red-600 hover:text-red-900 text-xs ${deletingTaskId === task.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {deletingTaskId === task.id ? 'Deleting...' : 'Delete'} 
                                        </button>
                                         {/* Display run status message */} 
                                         {runStatus[task.id] && runStatus[task.id] !== 'running' && (
                                             <span className={`ml-2 text-xs ${runStatus[task.id]?.startsWith('Error:') ? 'text-red-600' : 'text-green-600'}`}>
                                                 {runStatus[task.id]}
                                             </span>
                                         )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
} 