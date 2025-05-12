from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PostCognitoSignUpHandlerView, UserProfileDetailView, AdminUserProfileViewSet

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r'admin/user-profiles', AdminUserProfileViewSet, basename='admin-userprofile')

urlpatterns = [
    path('post-signup/', PostCognitoSignUpHandlerView.as_view(), name='post_signup_handler'),
    path('profile/', UserProfileDetailView.as_view(), name='user_profile_detail'),
    # Include the router URLs
    path('', include(router.urls)),
] 