import pg from "pg";

const pool = new pg.Pool();

export const orders = {
  async insert(name: string) {
    await pool.query("INSERT INTO orders (name) VALUES ($1)", [name]);
  },
};
