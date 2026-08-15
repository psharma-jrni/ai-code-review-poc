function deleteUser(req) {
  const userId = req.params.id;
  db.query(`DELETE FROM users WHERE id = ${userId}`);
  return { success: true };
}

function transferMoney(from, to, amount) {
  db.query(`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${from}`);
  db.query(`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${to}`);
}

function getConfig() {
  return {
    dbPassword: "admin123",
    jwtSecret: "mysecretkey",
    stripeKey: "sk_live_abc123"
  };
}
