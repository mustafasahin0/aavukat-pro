import boto3
import os
import logging

# Get an instance of a logger
logger = logging.getLogger(__name__)

def add_user_to_cognito_group(username: str, user_pool_id: str, group_name: str, region_name: str) -> bool:
    """
    Adds a user to a specified group in AWS Cognito.

    Args:
        username: The username of the user in Cognito.
        user_pool_id: The Cognito User Pool ID.
        group_name: The name of the group to add the user to.
        region_name: The AWS region where the User Pool is located.

    Returns:
        True if the user was successfully added to the group, False otherwise.
    """
    try:
        cognito_client = boto3.client('cognito-idp', region_name=region_name)
        cognito_client.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=username,
            GroupName=group_name
        )
        logger.info(f"Successfully added user '{username}' to group '{group_name}' in User Pool '{user_pool_id}'.")
        return True
    except Exception as e:
        logger.error(f"Error adding user '{username}' to group '{group_name}': {str(e)}", exc_info=True)
        return False

def is_user_in_cognito_group(username: str, user_pool_id: str, group_name_to_check: str, region_name: str) -> bool:
    """
    Checks if a user is a member of a specific group in AWS Cognito.

    Args:
        username: The username of the user in Cognito.
        user_pool_id: The Cognito User Pool ID.
        group_name_to_check: The name of the group to check for membership.
        region_name: The AWS region where the User Pool is located.

    Returns:
        True if the user is in the specified group, False otherwise.
    """
    try:
        cognito_client = boto3.client('cognito-idp', region_name=region_name)
        response = cognito_client.admin_list_groups_for_user(
            Username=username,
            UserPoolId=user_pool_id,
            Limit=50 # Adjust if users can be in many groups, max 60
        )
        for group in response.get('Groups', []):
            if group.get('GroupName') == group_name_to_check:
                return True
        return False
    except Exception as e:
        logger.error(f"Error checking Cognito groups for user '{username}': {str(e)}", exc_info=True)
        return False # Default to false on error to be safe (e.g., might try to add them) 

def get_user_cognito_groups(username: str, user_pool_id: str, region_name: str) -> list[str]:
    """
    Retrieves a list of group names a user belongs to in AWS Cognito.

    Args:
        username: The username of the user in Cognito.
        user_pool_id: The Cognito User Pool ID.
        region_name: The AWS region where the User Pool is located.

    Returns:
        A list of group names, or an empty list if an error occurs or no groups.
    """
    try:
        cognito_client = boto3.client('cognito-idp', region_name=region_name)
        response = cognito_client.admin_list_groups_for_user(
            Username=username,
            UserPoolId=user_pool_id,
            Limit=50 # Max 60, adjust if users can be in many more groups
        )
        return [group.get('GroupName') for group in response.get('Groups', []) if group.get('GroupName')]
    except Exception as e:
        logger.error(f"Error retrieving Cognito groups for user '{username}': {str(e)}", exc_info=True)
        return [] # Return empty list on error 