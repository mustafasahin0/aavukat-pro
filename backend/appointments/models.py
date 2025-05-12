from django.db import models
from django.contrib.auth.models import User
# Import the new profile models from the 'users' app
from users.models import UserProfile, LawyerProfile as NewLawyerProfile

class WeeklyAvailability(models.Model):
    # Point to the new LawyerProfile from the 'users' app
    lawyer = models.ForeignKey(NewLawyerProfile, on_delete=models.CASCADE, related_name='availabilities')
    DAY_CHOICES = [
        (0, 'Monday'),
        (1, 'Tuesday'),
        (2, 'Wednesday'),
        (3, 'Thursday'),
        (4, 'Friday'),
        (5, 'Saturday'),
        (6, 'Sunday'),
    ]
    day_of_week = models.IntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        unique_together = ('lawyer', 'day_of_week', 'start_time', 'end_time')

    def __str__(self):
        # Access user through user_profile linkage
        return f"{self.lawyer.user_profile.user.username} - {self.get_day_of_week_display()} {self.start_time}-{self.end_time}"

class AvailabilityOverride(models.Model):
    # Point to the new LawyerProfile from the 'users' app
    lawyer = models.ForeignKey(NewLawyerProfile, on_delete=models.CASCADE, related_name='availability_overrides')
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True) # Null if is_all_day is True
    end_time = models.TimeField(null=True, blank=True)   # Null if is_all_day is True
    is_all_day = models.BooleanField(default=False)
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['date', 'start_time']
        unique_together = ('lawyer', 'date', 'start_time', 'end_time') # Prevent exact duplicate overrides

    def __str__(self):
        # Access user through user_profile linkage
        lawyer_username = self.lawyer.user_profile.user.username
        if self.is_all_day:
            return f"{lawyer_username} - {self.date} (All Day) - {self.description or 'Blocked'}"
        return f"{lawyer_username} - {self.date} {self.start_time}-{self.end_time} - {self.description or 'Blocked'}"

class Appointment(models.Model):
    # Point to the new LawyerProfile and UserProfile from the 'users' app
    lawyer = models.ForeignKey(NewLawyerProfile, on_delete=models.CASCADE, related_name='appointments_as_lawyer')
    client = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='appointments_as_client')
    start = models.DateTimeField()
    end = models.DateTimeField()
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        # Access usernames through their respective profile linkages
        client_username = self.client.user.username
        lawyer_username = self.lawyer.user_profile.user.username
        return f"{client_username} with {lawyer_username} at {self.start}"
