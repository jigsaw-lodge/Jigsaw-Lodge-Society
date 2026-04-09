# Secrets And Startup (Beginner-Friendly)

This is the one place to look when Hasan says a service will not start because config is missing.

## The easiest safe setup

You now have two supported paths:

1. `.env` file in the repo root
2. untracked secret files in `secrets/`

The stack scripts auto-load both. If you start with `.env`, Hasan now mirrors the needed values into `secrets/` on the first stack command so the containers can keep using mounted files.

## Recommended local layout

Create the local secret folder once:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
mkdir -p secrets
printf '%s\n' 'replace-with-a-strong-secret' > secrets/admin_token
printf '%s\n' 'password' > secrets/db_pass
```

Optional signed-request secret:

```sh
printf '%s\n' 'replace-with-a-signing-secret' > secrets/jls_signing_secret
```

Files in `secrets/` are ignored by git and are mounted into containers at `/run/secrets`.

## Secret file names

- `secrets/admin_token`
- `secrets/db_pass`
- `secrets/jls_shared_token`
- `secrets/jls_signing_secret`

## What each service needs

- API: `ADMIN_TOKEN`
- API when signed SL traffic is enforced: `JLS_SIGNING_SECRET`
- Worker: usually just DB/Redis config; `DB_PASS` can come from `secrets/db_pass`
- Relay: no secret required by default, but it still validates startup numbers like `WS_PORT`

## Custom secret mounts

If your host already mounts secrets somewhere else, point to them directly:

```sh
export ADMIN_TOKEN_FILE=/run/secrets/admin_token
export DB_PASS_FILE=/run/secrets/db_pass
export JLS_SIGNING_SECRET_FILE=/run/secrets/jls_signing_secret
```

You can also set:

```sh
export JLS_SECRET_DIR=/run/secrets
```

When `JLS_SECRET_DIR` is set, Hasan only looks there instead of guessing.

## Friendly startup failures you will now see

Examples:

- `API cannot start without ADMIN_TOKEN`
- `API has JLS_REQUIRE_SIGNED_REQUESTS=1 but no JLS_SIGNING_SECRET`
- `ADMIN_TOKEN was expected from ... but that file does not exist`
- `WS_PORT must be a number`

These messages now happen before Redis, Postgres, or the worker tries to boot, so you get the real problem first.

## Good default workflow

1. Create `secrets/admin_token`
2. Create `secrets/db_pass`
3. Run `bash scripts/stack-up.sh`
4. Run `bash scripts/stack-health.sh`
5. Run `bash scripts/smoke.sh`

## If you prefer `.env`

That still works.

```sh
cp .env.example .env
```

Fill in the values, then run the same stack commands.

## Production note

For the live host, use the same file-backed pattern, but let your host or deployment system populate the files instead of typing secrets into the repo.
