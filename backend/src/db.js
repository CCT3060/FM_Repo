import "dotenv/config";
import mysql from "mysql2/promise";

let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: "Z",
    });
  }
  return _pool;
}

// Export a proxy that forwards .query / .execute to the lazy pool
const pool = new Proxy({}, {
  get(_target, prop) {
    const p = getPool();
    const val = p[prop];
    return typeof val === "function" ? val.bind(p) : val;
  },
});

export default pool;
