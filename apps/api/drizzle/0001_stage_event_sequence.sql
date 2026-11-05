DROP INDEX "stage_events_application_idx";--> statement-breakpoint
ALTER TABLE "stage_events" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "stage_events_application_idx" ON "stage_events" USING btree ("application_id","occurred_at","seq");