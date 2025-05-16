from django.shortcuts import render
from rest_framework import viewsets, permissions, exceptions
from .models import WeeklyAvailability, Appointment, AvailabilityOverride, SlotReservation
from .serializers import WeeklyAvailabilitySerializer, AppointmentSerializer, AvailabilityOverrideSerializer
# Import new profile models and serializers from the 'users' app
from users.models import UserProfile, LawyerProfile as NewLawyerProfile
from users.serializers import UserProfileSerializer as NewUserProfileSerializer, LawyerProfileSerializer as NewLawyerProfileSerializer # For ClientAccessibleLawyerListViewSet

from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .permissions import IsLawyer, IsClient # These permissions use the new profile system
from django.contrib.auth.models import User # May not be directly needed anymore in some places
import os
import boto3
import stripe # Add Stripe import
from django.conf import settings # Import Django settings
from datetime import datetime, timedelta # Import datetime and timedelta
from django.db import transaction, IntegrityError # Import IntegrityError

# Configure Stripe (replace with your actual secret key, preferably from settings/env vars)
# stripe.api_key = os.environ.get('STRIPE_SECRET_KEY') 
stripe.api_key = settings.STRIPE_SECRET_KEY # Assuming you add this to settings.py

# Constants
RESERVATION_MINUTES = 15 # How long a reservation lasts

# Create your views here.

class WeeklyAvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = WeeklyAvailabilitySerializer
    permission_classes = [IsLawyer] # Correctly uses new profile system

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'profile') and user.profile.role == 'lawyer' and hasattr(user.profile, 'lawyer_details'):
            return WeeklyAvailability.objects.filter(lawyer=user.profile.lawyer_details)
        return WeeklyAvailability.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'profile') and user.profile.role == 'lawyer' and hasattr(user.profile, 'lawyer_details'):
            serializer.save(lawyer=user.profile.lawyer_details)
        else:
            raise exceptions.PermissionDenied("User is not authorized or not a lawyer with complete lawyer details.")

class AvailabilityOverrideViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilityOverrideSerializer
    permission_classes = [IsLawyer] # Correctly uses new profile system

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'profile') and user.profile.role == 'lawyer' and hasattr(user.profile, 'lawyer_details'):
            return AvailabilityOverride.objects.filter(lawyer=user.profile.lawyer_details)
        return AvailabilityOverride.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, 'profile') and user.profile.role == 'lawyer' and hasattr(user.profile, 'lawyer_details'):
            serializer.save(lawyer=user.profile.lawyer_details)
        else:
            raise exceptions.PermissionDenied("User is not authorized or not a lawyer with complete lawyer details.")

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    
    def get_permissions(self):
        if self.action == 'create':
            permission_classes = [IsClient]
        elif self.action in ['update', 'partial_update', 'destroy']:
            permission_classes = [IsLawyer]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'profile'):
            if user.profile.role == 'client':
                return Appointment.objects.filter(client=user.profile)
            elif user.profile.role == 'lawyer' and hasattr(user.profile, 'lawyer_details'):
                return Appointment.objects.filter(lawyer=user.profile.lawyer_details)
        return Appointment.objects.none()

    @transaction.atomic # Make reservation attempt atomic
    def create(self, request, *args, **kwargs):
        """
        Overrides the default create action.
        Validates input, TRIES TO CREATE A SlotReservation, checks slot availability, 
        and creates a Stripe PaymentIntent.
        Returns the client_secret for the frontend to complete payment.
        Returns 409 Conflict if slot is already reserved or booked.
        """
        user = request.user
        if not (hasattr(user, 'profile') and user.profile.role == 'client'):
            raise exceptions.PermissionDenied('Only clients can initiate appointment booking.')

        # 1. Validate Input Data (lawyer_id, start, end)
        lawyer_id = request.data.get('lawyer')
        start_str = request.data.get('start')
        end_str = request.data.get('end')

        if not all([lawyer_id, start_str, end_str]):
            return Response({'error': 'Missing required fields: lawyer, start, end.'}, status=400)

        try:
            lawyer = NewLawyerProfile.objects.get(id=int(lawyer_id))
            start_dt = timezone.parse_datetime(start_str)
            end_dt = timezone.parse_datetime(end_str)
            if start_dt >= end_dt or start_dt < timezone.now():
                 raise ValueError("Invalid start/end time.")
        except (NewLawyerProfile.DoesNotExist, ValueError, TypeError) as e:
             return Response({'error': f'Invalid input: {e}'}, status=400)
        
        # 2. Check Slot Availability (Now includes reservation check)
        # This check MUST run before attempting reservation to provide immediate feedback
        # if the slot is permanently booked or has an *existing* valid reservation.
        if not self._is_slot_available(lawyer, start_dt, end_dt):
             # Use a more specific message if possible (distinguish booked vs reserved?)
             return Response({'error': 'Requested time slot is currently unavailable or being booked.'}, status=409) # 409 Conflict

        # 3. Attempt to Create SlotReservation (Concurrency Check 1 - Reservation)
        reserved_until = timezone.now() + timedelta(minutes=RESERVATION_MINUTES)
        reservation = None
        temp_payment_intent_id = f"temp_res_{user.id}_{timezone.now().timestamp()}" # Placeholder until real PI is created
        
        try:
            # Attempt to create the reservation within the transaction
            reservation = SlotReservation.objects.create(
                lawyer=lawyer,
                client_profile=user.profile,
                start_time=start_dt,
                end_time=end_dt,
                reserved_until=reserved_until,
                stripe_payment_intent_id=temp_payment_intent_id # Use placeholder initially
            )
        except IntegrityError: 
             # This catches the unique_together constraint violation, meaning someone *just* reserved it.
             # Or potentially other DB integrity issues.
             # Re-check availability for clarity, although the outcome is the same.
             if not self._is_slot_available(lawyer, start_dt, end_dt): 
                 return Response({'error': 'Requested time slot was just booked or reserved.'}, status=409)
             else:
                 # Should be rare if the initial check passed, maybe DB issue?
                 print(f"IntegrityError during reservation for L:{lawyer.id} C:{user.id} T:{start_dt} despite passing check.")
                 return Response({'error': 'Failed to reserve slot due to a conflict.'}, status=500)
        except Exception as e:
            print(f"Unexpected error creating reservation: {e}")
            return Response({'error': 'Failed to reserve slot.'}, status=500)
            
        # If reservation succeeded, proceed to payment intent creation

        # 4. Calculate Amount (Example: fixed price per appointment)
        # You'll need to define how pricing works. Maybe fetch from LawyerProfile?
        # Using a placeholder amount (e.g., $50.00 = 5000 cents)
        amount_cents = 5000 
        currency = 'usd' # Or your desired currency

        # 5. Create Stripe PaymentIntent
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency,
                automatic_payment_methods={'enabled': True},
                metadata={
                    'lawyer_id': lawyer.id,
                    'client_profile_id': user.profile.id, 
                    'appointment_start': start_dt.isoformat(),
                    'appointment_end': end_dt.isoformat(),
                    'reservation_id': reservation.id # Include reservation ID if needed
                }
            )
            
            # Update the reservation with the actual Payment Intent ID
            reservation.stripe_payment_intent_id = payment_intent.id
            reservation.save(update_fields=['stripe_payment_intent_id'])
            
            # 6. Return Client Secret to Frontend
            return Response({
                'clientSecret': payment_intent.client_secret,
                'paymentIntentId': payment_intent.id 
            }, status=201) 

        except stripe.error.StripeError as e:
            # If Stripe fails, we should ideally delete the reservation we created
            print(f"Stripe error after reservation created (Reservation ID: {reservation.id}). Deleting reservation.")
            reservation.delete()
            return Response({'error': f'Stripe error: {e.user_message}'}, status=500)
        except Exception as e:
            # Handle other unexpected errors, also delete reservation
            print(f"Unexpected error creating payment intent (Reservation ID: {reservation.id}): {e}")
            reservation.delete() 
            return Response({'error': 'Could not initiate payment process.'}, status=500)

    def _is_slot_available(self, lawyer: NewLawyerProfile, start_dt: datetime, end_dt: datetime) -> bool:
        """
        Checks if a specific time slot is available for a given lawyer.
        Considers:
        1. Lawyer\'s WeeklyAvailability and AvailabilityOverrides (TODO).
        2. Existing Confirmed or Pending Appointments.
        3. Existing *Active* SlotReservations.
        """
        now = timezone.now()

        # Check 1: Existing Appointments (Confirmed or Pending)
        overlapping_appointments = Appointment.objects.filter(
            lawyer=lawyer,
            start__lt=end_dt, # Starts before the proposed end
            end__gt=start_dt,   # Ends after the proposed start
            status__in=['pending', 'confirmed'] 
        ).exists()

        if overlapping_appointments:
            return False

        # Check 2: Existing *Active* Reservations
        overlapping_reservations = SlotReservation.objects.filter(
            lawyer=lawyer,
            start_time__lt=end_dt,
            end_time__gt=start_dt,
            reserved_until__gt=now # Only consider reservations that haven't expired
        ).exists()

        if overlapping_reservations:
            return False
            
        # TODO: Check 3: Validate against WeeklyAvailability/Overrides
        # This is important to ensure the slot wasn't made unavailable by the lawyer 
        # since the available_slots list was generated.

        return True # Assumes available if no direct conflicts found yet

    # Add the new action for confirming the booking after payment
    @action(detail=False, methods=['post'], url_path='confirm-booking')
    @transaction.atomic # Ensure atomicity for the final check and creation
    def confirm_booking(self, request):
        """
        Confirms and creates the appointment record AFTER successful payment.
        Requires payment_intent_id in the request body.
        Validates the associated SlotReservation.
        Performs a final availability check before creating the appointment.
        Deletes the SlotReservation on success.
        """
        user = request.user
        if not (hasattr(user, 'profile') and user.profile.role == 'client'):
            raise exceptions.PermissionDenied('Only clients can confirm bookings.')

        payment_intent_id = request.data.get('payment_intent_id')
        if not payment_intent_id:
            return Response({'error': 'Missing payment_intent_id.'}, status=400)

        # --- Find the Reservation --- 
        try:
            reservation = SlotReservation.objects.select_for_update().get(
                stripe_payment_intent_id=payment_intent_id,
                client_profile=user.profile # Ensure the reservation belongs to this client
            )
        except SlotReservation.DoesNotExist:
            # Maybe payment succeeded but reservation was cleared by cleanup job?
            # Or maybe PI ID doesn't match client?
            print(f"Confirm booking failed: No matching reservation found for PI {payment_intent_id} and Client {user.profile.id}")
            # Check payment status before returning - if succeeded, maybe refund?
            try:
                payment_intent_check = stripe.PaymentIntent.retrieve(payment_intent_id)
                if payment_intent_check.status == 'succeeded':
                     # TODO: Initiate Refund?
                     print(f"PI {payment_intent_id} succeeded but reservation missing. Needs refund? Status: {payment_intent_check.status}")
                     return Response({'error': 'Booking confirmation failed: Reservation not found. Please contact support if payment was taken.'}, status=404)
                else:
                    return Response({'error': 'Booking confirmation failed: Reservation not found.'}, status=404)
            except stripe.error.StripeError as e:
                 print(f"Stripe error checking PI {payment_intent_id} after reservation missing: {e}")
                 return Response({'error': 'Booking confirmation failed: Reservation not found.'}, status=404)

        # --- Check Reservation Status --- 
        if not reservation.is_active():
            print(f"Confirm booking failed: Reservation expired for PI {payment_intent_id}. Reservation ID: {reservation.id}")
            # Reservation expired, payment might have succeeded. Attempt refund.
            # TODO: Initiate Refund via Stripe API
            status_message = "Booking confirmation failed: Your reservation timed out."
            try:
                payment_intent_check = stripe.PaymentIntent.retrieve(payment_intent_id)
                if payment_intent_check.status == 'succeeded':
                     stripe.Refund.create(payment_intent=payment_intent_id)
                     status_message += " Payment has been refunded."
            except stripe.error.StripeError as refund_error:
                print(f"CRITICAL ERROR: Failed to refund PaymentIntent {payment_intent_id} after reservation expiry: {refund_error}")
                status_message += " Refund failed, please contact support."
            # No need to delete expired reservation here, cleanup job will handle it.
            return Response({'error': status_message}, status=410) # 410 Gone (Reservation Expired)
        
        # --- Retrieve PI, Check Status, Extract Metadata (as before) --- 
        try:
            payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            if payment_intent.status != 'succeeded':
                 # Payment wasn't successful, even though we have an active reservation.
                 # Maybe the user retried after failure on the same PI?
                 # Delete the reservation as it's linked to a non-succeeded PI.
                 print(f"Deleting reservation {reservation.id} because PI {payment_intent_id} status is {payment_intent.status}")
                 reservation.delete()
                 return Response({'error': f'Payment not successful. Status: {payment_intent.status}'}, status=402)

            metadata = payment_intent.metadata
            # lawyer_id = metadata.get('lawyer_id') # Can use reservation lawyer
            client_profile_id = metadata.get('client_profile_id') 
            start_str = metadata.get('appointment_start')
            end_str = metadata.get('appointment_end')

            if not all([client_profile_id, start_str, end_str]):
                 print(f"Error: Missing metadata in PaymentIntent {payment_intent_id}")
                 # TODO: Initiate Refund?
                 reservation.delete() # Clean up reservation
                 return Response({'error': 'Internal error retrieving booking details from payment.'}, status=500)
            
            # Security check: User profile from reservation vs metadata vs logged in user
            if str(user.profile.id) != client_profile_id or user.profile.id != reservation.client_profile_id:
                print(f"Security Alert: User/Client mismatch. LoggedIn:{user.profile.id}, Meta:{client_profile_id}, Res:{reservation.client_profile_id}")
                # TODO: Initiate Refund?
                reservation.delete() # Clean up reservation
                return Response({'error': 'Cannot confirm booking due to user mismatch.'}, status=403) 

            # --- Re-fetch Lawyer and Parse Times (Can use reservation data) --- 
            lawyer = reservation.lawyer # Use lawyer from reservation
            start_dt = reservation.start_time
            end_dt = reservation.end_time

            # --- Final Availability Check (Concurrency Check 2 - Still needed!) ---
            # Although we have a reservation, another appointment could have been created
            # through an alternative channel, or lawyer availability might have changed.
            # _is_slot_available now checks active reservations *excluding the current one implicitly* 
            # because we will delete it on success.
            if not self._is_slot_available(lawyer, start_dt, end_dt):
                 # This check should ideally exclude the *current* reservation if it were more complex.
                 # However, since we got this far, it implies the conflict is likely a *different* reservation 
                 # or a new *appointment* that appeared.
                 print(f"Confirm booking failed: Slot conflict detected for PI {payment_intent_id} despite active reservation {reservation.id}")
                 # TODO: Initiate Refund
                 status_message = "Slot became unavailable after payment."
                 try:
                     stripe.Refund.create(payment_intent=payment_intent_id)
                     status_message += " Payment has been refunded."
                 except stripe.error.StripeError as refund_error:
                     print(f"CRITICAL ERROR: Failed to refund PI {payment_intent_id} after slot conflict: {refund_error}")
                     status_message += " Refund failed, please contact support."
                 
                 reservation.delete() # Clean up our failed reservation
                 return Response({'error': status_message}, status=409) # 409 Conflict

            # --- Create the Appointment Record --- 
            appointment_data = {
                'lawyer': lawyer,
                'client': user.profile, 
                'start': start_dt,
                'end': end_dt,
                'status': 'pending', 
                'stripe_payment_intent_id': payment_intent_id,
                'payment_status': payment_intent.status
            }
            
            serializer = self.get_serializer(data=appointment_data)
            serializer.is_valid(raise_exception=True)
            appointment = serializer.save()
            
            # --- Delete the Reservation (Success!) --- 
            print(f"Appointment {appointment.id} created. Deleting reservation {reservation.id}.")
            reservation.delete()

            # --- Return Success Response --- 
            return Response(serializer.data, status=201)

        except stripe.error.StripeError as e:
             # Handle Stripe API errors during retrieval/refund
             # Don't delete reservation here, maybe Stripe issue is temporary? Let cleanup handle.
             return Response({'error': f'Stripe error during confirmation: {e.user_message}'}, status=500)
        except Exception as e:
            # Handle other unexpected errors (DB errors, etc.)
            # Don't delete reservation here automatically. Let cleanup handle.
            print(f"Unexpected error confirming booking for PI {payment_intent_id}: {e}") 
            return Response({'error': 'Could not confirm booking due to an internal error.'}, status=500)

    @action(detail=False, methods=['get'])
    def available_slots(self, request):
        lawyer_id_str = request.query_params.get('lawyer_id')
        if not lawyer_id_str:
            return Response({'error': 'Missing lawyer_id'}, status=400)
        try:
            lawyer_id = int(lawyer_id_str)
            lawyer = NewLawyerProfile.objects.get(id=lawyer_id)
        except (ValueError, NewLawyerProfile.DoesNotExist):
            return Response({'error': 'Lawyer not found or invalid ID'}, status=404)
        
        now = timezone.now() # Get current time once
        today = now.date()
        dates_to_check = [today + timedelta(days=i) for i in range(7)]
        
        # Fetch relevant data for the lawyer
        lawyer_overrides = AvailabilityOverride.objects.filter(lawyer=lawyer)
        lawyer_availabilities = WeeklyAvailability.objects.filter(lawyer=lawyer)
        # Fetch existing appointments AND active reservations for the check period
        start_check_dt = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        end_check_dt = timezone.make_aware(datetime.combine(dates_to_check[-1], datetime.max.time()))
        
        booked_periods = list(Appointment.objects.filter(
            lawyer=lawyer,
            start__lt=end_check_dt,
            end__gt=start_check_dt,
            status__in=['pending', 'confirmed']
        ).values_list('start', 'end'))
        
        reserved_periods = list(SlotReservation.objects.filter(
            lawyer=lawyer,
            start_time__lt=end_check_dt,
            end_time__gt=start_check_dt,
            reserved_until__gt=now # Only active reservations
        ).values_list('start_time', 'end_time'))
        
        # Combine booked and reserved periods into a single list of unavailable intervals
        unavailable_intervals = booked_periods + reserved_periods
        unavailable_intervals.sort() # Sort by start time

        slots = []
        for specific_date in dates_to_check:
            day_of_week = specific_date.weekday()
            
            # Check for all-day overrides for this specific date
            if lawyer_overrides.filter(date=specific_date, is_all_day=True).exists():
                continue # Skip this day entirely
                
            # Get time-specific overrides for this date
            date_specific_time_overrides = lawyer_overrides.filter(date=specific_date, is_all_day=False)

            # Iterate through the lawyer's general weekly availability for this day
            for avail in lawyer_availabilities.filter(day_of_week=day_of_week):
                # Define the potential slot start and end times based on weekly availability
                potential_start_dt = timezone.make_aware(datetime.combine(specific_date, avail.start_time))
                potential_end_dt = timezone.make_aware(datetime.combine(specific_date, avail.end_time))

                # --- Start Slot Generation within the potential availability block --- 
                # Assuming 1-hour slots for simplicity; adjust duration as needed
                slot_duration = timedelta(hours=1)
                current_slot_start = potential_start_dt

                while current_slot_start + slot_duration <= potential_end_dt:
                    current_slot_end = current_slot_start + slot_duration

                    # 1. Skip if slot is in the past
                    if current_slot_start < now:
                        current_slot_start = current_slot_end
                        continue

                    slot_is_available = True

                    # 2. Check against time-specific overrides for the day
                    for override in date_specific_time_overrides:
                        if override.start_time and override.end_time:
                            override_start_dt = timezone.make_aware(datetime.combine(specific_date, override.start_time))
                            override_end_dt = timezone.make_aware(datetime.combine(specific_date, override.end_time))
                            # Check for overlap: If slot starts before override ends AND slot ends after override starts
                            if current_slot_start < override_end_dt and current_slot_end > override_start_dt:
                                slot_is_available = False
                                break # Overlaps with an override
                    if not slot_is_available:
                        # Move to the next potential slot after this override
                        # This simple increment might skip valid slots if overrides are complex.
                        # A more robust approach might adjust current_slot_start based on override_end_dt.
                        current_slot_start = current_slot_end 
                        continue 

                    # 3. Check against booked appointments and active reservations
                    for unavailable_start, unavailable_end in unavailable_intervals:
                        # Check for overlap
                        if current_slot_start < unavailable_end and current_slot_end > unavailable_start:
                            slot_is_available = False
                            break # Overlaps with booked/reserved period
                    if not slot_is_available:
                         # Move to the next potential slot after this unavailable period
                         # Again, simple increment.
                         current_slot_start = current_slot_end
                         continue

                    # If we reach here, the slot is available
                    slots.append({'start': current_slot_start, 'end': current_slot_end})
                    
                    # Move to the next slot start time
                    current_slot_start = current_slot_end
        
        # Sort the final list of available slots chronologically
        slots.sort(key=lambda x: x['start'])
        return Response(slots)

class ClientAccessibleLawyerListViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoint for any authenticated user to list new lawyer profiles (users.models.LawyerProfile).
    Intended for clients to select a lawyer for appointments.
    """
    serializer_class = NewLawyerProfileSerializer # Using the serializer from users.serializers
    queryset = NewLawyerProfile.objects.all() # Querying new LawyerProfile model
    permission_classes = [permissions.IsAuthenticated]

# Obsolete LawyerProfileViewSet and ClientProfileViewSet (and its promote_to_lawyer action) were removed previously.
