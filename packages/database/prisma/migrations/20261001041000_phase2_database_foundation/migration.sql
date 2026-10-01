CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "system_metadata" (
    "key" VARCHAR(128) NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_metadata_pkey" PRIMARY KEY ("key")
);
