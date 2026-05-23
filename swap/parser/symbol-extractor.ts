import Parser from 'tree-sitter';
// @ts-ignore
import TypeScript from 'tree-sitter-typescript';
// @ts-ignore
import JavaScript from 'tree-sitter-javascript';
import { parse, detectLanguage, type SupportedLanguage } from './tree-sitter.js';
import { TYPESCRIPT_SYMBOL_QUERY, inferKind as tsInferKind } from './languages/typescript.js';
import { JAVASCRIPT_SYMBOL_QUERY, inferKind as jsInferKind } from './languages/javascript.js';
import type { Symbol as CodeSymbol, SymbolKind, DependencyEdge, EdgeKind } from '../shared/types.js';

// Query to extract call expressions, imports, extends/implements
const DEPENDENCY_QUERY = `
  (call_expression function: (identifier) @callee)
  (call_expression function: (member_expression property: (property_identifier) @callee))
  (import_statement source: (string) @import_source)
  (class_heritage (extends_clause value: (identifier) @extends))
  (implements_clause (type_identifier) @implements)
  (type_reference name: (type_identifier) @type_ref)
`;

export interface ExtractResult {
  symbols: CodeSymbol[];
  edges: DependencyEdge[];
}

interface RawCapture {
  name: string;
  symbolNode: Parser.SyntaxNode;
  nameNode: Parser.SyntaxNode;
  language: SupportedLanguage;
}

function getLang(language: SupportedLanguage): Parser.Language {
  if (language === 'tsx') return TypeScript.tsx as unknown as Parser.Language;
  if (language === 'typescript') return TypeScript.typescript as unknown as Parser.Language;
  return JavaScript as unknown as Parser.Language;
}

function runQuery(tree: Parser.Tree, queryStr: string, language: SupportedLanguage): RawCapture[] {
  const query = new Parser.Query(getLang(language), queryStr);
  const matches = query.matches(tree.rootNode);

  const results: RawCapture[] = [];
  for (const match of matches) {
    const symbolCapture = match.captures.find((c) => c.name === 'symbol');
    const nameCapture = match.captures.find((c) => c.name === 'name');
    if (!symbolCapture || !nameCapture) continue;
    results.push({
      name: nameCapture.node.text,
      symbolNode: symbolCapture.node,
      nameNode: nameCapture.node,
      language,
    });
  }

  // Deduplicate by (name, startByte) — export wrappers produce duplicate captures
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.name}::${r.symbolNode.startIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractSymbols(source: string, filePath: string): CodeSymbol[] {
  return extractFull(source, filePath).symbols;
}

export function extractFull(source: string, filePath: string): ExtractResult {
  const language = detectLanguage(filePath);
  if (!language) return { symbols: [], edges: [] };

  const tree = parse(source, language);
  const queryStr = language === 'javascript' ? JAVASCRIPT_SYMBOL_QUERY : TYPESCRIPT_SYMBOL_QUERY;
  const inferKind = language === 'javascript' ? jsInferKind : tsInferKind;

  let captures: RawCapture[];
  try {
    captures = runQuery(tree, queryStr, language);
  } catch {
    return { symbols: [], edges: [] };
  }

  const symbols: CodeSymbol[] = captures.map((cap) => {
    const kind = inferKind(cap.symbolNode.type) as SymbolKind;
    const exported =
      cap.symbolNode.parent?.type === 'export_statement' ||
      cap.symbolNode.type === 'export_statement';

    return {
      name: cap.name,
      kind,
      exported,
      startLine: cap.symbolNode.startPosition.row,
      endLine: cap.symbolNode.endPosition.row,
      startByte: cap.symbolNode.startIndex,
      endByte: cap.symbolNode.endIndex,
      signature: extractSignature(cap.symbolNode),
      dependencies: [],
    };
  });

  const edges = extractDependencyEdges(tree, filePath, symbols, language);
  return { symbols, edges };
}

function extractDependencyEdges(
  tree: Parser.Tree,
  filePath: string,
  symbols: CodeSymbol[],
  language: SupportedLanguage
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const symbolNames = new Set(symbols.map((s) => s.name));

  let depCaptures;
  try {
    const q = new Parser.Query(getLang(language), DEPENDENCY_QUERY);
    depCaptures = q.captures(tree.rootNode);
  } catch {
    return [];
  }

  // Find which symbol each capture node lives inside
  for (const { name: captureName, node } of depCaptures) {
    const referencedName = node.text.replace(/['"]/g, '');
    if (!referencedName || referencedName.length > 50) continue;

    // Find the enclosing symbol (the function/class this call lives inside)
    const enclosingSymbol = findEnclosingSymbol(node, symbols);
    if (!enclosingSymbol) continue;

    const fromKey = `${filePath}::${enclosingSymbol.name}`;
    const toKey = `${filePath}::${referencedName}`;

    // Only add edges to symbols we know about in this file
    if (!symbolNames.has(referencedName)) continue;
    if (enclosingSymbol.name === referencedName) continue;

    const kind: EdgeKind =
      captureName === 'extends' ? 'extend' :
      captureName === 'implements' ? 'implement' :
      captureName === 'type_ref' ? 'type-use' :
      captureName === 'import_source' ? 'import' :
      'call';

    edges.push({ from: fromKey, to: toKey, kind });
  }

  return edges;
}

function findEnclosingSymbol(node: Parser.SyntaxNode, symbols: CodeSymbol[]): CodeSymbol | null {
  const byte = node.startIndex;
  // Find the smallest symbol that contains this byte position
  let best: CodeSymbol | null = null;
  for (const sym of symbols) {
    if (sym.startByte <= byte && byte <= sym.endByte) {
      if (!best || (sym.endByte - sym.startByte) < (best.endByte - best.startByte)) {
        best = sym;
      }
    }
  }
  return best;
}

function extractSignature(node: Parser.SyntaxNode): string | undefined {
  // Extract param list + return type for functions/methods
  const paramNode = node.childForFieldName('parameters');
  const returnNode = node.childForFieldName('return_type');
  if (!paramNode) return undefined;
  const params = paramNode.text;
  const ret = returnNode ? `: ${returnNode.text}` : '';
  return `${params}${ret}`;
}
