function formatNotification(event, user) {
  const greeting = user.locale === 'fr' ? 'Bonjour' : 'Hello';
  const name = user.displayName || user.email.split('@')[0];

  let body;
  switch (event.type) {
    case 'order_shipped':
      body = `${greeting} ${name}, your order #${event.orderId} has shipped.`;
      break;
    case 'password_reset':
      body = `${greeting} ${name}, click here to reset: ${event.resetUrl}`;
      break;
    case 'payment_failed':
      body = `${greeting} ${name}, payment for order #${event.orderId} failed.`;
      break;
    default:
      body = `${greeting} ${name}, you have a new notification.`;
  }

  return {
    to: user.email,
    subject: subjectFor(event.type),
    body,
  };
}

function subjectFor(eventType) {
  const map = {
    order_shipped: 'Your order is on the way',
    password_reset: 'Password reset requested',
    payment_failed: 'Payment issue',
  };
  return map[eventType] || 'Notification';
}

module.exports = { formatNotification, subjectFor };
