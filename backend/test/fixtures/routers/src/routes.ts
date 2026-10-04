import { Router } from "express";
import authController from "./auth";

const api = Router().use(authController);

export default Router().use("/api", api);
