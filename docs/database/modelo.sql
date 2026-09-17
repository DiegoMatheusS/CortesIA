-- Cortes IA 0.2: modelo PostgreSQL de referência, não migration EF executada.
-- Gerar UUID na aplicação. Aplicar em schema vazio sob revisão.
-- ASP.NET Identity (users/roles/claims/tokens/logins/MFA) deve ser gerado pelo framework.
-- account.identity_user_id recebe FK para a tabela Identity na migration integrada.
BEGIN;
CREATE SCHEMA cortes;
SET LOCAL search_path TO cortes, public;

CREATE TABLE account (
 id uuid PRIMARY KEY, identity_user_id uuid NOT NULL UNIQUE,
 email_normalized text NOT NULL UNIQUE, name text NOT NULL,
 phone_e164 text NOT NULL, email_verified_at timestamptz, phone_verified_at timestamptz,
 cpf_ciphertext bytea, cpf_encryption_key_id text, cpf_last_two char(2) NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','BLOCKED','DELETION_PENDING','DELETED')),
 last_active_at timestamptz NOT NULL, activity_epoch bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
 CHECK ((cpf_ciphertext IS NULL) = (cpf_encryption_key_id IS NULL))
);
CREATE TABLE cpf_identity (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE cpf_fingerprint (
 cpf_identity_id uuid NOT NULL REFERENCES cpf_identity, key_version text NOT NULL,
 digest bytea NOT NULL CHECK(octet_length(digest)=32),
 PRIMARY KEY(key_version,digest), UNIQUE(cpf_identity_id,key_version)
);
CREATE TABLE account_cpf (
 account_id uuid PRIMARY KEY REFERENCES account, cpf_identity_id uuid NOT NULL REFERENCES cpf_identity
);
CREATE TABLE web_session (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account,
 token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, authenticated_at timestamptz NOT NULL,
 mfa_verified_at timestamptz, step_up_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE consent (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, purpose text NOT NULL,
 policy_version text NOT NULL, granted boolean NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_version (
 id uuid PRIMARY KEY, version integer NOT NULL UNIQUE CHECK(version>0),
 status text NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','RETIRED')),
 effective_at timestamptz, created_by uuid REFERENCES account, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE duration_tier (
 id uuid PRIMARY KEY, catalog_id uuid NOT NULL REFERENCES catalog_version,
 min_exclusive_ms bigint NOT NULL CHECK(min_exclusive_ms>=0),
 max_inclusive_ms bigint NOT NULL, credits bigint NOT NULL CHECK(credits>=0),
 CHECK(max_inclusive_ms>min_exclusive_ms), UNIQUE(catalog_id,min_exclusive_ms)
 -- Domínio valida não sobreposição/continuidade antes de publicar catálogo.
);
CREATE TABLE feature_price (
 id uuid PRIMARY KEY, catalog_id uuid NOT NULL REFERENCES catalog_version,
 code text NOT NULL, credits bigint NOT NULL CHECK(credits>=0),
 billing_unit text NOT NULL CHECK(billing_unit IN ('PER_RUN')),
 limits jsonb NOT NULL, UNIQUE(catalog_id,code)
);
CREATE TABLE style_combo (
 id uuid PRIMARY KEY, catalog_id uuid NOT NULL REFERENCES catalog_version,
 code text NOT NULL, credits bigint NOT NULL CHECK(credits>=0), UNIQUE(catalog_id,code)
);
CREATE TABLE combo_feature (
 combo_id uuid NOT NULL REFERENCES style_combo, feature_id uuid NOT NULL REFERENCES feature_price,
 PRIMARY KEY(combo_id,feature_id)
);
CREATE TABLE credit_package (
 id uuid PRIMARY KEY, catalog_id uuid NOT NULL REFERENCES catalog_version, code text NOT NULL,
 purchased_credits bigint NOT NULL CHECK(purchased_credits>0), bonus_credits bigint NOT NULL CHECK(bonus_credits>=0),
 price_minor bigint NOT NULL CHECK(price_minor>0), currency char(3) NOT NULL,
 bonus_validity_days integer CHECK(bonus_validity_days>0), UNIQUE(catalog_id,code)
);
CREATE TABLE platform_preset (
 id uuid PRIMARY KEY, code text NOT NULL, version integer NOT NULL,
 aspect_ratio text NOT NULL, settings jsonb NOT NULL, UNIQUE(code,version)
);
CREATE TABLE ai_policy (
 id uuid PRIMARY KEY, version integer NOT NULL UNIQUE, status text NOT NULL,
 modality text NOT NULL, transcription_model text NOT NULL, selection_model text NOT NULL,
 review_model text NOT NULL, auxiliary_model text, provider text NOT NULL,
 prompt_version text NOT NULL, settings jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account,
 title text NOT NULL, source_type text NOT NULL CHECK(source_type IN ('UPLOAD','LINK')),
 source_metadata jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL CHECK(status IN ('ENVIANDO','RECEBIDO','TRANSCRIBINDO','ANALISANDO','GERANDO_PREVIAS','AGUARDANDO_REVISAO','RENDERIZANDO','PRONTO','ERRO','BLOQUEADO_RESTRICAO','ARQUIVOS_EXPIRADOS','EXCLUIDO')),
 duration_ms bigint CHECK(duration_ms>0), configuration jsonb NOT NULL DEFAULT '{}',
 configuration_version bigint NOT NULL DEFAULT 1, generation bigint NOT NULL DEFAULT 1,
 public_error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz, UNIQUE(id,account_id)
);
CREATE INDEX project_history ON project(account_id,created_at DESC,id);
CREATE TABLE media_asset (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid,
 kind text NOT NULL CHECK(kind IN ('ORIGINAL','AUDIO_INTERMEDIATE','TRANSCRIPT','PREVIEW','WORKING_MASTER','FINAL_EXPORT','COVER','SUBTITLE','BUNDLE','ATTACHMENT','MANIFEST')),
 bucket text NOT NULL, object_key text NOT NULL, object_version text,
 sha256 char(64), size_bytes bigint CHECK(size_bytes>=0), mime_type text,
 status text NOT NULL CHECK(status IN ('QUARANTINED','VALIDATED','AVAILABLE','REJECTED','DELETE_PENDING','DELETED')),
 retention_reason text, deletion_state text NOT NULL DEFAULT 'ACTIVE',
 expires_at timestamptz, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id),
 UNIQUE(bucket,object_key), UNIQUE(id,account_id)
);
CREATE INDEX media_cleanup ON media_asset(status,expires_at);
CREATE TABLE upload_session (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid NOT NULL,
 asset_id uuid NOT NULL, multipart_id text, expected_size_bytes bigint NOT NULL CHECK(expected_size_bytes>0),
 state text NOT NULL CHECK(state IN ('CREATED','UPLOADING','COMPLETED','ABORTED','EXPIRED')),
 expires_at timestamptz NOT NULL, completed_at timestamptz,
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id),
 FOREIGN KEY(asset_id,account_id) REFERENCES media_asset(id,account_id)
);
CREATE TABLE quote (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid NOT NULL,
 catalog_id uuid NOT NULL REFERENCES catalog_version, configuration_version bigint NOT NULL,
 operation text NOT NULL DEFAULT 'INITIAL' CHECK(operation IN ('INITIAL','ALTERNATIVES','HEAVY_REPROCESS')),
 source_fingerprint text NOT NULL, modality text NOT NULL,
 duration_ms bigint NOT NULL CHECK(duration_ms>0), items jsonb NOT NULL,
 total_credits bigint NOT NULL CHECK(total_credits>=0), expires_at timestamptz NOT NULL,
 terms_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id), UNIQUE(id,account_id)
);
CREATE TABLE quote_item (
 id uuid PRIMARY KEY, quote_id uuid NOT NULL REFERENCES quote,
 code text NOT NULL, description text NOT NULL, credits bigint NOT NULL CHECK(credits>=0),
 unit text NOT NULL DEFAULT 'PER_RUN' CHECK(unit='PER_RUN'), feature text,
 catalog_version integer NOT NULL, UNIQUE(quote_id,code)
);
CREATE TABLE wallet (
 id uuid PRIMARY KEY, account_id uuid NOT NULL UNIQUE REFERENCES account,
 available_credits bigint NOT NULL DEFAULT 0 CHECK(available_credits>=0),
 reserved_credits bigint NOT NULL DEFAULT 0 CHECK(reserved_credits>=0), version bigint NOT NULL DEFAULT 1,
 UNIQUE(id,account_id)
);
CREATE TABLE purchase (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, package_id uuid NOT NULL REFERENCES credit_package,
 package_snapshot jsonb NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0), currency char(3) NOT NULL,
 provider text NOT NULL, provider_payment_id text, external_reference text NOT NULL UNIQUE,
 method text NOT NULL CHECK(method IN ('PIX','CARD')),
 status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED','PARTIALLY_REFUNDED','REFUNDED','CHARGEBACK')),
 created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
 UNIQUE(provider,provider_payment_id), UNIQUE(id,account_id)
);
CREATE TABLE credit_lot (
 id uuid PRIMARY KEY, wallet_id uuid NOT NULL REFERENCES wallet, purchase_id uuid REFERENCES purchase,
 kind text NOT NULL CHECK(kind IN ('PURCHASED','PURCHASE_BONUS','TRIAL','PROMOTION','ADMIN_COMPENSATION')),
 grant_credits bigint NOT NULL CHECK(grant_credits>0),
 available_credits bigint NOT NULL CHECK(available_credits>=0), reserved_credits bigint NOT NULL DEFAULT 0 CHECK(reserved_credits>=0),
 expires_at timestamptz, policy_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind NOT IN ('PURCHASED','PURCHASE_BONUS') OR expires_at IS NULL), UNIQUE(id,wallet_id)
);
CREATE TABLE reservation (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, wallet_id uuid NOT NULL,
 quote_id uuid NOT NULL UNIQUE, amount bigint NOT NULL CHECK(amount>=0),
 state text NOT NULL CHECK(state IN ('ACTIVE','CAPTURED','RELEASED')),
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 FOREIGN KEY(wallet_id,account_id) REFERENCES wallet(id,account_id),
 FOREIGN KEY(quote_id,account_id) REFERENCES quote(id,account_id), UNIQUE(id,wallet_id), UNIQUE(id,account_id)
);
CREATE TABLE reservation_line (
 reservation_id uuid NOT NULL, wallet_id uuid NOT NULL, lot_id uuid NOT NULL, credits bigint NOT NULL CHECK(credits>0),
 FOREIGN KEY(reservation_id,wallet_id) REFERENCES reservation(id,wallet_id),
 FOREIGN KEY(lot_id,wallet_id) REFERENCES credit_lot(id,wallet_id), PRIMARY KEY(reservation_id,lot_id)
);
CREATE TABLE ledger_transaction (
 id uuid PRIMARY KEY, wallet_id uuid NOT NULL REFERENCES wallet,
 kind text NOT NULL CHECK(kind IN ('PURCHASE','BONUS','TRIAL','RESERVE','CAPTURE','RELEASE','REFUND','EXPIRE','ADJUST','PAYMENT_REVERSAL')),
 operation_key text NOT NULL UNIQUE, reservation_id uuid, purchase_id uuid REFERENCES purchase,
 reverses_transaction_id uuid REFERENCES ledger_transaction, actor_id uuid REFERENCES account,
 reason text NOT NULL, correlation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(reservation_id,wallet_id) REFERENCES reservation(id,wallet_id), UNIQUE(id,wallet_id)
);
CREATE TABLE ledger_entry (
 id uuid PRIMARY KEY, transaction_id uuid NOT NULL, wallet_id uuid NOT NULL, lot_id uuid NOT NULL,
 available_delta bigint NOT NULL, reserved_delta bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(available_delta<>0 OR reserved_delta<>0),
 FOREIGN KEY(transaction_id,wallet_id) REFERENCES ledger_transaction(id,wallet_id),
 FOREIGN KEY(lot_id,wallet_id) REFERENCES credit_lot(id,wallet_id), UNIQUE(transaction_id,lot_id)
);
CREATE INDEX ledger_history ON ledger_entry(wallet_id,created_at,id);
CREATE TABLE trial_claim (
 cpf_identity_id uuid PRIMARY KEY REFERENCES cpf_identity, account_id uuid REFERENCES account,
 grant_transaction_id uuid NOT NULL UNIQUE REFERENCES ledger_transaction,
 claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_event (
 id uuid PRIMARY KEY, provider text NOT NULL, provider_event_id text NOT NULL,
 purchase_id uuid REFERENCES purchase, payload_hash char(64) NOT NULL, normalized_data jsonb NOT NULL,
 status text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), reconciled_at timestamptz,
 UNIQUE(provider,provider_event_id)
);
CREATE TABLE payment_refund (
 id uuid PRIMARY KEY, purchase_id uuid NOT NULL REFERENCES purchase,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), operation_key text NOT NULL UNIQUE,
 provider_refund_id text, status text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_debt (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, purchase_id uuid NOT NULL REFERENCES purchase,
 credits bigint NOT NULL CHECK(credits>0), reason text NOT NULL, state text NOT NULL,
 operation_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE processing_run (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid NOT NULL,
 quote_id uuid, reservation_id uuid UNIQUE, parent_run_id uuid REFERENCES processing_run,
 operation text NOT NULL CHECK(operation IN ('INGEST','INITIAL','ALTERNATIVES','EDIT','EXPORT')),
 state text NOT NULL CHECK(state IN ('QUEUED','RUNNING','AWAITING_REVIEW','COMPLETED','FAILED','CANCELLED')),
 outcome text CHECK(outcome IN ('SUCCESS','NO_SUITABLE_CLIPS','SYSTEM_FAILURE','SOURCE_RESTRICTED','USER_CANCELLED')),
 modality text NOT NULL, configuration_snapshot jsonb NOT NULL,
 ai_policy_id uuid REFERENCES ai_policy, generation bigint NOT NULL,
 rights_accepted_at timestamptz, terms_version text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id),
 FOREIGN KEY(quote_id,account_id) REFERENCES quote(id,account_id),
 FOREIGN KEY(reservation_id,account_id) REFERENCES reservation(id,account_id), UNIQUE(id,account_id)
 -- Domínio exige reserva própria ou entitlement herdado válido; edições incluídas não criam débito.
);
CREATE TABLE job (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES processing_run, stage text NOT NULL,
 logical_key text NOT NULL UNIQUE, input_manifest_id uuid REFERENCES media_asset,
 status text NOT NULL CHECK(status IN ('PENDING','QUEUED','RUNNING','RETRY_WAIT','SUCCEEDED','FAILED_FINAL','CANCELLED')),
 generation bigint NOT NULL, fencing_token bigint NOT NULL DEFAULT 0,
 lease_expires_at timestamptz, next_attempt_at timestamptz, deadline_at timestamptz NOT NULL,
 output_manifest_id uuid REFERENCES media_asset, last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_scheduler ON job(status,next_attempt_at);
CREATE TABLE job_dependency (
 job_id uuid NOT NULL REFERENCES job, depends_on_job_id uuid NOT NULL REFERENCES job,
 PRIMARY KEY(job_id,depends_on_job_id), CHECK(job_id<>depends_on_job_id)
);
CREATE TABLE job_attempt (
 id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES job, number integer NOT NULL CHECK(number>0),
 fencing_token bigint NOT NULL, worker_identity text NOT NULL, status text NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz, last_heartbeat_at timestamptz,
 error_code text, resource_usage jsonb NOT NULL DEFAULT '{}', UNIQUE(job_id,number), UNIQUE(job_id,fencing_token)
);
CREATE TABLE transcript (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES processing_run,
 asset_id uuid NOT NULL REFERENCES media_asset, language text NOT NULL,
 segment_count integer NOT NULL CHECK(segment_count>=0), has_word_timestamps boolean NOT NULL,
 provider text NOT NULL, model text NOT NULL, version integer NOT NULL, UNIQUE(run_id,version)
);
CREATE TABLE clip (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid NOT NULL, run_id uuid NOT NULL,
 selection text NOT NULL CHECK(selection IN ('SUGGESTED','SELECTED','REJECTED')),
 rationale text NOT NULL, score numeric(6,3), rejection_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id),
 FOREIGN KEY(run_id,account_id) REFERENCES processing_run(id,account_id), UNIQUE(id,account_id)
);
CREATE TABLE clip_revision (
 id uuid PRIMARY KEY, clip_id uuid NOT NULL REFERENCES clip, number integer NOT NULL,
 start_ms bigint NOT NULL CHECK(start_ms>=0), end_ms bigint NOT NULL,
 title text NOT NULL, render_plan jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES account, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_ms>start_ms), UNIQUE(clip_id,number)
);
CREATE TABLE revision_preview (
 revision_id uuid PRIMARY KEY REFERENCES clip_revision, asset_id uuid NOT NULL REFERENCES media_asset
);
CREATE TABLE subtitle_track (
 id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES clip_revision,
 language text NOT NULL, asset_id uuid NOT NULL REFERENCES media_asset,
 style jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(revision_id,language)
);
CREATE TABLE cover (
 id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES clip_revision,
 asset_id uuid NOT NULL REFERENCES media_asset, settings jsonb NOT NULL, version integer NOT NULL,
 UNIQUE(revision_id,version)
);
CREATE TABLE export (
 id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES clip_revision,
 preset_id uuid NOT NULL REFERENCES platform_preset, job_id uuid NOT NULL REFERENCES job,
 status text NOT NULL, asset_id uuid REFERENCES media_asset, settings_hash char(64) NOT NULL,
 UNIQUE(revision_id,preset_id,settings_hash)
);
CREATE TABLE bundle (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, job_id uuid NOT NULL REFERENCES job,
 status text NOT NULL, asset_id uuid REFERENCES media_asset, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bundle_export (
 bundle_id uuid NOT NULL REFERENCES bundle, export_id uuid NOT NULL REFERENCES export,
 PRIMARY KEY(bundle_id,export_id)
);
CREATE TABLE idempotency_request (
 account_id uuid NOT NULL REFERENCES account, operation text NOT NULL, key_hash char(64) NOT NULL,
 request_hash char(64) NOT NULL, status_code integer, response_body jsonb,
 resource_id uuid, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,operation,key_hash)
);
CREATE TABLE outbox (
 id uuid PRIMARY KEY, message_type text NOT NULL, schema_version integer NOT NULL,
 aggregate_id uuid NOT NULL, payload jsonb NOT NULL, available_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON outbox(available_at) WHERE published_at IS NULL;
CREATE TABLE inbox (
 consumer text NOT NULL, event_id uuid NOT NULL, payload_hash char(64) NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(consumer,event_id)
);
CREATE TABLE ticket (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid, clip_id uuid,
 category text NOT NULL CHECK(category IN ('PAYMENT','CREDITS','ACCOUNT','VIDEO','CLIP','SUBTITLE','TECHNICAL_ERROR','SUGGESTION')),
 subject text NOT NULL, status text NOT NULL CHECK(status IN ('OPEN','IN_REVIEW','ANSWERED','RESOLVED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id),
 FOREIGN KEY(clip_id,account_id) REFERENCES clip(id,account_id)
);
CREATE TABLE ticket_message (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES ticket, actor_id uuid NOT NULL REFERENCES account,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ticket_attachment (
 message_id uuid NOT NULL REFERENCES ticket_message, asset_id uuid NOT NULL REFERENCES media_asset,
 PRIMARY KEY(message_id,asset_id)
);
CREATE TABLE access_grant (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES account, project_id uuid NOT NULL REFERENCES project,
 ticket_id uuid REFERENCES ticket, reason text NOT NULL, scope text NOT NULL,
 granted_by uuid NOT NULL REFERENCES account, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE audit_event (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES account, action text NOT NULL,
 target_type text NOT NULL, target_id uuid, reason text NOT NULL, correlation_id uuid NOT NULL,
 redacted_metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, type text NOT NULL,
 dedupe_key text NOT NULL UNIQUE, template_version text NOT NULL,
 status text NOT NULL, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz,
 provider_message_id text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE retention_task (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account,
 activity_epoch bigint NOT NULL, milestone integer NOT NULL CHECK(milestone IN (105,115,119,120)),
 due_at timestamptz NOT NULL, status text NOT NULL, cursor text, error_code text,
 UNIQUE(account_id,activity_epoch,milestone)
);
CREATE TABLE deletion_request (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES account, project_id uuid REFERENCES project,
 scope text NOT NULL CHECK(scope IN ('PROJECT','ACCOUNT','INACTIVITY')),
 state text NOT NULL, policy_version text NOT NULL, manifest_asset_id uuid REFERENCES media_asset,
 requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE provider_usage (
 id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES job_attempt, provider text NOT NULL,
 model text NOT NULL, input_tokens bigint, output_tokens bigint, audio_ms bigint,
 cost numeric(20,8) CHECK(cost>=0), currency char(3), price_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION deny_append_only_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'append-only table: %', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER ledger_transaction_immutable BEFORE UPDATE OR DELETE ON ledger_transaction
 FOR EACH ROW EXECUTE FUNCTION deny_append_only_mutation();
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON ledger_entry
 FOR EACH ROW EXECUTE FUNCTION deny_append_only_mutation();
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON audit_event
 FOR EACH ROW EXECUTE FUNCTION deny_append_only_mutation();
CREATE TRIGGER clip_revision_immutable BEFORE UPDATE OR DELETE ON clip_revision
 FOR EACH ROW EXECUTE FUNCTION deny_append_only_mutation();
-- Role runtime: sem DDL/TRUNCATE/owner; sem UPDATE/DELETE em ledger/audit.
-- Limpeza de texto de revisões e retenção de audit usam role de manutenção separada
-- e procedimento aprovado; trigger não protege contra superuser.
-- Publicação de catálogo/quote imutável e totais de lotes/ledger exigem domínio/locks.
COMMIT;
