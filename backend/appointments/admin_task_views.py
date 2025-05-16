from rest_framework import viewsets, permissions
from django_celery_beat.models import IntervalSchedule, CrontabSchedule, PeriodicTask
from .admin_task_serializers import IntervalScheduleSerializer, CrontabScheduleSerializer, PeriodicTaskSerializer
# We will define PeriodicTaskViewSet later

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from celery import current_app # Using current_app is generally preferred for tasks

class IntervalScheduleViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Interval Schedules to be viewed or edited by admins.
    """
    queryset = IntervalSchedule.objects.all()
    serializer_class = IntervalScheduleSerializer
    permission_classes = [permissions.IsAdminUser] # Only allow admin users

class CrontabScheduleViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Crontab Schedules to be viewed or edited by admins.
    """
    queryset = CrontabSchedule.objects.all()
    serializer_class = CrontabScheduleSerializer
    permission_classes = [permissions.IsAdminUser] # Only allow admin users 

class PeriodicTaskViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Periodic Tasks to be viewed or edited by admins.
    Provides functionality to manage task schedules and parameters.
    """
    queryset = PeriodicTask.objects.all().select_related(
        'interval', 'crontab' # Add solar, clocked if used
    ).order_by('name')
    serializer_class = PeriodicTaskSerializer
    permission_classes = [permissions.IsAdminUser]

    # Optional: If you need finer control over updates or want to expose available tasks
    # you could add custom actions here.
    # For example, a GET action to list available tasks for a dropdown:
    # @action(detail=False, methods=['get'])
    # def available_celery_tasks(self, request):
    #     from config.celery import app as celery_app
    #     task_names = [
    #         task_name for task_name in sorted(celery_app.tasks.keys()) 
    #         if not task_name.startswith('celery.')
    #     ]
    #     return Response(task_names) 

class TriggerTaskView(APIView):
    """
    Allows an admin user to manually trigger any registered Celery task by its name.
    Expects a POST request with JSON body: {
        "task_name": "name.of.celery.task",
        "args": ["positional_arg1", "positional_arg2"],
        "kwargs": {"keyword_arg1": "value1"}
    }
    'args' and 'kwargs' are optional.
    """
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        task_name = request.data.get('task_name')
        # Defaults for args and kwargs if not provided or if None
        task_args = request.data.get('args') if request.data.get('args') is not None else [] 
        task_kwargs = request.data.get('kwargs') if request.data.get('kwargs') is not None else {}

        if not task_name:
            return Response({"error": "task_name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Validate args and kwargs types carefully
            if not isinstance(task_args, list):
                 return Response({"error": "'args' must be a list."}, status=status.HTTP_400_BAD_REQUEST)
            if not isinstance(task_kwargs, dict):
                 return Response({"error": "'kwargs' must be a dictionary."}, status=status.HTTP_400_BAD_REQUEST)

            # Check if the task exists in the current Celery app's registry
            if task_name not in current_app.tasks:
                available_tasks = [name for name in sorted(current_app.tasks.keys()) if not name.startswith('celery.')]
                return Response(
                    {"error": f"Task '{task_name}' not found. Available tasks include: {available_tasks}"},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Asynchronously send the task to the Celery workers
            current_app.send_task(name=task_name, args=task_args, kwargs=task_kwargs)
            
            return Response(
                {"message": f"Task '{task_name}' has been successfully queued."}, 
                status=status.HTTP_202_ACCEPTED
            )
        except Exception as e:
            # Log the exception for server-side review
            # logger.error(f"Error triggering task {task_name}: {e}", exc_info=True) # Make sure logger is defined
            print(f"Error triggering task {task_name}: {e}") # Simple print for now
            return Response(
                {"error": f"Failed to trigger task '{task_name}'. Please check server logs."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            ) 