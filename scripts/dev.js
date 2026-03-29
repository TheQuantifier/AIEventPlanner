import { spawn } from "node:child_process";

const children = [];

function startProcess(name, script) {
  const command =
    process.platform === "win32"
      ? {
          file: process.env.comspec || "cmd.exe",
          args: ["/d", "/s", "/c", `npm.cmd run ${script}`]
        }
      : {
          file: "sh",
          args: ["-lc", `npm run ${script}`]
        };

  const child = spawn(command.file, command.args, {
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      process.exitCode = code || 1;
    }
  });

  children.push({ name, child });
}

function shutdown(signal) {
  for (const { child } of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit();
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit();
});

startProcess("api", "dev:api");
startProcess("web", "dev:web");
