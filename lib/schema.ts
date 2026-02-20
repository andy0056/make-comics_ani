import { pgTable, text, integer, timestamp, uuid, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Core Tables ─────────────────────────────────────────

export const stories = pgTable('stories', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  style: text('style').default('noir').notNull(),
  userId: text('user_id').notNull(),
  usesOwnApiKey: boolean('uses_own_api_key').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  pageNumber: integer('page_number').notNull(),
  prompt: text('prompt').notNull(),
  characterImageUrls: jsonb('character_image_urls').$type<string[]>().default([]).notNull(),
  generatedImageUrl: text('generated_image_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  storyPageNumberUniqueIdx: uniqueIndex('pages_story_id_page_number_unique').on(table.storyId, table.pageNumber),
}));

// ─── Character & World Memory ────────────────────────────

export const storyCharacters = pgTable('story_characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  role: text('role'),
  appearance: text('appearance'),
  personality: text('personality'),
  speechStyle: text('speech_style'),
  referenceImageUrl: text('reference_image_url'),
  isLocked: boolean('is_locked').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const characterDnaProfiles = pgTable('character_dna_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  characterId: uuid('character_id').references(() => storyCharacters.id, { onDelete: 'cascade' }).notNull(),
  visualTraits: jsonb('visual_traits').$type<Record<string, unknown>>().default({}).notNull(),
  narrativeTraits: jsonb('narrative_traits').$type<Record<string, unknown>>().default({}).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storyWorlds = pgTable('story_worlds', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull().unique(),
  setting: text('setting'),
  timePeriod: text('time_period'),
  rules: jsonb('rules').$type<Record<string, unknown>>().default({}).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Retention & Preferences ─────────────────────────────

export const missionStates = pgTable('mission_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }),
  missionType: text('mission_type').notNull(),
  status: text('status').notNull().default('open'),
  lastPromptedAt: timestamp('last_prompted_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userStoryTypeUnique: uniqueIndex('mission_states_user_story_type_unique').on(table.userId, table.storyId, table.missionType),
}));

export const creatorTwinProfiles = pgTable('creator_twin_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  preferredArcPageCount: integer('preferred_arc_page_count').notNull().default(3),
  preferredDialogueMode: text('preferred_dialogue_mode').notNull().default('balanced'),
  preferredAudienceMode: text('preferred_audience_mode').notNull().default('general'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Collaboration ───────────────────────────────────────

export const storyCollaborators = pgTable('story_collaborators', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('viewer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  storyUserUnique: uniqueIndex('story_collaborators_story_user_unique').on(table.storyId, table.userId),
}));

export const storyEditorPresence = pgTable('story_editor_presence', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').notNull(),
  pageNumber: integer('page_number').notNull().default(1),
  activePanel: text('active_panel'),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  storyUserUnique: uniqueIndex('story_editor_presence_story_user_unique').on(table.storyId, table.userId),
}));

export const storyEditLocks = pgTable('story_edit_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  resource: text('resource').notNull(),
  userId: text('user_id').notNull(),
  reason: text('reason'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  storyResourceUnique: uniqueIndex('story_edit_locks_story_resource_unique').on(table.storyId, table.resource),
}));

// ─── Remix & Universe ────────────────────────────────────

export const storyRemixes = pgTable('story_remixes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceStoryId: uuid('source_story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  remixStoryId: uuid('remix_story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  remixUserId: text('remix_user_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Co-Creation ─────────────────────────────────────────

export const storyCoCreationRooms = pgTable('story_co_creation_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storyCoCreationRoomSessions = pgTable('story_co_creation_room_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').references(() => storyCoCreationRooms.id, { onDelete: 'cascade' }).notNull(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('active'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
});

export const storyCoCreationAuditEvents = pgTable('story_co_creation_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  roomId: uuid('room_id').references(() => storyCoCreationRooms.id, { onDelete: 'set null' }),
  actorUserId: text('actor_user_id').notNull(),
  eventType: text('event_type').notNull(),
  resource: text('resource'),
  targetUserId: text('target_user_id'),
  details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Creator Economy ─────────────────────────────────────

export const storyCreatorEconomyRuns = pgTable('story_creator_economy_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }).notNull(),
  runType: text('run_type').notNull(),
  source: text('source').notNull().default('manual'),
  status: text('status').notNull().default('open'),
  decision: text('decision'),
  notes: text('notes'),
  baselineMetrics: jsonb('baseline_metrics').$type<Record<string, unknown>>().default({}).notNull(),
  outcomeMetrics: jsonb('outcome_metrics').$type<Record<string, unknown>>().default({}).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────

export const storiesRelations = relations(stories, ({ many }) => ({
  pages: many(pages),
  characters: many(storyCharacters),
  collaborators: many(storyCollaborators),
  remixesAsSource: many(storyRemixes),
  coCreationRooms: many(storyCoCreationRooms),
  economyRuns: many(storyCreatorEconomyRuns),
}));

export const pagesRelations = relations(pages, ({ one }) => ({
  story: one(stories, {
    fields: [pages.storyId],
    references: [stories.id],
  }),
}));

export const storyCharactersRelations = relations(storyCharacters, ({ one, many }) => ({
  story: one(stories, {
    fields: [storyCharacters.storyId],
    references: [stories.id],
  }),
  dnaProfiles: many(characterDnaProfiles),
}));

export const characterDnaProfilesRelations = relations(characterDnaProfiles, ({ one }) => ({
  story: one(stories, {
    fields: [characterDnaProfiles.storyId],
    references: [stories.id],
  }),
  character: one(storyCharacters, {
    fields: [characterDnaProfiles.characterId],
    references: [storyCharacters.id],
  }),
}));

// ─── Inferred Types ──────────────────────────────────────

export type Story = typeof stories.$inferSelect;
export type NewStory = typeof stories.$inferInsert;

export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;

export type StoryCharacter = typeof storyCharacters.$inferSelect;
export type NewStoryCharacter = typeof storyCharacters.$inferInsert;

export type CharacterDnaProfile = typeof characterDnaProfiles.$inferSelect;
export type NewCharacterDnaProfile = typeof characterDnaProfiles.$inferInsert;

export type StoryWorld = typeof storyWorlds.$inferSelect;
export type NewStoryWorld = typeof storyWorlds.$inferInsert;

export type MissionState = typeof missionStates.$inferSelect;
export type CreatorTwinProfile = typeof creatorTwinProfiles.$inferSelect;

export type StoryCollaborator = typeof storyCollaborators.$inferSelect;
export type StoryEditorPresenceRow = typeof storyEditorPresence.$inferSelect;
export type StoryEditLock = typeof storyEditLocks.$inferSelect;

export type StoryRemix = typeof storyRemixes.$inferSelect;
export type StoryCoCreationRoom = typeof storyCoCreationRooms.$inferSelect;
export type StoryCoCreationRoomSession = typeof storyCoCreationRoomSessions.$inferSelect;
export type StoryCoCreationAuditEvent = typeof storyCoCreationAuditEvents.$inferSelect;
export type StoryCreatorEconomyRun = typeof storyCreatorEconomyRuns.$inferSelect;
