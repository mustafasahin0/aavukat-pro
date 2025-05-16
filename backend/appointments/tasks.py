from celery import shared_task
from django.utils import timezone
from .models import SlotReservation
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

@shared_task(name="appointments.cleanup_expired_reservations_task")
def cleanup_expired_reservations_task(grace_period_minutes=60):
    """
    Celery task to delete expired slot reservations older than a grace period.
    Args:
        grace_period_minutes (int): Delete reservations expired for at least this many minutes.
    """
    try:
        cutoff_time = timezone.now() - timedelta(minutes=grace_period_minutes)
        logger.info(f"[Celery Task] Looking for reservations expired before {cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z')}...")

        expired_reservations = SlotReservation.objects.filter(
            reserved_until__lt=cutoff_time
        )
        
        count = expired_reservations.count()

        if count > 0:
            # Log details before deleting for better traceability if needed
            for reservation in expired_reservations.iterator(): # Use iterator for potentially large querysets
                logger.warning(
                    f"[Celery Task] Deleting expired reservation ID {reservation.id} for lawyer "
                    f"{reservation.lawyer_id}, client {reservation.client_profile_id} "
                    f"(expired at {reservation.reserved_until.strftime('%Y-%m-%d %H:%M:%S %Z')}). PI: {reservation.stripe_payment_intent_id}"
                )
            
            deleted_count, _ = expired_reservations.delete()
            logger.info(f'[Celery Task] Successfully deleted {deleted_count} expired slot reservation(s).')
            return f'Deleted {deleted_count} reservations.'
        else:
            logger.info('[Celery Task] No expired slot reservations found to delete.')
            return 'No expired reservations to delete.'
    except Exception as e:
        logger.error(f"[Celery Task] Error during cleanup_expired_reservations_task: {e}", exc_info=True)
        # Reraise the exception so Celery can mark the task as failed
        raise 