import boto3
import os
import logging

logger = logging.getLogger(__name__)

COGNITO_USER_POOL_ID = os.getenv('COGNITO_USER_POOL_ID')
COGNITO_REGION = os.getenv('COGNITO_REGION')
# Define group names from environment variables for consistency
ADMINS_GROUP_NAME = os.getenv('COGNITO_ADMINS_GROUP_NAME', 'admins')
LAWYERS_GROUP_NAME = os.getenv('COGNITO_LAWYERS_GROUP_NAME', 'lawyers')
CLIENTS_GROUP_NAME = os.getenv('COGNITO_CLIENTS_GROUP_NAME', 'clients')

# Initialize Cognito Identity Provider client
cognito_client = None
if COGNITO_USER_POOL_ID and COGNITO_REGION:
    cognito_client = boto3.client('cognito-idp', region_name=COGNITO_REGION)
else:
    logger.error("Cognito User Pool ID or Region not configured. Cognito admin actions will fail.")

def _get_cognito_client():
    if not cognito_client:
        logger.error("Cognito client not initialized due to missing configuration.")
        raise Exception("Cognito client not initialized.") # Or handle more gracefully
    return cognito_client

def delete_cognito_user(username: str) -> bool:
    """Deletes a user from Cognito User Pool."""
    client = _get_cognito_client()
    try:
        client.admin_delete_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=username
        )
        logger.info(f"Successfully deleted user {username} from Cognito.")
        return True
    except client.exceptions.UserNotFoundException:
        logger.warning(f"User {username} not found in Cognito. Considered deletion successful for cleanup.")
        return True # If user not found, it's effectively deleted from Cognito perspective
    except Exception as e:
        logger.error(f"Error deleting user {username} from Cognito: {str(e)}", exc_info=True)
        return False

def update_user_cognito_role(username: str, new_role: str) -> bool:
    """Updates user's Cognito groups based on the new role."""
    client = _get_cognito_client()
    
    # Determine target group and groups to remove from
    target_group = None
    remove_from_groups = []

    if new_role == 'admin':
        target_group = ADMINS_GROUP_NAME
        remove_from_groups = [LAWYERS_GROUP_NAME, CLIENTS_GROUP_NAME]
    elif new_role == 'lawyer':
        target_group = LAWYERS_GROUP_NAME
        remove_from_groups = [ADMINS_GROUP_NAME, CLIENTS_GROUP_NAME]
    elif new_role == 'client':
        target_group = CLIENTS_GROUP_NAME
        remove_from_groups = [ADMINS_GROUP_NAME, LAWYERS_GROUP_NAME]
    else:
        logger.error(f"Invalid role specified for Cognito group update: {new_role}")
        return False

    try:
        # Fetch current groups to avoid unnecessary "remove from group user is not in" errors.
        # However, admin_remove_user_from_group doesn't error if user not in group, so this is optional.
        # current_groups_response = client.admin_list_groups_for_user(Username=username, UserPoolId=COGNITO_USER_POOL_ID)
        # current_group_names = [group['GroupName'] for group in current_groups_response.get('Groups', [])]

        # Remove from other primary role groups
        for group_name in remove_from_groups:
            # if group_name in current_group_names: # Optimization: only remove if member
            try:
                client.admin_remove_user_from_group(
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Username=username,
                    GroupName=group_name
                )
                logger.info(f"Removed user {username} from Cognito group {group_name}.")
            except client.exceptions.UserNotFoundException:
                 logger.warning(f"User {username} not found when trying to remove from group {group_name}.")
                 # If user not found, can't change groups, could be an issue.
                 return False # Or handle as a partial success/failure
            except Exception as e_remove: # Catch specific boto3 exceptions if needed
                logger.error(f"Error removing user {username} from Cognito group {group_name}: {str(e_remove)}")
                # Decide if this is a critical failure for the whole operation

        # Add to the target group
        if target_group:
            try:
                client.admin_add_user_to_group(
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Username=username,
                    GroupName=target_group
                )
                logger.info(f"Added user {username} to Cognito group {target_group}.")
            except client.exceptions.UserNotFoundException:
                 logger.warning(f"User {username} not found when trying to add to group {target_group}.")
                 return False 
            except Exception as e_add:
                logger.error(f"Error adding user {username} to Cognito group {target_group}: {str(e_add)}")
                return False
        
        logger.info(f"Successfully updated Cognito groups for user {username} to reflect role {new_role}.")
        return True
        
    except Exception as e:
        logger.error(f"Error updating Cognito groups for user {username}: {str(e)}", exc_info=True)
        return False

def enable_cognito_user(username: str) -> bool:
    """Enables a user in Cognito User Pool."""
    client = _get_cognito_client()
    try:
        client.admin_enable_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=username
        )
        logger.info(f"Successfully enabled user {username} in Cognito.")
        return True
    except client.exceptions.UserNotFoundException:
        logger.warning(f"User {username} not found in Cognito. Cannot enable.")
        return False # Or True if "not found" means no action needed and it's not an error state
    except Exception as e:
        logger.error(f"Error enabling user {username} in Cognito: {str(e)}", exc_info=True)
        return False

def disable_cognito_user(username: str) -> bool:
    """Disables a user in Cognito User Pool."""
    client = _get_cognito_client()
    try:
        client.admin_disable_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=username
        )
        logger.info(f"Successfully disabled user {username} in Cognito.")
        return True
    except client.exceptions.UserNotFoundException:
        logger.warning(f"User {username} not found in Cognito. Cannot disable.")
        return False # Or True if "not found" means no action needed
    except Exception as e:
        logger.error(f"Error disabling user {username} in Cognito: {str(e)}", exc_info=True)
        return False 