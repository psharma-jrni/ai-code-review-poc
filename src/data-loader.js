const fs = require('fs');

function loadOrdersForUsers(userIds) {
  const result = [];
  for (const id of userIds) {
    const orders = db.query(`SELECT * FROM orders WHERE user_id = ${id}`);
    for (const order of orders) {
      const items = db.query(`SELECT * FROM order_items WHERE order_id = ${order.id}`);
      order.items = items;
    }
    result.push({ userId: id, orders });
  }
  return result;
}

async function getReportConfig() {
  const raw = fs.readFileSync('/etc/app/report.json', 'utf8');
  return JSON.parse(raw);
}

function findDuplicateEmails(users) {
  const dupes = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (i !== j && users[i].email === users[j].email) {
        dupes.push(users[i].email);
      }
    }
  }
  return dupes;
}
