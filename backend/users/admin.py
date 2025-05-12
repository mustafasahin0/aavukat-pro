from django.contrib import admin
from .models import UserProfile, LawyerProfile

class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'phone_number', 'is_initial_profile_complete')
    list_filter = ('role', 'is_initial_profile_complete')
    search_fields = ('user__username', 'user__email', 'phone_number')
    raw_id_fields = ('user',)

class LawyerProfileAdmin(admin.ModelAdmin):
    list_display = ('user_profile', 'is_lawyer_specific_profile_complete', 'years_of_experience', 'consultation_fee')
    list_filter = ('is_lawyer_specific_profile_complete',)
    search_fields = ('user_profile__user__username', 'bio', 'areas_of_practice')
    raw_id_fields = ('user_profile',)

admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(LawyerProfile, LawyerProfileAdmin) 