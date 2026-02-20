import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  apiError,
  apiInternalError,
  apiJson,
  getRequestId,
} from "@/lib/api-route";
import {
  listStoryCollaborators,
  removeStoryCollaborator,
  upsertStoryCollaborator,
} from "@/lib/db-actions";
import { getOwnedStoryWithPagesBySlug } from "@/lib/story-access";

const collaboratorRoleSchema = z.enum(["viewer", "editor"]);

const upsertCollaboratorRequestSchema = z.object({
  collaboratorUserId: z.string().trim().min(1, "collaboratorUserId is required"),
  role: collaboratorRoleSchema,
});

const removeCollaboratorRequestSchema = z.object({
  collaboratorUserId: z.string().trim().min(1, "collaboratorUserId is required"),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
      requiredPermission: "view",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    const collaborators = await listStoryCollaborators(storyAccess.story.id);
    return apiJson(
      {
        collaborators,
        access: storyAccess.access,
      },
      { requestId },
    );
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/collaborators:GET",
      requestId,
      error,
      message: "Failed to fetch collaborators",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
      requiredPermission: "manage",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return apiError({
        status: 400,
        error: "Invalid JSON body",
        requestId,
      });
    }

    const parsedBody = upsertCollaboratorRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const { collaboratorUserId, role } = parsedBody.data;
    if (collaboratorUserId === userId) {
      return apiError({
        status: 400,
        error: "You already own this story",
        requestId,
      });
    }

    if (collaboratorUserId === storyAccess.story.userId) {
      return apiError({
        status: 400,
        error: "Story owner cannot be added as collaborator",
        requestId,
      });
    }

    await upsertStoryCollaborator({
      storyId: storyAccess.story.id,
      userId: collaboratorUserId,
      role,
      invitedByUserId: userId,
    });

    const collaborators = await listStoryCollaborators(storyAccess.story.id);
    return apiJson({ collaborators }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/collaborators:PUT",
      requestId,
      error,
      message: "Failed to update collaborator",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ storySlug: string }> },
) {
  const requestId = getRequestId(request);

  try {
    const { userId } = await auth();
    if (!userId) {
      return apiError({
        status: 401,
        error: "Authentication required",
        requestId,
      });
    }

    const { storySlug } = await params;
    if (!storySlug) {
      return apiError({
        status: 400,
        error: "Story slug is required",
        requestId,
      });
    }

    const storyAccess = await getOwnedStoryWithPagesBySlug({
      storySlug,
      userId,
      unauthorizedMode: "unauthorized",
      requiredPermission: "manage",
    });
    if (!storyAccess.ok) {
      return apiError({
        status: storyAccess.status,
        error: storyAccess.error,
        requestId,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return apiError({
        status: 400,
        error: "Invalid JSON body",
        requestId,
      });
    }

    const parsedBody = removeCollaboratorRequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError({
        status: 400,
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
        requestId,
      });
    }

    const { collaboratorUserId } = parsedBody.data;
    const removed = await removeStoryCollaborator({
      storyId: storyAccess.story.id,
      userId: collaboratorUserId,
    });
    if (!removed) {
      return apiError({
        status: 404,
        error: "Collaborator not found",
        requestId,
      });
    }

    const collaborators = await listStoryCollaborators(storyAccess.story.id);
    return apiJson({ collaborators }, { requestId });
  } catch (error) {
    return apiInternalError({
      routeName: "api/stories/[storySlug]/collaborators:DELETE",
      requestId,
      error,
      message: "Failed to remove collaborator",
    });
  }
}
