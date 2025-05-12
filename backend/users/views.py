import os
# import json # No longer needed for request body parsing for username
import logging
from django.http import JsonResponse
# from django.views import View # Changed to APIView
from django.contrib.auth.models import User
from django.db import transaction

from rest_framework.views import APIView # Import APIView
from rest_framework.permissions import IsAuthenticated # Import IsAuthenticated
from config.authentication import CognitoAuthentication # Import CognitoAuthentication
from rest_framework import generics, permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
# UserProfile is now in .models, not appointments.models
from .models import UserProfile, LawyerProfile
from .serializers import UserProfileSerializer
# Import cognito admin actions
from . import cognito_admin_actions

# Assuming services.py is in the same 'users' app directory
from .services import add_user_to_cognito_group, get_user_cognito_groups
# Removed: from appointments.models import ClientProfile

# Get an instance of a logger
logger = logging.getLogger(__name__)

class PostCognitoSignUpHandlerView(APIView): # Inherit from APIView
    authentication_classes = [CognitoAuthentication] # Explicitly set CognitoAuthentication
    permission_classes = [IsAuthenticated] # Require token authentication

    def post(self, request, *args, **kwargs):
        cognito_username = request.user.username

        if not cognito_username:
            logger.error("PostCognitoSignUpHandlerView: Username missing after authentication.")
            return JsonResponse({'status': 'error', 'message': 'Authenticated user username missing.'}, status=400)

        user_pool_id = os.getenv('COGNITO_USER_POOL_ID')
        clients_group_name = os.getenv('COGNITO_CLIENTS_GROUP_NAME', 'clients')
        lawyers_group_name = os.getenv('COGNITO_LAWYERS_GROUP_NAME', 'lawyers') # Assuming env var exists
        admins_group_name = os.getenv('COGNITO_ADMINS_GROUP_NAME', 'admins')   # Assuming env var exists
        cognito_region = os.getenv('COGNITO_REGION')

        if not all([user_pool_id, clients_group_name, lawyers_group_name, admins_group_name, cognito_region]):
            logger.error("COGNITO_CONFIG_ERROR: Missing critical Cognito configuration (User Pool ID, Group Names, Region).")
            return JsonResponse({'status': 'error', 'message': 'Server configuration error for Cognito roles.'}, status=500)

        action_taken = "no_action_needed_db_sync_only"
        user_cognito_groups = get_user_cognito_groups(
            username=cognito_username,
            user_pool_id=user_pool_id,
            region_name=cognito_region
        )

        # Define your primary/managed role groups
        # Order might matter if a user could somehow be in multiple, though ideally they are mutually exclusive for this logic.
        primary_role_groups = [clients_group_name, lawyers_group_name, admins_group_name]
        
        user_is_already_in_a_primary_role = any(group_name in user_cognito_groups for group_name in primary_role_groups)

        if user_is_already_in_a_primary_role:
            logger.info(f"User '{cognito_username}' is already in a primary Cognito role: {user_cognito_groups}. No default group assignment needed.")
            action_taken = "already_in_primary_group"
        else:
            # User is not in clients, lawyers, or admins group - assign to default clients group
            logger.info(f"User '{cognito_username}' not in any primary role. Attempting to add to default group '{clients_group_name}'.")
            success_cognito_add = add_user_to_cognito_group(
                username=cognito_username,
                user_pool_id=user_pool_id,
                group_name=clients_group_name,
                region_name=cognito_region
            )
            if not success_cognito_add:
                logger.error(f"Failed to assign default group '{clients_group_name}' to user '{cognito_username}'.")
                return JsonResponse({
                    'status': 'error',
                    'message': f'Failed to assign default group to user {cognito_username} in Cognito.'
                }, status=500)
            logger.info(f"Successfully added Cognito user '{cognito_username}' to default group '{clients_group_name}'.")
            action_taken = "default_group_assigned"
            user_cognito_groups = get_user_cognito_groups(cognito_username, user_pool_id, cognito_region) # Refresh groups

        try:
            # Django User and UserProfile are ensured by CognitoAuthentication and signals
            # No need to explicitly get_or_create User or old ClientProfile here.
            logger.info(f"User '{cognito_username}' processed. Action: {action_taken}. Final groups: {user_cognito_groups}")
            return JsonResponse({
                'status': 'success',
                'message': f'User {cognito_username} sync processed.',
                'action_taken': action_taken,
                'cognito_groups': user_cognito_groups
            })
        except Exception as e_db: # Should be rare now as we removed DB operations from here
            logger.error(f"DJANGO_DB_ERROR (unexpected) for '{cognito_username}': {str(e_db)}", exc_info=True)
            return JsonResponse({'status': 'error', 'message': 'Unexpected error during post-signup processing.'}, status=500)


class UserProfileDetailView(generics.RetrieveUpdateAPIView):
    """
    Retrieve or update the profile of the currently authenticated user.
    """
    serializer_class = UserProfileSerializer
    # Ensure this uses the correct CognitoAuthentication from your project structure if it's not default
    # authentication_classes = [CognitoAuthentication] # Already set globally in REST_FRAMEWORK settings
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # UserProfile is created by a signal when User is created.
        # self.request.user will be the Django User model instance from CognitoAuthentication
        profile, created = UserProfile.objects.get_or_create(user=self.request.user)
        # No need to save here if defaults are set in model and signal handles creation properly.
        # if created: profile.save() 
        return profile

    # perform_update is often not needed if the serializer handles the update logic, 
    # especially with nested serializers. The default behavior of RetrieveUpdateAPIView
    # will call serializer.save() with the instance from get_object().
    # def perform_update(self, serializer):
    #     serializer.save() 

class AdminUserProfileViewSet(viewsets.ModelViewSet):
    """
    Admin endpoint to list, retrieve, update, and delete user profiles.
    Provides user details, role, and lawyer-specific details if applicable.
    Restricted to admin users.
    Allows role changes, activation/deactivation, and deletion.
    """
    queryset = UserProfile.objects.all().select_related('user').prefetch_related('lawyer_details')
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAdminUser]
    # authentication_classes = [CognitoAuthentication] # Uses default from settings

    def perform_destroy(self, instance):
        user_to_delete = instance.user
        username = user_to_delete.username
        try:
            # Step 1: Delete from Cognito
            success_cognito = cognito_admin_actions.delete_cognito_user(username)
            if not success_cognito:
                # Log the error but proceed to delete locally if admin confirms,
                # or raise an exception to halt. For now, let's log and proceed.
                logger.error(f"Admin action: Failed to delete user {username} from Cognito. Proceeding with local deletion.")
                # To be stricter: raise exceptions.APIException("Failed to delete user from Cognito.")
            
            # Step 2: Delete Django User (UserProfile will be cascade deleted)
            # The UserProfile instance (`instance`) is deleted by ModelViewSet's destroy,
            # which then triggers User deletion due to UserProfile's OneToOneField(User, on_delete=models.CASCADE)
            # If UserProfile.user is not CASCADE, then: user_to_delete.delete()
            # Assuming UserProfile.user relationship handles cascade or is handled by super().perform_destroy(instance)
            super().perform_destroy(instance) # This deletes the UserProfile, which should cascade to User
            logger.info(f"Admin action: Successfully deleted user {username} and their profile locally.")

        except Exception as e:
            logger.error(f"Admin action: Error deleting user {username}: {str(e)}", exc_info=True)
            # Re-raise as a DRF exception to send a 500 error to client
            raise exceptions.APIException(f"An error occurred while deleting user {username}.")


    @action(detail=True, methods=['post'], url_path='set-role')
    def set_role(self, request, pk=None):
        user_profile = self.get_object()
        user = user_profile.user
        new_role = request.data.get('role')

        if new_role not in ['client', 'lawyer', 'admin']: # Admin role change handled by direct Cognito group management
            return Response({'error': 'Invalid role specified. Must be "client" or "lawyer".'}, status=status.HTTP_400_BAD_REQUEST)

        current_role = user_profile.role
        if current_role == new_role:
            return Response({'message': f'User is already a {new_role}.'}, status=status.HTTP_200_OK)

        try:
            with transaction.atomic():
                # Update Django UserProfile
                user_profile.role = new_role
                
                # Update Django User staff/superuser status based on new role
                if new_role == 'admin':
                    user.is_staff = True
                    user.is_superuser = True
                elif new_role == 'lawyer':
                    user.is_staff = False # Lawyers are not staff unless also admin
                    user.is_superuser = False
                    LawyerProfile.objects.get_or_create(user_profile=user_profile)
                else: # client
                    user.is_staff = False
                    user.is_superuser = False
                
                user_profile.save()
                user.save()

                # Update Cognito groups
                success_cognito = cognito_admin_actions.update_user_cognito_role(user.username, new_role)
                if not success_cognito:
                    # Log error, but transaction will commit local changes.
                    # Consider if this should be a transactional failure.
                    logger.error(f"Admin action: Failed to update Cognito role for user {user.username} to {new_role}.")
                    # raise exceptions.APIException("Failed to update user role in Cognito. Local changes rolled back.") # If strict
                    # For now, let's allow local changes even if Cognito fails, but log it.
                    return Response({
                        'message': f'Role updated to {new_role} locally, but failed to sync with Cognito. Please check Cognito console.',
                        'user_profile': self.get_serializer(user_profile).data
                    }, status=status.HTTP_207_MULTI_STATUS)


            logger.info(f"Admin action: Successfully changed role for user {user.username} to {new_role}.")
            return Response({'message': f'Role successfully changed to {new_role}.', 'user_profile': self.get_serializer(user_profile).data})
        except Exception as e:
            logger.error(f"Admin action: Error changing role for user {user.username}: {str(e)}", exc_info=True)
            return Response({'error': f'An error occurred: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    @action(detail=True, methods=['post'], url_path='set-active-status')
    def set_active_status(self, request, pk=None):
        user_profile = self.get_object()
        user = user_profile.user
        is_active_status = request.data.get('is_active')

        if not isinstance(is_active_status, bool):
            return Response({'error': 'Invalid "is_active" value. Must be true or false.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.is_active == is_active_status:
            status_text = "active" if is_active_status else "inactive"
            return Response({'message': f'User is already {status_text}.'}, status=status.HTTP_200_OK)
        
        try:
            with transaction.atomic():
                user.is_active = is_active_status
                user.save()

                # Update Cognito user status
                if is_active_status:
                    success_cognito = cognito_admin_actions.enable_cognito_user(user.username)
                else:
                    success_cognito = cognito_admin_actions.disable_cognito_user(user.username)

                if not success_cognito:
                    action_text = "enable" if is_active_status else "disable"
                    logger.error(f"Admin action: Failed to {action_text} user {user.username} in Cognito.")
                    # As with set_role, decide if this should be a hard failure or warning
                    return Response({
                        'message': f'User status updated locally, but failed to sync with Cognito. Please check Cognito console.',
                        'user_profile': self.get_serializer(user_profile).data
                    }, status=status.HTTP_207_MULTI_STATUS)

            status_text = "activated" if is_active_status else "deactivated"
            logger.info(f"Admin action: Successfully {status_text} user {user.username}.")
            return Response({'message': f'User successfully {status_text}.', 'user_profile': self.get_serializer(user_profile).data})
        except Exception as e:
            logger.error(f"Admin action: Error changing active status for user {user.username}: {str(e)}", exc_info=True)
            return Response({'error': f'An error occurred: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Standard actions (list, retrieve) are provided by ReadOnlyModelViewSet.
    # No custom actions needed for just listing/retrieving. 