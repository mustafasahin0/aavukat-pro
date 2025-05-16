from rest_framework import serializers
from django_celery_beat.models import IntervalSchedule, CrontabSchedule, PeriodicTask
# We might need SolarSchedule and ClockedSchedule later if you use them.

class IntervalScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntervalSchedule
        fields = '__all__'

class CrontabScheduleSerializer(serializers.ModelSerializer):
    # Explicitly serialize timezone as its string representation
    timezone = serializers.CharField(read_only=True)

    class Meta:
        model = CrontabSchedule
        # List all fields except the original timezone field 
        # which is now handled by the CharField above
        fields = [
            'id',
            'minute', 
            'hour', 
            'day_of_week', 
            'day_of_month', 
            'month_of_year',
            'timezone' # This refers to the CharField defined above
        ]
        # We can make all fields read_only if we don't intend to manage crontabs via this API
        # read_only_fields = fields 

# We will define PeriodicTaskSerializer later, as it's more complex. 

# Import Celery app instance from your project's Celery configuration
from config.celery import app as celery_app

class PeriodicTaskSerializer(serializers.ModelSerializer):
    # Schedule fields: allow null and not required, as only one can be active.
    # The frontend will typically pass the ID of an existing IntervalSchedule or CrontabSchedule.
    interval = serializers.PrimaryKeyRelatedField(
        queryset=IntervalSchedule.objects.all(), 
        required=False, 
        allow_null=True,
        help_text="ID of an IntervalSchedule. Set only one schedule type (interval, crontab, etc.)."
    )
    crontab = serializers.PrimaryKeyRelatedField(
        queryset=CrontabSchedule.objects.all(), 
        required=False, 
        allow_null=True,
        help_text="ID of a CrontabSchedule. Set only one schedule type."
    )
    # If you use Solar or Clocked schedules, add them similarly:
    # solar = serializers.PrimaryKeyRelatedField(queryset=SolarSchedule.objects.all(), required=False, allow_null=True)
    # clocked = serializers.PrimaryKeyRelatedField(queryset=ClockedSchedule.objects.all(), required=False, allow_null=True)

    # Read-only field to display the active schedule type and its details clearly.
    schedule_display = serializers.SerializerMethodField(
        read_only=True, 
        help_text="String representation of the active schedule."
    )
    
    # For task selection on create/update: Use ChoiceField with dynamically populated choices.
    # For read: Use a CharField to display the task path.
    task = serializers.ChoiceField(choices=[], required=True, write_only=True)
    task_display = serializers.CharField(source='task', read_only=True, help_text="Registered name of the Celery task.")

    # Ensure args and kwargs are treated as JSON, defaulting to empty list/dict.
    args = serializers.JSONField(required=False, default=list, help_text="JSON array of positional arguments for the task.")
    kwargs = serializers.JSONField(required=False, default=dict, help_text="JSON object of keyword arguments for the task.")

    class Meta:
        model = PeriodicTask
        fields = [
            'id', 'name', 'task', 'task_display',
            'interval', 'crontab', # Add solar, clocked here if used
            'schedule_display',
            'args', 'kwargs',
            'queue', 'exchange', 'routing_key',
            'expires', 'enabled', 'one_off', 'start_time', 'priority', 'headers',
            'last_run_at', 'total_run_count', 'date_changed', 'description'
        ]
        read_only_fields = (
            'last_run_at', 'total_run_count', 'date_changed', 
            'schedule_display', 'task_display'
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically populate choices for the 'task' field from registered Celery tasks.
        # Excludes Celery's internal tasks for clarity.
        if 'task' in self.fields:
            self.fields['task'].choices = [
                (task_name, task_name) for task_name in sorted(celery_app.tasks.keys()) 
                if not task_name.startswith('celery.')
            ]

    def get_schedule_display(self, obj):
        if obj.interval:
            return f"Interval: {str(obj.interval)}"
        if obj.crontab:
            return f"Crontab: {str(obj.crontab)}"
        # Add similar conditions for solar and clocked schedules if you use them
        # Example for clocked (assuming ClockedSchedule model and a clocked_time field):
        # if obj.clocked and hasattr(obj.clocked, 'clocked_time') and obj.clocked.clocked_time:
        #     return f"Clocked: {obj.clocked.clocked_time.strftime('%Y-%m-%d %H:%M:%S %Z')}"
        # elif obj.clocked:
        #     return "Clocked: (schedule details unavailable)"
        if obj.one_off:
            if obj.start_time:
                return f"One-off at {obj.start_time.strftime('%Y-%m-%d %H:%M:%S %Z')}"
            return "One-off (runs as soon as possible)"
        return "No active schedule"

    def validate(self, data):
        """Ensure that only one schedule type is set, or none if one_off is True."""
        schedule_fields_present = []
        if data.get('interval'): schedule_fields_present.append('interval')
        if data.get('crontab'): schedule_fields_present.append('crontab')
        # Add solar, clocked if used

        is_one_off = data.get('one_off', getattr(self.instance, 'one_off', False))

        if is_one_off:
            if len(schedule_fields_present) > 0:
                raise serializers.ValidationError(
                    "If 'one_off' is true, no other schedule type (interval, crontab, etc.) can be set."
                )
            # Clear other schedule fields if one_off is being set to true
            data['interval'] = None
            data['crontab'] = None
            # data['solar'] = None
            # data['clocked'] = None
        elif len(schedule_fields_present) == 0:
            # If not one_off, a schedule is required unless it's an update where a schedule already exists
            # or if it's being converted to one_off (handled above).
            if not self.instance: # Creating a new task
                raise serializers.ValidationError(
                    "A schedule type (interval, crontab, etc.) must be set if 'one_off' is false."
                )
            elif self.instance and not (self.instance.interval or self.instance.crontab): # Add other types
                 # Updating an existing task that had no schedule, and still no schedule given, and not one_off
                 if not is_one_off:
                    raise serializers.ValidationError(
                        "A schedule type (interval, crontab, etc.) must be set if 'one_off' is false."
                    )
        elif len(schedule_fields_present) > 1:
            raise serializers.ValidationError(
                f"Only one schedule type can be set. Found: {', '.join(schedule_fields_present)}."
            )

        # Ensure args is a list and kwargs is a dict for create/update
        # The model field itself is JSONField which handles string storage.
        # This validation ensures the input structure if provided.
        if 'args' in data and data['args'] is not None and not isinstance(data['args'], list):
            raise serializers.ValidationError({"args": "Must be a JSON list or null."}) 
        if 'kwargs' in data and data['kwargs'] is not None and not isinstance(data['kwargs'], dict):
            raise serializers.ValidationError({"kwargs": "Must be a JSON object or null."})
            
        return data

    def to_representation(self, instance):
        """Customize representation for GET requests."""
        representation = super().to_representation(instance)
        
        # Add detailed representation of the active schedule type for clarity
        if instance.interval:
            representation['interval_details'] = IntervalScheduleSerializer(instance.interval).data
        elif instance.crontab:
            representation['crontab_details'] = CrontabScheduleSerializer(instance.crontab).data
        # Add for solar, clocked if used
        
        # Ensure args and kwargs are consistently represented as list/dict (or None)
        representation['args'] = instance.args # Model stores as string, DRF JSONField deserializes
        representation['kwargs'] = instance.kwargs
        return representation 