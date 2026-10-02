// One grey block that gently pulses: the building piece of every skeleton screen.
// Colours come from the design tokens, so it suits the light, dark and high-contrast themes. The pulse
// stops for visitors who asked their device for less motion.

export default function Bone({ className = '' }) {
  return <div aria-hidden="true" className={`bg-surface-sunken motion-safe:animate-pulse ${className}`} />;
}
