export function CreateProjectButton() {
  async function createProject() {
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New project" }),
    });
  }

  return <button onClick={createProject}>Create Project</button>;
}
