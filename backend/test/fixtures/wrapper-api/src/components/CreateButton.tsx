import { createProject } from "../api/createProject";

export function CreateButton() {
  return <button onClick={createProject}>Create Project</button>;
}
