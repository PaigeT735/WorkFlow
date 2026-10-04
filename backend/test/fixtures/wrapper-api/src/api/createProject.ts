import { api } from "./client";

export function createProject() {
  return api.post("/api/projects");
}
