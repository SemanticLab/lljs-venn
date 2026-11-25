"use strict";
const { groups, venues, people, regions } = collection;
const members = (mask) => groups.filter((g, i) => mask & (1 << i));
const exactCounts = Array(32).fill(0);
people.forEach((p) => exactCounts[p.mask]++);
const letters = "ABCDE";
const code = (mask) =>
  members(mask)
    .map((g) => letters[g.id - 1])
    .join(" + ");
const itemUrl = (id) => "https://base.semlab.io/wiki/Item:" + id;
const plural = (n, one, many = one + "s") => n + " " + (n === 1 ? one : many);
const fold = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "");
const sorted = [...people].sort(
  (a, b) =>
    members(b.mask).length - members(a.mask).length ||
    a.name.localeCompare(b.name)
);
const $ = (id) => document.getElementById(id);
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(label, href, className) {
  const node = el("a", className, label);
  node.href = href;
  node.target = "_blank";
  node.rel = "noreferrer";
  return node;
}
function svg(tag, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  return node;
}
function badge(g) {
  const node = el("span", "badge", letters[g.id - 1]);
  node.style.setProperty("--badge", g.color);
  return node;
}
const state = { region: 0, group: 0, query: "", person: null };
function reset() {
  Object.assign(state, { region: 0, group: 0, query: "", person: null });
  $("search").value = "";
}
function choose(key, value, scroll = true) {
  reset();
  state[key] = value;
  render();
  if (scroll && matchMedia("(max-width:820px)").matches)
    $("directory").scrollIntoView({ block: "start" });
}

const paths = new Map();
const labels = new Map();
function buildDiagram() {
  const layer = svg("g", { "aria-hidden": "true" });
  for (let m = 1; m < 32; m++) {
    const region = regions[m],
      count = exactCounts[m],
      gs = members(m);
    const rgb = [1, 3, 5].map(
      (start) =>
        gs.reduce(
          (sum, g) => sum + parseInt(g.color.slice(start, start + 2), 16),
          0
        ) / gs.length
    );
    const tint = (fraction) =>
      "rgb(" +
      rgb
        .map((c, i) =>
          Math.round([255, 254, 248][i] * (1 - fraction) + c * fraction)
        )
        .join(",") +
      ")";
    const path = svg("path", {
      d: region.path,
      class: "region" + (count ? "" : " empty-region"),
      role: "button",
      tabindex: 0,
      "aria-label": code(m) + " only, " + plural(count, "person", "people"),
    });
    path.style.setProperty("--tint", tint(0.28 + gs.length * 0.09));
    path.style.setProperty("--pale", tint(0.14));
    path.style.setProperty("--edge", tint(0.85));
    path.style.setProperty("--focus", tint(0.82));
    const title = svg("title", {});
    title.textContent =
      gs.map((g) => g.name).join(" ∩ ") +
      " · " +
      plural(count, "person", "people");
    path.append(title);
    const option = el(
      "option",
      "",
      code(m) + " only · " + plural(count, "person", "people")
    );
    option.value = m;
    $("region-select").append(option);
    path.onclick = () => choose("region", m);
    path.onkeydown = (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        choose("region", m, false);
      }
    };
    $("venn").append(path);
    paths.set(m, path);
    const [x, y] = region.label;
    const label = svg("g", { "pointer-events": "none" });
    if (gs.length === 1) {
      const group = gs[0];
      label.append(
        svg("circle", {
          cx: x,
          cy: y - 15,
          r: 11,
          fill: group.color,
          class: "tag-disc",
        })
      );
      const letter = svg("text", { x, y: y - 15, class: "letter" });
      letter.textContent = letters[group.id - 1];
      label.append(letter);
    }
    const num = svg("text", {
      x,
      y: y + (gs.length === 1 ? 11 : 0),
      class:
        "count" + (count ? "" : " zero") + (gs.length === 1 ? " single" : ""),
    });
    num.textContent = count;
    label.append(num);
    layer.append(label);
    labels.set(m, label);
  }
  $("venn").append(layer);
  for (const g of groups) {
    const btn = el("button");
    btn.append(badge(g), document.createTextNode(g.name));
    btn.title = "Explore everyone connected to " + g.name;
    btn.onclick = () => choose("group", g.id);
    $("key").append(btn);
  }
}

function filtered() {
  if (state.query)
    return sorted.filter((p) => fold(p.name).includes(fold(state.query)));
  if (state.region) return sorted.filter((p) => p.mask === state.region);
  if (state.group)
    return sorted.filter((p) => p.mask & (1 << (state.group - 1)));
  return sorted;
}
function updateDiagram(list) {
  const masks = new Set(list.map((p) => p.mask)),
    selected = state.person?.mask || state.region;
  for (const [mask, path] of paths) {
    const active = selected
      ? mask === selected
      : Boolean(state.query && masks.size === 1 && masks.has(mask));
    const dim = selected
      ? mask !== selected
      : state.group
      ? !(mask & (1 << (state.group - 1)))
      : Boolean(state.query && !masks.has(mask));
    path.classList.toggle("dim", Boolean(dim));
    path.classList.toggle("active", active);
    path.setAttribute("aria-pressed", String(state.region === mask));
    labels.get(mask).setAttribute("opacity", dim ? ".5" : "1");
  }
  [...$("key").children].forEach((button, i) =>
    button.setAttribute("aria-pressed", String(state.group === i + 1))
  );
}
function summary(p) {
  return (
    plural(members(p.mask).length, "community", "communities") +
    " · " +
    plural(Object.keys(p.sites).length, "shrine")
  );
}
function personDetail(p) {
  const detail = el("article", "detail");
  const back = el("button", "back", "Back to people");
  back.onclick = () => {
    state.person = null;
    render();
    document.getElementById("row-" + p.id)?.focus();
  };
  const profile = el("div", "profile"),
    title = el("div"),
    heading = el("h3", "", p.name);
  heading.tabIndex = -1;
  title.append(heading, el("p", "meta", summary(p)));
  const credit = link("", "#", "credit");
  credit.hidden = true;
  profile.append(portrait(p, credit), title);
  detail.append(
    back,
    profile,
    link("Wikibase record", itemUrl(p.id), "source"),
    credit
  );
  for (const g of members(p.mask)) {
    const section = el("section", "venue-group"),
      h = el("h4"),
      list = el("ul");
    h.append(badge(g), document.createTextNode(g.name));
    const ids = Object.keys(p.sites)
      .filter((id) => venues[id].group === g.id - 1)
      .sort((a, b) => venues[a].name.localeCompare(venues[b].name));
    for (const id of ids) {
      const li = el("li");
      li.append(link(venues[id].name, itemUrl(id)));
      if (p.sites[id]) li.append(el("span", "meta", p.sites[id]));
      list.append(li);
    }
    section.append(h, list);
    detail.append(section);
  }
  return detail;
}
function render() {
  const list = filtered();
  updateDiagram(list);
  $("region-select").value = state.region || "";
  const total = plural(list.length, "person", "people");
  const scope = state.region
    ? "Exactly " + code(state.region)
    : state.group
    ? groups[state.group - 1].name
    : "";
  $("status").textContent = state.person
    ? "Selected person"
    : (scope ? scope + " · " : "") + total;
  $("clear").hidden = !(
    state.region ||
    state.group ||
    state.query ||
    state.person
  );
  const content = document.createDocumentFragment();
  if (state.person) content.append(personDetail(state.person));
  else
    for (const p of list) {
      const row = el("button", "person-row");
      row.id = "row-" + p.id;
      const label = el("span");
      label.append(el("strong", "", p.name), el("span", "meta", summary(p)));
      row.append(portrait(p), label);
      row.onclick = () => {
        state.person = p;
        render();
        $("results").querySelector("h3").focus({ preventScroll: true });
      };
      content.append(row);
    }
  if (!list.length)
    content.append(
      el(
        "p",
        "empty",
        state.region
          ? "No one is linked to exactly this combination of communities."
          : "No people match this name."
      )
    );
  $("results").replaceChildren(content);
  $("results").scrollTop = 0;
}
$("search").oninput = (event) => {
  state.region = 0;
  state.group = 0;
  state.person = null;
  state.query = event.target.value.trim();
  render();
};
$("clear").onclick = () => {
  reset();
  render();
  $("search").focus();
};
$("totals").textContent =
  plural(people.length, "person", "people") +
  " · " +
  plural(Object.keys(venues).length, "shrine");
$("region-select").onchange = (event) =>
  choose("region", Number(event.target.value));
buildDiagram();
render();
