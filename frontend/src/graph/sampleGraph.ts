import { parseApplicationGraph } from "./parse.ts";
import { SAMPLE_SOURCES, sampleSource } from "./sampleSources.ts";
import {
  LAYER_FOR_TYPE,
  type ApplicationGraph,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type NodeMetadata,
  type NodeType,
  type SourceRef,
} from "./types.ts";

/**
 * Harbor — a small team-workspace SaaS used as the development graph.
 * `scripts/write-sample.ts` writes this document to `public/graph.json`.
 * The running map reads that file (or `VITE_GRAPH_URL`) and nothing else.
 */
export function buildSampleGraph(): ApplicationGraph {
  const nodes: GraphNode[] = [
    n({
      id: "page-landing",
      type: "page",
      label: "Landing",
      summary: "/",
      detail: "Public marketing page. Get started goes to Login. View pricing goes to Checkout.",
      source: sampleSource("src/pages/Landing.tsx", "page-landing"),
      metadata: { route: "/", authRequired: false },
    }),
    n({
      id: "comp-hero",
      type: "component",
      parentId: "page-landing",
      label: "Hero",
      detail: "The landing headline and short description of Harbor.",
      source: sampleSource("src/pages/Landing.tsx", "comp-hero"),
    }),
    n({
      id: "ix-get-started",
      type: "interaction",
      parentId: "page-landing",
      label: "Get started",
      detail: "Sends a new visitor to the login page.",
      source: sampleSource("src/pages/Landing.tsx", "ix-get-started"),
    }),
    n({
      id: "ix-pricing",
      type: "interaction",
      parentId: "page-landing",
      label: "View pricing",
      detail: "Opens checkout so a visitor can compare plans.",
      source: sampleSource("src/pages/Landing.tsx", "ix-pricing"),
    }),

    n({
      id: "page-login",
      type: "page",
      label: "Login",
      summary: "/login",
      detail: "Signs the user in with a password or GitHub, then opens the dashboard.",
      source: sampleSource("src/pages/Login.tsx", "page-login"),
      metadata: { route: "/login", authRequired: false },
    }),
    n({
      id: "comp-login-form",
      type: "component",
      parentId: "page-login",
      label: "Login form",
      detail: "Email and password form. A 401 stays on this page.",
      source: sampleSource("src/components/LoginForm.tsx", "comp-login-form"),
    }),
    n({
      id: "ix-sign-in",
      type: "interaction",
      parentId: "page-login",
      label: "Sign in",
      detail: "Submits the login form to POST /api/login.",
      source: sampleSource("src/components/LoginForm.tsx", "ix-sign-in"),
    }),
    n({
      id: "ix-github",
      type: "interaction",
      parentId: "page-login",
      label: "Continue with GitHub",
      detail: "Starts GitHub OAuth and returns the user to Harbor with a session.",
      source: sampleSource("src/pages/Login.tsx", "ix-github"),
    }),

    n({
      id: "page-dashboard",
      type: "page",
      label: "Dashboard",
      summary: "/app",
      detail: "Home for a signed-in user. Navigation opens Projects, Profile, and Settings.",
      source: sampleSource("src/pages/Dashboard.tsx", "page-dashboard"),
      metadata: { route: "/app", authRequired: true },
    }),
    n({
      id: "comp-nav",
      type: "component",
      parentId: "page-dashboard",
      label: "Navigation",
      detail: "Links to the main areas of the signed-in app.",
      source: sampleSource("src/pages/Dashboard.tsx", "comp-nav"),
    }),
    n({
      id: "comp-recent",
      type: "component",
      parentId: "page-dashboard",
      label: "Recent activity",
      detail: "Shows the latest project changes for the signed-in user.",
      source: sampleSource("src/pages/Dashboard.tsx", "comp-recent"),
    }),
    n({
      id: "comp-profile-menu",
      type: "component",
      parentId: "page-dashboard",
      label: "Profile menu",
      detail: "Account menu in the dashboard header.",
      source: sampleSource("src/pages/Dashboard.tsx", "comp-profile-menu"),
    }),
    n({
      id: "ix-goto-projects",
      type: "interaction",
      parentId: "page-dashboard",
      label: "Open projects",
      detail: "Navigates from the dashboard to the projects page.",
      source: sampleSource("src/pages/Dashboard.tsx", "ix-goto-projects"),
    }),
    n({
      id: "ix-goto-profile",
      type: "interaction",
      parentId: "page-dashboard",
      label: "Open profile",
      detail: "Navigates from the dashboard to the profile page.",
      source: sampleSource("src/pages/Dashboard.tsx", "ix-goto-profile"),
    }),
    n({
      id: "ix-goto-settings",
      type: "interaction",
      parentId: "page-dashboard",
      label: "Open settings",
      detail: "Navigates from the dashboard to settings.",
      source: sampleSource("src/pages/Dashboard.tsx", "ix-goto-settings"),
    }),

    n({
      id: "page-projects",
      type: "page",
      label: "Projects",
      summary: "/app/projects",
      detail: "Lists the workspace projects. Create Project starts a new one.",
      source: sampleSource("src/pages/Projects.tsx", "page-projects"),
      metadata: { route: "/app/projects", authRequired: true },
    }),
    n({
      id: "comp-search",
      type: "component",
      parentId: "page-projects",
      label: "Search",
      detail: "Filters the project list by name.",
      source: sampleSource("src/pages/Projects.tsx", "comp-search"),
    }),
    n({
      id: "ix-search",
      type: "interaction",
      parentId: "page-projects",
      label: "Search projects",
      detail: "Calls GET /api/projects with the current query.",
      source: sampleSource("src/pages/Projects.tsx", "ix-search"),
    }),
    n({
      id: "comp-project-list",
      type: "component",
      parentId: "page-projects",
      label: "Project list",
      detail: "Renders the projects returned by GET /api/projects.",
      source: sampleSource("src/components/ProjectList.tsx", "comp-project-list"),
    }),
    n({
      id: "comp-project-card",
      type: "component",
      parentId: "page-projects",
      label: "Project card",
      detail: "One project in the list. Summarize asks OpenAI for a short description.",
      source: sampleSource("src/pages/Projects.tsx", "comp-project-card"),
    }),
    n({
      id: "ix-create",
      type: "interaction",
      parentId: "page-projects",
      label: "Create Project",
      summary: "CreateProjectButton",
      detail: "Posts the new project name to POST /api/projects.",
      source: sampleSource("src/components/CreateProjectButton.tsx", "ix-create"),
    }),
    n({
      id: "ix-summarize",
      type: "interaction",
      parentId: "page-projects",
      label: "Summarize",
      detail: "Asks the API to summarize one project with OpenAI.",
      source: sampleSource("src/pages/Projects.tsx", "ix-summarize"),
    }),

    n({
      id: "page-profile",
      type: "page",
      label: "Profile",
      summary: "/app/profile",
      detail: "The signed-in user's name and avatar.",
      source: sampleSource("src/pages/Profile.tsx", "page-profile"),
      metadata: { route: "/app/profile", authRequired: true },
    }),
    n({
      id: "comp-profile-form",
      type: "component",
      parentId: "page-profile",
      label: "Profile form",
      detail: "Edits the display name stored on the users table.",
      source: sampleSource("src/pages/Profile.tsx", "comp-profile-form"),
    }),
    n({
      id: "ix-save-profile",
      type: "interaction",
      parentId: "page-profile",
      label: "Save profile",
      detail: "Patches /api/me with the new name.",
      source: sampleSource("src/pages/Profile.tsx", "ix-save-profile"),
    }),
    n({
      id: "ix-upload-avatar",
      type: "interaction",
      parentId: "page-profile",
      label: "Upload avatar",
      detail: "Stores the avatar file in Amazon S3.",
      source: sampleSource("src/pages/Profile.tsx", "ix-upload-avatar"),
    }),

    n({
      id: "page-settings",
      type: "page",
      label: "Settings",
      summary: "/app/settings",
      detail: "Workspace preferences. Upgrade plan opens checkout.",
      source: sampleSource("src/pages/Settings.tsx", "page-settings"),
      metadata: { route: "/app/settings", authRequired: true },
    }),
    n({
      id: "ix-save-settings",
      type: "interaction",
      parentId: "page-settings",
      label: "Save settings",
      detail: "Patches /api/settings for the signed-in user.",
      source: sampleSource("src/pages/Settings.tsx", "ix-save-settings"),
    }),
    n({
      id: "ix-upgrade",
      type: "interaction",
      parentId: "page-settings",
      label: "Upgrade plan",
      detail: "Navigates to checkout to start a subscription.",
      source: sampleSource("src/pages/Settings.tsx", "ix-upgrade"),
    }),

    n({
      id: "page-checkout",
      type: "page",
      label: "Checkout",
      summary: "/checkout",
      detail: "Subscription checkout. Subscribe charges Stripe and records the plan.",
      source: sampleSource("src/pages/Checkout.tsx", "page-checkout"),
      metadata: { route: "/checkout", authRequired: true },
    }),
    n({
      id: "comp-plans",
      type: "component",
      parentId: "page-checkout",
      label: "Plan picker",
      detail: "Chooses the Harbor plan sent to checkout.",
      source: sampleSource("src/pages/Checkout.tsx", "comp-plans"),
    }),
    n({
      id: "comp-payment",
      type: "component",
      parentId: "page-checkout",
      label: "Payment form",
      detail: "Collects the card that CheckoutService sends to Stripe.",
      source: sampleSource("src/pages/Checkout.tsx", "comp-payment"),
    }),
    n({
      id: "ix-subscribe",
      type: "interaction",
      parentId: "page-checkout",
      label: "Subscribe",
      detail: "Posts the chosen plan to POST /api/checkout.",
      source: sampleSource("src/pages/Checkout.tsx", "ix-subscribe"),
    }),

    n({
      id: "api-login",
      type: "api",
      label: "POST /api/login",
      detail: "Password login. Handled by AuthService. A bad password raises Invalid credentials.",
      source: sampleSource("src/routes/auth.ts", "api-login"),
      metadata: { method: "POST", path: "/api/login", authRequired: false },
    }),
    n({
      id: "api-github",
      type: "api",
      label: "POST /api/auth/github",
      detail: "Builds the GitHub OAuth URL and, after the callback, opens a session.",
      source: sampleSource("src/routes/auth.ts", "api-github"),
      metadata: { method: "POST", path: "/api/auth/github", authRequired: false },
    }),
    n({
      id: "api-projects-create",
      type: "api",
      label: "POST /api/projects",
      detail: "Creates a project. Authentication is required before ProjectController runs.",
      source: sampleSource("src/routes/projects.ts", "api-projects-create"),
      metadata: { method: "POST", path: "/api/projects", authRequired: true },
    }),
    n({
      id: "api-projects-list",
      type: "api",
      label: "GET /api/projects",
      detail: "Returns the signed-in user's projects. Authentication is required.",
      source: sampleSource("src/routes/projects.ts", "api-projects-list"),
      metadata: { method: "GET", path: "/api/projects", authRequired: true },
    }),
    n({
      id: "api-summary",
      type: "api",
      label: "POST /api/projects/:id/summary",
      detail: "Summarizes one project. Authentication is required. The text comes from OpenAI.",
      source: sampleSource("src/routes/projects.ts", "api-summary"),
      metadata: { method: "POST", path: "/api/projects/:id/summary", authRequired: true },
    }),
    n({
      id: "api-profile",
      type: "api",
      label: "PATCH /api/me",
      detail: "Updates the signed-in user's profile. Authentication is required.",
      source: sampleSource("src/routes/account.ts", "api-profile"),
      metadata: { method: "PATCH", path: "/api/me", authRequired: true },
    }),
    n({
      id: "api-avatar",
      type: "api",
      label: "POST /api/me/avatar",
      detail: "Accepts an avatar upload. Authentication is required. The object is stored in S3.",
      source: sampleSource("src/routes/account.ts", "api-avatar"),
      metadata: { method: "POST", path: "/api/me/avatar", authRequired: true },
    }),
    n({
      id: "api-settings",
      type: "api",
      label: "PATCH /api/settings",
      detail: "Saves workspace settings for the signed-in user. Authentication is required.",
      source: sampleSource("src/routes/account.ts", "api-settings"),
      metadata: { method: "PATCH", path: "/api/settings", authRequired: true },
    }),
    n({
      id: "api-checkout",
      type: "api",
      label: "POST /api/checkout",
      detail: "Starts a subscription. Authentication is required. Payment goes to Stripe.",
      source: sampleSource("src/routes/billing.ts", "api-checkout"),
      metadata: { method: "POST", path: "/api/checkout", authRequired: true },
    }),

    n({
      id: "auth-require",
      type: "auth",
      label: "Require auth",
      summary: "middleware",
      detail: "Rejects the request with 401 unless the session cookie belongs to a user.",
      source: sampleSource("src/middleware/requireAuth.ts", "auth-require"),
    }),
    n({
      id: "auth-session",
      type: "auth",
      label: "Session",
      summary: "signed cookie",
      detail: "The session created at login. Presenting it is what opens the dashboard.",
      source: sampleSource("src/services/auth.ts", "auth-session"),
    }),

    n({
      id: "svc-auth",
      type: "service",
      label: "AuthService",
      summary: "src/services/auth.ts",
      detail: "Checks the password, talks to GitHub for OAuth, and creates a session.",
      source: sampleSource("src/services/auth.ts", "svc-auth"),
    }),
    n({
      id: "svc-project",
      type: "service",
      label: "ProjectService",
      summary: "src/services/project.ts",
      detail: "Business logic for creating, listing, and summarizing projects.",
      source: sampleSource("src/services/project.ts", "svc-project"),
    }),
    n({
      id: "svc-checkout",
      type: "service",
      label: "CheckoutService",
      summary: "src/services/checkout.ts",
      detail: "Starts a subscription and records it after Stripe accepts the payment.",
      source: sampleSource("src/services/checkout.ts", "svc-checkout"),
    }),
    n({
      id: "svc-user",
      type: "service",
      label: "UserService",
      summary: "src/services/user.ts",
      detail: "Updates the user profile and stores avatar objects.",
      source: sampleSource("src/services/user.ts", "svc-user"),
    }),

    n({
      id: "fn-auth-login",
      type: "function",
      label: "AuthService.login()",
      summary: "src/services/auth.ts",
      detail: "Reads the users table and, on success, creates a session.",
      source: sampleSource("src/services/auth.ts", "fn-auth-login"),
    }),
    n({
      id: "fn-auth-session",
      type: "function",
      label: "AuthService.createSession()",
      summary: "src/services/auth.ts",
      detail: "Inserts a row in sessions and returns the id written into the cookie.",
      source: sampleSource("src/services/auth.ts", "fn-auth-session"),
    }),
    n({
      id: "fn-project-controller",
      type: "function",
      label: "ProjectController.create",
      summary: "src/controllers/ProjectController.ts",
      detail: "The create action on ProjectController. It delegates to ProjectService.",
      source: sampleSource("src/controllers/ProjectController.ts", "fn-project-controller"),
    }),
    n({
      id: "fn-project-list",
      type: "function",
      label: "ProjectController.list",
      summary: "src/controllers/ProjectController.ts",
      detail: "The list action on ProjectController.",
      source: sampleSource("src/controllers/ProjectController.ts", "fn-project-list"),
    }),
    n({
      id: "fn-project-create",
      type: "function",
      label: "ProjectService.create()",
      summary: "src/services/project.ts",
      detail: "Inserts a project row. A duplicate slug raises Duplicate project name.",
      source: sampleSource("src/services/project.ts", "fn-project-create"),
    }),
    n({
      id: "fn-project-list-svc",
      type: "function",
      label: "ProjectService.list()",
      summary: "src/services/project.ts",
      detail: "Reads projects matching the search query.",
      source: sampleSource("src/services/project.ts", "fn-project-list-svc"),
    }),
    n({
      id: "fn-project-summary",
      type: "function",
      label: "ProjectService.summarize()",
      summary: "src/services/project.ts",
      detail: "Reads the project and asks OpenAI for a short summary.",
      source: sampleSource("src/services/project.ts", "fn-project-summary"),
    }),
    n({
      id: "fn-checkout",
      type: "function",
      label: "CheckoutService.createSubscription()",
      summary: "src/services/checkout.ts",
      detail: "Sends the payment to Stripe and writes the subscriptions row.",
      source: sampleSource("src/services/checkout.ts", "fn-checkout"),
    }),
    n({
      id: "fn-user-update",
      type: "function",
      label: "UserService.updateProfile()",
      summary: "src/services/user.ts",
      detail: "Writes the user's name on the users table.",
      source: sampleSource("src/services/user.ts", "fn-user-update"),
    }),
    n({
      id: "fn-avatar",
      type: "function",
      label: "UserService.storeAvatar()",
      summary: "src/services/user.ts",
      detail: "Puts the avatar object in the harbor-avatars S3 bucket.",
      source: sampleSource("src/services/user.ts", "fn-avatar"),
    }),

    n({
      id: "db-postgres",
      type: "database",
      label: "PostgreSQL",
      summary: "primary database",
      detail: "Harbor's relational database. Open it to see tables and which columns reference each other.",
      source: wholeFile("src/db/schema.sql"),
    }),
    n({
      id: "table-users",
      type: "table",
      parentId: "db-postgres",
      label: "users",
      summary: "table",
      detail: "Accounts. Sessions, projects, memberships, and subscriptions all reference this table.",
      source: sampleSource("src/db/schema.sql", "table-users"),
    }),
    n({
      id: "table-sessions",
      type: "table",
      parentId: "db-postgres",
      label: "sessions",
      summary: "table",
      detail: "Server-side sessions written by AuthService.createSession().",
      source: sampleSource("src/db/schema.sql", "table-sessions"),
    }),
    n({
      id: "table-projects",
      type: "table",
      parentId: "db-postgres",
      label: "projects",
      summary: "table",
      detail: "One row per Harbor project. Written by ProjectService.create().",
      source: sampleSource("src/db/schema.sql", "table-projects"),
    }),
    n({
      id: "table-members",
      type: "table",
      parentId: "db-postgres",
      label: "project_members",
      summary: "table",
      detail: "Joins users to projects.",
      source: sampleSource("src/db/schema.sql", "table-members"),
    }),
    n({
      id: "table-subscriptions",
      type: "table",
      parentId: "db-postgres",
      label: "subscriptions",
      summary: "table",
      detail: "The plan and Stripe ids for a paying workspace.",
      source: sampleSource("src/db/schema.sql", "table-subscriptions"),
    }),

    n({
      id: "ext-stripe",
      type: "external",
      label: "Stripe",
      summary: "payments",
      detail: "CheckoutService.createSubscription() creates the Stripe subscription and stores its id.",
      source: sampleSource("src/services/checkout.ts", "ext-stripe"),
    }),
    n({
      id: "ext-github",
      type: "external",
      label: "GitHub",
      summary: "OAuth",
      detail: "Continue with GitHub sends the user to GitHub and back into AuthService.",
      source: sampleSource("src/pages/Login.tsx", "ix-github"),
    }),
    n({
      id: "ext-openai",
      type: "external",
      label: "OpenAI",
      summary: "summaries",
      detail: "ProjectService.summarize() calls the OpenAI chat completions API.",
      source: sampleSource("src/services/project.ts", "fn-project-summary"),
    }),
    n({
      id: "ext-s3",
      type: "external",
      label: "Amazon S3",
      summary: "avatars",
      detail: "UserService.storeAvatar() puts objects in the harbor-avatars bucket.",
      source: sampleSource("src/services/user.ts", "ext-s3"),
    }),

    n({
      id: "err-credentials",
      type: "error",
      label: "Invalid credentials",
      summary: "401",
      detail: "AuthService.login() rejects an unknown email or a bad password. The login form stays put.",
      source: sampleSource("src/services/auth.ts", "err-credentials"),
      metadata: { statusCode: 401, errorMessage: "Email or password is incorrect." },
    }),
    n({
      id: "err-duplicate",
      type: "error",
      label: "Duplicate project name",
      summary: "409",
      detail: "ProjectService.create() refuses a slug that is already in projects.",
      source: sampleSource("src/services/project.ts", "err-duplicate"),
      metadata: {
        statusCode: 409,
        errorMessage: "A project with that name already exists.",
      },
    }),
    n({
      id: "err-payment",
      type: "error",
      label: "Payment declined",
      summary: "402",
      detail: "Stripe did not accept the card. No subscriptions row is written.",
      source: sampleSource("src/services/checkout.ts", "err-payment"),
      metadata: { statusCode: 402, errorMessage: "The card was declined." },
    }),

    n({
      id: "file-create-btn",
      type: "file",
      label: "src/components/CreateProjectButton.tsx",
      detail: "The Create Project button and the POST it fires.",
      source: wholeFile("src/components/CreateProjectButton.tsx"),
    }),
    n({
      id: "file-controller",
      type: "file",
      label: "src/controllers/ProjectController.ts",
      detail: "ProjectController create and list actions.",
      source: wholeFile("src/controllers/ProjectController.ts"),
    }),
    n({
      id: "file-project-svc",
      type: "file",
      label: "src/services/project.ts",
      detail: "ProjectService, including create(), list(), and summarize().",
      source: wholeFile("src/services/project.ts"),
    }),
    n({
      id: "file-auth-svc",
      type: "file",
      label: "src/services/auth.ts",
      detail: "AuthService login and session creation.",
      source: wholeFile("src/services/auth.ts"),
    }),
    n({
      id: "file-checkout-svc",
      type: "file",
      label: "src/services/checkout.ts",
      detail: "CheckoutService and the Stripe call.",
      source: wholeFile("src/services/checkout.ts"),
    }),
    n({
      id: "file-require",
      type: "file",
      label: "src/middleware/requireAuth.ts",
      detail: "The middleware that protects signed-in APIs.",
      source: wholeFile("src/middleware/requireAuth.ts"),
    }),
  ];

  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    edges.push(e(node.parentId, node.id, "contains", "contains"));
  }

  edges.push(
    e("page-landing", "page-login", "navigates_to", "navigates to", { skeleton: true }),
    e("page-login", "page-dashboard", "authenticates", "authenticates", { skeleton: true }),
    e("page-dashboard", "page-projects", "navigates_to", "navigates to", { skeleton: true }),
    e("page-dashboard", "page-profile", "navigates_to", "navigates to", { skeleton: true }),
    e("page-dashboard", "page-settings", "navigates_to", "navigates to", { skeleton: true }),
    e("page-settings", "page-checkout", "navigates_to", "navigates to", { skeleton: true }),

    e("ix-get-started", "page-login", "navigates_to", "navigates to"),
    e("ix-pricing", "page-checkout", "navigates_to", "navigates to"),
    e("ix-goto-projects", "page-projects", "navigates_to", "navigates to"),
    e("ix-goto-profile", "page-profile", "navigates_to", "navigates to"),
    e("ix-goto-settings", "page-settings", "navigates_to", "navigates to"),
    e("ix-upgrade", "page-checkout", "navigates_to", "navigates to"),

    e("ix-sign-in", "api-login", "calls", "calls"),
    e("api-login", "svc-auth", "handles", "handles"),
    e("svc-auth", "fn-auth-login", "calls", "calls"),
    e("fn-auth-login", "table-users", "reads", "reads"),
    e("fn-auth-login", "fn-auth-session", "calls", "calls"),
    e("fn-auth-session", "table-sessions", "writes", "writes"),
    e("fn-auth-session", "auth-session", "authenticates", "authenticates"),
    e("auth-session", "page-dashboard", "authenticates", "authenticates"),
    e("api-login", "err-credentials", "raises", "raises"),

    e("ix-github", "api-github", "calls", "calls"),
    e("api-github", "ext-github", "calls", "calls"),
    e("api-github", "svc-auth", "handles", "handles", { expand: false }),
    e("api-github", "auth-session", "authenticates", "authenticates"),

    e("ix-create", "api-projects-create", "calls", "calls"),
    e("api-projects-create", "auth-require", "authenticates", "authentication required"),
    e("api-projects-create", "fn-project-controller", "handles", "handles"),
    e("fn-project-controller", "svc-project", "calls", "calls"),
    e("svc-project", "fn-project-create", "calls", "calls"),
    e("svc-project", "fn-project-list-svc", "calls", "calls", { expand: false }),
    e("fn-project-create", "table-projects", "writes", "writes"),
    e("api-projects-create", "err-duplicate", "raises", "raises"),

    e("comp-project-list", "api-projects-list", "queries", "queries"),
    e("ix-search", "api-projects-list", "calls", "calls"),
    e("api-projects-list", "auth-require", "authenticates", "authentication required"),
    e("api-projects-list", "fn-project-list", "handles", "handles"),
    e("fn-project-list", "fn-project-list-svc", "calls", "calls"),
    e("fn-project-list-svc", "table-projects", "reads", "reads"),
    e("fn-project-list-svc", "svc-project", "calls", "calls", { expand: false }),

    e("ix-summarize", "api-summary", "calls", "calls"),
    e("api-summary", "auth-require", "authenticates", "authentication required"),
    e("api-summary", "fn-project-summary", "handles", "handles"),
    e("fn-project-summary", "table-projects", "reads", "reads"),
    e("fn-project-summary", "ext-openai", "calls", "calls"),

    e("ix-save-profile", "api-profile", "calls", "calls"),
    e("api-profile", "auth-require", "authenticates", "authentication required"),
    e("api-profile", "svc-user", "handles", "handles"),
    e("svc-user", "fn-user-update", "calls", "calls"),
    e("fn-user-update", "table-users", "writes", "writes"),
    e("ix-upload-avatar", "api-avatar", "calls", "calls"),
    e("api-avatar", "auth-require", "authenticates", "authentication required"),
    e("api-avatar", "fn-avatar", "handles", "handles"),
    e("fn-avatar", "ext-s3", "writes", "writes"),
    e("fn-avatar", "svc-user", "calls", "calls", { expand: false }),

    e("ix-save-settings", "api-settings", "calls", "calls"),
    e("api-settings", "auth-require", "authenticates", "authentication required"),
    e("api-settings", "fn-user-update", "handles", "handles"),

    e("ix-subscribe", "api-checkout", "calls", "calls"),
    e("api-checkout", "auth-require", "authenticates", "authentication required"),
    e("api-checkout", "svc-checkout", "handles", "handles"),
    e("svc-checkout", "fn-checkout", "calls", "calls"),
    e("fn-checkout", "table-subscriptions", "writes", "writes"),
    e("fn-checkout", "ext-stripe", "sends_payment_to", "sends payment to"),
    e("api-checkout", "err-payment", "raises", "raises"),

    e("table-sessions", "table-users", "depends_on", "references", { expand: false }),
    e("table-projects", "table-users", "depends_on", "references", { expand: false }),
    e("table-members", "table-projects", "depends_on", "references", { expand: false }),
    e("table-members", "table-users", "depends_on", "references", { expand: false }),
    e("table-subscriptions", "table-users", "depends_on", "references", { expand: false }),

    e("ix-create", "file-create-btn", "defined_in", "defined in", { expand: false }),
    e("fn-project-controller", "file-controller", "defined_in", "defined in", { expand: false }),
    e("fn-project-create", "file-project-svc", "defined_in", "defined in", { expand: false }),
    e("fn-auth-login", "file-auth-svc", "defined_in", "defined in", { expand: false }),
    e("fn-checkout", "file-checkout-svc", "defined_in", "defined in", { expand: false }),
    e("auth-require", "file-require", "defined_in", "defined in", { expand: false }),
  );

  const graph = parseApplicationGraph({
    schemaVersion: 1,
    id: "harbor",
    name: "Harbor",
    description: "Team project workspace. Sample graph for the WorkFlow map.",
    nodes,
    edges,
    flows: [
      {
        id: "flow-sign-in",
        label: "Sign in",
        description: "Landing leads to Login. The password form calls AuthService, writes a session, and opens the dashboard.",
        nodeIds: [
          "page-landing",
          "page-login",
          "ix-sign-in",
          "api-login",
          "svc-auth",
          "fn-auth-login",
          "table-users",
          "fn-auth-session",
          "table-sessions",
          "auth-session",
          "page-dashboard",
        ],
        edgeIds: [
          "e-page-landing-navigates_to-page-login",
          "e-ix-sign-in-calls-api-login",
          "e-api-login-handles-svc-auth",
          "e-svc-auth-calls-fn-auth-login",
          "e-fn-auth-login-reads-table-users",
          "e-fn-auth-login-calls-fn-auth-session",
          "e-fn-auth-session-writes-table-sessions",
          "e-fn-auth-session-authenticates-auth-session",
          "e-auth-session-authenticates-page-dashboard",
        ],
      },
      {
        id: "flow-create-project",
        label: "Create a project",
        description: "From Projects, Create Project calls POST /api/projects, passes Require auth, and ProjectService.create() writes the projects table.",
        nodeIds: [
          "page-dashboard",
          "page-projects",
          "ix-create",
          "api-projects-create",
          "auth-require",
          "fn-project-controller",
          "svc-project",
          "fn-project-create",
          "db-postgres",
          "table-projects",
        ],
        edgeIds: [
          "e-page-dashboard-navigates_to-page-projects",
          "e-ix-create-calls-api-projects-create",
          "e-api-projects-create-authenticates-auth-require",
          "e-api-projects-create-handles-fn-project-controller",
          "e-fn-project-controller-calls-svc-project",
          "e-svc-project-calls-fn-project-create",
          "e-fn-project-create-writes-table-projects",
        ],
      },
      {
        id: "flow-subscribe",
        label: "Subscribe",
        description: "Settings opens Checkout. Subscribe calls CheckoutService, which writes subscriptions and sends the payment to Stripe.",
        nodeIds: [
          "page-settings",
          "page-checkout",
          "ix-subscribe",
          "api-checkout",
          "auth-require",
          "svc-checkout",
          "fn-checkout",
          "table-subscriptions",
          "ext-stripe",
        ],
        edgeIds: [
          "e-page-settings-navigates_to-page-checkout",
          "e-ix-subscribe-calls-api-checkout",
          "e-api-checkout-authenticates-auth-require",
          "e-api-checkout-handles-svc-checkout",
          "e-svc-checkout-calls-fn-checkout",
          "e-fn-checkout-writes-table-subscriptions",
          "e-fn-checkout-sends_payment_to-ext-stripe",
        ],
      },
      {
        id: "flow-browse",
        label: "Browse projects",
        description: "The project list queries GET /api/projects, which reads the projects table after Require auth.",
        nodeIds: [
          "page-dashboard",
          "page-projects",
          "comp-project-list",
          "api-projects-list",
          "auth-require",
          "fn-project-list",
          "fn-project-list-svc",
          "table-projects",
        ],
        edgeIds: [
          "e-page-dashboard-navigates_to-page-projects",
          "e-comp-project-list-queries-api-projects-list",
          "e-api-projects-list-authenticates-auth-require",
          "e-api-projects-list-handles-fn-project-list",
          "e-fn-project-list-calls-fn-project-list-svc",
          "e-fn-project-list-svc-reads-table-projects",
        ],
      },
      {
        id: "flow-github",
        label: "Continue with GitHub",
        description: "Login sends the user to GitHub OAuth and back into a Harbor session on the dashboard.",
        nodeIds: ["page-login", "ix-github", "api-github", "ext-github", "auth-session", "page-dashboard"],
        edgeIds: [
          "e-ix-github-calls-api-github",
          "e-api-github-calls-ext-github",
          "e-api-github-authenticates-auth-session",
          "e-auth-session-authenticates-page-dashboard",
        ],
      },
    ],
    sources: SAMPLE_SOURCES,
  });

  assertSources(graph);
  return graph;
}

function assertSources(graph: ApplicationGraph): void {
  const sources = graph.sources ?? {};
  for (const node of graph.nodes) {
    if (!node.source) continue;
    const text = sources[node.source.file];
    if (text == null) {
      throw new Error(`Node ${node.id} cites ${node.source.file}, which has no excerpt.`);
    }
    const lines = text.split("\n").length;
    if (node.source.endLine > lines) {
      throw new Error(
        `Node ${node.id} ends at line ${node.source.endLine} but ${node.source.file} has ${lines} lines.`,
      );
    }
  }
}

function wholeFile(file: string): SourceRef {
  const text = SAMPLE_SOURCES[file];
  if (text == null) throw new Error(`Missing sample file ${file}.`);
  return { file, startLine: 1, endLine: text.split("\n").length };
}

interface NodeDraft {
  id: string;
  type: NodeType;
  parentId?: string;
  label: string;
  summary?: string;
  detail?: string;
  source?: SourceRef;
  metadata?: NodeMetadata;
}

function n(draft: NodeDraft): GraphNode {
  const node: GraphNode = {
    id: draft.id,
    type: draft.type,
    layer: LAYER_FOR_TYPE[draft.type],
    parentId: draft.parentId ?? null,
    label: draft.label,
  };
  if (draft.summary) node.summary = draft.summary;
  if (draft.detail) node.detail = draft.detail;
  if (draft.source) node.source = draft.source;
  if (draft.metadata) node.metadata = draft.metadata;
  return node;
}

function e(
  source: string,
  target: string,
  kind: EdgeKind,
  label: string,
  options?: { expand?: false; skeleton?: true },
): GraphEdge {
  const edge: GraphEdge = {
    id: `e-${source}-${kind}-${target}`,
    source,
    target,
    kind,
    label,
  };
  if (options?.expand === false) edge.expand = false;
  if (options?.skeleton) edge.skeleton = true;
  return edge;
}
