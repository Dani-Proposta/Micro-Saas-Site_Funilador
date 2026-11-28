BEGIN;

CREATE SCHEMA IF NOT EXISTS funilador_meta;

REVOKE ALL ON SCHEMA funilador_meta FROM PUBLIC;
REVOKE ALL ON SCHEMA funilador_meta FROM funilador_runtime;

CREATE TABLE IF NOT EXISTS funilador_meta.schema_migrations (
    versao text PRIMARY KEY,
    arquivo text NOT NULL UNIQUE,
    registrada_em timestamptz NOT NULL DEFAULT now(),
    metodo text NOT NULL CHECK (
        metodo IN ('baseline', 'migration')
    )
);

COMMIT;