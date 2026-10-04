import type { ApplicationGraph } from "./graphTypes.js";
import { inspectRepository, type AnalysisReport } from "./analyzer/inspect.js";

export type { AnalysisReport };
export { inspectRepository };

/** Inspect a local repository directory and return the application graph. */
export async function analyzeRepository(repositoryPath: string): Promise<ApplicationGraph> {
  const report = await inspectRepository(repositoryPath);
  return report.graph;
}
