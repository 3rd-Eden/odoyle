# O'Doyle Rules!

Odoyle is a small rules engine. A ruleset is plain data: a parsed JSON or YAML
object. All logic comes from named **ops**. Odoyle checks a ruleset once
(`compile`), and then runs it against data as often as you like (`evaluate`).

Odoyle has no knowledge of what your rules mean. It returns matches with
bindings. What a match is for (a finding, a discount, an alert) is up to you.

> **Trivia** This package is named Family O'Doyle (bullies) from the movie Billy
> Madison (1995) where would say O'Doyle Rules after pulling a "prank" on Billy.

## Installation

```
npm install --save odoyle
```

Odoyle is ESM only and needs Node.js 24 or later. It accepts parsed objects,
so you can write rulesets in YAML or JSON. Parse YAML in your own code, for
example with the [`yaml`](https://www.npmjs.com/package/yaml) package. Odoyle
does not depend on a YAML parser.

## Quick start

```js
import Odoyle from 'odoyle';

const odoyle = new Odoyle({
  ops: {
    // A function, or { fn, args?, version? }.
    double: { fn: (n) => n * 2, args: { type: 'array', minItems: 1, maxItems: 1 } }
  }
});

const evaluate = odoyle.compile({
  for: { each: { key: 'orders' }, as: 'order' },
  let: { total: { op: 'double', args: ['$order.amount'] } },
  when: { op: '>', args: ['$total', 100] }
});

evaluate({ orders: [{ amount: 20 }, { amount: 80 }, { amount: 55 }] });
// {
//   pass: true,
//   matches: [
//     { bindings: { order: { amount: 80 }, total: 160 } },
//     { bindings: { order: { amount: 55 }, total: 110 } }
//   ]
// }
```

## API

### `new Odoyle({ ops })`

`ops` is an object. The key is the name of the op. The value is a function, or
an object with:

- `fn` The function. It gets the evaluated arguments, and returns a value.
- `args` (optional) A JSON Schema for the argument **array**. `compile()` checks
  it. Literal arguments are checked against the schema. Arguments that only
  exist at run time (keys, variables, op calls) are checked by count only.
- `version` (optional) Free metadata for the host, for example to refuse a
  ruleset that needs a newer op set. Odoyle does not use it.

Your ops are added to the defaults. An op with the same name replaces the
default. The ops are in the `odoyle.ops` `Map`.

### `odoyle.compile(ruleset, options)`

Checks the ruleset, and returns `evaluate(data, bindings)`. Run it once, when
you load the ruleset. It throws an `OdoyleError` when:

- an op is unknown;
- the arguments of an op do not match its `args` schema;
- a `$var` is not in scope;
- a `let` binding references itself (or a binding that comes later);
- the shape is wrong (for example `for` without `as`, or an unknown property).

The message starts with the path of the rule, for example
`every[1].when.op: unknown op "nope"`. The path is also in `error.path`.

Options:

- `vars` Names of variables that the host gives to `evaluate()` as `bindings`.
- `extra` Keys that the host keeps on rule objects (for example `report` or
  `id`). Odoyle ignores them. Any other unknown key is an error.

### `evaluate(data, bindings)`

Returns `{ pass, matches }`.

- `pass` is `true` when there is at least one match.
- `matches` is a list of `{ bindings }`. There is one match for each iteration
  of a `for` that holds. `bindings` has the `for` variable and the `let`
  values of that rule. A rule without `for` gives one match with empty
  bindings, or none.
- The order is fixed: the order of the collection, and then the order of the
  rules.

If an op throws, `evaluate` throws an `OdoyleError` with the rule path and the
original error as `cause`. Odoyle never changes an error into `false`. A
missing key is not an error. It gives `undefined`, and the ops decide what
that means.

### `odoyle.rules(data, ruleset)`

The version 1 method. It returns a boolean. Unknown ops fall back to `=`, a
missing `key` is `false`, and a thrown error is `false`. Use it to keep
version 1 code working.

## Grammar

A **rule** is an object, or an array of rules (an array means `every`).

| Property | Meaning |
| --- | --- |
| `every: [rule]` | All rules hold. |
| `some: [rule]` | One rule holds. It stops at the first. |
| `not: rule` | The rule does not hold. |
| `for: { each, as }` | Run the rule once for every item of the collection `each`. The item is bound to `as`. Missing data is an empty collection. |
| `let: { name: operand }` | Bind values. They are visible to later bindings, `when`, and the other conditions of the same rule. |
| `when: rule` | A guard. If it does not hold, the iteration gives no match. |
| `op`, `args` | A call to an op. It holds when the result is truthy. |
| `key`, `op`, `value` | The version 1 form. It means `op(key, value)`. |

On one rule object the order is: `for`, then `let`, then `when`, then
`every`, `some`, `not`, and `op`. All of them must hold.

An **operand** is any of these:

| Operand | Gives |
| --- | --- |
| `42`, `"text"`, `true`, `null` | The literal. |
| `[a, b]` | A list of operands. |
| `{ key: "a.b" }` | The value at a path in `data`. A missing step gives `undefined`. |
| `"$name"`, `"$name.path"` | A bound variable, and an optional path into it. |
| `{ op, args: [operand] }` | The return value of an op. Ops compose. |
| `{ literal: value }` | The value as is. Use it for strings that start with `$` or objects that look like rules. |
| A rule (for example `{ not: ... }`, `{ every: [...] }`) | `true` or `false`. |

Scopes: the host `vars`, then `for` variables, then `let` names. A `$var` is
only visible inside the rule that binds it. A nested `for` that uses the same
name shadows the outer variable inside that nested rule only.

### Default ops

`=` (`==`), `!=` (`!==`), `>`, `>=`, `<`, `<=`, `~` (includes), `^` (starts
with), `$` (ends with), `in` (`value`, `list`), and `exists` (not `undefined`
or `null`). The string ops give `false` for non-strings.

### Example: a template in YAML

Write the ruleset in YAML:

```yaml
# required-attribute.yaml
# Report each attribute in `options.attributes` that the node does not have.
for: { each: { key: options.attributes }, as: name }
when:
  not: { op: hasAttr, args: [$node, $name] }
report: { at: $node }
```

Parse it, then compile it:

```js
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const template = parse(readFileSync('required-attribute.yaml', 'utf8'));
const evaluate = odoyle.compile(template, { vars: ['node'], extra: ['report'] });
const { matches } = evaluate({ options: { attributes: ['alt', 'role'] } }, { node });
// One match for each attribute that `node` does not have.
// matches[0].bindings.name === 'alt'
```

The host decides what `report` means. Odoyle ignores it.

The same ruleset in JSON gives the same result:

```json
{
  "for": { "each": { "key": "options.attributes" }, "as": "name" },
  "when": { "not": { "op": "hasAttr", "args": ["$node", "$name"] } },
  "report": { "at": "$node" }
}
```

### Example: bindings and a nested op in YAML

```yaml
# Report a part whose text contrast is below the threshold.
for: { each: { op: partsOr, args: [$rec, { key: options.parts }, $node] }, as: target }
let:
  fg: { op: firstStyle, args: [$target, [color, fill]] }
  bg: { op: firstStyle, args: [$target, [background, background-color], ancestors] }
when:
  every:
    - { op: exists, args: [$fg] }
    - { op: exists, args: [$bg.value] }
    - { op: "<", args: [{ op: contrastRatio, args: [$fg, $bg.value] }, { key: options.ratio }] }
report: { at: $target }
```

In YAML, quote ops that are YAML syntax, such as `"<"`, `"!="` and `"="`.
Values that start with `$` are bindings, and they need no quotes. To use a
literal string that starts with `$`, write `{ literal: "$value" }`.

More YAML rulesets are in [`test/fixtures/`](test/fixtures/).

## Schema

`odoyle/schema.json` is a JSON Schema (draft 2020-12) for rulesets. To get a
schema that also knows your ops, call `odoyle.schema({ extra })`. It limits `op`
to the registered names, adds the `args` schema of each op, and adds the schemas
you give in `extra` for host keys.

```js
import schema from 'odoyle/schema.json' with { type: 'json' };

const full = odoyle.schema({ extra: { report: { type: 'object' } } });
```

## Migrating from version 1

- Use `import`. The package is ESM only and needs Node.js 24.
- Change `new Odoyle(ops)` to `new Odoyle({ ops })`. Your ops are now added to
  the defaults.
- `rules(data, ruleset)` works as before. Version 1 rulesets are valid.
- To get the new checks, use `compile()`. Unknown ops, missing variables and
  thrown errors are then errors.
- An op that was `(input, value) => ...` still works. It gets the evaluated
  `key` and `value`.
- See [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

[MIT](./LICENSE)
