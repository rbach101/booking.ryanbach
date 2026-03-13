UPDATE booking_payments SET status = 'paid', paid_at = '2026-03-04T07:15:00+00:00', stripe_payment_intent_id = 'pi_3T79dCAN90oZQLT22XTtfO9A' WHERE id = '57ff29f3-c2b3-494c-a09b-59da9cd70d2d';

UPDATE bookings SET balance_paid = true, balance_due = 0 WHERE id = 'd7f6c348-b40e-4ff9-ad5e-7b24599a03c0';