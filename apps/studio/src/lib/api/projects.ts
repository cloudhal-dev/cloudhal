/** RFC-0034 §7: projects and their sites, as the person may see them. */
import { request } from "./http.ts";

export interface ProjectSite {
  id: string;
  name: string;
  slug: string;
  defaultLocale: string;
  locales: string[];
  theme: string;
  /** The primary hostname, when the site has one. */
  host: string | null;
  published: boolean;
  pendingApprovals: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  sites: ProjectSite[];
}

export const projectsApi = {
  list: () => request<{ items: Project[] }>("/api/projects").then((r) => r.items),
};
