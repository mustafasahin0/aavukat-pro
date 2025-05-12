from django.apps import AppConfig

class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users'

    def ready(self):
        # If you create a signals.py file in the users app and want to connect signals there,
        # import them here. For example:
        # import users.signals
        pass # Placeholder, signals in models.py are registered on model import 