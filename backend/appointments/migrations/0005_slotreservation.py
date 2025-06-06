# Generated by Django 4.2.21 on 2025-05-12 21:26

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_userprofile_date_of_birth_userprofile_home_address_and_more'),
        ('appointments', '0004_appointment_payment_status_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='SlotReservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_time', models.DateTimeField()),
                ('end_time', models.DateTimeField()),
                ('reserved_until', models.DateTimeField(db_index=True, help_text='Timestamp when this reservation expires.')),
                ('stripe_payment_intent_id', models.CharField(help_text='Links reservation to a Stripe PaymentIntent.', max_length=255, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('client_profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='slot_reservations', to='users.userprofile')),
                ('lawyer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='slot_reservations', to='users.lawyerprofile')),
            ],
            options={
                'ordering': ['reserved_until'],
                'unique_together': {('lawyer', 'start_time', 'end_time')},
            },
        ),
    ]
