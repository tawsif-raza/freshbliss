SupportButton is a floating Help button, fixed to the bottom right, that opens a small menu: Chat on WhatsApp, Call us and Read FAQs. Escape closes it and returns focus to the button.

Pass `phone` in international format to link `wa.me` and `tel:` directly; without it the buttons call `onHelp('whatsapp' | 'call' | 'faq')` so you can route them yourself. `message` sets the WhatsApp prefill and `hours` the support-hours line. No support number is built in, so use a real one before launch.
