
import * as yaml from "js-yaml";

type Identifier = { type: "Identifier"; name: string };
type Literal = { type: "Literal"; value: string; raw: string };
type Initializer = Literal;

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

// helpers
const id = (name: string): Identifier => ({ type: "Identifier", name });
const str = (value: string): Literal => ({
  type: "Literal",
  value,
  raw: JSON.stringify(value),
});

function createStringEnumAST(
  name: string,
  members: (string | [string, Initializer])[]
): Program {
  const resultMembers: TSEnumMember[] = [];

  for (const m of members) {
    let memberName: string;
    let initializer: Initializer;

    if (typeof m === "string") {
      memberName = m;
      initializer = str(memberName);
    } else {
      [memberName, initializer] = m;
      if (!initializer) initializer = str(memberName);
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
  "North",
  "South",
  ["East", { type: "Literal", value: "E", raw: '"E"' }],
  "West",
];

const ast = createStringEnumAST("Direction", members);
console.log(yaml.dump(ast, { noRefs: true, lineWidth: 80 }));
