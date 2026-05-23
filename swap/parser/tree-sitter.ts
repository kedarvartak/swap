import Parser from 'tree-sitter';
// @ts-ignore — tree-sitter language bindings lack complete type declarations
import TypeScript from 'tree-sitter-typescript';
// @ts-ignore
import JavaScript from 'tree-sitter-javascript';

export type SupportedLanguage = 'typescript' | 'javascript' | 'tsx';

const parsers = new Map<SupportedLanguage, Parser>();

function getParser(language: SupportedLanguage): Parser {
  if (parsers.has(language)) return parsers.get(language)!;

  const p = new Parser();
  if (language === 'typescript' || language === 'tsx') {
    p.setLanguage((language === 'tsx' ? TypeScript.tsx : TypeScript.typescript) as unknown as Parser.Language);
  } else {
    p.setLanguage(JavaScript as unknown as Parser.Language);
  }

  parsers.set(language, p);
  return p;
}

export function parse(source: string, language: SupportedLanguage): Parser.Tree {
  return getParser(language).parse(source);
}

export function detectLanguage(filePath: string): SupportedLanguage | null {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'javascript';
  if (filePath.endsWith('.jsx')) return 'javascript';
  return null;
}

export { Parser };
