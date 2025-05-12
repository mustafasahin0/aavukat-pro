from django.contrib import admin

# Register your models here.
from .models import WeeklyAvailability, Appointment, AvailabilityOverride

@admin.register(WeeklyAvailability)
class WeeklyAvailabilityAdmin(admin.ModelAdmin):
    list_display = ('lawyer', 'day_of_week', 'start_time', 'end_time')
    list_filter = ('day_of_week',)

@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('client', 'lawyer', 'start', 'end', 'status')
    list_filter = ('status', 'start')

@admin.register(AvailabilityOverride)
class AvailabilityOverrideAdmin(admin.ModelAdmin):
    list_display = ('lawyer', 'date', 'start_time', 'end_time', 'is_all_day')
    list_filter = ('date', 'is_all_day')
