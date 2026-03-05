import "./style.css";
import { mountDemo } from "./demo";
import { mountFeatures } from "./features";
import { mountHero } from "./hero";
import { mountWorkflow } from "./workflow";

const app = document.getElementById("app") as HTMLElement;

// Mount sections in order
mountHero(app);
mountDemo(app);
mountFeatures(app);
mountWorkflow(app);

// Footer
const footer = document.createElement("footer");
footer.className = "site-footer";
const footerInner = document.createElement("div");
footerInner.className = "section-inner footer-inner";

const footerLeft = document.createElement("div");
footerLeft.className = "footer-left";
const footerName = document.createElement("div");
footerName.className = "footer-name";
footerName.textContent = "Hardcode-Replacer";
const footerDesc = document.createElement("div");
footerDesc.className = "footer-desc";
footerDesc.textContent = "A CLI tool for color management in codebases";
footerLeft.appendChild(footerName);
footerLeft.appendChild(footerDesc);

const footerRight = document.createElement("div");
footerRight.className = "footer-right";
const footerVersion = document.createElement("div");
footerVersion.className = "footer-version";
footerVersion.textContent = "V2.1.0";
const footerCopy = document.createElement("div");
footerCopy.className = "footer-copy";
footerCopy.textContent = `\u00A9 ${new Date().getFullYear()} @ytspar`;
footerRight.appendChild(footerVersion);
footerRight.appendChild(footerCopy);

footerInner.appendChild(footerLeft);
footerInner.appendChild(footerRight);
footer.appendChild(footerInner);
app.appendChild(footer);
