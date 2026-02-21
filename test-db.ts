import { db } from "./lib/db";
import { stories, pages } from "./lib/schema";
import { eq } from "drizzle-orm";

async function main() {
  try {
    const res = await db.select({
      id: stories.id,
      title: stories.title,
      slug: stories.slug,
      style: stories.style,
      createdAt: stories.createdAt,
      pageCount: pages.pageNumber,
      coverImage: pages.generatedImageUrl,
      pageCreatedAt: pages.createdAt,
      pageUpdatedAt: pages.updatedAt,
    }).from(stories).leftJoin(pages, eq(stories.id, pages.storyId)).limit(1);
    console.log("Success:", res);
  } catch (e) {
    console.error("Query failed:", e);
  }
}
main();
