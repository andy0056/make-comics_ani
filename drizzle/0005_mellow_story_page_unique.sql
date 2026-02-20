CREATE UNIQUE INDEX IF NOT EXISTS "pages_story_id_page_number_unique" ON "pages" USING btree ("story_id","page_number");
