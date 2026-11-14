// Starts the Vite dev server and the chat server together with one command.
// Ctrl+C stops both. No extra dependencies needed.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const scripts = ["dev:client", "chat-server"];
const children = scripts.map((script) =>
  spawn(npm, ["run", script], { stdio: "inherit", shell: process.platform === "win32" }),
);

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}

// If either process exits, shut the other one down too.
children.forEach((child, index) => {
  child.on("exit", (code) => {
    if (!stopping) console.error(`"${scripts[index]}" stopped (exit ${code ?? "signal"}).`);
    stopAll(code ?? 1);
  });
});
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
