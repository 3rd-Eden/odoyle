/**
 * Test doubles for host-provided ops. They use the names and argument shapes
 * of a host’s template operators, on plain objects. They prove the grammar only.
 */

/** Relative luminance of a `#rrggbb` color. */
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const flat = (n) => (n.children || []).flatMap((c) => [c, ...flat(c)]);
const rank = (list, order) => list.map((n) => order.indexOf(n.pattern)).filter((r) => r >= 0);

export const ops = {
  hasAttr: (n, name) => name in (n.attrs || {}),
  descendants: flat,
  matchesCategory: (n, category) => n.category === category,
  text: (n) => ({ text: n.text ?? '', dynamic: Boolean(n.dynamic) }),
  words: (s) => s.split(/\s+/).filter(Boolean),
  lowerAll: (list) => list.map((s) => s.toLowerCase()),
  lower: (s) => s.toLowerCase(),
  count: (list) => list.length,
  isTitleCase: (s) => s.split(/\s+/).every((w) => /^[A-Z]/.test(w)),
  isSentenceCase: (s) => /^[A-Z]/.test(s) && !/\s[A-Z]/.test(s),
  endsWithPunctuation: (s) => /[.!?:;,]$/.test(s.trim()),
  coalesce: (...values) => values.find((v) => v !== undefined && v !== null),
  orderedGroup: (n) => n.group,
  isFirstMatchingInGroup: (n, group, order) => group.find((m) => order.includes(m.pattern)) === n,
  inOrder: (group, order) => rank(group, order).every((r, i, all) => i === 0 || all[i - 1] <= r),
  orderUnreliable: (n) => Boolean(n.unreliable),
  partsOr: (rec, parts, node) => parts ? parts.flatMap((p) => rec.parts[p] || []) : [node],
  firstStyle: (n, props, inherit) => {
    for (const holder of inherit === 'ancestors' ? [n, ...(n.ancestors || [])] : [n]) {
      const prop = props.find((p) => holder.style && holder.style[p]);

      if (prop) return { value: holder.style[prop], node: holder };
    }
  },
  isLargeText: (n) => Boolean(n.large),
  contrastRatio: (a, b) => {
    const [hi, lo] = [lum(a.value ?? a), lum(b)].sort((x, y) => y - x);

    return (hi + 0.05) / (lo + 0.05);
  },
  ifElse: (cond, a, b) => cond ? a : b,
  filterBy: (list, matcher) => list.filter((n) => n.category === matcher),
  anyMatch: (list, matcher) => list.some((n) => n.category === matcher),
  participantCount: (list) => ({ count: list.length, dynamic: list.some((n) => n.dynamic) })
};
