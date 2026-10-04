import express from "express";
import pg from "pg";
import { orders } from "./orders";

const app = express();

app.post("/orders", () => {
  return orders.insert("kit");
});
