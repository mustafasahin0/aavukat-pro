from django.contrib.auth.models import User
from rest_framework import serializers
from .models import WeeklyAvailability, Appointment, AvailabilityOverride


class WeeklyAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyAvailability
        fields = ['id', 'day_of_week', 'start_time', 'end_time']


class AvailabilityOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilityOverride
        fields = ['id', 'lawyer', 'date', 'start_time', 'end_time', 'is_all_day', 'description']
        read_only_fields = ['lawyer']

    def validate(self, data):
        """
        Check that start_time is before end_time if both are provided and not is_all_day.
        Check that if is_all_day is True, start_time and end_time are None.
        Check that if is_all_day is False, start_time and end_time are provided.
        """
        is_all_day = data.get('is_all_day', self.instance.is_all_day if self.instance else False)
        start_time = data.get('start_time', self.instance.start_time if self.instance else None)
        end_time = data.get('end_time', self.instance.end_time if self.instance else None)

        if is_all_day:
            if start_time is not None or end_time is not None:
                raise serializers.ValidationError(
                    "If 'is_all_day' is true, 'start_time' and 'end_time' must be null."
                )
            data['start_time'] = None
            data['end_time'] = None
        else:
            if start_time is None or end_time is None:
                raise serializers.ValidationError(
                    "If 'is_all_day' is false, 'start_time' and 'end_time' must be provided."
                )
            if start_time and end_time and start_time >= end_time:
                raise serializers.ValidationError("End time must be after start time.")
        return data


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ['id', 'lawyer', 'client', 'start', 'end', 'status', 'created_at']
        read_only_fields = ['client', 'status', 'created_at'] 