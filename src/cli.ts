import { runCli } from './runner/cli.js';

async function main() {
  const argv = process.argv.slice(2);
  const exitCode = await runCli(argv, { cwd: process.cwd() });
  process.exitCode = exitCode;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
