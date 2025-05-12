from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('client', 'Client'),
        ('lawyer', 'Lawyer'),
        ('admin', 'Admin'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='client')
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    is_initial_profile_complete = models.BooleanField(default=False)

    # New fields for extended user information
    date_of_birth = models.DateField(null=True, blank=True)
    nationality = models.CharField(max_length=100, blank=True, null=True)
    home_address = models.TextField(blank=True, null=True)
    spoken_language = models.CharField(max_length=100, blank=True, null=True) # Consider a more structured field if multiple languages or specific choices are needed
    preferred_communication_method = models.CharField(max_length=50, blank=True, null=True) # E.g., 'Email', 'Phone', 'Video Call'
    time_zone = models.CharField(max_length=50, blank=True, null=True) # E.g., 'America/New_York', 'UTC'

    # This flag below might be better suited directly on LawyerProfile
    # but keeping it here for now if it drives UI logic before lawyer details are fully created.
    # is_lawyer_profile_approved = models.BooleanField(default=False) # Admin approval if needed

    def __str__(self):
        return f"{self.user.username}'s Profile ({self.get_role_display()})"

@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    # Ensure profile is saved if user is updated, though often not strictly necessary
    # if profile fields aren't derived from user fields being changed post-creation.
    # However, if user's email/name changes, profile might want to reflect or log that.
    # For now, a simple save() is okay, or it could be more conditional.
    if hasattr(instance, 'profile'):
        instance.profile.save()

class LawyerProfile(models.Model):
    user_profile = models.OneToOneField(UserProfile, on_delete=models.CASCADE, related_name='lawyer_details')
    bar_admission_details = models.TextField(blank=True, null=True, help_text="JSON or structured text, e.g., {'state': 'NY', 'bar_number': '12345'}") # Consider a JSONField if your DB supports it
    areas_of_practice = models.TextField(blank=True, null=True, help_text="Comma-separated or JSON list of practice areas") # Or a ManyToManyField to a PracticeArea model
    office_location_address = models.TextField(blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    profile_picture_url = models.URLField(max_length=500, blank=True, null=True)
    years_of_experience = models.PositiveIntegerField(null=True, blank=True)
    education = models.TextField(blank=True, null=True, help_text="e.g., Law School, Graduation Year")
    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    languages_spoken = models.CharField(max_length=255, blank=True, null=True, help_text="Comma-separated list")
    website_url = models.URLField(max_length=255, blank=True, null=True)
    is_lawyer_specific_profile_complete = models.BooleanField(default=False) # Tracks completion of *these* details

    def __str__(self):
        return f"Lawyer Details for {self.user_profile.user.username}"

# To ensure LawyerProfile is created when role becomes 'lawyer'
# This could also be handled in the admin action that promotes a user,
# or via a signal listening to UserProfile role changes.
# Example of a signal (add this if you want automatic creation, but test thoroughly):
# @receiver(post_save, sender=UserProfile)
# def create_lawyer_profile_on_role_change(sender, instance, created, **kwargs):
#     if not created and instance.role == 'lawyer':
#         LawyerProfile.objects.get_or_create(user_profile=instance) 