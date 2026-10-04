import { readFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import {
  LAYER_FOR_TYPE,
  SCHEMA_VERSION,
  type ApplicationGraph,
  type EdgeKind,
  type Flow,
  type GraphEdge,
  type GraphNode,
  type NodeMetadata,
  type NodeType,
  type SourceRef,
} from "../graphTypes.js";
import { LIMITS, scanRepository, spanOf, type SourceText } from "./scan.js";

export interface AnalysisReport {
  graph: ApplicationGraph;
  warnings: string[];
  filesAnalyzed: number;
  filesSkipped: number;
}

interface Span {
  file: string;
  startLine: number;
  endLine: number;
}

interface Fn {
  name: string;
  qualified: string;
  file: string;
  node: ts.Node;
  body: ts.Node | undefined;
  span: Span;
  jsx: boolean;
  isDefault: boolean;
}

interface SymbolRec {
  name: string;
  fn?: Fn;
  methods: Map<string, Fn>;
}

interface ImportBinding {
  specifier: string;
  imported: string;
  resolved: string | null;
}

interface FileInfo {
  path: string;
  text: string;
  source: ts.SourceFile;
  functions: Fn[];
  symbols: Map<string, SymbolRec>;
  imports: Map<string, ImportBinding>;
  externals: Map<string, string>;
  database: string | null;
}

interface PageFact {
  route: string;
  label: string;
  fn: Fn | null;
  span: Span;
}

interface ComponentFact {
  fn: Fn;
  pageRoute: string;
}

interface InteractionFact {
  label: string;
  span: Span;
  pageRoute: string;
  component: Fn | null;
  handlers: Fn[];
  inline: ts.Node | null;
}

interface ApiCall {
  method: HttpMethod;
  path: string;
  span: Span;
}

interface RouteFact {
  method: HttpMethod;
  path: string;
  span: Span;
  handler: Fn | null;
  auth: Fn[];
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

export async function inspectRepository(root: string): Promise<AnalysisReport> {
  const scan = await scanRepository(root);
  const warnings = [...scan.warnings];
  const name = await readAppName(root, warnings);
  const files = indexFiles(scan.files);
  const pages = dedupePages([
    ...routerPages(files),
    ...filePages(files),
  ]).slice(0, LIMITS.maxPages);
  if (pages.length > LIMITS.maxPages) {
    warnings.push(`Stopped after ${LIMITS.maxPages} pages.`);
  }

  const components = componentsOnPages(files, pages).slice(0, LIMITS.maxComponents);
  const interactions = interactionsOn(files, pages, components).slice(0, LIMITS.maxInteractions);
  const routes = backendRoutes(files);
  const graph = assemble({
    name,
    root,
    pages,
    components,
    interactions,
    routes,
    files,
  });

  return {
    graph,
    warnings: warnings.slice(0, 40),
    filesAnalyzed: scan.files.length,
    filesSkipped: warnings.filter((item) => item.startsWith("Skipped")).length,
  };
}

async function readAppName(root: string, warnings: string[]): Promise<string> {
  try {
    const text = await readFile(path.join(root, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(text);
    if (parsed != null && typeof parsed === "object" && "name" in parsed) {
      const name = (parsed as { name?: unknown }).name;
      if (typeof name === "string" && name.trim() !== "") return name.trim();
    }
  } catch (error) {
    if (error instanceof SyntaxError) warnings.push("package.json did not parse; using the directory name.");
  }
  return path.basename(root);
}

function indexFiles(sources: SourceText[]): Map<string, FileInfo> {
  const files = new Map<string, FileInfo>();
  for (const source of sources) {
    files.set(source.path, {
      path: source.path,
      text: source.text,
      source: source.source,
      functions: [],
      symbols: new Map(),
      imports: new Map(),
      externals: new Map(),
      database: null,
    });
  }
  for (const file of files.values()) {
    collectImports(file, files);
    collectFunctions(file);
  }
  return files;
}

function collectImports(file: FileInfo, files: Map<string, FileInfo>): void {
  for (const statement of file.source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const external = externalFromSpecifier(specifier);
    const database = databaseFromSpecifier(specifier);
    if (database && file.database == null) file.database = database;
    const clause = statement.importClause;
    if (!clause) continue;
    const bind = (local: string, imported: string) => {
      file.imports.set(local, {
        specifier,
        imported,
        resolved: resolveSpecifier(file.path, specifier, files),
      });
      if (external) file.externals.set(local, external);
    };
    if (clause.name) bind(clause.name.text, "default");
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        bind(element.name.text, (element.propertyName ?? element.name).text);
      }
    } else if (named && ts.isNamespaceImport(named)) {
      bind(named.name.text, "*");
    }
  }
}

function resolveSpecifier(from: string, specifier: string, files: Map<string, FileInfo>): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function collectFunctions(file: FileInfo): void {
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addFunction(file, node, node.name.text, node.name.text, node.body, hasExport(node), Boolean(node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)));
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      const exported = Boolean(node.parent.parent && ts.isVariableStatement(node.parent.parent) && hasExport(node.parent.parent));
      const isDefault = false;
      addFunction(file, node.initializer, node.name.text, node.name.text, node.initializer.body, exported, isDefault);
    } else if (ts.isMethodDeclaration(node) && methodName(node)) {
      const owner = ownerName(node);
      const name = methodName(node);
      if (owner && name && node.body) {
        addFunction(file, node, name, `${owner}.${name}`, node.body, false, false, owner);
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      const name = propertyNameText(node.name);
      const owner = ownerName(node);
      if (name && owner) {
        addFunction(file, node.initializer, name, `${owner}.${name}`, node.initializer.body, false, false, owner);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);

  const defaultExport = file.functions.find((fn) => fn.isDefault);
  if (defaultExport) {
    const existing = file.symbols.get("default");
    if (!existing) file.symbols.set("default", { name: "default", fn: defaultExport, methods: new Map() });
  }
}

function addFunction(
  file: FileInfo,
  node: ts.Node,
  name: string,
  qualified: string,
  body: ts.Node | undefined,
  exported: boolean,
  isDefault: boolean,
  methodOwner?: string,
): void {
  const fn: Fn = {
    name,
    qualified,
    file: file.path,
    node,
    body,
    span: spanOf(file.source, node),
    jsx: body ? containsJsx(body) : false,
    isDefault,
  };
  file.functions.push(fn);
  if (methodOwner) {
    const owner = file.symbols.get(methodOwner) ?? { name: methodOwner, methods: new Map<string, Fn>() };
    owner.methods.set(name, fn);
    file.symbols.set(methodOwner, owner);
    return;
  }
  const symbol: SymbolRec = file.symbols.get(name) ?? { name, methods: new Map() };
  symbol.fn = fn;
  file.symbols.set(name, symbol);
  if (exported && isDefault) file.symbols.set("default", symbol);
  void exported;
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function routerPages(files: Map<string, FileInfo>): PageFact[] {
  const pages: PageFact[] = [];
  for (const file of files.values()) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (tagText(node) === "Route") {
          const route = attrString(node, "path");
          const element = attrExpression(node, "element");
          if (route && element) {
            const fact = pageFromElement(file, files, route, element, spanOf(file.source, node));
            if (fact) pages.push(fact);
          }
        }
      }
      if (ts.isObjectLiteralExpression(node)) {
        const route = propString(node, "path");
        const element = propExpression(node, "element") ?? propExpression(node, "Component");
        if (route && element) {
          const fact = pageFromElement(file, files, route, element, spanOf(file.source, node));
          if (fact) pages.push(fact);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.source);
  }
  return pages;
}

function filePages(files: Map<string, FileInfo>): PageFact[] {
  const pages: PageFact[] = [];
  for (const file of files.values()) {
    const route = routeFromFilename(file.path);
    if (!route) continue;
    const fn = defaultComponent(file) ?? exportedComponent(file);
    pages.push({
      route,
      label: pageLabel(route, fn),
      fn,
      span: fn?.span ?? { file: file.path, startLine: 1, endLine: 1 },
    });
  }
  return pages;
}

function pageFromElement(
  file: FileInfo,
  files: Map<string, FileInfo>,
  route: string,
  element: ts.Expression,
  fallback: Span,
): PageFact | null {
  const fn = componentFromExpression(file, files, element);
  if (fn && !fn.jsx && tagTextFromExpression(element) == null) return null;
  const label = pageLabel(route, fn);
  return { route: normalizeRoute(route), label, fn, span: fn?.span ?? fallback };
}

function componentFromExpression(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn | null {
  if (ts.isIdentifier(expression)) return resolveFunction(file, files, expression.text);
  if (ts.isJsxSelfClosingElement(expression) || ts.isJsxElement(expression) || ts.isJsxOpeningElement(expression)) {
    const opening = ts.isJsxElement(expression) ? expression.openingElement : expression;
    if (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) {
      const tag = tagText(opening);
      if (!tag || tag[0] !== tag[0]?.toUpperCase()) return null;
      return resolveFunction(file, files, tag);
    }
  }
  if ((ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) && expression.body) {
    return {
      name: "Page",
      qualified: "Page",
      file: file.path,
      node: expression,
      body: expression.body,
      span: spanOf(file.source, expression),
      jsx: containsJsx(expression.body),
      isDefault: false,
    };
  }
  return null;
}

function tagTextFromExpression(expression: ts.Expression): string | null {
  const opening = ts.isJsxElement(expression)
    ? expression.openingElement
    : ts.isJsxSelfClosingElement(expression)
      ? expression
      : null;
  return opening ? tagText(opening) : null;
}

function componentsOnPages(files: Map<string, FileInfo>, pages: PageFact[]): ComponentFact[] {
  const found: ComponentFact[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (!page.fn?.body) continue;
    const file = files.get(page.fn.file);
    if (!file) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = tagText(node);
        if (tag && tag[0] === tag[0]?.toUpperCase() && tag !== page.fn?.name) {
          const fn = resolveFunction(file, files, tag);
          if (fn?.jsx) {
            const key = `${page.route}:${fn.file}:${fn.span.startLine}:${fn.name}`;
            if (!seen.has(key)) {
              seen.add(key);
              found.push({ fn, pageRoute: page.route });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(page.fn.body);
  }
  return found;
}

function interactionsOn(
  files: Map<string, FileInfo>,
  pages: PageFact[],
  components: ComponentFact[],
): InteractionFact[] {
  const facts: InteractionFact[] = [];
  const seen = new Set<string>();
  const hosts: { page: PageFact; fn: Fn; component: Fn | null }[] = [];
  for (const page of pages) {
    if (page.fn) hosts.push({ page, fn: page.fn, component: null });
  }
  for (const component of components) {
    const page = pages.find((item) => item.route === component.pageRoute);
    if (page) hosts.push({ page, fn: component.fn, component: component.fn });
  }

  for (const host of hosts) {
    const file = files.get(host.fn.file);
    if (!file || !host.fn.body) continue;
    const visit = (node: ts.Node): void => {
      const opening = ts.isJsxElement(node)
        ? node.openingElement
        : ts.isJsxSelfClosingElement(node)
          ? node
          : null;
      if (opening) {
        const handlerExpr = attrExpression(opening, "onClick") ?? attrExpression(opening, "onSubmit");
        const event = attrExpression(opening, "onClick") ? "click" : attrExpression(opening, "onSubmit") ? "submit" : null;
        if (handlerExpr && event) {
          const tag = tagText(opening)?.toLowerCase() ?? "";
          const label = interactionLabel(node, opening, handlerExpr) ;
          const handlers = handlerFunctions(file, files, handlerExpr);
          const inline = ts.isArrowFunction(handlerExpr) || ts.isFunctionExpression(handlerExpr) ? handlerExpr : null;
          const callsApi = reachableCalls(file, files, handlers, inline).length > 0;
          const meaningful = (tag === "button" || tag === "form" || callsApi) && label != null;
          if (meaningful && label) {
            const key = `${host.page.route}:${label}:${spanOf(file.source, opening).startLine}`;
            if (!seen.has(key)) {
              seen.add(key);
              facts.push({
                label,
                span: spanOf(file.source, node),
                pageRoute: host.page.route,
                component: host.component,
                handlers,
                inline,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(host.fn.body);
  }
  return facts;
}

function handlerFunctions(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn[] {
  if (ts.isIdentifier(expression)) {
    const fn = resolveFunction(file, files, expression.text);
    return fn ? [fn] : [];
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const fn = resolveMember(file, files, expression);
    return fn ? [fn] : [];
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    const nested: Fn[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = resolveFunction(file, files, node.expression.text);
        if (fn) nested.push(fn);
      }
      ts.forEachChild(node, visit);
    };
    visit(expression);
    return nested;
  }
  return [];
}

function reachableCalls(file: FileInfo, files: Map<string, FileInfo>, handlers: Fn[], inline: ts.Node | null): ApiCall[] {
  const calls: ApiCall[] = [];
  const seen = new Set<string>();
  const scanNode = (owner: FileInfo, node: ts.Node | undefined, depth: number) => {
    if (!node || depth > 3) return;
    const visit = (child: ts.Node): void => {
      if (ts.isCallExpression(child)) {
        const call = apiCallFrom(owner, child);
        if (call) {
          const key = `${call.method} ${call.path}:${call.span.startLine}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push(call);
          }
        }
        const callee = resolveCallTarget(owner, files, child);
        if (callee && depth < 3) {
          const next = files.get(callee.file) ?? owner;
          scanNode(next, callee.body, depth + 1);
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
  };
  for (const handler of handlers) {
    scanNode(files.get(handler.file) ?? file, handler.body, 0);
  }
  if (inline) scanNode(file, inline, 0);
  return calls;
}

function apiCallFrom(file: FileInfo, call: ts.CallExpression): ApiCall | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee) && callee.text === "fetch") {
    const target = call.arguments[0];
    const pathValue = target ? staticPath(target) : null;
    if (!pathValue) return null;
    const method = httpMethod(objectMethod(call.arguments[1]) ?? "GET");
    if (!method) return null;
    return { method, path: pathValue, span: spanOf(file.source, call) };
  }
  if (ts.isPropertyAccessExpression(callee) && HTTP_METHODS.has(callee.name.text.toLowerCase())) {
    const target = call.arguments[0];
    const pathValue = target ? staticPath(target) : null;
    if (!pathValue || !pathValue.startsWith("/")) return null;
    const method = httpMethod(callee.name.text);
    if (!method) return null;
    return { method, path: pathValue, span: spanOf(file.source, call) };
  }
  if (ts.isIdentifier(callee) && (callee.text === "axios" || callee.text === "ky")) {
    const init = call.arguments[0];
    if (init && ts.isObjectLiteralExpression(init)) {
      const pathValue = propString(init, "url");
      const method = httpMethod(propString(init, "method") ?? "GET");
      if (pathValue && method) return { method, path: pathValue, span: spanOf(file.source, call) };
    }
  }
  return null;
}

function backendRoutes(files: Map<string, FileInfo>): RouteFact[] {
  const prefixes = routerPrefixes(files);
  const routes: RouteFact[] = [];
  for (const file of files.values()) {
    const nextRoute = routeFromApiFilename(file.path);
    if (nextRoute) {
      for (const name of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
        const symbol = file.symbols.get(name);
        const method = httpMethod(name);
        if (symbol?.fn && method) {
          routes.push({ method, path: nextRoute, span: symbol.fn.span, handler: symbol.fn, auth: [] });
        }
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = httpMethod(node.expression.name.text);
        const pathArg = node.arguments[0];
        const pathValue = pathArg ? staticPath(pathArg) : null;
        if (method && pathValue && pathValue.startsWith("/")) {
          const receiver = receiverName(node.expression.expression);
          const prefix = receiver ? prefixes.get(`${file.path}:${receiver}`) ?? "" : "";
          const full = joinRoutes(prefix, pathValue);
          const args = node.arguments.slice(1);
          const auth: Fn[] = [];
          let handler: Fn | null = null;
          for (const arg of args) {
            const fn = expressionFunction(file, files, arg);
            if (!fn) continue;
            if (isAuthName(fn.name) || isAuthName(fn.qualified)) auth.push(fn);
            else handler = fn;
          }
          routes.push({ method, path: full, span: spanOf(file.source, node), handler, auth });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.source);
  }
  return routes;
}

function routerPrefixes(files: Map<string, FileInfo>): Map<string, string> {
  const routers = new Set<string>();
  const prefixes = new Map<string, string>();
  for (const file of files.values()) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer)
      ) {
        const callee = node.initializer.expression;
        const called = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isIdentifier(callee)
            ? callee.text
            : "";
        if (called === "Router") routers.add(`${file.path}:${node.name.text}`);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "use"
      ) {
        const mount = node.arguments[0] ? staticPath(node.arguments[0]) : null;
        const target = node.arguments[1];
        if (mount && target && ts.isIdentifier(target) && routers.has(`${file.path}:${target.text}`)) {
          prefixes.set(`${file.path}:${target.text}`, mount);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.source);
  }
  return prefixes;
}

interface AssembleInput {
  name: string;
  root: string;
  pages: PageFact[];
  components: ComponentFact[];
  interactions: InteractionFact[];
  routes: RouteFact[];
  files: Map<string, FileInfo>;
}

function assemble(input: AssembleInput): ApplicationGraph {
  const builder = new Builder();
  const appLabel = input.name.startsWith("@") ? (input.name.split("/")[1] ?? input.name) : input.name;
  const app = builder.node({
    type: "application",
    label: appLabel,
    summary: "Application",
    detail: `${appLabel} was reconstructed from the repository source.`,
  });

  const pageNodes = new Map<string, GraphNode>();
  for (const page of input.pages) {
    const metadata: NodeMetadata = { route: page.route };
    const node = builder.node({
      type: "page",
      label: page.label,
      summary: page.route,
      detail: page.fn
        ? `${page.label} is served at ${page.route}.`
        : `Route ${page.route}.`,
      source: page.span,
      metadata,
    });
    builder.edge(app, node, "contains", "contains");
    pageNodes.set(page.route, node);
  }

  const componentNodes = new Map<string, GraphNode>();
  for (const component of input.components) {
    const page = pageNodes.get(component.pageRoute);
    if (!page) continue;
    const key = `${component.pageRoute}:${component.fn.qualified}:${component.fn.span.startLine}`;
    const node = builder.node({
      type: "component",
      label: humanize(component.fn.name),
      summary: component.fn.file,
      detail: `${humanize(component.fn.name)} is rendered by ${page.label}.`,
      source: component.fn.span,
    });
    builder.contain(page, node);
    componentNodes.set(key, node);
  }

  const databases = new Map<string, GraphNode>();
  const tables = new Map<string, GraphNode>();
  const externals = new Map<string, GraphNode>();
  const auths = new Map<string, GraphNode>();
  const files = new Map<string, GraphNode>();
  const flows: Flow[] = [];

  for (const interaction of input.interactions) {
    const page = pageNodes.get(interaction.pageRoute);
    if (!page) continue;
    const file = input.files.get(interaction.span.file);
    const calls = file
      ? reachableCalls(file, input.files, interaction.handlers, interaction.inline)
      : [];
    const node = builder.node({
      type: "interaction",
      label: interaction.label,
      summary: interaction.component ? humanize(interaction.component.name) : page.label,
      detail: calls[0]
        ? `${interaction.label} calls ${calls[0].method} ${calls[0].path}.`
        : `${interaction.label} is a user action on ${page.label}.`,
      source: interaction.span,
    });
    builder.contain(page, node);
    const componentKey = interaction.component
      ? `${interaction.pageRoute}:${interaction.component.qualified}:${interaction.component.span.startLine}`
      : null;
    const componentNode = componentKey ? componentNodes.get(componentKey) : undefined;
    if (componentNode) builder.edge(componentNode, node, "calls", "triggers");

    const fileNode = fileNodeFor(builder, files, interaction.span.file);
    builder.edge(node, fileNode, "defined_in", "defined in", false);

    const flowNodes = [app, page, node];
    const flowEdges: GraphEdge[] = [];
    for (const call of calls.slice(0, 3)) {
      const route = matchRoute(input.routes, call.method, call.path);
      const metadata: NodeMetadata = {
        method: call.method,
        path: normalizeRoute(call.path),
      };
      if (route && route.auth.length > 0) metadata.authRequired = true;
      const api = builder.node({
        type: "api",
        label: `${call.method} ${normalizeRoute(call.path)}`,
        summary: route ? route.span.file : call.span.file,
        detail: route
          ? `${call.method} ${normalizeRoute(call.path)} is handled in ${route.span.file}.`
          : `${call.method} ${normalizeRoute(call.path)} is called from ${call.span.file}. No matching backend route was found.`,
        source: route?.span ?? call.span,
        metadata,
      });
      const callEdge = builder.edge(node, api, "calls", "calls");
      flowNodes.push(api);
      flowEdges.push(callEdge);

      if (route) {
        for (const authFn of route.auth) {
          const auth = authNode(builder, auths, authFn);
          const edge = builder.edge(api, auth, "authenticates", "authentication required");
          flowNodes.push(auth);
          flowEdges.push(edge);
        }
        if (route.handler) {
          const handler = functionNode(builder, route.handler);
          const edge = builder.edge(api, handler, "handles", "handles");
          flowNodes.push(handler);
          flowEdges.push(edge);
          const followed = followImplementation(builder, input.files, route.handler, databases, tables, externals);
          flowNodes.push(...followed.nodes);
          flowEdges.push(...followed.edges);
          if (followed.serviceEdge && followed.service) {
            // already included
          }
        }
      }
    }

    if (flowNodes.length >= 2) {
      flows.push({
        id: builder.id(`flow-${slug(interaction.label)}`),
        label: interaction.label,
        description: `${interaction.label} on ${page.label}.`,
        nodeIds: uniqueIds(flowNodes),
        edgeIds: flowEdges.map((edge) => edge.id),
      });
    }
  }

  for (const route of input.routes) {
    const key = `${route.method} ${normalizeRoute(route.path)}`;
    if (builder.nodes.some((node) => node.type === "api" && node.label === key)) continue;
    if (builder.nodes.filter((node) => node.type === "api").length >= LIMITS.maxApis) break;
    const metadata: NodeMetadata = { method: route.method, path: normalizeRoute(route.path) };
    if (route.auth.length > 0) metadata.authRequired = true;
    const api = builder.node({
      type: "api",
      label: key,
      summary: route.span.file,
      detail: `Backend route ${key}.`,
      source: route.span,
      metadata,
    });
    for (const authFn of route.auth) {
      builder.edge(api, authNode(builder, auths, authFn), "authenticates", "authentication required");
    }
    if (route.handler) {
      const handler = functionNode(builder, route.handler);
      builder.edge(api, handler, "handles", "handles");
      followImplementation(builder, input.files, route.handler, databases, tables, externals);
    }
  }

  const id = slug(appLabel) || "repository";
  const graph: ApplicationGraph = {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: appLabel,
    description: `Static analysis of ${input.name}. Runtime telemetry is not attached.`,
    nodes: builder.nodes,
    edges: builder.edges,
    flows: flows.filter((flow) => flow.nodeIds.length >= 2),
  };
  return graph;
}

function followImplementation(
  builder: Builder,
  files: Map<string, FileInfo>,
  fn: Fn,
  databases: Map<string, GraphNode>,
  tables: Map<string, GraphNode>,
  externals: Map<string, GraphNode>,
): { nodes: GraphNode[]; edges: GraphEdge[]; service: GraphNode | null; serviceEdge: GraphEdge | null } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let service: GraphNode | null = null;
  let serviceEdge: GraphEdge | null = null;
  const handler = builder.nodes.find((node) => node.source?.file === fn.file && node.source.startLine === fn.span.startLine && node.type === "function")
    ?? functionNode(builder, fn);
  const seen = new Set<string>();

  const visitFn = (current: Fn, via: GraphNode, depth: number) => {
    if (depth > 4 || seen.has(current.qualified + current.span.startLine)) return;
    seen.add(current.qualified + current.span.startLine);
    const file = files.get(current.file);
    if (!file || !current.body) return;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const serviceCall = serviceCallFrom(file, files, node);
        if (serviceCall) {
          const serviceNode = serviceNodeFor(builder, serviceCall.owner, serviceCall.method);
          const methodNode = functionNode(builder, serviceCall.method, `${serviceCall.owner}.${serviceCall.method.name}()`);
          const toService = builder.edge(via, serviceNode, "calls", "calls");
          const toMethod = builder.edge(serviceNode, methodNode, "calls", "calls");
          if (!service) {
            service = serviceNode;
            serviceEdge = toService;
            nodes.push(serviceNode, methodNode);
            edges.push(toService, toMethod);
          }
          visitFn(serviceCall.method, methodNode, depth + 1);
        }
        const sql = sqlCall(file, node);
        if (sql) {
          const engine = file.database ?? "Database";
          const database = databaseNode(builder, databases, engine, file.path);
          const table = tableNode(builder, tables, database, sql.table, file.path);
          const edge = builder.edge(via, table, sql.op, sql.op);
          nodes.push(database, table);
          edges.push(edge);
        }
        const externalName = externalCall(file, node);
        if (externalName) {
          const external = externalNode(builder, externals, externalName, file.path);
          const kind: EdgeKind = externalName === "Stripe" ? "sends_payment_to" : "depends_on";
          const label = externalName === "Stripe" ? "sends payment to" : "integrates with";
          const edge = builder.edge(via, external, kind, label);
          nodes.push(external);
          edges.push(edge);
        }
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const envName = envExternal(node);
        if (envName && !(ts.isCallExpression(node.parent) && externalCall(file, node.parent))) {
          const external = externalNode(builder, externals, envName, `${envName} env`);
          if (!builder.edges.some((edge) => edge.source === via.id && edge.target === external.id)) {
            const edge = builder.edge(via, external, "depends_on", "integrates with");
            nodes.push(external);
            edges.push(edge);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(current.body);
  };

  visitFn(fn, handler, 0);
  return { nodes, edges, service, serviceEdge };
}

function serviceCallFrom(
  file: FileInfo,
  files: Map<string, FileInfo>,
  call: ts.CallExpression,
): { owner: string; method: Fn } | null {
  if (!ts.isPropertyAccessExpression(call.expression) || !ts.isIdentifier(call.expression.expression)) return null;
  const ownerName = call.expression.expression.text;
  const methodName = call.expression.name.text;
  if (!/Service$|Repository$|Store$/.test(ownerName)) return null;
  const symbol = lookup(file, files, ownerName);
  const method = symbol?.methods.get(methodName);
  if (!method) return null;
  return { owner: ownerName, method };
}

function sqlCall(file: FileInfo, call: ts.CallExpression): { op: "writes" | "queries"; table: string } | null {
  const text = firstStringArg(call);
  if (text && /query|execute|raw|sql/i.test(calleeText(call))) {
    return sqlEffect(text);
  }
  if (ts.isPropertyAccessExpression(call.expression) && ts.isPropertyAccessExpression(call.expression.expression)) {
    const model = call.expression.expression.name.text;
    const action = call.expression.name.text;
    const receiver = call.expression.expression.expression;
    const receiverText = ts.isIdentifier(receiver) ? receiver.text : "";
    if (/prisma|db|database/i.test(receiverText) && model) {
      if (/^(create|update|delete|upsert|createMany|updateMany|deleteMany)$/.test(action)) {
        return { op: "writes", table: model };
      }
      if (/^(findMany|findFirst|findUnique|find|count|aggregate)$/.test(action)) {
        return { op: "queries", table: model };
      }
    }
  }
  if (text && /from\(|insert\(|update\(|delete\(/.test(calleeText(call)) === false && file.database === "Supabase") {
    const table = /from\(\s*["'`](\w+)["'`]/.exec(call.getText(file.source));
    if (table?.[1]) {
      const op = /insert|update|delete|upsert/.test(call.getText(file.source)) ? "writes" : "queries";
      return { op, table: table[1] };
    }
  }
  return null;
}

function sqlEffect(sql: string): { op: "writes" | "queries"; table: string } | null {
  const text = sql.replace(/\s+/g, " ");
  const patterns: [RegExp, "writes" | "queries"][] = [
    [/insert\s+into\s+["'`]?([A-Za-z_][\w]*)/i, "writes"],
    [/update\s+["'`]?([A-Za-z_][\w]*)/i, "writes"],
    [/delete\s+from\s+["'`]?([A-Za-z_][\w]*)/i, "writes"],
    [/from\s+["'`]?([A-Za-z_][\w]*)/i, "queries"],
  ];
  for (const [pattern, op] of patterns) {
    const match = pattern.exec(text);
    const table = match?.[1];
    if (table && !SQL_KEYWORDS.has(table.toLowerCase())) return { op, table };
  }
  return null;
}

const SQL_KEYWORDS = new Set(["select", "where", "set", "values", "into", "table", "dual"]);

function externalCall(file: FileInfo, call: ts.CallExpression): string | null {
  const text = calleeText(call);
  const root = text.split(".")[0] ?? "";
  const known = file.externals.get(root);
  if (known) return known;
  if (/^stripe$/i.test(root)) return "Stripe";
  return null;
}

function envExternal(node: ts.Node): string | null {
  let name: string | null = null;
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.kind === ts.SyntaxKind.Identifier &&
    (node.expression.expression as ts.Identifier).text === "process" &&
    node.expression.name.text === "env"
  ) {
    name = node.name.text;
  }
  if (!name) return null;
  if (name.startsWith("STRIPE_")) return "Stripe";
  if (name.startsWith("OPENAI_")) return "OpenAI";
  if (name.startsWith("S3_") || name.startsWith("AWS_S3")) return "Amazon S3";
  if (name.startsWith("GITHUB_")) return "GitHub";
  if (name.startsWith("RESEND_")) return "Resend";
  if (name.startsWith("CLERK_")) return "Clerk";
  if (name.startsWith("FIREBASE_")) return "Firebase";
  return null;
}

function matchRoute(routes: RouteFact[], method: HttpMethod, rawPath: string): RouteFact | undefined {
  const wanted = normalizeRoute(rawPath);
  return routes.find((route) => route.method === method && normalizeRoute(route.path) === wanted);
}

function authNode(builder: Builder, auths: Map<string, GraphNode>, fn: Fn): GraphNode {
  const key = `${fn.file}:${fn.name}`;
  const existing = auths.get(key);
  if (existing) return existing;
  const label = fn.name === "requireAuth" ? "Require auth" : humanize(fn.name);
  const node = builder.node({
    type: "auth",
    label,
    summary: fn.file,
    detail: `${label} runs before the protected handler.`,
    source: fn.span,
    metadata: { authRequired: true },
  });
  auths.set(key, node);
  return node;
}

function serviceNodeFor(builder: Builder, owner: string, method: Fn): GraphNode {
  const existing = builder.nodes.find((node) => node.type === "service" && node.label === owner);
  if (existing) return existing;
  return builder.node({
    type: "service",
    label: owner,
    summary: method.file,
    detail: `${owner} is called from the request path.`,
    source: method.span,
  });
}

function functionNode(builder: Builder, fn: Fn, label = fn.qualified): GraphNode {
  const existing = builder.nodes.find(
    (node) => node.type === "function" && node.label === label && node.source?.file === fn.file && node.source.startLine === fn.span.startLine,
  );
  if (existing) return existing;
  return builder.node({
    type: "function",
    label,
    summary: fn.file,
    detail: `${label} is defined in ${fn.file}.`,
    source: fn.span,
  });
}

function databaseNode(builder: Builder, databases: Map<string, GraphNode>, engine: string, file: string): GraphNode {
  const existing = databases.get(engine);
  if (existing) return existing;
  const node = builder.node({
    type: "database",
    label: engine,
    summary: file,
    detail: `${engine} is used from ${file}.`,
  });
  databases.set(engine, node);
  return node;
}

function tableNode(
  builder: Builder,
  tables: Map<string, GraphNode>,
  database: GraphNode,
  name: string,
  file: string,
): GraphNode {
  const key = `${database.id}:${name}`;
  const existing = tables.get(key);
  if (existing) return existing;
  const node = builder.node({
    type: "table",
    label: name,
    summary: database.label,
    detail: `${name} is accessed in ${file}.`,
  });
  tables.set(key, node);
  builder.contain(database, node);
  return node;
}

function externalNode(builder: Builder, externals: Map<string, GraphNode>, name: string, summary: string): GraphNode {
  const existing = externals.get(name);
  if (existing) return existing;
  const node = builder.node({
    type: "external",
    label: name,
    summary,
    detail: `${name} appears in the repository source. No credentials are stored.`,
  });
  externals.set(name, node);
  return node;
}

function fileNodeFor(builder: Builder, files: Map<string, GraphNode>, file: string): GraphNode {
  const existing = files.get(file);
  if (existing) return existing;
  const node = builder.node({
    type: "file",
    label: file,
    summary: "Source file",
    detail: file,
    source: { file, startLine: 1, endLine: 1 },
  });
  files.set(file, node);
  return node;
}

class Builder {
  readonly nodes: GraphNode[] = [];
  readonly edges: GraphEdge[] = [];
  private seq = 0;
  private ids = new Map<string, number>();

  id(base: string): string {
    const clean = slug(base) || "n";
    const count = (this.ids.get(clean) ?? 0) + 1;
    this.ids.set(clean, count);
    return count === 1 ? clean : `${clean}-${count}`;
  }

  node(draft: {
    type: NodeType;
    label: string;
    summary?: string;
    detail?: string;
    source?: SourceRef;
    metadata?: NodeMetadata;
  }): GraphNode {
    const node: GraphNode = {
      id: this.id(draft.label),
      type: draft.type,
      layer: LAYER_FOR_TYPE[draft.type],
      parentId: null,
      label: draft.label,
    };
    if (draft.summary) node.summary = draft.summary;
    if (draft.detail) node.detail = draft.detail;
    if (draft.source) node.source = draft.source;
    if (draft.metadata) node.metadata = draft.metadata;
    this.nodes.push(node);
    return node;
  }

  contain(parent: GraphNode, child: GraphNode): GraphEdge {
    child.parentId = parent.id;
    return this.edge(parent, child, "contains", "contains");
  }

  edge(source: GraphNode, target: GraphNode, kind: EdgeKind, label: string, expand?: false): GraphEdge {
    const edge: GraphEdge = {
      id: `e${++this.seq}`,
      source: source.id,
      target: target.id,
      kind,
      label,
    };
    if (expand === false) edge.expand = false;
    this.edges.push(edge);
    return edge;
  }
}

function lookup(file: FileInfo, files: Map<string, FileInfo>, name: string): SymbolRec | null {
  const local = file.symbols.get(name);
  if (local) return local;
  const binding = file.imports.get(name);
  if (!binding?.resolved) return null;
  const other = files.get(binding.resolved);
  if (!other) return null;
  if (binding.imported === "default") return other.symbols.get("default") ?? null;
  return other.symbols.get(binding.imported) ?? null;
}

function resolveFunction(file: FileInfo, files: Map<string, FileInfo>, name: string): Fn | null {
  return lookup(file, files, name)?.fn ?? null;
}

function resolveMember(file: FileInfo, files: Map<string, FileInfo>, expression: ts.PropertyAccessExpression): Fn | null {
  if (!ts.isIdentifier(expression.expression)) return null;
  return lookup(file, files, expression.expression.text)?.methods.get(expression.name.text) ?? null;
}

function resolveCallTarget(file: FileInfo, files: Map<string, FileInfo>, call: ts.CallExpression): Fn | null {
  if (ts.isIdentifier(call.expression)) return resolveFunction(file, files, call.expression.text);
  if (ts.isPropertyAccessExpression(call.expression)) return resolveMember(file, files, call.expression);
  return null;
}

function expressionFunction(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn | null {
  if (ts.isIdentifier(expression)) return resolveFunction(file, files, expression.text);
  if (ts.isPropertyAccessExpression(expression)) return resolveMember(file, files, expression);
  return null;
}

function dedupePages(pages: PageFact[]): PageFact[] {
  const byRoute = new Map<string, PageFact>();
  for (const page of pages) {
    const route = normalizeRoute(page.route);
    const key = route.toLowerCase();
    const existing = byRoute.get(key);
    if (!existing) {
      byRoute.set(key, { ...page, route });
      continue;
    }
    if (!existing.fn && page.fn) byRoute.set(key, { ...page, route: existing.route });
  }
  return [...byRoute.values()];
}

function routeFromFilename(file: string): string | null {
  const app = /(?:^|\/)app\/(.*)\/page\.(tsx|jsx)$/.exec(file);
  if (/(?:^|\/)app\/page\.(tsx|jsx)$/.test(file)) return "/";
  if (app?.[1]) {
    const parts = app[1]
      .split("/")
      .filter((part) => part !== "" && !part.startsWith("(") && !part.startsWith("@"));
    return normalizeRoute("/" + parts.map((part) => (part.startsWith("[") ? ":param" : part)).join("/")).toLowerCase();
  }
  const pages = /(?:^|\/)pages\/(.+)\.(tsx|jsx)$/.exec(file);
  if (!pages?.[1] || pages[1].startsWith("api/") || pages[1] === "api" || pages[1].startsWith("_")) return null;
  const route = pages[1].replace(/\/index$/, "").replace(/^index$/, "");
  const parts = route === "" ? [] : route.split("/").map((part) => (part.startsWith("[") ? ":param" : part));
  return normalizeRoute("/" + parts.join("/")).toLowerCase();
}

function routeFromApiFilename(file: string): string | null {
  const app = /(?:^|\/)app\/(.*)\/route\.(ts|js)$/.exec(file);
  if (/(?:^|\/)app\/route\.(ts|js)$/.test(file)) return "/";
  if (app?.[1]) return normalizeRoute("/" + app[1]);
  const pages = /(?:^|\/)pages\/api\/(.+)\.(ts|js)$/.exec(file);
  if (!pages?.[1]) return null;
  const route = pages[1].replace(/\/index$/, "").replace(/^index$/, "");
  return normalizeRoute("/api/" + route);
}

function defaultComponent(file: FileInfo): Fn | null {
  return file.symbols.get("default")?.fn ?? file.functions.find((fn) => fn.isDefault) ?? null;
}

function exportedComponent(file: FileInfo): Fn | null {
  const base = path.posix.basename(file.path).replace(/\.(tsx|jsx|ts|js)$/, "");
  return (
    file.functions.find((fn) => fn.jsx && fn.name.toLowerCase() === base.toLowerCase()) ??
    file.functions.find((fn) => fn.jsx) ??
    null
  );
}

function pageLabel(route: string, fn: Fn | null): string {
  if (fn && fn.name !== "Page" && fn.name !== "default") return humanize(fn.name);
  const parts = route.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "Home";
  return humanize(last === ":param" ? "Details" : last);
}

function interactionLabel(element: ts.Node, opening: ts.JsxOpeningLikeElement, handler: ts.Expression): string | null {
  const aria = attrString(opening, "aria-label");
  if (aria && aria.length <= 48) return aria.trim();
  if (ts.isJsxElement(element)) {
    const text = element.children
      .map((child) => (ts.isJsxText(child) ? child.text : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text && text.length <= 48) return text;
  }
  if (ts.isIdentifier(handler) && !/^on[A-Z]/.test(handler.text)) return humanize(handler.text);
  return null;
}

function normalizeRoute(route: string): string {
  const noQuery = route.split("?")[0] ?? route;
  const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  const collapsed = withSlash
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/:[A-Za-z_][\w-]*/g, ":param")
    .replace(/\/+/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) return collapsed.slice(0, -1);
  return collapsed || "/";
}

function joinRoutes(prefix: string, route: string): string {
  if (!prefix) return normalizeRoute(route);
  return normalizeRoute(`${prefix.replace(/\/$/, "")}/${route.replace(/^\//, "")}`);
}

function staticPath(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) value += `:param${span.literal.text}`;
    return value;
  }
  return null;
}

function objectMethod(node: ts.Expression | undefined): string | null {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  return propString(node, "method");
}

function propString(object: ts.ObjectLiteralExpression, name: string): string | null {
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (propertyNameText(prop.name) === name) return staticPath(prop.initializer);
  }
  return null;
}

function propExpression(object: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (propertyNameText(prop.name) === name) return prop.initializer;
  }
  return null;
}

function attrString(opening: ts.JsxOpeningLikeElement, name: string): string | null {
  const expression = attrExpression(opening, name);
  return expression ? staticPath(expression) : null;
}

function attrExpression(opening: ts.JsxOpeningLikeElement, name: string): ts.Expression | null {
  for (const attr of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name) || attr.name.text !== name || !attr.initializer) continue;
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer;
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return attr.initializer.expression as ts.Expression;
    }
  }
  return null;
}

function tagText(opening: ts.JsxOpeningLikeElement): string | null {
  const tag = opening.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return null;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function methodName(node: ts.MethodDeclaration): string | null {
  return node.name ? propertyNameText(node.name) : null;
}

function ownerName(node: ts.Node): string | null {
  const parent = node.parent;
  if (!parent) return null;
  if (ts.isClassDeclaration(parent) && parent.name) return parent.name.text;
  if (ts.isObjectLiteralExpression(parent)) {
    const declaration = parent.parent;
    if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
      return declaration.name.text;
    }
  }
  return null;
}

function hasExport(node: ts.Node): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword));
}

function receiverName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  return null;
}

function calleeText(call: ts.CallExpression): string {
  return call.expression.getText();
}

function firstStringArg(call: ts.CallExpression): string | null {
  const first = call.arguments[0];
  return first ? staticPath(first) : null;
}

function httpMethod(value: string | null): HttpMethod | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE") return upper;
  return null;
}

function isAuthName(name: string): boolean {
  return /^(requireAuth|authenticate|authMiddleware|ensureAuth|ensureAuthenticated|requireUser|requireLogin|isAuthenticated|protect|verifyToken|verifyAuth|withAuth|clerkMiddleware|authGuard)$/i.test(name);
}

function externalFromSpecifier(specifier: string): string | null {
  if (specifier === "stripe" || specifier.startsWith("stripe/")) return "Stripe";
  if (specifier === "openai") return "OpenAI";
  if (specifier.startsWith("@aws-sdk/client-s3")) return "Amazon S3";
  if (specifier.startsWith("@octokit/")) return "GitHub";
  if (specifier === "resend") return "Resend";
  if (specifier === "firebase" || specifier === "firebase-admin") return "Firebase";
  if (specifier.startsWith("@clerk/")) return "Clerk";
  if (specifier === "next-auth" || specifier.startsWith("@auth/")) return "NextAuth";
  if (specifier.startsWith("@sendgrid/")) return "SendGrid";
  return null;
}

function databaseFromSpecifier(specifier: string): string | null {
  if (specifier === "pg" || specifier === "postgres" || specifier === "pg-promise") return "PostgreSQL";
  if (specifier === "@prisma/client") return "Prisma";
  if (specifier === "drizzle-orm" || specifier.startsWith("drizzle-orm/")) return "Drizzle";
  if (specifier === "mongoose") return "MongoDB";
  if (specifier === "sequelize") return "Sequelize";
  if (specifier === "typeorm") return "TypeORM";
  if (specifier === "mysql" || specifier === "mysql2") return "MySQL";
  if (specifier === "better-sqlite3" || specifier === "sqlite3") return "SQLite";
  if (specifier.startsWith("@supabase/")) return "Supabase";
  return null;
}

function humanize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueIds(nodes: GraphNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (!ids.includes(node.id)) ids.push(node.id);
  }
  return ids;
}
