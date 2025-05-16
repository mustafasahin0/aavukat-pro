'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CardElement, useStripe, Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { apiFetch } from '../../lib/api'; // Adjust path as needed
import { useRouter, useSearchParams } from 'next/navigation';

// Define a type for potential API errors
interface ApiError extends Error {
  response?: {
    data?: {
      detail?: string;
      error?: string; // Added for handling stripe errors returned from backend
      [key: string]: unknown; // Allow other properties in data
    };
    [key: string]: unknown; // Allow other properties in response
  };
}

interface Lawyer {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    username: string;
    email: string;
  };
}

interface TimeSlot {
  start: string;
  end: string;
}

// Load Stripe outside of component render to avoid recreating on every render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

function ClientBookingPage() {
    const stripe = useStripe();
    const router = useRouter();
    const searchParams = useSearchParams();

    // State variables
    const [lawyers, setLawyers] = useState<Lawyer[]>([]);
    const [selectedLawyer, setSelectedLawyer] = useState<Lawyer | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingLawyers, setIsLoadingLawyers] = useState(true);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
    const [confirmationStatus, setConfirmationStatus] = useState<string | null>(null);

    // Fetch lawyers
    useEffect(() => {
        const fetchLawyers = async () => {
            setIsLoadingLawyers(true);
            setError(null);
            try {
                const data = await apiFetch('/client/lawyers/');
                setLawyers(data as Lawyer[]);
            } catch (e) {
                console.error("Failed to fetch lawyers:", e);
                setError("Could not load lawyers list.");
                setLawyers([]);
            } finally {
                 setIsLoadingLawyers(false);
            }
        };
        fetchLawyers();
    }, []);

    // Fetch available slots when lawyer and date are selected
    const fetchAvailableSlots = useCallback(async (lawyerId: number, date: string) => {
        if (!lawyerId || !date) {
            setAvailableSlots([]);
            return;
        }
        setError(null);
        try {
            const data = await apiFetch(`/appointments/available-slots/?lawyer_id=${lawyerId}&date=${date}`);
            setAvailableSlots(data as TimeSlot[]);
        } catch (e) {
            console.error("Failed to fetch slots:", e);
            setError("Could not load available time slots.");
            setAvailableSlots([]);
        }
    }, []);

    useEffect(() => {
        if (selectedLawyer?.id && selectedDate) {
            fetchAvailableSlots(selectedLawyer.id, selectedDate);
        }
    }, [selectedLawyer, selectedDate, fetchAvailableSlots]);
    

    // Effect to handle Stripe payment confirmation redirect
    useEffect(() => {
        if (!stripe) {
            return;
        }

        const clientSecretParam = searchParams.get('payment_intent_client_secret');
        const paymentIntentIdParam = searchParams.get('payment_intent');
        const redirectStatus = searchParams.get('redirect_status');

        if (clientSecretParam && paymentIntentIdParam && redirectStatus) {
            router.replace('/client', undefined);
            
            setIsLoading(true);
            setConfirmationStatus('Processing payment confirmation...');

            if (redirectStatus === 'succeeded') {
                setPaymentStatus('Payment successful! Confirming booking...');
                apiFetch('/appointments/confirm_booking/', {
                    method: 'POST',
                    body: JSON.stringify({ payment_intent_id: paymentIntentIdParam }),
                })
                .then(response => {
                    setConfirmationStatus(response.message || 'Booking confirmed successfully! Your appointment is pending lawyer approval.');
                     setSelectedLawyer(null);
                     setSelectedDate('');
                     setSelectedTimeSlot('');
                     setAvailableSlots([]);
                     setClientSecret(null);
                })
                .catch(async (e: unknown) => {
                    console.error("Booking confirmation failed:", e);
                    let errorMsg = "Failed to confirm booking after successful payment. Please contact support.";
                     if (typeof e === 'object' && e !== null && 'response' in e) {
                        const apiErr = e as ApiError;
                        errorMsg = apiErr.response?.data?.detail || apiErr.response?.data?.error || errorMsg;
                         if (apiErr.response?.status === 409) {
                             errorMsg = "Confirmation failed: The slot was taken just before confirmation. Your payment should be refunded automatically. Please try booking again.";
                         } else {
                         }
                     }
                     setConfirmationStatus(`Error: ${errorMsg}`);
                })
                .finally(() => {
                    setIsLoading(false);
                });

            } else if (redirectStatus === 'processing') {
                setPaymentStatus('Payment processing. We\'ll update you when payment is confirmed.');
                setIsLoading(false);
                 setConfirmationStatus(null); 
            } else {
                setPaymentStatus(`Payment failed: ${searchParams.get('message') || 'Please try again.'}`);
                setIsLoading(false);
                 setConfirmationStatus(null); 
            }
        }
    }, [stripe, searchParams, router]);

    // const formatAndGroupSlots = (slotsToGroup: TimeSlot[]) => {
    //     return {}; 
    // };
    
    // Placeholder for date selection logic
    const availableDates = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    });

    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-6">Book Appointment</h1>

            {confirmationStatus && (
                <div className={`p-4 mb-4 rounded ${confirmationStatus.startsWith('Error:') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {confirmationStatus}
                </div>
            )}
            {paymentStatus && !confirmationStatus && (
                 <div className={`p-4 mb-4 rounded ${paymentStatus.startsWith('Payment failed:') ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                     {paymentStatus}
                 </div>
            )}
            {error && !confirmationStatus && <p className="text-red-500 mb-4">Error: {error}</p>}

            {/* Lawyer and Date Selection */} 
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Lawyer Selection Dropdown */} 
                <div>
                    <label htmlFor="lawyer-select" className="block text-sm font-medium text-gray-700 mb-1">
                        Select Lawyer
                    </label>
                    <select 
                        id="lawyer-select"
                        value={selectedLawyer?.id || ''}
                        onChange={(e) => {
                            const lawyer = lawyers.find(l => l.id === parseInt(e.target.value));
                            setSelectedLawyer(lawyer || null);
                            setSelectedTimeSlot('');
                            setAvailableSlots([]);
                        }}
                        disabled={isLoadingLawyers}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                        <option value="" disabled>-- Select a Lawyer --</option>
                        {isLoadingLawyers ? (
                            <option disabled>Loading lawyers...</option>
                        ) : lawyers.length > 0 ? (
                            lawyers.map(lawyer => (
                                <option key={lawyer.id} value={lawyer.id}>
                                    {lawyer.user.first_name} {lawyer.user.last_name} ({lawyer.user.username})
                                </option>
                            ))
                        ) : (
                            <option disabled>No lawyers available</option>
                        )}
                    </select>
                </div>

                {/* Date Selection Dropdown */} 
                <div>
                     <label htmlFor="date-select" className="block text-sm font-medium text-gray-700 mb-1">
                        Select Date
                    </label>
                    <select
                        id="date-select"
                        value={selectedDate}
                        onChange={(e) => {
                            setSelectedDate(e.target.value);
                            setSelectedTimeSlot('');
                             setAvailableSlots([]);
                        }}
                        disabled={!selectedLawyer}
                         className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                        <option value="" disabled>-- Select a Date --</option>
                        {availableDates.map(date => (
                            <option key={date} value={date}>
                                {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Time Slot Selection */} 
            <div className="mb-6">
                 <h3 className="text-lg font-medium mb-2">Available Slots for {selectedDate || 'select date'}</h3>
                 {availableSlots.length > 0 ? (
                     <div className="flex flex-wrap gap-2">
                         {availableSlots.map(slot => (
                             <button 
                                 key={slot.start}
                                 onClick={() => setSelectedTimeSlot(slot.start)} 
                                 className={`px-4 py-2 rounded border ${selectedTimeSlot === slot.start ? 'bg-blue-500 text-white border-blue-700' : 'bg-white hover:bg-gray-100 border-gray-300'}`}
                             >
                                 {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </button>
                         ))}
                     </div>
                 ) : (
                      <p className="text-gray-500">{selectedLawyer && selectedDate ? 'No slots available for this date.' : 'Please select a lawyer and date.'}</p>
                 )}
            </div>

            {selectedTimeSlot && (
                <div className="mt-6 border-t pt-6">
                    <h2 className="text-xl font-semibold mb-4">Confirm and Pay</h2>
                    <p>Lawyer: {selectedLawyer?.user.first_name || 'N/A'}</p>
                    <p>Date: {selectedDate}</p>
                    <p>Time: {new Date(selectedTimeSlot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="font-bold mt-2">Price: $50.00</p> 

                    <div className="my-4 p-3 border rounded border-gray-300">
                        <CardElement options={{ hidePostalCode: true }} />
                    </div>

                    <button
                        disabled={isLoading || !stripe || !selectedLawyer || !selectedDate || !selectedTimeSlot}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                    >
                        {isLoading ? 'Processing...' : 'Pay and Book Appointment'}
                    </button>
                     {/* Display clientSecret for debugging if needed */} 
                     {clientSecret && <p className="text-xs text-gray-500 mt-2">Client Secret Ready</p>} 
                </div>
            )}
        </div>
    );
}

export default function ClientPageWrapper() {
    return (
        <Elements stripe={stripePromise}>
            <ClientBookingPage />
        </Elements>
    );
}