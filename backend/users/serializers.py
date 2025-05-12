from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, LawyerProfile

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_active'] # Added is_active

class LawyerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(source='user_profile.user', read_only=True)
    # The default primary key (id) for LawyerProfile will be included automatically by ModelSerializer
    # if not explicitly excluded and 'id' is not used for something else.
    # To be explicit and ensure it matches frontend expectation if needed for selection:
    # id = serializers.IntegerField(source='pk', read_only=True) # pk is the default source for id

    class Meta:
        model = LawyerProfile
        # Add 'id' (if not default) and 'user' to fields list
        fields = [
            'id', # Standard way to get the PK for LawyerProfile
            'user',
            'bar_admission_details',
            'areas_of_practice',
            'office_location_address',
            'bio',
            'profile_picture_url',
            'years_of_experience',
            'education',
            'consultation_fee',
            'languages_spoken',
            'website_url',
            'is_lawyer_specific_profile_complete',
        ]

class UserProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    lawyer_details = LawyerProfileSerializer(required=False, allow_null=True)

    class Meta:
        model = UserProfile
        fields = [
            'id',
            'user',
            'role',
            'phone_number',
            'date_of_birth',
            'nationality',
            'home_address',
            'spoken_language',
            'preferred_communication_method',
            'time_zone',
            'is_initial_profile_complete',
            'lawyer_details',
        ]
        # Removed 'lawyer_details' from read_only_fields
        # Role is changed via specific admin endpoint or by Cognito sync on login.
        # User should not change their own role directly via profile update.
        read_only_fields = ['user', 'role'] 

    def update(self, instance, validated_data):
        # Update direct UserProfile fields
        instance.phone_number = validated_data.get('phone_number', instance.phone_number)
        instance.date_of_birth = validated_data.get('date_of_birth', instance.date_of_birth)
        instance.nationality = validated_data.get('nationality', instance.nationality)
        instance.home_address = validated_data.get('home_address', instance.home_address)
        instance.spoken_language = validated_data.get('spoken_language', instance.spoken_language)
        instance.preferred_communication_method = validated_data.get('preferred_communication_method', instance.preferred_communication_method)
        instance.time_zone = validated_data.get('time_zone', instance.time_zone)
        instance.is_initial_profile_complete = validated_data.get('is_initial_profile_complete', instance.is_initial_profile_complete)
        
        instance.save() # Save UserProfile changes first

        # Update User model's first_name and last_name if provided
        user_data_updated = False
        if 'first_name' in validated_data:
            instance.user.first_name = validated_data.get('first_name')
            user_data_updated = True
        
        if 'last_name' in validated_data:
            instance.user.last_name = validated_data.get('last_name')
            user_data_updated = True

        if user_data_updated:
            instance.user.save()

        # Handle nested update for lawyer_details
        # Use .get() as lawyer_details might not be in the payload for all partial updates
        lawyer_data = validated_data.get('lawyer_details', None)

        if instance.role == 'lawyer' and lawyer_data is not None:
            # Get or create the LawyerProfile instance associated with the UserProfile
            lawyer_profile_instance, created = LawyerProfile.objects.get_or_create(user_profile=instance)
            
            # Use the LawyerProfileSerializer to validate and save the nested lawyer data
            # Pass partial=True because the incoming request is a PATCH and might not contain all fields
            lawyer_serializer = LawyerProfileSerializer(instance=lawyer_profile_instance, data=lawyer_data, partial=True)
            if lawyer_serializer.is_valid(raise_exception=True):
                lawyer_serializer.save() # This saves the changes to the lawyer_profile_instance
        
        # The instance (UserProfile) is already partially saved. 
        # Re-serializing it after potential lawyer_profile update will reflect changes.
        return instance 