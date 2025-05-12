from django.shortcuts import render
from rest_framework import viewsets, permissions, exceptions
from .models import WeeklyAvailability, Appointment, AvailabilityOverride
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

    def perform_create(self, serializer):
        user = self.request.user
        # IsClient permission ensures user.profile.role == 'client'
        if hasattr(user, 'profile') and user.profile.role == 'client':
            # Serializer expects 'lawyer' field to be an ID of NewLawyerProfile
            serializer.save(client=user.profile)
        else:
            raise exceptions.PermissionDenied('Only clients can book appointments.')

    @action(detail=False, methods=['get'])
    def available_slots(self, request):
        lawyer_id_str = request.query_params.get('lawyer_id')
        if not lawyer_id_str:
            return Response({'error': 'Missing lawyer_id'}, status=400)
        try:
            lawyer_id = int(lawyer_id_str)
            # lawyer_id now refers to users.models.LawyerProfile ID
            lawyer = NewLawyerProfile.objects.get(id=lawyer_id)
        except (ValueError, NewLawyerProfile.DoesNotExist):
            return Response({'error': 'Lawyer not found or invalid ID'}, status=404)
        
        today = timezone.now().date()
        dates_to_check = [today + timezone.timedelta(days=i) for i in range(7)]
        
        # These related lookups now use the NewLawyerProfile instance
        lawyer_overrides = AvailabilityOverride.objects.filter(lawyer=lawyer)
        lawyer_availabilities = WeeklyAvailability.objects.filter(lawyer=lawyer)
        
        slots = []
        for specific_date in dates_to_check:
            day_of_week = specific_date.weekday()
            if lawyer_overrides.filter(date=specific_date, is_all_day=True).exists():
                continue
            date_specific_time_overrides = lawyer_overrides.filter(date=specific_date, is_all_day=False)

            for avail in lawyer_availabilities.filter(day_of_week=day_of_week):
                slot_start_dt = timezone.make_aware(timezone.datetime.combine(specific_date, avail.start_time))
                slot_end_dt = timezone.make_aware(timezone.datetime.combine(specific_date, avail.end_time))
                if slot_start_dt <= timezone.now():
                    continue
                is_overlapped_by_override = False
                for override in date_specific_time_overrides:
                    if override.start_time and override.end_time:
                        override_start_dt = timezone.make_aware(timezone.datetime.combine(specific_date, override.start_time))
                        override_end_dt = timezone.make_aware(timezone.datetime.combine(specific_date, override.end_time))
                        if slot_start_dt < override_end_dt and slot_end_dt > override_start_dt:
                            is_overlapped_by_override = True
                            break
                if not is_overlapped_by_override:
                    slots.append({'start': slot_start_dt, 'end': slot_end_dt})
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
