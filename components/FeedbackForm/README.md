FeedbackForm collects a post-delivery review: 1 to 5 star ratings for Overall experience (required), Packaging and Delivery (optional), and a comment of up to 300 characters. Stars are radio inputs, so they work with arrow keys and screen readers, and each has an "N of 5 stars" label. Submit stays disabled until an overall rating is chosen.

Pass `orderId` and `onSubmit({orderId, overall, packaging, delivery, comment})`; write the result to Firestore under the order, from a trusted path. After submit it shows a thank-you callout. OrderTracking embeds it once an order is delivered.
