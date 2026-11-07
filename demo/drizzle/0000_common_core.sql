CREATE TABLE sv_workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  settings TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE sv_records (
  workspace_id TEXT NOT NULL REFERENCES sv_workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(workspace_id,type,id)
);
--> statement-breakpoint
CREATE INDEX sv_records_type ON sv_records(workspace_id,type);
--> statement-breakpoint
CREATE INDEX sv_team_email ON sv_records(type,lower(json_extract(data,'$.email')));
--> statement-breakpoint
CREATE TABLE sv_requests (
  workspace_id TEXT NOT NULL REFERENCES sv_workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  result TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,actor_id,request_id)
);
--> statement-breakpoint
CREATE TABLE sv_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES sv_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE sv_snapshot_records (
  snapshot_id TEXT NOT NULL REFERENCES sv_snapshots(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,type,id)
);
