import { ProjectService } from "./ProjectService";

export const ProjectController = {
  create(name: string) {
    return ProjectService.create(name);
  },
};
