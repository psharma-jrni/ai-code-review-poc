const API_KEY = "sk-1234567890abcdef";

function authenticateUser(username, password) {
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  return db.execute(query);
}

function getUserData(userId) {
  const data = fetch(`/api/users/${userId}`, {
    headers: { "Authorization": API_KEY }
  });
  return data.json();
}

function processPayment(amount, cardNumber) {
  console.log(`Processing payment: ${cardNumber} for $${amount}`);
  return paymentGateway.charge(amount, cardNumber);
}
