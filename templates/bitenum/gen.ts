
import * as yaml from "js-yaml";

type Identifier = { type: "Identifier"; name: string };
type Literal = { type: "Literal"; value: number; raw: string };
type BinaryExpression = {
  type: "BinaryExpression";
  operator: "|";
  left: Identifier;
  right: Identifier;
};
type Initializer = Literal | BinaryExpression;

type TSEnumMember = {
  type: "TSEnumMember";
  id: Identifier;
  initializer: Initializer;
};

type TSEnumDeclaration = {
  type: "TSEnumDeclaration";
  id: Identifier;
  members: TSEnumMember[];
};

type Program = {
  type: "Program";
  sourceType: "module";
  body: TSEnumDeclaration[];
};

// helper to make identifiers and literals
const id = (name: string): Identifier => ({ type: "Identifier", name });
const lit = (value: number): Literal => ({
  type: "Literal",
  value,
  raw: String(value),
});

// Build enum AST
function createEnumAST(
  name: string,
  members: (string | [string, Initializer])[]
): Program {
  const resultMembers: TSEnumMember[] = [];
  let currentValue = 1;

  for (const m of members) {
    let memberName: string;
    let initializer: Initializer;

    if (typeof m === "string") {
      memberName = m;
      initializer = lit(currentValue);
      currentValue <<= 1; // next power of two
    } else {
      [memberName, initializer] = m;
      if (
        initializer.type === "Literal" &&
        Number.isInteger(initializer.value) &&
        (initializer.value & (initializer.value - 1)) === 0 // power of two
      ) {
        // reset sequence
        currentValue = initializer.value << 1;
      }
    }

    resultMembers.push({
      type: "TSEnumMember",
      id: id(memberName),
      initializer,
    });
  }

  const enumDecl: TSEnumDeclaration = {
    type: "TSEnumDeclaration",
    id: id(name),
    members: resultMembers,
  };

  return { type: "Program", sourceType: "module", body: [enumDecl] };
}

// Example usage
const members = [
  "Read",
  "Write",
  ["Execute", { type: "Literal", value: 8, raw: "8" }],
  ["ReadWrite", { type: "BinaryExpression", operator: "|", left: id("Read"), right: id("Write") }],
  "Delete",
];

const ast = createEnumAST("Flags", members);
console.log(yaml.dump(ast, { noRefs: true, lineWidth: 80 }));
