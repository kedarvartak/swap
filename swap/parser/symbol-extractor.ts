import Parser from 'tree-sitter';
// @ts-ignore
import TypeScript from 'tree-sitter-typescript';
// @ts-ignore
import JavaScript from 'tree-sitter-javascript';
import { parse, detectLanguage, type SupportedLanguage } from './tree-sitter.js';
import { TYPESCRIPT_SYMBOL_QUERY, inferKind as tsInferKind } from './languages/typescript.js';
import { JAVASCRIPT_SYMBOL_QUERY, inferKind as jsInferKind } from './languages/javascript.js';
import type { Symbol as CodeSymbol, SymbolKind } from '../shared/types.js';

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
  const language = detectLanguage(filePath);
  if (!language) return [];

  const tree = parse(source, language);
  const queryStr = language === 'javascript' ? JAVASCRIPT_SYMBOL_QUERY : TYPESCRIPT_SYMBOL_QUERY;
  const inferKind = language === 'javascript' ? jsInferKind : tsInferKind;

  let captures: RawCapture[];
  try {
    captures = runQuery(tree, queryStr, language);
  } catch {
    // Fallback: return empty if query fails on malformed source
    return [];
  }

  return captures.map((cap) => {
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
