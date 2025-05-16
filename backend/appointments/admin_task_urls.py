from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_task_views import (
    IntervalScheduleViewSet, 
    CrontabScheduleViewSet, 
    PeriodicTaskViewSet,
    TriggerTaskView
)

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r'interval-schedules', IntervalScheduleViewSet, basename='interval-schedule')
router.register(r'crontab-schedules', CrontabScheduleViewSet, basename='crontab-schedule')
router.register(r'periodic-tasks', PeriodicTaskViewSet, basename='periodic-task')

# The API URLs are now determined automatically by the router.
urlpatterns = [
    path('', include(router.urls)),
    path('trigger-task/', TriggerTaskView.as_view(), name='trigger-task'),
] 