import os
import requests
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import authentication, exceptions
from jose import jwk, jwt
from jose.exceptions import JWTError
# Import the new UserProfile and LawyerProfile from the users app
from users.models import UserProfile, LawyerProfile as NewLawyerProfile

# Comment out or remove old profile imports if they are fully replaced
# from appointments.models import LawyerProfile as OldLawyerProfile, ClientProfile


class CognitoAuthentication(authentication.BaseAuthentication):
    """
    Authenticates users via AWS Cognito JWT tokens.
    """
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header:
            return None
        parts = auth_header.split()
        if parts[0].lower() != 'bearer' or len(parts) != 2:
            raise exceptions.AuthenticationFailed('Invalid Authorization header')
        token = parts[1]

        # Fetch JWKS from Cognito
        try:
            jwks = requests.get(settings.COGNITO_JWKS_URL).json()
        except Exception as e:
            # It's good practice to log the original error for debugging
            # import logging; logger = logging.getLogger(__name__); logger.error(f'JWKS fetch error: {e}', exc_info=True)
            raise exceptions.AuthenticationFailed(f'Error fetching JWKS. Please try again later.')

        # Get the signing key
        try:
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header['kid']
            # Ensure jwks has 'keys' array
            if 'keys' not in jwks or not isinstance(jwks['keys'], list):
                raise exceptions.AuthenticationFailed('Invalid JWKS format: missing or invalid \'keys\' array.')
            key = next((k for k in jwks['keys'] if k['kid'] == kid), None)
            if key is None:
                 raise exceptions.AuthenticationFailed('Public key not found in JWKS for the given kid.')
        except Exception as e:
            # import logging; logger = logging.getLogger(__name__); logger.error(f'JWKS key error: {e}', exc_info=True)
            raise exceptions.AuthenticationFailed(f'Error processing JWKS. {str(e)}')

        # Verify token
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=[unverified_header.get('alg', 'RS256')],
                audience=settings.COGNITO_APP_CLIENT_ID,
                issuer=f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}"
            )
        except JWTError as e:
            raise exceptions.AuthenticationFailed(f'Token validation error: {e}')

        # Token is valid. Get or create Django user.
        username = claims.get('cognito:username') or claims.get('username') or claims.get('sub')
        if not username:
            raise exceptions.AuthenticationFailed('JWT contained no username or sub claim')
        
        user, created_django_user = User.objects.get_or_create(
            username=username,
            defaults={
                'email': claims.get('email', ''),
                'first_name': claims.get('given_name', ''),
                'last_name': claims.get('family_name', ''),
            }
        )

        # Get or create our application UserProfile (signal in users.models handles creation if user is new)
        # This ensures UserProfile exists before we try to access or modify it.
        user_profile, created_app_profile = UserProfile.objects.get_or_create(user=user)

        # Sync role based on Cognito groups
        groups = claims.get('cognito:groups', []) or []
        
        # Determine the new role based on Cognito groups - using os.getenv for group names
        admin_group = os.getenv('COGNITO_ADMINS_GROUP_NAME', 'admins')
        lawyer_group = os.getenv('COGNITO_LAWYERS_GROUP_NAME', 'lawyers')
        # client_group = os.getenv('COGNITO_CLIENTS_GROUP_NAME', 'clients') # Not strictly needed if client is default

        new_role = 'client' # Default role
        user_is_staff_updated = False

        if admin_group in groups:
            new_role = 'admin'
            if not user.is_staff or not user.is_superuser:
                user.is_staff = True
                user.is_superuser = True
                user_is_staff_updated = True
        elif lawyer_group in groups:
            new_role = 'lawyer'
            if user.is_staff or user.is_superuser: # Demote from admin if only lawyer
                user.is_staff = False
                user.is_superuser = False
                user_is_staff_updated = True
            NewLawyerProfile.objects.get_or_create(user_profile=user_profile)
        else: # Default to client if not in admin or lawyer group
            new_role = 'client'
            if user.is_staff or user.is_superuser: # Demote from admin if only client
                user.is_staff = False
                user.is_superuser = False
                user_is_staff_updated = True
        
        # Update UserProfile role if it has changed or if the app profile was just created (to override default)
        if user_profile.role != new_role or created_app_profile:
            user_profile.role = new_role
            user_profile.save()
        
        if user_is_staff_updated: # Save user only if staff/superuser status actually changed
            user.save()
            
        return (user, None) 