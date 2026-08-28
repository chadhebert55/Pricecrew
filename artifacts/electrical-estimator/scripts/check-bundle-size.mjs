import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawn } from 'node:child_process';

const reportPrefix = 'ELECTRICAL_ESTIMATOR_ENTRY_CHUNK ';
const estimatorDirectory = fileURLToPath(new URL('../', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const checkOutputDirectory = join(
  os.tmpdir(),
  `electrical-estimator-bundle-check-${process.pid}`,
);

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        signal: null,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });

    child.on('close', (exitCode, signal) => {
      resolve({ exitCode: exitCode ?? 1, signal, stdout, stderr });
    });
  });
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const generatedClient = join(
  workspaceRoot,
  'lib/api-client-react/src/generated/api.schemas.ts',
);

if (!existsSync(generatedClient)) {
  fail(
    'Bundle-size check requires the committed generated API client. Run pnpm run codegen first.',
  );
} else {
  const build = await run('pnpm', ['run', 'build'], {
    cwd: estimatorDirectory,
    env: {
      ...process.env,
      BUNDLE_CHECK_OUTPUT_DIR: checkOutputDirectory,
    },
  });

  if (build.exitCode !== 0) {
    fail(
      `Bundle-size check build failed${build.signal ? ` with signal ${build.signal}` : ` with exit code ${build.exitCode}`}.`,
    );
  } else {
    const reports = build.stdout
      .split(/\r?\n/)
      .filter((line) => line.startsWith(reportPrefix))
      .map((line) => JSON.parse(line.slice(reportPrefix.length)));

    if (reports.length !== 1) {
      fail(
        `Bundle-size check expected one entry-chunk report, found ${reports.length}.`,
      );
    } else {
      const [report] = reports;
      console.log(
        `Electrical estimator entry chunk: ${report.sizeBytes} bytes (budget: ${report.budgetBytes} bytes).`,
      );

      if (!report.withinBudget) {
        fail(
          `Electrical estimator entry chunk exceeds the ${report.budgetBytes}-byte performance budget.`,
        );
      }
    }
  }
}

rmSync(checkOutputDirectory, { recursive: true, force: true });