import type { SourceRef } from "./types.ts";

interface CompiledFile {
  text: string;
  spans: Map<string, { startLine: number; endLine: number }>;
}

const RAW: Record<string, string> = {
  "src/pages/Landing.tsx": `
// @span:page-landing
import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <main>
      <Hero />
      <Link to="/login">Get started</Link>
      <Link to="/checkout">View pricing</Link>
    </main>
  );
}
// @end:page-landing

// @span:comp-hero
function Hero() {
  return (
    <header>
      <h1>Harbor</h1>
      <p>Projects, people, and billing in one workspace.</p>
    </header>
  );
}
// @end:comp-hero

// @span:ix-get-started
export function GetStartedLink() {
  return <a href="/login">Get started</a>;
}
// @end:ix-get-started

// @span:ix-pricing
export function PricingLink() {
  return <a href="/checkout">View pricing</a>;
}
// @end:ix-pricing
`,
  "src/pages/Login.tsx": `
// @span:page-login
import { LoginForm } from "../components/LoginForm";

export function LoginPage() {
  return (
    <main>
      <h1>Sign in to Harbor</h1>
      <LoginForm />
      <GitHubButton />
    </main>
  );
}
// @end:page-login

// @span:ix-github
function GitHubButton() {
  async function continueWithGitHub() {
    const response = await fetch("/api/auth/github", { method: "POST" });
    const { url } = await response.json();
    window.location.assign(url);
  }

  return (
    <button type="button" onClick={() => void continueWithGitHub()}>
      Continue with GitHub
    </button>
  );
}
// @end:ix-github
`,
  "src/components/LoginForm.tsx": `
// @span:comp-login-form
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LoginForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string, password: string) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (response.status === 401) {
      setError("Email or password is incorrect.");
      return;
    }
    if (!response.ok) {
      setError("Could not sign in.");
      return;
    }
    navigate("/app");
  }

  return <form onSubmit={(event) => event.preventDefault()}>{error}</form>;
}
// @end:comp-login-form

// @span:ix-sign-in
export async function submitLogin(email: string, password: string) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 401) {
    throw new Error("Email or password is incorrect.");
  }
  return response.json() as Promise<{ userId: string }>;
}
// @end:ix-sign-in
`,
  "src/pages/Dashboard.tsx": `
// @span:page-dashboard
import { Link } from "react-router-dom";

export function DashboardPage() {
  return (
    <main>
      <Navigation />
      <RecentActivity />
      <ProfileMenu />
    </main>
  );
}
// @end:page-dashboard

// @span:comp-nav
function Navigation() {
  return (
    <nav>
      <Link to="/app/projects">Projects</Link>
      <Link to="/app/profile">Profile</Link>
      <Link to="/app/settings">Settings</Link>
    </nav>
  );
}
// @end:comp-nav

// @span:ix-goto-projects
export function OpenProjectsLink() {
  return <a href="/app/projects">Open projects</a>;
}
// @end:ix-goto-projects

// @span:ix-goto-profile
export function OpenProfileLink() {
  return <a href="/app/profile">Open profile</a>;
}
// @end:ix-goto-profile

// @span:ix-goto-settings
export function OpenSettingsLink() {
  return <a href="/app/settings">Open settings</a>;
}
// @end:ix-goto-settings

// @span:comp-recent
function RecentActivity() {
  return <section aria-label="Recent activity" />;
}
// @end:comp-recent

// @span:comp-profile-menu
function ProfileMenu() {
  return <button type="button">Account</button>;
}
// @end:comp-profile-menu
`,
  "src/pages/Projects.tsx": `
// @span:page-projects
import { CreateProjectButton } from "../components/CreateProjectButton";
import { ProjectList } from "../components/ProjectList";

export function ProjectsPage() {
  return (
    <main>
      <SearchProjects />
      <CreateProjectButton onCreated={() => undefined} />
      <ProjectList />
    </main>
  );
}
// @end:page-projects

// @span:comp-search
function SearchProjects() {
  return <input aria-label="Search projects" placeholder="Search projects" />;
}
// @end:comp-search

// @span:ix-search
export async function searchProjects(query: string) {
  const response = await fetch(\`/api/projects?q=\${encodeURIComponent(query)}\`);
  if (response.status === 401) throw new Error("Sign in required.");
  return response.json();
}
// @end:ix-search

// @span:comp-project-card
export function ProjectCard(props: { name: string }) {
  return <article>{props.name}</article>;
}
// @end:comp-project-card

// @span:ix-summarize
export async function summarizeProject(projectId: string) {
  const response = await fetch(\`/api/projects/\${projectId}/summary\`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Could not summarize the project.");
  return response.json() as Promise<{ summary: string }>;
}
// @end:ix-summarize
`,
  "src/components/ProjectList.tsx": `
// @span:comp-project-list
import { ProjectCard } from "../pages/Projects";

export function ProjectList() {
  return <section aria-label="Projects" />;
}

export async function loadProjects() {
  const response = await fetch("/api/projects");
  if (response.status === 401) throw new Error("Sign in required.");
  const projects = (await response.json()) as Array<{ id: string; name: string }>;
  return projects.map((project) => <ProjectCard key={project.id} name={project.name} />);
}
// @end:comp-project-list
`,
  "src/components/CreateProjectButton.tsx": `
// @span:ix-create
import { useState } from "react";

type CreateProjectButtonProps = {
  onCreated: (project: { id: string; name: string }) => void;
};

export function CreateProjectButton({ onCreated }: CreateProjectButtonProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.status === 401) {
      setError("Sign in required.");
      return;
    }
    if (response.status === 409) {
      setError("A project with that name already exists.");
      return;
    }
    if (!response.ok) {
      setError("Could not create the project.");
      return;
    }
    onCreated(await response.json());
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <input value={name} aria-label="Project name" onChange={(event) => setName(event.target.value)} />
      <button type="submit">Create project</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
// @end:ix-create
`,
  "src/pages/Profile.tsx": `
// @span:page-profile
export function ProfilePage() {
  return (
    <main>
      <ProfileForm />
      <AvatarUpload />
    </main>
  );
}
// @end:page-profile

// @span:comp-profile-form
function ProfileForm() {
  return <form aria-label="Profile" />;
}
// @end:comp-profile-form

// @span:ix-save-profile
export async function saveProfile(name: string) {
  const response = await fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (response.status === 401) throw new Error("Sign in required.");
  if (!response.ok) throw new Error("Could not save profile.");
}
// @end:ix-save-profile

// @span:ix-upload-avatar
export async function uploadAvatar(file: File) {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/me/avatar", { method: "POST", body });
  if (!response.ok) throw new Error("Could not upload the avatar.");
}
// @end:ix-upload-avatar
`,
  "src/pages/Settings.tsx": `
// @span:page-settings
import { Link } from "react-router-dom";

export function SettingsPage() {
  return (
    <main>
      <form aria-label="Workspace settings" />
      <Link to="/checkout">Upgrade plan</Link>
    </main>
  );
}
// @end:page-settings

// @span:ix-save-settings
export async function saveSettings(weeklyDigest: boolean) {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weeklyDigest }),
  });
  if (response.status === 401) throw new Error("Sign in required.");
  if (!response.ok) throw new Error("Could not save settings.");
}
// @end:ix-save-settings

// @span:ix-upgrade
export function UpgradeLink() {
  return <a href="/checkout">Upgrade plan</a>;
}
// @end:ix-upgrade
`,
  "src/pages/Checkout.tsx": `
// @span:page-checkout
export function CheckoutPage() {
  return (
    <main>
      <PlanPicker />
      <PaymentForm />
      <SubscribeButton plan="team" />
    </main>
  );
}
// @end:page-checkout

// @span:comp-plans
function PlanPicker() {
  return <fieldset aria-label="Plan"><label><input type="radio" name="plan" /> Team</label></fieldset>;
}
// @end:comp-plans

// @span:comp-payment
function PaymentForm() {
  return <form aria-label="Payment method" />;
}
// @end:comp-payment

// @span:ix-subscribe
export async function subscribe(plan: string) {
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (response.status === 401) throw new Error("Sign in required.");
  if (response.status === 402) throw new Error("The card was declined.");
  if (!response.ok) throw new Error("Could not start the subscription.");
  return response.json() as Promise<{ subscriptionId: string }>;
}
// @end:ix-subscribe
`,
  "src/routes/auth.ts": `
// @span:api-login
export async function postLogin(request: Request) {
  const body = (await request.json()) as { email: string; password: string };
  const session = await authService.login(body.email, body.password);
  return Response.json({ userId: session.userId });
}
// @end:api-login

// @span:api-github
export async function postGitHub(request: Request) {
  const url = await authService.githubAuthorizeUrl(request);
  return Response.json({ url });
}
// @end:api-github

declare const authService: {
  login(email: string, password: string): Promise<{ userId: string }>;
  githubAuthorizeUrl(request: Request): Promise<string>;
};
`,
  "src/routes/projects.ts": `
// @span:api-projects-create
export async function postProject(request: Request) {
  const body = (await request.json()) as { name: string };
  const project = await projectController.create(body.name);
  return Response.json(project, { status: 201 });
}
// @end:api-projects-create

// @span:api-projects-list
export async function getProjects(url: URL) {
  const projects = await projectController.list(url.searchParams.get("q") ?? "");
  return Response.json(projects);
}
// @end:api-projects-list

// @span:api-summary
export async function postSummary(projectId: string) {
  const summary = await projectService.summarize(projectId);
  return Response.json({ summary });
}
// @end:api-summary

declare const projectController: {
  create(name: string): Promise<{ id: string }>;
  list(query: string): Promise<unknown[]>;
};
declare const projectService: { summarize(projectId: string): Promise<string> };
`,
  "src/routes/account.ts": `
// @span:api-profile
export async function patchMe(request: Request) {
  const body = (await request.json()) as { name: string };
  await userService.updateProfile(body.name);
  return new Response(null, { status: 204 });
}
// @end:api-profile

// @span:api-avatar
export async function postAvatar(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("Missing file", { status: 400 });
  await userService.storeAvatar(file);
  return new Response(null, { status: 204 });
}
// @end:api-avatar

// @span:api-settings
export async function patchSettings(request: Request) {
  const body = (await request.json()) as { weeklyDigest: boolean };
  await userService.updateProfile(body.weeklyDigest ? "digest:on" : "digest:off");
  return new Response(null, { status: 204 });
}
// @end:api-settings

declare const userService: {
  updateProfile(name: string): Promise<void>;
  storeAvatar(file: File): Promise<void>;
};
`,
  "src/routes/billing.ts": `
// @span:api-checkout
export async function postCheckout(request: Request) {
  const body = (await request.json()) as { plan: string };
  const subscription = await checkoutService.createSubscription(body.plan);
  return Response.json(subscription, { status: 201 });
}
// @end:api-checkout

declare const checkoutService: {
  createSubscription(plan: string): Promise<{ subscriptionId: string }>;
};
`,
  "src/middleware/requireAuth.ts": `
// @span:auth-require
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = readSession(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

function readSession(req: Request): string | null {
  const header = req.header("cookie") ?? "";
  const match = /session=([^;]+)/.exec(header);
  return match?.[1] ?? null;
}
// @end:auth-require
`,
  "src/services/auth.ts": `
// @span:svc-auth
export class AuthService {
  login(email: string, password: string) {
    return this.findUser(email, password);
  }

  githubAuthorizeUrl() {
    return "https://github.com/login/oauth/authorize";
  }
}
// @end:svc-auth

// @span:fn-auth-login
export async function login(email: string, password: string, db: Db) {
  const user = await db.users.findByEmail(email);
  if (!user || user.passwordHash !== hash(password)) {
    const error = new Error("Email or password is incorrect.");
    (error as Error & { status: number }).status = 401;
    throw error;
  }
  return createSession(user.id, db);
}
// @end:fn-auth-login

// @span:err-credentials
export function invalidCredentials() {
  return { status: 401, error: "Email or password is incorrect." };
}
// @end:err-credentials

// @span:fn-auth-session
export async function createSession(userId: string, db: Db) {
  const id = crypto.randomUUID();
  await db.sessions.insert({ id, userId });
  return { id, userId };
}
// @end:fn-auth-session

// @span:auth-session
export type Session = { id: string; userId: string };
// @end:auth-session

function hash(value: string) {
  return value;
}

interface Db {
  users: { findByEmail(email: string): Promise<{ id: string; passwordHash: string } | null> };
  sessions: { insert(row: { id: string; userId: string }): Promise<void> };
}
`,
  "src/controllers/ProjectController.ts": `
// @span:fn-project-controller
export async function create(name: string, service: ProjectService) {
  return service.create(name);
}
// @end:fn-project-controller

// @span:fn-project-list
export async function list(query: string, service: ProjectService) {
  return service.list(query);
}
// @end:fn-project-list

interface ProjectService {
  create(name: string): Promise<{ id: string }>;
  list(query: string): Promise<unknown[]>;
}
`,
  "src/services/project.ts": `
// @span:svc-project
export class ProjectService {
  constructor(private readonly db: ProjectDb) {}

  create(name: string) {
    return insertProject(this.db, name);
  }

  list(query: string) {
    return this.db.projects.search(query);
  }

  summarize(projectId: string) {
    return summarizeProject(this.db, projectId);
  }
}
// @end:svc-project

// @span:fn-project-create
export async function insertProject(db: ProjectDb, name: string) {
  const slug = name.trim().toLowerCase().replaceAll(" ", "-");
  const existing = await db.projects.findBySlug(slug);
  if (existing) {
    const error = new Error("A project with that name already exists.");
    (error as Error & { status: number }).status = 409;
    throw error;
  }
  return db.projects.insert({ name, slug });
}
// @end:fn-project-create

// @span:err-duplicate
export function duplicateProjectName() {
  return { status: 409, error: "A project with that name already exists." };
}
// @end:err-duplicate

// @span:fn-project-list-svc
export async function listProjects(db: ProjectDb, query: string) {
  return db.projects.search(query);
}
// @end:fn-project-list-svc

// @span:fn-project-summary
export async function summarizeProject(db: ProjectDb, projectId: string) {
  const project = await db.projects.find(projectId);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: \`Summarize \${project.name}\` }],
    }),
  });
  const payload = (await response.json()) as { summary?: string };
  return payload.summary ?? "";
}
// @end:fn-project-summary

interface ProjectDb {
  projects: {
    findBySlug(slug: string): Promise<{ id: string } | null>;
    find(id: string): Promise<{ name: string }>;
    insert(row: { name: string; slug: string }): Promise<{ id: string }>;
    search(query: string): Promise<unknown[]>;
  };
}
`,
  "src/services/checkout.ts": `
// @span:svc-checkout
export class CheckoutService {
  createSubscription(plan: string, userId: string) {
    return startSubscription(plan, userId);
  }
}
// @end:svc-checkout

// @span:fn-checkout
export async function startSubscription(plan: string, userId: string, db: BillingDb) {
  const stripeSubscription = await stripe.subscriptions.create({
    customer: userId,
    items: [{ price: plan }],
  });
  if (stripeSubscription.status === "incomplete") {
    const error = new Error("The card was declined.");
    (error as Error & { status: number }).status = 402;
    throw error;
  }
  return db.subscriptions.insert({
    userId,
    plan,
    stripeSubscriptionId: stripeSubscription.id,
    status: stripeSubscription.status,
  });
}
// @end:fn-checkout

// @span:err-payment
export function paymentDeclined() {
  return { status: 402, error: "The card was declined." };
}
// @end:err-payment

// @span:ext-stripe
const stripe = {
  subscriptions: {
    create(_input: { customer: string; items: Array<{ price: string }> }) {
      return Promise.resolve({ id: "sub_123", status: "active" });
    },
  },
};
// @end:ext-stripe

interface BillingDb {
  subscriptions: {
    insert(row: {
      userId: string;
      plan: string;
      stripeSubscriptionId: string;
      status: string;
    }): Promise<{ subscriptionId: string }>;
  };
}
`,
  "src/services/user.ts": `
// @span:svc-user
export class UserService {
  updateProfile(userId: string, name: string) {
    return writeProfile(userId, name);
  }

  storeAvatar(userId: string, file: File) {
    return writeAvatar(userId, file);
  }
}
// @end:svc-user

// @span:fn-user-update
export async function writeProfile(userId: string, name: string, db: UserDb) {
  await db.users.update({ id: userId, name });
}
// @end:fn-user-update

// @span:fn-avatar
export async function writeAvatar(userId: string, file: File) {
  const key = \`avatars/\${userId}\`;
  await s3.putObject({ bucket: "harbor-avatars", key, body: file });
}
// @end:fn-avatar

// @span:ext-s3
const s3 = {
  putObject(_input: { bucket: string; key: string; body: File }) {
    return Promise.resolve();
  },
};
// @end:ext-s3

interface UserDb {
  users: { update(row: { id: string; name: string }): Promise<void> };
}
`,
  "src/db/schema.sql": `
-- @span:db-postgres
-- Harbor primary database.

-- @span:table-users
create table users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  avatar_url text
);
-- @end:table-users

-- @span:table-sessions
create table sessions (
  id uuid primary key,
  user_id uuid not null references users (id),
  created_at timestamptz not null default now()
);
-- @end:table-sessions

-- @span:table-projects
create table projects (
  id uuid primary key,
  owner_id uuid not null references users (id),
  name text not null,
  slug text not null unique
);
-- @end:table-projects

-- @span:table-members
create table project_members (
  project_id uuid not null references projects (id),
  user_id uuid not null references users (id),
  primary key (project_id, user_id)
);
-- @end:table-members

-- @span:table-subscriptions
create table subscriptions (
  id uuid primary key,
  user_id uuid not null references users (id),
  stripe_customer_id text not null,
  stripe_subscription_id text,
  plan text not null,
  status text not null
);
-- @end:table-subscriptions
-- @end:db-postgres
`,
};

const compiled = new Map<string, CompiledFile>();

for (const [file, raw] of Object.entries(RAW)) {
  compiled.set(file, compile(raw.trim()));
}

export const SAMPLE_SOURCES: Record<string, string> = Object.fromEntries(
  [...compiled.entries()].map(([file, value]) => [file, value.text]),
);

export function sampleSource(file: string, span: string): SourceRef {
  const found = compiled.get(file)?.spans.get(span);
  if (!found) {
    throw new Error(`Sample source ${file} is missing span "${span}".`);
  }
  return { file, startLine: found.startLine, endLine: found.endLine };
}

function compile(raw: string): CompiledFile {
  const spans = new Map<string, { startLine: number; endLine: number }>();
  const open = new Map<string, number>();
  const kept: string[] = [];

  for (const line of raw.split("\n")) {
    const start = /^\/\/ @span:([a-z0-9-]+)$/.exec(line.trim()) ?? /^-- @span:([a-z0-9-]+)$/.exec(line.trim());
    const end = /^\/\/ @end:([a-z0-9-]+)$/.exec(line.trim()) ?? /^-- @end:([a-z0-9-]+)$/.exec(line.trim());
    if (start?.[1]) {
      open.set(start[1], kept.length + 1);
      continue;
    }
    if (end?.[1]) {
      const startLine = open.get(end[1]);
      if (!startLine) throw new Error(`Span "${end[1]}" has no start.`);
      if (kept.length < startLine) throw new Error(`Span "${end[1]}" is empty.`);
      spans.set(end[1], { startLine, endLine: kept.length });
      open.delete(end[1]);
      continue;
    }
    kept.push(line);
  }

  if (open.size > 0) {
    throw new Error(`Unclosed sample spans: ${[...open.keys()].join(", ")}.`);
  }

  return { text: kept.join("\n"), spans };
}
