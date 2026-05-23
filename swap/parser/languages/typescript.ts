// Tree-sitter queries for TypeScript symbol extraction.
// Each capture group maps to a symbol kind we track in the intent registry.

export const TYPESCRIPT_SYMBOL_QUERY = `
  (function_declaration
    name: (identifier) @name) @symbol

  (method_definition
    name: (property_identifier) @name) @symbol

  (class_declaration
    name: (type_identifier) @name) @symbol

  (interface_declaration
    name: (type_identifier) @name) @symbol

  (type_alias_declaration
    name: (type_identifier) @name) @symbol

  (lexical_declaration
    (variable_declarator
      name: (identifier) @name)) @symbol

  (export_statement
    declaration: (function_declaration
      name: (identifier) @name)) @symbol

  (export_statement
    declaration: (class_declaration
      name: (type_identifier) @name)) @symbol
`;

// Maps tree-sitter node type → our SymbolKind
export function inferKind(nodeType: string): string {
  if (nodeType.includes('function')) return 'function';
  if (nodeType.includes('method')) return 'method';
  if (nodeType.includes('class')) return 'class';
  if (nodeType.includes('interface')) return 'interface';
  if (nodeType.includes('type_alias')) return 'type';
  if (nodeType.includes('variable') || nodeType.includes('lexical')) return 'variable';
  return 'variable';
}
