# Build a CI/CD pipeline with GitHub Actions

CI means continuous integration. Every time someone pushes code, a robot checks it. CD means continuous delivery. If the checks pass, the robot can also ship the code. Think of a tiffin service. Before a box leaves, someone checks it is full and sealed. A pipeline is that checker for your code.

GitHub Actions reads a workflow file from `.github/workflows/`. The file is written in YAML, where spaces matter.

    name: CI
    on:
      push:
        branches: [main]
    jobs:
      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-python@v5
            with:
              python-version: '3.12'
          - run: pip install -r requirements.txt
          - run: pytest

## Triggers, jobs and steps

The `on:` key says when to run. You can run on a push, on a pull request, by hand with `workflow_dispatch`, or on a tag. Add `branches` or `paths` to be picky. A push to a scratch branch can then be ignored.

A job is a group of steps that runs on one fresh machine. The machine starts empty. That is why the first step is nearly always `actions/checkout`. A step either uses a ready-made action (`uses`) or runs a shell command (`run`). If a step fails, the later steps are skipped unless they say `if: always()`.

Jobs run side by side. Use `needs: test` to make a job wait for another one.

## Matrix builds

Your users may run different Python versions. A matrix runs the same job once for each value.

    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']

Use `${{ matrix.python-version }}` inside the job. Put quotes around the versions. YAML reads 3.10 as the number 3.1, and Python 3.1 does not exist on the runner.

## Caching and artifacts

Downloading the same packages on every run wastes minutes. Setting `cache: pip` in setup-python saves the package folder after the first run. The next run restores it.

An artifact is a file that a run keeps, such as a test report. Use `actions/upload-artifact`. Add `if: always()` so the report is saved even when the tests fail. That is when you need it most.

## Secrets

Never write a password or API key in the workflow file. Store it under Settings, then Secrets, and read it with `${{ secrets.NAME }}`. Pass it to a step through `env`. GitHub hides the value in logs, but you should still never print it with `echo`.

## Environments and approvals

An environment is a named place to deploy, such as `staging` or `production`. Each one can have its own secrets and its own reviewers. When a job says `environment: production`, the run pauses until a reviewer approves. This keeps half-tested changes away from customers during a festival sale.

## Deploying and rolling back

A typical pipeline builds a Docker image, pushes it to a registry, and then deploys that exact version. Logging in to the registry comes first. Tag each image with a version such as `1.5.0` so you always know what is running.

Sometimes a release is bad. Roll back first and investigate later. A rollback workflow with `workflow_dispatch` lets an engineer re-deploy the last healthy version in one click. It should also run in the `production` environment so the same approval rules apply.

## Reading a red pipeline

Start at the first red step, not the last one. The first error is usually the cause and the rest are side effects. Typical causes are a mistyped runner label, an action version that does not exist, a missing checkout, a missing secret, or a real failing test. Fix one thing, push, and read again.

In this simulator, press Run workflow to push your files to main. Use the terminal for `pr`, `tag`, `dispatch`, `approve` and `reject`. Nothing runs on real GitHub.
