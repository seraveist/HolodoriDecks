// Unit scores can change with order only when a capped passive target has a
// tie in base total parameters. Enumerate those relative orders before pruning;
// the final representative still uses the existing full 120-order comparison.
export function unitScoreOrders(members) {
  const power = (member) => member.stats.p + member.stats.t + member.stats.s;
  const tiedPowers = new Set();
  for (const owner of members) {
    const target = owner.passive?.effect?.target;
    if (!target || target.kind === "self") continue;
    const eligible = members.filter((member) => target.kind === "all"
      || (target.kind === "attribute" && member.attribute === target.value)
      || (target.kind === "group" && member.groupings.has(target.value)))
      .sort((a, b) => power(b) - power(a));
    const count = target.count ?? 5;
    if (count > 0 && count < eligible.length
      && power(eligible[count - 1]) === power(eligible[count])) {
      tiedPowers.add(power(eligible[count]));
    }
  }
  if (!tiedPowers.size) return [members];
  let orders = [members];
  for (const total of tiedPowers) {
    const positions = members.flatMap((member, index) => power(member) === total ? [index] : []);
    const variants = permutations(positions.map((index) => members[index]));
    orders = orders.flatMap((order) => variants.map((variant) => {
      const next = [...order];
      positions.forEach((position, index) => { next[position] = variant[index]; });
      return next;
    }));
  }
  return orders;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map((tail) => [value, ...tail]));
}
