/* Drives the Working as menu in the header. Usage: node tests/ui-shell.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, click } = t;

const box = () => $("#rolePick");
const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));

click($("#resetBtn"));

test("the menu shows the current role and lists all nine", () => {
  check($("#rolePick .rp-btn").textContent.indexOf(w.App.roleInfo().label) >= 0, "button text");
  check($$("#rolePick li[data-role]").length === 9, "nine roles");
  check(!box().classList.contains("open"), "starts closed");
});

test("clicking opens the menu below the button and picking a role switches to it", () => {
  click($("#rolePick .rp-btn"));
  check(box().classList.contains("open"), "open");
  click($('#rolePick li[data-role="warehouse"]'));
  check(w.App.role === "warehouse", "role " + w.App.role);
  check($("#roleSel").value === "warehouse", "hidden select follows");
  check(!box().classList.contains("open"), "closes after picking");
  check($("#rolePick .rp-btn").textContent.indexOf("Warehouse") >= 0, "button shows new role");
  check(JSON.parse(w.localStorage.getItem("p2p-workbench-v2")).role === "warehouse", "saved");
});

test("the keyboard works: arrows move, Enter picks, Escape closes", () => {
  const btn = $("#rolePick .rp-btn");
  key(btn, "ArrowDown");
  check(box().classList.contains("open"), "arrow opens");
  key(w.document.activeElement, "ArrowDown");
  key(w.document.activeElement, "Enter");
  check(w.App.role === "ap", "next role after Warehouse is Accounts Payable, got " + w.App.role);
  click($("#rolePick .rp-btn"));
  key(w.document.activeElement, "Escape");
  check(!box().classList.contains("open") && w.App.role === "ap", "escape closes without change");
});

test("clicking anywhere else closes it", () => {
  click($("#rolePick .rp-btn"));
  click($("#view"));
  check(!box().classList.contains("open"));
});

test("every css and js link in index.html carries the same version number", () => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
  const links = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
  check(links.length >= 20, "links found " + links.length);
  const versions = new Set(links.map(l => (l.match(/\?v=(\d+)$/) || [])[1]));
  check(!versions.has(undefined), "a link has no ?v=: " + links.filter(l => !/\?v=\d+$/.test(l)).join(", "));
  check(versions.size === 1, "versions differ: " + [...versions].join(", "));
  check(w.document.querySelectorAll("script[src]").length === [...html.matchAll(/<script src=/g)].length, "every script loaded in the test");
});

t.done();
