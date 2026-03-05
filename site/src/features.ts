import { featureCards } from "./data";

export function mountFeatures(container: HTMLElement): void {
  const section = document.createElement("section");
  section.className = "features";
  section.setAttribute("aria-label", "Features");

  const inner = document.createElement("div");
  inner.className = "section-inner";

  const header = document.createElement("div");
  header.className = "section-header";
  const heading = document.createElement("h2");
  heading.className = "section-title";
  heading.textContent = "Commands";
  header.appendChild(heading);

  const list = document.createElement("div");
  list.className = "features-list";

  for (const card of featureCards) {
    const row = document.createElement("article");
    row.className = "feature-row";

    const top = document.createElement("div");
    top.className = "feature-row-top";

    const title = document.createElement("h3");
    title.className = "feature-row-title";
    title.textContent = card.title;

    const desc = document.createElement("p");
    desc.className = "feature-row-desc";
    desc.textContent = card.desc;

    top.appendChild(title);
    top.appendChild(desc);

    const cli = document.createElement("div");
    cli.className = "feature-row-cli";
    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "$ ";
    cli.appendChild(prompt);
    cli.appendChild(document.createTextNode(card.cli));

    row.appendChild(top);
    row.appendChild(cli);
    list.appendChild(row);
  }

  inner.appendChild(header);
  inner.appendChild(list);
  section.appendChild(inner);
  container.appendChild(section);
}
