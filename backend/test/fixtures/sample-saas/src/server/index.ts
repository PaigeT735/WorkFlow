import express from "express";
import { requireAuth } from "./requireAuth";
import { ProjectController } from "./ProjectController";

const app = express();

app.post("/api/projects", requireAuth, ProjectController.create);

app.listen(3001);
