from django.core.management.base import BaseCommand
from django.utils import timezone
from appointments.models import SlotReservation
from datetime import timedelta

class Command(BaseCommand):
    help = 'Deletes expired slot reservations that are older than a certain threshold.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--grace_period_minutes',
            type=int,
            default=60,  # Default to 60 minutes grace period
            help='Delete reservations expired for at least this many minutes. Helps avoid race conditions with very recently expired ones.'
        )

    def handle(self, *args, **options):
        grace_period_minutes = options['grace_period_minutes']
        
        # Calculate the cutoff time: now - grace_period
        # Reservations whose reserved_until is older than this cutoff will be deleted.
        cutoff_time = timezone.now() - timedelta(minutes=grace_period_minutes)

        self.stdout.write(f"Looking for reservations expired before {cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z')}...")

        # Find reservations that are expired (reserved_until < now) 
        # AND their expiry time is older than the cutoff (reserved_until < cutoff_time).
        # This means they expired at least 'grace_period_minutes' ago.
        expired_reservations = SlotReservation.objects.filter(
            reserved_until__lt=cutoff_time
        )
        
        count = expired_reservations.count()

        if count > 0:
            for reservation in expired_reservations:
                self.stdout.write(
                    self.style.WARNING(f'Deleting expired reservation ID {reservation.id} for lawyer {reservation.lawyer_id}, client {reservation.client_profile_id} (expired at {reservation.reserved_until.strftime('%Y-%m-%d %H:%M:%S %Z')}).')
                )
            
            # Perform the deletion
            deleted_count, _ = expired_reservations.delete()
            
            self.stdout.write(self.style.SUCCESS(f'Successfully deleted {deleted_count} expired slot reservation(s).'))
        else:
            self.stdout.write(self.style.SUCCESS('No expired slot reservations found to delete.'))

        # Optional: Add further logic, e.g., notify if a reservation was linked to a paid but unconfirmed PaymentIntent
        # This would require checking Stripe for the payment_intent_id on the reservations before deletion.
        # For now, we are keeping it simple and just deleting based on expiry. 