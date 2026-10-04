import { createHash } from "node:crypto";
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
  /** Object property name → local symbol that property refers to. */
  namespaces: Map<string, Map<string, string>>;
  externals: Map<string, string>;
  database: string | null;
}

interface PageFact {
  route: string;
  routes: string[];
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
      namespaces: new Map(),
      externals: new Map(),
      database: null,
    });
  }
  for (const file of files.values()) {
    collectImports(file, files);
    collectRequires(file, files);
    collectFunctions(file);
    indexNamespaces(file);
    bindWrappedDefaults(file);
    bindDefaultAliases(file);
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

function collectRequires(file: FileInfo, files: Map<string, FileInfo>): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "require"
    ) {
      const specNode = node.initializer.arguments[0];
      const specifier = specNode && ts.isStringLiteral(specNode) ? specNode.text : null;
      if (specifier && ts.isIdentifier(node.name)) {
        file.imports.set(node.name.text, {
          specifier,
          imported: "default",
          resolved: resolveSpecifier(file.path, specifier, files),
        });
      }
      if (specifier && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name)) continue;
          const imported =
            element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
          file.imports.set(element.name.text, {
            specifier,
            imported,
            resolved: resolveSpecifier(file.path, specifier, files),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);
}

function indexNamespaces(file: FileInfo): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const props = namespaceProps(node.initializer);
      if (props.size > 0) file.namespaces.set(node.name.text, props);
    }
    if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
      const props = namespaceProps(node.expression);
      if (props.size > 0) file.namespaces.set("default", props);
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);
}

function namespaceProps(object: ts.ObjectLiteralExpression): Map<string, string> {
  const props = new Map<string, string>();
  for (const prop of object.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) {
      props.set(prop.name.text, prop.name.text);
    } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer)) {
      const name = propertyNameText(prop.name);
      if (name && !props.has(name)) props.set(name, prop.initializer.text);
    }
  }
  return props;
}

function bindDefaultAliases(file: FileInfo): void {
  for (const statement of file.source.statements) {
    if (!ts.isExportAssignment(statement) || !ts.isIdentifier(statement.expression)) continue;
    const name = statement.expression.text;
    const symbol = file.symbols.get(name);
    if (symbol && !file.symbols.has("default")) file.symbols.set("default", symbol);
    const props = file.namespaces.get(name);
    if (props && !file.namespaces.has("default")) file.namespaces.set("default", props);
    if (!file.symbols.has("default") && !file.namespaces.has("default")) {
      file.namespaces.set("default", new Map());
    }
  }
}

function bindWrappedDefaults(file: FileInfo): void {
  for (const statement of file.source.statements) {
    if (!ts.isExportAssignment(statement)) continue;
    if (file.symbols.get("default")?.fn?.jsx) continue;
    const fn = unwrapComponentExpression(file, statement.expression);
    if (!fn?.jsx) continue;
    const existing = file.symbols.get("default");
    file.symbols.set("default", {
      name: "default",
      fn,
      methods: existing?.methods ?? new Map(),
    });
  }
}

function unwrapComponentExpression(file: FileInfo, expression: ts.Expression, seen = new Set<string>()): Fn | null {
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return null;
    seen.add(expression.text);
    const named = file.symbols.get(expression.text)?.fn ?? null;
    if (named?.jsx) return named;
    return localAlias(file, expression.text, seen);
  }
  if (ts.isClassExpression(expression)) {
    if (expression.name) return file.symbols.get(expression.name.text)?.fn ?? null;
    return containsJsx(expression)
      ? {
          name: "Page",
          qualified: "Page",
          file: file.path,
          node: expression,
          body: expression,
          span: spanOf(file.source, expression),
          jsx: true,
          isDefault: false,
        }
      : null;
  }
  if (ts.isCallExpression(expression)) {
    const last = expression.arguments[expression.arguments.length - 1];
    if (last && (ts.isIdentifier(last) || ts.isCallExpression(last) || ts.isClassExpression(last))) {
      const inner = unwrapComponentExpression(file, last, seen);
      if (inner?.jsx) return inner;
    }
    if (ts.isCallExpression(expression.expression)) {
      return unwrapComponentExpression(file, expression.expression, seen);
    }
  }
  return null;
}

function localAlias(file: FileInfo, name: string, seen: Set<string>): Fn | null {
  for (const fn of file.functions) {
    if (fn.name === name && fn.jsx) return fn;
  }
  let found: Fn | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      found = unwrapComponentExpression(file, node.initializer, seen);
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);
  return found;
}

function collectFunctions(file: FileInfo): void {
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addFunction(file, node, node.name.text, node.name.text, node.body, hasExport(node), Boolean(node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)));
    } else if (ts.isClassDeclaration(node) && node.name && containsJsx(node)) {
      addFunction(
        file,
        node,
        node.name.text,
        node.name.text,
        node,
        hasExport(node),
        Boolean(node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)),
      );
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
          const element = attrExpression(node, "element") ?? attrExpression(node, "component");
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
      routes: [route],
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
  if (fn && isRouterShell(fn)) return null;
  if (fn && !fn.jsx && tagTextFromExpression(element) == null && !ts.isIdentifier(element)) return null;
  const named = expressionName(element);
  const label = fn && fn.name !== "Page" && fn.name !== "default"
    ? humanize(fn.name)
    : named
      ? humanize(named)
      : pageLabel(route, null);
  const normalized = normalizeRoute(route);
  return { route: normalized, routes: [normalized], label, fn, span: fn?.span ?? fallback };
}

function isRouterShell(fn: Fn): boolean {
  if (!fn.body) return false;
  let shell = false;
  const visit = (node: ts.Node): void => {
    if (shell) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagText(node);
      if (tag === "Route" || tag === "Routes" || tag === "Switch") shell = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return shell;
}

function componentFromExpression(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn | null {
  if (ts.isIdentifier(expression)) {
    return resolveFunction(file, files, expression.text) ?? unwrapComponentExpression(file, expression);
  }
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

function expressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  return tagTextFromExpression(expression);
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
          const handlers = handlerFunctions(file, files, handlerExpr);
          const inline = ts.isArrowFunction(handlerExpr) || ts.isFunctionExpression(handlerExpr) ? handlerExpr : null;
          const callsApi = reachableCalls(file, files, handlers, inline).length > 0;
          const label = interactionLabel(node, opening, handlerExpr)
            ?? (callsApi && host.component ? humanize(host.component.name) : null);
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
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const assigned = assignedHandler(file, expression.expression.name.text);
    return assigned ? [assigned] : [];
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

function assignedHandler(file: FileInfo, name: string): Fn | null {
  let found: ts.Expression | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
      node.left.name.text === name
    ) {
      found = node.right;
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);
  if (!found) return null;
  let handler: ts.Expression = found;
  if (
    (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
    handler.body &&
    (ts.isArrowFunction(handler.body) || ts.isFunctionExpression(handler.body))
  ) {
    handler = handler.body;
  }
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return null;
  return {
    name,
    qualified: name,
    file: file.path,
    node: handler,
    body: handler.body,
    span: spanOf(file.source, handler),
    jsx: false,
    isDefault: false,
  };
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
        const callees = resolveCallees(owner, files, child);
        if (depth < 4) {
          for (const callee of callees) {
            const next = files.get(callee.file) ?? owner;
            scanNode(next, callee.body, depth + 1);
          }
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

interface RouterModel {
  /** file:name → proven mount prefix. Missing key means the receiver is not a server. */
  prefix: Map<string, string>;
}

function backendRoutes(files: Map<string, FileInfo>): RouteFact[] {
  const routers = routerModel(files);
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
        const receiver = receiverName(node.expression.expression);
        const receiverKey = receiver ? `${file.path}:${receiver}` : null;
        if (method && pathValue && pathValue.startsWith("/") && receiverKey && routers.prefix.has(receiverKey)) {
          const full = joinRoutes(routers.prefix.get(receiverKey) ?? "", pathValue);
          const args = node.arguments.slice(1);
          const auth: Fn[] = [];
          let handler: Fn | null = null;
          for (const arg of args) {
            const inline = inlineHandler(file, arg);
            if (inline) {
              inline.name = `${method} ${pathValue}`;
              inline.qualified = `${method} ${full} handler`;
            }
            const fn = inline ?? expressionFunction(file, files, arg);
            if (!fn) {
              const authFn = authArgument(file, files, arg);
              if (authFn) auth.push(authFn);
              continue;
            }
            if (isAuthName(fn.name) || isAuthName(fn.qualified) || authArgument(file, files, arg)) auth.push(fn);
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

function inlineHandler(file: FileInfo, expression: ts.Expression): Fn | null {
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) return null;
  return {
    name: "handler",
    qualified: "handler",
    file: file.path,
    node: expression,
    body: expression.body,
    span: spanOf(file.source, expression),
    jsx: expression.body ? containsJsx(expression.body) : false,
    isDefault: false,
  };
}

function authArgument(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn | null {
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) return null;
  const owner = expression.expression.text;
  const method = expression.name.text;
  if (method !== "required" && method !== "optional" && !isAuthName(method)) return null;
  const located = locateSymbol(file, files, owner);
  const ownerFile = located?.file.path ?? "";
  const ownerIsAuth = owner === "auth" || owner === "authenticate" || /\/auth(\.|\/|$)/i.test(ownerFile);
  if (!ownerIsAuth && !isAuthName(method)) return null;
  const span = spanOf(file.source, expression);
  return {
    name: method,
    qualified: `${owner}.${method}`,
    file: located?.file.path ?? file.path,
    node: expression,
    body: undefined,
    span,
    jsx: false,
    isDefault: false,
  };
}

function routerModel(files: Map<string, FileInfo>): RouterModel {
  const kind = new Map<string, "app" | "router">();
  const alias = new Map<string, string>();
  const mounts: { parent: string; child: string; prefix: string }[] = [];

  const resolveKey = (file: FileInfo, name: string): string | null => {
    const local = `${file.path}:${name}`;
    if (kind.has(local)) return local;
    if (alias.has(local)) return alias.get(local) ?? null;
    const binding = file.imports.get(name);
    if (!binding?.resolved) return null;
    const imported = binding.imported === "*" ? "default" : binding.imported;
    const remote = `${binding.resolved}:${imported}`;
    if (kind.has(remote)) return remote;
    return alias.get(remote) ?? null;
  };

  for (const file of files.values()) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const key = `${file.path}:${node.name.text}`;
        const created = walkRouterExpr(file, node.initializer, key, kind, mounts, resolveKey, files, alias);
        if (created) kind.set(key, kind.get(created) ?? "router");
      }
      if (ts.isExportAssignment(node)) {
        if (ts.isIdentifier(node.expression)) {
          const target = `${file.path}:${node.expression.text}`;
          if (kind.has(target)) alias.set(`${file.path}:default`, target);
        } else {
          const key = `${file.path}:default`;
          const created = walkRouterExpr(file, node.expression, key, kind, mounts, resolveKey, files, alias);
          if (created) kind.set(key, kind.get(created) ?? "router");
        }
      }
      if (
        ts.isExpressionStatement(node) &&
        ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.expression.left) &&
        node.expression.left.name.text === "exports" &&
        ts.isIdentifier(node.expression.left.expression) &&
        node.expression.left.expression.text === "module" &&
        ts.isIdentifier(node.expression.right)
      ) {
        const target = `${file.path}:${node.expression.right.text}`;
        if (kind.has(target)) alias.set(`${file.path}:default`, target);
      }
      ts.forEachChild(node, visit);
    };
    visit(file.source);

    const visitUse = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "use" &&
        ts.isIdentifier(node.expression.expression)
      ) {
        const parent = resolveKey(file, node.expression.expression.text);
        if (parent) recordUse(file, parent, node.arguments, mounts, resolveKey, files, kind, alias);
      }
      ts.forEachChild(node, visitUse);
    };
    visitUse(file.source);
  }

  for (const file of files.values()) {
    const visitUse = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "use" &&
        ts.isIdentifier(node.expression.expression)
      ) {
        const parent = resolveKey(file, node.expression.expression.text);
        if (parent) recordUse(file, parent, node.arguments, mounts, resolveKey, files, kind, alias);
      }
      ts.forEachChild(node, visitUse);
    };
    visitUse(file.source);
    for (const statement of file.source.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
          const key = `${file.path}:${decl.name.text}`;
          if (!kind.has(key)) continue;
          walkRouterExpr(file, decl.initializer, key, kind, mounts, resolveKey, files, alias);
        }
      }
      if (ts.isExportAssignment(statement) && !ts.isIdentifier(statement.expression)) {
        const key = alias.get(`${file.path}:default`) ?? `${file.path}:default`;
        if (kind.has(key) || kind.has(`${file.path}:default`)) {
          walkRouterExpr(file, statement.expression, key, kind, mounts, resolveKey, files, alias);
        }
      }
    }
  }

  const prefix = new Map<string, string>();
  const inbound = new Set(mounts.map((mount) => mount.child));
  for (const key of kind.keys()) {
    if (!inbound.has(key)) prefix.set(key, "");
  }
  let progressed = true;
  let guard = 0;
  while (progressed && guard < kind.size + mounts.length + 2) {
    guard += 1;
    progressed = false;
    for (const mount of mounts) {
      if (!prefix.has(mount.parent) || prefix.has(mount.child)) continue;
      const next = mount.prefix ? joinRoutes(prefix.get(mount.parent) ?? "", mount.prefix) : (prefix.get(mount.parent) ?? "");
      prefix.set(mount.child, next === "/" ? "" : next);
      progressed = true;
    }
  }
  for (const key of kind.keys()) {
    if (!prefix.has(key)) prefix.set(key, "");
  }
  for (const [from, to] of alias) {
    const target = prefix.get(to);
    if (target !== undefined) prefix.set(from, target);
  }
  return { prefix };
}

function walkRouterExpr(
  file: FileInfo,
  expression: ts.Expression,
  keyIfRoot: string,
  kind: Map<string, "app" | "router">,
  mounts: { parent: string; child: string; prefix: string }[],
  resolveKey: (file: FileInfo, name: string) => string | null,
  files: Map<string, FileInfo>,
  alias: Map<string, string>,
): string | null {
  if (ts.isIdentifier(expression)) return resolveKey(file, expression.text);
  if (!ts.isCallExpression(expression)) return null;
  const created = factoryKind(expression);
  if (created) {
    kind.set(keyIfRoot, created);
    return keyIfRoot;
  }
  if (ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "use") {
    const parent = walkRouterExpr(file, expression.expression.expression, keyIfRoot, kind, mounts, resolveKey, files, alias);
    if (!parent) return null;
    if (!kind.has(parent)) kind.set(parent, "router");
    recordUse(file, parent, expression.arguments, mounts, resolveKey, files, kind, alias);
    return parent;
  }
  return null;
}

function recordUse(
  file: FileInfo,
  parent: string,
  args: readonly ts.Expression[],
  mounts: { parent: string; child: string; prefix: string }[],
  resolveKey: (file: FileInfo, name: string) => string | null,
  files: Map<string, FileInfo>,
  kind: Map<string, "app" | "router">,
  alias: Map<string, string>,
): void {
  const first = args[0];
  if (!first) return;
  const explicit = staticPath(first);
  const mounted = explicit ? args[1] : first;
  const prefix = explicit ?? "";
  if (!mounted) return;
  const child = routerExprKey(file, mounted, resolveKey, files, kind, alias);
  if (!child || child === parent) return;
  if (mounts.some((mount) => mount.parent === parent && mount.child === child && mount.prefix === prefix)) return;
  mounts.push({ parent, child, prefix });
}

function routerExprKey(
  file: FileInfo,
  expression: ts.Expression,
  resolveKey: (file: FileInfo, name: string) => string | null,
  files: Map<string, FileInfo>,
  kind: Map<string, "app" | "router">,
  alias: Map<string, string>,
): string | null {
  if (ts.isIdentifier(expression)) return resolveKey(file, expression.text);
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "require") {
    const spec = expression.arguments[0];
    if (!spec || !ts.isStringLiteral(spec)) return null;
    const resolved = resolveSpecifier(file.path, spec.text, files);
    if (!resolved) return null;
    const remote = `${resolved}:default`;
    if (kind.has(remote)) return remote;
    return alias.get(remote) ?? null;
  }
  return null;
}

function factoryKind(expression: ts.CallExpression): "app" | "router" | null {
  const callee = expression.expression;
  if (ts.isIdentifier(callee)) {
    if (callee.text === "express" || callee.text === "fastify") return "app";
    if (callee.text === "Router") return "router";
  }
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "Router") return "router";
  return null;
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
    const extraRoutes = page.routes.filter((route) => route !== page.route);
    const node = builder.node({
      type: "page",
      label: page.label,
      summary: page.route,
      detail: page.fn
        ? extraRoutes.length > 0
          ? `${page.label} is served at ${page.route}. Also registered at ${extraRoutes.join(", ")}.`
          : `${page.label} is served at ${page.route}.`
        : `Route ${page.route}.`,
      source: page.span,
      metadata,
    });
    builder.edge(app, node, "contains", "contains", page.span);
    for (const route of page.routes) pageNodes.set(route, node);
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
    builder.contain(page, node, component.fn.span);
    componentNodes.set(key, node);
  }

  const databases = new Map<string, GraphNode>();
  const tables = new Map<string, GraphNode>();
  const externals = new Map<string, GraphNode>();
  const auths = new Map<string, GraphNode>();
  const files = new Map<string, GraphNode>();
  const flows: Flow[] = [];
  const apis = new Map<string, GraphNode>();
  const apiAttached = new Set<string>();
  const interactionApis = new Set<string>();

  const ensureApi = (method: HttpMethod, rawPath: string, evidence: Span): {
    api: GraphNode;
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null => {
    const pathValue = normalizeRoute(rawPath);
    const key = `${method} ${pathValue}`;
    const existing = apis.get(key);
    if (existing) return { api: existing, nodes: [], edges: [] };
    if (apis.size >= LIMITS.maxApis) return null;
    const route = matchRoute(input.routes, method, rawPath);
    const metadata: NodeMetadata = { method, path: pathValue };
    if (route && route.auth.length > 0) metadata.authRequired = true;
    const api = builder.node({
      type: "api",
      label: key,
      summary: route ? route.span.file : evidence.file,
      detail: route
        ? `${key} is handled in ${route.span.file}.`
        : `${key} is called from ${evidence.file}. No matching backend route was found.`,
      source: route?.span ?? evidence,
      metadata,
    });
    apis.set(key, api);
    const extraNodes: GraphNode[] = [];
    const extraEdges: GraphEdge[] = [];
    if (route && !apiAttached.has(api.id)) {
      apiAttached.add(api.id);
      for (const authFn of route.auth) {
        const auth = authNode(builder, auths, authFn);
        const edge = builder.edge(api, auth, "authenticates", "authentication required", authFn.span);
        extraNodes.push(auth);
        extraEdges.push(edge);
      }
      if (route.handler) {
        const handler = functionNode(builder, route.handler);
        const edge = builder.edge(api, handler, "handles", "handles", route.span);
        extraNodes.push(handler);
        extraEdges.push(edge);
        const followed = followImplementation(builder, input.files, route.handler, databases, tables, externals);
        extraNodes.push(...followed.nodes);
        extraEdges.push(...followed.edges);
      }
    }
    return { api, nodes: extraNodes, edges: extraEdges };
  };

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
    builder.contain(page, node, interaction.span);
    const componentKey = interaction.component
      ? `${interaction.pageRoute}:${interaction.component.qualified}:${interaction.component.span.startLine}`
      : null;
    const componentNode = componentKey ? componentNodes.get(componentKey) : undefined;
    if (componentNode) builder.edge(componentNode, node, "calls", "triggers", interaction.span);

    const fileNode = fileNodeFor(builder, files, interaction.span.file);
    builder.edge(node, fileNode, "defined_in", "defined in", interaction.span, { expand: false });

    const flowNodes = [app, page, node];
    const flowEdges: GraphEdge[] = [];
    for (const call of calls.slice(0, 3)) {
      interactionApis.add(`${interaction.pageRoute}:${call.method} ${normalizeRoute(call.path)}`);
      const ensured = ensureApi(call.method, call.path, call.span);
      if (!ensured) continue;
      const callEdge = builder.edge(node, ensured.api, "calls", "calls", call.span);
      flowNodes.push(ensured.api, ...ensured.nodes);
      flowEdges.push(callEdge, ...ensured.edges);
    }

    if (flowNodes.length >= 2) {
      flows.push({
        id: builder.flowId(`flow-${interaction.pageRoute}-${slug(interaction.label)}`),
        label: interaction.label,
        description: `${interaction.label} on ${page.label}.`,
        nodeIds: uniqueIds(flowNodes),
        edgeIds: flowEdges.map((edge) => edge.id),
      });
    }
  }

  for (const page of input.pages) {
    const pageNode = pageNodes.get(page.route);
    const file = page.fn ? input.files.get(page.fn.file) : undefined;
    if (!pageNode || !page.fn || !file) continue;
    const calls = reachableCalls(file, input.files, [page.fn], null);
    for (const call of calls.slice(0, 8)) {
      const key = `${call.method} ${normalizeRoute(call.path)}`;
      if (interactionApis.has(`${page.route}:${key}`)) continue;
      const ensured = ensureApi(call.method, call.path, call.span);
      if (!ensured) continue;
      builder.edge(pageNode, ensured.api, "calls", "calls", call.span);
    }
  }

  for (const route of input.routes) {
    ensureApi(route.method, route.path, route.span);
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
        const evidence = spanOf(file.source, node);
        if (serviceCall) {
          const serviceNode = serviceNodeFor(builder, serviceCall.owner, serviceCall.method);
          const methodNode = functionNode(builder, serviceCall.method, `${serviceCall.owner}.${serviceCall.method.name}()`);
          const toService = builder.edge(via, serviceNode, "calls", "calls", evidence);
          const toMethod = builder.edge(serviceNode, methodNode, "calls", "calls", serviceCall.method.span);
          if (!service) {
            service = serviceNode;
            serviceEdge = toService;
            nodes.push(serviceNode, methodNode);
            edges.push(toService, toMethod);
          }
          visitFn(serviceCall.method, methodNode, depth + 1);
        } else {
          const callee = resolveCallTarget(file, files, node);
          const calleeFile = callee ? files.get(callee.file) : undefined;
          if (callee && calleeFile && persistsWithin(calleeFile, files, callee, 0, new Set())) {
            const fnNode = functionNode(builder, callee);
            const edge = builder.edge(via, fnNode, "calls", "calls", evidence);
            nodes.push(fnNode);
            edges.push(edge);
            visitFn(callee, fnNode, depth + 1);
          }
        }
        const sql = sqlCall(file, node);
        if (sql) {
          const engine = file.database ?? "Database";
          const database = databaseNode(builder, databases, engine, file.path);
          const table = tableNode(builder, tables, database, sql.table, file.path, evidence);
          const edge = builder.edge(via, table, sql.op, sql.op, evidence);
          nodes.push(database, table);
          edges.push(edge);
        }
        const externalName = externalCall(file, node);
        if (externalName) {
          const external = externalNode(builder, externals, externalName, file.path);
          const kind: EdgeKind = externalName === "Stripe" ? "sends_payment_to" : "depends_on";
          const label = externalName === "Stripe" ? "sends payment to" : "integrates with";
          const edge = builder.edge(via, external, kind, label, evidence);
          nodes.push(external);
          edges.push(edge);
        }
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const envName = envExternal(node);
        if (envName && !(ts.isCallExpression(node.parent) && externalCall(file, node.parent))) {
          const external = externalNode(builder, externals, envName, `${envName} env`);
          if (!builder.edges.some((edge) => edge.source === via.id && edge.target === external.id)) {
            const edge = builder.edge(via, external, "depends_on", "integrates with", spanOf(file.source, node));
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
  if (/^(console|Math|JSON|Promise|Object|Array|window|document|localStorage|sessionStorage|process)$/.test(ownerName)) {
    return null;
  }
  const symbol = lookup(file, files, ownerName);
  const method = symbol?.methods.get(methodName);
  if (!method) return null;
  if (/(Service|Repository|Repo|Dao)$/.test(ownerName)) return { owner: ownerName, method };
  const ownerFile = files.get(method.file);
  if (ownerFile && containsPersistence(ownerFile, method)) return { owner: ownerName, method };
  return null;
}

function containsPersistence(file: FileInfo, fn: Fn): boolean {
  if (!fn.body) return false;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && sqlCall(file, node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return found;
}

function persistsWithin(
  file: FileInfo,
  files: Map<string, FileInfo>,
  fn: Fn,
  depth: number,
  seen: Set<string>,
): boolean {
  if (!fn.body || depth > 3) return false;
  const key = `${fn.file}:${fn.span.startLine}:${fn.name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  if (containsPersistence(file, fn)) return true;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = resolveCallTarget(file, files, node);
      const next = callee ? files.get(callee.file) : undefined;
      if (callee && next && persistsWithin(next, files, callee, depth + 1, seen)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return found;
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
  const label = fn.name === "requireAuth"
    ? "Require auth"
    : fn.qualified.startsWith("auth.") && fn.name === "required"
      ? "Auth required"
      : fn.qualified.startsWith("auth.") && fn.name === "optional"
        ? "Auth optional"
        : humanize(fn.name);
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
  evidence: Span,
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
  builder.contain(database, node, evidence);
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
  private nodeIds = new Set<string>();
  private edgeById = new Map<string, GraphEdge>();

  flowId(base: string): string {
    return `${slug(base).slice(0, 32) || "flow"}-${digest(["flow", base])}`;
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
      id: this.nodeId(draft.type, draft.label, draft.source),
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

  contain(parent: GraphNode, child: GraphNode, evidence: Span): GraphEdge {
    child.parentId = parent.id;
    return this.edge(parent, child, "contains", "contains", evidence);
  }

  edge(
    source: GraphNode,
    target: GraphNode,
    kind: EdgeKind,
    label: string,
    evidence: Span,
    options?: { expand?: false },
  ): GraphEdge {
    const id = `e-${digest([
      source.id,
      target.id,
      kind,
      label,
      evidence.file,
      String(evidence.startLine),
      String(evidence.endLine),
    ])}`;
    const existing = this.edgeById.get(id);
    if (existing) return existing;
    const edge: GraphEdge = {
      id,
      source: source.id,
      target: target.id,
      kind,
      label,
      metadata: { evidence: { file: evidence.file, startLine: evidence.startLine, endLine: evidence.endLine } },
    };
    if (options?.expand === false) edge.expand = false;
    this.edges.push(edge);
    this.edgeById.set(id, edge);
    return edge;
  }

  private nodeId(type: string, label: string, source: SourceRef | undefined): string {
    const base = `${(slug(label) || type).slice(0, 28)}-${digest([
      type,
      label,
      source?.file ?? "",
      String(source?.startLine ?? 0),
      String(source?.endLine ?? 0),
    ])}`;
    if (!this.nodeIds.has(base)) {
      this.nodeIds.add(base);
      return base;
    }
    let n = 2;
    while (this.nodeIds.has(`${base}-${n}`)) n += 1;
    const id = `${base}-${n}`;
    this.nodeIds.add(id);
    return id;
  }
}

function digest(parts: readonly string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex").slice(0, 10);
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
  if (ts.isPropertyAccessExpression(call.expression)) return resolvePropertyChain(file, files, call.expression);
  return null;
}

function resolveCallees(file: FileInfo, files: Map<string, FileInfo>, call: ts.CallExpression): Fn[] {
  const direct = resolveCallTarget(file, files, call);
  if (direct) return [direct];
  const locals = localFunctionRefs(file, files, call);
  if (locals.length > 0) return locals;
  const dispatched = propsDispatchFn(file, call);
  return dispatched ? [dispatched] : [];
}

function localFunctionRefs(file: FileInfo, files: Map<string, FileInfo>, call: ts.CallExpression): Fn[] {
  if (!ts.isIdentifier(call.expression)) return [];
  const initializer = bindingInitializer(call, call.expression.text);
  if (!initializer) return [];
  return referencedFunctions(file, files, initializer);
}

function bindingInitializer(from: ts.Node, name: string): ts.Expression | null {
  let scope: ts.Node | undefined = from.parent;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope) && !ts.isClassDeclaration(scope)) {
    scope = scope.parent;
  }
  if (!scope) return null;
  let found: ts.Expression | null = null;
  const visit = (node: ts.Node): void => {
    if (node !== scope && (ts.isFunctionLike(node) || ts.isClassDeclaration(node))) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      node.end <= from.getStart()
    ) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

function referencedFunctions(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn[] {
  if (ts.isParenthesizedExpression(expression)) return referencedFunctions(file, files, expression.expression);
  if (ts.isPropertyAccessExpression(expression)) {
    const fn = resolvePropertyChain(file, files, expression);
    return fn ? [fn] : [];
  }
  if (ts.isIdentifier(expression)) {
    const fn = resolveFunction(file, files, expression.text);
    return fn ? [fn] : [];
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...referencedFunctions(file, files, expression.whenTrue),
      ...referencedFunctions(file, files, expression.whenFalse),
    ];
  }
  return [];
}

function propsDispatchFn(file: FileInfo, call: ts.CallExpression): Fn | null {
  const expression = call.expression;
  if (!ts.isPropertyAccessExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return null;
  const props = expression.expression;
  if (props.name.text !== "props" || props.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
  const component = enclosingComponentName(call);
  if (!component) return null;
  const body = dispatchMethodBody(file, component, expression.name.text);
  if (!body) return null;
  return {
    name: expression.name.text,
    qualified: `${component}.${expression.name.text}`,
    file: file.path,
    node: body,
    body,
    span: spanOf(file.source, body),
    jsx: false,
    isDefault: false,
  };
}

function enclosingComponentName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isClassDeclaration(current) && current.name) return current.name.text;
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    current = current.parent;
  }
  return null;
}

function dispatchMethodBody(file: FileInfo, component: string, method: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isCallExpression(node.expression)) {
      const wrapped = node.arguments[node.arguments.length - 1];
      const inner = node.expression;
      const callee = inner.expression;
      const called = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      const wraps = wrapped != null && ts.isIdentifier(wrapped) && wrapped.text === component;
      if (called === "connect" && wraps) {
        const dispatchArg = inner.arguments[1];
        const fn = dispatchArg ? unwrapToFunction(file, dispatchArg) : null;
        const returned = fn ? returnedObject(fn.body) : null;
        const methodBody = returned ? objectMethodBody(returned, method) : null;
        if (methodBody) found = methodBody;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);
  return found;
}

function unwrapToFunction(file: FileInfo, expression: ts.Expression): ts.ArrowFunction | ts.FunctionExpression | null {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (!ts.isIdentifier(expression)) return null;
  let found: ts.ArrowFunction | ts.FunctionExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === expression.text &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(file.source);
  return found;
}

function returnedObject(body: ts.ConciseBody | undefined): ts.ObjectLiteralExpression | null {
  if (!body) return null;
  if (ts.isParenthesizedExpression(body)) return returnedObject(body.expression);
  if (ts.isObjectLiteralExpression(body)) return body;
  if (ts.isBlock(body)) {
    for (const statement of body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression && ts.isObjectLiteralExpression(statement.expression)) {
        return statement.expression;
      }
    }
  }
  return null;
}

function objectMethodBody(object: ts.ObjectLiteralExpression, method: string): ts.Node | null {
  for (const prop of object.properties) {
    const name = ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) ? propertyNameText(prop.name) : null;
    if (name !== method) continue;
    if (ts.isMethodDeclaration(prop)) return prop.body ?? null;
    if (ts.isPropertyAssignment(prop)) {
      const init = prop.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init.body ?? null;
    }
  }
  return null;
}

function resolvePropertyChain(
  file: FileInfo,
  files: Map<string, FileInfo>,
  expression: ts.PropertyAccessExpression,
): Fn | null {
  const parts: string[] = [];
  let cursor: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(cursor)) {
    parts.unshift(cursor.name.text);
    cursor = cursor.expression;
  }
  if (!ts.isIdentifier(cursor)) return null;
  const root = locateSymbol(file, files, cursor.text);
  if (!root) return null;
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const prop = parts[index];
    if (!prop) return null;
    const alias = current.file.namespaces.get(current.name)?.get(prop);
    if (!alias) return null;
    const next = locateSymbol(current.file, files, alias);
    if (!next) return null;
    current = next;
  }
  const method = parts[parts.length - 1];
  if (!method) return null;
  return current.file.symbols.get(current.name)?.methods.get(method) ?? null;
}

function locateSymbol(
  file: FileInfo,
  files: Map<string, FileInfo>,
  name: string,
): { file: FileInfo; name: string } | null {
  if (file.symbols.has(name) || file.namespaces.has(name)) return { file, name };
  const binding = file.imports.get(name);
  if (!binding?.resolved) return null;
  const other = files.get(binding.resolved);
  if (!other) return null;
  const imported = binding.imported === "*" ? "default" : binding.imported;
  if (imported === "default" && !other.symbols.has("default") && !other.namespaces.has("default")) {
    return null;
  }
  return { file: other, name: imported };
}

function expressionFunction(file: FileInfo, files: Map<string, FileInfo>, expression: ts.Expression): Fn | null {
  if (ts.isIdentifier(expression)) return resolveFunction(file, files, expression.text);
  if (ts.isPropertyAccessExpression(expression)) return resolveMember(file, files, expression);
  return null;
}

function dedupePages(pages: PageFact[]): PageFact[] {
  const byComponent = new Map<string, PageFact>();
  const unresolved = new Map<string, PageFact>();
  for (const page of pages) {
    const route = normalizeRoute(page.route);
    if (page.fn) {
      const key = `${page.fn.file}:${page.fn.span.startLine}:${page.fn.name}`;
      const existing = byComponent.get(key);
      if (!existing) {
        byComponent.set(key, { ...page, route, routes: [route] });
        continue;
      }
      if (!existing.routes.includes(route)) existing.routes.push(route);
      if (existing.fn && !existing.fn.jsx && page.fn.jsx) {
        existing.fn = page.fn;
        existing.span = page.span;
        existing.label = page.label;
      }
      continue;
    }
    const key = `${route.toLowerCase()}:${page.label}`;
    if (!unresolved.has(key)) unresolved.set(key, { ...page, route, routes: [route] });
  }
  return [...byComponent.values(), ...unresolved.values()];
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
  const aria = readableLabel(attrString(opening, "aria-label"));
  if (aria) return aria;
  if (ts.isJsxElement(element)) {
    const text = readableLabel(
      element.children
        .map((child) => (ts.isJsxText(child) ? child.text : ""))
        .join(" "),
    );
    if (text) return text;
    if (tagText(opening)?.toLowerCase() === "form") {
      const button = submitButtonLabel(element);
      if (button) return button;
    }
  }
  if (ts.isIdentifier(handler) && !/^on[A-Z]/.test(handler.text) && !/^handle[A-Z]/.test(handler.text)) {
    return readableLabel(humanize(handler.text));
  }
  return null;
}

function submitButtonLabel(form: ts.JsxElement): string | null {
  let found: string | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening && tagText(opening)?.toLowerCase() === "button" && ts.isJsxElement(node)) {
      found = readableLabel(node.children.map((child) => (ts.isJsxText(child) ? child.text : "")).join(" "));
      if (found) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(form);
  return found;
}

function readableLabel(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 48) return null;
  if (/^(click|submit|handle click|on click|on submit)$/i.test(cleaned)) return null;
  return cleaned;
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
