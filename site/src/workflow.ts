import { workflowSteps } from './data';

export function mountWorkflow(container: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'workflow';
  section.setAttribute('aria-label', 'Workflow');

  const inner = document.createElement('div');
  inner.className = 'section-inner';

  const header = document.createElement('div');
  header.className = 'section-header';
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = 'Workflow';
  header.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'features-list';

  for (const step of workflowSteps) {
    const row = document.createElement('div');
    row.className = 'feature-row';

    const top = document.createElement('div');
    top.className = 'feature-row-top';

    const title = document.createElement('div');
    title.className = 'feature-row-title';
    title.textContent = step.label;

    const desc = document.createElement('div');
    desc.className = 'feature-row-desc';
    desc.textContent = step.title;

    top.appendChild(title);
    top.appendChild(desc);

    const cli = document.createElement('div');
    cli.className = 'feature-row-cli';
    const prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.textContent = '$ ';
    cli.appendChild(prompt);
    cli.appendChild(document.createTextNode(step.cli));

    row.appendChild(top);
    row.appendChild(cli);
    list.appendChild(row);
  }

  inner.appendChild(header);
  inner.appendChild(list);
  section.appendChild(inner);

  // Install section
  const install = document.createElement('div');
  install.className = 'install';

  const installInner = document.createElement('div');
  installInner.className = 'section-inner';

  const installGrid = document.createElement('div');
  installGrid.className = 'install-grid';

  // Left: large install heading + command
  const installLeft = document.createElement('div');
  installLeft.className = 'install-left';

  const installHeading = document.createElement('div');
  installHeading.className = 'install-heading';
  installHeading.textContent = 'Get Started';

  const cmd = document.createElement('div');
  cmd.className = 'install-cmd';
  const cmdPrompt = document.createElement('span');
  cmdPrompt.className = 'prompt';
  cmdPrompt.textContent = '$ ';
  const cmdText = document.createElement('span');
  cmdText.textContent = 'npm install -g hardcode-replacer';
  cmd.appendChild(cmdPrompt);
  cmd.appendChild(cmdText);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'install-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.setAttribute('aria-label', 'Copy install command');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('npm install -g hardcode-replacer').then(() => {
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });
  cmd.appendChild(copyBtn);

  installLeft.appendChild(installHeading);
  installLeft.appendChild(cmd);

  // Right: links column
  const installRight = document.createElement('div');
  installRight.className = 'install-right';

  const links: [string, string, string][] = [
    ['GitHub', 'https://github.com/ytspar/hardcode-replacer', 'Source code'],
    ['npm', 'https://www.npmjs.com/package/hardcode-replacer', 'Package registry'],
    ['Issues', 'https://github.com/ytspar/hardcode-replacer/issues', 'Bug reports'],
  ];

  for (const [label, href, desc] of links) {
    const row = document.createElement('a');
    row.className = 'install-link-row';
    row.href = href;
    row.target = '_blank';
    row.rel = 'noopener';

    const linkLabel = document.createElement('span');
    linkLabel.className = 'install-link-label';
    linkLabel.textContent = label;

    const linkDesc = document.createElement('span');
    linkDesc.className = 'install-link-desc';
    linkDesc.textContent = desc;

    row.appendChild(linkLabel);
    row.appendChild(linkDesc);
    installRight.appendChild(row);
  }

  installGrid.appendChild(installLeft);
  installGrid.appendChild(installRight);
  installInner.appendChild(installGrid);
  install.appendChild(installInner);

  section.appendChild(install);
  container.appendChild(section);
}
