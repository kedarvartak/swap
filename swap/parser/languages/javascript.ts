export const JAVASCRIPT_SYMBOL_QUERY = `
  (function_declaration
    name: (identifier) @name) @symbol

  (method_definition
    name: (property_identifier) @name) @symbol

  (class_declaration
    name: (identifier) @name) @symbol

  (lexical_declaration
    (variable_declarator
      name: (identifier) @name)) @symbol

  (export_statement
    declaration: (function_declaration
      name: (identifier) @name)) @symbol

  (export_statement
    declaration: (class_declaration
      name: (identifier) @name)) @symbol
`;

export function inferKind(nodeType: string): string {
  if (nodeType.includes('function')) return 'function';
  if (nodeType.includes('method')) return 'method';
  if (nodeType.includes('class')) return 'class';
  if (nodeType.includes('variable') || nodeType.includes('lexical')) return 'variable';
  return 'variable';
}
