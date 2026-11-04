# Changelog

## 2.0.0

### Breaking changes

- The package is ESM only (`"type": "module"`). `require('odoyle')` no longer works. Use `import Odoyle from 'odoyle'`.
- Node.js 24 or later is required (`engines.node >= 24`).
- The constructor takes `{ ops }`. Version 1 took the ops object directly (`new Odoyle(ops)`).
- Passing `ops` no longer replaces all default ops. Your ops are added to the defaults, and an op with the same name replaces the default.
- An op is a function, or `{ fn, args?, version? }`. `odoyle.ops` is a `Map` of normalized `{ fn, args, version }` objects. Version 1 stored plain functions.
- An unknown `op` is an error when you call `compile()`. Version 1 used `=` instead. (`rules()` keeps the version 1 fallback.)
- `exports` limits the public files to `.` and `./schema.json`.
- The `diagnostics` and `propget` dependencies are removed. The `DEBUG=odoyle` log output is gone.
- `ajv` is a new runtime dependency. It checks the `args` of an op at compile time.
- In `compile()`, an unknown property on a rule object (for example the typo `evry`) is an error. List host keys in `compile(ruleset, { extra })`.
- Missing data is `undefined`, and the ops decide what it means. In `compile()` rulesets, `{ key: 'x', op: '=', value: 1 }` on a missing key does not short-circuit to `false`. (`rules()` keeps the version 1 short-circuit.)
- An op that throws makes `evaluate()` throw an `OdoyleError` with the rule path. Version 1 changed the error to `false`. (`rules()` keeps this.)
- In `compile()`, `value` in the `{ key, op, value }` form is an operand: a string such as `$name` is a variable reference. Use `{ literal: '$name' }` for a string that starts with `$`. (`rules()` treats `value` as a plain literal, as before.)

### Added

- `compile(ruleset, { vars, extra })` checks a ruleset once and returns `evaluate(data, bindings)`.
- `evaluate()` returns `{ pass, matches: [{ bindings }] }`, in a fixed order.
- `for: { each, as }`, `let`, and `when`.
- Operands: literals, `{ key }`, `$name`, `$name.path`, `{ literal }`, and `{ op, args }` calls that return values.
- Compile errors for an unknown op, bad `args`, an unknown `$var`, and a `let` that references itself. Each error names the rule path.
- `OdoyleError` with `path`.
- `schema.json` and `odoyle.schema({ extra })` for JSON Schema validation of rulesets.
- Ops `in` and `exists`.
- YAML examples in the README. The test fixtures are YAML rulesets, and a test shows that YAML and JSON give the same result. `yaml` is a development dependency only.

### Kept

- `every`, `some`, `not`, and the ops `= != > >= < <= ~ ^ $`.
- `rules(data, ruleset)` returns a boolean with the version 1 behavior.
