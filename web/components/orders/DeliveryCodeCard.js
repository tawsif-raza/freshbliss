// The delivery code and rider details, shown only while the order is out for delivery.

import { motion } from 'framer-motion';

export default function DeliveryCodeCard({ order }) {
  const { rider, pin } = order;
  const telephone = rider?.phone ? rider.phone.replace(/[^0-9+]/g, '') : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <section className="rounded-xl bg-gradient-to-br from-[var(--fb-hero-deep)] to-[var(--fb-hero-mid)] p-6 text-on-hero shadow-card">
        <p className="text-label text-gold-bright">Delivery code</p>
        <p className="mt-2 font-mono text-[40px] leading-none font-extrabold tracking-[0.3em] text-white" aria-label={`Delivery code ${pin ? pin.split('').join(' ') : 'not ready'}`}>
          {pin ?? '----'}
        </p>
        <p className="mt-3 text-small text-on-hero">Tell this code to your rider when they arrive.</p>
        {rider?.name && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="text-body font-bold text-white">{rider.name}</p>
            {rider.vehicle && <p className="text-small text-on-hero">{rider.vehicle}</p>}
            {telephone && (
              <a
                href={`tel:${telephone}`}
                className="mt-3 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-5 text-nav-link text-on-gold hover:brightness-95"
              >
                Call rider
              </a>
            )}
          </div>
        )}
      </section>
    </motion.div>
  );
}
