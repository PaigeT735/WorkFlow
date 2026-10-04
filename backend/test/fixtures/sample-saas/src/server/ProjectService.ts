import pg from "pg";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

export const ProjectService = {
  async create(name: string) {
    const pool = new pg.Pool();
    await pool.query("INSERT INTO projects (name) VALUES ($1)", [name]);
    await stripe.paymentIntents.create({ amount: 0, currency: "usd" });
    return { name };
  },
};
